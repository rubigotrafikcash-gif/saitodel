#!/usr/bin/env node
// Source integrity and external-reference cache only. Never executes upstream code.
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, mkdir, mkdtemp, rename } from 'node:fs/promises';
import https from 'node:https';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_BYTES = 32 * 1024 * 1024;
const NOFOLLOW = constants.O_NOFOLLOW || 0;

function fail(message) { throw new Error(message); }

function parseArgs(args) {
  let lockPath = path.join(PLUGIN_ROOT, 'sources.lock.json');
  const positional = [];
  let seenLock = false;
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--lock') {
      if (seenLock || !args[i + 1] || args[i + 1].startsWith('--')) fail('--lock needs one path');
      seenLock = true;
      lockPath = path.resolve(args[++i]);
    } else if (args[i].startsWith('--')) {
      fail(`Unknown option: ${args[i]}`);
    } else positional.push(args[i]);
  }
  if (positional.length !== 2 || !['verify', 'prepare-remote', 'verify-remote'].includes(positional[0])) {
    fail('Usage: source-manager.mjs verify <root> | prepare-remote <outputDir> | verify-remote <directory> [--lock <path>]');
  }
  return { command: positional[0], root: path.resolve(positional[1]), lockPath };
}

function relativePath(value, field) {
  if (typeof value !== 'string' || !value || value.includes('\\') || path.posix.isAbsolute(value)
      || /[\x00-\x1f<>:"|?*]/.test(value)) fail(`Unsafe ${field}`);
  const parts = value.split('/');
  if (parts.some(part => !part || part === '.' || part === '..' || /[. ]$/.test(part)
      || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) fail(`Unsafe ${field}`);
  return value;
}

function isWithin(base, candidate) {
  const relative = path.relative(base, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function childPath(base, relative) {
  const target = path.resolve(base, ...relativePath(relative, 'localPath').split('/'));
  if (target === base || !isWithin(base, target)) fail('Source path escapes its root');
  return target;
}

// Inspect all existing components, including ancestors of the requested root.
// This also rejects Windows junctions represented as symbolic links by Node.
async function safePath(target, allowMissing = false) {
  const absolute = path.resolve(target);
  const volume = path.parse(absolute).root;
  const pieces = absolute.slice(volume.length).split(path.sep).filter(Boolean);
  let current = volume;
  for (let i = -1; i < pieces.length; i += 1) {
    if (i >= 0) current = path.join(current, pieces[i]);
    let stat;
    try { stat = await lstat(current); }
    catch (error) {
      if (allowMissing && error.code === 'ENOENT') return;
      throw error;
    }
    if (stat.isSymbolicLink()) fail(`Symbolic link or junction rejected: ${current}`);
    if (i < pieces.length - 1 && !stat.isDirectory()) fail(`Parent is not a directory: ${current}`);
  }
}

async function readRegular(filename, limit = MAX_FILE_BYTES) {
  await safePath(filename);
  const handle = await open(filename, constants.O_RDONLY | NOFOLLOW);
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > limit) fail(`Not a regular file within size limit: ${filename}`);
    const bytes = await handle.readFile();
    if (bytes.length > limit) fail(`File exceeded size limit while reading: ${filename}`);
    return bytes;
  } finally { await handle.close(); }
}

function gitBlobSha(bytes) {
  return createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
}

function repositoryName(value) {
  if (typeof value !== 'string') fail('Source repository must be a GitHub repository');
  const name = value.replace(/^https:\/\/github\.com\//, '').replace(/\.git$/, '');
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(name)
      || name.split('/').some(part => part === '.' || part === '..')) fail('Only owner/repository GitHub sources are accepted');
  return name;
}

async function loadLock(lockPath) {
  let lock;
  try { lock = JSON.parse((await readRegular(lockPath, 2 * 1024 * 1024)).toString('utf8')); }
  catch (error) { fail(`Cannot read source lock: ${error.message}`); }
  if (lock.version !== '1.0.0' || !Array.isArray(lock.sources) || !lock.sources.length) fail('Unsupported or empty source lock');
  const ids = new Set();
  const localPaths = { bundled: new Set(), external: new Set() };
  for (const source of lock.sources) {
    if (!source || typeof source.id !== 'string' || !/^[A-Za-z0-9_-]+$/.test(source.id) || ids.has(source.id)) fail('Missing or duplicate source id');
    ids.add(source.id);
    source.repository = repositoryName(source.repository);
    if (typeof source.ref !== 'string' || !/^[a-f0-9]{40}$/i.test(source.ref)) fail(`Source ${source.id} must use a full commit SHA`);
    if (!['bundled', 'external'].includes(source.distribution)) fail(`Unknown distribution for ${source.id}`);
    if (!Array.isArray(source.files) || !source.files.length) fail(`No files in source ${source.id}`);
    const sourcePaths = new Set();
    for (const file of source.files) {
      if (!file || typeof file !== 'object') fail(`Invalid file in ${source.id}`);
      relativePath(file.path, 'path');
      relativePath(file.localPath, 'localPath');
      if (source.distribution === 'external' && file.localPath !== file.path) fail('External localPath must equal upstream path');
      if (typeof file.gitBlobSha !== 'string' || !/^[a-f0-9]{40}$/i.test(file.gitBlobSha)) fail(`Invalid Git blob SHA for ${source.id}/${file.path}`);
      const portablePath = file.localPath.toLowerCase();
      if (localPaths[source.distribution].has(portablePath) || sourcePaths.has(file.path.toLowerCase())) fail(`Duplicate source path: ${file.path}`);
      localPaths[source.distribution].add(portablePath);
      sourcePaths.add(file.path.toLowerCase());
      file.gitBlobSha = file.gitBlobSha.toLowerCase();
    }
  }
  // Reject a manifest where a file would need to be another file's directory.
  for (const paths of Object.values(localPaths)) {
    for (const item of paths) {
      const parts = item.split('/');
      for (let i = 1; i < parts.length; i += 1) {
        if (paths.has(parts.slice(0, i).join('/'))) fail(`File/directory conflict: ${item}`);
      }
    }
  }
  return lock;
}

function selectFiles(lock, distribution) {
  const selected = lock.sources.filter(source => source.distribution === distribution)
    .flatMap(source => source.files.map(file => ({ source, file })));
  if (!selected.length) fail(`No ${distribution} files in lock`);
  return selected;
}

async function verifyFiles(root, selected) {
  await safePath(root);
  if (!(await lstat(root)).isDirectory()) fail('Verification root must be a directory');
  const results = [];
  for (const { source, file } of selected) {
    const result = { source: source.id, path: file.localPath, expectedGitBlobSha: file.gitBlobSha };
    try {
      const bytes = await readRegular(childPath(root, file.localPath));
      result.actualGitBlobSha = gitBlobSha(bytes);
      result.bytes = bytes.length;
      result.status = result.actualGitBlobSha === file.gitBlobSha ? 'PASS' : 'FAIL';
      if (result.status === 'FAIL') result.error = 'Git blob SHA mismatch';
    } catch (error) { result.status = 'FAIL'; result.error = error.message; }
    results.push(result);
  }
  return results;
}

function download(url) {
  return new Promise((resolve, reject) => {
    // Deliberately reject redirects. All requests target one pinned raw GitHub URL.
    const request = https.get(url, { headers: { 'User-Agent': 'saitodel-source-manager/1.0.0', Accept: 'application/octet-stream' } }, response => {
      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`Source fetch returned HTTP ${response.statusCode}`));
        return;
      }
      const chunks = [];
      let total = 0;
      response.on('data', chunk => {
        total += chunk.length;
        if (total > MAX_FILE_BYTES) { request.destroy(new Error('Source download exceeds size limit')); return; }
        chunks.push(chunk);
      });
      response.on('end', () => resolve(Buffer.concat(chunks)));
      response.on('error', reject);
      response.on('aborted', () => reject(new Error('Source download aborted')));
    });
    request.setTimeout(30000, () => request.destroy(new Error('Source download timeout')));
    request.on('error', reject);
  });
}

function requireExternalRoot(root, lockPath) {
  if (isWithin(PLUGIN_ROOT, root) || isWithin(path.dirname(lockPath), root)) {
    fail('External sources must be cached outside the plugin and source-lock directories; they are not licensed bundled files');
  }
}

async function prepareRemote(root, lockPath, selected) {
  requireExternalRoot(root, lockPath);
  await safePath(root, true);
  let exists = false;
  try { await lstat(root); exists = true; }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (exists) {
    return { cached: true, files: await verifyFiles(root, selected) };
  }
  const stagedFiles = [];
  let total = 0;
  // Nothing is written until every downloaded file has passed its pinned hash.
  for (const { source, file } of selected) {
    const url = `https://raw.githubusercontent.com/${source.repository}/${source.ref}/${file.path.split('/').map(encodeURIComponent).join('/')}`;
    const bytes = await download(url);
    total += bytes.length;
    if (total > MAX_TOTAL_BYTES) fail('External sources exceed total size limit');
    const actual = gitBlobSha(bytes);
    if (actual !== file.gitBlobSha) fail(`Downloaded Git blob SHA mismatch: ${source.id}/${file.path}`);
    stagedFiles.push({ file, bytes });
  }
  const parent = path.dirname(root);
  await safePath(parent, true);
  await mkdir(parent, { recursive: true });
  await safePath(parent);
  const staging = await mkdtemp(path.join(parent, '.saitodel-source-stage-'));
  try {
    for (const { file, bytes } of stagedFiles) {
      const target = childPath(staging, file.localPath);
      await mkdir(path.dirname(target), { recursive: true });
      await safePath(path.dirname(target));
      const handle = await open(target, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | NOFOLLOW, 0o600);
      try { await handle.writeFile(bytes); await handle.sync(); }
      finally { await handle.close(); }
    }
    const verified = await verifyFiles(staging, selected);
    if (verified.some(file => file.status !== 'PASS')) fail('Staging verification failed');
    await safePath(root, true);
    try { await lstat(root); fail('Output appeared during download; refusing to overwrite'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    await rename(staging, root);
    return { cached: false, files: await verifyFiles(root, selected) };
  } catch (error) {
    // Preserve only this newly created staging directory for inspection. No recursive deletion.
    fail(`${error.message}; uncommitted staging retained at ${staging}`);
  }
}

let options;
try {
  options = parseArgs(process.argv.slice(2));
  const lock = await loadLock(options.lockPath);
  const distribution = options.command === 'verify' ? 'bundled' : 'external';
  const selected = selectFiles(lock, distribution);
  let detail;
  if (options.command === 'prepare-remote') detail = await prepareRemote(options.root, options.lockPath, selected);
  else {
    if (distribution === 'external') requireExternalRoot(options.root, options.lockPath);
    detail = { files: await verifyFiles(options.root, selected) };
  }
  const passed = detail.files.filter(file => file.status === 'PASS').length;
  const failed = detail.files.length - passed;
  console.log(JSON.stringify({ command: options.command, status: failed ? 'FAIL' : 'PASS', root: options.root,
    lock: options.lockPath, checked: detail.files.length, passed, failed, ...detail }, null, 2));
  if (failed) process.exitCode = 1;
} catch (error) {
  console.log(JSON.stringify({ command: options?.command ?? null, status: 'FAIL', error: error.message }, null, 2));
  process.exitCode = 1;
}

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, symlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manager = path.join(repoRoot, 'scripts', 'source-manager.mjs');
const actualLock = path.join(repoRoot, 'sources.lock.json');
const actualExternal = path.join(path.dirname(repoRoot), 'saitodel-external');
const startedAt = new Date().toISOString();
const evidence = [];
// Test data is original synthetic content. Real upstream cache is read-only.
const fixtureRoot = await mkdtemp(path.join(path.dirname(repoRoot), '.source-manager-tests-'));

function blobSha(bytes) {
  const buffer = Buffer.from(bytes);
  return createHash('sha1').update(`blob ${buffer.length}\0`).update(buffer).digest('hex');
}

async function write(filename, content) {
  await mkdir(path.dirname(filename), { recursive: true });
  await writeFile(filename, content);
}

function source(files, distribution = 'bundled') {
  return { version: '1.0.0', sources: [{ id: 'test-source', repository: 'example/test-source',
    ref: '1'.repeat(40), distribution, files }] };
}

async function fixture(id, entries, distribution = 'bundled') {
  const base = path.join(fixtureRoot, id);
  const root = path.join(base, 'data');
  const lock = path.join(base, 'locks', 'sources.lock.json');
  await mkdir(root, { recursive: true });
  const files = entries.map(([relative, content]) => ({ path: relative, localPath: relative, gitBlobSha: blobSha(content) }));
  for (const [relative, content] of entries) await write(path.join(root, ...relative.split('/')), content);
  await write(lock, `${JSON.stringify(source(files, distribution), null, 2)}\n`);
  return { base, root, lock, files };
}

function run(command, root, lock, record) {
  const child = spawnSync(process.execPath, [manager, command, root, '--lock', lock], {
    encoding: 'utf8', timeout: 20000, maxBuffer: 2 * 1024 * 1024, windowsHide: true,
  });
  const observation = { command, root, lock, exitCode: child.status, signal: child.signal,
    stdout: child.stdout || '', stderr: child.stderr || '', error: child.error?.message ?? null };
  record.observations.push(observation);
  assert.equal(child.error, undefined, 'CLI must complete without process error');
  assert.equal(child.signal, null, 'CLI must not be killed');
  let data;
  assert.doesNotThrow(() => { data = JSON.parse(child.stdout); }, 'CLI stdout must be JSON');
  return { ...observation, data };
}

function scenario(id, name, action) {
  test(name, { concurrency: false }, async context => {
    const record = { id, name, status: 'RUNNING', startedAt: new Date().toISOString(), observations: [] };
    evidence.push(record);
    try {
      await action(context, record);
      if (record.status === 'RUNNING') record.status = 'PASS';
    } catch (error) {
      record.status = 'FAIL';
      record.error = error.message;
      throw error;
    } finally { record.completedAt = new Date().toISOString(); }
  });
}

scenario('SM-01', 'Changed bytes are rejected after a valid bundled-file control', async (_context, record) => {
  const fx = await fixture('changed-bytes', [['asset.txt', 'original\n']]);
  const before = run('verify', fx.root, fx.lock, record);
  assert.equal(before.exitCode, 0);
  assert.equal(before.data.passed, 1);
  await writeFile(path.join(fx.root, 'asset.txt'), 'tampered\n');
  const afterChange = run('verify', fx.root, fx.lock, record);
  assert.equal(afterChange.exitCode, 1);
  assert.equal(afterChange.data.status, 'FAIL');
  assert.equal(afterChange.data.failed, 1);
  assert.match(afterChange.data.files[0].error, /Git blob SHA mismatch/);
  assert.notEqual(afterChange.data.files[0].actualGitBlobSha, afterChange.data.files[0].expectedGitBlobSha);
});

scenario('SM-02', 'Missing bundled file is rejected', async (_context, record) => {
  const fx = await fixture('missing-file', []);
  await write(fx.lock, JSON.stringify(source([{ path: 'absent.txt', localPath: 'absent.txt', gitBlobSha: blobSha('expected') }])));
  const result = run('verify', fx.root, fx.lock, record);
  assert.equal(result.exitCode, 1);
  assert.equal(result.data.status, 'FAIL');
  assert.equal(result.data.failed, 1);
  assert.match(result.data.files[0].error, /ENOENT/);
});

scenario('SM-03', 'Lock path traversal is rejected before reading outside root', async (_context, record) => {
  const fx = await fixture('traversal', []);
  const secret = 'original synthetic outside content\n';
  const outside = path.join(fx.base, 'outside.txt');
  await writeFile(outside, secret);
  await write(fx.lock, JSON.stringify(source([{ path: 'outside.txt', localPath: '../outside.txt', gitBlobSha: blobSha(secret) }])));
  const result = run('verify', fx.root, fx.lock, record);
  assert.equal(result.exitCode, 1);
  assert.equal(result.data.status, 'FAIL');
  assert.match(result.data.error, /Unsafe localPath/);
  assert.equal(result.data.files, undefined, 'Unsafe lock must fail before per-file verification');
  assert.equal(await readFile(outside, 'utf8'), secret);
});

scenario('SM-04', 'Symlink or Windows junction escaping root is rejected', async (context, record) => {
  const fx = await fixture('link-escape', []);
  const outsideDir = path.join(fx.base, 'outside');
  const content = 'synthetic escape target\n';
  await write(path.join(outsideDir, 'asset.txt'), content);
  const link = path.join(fx.root, 'escape');
  try { await symlink(outsideDir, link, process.platform === 'win32' ? 'junction' : 'dir'); }
  catch (error) {
    if (!['EPERM', 'EACCES', 'ENOTSUP', 'UNKNOWN'].includes(error.code)) throw error;
    record.status = 'NOT_RUN';
    record.reason = `Environment rejected link creation: ${error.code}: ${error.message}`;
    context.skip(record.reason);
    return;
  }
  await write(fx.lock, JSON.stringify(source([{ path: 'escape/asset.txt', localPath: 'escape/asset.txt', gitBlobSha: blobSha(content) }])));
  const result = run('verify', fx.root, fx.lock, record);
  assert.equal(result.exitCode, 1);
  assert.equal(result.data.status, 'FAIL');
  assert.equal(result.data.failed, 1);
  assert.match(result.data.files[0].error, /Symbolic link or junction rejected/);
  assert.equal(await readFile(path.join(outsideDir, 'asset.txt'), 'utf8'), content);
});

scenario('SM-05', 'Actual external cache verifies all four pinned upstream files', async (_context, record) => {
  const result = run('verify-remote', actualExternal, actualLock, record);
  assert.equal(result.exitCode, 0);
  assert.equal(result.data.status, 'PASS');
  assert.equal(result.data.checked, 4);
  assert.equal(result.data.passed, 4);
  assert.equal(result.data.failed, 0);
  assert.ok(result.data.files.every(file => file.source === 'web-design-engineer' && file.status === 'PASS'));
});

scenario('SM-06', 'Preparing an existing mismatched external cache refuses overwrite', async (_context, record) => {
  const entries = [
    ['web-design-engineer/SKILL.md', 'synthetic instruction\n'],
    ['web-design-engineer/agents/openai.yaml', 'synthetic metadata\n'],
    ['web-design-engineer/explanation.html', '<p>synthetic example</p>\n'],
    ['web-design-engineer/references/advanced-patterns.md', 'synthetic reference\n'],
  ];
  const fx = await fixture('existing-cache', entries, 'external');
  const valid = run('verify-remote', fx.root, fx.lock, record);
  assert.equal(valid.exitCode, 0);
  assert.equal(valid.data.passed, 4);
  await writeFile(path.join(fx.root, 'web-design-engineer', 'SKILL.md'), 'preserve this intentionally mismatched content\n');
  const before = await Promise.all(entries.map(([relative]) => readFile(path.join(fx.root, ...relative.split('/')))));
  const result = run('prepare-remote', fx.root, fx.lock, record);
  assert.equal(result.exitCode, 1);
  assert.equal(result.data.status, 'FAIL');
  assert.equal(result.data.cached, true);
  assert.equal(result.data.failed, 1);
  assert.equal(result.data.passed, 3);
  assert.match(result.data.files.find(file => file.status === 'FAIL').error, /Git blob SHA mismatch/);
  const afterAttempt = await Promise.all(entries.map(([relative]) => readFile(path.join(fx.root, ...relative.split('/')))));
  for (let i = 0; i < before.length; i += 1) assert.deepEqual(afterAttempt[i], before[i], `Cache file ${entries[i][0]} was overwritten`);
});

after(async () => {
  const counts = { PASS: 0, FAIL: 0, NOT_RUN: 0 };
  for (const item of evidence) counts[item.status] = (counts[item.status] || 0) + 1;
  const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
  const report = {
    schemaVersion: '1.0.0', suite: 'source-manager CLI negative and integrity tests',
    scope: 'Six component tests; excluded from the separate 34-case acceptance denominator.',
    startedAt, completedAt: new Date().toISOString(),
    runtime: { node: process.version, platform: process.platform, arch: process.arch },
    sourceManagerSha256: sha256(await readFile(manager)),
    sourceLockSha256: sha256(await readFile(actualLock)),
    fixtureRoot, counts, results: evidence,
    limitations: ['No source download/network behavior is exercised by this suite.',
      'A hash match establishes source integrity, not successful agent application of the skill.'],
  };
  await write(path.join(repoRoot, 'tests', 'evidence', 'source-manager-tests.json'), `${JSON.stringify(report, null, 2)}\n`);
});

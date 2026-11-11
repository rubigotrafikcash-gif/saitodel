import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

// Synthetic component tests only. No installed plugin or acceptance status changes.
// These exercise ordinary exceptions, not crash durability or hostile concurrent writes.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packager = fs.readFileSync(path.join(repoRoot, 'scripts', 'package.mjs'));
const inputs = {
  'plugin.json': JSON.stringify({ name: 'saitodel', version: '1.0.3' }),
  'SKILL.md': '# Synthetic skill\nVersion: 1.0.3\n',
  'agents/openai.yaml': 'interface:\n  display_name: Synthetic\n',
  'assets/example.txt': 'asset\n',
  'references/example.md': 'reference\n',
  'vendor/example/source.txt': 'synthetic vendor bytes\n',
  'sources.lock.json': '{"version":"1.0.0","sources":[]}\n',
  'scripts/source-manager.mjs': '// synthetic source manager, never executed\n',
};

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'saitodel-package-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const [relative, content] of Object.entries(inputs)) {
    const filename = path.join(root, relative);
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    fs.writeFileSync(filename, content);
  }
  fs.writeFileSync(path.join(root, 'scripts', 'package.mjs'), packager);
  return { root, out: path.join(root, 'build', 'release', 'saitodel') };
}

function run(fx, options = []) {
  const result = spawnSync(process.execPath, [...options, path.join(fx.root, 'scripts', 'package.mjs'), fx.out], {
    cwd: fx.root, encoding: 'utf8', timeout: 15000, maxBuffer: 1024 * 1024, windowsHide: true,
  });
  assert.equal(result.error, undefined, 'Packager must exit without a process-launch error');
  assert.equal(result.signal, null, 'Packager must exit rather than be killed');
  return result;
}

function snapshot(directory) {
  if (!fs.existsSync(directory)) return {};
  const result = {};
  for (const entry of fs.readdirSync(directory, { recursive: true, withFileTypes: true })) {
    const filename = path.join(entry.parentPath, entry.name);
    const relative = path.relative(directory, filename).split(path.sep).join('/');
    result[relative] = entry.isDirectory() ? 'directory' : fs.readFileSync(filename).toString('base64');
  }
  return result;
}

function assertNoPublishedPackageOrStage(fx) {
  assert.equal(fs.existsSync(fx.out), false, 'Failed packaging must not expose a final output');
  const parent = path.dirname(fx.out);
  if (fs.existsSync(parent)) {
    assert.deepEqual(fs.readdirSync(parent).filter(name => name.startsWith('.saitodel-package-')), [],
      'This invocation must remove its unpublished staging directory');
  }
}

test('Successful packaging preserves every payload byte and publishes one complete package', t => {
  const fx = fixture(t);
  const before = snapshot(fx.root);
  const result = run(fx);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), { status: 'PACKAGED', directory: fx.out, version: '1.0.3' });
  const expected = {};
  for (const [relative, content] of Object.entries(inputs)) {
    const destination = relative === 'plugin.json' ? relative : `skills/saitodel/${relative}`;
    expected[destination] = Buffer.from(content).toString('base64');
  }
  const actual = Object.fromEntries(Object.entries(snapshot(fx.out)).filter(([, value]) => value !== 'directory'));
  assert.deepEqual(actual, expected, 'Final inventory and exact bytes must match inputs');
  for (const [name, value] of Object.entries(before)) {
    assert.equal(snapshot(fx.root)[name], value, `Source changed: ${name}`);
  }
  assert.deepEqual(fs.readdirSync(path.dirname(fx.out)), ['saitodel']);
});

test('Existing output is rejected without modifying any existing files', t => {
  const fx = fixture(t);
  fs.mkdirSync(path.join(fx.out, 'keep'), { recursive: true });
  fs.writeFileSync(path.join(fx.out, 'plugin.json'), '{"version":"keep-old"}\n');
  fs.writeFileSync(path.join(fx.out, 'keep', 'sentinel.txt'), 'must not change\n');
  const before = snapshot(fx.root);
  const result = run(fx);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Output already exists/);
  assert.deepEqual(snapshot(fx.root), before);
});

test('A missing required input is rejected before a final package is created', t => {
  const fx = fixture(t);
  fs.rmSync(path.join(fx.root, 'references'), { recursive: true });
  const before = snapshot(fx.root);
  const result = run(fx);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Missing package input: references/);
  assertNoPublishedPackageOrStage(fx);
  assert.deepEqual(snapshot(fx.root), before, 'Preflight failure must leave source untouched');
});

test('An injected copy exception after partial staging leaves no final package', t => {
  const fx = fixture(t);
  const hook = path.join(fx.root, 'copy-failure.mjs');
  // Inject an ordinary filesystem-copy exception after two real copies.
  // This avoids platform-dependent permission tricks and does not modify the packager.
  fs.writeFileSync(hook, `import fs from 'node:fs';\nconst original = fs.cpSync;\nlet copied = 0;\nfs.cpSync = function (...args) { if (++copied === 3) throw new Error('TEST_COPY_FAILURE_AFTER_TWO_COPIES'); return original.apply(this, args); };\n`);
  const sourceBefore = Object.fromEntries(Object.keys(inputs).map(relative => [relative, fs.readFileSync(path.join(fx.root, relative)).toString('base64')]));
  const result = run(fx, ['--import', hook]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /TEST_COPY_FAILURE_AFTER_TWO_COPIES/);
  assertNoPublishedPackageOrStage(fx);
  for (const [relative, bytes] of Object.entries(sourceBefore)) {
    assert.equal(fs.readFileSync(path.join(fx.root, relative)).toString('base64'), bytes);
  }
});

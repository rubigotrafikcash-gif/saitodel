import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { planUpdate } from '../scripts/plan-update.mjs';

const target = { name: 'saitodel', version: '1.0.3' };
const entry = () => ({ name: 'saitodel', pluginId: 'saitodel@personal-saitodel', marketplaceName: 'personal-saitodel',
  version: '1.0.2', installed: true, enabled: true, source: { source: 'local', path: 'C:\\Users\\rust\\saitodel' } });
const list = () => ({ installed: [entry()] });
const unchanged = (input, manifest=target) => {
  const before = JSON.stringify([input, manifest]);
  const result = planUpdate(input, manifest);
  assert.equal(JSON.stringify([input, manifest]), before);
  assert.equal(result.readOnly, true);
  assert.equal(result.installation, 'NOT_RUN');
  assert.equal(result.runtimeAcceptance, 'NOT_CHECKED');
  assert.ok(['BLOCKED', 'REVIEW_REQUIRED', 'VERIFY_EXISTING'].includes(result.status));
  return result;
};

test('Different version requires review, backup, rollback and separate consent', () => {
  const result = unchanged(list());
  assert.equal(result.status, 'REVIEW_REQUIRED');
  assert.match(result.required.join(' '), /configuration.*rollback.*separate consent/);
  assert.equal(result.installedVersion, '1.0.2');
});
test('Same version requires payload verification, never installation success', () => {
  const input = list(); input.installed[0].version = '1.0.3';
  assert.equal(unchanged(input).status, 'VERIFY_EXISTING');
});
test('No known installation is blocked, not treated as permission to install', () => {
  assert.equal(unchanged({ installed: [] }).reason, 'EXISTING_INSTALLATION_NOT_IDENTIFIED');
});
test('Duplicate installations blocked across marketplaces', () => {
  const input = list(); input.installed.push({ ...entry(), pluginId: 'saitodel@other', marketplaceName: 'other' });
  assert.equal(unchanged(input).reason, 'MULTIPLE_SAITODEL_CANDIDATES');
});
test('Wrong marketplace and conflicting name are blocked', () => {
  for (const patch of [{ pluginId: 'saitodel@other' }, { marketplaceName: 'other' }, { name: 'other' }, { marketplaceName: undefined }]) {
    const input = list(); Object.assign(input.installed[0], patch);
    assert.equal(unchanged(input).status, 'BLOCKED');
  }
});
test('Unrelated well-formed plugin entries ignored', () => {
  const input = list(); input.installed.unshift({name:'other',pluginId:'other@remote'});
  assert.equal(unchanged(input).status, 'REVIEW_REQUIRED');
});
test('Unknown listing schema fails closed', () => {
  for (const input of [null, [], {}, {installed:{}}, {installed:[null]}, {installed:[{}]}]) {
    assert.equal(unchanged(input).reason, 'UNKNOWN_PLUGIN_LIST_SCHEMA');
  }
});
test('Installed and enabled must be explicit booleans true', () => {
  for (const patch of [{installed:false},{enabled:false},{installed:'true'},{enabled:undefined}]) {
    const input = list(); Object.assign(input.installed[0],patch);
    assert.equal(unchanged(input).reason, 'INSTALLATION_NOT_ENABLED');
  }
});
test('POSIX, Windows drive and UNC absolute local paths accepted', () => {
  for (const sourcePath of ['/home/codex/saitodel','C:\\Users\\rust\\saitodel','D:/plugins/saitodel','\\\\server\\share\\saitodel']) {
    const input=list(); input.installed[0].source.path=sourcePath;
    assert.equal(unchanged(input).status,'REVIEW_REQUIRED');
  }
});
test('Relative, drive-relative, control-character and nonlocal paths blocked', () => {
  for (const sourcePath of ['', './plugin', 'C:plugin', '\\plugin', 'C:\\plugin\n', null]) {
    const input=list(); input.installed[0].source.path=sourcePath;
    assert.equal(unchanged(input).reason,'UNVERIFIED_LOCAL_SOURCE_PATH');
  }
  const input=list(); input.installed[0].source.source='git';
  assert.equal(unchanged(input).reason,'UNVERIFIED_LOCAL_SOURCE_PATH');
});
test('Malformed target or unknown installed version blocked', () => {
  for (const manifest of [null, {}, {name:'other',version:'1.0.3'}, {name:'saitodel',version:'latest'}]) {
    assert.equal(unchanged(list(),manifest).reason,'INVALID_TARGET_MANIFEST');
  }
  const input=list(); input.installed[0].version=null;
  assert.equal(unchanged(input).reason,'UNKNOWN_INSTALLED_VERSION');
});
test('Older target does not silently downgrade', () => {
  assert.equal(unchanged(list(),{name:'saitodel',version:'1.0.1'}).status,'REVIEW_REQUIRED');
});
test('CLI preserves files, emits no executable commands and rejects invalid inputs', async () => {
  const dir=await mkdtemp(path.join(tmpdir(),'saitodel-plan-'));
  try {
    const listing=path.join(dir,'listing.json'), manifest=path.join(dir,'plugin.json');
    const contents=[JSON.stringify(list()),JSON.stringify(target)];
    await writeFile(listing,contents[0]); await writeFile(manifest,contents[1]);
    const cli=fileURLToPath(new URL('../scripts/plan-update.mjs',import.meta.url));
    const run=(args)=>spawnSync(process.execPath,[cli,...args],{encoding:'utf8',cwd:dir,timeout:5000});
    const result=run([listing,manifest]); assert.equal(result.status,0);
    assert.equal(JSON.parse(result.stdout).status,'REVIEW_REQUIRED');
    assert.doesNotMatch(result.stdout,/codex plugin (?:update|remove|add)/);
    assert.deepEqual(await readdir(dir),['listing.json','plugin.json']);
    assert.equal(await readFile(listing,'utf8'),contents[0]); assert.equal(await readFile(manifest,'utf8'),contents[1]);
    assert.equal(run([]).status,1);
    assert.equal(run([path.join(dir,'absent'),manifest]).status,1);
    await writeFile(listing,'bad JSON');
    assert.equal(JSON.parse(run([listing,manifest]).stdout).status,'BLOCKED');
    assert.equal(await readFile(listing,'utf8'),'bad JSON');
  } finally { await rm(dir,{recursive:true,force:true}); }
});

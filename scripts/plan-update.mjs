#!/usr/bin/env node
// Read-only decision support. Never installs, invokes a process, or writes files.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const version = value => typeof value === 'string' && /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(value);
const base = { schemaVersion: 1, readOnly: true, installation: 'NOT_RUN', payload: 'NOT_VERIFIED', runtimeAcceptance: 'NOT_CHECKED' };
const blocked = reason => ({ ...base, status: 'BLOCKED', reason });

export function planUpdate(listing, target) {
  if (!object(target) || target.name !== 'saitodel' || !version(target.version)) return blocked('INVALID_TARGET_MANIFEST');
  if (!object(listing) || !Array.isArray(listing.installed)
      || listing.installed.some(entry => !object(entry) || typeof entry.name !== 'string' || typeof entry.pluginId !== 'string')) {
    return blocked('UNKNOWN_PLUGIN_LIST_SCHEMA');
  }
  const matches = listing.installed.filter(entry => entry.name === 'saitodel' || /^saitodel@/.test(entry.pluginId));
  if (matches.length === 0) return blocked('EXISTING_INSTALLATION_NOT_IDENTIFIED');
  if (matches.length !== 1) return blocked('MULTIPLE_SAITODEL_CANDIDATES');
  const candidate = matches[0];
  if (candidate.name !== 'saitodel' || candidate.pluginId !== 'saitodel@personal-saitodel'
      || candidate.marketplaceName !== 'personal-saitodel') return blocked('UNEXPECTED_INSTALLATION_IDENTITY');
  if (candidate.installed !== true || candidate.enabled !== true) return blocked('INSTALLATION_NOT_ENABLED');
  if (!version(candidate.version)) return blocked('UNKNOWN_INSTALLED_VERSION');
  if (!object(candidate.source) || candidate.source.source !== 'local'
      || typeof candidate.source.path !== 'string' || !candidate.source.path
      || /[\x00-\x1f]/.test(candidate.source.path)
      || !(path.posix.isAbsolute(candidate.source.path)
        || /^[A-Za-z]:[\\/]/.test(candidate.source.path)
        || /^\\\\[^\\/]+[\\/][^\\/]+(?:[\\/]|$)/.test(candidate.source.path))) {
    return blocked('UNVERIFIED_LOCAL_SOURCE_PATH');
  }
  const identity = { pluginId: candidate.pluginId, sourcePath: candidate.source.path,
    installedVersion: candidate.version, targetVersion: target.version };
  if (candidate.version === target.version) {
    return { ...base, ...identity, status: 'VERIFY_EXISTING', reason: 'SAME_VERSION_IS_NOT_PAYLOAD_PROOF',
      required: ['Verify the complete installed payload against the target source.',
        'Record actual identity, hashes and fresh-session behavior.'] };
  }
  return { ...base, ...identity, status: 'REVIEW_REQUIRED', reason: 'VERSION_CHANGE_REQUIRES_REVIEW',
    required: ['Preserve the exact existing package and configuration before any change.',
      'Prepare and verify rollback without overwriting later user changes.',
      'Confirm the supported update method for the actual local client.',
      'Obtain separate consent before changing the working installation.',
      'Verify payload and fresh-session behavior after any authorized update.'] };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let result;
  if (process.argv.length !== 4) result = blocked('USAGE: plan-update.mjs <plugin-list.json> <target-plugin.json>');
  else {
    try {
      const [listing, target] = await Promise.all(process.argv.slice(2).map(async filename => JSON.parse(await readFile(filename, 'utf8'))));
      result = planUpdate(listing, target);
    } catch { result = blocked('INPUT_UNREADABLE_OR_INVALID_JSON'); }
  }
  console.log(JSON.stringify(result, null, 2));
  if (result.status === 'BLOCKED') process.exitCode = 1;
}

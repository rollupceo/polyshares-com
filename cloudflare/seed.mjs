#!/usr/bin/env node
/**
 * Seed the Worker's KV credential store from the existing CRM credential files.
 * Zero-dependency, Node 18+ (uses global Web Crypto). Run from this directory.
 *
 * Two modes:
 *
 *   node seed.mjs --verbatim
 *       Copy crm-logins.json + crm-signup.json into KV-ready files UNCHANGED.
 *       Everyone keeps their current password. The token handed back on login is
 *       whatever is already in the blobs (i.e. the CURRENT GitHub token).
 *       Use this to get OFF the public file immediately when you have NOT yet
 *       rotated the PAT.
 *
 *   node seed.mjs --rekey --token <NEW_GITHUB_PAT> [--code <NEW_TEAM_CODE>]
 *       Rebuild the store under a freshly ROTATED token. Each user gets a strong
 *       temporary password (printed for you to distribute); they change it after
 *       first sign-in. This is the audit's recommended path: rotate PAT + reset
 *       all passwords in one step. The old public blobs become worthless.
 *
 * Output: writes kv-logins.json and kv-signup.json next to this script, then
 * prints the exact `wrangler` commands to upload them.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const enc = new TextEncoder();
const b64 = a => Buffer.from(a).toString('base64');
const PBKDF2_ITER = 600000;

async function encryptToken(pass, tok) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const km = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: PBKDF2_ITER, hash: 'SHA-256' },
    km, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(tok));
  return { s: b64(salt), iv: b64(iv), ct: b64(new Uint8Array(ct)), iter: PBKDF2_ITER };
}
function genPass() {
  const a = crypto.getRandomValues(new Uint8Array(16));
  const cs = 'abcdefghjkmnpqrstuvwxyz23456789';
  const s = Array.from(a, b => cs[b % cs.length]).join('');
  return 'poly-' + s.slice(0, 4) + '-' + s.slice(4, 8) + '-' + s.slice(8, 12) + '-' + s.slice(12, 16);
}
const arg = name => { const i = process.argv.indexOf(name); return i > -1 ? process.argv[i + 1] : null; };
const has = name => process.argv.includes(name);

const logins = JSON.parse(readFileSync(new URL('../crm-logins.json', import.meta.url)));

if (has('--verbatim')) {
  writeFileSync(new URL('./kv-logins.json', import.meta.url), JSON.stringify(logins));
  try {
    const signup = JSON.parse(readFileSync(new URL('../crm-signup.json', import.meta.url)));
    writeFileSync(new URL('./kv-signup.json', import.meta.url), JSON.stringify(signup));
  } catch { console.warn('! crm-signup.json not found — skipping signup blob'); }
  console.log('Wrote kv-logins.json + kv-signup.json (verbatim copy).');
} else if (has('--rekey')) {
  const token = arg('--token');
  if (!token) { console.error('ERROR: --rekey requires --token <NEW_GITHUB_PAT>'); process.exit(1); }
  const code = arg('--code') || genPass();
  const out = { users: [] };
  const creds = [];
  for (const u of logins.users) {
    const pass = genPass();
    out.users.push({ id: u.id, email: u.email, name: u.name, role: u.role || 'sales', enc: await encryptToken(pass, token) });
    creds.push({ name: u.name, email: u.email, password: pass });
  }
  writeFileSync(new URL('./kv-logins.json', import.meta.url), JSON.stringify(out));
  writeFileSync(new URL('./kv-signup.json', import.meta.url), JSON.stringify({ enc: await encryptToken(code, token) }));
  console.log('\nWrote kv-logins.json + kv-signup.json (re-keyed under the new token).\n');
  console.log('=== TEMPORARY PASSWORDS — distribute securely, then have each person change theirs ===');
  for (const c of creds) console.log(`  ${c.name.padEnd(20)} ${String(c.email).padEnd(28)} ${c.password}`);
  console.log(`\n  TEAM SIGNUP CODE: ${code}\n`);
} else {
  console.error('Usage:\n  node seed.mjs --verbatim\n  node seed.mjs --rekey --token <NEW_GITHUB_PAT> [--code <NEW_TEAM_CODE>]');
  process.exit(1);
}

console.log('Upload to KV with (replace <NS_ID> with your namespace id):');
console.log('  npx wrangler kv key put logins --path kv-logins.json --namespace-id <NS_ID>');
console.log('  npx wrangler kv key put signup --path kv-signup.json --namespace-id <NS_ID>');
console.log('\nThen DELETE the local kv-*.json files — they contain credential blobs.');

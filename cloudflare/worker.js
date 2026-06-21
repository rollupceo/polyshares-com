/**
 * Polyshares CRM — authentication gateway (Cloudflare Worker)
 * ---------------------------------------------------------------------------
 * Purpose: close the three CRITICAL findings from the 2026-06-21 security audit.
 *
 *   #1/#2  The credential files (crm-logins.json / crm-signup.json) were world-
 *          readable on a public GitHub repo, so anyone could download every
 *          encrypted blob and brute-force it offline at full speed.
 *   #3     There was no server, so nothing could rate-limit or lock out guessing.
 *
 * This Worker becomes the only thing that can read the credential store. The
 * store lives in a PRIVATE Workers KV namespace — never downloadable. Passwords
 * are verified SERVER-SIDE, and failed attempts are counted per-email and per-IP
 * with a lockout window. The shared GitHub token is only handed back AFTER a
 * correct password, so there is no public blob left to attack offline.
 *
 * Crypto is identical to the in-browser scheme (PBKDF2-HMAC-SHA256 -> AES-GCM)
 * so the existing credential file migrates into KV verbatim (see seed.mjs).
 *
 * Cost: Cloudflare Workers + Workers KV free tier. A 6-person CRM uses a few
 * hundred requests/day against limits of 100k requests and 1k KV writes/day. $0.
 * ---------------------------------------------------------------------------
 *
 * Bindings (see wrangler.toml):
 *   KV  CRM_AUTH        - KV namespace holding "logins" and "signup" + lockout counters
 *   secret GH_TOKEN     - the (rotated) shared GitHub PAT the CRM uses for data access
 *   var  ALLOWED_ORIGINS - comma-separated list of allowed browser origins
 *
 * Endpoints (all JSON, POST unless noted):
 *   /login                {email, password}                  -> {token, user}
 *   /signup               {name, email, password, code}      -> {token, user}
 *   /set-password   (auth){targetId, password, name?, email?, role?}
 *   /add-user       (auth){email, name, role, password, id?}
 *   /remove-user    (auth){id}
 *   /set-role       (auth){id, role}
 *   /rotate-signup-code (auth){code}
 *
 * "(auth)" endpoints require  Authorization: Bearer <GH_TOKEN>  — i.e. the caller
 * must already hold the shared token (be a logged-in CRM user). This matches the
 * CRM's existing trust model (single shared token, roles enforced client-side).
 */

const LOCK_WINDOW_S = 900;   // 15 min sliding window for failed attempts
const LOCK_MAX_EMAIL = 8;    // lock an email after this many fails in the window
const LOCK_MAX_IP = 30;      // lock an IP after this many fails in the window
const PBKDF2_ITER = 600000;
const PBKDF2_LEGACY_ITER = 310000;

/* ---------- crypto (mirrors crm.html) ---------- */
const enc = new TextEncoder(), dec = new TextDecoder();
const ub64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const b64 = a => btoa(String.fromCharCode(...new Uint8Array(a)));

async function deriveKey(pass, salt, usage, iter) {
  const km = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' },
    km, { name: 'AES-GCM', length: 256 }, false, [usage]);
}
async function decryptToken(pass, e) {
  const key = await deriveKey(pass, ub64(e.s), 'decrypt', e.iter || PBKDF2_LEGACY_ITER);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ub64(e.iv) }, key, ub64(e.ct));
  return dec.decode(pt);
}
async function encryptToken(pass, tok) {
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(pass, salt, 'encrypt', PBKDF2_ITER);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(tok));
  return { s: b64(salt), iv: b64(iv), ct: b64(ct), iter: PBKDF2_ITER };
}
// constant-time string compare
function ctEq(a, b) {
  if (a.length !== b.length) return false;
  let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/* ---------- KV helpers ---------- */
async function getLogins(env) {
  const raw = await env.CRM_AUTH.get('logins');
  const doc = raw ? JSON.parse(raw) : { users: [] };
  if (!Array.isArray(doc.users)) doc.users = [];
  return doc;
}
const putLogins = (env, doc) => env.CRM_AUTH.put('logins', JSON.stringify(doc));
async function getSignup(env) {
  const raw = await env.CRM_AUTH.get('signup');
  return raw ? JSON.parse(raw) : null;
}

/* ---------- rate limiting (KV counters w/ TTL; eventually consistent, fine for this scale) ---------- */
async function failCount(env, key) { return parseInt(await env.CRM_AUTH.get('fail:' + key) || '0', 10); }
async function bumpFail(env, key) {
  const n = (await failCount(env, key)) + 1;
  await env.CRM_AUTH.put('fail:' + key, String(n), { expirationTtl: LOCK_WINDOW_S });
  return n;
}
const clearFail = (env, key) => env.CRM_AUTH.delete('fail:' + key);
async function isLocked(env, email, ip) {
  if (email && (await failCount(env, 'e:' + email)) >= LOCK_MAX_EMAIL) return true;
  if (ip && (await failCount(env, 'ip:' + ip)) >= LOCK_MAX_IP) return true;
  return false;
}

/* ---------- http helpers ---------- */
function corsHeaders(req, env) {
  const allow = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  const origin = req.headers.get('Origin') || '';
  const h = {
    'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
  if (allow.includes(origin)) h['Access-Control-Allow-Origin'] = origin;
  return h;
}
function json(obj, status, req, env) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...corsHeaders(req, env) },
  });
}
function requireAuth(req, env) {
  const h = req.headers.get('Authorization') || '';
  const tok = h.startsWith('Bearer ') ? h.slice(7) : '';
  return tok && env.GH_TOKEN && ctEq(tok, env.GH_TOKEN);
}
const slugId = email => (email.split('@')[0].replace(/[^a-z0-9]+/g, '') || 'rep');
function uniqueId(base, doc) {
  const taken = new Set(doc.users.map(u => u.id));
  if (!taken.has(base)) return base;
  let n = 1, id; do { id = base + (++n); } while (taken.has(id));
  return id;
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(req, env) });
    if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405, req, env);

    const ip = req.headers.get('CF-Connecting-IP') || '';
    let body;
    try { body = await req.json(); } catch { return json({ error: 'bad request' }, 400, req, env); }

    try {
      switch (url.pathname) {
        /* ---------------- LOGIN ---------------- */
        case '/login': {
          const email = String(body.email || '').trim().toLowerCase();
          const password = String(body.password || '');
          if (!email || !password) return json({ error: 'Enter your email and password.' }, 400, req, env);
          if (await isLocked(env, email, ip))
            return json({ error: 'Too many attempts. Try again in 15 minutes.' }, 429, req, env);

          const doc = await getLogins(env);
          const u = doc.users.find(x => (x.email || '').toLowerCase() === email);
          let token = null;
          if (u) { try { token = await decryptToken(password, u.enc); } catch { /* wrong pw */ } }
          if (!token) {
            await bumpFail(env, 'e:' + email); await bumpFail(env, 'ip:' + ip);
            // generic message — do not reveal whether the email exists
            return json({ error: 'Invalid email or password.' }, 401, req, env);
          }
          await clearFail(env, 'e:' + email); await clearFail(env, 'ip:' + ip);
          return json({ token, user: { id: u.id, name: u.name, email: u.email, role: u.role || 'sales' } }, 200, req, env);
        }

        /* ---------------- SIGNUP ---------------- */
        case '/signup': {
          const name = String(body.name || '').trim();
          const email = String(body.email || '').trim().toLowerCase();
          const password = String(body.password || '');
          const code = String(body.code || '').trim();
          if (!name || !email.includes('@')) return json({ error: 'Enter your name and a valid email.' }, 400, req, env);
          if (password.length < 12) return json({ error: 'Password must be at least 12 characters.' }, 400, req, env);
          if (!code) return json({ error: 'Enter the team signup code.' }, 400, req, env);
          if (await isLocked(env, 'signup', ip))
            return json({ error: 'Too many attempts. Try again in 15 minutes.' }, 429, req, env);

          const signup = await getSignup(env);
          if (!signup) return json({ error: 'Signup is not configured.' }, 500, req, env);
          let token = null;
          try { token = await decryptToken(code, signup.enc); } catch { /* bad code */ }
          if (!token) {
            await bumpFail(env, 'signup'); await bumpFail(env, 'ip:' + ip);
            return json({ error: 'Invalid team signup code.' }, 401, req, env);
          }
          // the decrypted code-token must equal the canonical token; otherwise the
          // signup blob is stale — refuse rather than mint a bad login
          if (env.GH_TOKEN && !ctEq(token, env.GH_TOKEN))
            return json({ error: 'Signup is temporarily unavailable.' }, 500, req, env);

          const doc = await getLogins(env);
          if (doc.users.find(u => (u.email || '').toLowerCase() === email))
            return json({ error: 'An account with that email already exists — sign in instead.' }, 409, req, env);
          const id = uniqueId(slugId(email), doc);
          const role = doc.users.length === 0 ? 'founder' : 'sales';
          doc.users.push({ id, email, name, role, enc: await encryptToken(password, env.GH_TOKEN) });
          await putLogins(env, doc);
          await clearFail(env, 'signup'); await clearFail(env, 'ip:' + ip);
          return json({ token: env.GH_TOKEN, user: { id, name, email, role } }, 200, req, env);
        }

        /* ---------------- SET PASSWORD (admin reset OR self change) ---------------- */
        case '/set-password': {
          if (!requireAuth(req, env)) return json({ error: 'unauthorized' }, 401, req, env);
          const targetId = String(body.targetId || '').trim();
          const password = String(body.password || '');
          if (!targetId) return json({ error: 'targetId required' }, 400, req, env);
          if (password.length < 12) return json({ error: 'Password must be at least 12 characters.' }, 400, req, env);
          const doc = await getLogins(env);
          let u = doc.users.find(x => x.id === targetId);
          if (!u) { u = { id: targetId, email: body.email || '', name: body.name || targetId, role: body.role || 'sales' }; doc.users.push(u); }
          if (body.name) u.name = body.name;
          if (body.email) u.email = String(body.email).toLowerCase();
          if (body.role) u.role = body.role;
          u.enc = await encryptToken(password, env.GH_TOKEN);
          await putLogins(env, doc);
          // a password change invalidates any active lockout for that email
          if (u.email) await clearFail(env, 'e:' + u.email.toLowerCase());
          return json({ ok: true }, 200, req, env);
        }

        /* ---------------- ADD USER ---------------- */
        case '/add-user': {
          if (!requireAuth(req, env)) return json({ error: 'unauthorized' }, 401, req, env);
          const email = String(body.email || '').trim().toLowerCase();
          const name = String(body.name || '').trim();
          const role = body.role === 'founder' ? 'founder' : 'sales';
          const password = String(body.password || '');
          if (!name || !email.includes('@')) return json({ error: 'Name and email required' }, 400, req, env);
          if (password.length < 12) return json({ error: 'Temp password must be at least 12 characters.' }, 400, req, env);
          const doc = await getLogins(env);
          if (doc.users.find(u => (u.email || '').toLowerCase() === email))
            return json({ error: 'That email already has an account' }, 409, req, env);
          const id = body.id ? String(body.id) : uniqueId(slugId(email), doc);
          doc.users.push({ id, email, name, role, enc: await encryptToken(password, env.GH_TOKEN) });
          await putLogins(env, doc);
          return json({ ok: true, id }, 200, req, env);
        }

        /* ---------------- REMOVE USER ---------------- */
        case '/remove-user': {
          if (!requireAuth(req, env)) return json({ error: 'unauthorized' }, 401, req, env);
          const id = String(body.id || '').trim();
          if (!id) return json({ error: 'id required' }, 400, req, env);
          const doc = await getLogins(env);
          doc.users = doc.users.filter(u => u.id !== id);
          await putLogins(env, doc);
          return json({ ok: true }, 200, req, env);
        }

        /* ---------------- SET ROLE ---------------- */
        case '/set-role': {
          if (!requireAuth(req, env)) return json({ error: 'unauthorized' }, 401, req, env);
          const id = String(body.id || '').trim();
          const role = body.role === 'founder' ? 'founder' : 'sales';
          const doc = await getLogins(env);
          const u = doc.users.find(x => x.id === id);
          if (u) { u.role = role; await putLogins(env, doc); }
          return json({ ok: true }, 200, req, env);
        }

        /* ---------------- ROTATE SIGNUP CODE ---------------- */
        case '/rotate-signup-code': {
          if (!requireAuth(req, env)) return json({ error: 'unauthorized' }, 401, req, env);
          const code = String(body.code || '').trim();
          if (code.length < 8) return json({ error: 'Use at least 8 characters' }, 400, req, env);
          await env.CRM_AUTH.put('signup', JSON.stringify({ enc: await encryptToken(code, env.GH_TOKEN) }));
          return json({ ok: true }, 200, req, env);
        }

        default:
          return json({ error: 'not found' }, 404, req, env);
      }
    } catch (e) {
      return json({ error: 'server error' }, 500, req, env);
    }
  },
};

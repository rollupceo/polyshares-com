# Polyshares CRM — Cloudflare migration runbook

This closes the three CRITICAL audit findings (public credential files + no rate
limiting) and turns on the security headers, at **$0** — Cloudflare Pages and
Workers free tiers cover a 6-person CRM with enormous headroom.

Two independent pieces. Do them in either order.

---

## A. Move hosting to Cloudflare Pages → activates security headers (free)

The site stays exactly the same; only where it's served from changes. The
[`_headers`](../_headers) file (CSP, HSTS, X-Frame-Options, etc.) starts working
automatically once you're on Pages — GitHub Pages ignores it.

1. Sign in at https://dash.cloudflare.com (free account, no card).
2. **Workers & Pages → Create → Pages → Connect to Git** → pick `rollupceo/polyshares-com`.
3. Build settings: Framework preset **None**, build command **(blank)**, output dir **`/`**. Deploy.
4. **Custom domains** → add `polyshares.com` and `www.polyshares.com`. Cloudflare
   walks you through pointing the domain's nameservers/DNS at it.
5. Verify headers once live:
   ```
   curl -sI https://polyshares.com | grep -i 'content-security\|x-frame\|strict-transport\|x-content-type'
   ```
6. In GitHub repo settings you can then turn **GitHub Pages off** (avoids two live copies).

---

## B. Stand up the login gateway → closes criticals #1–#3 (free)

The Worker holds the credential store **privately** in KV, verifies passwords
**server-side**, and **locks out** brute-force attempts. The public
`crm-logins.json` / `crm-signup.json` files go away.

### 1. Rotate the GitHub PAT first
At github.com revoke the current "GitHub CLI" OAuth authorization and issue a new
token with the same `repo` scope on `rollupceo/polyshares-crm-data`. Call it `NEW_TOKEN`.
(This also neutralizes the old token sitting in git history — audit HIGH finding.)

### 2. Create the Worker + KV (from this `cloudflare/` directory)
```
npm i -g wrangler            # or use npx in front of each command
wrangler login
wrangler kv namespace create CRM_AUTH      # prints an id — paste it into wrangler.toml
wrangler secret put GH_TOKEN               # paste NEW_TOKEN when prompted
```

### 3. Seed the credential store
Recommended (rotate + reset passwords together — the audit's advice):
```
node seed.mjs --rekey --token "NEW_TOKEN"
# prints a temp password per user + a new team signup code — save these
wrangler kv key put logins --path kv-logins.json --namespace-id <NS_ID>
wrangler kv key put signup --path kv-signup.json --namespace-id <NS_ID>
rm kv-logins.json kv-signup.json           # delete — they hold credential blobs
```
Quick alternative (get off the public file now, keep current passwords, NO rotation):
```
node seed.mjs --verbatim   # then the same two `wrangler kv key put` commands
```

### 4. Deploy
```
wrangler deploy
```
Note the URL it prints, e.g. `https://polyshares-crm-auth.<subdomain>.workers.dev`.
(Optional: map it to `https://auth.polyshares.com` via a Workers custom domain.)

### 5. Point the CRM at the gateway
In [`../crm.html`](../crm.html) set the flag near the top of the main script:
```js
const CRM_GATEWAY = 'https://polyshares-crm-auth.<subdomain>.workers.dev';
```
Leave it `''` and the CRM keeps using the legacy public-file path — so it is safe
to commit/deploy the CRM changes *before* the Worker exists, then flip this on.
Commit and let Pages redeploy.

### 6. Remove the public credential files
Once login + signup work through the gateway:
```
git rm crm-logins.json crm-signup.json && git commit -m "crm: move credentials behind auth gateway" && git push
```

### Verify
- Wrong password a handful of times → `Too many attempts` (lockout works).
- `curl https://raw.githubusercontent.com/rollupceo/polyshares-com/main/crm-logins.json` → 404 (no longer public).
- Sign in, change password, admin add/reset/remove user, rotate signup code — all still work.

---

## What this does and does not solve

| Audit finding | Status after A+B |
|---|---|
| #1/#2 public credential files | **Fixed** — store is private in KV, no downloadable blob |
| #3 no rate limiting / lockout | **Fixed** — per-email + per-IP lockout in the Worker |
| Old PAT in git history | **Fixed** by the rotation in B.1 (old token is dead) |
| Missing security headers | **Fixed** by A (`_headers` honored on Pages) |
| PBKDF2 310k → 600k | already done in `crm.html` |
| Shared single PAT (one token = all data) | **Not changed** — still one token; the token now just lives behind the gateway instead of in a public file. Per-rep tokens would be a larger re-architecture. |
| Gmail OAuth client restriction | **Manual** — restrict to `polyshares.com` in Google Cloud Console |
| GA4 placeholder ID | **Manual** — provide the real `G-` id |

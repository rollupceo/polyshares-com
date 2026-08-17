# Polyshares Worker — deploy runbook

One Cloudflare Worker (`polyshares-crm-auth`, source in [`worker.js`](worker.js))
does two jobs:

| Job | Endpoints | Auth |
|---|---|---|
| **CRM auth gateway** — private credential store in KV, server-side password check, brute-force lockout | `/login` `/signup` `/set-password` `/add-user` `/remove-user` `/set-role` `/rotate-signup-code` | public login/signup; the rest need `Authorization: Bearer <GH_TOKEN>` |
| **Public intake** — writes website leads straight into the private CRM data repo | `/intake` | **none** (honeypot + per-IP cap instead) |

Both run on the Cloudflare Workers + KV free tier: **$0**.

> **Current state:** the Worker is **not deployed**. Until it is, the qualification
> flow at https://polyshares.com/intake stores nothing — `intake.html` detects the
> empty `ENDPOINT`, shows the visitor a recap of their answers, and points them at
> Calendly. Section 1 below is the shortest path to fixing that.

---

# 1. Deploy the Worker (start here)

Nine steps, in order. Steps 1.1–1.5 stand the Worker up; **1.6 is the one people
forget** and without it the website still stores nothing.

Run everything from this `cloudflare/` directory.

## 1.1 Prerequisites

- **Node 18+** (20 LTS recommended). `seed.mjs` and Wrangler both need it.
- **A Cloudflare account** — free tier, no card required: https://dash.cloudflare.com
- **Wrangler**, via `npx` (no global install needed).
- **A GitHub PAT** with write access to the private `rollupceo/polyshares-crm-data`
  repo — see 1.3 for exact scopes.

Check Node:

```bash
node --version
```

Log in to Cloudflare (opens a browser):

```bash
npx wrangler login
```

Confirm you're logged in and on the right account:

```bash
npx wrangler whoami
```

## 1.2 Create the KV namespace and paste the id into `wrangler.toml`

The Worker binds one KV namespace, `CRM_AUTH`. It holds the credential store, the
login lockout counters, **and** the per-IP intake counters — so `/intake` will not
work without it.

```bash
npx wrangler kv namespace create CRM_AUTH
```

It prints a `[[kv_namespaces]]` block containing an `id`. Copy that id into
[`wrangler.toml`](wrangler.toml), replacing the placeholder:

```toml
[[kv_namespaces]]
binding = "CRM_AUTH"
id = "PASTE_KV_NAMESPACE_ID_HERE"   # <- replace with the printed id
```

Keep the id handy — later `wrangler kv key` commands want it as `<NS_ID>`.

## 1.3 Set the `GH_TOKEN` secret (and its scopes)

`GH_TOKEN` is a Cloudflare **secret**, never committed. It is the single most
important value here: `/intake` uses it to commit to the private data repo, and
`/login` hands it back to authenticated CRM users as their data-access token.

```bash
npx wrangler secret put GH_TOKEN
```

Paste the PAT when prompted.

**Scopes the PAT needs for `/intake` to write to a private repo:**

- **Classic PAT** → tick **`repo`** (the whole top-level scope). `public_repo`
  alone is *not* enough — `rollupceo/polyshares-crm-data` is private.
- **Fine-grained PAT** → resource owner `rollupceo`, repository access limited to
  **`polyshares-crm-data`**, repository permission **Contents: Read and write**
  (Metadata: Read-only is added automatically). Nothing else is needed.

Fine-grained tokens expire; put the expiry in your calendar, because when it lapses
`/intake` starts failing silently from the visitor's point of view.

> Rotating the PAT later is just `npx wrangler secret put GH_TOKEN` again. No
> password resets are needed — see [section 2](#2-crm-auth-gateway-login--signup).

## 1.4 Set `CRM_REPO` and `INTAKE_REP`

These are plain config vars, so they live in [`wrangler.toml`](wrangler.toml) —
there is no `wrangler` command for them. They already carry working defaults:

```toml
[vars]
ALLOWED_ORIGINS = "https://polyshares.com,https://www.polyshares.com"
CRM_REPO = "rollupceo/polyshares-crm-data"
INTAKE_REP = "ryan"
```

- **`CRM_REPO`** — `owner/repo` of the private CRM data repo the lead is written to.
- **`INTAKE_REP`** — **which rep in the CRM owns inbound website leads.** Every lead
  from `/intake` is filed to this rep and shows up in their pipeline. The value must
  match a **directory name under `reps/`** in the data repo, because the Worker
  writes to `reps/<INTAKE_REP>/leads.json`. It should also match an `id` in
  `meta/reps.json` so the CRM actually renders the rep.

  Valid values today: `nathan`, `ryan`, `ryan`, `aaron`, `aaron2`, `efrain`,
  `ignacio`, `ignacio2`, `vante`. Default `ryan` (Austin Turner).

  The Worker strips anything outside `[A-Za-z0-9_-]` from the value. If the
  resulting directory does not exist, **nothing errors** — GitHub just gets a brand
  new `reps/<typo>/leads.json` and the leads vanish into a folder no one opens. Spell
  it correctly.

Changing either var only takes effect on the next `npx wrangler deploy`.

## 1.5 Deploy, and find the workers.dev URL

```bash
npx wrangler deploy
```

The output ends with the deployed URL, in the form:

```
https://polyshares-crm-auth.<your-subdomain>.workers.dev
```

`polyshares-crm-auth` is the `name` in `wrangler.toml`; `<your-subdomain>` is your
account's workers.dev subdomain. If you missed it in the scrollback, it's also at
**Cloudflare dashboard → Workers & Pages → `polyshares-crm-auth` → Settings →
Domains & Routes**.

Quick smoke test — a GET should be rejected, which proves the Worker is live and
routing:

```bash
curl -sS -i https://polyshares-crm-auth.<your-subdomain>.workers.dev/intake
```

Expect `405` with `{"error":"method not allowed"}`. (Optional: map the Worker to
`https://auth.polyshares.com` via a Workers custom domain, and use that origin
everywhere below instead.)

## 1.6 THE STEP PEOPLE FORGET — point `intake.html` at the deployed Worker

**The website does not know the Worker exists until you do this.** Deploying the
Worker alone changes nothing that a visitor can see.

Open [`../intake.html`](../intake.html) and edit **line 227**. Change:

```js
  var ENDPOINT = '';
```

to your deployed origin:

```js
  var ENDPOINT = 'https://polyshares-crm-auth.<your-subdomain>.workers.dev';
```

Rules for that value:

- It is the **origin only**. The page appends `/intake` itself
  (`ENDPOINT.replace(/\/$/,'') + '/intake'`), so writing `.../intake` here produces
  `/intake/intake` → 404.
- **No trailing slash** (a trailing slash is tolerated and stripped, but don't).
- Leaving it `''` is the safe "not deployed" state: the flow shows the recap and
  sends the visitor to Calendly rather than faking a successful submission.

Then commit and push so the live site picks it up:

```bash
git add intake.html && git commit -m "intake: point at deployed Worker" && git push
```

Reload https://polyshares.com/intake **hard** (Cmd-Shift-R) — the old `ENDPOINT: ''`
build is cacheable.

## 1.7 Confirm `ALLOWED_ORIGINS` covers the marketing site

CORS is enforced by the Worker, and it is an **exact string match** on the browser's
`Origin` header. [`wrangler.toml`](wrangler.toml) must contain both hosts:

```toml
ALLOWED_ORIGINS = "https://polyshares.com,https://www.polyshares.com"
```

If the visitor's origin is not in that list, the Worker returns **no**
`Access-Control-Allow-Origin` header. The browser's `OPTIONS` preflight then fails,
the `POST` is never sent, and the visitor sees the "That did not go through"
fallback — **every browser submission fails, even though the Worker is healthy and
curl works fine.** `https://polyshares.com` and `https://www.polyshares.com` are
different origins; both are needed. `http://` and `localhost` are not covered.

Verify the preflight the way a browser does:

```bash
curl -sS -i -X OPTIONS https://polyshares-crm-auth.<your-subdomain>.workers.dev/intake -H 'Origin: https://polyshares.com' -H 'Access-Control-Request-Method: POST' -H 'Access-Control-Request-Headers: content-type'
```

Expect `204` **and** `Access-Control-Allow-Origin: https://polyshares.com` in the
response headers. No such header = CORS will fail in the browser. Fix
`ALLOWED_ORIGINS`, then `npx wrangler deploy` again.

## 1.8 Verify end to end

Post a realistic submission, exactly as the page would:

```bash
curl -sS -i -X POST https://polyshares-crm-auth.<your-subdomain>.workers.dev/intake -H 'Content-Type: application/json' -d '{"firstName":"Dana","lastName":"Whitfield","company":"Whitfield Industrial","email":"dana@whitfieldindustrial.com","website":"https://whitfieldindustrial.com","tools":["Slack or Teams","Gmail or Outlook","CRM (HubSpot, Salesforce)"],"years":"5-10","size":"50-199","rights":"own","qualified":true,"hp":"","page":"intake"}'
```

**Success looks like** HTTP `200` and exactly:

```json
{"ok":true}
```

Nothing else is returned — no lead id, no echo. `hp` must be empty; a non-empty `hp`
is the honeypot and also returns `{"ok":true}` while writing nothing.

**Where the lead lands**, in `rollupceo/polyshares-crm-data` (i.e. `CRM_REPO`):

| File | What gets written |
|---|---|
| `reps/ryan/leads.json` | the lead object, **prepended** as the first element of the array. Commit message `intake: Whitfield Industrial` |
| `reps/ryan/activities.json` | a `note` timeline entry linked to the lead id, also prepended. Commit message `intake activity: Whitfield Industrial` |

Substitute your `INTAKE_REP` for `ryan`. The lead has `st: "New"` (so it appears
in the **New** stage), `in: "Inbound data intake"`, `src: "intake"`, and a `nt` note
summarising qualified/not, years operating, headcount, data rights and tool stack.

Check it from the terminal:

```bash
git -C ../../polyshares-crm-data pull && head -c 400 ../../polyshares-crm-data/reps/ryan/leads.json
```

The activity write is **best-effort**: if `activities.json` fails, the lead still
lands and the endpoint still returns `{"ok":true}`. A missing timeline note is not a
failed submission.

> This is a real write to production data. Delete the test lead from the CRM UI
> afterwards, or use your own details so it's a legitimate record.

Finally, do the browser test — **curl sends no `Origin`, so a passing curl does not
prove the browser path works.** Fill in https://polyshares.com/intake for real and
confirm you land on the "That is *with us.*" screen (not the Calendly fallback), and
that the lead appears in the CRM.

Watch live logs while testing:

```bash
npx wrangler tail
```

## 1.9 Troubleshooting

Note: the Worker deliberately leaks nothing. **Every internal failure — GitHub 403,
GitHub 404, exhausted conflict retries — surfaces to the caller identically, as HTTP
`500` `{"error":"server error"}`.** `npx wrangler tail` is how you tell them apart;
it shows the thrown message (`github read 403`, `github write 404`,
`github write conflict`).

| Symptom | Cause | Fix |
|---|---|---|
| `500 {"error":"server error"}`; tail shows `github read 403` / `github write 403` | PAT lacks write access to the private data repo | Reissue with **`repo`** (classic) or **Contents: Read and write** on `polyshares-crm-data` (fine-grained), then `npx wrangler secret put GH_TOKEN` and redeploy |
| `500`; tail shows `github write 404` | Same root cause wearing a disguise — GitHub returns 404, not 403, for a private repo the token can't see. Or `CRM_REPO` is misspelled | Check `CRM_REPO` in `wrangler.toml`, then check the token scope as above |
| `500`; tail shows `github write conflict` | Four consecutive 409/422s. Two writers hit the same file at once (someone saving in the CRM mid-submission), or the file's `sha` kept going stale | Usually transient — retry. The Worker already retries 4× with 250/500/750 ms backoff. Persistent conflicts point at a permissions problem making the read 404 while the write is rejected |
| Browser console: *"blocked by CORS policy" / "No 'Access-Control-Allow-Origin' header"*; visitor sees the Calendly fallback | The page's origin isn't an exact match in `ALLOWED_ORIGINS` (missing `www`, wrong scheme, or a preview/localhost origin) | Add the exact origin to `ALLOWED_ORIGINS` and **redeploy**. Re-run the OPTIONS check in 1.7. Curl will not reproduce this |
| `429 {"error":"Too many submissions. Try again later."}` | Per-IP cap: **6 successful submissions per rolling hour**, keyed `intake:<ip>` in KV with a 3600 s TTL. Repeated testing from one IP trips it | Wait it out, test from another network, or clear the key: `npx wrangler kv key delete "intake:<ip>" --namespace-id <NS_ID>` |
| `200 {"ok":true}` but no lead anywhere | Honeypot fired — `hp` was non-empty. The Worker returns success and writes nothing, by design | Send `"hp":""`. Real bots stay caught |
| Leads land under the wrong rep, or nowhere | `INTAKE_REP` doesn't match a directory under `reps/`. A wrong value silently **creates** `reps/<wrong>/leads.json` — no error, no visible lead | Fix `INTAKE_REP` in `wrangler.toml`, redeploy, and move any stranded leads out of the bogus directory |
| `400 {"error":"Enter a valid work email."}` or `{"error":"Name and company are required."}` | Payload validation. `email` must match a basic `x@y.tld` shape; `firstName` and `company` must be non-empty | Fix the payload |
| `405 {"error":"method not allowed"}` | You used GET. Every endpoint is POST (plus OPTIONS for preflight) | Use `-X POST` |
| Submissions work in curl but the live page still shows the Calendly fallback | `ENDPOINT` is still `''`, or the change wasn't pushed, or the browser cached the old `intake.html` | Redo **1.6**, push, hard-reload |

---

# 2. CRM auth gateway (login + signup)

This closes the three CRITICAL findings from the 2026-06-21 audit: the credential
files were world-readable on a public repo (#1/#2) and there was no server to
rate-limit guessing (#3). The store moves into private KV, passwords are verified
server-side, and failures are counted per-email and per-IP with a 15-minute lockout.

Steps 1.1–1.3 and 1.5 above are shared — do those first. Then:

## 2.1 Rotate the GitHub PAT

At github.com, revoke the current token and issue a fresh one with the scopes in
1.3. Call it `NEW_TOKEN`. This also neutralises the old token sitting in git history
(audit HIGH finding). Set it with `npx wrangler secret put GH_TOKEN`.

## 2.2 Seed the credential store

**Recommended — verbatim (zero downtime, no password resets):**

```bash
node seed.mjs --verbatim
```

```bash
npx wrangler kv key put logins --path kv-logins.json --namespace-id <NS_ID>
```

```bash
npx wrangler kv key put signup --path kv-signup.json --namespace-id <NS_ID>
```

```bash
rm kv-logins.json kv-signup.json
```

Delete those files — they hold credential blobs.

This works even though you just rotated the PAT. The Worker uses each blob only to
**verify the password** (it still decrypts with everyone's *current* password) and
then hands the browser the `GH_TOKEN` secret — your new token — instead of the stale
value inside the blob. Everyone keeps their password, gets the new token, and the
old token baked into the blobs becomes a dead value. Nobody is locked out.

**Alternative — `--rekey`**, only if you *want* fresh passwords everywhere. It
prints a temp password per user plus a new team signup code to distribute, then the
same two `wrangler kv key put` commands:

```bash
node seed.mjs --rekey --token "NEW_TOKEN"
```

## 2.3 Point the CRM at the gateway — the `CRM_GATEWAY` flag

The CRM app now lives at [`../internal/crm.html`](../internal/crm.html) (the
top-level `crm.html` is just a redirect stub to `/internal/crm`). Set the flag on
**line 418**:

```js
const CRM_GATEWAY = 'https://polyshares-crm-auth.<your-subdomain>.workers.dev';
```

Left as `''`, the CRM keeps using the legacy public-file path — so it is safe to
commit and deploy the CRM changes *before* the Worker exists, then flip this on.
Commit and push, and let the host redeploy.

## 2.4 Remove the public credential files

Once login and signup both work through the gateway:

```bash
git rm crm-logins.json crm-signup.json && git commit -m "crm: move credentials behind auth gateway" && git push
```

## 2.5 Verify the gateway

- Wrong password a handful of times → `Too many attempts. Try again in 15 minutes.`
  (8 fails per email or 30 per IP in a 15-minute sliding window).
- The old public blob is gone:

```bash
curl -sS -o /dev/null -w '%{http_code}\n' https://raw.githubusercontent.com/rollupceo/polyshares-com/main/crm-logins.json
```

Expect `404`.

- Sign in, change password, admin add/reset/remove user, rotate signup code — all
  still work.

---

# 3. Hosting on Cloudflare Pages → activates security headers (free)

Independent of the Worker; do it in either order. The site stays identical, only
where it's served from changes. The [`_headers`](../_headers) file (CSP, HSTS,
X-Frame-Options, etc.) starts working automatically on Pages — GitHub Pages ignores
it.

1. Sign in at https://dash.cloudflare.com (free account, no card).
2. **Workers & Pages → Create → Pages → Connect to Git** → pick `rollupceo/polyshares-com`.
3. Build settings: Framework preset **None**, build command **(blank)**, output dir **`/`**. Deploy.
4. **Custom domains** → add `polyshares.com` and `www.polyshares.com`. Cloudflare
   walks you through pointing the domain's DNS at it.
5. Verify the headers once live:

```bash
curl -sI https://polyshares.com | grep -i 'content-security\|x-frame\|strict-transport\|x-content-type'
```

6. Then turn **GitHub Pages off** in the GitHub repo settings, to avoid two live copies.

---

# What this does and does not solve

| Audit finding | Status |
|---|---|
| #1/#2 public credential files | **Fixed** — store is private in KV, no downloadable blob |
| #3 no rate limiting / lockout | **Fixed** — per-email + per-IP lockout in the Worker |
| Old PAT in git history | **Fixed** by the rotation in 2.1 (old token is dead) |
| Missing security headers | **Fixed** by section 3 (`_headers` honored on Pages) |
| PBKDF2 310k → 600k | Already done in the CRM |
| Website intake had nowhere to store leads | **Fixed** by section 1 — `/intake` writes straight into the CRM data repo |
| Shared single PAT (one token = all data) | **Not changed** — still one token; it now lives behind the gateway instead of in a public file. Per-rep tokens would be a larger re-architecture |
| Gmail OAuth client restriction | **Manual** — restrict to `polyshares.com` in Google Cloud Console |
| GA4 placeholder ID | **Manual** — provide the real `G-` id |

# Dhamantaha website

The warranty wallet as a website, with its own design and separate pages. A visitor adds a photo or PDF of a receipt, The Ring reads it, and the site counts down the days left on every warranty and return window. English and Arabic (true right-to-left), light and dark.

This folder is self-contained and separate from the Android app in [`../app/`](../app/README.md). Both use the same analysis API and the same warranty rules, but each has its own interface and keeps its own receipts: nothing is synced between the website, the app, or two browsers.

## Pages

| Address | Page |
| --- | --- |
| `/` | Home: what it does, how it works, privacy, quick answers. Shows a summary of the wallet once there are receipts. |
| `/receipts` | My receipts: search, filter (active, ending soon, expired, not read yet), sort, summary tiles. Filter and sort live in the address. |
| `/receipts/:id` | One receipt: store details, each product with its warranty countdown, return and exchange windows, the original file, edit, analyze again, delete, item photos, warranty terms and a plain-language coverage summary. |
| `/add` | Add a receipt: drop a file, choose one, or take a photo on a phone. Save only, or save and analyze. |
| `/settings` | Theme, language, price display, the access key, storage use, delete everything. |
| `/how-it-works`, `/privacy`, `/help` | Information pages. |

## Run it

```bash
cd website
npm ci
npm run dev      # http://localhost:5173
npm test
npm run build    # dist/
```

`npm run dev` forwards `/v1` to The Ring (`https://dhamantaha.arc-homlab.com`), the same way the deployed web server does, so the browser only ever talks to its own address. To try the site without spending analysis quota, run a Ring locally with the mock provider (see [`../infrastructure/README.md`](../infrastructure/README.md)) and point the dev server at it:

```powershell
$env:RING_URL = 'http://127.0.0.1:3100'; npm run dev
```

Reading a receipt needs an access key: enter one in **Settings** (any of the `CLIENT_KEYS` The Ring accepts; ask the team). It is kept only in that browser. Adding, browsing, editing and deleting receipts works without one.

## How the site reaches The Ring

The browser never calls The Ring's public address. The site's own nginx forwards `/v1/*` (and nothing else) to the API container over Docker's network, so there is no cross-origin request, `CORS_ORIGINS` on The Ring does not need to know the site's address, and the same build works on any hostname. The admin dashboard and API docs are not reachable through the website.

## Where data lives

- **In the visitor's browser (IndexedDB):** original files, analysis results, item photos, warranty documents, edits. Identical files are detected by their SHA-256 and saved once.
- **Preferences and the access key (localStorage):** language, theme, price display, key.
- **Sent to The Ring:** one file, only when Analyze or Explain coverage is pressed. See the Privacy page.

Browser storage can be cleared by the visitor or, on low storage, by the browser. Settings offers to ask the browser to keep the data, and an original can always be downloaded from its receipt page. There is no offline mode (no service worker) yet.

## Deploying on The Ring

```bash
npm run deploy:ring
```

This builds the site, copies it to `~/dhamantaha/website` on The Ring over `ssh ring`, builds the container in its own Compose project (`dhamantaha-website`, separate from the API's `dhamantaha`), starts it, waits for it to be healthy and runs nine checks. `--skip-build` reuses `dist/`; `--check` only runs the checks. The previous image stays tagged `dhamantaha-website:previous`; to roll back, retag it as `latest` and run `docker compose -p dhamantaha-website -f compose.ring.yaml up -d` on The Ring.

The container is nginx (unprivileged, read-only filesystem, no capabilities, 128 MB) published on **`127.0.0.1:3101`** only. To make it public, add a Cloudflare Tunnel hostname (Zero Trust → Networks → Tunnels → the Ring tunnel → Public hostname) with **Service `HTTP` · `localhost:3101`**. Use a hostname other than `dhamantaha.arc-homlab.com`, which already points at the API, and keep it **one level** under `arc-homlab.com` (for example `dhamantaha-web.arc-homlab.com`): Cloudflare's free certificate covers `arc-homlab.com` and `*.arc-homlab.com` only, so a two-level name such as `web.dhamantaha.arc-homlab.com` has no certificate and every HTTPS request fails during the TLS handshake. The tunnel is managed in the Cloudflare dashboard (cloudflared on The Ring runs from a token), so the hostname is added there, not in a file on The Ring. Until then, preview it from this computer:

```bash
ssh -N -L 3101:127.0.0.1:3101 ring    # then open http://localhost:3101
```

`nginx/default.conf` serves the pages (page addresses fall back to the app, `/assets/*` is cached for a year, the page itself is never cached) and sets the security headers in `nginx/headers.inc`, including a Content-Security-Policy that only allows scripts from the site itself. `test/deploy-config.test.js` guards these settings.

## Layout

```
src/
  main.jsx, App.jsx        entry, routes, page frame
  pages/                   one file per page
  components/              header, footer, dialog, warranty meter, status pill, edit dialog, item attachments
  state/                   settings (language, theme, key), wallet (receipts and The Ring), toasts
  lib/                     logic without any screen code (see below)
  i18n/                    English and Arabic messages, one file per area
  styles/                  tokens, base, layout, components, pages
nginx/                     web server settings for the container
scripts/deploy-ring.mjs    build, copy, start, check
test/                      node --test
```

`src/lib/` holds the rules the app uses too: `api.js` (The Ring client), `wallet-view.js` and `countdown.js` (warranty dates and countdowns), `format.js` and `policy-labels.js` (Arabic and English wording), `receipt-store.js` (browser storage). They are copies of the app's modules, kept here so the two folders stay independent. **If a rule changes in one, change it in the other**; each copy has its own tests. `test/i18n.test.js` fails when a message exists in only one language or the code asks for a message that does not exist, and `test/jsx-identifiers.test.js` fails when a component is used without being imported.

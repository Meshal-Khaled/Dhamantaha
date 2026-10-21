# Deploying on The Ring

## Deployment status — 20 October 2026

- 21 October 2026: split `/dashboard/api-monitoring` from `/dashboard/users`; the legacy `/dashboard/monitoring` redirects to API monitoring. Users has persistent totals and per-install refetches, visits, receipt analysis attempts and original-file downloads. Existing counters migrate without losing reopens/downloads. The app sends its anonymous install ID with analysis requests; the server counts receipt uploads once regardless of provider retries and excludes warranty explanation calls. Visits use 30-minute sessions and deduplicate lifecycle callbacks. Backup: `../backups/pre-users-monitoring-20261021-144052`; rollback image: `dhamantaha-infrastructure:pre-users-monitoring-20261021-144052`. The existing runtime/dependencies and active provider were preserved. All 148 backend and 46 app tests passed, the release-image suite passed, and the updated APK built and installed with `adb install -r`, retaining all four original receipt files and the local database. Live browser navigation, separate authenticated metrics, and the first phone visit were verified. No synthetic production user events or receipt analyses were sent.

- 21 October 2026: deployed provider management to the Dhamantaha control panel on port 3100. Add provider uses The Ring's built-in upstream API roots; Custom providers accepts a public HTTPS Chat Completions endpoint. Profiles persist privately, support key/model checks, and activate separately from saving. The existing Gemini profile and fallback chain remain active. All 146 backend tests passed locally and the full suite passed inside the release image. Authenticated live settings and the existing Gemini key/model check passed; provider.json was byte-for-byte unchanged by deployment. Backup: `../backups/pre-provider-panel-20261021-140536`; rollback image: `dhamantaha-infrastructure:pre-provider-panel-20261021-140536`. The release reuses the prior runtime and dependencies. The Ring's separate admin page on port 8787 was restored to its original source and image after an initial scope misunderstanding.

- 21 October 2026, 14:06 (Asia/Riyadh): deployed item icon hints, optional quoted warranty coverage in receipt payloads, and `POST /v1/warranty/explain` for an item's attached terms. Backup: `../backups/pre-warranty-coverage-20261021-105858`; rollback image: `dhamantaha-infrastructure:pre-warranty-coverage-20261021-105858`. All 135 backend tests passed inside the new image before the first restart; a final quotation-boundary refinement passed all five focused coverage tests before a second restart. The public health and OpenAPI endpoints return 200. Live synthetic receipt analysis returned `icon: laptop` plus covered/excluded points with quotes. A synthetic terms PDF sent through the installed phone app returned covered, excluded, and unclear points, which survived reopening. Product photos stay local; only the chosen terms document is sent by Explain coverage. Existing bounded, admin-only in-memory payload capture also supports this endpoint.

- 21 October 2026, 16:39 (Asia/Riyadh): deployed user monitoring: `POST /v1/usage` (same client key) counts saved-receipt reopens and original downloads per anonymous install, shown on the Monitoring page and saved in `../state/usage.json`. Backup: `../backups/pre-user-usage-20261021-133839`; rollback image: `dhamantaha-infrastructure:pre-user-usage-20261021-133839`. All 136 backend tests passed inside the new image before the restart. Public health, OpenAPI (lists `/v1/usage`) and dashboard return 200, and an unauthenticated report gets 401. No test report was sent, so the live counters start at 0.

- Installed at `/home/ubuntu/dhamantaha/infrastructure` on The Ring.
- Container: `dhamantaha-infrastructure-1`; Compose project: `dhamantaha`.
- Private dashboard: `/dashboard/api-settings`, `/dashboard/api-monitoring`, and `/dashboard/users`. The root redirects to API settings; the old `/dashboard/monitoring` redirects to API monitoring. Sign in with the existing Ring admin key; sessions use an HttpOnly SameSite cookie.
- Client base URL: `https://dhamantaha.arc-homlab.com/v1`, with `POST /receipts/analyze` and `GET /health` relative to it. The legacy `/health` remains available.
- The Ring override mounts the existing admin key read-only and the private `../state` directory at `/app/state`. Only provider settings and service-specific credentials are persisted there, with owner-only file permissions. Blank keys keep the current value; the dashboard never returns saved provider keys. Switching back to the Ring key removes the service-specific override.
- Monitoring stores up to 60 recent request metadata entries and one hour of activity buckets in memory. Counters and sessions reset on restart. No receipt files, text, or analysis results enter these counters.
- **Payload capture** (`DEBUG_CAPTURE`, on by default, switchable on the Monitoring page): the Show button on each recent request opens what the request received, what went to Gemini (receipt text, or a small photo preview), Gemini's raw answer, and what was sent back, with a Copy button. These payloads contain receipt contents. They stay in process memory only (last 60 requests, 60 minutes), are never logged or written to disk, and are erased when the switch is turned off or the container restarts. Set `DEBUG_CAPTURE=false` to start with it off.
- Healthy on `127.0.0.1:3100`. Port `3000` is free.
- Always pass `-p dhamantaha` to `docker compose`. Without it, Compose names the project after the folder (`infrastructure`), builds a second image, and starts a second container that competes for port 3100.
- The Ring copy is not a Git checkout. To update: back up the folder to `../backups/pre-<change>-<time>`, tag the running image (`docker tag dhamantaha-infrastructure:latest dhamantaha-infrastructure:pre-<change>-<time>`), copy the changed files, run `docker compose -p dhamantaha -f compose.yaml -f compose.ring.yaml build`, run the tests in the new image (`docker run --rm -e NODE_ENV= -v "$PWD/test:/app/test:ro" -v "$PWD/scripts:/app/scripts:ro" dhamantaha-infrastructure:latest node --test "test/**/*.test.js"`), then `up -d`. To roll back, retag the saved image as `latest` and run `up -d` again.
- 20 October 2026, 20:24 (Asia/Riyadh): deployed structured receipt output (`displayName`, `category`, `branchName`, `customerServicePhone`, `returnPolicy`, `warranty.provider`). Backup `../backups/pre-clean-names-20261020-202239`, image tag `pre-clean-names-20261020-202239`. A live Gemini analysis of a synthetic receipt returned every new field.
- Server uses `gemini-3.1-flash-lite` and a read-only mount of the existing Gemini key. Client access tokens are in the private server `.env` and are not shown in logs or committed.
- `/health`, `/docs/`, and `/openapi.json` respond successfully. Missing client tokens are rejected with `401`. All 101 automated tests pass, including dashboard authentication, settings persistence, live reconfiguration, and monitoring privacy.
- Live Gemini analysis returned provider `503 UNAVAILABLE` (high demand); successful receipt extraction is not yet verified.
- The public hostname is routed through the existing tunnel to `http://localhost:3100`. The dashboard renders publicly in a browser, and an API client outside The Ring receives `200` from `/v1/health`.

Puts the infrastructure at **https://dhamantaha.arc-homlab.com** through the same Cloudflare Tunnel that serves `ring.arc-homlab.com`.

```
Phone ──HTTPS──▶ Cloudflare (dhamantaha.arc-homlab.com) ──tunnel──▶ cloudflared on The Ring ──▶ 127.0.0.1:3100 (container)
```

Cloudflare handles HTTPS, which Android requires, and your home IP is never exposed. The Gemini key lives in one file on The Ring and never leaves it.

## 1. Get the code onto The Ring

The `infrastructure` branch must be committed and pushed first. On The Ring:

```bash
git clone --branch infrastructure https://github.com/Meshal-Khaled/Dhamantaha.git ~/dhamantaha
cd ~/dhamantaha/infrastructure
```

If the repository is private, clone with a GitHub deploy key or a token. Later updates are `git pull` followed by step 3.

## 2. Place the API keys

For this Ring deployment, reuse the Gemini key already managed at `ring.arc-homlab.com`.
`compose.ring.yaml` mounts `/home/ubuntu/magic/keys/gemini.key` read-only as
`/run/secrets/gemini_api_key`. The backend reads it through `GEMINI_API_KEY_FILE`;
the provider key is not copied to the laptop, Git, or the app. Keep `GEMINI_API_KEY`
empty when using the mounted key. Set `GEMINI_MODEL` in the server's private `.env`.
After replacing the key in the Ring dashboard, recreate this container to load it:

```bash
docker compose -p dhamantaha -f compose.yaml -f compose.ring.yaml up -d --force-recreate
```

The `.env` also holds client access tokens, `PORT=3100`,
`TRUST_PROXY=loopback,uniquelocal`, and `GEMINI_TIMEOUT_MS=40000`.
Port 3000 remains free. For a separate installation with its own provider key,
the interactive setup below remains available.

Run the setup command in `infrastructure/`. If Node.js is installed on The Ring:

```bash
npm run setup
```

If The Ring has only Docker, run the same command in a throwaway Node container:

```bash
docker run --rm -it --user "$(id -u):$(id -g)" -v "$PWD":/app -w /app node:24-slim node scripts/setup-env.js
```

It asks for:

1. **Gemini API key**: create one in [Google AI Studio](https://aistudio.google.com/apikey). Typing is hidden; paste and press Enter.
2. **Gemini model ID**: a current model with image and PDF input; see the [model list](https://ai.google.dev/gemini-api/docs/models).

It then writes `infrastructure/.env` (owner read/write only, ignored by Git), with settings already tuned for the tunnel. It also prints two new **app keys** once:

| Key | Use |
| --- | --- |
| `android` | The Android app sends it as `X-Client-Key`. It goes into the app's build config (for example a `.env` that isn't committed), never into Git. |
| `web-test` | For you, in the browser at `/docs` (**Authorize**) or with `npm run smoke`. |

Save both in a password manager. Running `npm run setup` again keeps every current value when you press Enter. Add `--new-client-keys` to replace the app keys.

Also in Google AI Studio / Google Cloud: set a budget alert or quota for the key. The server's `DAILY_PROVIDER_CALL_LIMIT` (500 calls per day by default) is a second safety net.

## 3. Start it

```bash
docker compose -p dhamantaha -f compose.yaml -f compose.ring.yaml up -d --build
docker compose -p dhamantaha -f compose.yaml -f compose.ring.yaml ps  # wait for "healthy"
curl -s http://127.0.0.1:3100/health      # "provider":"gemini","clientKeyRequired":true
```

The container runs read-only and as a non-root user, and it listens only on `127.0.0.1:3100`, so nothing on your network reaches it except through the tunnel. After changing `.env`, apply the change with `docker compose -p dhamantaha -f compose.yaml -f compose.ring.yaml up -d --force-recreate`. Use only the base `compose.yaml` for installations with their own inline key and no Ring key mount.

## 4. Point the subdomain at it

In the Cloudflare dashboard, go to **Zero Trust → Networks → Tunnels**, open the tunnel that serves `ring.arc-homlab.com`, and add a **public hostname** (newer dashboards call it a *published application route*):

| Field | Value |
| --- | --- |
| Subdomain | `dhamantaha` |
| Domain | `arc-homlab.com` |
| Path | *(empty)* |
| Service | `HTTP` · `localhost:3100` |

Cloudflare creates the DNS record for you. If `cloudflared` runs **in Docker** rather than on the host, `localhost` points to the cloudflared container itself. In that case:

- use `http://host.docker.internal:3100` (Docker Desktop), or
- put both on one network and use `http://infrastructure:3100`. Add this to `compose.yaml`, using your cloudflared network's name:

  ```yaml
  services:
    infrastructure:
      networks: [default, tunnel]
  networks:
    tunnel:
      external: true
      name: cloudflared   # the network your cloudflared container is on
  ```

If your tunnel is managed locally with a `config.yml` instead of the dashboard, add this rule above the final catch-all:

```yaml
ingress:
  - hostname: dhamantaha.arc-homlab.com
    service: http://localhost:3100
  # ...existing rules, ending with: - service: http_status:404
```

Then run `cloudflared tunnel route dns <tunnel-name> dhamantaha.arc-homlab.com` and restart cloudflared.

## 5. Cloudflare settings for an app API

- **No Cloudflare Access login on the API.** The app can't complete a login page. If you want `/docs` private, add an Access application for the paths `dhamantaha.arc-homlab.com/docs*` and `/openapi.json` only. Or set `ENABLE_API_DOCS=false` once testing is done.
- **Turn off Bot Fight Mode for this hostname,** or add a WAF skip rule. Its challenges block requests from the app.
- **Optional extra layer:** a Cloudflare rate-limiting rule on `/v1/receipts/analyze`.
- Caching needs no change: every response is `no-store`, and uploads are POST requests.

Cloudflare decrypts traffic at its edge, so receipts pass through it in transit. Cloudflare doesn't store request bodies by default.

## 6. Check it from outside

```bash
curl -s https://dhamantaha.arc-homlab.com/health
```

In a browser, open https://dhamantaha.arc-homlab.com/docs, click **Authorize**, paste the `web-test` key, and run **POST /v1/receipts/analyze → Try it out** with a real receipt. From a computer with the repository:

```bash
npm run smoke -- test-receipts/receipt.jpg --url https://dhamantaha.arc-homlab.com --key <web-test key>
```

Then give the frontend developer the base URL `https://dhamantaha.arc-homlab.com` and the `android` key. `CORS_ORIGINS=https://localhost` already allows the Capacitor Android app.

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| Cloudflare `502` / `1033` | Container is down, or the tunnel's service address is wrong (see step 4). Check `docker compose ps`. |
| Cloudflare `524` | A request ran over Cloudflare's 100 s limit; lower `GEMINI_TIMEOUT_MS` (setup uses 40000). |
| `401 unauthorized_client` | Missing or wrong `X-Client-Key`. |
| Everyone gets `429 rate_limited` | `TRUST_PROXY` is not `loopback,uniquelocal`, so every request looks like it comes from cloudflared. |
| `/health` shows `"provider": null` | Key or model is missing in `.env`; rerun `npm run setup`, then `docker compose up -d --force-recreate`. |
| `502 analysis_unavailable` | Gemini rejected the key or model. Logs show the category: `docker compose logs --tail 50`. |

## Presentation capacity — 21 October 2026

Use `docker compose -p dhamantaha -f compose.yaml -f compose.ring.yaml -f compose.presentation.yaml up -d` to reproduce the presentation settings: 12 concurrent analyses, 120 requests/minute/IP, 2 GiB memory. The daily budget remains 500 provider calls. New requests rotate their starting Gemini key; each retains the complete existing fallback chain. The API and website containers remain separate, with one API process owning persistent usage/provider state.

All 150 backend tests pass locally and in the release image, including 30 concurrent simulated requests split evenly across three keys. Public health and both containers verified healthy. This is not a live 30-upload load test. Primary-model probes returned 503 on all keys; fallback probes returned text on keys 1/2 and an empty successful response on key 3 with a small token limit. Gemini quotas apply per project, so three keys do not prove three independent quota pools. Backup: `../backups/pre-presentation-20261021-160052`; rollback image: `dhamantaha-infrastructure:pre-presentation-20261021-160052`. To roll back, restore the backed-up infrastructure folder and previous image, then run the original two-file Compose command. Keep current state/ intact.

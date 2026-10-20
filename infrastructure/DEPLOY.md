# Deploying on The Ring

Puts the infrastructure at **https://dhamantaha.arc-homlab.com** through the same Cloudflare Tunnel that serves `ring.arc-homlab.com`.

```
Phone ──HTTPS──▶ Cloudflare (dhamantaha.arc-homlab.com) ──tunnel──▶ cloudflared on The Ring ──▶ 127.0.0.1:3000 (container)
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
docker compose up -d --build
docker compose ps                         # wait for "healthy"
curl -s http://127.0.0.1:3000/health      # "provider":"gemini","clientKeyRequired":true
```

The container runs read-only and as a non-root user, and it listens only on `127.0.0.1:3000`, so nothing on your network reaches it except through the tunnel. After changing `.env`, apply the change with `docker compose up -d --force-recreate`.

## 4. Point the subdomain at it

In the Cloudflare dashboard, go to **Zero Trust → Networks → Tunnels**, open the tunnel that serves `ring.arc-homlab.com`, and add a **public hostname** (newer dashboards call it a *published application route*):

| Field | Value |
| --- | --- |
| Subdomain | `dhamantaha` |
| Domain | `arc-homlab.com` |
| Path | *(empty)* |
| Service | `HTTP` · `localhost:3000` |

Cloudflare creates the DNS record for you. If `cloudflared` runs **in Docker** rather than on the host, `localhost` points to the cloudflared container itself. In that case:

- use `http://host.docker.internal:3000` (Docker Desktop), or
- put both on one network and use `http://infrastructure:3000`. Add this to `compose.yaml`, using your cloudflared network's name:

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
    service: http://localhost:3000
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

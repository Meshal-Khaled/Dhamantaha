# Dhamantaha infrastructure

The private control room is at `/` (API settings) and `/dashboard/monitoring`.
Sign in using the existing Ring admin key. The app API base URL is
`https://dhamantaha.arc-homlab.com/v1`; analysis is `POST /receipts/analyze` relative to it.
Dashboard settings apply immediately and persist on The Ring. Operational monitoring is
held in memory; no customer receipt data is saved.

The foundation behind Dhamantaha (ضمنتها). It takes a photo or PDF of a bill, has Gemini read it, and returns wallet-ready receipt and warranty data for the Android app to save on the phone. It runs on The Ring and stores no customer data.

```
Android app ──HTTPS──▶ The Ring: POST /v1/receipts/analyze
                         ├─ checks: rate limit · client key · daily budget · concurrency · size/type
                         ├─ photo → rotate, shrink, strip EXIF/GPS → Gemini (visual)
                         ├─ PDF with text → extracted text → Gemini (text)
                         ├─ scanned/mixed PDF → Gemini (visual PDF)
                         └─ validate every field → compute warranty expiry/status → JSON
Android app ◀── wallet-ready draft ── user reviews ── saved on the phone
```

- API contract for the app: [API.md](API.md), also live at `/docs` on a running server.
- Deploying on The Ring at dhamantaha.arc-homlab.com: [DEPLOY.md](DEPLOY.md).
- Plan and background: [../Meshal-Plan.md](../Meshal-Plan.md).

## Quick start (browser testing, no Gemini key needed)

```bash
cd infrastructure
npm install
cp .env.example .env
```

Set `ANALYSIS_PROVIDER=mock` in `.env`, then:

```bash
npm start
```

Open http://127.0.0.1:3100/docs, choose **POST /v1/receipts/analyze → Try it out**, pick a photo or PDF, and click **Execute**. The mock still runs every real check and preparation step; only the AI answer is a fixed sample.

To use Gemini instead, set `ANALYSIS_PROVIDER=gemini`, `GEMINI_API_KEY`, and `GEMINI_MODEL` in `.env`. Then check real receipts from the command line:

```bash
npm run smoke -- test-receipts/receipt.jpg
```

Keep sample receipts in `test-receipts/`, which `.gitignore` excludes because receipts contain personal data.

## Configuration

All settings are environment variables; [.env.example](.env.example) documents each one. The main ones:

| Variable | Default | Purpose |
| --- | --- | --- |
| `HOST` / `PORT` | `127.0.0.1` / `3100` | Loopback by default, so paid analysis is never exposed by accident. |
| `CORS_ORIGINS` | none | Browser origins allowed, e.g. `https://localhost` for Capacitor Android. |
| `CLIENT_KEYS` | none | Optional `name:key` list. When set, requests need `X-Client-Key`. |
| `ANALYSIS_PROVIDER` | `gemini` | `mock` for app development without provider calls. |
| `GEMINI_API_KEY` / `GEMINI_MODEL` | — | Server-side only. |
| `RATE_LIMIT_PER_MINUTE` | `10` | Per IP address. |
| `DAILY_PROVIDER_CALL_LIMIT` | `500` | Gemini calls per UTC day; `0` turns the cap off. |
| `MAX_CONCURRENT_ANALYSES` | `4` | Extra requests get `503 server_busy` before their upload is read. |
| `MAX_IMAGE_BYTES` / `MAX_PDF_BYTES` / `MAX_PDF_PAGES` | 20 MB / 10 MB / 10 | Upload limits. |
| `ENABLE_API_DOCS` | `true` | Serve `/docs` and `/openapi.json`. Turn off in production if not needed. |

Invalid settings stop the server at startup with a message naming the variable.

## How it keeps receipts safe

- **Nothing on disk.** Uploads are parsed into memory (multer memory storage), images are processed in memory (sharp, with its cache disabled), and PDFs are read in memory (pdf.js). The Docker setup runs with a read-only filesystem to prove it.
- **Photos are cleaned before Gemini sees them.** Orientation is applied, the photo is shrunk to `IMAGE_MAX_DIMENSION`, and it is re-encoded as JPEG without EXIF, so GPS, device, and owner tags are removed. Exception: HEIC/HEIF photos from Android's "high efficiency" mode can't be decoded by sharp's prebuilt build, so they go to Gemini unchanged, metadata included. Apps can avoid this by uploading JPEG (Capacitor's camera plugin returns JPEG by default).
- **Logs are metadata only:** request ID, path, status, duration, file type, processing method, page count, client name, and failure category. Never file contents, extracted text, results, headers, or keys.
- **Provider errors are never forwarded.** Clients get fixed, safe messages.
- **Cost and abuse limits** run before an upload is read: rate limit → client key → daily budget → concurrency.
- **Disconnects are handled.** If the phone disconnects, the Gemini call is aborted and the slot is freed.
- **Gemini's output is never trusted as-is.** Dates must be real calendar dates, currencies ISO codes, and warranty lengths whole numbers. A warranty claim without quoted receipt text is dropped. Every response is checked against the published contract before it is sent.

Gemini's own processing and retention of receipts depend on Google's API terms and settings, not on this service.

## Tests

```bash
npm test
```

There are 101 tests, using a fake provider, so no Gemini calls are made. They cover receipt processing, limits and errors, privacy, the API contract, warranty rules, setup, mounted keys, per-call budget enforcement, dashboard authentication, private persistent settings, immediate provider updates, and bounded monitoring metadata.

## Deploying on The Ring

**Step by step: [DEPLOY.md](DEPLOY.md).** It covers placing the API keys with `npm run setup`, starting the container, and publishing `https://dhamantaha.arc-homlab.com` through The Ring's Cloudflare Tunnel.

The short version, on The Ring:

```bash
npm run setup                  # asks for the Gemini key (hidden) and model; writes a private .env
docker compose -f compose.yaml -f compose.ring.yaml up -d --build
# Read-only container on 127.0.0.1:3100, using the Gemini key already on The Ring.
```

Then add the tunnel public hostname `dhamantaha.arc-homlab.com` → `http://localhost:3100`.

The Ring override mounts its existing dashboard-managed Gemini key read-only through
`GEMINI_API_KEY_FILE`. Keep `GEMINI_API_KEY` empty for this deployment. Recreate
the backend container after replacing that key. Port `3000` remains free.

[compose.yaml](compose.yaml) runs the service as a non-root user with a read-only root filesystem, a small in-memory `/tmp`, a 768 MB memory cap, and no Linux capabilities. Cloudflare provides the HTTPS that Android requires.

Before the Android app ships to real users, decide on caller authorization stronger than client keys, for example per-install tokens or Play Integrity. A key built into the app can be extracted.

## Phone testing on your network

Run with `HOST=0.0.0.0` and `ANALYSIS_PROVIDER=mock`, then open `http://<computer-ip>:3100/docs` on the phone's browser. Anyone on that network can reach the service while it's bound this way. A Capacitor build needs HTTPS, or a debug network-security config that allows cleartext to that address.

## Layout

```
src/
  server.js, app.js, config.js, logger.js, errors.js
  http/        request IDs + logs, security headers + CORS, protection (rate, key, budget,
               concurrency), upload, receipts route, error handler
  intake/      file type detection, photo preparation, PDF reading
  analysis/    path selection + fallback, prompts, field-level validation
  contracts/   Zod schemas: Gemini output shape, API responses (also feed /openapi.json)
  providers/   Gemini, mock, budget wrapper
  wallet/      warranty rule shared with the app
  docs/        OpenAPI document
scripts/setup-env.js   create or update the private .env on The Ring (npm run setup)
scripts/smoke.js       send a real receipt to a running server
test/              node:test suites
```

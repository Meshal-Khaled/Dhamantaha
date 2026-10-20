# Updates

## Rules

- Keep this file as a chronological, append-only log. Do not delete, replace, or rewrite earlier entries.
- Add a new entry for every update.
- Include the date and time, the tool used (for example, Codex, Claude Code, or OpenCode), the developer's name, and a brief description of the change.

## Entry format

`YYYY-MM-DD HH:MM 

**Update:** <brief description of the change>

# Tool: <tool name> — Developer: <developer name>`

## Example

# 2026-10-20 00:09 

**Update:** Added a search field to the resources page.

# Tool: Codex — Developer: Meshal Khaled`

## 2026-10-20 00:53 (Asia/Riyadh)

**Update:** Revised Meshal-Plan.md to use The Ring cloud instance as the analysis relay with server-only provider API keys, no permanent customer data on The Ring, device-local receipt and warranty storage, and an updated API contract and acceptance checks.

Tool: Codex — Developer: Meshal Khaled

## 2026-10-20 01:27 (Asia/Riyadh)

**Update:** Built the backend relay MVP in `backend/` following Meshal-Plan.md steps 1–3, plus the debug-page version of step 4. It is a Node.js/Express server with `GET /health` and `POST /receipts/analyze`. Uploads stay in memory and are identified by their contents, with size, PDF-page, and concurrency limits. Gemini analysis follows the `image`, `pdf_text`, and `pdf_visual` paths, and validation of the AI response rejects invented warranty terms. The relay also includes consistent errors, metadata-only logs, and an opt-in mock provider. A debug HTML page saves, edits, and deletes records in browser IndexedDB. Also added 70 automated tests, `.env.example`, a setup README, a draft API contract (`backend/API.md`) for the frontend, and a root `.gitignore`. Not yet run against the live Gemini API or deployed to The Ring; caller authorization and rate limits are still to be decided.

Tool: Claude Code — Developer: Meshal Khaled

## 2026-10-20 10:53 (Asia/Riyadh)

**Update:** Created the local `infrastructure` branch from `main` for Meshal's backend work, which will be rebuilt there as the infrastructure. `main` is reserved for the full app after the infrastructure and frontend branches are merged. Permanently deleted the uncommitted `backend/` folder and its `.claude/launch.json` preview config so the rebuild starts from scratch. The root `.gitignore` is kept.

Tool: Claude Code — Developer: Meshal Khaled

## 2026-10-20 10:57 (Asia/Riyadh)

**Update:** Split the project into one folder per branch using Git worktrees. `Desktop\Dhamantaha` stays on `main`, and the new `Desktop\Dhamantaha-infrastructure` holds the `infrastructure` branch. Committed the shared plan documents on `main` (Meshal-Plan.md, Mazen-Plan.md, `.gitignore`, this log, and the removal of the empty Plan.md), then fast-forwarded `infrastructure` to match so both folders start from the same documents.

Tool: Claude Code — Developer: Meshal Khaled

## 2026-10-20 11:36 (Asia/Riyadh)

**Update:** Built the receipt-to-wallet infrastructure in `infrastructure/` on the `infrastructure` branch (Node.js + Express; the wallet stays on the phone). `POST /v1/receipts/analyze` accepts JPEG, PNG, WebP, HEIC/HEIF, AVIF, and PDF, detected from the file's bytes. Photos are rotated, shrunk, and stripped of EXIF/GPS in memory before Gemini sees them. PDFs use their embedded text, or visual analysis for scanned and mixed pages. Gemini's answer is validated field by field and becomes wallet-ready items with warranty expiry and status; a shared, dependency-free warranty rule (`src/wallet/warranty.js`) lets the app recalculate after edits. Requests pass a per-IP rate limit, optional client keys, a daily Gemini call budget, and a concurrency cap before their upload is read. Logs are metadata only and provider errors are redacted. Every response is checked against a Zod contract that also generates `/openapi.json` and the browser test page at `/docs`. Added a mock provider, 84 tests, a Dockerfile and read-only `compose.yaml`, `.env.example`, a README, API.md for the frontend, and a smoke script for real receipts. Verified in the browser through `/docs` with the mock. Not yet verified: the Docker image (Docker Desktop's engine did not start) and live Gemini calls (needs the API key).

Tool: Claude Code — Developer: Meshal Khaled

## 2026-10-20 12:52 (Asia/Riyadh)

**Update:** Prepared the infrastructure for The Ring at `https://dhamantaha.arc-homlab.com` through the same Cloudflare Tunnel that serves `ring.arc-homlab.com`. Added `npm run setup` (`infrastructure/scripts/setup-env.js`), which asks for the Gemini key (hidden) and model and writes a private `.env` tuned for the tunnel: `TRUST_PROXY=loopback,uniquelocal` for real client IPs, and `GEMINI_TIMEOUT_MS=40000` to stay under Cloudflare's 100-second limit. It also generates `android` and `web-test` app keys, and re-runs keep existing values. Added `infrastructure/DEPLOY.md`, covering cloning, keys, Docker, the tunnel public hostname, Cloudflare settings (no Access on the API, Bot Fight Mode off), checks, and troubleshooting. Added tests for the setup command and for tunnel-aware rate limiting; 89 tests pass. Not yet done on The Ring itself: deployment, the tunnel hostname, and a live Gemini check.

Tool: Claude Code — Developer: Meshal Khaled

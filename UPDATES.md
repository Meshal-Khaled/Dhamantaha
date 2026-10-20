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

## 2026-10-20 13:13 (Asia/Riyadh)

**Update:** Deployed the Node.js/Express backend on The Ring at /home/ubuntu/dhamantaha/infrastructure, using a healthy read-only non-root Docker container on 127.0.0.1:3100; port 3000 remains free. Updated port defaults, deployment docs, and Compose mappings. Added GEMINI_API_KEY_FILE and compose.ring.yaml to reuse the existing Ring-managed Gemini key without copying its value. Client access tokens stay in the server's private .env. Fixed per-call daily-budget enforcement including PDF fallback; all 93 tests passed. Verified health, API docs, OpenAPI, and rejection of unauthenticated analysis. Live Gemini calls returned provider 503 high-demand errors; successful receipt extraction and public Cloudflare routing remain unverified. Existing Ring services and tunnel configuration were not changed.

Tool: Codex — Developer: Meshal Khaled

## 2026-10-20 13:41 (Asia/Riyadh)

**Update:** Replaced the root 404 with the Dhamantaha control room, deployed on The Ring at port 3100. Added separate /dashboard/api-settings and /dashboard/monitoring pages, using the existing Ring admin key for sign-in with secure HttpOnly sessions and CSRF protection. API settings save provider keys privately on The Ring and update the live provider without restart; blank keys preserve the current value and the Ring-key fallback can be restored. Saved keys are never returned to the browser. Monitoring shows real request outcomes, response durations, active requests, hourly activity, memory, uptime, and daily provider usage using bounded in-memory metadata only. Added GET /v1 and GET /v1/health, and documented the client base URL https://dhamantaha.arc-homlab.com/v1. All 101 tests passed. Verified local browser sign-in, settings save and navigation, live admin login/save/fallback/model check/monitoring/logout on The Ring, the public login page, and public API health (200). Receipts remain unsaved and port 3000 remains free.

Tool: Codex — Developer: Meshal Khaled

## 2026-10-20 15:51 (Asia/Riyadh)

**Update:** Recorded completion of the Dhamantaha dashboard release on The Ring. The root opens the private control room, with separate API settings and monitoring pages. API settings support saving a Gemini key and model, checking access, and restoring the Ring key; changes apply immediately and saved keys are never returned to the browser. Monitoring shows request outcomes, latency, activity, uptime, memory, and provider usage without receipt contents. The client API base URL is https://dhamantaha.arc-homlab.com/v1. Deployment uses port 3100, leaving port 3000 free. Deployment validation passed all 101 automated tests plus live sign-in, settings persistence, key fallback, model access, monitoring, logout, public dashboard rendering, and public API health checks. Full live receipt extraction remains unverified following Gemini's earlier high-demand 503 responses.

Tool: Codex — Developer: Meshal Khaled


## 2026-10-20 16:10 (Asia/Riyadh)

**Update:** Added the Android app in `android-app/` (React + Vite + Capacitor, per Resource.md). It takes a photo with the camera or picks a photo/PDF, checks it against the limits from `GET /v1/health`, and sends it to The Ring at `https://dhamantaha.arc-homlab.com/v1/receipts/analyze` with the `X-Client-Key` header. The result (merchant, date, total, items, warranty status, items to review) and every API error code are shown, and a debug panel lists requests, durations, request IDs and raw JSON. The API address and client key are set inside the app and never committed. `npm run android:install` builds the debug APK and installs it over adb; the app is installed on a connected phone and reached The Ring (health 200, provider gemini, key required). 7 unit tests cover the upload request, key header, error mapping, timeouts and local file checks. A real receipt upload still needs the client key entered on the phone.

Tool: Claude Code — Developer: Meshal Khaled

## 2026-10-20 16:24 (Asia/Riyadh)

**Update:** Created a Dhamantaha brand logo and standalone app symbol in `assets/brand/` using the built-in imagegen tool. The teal receipt, protective shield and checkmark reflect the warranty-wallet concept and existing Android UI. The primary logo includes Arabic and English names. Verified both PNGs have alpha transparency and saved the generation prompts in `assets/brand/README.md`.

Tool: Codex — Developer: Meshal Khaled

## 2026-10-20 17:05 (Asia/Riyadh)

**Update:** Moved receipt debugging from the phone to the Monitoring page of the dashboard. A new **Debug captures** card has a Capture switch (off by default). While on, each analysis request shows what the app sent (file name, declared and detected type, size), how The Ring prepared it, what went to Gemini (a preview of the photo, or the text extracted from a PDF), Gemini's raw answer, and what was returned to the app, including failures. Captures live in memory only: the last 20, for 60 minutes, erased when the switch is turned off or the service restarts, and they are never logged or written to disk. Admin endpoints: `GET/PUT/DELETE /admin/api/debug`; `/admin/api/monitoring` still carries no receipt contents. Also changed the extraction prompt so the merchant is the seller on the receipt, not the mall or location where the store is (a Jarir receipt read as "Hayat Mall"), and Gemini now writes a short `merchantEvidence` note quoting the text it used for the seller, shown in the capture and not returned to apps. The Android app no longer shows the payload and now shows the request ID, to match a result with its capture. 105 backend tests and 7 app tests pass. Not yet deployed to The Ring.

Tool: Claude Code — Developer: Meshal Khaled

## 2026-10-20 16:36 (Asia/Riyadh)

**Update:** Deployed the payload view to The Ring (container `dhamantaha-infrastructure-1`, project `dhamantaha`, healthy on 127.0.0.1:3100; the previous install is backed up in `/home/ubuntu/dhamantaha/backups/pre-payload-20261020-133504`, and `.env` and `state/` were not touched). Reworked the Monitoring page: every row in Recent requests now has a **Show** button after the outcome. It opens what the request received (headers, with the client key shown only as sent or missing, and file details), how The Ring prepared it, what was sent to Gemini (PDF text or a photo preview), Gemini's raw answer with its seller evidence, and what was sent back, with a **Copy** button that puts it on the clipboard (no download). Rejected requests such as `401 unauthorized_client` are captured too. Payload capture is on by default (`DEBUG_CAPTURE=false` starts it off) and has a switch on the page. It holds the last 60 requests for 60 minutes in memory only, and is erased when switched off or on restart. The earlier separate "Debug captures" card was removed. 106 backend tests pass. Verified publicly: `/v1/health` 200, the dashboard serves the new page, and `/admin/api/debug` requires sign-in (401).

Tool: Claude Code — Developer: Meshal Khaled

## 2026-10-20 16:48 (Asia/Riyadh)

**Update:** Fixed the 502/504 errors on receipt analysis. The Ring was healthy; the configured model `gemini-3.1-flash-lite` was overloaded at Google (HTTP 503, or no answer until the 40 s timeout, even for a one-word prompt). With the real extraction on the same PDF text, `gemini-3-flash-preview` (3.7 s), `gemini-3.5-flash-lite` (6.8 s) and `gemini-flash-lite-latest` (9.7 s) all worked. Switched the dashboard-saved model to `gemini-3.5-flash-lite` (`state/provider.json`; the old file is in `backups/provider.json.before-model-switch`) and restarted the container. A real Jarir PDF sent from the Android app then returned 200 in 2.8 s with merchant "Jarir Marketing Company", not "Hayat Mall". Also seen: when the Ring answered 504 after 40 s, the phone said "Could not reach The Ring" instead of the real error; not yet investigated.

Tool: Claude Code — Developer: Meshal Khaled

## 2026-10-20 17:00 (Asia/Riyadh)

**Update:** Added a Gemini fallback chain on The Ring and a countdown in the Android app. If a call fails (overload, timeout, quota, or a bad key), The Ring now tries another model on the same key, then moves to the next key and starts again from the primary model. Bad input and disconnects are not retried. The chain shares one deadline per request (`GEMINI_TOTAL_TIMEOUT_MS`, default 85 s, under Cloudflare's 100 s), and every retry counts against the daily call cap. Configuration: `GEMINI_FALLBACK_MODELS` (set to `gemini-3-flash-preview` on The Ring) and `GEMINI_FALLBACK_KEY_FILES` (the Ring's `gemini.2.key` and `gemini.3.key`, mounted read-only in `compose.ring.yaml`). The primary key and model stay as saved in the dashboard. Google answers a bad key with HTTP 400, which is now treated as a key problem so the next key takes over. Each attempt is logged by key slot and model (never the key) and appears under "Attempts" in the payload view; the Monitoring page shows the fallbacks. Checked live inside the container: a bad key then a missing model fell through to key 2 and `gemini-3-flash-preview` and returned the right merchant, and key 3 also answers. The app keeps the result format and now adds days left to the warranty line (for example "· 324 days left", "Last day", "Ended 12 days ago"). 120 backend tests and 11 app tests pass. Deployed; backup in `backups/pre-failover-*`.

Tool: Claude Code — Developer: Meshal Khaled

## 2026-10-20 17:25 (Asia/Riyadh)

**Update:** Fixed receipts still timing out although spare keys were set up. The Ring's logs showed the chain working as designed but wasting its time: each attempt waited the full 40 s on a Gemini call that never answered (first key, then its fallback model), leaving almost nothing for key 2. Gemini's response time is very uneven today (the same call took 2 to 34 s, and one key was slower than the others). The chain now starts the next fallback alongside a call that is still unanswered after 12 s (`GEMINI_HEDGE_AFTER_MS`, 0 turns it off) instead of waiting for it to time out, and also starts the next one immediately when a call fails. The first good answer wins and the others are cancelled; at most three calls run at once, within the same 85 s deadline. Extra calls only happen when a call is slow or failing, and each counts against the daily cap. Checked live on The Ring with six real extractions at once: all six succeeded in 12 to 34 s, two of them after a 503 on the fallback model. 123 backend tests pass. Deployed; backup in `backups/pre-hedge-*`.

Tool: Claude Code — Developer: Meshal Khaled

## 2026-10-20 17:28 (Asia/Riyadh)

**Update:** Synced the documents on the `infrastructure` branch with the `main` folder (`Desktop\Dhamantaha`). Mazen-Plan.md, Meshal-Plan.md and Resource.md were already identical. The only entry missing here was the Codex entry for the brand logo (16:24), which is now included in time order. Nothing was removed or rewritten. Correction to two earlier entries: the ones headed 17:05 and 17:25 carry the wrong time. The first was written before 16:36, since it still says "not yet deployed", and the second just before 17:12, when the commit that contains it was made. Their position in this file is the true order. The logo files themselves (`assets/brand/`, `Dhamantha.png`) exist only in the main folder and are not committed yet.

Tool: Claude Code — Developer: Meshal Khaled

## 2026-10-20 17:29 (Asia/Riyadh)

**Update:** Moved the shared documents back to the repository root on the `infrastructure` branch, the same place they have on `main`: UPDATES.md, Mazen-Plan.md, Meshal-Plan.md and Resource.md. The `documents/` folder no longer exists on this branch. The log is now one file at the same path on every branch, so merging into `main` only adds the new entries instead of clashing with the root UPDATES.md. Compared with `main`, the only difference is the added log entries. Updated the plan link in `infrastructure/README.md`.

Tool: Claude Code — Developer: Meshal Khaled

## 2026-10-20 17:39 (Asia/Riyadh)

**Update:** Set up one set of shared docs that every branch and every tool gets through `main`. Added `.gitattributes` (UPDATES.md uses `merge=union`, so when two branches add log entries at the same time git keeps both instead of stopping with a conflict), `scripts/docs-sync.mjs` (publishes the shared docs to `main` from any branch or folder without switching branches or touching other files, and brings `main`'s docs back: no flag only checks, `--pull` updates this folder, `--push` publishes), and `AGENTS.md` with a one-line `CLAUDE.md` that imports it (the logging rules for Codex, Claude Code and people: append only, real clock time, publish with the script). The script keeps each file's existing line endings, merges the plans normally and stops with the file name if two people changed the same lines. Tested only on throwaway repositories (11 tests, including a race with another push and the same merge with and without the `.gitattributes` rule); a check against the real repository found nothing wrong and nothing was changed. Nothing is pushed to `main` yet.

Tool: Claude Code — Developer: Meshal Khaled

## 2026-10-20 17:50 (Asia/Riyadh)

**Update:** Added the Android device receipt wallet. Receipt photos and PDFs are saved immediately before analysis, with original bytes in private internal files and metadata/analysis in a versioned SQLite database under Android's no-backup directory. Saved receipts can be browsed offline, reopened, sent for analysis again, opened in a device viewer, and deleted with confirmation. Successful analysis updates the existing receipt; failed calls preserve the original and previous result. Added browser IndexedDB storage for the web preview, pagination, local file limits, storage-error handling and analysis-save retry, background native storage operations, interrupted-write/deletion recovery, and current warranty status when reopening saved results. Disabled native bridge logging to keep original file bytes and saved analysis out of logs. Verified all 16 JavaScript tests, 7 native database tests on the connected phone, browser offline/reload/delete/error workflows, and native bridge byte integrity and persistence after force-stop/relaunch. Built and installed the APK. The initial Gradle connected test task uninstalled the app and reset its client-key setting; added and verified `npm run android:test-storage`, which uses replacement installs and direct instrumentation to preserve app data. Restoring the Android client key is awaiting user authorization; no server credentials were read. All temporary test receipts were removed. Updated the Android README.

Tool: Codex — Developer: Meshal Khaled

## 2026-10-20 17:55 (Asia/Riyadh)

**Update:** Restored the existing Android client key from The Ring directly into the phone app after explicit user authorization. The key was kept in process memory during transfer, was not displayed or saved on the PC, and remains only in its existing server configuration and the app's local settings. Reloaded the app and verified the restored token against the public receipt endpoint: an empty authenticated upload returned HTTP 400 `no_file`, confirming authorization passed without uploading a receipt or calling Gemini. Removed the temporary debug-port forwarding.

Tool: Codex — Developer: Meshal Khaled

## 2026-10-20 18:16 (Asia/Riyadh)

**Update:** Added and installed the optional Android app-entry lock in Settings. AndroidX BiometricPrompt uses enrolled fingerprint or supported face unlock, with the phone's existing screen-lock password, PIN, or pattern as fallback; no separate app password or biometric data is stored. A native gate hides the WebView until authentication succeeds and relocks when the app goes into the background. Enabling and disabling the lock also require authentication. The setting persists atomically in the private no-backup directory, damaged settings fail closed, and Android screenshots/recent-app previews are blocked while enabled. Added four isolated preference tests to the existing safe instrumentation command. All 16 JavaScript tests and 11 native tests passed; Android lint reported no errors and the APK built and installed successfully. Verified the lock is enabled on the connected phone, backgrounding locks it, and the restored client key remains configured. The user confirmed the phone password/PIN fallback worked. Updated the Android README.

Tool: Codex — Developer: Meshal Khaled

## 2026-10-20 18:18 (Asia/Riyadh)

**Update:** Test of the automatic publish. This entry was added on a throwaway branch (docs-sync-action-test) and should reach main through the "Sync shared docs to main" GitHub Action, without anyone running the script.

Tool: Claude Code — Developer: Meshal Khaled

## 2026-10-20 18:19 (Asia/Riyadh)

**Update:** Publishing the shared docs to `main` is now automatic. A GitHub Action, "Sync shared docs to main" (`.github/workflows/sync-docs.yml`), runs whenever any branch other than `main` is pushed with a changed shared doc: it runs `scripts/docs-sync.mjs --push`, which merges that branch's docs into `main` (the log keeps every entry) and pushes one docs-only commit. Tested end to end on a throwaway branch carrying one new log entry: the run took 14 seconds and `main` received the entry as a commit by github-actions[bot]; the branch was deleted afterwards. Because the Action publishes without anyone watching, the script now also refuses a log that edits or removes entries `main` already has. While testing, fixed a bug in the script: after a doc had been published once, a later edit to it looked like a conflict, because `main`'s docs commit is not part of the branch's history. Each publish now records the branch commit it came from (a `Docs-From:` line) and the next merge starts from that version; docs other than the log must be committed before they are published. 23 tests pass. To use it, a branch needs the workflow file, so teammates pull `main` once. GitHub does not let the Action change files under `.github/`, so a change to the workflow itself reaches `main` only when someone runs `node scripts/docs-sync.mjs --push` on their own machine. The Action needs Actions to stay enabled on the repository and `main` to stay unprotected.

Tool: Claude Code — Developer: Meshal Khaled

## 2026-10-20 18:46 (Asia/Riyadh)

**Update:** Merged the infrastructure app and Frontend-UI branches into main in Desktop\Dhamantaha, then connected the frontend design to the existing Android wallet. The APK now has live Home counts and upcoming deadlines, searchable receipts, camera/photo/PDF import, receipt details and originals, confirmed deletion, and persistent Arabic/English, light/dark and normal/large text settings. Added offline purchase and per-product warranty/return duration editing with calendar-safe expiry calculations; original printed warranty dates stay fixed and calculated warranties follow an edited purchase date. Existing Android app lock, device-local storage and The Ring connection settings remain available. Built and installed through adb install -r. All 21 JavaScript tests and 11 isolated native storage/lock tests passed. Live phone checks passed navigation, existing receipt details, appearance persistence, native import, manual editing, persistence after reload, search, and deletion; the temporary test receipt was removed, both original saved receipts remain, and the configured client-key setting survived without exposing its value. Fixed Arabic bottom-navigation positioning during phone verification. Scheduled phone notifications remain unimplemented; upcoming deadlines appear on Home. An optional additional API authentication probe was blocked by automatic approval review because it would transmit the stored client key, and was omitted. The infrastructure checkout and deployed service were not modified.

Tool: Codex — Developer: Meshal Khaled

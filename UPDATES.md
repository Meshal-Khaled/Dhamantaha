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

# Working agreements

These apply to every tool (Codex, Claude Code, OpenCode) and every teammate.

## The shared docs

`UPDATES.md` (the team log), `Mazen-Plan.md`, `Meshal-Plan.md` and `Resource.md` live at the repository root and are the same on every branch. `main` is the hub: docs are published there and every branch picks them up from there. Keep them at the root; do not move them into a subfolder.

## Logging an update

1. Add one entry at the end of `UPDATES.md` for every update, in the format described at the top of that file. Never edit, delete, or reorder earlier entries. If an earlier entry is wrong, say so in a new entry.
2. Use the real time in the heading. Read the clock (`date`) when you write it; do not estimate. Time zone: Asia/Riyadh.
3. Commit your copy of `UPDATES.md` with the rest of your work and push your branch, as usual. Publishing to `main` then happens by itself: the "Sync shared docs to main" GitHub Action (`.github/workflows/sync-docs.yml`) adds your entry to `main`, merged with everyone else's. It runs on any branch except `main`, only when a shared doc changed, and a red mark on your push means it refused (see below).
4. To publish right away, or before you have pushed, run `node scripts/docs-sync.mjs --push`. It does the same thing from your machine and also brings other people's entries into your copy. It changes only the shared docs: it never switches your branch or touches your other files.

Docs other than the log (the plans, these rules, the script) must be committed before they can be published, so the merge knows where your copy started; a new log entry can be published before you commit it.

To see what others have added without publishing anything, run `node scripts/docs-sync.mjs` (check only) or `node scripts/docs-sync.mjs --pull` (update this folder from `main`).

The Action only runs for branches that contain `.github/workflows/sync-docs.yml`, so pull `main` into your branch once. It refuses, and tells you why in its log, when two people edited the same lines of a plan, or when `UPDATES.md` changes or removes an earlier entry (the log may only grow). GitHub does not let the Action change files under `.github/`, so a change to the workflow file itself reaches `main` only when someone runs `node scripts/docs-sync.mjs --push` on their own machine.

## Git

- Pull `main` into your branch regularly (`git pull origin main`). `.gitattributes` keeps both sides' log entries, so `UPDATES.md` does not conflict.
- Merge with git on your own machine. GitHub's "Merge" button does not apply that rule, so a conflict in `UPDATES.md` there has to be fixed by hand.
- Code is not pushed to `main` directly. It reaches `main` when the branches are merged. Only the shared docs go to `main` through the script.

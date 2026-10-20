# Working agreements

These apply to every tool (Codex, Claude Code, OpenCode) and every teammate.

## The shared docs

`UPDATES.md` (the team log), `Mazen-Plan.md`, `Meshal-Plan.md` and `Resource.md` live at the repository root and are the same on every branch. `main` is the hub: docs are published there and every branch picks them up from there. Keep them at the root; do not move them into a subfolder.

## Logging an update

1. Add one entry at the end of `UPDATES.md` for every update, in the format described at the top of that file. Never edit, delete, or reorder earlier entries. If an earlier entry is wrong, say so in a new entry.
2. Use the real time in the heading. Read the clock (`date`) when you write it; do not estimate. Time zone: Asia/Riyadh.
3. Publish the entry: `node scripts/docs-sync.mjs --push`. It adds your entry to `main`, merged with everyone else's, and brings their entries into your copy. It changes only the shared docs: it never switches your branch or touches your other files.
4. Commit your copy of `UPDATES.md` together with the rest of your work, as usual.

To see what others have added without publishing anything, run `node scripts/docs-sync.mjs` (check only) or `node scripts/docs-sync.mjs --pull` (update this folder from `main`).

## Git

- Pull `main` into your branch regularly (`git pull origin main`). `.gitattributes` keeps both sides' log entries, so `UPDATES.md` does not conflict.
- Merge with git on your own machine. GitHub's "Merge" button does not apply that rule, so a conflict in `UPDATES.md` there has to be fixed by hand.
- Code is not pushed to `main` directly. It reaches `main` when the branches are merged. Only the shared docs go to `main` through the script.

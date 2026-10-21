# Dhamantaha — ضمنتها

A warranty wallet: keep your receipts, have The Ring read them, and count down every warranty and return window. It comes as an app and as a website, each in its own folder, both served by the same analysis API.

| Folder | What it is |
| --- | --- |
| [`app/`](app/README.md) | The Android app (React + Capacitor): private on-device storage, camera and PDF import, analysis, policy editing, app lock. |
| [`website/`](website/README.md) | The website, with its own design and separate pages (home, receipts, add, settings, how it works, privacy, help), in English and Arabic. Runs on The Ring at port 3101. |
| [`infrastructure/`](infrastructure/README.md) | The Ring's analysis relay and private dashboard. Production API base: `https://dhamantaha.arc-homlab.com/v1`. |
| [`design/`](design/index.html) | The original static design pages (English/Arabic, light/dark, text sizes) that the app and website were designed from. |
| [`assets/brand/`](assets/brand/README.md) | The logo and symbol. |
| [`scripts/`](scripts/docs-sync.mjs) | The tool that shares the team documents between branches. |

The app and the website keep their own receipts (on the phone, and in the browser) and do not sync. `Frontend-UI` contains the complete project, including the latest app and control-panel features.

## Editing the frontend

Clone the UI branch to get the whole project:

```bash
git clone --branch Frontend-UI https://github.com/Meshal-Khaled/Dhamantaha.git
cd Dhamantaha
```

- Website pages and components: `website/src/pages/`, `website/src/components/`, and `website/src/styles/`.
- Android app screens and styling: `app/src/WalletLayout.jsx`, `app/src/WalletScreens.jsx`, `app/src/ItemExtras.jsx`, and `app/src/styles.css`.
- Admin control-panel UI: `infrastructure/src/admin/public/` (API settings, API monitoring, and Users).
- Original design variants: `design/`. Shared logos and icons: `assets/brand/`; `Dhamantha.png` is the original supplied logo.

The setup commands below install dependencies from the committed lockfiles. Real API keys, client settings, customer receipts, APKs and build output are not part of the handoff. For visual editing, the website runs locally without an analysis key; add a client key in its Settings only when testing real analysis. Push frontend edits to `Frontend-UI`, and append a timestamped entry to `UPDATES.md` as described in `AGENTS.md`.

**Android app**, from `app/`:

```powershell
npm ci
npm test
npm run android:install
```

The install command updates the existing `com.dhamantaha.app` package through ADB with `install -r`, preserving its saved receipts and connection settings. See the app README for Android SDK/JDK requirements and safe native tests.

**Website**, from `website/`:

```powershell
npm ci
npm run dev           # http://localhost:5173
npm test
npm run deploy:ring   # build and put it on The Ring (port 3101)
```

The team plans, resource list, working agreements, and append-only `UPDATES.md` remain at the repository root.

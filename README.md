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

The app and the website keep their own receipts (on the phone, and in the browser) and do not sync. `main` combines everything.

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

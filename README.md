# Dhamantaha — ضمنتها

An Android receipt wallet with private on-device storage and receipt analysis through The Ring.

- [`android-app/`](android-app/README.md): the working React/Capacitor app, using the `Frontend-UI` design with real saved receipts, camera/PDF import, analysis, policy editing, and Android app lock.
- [`infrastructure/`](infrastructure/README.md): the analysis relay and private administration dashboard. Production API base: `https://dhamantaha.arc-homlab.com/v1`.
- [`ضمنتها/`](ضمنتها/README.md): the original static frontend design and its Arabic/English, light/dark, and text-size variants.

`main` combines the infrastructure and frontend branches. Build and install from `android-app/`:

```powershell
npm ci
npm test
npm run android:install
```

The install command updates the existing `com.dhamantaha.app` package through ADB with `install -r`, preserving its saved receipts and connection settings. See the app README for Android SDK/JDK requirements and safe native tests.

The team plans, resource list, working agreements, and append-only `UPDATES.md` remain at the repository root.

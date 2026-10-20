# Dhamantaha Android app

React + Vite packaged with Capacitor. Photograph or pick a receipt (photo or PDF). Its original is saved privately on the device immediately, even offline. Send a saved receipt to The Ring (`POST /v1/receipts/analyze`) to read it; successful analysis is saved alongside the original.

## Device receipt wallet

- **Saved receipts** lists locally saved originals and analysis results. Open a receipt offline, view its photo, open its original in an Android PDF/image viewer, read it again, or delete it with confirmation.
- Android uses built-in SQLite for receipt metadata and analysis JSON, with original bytes in private internal files. Both live under `Context.getNoBackupFilesDir()/receipt-wallet/`, excluded from Android automatic backups. No storage permissions or additional database packages are needed. Opening an original grants the chosen viewer temporary read access to a cache copy.
- SQLite schema version 1: `receipts(id, name, mime, size, created_at, updated_at, analysis)`, indexed by creation date. Filenames are generated UUIDs; original names are metadata only. Writes run on one background worker. Interrupted writes/deletions are recovered on the next storage initialization.
- Files are limited to 20 MB locally. The Ring's separate upload limits still apply when reading them. A failed analysis preserves the original and any previous saved analysis. A successful re-read updates the same record.
- Receipts survive app restarts and normal app updates. Uninstalling the app, clearing app data, or losing the phone removes them; there is no cloud sync or automatic backup. Previously analyzed receipts from before this feature need to be imported again.
- Browser previews use IndexedDB (separate metadata and original Blob stores). Browser storage can be cleared or evicted; this is separate from the Android SQLite wallet.
- Capacitor bridge logging is disabled so file bytes and analysis passed to native storage do not enter device logs. The in-app debug panel still shows request metadata.

## Biometric app lock

In **Settings → App lock**, enable **Require unlock to open app** and confirm the Android authentication prompt. The app uses the phone's enrolled fingerprint or supported face unlock, with its existing screen-lock password, PIN, or pattern as fallback. There is no separate Dhamantaha password, and the app never receives or saves biometric data or the phone's screen-lock credential.

The native gate hides the WebView on a locked launch and after the app goes into the background. Returning from the camera, file picker, or original-file viewer also requires unlocking again. Cancelling authentication leaves the app locked with an Unlock button. Turning app lock on or off requires successful Android authentication. Configure a phone screen lock first; if no biometric is available, the phone credential still works. The setting is off until enabled and is saved in Android's private no-backup directory. When enabled, Android screenshots and recent-app previews are blocked. This is an app-entry lock; receipt storage is unchanged.

## Run it on a phone

Needs Node 22+, JDK 21 (found automatically in `~/.jdks` or Android Studio's `jbr`), the Android SDK, and a phone with USB debugging on.

```bash
npm install
npm run android:install   # web build, cap sync, gradle assembleDebug, adb install, launch
npm run android:logs      # app console output from the phone (adb logcat)
```

## Connecting to The Ring

The API address defaults to `https://dhamantaha.arc-homlab.com/v1`. The Ring requires a client key (`X-Client-Key`, one of `CLIENT_KEYS` in the server's private `.env`). Enter it in the app under ⚙ Settings, or set `VITE_CLIENT_KEY` in a git-ignored `.env.local` before building. See `.env.example`.

The **Show debug** panel lists request metadata (status, duration, `requestId`). Detailed server captures remain in The Ring's authenticated dashboard.

## Layout

- `src/api.js` — the routing to The Ring: health check, upload, error handling (tested in `test/`)
- `src/App.jsx` — camera/file picking, send, result and debug views
- `src/receipt-wallet.js` — save/list/open/delete and analysis persistence; native bridge and browser IndexedDB adapters
- `src/AppLockSettings.jsx` — Android app-lock toggle and authentication errors
- `android/app/src/main/java/com/dhamantaha/app/AppLock.java` — native lock screen, Android biometric prompt, device-credential fallback and lifecycle handling
- `android/app/src/main/java/com/dhamantaha/app/ReceiptStore.java` — SQLite schema, original files and crash recovery
- `android/app/src/main/java/com/dhamantaha/app/ReceiptWalletPlugin.java` — Capacitor bridge and Android original-file viewer
- `android/app/src/androidTest/java/com/dhamantaha/app/ReceiptStoreTest.java` — native persistence, byte integrity, deletion, rollback and pagination tests
- `scripts/android.js` — build, install and log helpers
- `android/` — the generated Capacitor Android project

Run `npm test` and `npm run build` for JavaScript checks. With a device connected, run `npm run android:test-storage` for the isolated native receipt-storage and app-lock preference tests. It installs with `adb install -r` and invokes instrumentation directly, preserving app data. Tests use unique temporary directories. Avoid Gradle's `connectedDebugAndroidTest` task on a phone with saved data: that task can uninstall the target app afterward.

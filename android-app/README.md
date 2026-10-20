# Dhamantaha Android app

React + Vite packaged with Capacitor. Photograph or pick a receipt (photo or PDF) and send it to The Ring (`POST /v1/receipts/analyze`). The result is shown for review; nothing is stored on the server.

## Run it on a phone

Needs Node 22+, JDK 21 (found automatically in `~/.jdks` or Android Studio's `jbr`), the Android SDK, and a phone with USB debugging on.

```bash
npm install
npm run android:install   # web build, cap sync, gradle assembleDebug, adb install, launch
npm run android:logs      # app console output from the phone (adb logcat)
```

## Connecting to The Ring

The API address defaults to `https://dhamantaha.arc-homlab.com/v1`. The Ring requires a client key (`X-Client-Key`, one of `CLIENT_KEYS` in the server's private `.env`). Enter it in the app under ⚙ Settings, or set `VITE_CLIENT_KEY` in a git-ignored `.env.local` before building. See `.env.example`.

The **Show debug** panel lists each request (status, duration, `requestId`) and the raw response.

## Layout

- `src/api.js` — the routing to The Ring: health check, upload, error handling (tested in `test/`)
- `src/App.jsx` — camera/file picking, send, result and debug views
- `scripts/android.js` — build, install and log helpers
- `android/` — the generated Capacitor Android project

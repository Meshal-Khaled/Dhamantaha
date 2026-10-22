# Dhamantaha Android app

React + Vite packaged with Capacitor. Photograph or pick a receipt (photo or PDF). Its original is saved privately on the device immediately, even offline. Send a saved receipt to The Ring (`POST /v1/receipts/analyze`) to read it; successful analysis is saved alongside the original.

The website is a separate project in [`../website/`](../website/README.md), with its own interface. The app and the website use the same analysis API but do not share receipts.

## Frontend integration

The app uses the design from the `Frontend-UI` branch, preserved in `../design/`. Its HTML pages remain a reference; the APK runs React screens connected to the real camera, API, and private receipt wallet.

- **Home** shows the saved receipt count, active warranties, and warranty/return deadlines within 30 days. Numbers come from saved data, not demo products. When more pages are available, counts show `+` and the user can load more receipts.
- **Receipts** searches loaded purchases by product, merchant, or original filename. Open a purchase to see its analysis, current countdowns, original file, and deletion confirmation.
- **Add receipt** opens the camera or photo/PDF picker. The original is saved before analysis and can also be edited manually offline.
- **Settings** saves Arabic/English, light/dark appearance, and normal/large text separately from the existing API settings, preserving previously configured client keys. The real Android app-lock control remains available. Connection settings and request diagnostics are under **Analysis connection**.
- Purchase details support editing individual products, merchant, price, purchase date, and warranty/return durations. Owner-entered policy durations are stored with the local analysis and do not claim the receipt printed those terms. Month/year calculations clamp to the final day of the target month. Printed warranty dates stay fixed; calculated warranties follow the purchase date. Re-analysis replaces manual edits.
- The frontend's sample purchases and pretend sign-out/Face ID controls are replaced by actual wallet data and the existing native app lock. Local Android deadline reminders are available in Settings → Notifications and are off by default; upcoming deadlines also appear on Home. Refund approval is not inferred.
- Branding and CSS are bundled in the APK; no Google Fonts request is needed to render the interface offline.

## Device receipt wallet

### Analyst spending dashboard

The Analyst tab summarizes local receipts with Daily (today), Weekly (rolling 7 days), Monthly (rolling 30 days), and Yearly (rolling 365 days) views. The exact date range is visible. The yearly graph groups dates by calendar month within the rolling window, including partial edge months; other views show daily totals. Each chart has an accessible data table. Currency selection keeps currencies separate. Totals, average/largest receipt, store-share bars, original store names, recorded branches and clickable included purchases follow the active period, currency and search/store filters. Purchases are gross recorded amounts; refunds are not deducted. Missing/invalid dates, totals, currency and future dates have separate exclusion counts. Valid receipts outside the chosen range are identified separately.

Known exact Jarir variants (including Jarir Marketing Company, Jarir Bookstore and مكتبة جرير) are grouped as Jarir/جرير. This is explicit alias matching, not fuzzy name guessing. **Group store names** lets the owner assign the same label to other variants and reset overrides. Overrides stay on the device under `dhamantaha.merchant-aliases.v1`; they never change original receipt names, branches or analysis. Branch names are shown as recorded and are not guessed to be distinct physical locations. Search matches original/grouped merchants, branch, product, category and code. Keyword chips derive from saved product/category text; their counts cover the selected period/store across currencies. No financial metadata is sent to a server for this dashboard.

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

**Settings → Analysis connection → Request diagnostics** lists request metadata (status, duration, `requestId`). Detailed server captures remain in The Ring's authenticated dashboard.

## Layout

- `src/api.js` — the routing to The Ring: health check, upload, error handling (tested in `test/`)
- `src/App.jsx` — camera/file picking, API requests, navigation and wallet operations
- `src/WalletLayout.jsx` and `src/WalletScreens.jsx` — live Home, Receipts, Add, Settings, detail and editing screens
- `src/wallet-view.js` — dashboard summaries and owner-entered warranty/return calculations
- `src/appearance.js` — versioned language/theme/text-size preferences
- `src/frontend.css` and `src/styles.css` — original frontend design and native-app adaptations
- `src/receipt-wallet.js` — save/list/open/delete and analysis persistence; native bridge and browser IndexedDB adapters
- `src/AppLockSettings.jsx` — Android app-lock toggle and authentication errors
- `android/app/src/main/java/com/dhamantaha/app/AppLock.java` — native lock screen, Android biometric prompt, device-credential fallback and lifecycle handling
- `android/app/src/main/java/com/dhamantaha/app/ReceiptStore.java` — SQLite schema, original files and crash recovery
- `android/app/src/main/java/com/dhamantaha/app/ReceiptWalletPlugin.java` — Capacitor bridge and Android original-file viewer
- `android/app/src/androidTest/java/com/dhamantaha/app/ReceiptStoreTest.java` — native persistence, byte integrity, deletion, rollback and pagination tests
- `scripts/android.js` — build, install and log helpers
- `android/` — the generated Capacitor Android project

Run `npm test` and `npm run build` for JavaScript checks. With a device connected, run `npm run android:test-storage` for the isolated native receipt-storage and app-lock preference tests. It installs with `adb install -r` and invokes instrumentation directly, preserving app data. Tests use unique temporary directories. Avoid Gradle's `connectedDebugAndroidTest` task on a phone with saved data: that task can uninstall the target app afterward.

## Screen transitions, expired warranties and reminders

### Phone calendar

In Android receipt details, **Add to calendar / إضافة إلى التقويم** opens the installed calendar's event editor for a known, unexpired return, exchange or product warranty deadline. Pick the phone calendar (for example **My calendar**), choose an optional reminder there, and save or cancel. The draft uses a generic title and a 09:00–09:30 phone-local time on the deadline date. No merchant, product, price, receipt attachment or credentials are copied. Calendar-account sync follows the calendar you choose; Dhamantaha uses no Google Calendar API or account connection and requests no calendar read/write permission.

The native Capacitor API is `PhoneCalendar.openEvent({ date: 'YYYY-MM-DD', title })`, implemented in `PhoneCalendarPlugin.java`. It returns `{ opened: true }` when Android opens the editor/chooser, which does not establish that the user saved an event. Invalid/past dates and unavailable calendar apps produce errors. Reminders are configured in the calendar editor, separately from wallet notifications. Calendar events are independent copies: later wallet edits/deletions do not update them, and repeating the action may create duplicates. Calendar buttons are unavailable in the browser preview. `npm run android:test-storage` includes native calendar-intent date, title and routing validation alongside storage tests.

Screen changes use a short fade/slide, disabled by the phone/browser's reduced-motion preference. Expired warranties show **Expired** with a shield-X icon and no progress bar in receipt cards and product details; unknown dates stay unknown.

In the installed Android app, **Settings → Notifications** enables private local reminders for known warranty, refund and exchange deadlines. Choose one or seven days before the deadline. Android notification permission is requested only when you enable reminders or explicitly retry permission. Browser previews show an availability explanation instead of a pretend switch.

- One generic reminder per calendar day, around 09:00 phone local time. No merchants, filenames, amounts, receipt IDs or original contents appear in notification text. No reminder data is sent to a server.
- Dates come from existing local/receipt-printed policies. Unknown dates are skipped. Reminders whose selected lead time has already passed are not sent retroactively.
- Saving/editing/deleting wallet records, language/lead-time changes and app resume rebuild the pending reminder list. Disabling cancels pending wallet reminders; other notification IDs are preserved. Scheduling errors remain visible with Retry.
- The nearest 64 reminder days are scheduled. Open the app periodically to refresh later reminders and after changing device time/time zone. Android restores pending schedules after reboot through the official Capacitor plugin.
- Notifications are deliberately inexact: no exact-alarm permission or special alarm access is requested. Android battery limits, device notification/channel settings and private-space locks can delay or suppress delivery. Use Home to check important dates.
- Integrates `@capacitor/local-notifications` 8.3.1. Use `npm ci`, `npm run build`, `npx cap sync android` before building the APK (the existing Android build/install scripts already perform build/sync). Install via `adb install -r` to preserve the wallet.

Device acceptance: on an authorized Android phone, verify grant/deny/revoke permission, change lead time, edit/delete a deadline, disable/re-enable, reboot, time-zone changes, app-lock coexistence and actual notification delivery. These require a device; JavaScript scheduling tests and browser previews do not prove OS delivery.


## Navigation architecture and motion checks

This is React/Vite running in Capacitor's Android WebView, with six local page states rather than Expo Router or React Navigation. `useWalletNavigation.js` owns real page commits, including the existing Android Back callback, receipt imports and deletion. `navigation-motion.js` coordinates the incoming main element with a temporary inert, accessibility-hidden snapshot of the outgoing viewport. The previous keyed main element remounted tabs and animated only incoming content; it could not provide a coordinated departure or reverse Back animation.

- Screen/detail/editor entry slides in over 280 ms with subtle opacity; Back/save/cancel reverses it. Arabic mirrors horizontal direction.
- All five bottom tabs fade/move 12 px over 200 ms, with one moving selected-tab indicator. Visited tabs retain their search, Show More and other local state through React Activity; discarded Settings drafts are explicitly reset. Return scrolling records the position before asynchronous receipt loading changes layout.
- All three confirmation dialogs slide up over 240 ms and remain mounted for their 200 ms reverse close. Existing warranty/refund evidence, original receipt and nested Settings disclosures expand/collapse over 200 ms. Notifications remains its existing Settings section, not a new route.
- Reduced-motion changes settle active animations immediately. Rapid navigation interrupts the old visual transition without queuing navigation. Missing animation support falls back to usable immediate navigation. Temporary snapshots do not retain password values; original-file preview URLs stay valid until departing visuals finish.

From `app/`, run:

```bash
npm ci
npm test
npm run build
npx playwright install chromium
npm run test:navigation
```

The navigation browser suite drives the actual app with synthetic receipts and blocked external requests. It checks all tab destinations, push/pop keyframes, selected-tab motion, modal opening/closing, editor save/cancel, unsaved guards, import/delete, scroll/search/Show More retention, rapid navigation and reduced-motion/unsupported-animation fallbacks. The presentation matrix covers Arabic/English, light/dark and normal/large text. `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/path/to/chromium` optionally selects an existing browser.

To check on an authorized Android phone with USB debugging, JDK 21 and `ANDROID_HOME` configured:

```bash
npm run android:install
```

This rebuilds/syncs/installs using `adb install -r`. Open Home → Receipts → a receipt; use the header Back and Android Back and compare reversed movement. Switch all five tabs, search/show more and return, edit/cancel/save a receipt, open/cancel a delete or reanalysis confirmation, and expand Settings → Analysis connection → Request diagnostics and receipt warranty/refund terms. Repeat in Arabic, dark mode, large text, and with device animations/reduced motion disabled. A successful APK build and Chromium tests do not prove playback or Back behavior on a physical Android WebView.

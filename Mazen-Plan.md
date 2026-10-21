# Mazen's Frontend and UI Plan — Dhamantaha (ضمنتها)

Date: 2026-10-21  
Owner: Mazen Al-Malki — Frontend/UI  
Status: Frontend improvement and implementation plan. **This is a roadmap, not a claim that every item is missing or already implemented.** Verify the current branch before editing.

## 1. Goal and ownership

Make Dhamantaha easy, trustworthy, and pleasant to use as an Android receipt wallet and a separate website. A user should be able to save an original receipt quickly, understand what was extracted, review individual products and their warranty/return deadlines, and find the right original document when it is needed. The interfaces must work well in Arabic and English, on small screens, and with real user data rather than pretend demo records.

- **Mazen — frontend/UI:** Android wallet screens, website pages, visual design, navigation, content, form behavior, responsive layout, accessibility, user-facing errors, frontend tests, and frontend documentation.
- **Meshal — backend/infrastructure:** The Ring analysis API, provider integrations, server credentials, abuse limits, deployment, and administrative data endpoints. Coordinate before modifying the API contract or backend behavior.
- **Joint decisions:** warranty wording, new endpoints, notifications, privacy disclosures, website submissions, synchronization, and any feature that stores or transmits new user data.
- **MVP principle:** keep receipts and reviewed details on the user's device/browser; send a document to The Ring only when the user explicitly requests an AI analysis or warranty-terms explanation. Do not advertise cloud sync, accounts, guaranteed coverage, or refunds that are not implemented.

## 2. Start from the actual project, not an old mock-up

Read `AGENTS.md`, `UPDATES.md`, `Meshal-Plan.md`, `Resource.md`, the root `README.md`, and the two client READMEs before work. The updated frontend baseline is the `Frontend-UI` branch; `main` can have an older folder structure. Check the remote branch, local changes, and unpushed work before changing files.

| Area | Working source to inspect | Purpose |
| --- | --- | --- |
| Android application | `app/src/App.jsx`, `WalletLayout.jsx`, `WalletScreens.jsx`, `ItemExtras.jsx` | Application navigation, receipt screens, settings, item information |
| Android design | `app/src/styles.css`, `app/src/frontend.css`, `appearance.js` | Responsive layout, original design adaptation, language/theme/text size |
| Android local storage | `app/src/receipt-wallet.js` and native receipt store | Saved originals, edits, attachments and persistence |
| Android API integration | `app/src/api.js`, `wallet-view.js`, `countdown.js` | Error handling, warranty calculations and backend calls |
| Website routing/pages | `website/src/App.jsx`, `website/src/pages/` | Landing, receipts, details, add, settings, help and privacy |
| Website components/styles | `website/src/components/`, `website/src/styles/` | Reusable UI, design tokens and responsiveness |
| Website language/state | `website/src/i18n/`, `website/src/state/`, `website/src/lib/` | Arabic/English messages, storage, preferences and wallet calculations |
| Brand/reference | `assets/brand/`, `design/`, `Dhamantha.png` if present | Approved identity and original layouts |
| Backend API contract | `infrastructure/API.md`, `infrastructure/src/contracts/` | Actual accepted fields and error codes |

**Already reported as built:** live receipt wallet, camera/PDF import, on-device originals, AI analysis, receipt editing, duplicate detection, warranty progress, return/exchange information, product photos, warranty-terms attachments and explanations, theme/language settings, Android native app lock, a separate website, and API/user monitoring. Improve them; do not rebuild them blindly.

**Branch caveat:** entries in `UPDATES.md` may describe changes committed only locally, deployed to The Ring, or still on another branch. In particular, the `/teams` and `/qr` presentation pages were described in the log but may not exist in the checked-out remote branch. Confirm availability before working on them. Do not treat a deployment log as proof that GitHub contains the same code.

## 3. Product experience and design principles

1. **Clarity before decoration.** A receipt, store, item, date, amount and next deadline must be easy to identify at a glance.
2. **Trust and accuracy.** Separate receipt-printed terms, owner-entered terms and AI interpretation. Show unknown as unknown; never invent warranty coverage, deadlines, refunds or exchange rights.
3. **One clear primary action.** Each screen should have an obvious next step: Add, Analyze, Review, Save, Open original, Explain coverage, or Delete.
4. **Mobile first, not mobile only.** Android uses comfortable phone-sized tap targets; the website adapts from narrow phones through tablets and desktop.
5. **Consistent brand.** Reuse the Dhamantaha receipt/shield logo, restrained teal accents, card shapes, icon language, spacing, elevation and typography. Do not introduce unrelated visual styles between screens.
6. **Useful empty and error states.** Distinguish no receipts, no search results, unknown warranty, analysis not yet run, loss of connection, and a failed save.
7. **No false functionality.** Never add a demo-only Sign out, Face ID, notification switch, refund status or cloud-backup badge that looks real. Label previews clearly or implement the underlying feature first.
8. **Preserve data.** An interface refactor must never silently clear saved receipts, originals, warranty attachments, appearance settings, API client keys or native app-lock configuration.

### Design system checklist

- Audit CSS tokens for color, spacing, type scale, radius, shadow, border, icon sizes, and responsive breakpoints; consolidate repeated styles without changing visible behavior unexpectedly.
- Keep consistent header/back navigation, bottom navigation on Android, cards, buttons, form fields, filters, badges, progress bars, dialogs, toasts, loaders and file previews.
- Distinguish primary, secondary, destructive and disabled actions; require confirmation before permanent deletion.
- Ensure small screens do not horizontally overflow; long Arabic/English names, receipt numbers, URLs and mixed-direction prices should wrap safely.
- Support real right-to-left layout: logical CSS properties, mirrored directional icons where appropriate, and isolated left-to-right identifiers using `bdi` or an equivalent.
- Use a readable Arabic font, sensible contrast in both themes, and normal/large text on Android without cutting content off.
- Keep colors meaningful but never communicate warranty status through color alone. Include clear words and dates.
- Respect reduced-motion preferences; animated loaders should not be the sole way to convey progress.

## 4. Android app UI improvements

### A. Home dashboard

**Existing baseline:** saved receipt count, active warranties, upcoming deadlines, quick add, and recent purchases.

Review and refine:

- Put **Add receipt** where it is immediately discoverable.
- Prioritize receipts with the nearest *known* warranty or return/exchange deadline instead of dumping every receipt onto Home.
- Ensure summary counts agree with the wallet, including receipts containing multiple products; labels must clarify whether a metric counts receipts or warranties.
- Show a concise next-deadline card with merchant/item, deadline type, end date or days left, and a direct link to its receipt.
- Use distinct empty states for a new user and a user who has receipts but no upcoming deadlines.
- Avoid huge repetitive sections or misleading demo data. Keep Home fast with many receipts.

### B. Receipts list

**Existing baseline:** receipt cards, merchant/products/total/date, search, warranty information, and navigation to details.

Review and refine:

- Keep **one main card per receipt**; show purchased item names inside it rather than duplicating the receipt per product.
- Make search reliable for merchant, normalized Arabic/English product names, codes and filenames while preserving the original record.
- Compare Android with the website's existing **All / Active / Ending soon / Expired / Not analyzed** filters and sort choices. Add corresponding Android controls only if useful and feasible; preserve a simple default view.
- Handle large wallets with pagination or incremental loading; show a clear result count and a reset option after filtering.
- Use stable receipt IDs and honest unknown/expired states. Warranty progress must represent remaining time, not a random percentage.
- Avoid accidental taps and make the entire card's click behavior predictable.

### C. Receipt details and product cards

**Existing baseline:** merchant/branch, receipt date and number, total, original document, return policy, item rows, edit actions, photos, attachments, and coverage explanation.

Review and refine:

- Group information in this order: store/purchase summary, original receipt, return/exchange policy, individual products and warranty details, actions.
- Display customer-service phone as a usable action where known, without inventing contact details.
- Make long printed product descriptions and codes secondary to a clean editable display name; preserve the exact printed wording for verification.
- For every product, display quantity, price, known warranty date/duration/provider, remaining time, source of terms and status.
- Retain expandable evidence: printed policy, coverage quotations, attachments, photos and clearly labeled unknown terms.
- Use the established teal/amber/red warranty status treatment with accompanying labels; expired bars should be empty, unknown date bars neutral. Verify threshold rules against existing code/tests rather than inventing new thresholds.
- Put **Open original**, **Edit**, **Analyze again**, **Explain coverage**, **Add item photo/terms**, and **Delete** in clear locations. Warn that re-analysis can replace manual edits.
- Never imply an AI summary is a legal guarantee that a claim will be accepted.

### D. Add receipt / analysis flow

- Offer camera and file picker where the device supports them; accept the file types that both the local wallet and backend actually support.
- Make the difference between **Save on this device** and **Analyze using AI** unmistakable. Save the original before contacting The Ring, so a failure never loses it.
- Warn about unsupported/corrupt files, local storage limits, upload limits and unavailable network *before* a costly provider request when possible.
- Handle the same receipt uploaded twice by opening the existing saved receipt and showing an understandable message.
- Show progress steps: original saved, analysis running, result ready or a specific failure. Provider delays can be long; do not promise a fixed finish time.
- Keep previous analysis if a retry fails, and show retry options for network and save failures without duplicating records.
- Make it obvious which fields need review, especially missing date, merchant, prices, warranty duration and policy source.
- Prevent unsafe double-submit; preserve progress if the user briefly opens the file picker or returns from Android authentication.

### E. Settings and app lock

- Keep **Appearance** (Arabic/English, light/dark, normal/large font) in Settings, not repeated controls on Home.
- Keep **Analysis connection** and its client key separated from ordinary appearance preferences. Never expose provider API keys or print secrets in diagnostics.
- Preserve the native Android app-lock mechanism; the UI should say **App lock**, not promise Face ID on devices that only support a fingerprint or screen-lock PIN/password.
- Only add **Notifications** preferences when actual local scheduling, permission handling and cancel/reschedule logic exist. Until then, show upcoming deadlines on Home without fake notification switches.
- Do not add Sign out without real user accounts/sessions. There is currently no customer account flow to sign out from.
- Put destructive **Delete all receipts** behind an explicit confirmation; explain what will be lost and whether a backup/export exists.

## 5. Website UI improvements

The website should feel like a polished website, **not an Android screen stretched into a browser**. Keep its own header/navigation, landing content, informational pages, and receipt wallet.

| Route | Review / improvement goals |
| --- | --- |
| `/` | Clear product promise, visual example labeled as an illustration, trust/privacy explanation, strong Add/View receipts call to action and real wallet snapshot only when data exists. |
| `/receipts` | Search, filter, sort, readable receipt rows/cards, count feedback, mobile layout, blank/filtered/loading/error states. Preserve URL filter/sort state. |
| `/receipts/:id` | Store and item hierarchy, original preview/download, warranty bars, return/exchange dates, editing, policy evidence, attachments and safe deletion. |
| `/add` | Drag-and-drop on computers, picker/camera on phones, selected-file preview, size/type validation, Save vs Analyze choice, duplicate and provider-error handling. |
| `/settings` | Language, system/light/dark theme, price presentation, connection key, storage usage/persistence and careful delete-all confirmation. |
| `/how-it-works` | Explain save → review → analyze → track, what data stays local, what is sent to The Ring, and how to open receipts later. |
| `/privacy` | Accurately describe browser storage, external provider processing, optional in-memory server debugging, lack of cross-device sync and risks of clearing browser data. Review with backend owner before public release. |
| `/help` | Practical troubleshooting for file upload, key errors, failed analyses, original downloads, expired/unknown warranties and browser storage. |
| `/teams`, `/qr` (if available) | Review presentation-only design and accessible phone flow. Do not turn on live submissions until destination, consent, retention, validation, file limits and backend ownership are agreed. |

Website-specific points:

- Responsive header/footer, navigation and content width at phone, tablet and desktop sizes.
- Do not rely on hover: menus, file actions and dialogs must work with touch and keyboard.
- Never suggest Android receipts appear automatically on the website. Browser IndexedDB is per browser/profile, not a cloud account.
- Make original receipt download and data-loss explanations easy to find. Consider export/backup as a **separate future feature**, not something silently assumed.
- Add installable/PWA/offline website support only after agreeing on caching and private-file behavior. No service worker is present in the reported baseline.
- Do not modify website deployment or Cloudflare settings as part of routine UI changes; deploy only with Meshal's approval.

## 6. Warranty dates, return terms, and AI trust rules

- Reuse the current shared warranty calculation rules (copied in the Android and website projects) and match the backend contract. If the rule changes, update both copies **and both test suites**.
- Honor actual calendar dates, including leap years and month-end clamping. A printed fixed expiry must not move because the user changes the purchase date; a calculated duration can move according to the documented rule.
- Display **Expired** for ended warranties and precise **Return ended / Refund ended / Exchange ended** labels for ended periods, using correct Arabic equivalents.
- Unknown terms remain unknown, not 'No warranty' or a guessed period.
- Do not calculate return/refund deadlines from unrelated warranty terms. Keep refund, exchange and warranty concepts separate.
- Present readable display names without destroying the receipt's exact original item text. Keep customer-entered overrides visibly different from extracted facts where appropriate.
- Explain that AI receipt extraction is a draft; users can review/correct it. Explain warranty coverage only from provided receipt/terms evidence, with supporting wording and uncertainties.

## 7. Accessibility, localization, and content quality

- Aim for WCAG 2.2 AA where practical: visible focus, keyboard reachable controls, semantic labels/headings, clear validation, accessible dialogs and sufficient text contrast.
- Ensure important touch targets are comfortable on phones; do not hide critical actions behind tiny icons.
- Test screen readers/labels for search, progress bars, tab navigation, dialogs, upload buttons and confirmation actions. Announce loading and errors, without repeatedly announcing countdown ticks.
- Test complete English and Arabic messages, natural Saudi-friendly Arabic where appropriate, proper pluralization, number/currency display, and date-only values that avoid timezone drift.
- Audit mixed-direction display of merchants, product codes, phone numbers, receipt IDs and money values. Use icon direction intentionally in RTL layouts.
- Support large text, zoom, reduced motion and dark/light modes without clipped content or lost controls.
- Replace vague errors with actionable messages, e.g. 'File is too large', 'Save failed; original remains', 'Analysis unavailable; retry later', or 'Connection key required'. Never include raw tokens or uploaded document contents in error reports.

## 8. Privacy, security, performance, and reliability

- **Local-first storage:** Android originals/metadata stay in its private storage; website originals and analysis stay in IndexedDB. Do not wipe, migrate or reformat without a safe migration and tested rollback.
- **Uploads:** send file bytes only when Analyze or Explain coverage is pressed. Product pictures remain local unless the user explicitly chooses an applicable action.
- **Credentials:** provider secrets belong only on The Ring. The browser/app's client access key is sensitive; do not include it in URLs, screenshots, analytics, logs or repo commits. A shared client key is not strong end-user authentication.
- **Monitoring:** do not add new client telemetry, identifiers or user-content logging without coordinating with Meshal and updating privacy messaging. Report usage without filenames, receipt contents or personal data.
- **Network:** handle offline, timeout, 401, rate-limit, quota, server-busy and malformed-provider responses. Provide request IDs for troubleshooting without showing secret headers.
- **Responsiveness:** minimize unnecessary rendering, avoid large receipt blobs in screen state, revoke preview object URLs, lazy-load long lists and thumbnails where useful, and keep important interactions responsive on slower phones.
- **Error containment:** retain the app and website error boundaries so a faulty icon/component or bad receipt cannot produce a completely blank screen.
- **No surprise permissions:** request camera, biometric and future notification permissions only as part of a related action and explain the benefit.

## 9. Prioritized implementation backlog

These are **review tasks and proposed improvements**, not confirmed bugs. For every item, compare the code with the latest screenshots and mark it Done / Needs improvement / Blocked before implementation.

### P0 — Do first: reliable core journeys and visual consistency

1. Audit Android and website screens in Arabic/English, dark/light and normal/large Android text; document visible inconsistencies and broken layouts with screenshots.
2. Unify the most-used UI elements (cards, buttons, dates, status colors, icons, spacing, typography and error/empty states) within each product's design system.
3. Polish the full add → locally save → optional analyze → review/edit → reopen original flow and protect data through failures and navigation.
4. Audit receipt details: merchant, each item, known vs unknown warranty/return terms, progress bars, source evidence and important actions.
5. Verify PDF/photo previews, duplicates, long text, mixed RTL/LTR content, small screens, accessibility and error-boundary behavior.
6. Confirm Android and website calculation/text consistency, and update tests for any rule change.

### P1 — High-value UX improvements

1. Improve Home priority order and Android receipt search; consider website-style filters/sort on Android if they improve discoverability rather than clutter it.
2. Improve Settings organization, privacy/storage explanation, key-error guidance, and safe destructive confirmations.
3. Design and implement **real Android local deadline reminders** only after agreeing on supported notifications, permission UX, scheduling/cancellation, time changes, expiration updates, and local-only data handling. No pretend toggles.
4. Make empty, loading, offline, no-results and failed-analysis states specific, localized and recoverable.
5. Improve website navigation and marketing/help content so it accurately explains privacy, local storage and separate browser/app wallets.

### P2 — Later, after product/backend decisions

1. Design a local export/backup flow, then implement it only with a safe file format, privacy safeguards and restore tests.
2. Consider website PWA/offline capability after specifying how original files and updates should be cached.
3. Complete `/teams` submission integration only after Meshal specifies backend endpoint, data retention, consent, spam protection and reviewer workflow. The frontend may remain a labeled preview before that.
4. Consider account-based cross-device synchronization only as a new jointly designed system; it requires identity, storage, deletion, security and conflict rules, not just UI screens.
5. Add claims assistance, refund request tracking or store integrations only with agreed supporting data/services; do not display fabricated statuses.

## 10. Build, testing and safe rollout

**Working agreement:** develop frontend code on a dedicated feature branch based on the newest approved `Frontend-UI` state, not directly on `main`. Commit in small feature-sized changes, request review before merge, and append a real Asia/Riyadh timestamped entry to `UPDATES.md` for each update, following `AGENTS.md`. The shared-doc automation may publish plans and log entries to `main`; application code should reach `main` only through review/merge.

### Android app — from `app/`

```bash
npm ci
npm test
npm run build
# Only with an authorized test phone / environment:
npm run android:install
npm run android:test-storage
```

- Android updates must use replacement installation (`adb install -r` via existing scripts) so real wallet contents and client settings are preserved.
- Do **not** run Gradle `connectedDebugAndroidTest` on a personal device containing saved receipts; earlier project notes say that task may uninstall and reset app data. Use the project's isolated `android:test-storage` command instead.
- Test native camera picker/cancel, photo/PDF originals, relaunch persistence, installed app lock, offline retrieval and previously saved data.
- Never clear app data or delete real receipts as part of UI verification.

### Website — from `website/`

```bash
npm ci
npm test
npm run build
npm run dev
```

- Test routes and full workflows in desktop and phone-size browsers, both languages/themes, keyboard navigation and storage persistence after reload.
- Check filename/amount/date edge cases; reject incorrect file types and show readable API failures.
- `npm run deploy:ring` is a production operation; do not run it without coordinating with Meshal.
- Keep development and mock data separate from any real user receipt. Do not commit screenshots containing private invoices.

### Minimum regression scenarios

1. Empty wallet → add JPEG → save offline → analyze → correct fields → reopen after restart.
2. Add PDF → view original → save item warranty terms → explain coverage with evidence → reopen.
3. Try duplicate file → existing record opens, not a second copy.
4. Analyze with missing/wrong key, no connection, timeout, rate limit or invalid response → clear recovery without losing original.
5. Warranty active / near expiry / expired / unknown; printed fixed expiry vs calculated duration; refund vs exchange dates.
6. Arabic RTL / English LTR, dark/light, long text, large font and small-screen layouts.
7. Edit, delete an item attachment, reanalyze or delete a receipt → no orphan data or silent loss of unrelated records.
8. Browser reload, local IndexedDB persistence, safe delete-all confirmation, and clear explanation of browser-storage risk.

## 11. Definition of done (frontend acceptance checks)

- A new user understands the product and can save a receipt without creating an account or supplying a provider API key.
- Every primary screen shows real wallet data, with no fake notifications, claims, refund approvals or sign-out controls.
- An original receipt remains available after failed analysis, app restart and normal app update; browser receipts survive an ordinary reload.
- Receipt navigation is intuitive; merchants and individual items are readable; warranty/return dates and source of truth are clear.
- Arabic and English layouts both work, with readable typography, accurate translations, correct RTL behavior and consistent light/dark themes.
- UI works with touch, mouse and keyboard; buttons, inputs, dialogs, progress bars and errors are accessible.
- Search, editing, uploading, duplicates, progress, failures and deletion are covered by meaningful tests.
- Android and website warranty calculations agree where behavior is intended to match.
- No provider API secrets or private receipt contents are committed, logged or uploaded unexpectedly.
- Android builds install over the existing package without resetting wallet/app-lock/client settings; no production deployment happens without authorization.
- Documentation and an append-only update log explain what actually changed and what still needs follow-up.

## 12. Open questions to resolve with Meshal before implementation

1. Is the current remote `Frontend-UI` branch the approved baseline, or are newer app/website commits still only on Meshal's machine?
2. Which visual changes are mandatory for the presentation, and which can wait until after core flow testing?
3. Should Android receive the same filters and sorting as the website, or keep the simpler search-first UI?
4. What reminder offsets and notification experience should be used, and is native notification scheduling allowed in the first release?
5. For website and Android data-loss risks, do we prioritize export/backup now, or explicitly defer it?
6. Are `/teams` and `/qr` meant to be live after the presentation? Who owns receipt submission storage, consent text, authorization, spam protection and retention?
7. Should the private admin dashboard receive visual polish from Mazen, or stay under Meshal's backend ownership?
8. Who signs off on production deployment and app distribution after frontend changes?

## 13. Suggested first Codex task

> Read `AGENTS.md`, `UPDATES.md`, `Mazen-Plan.md`, `Meshal-Plan.md`, `Resource.md`, the root README, `app/README.md` and `website/README.md`. Inspect the current `Frontend-UI` code and do a **read-only frontend audit first**. Produce a table of each Android and website screen, what already works, concrete UI issues with evidence, affected source files, priority and test plan. Identify any mismatch between GitHub and the update log. After the audit, implement one agreed P0 improvement on a new feature branch, without touching `main`, deleting saved receipts, or deploying to The Ring. Preserve bilingual and RTL support, run relevant tests, and append a truthful log entry following `AGENTS.md`.

## References

- `AGENTS.md` — workflow and append-only update rules.
- `UPDATES.md` — feature/change history; includes work not necessarily on the remote branch.
- `Meshal-Plan.md` — backend assumptions and privacy/API boundaries.
- `Resource.md` — agreed development resources.
- `app/README.md`, `website/README.md`, `infrastructure/API.md` — implementation guidance and current API contract.

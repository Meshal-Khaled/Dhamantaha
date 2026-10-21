# Meshal's Backend Plan — Dhamantaha (ضمنتها)

Date: 2026-10-20
Status: Implementation plan; features below are not yet built.

## 1. Goal and ownership

Build the backend for a digital warranty wallet that accepts receipts, obtains analysis from an external API, and returns structured details for review. The same API will serve the website and Android application. Receipts and user-reviewed warranty records are saved locally by the phone or browser; The Ring does not permanently store customer data.

- **Meshal:** Backend relay on The Ring, API configuration and integrations, request validation, and a small HTML page for testing and debugging.
- **Frontend teammate:** Customer-facing web and Android interfaces, camera/file selection, review screens, local receipt/warranty storage and reminders, and connecting those interfaces to the API.
- **Initial scope:** A development MVP with device-local records and no cloud sync. Product accounts and cross-device access come later. Protect access to paid API calls before exposing the relay publicly.

## 2. Technology choices

- **Node.js + Express:** Receipt-analysis backend hosted on The Ring, with validation, PDF text extraction, provider calls, and structured responses.
- **Google Gen AI JavaScript SDK (`@google/genai`):** Gemini requests for text and visual analysis.
- **Device-local storage:** The phone/browser stores original receipts, purchased items, and reviewed warranty records. Agree on the appropriate storage implementation for each client with the frontend teammate. No receipt database or permanent upload directory on The Ring.
- **PDF text extraction library:** Extract embedded text before requesting text analysis. Choose a maintained Node.js library after checking Arabic text extraction on sample receipts.
- **Plain HTML + JavaScript:** A small debugging interface served by Express.

Use a supported Node.js LTS release. Keep the Gemini model configurable rather than hardcoding a model name or assuming a particular free-tier allowance.

## 3. The Ring and receipt input

### Cloud relay architecture

**The Ring** is Meshal's existing cloud instance, which holds API keys for computer vision and other services. It is infrastructure owned by Meshal, not the customer's phone or app. Deploy or expose the Node.js/Express analysis backend there; confirm the instance's existing services and routing during implementation.

Request flow:

`Phone/browser -> HTTPS -> The Ring -> analysis provider (initially Gemini) -> The Ring -> phone/browser`

- The client sends the receipt to The Ring. The Ring selects the configured provider, adds its server-side credentials, submits the receipt or extracted text, validates the result, and returns structured JSON.
- Gemini or the chosen external service performs the AI analysis. The phone receives the analysis for display, correction, and local saving.
- Provider API keys stay in server environment configuration or secret storage on The Ring. They are never included in the Android package, browser bundle, HTML debugging page, or API response.
- The Ring stores configuration and credentials, but no permanent receipts, extracted text, analysis results, or warranty records. Process bounded requests in memory; configure upload middleware and the reverse proxy to avoid writing request bodies to disk. Reject files exceeding those limits rather than silently spooling them to disk.
- Release request buffers after success, failure, timeout, or client disconnect. Disable request/response body caching and use `Cache-Control: no-store` on analysis responses. Keep receipt payloads out of logs, monitoring events, and debug captures.
- This describes retention on The Ring. The external provider's processing and retention depend on its own API terms and configuration; a relay does not make that service device-local.
- Local data on one device is not automatically available on another device or in another browser. Backup/export and cloud sync require separate scope and design.

### Accepted inputs

Customers can take a receipt photo or upload an existing file. Both actions submit a file to the same analysis endpoint. The backend determines processing from the validated file contents, regardless of how the file was selected.

Initially accept PDF, JPG/JPEG, and PNG. Reject unsupported or invalid files with a clear error. Set explicit upload-size and PDF-page limits before implementation testing.

### A. Camera photos and uploaded images

1. Receive and validate the image.
2. Send the image to Gemini for visual receipt analysis.
3. Request structured receipt and purchased-item details.
4. Validate the response and return it for user review.

### B. PDFs containing readable text

1. Receive and validate the PDF.
2. Attempt local text extraction, checking whether the receipt details remain readable and usable.
3. Send the extracted text to Gemini for text analysis.
4. Validate the response and return it for user review.

This path sends extracted text, rather than the original PDF, when visual processing is unnecessary.

### C. Scanned, mixed-content, or poorly extracted PDFs

A PDF can contain scanned images, embedded text, or both. Its extension alone does not determine whether visual processing is needed.

1. If extracted text is absent, garbled, or fails to capture the relevant receipt content, use Gemini's PDF visual understanding.
2. Do not discard scanned pages just because another page contains extractable text.
3. If the receipt remains unreadable, return an actionable error so the customer can retry with a clearer file.

## 4. Analysis result and user review

Return the same response structure for images and PDFs, including:

- Request identifier for troubleshooting and processing method: `image`, `pdf_text`, or `pdf_visual`. The identifier is not a stored receipt reference or download URL.
- Merchant, purchase date, receipt number, currency, and total where available.
- Purchased items, quantities, prices, and product identifiers where stated.
- Warranty information only where explicitly present in the receipt or supplied by the user.
- Missing fields or uncertainties that need review.

Use `null` for unknown values. Do not invent warranty coverage, duration, product details, or purchase dates. A receipt does not necessarily state the warranty terms.

Analysis produces a draft. The client retains the original receipt and associates it with a local receipt identifier. The user reviews and corrects the draft before saving it locally; The Ring does not save the draft or receipt. Allow the user to enter warranty duration or an expiration date when the receipt does not provide it. Calculate an expiration date only when the necessary dates and warranty terms are known.

Support multiple purchased items on one receipt, with a separate local warranty record for each item the user chooses to track. The client calculates warranty status and expiration dates from the reviewed terms using an agreed calculation rule, so later edits and reminders do not require another analysis request.

## 5. API contract with the frontend teammate

Agree on request fields, example responses, date formats, and errors before building the customer interface. Use JSON responses and one consistent error format. Represent purchase and expiration dates as date-only values (`YYYY-MM-DD`).

| Endpoint | Purpose |
| --- | --- |
| `GET /health` | Confirm the server is running without calling Gemini. |
| `POST /receipts/analyze` | Accept one multipart upload under `file`; return a request identifier, processing method, and structured draft without saving receipt data. |

Warranty save/list/read/update/delete operations and original receipt display use local client storage, so there are no server-side warranty CRUD or receipt download endpoints in this scope. Saving or editing a local record must not trigger another Gemini call. The HTML debugging page and customer clients use the same analysis contract. Define field validation, local IDs, warranty calculations, and an error response format together. Keep provider destinations server-configured; the client cannot supply arbitrary target URLs or choose arbitrary services on The Ring.

## 6. Configuration, errors, and monitoring

- Keep Gemini and other provider API keys only on The Ring in server environment configuration or secret storage. Supply an `.env.example` containing placeholders and exclude real keys and test receipts from Git. Never return provider credentials to the client.
- Validate file contents, size, and PDF page count on The Ring. Validate provider responses before returning them. Validate user-edited warranty fields in the client; they are stored locally.
- Use HTTPS and restrict browser cross-origin access to the frontend origins used for testing. CORS is not authentication. Define caller authorization, rate limits, request concurrency limits, and provider spending limits before exposing paid analysis publicly; do not embed a shared provider secret in the client.
- Handle invalid files, unreadable receipts, malformed AI output, Gemini timeouts or quota limits, and access/rate-limit failures with consistent errors. Redact provider errors before returning them.
- Log only minimal operational metadata such as request identifiers, processing method, duration, and failure category. Keep uploaded files, extracted text, analysis results, authorization headers, personal information, and API keys out of application and proxy logs.
- Add Sentry as an optional integration after the core flow works. Keep receipt contents out of monitoring events.
- No customer database is hosted on The Ring in this scope. Client storage must handle local save failures and deletion, and clearly communicate that clearing app/browser data or losing the device may remove records without a backup.

## 7. Small HTML debugging page

Serve a simple page from Express that can select an accepted file, call the analysis endpoint, show the processing method and formatted result, and edit extracted fields. Include minimal browser-local save/list/update/delete controls to exercise the local workflow; these do not call warranty storage endpoints on The Ring. Show loading states, backend errors, local storage failures, and a clear-local-data control.

Include an image capture option for testing on a phone where supported. Camera access and the customer's polished upload flow remain part of the frontend teammate's work.

## 8. Implementation order

1. **Relay foundation:** Confirm The Ring deployment/routing, then add Express, server-only configuration, error handling, health endpoint, and HTML debugging page.
2. **Upload handling:** File validation, bounded in-memory processing, accepted-file limits, and proxy settings that avoid persisting request bodies.
3. **Receipt analysis:** Gemini image analysis, PDF text extraction, visual fallback, and response validation.
4. **Local workflow:** Agree on the client storage model, receipt/item links, warranty calculations, and local CRUD with the frontend teammate; add a minimal browser-local version to the debugging page.
5. **Team integration:** API examples, frontend connection, HTTPS access to The Ring, caller authorization, rate/concurrency limits, browser-origin configuration, and Android testing.
6. **Verification and monitoring:** Focused tests, metadata-only logs, memory cleanup and no-persistence checks, optional Sentry, and setup documentation.

## 9. MVP acceptance checks

- A camera photo and an uploaded image both return reviewable receipt details.
- A readable digital PDF follows the text-analysis path.
- A scanned PDF follows the visual-analysis path; mixed PDFs do not lose scanned receipt content.
- Arabic and English sample receipts are checked for extraction quality.
- Multiple items on one receipt can become separate warranty records.
- Missing warranty terms remain unknown until entered or confirmed by the user.
- Reviewed records and receipts survive closing/reopening the client and can be retrieved, corrected, and deleted locally. Restarting The Ring does not affect saved client data.
- Unsupported files, malformed AI responses, timeouts, and quota failures produce understandable errors.
- The HTML page and teammate's client use the same API contract.
- No provider API key appears in the Android package, browser code, debugging page, network responses, or client storage.
- After success, timeout, rejection, and disconnect, no receipt files, extracted text, analysis results, or warranty records remain in The Ring's disk storage, caches, logs, or monitoring captures.
- The configured relay limits keep concurrent requests within the instance's memory budget and protect provider quota.
- Local saving, viewing, editing, deletion, and reminders work without calling the analysis API again. New receipt analysis requires connectivity.
- Setup instructions explain The Ring configuration, environment variables, starting the server, local client storage, storage-loss behavior, and phone testing.

## Warranty Coverage Explainer rule

Users can attach a warranty-terms photo or PDF to each item. AI may summarize only what appears covered, excluded, or unclear in the supplied terms, with exact supporting quotations and printed clause/page references when available. Do not infer coverage from a warranty duration, brand, store name, outside knowledge, or law, and do not promise claim acceptance. Show the original source wording alongside the summary so the user can check it before contacting the provider. If the receipt-analysis payload already includes an evidence-backed `items[].warranty.coverage`, display it without another AI request. Missing terms remain unknown. Product photos stay local and are not sent for warranty explanation; explaining attached terms is a separate explicit action. Save attachments and summaries per item on the device, preserve their association when a receipt is re-analyzed, and delete them with the receipt.

## References

- [Express documentation](https://expressjs.com/)
- [Google Gen AI JavaScript SDK](https://googleapis.github.io/js-genai/)
- [Gemini API key security](https://ai.google.dev/gemini-api/docs/api-key)
- [Gemini image understanding](https://ai.google.dev/gemini-api/docs/image-understanding)
- [Gemini PDF document understanding](https://ai.google.dev/gemini-api/docs/document-processing)

## QR presentation operations — 21 October 2026

The QR website routes presentation traffic to one dedicated shared QR backend, which rotates the three registered Ring Gemini keys, admits five analyses per five-second window and supports at most five concurrent analyses. Throttled slots cool down for 60 seconds and clients honor Retry-After. The control panel exposes only QR containers on its logs page. With explicit submission consent, a participant's name and team are kept as private operational metadata and shown with their container path and request outcome; contacts/notes are not submitted, labels are excluded from Gemini input and raw Docker logs, and no receipt body is persisted by this feature. The live request history is bounded to 100 entries. Historical users without container attribution remain unknown. A real 25-visitor burst exposed provider quota failures and does not establish capacity for 30 simultaneous visitors; project quotas or pacing remain to be resolved.


The subsequent paced check completed all 25 synthetic PDF visitors with 25 provider calls, no provider errors and a 9/8/8 winning-key distribution. Its first pass completed 24 in 35.042 seconds; a test-client connection failed before reaching the server and succeeded in a separate 4.053-second retry. This verifies the paced synthetic PDF workload, not every photo size or token workload.

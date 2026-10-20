# Dhamantaha infrastructure API (v1)

**Client base URL:** `https://dhamantaha.arc-homlab.com/v1`.
Append `/receipts/analyze` for receipt uploads and `/health` for health checks.
The website root is the private admin dashboard, with separate API settings and monitoring pages.

For the app developer. The live, clickable version of this contract is at `/docs` on any running server. Its machine-readable form is `/openapi.json`, which is generated from the same schemas the server enforces.

The service turns one photo or PDF of a bill into wallet-ready data. **It does not store receipts or analysis results.** The app shows the result for review and saves the wallet on the phone. Provider settings and credentials remain private on The Ring; monitoring retains only bounded operational metadata in memory.

- JSON, camelCase. Dates are `YYYY-MM-DD` (Gregorian). Unknown values are `null`; nothing is guessed.
- Every response has an `X-Request-Id` header. Quote it when reporting a problem; it is not a receipt reference.
- All responses send `Cache-Control: no-store`.
- Paths are versioned (`/v1`). Breaking changes will go to `/v2`, so installed app versions keep working.
- Production runs only over HTTPS. Android blocks plain-HTTP requests by default.

## `GET /health`

Does not call the analysis provider.

```json
{
  "status": "ok",
  "provider": "gemini",
  "clientKeyRequired": false,
  "limits": {
    "acceptedTypes": ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "image/avif"],
    "maxImageBytes": 20971520,
    "maxPdfBytes": 10485760,
    "maxPdfPages": 10
  }
}
```

`provider` is `"gemini"`, `"mock"` (fixed sample data for development), or `null` (analysis not configured). Use `limits` to reject files before uploading them.

## `POST /v1/receipts/analyze`

`multipart/form-data` with exactly one file in the `file` field. The type is detected from the file's bytes, not its name. If `clientKeyRequired` is true, send `X-Client-Key: <key>`.

From a Capacitor app (camera or gallery):

```js
import { Camera, CameraResultType } from '@capacitor/camera';

const API_BASE = 'https://dhamantaha.arc-homlab.com/v1';

const photo = await Camera.getPhoto({ resultType: CameraResultType.Uri, quality: 90 });
const blob = await (await fetch(photo.webPath)).blob();

const form = new FormData();
form.append('file', blob, `receipt.${photo.format}`);
const response = await fetch(`${API_BASE}/receipts/analyze`, {
  method: 'POST',
  body: form, // don't set Content-Type; fetch adds the multipart boundary
  headers: CLIENT_KEY ? { 'X-Client-Key': CLIENT_KEY } : {},
});
const result = await response.json();
```

### Success: `200`

```json
{
  "requestId": "3cc93c7f-a6e7-4912-9139-197049340a81",
  "processingMethod": "image",
  "receipt": {
    "merchantName": "eXtra Electronics",
    "branchName": "Riyadh Park Branch",
    "customerServicePhone": "920000000",
    "purchaseDate": "2026-10-01",
    "receiptNumber": "INV-20261001-77",
    "currency": "SAR",
    "total": 3499,
    "warrantyNotes": null,
    "returnPolicy": {
      "sourceText": "Exchange within 7 days, refund within 3 days with the original receipt.",
      "returnDurationValue": 3,
      "returnDurationUnit": "days",
      "exchangeDurationValue": 7,
      "exchangeDurationUnit": "days"
    }
  },
  "items": [
    {
      "description": "GALAXY PHONE S99 256GB SM-S99 الجوالات",
      "displayName": "Galaxy Phone S99 256GB",
      "category": "الجوالات",
      "quantity": 1,
      "unitPrice": 3499,
      "totalPrice": 3499,
      "productIdentifier": "SM-S99",
      "warranty": {
        "statedOnReceipt": true,
        "sourceText": "Warranty: 2 years manufacturer warranty",
        "durationValue": 2,
        "durationUnit": "years",
        "expirationDate": "2028-10-01",
        "expirationBasis": "calculated",
        "status": "active",
        "provider": "Samsung"
      }
    }
  ],
  "review": {
    "missingFields": [],
    "uncertainties": [{ "field": "receipt.total", "note": "Total is partly smudged." }]
  }
}
```

| Field | Meaning |
| --- | --- |
| `processingMethod` | `image` (photo), `pdf_text` (the PDF's embedded text was analyzed), or `pdf_visual` (scanned or mixed PDF, analyzed as an image). |
| `receipt.currency` | ISO 4217 code or `null`. Amounts are plain numbers. |
| `receipt.branchName` | Branch, outlet, or location of the store as printed (never a repeat of `merchantName`), or `null`. |
| `receipt.customerServicePhone` | Customer service or hotline number, else the store phone, as digits with optional `+`, spaces, and `-`. `null` if none is printed. |
| `receipt.returnPolicy` | Always an object. `sourceText` is the printed return, exchange, or refund policy (or `null`). `returnDurationValue`/`Unit` (refund) and `exchangeDurationValue`/`Unit` are set only when that text states them. |
| `items[].description` | The whole item line as printed, kept for reference. |
| `items[].displayName` | Short readable name to show: no codes, category labels, or stray symbols, and no all-caps. Falls back to `description`. |
| `items[].category` | Category or department label printed on the line, or `null`. |
| `items[].productIdentifier` | SKU, model, serial, barcode, or product code, if printed. |
| `warranty.statedOnReceipt` | `true` only when the receipt explicitly states a warranty for the item, with the wording in `sourceText`. When `false`, the user must enter the terms. |
| `warranty.durationValue` / `durationUnit` | Whole number plus `days`, `weeks`, `months`, or `years`. Both are set, or both are `null`. |
| `warranty.expirationDate` / `expirationBasis` | `printed` (on the receipt) or `calculated` (purchase date + duration), or `null` if unknown. |
| `warranty.status` | `active`, `expiring_soon` (≤ 30 days left), `expired`, or `unknown`, as of today in the server's `WALLET_TIME_ZONE`. Recalculate on the phone for display. |
| `warranty.provider` | Company that gives the warranty when the receipt names one other than the seller (manufacturer, agent, extended-warranty company), else `null`. |
| `review.missingFields` | Paths still `null` that the user should fill in. `items[i].warranty` means no expiration is known yet. |
| `review.uncertainties` | Values the user should double-check. |

### Errors

Every error has the same shape. `message` is safe to show the user; branch on `code`.

```json
{ "error": { "code": "file_too_large", "message": "The photo is larger than the 20 MB limit.", "requestId": "…" } }
```

| HTTP | `code` | Meaning | App action |
| --- | --- | --- | --- |
| 400 | `no_file`, `invalid_upload` | No file, wrong field name, or more than one file | Fix the request |
| 401 | `unauthorized_client` | Missing or unknown `X-Client-Key` | Check the build's key |
| 413 | `file_too_large` | Over the photo or PDF limit | Ask for a smaller file |
| 415 | `unsupported_file_type` | Not a supported photo or PDF | Ask for another file |
| 422 | `invalid_file` | Damaged image or PDF | Ask for another file |
| 422 | `pdf_password_protected` | Encrypted PDF | Ask for an unprotected copy |
| 422 | `too_many_pages` | Over the PDF page limit | Ask for the receipt pages only |
| 422 | `image_too_large` | Too many pixels | Ask for a normal photo |
| 422 | `unreadable_receipt` | No receipt details could be read | Ask for a clearer photo |
| 429 | `rate_limited` | Too many requests from this network | Wait for `Retry-After` |
| 502 | `analysis_malformed`, `analysis_unavailable` | Provider problem | Retry later |
| 503 | `analysis_quota_exceeded`, `daily_limit_reached`, `server_busy` | Capacity or cost limits | Wait for `Retry-After` |
| 503 | `analysis_not_configured` | Server has no provider | Contact the backend owner |
| 504 | `analysis_timeout` | Analysis took too long | Retry |
| 404 | `not_found` | Unknown endpoint | Fix the URL |
| 500 | `internal_error` | Unexpected server error | Retry; report the `requestId` |

## The wallet on the phone

Proposed local model, to agree with the frontend:

- **Receipt**: a local `id` (UUID), `createdAt`, `updatedAt`, the original file (kept on the phone only), `analysis` (`requestId`, `processingMethod`), the reviewed `receipt` fields, and all `items`.
- **Wallet entry**: one per item the user chooses to track: `id`, `receiptId`, `itemIndex`, `description`, `productIdentifier`, `purchaseDate`, `durationValue`, `durationUnit`, `expirationDate`, `expirationBasis` (`printed`, `calculated`, or `user`), and `updatedAt`.

Edits and reminders work offline and never call this API again. To recalculate expiry dates exactly as the server does, import the dependency-free rule in [`src/wallet/warranty.js`](src/wallet/warranty.js): `resolveExpiration`, `warrantyStatus`, and `addDuration`. The rule:

1. An explicit expiration date (printed, or entered by the user) wins.
2. Otherwise, expiration = purchase date + duration. Month and year additions clamp to the month's last day (Jan 31 + 1 month = Feb 28/29).
3. The expiration day itself is covered.
4. With neither, the expiry is unknown.

Data saved on the phone is lost if the app's data is cleared or the device is lost. There is no backup or sync in this version.

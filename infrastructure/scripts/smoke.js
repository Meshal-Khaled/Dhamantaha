// Sends one receipt to a running server and prints a summary of the result.
// Usage: npm run smoke -- <file> [--url http://127.0.0.1:3000] [--key <client key>]
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { parseArgs } from 'node:util';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    url: { type: 'string', default: process.env.SMOKE_URL ?? 'http://127.0.0.1:3000' },
    key: { type: 'string', default: process.env.SMOKE_CLIENT_KEY },
    json: { type: 'boolean', default: false },
  },
});

const [file] = positionals;
if (!file) {
  console.error('Usage: npm run smoke -- <file> [--url http://127.0.0.1:3000] [--key <client key>] [--json]');
  process.exit(2);
}

const form = new FormData();
form.append('file', new Blob([await readFile(file)]), basename(file));

const started = Date.now();
const response = await fetch(`${values.url}/v1/receipts/analyze`, {
  method: 'POST',
  body: form,
  headers: values.key ? { 'X-Client-Key': values.key } : {},
});
const body = await response.json();
const seconds = ((Date.now() - started) / 1000).toFixed(1);

if (values.json) {
  console.log(JSON.stringify(body, null, 2));
} else if (!response.ok) {
  console.log(`HTTP ${response.status} in ${seconds}s · ${body.error?.code}: ${body.error?.message}`);
} else {
  const { receipt, items, review, processingMethod } = body;
  console.log(`HTTP 200 in ${seconds}s · ${processingMethod}`);
  console.log(`Merchant: ${receipt.merchantName ?? '—'} · Date: ${receipt.purchaseDate ?? '—'} · Total: ${receipt.total ?? '—'} ${receipt.currency ?? ''}`);
  for (const [index, item] of items.entries()) {
    const w = item.warranty;
    const warranty = w.statedOnReceipt ? `${w.durationValue ?? '?'} ${w.durationUnit ?? ''} → ${w.expirationDate ?? 'unknown'} (${w.status})` : 'no warranty stated';
    console.log(`  ${index + 1}. ${item.description ?? '—'} × ${item.quantity ?? '?'} = ${item.totalPrice ?? '—'} · ${warranty}`);
  }
  if (review.missingFields.length) console.log(`Missing: ${review.missingFields.join(', ')}`);
  for (const u of review.uncertainties) console.log(`Check: ${u.field} — ${u.note}`);
}
process.exit(response.ok ? 0 : 1);

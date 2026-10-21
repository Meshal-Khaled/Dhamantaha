// Explicit two-stage synthetic workload: prepare named visitors, then run the burst.
import { readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';
const { values } = parseArgs({ options: { url: { type: 'string' }, file: { type: 'string' }, label: { type: 'string' }, 'batch-size': { type: 'string' }, 'batch-delay-ms': { type: 'string' }, prepare: { type: 'boolean' }, run: { type: 'boolean' } } });
if (!values.url || !values.file || Boolean(values.prepare) === Boolean(values.run)) throw new Error('Use --url URL --file run.json with exactly one of --prepare or --run.');
const base = values.url.replace(/\/$/, '');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const batchSize = Number(values['batch-size'] ?? 5);
const intervalMs = Number(values['batch-delay-ms'] ?? 5000);
if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 25 || !Number.isInteger(intervalMs) || intervalMs < 0 || intervalMs > 60_000) throw new Error('Invalid batch pacing.');
const label = values.label ?? 'PACED25';
if (!/^[A-Z0-9 -]{1,20}$/.test(label)) throw new Error('Use a short uppercase synthetic-test label.');

function pdf(index) {
  const lines = ['QR LOAD TEST STORE', `Receipt TEST-QR25-${index}`, new Date().toISOString().slice(0, 10), 'USB cable 1 x 25.00 SAR', 'TOTAL SAR 25.00', 'Synthetic load test. No customer data.'];
  const stream = `BT /F1 12 Tf 50 750 Td 16 TL ${lines.map(line => `(${line}) Tj T*`).join(' ')} ET`;
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`];
  let result = '%PDF-1.4\n'; const offsets = [0];
  objects.forEach((object, i) => { offsets.push(Buffer.byteLength(result)); result += `${i + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(result);
  result += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(result);
}

if (values.prepare) {
  const run = { runId: randomUUID(), preparedAt: new Date().toISOString(), base, batchSize, intervalMs, users: Array.from({ length: 25 }, (_, i) => ({ deviceId: randomUUID(), name: `TEST ${label} ${String(i + 1).padStart(2, '0')}`, team: `TEST ${label} Team ${Math.floor(i / 5) + 1}` })) };
  for (const user of run.users) {
    const response = await fetch(`${base}/v1/qr/usage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ deviceId: user.deviceId, events: { app_visit: 1 }, profile: { name: user.name, team: user.team } }), signal: AbortSignal.timeout(15_000) });
    if (response.status !== 202) throw new Error(`Registration failed: ${response.status}`);
  }
  await writeFile(values.file, JSON.stringify(run, null, 2));
  console.log('Prepared 25 named synthetic visitors in five teams. No Gemini analyses have been sent.');
} else {
  const run = JSON.parse(await readFile(values.file, 'utf8'));
  if (run.base !== base || run.users.length !== 25 || run.results || run.startedAt) throw new Error('Expected one prepared, unused 25-user test run for this URL.');
  const started = Date.now();
  await writeFile(values.file, JSON.stringify({ ...run, startedAt: new Date(started).toISOString() }, null, 2));
  const results = await Promise.all(run.users.map(async (user, i) => {
    await wait(Math.floor(i / (run.batchSize ?? batchSize)) * (run.intervalMs ?? intervalMs));
    const start = Date.now(); let busyRetries = 0;
    for (;;) {
      try {
        const form = new FormData(); form.append('file', new Blob([pdf(i + 1)], { type: 'application/pdf' }), `synthetic-${i + 1}.pdf`);
        const response = await fetch(`${base}/v1/qr/receipts/analyze`, { method: 'POST', headers: { 'X-Install-Id': user.deviceId }, body: form, signal: AbortSignal.timeout(95_000) });
        const data = await response.json();
        if (data.error?.code === 'server_busy' && busyRetries < 20 && Date.now() - start < 180_000) {
          busyRetries++;
          const seconds = Math.max(5, Math.min(60, Number(response.headers.get('Retry-After')) || 5));
          console.log(JSON.stringify({ name: user.name, waitingSeconds: seconds, busyRetries }));
          await wait(seconds * 1000 + Math.random() * 500); continue;
        }
        const result = { name: user.name, team: user.team, ok: response.ok && Boolean(data.receipt?.merchantName) && data.items?.length > 0, status: response.status, code: data.error?.code ?? null, requestId: data.requestId ?? data.error?.requestId, durationMs: Date.now() - start, busyRetries };
        console.log(JSON.stringify(result)); return result;
      } catch (error) {
        const result = { name: user.name, team: user.team, ok: false, code: error.name, durationMs: Date.now() - start, busyRetries };
        console.log(JSON.stringify(result)); return result;
      }
    }
  }));
  const durations = results.map(result => result.durationMs).sort((a, b) => a - b);
  const summary = { total: 25, batchSize: run.batchSize ?? batchSize, intervalMs: run.intervalMs ?? intervalMs, succeeded: results.filter(result => result.ok).length, failed: results.filter(result => !result.ok).length, busyRetries: results.reduce((n, result) => n + result.busyRetries, 0), elapsedMs: Date.now() - started, medianMs: durations[12], p95Ms: durations[23], maxMs: durations[24] };
  await writeFile(values.file, JSON.stringify({ ...run, completedAt: new Date().toISOString(), summary, results }, null, 2));
  console.log(JSON.stringify(summary));
  if (summary.failed) process.exitCode = 1;
}

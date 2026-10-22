const $ = (id) => document.getElementById(id);
const isMonitoring = location.pathname.endsWith('/api-monitoring') || location.pathname.endsWith('/monitoring');
const isUsers = location.pathname.endsWith('/users');
const isLogs = location.pathname.endsWith('/logs');
const pagePath = isLogs ? '/dashboard/logs' : isUsers ? '/dashboard/users' : isMonitoring ? '/dashboard/api-monitoring' : '/dashboard/api-settings';
const destinations = ['/dashboard/api-settings', '/dashboard/api-monitoring', '/dashboard/users', '/dashboard/monitoring', '/dashboard/logs'];
const destination = destinations.includes(new URLSearchParams(location.search).get('next'))
  ? new URLSearchParams(location.search).get('next') : pagePath;
let monitoringTimer;
let toastTimer;
const baseUrl = `${location.origin}/v1`;
let providerSettings;
const selectedProvider = () => providerSettings?.providers.find((p) => p.id === $('saved-provider').value);
function options(select, rows, value) {
  select.replaceChildren(...rows.map(([id, label]) => new Option(label, id, false, id === value)));
}
function inputSupport(preset) {
  return preset.pdf ? 'Photos and PDFs; the selected model must support these inputs.'
    : preset.images ? 'Photos and PDFs with readable text. Scanned PDFs need a provider with PDF input.'
      : 'PDFs with readable text only. This provider does not accept photos or scanned PDFs.';
}

function toast(message) {
  $('toast').textContent = message;
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 5000);
}

async function api(path, { body, method = 'GET' } = {}) {
  const response = await fetch(`/admin/api${path}`, {
    method, credentials: 'same-origin', cache: 'no-store',
    headers: { 'X-Dashboard-Request': '1', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401 && path !== '/login') {
      location.replace(`/dashboard/login?next=${encodeURIComponent(pagePath)}`);
    }
    throw new Error(data.error?.message || 'The request could not be completed.');
  }
  return data;
}

function renderSettings(data, editing = data.activeProvider) {
  providerSettings = data;
  const selected = data.providers.find((p) => p.id === editing) ?? data.providers[0];
  const preset = data.catalog.find((p) => p.type === selected.type);
  options($('saved-provider'), data.providers.map((p) => [p.id, `${p.label}${p.id === data.activeProvider ? ' · Active' : ''}`]), selected.id);
  options($('new-provider-type'), data.catalog.map((p) => [p.type, p.label]), $('new-provider-type').value || 'openrouter');
  $('model').value = selected.model || '';
  $('provider-key').value = '';
  $('provider-base-url').value = selected.baseUrl;
  $('provider-base-url').readOnly = selected.type !== 'custom';
  $('provider-input-note').textContent = inputSupport(preset);
  $('key-status').textContent = selected.keyConfigured ? 'Key configured' : 'No key configured';
  $('provider-title').textContent = selected.label;
  $('route-provider').textContent = data.label;
  $('active-provider-note').textContent = `Current analysis provider: ${data.label}. Saving another provider does not switch active requests.`;
  $('activate-provider').hidden = selected.id === data.activeProvider;
  $('activate-provider').disabled = !data.canSave;
  $('remove-provider').hidden = selected.id === 'gemini' || selected.id === data.activeProvider;
  $('provider-badge').textContent = data.provider === 'mock' ? 'Development mock' : data.configured ? 'Provider configured' : 'Setup needed';
  $('provider-badge').classList.toggle('warning', !data.configured || data.provider === 'mock');
  $('key-source-note').textContent = selected.keySource === 'dashboard'
    ? 'This service uses a key saved from this dashboard. It stays on The Ring and is never returned to the browser.'
    : selected.keySource === 'ring' ? 'Using the existing Gemini key on The Ring. Add a key above to override it for Dhamantaha only.'
      : 'Add your provider API key. It will be stored privately on The Ring.';
  $('use-ring-key').hidden = selected.id !== 'gemini' || selected.keySource !== 'dashboard';
  $('save-provider').disabled = !data.canSave;
  $('api-base').textContent = baseUrl;
  if (!data.canSave) feedback('Settings storage is not configured on this server.', false);
}

$('saved-provider').addEventListener('change', () => { renderSettings(providerSettings, $('saved-provider').value); feedback('', true); });
function prepareNewProvider() {
  const preset = providerSettings.catalog.find((p) => p.type === $('new-provider-type').value);
  $('new-provider-url').value = preset.baseUrl;
  $('new-provider-url').readOnly = preset.type !== 'custom';
  $('new-provider-label').value = preset.type === 'custom' ? '' : preset.label;
  $('new-provider-help').textContent = inputSupport(preset);
}
function openAddProvider(custom) {
  if (!providerSettings) return;
  $('add-provider-form').hidden = false;
  $('new-provider-type').value = custom ? 'custom' : 'openrouter';
  $('new-provider-feedback').textContent = '';
  prepareNewProvider();
  $('new-provider-label').focus();
}
$('add-provider').addEventListener('click', () => openAddProvider(false));
$('custom-provider').addEventListener('click', () => openAddProvider(true));
$('new-provider-type').addEventListener('change', prepareNewProvider);
$('cancel-add-provider').addEventListener('click', () => { $('add-provider-form').reset(); $('add-provider-form').hidden = true; });
$('add-provider-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  $('create-provider').disabled = true;
  try {
    const data = await api('/providers', { method: 'POST', body: { type: $('new-provider-type').value,
      label: $('new-provider-label').value, baseUrl: $('new-provider-url').value,
      model: $('new-provider-model').value, apiKey: $('new-provider-key').value } });
    renderSettings(data, data.providers.at(-1).id);
    $('add-provider-form').reset();
    $('add-provider-form').hidden = true;
    feedback('Provider saved. Check its key and model, then choose Use this provider when ready.', true);
  } catch (err) { $('new-provider-feedback').textContent = err.message; }
  finally { $('create-provider').disabled = false; }
});
$('activate-provider').addEventListener('click', async () => {
  $('activate-provider').disabled = true;
  try { renderSettings(await api(`/providers/${encodeURIComponent(selectedProvider().id)}/activate`, { method: 'POST' })); feedback('Active provider updated. New analysis requests use it immediately.', true); }
  catch (err) { feedback(err.message, false); }
  finally { $('activate-provider').disabled = false; }
});
$('remove-provider').addEventListener('click', async () => {
  const selected = selectedProvider();
  if (!confirm(`Remove ${selected.label} and its saved key?`)) return;
  try { renderSettings(await api(`/providers/${encodeURIComponent(selected.id)}`, { method: 'DELETE' })); feedback('Provider removed.', true); }
  catch (err) { feedback(err.message, false); }
});

function feedback(message, ok) {
  $('provider-feedback').textContent = message;
  $('provider-feedback').classList.toggle('success', ok);
}

$('login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = event.submitter;
  button.disabled = true;
  $('login-error').textContent = '';
  try {
    await api('/login', { method: 'POST', body: { key: $('admin-key').value } });
    $('admin-key').value = '';
    location.replace(destination);
  } catch (err) {
    $('admin-key').value = '';
    $('login-error').textContent = err.message;
  } finally { button.disabled = false; }
});

$('provider-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  $('save-provider').disabled = true;
  feedback('', true);
  try {
    const providerId = selectedProvider().id;
    const data = await api('/settings', { method: 'PUT', body: { providerId, model: $('model').value, apiKey: $('provider-key').value, baseUrl: $('provider-base-url').value } });
    renderSettings(data, providerId);
    feedback(providerId === data.activeProvider ? 'Settings saved. New analysis requests use this configuration.' : 'Provider settings saved. Choose Use this provider to activate it.', true);
    toast('API settings saved');
  } catch (err) { feedback(err.message, false); }
  finally { $('save-provider').disabled = false; }
});

$('check-provider').addEventListener('click', async () => {
  $('check-provider').disabled = true;
  feedback('Checking the saved key and model with the provider…', true);
  try { feedback((await api('/settings/check', { method: 'POST', body: { providerId: selectedProvider().id } })).message, true); }
  catch (err) { feedback(err.message, false); }
  finally { $('check-provider').disabled = false; }
});

$('use-ring-key').addEventListener('click', async () => {
  $('use-ring-key').disabled = true;
  try {
    renderSettings(await api('/settings/key', { method: 'DELETE' }));
    feedback('Now using the existing Ring key. The service-specific key was removed.', true);
  } catch (err) { feedback(err.message, false); }
  finally { $('use-ring-key').disabled = false; }
});

$('copy-base').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(baseUrl); toast('API base URL copied'); }
  catch { toast('Copy the base URL shown in Connection details.'); }
});

$('logout').addEventListener('click', async () => {
  try { await api('/logout', { method: 'POST' }); location.replace('/dashboard/login'); }
  catch (err) { toast(err.message); }
});

const number = (value) => new Intl.NumberFormat('en').format(value);
const duration = (ms) => ms === null ? '—' : ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
function uptime(seconds) {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ${Math.floor(seconds % 3600 / 60)}m`;
  return `${Math.floor(seconds / 86400)}d ${Math.floor(seconds % 86400 / 3600)}h`;
}

const timeOf = (iso) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const dayTime = (iso) => new Date(iso).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' });
const RANGES = {
  hour: { label: 'The last 60 minutes', start: '60 minutes ago', mid: '30 minutes ago', empty: 'No analysis requests in the last hour.' },
  day: { label: 'The last 24 hours, by hour', start: '24 hours ago', mid: '12 hours ago', empty: 'No analysis requests in the last 24 hours.' },
  week: { label: 'The last 7 days, in 6-hour blocks', start: '7 days ago', mid: '3½ days ago', empty: 'No analysis requests in the last 7 days.' },
};
let monitoringData = null;
let monitorSource = 'main';
let chartRange = 'hour';

/** Buckets for the chosen range; the week view adds hours up in blocks of six. */
function rangeBuckets(view) {
  if (chartRange === 'hour' || !view.hourly) return view.timeline;
  if (chartRange === 'day') return view.hourly.slice(-24);
  const blocks = [];
  for (let i = 0; i < view.hourly.length; i += 6) {
    const group = view.hourly.slice(i, i + 6);
    blocks.push({ timestamp: group[0].timestamp, requests: group.reduce((sum, b) => sum + b.requests, 0), errors: group.reduce((sum, b) => sum + b.errors, 0) });
  }
  return blocks;
}

function renderMonitoring(data = monitoringData) {
  monitoringData = data;
  const hasQr = Boolean(data.qr);
  $('monitor-source').hidden = !hasQr;
  if (!hasQr) monitorSource = 'main';
  for (const button of $('monitor-source').querySelectorAll('button')) button.setAttribute('aria-pressed', String(button.dataset.source === monitorSource));
  const qrDown = monitorSource === 'qr' && Boolean(data.qr?.unavailable);
  const view = monitorSource === 'qr' && !qrDown ? data.qr : data;
  $('stat-requests').textContent = qrDown ? '—' : number(view.totalRequests);
  $('stat-since').textContent = !qrDown && view.persistent && view.countingSince ? `Since ${new Date(view.countingSince).toLocaleDateString([], { month: 'short', day: 'numeric' })} · kept across restarts` : 'Since the last server start';
  $('stat-success').textContent = qrDown || view.successRate === null ? '—' : `${view.successRate}%`;
  $('stat-failures').textContent = qrDown ? 'QR backend unreachable' : view.totalRequests ? `${number(view.failedRequests)} unsuccessful · ${number(view.successfulRequests)} successful` : 'Waiting for your first analysis';
  $('stat-latency').textContent = qrDown ? '—' : duration(view.averageDurationMs);
  $('stat-calls').textContent = view.budget ? number(view.budget.used) : '—';
  $('stat-budget').textContent = !view.budget ? 'Not reported' : view.budget.limit ? `of ${number(view.budget.limit)} calls · UTC day · resets on restart` : 'No daily call cap configured';
  if (qrDown) $('monitor-status').textContent = 'QR trial backend unreachable';
  else if (monitorSource === 'qr') $('monitor-status').textContent = 'QR trial backend running';
  else $('monitor-status').textContent = data.provider.configured ? 'Relay running · provider configured' : 'Relay running · provider setup needed';
  $('monitor-status').classList.toggle('warning', qrDown || (monitorSource === 'main' && !data.provider.configured));
  $('last-updated').textContent = `Updated ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })} · Every 15s`;
  $('instance-provider').textContent = data.provider.provider === 'mock' ? 'Mock (development)' : data.provider.label;
  $('instance-model').textContent = data.provider.model || 'Not set';
  const fallbackModels = data.provider.fallbackModels ?? [];
  const spareKeys = Math.max(0, (data.provider.keyCount ?? 1) - 1);
  $('instance-failover').textContent = fallbackModels.length || spareKeys
    ? `${fallbackModels.length ? `${fallbackModels.join(', ')} · ` : ''}${spareKeys} spare ${spareKeys === 1 ? 'key' : 'keys'}`
    : 'None';
  $('instance-uptime').textContent = uptime(data.uptimeSeconds);
  $('instance-active').textContent = `${data.activeRequests} / ${data.limits.maxConcurrentAnalyses}`;
  $('instance-memory').textContent = `${Math.round(data.memoryRssBytes / 1024 / 1024)} MB`;
  $('monitor-persistence').textContent = data.persistent
    ? `Main API request metrics are saved on The Ring and kept across restarts, counting since ${new Date(data.countingSince).toLocaleString()}. Hourly activity is kept for 7 days.`
    : 'Request metrics are kept in memory and reset when the service restarts.';

  const range = RANGES[chartRange];
  for (const button of $('chart-range').querySelectorAll('button')) button.setAttribute('aria-pressed', String(button.dataset.range === chartRange));
  $('chart-range-label').textContent = range.label;
  $('chart-label-start').textContent = range.start;
  $('chart-label-mid').textContent = range.mid;
  const buckets = qrDown ? [] : rangeBuckets(view);
  const chart = $('activity-chart');
  chart.replaceChildren();
  const max = Math.max(1, ...buckets.map((b) => b.requests));
  let rangeTotal = 0;
  for (const bucket of buckets) {
    rangeTotal += bucket.requests;
    const column = document.createElement('div');
    column.className = 'bar-column';
    column.title = `${chartRange === 'hour' ? timeOf(bucket.timestamp) : dayTime(bucket.timestamp)} · ${bucket.requests} requests, ${bucket.errors} other outcomes`;
    for (const [name, count] of [['bar-error', bucket.errors], ['bar-success', bucket.requests - bucket.errors]]) {
      if (!count) continue;
      const segment = document.createElement('div');
      segment.className = name;
      segment.style.height = `${count / max * 100}%`;
      column.append(segment);
    }
    if (!bucket.requests) {
      const empty = document.createElement('div'); empty.className = 'bar-empty'; column.append(empty);
    }
    chart.append(column);
  }
  chart.setAttribute('aria-label', `${rangeTotal} analysis requests, ${range.label.toLowerCase()}.`);
  $('chart-empty').textContent = qrDown ? 'The QR trial backend did not answer.' : range.empty;
  $('chart-empty').hidden = rangeTotal > 0;
  const body = $('requests-body');
  body.replaceChildren();
  const recent = qrDown ? [] : view.recent;
  $('requests-empty').hidden = recent.length > 0;
  for (const request of recent) {
    const row = document.createElement('tr');
    const values = [new Date(request.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      request.requestId.slice(0, 8), request.status ?? 'Closed', request.processingMethod?.replaceAll('_', ' ') || '—',
      duration(request.durationMs), request.failure?.replaceAll('_', ' ') || 'Completed'];
    values.forEach((value, index) => {
      const cell = document.createElement('td');
      if (index === 1) cell.title = request.requestId;
      if (index === 2) {
        const status = document.createElement('span'); status.className = `status-cell${request.status >= 200 && request.status < 300 ? '' : ' failed'}`;
        status.textContent = value; cell.append(status);
      } else cell.textContent = value;
      row.append(cell);
    });
    const action = document.createElement('td');
    const show = el('button', 'show-button', 'Show');
    show.type = 'button';
    const capture = captureById.get(request.requestId);
    if (capture) show.addEventListener('click', () => showPayload(capture));
    else { show.disabled = true; show.title = 'No payload was kept for this request'; }
    action.append(show);
    row.append(action);
    body.append(row);
  }
}

let captureById = new Map();

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function block(title, ...children) {
  const section = el('section', 'debug-block');
  section.append(el('h3', '', title), ...children);
  return section;
}

const json = (value) => el('pre', 'debug-pre', JSON.stringify(value, null, 2));
const facts = (pairs) => {
  const list = el('dl', 'debug-facts');
  for (const [key, value] of pairs) if (value !== null && value !== undefined) list.append(el('dt', '', key), el('dd', '', String(value)));
  return list;
};
const kb = (bytes) => bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

function payloadView(capture) {
  const body = el('div');
  const { request, processing, response } = capture;
  const { upload, headers } = request;
  body.append(block('1 · Received from the app', facts([
    ['Request', `${request.method} ${request.path}`], ['Content type', headers.contentType], ['Content length', headers.contentLength && kb(Number(headers.contentLength))],
    ['Client key', headers.clientKey], ['Origin', headers.origin], ['App', headers.userAgent],
    ['File name', upload?.filename], ['Type the app declared', upload?.declaredType], ['Type detected from bytes', upload?.detectedType], ['File size', upload && kb(upload.bytes)],
  ])));
  if (processing.processingMethod || upload) {
    body.append(block('2 · Prepared by The Ring', facts([
      ['Processing method', processing.processingMethod?.replaceAll('_', ' ')],
      ['Photo cleaned up', processing.imagePrepared === undefined ? null : processing.imagePrepared ? 'yes' : 'no'],
      ['PDF pages', processing.pdfPages], ['Text path skipped because', processing.pdfTextFallback?.replaceAll('_', ' ')],
    ])));
  }
  capture.modelCalls.forEach((call, index) => {
    const label = capture.modelCalls.length > 1 ? ` (call ${index + 1})` : '';
    const providerLabel = call.provider || 'provider';
    const sent = [facts([['Model', call.model], ['Input', call.sent.kind.replaceAll('_', ' ')], ['Took', call.durationMs === undefined ? null : duration(call.durationMs)]])];
    if (call.sent.preview) {
      const image = el('img', 'debug-preview');
      image.src = call.sent.preview;
      image.alt = 'Receipt image as sent to the model';
      sent.push(image);
    } else if (call.sent.text !== undefined) {
      sent.push(el('p', 'muted', `Text extracted from the PDF (${number(call.sent.characters)} characters${call.sent.truncated ? ', shortened here' : ''}):`), el('pre', 'debug-pre', call.sent.text));
    } else sent.push(el('p', 'muted', 'The whole PDF was sent as a document; no preview is kept.'));
    body.append(block(`3 · Sent to ${providerLabel}${label}`, ...sent));
    if (call.attempts?.length) {
      body.append(block(`Attempts${label}`, facts(call.attempts.map((attempt) => [
        `${attempt.attempt}. ${attempt.key} · ${attempt.model}`,
        `${attempt.ok ? 'answered' : `failed (${(attempt.category ?? 'error').replaceAll('_', ' ')})`} · ${duration(attempt.durationMs)}`,
      ]))));
    }
    if (call.error) { body.append(block(`4 · ${providerLabel}'s answer${label}`, el('p', 'debug-error', `${call.error.code}: ${call.error.message}`))); return; }
    const reading = call.rawOutput?.receipt ?? {};
    const why = el('div', 'debug-why');
    why.append(el('strong', '', `Seller chosen: ${reading.merchantName ?? 'none'}`),
      el('p', '', reading.merchantEvidence ? `Evidence: ${reading.merchantEvidence}` : 'The model gave no explanation for this choice.'));
    body.append(block(`4 · ${providerLabel}'s answer${label}`, why, json(call.rawOutput ?? null)));
  });
  body.append(response
    ? block('5 · Sent back to the app', el('p', 'debug-status', `HTTP ${response.status}`), json(response.body))
    : block('5 · Sent back to the app', el('p', 'muted', 'The app closed the connection before an answer was sent.')));
  return body;
}

/** The whole capture as text for the clipboard. The photo preview is left out: it is a large data URL. */
function payloadText(capture) {
  return JSON.stringify(capture, (key, value) => (key === 'preview' && value ? '[photo preview omitted]' : value), 2);
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch {
    const area = el('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    $('payload-dialog').append(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  }
}

let shownCapture = null;
function showPayload(capture) {
  shownCapture = capture;
  $('payload-sub').textContent = `${capture.requestId} · ${new Date(capture.timestamp).toLocaleTimeString()} · ${capture.status ?? 'connection closed'}`;
  $('payload-body').replaceChildren(payloadView(capture));
  $('payload-copy').textContent = 'Copy';
  $('payload-dialog').showModal();
}

$('payload-copy').addEventListener('click', async () => {
  if (!shownCapture) return;
  const ok = await copyText(payloadText(shownCapture));
  $('payload-copy').textContent = ok ? 'Copied' : 'Copy failed';
  toast(ok ? 'Payload copied' : 'Could not copy. Select the text and copy it manually.');
});
$('payload-close').addEventListener('click', () => $('payload-dialog').close());
$('payload-dialog').addEventListener('click', (event) => { if (event.target === $('payload-dialog')) $('payload-dialog').close(); });
$('payload-dialog').addEventListener('close', () => { shownCapture = null; });

function renderCaptureControls(data) {
  $('debug-toggle').checked = data.enabled;
  $('debug-note').textContent = data.enabled
    ? `Payloads of the last ${data.maxEntries} requests are kept for ${data.maxAgeMinutes} minutes in memory only, and erased when you switch this off or the service restarts.`
    : 'Off. No payloads are kept, so Show is unavailable.';
  $('debug-clear').disabled = data.count === 0;
}

$('debug-toggle').addEventListener('change', async (event) => {
  try { await refreshMonitoring(await api('/debug', { method: 'PUT', body: { enabled: event.target.checked } })); }
  catch (err) { event.target.checked = !event.target.checked; toast(err.message); }
});
$('debug-clear').addEventListener('click', async () => {
  try { await refreshMonitoring(await api('/debug', { method: 'DELETE' })); toast('Payloads cleared'); }
  catch (err) { toast(err.message); }
});

async function refreshMonitoring(knownDebug) {
  $('refresh-monitoring').disabled = true;
  try {
    const [monitoring, debug] = await Promise.all([api('/monitoring'), knownDebug ?? api('/debug')]);
    captureById = new Map(debug.captures.map((capture) => [capture.requestId, capture]));
    renderCaptureControls(debug);
    renderMonitoring(monitoring);
  }
  catch (err) { toast(err.message); $('last-updated').textContent = 'Refresh failed · try again'; }
  finally { $('refresh-monitoring').disabled = false; }
}
$('refresh-monitoring').addEventListener('click', () => refreshMonitoring());
$('monitor-source').addEventListener('click', (event) => {
  const source = event.target.closest('button')?.dataset.source;
  if (source && monitoringData) { monitorSource = source; renderMonitoring(); }
});
$('chart-range').addEventListener('click', (event) => {
  const range = event.target.closest('button')?.dataset.range;
  if (range && monitoringData) { chartRange = range; renderMonitoring(); }
});

let usersData = null;
// 'dhamantaha-website-website-1' → 'website'; the full names stay in the Container logs page.
const containerNames = (names) => names?.length ? names.map((name) => name.replace(/^dhamantaha-/, '').replace(/-website-1$|-1$/, '')).join(' → ') : 'Not recorded';
const selectedUsers = new Map();
const userKey = (user) => `${user.source}:${user.user}`;
const userLabel = (user) => user.name ? `${user.name} (${user.user})` : user.user;
const shortDate = (date) => new Date(`${date}T12:00:00`).toLocaleDateString([], { month: 'short', day: 'numeric' });
const QR_STATUS = {
  live: ['QR trial · live', false],
  snapshot: ['QR trial · from the host collector', false],
  stale: ['QR trial · data may be out of date', true],
  unreachable: ['QR trial backend unreachable', true],
};

function shownUsers() {
  const query = $('users-filter').value.trim().toLowerCase();
  if (!query) return usersData.recentUsers;
  return usersData.recentUsers.filter((user) => [user.user, user.name, user.team].some((value) => value?.toLowerCase().includes(query)));
}

/** One bar per day; `series` is [field, className] stacked from the bottom up. */
function dayBars(target, days, series, describe) {
  target.replaceChildren();
  const max = Math.max(1, ...days.map((day) => series.reduce((sum, [field]) => sum + day[field], 0)));
  for (const day of days) {
    const column = el('div', 'bar-column');
    column.title = `${shortDate(day.date)} · ${describe(day)}`;
    const total = series.reduce((sum, [field]) => sum + day[field], 0);
    for (const [field, className] of [...series].reverse()) {
      if (!day[field]) continue;
      const segment = el('div', `bar-seg ${className}`);
      segment.style.height = `${day[field] / max * 100}%`;
      column.append(segment);
    }
    if (!total) column.append(el('div', 'bar-empty'));
    target.append(column);
  }
}

function renderUserCharts(usage) {
  const days = usage.history ?? [];
  const activity = [['visits', 'seg-visits'], ['analyses', 'seg-analyses'], ['refetches', 'seg-refetches'], ['downloads', 'seg-downloads']];
  dayBars($('users-daily-chart'), days, activity,
    (day) => `${day.visits} visits, ${day.analyses} analyses, ${day.refetches} refetches, ${day.downloads} originals`);
  if (days.length) {
    $('users-daily-start').textContent = shortDate(days[0].date);
    $('users-daily-mid').textContent = shortDate(days[Math.floor(days.length / 2)].date);
    $('users-installs-start').textContent = shortDate(days[0].date);
  }
  const anything = days.some((day) => day.visits + day.analyses + day.refetches + day.downloads);
  $('users-daily-note').textContent = !anything ? 'No daily activity in the last 30 days yet.'
    : usage.historyStart ? `Daily history from ${shortDate(usage.historyStart)}. Totals above also include activity from before then.` : '';
  $('users-daily-note').hidden = !$('users-daily-note').textContent;

  const installs = $('users-installs-chart');
  installs.replaceChildren();
  const max = Math.max(1, ...days.map((day) => Math.max(day.active, day.newUsers)));
  for (const day of days) {
    const pair = el('div', 'bar-pair');
    pair.title = `${shortDate(day.date)} · ${day.active} active, ${day.newUsers} new`;
    for (const [value, className] of [[day.active, 'seg-active'], [day.newUsers, 'seg-new']]) {
      const bar = el('div', className);
      bar.style.height = value ? `${value / max * 100}%` : '2px';
      if (!value) bar.style.background = '#e7ecdf';
      pair.append(bar);
    }
    installs.append(pair);
  }

  const split = $('users-split');
  split.replaceChildren();
  const app = usage.sources?.app;
  const qr = usage.sources?.qr;
  if (!app) { split.append(el('p', 'split-empty', 'No source breakdown is available.')); return; }
  for (const [field, name] of [['users', 'Installs'], ['visits', 'Visits'], ['analyses', 'Analyses'], ['refetches', 'Refetches']]) {
    const a = app[field] ?? 0;
    const q = qr?.[field] ?? 0;
    const row = el('div', 'split-row');
    const bar = el('div', 'split-bar');
    bar.title = `${name}: ${number(a)} from the app, ${number(q)} from the QR trial`;
    for (const [value, className] of [[a, 'seg-app'], [q, 'seg-qr']]) {
      if (!value) continue;
      const part = el('div', className, number(value));
      part.style.flex = `${value} 1 0`;
      bar.append(part);
    }
    row.append(el('span', '', name), bar);
    split.append(row);
  }
  if (!qr) split.append(el('p', 'split-empty', 'The QR trial is not linked, so only app users are counted.'));
}

function updateSelection() {
  const shown = shownUsers();
  const count = selectedUsers.size;
  $('users-selected').textContent = count ? `${count} selected${count > shown.filter((u) => selectedUsers.has(userKey(u))).length ? ', some hidden by the filter' : ''}` : 'Select users to delete them together.';
  $('users-delete-selected').disabled = !count;
  $('users-delete-selected').textContent = count ? `Delete ${count} selected` : 'Delete selected';
  const shownSelected = shown.filter((u) => selectedUsers.has(userKey(u))).length;
  $('users-select-all').checked = shown.length > 0 && shownSelected === shown.length;
  $('users-select-all').indeterminate = shownSelected > 0 && shownSelected < shown.length;
}

function renderUserRows() {
  const when = (iso) => new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const shown = shownUsers();
  $('usage-empty').hidden = shown.length > 0;
  $('usage-empty').querySelector('strong').textContent = usersData.recentUsers.length ? 'No users match this filter.' : 'No app activity yet.';
  $('usage-body').replaceChildren(...shown.map((user) => {
    const row = document.createElement('tr');
    const key = userKey(user);
    row.classList.toggle('selected', selectedUsers.has(key));
    const pick = el('td', 'check-cell');
    const box = el('input');
    box.type = 'checkbox';
    box.checked = selectedUsers.has(key);
    box.setAttribute('aria-label', `Select ${userLabel(user)}`);
    box.addEventListener('change', () => {
      if (box.checked) selectedUsers.set(key, user); else selectedUsers.delete(key);
      row.classList.toggle('selected', box.checked);
      updateSelection();
    });
    pick.append(box);
    row.append(pick);
    const name = el('td', user.name ? '' : 'user-id', user.name || user.user);
    if (user.name) name.title = `ID ${user.user}`;
    row.append(name, el('td', '', user.team || '—'));
    const source = el('td');
    source.append(el('span', `source-tag${user.source === 'qr' ? ' qr' : ''}`, user.source === 'qr' ? 'QR trial' : 'App'));
    row.append(source);
    [number(user.refetches), number(user.visits), number(user.analyses), number(user.downloads), containerNames(user.containers), when(user.firstSeen), when(user.lastSeen)]
      .forEach((value) => row.append(el('td', '', value)));
    const action = el('td');
    const remove = el('button', 'delete-button', 'Delete');
    remove.type = 'button';
    remove.setAttribute('aria-label', `Delete ${userLabel(user)}`);
    remove.addEventListener('click', () => confirmDelete([user]));
    action.append(remove);
    row.append(action);
    return row;
  }));
  updateSelection();
}

function renderUsers(usage) {
  usersData = usage;
  // Drop selections for users that no longer exist.
  const present = new Set(usage.recentUsers.map(userKey));
  for (const key of selectedUsers.keys()) if (!present.has(key)) selectedUsers.delete(key);
  for (const field of ['refetches', 'visits', 'analyses', 'downloads', 'users']) $('usage-' + field).textContent = number(usage[field]);
  $('usage-active').textContent = `${number(usage.activeLast24h)} installs active in the last 24 hours`;
  $('users-last-updated').textContent = `Updated ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })} · Every 15s`;
  const status = QR_STATUS[usage.qrStatus];
  $('qr-status').hidden = !status;
  if (status) {
    $('qr-status').textContent = usage.qrStatus === 'stale' && usage.qrCollectedAt ? `${status[0]} · collected ${new Date(usage.qrCollectedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : status[0];
    $('qr-status').classList.toggle('warning', status[1]);
  }
  $('usage-listed').textContent = usage.users > usage.recentUsers.length ? `LATEST ${usage.recentUsers.length} OF ${number(usage.users)}` : `${number(usage.users)} USERS`;
  renderUserCharts(usage);
  renderUserRows();
  $('usage-unattributed').hidden = !usage.unattributedAnalyses;
  $('usage-unattributed').textContent = `${number(usage.unattributedAnalyses)} analysis requests came from clients without an install ID. They are included in the total, with no per-user attribution.`;
  $('users-persistence').textContent = usage.persistent ? 'User counters are saved on The Ring and survive service restarts.' : 'User counters are in memory only because persistent storage is not configured.';
}

let pendingDelete = [];
function confirmDelete(users) {
  pendingDelete = users;
  $('delete-title').textContent = users.length === 1 ? `Delete ${users[0].name || users[0].user}?` : `Delete ${users.length} users?`;
  const totals = users.reduce((sum, u) => ({ visits: sum.visits + u.visits, analyses: sum.analyses + u.analyses }), { visits: 0, analyses: 0 });
  $('delete-sub').textContent = `Totals drop by ${number(totals.visits)} visits and ${number(totals.analyses)} analyses.`;
  $('delete-list').replaceChildren(...users.slice(0, 50).map((u) => el('li', '', `${userLabel(u)}${u.team ? ` · ${u.team}` : ''} · ${u.source === 'qr' ? 'QR trial' : 'App'}`)));
  if (users.length > 50) $('delete-list').append(el('li', '', `and ${users.length - 50} more`));
  $('delete-confirm').disabled = false;
  $('delete-confirm').textContent = users.length === 1 ? 'Delete user' : `Delete ${users.length} users`;
  $('delete-dialog').showModal();
}
$('delete-cancel').addEventListener('click', () => $('delete-dialog').close());
$('delete-dialog').addEventListener('click', (event) => { if (event.target === $('delete-dialog')) $('delete-dialog').close(); });
$('delete-confirm').addEventListener('click', async () => {
  $('delete-confirm').disabled = true;
  $('delete-confirm').textContent = 'Deleting…';
  const deleted = [];
  const problems = [];
  try {
    // The server takes up to 200 users per request.
    for (let i = 0; i < pendingDelete.length; i += 200) {
      const batch = pendingDelete.slice(i, i + 200);
      const result = await api('/users/delete', { method: 'POST', body: { users: batch.map((u) => ({ user: u.user, source: u.source })) } });
      deleted.push(...result.deleted);
      problems.push(...result.ambiguous, ...result.notFound);
    }
  } catch (err) { problems.push(err.message); }
  for (const user of pendingDelete) if (deleted.includes(user.user)) selectedUsers.delete(userKey(user));
  $('delete-dialog').close();
  toast(problems.length ? `${deleted.length} deleted. Not deleted: ${problems.slice(0, 3).join(', ')}${problems.length > 3 ? '…' : ''}` : `${deleted.length} ${deleted.length === 1 ? 'user' : 'users'} deleted`);
  await refreshUsers();
});
$('users-delete-selected').addEventListener('click', () => { if (selectedUsers.size) confirmDelete([...selectedUsers.values()]); });
$('users-select-all').addEventListener('change', (event) => {
  for (const user of shownUsers()) {
    if (event.target.checked) selectedUsers.set(userKey(user), user); else selectedUsers.delete(userKey(user));
  }
  renderUserRows();
});
$('users-filter').addEventListener('input', () => { if (usersData) renderUserRows(); });

async function refreshUsers() {
  $('refresh-users').disabled = true;
  try { renderUsers(await api('/users')); }
  catch (err) { toast(err.message); $('users-last-updated').textContent = 'Refresh failed · try again'; }
  finally { $('refresh-users').disabled = false; }
}
$('refresh-users').addEventListener('click', refreshUsers);

async function start() {
  try {
    const session = await api('/session');
    $('loading').hidden = true;
    if (!session.authenticated) {
      $('login-view').hidden = false;
      if (!location.pathname.endsWith('/login')) history.replaceState(null, '', `/dashboard/login?next=${encodeURIComponent(pagePath)}`);
      if (!session.available) { $('login-error').textContent = 'Dashboard access is not configured on this server.'; $('login-form').querySelector('button').disabled = true; }
      return;
    }
    if (location.pathname.endsWith('/login')) { location.replace(destination); return; }
    $('dashboard').hidden = false;
    $('settings-view').hidden = isMonitoring || isUsers || isLogs;
    $('monitoring-view').hidden = !isMonitoring;
    $('users-view').hidden = !isUsers;
    $('logs-view').hidden = !isLogs;
    $('settings-nav').classList.toggle('active', !isMonitoring && !isUsers && !isLogs);
    $('monitoring-nav').classList.toggle('active', isMonitoring);
    $('users-nav').classList.toggle('active', isUsers);
    $('logs-nav').classList.toggle('active', isLogs);
    $(isLogs ? 'logs-nav' : isUsers ? 'users-nav' : isMonitoring ? 'monitoring-nav' : 'settings-nav').setAttribute('aria-current', 'page');
    const pageTitle = isLogs ? 'Containers & logs' : isUsers ? 'Users' : isMonitoring ? 'API monitoring' : 'API settings';
    $('breadcrumb').textContent = pageTitle;
    document.title = `Dhamantaha · ${pageTitle}`;
    if (isLogs) {
      await refreshContainers();
      monitoringTimer = setInterval(() => { if (!document.hidden) refreshContainers(); }, 3000);
    } else if (isMonitoring) {
      await refreshMonitoring();
      monitoringTimer = setInterval(() => { if (!document.hidden) refreshMonitoring(); }, 15_000);
    } else if (isUsers) {
      await refreshUsers();
      monitoringTimer = setInterval(() => { if (!document.hidden) refreshUsers(); }, 15_000);
    } else renderSettings(await api('/settings'));
  } catch (err) {
    $('loading').hidden = true;
    $('login-view').hidden = false;
    $('login-error').textContent = `${err.message} Reload the page to retry.`;
  }
}
window.addEventListener('pagehide', () => clearInterval(monitoringTimer));
start();
async function refreshContainers() {
  $('refresh-containers').disabled = true;
  try {
    const data = await api('/containers');
    $('containers-status').textContent = !data.available ? 'Collector unavailable' : data.stale ? 'Stale snapshot' : `${data.containers.filter(c => c.status === 'running').length} QR containers running`;
    $('containers-status').classList.toggle('warning', !data.available || data.stale);
    $('containers-updated').textContent = data.collectedAt ? `Collected ${new Date(data.collectedAt).toLocaleString()} · Every 3s` : data.message;
    $('qr-request-body').replaceChildren(...(data.requests ?? []).slice().reverse().map(request => {
      const row = document.createElement('tr');
      const outcome = request.state === 'waiting' ? 'Retry requested' : request.state;
      [request.name || request.user, request.team || '—', request.container, outcome, request.winningKey || request.keys.join(', ') || '—', request.durationMs === undefined ? '…' : `${(request.durationMs / 1000).toFixed(1)}s`, new Date(request.startedAt).toLocaleTimeString()].forEach(value => { const cell = document.createElement('td'); cell.textContent = value; row.append(cell); });
      return row;
    }));
    $('container-cards').replaceChildren(...data.containers.map(c => {
      const card = document.createElement('article'); card.className = 'card container-card';
      const title = document.createElement('h2'); title.textContent = c.name; card.append(title);
      const state = document.createElement('span'); state.className = 'badge'; state.textContent = `${c.status} · ${c.health}`; card.append(state);
      const facts = document.createElement('dl'); facts.className = 'debug-facts';
      const values = [['Image', c.image], ['Started', c.startedAt ? new Date(c.startedAt).toLocaleString() : '—'], ['Restarts', c.restarts], ['Memory cap', c.memoryLimitBytes ? `${Math.round(c.memoryLimitBytes / 1024 / 1024)} MiB` : 'Host managed'], ['Gemini keys', c.keyAssignments.length ? c.keyAssignments.join(' · ') : 'No Gemini credential detected'], ...(c.model ? [['Model', c.model]] : []), ...(c.routing ? [['Routing', c.routing]] : [])];
      values.forEach(([label,value]) => {const dt=document.createElement('dt');dt.textContent=label;const dd=document.createElement('dd');dd.textContent=value;facts.append(dt,dd);});
      card.append(facts); return card;
    }));
    const logs = data.containers.flatMap(c => c.logs.map(log => `${c.name}  ${JSON.stringify(log)}`));
    $('container-events').textContent = logs.length ? logs.join('\n') : 'No supported backend events in the latest log window.';
  } catch (err) { $('containers-status').textContent = 'Refresh failed'; $('containers-status').classList.add('warning'); toast(err.message); }
  finally { $('refresh-containers').disabled = false; }
}
$('refresh-containers').addEventListener('click', refreshContainers);

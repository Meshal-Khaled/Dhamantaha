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

function renderMonitoring(data) {
  $('stat-requests').textContent = number(data.totalRequests);
  $('stat-success').textContent = data.successRate === null ? '—' : `${data.successRate}%`;
  $('stat-failures').textContent = data.totalRequests ? `${number(data.failedRequests)} unsuccessful · ${number(data.successfulRequests)} successful` : 'Waiting for your first analysis';
  $('stat-latency').textContent = duration(data.averageDurationMs);
  $('stat-calls').textContent = number(data.budget.used);
  $('stat-budget').textContent = data.budget.limit ? `of ${number(data.budget.limit)} calls · UTC day · resets on restart` : 'No daily call cap configured';
  $('monitor-status').textContent = data.provider.configured ? 'Relay running · provider configured' : 'Relay running · provider setup needed';
  $('monitor-status').classList.toggle('warning', !data.provider.configured);
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
  const chart = $('activity-chart');
  chart.replaceChildren();
  const max = Math.max(1, ...data.timeline.map((b) => b.requests));
  let hourTotal = 0;
  for (const bucket of data.timeline) {
    hourTotal += bucket.requests;
    const column = document.createElement('div');
    column.className = 'bar-column';
    column.title = `${new Date(bucket.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · ${bucket.requests} requests, ${bucket.errors} other outcomes`;
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
  chart.setAttribute('aria-label', `${hourTotal} analysis requests in the last 60 minutes.`);
  $('chart-empty').hidden = hourTotal > 0;
  const body = $('requests-body');
  body.replaceChildren();
  $('requests-empty').hidden = data.recent.length > 0;
  for (const request of data.recent) {
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

function renderUsers(usage) {
  for (const field of ['refetches', 'visits', 'analyses', 'downloads', 'users']) $('usage-' + field).textContent = number(usage[field]);
  $('usage-active').textContent = `${number(usage.activeLast24h)} installs active in the last 24 hours`;
  $('users-last-updated').textContent = `Updated ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })} · Every 15s`;
  $('usage-empty').hidden = usage.recentUsers.length > 0;
  $('usage-body').replaceChildren(...usage.recentUsers.map((user) => {
    const row = document.createElement('tr');
    const when = (iso) => new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    [user.user, number(user.refetches), number(user.visits), number(user.analyses), number(user.downloads), when(user.firstSeen), when(user.lastSeen)].forEach((value) => {
      const cell = document.createElement('td'); cell.textContent = value; row.append(cell);
    });
    return row;
  }));
  $('usage-unattributed').hidden = !usage.unattributedAnalyses;
  $('usage-unattributed').textContent = `${number(usage.unattributedAnalyses)} analysis requests came from clients without an install ID. They are included in the total, with no per-user attribution.`;
  $('users-persistence').textContent = usage.persistent ? 'User counters are saved on The Ring and survive service restarts.' : 'User counters are in memory only because persistent storage is not configured.';
}
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
      monitoringTimer = setInterval(() => { if (!document.hidden) refreshContainers(); }, 15_000);
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
    $('containers-status').textContent = !data.available ? 'Collector unavailable' : data.stale ? 'Stale snapshot' : `${data.containers.filter(c => c.status === 'running').length} containers running`;
    $('containers-status').classList.toggle('warning', !data.available || data.stale);
    $('containers-updated').textContent = data.collectedAt ? `Collected ${new Date(data.collectedAt).toLocaleString()} · Every 15s` : data.message;
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

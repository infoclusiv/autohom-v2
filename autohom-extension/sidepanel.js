const API_BASE = 'http://localhost:7790/api';

let jobs = [];
let agents = [];
let flows = [];
let bridgeState = null;
let pendingItems = {};

function $(id) {
  return document.getElementById(id);
}

async function init() {
  bindEvents();
  await loadPendingDownloads();
  await refreshAll();

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'DOWNLOAD_PENDING') {
      handlePendingDownload(message);
    }
    if (message.type === 'MAPPING_SAVED' || message.type === 'ILOVEPDF_PROGRESS' || message.type === 'ILOVEPDF_BRIDGE_STATUS') {
      refreshAll();
    }
  });

  setInterval(refreshAll, 5000);
}

function bindEvents() {
  $('btn-browse').addEventListener('click', browseFolder);
  $('btn-scan').addEventListener('click', scanFolder);
  $('btn-refresh').addEventListener('click', refreshAll);
  $('search').addEventListener('input', renderJobs);
  $('btn-open-site-profile-editor').addEventListener('click', (event) => {
    event.preventDefault();
    chrome.tabs.create({ url: chrome.runtime.getURL('site-profile-editor.html') });
  });
}

async function loadPendingDownloads() {
  const sessionData = await chrome.storage.session.get(null);
  for (const [key, value] of Object.entries(sessionData)) {
    if (key.startsWith('pending_')) {
      pendingItems[key] = value;
    }
  }
  renderPendingItems();
}

async function refreshAll() {
  await Promise.all([
    refreshBridge(),
    refreshJobs(),
    refreshAgents(),
    refreshFlows(),
    refreshConfig(),
  ]);
}

async function refreshBridge() {
  try {
    const res = await fetch(`${API_BASE}/bridge`);
    const data = await res.json();
    bridgeState = data.bridge || null;
    renderBridge();
  } catch (_) {
    bridgeState = null;
    renderBridge();
  }
}

async function refreshJobs() {
  try {
    const res = await fetch(`${API_BASE}/jobs`);
    const data = await res.json();
    jobs = Array.isArray(data.jobs) ? data.jobs : [];
    renderStats();
    renderJobs();
  } catch (_) {
    jobs = [];
    renderStats();
    renderJobs();
  }
}

async function refreshAgents() {
  try {
    const res = await fetch(`${API_BASE}/agents`);
    const data = await res.json();
    agents = Array.isArray(data.agents) ? data.agents : [];
    renderAgents();
    renderStats();
  } catch (_) {
    agents = [];
    renderAgents();
    renderStats();
  }
}

async function refreshFlows() {
  try {
    const res = await fetch(`${API_BASE}/flows`);
    const data = await res.json();
    flows = Array.isArray(data.flows) ? data.flows : [];
    renderFlows();
  } catch (_) {
    flows = [];
    renderFlows();
  }
}

async function refreshConfig() {
  try {
    const res = await fetch(`${API_BASE}/config`);
    const data = await res.json();
    $('folder-input').value = data.current_folder || '';
  } catch (_) {}
}

function renderBridge() {
  const connected = !!(bridgeState && bridgeState.connected);
  $('bridge-dot').className = `bridge-dot ${connected ? 'connected' : 'disconnected'}`;
  $('bridge-label').textContent = connected
    ? `Python listo · ${agents.length} agente(s)`
    : 'Python desconectado · inicia app.py';
}

function renderStats() {
  $('stat-jobs').textContent = jobs.length;
  $('stat-mapped').textContent = jobs.filter((job) => job?.statuses?.zoho === 'mapped').length;
  $('stat-converted').textContent = jobs.filter((job) => job?.statuses?.conversion === 'completed').length;
  $('stat-agents').textContent = agents.length;
}

function filterJobs() {
  const term = $('search').value.trim().toLowerCase();
  if (!term) return jobs;
  return jobs.filter((job) => {
    const haystack = [
      job.pdf_filename || '',
      job.zoho_url || '',
      job.id || '',
      job.statuses?.conversion || '',
      job.statuses?.flow || '',
    ].join(' ').toLowerCase();
    return haystack.includes(term);
  });
}

function renderJobs() {
  const list = $('jobs-list');
  const filtered = filterJobs();
  list.innerHTML = '';

  if (filtered.length === 0) {
    list.innerHTML = '<div class="empty-card">Sin jobs por ahora. Escanea una carpeta o confirma un mapping desde Zoho.</div>';
    return;
  }

  filtered.forEach((job) => {
    const card = document.createElement('article');
    card.className = 'job-card';
    const site2Disabled = !agents.some((agent) => agent.agent_type === 'site2-uploader');
    const zohoButtonDisabled = !job.zoho_url;
    card.innerHTML = `
      <div class="job-header">
        <div>
          <h3>${escapeHtml(job.pdf_filename || job.id)}</h3>
          <div class="job-meta">${escapeHtml(job.id)}</div>
        </div>
        <div class="job-status">${renderStatusPill('Zoho', job.statuses?.zoho)}${renderStatusPill('Conv', job.statuses?.conversion)}${renderStatusPill('Flow', job.statuses?.flow)}</div>
      </div>
      <div class="job-body">
        <div class="job-line"><span>Zoho</span><a href="${job.zoho_url || '#'}" target="_blank">${escapeHtml(shorten(job.zoho_url || 'Sin mapping', 56))}</a></div>
        <div class="job-line"><span>PDF</span><strong>${escapeHtml(shorten(job.pdf_path || 'Sin ruta', 56))}</strong></div>
        <div class="job-line"><span>Excel</span><strong>${escapeHtml(shorten(job.excel_path || 'Pendiente', 56))}</strong></div>
        ${job.last_error ? `<div class="job-error">${escapeHtml(job.last_error)}</div>` : ''}
      </div>
      <div class="job-actions">
        <button data-action="open-zoho" data-job-id="${job.id}" ${zohoButtonDisabled ? 'disabled' : ''}>Abrir Zoho</button>
        <button data-action="convert" data-job-id="${job.id}">Convertir PDF</button>
        <button data-action="run-flow" data-job-id="${job.id}">Ejecutar flujo</button>
        <button data-action="site2" data-job-id="${job.id}" ${site2Disabled ? 'disabled' : ''}>Enviar a Site2</button>
        <button data-action="logs" data-job-id="${job.id}">Ver logs</button>
      </div>
    `;
    card.querySelectorAll('button[data-action]').forEach((button) => {
      button.addEventListener('click', () => handleJobAction(button.dataset.action, button.dataset.jobId));
    });
    list.appendChild(card);
  });
}

function renderStatusPill(label, status) {
  const safeStatus = escapeHtml(status || 'unknown');
  return `<span class="pill pill-${safeStatus.replace(/[^a-z0-9_-]/gi, '')}">${label}: ${safeStatus}</span>`;
}

function renderAgents() {
  const list = $('agents-list');
  list.innerHTML = '';
  if (agents.length === 0) {
    list.innerHTML = '<div class="mini-empty">Sin agentes conectados.</div>';
    return;
  }
  agents.forEach((agent) => {
    const item = document.createElement('div');
    item.className = 'mini-card';
    item.innerHTML = `
      <strong>${escapeHtml(agent.agent_type)}</strong>
      <span>${escapeHtml(agent.agent_id || '')}</span>
      <span>v${escapeHtml(agent.version || '?')}</span>
    `;
    list.appendChild(item);
  });
}

function renderFlows() {
  const list = $('flows-list');
  list.innerHTML = '';
  if (flows.length === 0) {
    list.innerHTML = '<div class="mini-empty">Sin flujos disponibles.</div>';
    return;
  }
  flows.forEach((flow) => {
    const item = document.createElement('div');
    item.className = 'mini-card';
    item.innerHTML = `
      <strong>${escapeHtml(flow.name || flow.id)}</strong>
      <span>${escapeHtml(flow.description || '')}</span>
    `;
    list.appendChild(item);
  });
}

function renderPendingItems() {
  const section = $('pending-section');
  const keys = Object.keys(pendingItems);
  section.innerHTML = '';

  if (keys.length === 0) {
    section.style.display = 'none';
    return;
  }

  section.style.display = 'grid';
  keys.forEach((pendingKey) => {
    const item = pendingItems[pendingKey];
    const card = document.createElement('div');
    card.className = 'pending-card';
    card.innerHTML = `
      <div class="pending-title">PDF detectado en Zoho</div>
      <div class="pending-file">${escapeHtml(item.filename || 'archivo.pdf')}</div>
      <div class="pending-url">${escapeHtml(shorten(item.zohoUrl || '', 64))}</div>
      <div class="pending-actions">
        <button data-action="confirm" data-key="${pendingKey}" data-id="${item.downloadId}">Mapear</button>
        <button data-action="reject" data-key="${pendingKey}">Ignorar</button>
      </div>
    `;
    card.querySelectorAll('button[data-action]').forEach((button) => {
      button.addEventListener('click', () => handlePendingAction(button.dataset.action, button.dataset.key, button.dataset.id));
    });
    section.appendChild(card);
  });
}

async function handlePendingDownload(message) {
  let data = message._data;
  if (!data) {
    const result = await chrome.storage.session.get(message.pendingKey);
    data = result[message.pendingKey];
  }
  if (!data) return;
  pendingItems[message.pendingKey] = data;
  renderPendingItems();
}

async function handlePendingAction(action, pendingKey, downloadId) {
  if (action === 'confirm') {
    await chrome.runtime.sendMessage({ type: 'CONFIRM_MAPPING', downloadId: parseInt(downloadId, 10), pendingKey });
    delete pendingItems[pendingKey];
    showToast('Mapping enviado a Python');
  } else {
    await chrome.runtime.sendMessage({ type: 'REJECT_MAPPING', pendingKey });
    delete pendingItems[pendingKey];
  }
  renderPendingItems();
  refreshAll();
}

async function browseFolder() {
  try {
    const res = await fetch(`${API_BASE}/folder-dialog`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initial_folder: $('folder-input').value.trim() }),
    });
    const data = await res.json();
    if (data.folder) {
      $('folder-input').value = data.folder;
      showToast('Carpeta seleccionada');
    }
  } catch (error) {
    showToast(`No se pudo abrir el selector: ${error.message}`);
  }
}

async function scanFolder() {
  const folder = $('folder-input').value.trim();
  if (!folder) {
    showToast('Escribe o selecciona una carpeta');
    return;
  }
  try {
    await fetch(`${API_BASE}/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folder }),
    });
    await refreshAll();
    showToast('Carpeta escaneada');
  } catch (error) {
    showToast(`No se pudo escanear: ${error.message}`);
  }
}

async function handleJobAction(action, jobId) {
  try {
    if (action === 'open-zoho') {
      const res = await fetch(`${API_BASE}/jobs/${jobId}/actions/open-zoho`, { method: 'POST' });
      const data = await res.json();
      if (data.zohoUrl) {
        chrome.tabs.create({ url: data.zohoUrl });
      }
    }

    if (action === 'convert') {
      await postJson(`${API_BASE}/jobs/${jobId}/actions/convert-pdf`, {});
      showToast('Conversion enviada');
    }

    if (action === 'run-flow') {
      await postJson(`${API_BASE}/jobs/${jobId}/flows/run`, { flowId: 'pdf_to_excel' });
      showToast('Flujo iniciado');
    }

    if (action === 'site2') {
      const res = await postJson(`${API_BASE}/jobs/${jobId}/actions/send-excel-site2`, {});
      showToast(res.error || 'Accion enviada');
    }

    if (action === 'logs') {
      const data = await fetchJson(`${API_BASE}/jobs/${jobId}/diagnostics`);
      const lines = (data.events || []).slice(-8).map((event) => `${event.event} · ${event.message || ''}`);
      $('log-container').innerHTML = lines.length
        ? lines.map((line) => `<div class="log-entry">${escapeHtml(line)}</div>`).join('')
        : '<div class="log-entry">Sin eventos para este job.</div>';
    }

    await refreshAll();
  } catch (error) {
    showToast(error.message || 'La accion fallo');
  }
}

async function fetchJson(url) {
  const res = await fetch(url);
  const data = await res.json();
  if (!data.ok) {
    throw new Error(data.error || 'Request failed');
  }
  return data;
}

async function postJson(url, payload) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {}),
  });
  const data = await res.json();
  if (!data.ok) {
    throw new Error(data.error || 'Request failed');
  }
  return data;
}

function shorten(value, maxLength) {
  if (!value || value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1)}…`;
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));
}

function showToast(message) {
  const toast = $('toast');
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2500);
}

init();

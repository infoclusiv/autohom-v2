// background-zoho.js — Código Zoho CRM original (sin cambios)
// Movido desde background.js para modularización.
// Todo el código de interceptación de descargas y mapeo de actas.

// ─── UTILIDAD CLAVE ──────────────────────────────────────────────────────────
// Dado cualquier URL de Zoho CRM, intenta extraer la URL de la tarea (Cases).
// Soporta dos casos:
//   1. URL directa de tarea:   .../tab/Cases/3229357002833670752
//   2. URL de visualización:   .../ViewAttachment?...&parentId=3229357002833670752&module=Cases&...
//
// En ambos casos devuelve:  https://crm.zoho.com/crm/orgXXXXX/tab/Cases/ID
// Si no puede resolver, devuelve null.

function resolveTaskUrl(url) {
  if (!url || !url.includes('crm.zoho.com')) return null;

  try {
    const parsed = new URL(url);

    // Caso 1 — URL directa de tarea: .../tab/Cases/ID
    const directMatch = parsed.pathname.match(/\/tab\/Cases\/(\d+)/);
    if (directMatch) return url.split('?')[0]; // limpiar query params si los hubiera

    // Caso 2 — URL de ViewAttachment con parentId + module=Cases
    if (parsed.pathname.includes('ViewAttachment')) {
      const parentId = parsed.searchParams.get('parentId');
      const module   = parsed.searchParams.get('module');
      if (parentId && module === 'Cases') {
        // Reconstruir URL de tarea usando el org que ya está en el pathname
        // pathname ejemplo: /crm/org667027250/ViewAttachment
        const orgMatch = parsed.pathname.match(/\/(org\d+)\//);
        const org = orgMatch ? orgMatch[1] : null;
        if (org) {
          return `https://crm.zoho.com/crm/${org}/tab/Cases/${parentId}`;
        }
      }
    }
  } catch (_) {}

  return null;
}

// ─── SIDEPANEL ───────────────────────────────────────────────────────────────

chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tab.url && tab.url.includes('crm.zoho.com')) {
    chrome.sidePanel.setOptions({ tabId, path: 'sidepanel.html', enabled: true });
  }
});

// ─── INTERCEPTAR DESCARGAS ───────────────────────────────────────────────────

chrome.downloads.onCreated.addListener(async (downloadItem) => {
  // Solo PDFs
  const isPdf = downloadItem.filename.toLowerCase().endsWith('.pdf') ||
                downloadItem.url.toLowerCase().includes('.pdf') ||
                (downloadItem.mime && downloadItem.mime.includes('pdf'));
  if (!isPdf) return;

  // Buscar la pestaña activa
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const activeTab = tabs[0];
  if (!activeTab || !activeTab.url) return;

  // Intentar resolver la URL de la tarea desde la pestaña activa
  const taskUrl = resolveTaskUrl(activeTab.url);
  if (!taskUrl) return; // No es una URL de Zoho CRM relevante

  // Extraer nombre limpio del PDF
  //   Primero intentar desde el parámetro "name" de la URL (ViewAttachment lo trae)
  let filename = downloadItem.filename || '';
  try {
    const dlUrl = new URL(downloadItem.url);
    const nameParam = dlUrl.searchParams.get('name');
    if (nameParam) filename = decodeURIComponent(nameParam);
  } catch (_) {}
  if (!filename) filename = downloadItem.url.split('/').pop().split('?')[0] || 'archivo.pdf';
  filename = filename.split('/').pop().split('\\').pop();

  // Guardar pendiente para que el usuario confirme
  const pendingKey = `pending_${downloadItem.id}`;
  await chrome.storage.session.set({
    [pendingKey]: {
      downloadId: downloadItem.id,
      filename,
      zohoUrl: taskUrl,      // ← siempre la URL de la tarea, nunca la del PDF
      capturedAt: Date.now()
    }
  });

  // Notificar al sidepanel
  chrome.runtime.sendMessage({
    type: 'DOWNLOAD_PENDING',
    downloadId: downloadItem.id,
    pendingKey
  }).catch(() => {});

  // Notificación del sistema como fallback
  chrome.notifications.create(`notif_${downloadItem.id}`, {
    type: 'basic',
    iconUrl: 'icons/icon48.png',
    title: '¿Es un acta de homologación?',
    message: `PDF detectado: ${filename}`,
    buttons: [
      { title: '✅ Sí, mapear acta' },
      { title: '❌ No, ignorar' }
    ],
    requireInteraction: true,
    priority: 2
  });

  chrome.notifications.onButtonClicked.addListener(async function handler(notifId, btnIndex) {
    if (notifId !== `notif_${downloadItem.id}`) return;
    chrome.notifications.onButtonClicked.removeListener(handler);
    chrome.notifications.clear(notifId);
    if (btnIndex === 0) {
      await saveMapping(downloadItem.id, pendingKey);
    } else {
      await chrome.storage.session.remove(pendingKey);
    }
  });
});

async function saveMapping(downloadId, pendingKey) {
  const result = await chrome.storage.session.get(pendingKey);
  const pending = result[pendingKey];
  if (!pending) return;

  const stored = await chrome.storage.local.get('mappings');
  const mappings = stored.mappings || [];

  const newMapping = {
    id: Date.now(),
    filename: pending.filename,
    zohoUrl: pending.zohoUrl,   // ← siempre URL de la tarea
    savedAt: Date.now()
  };

  mappings.unshift(newMapping); // Más reciente primero

  await chrome.storage.local.set({ mappings });
  await chrome.storage.session.remove(pendingKey);

  try {
    await fetch('http://localhost:7790/api/jobs/import-zoho-mapping', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: newMapping.filename,
        zohoUrl: newMapping.zohoUrl,
        downloadId,
        capturedAt: pending.capturedAt || Date.now()
      })
    });
  } catch (_) {}

  // Notificar al sidepanel
  chrome.runtime.sendMessage({
    type: 'MAPPING_SAVED',
    mapping: newMapping
  }).catch(() => {});
}

// Escuchar confirmaciones desde el sidepanel
chrome.runtime.onMessage.addListener(async (message) => {
  if (message.type === 'CONFIRM_MAPPING') {
    await saveMapping(message.downloadId, message.pendingKey);
  }
  if (message.type === 'REJECT_MAPPING') {
    await chrome.storage.session.remove(message.pendingKey);
  }
  if (message.type === 'DELETE_MAPPING') {
    const stored = await chrome.storage.local.get('mappings');
    const mappings = (stored.mappings || []).filter(m => m.id !== message.id);
    await chrome.storage.local.set({ mappings });
  }
  if (message.type === 'GET_MAPPINGS') {
    const stored = await chrome.storage.local.get('mappings');
    return Promise.resolve({ mappings: stored.mappings || [] });
  }
});

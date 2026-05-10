/**
 * ilovepdf-background/runtime.js — Cola secuencial de conversión.
 * REFERENCE ONLY: el manifest carga la implementación activa desde
 * ilovepdf-background/runtime.js.
 *
 * CAMBIO CLAVE: flujo en dos fases separadas por navegación de página.
 *
 * Fase 1 (en /es/pdf_a_excel):
 *   → START_CONVERSION → upload + click Convertir → retorna {phase:'converted'}
 *   → iLovePDF navega automáticamente a /es/descarga/*
 *
 * Fase 2 (en /es/descarga/*):
 *   → background detecta la nueva URL mediante tabs.onUpdated
 *   → espera content script listo
 *   → START_DOWNLOAD → click Descargar → retorna {phase:'downloaded'}
 */

const ILovePDFRuntime = (() => {
  let _queue = [];
  let _running = false;
  let _currentPdfId = null;

  // ─── Public API ───────────────────────────────────────────────────────────

  function queueConversion(pdfDescriptor) {
    _queue.push(pdfDescriptor);
    ILovePDFUtils.log("info", `[Runtime] Queued: ${pdfDescriptor.filename} (queue: ${_queue.length})`);
    _processNext();
  }

  function queueAll(pdfList) {
    for (const pdf of pdfList) _queue.push(pdf);
    ILovePDFUtils.log("info", `[Runtime] Queued ${pdfList.length} PDFs`);
    _processNext();
  }

  function getState() {
    return { running: _running, currentPdfId: _currentPdfId, queueLength: _queue.length };
  }

  function isRunning() { return _running; }

  // ─── Queue processor ──────────────────────────────────────────────────────

  async function _processNext() {
    if (_running || _queue.length === 0) return;
    _running = true;

    const pdf = _queue.shift();
    _currentPdfId = pdf.pdfId;

    ILovePDFUtils.log("info", `[Runtime] Processing: ${pdf.filename}`);
    _notifyProgress(pdf.pdfId, "starting", `Iniciando conversión de ${pdf.filename}...`);

    try {
      // ── Fase 1: navegar a /es/pdf_a_excel, subir PDF, click Convertir ──
      const tab = await ILovePDFTabManager.findOrCreateILovePDFTab();

      let ready = await ILovePDFTabManager.waitForContentScript(tab.id);
      if (!ready) {
        await chrome.tabs.reload(tab.id);
        await ILovePDFUtils.sleep(CONFIG_ILOVEPDF.TIMING.SSE_READY_WAIT_MS);
        ready = await ILovePDFTabManager.waitForContentScript(tab.id);
      }
      if (!ready) throw new Error("Content script not ready on upload page.");

      // Fase 1: fire-and-forget — NO await, el canal morirá al navegar y eso está bien
      ILovePDFUtils.log("info", `[Runtime] Phase 1: firing START_CONVERSION (no-await)`);
      chrome.tabs.sendMessage(tab.id, {
        type: "START_CONVERSION",
        pdfId: pdf.pdfId,
        filename: pdf.filename,
        downloadUrl: `${CONFIG_ILOVEPDF.API_BASE_URL}/pdfs/${pdf.pdfId}/file`,
      }).catch(() => {
        ILovePDFUtils.log("info", "[Runtime] Phase 1 channel closed (navigation — expected).");
      });

      _notifyProgress(pdf.pdfId, "converting", `Convirtiendo ${pdf.filename}...`);

      // ── Fase 2: esperar navegación a /es/descarga/* ──────────────────────
      // iLovePDF redirige automáticamente. Esperamos que la tab llegue a esa URL.
      const downloadTabId = await _waitForDownloadPage(tab.id);

      ILovePDFUtils.log("info", `[Runtime] Download page detected on tab ${downloadTabId}`);
      _notifyProgress(pdf.pdfId, "downloading", `Página de descarga lista...`);

      // Esperar content script en la nueva página
      const ready2 = await ILovePDFTabManager.waitForContentScript(downloadTabId);
      if (!ready2) throw new Error("Content script not ready on download page.");

      ILovePDFUtils.log("info", `[Runtime] Phase 2: sending START_DOWNLOAD for ${pdf.filename}`);
      const phase2 = await chrome.tabs.sendMessage(downloadTabId, {
        type: "START_DOWNLOAD",
        pdfId: pdf.pdfId,
        filename: pdf.filename,
      });

      if (!phase2?.success) {
        throw new Error(phase2?.error || "Phase 2 (download) failed.");
      }

      // ── Éxito ─────────────────────────────────────────────────────────────
      ILovePDFUtils.log("info", `[Runtime] Completed: ${pdf.filename}`);
      ILovePDFBridge.sendStatus(pdf.pdfId, "completed", `${pdf.filename} convertido.`);
      _notifyProgress(pdf.pdfId, "completed", `${pdf.filename} convertido exitosamente.`);
      _updatePythonStatus(pdf.pdfId, "completed");

    } catch (err) {
      ILovePDFUtils.log("error", `[Runtime] Error: ${pdf.filename}`, err.message);
      ILovePDFBridge.sendStatus(pdf.pdfId, "error", err.message);
      _notifyProgress(pdf.pdfId, "error", err.message);
      _updatePythonStatus(pdf.pdfId, "error", err.message);
    }

    _currentPdfId = null;

    if (_queue.length > 0) {
      ILovePDFUtils.log("info", `[Runtime] Rate limit delay: ${CONFIG_ILOVEPDF.TIMING.RATE_LIMIT_DELAY_MS}ms`);
      await ILovePDFUtils.sleep(CONFIG_ILOVEPDF.TIMING.RATE_LIMIT_DELAY_MS);
    }

    _running = false;
    _processNext();
  }

  // ─── Navigation detector ──────────────────────────────────────────────────

  /**
   * Espera que la tab con tabId navegue a una URL que contenga '/descarga/'.
   * iLovePDF puede redirigir la misma tab o abrir una nueva (raro, pero posible).
   * Timeout: elementWaitTimeoutMs del config.
   */
  function _waitForDownloadPage(originalTabId) {
    return new Promise((resolve, reject) => {
      const timeoutMs = CONFIG_ILOVEPDF.TIMING.DOWNLOAD_PAGE_WAIT_MS ||
                        60000;
      const deadline = Date.now() + timeoutMs;

      function onUpdated(tabId, changeInfo, tab) {
        if (changeInfo.status !== "complete") return;
        // Puede ser la misma tab o una distinta (misma ventana)
        const isDownloadPage = tab.url && tab.url.includes("/descarga/");
        const isOurTab = tabId === originalTabId;

        if (isDownloadPage && isOurTab) {
          cleanup();
          // Pequeña espera para que el DOM esté listo
          setTimeout(() => resolve(tabId), CONFIG_ILOVEPDF.TIMING.PAGE_LOAD_WAIT_MS);
        }
      }

      function onRemoved(tabId) {
        if (tabId === originalTabId) {
          cleanup();
          reject(new Error("iLovePDF tab was closed before download page loaded."));
        }
      }

      function cleanup() {
        chrome.tabs.onUpdated.removeListener(onUpdated);
        chrome.tabs.onRemoved.removeListener(onRemoved);
        clearTimeout(timer);
      }

      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`Timeout waiting for /descarga/ page after ${timeoutMs}ms`));
      }, timeoutMs);

      chrome.tabs.onUpdated.addListener(onUpdated);
      chrome.tabs.onRemoved.addListener(onRemoved);
    });
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  function _notifyProgress(pdfId, status, message) {
    chrome.runtime.sendMessage({
      type: "ILOVEPDF_PROGRESS",
      pdfId, status, message,
    }).catch(() => {});
  }

  async function _updatePythonStatus(pdfId, status, message = "") {
    try {
      await fetch(`${CONFIG_ILOVEPDF.API_BASE_URL}/pdfs/${pdfId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, message }),
      });
    } catch (e) {
      ILovePDFUtils.log("warn", `[Runtime] Failed to update Python status: ${e.message}`);
    }
  }

  return { queueConversion, queueAll, getState, isRunning };
})();

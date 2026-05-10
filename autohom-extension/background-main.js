// background-main.js — Service Worker entry point (importScripts)
// Carga módulos Zoho CRM (intactos) + módulos iLovePDF automation.

try {
  importScripts(
    "background-zoho.js",                // Zoho CRM — código original sin cambios
    "ilovepdf/config.js",                 // Site profile + config iLovePDF
    "ilovepdf/utils.js",                  // Utilidades compartidas
    "ilovepdf-background/bridge.js",      // WebSocket bridge client
    "ilovepdf-background/tabManager.js",  // Tab management iLovePDF
    "ilovepdf-background/downloadTracker.js", // Confirmación real vía chrome.downloads
    "ilovepdf-background/runtime.js",     // Conversion runtime (cola secuencial)
    "ilovepdf-background/router.js"       // Message router iLovePDF
  );
} catch (e) {
  console.error("[iLovePDF] Bootstrap importScripts error:", e);
}

// ─── Initialize iLovePDF Bridge ──────────────────────────────────────────────

try {
  ILovePDFBridge.connect();
  ILovePDFBridge.setupAlarmReconnect();
  console.log("[iLovePDF] Bridge initialized and alarm reconnect set up.");
} catch (e) {
  console.error("[iLovePDF] Bridge init error:", e);
}

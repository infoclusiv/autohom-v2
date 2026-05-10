/**
 * ilovepdf/conversionAutomator.js — Fase 1: convertir. Fase 2: descargar.
 * REFERENCE ONLY: la implementación activa vive en ilovepdf/conversionAutomator.js.
 *
 * CAMBIO CLAVE: La conversión está dividida en dos mensajes separados
 * porque iLovePDF navega a /es/descarga/* al terminar de procesar,
 * matando el canal del content script de la página original.
 *
 *   START_CONVERSION  → ejecuta en /es/pdf_a_excel → sube + clickea Convertir → retorna
 *   START_DOWNLOAD    → ejecuta en /es/descarga/*  → espera #pickfiles → clickea → retorna
 */

const ILovePDFConversion = {

  /**
   * Fase 1 — Solo hace clic en el botón Convertir y retorna inmediatamente.
   * NO espera el download button (eso ocurre en otra página/otro mensaje).
   */
  async startConversion(siteProfile) {
    const { selectors, timing } = siteProfile;

    ILovePDFUtils.log("info", "Conversion: waiting for Convert button...");
    const convertBtn = await ILovePDFDom.waitForElement(
      selectors.convertButton,
      timing.elementWaitTimeoutMs
    );
    if (!convertBtn) {
      throw new Error("Convert button (button#processTask) not found.");
    }

    ILovePDFUtils.log("info", "Conversion: clicking Convert button...");
    ILovePDFDom.clickElement(convertBtn);

    // Retornamos enseguida — el background esperará la navegación
    // a /es/descarga/* antes de enviar START_DOWNLOAD.
    ILovePDFUtils.log("info", "Conversion: convert clicked, navigation expected...");
    return true;
  },

  /**
   * Fase 2 — Ejecuta en /es/descarga/*.
   * Espera el botón de descarga (#pickfiles en esa página) y lo clickea.
   */
  async startDownload(siteProfile) {
    const { selectors, timing } = siteProfile;

    ILovePDFUtils.log("info", "Download: waiting for download button (#pickfiles)...");
    const downloadBtn = await ILovePDFDom.waitForElement(
      selectors.downloadButton,   // "#pickfiles"
      timing.elementWaitTimeoutMs
    );

    if (!downloadBtn) {
      ILovePDFUtils.log("warn", "Download button not found — may have auto-downloaded.");
      await ILovePDFUtils.sleep(timing.afterDownloadClickDelayMs);
      return true;
    }

    ILovePDFUtils.log("info", "Download: clicking download button...");
    ILovePDFDom.clickElement(downloadBtn);
    await ILovePDFUtils.sleep(timing.afterDownloadClickDelayMs);

    ILovePDFUtils.log("info", "Download: done — Excel should be downloading.");
    return true;
  },
};

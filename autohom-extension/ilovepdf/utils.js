/**
 * ilovepdf/utils.js — Utilidades compartidas para iLovePDF automation.
 */

const ILovePDFUtils = {
  generateUUID() {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
    });
  },

  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  },

  randomDelay(min = 500, max = 1500) {
    const ms = Math.floor(Math.random() * (max - min + 1)) + min;
    return ILovePDFUtils.sleep(ms);
  },

  log(level, msg, details = null) {
    const ts = new Date().toLocaleTimeString("es-CO");
    const prefix = `[${ts}] [iLovePDF]`;
    if (level === "error") {
      console.error(prefix, msg, details || "");
    } else if (level === "warn") {
      console.warn(prefix, msg, details || "");
    } else {
      console.log(prefix, msg, details || "");
    }
  },
};

/**
 * ilovepdf/config.js — Site profile + configuración para iLovePDF automation.
 * REFERENCE ONLY: la configuración activa se carga desde ilovepdf/config.js.
 */

// ─── Default Site Profile ────────────────────────────────────────────────────

const DEFAULT_ILOVEPDF_SITE_PROFILE = {
  baseUrl: "https://www.ilovepdf.com/es/pdf_a_excel",
  urlPattern: "https://www.ilovepdf.com/*",
  selectors: {
    fileInput:             "#uploader input[type='file']",
    uploadButton:          "#pickfiles",
    uploadReadyIndicator:  "#fileGroups",        // div visible cuando hay archivos cargados
    convertButton:         "button#processTask", // botón Convertir a EXCEL
    progressIndicator:     "#upload-status",     // div activo durante conversión
    downloadButton:        "#pickfiles",         // mismo ID reutilizado en /es/descarga/*
    downloadReadyIndicator:"#download",          // div#download.downloader en página descarga
  },
  timing: {
    afterUploadDelayMs:        2000,
    afterConvertClickDelayMs:  5000,  // iLovePDF navega a otra página al terminar
    afterDownloadClickDelayMs: 5000,
    elementWaitTimeoutMs:      60000,
    pollIntervalMs:            500,
  },
};

// ─── Config Constants ────────────────────────────────────────────────────────

const CONFIG_ILOVEPDF = {
  BRIDGE_URL:    "ws://localhost:8769",
  API_BASE_URL:  "http://localhost:7790/api",
  EXTENSION_ID:  "zoho-acta-mapper",
  EXTENSION_TYPE:"ilovepdf-converter",
  STORAGE_KEY_SITE_PROFILE: "ilovepdf_site_profile",

  TIMING: {
    RECONNECT_INTERVAL_MS:            5000,
    ALARM_RECONNECT_NAME:             "ilovepdf_reconnect",
    ALARM_RECONNECT_PERIOD_MINUTES:   0.5,
    CONTENT_SCRIPT_MAX_ATTEMPTS:      15,
    CONTENT_SCRIPT_POLL_INTERVAL_MS:  1000,
    PAGE_LOAD_WAIT_MS:                2000,
    SSE_READY_WAIT_MS:                1500,
    RATE_LIMIT_DELAY_MS:              20000,
    DOWNLOAD_PAGE_WAIT_MS:            90000, // tiempo máximo esperando /es/descarga/*
  },
};

// ─── Site Profile Management ─────────────────────────────────────────────────

const ILovePDFConfig = {
  async loadSiteProfile() {
    try {
      const result = await chrome.storage.local.get(CONFIG_ILOVEPDF.STORAGE_KEY_SITE_PROFILE);
      const stored = result[CONFIG_ILOVEPDF.STORAGE_KEY_SITE_PROFILE];
      if (stored && typeof stored === "object") {
        return ILovePDFConfig.normalizeSiteProfile(stored);
      }
    } catch (e) {
      console.warn("[iLovePDF Config] Error loading site profile:", e);
    }
    return { ...DEFAULT_ILOVEPDF_SITE_PROFILE };
  },

  async saveSiteProfile(profile) {
    const normalized = ILovePDFConfig.normalizeSiteProfile(profile);
    await chrome.storage.local.set({
      [CONFIG_ILOVEPDF.STORAGE_KEY_SITE_PROFILE]: normalized,
    });
    return normalized;
  },

  normalizeSiteProfile(input) {
    const defaults = DEFAULT_ILOVEPDF_SITE_PROFILE;
    const profile = { ...defaults };

    if (!input || typeof input !== "object") return profile;

    if (input.baseUrl)    profile.baseUrl    = String(input.baseUrl).trim();
    if (input.urlPattern) profile.urlPattern = String(input.urlPattern).trim();

    profile.selectors = { ...defaults.selectors };
    if (input.selectors && typeof input.selectors === "object") {
      for (const [key, val] of Object.entries(input.selectors)) {
        if (key in defaults.selectors && typeof val === "string") {
          profile.selectors[key] = val.trim();
        }
      }
    }

    profile.timing = { ...defaults.timing };
    if (input.timing && typeof input.timing === "object") {
      for (const [key, val] of Object.entries(input.timing)) {
        if (key in defaults.timing) {
          const num = parseInt(val, 10);
          if (!isNaN(num) && num >= 0) profile.timing[key] = num;
        }
      }
    }

    return profile;
  },
};

// site-profile-editor.js — Lógica del Site Profile Editor

const STORAGE_KEY = "ilovepdf_site_profile";

const SELECTOR_FIELDS = [
  "fileInput", "uploadButton", "uploadReadyIndicator",
  "convertButton", "progressIndicator",
  "downloadButton", "downloadReadyIndicator",
];

const TIMING_FIELDS = [
  "afterUploadDelayMs", "afterConvertClickDelayMs",
  "afterDownloadClickDelayMs", "elementWaitTimeoutMs", "pollIntervalMs",
];

let currentProfile = null;
let isDirty = false;

const LEGACY_DOWNLOAD_SELECTORS = [
  "a.downloader__btn#pickfiles, a.downloader__btn.active, #pickfiles, #download, a.btn-download",
  "#download, a.btn-download, .btn-download",
];

// ─── Load ────────────────────────────────────────────────────────────────────

async function loadProfile() {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  const stored = result[STORAGE_KEY];
  currentProfile = normalizeProfile(stored);
  populateForm(currentProfile);
  setDirty(false);
  setStatus("Cargado", "clean");
}

function normalizeProfile(input) {
  // Use the same defaults as config.js
  const defaults = {
    baseUrl: "https://www.ilovepdf.com/es/pdf_a_excel",
    urlPattern: "https://www.ilovepdf.com/*",
    selectors: {
      fileInput: "#uploader input[type='file']",
      uploadButton: "#pickfiles",
      uploadReadyIndicator: "#fileGroups",
      convertButton: "#processTask",
      progressIndicator: ".progress",
      downloadButton: "a.downloader__btn#pickfiles, a.downloader__btn.active",
      downloadReadyIndicator: "a.downloader__btn#pickfiles, a.downloader__btn.active",
    },
    timing: {
      afterUploadDelayMs: 2000,
      afterConvertClickDelayMs: 3000,
      afterDownloadClickDelayMs: 5000,
      elementWaitTimeoutMs: 60000,
      pollIntervalMs: 500,
    },
  };

  if (!input || typeof input !== "object") return { ...defaults };

  const profile = { ...defaults };
  if (input.baseUrl) profile.baseUrl = String(input.baseUrl).trim();
  if (input.urlPattern) profile.urlPattern = String(input.urlPattern).trim();

  profile.selectors = { ...defaults.selectors };
  if (input.selectors) {
    for (const key of SELECTOR_FIELDS) {
      if (typeof input.selectors[key] === "string") {
        profile.selectors[key] = input.selectors[key];
      }
    }
  }

  if (LEGACY_DOWNLOAD_SELECTORS.includes(profile.selectors.downloadButton)) {
    profile.selectors.downloadButton = defaults.selectors.downloadButton;
  }

  profile.timing = { ...defaults.timing };
  if (input.timing) {
    for (const key of TIMING_FIELDS) {
      const val = parseInt(input.timing[key], 10);
      if (!isNaN(val) && val >= 0) profile.timing[key] = val;
    }
  }

  return profile;
}

// ─── Form ────────────────────────────────────────────────────────────────────

function populateForm(profile) {
  document.getElementById("f-baseUrl").value = profile.baseUrl;
  document.getElementById("f-urlPattern").value = profile.urlPattern;

  for (const key of SELECTOR_FIELDS) {
    const el = document.getElementById(`f-${key}`);
    if (el) el.value = profile.selectors[key] || "";
  }

  for (const key of TIMING_FIELDS) {
    const el = document.getElementById(`f-${key}`);
    if (el) el.value = profile.timing[key] || 0;
  }
}

function readForm() {
  const profile = {
    baseUrl: document.getElementById("f-baseUrl").value.trim(),
    urlPattern: document.getElementById("f-urlPattern").value.trim(),
    selectors: {},
    timing: {},
  };

  for (const key of SELECTOR_FIELDS) {
    const el = document.getElementById(`f-${key}`);
    profile.selectors[key] = el ? el.value.trim() : "";
  }

  for (const key of TIMING_FIELDS) {
    const el = document.getElementById(`f-${key}`);
    profile.timing[key] = el ? parseInt(el.value, 10) || 0 : 0;
  }

  return profile;
}

// ─── Save ────────────────────────────────────────────────────────────────────

async function saveProfile() {
  const profile = readForm();
  setStatus("Guardando...", "saving");

  try {
    await chrome.storage.local.set({ [STORAGE_KEY]: profile });
    currentProfile = profile;
    setDirty(false);
    setStatus("Guardado ✓", "clean");
  } catch (e) {
    setStatus("Error al guardar", "dirty");
    console.error("[SPE] Save error:", e);
  }
}

// ─── UI State ────────────────────────────────────────────────────────────────

function setDirty(dirty) {
  isDirty = dirty;
  const badge = document.getElementById("status-badge");
  if (dirty) {
    badge.textContent = "Sin guardar";
    badge.className = "status-badge dirty";
  }
}

function setStatus(text, state) {
  const badge = document.getElementById("status-badge");
  badge.textContent = text;
  badge.className = `status-badge ${state}`;
}

// ─── Events ──────────────────────────────────────────────────────────────────

document.getElementById("btn-save").addEventListener("click", saveProfile);
document.getElementById("btn-reload").addEventListener("click", loadProfile);

// Mark dirty on any input change
document.getElementById("profile-form").addEventListener("input", () => {
  setDirty(true);
});

// Sync from external changes
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes[STORAGE_KEY] && !isDirty) {
    loadProfile();
  }
});

// ─── Init ────────────────────────────────────────────────────────────────────
loadProfile();

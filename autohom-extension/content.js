// content.js — Corre dentro de Zoho CRM
// Su único trabajo: reportar la URL actual al background

function reportUrl() {
  chrome.runtime.sendMessage({
    type: 'ZOHO_URL_UPDATE',
    url: window.location.href,
    title: document.title
  }).catch(() => {});
}

// Reportar al cargar
reportUrl();

// Reportar cuando cambie la URL (Zoho es SPA — Single Page Application)
let lastUrl = window.location.href;
const observer = new MutationObserver(() => {
  if (window.location.href !== lastUrl) {
    lastUrl = window.location.href;
    // Pequeño delay para que el título también se actualice
    setTimeout(reportUrl, 500);
  }
});

observer.observe(document.body, { childList: true, subtree: true });

// También escuchar popstate
window.addEventListener('popstate', () => setTimeout(reportUrl, 300));

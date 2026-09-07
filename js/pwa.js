// js/pwa.js — service worker registration, update flow, install prompt (Agent C).
//
// * Registers ./sw.js relative to the page so the app works under a sub-path.
// * When a new service worker is waiting, shows a "New version available —
//   Reload" banner; Reload posts {type:'SKIP_WAITING'} to the waiting worker and
//   the page reloads once on the following `controllerchange`.
// * Captures `beforeinstallprompt` and reveals #install-btn on the title screen.

const SW_URL = './sw.js';

let registration = null;
let wantReload = false;
let deferredInstallPrompt = null;

/* ------------------------------------------------------ service worker -- */

function showUpdateBanner(waitingWorker) {
  if (!waitingWorker || document.getElementById('update-banner')) return;

  const bar = document.createElement('div');
  bar.id = 'update-banner';
  bar.className = 'update-banner';
  bar.setAttribute('role', 'status');

  const text = document.createElement('span');
  text.textContent = 'New version available';

  const reload = document.createElement('button');
  reload.type = 'button';
  reload.className = 'btn';
  reload.textContent = 'Reload';
  reload.addEventListener('click', () => {
    wantReload = true;
    reload.disabled = true;
    reload.textContent = 'Reloading…';
    waitingWorker.postMessage({ type: 'SKIP_WAITING' });
    // Safety net in case controllerchange never fires (e.g. worker was replaced).
    setTimeout(() => { if (wantReload) window.location.reload(); }, 4000);
  });

  const dismiss = document.createElement('button');
  dismiss.type = 'button';
  dismiss.className = 'update-dismiss';
  dismiss.setAttribute('aria-label', 'Dismiss');
  dismiss.textContent = '×';
  dismiss.addEventListener('click', () => bar.remove());

  bar.append(text, reload, dismiss);
  document.body.appendChild(bar);
}

function trackInstalling(worker) {
  if (!worker) return;
  worker.addEventListener('statechange', () => {
    // 'installed' while a controller exists means an update is waiting.
    if (worker.state === 'installed' && navigator.serviceWorker.controller) {
      showUpdateBanner(registration && registration.waiting ? registration.waiting : worker);
    }
  });
}

async function registerServiceWorker() {
  try {
    registration = await navigator.serviceWorker.register(SW_URL, { scope: './' });

    if (registration.waiting && navigator.serviceWorker.controller) {
      showUpdateBanner(registration.waiting);
    }
    if (registration.installing) trackInstalling(registration.installing);

    registration.addEventListener('updatefound', () => trackInstalling(registration.installing));

    // Check for a new version when the app comes back to the foreground.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') registration.update().catch(() => {});
    });
  } catch (err) {
    console.warn('[pwa] service worker registration failed:', err);
  }
}

if ('serviceWorker' in navigator) {
  let refreshed = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // Only reload when the user asked for the update (not on first install).
    if (!wantReload || refreshed) return;
    refreshed = true;
    window.location.reload();
  });

  if (document.readyState === 'complete') {
    registerServiceWorker();
  } else {
    window.addEventListener('load', registerServiceWorker, { once: true });
  }
}

/* ------------------------------------------------------ install prompt -- */

function isStandalone() {
  return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)
    || window.navigator.standalone === true;
}

function setInstallVisible(visible) {
  const btn = document.getElementById('install-btn');
  if (btn) btn.hidden = !visible;
}

function bindInstallButton() {
  const btn = document.getElementById('install-btn');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    if (!deferredInstallPrompt) return;
    const promptEvent = deferredInstallPrompt;
    deferredInstallPrompt = null;
    btn.disabled = true;
    try {
      promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      if (!choice || choice.outcome !== 'accepted') {
        // Declined: the browser may fire beforeinstallprompt again later.
        setInstallVisible(false);
      }
    } catch {
      /* ignore */
    } finally {
      btn.disabled = false;
    }
  });
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  if (isStandalone()) return;
  deferredInstallPrompt = e;
  setInstallVisible(true);
});

window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  setInstallVisible(false);
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bindInstallButton, { once: true });
} else {
  bindInstallButton();
}

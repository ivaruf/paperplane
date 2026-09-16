/* sw.js — Glider service worker (Agent C).
 *
 * Bump VERSION whenever any shell file changes: a new cache is created on
 * install, old caches are dropped on activate, and pwa.js offers a reload.
 *
 * Strategy:
 *   install  → precache the whole app shell (addAll; fall back to per-file adds
 *              so a single missing file cannot break installation)
 *   activate → delete stale caches, claim clients
 *   fetch    → same-origin GET only: cache-first with network fallback, plus a
 *              background refresh of the cache (stale-while-revalidate).
 *              Navigations fall back to index.html when offline.
 *   message  → {type:'SKIP_WAITING'} activates a waiting update immediately.
 */

const VERSION = '2026-09-16.1'; // cached shells learn the arcade moved to gophercloud.games
const CACHE_PREFIX = 'glider-';
const CACHE_NAME = `${CACHE_PREFIX}${VERSION}`;

const APP_SHELL = [
  './',
  './index.html',
  // Has to be IN the cache, not merely deployed: the players this rescues
  // are the ones whose browser has stopped asking this origin for anything.
  './moved.js',
  './manifest.webmanifest',
  './css/style.css',
  './js/main.js',
  './js/pwa.js',
  './js/ui.js',
  './js/audio.js',
  './js/config.js',
  './js/engine/loop.js',
  './js/engine/input.js',
  './js/engine/renderer.js',
  './js/game/game.js',
  './js/game/glider.js',
  './js/game/physics.js',
  './js/game/storage.js',
  './js/game/objects.js',
  './js/game/levels.js',
  './js/render/sprites.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
];

const INDEX_URL = new URL('./index.html', self.location.href).href;
const ROOT_URL = new URL('./', self.location.href).href;

function shellRequest(url) {
  // Bypass the HTTP cache so a new SW version always precaches fresh files.
  return new Request(url, { cache: 'reload' });
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      await cache.addAll(APP_SHELL.map(shellRequest));
    } catch (err) {
      // One failure aborts addAll — retry file by file so the rest still lands.
      console.warn('[sw] addAll failed, precaching individually:', err && err.message);
      const results = await Promise.allSettled(
        APP_SHELL.map((url) => cache.add(shellRequest(url))),
      );
      results.forEach((r, i) => {
        if (r.status === 'rejected') console.warn('[sw] could not precache', APP_SHELL[i]);
      });
    }
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
        .map((key) => caches.delete(key)),
    );
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

function isCacheable(response) {
  return Boolean(response) && response.ok && response.status !== 206
    && (response.type === 'basic' || response.type === 'default');
}

async function refresh(cache, request) {
  try {
    const fresh = await fetch(request);
    if (isCacheable(fresh)) await cache.put(request, fresh.clone());
    return fresh;
  } catch {
    return null;
  }
}

async function handleAsset(event, request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) {
    // stale-while-revalidate: serve from cache, refresh in the background
    event.waitUntil(refresh(cache, request));
    return cached;
  }
  const fresh = await refresh(cache, request);
  if (fresh) return fresh;
  return new Response('', { status: 504, statusText: 'Offline' });
}

async function handleNavigation(event, request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request, { ignoreSearch: true });
  if (cached) {
    event.waitUntil(refresh(cache, request));
    return cached;
  }
  const fresh = await refresh(cache, request);
  if (fresh) return fresh;
  // Offline and this exact URL is not cached: fall back to the app shell.
  const shell = (await cache.match(INDEX_URL)) || (await cache.match(ROOT_URL));
  return shell || new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(event, request));
    return;
  }
  event.respondWith(handleAsset(event, request));
});

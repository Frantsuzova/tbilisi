const APP_CACHE   = "chizhik-app-v10";
const TILES_CACHE = "chizhik-tiles-v10";
const CDN_CACHE   = "chizhik-cdn-v10";

const ASSETS = [
  "./",
  "./index.html",
  "./app.css",
  "./app.js",
  "./pwa.js",
  "./doc.kml",
  "./manifest.webmanifest",
  "./icons/icon-180.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable.png"
];

// Домены тайлов Carto
const TILE_HOSTS = new Set([
  "a.basemaps.cartocdn.com",
  "b.basemaps.cartocdn.com",
  "c.basemaps.cartocdn.com",
  "d.basemaps.cartocdn.com",
]);

// Полезные внешние домены (кэшируем по SW для повторных заходов)
const CDN_HOSTS = new Set([
  "unpkg.com",
  "fonts.googleapis.com",
  "fonts.gstatic.com"
]);

// ===== helpers =====
async function trimCache(cacheName, maxItems) {
  try {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    if (keys.length <= maxItems) return;
    // удаляем самые старые
    await Promise.all(keys.slice(0, keys.length - maxItems).map(k => cache.delete(k)));
  } catch (_) {}
}

async function networkFirst(req) {
  try {
    const fresh = await fetch(req);
    if (new URL(req.url).origin === self.location.origin) {
      const cache = await caches.open(APP_CACHE);
      try { await cache.put(req, fresh.clone()); } catch (_) {}
    }
    return fresh;
  } catch (_) {
    const cache = await caches.open(APP_CACHE);
    const cached = await cache.match(req);
    if (cached) return cached;
    const fallback = await cache.match("./index.html");
    return fallback || Response.error();
  }
}

async function staleWhileRevalidate(cacheName, req) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  const fetching = fetch(req).then(res => {
    if (res && (res.status === 200 || res.type === "opaque")) {
      try { cache.put(req, res.clone()); } catch (_) {}
    }
    return res;
  }).catch(() => cached);
  return cached || fetching;
}

// Специализированная стратегия для тайлов (с лимитом)
async function tilesSWR(req) {
  const res = await staleWhileRevalidate(TILES_CACHE, req);
  trimCache(TILES_CACHE, 150); // ограничим ~150 тайлов
  return res;
}

// CDN ресурсы (unpkg, fonts) — SWR с отдельным кэшем
async function cdnSWR(req) {
  const res = await staleWhileRevalidate(CDN_CACHE, req);
  trimCache(CDN_CACHE, 80);
  return res;
}

// ===== install =====
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(APP_CACHE).then(c => c.addAll(ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

// ===== activate =====
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.map(k => {
        if (![APP_CACHE, TILES_CACHE, CDN_CACHE].includes(k)) return caches.delete(k);
        return null;
      })
    ))
  );
  self.clients.claim();
});

// ===== fetch =====
self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);

  // 1) Только GET
  if (req.method !== "GET") return;

  // 2) Только http/https
  if (url.protocol !== "http:" && url.protocol !== "https:") return;

  // 3) HTML-навигация — network first
  if (req.mode === "navigate") {
    e.respondWith(networkFirst(req));
    return;
  }

  // 4) Тайлы карт Carto — stale-while-revalidate, отдельный кэш
  if (TILE_HOSTS.has(url.hostname)) {
    e.respondWith(tilesSWR(req));
    return;
  }

  // 5) CDN (unpkg, fonts) — stale-while-revalidate
  if (CDN_HOSTS.has(url.hostname)) {
    e.respondWith(cdnSWR(req));
    return;
  }

  // 6) Свои статики (иконки, картинки и т.п.) — SWR в APP_CACHE
  if (url.origin === self.location.origin) {
    e.respondWith(staleWhileRevalidate(APP_CACHE, req));
    return;
  }

  // 7) Прочее внешнее — сеть с фоллбеком в кэш
  e.respondWith(fetch(req).catch(() => caches.match(req)));
});

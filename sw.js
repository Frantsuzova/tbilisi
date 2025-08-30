// sw.js — безопасное кэширование только http/https GET и только same-origin статики
const CACHE = "chizhik-v1";
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

// Установка: кладём базовые ассеты
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

// Активация: чистим старые кэши
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => (k !== CACHE ? caches.delete(k) : null)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);

  // 1) Только GET
  if (req.method !== "GET") return;

  // 2) Только http/https
  if (url.protocol !== "http:" && url.protocol !== "https:") return;

  // 3) Навигация (HTML) — network first с откатом в кэш
  if (req.mode === "navigate") {
    e.respondWith(networkFirst(req));
    return;
  }

  // 4) Same-origin статика — stale-while-revalidate
  if (url.origin === self.location.origin) {
    e.respondWith(staleWhileRevalidate(req));
    return;
  }

  // 5) Внешние ресурсы — сеть, без кэширования
  e.respondWith(fetch(req).catch(() => caches.match(req)));
});

// ===== стратегии =====
async function networkFirst(req) {
  try {
    const fresh = await fetch(req);
    if (new URL(req.url).origin === self.location.origin) {
      const cache = await caches.open(CACHE);
      try { await cache.put(req, fresh.clone()); } catch (_) {}
    }
    return fresh;
  } catch (_) {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req);
    if (cached) return cached;
    const fallback = await cache.match("./index.html");
    return fallback || Response.error();
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(req);

  const fetching = fetch(req)
    .then((res) => {
      if (res && res.status === 200) {
        try { cache.put(req, res.clone()); } catch (_) {}
      }
      return res;
    })
    .catch(() => cached);

  return cached || fetching;
}

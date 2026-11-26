const CACHE_NAME = "mouris-v40";
const ASSETS = [
  "./", "./index.html", "./repair.html", "./new-order.html",
  "./assets/style.css", "./assets/app.js",
  "./assets/fonts/Estedad-Regular.woff2",
  "./assets/fonts/Estedad-Medium.woff2",
  "./assets/fonts/Estedad-Black.woff2",
  "./assets/watch-pattern.svg", "./assets/watch-symbol.svg",
  "./assets/mouris-logo.webp", "./assets/icon-192.png",
  "./assets/icon-512.png", "./assets/apple-touch-icon.png",
  "./manifest.json"
];

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.allSettled(ASSETS.map(asset => cache.add(asset)));
    await self.skipWaiting();
  })());
});

self.addEventListener("message", event => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith("mouris-") && key !== CACHE_NAME).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    if (cached) return cached;

    try {
      const response = await fetch(request);
      if (response && response.ok) await cache.put(request, response.clone());
      return response;
    } catch (error) {
      return new Response("Offline", { status: 503, statusText: "Offline" });
    }
  })());
});

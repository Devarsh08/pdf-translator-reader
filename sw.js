/* Service worker: caches the app shell, the PDF.js CDN files, and any
 * language pack JSON the user has loaded, so the whole app - including
 * rendering and translation - works with no network connection after
 * the very first successful load. */

const CACHE_NAME = "pdf-translator-cache-v2";

const PDFJS_VERSION = "3.4.120";
const PDFJS_BASE = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/legacy/build/`;

const CORE_ASSETS = [
  "./",
  "index.html",
  "styles.css",
  "app.js",
  "manifest.json",
  PDFJS_BASE + "pdf.min.js",
  PDFJS_BASE + "pdf.worker.min.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await cache.addAll(CORE_ASSETS.filter((u) => !u.startsWith("http"))).catch(() => {});
      for (const url of CORE_ASSETS.filter((u) => u.startsWith("http"))) {
        try {
          const resp = await fetch(url, { mode: "cors" });
          if (resp && resp.ok) await cache.put(url, resp);
        } catch (err) {}
      }
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          if (response && response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => cached);
    })
  );
});

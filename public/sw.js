const CACHE_VERSION = "venture-app-v5";
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;
const OFFLINE_URL = "/offline";
const OFFLINE_SAVED_URL = "/offline/saved";
const NAVIGATION_TIMEOUT_MS = 8000;

const PRECACHE = [
  "/",
  OFFLINE_URL,
  OFFLINE_SAVED_URL,
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/maskable-512.png",
];

function isPrivateOrUnsafe(url) {
  return (
    url.pathname.startsWith("/admin") ||
    url.pathname.startsWith("/api") ||
    url.pathname.startsWith("/auth") ||
    url.pathname.startsWith("/sign-in") ||
    url.pathname.startsWith("/profile") ||
    url.pathname.startsWith("/saved") ||
    url.pathname.startsWith("/newsletter/confirm") ||
    url.pathname.startsWith("/newsletter/unsubscribe")
  );
}

function isStaticAsset(request, url) {
  return (
    request.destination === "script" ||
    request.destination === "style" ||
    request.destination === "font" ||
    request.destination === "image" ||
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/")
  );
}

async function fetchWithTimeout(request, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(request, {
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function cacheSuccessfulResponse(cacheName, request, response) {
  if (!response || !response.ok) {
    return;
  }

  const responseCopy = response.clone();

  const cache = await caches.open(cacheName);
  await cache.put(request, responseCopy);
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) =>
        Promise.all(
          PRECACHE.map((url) => cache.add(url).catch(() => undefined)),
        ),
      ),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) =>
                key.startsWith("venture-") &&
                key !== SHELL_CACHE &&
                key !== RUNTIME_CACHE,
            )
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  if (url.origin !== self.location.origin || isPrivateOrUnsafe(url)) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const response = await fetchWithTimeout(
            request,
            NAVIGATION_TIMEOUT_MS,
          );

          if (response.ok) {
            event.waitUntil(
              cacheSuccessfulResponse(RUNTIME_CACHE, request, response),
            );
          }

          return response;
        } catch {
          const cachedPage = await caches.match(request);

          if (cachedPage) {
            return cachedPage;
          }

          const offlinePage = await caches.match(OFFLINE_URL);

          if (offlinePage) {
            return offlinePage;
          }

          return new Response("Venture is offline. Reconnect and try again.", {
            status: 503,
            headers: {
              "Content-Type": "text/plain; charset=utf-8",
            },
          });
        }
      })(),
    );

    return;
  }

  if (isStaticAsset(request, url)) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);

        if (cached) {
          event.waitUntil(
            fetch(request)
              .then((response) =>
                cacheSuccessfulResponse(RUNTIME_CACHE, request, response),
              )
              .catch(() => undefined),
          );

          return cached;
        }

        try {
          const response = await fetch(request);

          if (response.ok) {
            event.waitUntil(
              cacheSuccessfulResponse(RUNTIME_CACHE, request, response),
            );
          }

          return response;
        } catch {
          return new Response("", { status: 504 });
        }
      })(),
    );
  }
});

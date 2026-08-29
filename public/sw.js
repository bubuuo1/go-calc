const CACHE_PREFIX = "solsaem-ledger";
const CACHE_NAME = CACHE_PREFIX + "-v2";
const APP_SHELL = [
  "/",
  "/offline.html",
  "/manifest.webmanifest",
  "/favicon.png",
  "/icon-192.png",
  "/apple-touch-icon.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      caches
        .keys()
        .then((keys) =>
          Promise.all(
            keys
              .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
              .map((key) => caches.delete(key))
          )
        ),
      self.clients.claim()
    ])
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

const cacheStaticAsset = async (request) => {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok && response.type === "basic") {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response.clone());
  }
  return response;
};

const networkFirstNavigation = async (request) => {
  const url = new URL(request.url);
  try {
    const response = await fetch(request);
    if (response.ok && response.type === "basic") {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(url.pathname, response.clone());
    }
    return response;
  } catch {
    return (
      (await caches.match(url.pathname)) ||
      (await caches.match("/offline.html")) ||
      Response.error()
    );
  }
};

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (
    url.pathname.startsWith("/_next/static/") ||
    ["style", "script", "font", "image"].includes(request.destination)
  ) {
    event.respondWith(cacheStaticAsset(request));
  }
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : "" };
  }

  const title = payload.title || "솔샘네 가계부";
  const options = {
    body: payload.body || "확인할 가계부 알림이 있습니다.",
    icon: "/favicon.png",
    badge: "/favicon.png",
    tag: payload.tag || "ledger-notification",
    renotify: false,
    data: {
      url: payload.url || "/"
    }
  };

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, options),
      "setAppBadge" in self.navigator
        ? self.navigator.setAppBadge(Number(payload.badge || 1))
        : Promise.resolve()
    ])
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const rawUrl = event.notification.data?.url || "/";
  let destination = new URL("/", self.location.origin);
  try {
    const candidate = new URL(rawUrl, self.location.origin);
    if (candidate.origin === self.location.origin) {
      destination = candidate;
    }
  } catch {
    // 잘못된 알림 URL은 홈으로 이동한다.
  }

  event.waitUntil(
    Promise.all([
      "clearAppBadge" in self.navigator
        ? self.navigator.clearAppBadge()
        : Promise.resolve(),
      self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(
        async (clients) => {
          const visibleClient = clients.find(
            (client) => "focus" in client && client.visibilityState === "visible"
          );
          if (visibleClient) {
            await visibleClient.navigate(destination.href);
            return visibleClient.focus();
          }
          return self.clients.openWindow(destination.href);
        }
      )
    ])
  );
});

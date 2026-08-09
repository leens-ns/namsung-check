const APP_URL = "./";
const CACHE_NAME = "namsung-attendance-20260809-5";
const INDEX_FALLBACK = "./index.html";
const MANUAL_FALLBACK = "./manual.html?v=20260809-5";
const PRIVACY_FALLBACK = "./privacy.html?v=20260809-5";
const APP_SHELL = [
  "./",
  INDEX_FALLBACK,
  "./styles.css?v=20260809-5",
  "./app.js?v=20260809-5",
  "./config.js",
  "./manifest.webmanifest",
  MANUAL_FALLBACK,
  PRIVACY_FALLBACK,
  "./manual.js?v=20260809-5",
  "./logo.svg?v=20260809-5",
  "./icon-192.png?v=20260809-5",
  "./icon-512.png?v=20260809-5",
  "./icon-maskable-512.png?v=20260809-5",
  "./apple-touch-icon.png?v=20260809-5"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(Promise.all([
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))),
    self.clients.claim()
  ]));
});

self.addEventListener("fetch", (event) => {
  const requestUrl = new URL(event.request.url);
  if (event.request.method !== "GET" || requestUrl.origin !== self.location.origin) return;
  if (requestUrl.pathname.startsWith("/__/auth/")) return;
  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request).then((response) => {
      if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put(event.request, response.clone()));
      return response;
    }).catch(async () => {
      const exact = await caches.match(event.request);
      if (exact) return exact;
      const fallback = requestUrl.pathname.endsWith("/manual.html")
        ? MANUAL_FALLBACK
        : requestUrl.pathname.endsWith("/privacy.html")
          ? PRIVACY_FALLBACK
          : INDEX_FALLBACK;
      return caches.match(fallback);
    }));
    return;
  }
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
    if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put(event.request, response.clone()));
    return response;
  })));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const scopePath = new URL(self.registration.scope).pathname;
    const existing = windows.find((client) => new URL(client.url).pathname.startsWith(scopePath));
    if (existing) {
      await existing.focus();
      return;
    }
    await self.clients.openWindow(APP_URL);
  })());
});

importScripts("https://www.gstatic.com/firebasejs/11.10.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/11.10.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyAom9DZP6nC9ZtDQVCgIfQgCvd17-QLhc0",
  authDomain: "namsung-check.firebaseapp.com",
  projectId: "namsung-check",
  storageBucket: "namsung-check.firebasestorage.app",
  messagingSenderId: "36959618515",
  appId: "1:36959618515:web:e1a710ed17b8508ad19b26"
});

firebase.messaging();

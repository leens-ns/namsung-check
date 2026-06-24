const APP_URL = "./";
const CACHE_NAME = "namsung-attendance-20260624-3";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css?v=20260624-3",
  "./app.js?v=20260624-3",
  "./config.js",
  "./manifest.webmanifest",
  "./manual.html?v=20260624-3",
  "./manual.js?v=20260624-3",
  "./logo.svg",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-512.png",
  "./apple-touch-icon.png"
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
  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request).then((response) => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put("./index.html", copy));
      return response;
    }).catch(() => caches.match("./index.html")));
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

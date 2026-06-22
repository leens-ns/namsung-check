const APP_URL = "./index.html";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

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

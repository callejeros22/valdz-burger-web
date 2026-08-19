// Service worker mínimo: solo lo necesario para que Chrome/Android
// considere la página "instalable" como app. No cachea nada todavía
// (si más adelante querés que funcione sin internet, se puede sumar).
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", () => self.clients.claim());
self.addEventListener("fetch", () => {});

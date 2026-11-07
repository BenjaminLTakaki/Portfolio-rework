// Served at /swipe-news/sw.js after the app moved to /certior/. Phones that used the old address still run the old
// offline service worker there, which would keep serving the cached old app instead of following the redirect. The
// browser checks this file for updates, installs this version, and it removes itself and reloads the page, which then
// follows the server's redirect to /certior/.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  await Promise.all((await caches.keys()).map((k) => caches.delete(k)));
  await self.registration.unregister();
  for (const c of await self.clients.matchAll({ type: 'window' })) c.navigate(c.url);
})()));

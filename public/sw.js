const CACHE_PREFIX = 'hart2hart-pwa-';
const CACHE_NAME = `${CACHE_PREFIX}v2`;
const PRECACHE_URLS = ['/offline.html', '/offline.css', '/icon.svg'];
const STATIC_PATHS = new Set([
  '/icon.svg',
  '/logo.jpg',
  '/favicon.ico',
  '/manifest.json'
]);

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE_URLS))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never cache API responses, authenticated pages, chat history, payment
  // responses, profile data, or other user-specific application content.
  if (url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(async () => {
      const offlinePage = await caches.match('/offline.html');
      return offlinePage || Response.error();
    }));
    return;
  }

  const isHashedAsset = url.pathname.startsWith('/static/');
  if (!isHashedAsset && !STATIC_PATHS.has(url.pathname)) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    if (cached) return cached;

    try {
      const response = await fetch(request);
      if (response.ok && response.type === 'basic') {
        await cache.put(request, response.clone());
      }
      return response;
    } catch (error) {
      return cached || Response.error();
    }
  })());
});

self.addEventListener('push', event => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: 'Hart2Hart', body: 'You have a new notification.' };
  }

  const title = typeof payload.title === 'string'
    ? payload.title.slice(0, 100)
    : 'Hart2Hart';
  const options = {
    body: typeof payload.body === 'string'
      ? payload.body.slice(0, 180)
      : 'You have a new notification.',
    icon: '/icon.svg',
    badge: '/icon.svg',
    tag: typeof payload.tag === 'string'
      ? payload.tag.slice(0, 100)
      : 'hart2hart-notification',
    data: {
      url: typeof payload.url === 'string' ? payload.url : '/conversations'
    },
    renotify: false
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const requested = event.notification.data && event.notification.data.url;
  const target = new URL(
    typeof requested === 'string' ? requested : '/conversations',
    self.location.origin
  );
  if (target.origin !== self.location.origin) return;

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    });
    for (const client of windows) {
      if ('focus' in client) {
        await client.focus();
        if ('navigate' in client) await client.navigate(target.href);
        return;
      }
    }
    if (self.clients.openWindow) await self.clients.openWindow(target.href);
  })());
});

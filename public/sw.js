self.addEventListener('push', event => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: 'Hart2Hart', body: 'You have a new notification.' };
  }
  const title = typeof payload.title === 'string' ? payload.title.slice(0, 100) : 'Hart2Hart';
  const options = {
    body: typeof payload.body === 'string' ? payload.body.slice(0, 180) : 'You have a new notification.',
    icon: '/logo.jpg',
    badge: '/favicon.ico',
    tag: typeof payload.tag === 'string' ? payload.tag.slice(0, 100) : 'hart2hart-notification',
    data: { url: typeof payload.url === 'string' ? payload.url : '/conversations' },
    renotify: false
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const requested = event.notification.data && event.notification.data.url;
  const target = new URL(typeof requested === 'string' ? requested : '/conversations', self.location.origin);
  if (target.origin !== self.location.origin) return;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
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

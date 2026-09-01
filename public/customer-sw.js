const CACHE = 'phonehouse-care-shell-v2';
const SHELL = ['/khach-hang', '/manifest-customer.webmanifest', '/favicon.svg'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('phonehouse-care-shell-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.pathname.startsWith('/api/')) return;
  event.respondWith(fetch(request).then(response => {
    const cacheControl = response.headers.get('cache-control') || '';
    const mayCache = response.ok
      && response.type === 'basic'
      && url.origin === self.location.origin
      && !/private|no-store/i.test(cacheControl)
      && !request.headers.has('authorization');
    if (mayCache) {
      const clone = response.clone();
      caches.open(CACHE).then(cache => cache.put(request, clone));
    }
    return response;
  }).catch(() => caches.match(request).then(cached => cached || caches.match('/khach-hang'))));
});
self.addEventListener('push', event => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { payload = { title: 'PhoneHouse Care', body: event.data?.text() || '' }; }
  const notification = payload.notification || payload;
  event.waitUntil(self.registration.showNotification(notification.title || 'PhoneHouse Care', {
    body: notification.body || 'Bạn có cập nhật mới.',
    icon: '/favicon.svg',
    badge: '/favicon.svg',
    data: { url: payload.data?.url || notification.url || '/khach-hang' }
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = event.notification.data?.url || '/khach-hang';
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
    const existing = clients.find(client => 'focus' in client);
    if (existing) { existing.navigate(target); return existing.focus(); }
    return self.clients.openWindow(target);
  }));
});

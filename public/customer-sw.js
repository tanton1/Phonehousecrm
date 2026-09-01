const CACHE = 'phonehouse-care-shell-v3';
const SHELL = ['/khach-hang', '/khach-hang/bao-gia', '/manifest-customer.webmanifest', '/favicon.svg'];
const PUBLIC_API_PREFIX = '/api/customer-portal/public/';
const PUBLIC_API_MAX_AGE_MS = 30_000;
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('phonehouse-care-shell-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET') return;
  const isPublicApi = url.pathname.startsWith(PUBLIC_API_PREFIX);
  if (url.pathname.startsWith('/api/') && !isPublicApi) return;
  event.respondWith(fetch(request).then(response => {
    const cacheControl = response.headers.get('cache-control') || '';
    const mayCache = response.ok
      && response.type === 'basic'
      && url.origin === self.location.origin
      && !/private|no-store/i.test(cacheControl)
      && !request.headers.has('authorization');
    if (mayCache) {
      const clone = response.clone();
      if (isPublicApi) {
        event.waitUntil(clone.arrayBuffer().then(body => {
          const headers = new Headers(clone.headers);
          headers.set('X-PhoneHouse-Cached-At', String(Date.now()));
          return caches.open(CACHE).then(cache => cache.put(request, new Response(body, {
            status: clone.status,
            statusText: clone.statusText,
            headers
          })));
        }));
      } else {
        event.waitUntil(caches.open(CACHE).then(cache => cache.put(request, clone)));
      }
    }
    return response;
  }).catch(() => caches.match(request).then(cached => {
    if (isPublicApi) {
      const cachedAt = Number(cached?.headers.get('X-PhoneHouse-Cached-At') || 0);
      if (cached && cachedAt > 0 && Date.now() - cachedAt <= PUBLIC_API_MAX_AGE_MS) return cached;
      return new Response(JSON.stringify({ success: false, code: 'PUBLIC_DATA_OFFLINE', message: 'Không thể tải bảng giá mới khi thiết bị đang ngoại tuyến.' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
      });
    }
    return cached || caches.match('/khach-hang');
  })));
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

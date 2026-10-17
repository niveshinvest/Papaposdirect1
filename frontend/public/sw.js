const CACHE_NAME = 'papapos-v3';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/offline.html',
  '/icons/icon-192.svg',
  '/icons/icon-512.svg',
 // 'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap',
  //'https://cdn.tailwindcss.com'
];
// Install Event
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('SW: Pre-caching App Shell');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// Activate Event
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('SW: Clearing Old Cache');
            return caches.delete(cache);
          }
        })
      );
    })
  );
  self.clients.claim();
});

/*
self.addEventListener('fetch', (event) => {
  if (event.request.url.includes('/api/')) {
    return; // never cache API calls
  }
});
*/


// Fetch Event
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

if (event.request.method !== 'GET') {
  return; // let non-GET requests go directly to network
}
  // 1. Skip caching for Supabase/API calls (handled by syncService/IndexedDB)
  if (url.hostname.includes('supabase.co') || url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // 2. Let versioned build assets fail normally if missing instead of returning HTML.
  // Returning index.html for a stale CSS/JS URL causes strict MIME errors.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(fetch(event.request));
    return;
  }

 // 3. Cache-first for UI Assets & Fonts
if (
  ASSETS_TO_CACHE.includes(url.pathname) ||
  //url.hostname.includes('fonts.googleapis.com') ||
  //url.hostname.includes('fonts.gstatic.com') ||
  url.pathname.startsWith('/icons/')
) {
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(event.request)
        .then((networkResponse) => {

          // ALWAYS validate response
          if (!networkResponse || networkResponse.status !== 200) {
            return networkResponse;
          }

          const responseClone = networkResponse.clone();

          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });

          return networkResponse;
        })
        .catch(() => {

          // graceful fallback
          if (event.request.destination === 'image') {
            return new Response('', { status: 404 });
          }

          return Response.error();
        });
    })
  );

  return;
}

  // 4. Network-first for everything else
  event.respondWith(
    fetch(event.request).catch(() => {
      return caches.match(event.request).then((response) => {
        if (response) return response;
        if (event.request.mode === 'navigate') {
          return caches.match('/offline.html');
        }
        return Response.error();
      });
    })
  );
});

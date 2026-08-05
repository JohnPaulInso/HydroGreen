/* Minimal app-shell service worker. Caches the static shell for offline use
   inside an APK/WebView wrapper. Firebase/Firestore requests are always
   network-only (never cached) so live sync stays live. */
const CACHE_NAME = 'hydrotrack-shell-v3';
const SHELL_FILES = [
  './', './index.html',
  './css/tailwind.css', './css/app.css',
  './js/icons.js', './js/plants.js', './js/cloud.js', './js/app.js', './js/weather.js', './js/notifications.js',
  './manifest.json',
  './assets/icons/icon-192.png', './assets/icons/icon-512.png',
  './assets/fonts/montserrat-latin-400-normal.woff2',
  './assets/fonts/montserrat-latin-500-normal.woff2',
  './assets/fonts/montserrat-latin-600-normal.woff2',
  './assets/fonts/montserrat-latin-700-normal.woff2',
  './assets/fonts/montserrat-latin-800-normal.woff2'
];

self.addEventListener('install', (e)=>{
  e.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(SHELL_FILES)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate', (e)=>{
  e.waitUntil(
    caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k))))
      .then(()=>self.clients.claim())
  );
});
self.addEventListener('fetch', (e)=>{
  const url = new URL(e.request.url);
  
  // Skip chrome-extension and other non-http(s) schemes
  if (!url.protocol.startsWith('http')) {
    return;
  }
  
  // Never cache Firebase/Firestore/Google traffic — sync must always hit the network.
  if(url.origin.includes('googleapis.com') || url.origin.includes('gstatic.com') || url.origin.includes('firebaseio.com')) return;
  if(e.request.method !== 'GET') return;
  
  e.respondWith(
    caches.match(e.request).then(cached=>{
      const network = fetch(e.request).then(res=>{
        if(res && res.status===200){ 
          const copy=res.clone(); 
          caches.open(CACHE_NAME).then(c=>c.put(e.request, copy)).catch(err => {
            console.warn('Cache put failed:', err);
          }); 
        }
        return res;
      }).catch(()=>cached);
      return cached || network;
    })
  );
});

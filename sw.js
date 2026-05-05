// ════════════════════════════════════════════════════
// SERVICE WORKER - SB App (SuccesBonheur)
// ════════════════════════════════════════════════════

const CACHE_NAME = 'sb-app-v1';

// Fichiers à mettre en cache pour le mode hors ligne
const CACHE_URLS = [
    '/',
    '/index.html',
    '/style.css',
    '/script.js',
    '/manifest.json'
];

// Installation : mise en cache des ressources
self.addEventListener('install', (event) => {
    console.log('[SW] Installation en cours...');
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[SW] Mise en cache des ressources');
            return cache.addAll(CACHE_URLS).catch((err) => {
                console.warn('[SW] Certaines ressources non mises en cache :', err);
            });
        })
    );
    self.skipWaiting();
});

// Activation : nettoyage des anciens caches
self.addEventListener('activate', (event) => {
    console.log('[SW] Activation...');
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames
                    .filter((name) => name !== CACHE_NAME)
                    .map((name) => {
                        console.log('[SW] Suppression du vieux cache :', name);
                        return caches.delete(name);
                    })
            );
        })
    );
    self.clients.claim();
});

// Interception des requêtes réseau (stratégie : Network First)
self.addEventListener('fetch', (event) => {
    // On ne cache pas les appels Supabase/Cloudinary (données dynamiques)
    if (
        event.request.url.includes('supabase.co') ||
        event.request.url.includes('cloudinary.com')
    ) {
        return; // Laisser passer directement
    }

    event.respondWith(
        fetch(event.request)
            .then((response) => {
                // Si la réponse est valide, on met à jour le cache
                if (response && response.status === 200) {
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseClone);
                    });
                }
                return response;
            })
            .catch(() => {
                // En cas d'erreur réseau, on sert depuis le cache
                return caches.match(event.request).then((cached) => {
                    if (cached) return cached;
                    // Fallback sur la page principale
                    return caches.match('/index.html');
                });
            })
    );
});

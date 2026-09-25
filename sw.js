/*
 * Service worker de CollecDex : rend le site installable et utilisable hors ligne.
 *  - Pages : réseau d'abord (pour avoir la dernière version), la copie gardée sinon.
 *  - Scripts / styles du site (numérotés ?v=…) : copie gardée d'abord, on ne garde que la dernière version de chaque fichier.
 *  - Visuels des cartes, polices, bibliothèques (Supabase, Tesseract) : gardés au fil de l'eau pour le hors ligne.
 *  - version.json, données TCGdex (déjà gardées par le site), Supabase : jamais interceptés.
 */
const SHELL = 'cdx-shell';
const RUNTIME = 'cdx-runtime';
const IMAGES = 'cdx-images';
const MAX_IMAGES = 1500;

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(SHELL);
    // la page, puis tous les fichiers qu'elle charge (avec leur numéro de version)
    const r = await fetch('./', { cache: 'no-store' });
    if (r.ok) {
      const html = await r.clone().text();
      await c.put('./', r);
      const files = [...html.matchAll(/(?:src|href)="([^"]+\?v=[^"]+)"/g)].map((m) => m[1]);
      files.push('manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png');
      await Promise.all(files.map((f) => c.add(f).catch(() => {})));
    }
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keep = [SHELL, RUNTIME, IMAGES];
    for (const k of await caches.keys()) if (!keep.includes(k)) await caches.delete(k);
    await self.clients.claim();
  })());
});

const scopeURL = new URL(self.registration.scope);
const isSameOrigin = (u) => u.origin === scopeURL.origin;

/** Garde une réponse et efface les anciennes versions du même fichier */
async function putVersioned(cache, req, res) {
  const u = new URL(req.url);
  for (const k of await cache.keys()) {
    const ku = new URL(k.url);
    if (ku.pathname === u.pathname && ku.search !== u.search) await cache.delete(k);
  }
  await cache.put(req, res);
}

async function trim(cache, max) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const u = new URL(req.url);

  // Page du site : réseau d'abord, copie gardée si hors ligne
  if (req.mode === 'navigate' && isSameOrigin(u)) {
    e.respondWith((async () => {
      const c = await caches.open(SHELL);
      try {
        const r = await fetch(req);
        if (r.ok) c.put('./', r.clone());
        return r;
      } catch (err) {
        return (await c.match('./')) || Response.error();
      }
    })());
    return;
  }

  if (isSameOrigin(u)) {
    if (u.pathname.endsWith('/version.json') || u.pathname.endsWith('/sw.js')) return; // toujours le réseau
    // fichiers numérotés du site : copie gardée d'abord
    if (u.searchParams.has('v')) {
      e.respondWith((async () => {
        const c = await caches.open(SHELL);
        const hit = await c.match(req);
        if (hit) return hit;
        const r = await fetch(req);
        if (r.ok) putVersioned(c, req, r.clone());
        return r;
      })());
      return;
    }
    // autres fichiers du site (icônes, manifeste…) : réseau, copie si hors ligne
    e.respondWith((async () => {
      const c = await caches.open(SHELL);
      try { const r = await fetch(req); if (r.ok) c.put(req, r.clone()); return r; }
      catch (err) { return (await c.match(req)) || Response.error(); }
    })());
    return;
  }

  // Visuels officiels des cartes : copie gardée d'abord (ils ne changent pas)
  if (u.hostname === 'assets.tcgdex.net') {
    e.respondWith((async () => {
      const c = await caches.open(IMAGES);
      const hit = await c.match(req.url);
      if (hit) return hit;
      const r = await fetch(req.url, { mode: 'cors', credentials: 'omit' });
      if (r.ok) { await c.put(req.url, r.clone()); trim(c, MAX_IMAGES); }
      return r;
    })());
    return;
  }

  // Polices et bibliothèques : copie gardée tout de suite, mise à jour en arrière-plan
  if (/^(fonts\.googleapis\.com|fonts\.gstatic\.com|cdn\.jsdelivr\.net|tessdata\.projectnaptha\.com)$/.test(u.hostname)) {
    e.respondWith((async () => {
      const c = await caches.open(RUNTIME);
      const hit = await c.match(req);
      const net = fetch(req).then((r) => { if (r.ok || r.type === 'opaque') c.put(req, r.clone()); return r; }).catch(() => null);
      if (hit) { e.waitUntil(net); return hit; }
      return (await net) || Response.error();
    })());
  }
  // le reste (TCGdex, Supabase…) passe directement par le réseau
});

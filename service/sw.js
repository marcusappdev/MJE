/* =====================================================================
   MJE Service Hub — offline support for the technician view.
   Network first: when there's a connection everything comes fresh from
   GitHub Pages / the CDN and a copy is kept; with no connection the copy
   is used so My Jobs still opens on site.
   Microsoft sign-in and SharePoint (Graph) calls are never cached.
   No register data is stored here — the app keeps its own job copy.
   ===================================================================== */
// One cache per installed copy (MJE, a demo copy …) so they never clear each other's files
const SCOPE = self.registration.scope;                               // …/service/
const SHARED = new URL("../shared/", SCOPE).pathname, OWN = new URL(SCOPE).pathname;
const CACHE_BASE = "mje-service:" + OWN + ":", CACHE = CACHE_BASE + "v1";
const NEVER = /(^|\.)(graph\.microsoft\.com|login\.microsoftonline\.com|sharepoint\.com)$/i;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil((async () => {
  for (const k of await caches.keys()) if ((k.startsWith(CACHE_BASE) || (k.startsWith("mje-service-") && OWN.startsWith("/MJE/"))) && k !== CACHE) await caches.delete(k);
  await self.clients.claim();
})()));

const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);

self.addEventListener("fetch", e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || NEVER.test(url.hostname)) return;
  const isPage = req.mode === "navigate";
  const isAsset = url.origin === self.location.origin ? (url.pathname.startsWith(SHARED) || url.pathname.startsWith(OWN))
    : /^(cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com)$/.test(url.hostname);
  if (!isPage && !isAsset) return;
  const key = isPage ? new Request(url.origin + url.pathname) : req;          // one copy of the page, whatever the query
  e.respondWith((async () => {
    try {
      const res = await withTimeout(fetch(req), isPage ? 8000 : 15000);
      if (res && (res.ok || res.type === "opaque")) { const c = await caches.open(CACHE); c.put(key, res.clone()); }
      return res;
    } catch (err) {
      const hit = await caches.match(key);
      if (hit) return hit;
      throw err;
    }
  })());
});

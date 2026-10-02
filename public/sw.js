/*
 * Service worker do SERTÃO (Fase 11.4): só o necessário para o PDV abrir sem internet.
 *
 *  - /_next/static e /marca: cache-first (arquivos com hash, imutáveis);
 *  - /pdv (página): network-first; sem rede, a última versão guardada;
 *  - o resto (dados, APIs, outras telas) passa direto: nada de dado sensível em cache.
 *
 * A venda feita offline NÃO passa por aqui: ela vai para a fila do IndexedDB
 * (lib/pdv-offline.ts) e é enviada quando a internet volta.
 */
const CACHE = "sertao-pdv-v1";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (e) => {
  e.waitUntil(
    (async () => {
      for (const k of await caches.keys()) if (k.startsWith("sertao-pdv-") && k !== CACHE) await caches.delete(k);
      await self.clients.claim();
    })(),
  );
});

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const salvo = await cache.match(req);
  if (salvo) return salvo;
  const r = await fetch(req);
  if (r.ok) cache.put(req, r.clone());
  return r;
}

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const r = await Promise.race([fetch(req), new Promise((_, rej) => setTimeout(() => rej(new Error("lento")), 5000))]);
    // Só guarda a página de verdade (não o redirect para o login).
    if (r.ok && !r.redirected) cache.put(req, r.clone());
    return r;
  } catch {
    const salvo = (await cache.match(req)) || (await cache.match("/pdv"));
    if (salvo) return salvo;
    throw new Error("offline");
  }
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/marca/")) {
    e.respondWith(cacheFirst(req));
  } else if (url.pathname === "/pdv") {
    e.respondWith(networkFirst(req));
  }
});

self.addEventListener("message", (e) => {
  const m = e.data || {};
  // Guarda os arquivos que a página já carregou antes do service worker existir.
  if (m.tipo === "guardar" && Array.isArray(m.urls)) {
    e.waitUntil(
      caches.open(CACHE).then((c) =>
        Promise.all(
          m.urls
            .filter((u) => typeof u === "string" && u.startsWith(self.location.origin))
            .map((u) => c.match(u).then((x) => x || fetch(u).then((r) => (r.ok ? c.put(u, r) : undefined)).catch(() => undefined))),
        ),
      ),
    );
  }
  // Ao sair da conta: a página do PDV guardada tem dados da loja.
  if (m.tipo === "limpar") e.waitUntil(caches.delete(CACHE));
});

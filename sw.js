// Kahverengi Tabela service worker: uygulama kabuğu cihazda kalır, internet yokken de açılır.
// Yer listeleri burada değil, sayfanın kendi kaydında (localStorage) durur.
// Yeni sürüm yayınlarken SURUM'u artır.
const SURUM = "tabela-5";
// Aylık veri dosyaları ayrı kapta: sürüm değişince silinmez
const VERI_KABI = "tabelaveri";
const KABUK = [
  "./",
  "./manifest.webmanifest",
  "./icons/icon-180.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/maskable-512.png",
  "./fonts/overpass-latin.woff2",
  "./fonts/overpass-latin-ext.woff2"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(SURUM).then((c) => c.addAll(KABUK)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((ad) => Promise.all(ad.filter((k) => k.startsWith("tabela-") && k !== SURUM).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const istek = e.request;
  if (istek.method !== "GET") return;
  const url = new URL(istek.url);
  // Harita verisi, Google Haritalar, Vikipedi: dokunma
  if (url.origin !== self.location.origin || !url.pathname.startsWith(new URL(self.registration.scope).pathname)) return;

  // veri/: cihazdaki kopya hemen verilir, arkada yenisi indirilir (ayda bir değişir)
  if (url.pathname.includes("/veri/")) {
    e.respondWith((async () => {
      const kap = await caches.open(VERI_KABI);
      // Uygulama "reload" isterse (Türkiye listesini indirirken, aylık yenilemede): önce ağ
      if (istek.cache === "reload") {
        try {
          const r = await fetch(istek);
          if (r.ok) await kap.put(istek, r.clone());
          return r;
        } catch (err) {
          return (await kap.match(istek, { ignoreSearch: true })) || Response.error();
        }
      }
      const kayit = await kap.match(istek, { ignoreSearch: true });
      const ag = fetch(istek).then((r) => { if (r.ok) kap.put(istek, r.clone()); return r; });
      if (kayit) { e.waitUntil(ag.catch(() => {})); return kayit; }
      return ag;
    })());
    return;
  }

  if (istek.mode === "navigate") {
    // Önce ağ (güncel sürüm gelsin), 4 saniyede gelmezse ya da internet yoksa cihazdaki kopya
    e.respondWith((async () => {
      const onbellek = await caches.open(SURUM);
      try {
        const ag = await Promise.race([
          fetch(istek),
          new Promise((_, red) => setTimeout(() => red(new Error("yavaş")), 4000))
        ]);
        if (ag && ag.ok) onbellek.put("./", ag.clone());
        return ag;
      } catch (err) {
        return (await onbellek.match("./")) || (await onbellek.match(istek, { ignoreSearch: true })) || Response.error();
      }
    })());
    return;
  }

  e.respondWith(
    caches.match(istek, { ignoreSearch: true }).then((kayit) => kayit || fetch(istek).then((ag) => {
      if (ag.ok) caches.open(SURUM).then((c) => c.put(istek, ag.clone()));
      return ag;
    }))
  );
});

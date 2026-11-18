// Kahverengi Tabela service worker: uygulama kabuğu cihazda kalır, internet yokken de açılır.
// Yer listeleri burada değil, sayfanın kendi kaydında (localStorage) durur.
// Yeni sürüm yayınlarken SURUM'u artır.
const SURUM = "tabela-7";
// Aylık veri dosyaları ayrı kapta: sürüm değişince silinmez
const VERI_KABI = "tabelaveri";
// Yazılı rehberler (açılınca saklanır) ve kullanıcının indirdiği fotoğraf/ses: bunlar da sürüm değişince silinmez
const REHBER_KABI = "tabelarehber";
const MEDYA_KABI = "tabelamedya";
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
  // Wikimedia fotoğrafları: kullanıcı indirdiyse cihazdan, yoksa ağdan (kendiliğinden saklanmaz)
  if (url.hostname === "upload.wikimedia.org" || url.hostname === "thumb.wikimedia.org") {
    e.respondWith(caches.open(MEDYA_KABI).then((k) => k.match(istek)).then((kayit) => kayit || fetch(istek)));
    return;
  }
  // Harita verisi, Google Haritalar, Vikipedi: dokunma
  if (url.origin !== self.location.origin || !url.pathname.startsWith(new URL(self.registration.scope).pathname)) return;

  // Hazır ses kayıtları büyük: yalnız kullanıcı indirdiyse cihazdan
  if (url.pathname.includes("/icerik/ses/")) {
    e.respondWith(caches.open(MEDYA_KABI).then((k) => k.match(istek, { ignoreSearch: true })).then((kayit) => kayit || fetch(istek)));
    return;
  }

  // veri/ ve icerik/: cihazdaki kopya verilir; ay değişince uygulama yeniler
  if (url.pathname.includes("/veri/") || url.pathname.includes("/icerik/")) {
    e.respondWith((async () => {
      const kap = await caches.open(url.pathname.includes("/icerik/") ? REHBER_KABI : VERI_KABI);
      // Uygulama tazeleme isterse (Türkiye listesini indirirken, aylık yenilemede): önce ağ.
      // Tarayıcının sayfa yenilemede kendiliğinden koyduğu önbellek kipine bakılmaz; yalnız uygulamanın işaretine.
      if (istek.headers.get("X-Tabela-Tazele") === "1") {
        try {
          const r = await fetch(istek);
          if (r.ok) await kap.put(istek, r.clone());
          return r;
        } catch (err) {
          return (await kap.match(istek, { ignoreSearch: true })) || Response.error();
        }
      }
      // Cihazda varsa doğrudan oradan (gereksiz indirme yok). Yenileme, uygulama liste tarihi değişince
      // "reload" isteğiyle yapar; dizin dosyaları (iller.json, dizin.json) zaten hep öyle istenir.
      const kayit = await kap.match(istek, { ignoreSearch: true });
      if (kayit) return kayit;
      const r = await fetch(istek);
      if (r.ok) await kap.put(istek, r.clone());
      return r;
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

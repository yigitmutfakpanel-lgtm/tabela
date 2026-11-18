// Aylık veri: 81 il → ilçeler → kahverengi tabelalı yerler, OpenStreetMap (Overpass) üzerinden.
// GitHub Actions'ta ayda bir çalışır (.github/workflows/yayin.yml), sonucu veri/ klasörüne yazar.
// Uygulama önce bu dosyaları okur; böylece harita sunucuları bir gün kapansa da son veriyle çalışır.
// Kategori, tekilleştirme ve sorgu kuralları index.html'deki <cekirdek> bölümünden aynen alınır (tek kaynak).
// Çalıştırma: node arac/veri.mjs   (VERI_ILLER=35,6 yalnız o illeri yeniler; VERI_ARA=ms sorgular arası bekleme)
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VERI = path.join(KOK, "veri");
const ARA = Number(process.env.VERI_ARA ?? 2000);
const ESZAMANLI = Number(process.env.VERI_ESZAMANLI ?? 2); // Overpass bir adrese 2 eş zamanlı sorgu izni verir
const SADECE = (process.env.VERI_ILLER || "").split(",").filter(Boolean).map(Number);

// --- index.html'deki ortak kodu yükle
const html = fs.readFileSync(path.join(KOK, "index.html"), "utf8");
const bas = html.indexOf("// <cekirdek>"), son = html.indexOf("// </cekirdek>");
if (bas < 0 || son < bas) throw new Error("index.html içinde <cekirdek> işaretleri bulunamadı");
const bellek = new Map();
const ctx = vm.createContext({
  fetch: (...a) => globalThis.fetch(...a), AbortController, setTimeout, clearTimeout, console, Intl, Math, JSON, Date,
  document: { getElementById: () => null },
  localStorage: { getItem: (k) => bellek.get(k) ?? null, setItem: (k, v) => bellek.set(k, String(v)), removeItem: (k) => bellek.delete(k), key: (i) => [...bellek.keys()][i] ?? null, get length() { return bellek.size; } }
});
vm.runInContext(html.slice(bas, son) + "\n;globalThis.__c = { ILLER, ilKimlikleriGetir, ilceleriGetir, overpass, yerFiltreleri, yerleriIsle };", ctx, { filename: "index.html#cekirdek" });
const c = ctx.__c;

const bekle = (ms) => new Promise((r) => setTimeout(r, ms));
const oku = (dosya) => { try { return JSON.parse(fs.readFileSync(dosya, "utf8")); } catch { return null; } };
const yaz = (dosya, deger) => { fs.mkdirSync(path.dirname(dosya), { recursive: true }); fs.writeFileSync(dosya, JSON.stringify(deger)); };
const plakaDosya = (p) => path.join(VERI, "il", String(p).padStart(2, "0") + ".json");

async function tekrarla(ad, fn) {
  for (let deneme = 1; ; deneme++) {
    try { return await fn(); }
    catch (e) {
      console.log(`  ${ad}: ${deneme}. deneme olmadı (${e && e.message})`);
      if (deneme >= 3) throw e;
      await bekle(ARA * 5 * deneme);
    }
  }
}

function yerleriGetir(ilceler) {
  const kimlikler = ilceler.map((d) => d.id).join(",");
  return c.overpass(`[out:json][timeout:300];
rel(id:${kimlikler})->.k;
foreach.k->.d(
  .d out ids;
  .d map_to_area->.da;
  (
  ${c.yerFiltreleri("(area.da)")}
  );
  out center tags;
);`, 200000);
}

// Çıktıda her ilçe "etiketsiz ilişki" satırıyla başlar, ardından o ilçenin yerleri gelir.
function ilceyeGoreAyir(veri, ilceler) {
  const kume = new Set(ilceler.map((d) => d.id));
  const gruplar = {};
  let simdiki = null;
  for (const el of veri.elements) {
    if (el.type === "relation" && !el.tags && kume.has(el.id)) { simdiki = el.id; gruplar[simdiki] = gruplar[simdiki] || []; continue; }
    if (simdiki != null) gruplar[simdiki].push(el);
  }
  const sonuc = {};
  for (const d of ilceler) sonuc[d.id] = c.yerleriIsle({ elements: gruplar[d.id] || [] });
  return sonuc;
}

function kutu(ilceYerleri) {
  let s = 90, w = 180, n = -90, e = -180, var_ = false;
  for (const liste of Object.values(ilceYerleri)) for (const k of liste) {
    var_ = true;
    if (k.a < s) s = k.a; if (k.a > n) n = k.a; if (k.o < w) w = k.o; if (k.o > e) e = k.o;
  }
  return var_ ? [s, w, n, e] : null;
}

const eskiIndeks = oku(path.join(VERI, "iller.json")) || { iller: {} };
const indeks = { surum: 1, tarih: new Date().toISOString().slice(0, 10), kaynak: "© OpenStreetMap katkıcıları (ODbL)", iller: {} };
let yeni = 0, korunan = 0, eksik = 0;

const kimlik = await tekrarla("il kimlikleri", () => c.ilKimlikleriGetir());
console.log(`${Object.keys(kimlik).length} il kimliği bulundu`);

async function ilIsle(plaka, ad) {
  const eski = eskiIndeks.iller[plaka];
  const koru = (neden) => {
    if (eski) { indeks.iller[plaka] = eski; korunan++; console.log(`${ad}: ${neden}; önceki veri korundu`); }
    else { eksik++; console.log(`${ad}: ${neden}; veri yok, uygulama canlı sorguya döner`); }
  };
  if (SADECE.length && !SADECE.includes(plaka)) return koru("bu çalıştırmada atlandı");
  const id = kimlik[plaka];
  if (!id) return koru("il sınırı bulunamadı");
  const t0 = Date.now();
  try {
    const ilceler = await tekrarla(`${ad} ilçeleri`, () => c.ilceleriGetir(id, ad));
    if (!ilceler.length) return koru("ilçe bulunamadı");
    await bekle(ARA);
    const veri = await tekrarla(`${ad} yerleri`, () => yerleriGetir(ilceler));
    const ilceYerleri = ilceyeGoreAyir(veri, ilceler);
    const toplam = Object.values(ilceYerleri).reduce((t, l) => t + l.length, 0);
    // Sunucu yarım cevap verdiyse (öncekinin yarısından az) eskisini koru
    if (eski && eski.s && toplam < eski.s * 0.5) return koru(`yalnız ${toplam} yer geldi (önce ${eski.s})`);
    const dosya = { tarih: indeks.tarih, ilceler: ilceYerleri };
    yaz(plakaDosya(plaka), dosya);
    indeks.iller[plaka] = { id, ad, k: kutu(ilceYerleri), s: toplam, b: JSON.stringify(dosya).length, ilce: ilceler.map((d) => ({ id: d.id, n: d.n })) };
    yeni++;
    console.log(`${ad}: ${ilceler.length} ilçe, ${toplam} yer (${Math.round((Date.now() - t0) / 1000)} sn)`);
  } catch (e) {
    koru(`hata: ${e && e.message}`);
  }
}

// İş durdurulsa bile o ana kadar gelenler kaybolmasın: her ilden sonra dizin yazılır
function dizinYaz() {
  const tam = { ...indeks, iller: { ...eskiIndeks.iller, ...indeks.iller } };
  yaz(path.join(VERI, "iller.json"), tam);
}

const sira = c.ILLER.slice();
await Promise.all(Array.from({ length: ESZAMANLI }, async () => {
  for (let is = sira.shift(); is; is = sira.shift()) {
    await ilIsle(is[0], is[1]);
    if (yeni) dizinYaz();
    await bekle(ARA);
  }
}));

if (!yeni && !korunan) { console.log("Hiç veri alınamadı; dosyalar değiştirilmedi."); process.exit(1); }
dizinYaz();
console.log(`Bitti: ${yeni} il yenilendi, ${korunan} il önceki veriyle, ${eksik} il verisiz.`);
if (!yeni) process.exit(1);

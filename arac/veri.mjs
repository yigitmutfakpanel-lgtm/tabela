// Aylık veri: 81 il → ilçeler → kahverengi tabelalı yerler.
// Kaynak OpenStreetMap'in hazır Türkiye dosyası (Geofabrik). Harita sunucusuna (Overpass) sorgu gitmez;
// dosya GitHub'da indirilir, osmium ile süzülür, bu betik yerleri ilçe sınırlarına göre dağıtır.
// Kategori, tekilleştirme ve sıralama kuralları index.html'deki <cekirdek> bölümünden aynen alınır (tek kaynak).
//
// Çalıştırma (bkz. .github/workflows/yayin.yml):
//   node arac/veri.mjs <sinirlar.geojsonseq> <yerler.geojsonseq>
//   sinirlar: admin_level 4 ve 6 sınırları (osmium export, alanlar)
//   yerler:   kahverengi tabela etiketli nesneler (osmium export)
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VERI = path.join(KOK, "veri");
const [SINIR_DOSYA, YER_DOSYA] = process.argv.slice(2);
if (!SINIR_DOSYA || !YER_DOSYA) { console.error("Kullanım: node arac/veri.mjs sinirlar.geojsonseq yerler.geojsonseq"); process.exit(2); }
const EN_AZ_IL = Number(process.env.VERI_EN_AZ_IL ?? 70);

// --- index.html'deki ortak kodu yükle
const html = fs.readFileSync(path.join(KOK, "index.html"), "utf8");
const bas = html.indexOf("// <cekirdek>"), son = html.indexOf("// </cekirdek>");
if (bas < 0 || son < bas) throw new Error("index.html içinde <cekirdek> işaretleri bulunamadı");
const bellek = new Map();
const ctx = vm.createContext({
  fetch: () => Promise.reject(new Error("ağ kullanılmaz")), AbortController, setTimeout, clearTimeout, console, Intl, Math, JSON, Date,
  document: { getElementById: () => null },
  localStorage: { getItem: (k) => bellek.get(k) ?? null, setItem: (k, v) => bellek.set(k, String(v)), removeItem: (k) => bellek.delete(k), key: (i) => [...bellek.keys()][i] ?? null, get length() { return bellek.size; } }
});
vm.runInContext(html.slice(bas, son) + "\n;globalThis.__c = { ILLER, yerleriIsle, trSirala };", ctx, { filename: "index.html#cekirdek" });
const c = ctx.__c;

const yaz = (dosya, deger) => { fs.mkdirSync(path.dirname(dosya), { recursive: true }); fs.writeFileSync(dosya, JSON.stringify(deger)); };
const oku = (dosya) => { try { return JSON.parse(fs.readFileSync(dosya, "utf8")); } catch { return null; } };

async function* satirlar(dosya) {
  const rl = readline.createInterface({ input: fs.createReadStream(dosya, { encoding: "utf8" }), crlfDelay: Infinity });
  for await (let s of rl) {
    s = s.replace(/^\x1e/, "").trim();
    if (!s) continue;
    try { yield JSON.parse(s); } catch { /* bozuk satırı atla */ }
  }
}

// osmium "type_id" kimliği → OSM ilişki kimliği. Alanlar: a(2*yol) ya da a(2*ilişki+1)
function iliskiKimligi(f) {
  const m = /^([nwra])(\d+)$/.exec(String(f.id ?? ""));
  if (!m) return null;
  const n = Number(m[2]);
  if (m[1] === "r") return n;
  if (m[1] === "a" && n % 2 === 1) return (n - 1) / 2;
  return null;
}

// --- geometri yardımcıları ([boylam, enlem])
function cokgenler(g) {
  if (!g) return [];
  if (g.type === "Polygon") return [g.coordinates];
  if (g.type === "MultiPolygon") return g.coordinates;
  return [];
}
function kutuHesapla(polys) {
  let w = 180, s = 90, e = -180, n = -90;
  for (const p of polys) for (const [x, y] of p[0]) { if (x < w) w = x; if (x > e) e = x; if (y < s) s = y; if (y > n) n = y; }
  return [w, s, e, n];
}
function halkadaMi(x, y, halka) {
  let ic = false;
  for (let i = 0, j = halka.length - 1; i < halka.length; j = i++) {
    const [xi, yi] = halka[i], [xj, yj] = halka[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) ic = !ic;
  }
  return ic;
}
function icindeMi(x, y, bolge) {
  const [w, s, e, n] = bolge.kutu;
  if (x < w || x > e || y < s || y > n) return false;
  for (const p of bolge.polys) {
    if (!halkadaMi(x, y, p[0])) continue;
    let delikte = false;
    for (let h = 1; h < p.length; h++) if (halkadaMi(x, y, p[h])) { delikte = true; break; }
    if (!delikte) return true;
  }
  return false;
}
// Yerin temsil noktası: Overpass "out center" gibi sınır kutusunun ortası
function merkez(g) {
  if (!g) return null;
  if (g.type === "Point") return g.coordinates;
  let w = 180, s = 90, e = -180, n = -90;
  const gez = (a) => { if (typeof a[0] === "number") { if (a[0] < w) w = a[0]; if (a[0] > e) e = a[0]; if (a[1] < s) s = a[1]; if (a[1] > n) n = a[1]; } else a.forEach(gez); };
  gez(g.coordinates);
  return w <= e ? [(w + e) / 2, (s + n) / 2] : null;
}
// İlçenin il içinde kalan bir noktası: en büyük dış halkanın ağırlık merkezi
function icNokta(bolge) {
  let enIyi = null, enAlan = -1;
  for (const p of bolge.polys) {
    const r = p[0];
    let a = 0, cx = 0, cy = 0;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const f = r[j][0] * r[i][1] - r[i][0] * r[j][1];
      a += f; cx += (r[j][0] + r[i][0]) * f; cy += (r[j][1] + r[i][1]) * f;
    }
    if (Math.abs(a) > enAlan) { enAlan = Math.abs(a); enIyi = a ? [cx / (3 * a), cy / (3 * a)] : r[0]; }
  }
  return enIyi;
}

// --- 1) Sınırlar
const iller = [], ilceler = [];
for await (const f of satirlar(SINIR_DOSYA)) {
  const t = f.properties || {};
  if (t.boundary !== "administrative") continue;
  const id = iliskiKimligi(f);
  const polys = cokgenler(f.geometry);
  if (!id || !polys.length) continue;
  const bolge = { id, t, polys, kutu: kutuHesapla(polys) };
  if (t.admin_level === "4") {
    const m = /^TR-(\d{2})$/.exec(t["ISO3166-2"] || "");
    if (m) { bolge.plaka = +m[1]; iller.push(bolge); }
  } else if (t.admin_level === "6") {
    bolge.ad = t["name:tr"] || t.name;
    if (bolge.ad) ilceler.push(bolge);
  }
}
console.log(`${iller.length} il, ${ilceler.length} ilçe sınırı okundu`);
if (iller.length < EN_AZ_IL) { console.error("İl sınırları eksik geldi; önceki veri korunuyor."); process.exit(1); }

// İlçe → il (ilçenin iç noktası hangi ilin içindeyse; olmazsa köşelerin çoğunluğu)
const ilinIlceleri = new Map(iller.map((il) => [il.plaka, []]));
for (const d of ilceler) {
  let il = null;
  const nokta = icNokta(d);
  if (nokta && icindeMi(nokta[0], nokta[1], d)) il = iller.find((p) => icindeMi(nokta[0], nokta[1], p)) || null;
  if (!il) {
    const sayac = new Map();
    const r = d.polys[0][0];
    for (let i = 0; i < r.length; i += Math.max(1, Math.floor(r.length / 40))) {
      const p = iller.find((q) => icindeMi(r[i][0], r[i][1], q));
      if (p) sayac.set(p, (sayac.get(p) || 0) + 1);
    }
    il = [...sayac.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  }
  if (il) { d.plaka = il.plaka; ilinIlceleri.get(il.plaka).push(d); }
}

// --- 2) Yerler → ilçe
const gruplar = new Map(ilceler.map((d) => [d.id, []]));
const yerlesebilir = ilceler.filter((d) => d.plaka);
let okunan = 0, yerlesen = 0;
for await (const f of satirlar(YER_DOSYA)) {
  const t = f.properties || {};
  if (!t.name && !t["name:tr"]) continue;
  okunan++;
  const m = merkez(f.geometry);
  if (!m) continue;
  const d = yerlesebilir.find((q) => icindeMi(m[0], m[1], q));
  if (!d) continue;
  gruplar.get(d.id).push({ lat: m[1], lon: m[0], tags: t });
  yerlesen++;
}
console.log(`${okunan} adlı nesne okundu, ${yerlesen} tanesi bir ilçeye yerleşti`);

// --- 3) Yaz
const eskiIndeks = oku(path.join(VERI, "iller.json")) || { iller: {} };
const tarih = new Date().toISOString().slice(0, 10);
const indeks = { surum: 2, tarih, kaynak: "© OpenStreetMap katkıcıları (ODbL), Geofabrik Türkiye dosyası", iller: {} };
let toplamYer = 0, yazilan = 0;
for (const [plaka, ad] of c.ILLER) {
  const il = iller.find((p) => p.plaka === plaka);
  const ds = (ilinIlceleri.get(plaka) || []).slice().sort((a, b) => c.trSirala(a.ad, b.ad));
  if (!il || !ds.length) {
    if (eskiIndeks.iller[plaka]) indeks.iller[plaka] = eskiIndeks.iller[plaka];
    console.log(`${ad}: sınır bulunamadı${eskiIndeks.iller[plaka] ? ", önceki veri korundu" : ""}`);
    continue;
  }
  const ilceYerleri = {};
  let s = 0, w = 180, so = 90, e = -180, n = -90;
  for (const d of ds) {
    const liste = c.yerleriIsle({ elements: gruplar.get(d.id) });
    ilceYerleri[d.id] = liste;
    s += liste.length;
    for (const k of liste) { if (k.o < w) w = k.o; if (k.o > e) e = k.o; if (k.a < so) so = k.a; if (k.a > n) n = k.a; }
  }
  const eski = eskiIndeks.iller[plaka];
  if (eski && eski.s && s < eski.s * 0.5) { indeks.iller[plaka] = eski; console.log(`${ad}: yalnız ${s} yer (önce ${eski.s}); önceki veri korundu`); continue; }
  const dosya = { tarih, ilceler: ilceYerleri };
  yaz(path.join(VERI, "il", String(plaka).padStart(2, "0") + ".json"), dosya);
  const kutu = s ? [so, w, n, e] : [il.kutu[1], il.kutu[0], il.kutu[3], il.kutu[2]];
  indeks.iller[plaka] = { id: il.id, ad, k: kutu, s, b: JSON.stringify(dosya).length, ilce: ds.map((d) => ({ id: d.id, n: d.ad })) };
  toplamYer += s; yazilan++;
  console.log(`${ad}: ${ds.length} ilçe, ${s} yer`);
}
if (yazilan < EN_AZ_IL) { console.error(`Yalnız ${yazilan} il yazılabildi; dizin güncellenmedi.`); process.exit(1); }
yaz(path.join(VERI, "iller.json"), indeks);
console.log(`Bitti: ${yazilan} il, ${toplamYer} yer.`);

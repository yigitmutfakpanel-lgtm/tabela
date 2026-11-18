// Rehber içeriklerini denetler ve yayına hazırlar.
//   Girdi:  icerik/kaynak/*.json  (editörün yazdığı, kaynaklı metinler; aylık veri güncellemesi bunlara DOKUNMAZ)
//           veri/il/NN.json       (aylık konum listeleri; eşleşme için)
//           icerik/ses/<anahtar>.m4a (isteğe bağlı hazır sesli anlatım)
//   Çıktı:  icerik/dizin.json     (yer kimliği → içerik anahtarı; küçük, uygulama hep indirir)
//           icerik/il/NN.json     (o ildeki rehber metinleri; açılınca ya da "il rehberini indir" ile)
//           icerik/rapor.txt      (eksik kaynak, eşleşmeyen yer, bozuk bağlantı)
// Eşleşme yalnız kesin kimlikle yapılır: Wikidata kimliği (d) ya da OSM nesne kimliği (i). İsimle eşleştirme YOK.
// Çalıştırma: node arac/icerik.mjs [--baglanti]   (--baglanti: kaynak bağlantılarını internetten sınar)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const KAYNAK = path.join(KOK, "icerik", "kaynak");
const VERI = path.join(KOK, "veri");
const CIKTI = path.join(KOK, "icerik");
const BAGLANTI = process.argv.includes("--baglanti");
const UA = "KahverengiTabela/1.0 (https://github.com/yigitmutfakpanel-lgtm/tabela)";
const oku = (d) => JSON.parse(fs.readFileSync(d, "utf8"));
const tarihMi = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || "");

export function denetle(y, dosyaAdi) {
  const h = [];
  if (!/^[a-z0-9-]+$/.test(y.anahtar || "")) h.push("anahtar küçük harf, rakam ve tire olmalı");
  if (y.anahtar && dosyaAdi && y.anahtar + ".json" !== dosyaAdi) h.push("dosya adı anahtarla aynı olmalı");
  if (!y.ad) h.push("ad yok");
  const q = y.eslesme?.wikidata || [], o = y.eslesme?.osm || [];
  if (!q.length && !o.length) h.push("eşleşme kimliği yok (wikidata ya da osm)");
  for (const x of q) if (!/^Q\d+$/.test(x)) h.push(`geçersiz Wikidata kimliği: ${x}`);
  for (const x of o) if (!/^[nwr]\d+$/.test(x)) h.push(`geçersiz OSM kimliği: ${x}`);
  if (!y.kisa || y.kisa.length < 60) h.push("kısa tanıtım yok ya da çok kısa");
  if (!Array.isArray(y.kaynaklar) || !y.kaynaklar.length) h.push("kaynak yok");
  for (const k of y.kaynaklar || []) {
    if (!/^https:\/\//.test(k.url || "")) h.push(`kaynak bağlantısı geçersiz: ${k.ad || "?"}`);
    if (!k.ad || !k.kurum) h.push(`kaynağın adı/kurumu eksik: ${k.url || "?"}`);
    if (!tarihMi(k.erisim)) h.push(`kaynağın erişim tarihi yok: ${k.ad || k.url}`);
  }
  if (!tarihMi(y.dogrulama)) h.push("doğrulama tarihi yok");
  if (!Number.isInteger(y.surum)) h.push("içerik sürümü yok");
  for (const b of y.bolumler || []) if (!b.baslik || !b.metin) h.push("boş bölüm");
  for (const i of y.ilginc || []) {
    if (!i.metin) h.push("boş ilginç bilgi");
    if (i.efsane && !/efsane|inanış|söylence|rivayet/i.test(i.metin)) h.push("efsane işaretli bilgi metninde efsane olduğu söylenmiyor");
  }
  return h;
}

function veriKimlikleri() {
  const harita = new Map(); // kimlik → [{plaka, ilce}]
  const dizin = fs.existsSync(path.join(VERI, "iller.json")) ? oku(path.join(VERI, "iller.json")) : { iller: {} };
  for (const plaka of Object.keys(dizin.iller)) {
    const dosya = path.join(VERI, "il", String(plaka).padStart(2, "0") + ".json");
    if (!fs.existsSync(dosya)) continue;
    const d = oku(dosya);
    for (const [ilce, liste] of Object.entries(d.ilceler)) for (const k of liste) {
      for (const kim of [k.d, k.i]) if (kim) {
        const a = harita.get(kim) || [];
        a.push({ plaka: +plaka, ilce: +ilce, ad: k.n });
        harita.set(kim, a);
      }
    }
  }
  return harita;
}

async function baglantiSina(url) {
  try {
    const r = await fetch(url, { method: "GET", redirect: "follow", headers: { "User-Agent": UA } });
    return r.status;
  } catch (e) { return "erişilemedi"; }
}

async function ana() {
  const rapor = [];
  const dosyalar = fs.existsSync(KAYNAK) ? fs.readdirSync(KAYNAK).filter((f) => f.endsWith(".json")).sort() : [];
  const kimlikler = veriKimlikleri();
  const dizin = { surum: 1, tarih: new Date().toISOString().slice(0, 10), yerler: {}, sayfalar: {} };
  const iller = new Map();
  let hatali = 0, yayinlanan = 0;

  for (const f of dosyalar) {
    let y;
    try { y = oku(path.join(KAYNAK, f)); } catch (e) { rapor.push(`${f}: JSON okunamadı (${e.message})`); hatali++; continue; }
    const hatalar = denetle(y, f);
    if (hatalar.length) { hatali++; rapor.push(`${f}: YAYINLANMADI — ${hatalar.join("; ")}`); continue; }

    const adaylar = [...(y.eslesme.wikidata || []), ...(y.eslesme.osm || [])];
    const bulunan = adaylar.flatMap((k) => (kimlikler.get(k) || []).map((x) => ({ ...x, kimlik: k })));
    if (!bulunan.length) { rapor.push(`${f}: konum listesinde eşleşen yer yok (${adaylar.join(", ")}); yayınlanmadı`); continue; }

    const sesDosyasi = path.join(CIKTI, "ses", y.anahtar + ".m4a");
    const ses = fs.existsSync(sesDosyasi)
      ? { dosya: `icerik/ses/${y.anahtar}.m4a`, boyut: fs.statSync(sesDosyasi).size, sure: y.sesSure || null, lisans: y.sesLisans || "Ses: Piper TTS, dfki Türkçe sesi (CC BY-NC-SA 4.0)" }
      : null;
    const yayin = {
      anahtar: y.anahtar, ad: y.ad, kisa: y.kisa,
      ...(y.bolumler?.length ? { bolumler: y.bolumler } : {}),
      ...(y.ilginc?.length ? { ilginc: y.ilginc } : {}),
      kaynaklar: y.kaynaklar, dogrulama: y.dogrulama, surum: y.surum,
      ...(ses ? { ses } : {})
    };
    const plakalar = [...new Set(bulunan.map((b) => b.plaka))];
    for (const p of plakalar) {
      const il = iller.get(p) || {};
      il[y.anahtar] = yayin;
      iller.set(p, il);
    }
    for (const b of bulunan) dizin.yerler[b.kimlik] = y.anahtar;
    dizin.sayfalar[y.anahtar] = { p: plakalar, s: y.surum, ...(ses ? { ses: 1 } : {}) };
    yayinlanan++;
    rapor.push(`${f}: yayınlandı → ${bulunan.map((b) => `${b.kimlik} (${b.ad}, il ${b.plaka})`).join(", ")}${ses ? ", sesli" : ""}`);

    if (BAGLANTI) for (const k of y.kaynaklar) {
      const durum = await baglantiSina(k.url);
      if (durum !== 200) rapor.push(`${f}: kaynak bağlantısı yanıt vermedi (${durum}): ${k.url}`);
    }
  }

  fs.mkdirSync(path.join(CIKTI, "il"), { recursive: true });
  for (const f of fs.readdirSync(path.join(CIKTI, "il"))) if (f.endsWith(".json")) fs.unlinkSync(path.join(CIKTI, "il", f));
  for (const [p, il] of iller) fs.writeFileSync(path.join(CIKTI, "il", String(p).padStart(2, "0") + ".json"), JSON.stringify(il));
  fs.writeFileSync(path.join(CIKTI, "dizin.json"), JSON.stringify(dizin));
  fs.writeFileSync(path.join(CIKTI, "rapor.txt"), rapor.join("\n") + "\n");
  console.log(rapor.join("\n"));
  console.log(`Bitti: ${yayinlanan} rehber yayında, ${hatali} dosya hatalı.`);
  if (hatali) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) ana();

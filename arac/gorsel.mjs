// Fotoğraf listesi: yerlerin OSM "wikidata" etiketinden Wikidata P18 (görsel) ve, rehber içeriği olan yerler için,
// P373 (Commons kategorisi) dosyalarını alır; her dosyanın yazarını ve lisansını Wikimedia Commons'tan çeker.
// İsim benzerliğiyle eşleştirme YAPILMAZ: görsel yalnız yerin kendi Wikidata kimliğine bağlıysa kullanılır.
// Çıktı: veri/gorsel/NN.json  →  { "Q47611": [ { u, b, s, y, l, lu } ] }
//   u: 960 px küçük görsel, b: 1600 px büyük görsel, s: Commons dosya sayfası, y: yazar, l: lisans adı, lu: lisans bağlantısı
// Çalıştırma: node arac/gorsel.mjs   (GitHub Actions'ta aylık; ağ yoksa önceki dosyalar korunur)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VERI = path.join(KOK, "veri");
const UA = "KahverengiTabela/1.0 (https://github.com/yigitmutfakpanel-lgtm/tabela; ucretsiz gezi rehberi)";
const KATEGORI_SINIR = 6; // rehberi olan yerde kategoriden en çok kaç ek fotoğraf
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));
const oku = (d) => { try { return JSON.parse(fs.readFileSync(d, "utf8")); } catch { return null; } };

// Yalnız özgür lisanslar (Commons zaten bunları barındırır; yine de denetlenir)
export function lisansUygunMu(l) {
  if (!l) return false;
  if (/\bNC\b|\bND\b|non-?commercial|no derivatives|fair use|copyrighted/i.test(l)) return false;
  return /^(CC0|CC[ -]BY|Public domain|PD|GFDL|Attribution|FAL|Free Art|OGL|Copyrighted free use)/i.test(l.trim());
}
const htmlSil = (s) => String(s || "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/\s+/g, " ").trim();

async function al(url) {
  for (let deneme = 1; deneme <= 5; deneme++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
      if (r.status === 429 || r.status >= 500) throw new Error("HTTP " + r.status);
      if (!r.ok) throw new Error("HTTP " + r.status);
      return await r.json();
    } catch (e) {
      if (deneme === 5) throw e;
      await bekle(3000 * deneme);
    }
  }
}

async function wikidataGorselleri(qidler) {
  const sonuc = new Map(); // Q → { dosyalar:[], kategori }
  for (let i = 0; i < qidler.length; i += 50) {
    const parca = qidler.slice(i, i + 50);
    const j = await al(`https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=claims&ids=${parca.join("|")}`);
    for (const [q, e] of Object.entries(j.entities || {})) {
      if (!e.claims) continue;
      const dosyalar = (e.claims.P18 || []).filter((c) => c.rank !== "deprecated").map((c) => c.mainsnak?.datavalue?.value).filter(Boolean);
      const kategori = e.claims.P373?.[0]?.mainsnak?.datavalue?.value || null;
      if (dosyalar.length || kategori) sonuc.set(q, { dosyalar, kategori });
    }
    await bekle(500);
  }
  return sonuc;
}

async function kategoriDosyalari(kategori) {
  const j = await al(`https://commons.wikimedia.org/w/api.php?action=query&format=json&list=categorymembers&cmtype=file&cmlimit=30&cmtitle=${encodeURIComponent("Category:" + kategori)}`);
  return (j.query?.categorymembers || []).map((m) => m.title.replace(/^File:/, "")).filter((f) => /\.(jpe?g|png|webp)$/i.test(f));
}

async function dosyaBilgileri(dosyalar) {
  const sonuc = new Map();
  const benzersiz = [...new Set(dosyalar)];
  for (const genislik of [960, 1600]) {
    for (let i = 0; i < benzersiz.length; i += 40) {
      const parca = benzersiz.slice(i, i + 40);
      const basliklar = parca.map((f) => "File:" + f).join("|");
      const j = await al(`https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url|extmetadata|mime&iiurlwidth=${genislik}&titles=${encodeURIComponent(basliklar)}`);
      const normal = new Map((j.query?.normalized || []).map((n) => [n.to, n.from]));
      for (const sayfa of Object.values(j.query?.pages || {})) {
        const ii = sayfa.imageinfo?.[0];
        if (!ii) continue;
        const ad = (normal.get(sayfa.title) || sayfa.title).replace(/^File:/, "");
        const anahtar = benzersiz.find((f) => f.replace(/_/g, " ") === ad.replace(/_/g, " ")) || ad;
        const m = ii.extmetadata || {};
        const kayit = sonuc.get(anahtar) || {
          s: ii.descriptionurl,
          y: htmlSil(m.Artist?.value) || htmlSil(m.Credit?.value) || "Bilinmiyor",
          l: htmlSil(m.LicenseShortName?.value),
          lu: htmlSil(m.LicenseUrl?.value) || undefined,
          mime: ii.mime
        };
        if (genislik === 960) kayit.u = ii.thumburl || ii.url; else kayit.b = ii.thumburl || ii.url;
        sonuc.set(anahtar, kayit);
      }
      await bekle(500);
    }
  }
  return sonuc;
}

async function ana() {
  const dizin = oku(path.join(VERI, "iller.json"));
  if (!dizin) { console.error("veri/iller.json yok"); process.exit(1); }
  const rehberDizini = oku(path.join(KOK, "icerik", "dizin.json"));
  const rehberliQ = new Set(Object.keys(rehberDizini?.yerler || {}).filter((k) => /^Q\d+$/.test(k)));

  const ilQ = new Map(); // plaka → Set(Q)
  for (const plaka of Object.keys(dizin.iller)) {
    const d = oku(path.join(VERI, "il", String(plaka).padStart(2, "0") + ".json"));
    if (!d) continue;
    const kume = new Set();
    for (const l of Object.values(d.ilceler)) for (const k of l) if (k.d) kume.add(k.d);
    ilQ.set(plaka, kume);
  }
  const tumQ = [...new Set([...ilQ.values()].flatMap((s) => [...s]))];
  console.log(`${tumQ.length} yerin Wikidata kimliği var`);

  const wd = await wikidataGorselleri(tumQ);
  const istenen = [];
  for (const [q, v] of wd) {
    v.secilen = v.dosyalar.slice(0, 3);
    if (rehberliQ.has(q) && v.kategori) {
      try {
        const ek = await kategoriDosyalari(v.kategori);
        for (const f of ek) if (v.secilen.length < 3 + KATEGORI_SINIR && !v.secilen.includes(f)) v.secilen.push(f);
      } catch (e) { console.log(`  ${q} kategori alınamadı: ${e.message}`); }
      await bekle(300);
    }
    istenen.push(...v.secilen);
  }
  console.log(`${istenen.length} fotoğrafın lisansı soruluyor`);
  const bilgi = await dosyaBilgileri(istenen);

  let yazilan = 0, reddedilen = 0;
  const rapor = [];
  for (const [plaka, kume] of ilQ) {
    const cikti = {};
    for (const q of kume) {
      const v = wd.get(q);
      if (!v) continue;
      const liste = [];
      for (const f of v.secilen) {
        const b = bilgi.get(f);
        if (!b || !b.u) { rapor.push(`${q} ${f}: dosya bilgisi alınamadı`); continue; }
        if (!lisansUygunMu(b.l)) { reddedilen++; rapor.push(`${q} ${f}: lisans kabul edilmedi (${b.l || "yok"})`); continue; }
        if (b.mime && !/^image\/(jpeg|png|webp)$/.test(b.mime)) continue;
        liste.push({ u: b.u, b: b.b || b.u, s: b.s, y: b.y, l: b.l, ...(b.lu ? { lu: b.lu } : {}) });
      }
      if (liste.length) cikti[q] = liste;
    }
    const dosya = path.join(VERI, "gorsel", String(plaka).padStart(2, "0") + ".json");
    fs.mkdirSync(path.dirname(dosya), { recursive: true });
    fs.writeFileSync(dosya, JSON.stringify(cikti));
    yazilan += Object.keys(cikti).length;
  }
  if (rapor.length) fs.writeFileSync(path.join(VERI, "gorsel", "rapor.txt"), rapor.join("\n") + "\n");
  console.log(`Bitti: ${yazilan} yerin fotoğrafı yazıldı, ${reddedilen} fotoğraf lisans yüzünden atlandı.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  ana().catch((e) => { console.error("Fotoğraflar alınamadı, önceki dosyalar korunuyor:", e.message); process.exit(1); });
}

// Testler için ortak araçlar: Playwright'ı bulma, yerel sunucu, sahte veriyle site hazırlama.
// Gerçek harita sunucusuna, Wikimedia'ya ya da gerçek medya dosyalarına bağlı değildir.
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { createRequire } from "node:module";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const DEPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
import os from "node:os";
process.chdir(os.tmpdir()); // testlerin ekran görüntüleri depoya değil geçici klasöre yazılsın
const gerek = createRequire(import.meta.url);
export function playwright() {
  for (const ad of [process.env.PLAYWRIGHT, "playwright", "/opt/node22/lib/node_modules/playwright"].filter(Boolean)) {
    try { return gerek(ad); } catch (e) {}
  }
  throw new Error("Playwright bulunamadı (PLAYWRIGHT ortam değişkeniyle yolunu ver)");
}

const TIP = { html: "text/html; charset=utf-8", js: "text/javascript", json: "application/json", webmanifest: "application/manifest+json", png: "image/png", woff2: "font/woff2", m4a: "audio/mp4", txt: "text/plain" };
// kok klasörünü /tabela/ altında sunar; gizle: bu desenlere uyan yollar 404 döner; sayac: yol başına istek sayısı
export function sunucu(kok, port, { gizle = [], degistir = {} } = {}) {
  const sayac = {};
  const srv = http.createServer((q, r) => {
    let yol = decodeURIComponent(new URL(q.url, "http://x").pathname).replace(/^\/tabela\//, "");
    if (yol === "") yol = "index.html";
    sayac[yol] = (sayac[yol] || 0) + 1;
    if (gizle.some((g) => g.test(yol))) { r.writeHead(404); r.end(); return; }
    if (degistir[yol]) { r.writeHead(200, { "Content-Type": TIP[yol.split(".").pop()] }); r.end(degistir[yol]()); return; }
    const d = path.join(kok, yol);
    if (!fs.existsSync(d) || fs.statSync(d).isDirectory()) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { "Content-Type": TIP[yol.split(".").pop()] || "application/octet-stream" });
    r.end(fs.readFileSync(d));
  }).listen(port);
  return { srv, sayac, adres: `http://localhost:${port}/tabela/`, kapat: () => srv.close() };
}

export function sayacli() {
  let hata = 0;
  const ok = (c, m) => { console.log((c ? "✓ " : "✗ ") + m); if (!c) hata++; };
  return { ok, bitir: () => { console.log(hata ? hata + " HATA" : "HEPSİ GEÇTİ"); process.exitCode = hata ? 1 : 0; } };
}

const ILLER = 81;
// Sahte hazır veri: Ankara (6) hariç her ilde "Merkez" (p*10+1) ve "Çay" (p*10+2) ilçeleri, her ilçede 3 yer.
export function sahteVeri(kok, { rehberli = true } = {}) {
  const veri = path.join(kok, "veri");
  fs.mkdirSync(path.join(veri, "il"), { recursive: true });
  const iller = {};
  for (let p = 1; p <= ILLER; p++) {
    if (p === 6) continue;
    const ilceler = {};
    for (const id of [p * 10 + 1, p * 10 + 2]) {
      ilceler[id] = [
        { n: "Kale " + id, a: 38 + (id % 100) / 1000, o: 27, c: "kale", i: "n" + id * 7 },
        { n: "Şelale " + id, a: 38.001, o: 27.001, c: "selale", w: "https://tr.wikipedia.org/wiki/%C5%9Eelale", i: "n" + (id * 7 + 1) },
        { n: "Yılanlı Tabiat Parkı", a: 38.1, o: 27.1, c: "tabiat", i: "r" + (id * 7 + 3) }
      ];
    }
    if (rehberli && p === 35) {
      // Rehberli yer, aynı adlı başka bir yer (başka il) ve eski biçimli (kimliksiz) kayıt
      ilceler[351].push({ n: "Deneme Antik Kenti", a: 37.94, o: 27.34, c: "antik", w: "https://tr.wikipedia.org/wiki/Efes", i: "r900001", d: "Q900001" });
      ilceler[351].push({ n: "Ulu Cami", a: 38.2, o: 27.2, c: "cami", i: "w900002", d: "Q900002" });
      ilceler[352].push({ n: "Eski Biçim Kalesi", a: 38.3, o: 27.3, c: "kale" });
      ilceler[352].push({ n: "Fotoğrafsız Rehberli Yer", a: 38.4, o: 27.4, c: "muze", i: "n900005", d: "Q900005" });
    }
    if (rehberli && p === 7) ilceler[71].push({ n: "Ulu Cami", a: 36.9, o: 30.7, c: "cami", i: "w900003", d: "Q900003" });
    const dosya = { tarih: "2026-11-18", ilceler };
    fs.writeFileSync(path.join(veri, "il", String(p).padStart(2, "0") + ".json"), JSON.stringify(dosya));
    iller[p] = { id: 9000 + p, ad: "İl" + p, k: [38, 27, 38.1, 27.1], s: Object.values(ilceler).flat().length, b: JSON.stringify(dosya).length, ilce: [{ id: p * 10 + 1, n: "Merkez" }, { id: p * 10 + 2, n: "Çay" }] };
  }
  fs.writeFileSync(path.join(veri, "iller.json"), JSON.stringify({ surum: 2, tarih: "2026-11-18", iller }));
}

export const TEST_FOTO = "https://foto.test/kapak.png";
export function sahteRehber(kok, { ses = true } = {}) {
  const kaynak = path.join(kok, "icerik", "kaynak");
  fs.mkdirSync(kaynak, { recursive: true });
  const ortakKaynak = [{ ad: "Deneme kaynağı", kurum: "Test Kurumu", url: "https://ornek.test/kaynak", erisim: "2026-11-18" }];
  const yaz = (y) => fs.writeFileSync(path.join(kaynak, y.anahtar + ".json"), JSON.stringify({ dogrulama: "2026-11-18", surum: 1, kaynaklar: ortakKaynak, ...y }));
  yaz({ anahtar: "deneme-antik", ad: "Deneme Antik Kenti", eslesme: { wikidata: ["Q900001"] },
    kisa: "Bu, otomatik testler için yazılmış sahte bir kısa tanıtımdır. Gerçek bir yeri anlatmaz; yalnız ekranın doğru çalıştığını sınar.",
    bolumler: [{ baslik: "Tarihçesi", metin: "MÖ 1000 yıllarında kurulduğu varsayılan sahte bir yer. III. Deneme döneminde 2-3 kat büyüdü." }],
    ilginc: [{ metin: "Bu bir efsanedir: test verisidir.", efsane: true }, { metin: "Sahte ilginç bilgi." }] });
  yaz({ anahtar: "ulu-cami-35", ad: "Ulu Cami (İl35)", eslesme: { wikidata: ["Q900002"] },
    kisa: "İl 35'teki Ulu Cami'nin sahte rehberi. Aynı adlı İl 7'deki yerle karışmamalıdır; bu metin yalnız Q900002 kimliğine bağlıdır." });
  yaz({ anahtar: "fotografsiz", ad: "Fotoğrafsız Rehberli Yer", eslesme: { osm: ["n900005"] },
    kisa: "Fotoğrafı olmayan, cihaz sesiyle okunacak sahte bir rehber. Hazır ses kaydı yoktur; ekran bozulmadan açılmalıdır." });
  // Kuralları bozan bir dosya: yayınlanmamalı
  fs.writeFileSync(path.join(kaynak, "hatali.json"), JSON.stringify({ anahtar: "hatali", ad: "Kaynaksız", eslesme: { wikidata: ["Q900001"] }, kisa: "kısa" }));
  if (ses) {
    fs.mkdirSync(path.join(kok, "icerik", "ses"), { recursive: true });
    try {
      execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=6", "-ac", "1", "-c:a", "aac", "-b:a", "48k", path.join(kok, "icerik", "ses", "deneme-antik.m4a")]);
      const y = JSON.parse(fs.readFileSync(path.join(kaynak, "deneme-antik.json")));
      y.sesSure = 6; fs.writeFileSync(path.join(kaynak, "deneme-antik.json"), JSON.stringify(y));
    } catch (e) { console.log("  (ffmpeg yok; hazır ses testi atlanır)"); }
  }
  // Hatalı dosya bilerek konuldu: araç onu reddedip 1 koduyla çıkar; rapor dosyasında görünmeli
  const sonuc = spawnSync(process.execPath, [path.join(kok, "arac", "icerik.mjs")], { cwd: kok, encoding: "utf8" });
  if (!/hatali\.json: YAYINLANMADI/.test(sonuc.stdout)) throw new Error("İçerik aracı hatalı dosyayı reddetmedi:\n" + sonuc.stdout + sonuc.stderr);
  // Fotoğraflar: biri geçerli; biri lisanssız, biri http: bu ikisi gösterilmemeli
  fs.mkdirSync(path.join(kok, "veri", "gorsel"), { recursive: true });
  fs.writeFileSync(path.join(kok, "veri", "gorsel", "35.json"), JSON.stringify({
    Q900001: [
      { u: TEST_FOTO, b: TEST_FOTO, s: "https://commons.wikimedia.org/wiki/File:Deneme.png", y: "Deneme Fotoğrafçı", l: "CC BY-SA 4.0", lu: "https://creativecommons.org/licenses/by-sa/4.0" },
      { u: "https://foto.test/lisanssiz.png", s: "https://commons.wikimedia.org/wiki/File:X.png", y: "Biri" },
      { u: "http://foto.test/guvensiz.png", s: "https://commons.wikimedia.org/wiki/File:Y.png", y: "Biri", l: "CC0" }
    ]
  }));
}

export function siteHazirla(hedef, { veri = true, rehber = true, ses = true } = {}) {
  fs.rmSync(hedef, { recursive: true, force: true });
  fs.mkdirSync(hedef, { recursive: true });
  for (const f of ["index.html", "sw.js", "manifest.webmanifest"]) fs.copyFileSync(path.join(DEPO, f), path.join(hedef, f));
  for (const d of ["icons", "fonts", "arac"]) fs.cpSync(path.join(DEPO, d), path.join(hedef, d), { recursive: true });
  if (veri) sahteVeri(hedef, { rehberli: rehber });
  if (veri && rehber) sahteRehber(hedef, { ses });
  return hedef;
}

// 1×1 PNG
export const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

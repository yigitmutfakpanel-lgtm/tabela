// Eski sürümden yeni sürüme geçiş: telefonda eski (kimliksiz) Türkiye listesi varken, aynı tarihli yeni liste gelince
// liste yenilenmeli ve rehberler görünmeli. Eski sürüm dosyaları git geçmişinden (39d1c7c) alınır.
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { playwright, siteHazirla, sunucu, sayacli, DEPO, PNG } from "./ortak.mjs";
const { chromium } = playwright();
const { ok, bitir } = sayacli();

const KOK = siteHazirla(path.join(os.tmpdir(), "tabela-test-gecis"));
const yeni = { index: fs.readFileSync(path.join(KOK, "index.html")), sw: fs.readFileSync(path.join(KOK, "sw.js")) };
const eski = (f) => execFileSync("git", ["-C", DEPO, "show", "39d1c7c:" + f]);
// Eski veri: kimliksiz kayıtlar, aynı tarih
const yeniVeri = new Map();
for (const f of fs.readdirSync(path.join(KOK, "veri", "il"))) {
  const d = path.join(KOK, "veri", "il", f);
  yeniVeri.set(f, fs.readFileSync(d));
  const j = JSON.parse(fs.readFileSync(d));
  for (const l of Object.values(j.ilceler)) for (const k of l) { delete k.i; delete k.d; }
  fs.writeFileSync(d, JSON.stringify(j));
}
const yeniDizin = fs.readFileSync(path.join(KOK, "veri", "iller.json"));
const eskiDizin = JSON.parse(yeniDizin); for (const i of Object.values(eskiDizin.iller)) i.b -= 40; delete eskiDizin.damga;
fs.writeFileSync(path.join(KOK, "veri", "iller.json"), JSON.stringify(eskiDizin));
fs.writeFileSync(path.join(KOK, "index.html"), eski("index.html"));
fs.writeFileSync(path.join(KOK, "sw.js"), eski("sw.js"));

const s = sunucu(KOK, 8773);
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 375, height: 800 } });
await ctx.route(/overpass-api\.de|kumi\.systems|mail\.ru/, (r) => r.abort());
await ctx.route("https://foto.test/**", (r) => r.fulfill({ status: 200, contentType: "image/png", body: PNG }));
const p = await ctx.newPage();
const errs = []; p.on("pageerror", (e) => errs.push(e.message));
await p.goto(s.adres);
await p.evaluate(() => navigator.serviceWorker.ready);
await p.reload();
await p.waitForFunction(() => /Hazır: \d+ il/.test(document.getElementById("indirYazi").textContent), null, { timeout: 60000 });
ok(true, "eski sürüm: Türkiye listesi indi");

// Yeni sürüm yayınlanıyor (aynı tarihli, kimlikli liste; damgasız — eski üreticiyle üretilmiş gibi)
fs.writeFileSync(path.join(KOK, "index.html"), yeni.index);
fs.writeFileSync(path.join(KOK, "sw.js"), yeni.sw);
for (const [f, v] of yeniVeri) fs.writeFileSync(path.join(KOK, "veri", "il", f), v);
const d = JSON.parse(yeniDizin); delete d.damga; fs.writeFileSync(path.join(KOK, "veri", "iller.json"), JSON.stringify(d));
await p.reload();
await p.waitForTimeout(1500);
await p.reload(); // yeni hizmet çalışanı devrede
await p.waitForFunction(() => /Hazır: \d+ il/.test(document.getElementById("indirYazi")?.textContent || "") || (document.getElementById("cihazDurum")?.textContent || "").includes("Telefonda"), null, { timeout: 60000 });
await p.selectOption("#il", "35");
await p.waitForSelector(".kart");
await p.waitForSelector(".rozet-rehber", { timeout: 15000 }).catch(() => {});
ok(await p.$$eval(".rozet-rehber", (x) => x.length) === 3, "yeni sürümde liste yenilendi, rehber rozetleri görünüyor");
await p.click('.kart:has(.ad:text-is("Deneme Antik Kenti")) button.git');
await p.waitForFunction(() => !document.getElementById("rehberYukleniyor"));
ok((await p.textContent("#detayGovde")).includes("Bir dakikada keşfet"), "geçişten sonra rehber açılıyor");
ok(errs.length === 0, "sayfa hatası yok " + errs.join(" / "));
await b.close(); s.kapat();
bitir();

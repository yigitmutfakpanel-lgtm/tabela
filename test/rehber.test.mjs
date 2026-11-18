// Rehber özellikleri: detay ekranı, fotoğraf ve lisans, yazılı rehber eşleşmesi, sesli rehber, internetsiz indirme.
// Sahte veriyle çalışır (gerçek harita sunucusu, Wikimedia ya da gerçek ses dosyası gerekmez).
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { playwright, siteHazirla, sunucu, sayacli, PNG, TEST_FOTO } from "./ortak.mjs";
const { chromium } = playwright();

const KOK = siteHazirla(path.join(os.tmpdir(), "tabela-test-rehber"));
const SESLI = fs.existsSync(path.join(KOK, "icerik", "ses", "deneme-antik.m4a"));
const s = sunucu(KOK, 8771);
const { ok, bitir } = sayacli();
const b = await chromium.launch();

const sahteSes = (tr) => `(() => {
  const sesler = ${tr} ? [{ name: "Sahte Türkçe", lang: "tr-TR", localService: true, default: true }] : [{ name: "English", lang: "en-US", localService: true }];
  window.__konusulan = [];
  const ss = { speaking: false, getVoices: () => sesler, addEventListener() {}, removeEventListener() {},
    speak(u) { window.__konusulan.push(u.text); this._son = u; setTimeout(() => { if (!u.__iptal && u.onend) u.onend({}); }, 40); },
    cancel() { if (this._son) this._son.__iptal = true; }, pause() {}, resume() {} };
  Object.defineProperty(window, "speechSynthesis", { value: ss, configurable: true });
  window.SpeechSynthesisUtterance = function (t) { this.text = t; };
})();`;
const sesYok = `Object.defineProperty(window, "speechSynthesis", { value: undefined, configurable: true }); window.SpeechSynthesisUtterance = undefined;`;

async function baglam(opts = {}, initScript = sahteSes(true)) {
  const ctx = await b.newContext({ viewport: { width: 375, height: 800 }, deviceScaleFactor: 1, serviceWorkers: "block", ...opts });
  if (initScript) await ctx.addInitScript(initScript);
  await ctx.route(/overpass-api\.de|kumi\.systems|mail\.ru/, (r) => r.abort());
  await ctx.route("https://foto.test/**", (r) => r.fulfill({ status: 200, contentType: "image/png", body: PNG, headers: { "Access-Control-Allow-Origin": "*" } }));
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(e.message));
  p.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|ERR_|net::/.test(m.text())) errs.push(m.text()); });
  return { ctx, p, errs };
}
const kartAc = async (p, ad) => { await p.click(`.kart:has(.ad:text-is("${ad}")) button.git`); await p.waitForSelector("#detay:not([hidden])"); await p.waitForFunction(() => !document.getElementById('rehberYukleniyor')); };
const geri = async (p) => { await p.goBack(); await p.waitForFunction(() => document.getElementById("detay").hidden); };

// --- 1-9, 15-17: hizmet çalışanı kapalı
{
  const { ctx, p, errs } = await baglam();
  await p.goto(s.adres);
  await p.selectOption("#il", "35");
  await p.waitForSelector(".kart");
  const ilceler = await p.$$eval("#ilce option", (o) => o.map((x) => x.textContent));
  ok(ilceler.join() === "Tüm il,Çay,Merkez", "1. il ve ilçe seçimi: " + ilceler.join());
  ok(await p.$$eval(".rozet-rehber", (x) => x.length) === 3, "rehberli yerlerde 'Rehber' rozeti (3)");

  // 3. Liste konumu ve filtre korunuyor
  await p.fill("#ara", "a");
  await p.waitForTimeout(100);
  await p.evaluate(() => window.scrollTo(0, 220));
  const once = await p.evaluate(() => window.scrollY);
  await kartAc(p, "Deneme Antik Kenti");
  const acildigindaKonum = await p.evaluate(() => window.scrollY); // tıklamadan önce Playwright kartı görünür yapar
  ok(await p.textContent("#detayAd") === "Deneme Antik Kenti", "2. karta dokununca detay ekranı açılıyor");
  ok((await p.textContent(".yer-meta")).includes("Merkez, İl35") || (await p.textContent(".yer-meta")).includes("İzmir"), "detayda il/ilçe/kategori: " + (await p.textContent(".yer-meta")));
  // 4. Yol tarifi
  ok(await p.getAttribute("#yolTarifi", "href") === "https://www.google.com/maps/dir/?api=1&destination=37.94,27.34&travelmode=driving", "4. yol tarifi doğru koordinatla");
  // 7. Fotoğraf ve lisans denetimi
  const imgler = await p.$$eval("#detayGovde img", (x) => x.map((i) => i.getAttribute("src")));
  ok(imgler.length === 1 && imgler[0] === TEST_FOTO, "7. yalnız künyesi tam ve https olan fotoğraf gösteriliyor: " + imgler.join(","));
  const kunye = await p.textContent(".foto-kunye");
  ok(kunye.includes("Deneme Fotoğrafçı") && kunye.includes("CC BY-SA 4.0") && kunye.includes("Wikimedia Commons"), "7. fotoğrafçı, lisans ve kaynak gösteriliyor");
  ok(!(await p.$("#bFoto")), "tek geçerli fotoğrafta ayrı galeri yok");
  await p.click("#kapak button"); await p.waitForSelector("#buyukFoto:not([hidden])");
  ok((await p.textContent("#buyukKunye")).includes("CC BY-SA 4.0"), "fotoğrafa dokununca büyük görünüm ve künye");
  await p.keyboard.press("Escape");
  ok(await p.$eval("#buyukFoto", (e) => e.hidden), "Escape büyük fotoğrafı kapatıyor");
  // İçerik
  const govde = await p.textContent("#detayGovde");
  ok(govde.includes("Bir dakikada keşfet") && govde.includes("Hikâyesini keşfet") && govde.includes("Biliyor muydunuz?"), "üç okuma bölümü var");
  ok(await p.$$eval(".efsane", (x) => x.length) === 1, "efsane açıkça işaretli");
  ok(govde.includes("Deneme kaynağı") && govde.includes("Konum kaydı") && govde.includes("Son kontrol: 18.11.2026"), "kaynaklar, OSM kaydı ve doğrulama tarihi");
  ok(!govde.includes("Kaynaksız"), "kuralları bozan içerik yayınlanmadı");
  ok(await p.evaluate(() => okunabilirMetin("MÖ 1000, III. Deneme, 2-3 kat")) === "milattan önce 1000, Üçüncü Deneme, 2 ile 3 kat", "sesli okuma metni kısaltmaları açıyor");
  // 8. Ses oynatıcı (hazır kayıt; tarayıcı AAC açamazsa cihaz sesine geçmeli)
  if (SESLI) {
    const aac = await p.evaluate(() => new Audio().canPlayType('audio/mp4; codecs="mp4a.40.2"'));
    await p.click("#sesAna");
    if (aac) {
      await p.waitForFunction(() => document.getElementById("sesAna").textContent.includes("Duraklat"), null, { timeout: 8000 });
      await p.waitForTimeout(1200);
      ok(await p.evaluate(() => document.getElementById("sesIlerleme").value > 0), "8. hazır ses kaydı çalıyor ve ilerliyor");
      await p.click("#sesAna");
      await p.waitForTimeout(300);
      ok((await p.textContent("#sesAna")).includes("Dinle"), "8. duraklat çalışıyor");
      await p.click("#sesBastan");
      await p.waitForTimeout(300);
      ok((await p.textContent("#sesAna")).includes("Duraklat"), "8. baştan başlat çalışıyor");
      await p.click("#sesAna");
    } else {
      await p.waitForFunction(() => (window.__konusulan || []).length > 0, null, { timeout: 8000 });
      ok((await p.textContent("#sesNot")).includes("deneniyor") || (await p.textContent("#sesNot")).includes("Türkçe"), "8. tarayıcı kaydı açamadı → cihazın Türkçe sesine geçti");
    }
  }
  // 3. Geri dönünce liste ve filtre
  await geri(p);
  ok(once > 0 && await p.inputValue("#ara") === "a" && Math.abs((await p.evaluate(() => window.scrollY)) - acildigindaKonum) < 5, `3. geri dönünce arama ve liste konumu korunuyor (${acildigindaKonum})`);
  await p.fill("#ara", "");

  // 6. Fotoğrafsız rehberli yer + cihaz sesi (sahte Türkçe ses)
  await kartAc(p, "Fotoğrafsız Rehberli Yer");
  ok(!!(await p.$("#kapak .yer-tutucu")) && !(await p.$("#kapak img")), "6. fotoğraf yoksa kategori görseli, ekran bozulmuyor");
  await p.waitForFunction(() => !document.getElementById("sesAna").disabled);
  await p.click("#sesAna");
  await p.waitForFunction(() => window.__konusulan.length >= 2, null, { timeout: 5000 });
  const konusulan = await p.evaluate(() => window.__konusulan.slice());
  ok(konusulan[0] === "Fotoğrafsız Rehberli Yer.", "8. cihaz sesi metni cümle cümle okuyor");
  await p.click("#sesAna");
  ok((await p.textContent("#sesAna")).includes("Dinle"), "8. cihaz sesinde duraklat");
  await p.click("#sesIleri");
  ok(+(await p.inputValue("#sesIlerleme")) > 0, "8. 15 sn ileri ilerlemeyi değiştiriyor");
  ok((await p.textContent("#sesNot")).includes("cihazda kurulu"), "yerel ses için doğru not (internetsiz iddiası yok)");
  ok(await p.evaluate(() => document.getElementById("detay").scrollWidth) <= 375, "15. detay ekranında yatay taşma yok");
  await geri(p);

  // 5. Aynı adlı farklı yerler
  await kartAc(p, "Ulu Cami");
  ok((await p.textContent("#detayGovde")).includes("İl 35'teki Ulu Cami"), "5. İl35'teki Ulu Cami kendi rehberini gösteriyor");
  await geri(p);
  await p.selectOption("#il", "7");
  await p.waitForSelector(".kart");
  await kartAc(p, "Ulu Cami");
  const g7 = await p.textContent("#detayGovde");
  ok(g7.includes("henüz hazırlanmadı") && !g7.includes("İl 35'teki"), "5. İl7'deki aynı adlı yerde başka yerin rehberi görünmüyor");
  await geri(p);
  // 17. Eski biçim (kimliksiz) kayıt
  await p.selectOption("#il", "35");
  await p.waitForSelector(".kart");
  await kartAc(p, "Eski Biçim Kalesi");
  ok((await p.textContent("#detayGovde")).includes("henüz hazırlanmadı") && !!(await p.$("#yolTarifi")), "17. eski biçimli kayıt sorunsuz açılıyor");
  await geri(p);
  // Depolama paneli ve il rehberini indirme
  await p.click("#depoAc");
  await p.waitForSelector("#ilIndir");
  ok((await p.textContent("#depoIcerik")).includes("3 yerin doğrulanmış rehberi"), "depolama paneli ilin rehber sayısını gösteriyor");
  await p.check("#ilMedya");
  await p.click("#ilIndir");
  await p.waitForFunction(() => /İndirildi|indirilemedi/.test(document.getElementById("depoIcerik").textContent) || document.getElementById("depoIcerik").textContent.includes("İndirdiğin il"), null, { timeout: 10000 });
  ok((await p.textContent("#depoIcerik")).includes("İndirdiğin il rehberleri: İl35") || (await p.textContent("#depoIcerik")).includes("İzmir"), "il rehberi indirildi ve listelendi");
  const medya = await p.evaluate(async () => (await (await caches.open("tabelamedya")).keys()).map((r) => r.url));
  ok(medya.includes("https://foto.test/kapak.png") && (!SESLI || medya.some((u) => u.endsWith("deneme-antik.m4a"))), "il indirmesi fotoğraf ve sesi cihaza aldı: " + medya.length);
  await p.click("#medyaTemizle");
  await p.waitForTimeout(300);
  ok(await p.evaluate(async () => (await (await caches.open("tabelamedya")).keys()).length) === 0, "indirilen medyayı temizle çalışıyor");
  await p.click("#depoKapat");
  ok(await p.evaluate(() => document.documentElement.scrollWidth) <= 375, "15. listede yatay taşma yok");
  ok(errs.length === 0, "16. konsolda hata yok " + errs.join(" / "));
  await ctx.close();
}

// --- 9. Ses desteği yok / Türkçe ses yok
for (const [ad, betik, beklenen] of [["desteklemiyor", sesYok, "desteklemiyor"], ["Türkçe ses yok", sahteSes(false), "Türkçe metin okuma sesi bulunamadı"]]) {
  const { ctx, p } = await baglam({}, betik);
  await p.goto(s.adres);
  await p.selectOption("#il", "35");
  await p.waitForSelector(".kart");
  await kartAc(p, "Fotoğrafsız Rehberli Yer");
  await p.waitForFunction((b) => document.getElementById("sesNot").textContent.includes(b), beklenen, { timeout: 5000 });
  ok(await p.$eval("#sesAna", (x) => x.disabled) && (await p.textContent("#detayGovde")).includes("Bir dakikada keşfet"), `9. ${ad}: anlaşılır mesaj, düğme kapalı, yazılı rehber okunuyor`);
  await ctx.close();
}

// --- 10-14: hizmet çalışanı açık, internetsiz kullanım
{
  const { ctx, p, errs } = await baglam({ serviceWorkers: "allow" });
  await p.goto(s.adres);
  await p.evaluate(() => navigator.serviceWorker.ready);
  await p.reload();
  await p.waitForFunction(() => !!navigator.serviceWorker.controller);
  await p.waitForFunction(() => /Hazır: \d+ il/.test(document.getElementById("indirYazi").textContent) || document.getElementById("cihazDurum").textContent.includes("Telefonda"), null, { timeout: 60000 });
  ok(true, "12. Türkiye listesi arka planda indi");
  await p.selectOption("#il", "35");
  await p.waitForSelector(".kart");
  await kartAc(p, "Deneme Antik Kenti");
  await p.click("#yerIndir");
  await p.waitForFunction(() => /İndirildi|indirilemedi/.test(document.getElementById("yerIndir").textContent), null, { timeout: 15000 });
  await p.waitForFunction(() => document.getElementById("indirDurum").textContent.includes("Metin telefonda"));
  const durumMetni = await p.textContent("#indirDurum");
  ok(durumMetni.includes("✅ Metin telefonda") && durumMetni.includes("Fotoğraflar: 1 / 1") && (!SESLI || durumMetni.includes("✅ Ses kaydı telefonda")), "yer rehberi indirildi: " + durumMetni.replace(/\s+/g, " "));
  await geri(p);
  // 14. İkinci açılışta gereksiz indirme yok (aynı sürüm)
  const tumOnce = { ...s.sayac };
  await p.reload();
  await p.waitForSelector(".kart");
  await p.waitForTimeout(2500);
  const artan = Object.keys(s.sayac).filter((k) => /^(veri|icerik)\/(il|gorsel)\//.test(k) && s.sayac[k] !== tumOnce[k]);
  ok(artan.length === 0, "14. ikinci açılışta il dosyaları yeniden indirilmedi" + (artan.length ? ": " + artan.map((k) => `${k} ${tumOnce[k] || 0}→${s.sayac[k]}`).join(", ") : ""));
  // 13. Yeni sürüm kayıtları silmiyor ve Türkiye listesini yeniden indirmiyor
  const surumOnce = { ...s.sayac };
  const yeniSw = fs.readFileSync(path.join(KOK, "sw.js"), "utf8").replace(/const SURUM = "tabela-\d+"/, 'const SURUM = "tabela-99"');
  fs.writeFileSync(path.join(KOK, "sw.js"), yeniSw);
  await p.reload();
  for (let i = 0; i < 60 && !(await p.evaluate(() => caches.keys())).includes("tabela-99"); i++) await p.waitForTimeout(250);
  for (let i = 0; i < 40 && (await p.evaluate(() => caches.keys())).some((k) => /^tabela-\d+$/.test(k) && k !== "tabela-99"); i++) await p.waitForTimeout(250);
  await p.waitForTimeout(2000);
  const kaplar = await p.evaluate(() => caches.keys());
  const rehberKaydi = await p.evaluate(async () => !!(await (await caches.open("tabelarehber")).match(new URL("icerik/il/35.json", location.href).href)));
  ok(kaplar.includes("tabelaveri") && kaplar.includes("tabelamedya") && rehberKaydi && !kaplar.some((k) => /^tabela-\d+$/.test(k) && k !== "tabela-99"), "13. yeni sürüm eski kabuğu sildi, veri/rehber/medya kaplarını korudu: " + kaplar.join(","));
  const surumdeInen = Object.keys(s.sayac).filter((k) => /^veri\/il\//.test(k) && s.sayac[k] !== surumOnce[k]);
  ok(surumdeInen.length <= 1, "13. sürüm geçişinde Türkiye listesi yeniden inmedi (en çok açık il: " + surumdeInen.join(",") + ")");
  // 10. İndirilmiş rehber internetsiz açılıyor
  await ctx.setOffline(true);
  await ctx.unroute("https://foto.test/**");
  await ctx.route("https://foto.test/**", (r) => r.abort());
  await p.reload();
  await p.waitForSelector("#il");
  await p.selectOption("#il", "35");
  await p.waitForSelector(".kart");
  await kartAc(p, "Deneme Antik Kenti");
  ok((await p.textContent("#detayGovde")).includes("Bir dakikada keşfet"), "10. indirilmiş rehber internetsiz açılıyor");
  await geri(p);
  // 11. İndirilmemiş medya internetsiz: medyayı silip yeniden bak
  await p.evaluate(() => caches.delete("tabelamedya"));
  await kartAc(p, "Deneme Antik Kenti");
  await p.waitForFunction(() => /indirilmemiş|yüklenemedi/.test(document.querySelector(".foto-kunye")?.textContent || "") || !!document.querySelector("#kapak .yer-tutucu"), null, { timeout: 5000 });
  await p.waitForFunction(() => document.getElementById("indirDurum").textContent.includes("Fotoğraflar"));
  const d11 = await p.textContent("#indirDurum");
  ok(d11.includes("Fotoğraflar: 0 / 1") && (!SESLI || d11.includes("Ses kaydı henüz telefonda değil")) && (await p.textContent(".foto-kunye")).includes("indirilmemiş"), "11. indirilmemiş fotoğraf/ses internetsizken doğru belirtiliyor");
  await ctx.setOffline(false);
  ok(errs.length === 0, "16. hizmet çalışanıyla konsol hatası yok " + errs.join(" / "));
  await ctx.close();
}

await b.close();
s.kapat();
bitir();

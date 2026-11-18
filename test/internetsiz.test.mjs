// Tam internetsiz: ilk açılışta Türkiye listesi iner; sonra hiç açılmamış bir il de internetsiz çalışır.
import os from 'node:os';
import path from 'node:path';
import { playwright, siteHazirla } from './ortak.mjs';
const { chromium } = playwright();
import http from 'node:http';
import fs from 'node:fs';
const KOK = process.argv[2] || siteHazirla(path.join(os.tmpdir(), 'tabela-test-' + path.basename(import.meta.url, '.test.mjs')), { rehber: false });
const TIP = { html: 'text/html; charset=utf-8', js: 'text/javascript', json: 'application/json', webmanifest: 'application/manifest+json', png: 'image/png', woff2: 'font/woff2' };
let veriIstek = 0;
const srv = http.createServer((q, r) => {
  let yol = decodeURIComponent(new URL(q.url, 'http://x').pathname).replace(/^\/tabela\//, '');
  if (yol === '') yol = 'index.html';
  if (yol.startsWith('veri/il/')) veriIstek++;
  const dosya = KOK + '/' + yol;
  if (!fs.existsSync(dosya) || fs.statSync(dosya).isDirectory()) { r.writeHead(404); r.end(); return; }
  r.writeHead(200, { 'Content-Type': TIP[yol.split('.').pop()] || 'application/octet-stream' });
  r.end(fs.readFileSync(dosya));
}).listen(8768);
let hata = 0; const ok = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) hata++; };
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 375, height: 780 }, geolocation: { latitude: 38.0, longitude: 27.0 }, permissions: ['geolocation'], userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36' });
let dis = 0;
await ctx.route(/overpass-api\.de|kumi\.systems|mail\.ru/, (r) => { dis++; r.abort(); });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.goto('http://localhost:8768/tabela/');
await p.screenshot({ path: 'c0.png' });
await p.waitForFunction(() => /Hazır: \d+ il/.test(document.getElementById('indirYazi').textContent), null, { timeout: 60000 });
ok(true, 'indirme bitti: ' + await p.textContent('#indirYazi'));
ok(veriIstek >= 80, 'il dosyası isteği: ' + veriIstek);
ok((await p.textContent('footer')).includes('Telefonda: 80 il'), 'altta durum: ' + (await p.textContent('footer')).trim());
await p.screenshot({ path: 'c1.png' });
await ctx.setOffline(true);
await p.reload();
await p.waitForSelector('#il');
await p.selectOption('#il', '7'); // hiç açılmamış il
await p.waitForSelector('.kart');
ok((await p.$$('.kart')).length === 5, 'internetsiz, hiç açılmamış il (Antalya): ' + (await p.$$('.kart')).length + ' yer');
ok(await p.$$eval('.kart a.wiki[href^="geo:"]', (a) => a.length) === 5, 'Android: Başka harita bağlantısı');
await p.selectOption('#ilce', { index: 1 });
await p.waitForFunction(() => document.querySelectorAll('.kart').length === 3);
ok(true, 'internetsiz ilçe');
await p.click('#yakin');
await p.waitForSelector('.uzak');
ok((await p.$$('.kart')).length > 0, 'internetsiz yakınımdakiler: ' + (await p.$$('.kart')).length);
ok(dis === 0, 'harita sunucusuna hiç istek gitmedi: ' + dis);
ok(errs.length === 0, 'sayfa hatası yok ' + errs.join(' / '));
await p.screenshot({ path: 'c2.png' });
// ikinci açılış: tekrar indirmemeli
await ctx.setOffline(false);
const once = veriIstek;
await p.reload(); await p.waitForTimeout(4000);
ok(veriIstek - once < 5, 'ikinci açılışta yeniden indirmedi: ' + (veriIstek - once));
await b.close(); srv.close();
console.log(hata ? hata + ' HATA' : 'HEPSİ GEÇTİ');

import { playwright, DEPO } from './ortak.mjs';
const { chromium } = playwright();
import http from 'node:http';
import fs from 'node:fs';
const CSP = process.env.CSP || "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; font-src 'self'; img-src 'self' data: blob: https://upload.wikimedia.org https://thumb.wikimedia.org; media-src 'self' blob:; connect-src 'self' https://overpass-api.de https://overpass.kumi.systems https://maps.mail.ru https://upload.wikimedia.org https://thumb.wikimedia.org; manifest-src 'self'; worker-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'";
const TIP = {html:'text/html; charset=utf-8', js:'text/javascript', webmanifest:'application/manifest+json', png:'image/png', woff2:'font/woff2'};
const srv = http.createServer((q, r) => {
  let yol = new URL(q.url, 'http://x').pathname.replace(/^\/turizm\//, '');
  if (yol === '') yol = 'index.html';
  if (/^(veri|icerik)\//.test(yol)) { r.writeHead(404); r.end(); return; } // canlı sorgu yolu sınanıyor
  const dosya = DEPO + '/' + yol;
  if (!fs.existsSync(dosya)) { r.writeHead(404); r.end(); return; }
  r.writeHead(200, {'Content-Type': TIP[yol.split('.').pop()] || 'application/octet-stream', 'Cache-Control':'no-cache', ...(CSP?{'Content-Security-Policy':CSP,'Permissions-Policy':'camera=(), geolocation=(self), microphone=()'}:{})});
  r.end(fs.readFileSync(dosya));
}).listen(8765);
let fails = 0; const ok = (c, m) => { console.log((c?'✓ ':'✗ ')+m); if(!c) fails++; };
const calls = [];
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport:{width:375,height:780}, geolocation:{latitude:37.94,longitude:27.34}, permissions:['geolocation'], serviceWorkers:'block' });
const page = await ctx.newPage();
const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type()==='error') errs.push(m.text()); });
await page.route('https://fonts.googleapis.com/**', r => r.abort());
await page.route('https://fonts.gstatic.com/**', r => r.abort());
await page.route('https://overpass-api.de/**', r => { calls.push('de'); r.fulfill({status:504, body:'busy'}); });
await page.route('https://maps.mail.ru/**', r => r.abort());
const kumi = async r => {
  const q = decodeURIComponent(r.request().postData().slice(5).replace(/\+/g,' '));
  calls.push(q);
  let els;
  if (q.includes('ISO3166-2"~')) els = Array.from({length:81},(_,i)=>({type:'relation',id:i+1===35?223167:1000+i+1,tags:{name:'X'+(i+1),'ISO3166-2':'TR-'+String(i+1).padStart(2,'0')}}));
  else if (q.includes('"admin_level"="6"')) els = [
    {type:'relation',id:11,tags:{name:'Selçuk'}},{type:'relation',id:12,tags:{name:'Çeşme'}},{type:'relation',id:13,tags:{name:'Ödemiş'}},{type:'relation',id:14,tags:{name:'Bornova'}},
    {type:'relation',id:99,tags:{name:'Kuşadası'},center:{lat:37.8,lon:27.2}}];
  else els = [
    {type:'way',id:1,center:{lat:37.9393,lon:27.3412},tags:{historic:'archaeological_site',name:'Efes Antik Kenti',wikipedia:'tr:Efes'}},
    {type:'node',id:2,lat:37.9394,lon:27.3413,tags:{tourism:'attraction',name:'Efes Antik Kenti'}},
    {type:'node',id:3,lat:37.95,lon:27.36,tags:{tourism:'museum',name:'Efes Müzesi'}},
    {type:'node',id:4,lat:37.96,lon:27.37,tags:{historic:'memorial',name:'Küçük Anıt'}},
    {type:'node',id:5,lat:37.94,lon:27.30,tags:{amenity:'place_of_worship',religion:'muslim',historic:'yes',name:'İsa Bey Camii'}},
    {type:'node',id:6,lat:38.1,lon:27.5,tags:{natural:'waterfall',name:'Çağlayan Şelalesi'}},
    {type:'way',id:7,center:{lat:37.95,lon:27.33},tags:{historic:'castle',name:'Ayasuluk Kalesi'}},
    {type:'node',id:8,lat:38.2,lon:27.2,tags:{tourism:'viewpoint'}},
    {type:'node',id:9,lat:38.3,lon:26.3,tags:{historic:'caravanserai',name:'Çeşme Kervansarayı'}},
    {type:'node',id:10,lat:39.9,lon:32.8,tags:{tourism:'attraction',name:'Uzak Yer'}}];
  r.fulfill({status:200, contentType:'application/json', headers:{'Access-Control-Allow-Origin':'*'}, body: JSON.stringify({elements:els})});
};
await page.route('https://overpass.kumi.systems/**', kumi);
await page.goto('http://localhost:8765/turizm/');
const opts = await page.$$eval('#il option', o => o.map(x=>x.textContent));
ok(opts.length===82, '81 il + başlık: '+opts.length);
ok(opts[1]==='Adana' && opts.indexOf('Çanakkale')>opts.indexOf('Bursa') && opts.indexOf('Çanakkale')<opts.indexOf('Denizli') && opts.indexOf('Iğdır')<opts.indexOf('Isparta') && opts.indexOf('Isparta')<opts.indexOf('İstanbul'), 'Türkçe sıralama (Bursa<Çanakkale<Denizli, Iğdır<Isparta<İstanbul)');
await page.screenshot({path:'s0.png'});
await page.selectOption('#il', '35');
await page.waitForSelector('.kart');
const ilce = await page.$$eval('#ilce option', o => o.map(x=>x.textContent));
ok(JSON.stringify(ilce)===JSON.stringify(['Tüm il','Bornova','Çeşme','Ödemiş','Selçuk']), 'ilçeler sıralı, komşu (Kuşadası) elendi: '+ilce.join(','));
ok(calls[0]==='de' && calls.some(c=>c.includes('area(3600223167)')), 'yedek sunucu + alan kimliği 3600000000+id');
const kartlar = await page.$$eval('.kart .ad', o=>o.map(x=>x.textContent));
console.log('  kartlar:', kartlar.join(' | '));
ok(!kartlar.includes('Küçük Anıt'), 'memorial dışarıda');
ok(kartlar.filter(x=>x==='Efes Antik Kenti').length===1, '200 m tekilleştirme');
ok(JSON.stringify(kartlar)===JSON.stringify([...kartlar].sort((a,b)=>a.localeCompare(b,'tr'))), 'kartlar tr sıralı');
ok((await page.textContent('#ozet')).includes('7 yer'), 'sayı: '+await page.textContent('#ozet'));
const efes = page.locator('.kart', {hasText:'Efes Antik Kenti'});
ok((await efes.locator('.tur').textContent())==='Antik Kent', 'kategori Antik Kent');
await efes.locator('button.git').click(); await page.waitForSelector('#yolTarifi');
ok((await page.getAttribute('#yolTarifi','href'))==='https://www.google.com/maps/dir/?api=1&destination=37.9393,27.3412&travelmode=driving', 'detayda yol tarifi bağlantısı');
await page.goBack(); await page.waitForFunction(() => document.getElementById('detay').hidden);
ok((await efes.locator('a.wiki').getAttribute('href'))==='https://tr.wikipedia.org/wiki/Efes', 'vikipedi');
const cips = await page.$$eval('.cip', o=>o.map(x=>x.textContent.trim()));
console.log('  çipler:', cips.join(' | '));
await page.click('.cip[data-k="kale"]');
ok((await page.$$('.kart')).length===1, 'kale filtresi');
await page.click('.cip[data-k=""]');
await page.fill('#ara', 'cesme');
ok((await page.$$eval('.kart .ad', o=>o.map(x=>x.textContent))).join()==='Çeşme Kervansarayı', 'aksansız arama');
await page.fill('#ara', 'zzz');
ok((await page.textContent('#icerik')).includes('Eşleşen yer yok'), 'eşleşme yok durumu');
await page.fill('#ara', '');
await page.screenshot({path:'s1.png'});
await page.selectOption('#ilce', '12');
await page.waitForSelector('.kart');
await page.selectOption('#ilce', 'il:223167');
await page.waitForSelector('.kart');
ok(calls.filter(c=>c.includes('area(3600223167)') && c.includes('nwr[')).length===1, 'önbellek: tüm il ikinci kez istenmedi');
await page.click('#yakin');
await page.waitForSelector('.uzak');
const km = await page.$$eval('.kart', o=>o.map(x=>x.querySelector('.ad').textContent+' '+x.querySelector('.uzak').textContent));
console.log('  yakın:', km.join(' | '));
ok(!km.some(x=>x.startsWith('Uzak Yer')) && !km.some(x=>x.startsWith('Çeşme')), '30 km dışı elendi');
ok(km[0].startsWith('Efes Antik Kenti'), 'uzaklığa göre sıralı');
ok(calls.some(c=>c.includes('around:30000,37.94000,27.34000')), 'around sorgusu');
await page.screenshot({path:'s2.png'});
await page.click('#yakin');
await page.reload();
await page.waitForSelector('.kart');
ok(await page.inputValue('#il')==='35' && await page.inputValue('#ilce')==='il:223167', 'son seçim hatırlandı');
await page.unroute('https://overpass.kumi.systems/**');
await page.route('https://overpass.kumi.systems/**', r => r.abort());
await page.selectOption('#ilce', '13');
await page.waitForSelector('#tekrar');
ok((await page.textContent('#icerik')).includes('Bağlantı hatası'), 'bağlantı hatası');
await page.screenshot({path:'s3.png'});
await page.unroute('https://overpass.kumi.systems/**');
await page.route('https://overpass.kumi.systems/**', r => r.fulfill({status:200, contentType:'application/json', headers:{'Access-Control-Allow-Origin':'*'}, body:'{"elements":[]}'}));
await page.click('#tekrar');
await page.waitForFunction(() => document.body.textContent.includes('kayıt bulunamadı'));
ok(true, 'tekrar dene → boş bölge mesajı');
const sw = await page.evaluate(() => document.documentElement.scrollWidth);
ok(sw<=375, 'yatay taşma yok: '+sw);
ok(await page.$eval('link[rel=apple-touch-icon]', l=>l.getAttribute('href'))==='icons/icon-180.png', 'iPhone simgesi');
ok(await page.evaluate(() => document.fonts.check('800 16px Overpass')), 'yerel yazı tipi yüklendi');
const gercek = errs.filter(e=>!/fonts|ERR_FAILED|net::|504|status of/.test(e));
ok(gercek.length===0, 'konsol hatası yok: '+gercek.join(' / '));

// --- Faz 2: service worker ile internetsiz açılış
const ctx2 = await browser.newContext({ viewport:{width:375,height:780}, geolocation:{latitude:37.94,longitude:27.34}, permissions:['geolocation'] });
const p2 = await ctx2.newPage();
const errs2 = []; p2.on('pageerror', e => errs2.push(e.message));
await ctx2.route('https://overpass-api.de/**', r => r.abort());
await ctx2.route('https://maps.mail.ru/**', r => r.abort());
await ctx2.route('https://overpass.kumi.systems/**', kumi);
await p2.goto('http://localhost:8765/turizm/');
await p2.evaluate(() => navigator.serviceWorker.ready);
const man = await p2.evaluate(async () => { const r = await fetch(document.querySelector('link[rel=manifest]').href); return r.json(); });
ok(man.start_url === './' && man.icons.length === 3, 'manifest dosyası');
await p2.selectOption('#il', '35');
await p2.waitForSelector('.kart');
await ctx2.setOffline(true); await ctx2.unroute('https://overpass.kumi.systems/**'); await ctx2.route('https://overpass.kumi.systems/**', r => r.abort());
await p2.evaluate(() => { for (let i=0;i<localStorage.length;i++){ const k=localStorage.key(i); if(k.startsWith('kt1:')){ const o=JSON.parse(localStorage.getItem(k)); o.t -= 8*864e5; localStorage.setItem(k, JSON.stringify(o)); } } });
await p2.reload();
await p2.waitForSelector('.kart');
ok((await p2.$$('.kart')).length === 7, 'internetsiz açıldı, 7 yer cihazdan');
ok((await p2.textContent('#ozet')).includes('8 gün önce'), 'eski kayıt notu: ' + (await p2.textContent('#ozet')).trim());
ok(!(await p2.$eval('#cevrimdisi', e => e.hidden)), 'internet yok şeridi');
ok(await p2.evaluate(() => document.fonts.check('800 16px Overpass')), 'yazı tipi internetsiz de var');
await p2.screenshot({path:'s5.png'});
await p2.click('#yakin');
await p2.waitForSelector('.uzak');
ok((await p2.$$('.kart')).length === 5 && (await p2.textContent('#ozet')).includes('cihazda kayıtlı'), 'internetsiz yakınımdakiler: ' + (await p2.$$('.kart')).length);
await p2.click('#yakin');
await p2.selectOption('#il', '6');
await p2.waitForSelector('#tekrar');
ok((await p2.textContent('#icerik')).includes('daha önce açılmamış'), 'açılmamış il için açıklama');
ok(errs2.length === 0, 'faz 2 hata yok: ' + errs2.join(' / '));
await browser.close(); srv.close();
console.log(fails? fails+' HATA':'HEPSİ GEÇTİ');

# Kahverengi Tabela

Türkiye'deki kahverengi tabelalı turistik yerleri (antik kentler, kaleler, müzeler, mağaralar, şelaleler, kanyonlar, kaplıcalar, milli parklar, türbeler, hanlar, tarihi köprüler, camiler, kiliseler, seyir noktaları…) il ve ilçeye göre listeleyen, telefona kurulabilen ücretsiz web uygulaması.

Adres: https://yigitmutfakpanel-lgtm.github.io/tabela/

- Bir yere dokununca Google Haritalar bulunduğun yerden yol tarifiyle açılır.
- "Yakınımdakiler": 30 km çevredeki yerler, uzaklığa göre.
- Ana ekrana eklenir. İlk açılışta bütün Türkiye listesi (81 il) telefona iner; sonra il, ilçe, arama ve Yakınımdakiler internetsiz çalışır. Android'de "Başka harita" ile çevrimdışı harita uygulamalarına (Organic Maps, OsmAnd) yol tarifi açılır.
- Sunucu, hesap, anahtar, ücret yok.

## Nasıl çalışır
- `index.html`: uygulamanın tamamı (HTML + CSS + JS tek dosya). `sw.js` internetsiz açılış, `manifest.webmanifest` + `icons/` ana ekran, `fonts/` Overpass yazı tipi.
- `veri/`: 81 ilin ilçe ve yer listesi. `.github/workflows/yayin.yml` ayda bir OpenStreetMap'in hazır Türkiye dosyasını (Geofabrik) indirir, `arac/veri.sh` (osmium + `arac/veri.mjs`) ile yerleri ilçe sınırlarına dağıtır. Harita sunucusuna sorgu gitmez. Uygulama önce bu dosyaları okur; bulamazsa OpenStreetMap'e (Overpass) canlı sorar.
- Kategori ve sorgu kuralları tek yerde: `index.html` içindeki `<cekirdek>` bölümü. Veri üretici de aynı kodu kullanır.
- Elle veri yenileme: Actions → "Yayın ve aylık veri" → Run workflow.

## Rehber (detay ekranı, fotoğraf, sesli anlatım)
- Bir yere dokununca detay ekranı açılır: fotoğraf, il/ilçe/kategori, “Bir dakikada keşfet”, sesli rehber, “Hikâyesini keşfet”, “Biliyor muydunuz?”, kaynaklar, yol tarifi.
- Rehber metinleri `icerik/kaynak/<anahtar>.json` dosyalarındadır (editör yazar; aylık güncelleme bunlara dokunmaz). `arac/icerik.mjs` her dosyayı denetler (kaynak, erişim tarihi, doğrulama tarihi, efsane işareti) ve yere **yalnız kesin kimlikle** bağlar: Wikidata kimliği (`d`) ya da OSM nesne kimliği (`i`, ör. `r123`). İsimle eşleştirme yoktur; eşleşme yoksa metin yayınlanmaz. Sonuç: `icerik/dizin.json`, `icerik/il/NN.json`, `icerik/rapor.txt`.
- Fotoğraflar: `arac/gorsel.mjs`, yerin OSM `wikidata` etiketindeki Wikidata P18 görselini (rehberi olan yerlerde ayrıca Commons kategorisini) alır; yazar ve lisansı Commons'tan çeker, özgür olmayan lisansları eler. Sonuç `veri/gorsel/NN.json`.
- Sesli rehber: hazır kayıt varsa (`icerik/ses/<anahtar>.m4a`, `arac/ses.mjs` ile Piper TTS'te üretilir) o çalar; yoksa cihazın Türkçe sesi (`speechSynthesis`) kullanılır; o da yoksa yazılı rehber gösterilir.
- İnternetsiz: açılan rehber metni kendiliğinden saklanır; fotoğraf ve ses yalnız kullanıcı isterse iner (detaydaki “indir” ya da “İndirilenler ve depolama”).

## Testler
`node test/rehber.test.mjs`, `node test/internetsiz.test.mjs`, `node test/hazir-veri.test.mjs`, `node test/canli-sorgu.test.mjs` (Playwright gerekir; sahte veriyle çalışır).

## Lisanslar
- Harita verisi © OpenStreetMap katkıcıları, ODbL.
- Overpass yazı tipi: SIL Open Font License.
- Fotoğraflar: Wikimedia Commons, her fotoğrafın kendi lisansı uygulamada gösterilir.
- Hazır sesler: Piper TTS, `tr_TR-dfki-medium` sesi; veri seti lisansı CC BY-NC-SA 4.0 (ticari olmayan kullanım).

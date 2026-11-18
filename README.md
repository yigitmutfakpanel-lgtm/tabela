# Kahverengi Tabela

Türkiye'deki kahverengi tabelalı turistik yerleri (antik kentler, kaleler, müzeler, mağaralar, şelaleler, kanyonlar, kaplıcalar, milli parklar, türbeler, hanlar, tarihi köprüler, camiler, kiliseler, seyir noktaları…) il ve ilçeye göre listeleyen, telefona kurulabilen ücretsiz web uygulaması.

Adres: https://yigitmutfakpanel-lgtm.github.io/tabela/

- Bir yere dokununca Google Haritalar bulunduğun yerden yol tarifiyle açılır.
- "Yakınımdakiler": 30 km çevredeki yerler, uzaklığa göre.
- Ana ekrana eklenir. İlk açılışta bütün Türkiye listesi (81 il) telefona iner; sonra il, ilçe, arama ve Yakınımdakiler internetsiz çalışır. Android'de "Başka harita" ile çevrimdışı harita uygulamalarına (Organic Maps, OsmAnd) yol tarifi açılır.
- Sunucu, hesap, anahtar, ücret yok.

## Nasıl çalışır
- `index.html`: uygulamanın tamamı (HTML + CSS + JS tek dosya). `sw.js` internetsiz açılış, `manifest.webmanifest` + `icons/` ana ekran, `fonts/` Overpass yazı tipi.
- `veri/`: 81 ilin ilçe ve yer listesi. `.github/workflows/yayin.yml` ayda bir `arac/veri.mjs`'i çalıştırıp OpenStreetMap'ten yeniler. Uygulama önce bu dosyaları okur; bulamazsa OpenStreetMap'e (Overpass) canlı sorar.
- Kategori ve sorgu kuralları tek yerde: `index.html` içindeki `<cekirdek>` bölümü. Veri üretici de aynı kodu kullanır.
- İlk liste: 18.11.2026 (11 il; kalan iller için uygulama canlı sorgular).
- Elle veri yenileme: Actions → "Yayın ve aylık veri" → Run workflow.

## Lisanslar
- Harita verisi © OpenStreetMap katkıcıları, ODbL.
- Overpass yazı tipi: SIL Open Font License.

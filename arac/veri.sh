#!/usr/bin/env bash
# Türkiye OSM dosyasından (Geofabrik) il/ilçe sınırlarını ve kahverengi tabela yerlerini süzüp veri/ klasörünü üretir.
# Gerekenler: osmium-tool, node. Kullanım: bash arac/veri.sh turkiye.osm.pbf
set -euo pipefail
PBF="${1:?Kullanım: bash arac/veri.sh turkiye.osm.pbf}"
T="$(mktemp -d)"
trap 'rm -rf "$T"' EXIT

echo "Sınırlar süzülüyor…"
osmium tags-filter "$PBF" r/admin_level=4,6 -o "$T/sinir.pbf" --overwrite
osmium export "$T/sinir.pbf" -o "$T/sinir.geojsonseq" -f geojsonseq --geometry-types=polygon --add-unique-id=type_id --overwrite

echo "Yerler süzülüyor…"
osmium tags-filter "$PBF" \
  nwr/tourism=attraction,museum,viewpoint \
  nwr/historic=archaeological_site,castle,fort,ruins,monument,tomb,caravanserai,aqueduct,city_gate,bridge \
  nwr/natural=cave_entrance,waterfall,gorge,hot_spring \
  nwr/boundary=national_park,protected_area \
  nwr/leisure=nature_reserve \
  nwr/amenity=place_of_worship \
  -o "$T/yer.pbf" --overwrite
osmium export "$T/yer.pbf" -o "$T/yer.geojsonseq" -f geojsonseq --add-unique-id=type_id --overwrite

node "$(dirname "$0")/veri.mjs" "$T/sinir.geojsonseq" "$T/yer.geojsonseq"

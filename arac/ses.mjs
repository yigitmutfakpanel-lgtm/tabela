// Hazır Türkçe sesli anlatım üretir (Piper TTS, yerel ve ücretsiz).
//   node arac/ses.mjs <piper komutu> <ses modeli .onnx> [anahtar ...]
// Her rehber için icerik/ses/<anahtar>.m4a üretir (AAC, 48 kbit/sn, mono) ve süresini icerik/kaynak/<anahtar>.json'a yazar.
// Okunan metin, uygulamanın cihaz sesine okuttuğu metinle aynıdır (anlatimMetni + okunabilirMetin, index.html ile eş).
// Ses modeli: rhasspy/piper-voices "tr_TR-dfki-medium" — veri seti lisansı CC BY-NC-SA 4.0 (ticari olmayan kullanım,
// kaynak gösterme, aynı lisansla paylaşma). Uygulama ücretsiz ve ticari olmadığı için uygundur; künye her seste gösterilir.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const KAYNAK = path.join(KOK, "icerik", "kaynak");
const SES = path.join(KOK, "icerik", "ses");
const LISANS = "Ses: Piper TTS, dfki Türkçe sesi (CC BY-NC-SA 4.0)";

const SIRA = { I: "Birinci", II: "İkinci", III: "Üçüncü", IV: "Dördüncü", V: "Beşinci", VI: "Altıncı", VII: "Yedinci", VIII: "Sekizinci", IX: "Dokuzuncu", X: "Onuncu" };
// index.html'deki okunabilirMetin ile aynı kurallar
export function okunabilirMetin(s) {
  return s
    .replace(/(?<!\p{L})MÖ(?!\p{L})/gu, "milattan önce").replace(/(?<!\p{L})MS(?!\p{L})/gu, "milattan sonra")
    .replace(/\bHz\.\s/g, "Hazreti ")
    .replace(/\b(I|II|III|IV|V|VI|VII|VIII|IX|X)\.\s(?=\p{Lu})/gu, (m, r) => SIRA[r] + " ")
    .replace(/(\d)\s?°C/g, "$1 derece").replace(/(\d)\s?km\b/g, "$1 kilometre").replace(/(\d)\s?m\b/g, "$1 metre")
    .replace(/(\d)\s?-\s?(\d)/g, "$1 ile $2")
    .replace(/[“”"]/g, "").replace(/\s+/g, " ").trim();
}
export function anlatimMetni(ic) {
  const parcalar = [ic.ad + ".", ic.kisa];
  for (const b of ic.bolumler || []) parcalar.push(b.baslik + (/[.?!]$/.test(b.baslik) ? " " : ". ") + b.metin);
  if (ic.ilginc && ic.ilginc.length) { parcalar.push("Biliyor muydunuz?"); for (const i of ic.ilginc) parcalar.push(i.metin); }
  return okunabilirMetin(parcalar.join(" "));
}

function ana() {
  const [piper, model, ...secilen] = process.argv.slice(2);
  if (!piper || !model) { console.error("Kullanım: node arac/ses.mjs <piper> <model.onnx> [anahtar ...]"); process.exit(2); }
  fs.mkdirSync(SES, { recursive: true });
  for (const f of fs.readdirSync(KAYNAK).filter((x) => x.endsWith(".json"))) {
    const dosya = path.join(KAYNAK, f);
    const y = JSON.parse(fs.readFileSync(dosya, "utf8"));
    if (secilen.length && !secilen.includes(y.anahtar)) continue;
    const wav = path.join(SES, y.anahtar + ".wav"), m4a = path.join(SES, y.anahtar + ".m4a");
    execFileSync(piper, ["-m", model, "-f", wav, "--sentence-silence", "0.35"], { input: anlatimMetni(y) });
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", wav, "-ac", "1", "-c:a", "aac", "-b:a", "48k", "-movflags", "+faststart", m4a]);
    fs.unlinkSync(wav);
    const sure = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", m4a]).toString().trim());
    y.sesSure = Math.round(sure);
    y.sesLisans = LISANS;
    fs.writeFileSync(dosya, JSON.stringify(y, null, 1));
    console.log(`${y.anahtar}: ${Math.round(sure)} sn, ${(fs.statSync(m4a).size / 1024).toFixed(0)} KB`);
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) ana();

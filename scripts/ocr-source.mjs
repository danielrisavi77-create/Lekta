/**
 * OCR pomocnik za skenirane izvore (backlog iz port sesije). Skenirani sluzbeni PDF-ovi
 * (bez tekstualnog sloja) ne mogu proci adversarijalnu grep-provjeru citata, pa se preskacu.
 * Ova skripta doda tekstualni sloj (OCR hrv+eng) da se izvor moze normalno portati.
 *
 * NE instalira alate (treba admin). Ako alati nisu prisutni, ispisuje upute za instalaciju.
 * Preferira ocrmypdf (najbolji rezultat); fallback tesseract po stranici nije implementiran.
 *
 * Uporaba:
 *   node scripts/ocr-source.mjs data/sources/fsb/fsb-pravilnik-radovi-2018.pdf [...]
 * Izlaz po datoteci: <ime>-ocr.pdf (s tekstualnim slojem) + <ime>-ocr.txt (pdftotext).
 * Nakon OCR-a: provjeri .txt, pa portaj izvor kroz port-faculty spec kao i ostale.
 */
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';

function has(cmd) {
  try { execSync(process.platform === 'win32' ? `where ${cmd}` : `command -v ${cmd}`, { stdio: 'ignore' }); return true; }
  catch { return false; }
}

const files = process.argv.slice(2);
if (!files.length) {
  console.error('Uporaba: node scripts/ocr-source.mjs <pdf> [<pdf>...]');
  process.exit(1);
}

const hasOcrmypdf = has('ocrmypdf');
const hasTesseract = has('tesseract');
if (!hasOcrmypdf) {
  console.error('\nocrmypdf NIJE dostupan. Instalacija (Windows):');
  console.error('  1) Tesseract engine: https://github.com/UB-Mannheim/tesseract/wiki  (ili: scoop install tesseract)');
  console.error('     + hrvatski jezicni podaci hrv.traineddata u tessdata/ (scoop: dohvaca se automatski, inace rucno)');
  console.error('  2) ocrmypdf: pip install ocrmypdf   (treba i Ghostscript: choco install ghostscript)');
  console.error('  Provjera: ocrmypdf --version ; tesseract --list-langs (mora sadrzavati hrv)');
  console.error(hasTesseract ? '\n(tesseract JE prisutan; nedostaje samo ocrmypdf + Ghostscript)' : '');
  process.exit(2);
}

let langs = 'hrv+eng';
try { const l = execSync('tesseract --list-langs', { encoding: 'utf8' }); if (!/\bhrv\b/.test(l)) { console.error('UPOZORENJE: tesseract nema hrv jezik; koristim eng (dijakritika ce biti losija).'); langs = 'eng'; } } catch {}

for (const f of files) {
  if (!existsSync(f)) { console.error('preskacem (ne postoji):', f); continue; }
  const out = f.replace(/\.pdf$/i, '-ocr.pdf');
  const txt = f.replace(/\.pdf$/i, '-ocr.txt');
  console.log(`OCR ${f} -> ${out} (${langs})`);
  try {
    execSync(`ocrmypdf -l ${langs} --force-ocr --optimize 1 "${f}" "${out}"`, { stdio: 'inherit' });
    try { execSync(`pdftotext -layout "${out}" "${txt}"`, { stdio: 'inherit' }); } catch { console.error('  (pdftotext nije uspio; pokreni rucno na ' + out + ')'); }
    console.log('  gotovo. Provjeri', txt, 'pa portaj izvor kroz spec (isti tijek kao ostali).');
  } catch (e) {
    console.error('  OCR pao za', f, '-', e.message);
  }
}

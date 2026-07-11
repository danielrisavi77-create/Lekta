/**
 * Osvjezi konvenciju BOLDIRANJA u DERIVED predlozima naslovnice, in-place.
 *
 * UNIJA-DODAJ: bold se DODAJE ulozi koju konvencija cijelog fakulteta (roleConventions
 * nad svim ne-OCR uzorcima) dosljedno boldira, a koju je tanak podskup po razini ili
 * nedetektiran font propustio. Postojeci (ljudski verificiran) bold se NIKAD ne uklanja:
 * bold zna biti stvar razine (npr. doktorski boldira naslov, diplomski ne), pa ga
 * faculty-wide glas ne smije srusiti. Mijenja se ISKLJUCIVO polje bold; raspored, font,
 * velicina, verzal, poravnanje, required i status ostaju netaknuti. Official se NE dira.
 *
 * Dry-run po defaultu (samo izvjestaj). Zapis tek uz --apply. Promijenjenima se osvjezi
 * verifiedAt (ponovna verifikacija boldova); ostali ostaju netaknuti.
 *
 * Pokretanje:
 *   node scripts/title-pages/retypo-derived.mjs                 # dry-run
 *   node scripts/title-pages/retypo-derived.mjs --apply --date 2026-07-11
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { roleConventions } from './consensus-lib.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const EVIDENCE_DIR = join(ROOT, 'data', 'title-pages', 'evidence');
const TEMPLATES_PATH = join(ROOT, 'data', 'title-pages', 'templates.json');

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : fallback;
}
const apply = process.argv.includes('--apply');
const date = arg('--date', '2026-07-11');
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
  console.error(`Nevaljan --date "${date}" (ocekivano YYYY-MM-DD)`);
  process.exit(1);
}

// Kanonski redoslijed kljuceva elementa (nepoznati kljucevi idu na kraj).
const ELEMENT_KEY_ORDER = [
  'role', 'required', 'elementProvenance', 'group', 'label', 'fixedText',
  'confidence', 'font', 'sizePt', 'bold', 'italic', 'uppercase', 'align',
];
function reorderElement(el) {
  const out = {};
  for (const k of ELEMENT_KEY_ORDER) if (el[k] !== undefined) out[k] = el[k];
  for (const k of Object.keys(el)) if (!(k in out)) out[k] = el[k];
  return out;
}

const templates = JSON.parse(readFileSync(TEMPLATES_PATH, 'utf8'));
const evCache = new Map();
function conventionsForUnit(unitId) {
  if (!evCache.has(unitId)) {
    const f = join(EVIDENCE_DIR, `${unitId}.json`);
    if (!existsSync(f)) { evCache.set(unitId, null); return null; }
    const ev = JSON.parse(readFileSync(f, 'utf8'));
    evCache.set(unitId, roleConventions(ev.samples.filter((s) => !s.ocrFallback)));
  }
  return evCache.get(unitId);
}

const added = []; // { id, role }
let changedTemplates = 0;
let noEvidence = [];

for (const t of templates) {
  if (t.provenance?.status !== 'derived') continue;
  const conv = conventionsForUnit(t.unitId);
  if (conv === null) { noEvidence.push(t.id); continue; }
  let touched = false;
  t.elements = t.elements.map((el) => {
    // Dodaj bold samo ako ga faculty-wide konvencija ima, a element ga jos nema.
    if (conv.get(el.role)?.bold !== true || el.bold === true) return el;
    added.push({ id: t.id, role: el.role });
    touched = true;
    return reorderElement({ ...el, bold: true });
  });
  if (touched) { t.provenance.verifiedAt = date; changedTemplates++; }
}

// Izvjestaj
console.log(`DERIVED predlozaka: ${templates.filter((t) => t.provenance?.status === 'derived').length}`);
console.log(`DODAN bold: ${added.length} uloga u ${changedTemplates} predlozaka (postojeci bold se ne dira)\n`);
for (const c of added) console.log(`    + ${c.id}  ${c.role}`);
if (noEvidence.length) console.log(`\n(bez evidence datoteke, preskoceno: ${noEvidence.join(', ')})`);

if (apply) {
  writeFileSync(TEMPLATES_PATH, JSON.stringify(templates, null, 2) + '\n');
  console.log(`\nZAPISANO u ${TEMPLATES_PATH} (verifiedAt=${date} za promijenjene).`);
} else {
  console.log('\n(dry-run; pokreni s --apply za zapis)');
}

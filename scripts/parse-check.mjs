#!/usr/bin/env node
/**
 * PARSE-CHECK (read-only): propusti rucno sastavljene reference kroz bulk parser i usporedi
 * izvucena polja s ocekivanjem. Za ADVERSARIJALNO trazenje rupa koje cross-style konsenzus i
 * round-trip ne hvataju (dijeljeni bugovi, oblici koje nas renderer ne emitira). NE mijenja repo.
 *
 * Ulaz JSON:  { "cases": [ { "style": "apa|ieee|vancouver|chicago|auto", "raw": "...",
 *                            "expect": { "aut":"prezime", "god":"2020", "cas":"...", "vol":"..",
 *                                        "broj":"..", "str":"1-10", "nas":"...", "mj":"..",
 *                                        "izd":"..", "inst":"..", "ured":"..", "typ":"knjiga" } } ] }
 * Provjeravaju se SAMO navedena polja. Tekstualna polja se normaliziraju (mala slova, bez
 * dijakritike/interpunkcije); str se prosiruje iz kracene forme ("84-9" -> "84-89").
 *
 * Pokreni:  node scripts/parse-check.mjs <cases.json>
 * Izlaz: po slucaju PASS/FAIL (s actual vs expected po polju) + sazetak. Exit 1 ako ima FAIL.
 */
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const casesPath = resolve(process.argv[2] || join(root, 'parse-check-cases.json'));

const bundle = async (entry) => {
  const out = await build({ entryPoints: [join(root, entry)], bundle: true, format: 'esm', write: false, logLevel: 'silent' });
  return import('data:text/javascript,' + encodeURIComponent(out.outputFiles[0].text));
};
const { parseReference } = await bundle('src/citations/parse-reference.ts');
const { parseAuthors } = await bundle('src/tools/citation.ts');

const norm = (s) => (s || '').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9]/g, '');
const firstSurname = (a) => { const p = parseAuthors(a || ''); return p.length ? norm(p[0].last) : ''; };
function normPages(p) {
  const m = (p || '').replace(/\s/g, '').match(/^(\d+)[-–](\d+)$/);
  if (!m) return (p || '').replace(/\s/g, '');
  let [, a, b] = m;
  if (b.length < a.length) b = a.slice(0, a.length - b.length) + b;
  return a === b ? a : `${a}-${b}`;
}
function projField(fld, f) {
  switch (fld) {
    case 'aut': return firstSurname(f.authors);
    case 'god': return (f.year || '').toString();
    case 'vol': return (f.volume || '').toString();
    case 'broj': return (f.issue || '').toString();
    case 'str': return normPages(f.pages);
    case 'cas': return norm(f.container);
    case 'nas': return norm(f.title);
    case 'mj': return norm(f.place);
    case 'izd': return norm(f.publisher);
    case 'inst': return norm(f.institution);
    case 'ured': return norm(f.editor);
    case 'typ': return (f.type || '').toString();
    default: return '';
  }
}
// za expect: aut/cas/nas/mj/izd/inst/ured se normaliziraju isto; str prosiruje; ostalo doslovno
function projExpect(fld, v) {
  if (['aut', 'cas', 'nas', 'mj', 'izd', 'inst', 'ured'].includes(fld)) return norm(v);
  if (fld === 'str') return normPages(v);
  return (v ?? '').toString();
}

const data = JSON.parse(readFileSync(casesPath, 'utf8'));
let fails = 0;
for (const [i, c] of (data.cases || []).entries()) {
  const r = parseReference(c.raw, c.style || 'auto');
  const f = { ...r.fields, type: r.type };
  const bad = [];
  for (const [fld, want] of Object.entries(c.expect || {})) {
    const got = projField(fld, f);
    if (got !== projExpect(fld, want)) bad.push(`${fld}: got "${got}" != want "${projExpect(fld, want)}"`);
  }
  if (bad.length) {
    fails++;
    console.log(`FAIL #${i} [${c.style || 'auto'}] ${c.raw}`);
    bad.forEach((b) => console.log(`   ${b}`));
    console.log(`   (parsed: ${JSON.stringify(f)})`);
  } else {
    console.log(`PASS #${i} [${c.style || 'auto'}]`);
  }
}
console.log(`\n${(data.cases || []).length - fails}/${(data.cases || []).length} PASS`);
process.exit(fails ? 1 : 0);

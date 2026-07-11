#!/usr/bin/env node
/**
 * CITATION PARSER AUDIT (pipeline za nalazenje rupa u bulk parseru na STVARNIM podacima).
 *
 * Ideja: harvestiraj stilom-oznacene citate (npr. Hrcak daje isti clanak u IEEE/Chicago/APA/
 * Vancouver) -> isti clanak MORA dati ista polja (godina/vol/broj/str/naslov/prezimena) u svim
 * stilovima. Ako jedan stil odstupa od konsenzusa ostalih, taj parser ima rupu. Ground truth
 * BEZ ljudskih oznaka (koristi redundanciju vise stilova).
 *
 * GRANICA (posteno): "verify PRAVILA" (koji fakultet propisuje stil) ostaje ljudsko (pravilo
 * projekta). Ovo je iskljucivo QA PARSERA (softverska ispravnost), ne proglasavanje pravila.
 * Konsenzus je proxy: hvata strukturne lomove; ne dokazuje svaku semanticku zamjenu.
 *
 * Pokreni: node scripts/citation-parser-audit.mjs [putanja-do-korpusa.json]
 * Zadano: tests/fixtures/citation-samples.json. Exit 1 ako ima odstupanja (moze u gate).
 */
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const corpusPath = process.argv[2] ? resolve(process.argv[2]) : join(root, 'tests/fixtures/citation-samples.json');

const out = await build({ entryPoints: [join(root, 'src/citations/parse-reference.ts')], bundle: true, format: 'esm', write: false, logLevel: 'silent' });
const { parseReference } = await import('data:text/javascript,' + encodeURIComponent(out.outputFiles[0].text));
const parseAuthorsBundle = await build({ entryPoints: [join(root, 'src/tools/citation.ts')], bundle: true, format: 'esm', write: false, logLevel: 'silent' });
const { parseAuthors } = await import('data:text/javascript,' + encodeURIComponent(parseAuthorsBundle.outputFiles[0].text));

const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9]/g, '');
// PRVI autor (svi stilovi ga navode); cijeli skup NE - stilovi legitimno skracuju (et al./i sur./...).
const firstSurname = (a) => { const p = parseAuthors(a || ''); return p.length ? norm(p[0].last) : ''; };
// Raspon stranica: elsevier krati zavrsnu ("84-9" = 84-89); prosiri prije usporedbe (nije bug parsera, nego stil).
function normPages(p) {
  const m = (p || '').replace(/\s/g, '').match(/^(\d+)[-–](\d+)$/);
  if (!m) return (p || '').replace(/\s/g, '');
  let [, a, b] = m;
  if (b.length < a.length) b = a.slice(0, a.length - b.length) + b;
  return a === b ? a : `${a}-${b}`; // "11-11" -> "11"
}

const FIELDS = ['aut', 'god', 'cas', 'vol', 'broj', 'str', 'nas'];
function proj(f) {
  return {
    aut: firstSurname(f.authors), god: f.year || '', cas: norm(f.container),
    vol: f.volume || '', broj: f.issue || '', str: normPages(f.pages), nas: norm(f.title),
  };
}
function mode(vals) {
  const c = {};
  for (const v of vals) if (v) c[v] = (c[v] || 0) + 1;
  let best = '', n = 0;
  for (const [v, k] of Object.entries(c)) if (k > n) { best = v; n = k; }
  return best;
}

const corpus = JSON.parse(readFileSync(corpusPath, 'utf8'));
const deviByStyle = {};
let totalDevi = 0, totalChecks = 0;

for (const art of corpus.articles) {
  const parsed = {};
  for (const [style, ref] of Object.entries(art.styles)) parsed[style] = proj(parseReference(ref, style).fields);
  // konsenzus po polju (mod preko stilova)
  const consensus = {};
  for (const fld of FIELDS) consensus[fld] = mode(Object.values(parsed).map((p) => p[fld]));

  const artDevi = [];
  for (const [style, p] of Object.entries(parsed)) {
    for (const fld of FIELDS) {
      if (!consensus[fld]) continue;
      totalChecks++;
      if (p[fld] && p[fld] !== consensus[fld]) {
        totalDevi++; deviByStyle[style] = (deviByStyle[style] || 0) + 1;
        artDevi.push(`  ✗ [${style}] ${fld}: "${p[fld]}" != konsenzus "${consensus[fld]}"`);
      } else if (!p[fld]) {
        totalDevi++; deviByStyle[style] = (deviByStyle[style] || 0) + 1;
        artDevi.push(`  ✗ [${style}] ${fld}: PRAZNO (konsenzus "${consensus[fld]}")`);
      }
    }
  }
  if (artDevi.length) {
    console.log(`\n● ${art.id}  (konsenzus: god=${consensus.god} vol=${consensus.vol} broj=${consensus.broj} str=${consensus.str})`);
    artDevi.forEach((d) => console.log(d));
  }
}

console.log(`\n=== ${totalChecks - totalDevi}/${totalChecks} polja se slaze s cross-style konsenzusom ===`);
if (totalDevi) {
  console.log('Odstupanja po stilu:', Object.entries(deviByStyle).map(([s, n]) => `${s}:${n}`).join('  '));
  process.exit(1);
}
console.log('Svi stilovi se slazu. Nema rupa na ovom korpusu.');

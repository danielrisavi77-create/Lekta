#!/usr/bin/env node
/**
 * RENDER FIDELITY AUDIT: nas izlazni renderer (apa/harvard/chicago-author-date) vs doi.org/CSL
 * autoritativni izlaz istog stila, na strukturiranim Crossref poljima. Divergencija = fidelity bug.
 *
 * Normalizacija (jer neke stvari NE reproduciramo niti trebamo): case (CSL chicago title-case; mi
 * recenicno), en/em-crtica -> hyphen (CLAUDE.md zabranjuje en-crtice), kurzivni navodnici -> ravni,
 * DOI url oblik, zavrsna tocka, visestruki razmaci. Sve OSTALO (redoslijed, veznici, godina-wrap,
 * navodnici oko naslova, pp./,/: za stranice, mjesto) mora se poklopiti.
 *
 * Pokreni: node scripts/render-fidelity-audit.mjs [fixture.json] [--style apa|harvard|chicago-author-date]
 * Exit 1 ako ima odstupanja.
 */
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const fixPath = resolve(process.argv.find((a, i) => i >= 2 && !a.startsWith('--')) || join(root, 'tests/fixtures/citation-render-fidelity.json'));
const onlyStyle = (process.argv.find((a) => a.startsWith('--style=')) || '').replace('--style=', '');

const out = await build({ entryPoints: [join(root, 'src/tools/citation.ts')], bundle: true, format: 'esm', write: false, logLevel: 'silent' });
const { formatCitation } = await import('data:text/javascript,' + encodeURIComponent(out.outputFiles[0].text));

const STYLES = ['apa', 'harvard', 'chicago-author-date'];

const MONTHS = 'january|february|march|april|may|june|july|august|september|october|november|december|spring|summer|fall|autumn|winter';
function norm(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[–—]/g, '-')
    .replace(/[“”„]/g, '"').replace(/[‘’]/g, "'")
    .replace(/\bportico\.?\s*/g, '')                                    // CSL arhivska biljeska (Portico preservation) nije citatni element
    .replace(/https?:\/\/(?:dx\.)?doi\.org\/\S+/g, 'doiref')            // cijeli DOI token -> marker (da elizija ne dira znamenke DOI-ja)
    .replace(new RegExp(`\\s\\((?:${MONTHS})(?:\\s+\\d+)?\\)`, 'g'), '') // chicago mjesec/sezona kad nema broja: "88 (april):" -> "88:"
    .replace(/(\d+)-(\d+)/g, (m, a, b) => (b.length < a.length ? `${a}-${a.slice(0, a.length - b.length) + b}` : m)) // prosiri elidirani raspon "163-86"->"163-186"
    .replace(/\s+/g, ' ')
    .replace(/\s*([.,:;])/g, '$1')
    .replace(/[.\s]+$/, '')
    .trim();
}

// prvi znak razlike (za dijagnozu)
function firstDiff(a, b) {
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && a[i] === b[i]) i++;
  return `...${a.slice(Math.max(0, i - 20), i)}[${a.slice(i, i + 25)}] != [${b.slice(i, i + 25)}]`;
}

const corpus = JSON.parse(readFileSync(fixPath, 'utf8'));
const byStyle = {};
let total = 0, fails = 0;
for (const item of corpus.items || []) {
  for (const style of STYLES) {
    if (onlyStyle && style !== onlyStyle) continue;
    if (!item.styles[style]) continue;
    total++;
    byStyle[style] = byStyle[style] || { ok: 0, fail: 0 };
    const mine = formatCitation(item.fields, style).citation;
    const theirs = item.styles[style];
    if (norm(mine) === norm(theirs)) { byStyle[style].ok++; }
    else {
      byStyle[style].fail++; fails++;
      console.log(`\n● [${style}] ${item.doi} (${item.type})`);
      console.log(`   MOJ: ${mine}`);
      console.log(`   CSL: ${theirs}`);
      console.log(`   DIFF ${firstDiff(norm(mine), norm(theirs))}`);
    }
  }
}
console.log(`\n=== ${total - fails}/${total} se poklapa s CSL ===`);
console.log('Po stilu:', Object.entries(byStyle).map(([s, v]) => `${s}:${v.ok}/${v.ok + v.fail}`).join('  '));
process.exit(fails ? 1 : 0);

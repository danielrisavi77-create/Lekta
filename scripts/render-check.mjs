#!/usr/bin/env node
/**
 * RENDER-CHECK (read-only): renderiraj strukturirana polja nasim motorom po stilu i usporedi s
 * OCEKIVANIM (prirucnik-tocnim) izlazom. Za ADVERSARIJALNO trazenje divergencija vjernih autor-datum
 * renderera (apa/harvard/chicago-author-date) na teskim ulazima koje CSL-korpus ne pokriva. NE mijenja repo.
 *
 * Ulaz JSON: { "cases": [ { "style": "apa|harvard|chicago-author-date", "fields": {CitationInput},
 *                          "expect": "<cijeli ocekivani citatni redak>" } ] }
 * Usporedba je normalizirana (case, en-crtica->hyphen, kurzivni navodnici, visestruki razmaci,
 * zavrsna tocka) da rubna tipografija ne daje lazne razlike; struktura/redoslijed/veznici/interpunkcija se traze.
 *
 * Pokreni: node scripts/render-check.mjs <cases.json>. Izlaz PASS/FAIL po slucaju. Exit 1 ako FAIL.
 */
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const casesPath = resolve(process.argv[2] || join(root, 'render-check-cases.json'));

const out = await build({ entryPoints: [join(root, 'src/tools/citation.ts')], bundle: true, format: 'esm', write: false, logLevel: 'silent' });
const { formatCitation } = await import('data:text/javascript,' + encodeURIComponent(out.outputFiles[0].text));

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[–—]/g, '-')
    .replace(/[“”„]/g, '"').replace(/[‘’]/g, "'")
    .replace(/https?:\/\/(?:dx\.)?doi\.org\/\S+/g, 'doiref')
    .replace(/\s+/g, ' ')
    .replace(/\s*([.,:;])/g, '$1')
    .replace(/[.\s]+$/, '')
    .trim();
}

const data = JSON.parse(readFileSync(casesPath, 'utf8'));
let fails = 0;
for (const [i, c] of (data.cases || []).entries()) {
  const mine = formatCitation(c.fields || {}, c.style || 'apa').citation;
  if (norm(mine) === norm(c.expect)) {
    console.log(`PASS #${i} [${c.style}]`);
  } else {
    fails++;
    console.log(`FAIL #${i} [${c.style}]`);
    console.log(`   MOJ:    ${mine}`);
    console.log(`   EXPECT: ${c.expect}`);
  }
}
console.log(`\n${(data.cases || []).length - fails}/${(data.cases || []).length} PASS`);
process.exit(fails ? 1 : 0);

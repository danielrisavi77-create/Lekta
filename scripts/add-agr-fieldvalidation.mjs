/**
 * Dodaje fieldValidation.sample (syntheticDocxAudits) na 3 AGR profila, potkrijepljeno
 * sintetickim golden testom (tests/agr-synthetic.test.ts). Podize komponentu "Validacija"
 * u profileReadiness s 25 (bez uzorka) na 50 (sinteticki razred). POSTENO: sinteticki,
 * ne pravi radovi. Idempotentno. Pokretanje: node scripts/add-agr-fieldvalidation.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';

const f = new URL('../data/profiles/verified-profiles.json', import.meta.url);
let s = readFileSync(f, 'utf8');
if (s.includes('synthetic-golden-validated')) {
  console.log('vec postoji, preskacem.');
  process.exit(0);
}

const fv = (scope) => ({
  status: 'synthetic-golden-validated',
  validatedAt: '2026-07-02',
  scope,
  sample: { syntheticDocxAudits: 1, docxAudits: 0, publicPdfAudits: 0, metadataSpotChecks: 0, years: [2026] },
  confirmed: [
    'Font, velicina, prored, A4, Sadrzaj i (doktorski) margine ispravno okidaju na uskladjenom sintetickom radu (tests/agr-synthetic.test.ts).',
  ],
  observedDeviations: [],
  productDecision:
    'Sinteticki uzorci sluze samo regresijskoj provjeri parsera i audita; ne dokazuju sluzbeno pravilo ni ispravnost stvarnog rada.',
});

function ins(docDate, scope) {
  const anchor = `"documentDate": "${docDate}",`;
  const n = s.split(anchor).length - 1;
  if (n !== 1) throw new Error(`anchor n=${n} (treba 1): ${docDate}`);
  const block = JSON.stringify(fv(scope), null, 2)
    .split('\n')
    .map((l, i) => (i === 0 ? l : '    ' + l))
    .join('\n');
  s = s.replace(anchor, `${anchor}\n    "fieldValidation": ${block},`);
}

ins('2019-04-10', 'Sinteticki golden .docx (diplomski, prored 1,15); nije pravi rad.');
ins('2017-06-12', 'Sinteticki golden .docx (zavrsni, prored 1,15, Justify); nije pravi rad.');
ins('2026-05-12', 'Sinteticki golden .docx (doktorski, prored 1,5, margine 2,5); nije pravi rad.');

writeFileSync(f, s);
console.log('fieldValidation dodan na 3 AGR profila (syntheticDocxAudits:1 -> validacija 50).');

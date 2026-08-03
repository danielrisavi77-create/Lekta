/**
 * Generator javnog benchmark .docx-a za landing_benchmark.html (P2a).
 *
 * Za razliku od tests/fixtures/docx (regresijski net parsera) i scripts/gen-golden-fixtures.ts
 * (isto), ovaj fixture je JAVNI, preuzimljiv marketinski artefakt s objavljenom metodologijom:
 * jedan koherentan, namjerno pogresno oblikovan rad (student koristio Word default umjesto
 * pravila fakulteta) protiv `fpzg-politologija-diplomski` profila. Svaka namjerno ubacena
 * greska je POKRIVENA stvarnim, izvorenim ruleEntryjem u data/profiles/fpzg/drafts/fpzg-drafts.json,
 * pa je "X/N" tvrdnja na stranici stvaran rezultat pokretanja analyzeFixture, ne procjena.
 *
 * Pokretanje: npm run generate-benchmark-fixture
 * Pise: public/benchmark/lekta-benchmark-v1.docx (stabilan javni URL za preuzimanje)
 *       data/benchmark/lekta-benchmark-v1.json (katalog seeded checkIdova, izvor istine
 *       i za prikazanu metodologiju i za tests/benchmark-fixture.test.ts drift-guard)
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDocx, type ParaSpec } from '../tests/helpers/docx-builder';
import { analyzeFixture } from '../src/analysis/golden-entry';
import { installXmlDomParser } from '../src/docx/xml-dom-install';

installXmlDomParser(); // globalni DOMParser (@xmldom/xmldom) za Node/CI, identicno worker putanji

const here = dirname(fileURLToPath(import.meta.url));
const PROFILE_ID = 'fpzg-politologija-diplomski';

// Namjerno POGRESNE vrijednosti (Word default umjesto FPZG pravila): Calibri 11pt,
// jednostruki prored, lijevo poravnanje, umjesto TNR 12 / 1,5 / obostrano.
const WRONG_FONT = 'Calibri';
const WRONG_SIZE = 11;
const WRONG_SPACING_LINE = 240; // 240-tine => jednostruki prored (1,0), profil trazi 1,5 (360)
const WRONG_JC: ParaSpec['jc'] = 'left';

function body(words: number): ParaSpec[] {
  const sentence = 'Ovo je rečenica akademskog teksta koja nosi smislen sadržaj rada. ';
  const out: ParaSpec[] = [];
  for (let count = 0; count < words; count += 60) {
    out.push({
      text: sentence.repeat(6),
      font: WRONG_FONT,
      sizePt: WRONG_SIZE,
      jc: WRONG_JC,
      spacingLine: WRONG_SPACING_LINE,
    });
  }
  return out;
}

const head = (text: string): ParaSpec => ({ text, font: WRONG_FONT, sizePt: WRONG_SIZE, styleId: 'Heading1' });
const line = (text: string): ParaSpec => ({
  text,
  font: WRONG_FONT,
  sizePt: WRONG_SIZE,
  jc: WRONG_JC,
  spacingLine: WRONG_SPACING_LINE,
});

// Ukupno namjerno PREKRATAK rad (~1100 rijeci), profil trazi 10.000-12.000.
const paragraphs: ParaSpec[] = [
  head('Sažetak'),
  line('Ovo je sažetak rada u jednom odlomku bez citata.'),
  line('Ključne riječi: politika, institucije, analiza'),
  head('Sadržaj'),
  head('1. Uvod'),
  ...body(200),
  head('2. Razrada'),
  ...body(700),
  head('3. Zaključak'),
  ...body(200),
  head('Literatura'),
  line('Prezime, I. (2020). Naslov djela. Zagreb: Nakladnik.'),
];

// US Letter (21,59 x 27,94 cm) umjesto trazenog A4 (21 x 29,7 cm).
const LETTER = { w: 21.59, h: 27.94 };

const spec = {
  paragraphs,
  pageCm: LETTER,
  marginsCm: { top: 2.5, right: 2.5, bottom: 2.5, left: 2.5 },
  // Namjerno BEZ footera: page-numbers pravilo trazi brojeve stranica, ovdje ih nema.
};

interface CatalogueItem {
  id: string;
  checkId: string;
  /** Runtime check nema strojno checkId polje (samo naslov); ovo je supstring za pronalazak. */
  titleMatch: string;
  category: string;
  description: string;
  ruleSource: string;
  expectedVerdict: 'fail';
}

const CATALOGUE: CatalogueItem[] = [
  {
    id: 'font',
    checkId: 'font',
    titleMatch: 'Dominantni font',
    category: 'format',
    description: 'Cijeli rad je pisan fontom Calibri umjesto Times New Roman.',
    ruleSource: 'fpzg-politologija-diplomski--font',
    expectedVerdict: 'fail',
  },
  {
    id: 'font-size',
    checkId: 'font-size',
    titleMatch: 'Veličina osnovnog teksta',
    category: 'format',
    description: 'Veličina slova je 11 pt umjesto propisanih 12 pt.',
    ruleSource: 'fpzg-politologija-diplomski--font-size',
    expectedVerdict: 'fail',
  },
  {
    id: 'line-spacing',
    checkId: 'line-spacing',
    titleMatch: 'Prored osnovnog teksta',
    category: 'format',
    description: 'Prored je jednostruk (1,0) umjesto propisanog 1,5.',
    ruleSource: 'fpzg-politologija-diplomski--line-spacing',
    expectedVerdict: 'fail',
  },
  {
    id: 'justify',
    checkId: 'justify',
    titleMatch: 'Poravnanje osnovnog teksta',
    category: 'format',
    description: 'Tekst je poravnat lijevo umjesto obostrano (Justify).',
    ruleSource: 'fpzg-politologija-diplomski--justify',
    expectedVerdict: 'fail',
  },
  {
    id: 'paper-size',
    checkId: 'paper-size',
    titleMatch: 'Format stranice',
    category: 'format',
    description: 'Format papira je US Letter (21,59×27,94 cm) umjesto propisanog A4 (21×29,7 cm).',
    ruleSource: 'fpzg-politologija-diplomski--paper-size',
    expectedVerdict: 'fail',
  },
  {
    id: 'page-numbers',
    checkId: 'page-numbers',
    titleMatch: 'Brojevi stranica',
    category: 'format',
    description: 'Rad nema brojeve stranica.',
    ruleSource: 'fpzg-politologija-diplomski--page-numbers',
    expectedVerdict: 'fail',
  },
  {
    id: 'word-count',
    checkId: 'word-count',
    titleMatch: 'Profilni opseg riječi',
    category: 'scope',
    description: 'Rad ima otprilike 1.100 riječi, profil traži 10.000-12.000.',
    ruleSource: 'fpzg-politologija-diplomski--word-count',
    expectedVerdict: 'fail',
  },
];

async function main() {
  const bytes = buildDocx(spec);
  const outDocx = join(here, '..', 'public', 'benchmark');
  const outData = join(here, '..', 'data', 'benchmark');
  mkdirSync(outDocx, { recursive: true });
  mkdirSync(outData, { recursive: true });
  writeFileSync(join(outDocx, 'lekta-benchmark-v1.docx'), bytes);

  // Stvaran pokrenut rezultat, ne pretpostavka: pokreni isti analyzeFixture koji koristi
  // golden harness, pa prebroji koliko seeded checkIdova STVARNO izlazi kao neuspjeh.
  const file = new File([bytes], 'lekta-benchmark-v1.docx', {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
  const result: any = await analyzeFixture(file, { profileId: PROFILE_ID });
  const checks: any[] = Array.isArray(result.checks) ? result.checks : [];

  console.log('\nSve provjere s izgubljenim bodovima (earned < max), za rucnu provjeru mapiranja:');
  for (const c of checks) {
    if (c.scored && c.earned < c.max) console.log(`  - "${c.title}"  status=${c.status}  ${c.earned}/${c.max}`);
  }

  // Runtime Check nema strojno checkId (samo naslov); "pronadjeno" = izgubljeni bodovi
  // (earned < max) na provjeri ciji naslov sadrzi titleMatch. Robusnije od usporedbe
  // statusa: neke provjere (npr. brojevi stranica) drze status='pass' uz earned=0.
  let found = 0;
  const detected: Record<string, boolean> = {};
  for (const item of CATALOGUE) {
    const c = checks.find((x) => x.scored && typeof x.title === 'string' && x.title.includes(item.titleMatch));
    const isFail = !!c && c.earned < c.max;
    detected[item.checkId] = isFail;
    if (isFail) found++;
    console.log(`  ${isFail ? 'PRONADJENO' : 'PROMASENO '}  ${item.checkId}  (naslov="${c?.title ?? 'NIJE PRONADJEN CHECK'}", ${c ? `${c.earned}/${c.max}` : 'n/a'})`);
  }

  const payload = {
    version: 1,
    profileId: PROFILE_ID,
    generatedNote: 'Kodom generiran, deterministicki, reproducibilan (scripts/generate-benchmark-fixture.mts).',
    found,
    total: CATALOGUE.length,
    items: CATALOGUE,
    detected,
  };
  writeFileSync(join(outData, 'lekta-benchmark-v1.json'), JSON.stringify(payload, null, 2) + '\n');

  console.log(`\nStvaran rezultat: ${found}/${CATALOGUE.length} seeded gresaka pronadjeno.`);
  console.log(`Zapisano: ${join(outDocx, 'lekta-benchmark-v1.docx')} (${bytes.length} B)`);
  console.log(`Zapisano: ${join(outData, 'lekta-benchmark-v1.json')}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

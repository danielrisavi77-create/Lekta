/**
 * Generator on-disk golden .docx fixtura (CLAUDE.md backlog 1, docx-golden suite).
 *
 * Gradi deterministicke sinteticke .docx kroz tests/helpers/docx-builder i pise ih u
 * tests/fixtures/docx/ uz sidecar <ime>.json s profileId-om. Time se aktivira
 * tests/docx-golden.test.ts (on-disk put), koji se inace sam preskace bez fixtura.
 *
 * Fixture NISU pravi studentski radovi ni izvor pravila (CLAUDE.md); sluze iskljucivo
 * kao stabilan regresijski net za parser/audit/engine prije refaktora ili promocije
 * pravila. Pokrivaju fakultete i citatne modove kojih synthetic-golden korpus nema
 * (ieee/vancouver/chicago-notes, STEM/medicina/humanistika, doktorat, fail grane).
 *
 * Pokretanje: npx vite-node scripts/gen-golden-fixtures.ts
 * Nakon regeneracije: npm test -- -u  (osvjezi snapshote), pa provjeri diff.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDocx, type ParaSpec, type DocSpec } from '../tests/helpers/docx-builder';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, '..', 'tests', 'fixtures', 'docx');
const TNR = 'Times New Roman';

/** Tijelo teksta zeljene grube duljine (rijeci), zadanim fontom/velicinom. */
function body(words: number, font = TNR, sizePt = 12): ParaSpec[] {
  const sentence = 'Ovo je rečenica akademskog teksta koja nosi smislen sadržaj rada. '; // ~10 rijeci
  const out: ParaSpec[] = [];
  for (let count = 0; count < words; count += 60) {
    out.push({ text: sentence.repeat(6), font, sizePt, jc: 'both', spacing15: true });
  }
  return out;
}

const head = (text: string, font = TNR): ParaSpec => ({ text, font, sizePt: 12, styleId: 'Heading1' });
const line = (text: string, font = TNR): ParaSpec => ({ text, font, sizePt: 12, jc: 'both' });

/** Standardna hrvatska akademska struktura zadane duljine i fonta. */
function academicWork(words: number, font = TNR, extraTail: ParaSpec[] = []): ParaSpec[] {
  return [
    head('Sažetak', font),
    line('Ovo je sažetak rada u jednom odlomku bez citata.', font),
    line('Ključne riječi: analiza, metoda, rezultati', font),
    head('Sadržaj', font),
    head('1. Uvod', font),
    ...body(Math.round(words * 0.15), font),
    head('2. Razrada', font),
    ...body(Math.round(words * 0.7), font),
    head('3. Zaključak', font),
    ...body(Math.round(words * 0.15), font),
    head('Literatura', font),
    line('Prezime, I. (2020). Naslov djela. Zagreb: Nakladnik.', font),
    ...extraTail,
  ];
}

interface Fixture {
  file: string;
  profileId: string;
  spec: DocSpec;
}

const A4 = { w: 21.0, h: 29.7 };
const M25 = { top: 2.5, right: 2.5, bottom: 2.5, left: 2.5 };

const FIXTURES: Fixture[] = [
  // STEM, ieee (numericko), TNR, A4 - inzenjerstvo
  {
    file: 'fer-diplomski-uskladjen',
    profileId: 'fer-diplomski',
    spec: { paragraphs: academicWork(9000), pageCm: A4, marginsCm: M25 },
  },
  // Numericko (vancouver) uz Arial font + sadrzaj/sekcije - tekstil/tehnologija
  {
    file: 'ttf-diplomski-arial',
    profileId: 'ttf-diplomski',
    spec: { paragraphs: academicWork(8000, 'Arial'), pageCm: A4, marginsCm: M25 },
  },
  // Humanistika, chicago-notes (biljeske) - filozofija (bez A4 zahtjeva u profilu)
  {
    file: 'ffzg-filozofija-diplomski',
    profileId: 'ffzg-filozofija-diplomski',
    spec: {
      paragraphs: academicWork(10000),
      pageCm: A4,
      marginsCm: M25,
    },
  },
  // Medicinski doktorat, vancouver, A4, sadrzaj + zivotopis
  {
    file: 'mef-doktorski-disertacija',
    profileId: 'mef-doktorski',
    spec: {
      paragraphs: academicWork(15000, TNR, [head('Životopis'), line('Autor je objavio nekoliko znanstvenih radova.')]),
      pageCm: A4,
      marginsCm: M25,
    },
  },
  // Matematika, ieee, A4, sadrzaj
  {
    file: 'pmf-matematika-uskladjen',
    profileId: 'pmf-matematika-graduate',
    spec: { paragraphs: academicWork(7000), pageCm: A4, marginsCm: M25 },
  },
  // Namjerno NEUSKLADJEN: krivi font/velicina, A5 stranica, prevelike margine, bez strukture
  // (zakljucava fail grane audita: font/size/margins/A4/struktura/sadrzaj).
  {
    file: 'grf-diplomski-neuskladjen',
    profileId: 'grf-diplomski',
    spec: {
      paragraphs: [
        { text: 'Naslov rada bez ostalih dijelova', font: 'Calibri', sizePt: 14, jc: 'left' },
        ...Array.from({ length: 5 }, () => ({
          text: 'Kratak tekst koji nije akademski strukturiran niti dovoljno dug za rad.',
          font: 'Calibri',
          sizePt: 14,
          jc: 'left' as const,
        })),
      ],
      pageCm: { w: 14.8, h: 21.0 },
      marginsCm: { top: 4, right: 4, bottom: 4, left: 4 },
    },
  },
];

mkdirSync(OUT, { recursive: true });
for (const fx of FIXTURES) {
  const bytes = buildDocx(fx.spec);
  writeFileSync(join(OUT, `${fx.file}.docx`), bytes);
  writeFileSync(join(OUT, `${fx.file}.json`), JSON.stringify({ profileId: fx.profileId }, null, 2) + '\n');
  console.log(`fixture: ${fx.file}.docx  ->  ${fx.profileId}  (${bytes.length} B)`);
}
console.log(`\n${FIXTURES.length} fixtura zapisano u ${OUT}`);

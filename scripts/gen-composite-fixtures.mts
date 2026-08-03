/**
 * Zapisuje kompozitne .docx fixture (faza B) u tests/fixtures/docx/ uz sidecar.
 *
 * Izvor je tests/helpers/composite-docx.ts, isti kod koji tests/repair-composite-fixture.test.ts
 * vrti u memoriji. Ovdje se samo materijalizira na disk; writeZip ima fiksni DOS timestamp
 * (1980-01-01) pa su bajtovi deterministicki i ponovno pokretanje ne stvara diff.
 *
 * Dokumenti su GENERIRANI i ANONIMNI: nisu studentski radovi i nisu izvor pravila (CLAUDE.md).
 *
 * Pokretanje: npx vite-node scripts/gen-composite-fixtures.mts
 * Nakon toga: npm test -- -u  (osvjezi snapshote), pa PROCITAJ diff prije commita.
 */
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fullStructureDocx, fpzgBibliographyDocx, pravoFootnotesDocx } from '../tests/helpers/composite-docx';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, '..', 'tests', 'fixtures', 'docx');

interface CompositeFixture {
  file: string;
  build: () => Promise<Uint8Array>;
  sidecar: Record<string, unknown>;
}

const FIXTURES: CompositeFixture[] = [
  {
    file: 'fer-diplomski-puna-struktura.docx',
    build: fullStructureDocx,
    sidecar: {
      profileId: 'fer-diplomski',
      // Korak N+2: synthetic zastavica uklonjena, pa dokument od sada ulazi i u
      // repair-real-corpus, faculty-matrix i backlog, ne samo u golden matricu.
      note: 'generirano, anonimno, nije studentski rad; kompozitna struktura za pokrivenost fixera',
    },
  },
  {
    file: 'fpzg-novinarstvo-bibliografija.docx',
    build: fpzgBibliographyDocx,
    sidecar: {
      // Profil je izabran po podacima: bibliography-rules, citation-sync-rules,
      // section-surgery-rules i required-section-rules postoje tocno na 11 FPZG profila.
      profileId: 'fpzg-novinarstvo-diplomski',
      note: 'generirano, anonimno, nije studentski rad; popis literature i citati namjerno neispravni',
    },
  },
  // Ista gradja pod DVA profila: nijedan profil ne gate-a sva tri ciljana fixera
  // (checkFootnoteParagraphSpacingZero, footnoteFont/Size, pageNumberAlignment).
  {
    file: 'pravo-socijalni-rad-fusnote.docx',
    build: () => pravoFootnotesDocx(),
    sidecar: {
      profileId: 'pravo-socijalni-rad-diplomski',
      synthetic: true,
      note: 'generirano, anonimno, nije studentski rad; fusnote i broj stranice namjerno neispravni',
    },
  },
  {
    file: 'pravo-integrirani-fusnote.docx',
    build: () => pravoFootnotesDocx('Integrirani preddiplomski i diplomski studij prava'),
    sidecar: {
      profileId: 'pravo-integrirani-diplomski',
      synthetic: true,
      note: 'generirano, anonimno, nije studentski rad; razmaci u fusnotama namjerno neispravni',
    },
  },
];

for (const fixture of FIXTURES) {
  const bytes = await fixture.build();
  writeFileSync(join(OUT, fixture.file), bytes);
  writeFileSync(join(OUT, fixture.file.replace(/\.docx$/i, '.json')), `${JSON.stringify(fixture.sidecar, null, 2)}\n`);
  console.log(`${fixture.file}: ${bytes.length} bajtova`);
}
console.log(`\n${FIXTURES.length} kompozitni fixture zapisan u ${OUT}`);

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
import { fullStructureDocx } from '../tests/helpers/composite-docx';

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
      // Korak N+1: dok je true, dokument je izvan real-corpus kaskade (discoverRealCorpus ga
      // preskace) ali JE u golden matrici, pa se snapshot diff moze procitati izolirano.
      // Korak N+2 ga uklanja i tek tada dokument ulazi u repair-real-corpus i faculty-matrix.
      synthetic: true,
      note: 'generirano, anonimno, nije studentski rad; kompozitna struktura za pokrivenost fixera',
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

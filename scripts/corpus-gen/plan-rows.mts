/**
 * MANIFEST SINTETICKOG KORPUSA: koji se redci uopce pisu, po cijim pravilima i s kojim opsegom.
 *
 *   npx vite-node scripts/corpus-gen/plan-rows.mts [-- --write]
 *
 * Bez `--write` samo ispisuje sazetak; s njom pece `data/verification/synthetic-corpus-manifest.json`.
 *
 * Manifest namjerno NE nosi prozu ni dokumente: proza i generirani paketi zive izvan repozitorija
 * (`LEKTA_SYNTHETIC_CORPUS`), a ovdje ostaje samo popis redaka i njihova pravila, dakle ono sto se
 * mora moci ponoviti i pregledati. Isti razlog zbog kojeg stvarni radovi nisu u gitu.
 *
 * Izvjestaj MORA izgovoriti koliko redaka nema fakultetsko pravilo. Popis koji tu brojku presuti
 * izgleda kao puna matrica, a znaci da se najveci dio korpusa pise po obiteljskom baselineu.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { enumerateRows, rulesDigestFor } from './rows.mts';
import { withProvenance } from '../lib/provenance.mjs';

const ROOT = resolve(join(dirname(fileURLToPath(import.meta.url)), '..', '..'));
const OUT = join(ROOT, 'data', 'verification', 'synthetic-corpus-manifest.json');

function main(): void {
  const write = process.argv.includes('--write');
  const rows = enumerateRows();

  const bezProfila = rows.filter((r) => r.routedProfileId === null);
  const zadaniOpseg = rows.filter((r) => r.wordTargetSource === 'default');
  const zamjenskiProgram = rows.filter((r) => r.programSource === 'fallback');

  const poVrsti: Record<string, { ukupno: number; bezProfila: number }> = {};
  for (const r of rows) {
    const k = `${r.workType}/${r.level}`;
    poVrsti[k] ??= { ukupno: 0, bezProfila: 0 };
    poVrsti[k].ukupno += 1;
    if (r.routedProfileId === null) poVrsti[k].bezProfila += 1;
  }

  console.log(`redaka: ${rows.length}, jedinica: ${new Set(rows.map((r) => r.unitId)).size}`);
  console.log('\n(vrsta rada / razina)            ukupno   bez fakultetskog profila');
  for (const [k, v] of Object.entries(poVrsti).sort()) {
    console.log(`  ${k.padEnd(30)} ${String(v.ukupno).padStart(5)}   ${String(v.bezProfila).padStart(5)}`);
  }
  console.log(`\nbez fakultetskog profila (obiteljski baseline): ${bezProfila.length} od ${rows.length}`);
  console.log(`opseg iz zadane tablice, ne iz pravila:          ${zadaniOpseg.length} od ${rows.length}`);
  console.log(`program nije te razine (zamjena):               ${zamjenskiProgram.length} od ${rows.length}`);
  console.log(`ukupno rijeci proze koje treba napisati:        ${rows.reduce((s, r) => s + r.wordTarget, 0).toLocaleString('hr')}`);

  if (!write) {
    console.log('\n(bez --write; manifest nije pecen)');
    return;
  }

  const artefakt = withProvenance(
    {
      schemaVersion: 1,
      note:
        'Popis redaka sintetickog korpusa. Proza i generirani dokumenti zive IZVAN repozitorija ' +
        '(LEKTA_SYNTHETIC_CORPUS); ovdje su samo redci i njihova slozena pravila. Nijedan redak nije ' +
        'izvor bodovanog pravila i nijedan ne moze potkrijepiti razinu dokaza A.',
      summary: {
        rowCount: rows.length,
        unitCount: new Set(rows.map((r) => r.unitId)).size,
        withoutFacultyProfile: bezProfila.length,
        defaultWordTarget: zadaniOpseg.length,
        substituteProgram: zamjenskiProgram.length,
        totalWords: rows.reduce((s, r) => s + r.wordTarget, 0),
        byWorkTypeLevel: poVrsti,
      },
      rows: rows.map((r) => ({ ...r, rules: rulesDigestFor(r) })),
    },
    'npx vite-node scripts/corpus-gen/plan-rows.mts -- --write',
  );

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(artefakt, null, 2) + '\n', 'utf8');
  console.log(`\nzapisano: ${OUT}`);
}

main();

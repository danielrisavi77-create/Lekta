/**
 * IZVOZ NALAZA PREMA `katedra` SKILLU.
 *
 *   npm run skill-feedback [-- --nastavak-od N] [-- --write]
 *
 * Cita `docs/generated/skill-compare.json` (nalaze, nikad pravila) i sastavlja FRAGMENT kataloga
 * kvarova u obliku koji `katedra/scripts/kvar.py` provjerava: `## N. naslov`, proza iz koje se citaju
 * cetiri stvari, barem jedna brojka, barem jedan blok izlaza, najmanje 400 znakova po unosu.
 *
 * SMJER JE JEDNOSMJERAN I OSTAJE TAKAV. Odavde prema Katedri putuje opis KVARA U NJEZINU ALATU,
 * dakle metapodatak o ponasanju skripte. Nijedno fakultetsko pravilo i nijedna recenica rada ne ide
 * ovim kanalom; renderer prozu ne prima ni kao ulaz (`src/corpus/tool-feedback.ts`).
 *
 * ZASTO SU BROJKE I BLOKOVI DOSLOVNI. Ciljani katalog trazi dokaz, ne dojam. Svaki blok nize je
 * prepisan iz stvarnog ispisa alata na imenovanom dokumentu, a ne sastavljen radi ilustracije.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderDefectFragment } from '../../src/corpus/tool-feedback';
import { KVAROVI } from '../../src/corpus/defect-catalog';
import type { ComparisonRow } from '../../src/corpus/tool-comparison';
import { withProvenance } from '../lib/provenance.mjs';

const ROOT = resolve(join(dirname(fileURLToPath(import.meta.url)), '..', '..'));
const USPOREDBA = join(ROOT, 'docs', 'generated', 'skill-compare.json');
const OUT = join(ROOT, 'docs', 'generated', 'skill-feedback.md');

/**
 * Zadnji zauzet broj u CILJANOM katalogu, procitan iz vendoriranog paketa.
 *
 * Prije 2026-09-08 je zadana vrijednost bila prepisana konstanta `140`, i istrunula je: njihov je
 * katalog u medjuvremenu narastao na 159, a brojevi 141 do 144 ondje drze POSVE DRUGI kvarovi (o
 * ogradama i padu suitea). Isporuka s prepisanim brojem sudarila bi se s njihovim zapisima, i to
 * tiho, jer nas alat nema nacina vidjeti tudji katalog.
 *
 * Sada se broj cita iz `.claude/katedra-pkg`, koji je u ovom repozitoriju vendoriran kao subtree.
 * Kad ga nema, broj se NE pogadja: trazi se `--nastavak-od`, jer je pogodjen broj ovdje gori od
 * nikakvog (duplikat u tudjem katalogu se ne vidi dok ga netko ne procita).
 */
function zadnjiBrojUKatalogu(): number | null {
  const put = join(ROOT, '.claude', 'katedra-pkg', 'katedra-lite', 'references', 'zamke.md');
  if (!existsSync(put)) return null;
  const brojevi = [...readFileSync(put, 'utf8').matchAll(/^## (\d+)\./gm)].map((m) => Number(m[1]));
  return brojevi.length ? Math.max(...brojevi) : null;
}

function main(): void {
  const argv = process.argv.slice(2);
  const write = argv.includes('--write');
  const idx = argv.indexOf('--nastavak-od');
  const izKataloga = zadnjiBrojUKatalogu();
  if (idx < 0 && izKataloga === null) {
    console.error('Nije poznat zadnji zauzet broj u ciljanom katalogu.');
    console.error('Navedi `--nastavak-od <broj>`; prepisana konstanta istrune i sudari se s tudjim zapisima.');
    process.exitCode = 2;
    return;
  }
  const continuesFrom = idx >= 0 ? Number(argv[idx + 1]) : (izKataloga as number);
  if (idx < 0) {
    console.log(`nastavak-od procitan iz vendoriranog kataloga: ${continuesFrom}`);
  }

  if (!Number.isInteger(continuesFrom) || continuesFrom < 0) {
    console.error('--nastavak-od trazi cijeli broj (zadnji zauzet broj u ciljanom katalogu).');
    process.exitCode = 2;
    return;
  }
  if (!existsSync(USPOREDBA)) {
    console.error(`Nema artefakta usporedbe: ${USPOREDBA}`);
    console.error('Pokreni `npm run skill-compare -- --write`; bez mjerenja kvar nema potkrepu.');
    process.exitCode = 2;
    return;
  }

  const rows = (JSON.parse(readFileSync(USPOREDBA, 'utf8')) as { rows: ComparisonRow[] }).rows;
  const { markdown, unsupported, numbers } = renderDefectFragment(KVAROVI, rows, continuesFrom);

  console.log(`kvarova u katalogu: ${KVAROVI.length}, izlazi: ${numbers.length} (brojevi ${numbers.join(', ')})`);
  if (unsupported.length) {
    // Nije greska nego ISHOD: mjerenje vise ne potkrepljuje taj zapis, pa je vjerojatno popravljen.
    console.log(`bez potkrepe, ne izlaze: ${unsupported.join(', ')}`);
  }
  if (!numbers.length) {
    console.error('Nijedan kvar nema potkrepu; izvoz bi bio tvrdnja bez dokumenta.');
    process.exitCode = 1;
    return;
  }

  if (!write) {
    console.log(`\n${markdown}`);
    return;
  }
  mkdirSync(dirname(OUT), { recursive: true });
  const zaglavlje = withProvenance({}, 'npm run skill-feedback -- --write') as Record<string, string>;
  writeFileSync(
    OUT,
    `<!-- ${zaglavlje.generator} | ${zaglavlje.generatedAt} | ${zaglavlje.generatedFromCommit} -->\n` +
      `<!-- Fragment za <katedra-lite>/references/zamke.md. Provjera na drugoj strani: -->\n` +
      `<!-- python3 <katedra>/scripts/kvar.py <ovaj-fragment>.md --provjeri --nastavak-od ${continuesFrom} -->\n\n` +
      markdown,
    'utf8',
  );
  console.log(`\nzapisano: ${OUT}`);
}

main();

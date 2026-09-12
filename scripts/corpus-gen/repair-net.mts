/**
 * MREZA NAD FIXERIMA: svaki prolaz kaze je li koji fixer prestao raditi.
 *
 *   npm run repair-net            # nad commitanim skupom (radi svugdje, i u CI-ju)
 *   npm run repair-net -- --write # uz to pece artefakt
 *   npm run repair-net -- --dir <putanja>
 *
 * Zasto postoji, provjereno u kodu prije pisanja:
 *   `closed-loop.json` sprema `requested` kao GOLI BROJ; koji su fixeri trazeni nigdje se ne biljezi,
 *   a `skippedReasons` se odbacuje. `repair-real-corpus.json` ima `offeredFixerIds`, ali to polje nema
 *   nijednog citatelja u repozitoriju. `coverage-cells` klasificira STATICKI: `consistency-fixer` i
 *   `citation-bibliography-sync-fixer` su tvrdo upisani kao "ceka ljudski odabir" (814 celija), i to
 *   se nikad ne premjerava. Nijedan od njih ne odgovara na pitanje "je li ovaj fixer zatrazen i nije
 *   ucinio NISTA na dokumentu koji je napisao pravi alat".
 *
 * Ulaz su commitane `authored` fixture: izlazi PRAVIH alata, s prozom pisanom izvan pipelinea. Alata
 * u CI-ju nema, ali dokumenti su vec napravljeni, pa mreza radi svugdje.
 *
 * NE DIRA LJESTVICU DOKAZA. Fixture su `synthetic: true` i traka `authored`, pa ih `sidecarAdmitted`
 * odbija; ovaj artefakt je zaseban i nijedan potrosac tvrdnji ga ne cita.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installXmlDomParser } from '../../src/docx/xml-dom-install';
import { ensureRepairMapHeavy } from '../../src/profiles/profile-runtime-maps';
import {
  measureDocument,
  aggregateByFixer,
  deadFixers,
  awaitingConfirmationFixers,
  type DocumentMeasurement,
} from './net-core.mts';
import { withProvenance } from '../lib/provenance.mjs';

installXmlDomParser();

const ROOT = resolve(join(dirname(fileURLToPath(import.meta.url)), '..', '..'));
const DEFAULT_DIR = join(ROOT, 'tests', 'fixtures', 'docx-authored');
const OUT = join(ROOT, 'docs', 'generated', 'repair-net.json');
const RATCHET = join(ROOT, 'data', 'profiles', 'repair-net-ratchet.json');

interface Ratchet {
  measuredAt: string;
  note: string;
  /** IMENOVAN popis mrtvih fixera, svaki s razlogom. Popis smije samo padati. */
  dead: Array<{ fixerId: string; reason: string; why: string }>;
}

function main(): Promise<void> {
  return run();
}

async function run(): Promise<void> {
  const argv = process.argv.slice(2);
  const dirIdx = argv.indexOf('--dir');
  const dir = dirIdx >= 0 ? resolve(ROOT, argv[dirIdx + 1]) : DEFAULT_DIR;
  const write = argv.includes('--write');

  await ensureRepairMapHeavy();

  let files: string[] = [];
  try {
    files = readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.docx')).sort();
  } catch {
    console.error(`Nema direktorija: ${dir}`);
    process.exitCode = 2;
    return;
  }
  // Prazan skup NIJE tihi prolaz: mreza bez ijednog dokumenta ne moze nikoga uhvatiti, a njezino
  // zeleno bi se citalo kao "svi fixeri rade". Isti razred kao `real-corpus-vacuity`.
  if (!files.length) {
    console.error(`Nijedan .docx u ${dir}; mreza bi bila vakuumska, a njezino zeleno lazno.`);
    process.exitCode = 2;
    return;
  }

  const mjerenja: DocumentMeasurement[] = [];
  for (const f of files) {
    const sidecar = join(dir, f.replace(/\.docx$/i, '.json'));
    let profileId: string | null = null;
    try {
      profileId = (JSON.parse(readFileSync(sidecar, 'utf8')) as { profileId?: string }).profileId ?? null;
    } catch {
      profileId = null;
    }
    mjerenja.push(await measureDocument(join(dir, f), profileId));
  }

  const rows = aggregateByFixer(mjerenja);
  const mrtvi = deadFixers(rows);
  const cekaju = awaitingConfirmationFixers(rows);

  const ratchet: Ratchet = JSON.parse(readFileSync(RATCHET, 'utf8')) as Ratchet;
  const dopusteni = new Set(ratchet.dead.map((d) => d.fixerId));
  const novi = mrtvi.filter((f) => !dopusteni.has(f));
  const ozivjeli = ratchet.dead.map((d) => d.fixerId).filter((f) => !mrtvi.includes(f));

  console.log(`dokumenata: ${mjerenja.length} | fixera zatrazeno: ${rows.length}\n`);
  for (const r of rows) {
    // Tri stanja, ne dva: MRTAV je kvar, CEKA je stanje forme, prazno je uredan rad.
    const oznaka = cekaju.includes(r.fixerId) ? 'CEKA  ' : r.changed === 0 ? 'MRTAV ' : '      ';
    const razlozi = Object.entries(r.reasons)
      .map(([k, v]) => `${k}x${v}`)
      .join(' ');
    console.log(`  ${oznaka}${r.fixerId.padEnd(38)} ${r.requested} / ${r.changed}  ${razlozi}`);
  }

  if (novi.length) {
    console.error(`\nNOV MRTAV FIXER (nije na imenovanom popisu): ${novi.join(', ')}`);
    console.error('Popravi ga, ili ga svjesno upisi u data/profiles/repair-net-ratchet.json uz razlog.');
    process.exitCode = 1;
  }
  if (ozivjeli.length) {
    console.error(`\nFIXER JE OZIVIO, a jos je na popisu mrtvih: ${ozivjeli.join(', ')}`);
    console.error('Skini ga s popisa; ratchet koji nosi rijesen slucaj propusta sljedeci s istim imenom.');
    process.exitCode = 1;
  }
  if (!novi.length && !ozivjeli.length) console.log('\nmreza: popis mrtvih fixera odgovara imenovanom ratchetu');

  if (!write) return;
  const artefakt = withProvenance(
    {
      schemaVersion: 1,
      note:
        'Mreza nad fixerima: koji je fixer zatrazen, koji je nesto promijenio, i zasto nije kad nije. ' +
        'Ulaz su `authored` fixture (synthetic: true), pa ovaj artefakt NE dira ljestvicu dokaza. ' +
        'TRI stanja, ne dva: `dead` je kvar, `awaiting` je fixer koji ceka ljudsku potvrdu, ostalo radi.',
      summary: {
        documentCount: mjerenja.length,
        fixerCount: rows.length,
        deadCount: mrtvi.length,
        dead: mrtvi,
        /**
         * Fixeri koji NISU mrtvi nego cekaju ljudsku potvrdu: zahtjev im je poslan, ali `params` ni
         * na jednom dokumentu ne nose posao. Bez ovog polja se to stanje ne razlikuje od kvara, pa
         * bi stvaran kvar bas tih fixera bio nevidljiv.
         */
        awaitingCount: cekaju.length,
        awaiting: cekaju,
      },
      fixers: rows,
      documents: mjerenja,
    },
    'npm run repair-net -- --write',
  );
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(artefakt, null, 2) + '\n', 'utf8');
  console.log(`\nzapisano: ${OUT}`);
}

if (!existsSync(RATCHET)) {
  console.error(`Nema ratcheta: ${RATCHET}`);
  process.exitCode = 2;
} else {
  await main();
}

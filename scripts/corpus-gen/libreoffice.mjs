/**
 * F2: generiranje korpusa PRAVIM LibreOfficeom.
 *
 * Zasto postoji: provenijencijska os korpusa je bila prazna. Izmjereno 2026-08-23, svih 38
 * stvarnih radova i svih 17 commitanih fixtura nosi `Microsoft Office Word`; LibreOffice,
 * Google Docs i Pages imaju NULA dokumenata. Jedini LibreOffice svjedok
 * (`synthetic-libreoffice-standard-default.docx`) je RUCNO sastavljen, ne izlaz alata.
 *
 * Tok: gradimo Flat ODF (`.fodt`, jedan XML), pa ga PRAVI `soffice --headless` pretvara u
 * `.docx`. Rezultat je stvarni LibreOffice izlaz, sa svim njegovim navikama (stilovi, imena
 * stilova, docDefaults), a sadrzaj je izmisljen pa nema osobnih podataka i smije se commitati.
 *
 * NE koristi se za pretvorbu tudjeg dokumenta: to bi bila `converted` traka, koja po planu
 * nikad ne broji kao dokaz profila.
 *
 *   node scripts/corpus-gen/libreoffice.mjs --out <dir> [--scenario <id>] [--keep-fodt]
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCENARIOS } from './scenarios.mjs';

const ROOT = resolve(join(dirname(fileURLToPath(import.meta.url)), '..', '..'));

/** Poznate putanje LibreOfficea. Nedostupan alat je NEPOKRIVEN, nikad tiho preskocen. */
const SOFFICE_CANDIDATES = [
  join('C:', 'Program Files', 'LibreOffice', 'program', 'soffice.exe'),
  join('C:', 'Program Files (x86)', 'LibreOffice', 'program', 'soffice.exe'),
  '/usr/bin/soffice',
  '/usr/local/bin/soffice',
];

export function findSoffice() {
  for (const candidate of SOFFICE_CANDIDATES) if (existsSync(candidate)) return candidate;
  return null;
}

/**
 * Vlastiti profil izvodjenja: bez njega `soffice --headless` odbija raditi dok je otvoren
 * korisnikov LibreOffice, i obratno, moze mu pokvariti sesiju.
 */
const USER_INSTALLATION = 'file:///C:/Users/PC/AppData/Local/Temp/claude/lo-profile-corpus-gen';

/** Pretvori jedan `.fodt` u `.docx` PRAVIM LibreOfficeom. Vraca putanju do `.docx`. */
export function convertFodtToDocx(soffice, fodtPath, outDir) {
  execFileSync(
    soffice,
    [
      '--headless',
      '--norestore',
      `-env:UserInstallation=${USER_INSTALLATION}`,
      '--convert-to',
      'docx:MS Word 2007 XML',
      '--outdir',
      outDir,
      fodtPath,
    ],
    { stdio: ['ignore', 'pipe', 'pipe'], timeout: 180_000 },
  );
  const produced = basename(fodtPath).replace(/\.fodt$/i, '.docx');
  const full = join(outDir, produced);
  if (!existsSync(full)) throw new Error(`LibreOffice nije proizveo ${produced}`);
  return full;
}

function main() {
  const argv = process.argv.slice(2);
  const outIndex = argv.indexOf('--out');
  const outDir = outIndex >= 0 && argv[outIndex + 1] ? resolve(ROOT, argv[outIndex + 1]) : join(ROOT, '.artifacts', 'corpus-gen-lo');
  const scenarioIndex = argv.indexOf('--scenario');
  const only = scenarioIndex >= 0 ? argv[scenarioIndex + 1] : null;
  const keepFodt = argv.includes('--keep-fodt');

  const soffice = findSoffice();
  if (!soffice) {
    // Nedostupan alat se IMENUJE, ne presucuje. Izlazni kod 2 je "nema alata", ne "proslo".
    console.error('LibreOffice nije pronadjen. Traka K8 je NEPOKRIVENA na ovom stroju.');
    console.error('Trazeno na: ' + SOFFICE_CANDIDATES.join(', '));
    process.exit(2);
  }

  mkdirSync(outDir, { recursive: true });
  const chosen = only ? SCENARIOS.filter((s) => s.id === only) : SCENARIOS;
  if (!chosen.length) {
    console.error(`Nepoznat scenarij: ${only}. Poznati: ${SCENARIOS.map((s) => s.id).join(', ')}`);
    process.exit(1);
  }

  const rows = [];
  for (const scenario of chosen) {
    const fodtPath = join(outDir, `${scenario.id}.fodt`);
    writeFileSync(fodtPath, scenario.build(), 'utf8');
    const docxPath = convertFodtToDocx(soffice, fodtPath, outDir);
    if (!keepFodt) rmSync(fodtPath, { force: true });

    // Sidecar: zadrzava v1 ugovor (`profileId` na korijenu) koji `discoverRealCorpus` cita.
    writeFileSync(
      docxPath.replace(/\.docx$/i, '.json'),
      JSON.stringify(
        {
          profileId: scenario.profileId,
          note: `generirano PRAVIM LibreOfficeom (${scenario.role}); izmisljen tekst, NIJE studentski rad. Izvor: scripts/corpus-gen/libreoffice.mjs --scenario ${scenario.id}`,
        },
        null,
        2,
      ) + '\n',
      'utf8',
    );
    rows.push({ id: scenario.id, docx: docxPath, bytes: readFileSync(docxPath).length });
    console.log(`  ${scenario.id.padEnd(28)} ${String(readFileSync(docxPath).length).padStart(7)} B  ${scenario.describe}`);
  }

  console.log(`\nLibreOffice: ${soffice}`);
  console.log(`zapisano: ${outDir} (${rows.length} dokument(a))`);
}

// Pokrece se samo kad je ovaj modul ULAZNA tocka; kao uvoz sluzi za `findSoffice`/`convertFodtToDocx`.
if (process.argv[1] && /libreoffice\.mjs$/.test(process.argv[1].replace(/\\/g, '/'))) {
  main();
}

// scripts/generate-status.mjs
//
// JEDAN izvor statusa: `docs/generated/STATUS.json`.
//
// ZASTO POSTOJI. Nazivnici su se razilazili bez objasnjenja: registar ima 407 profila, ledger 436
// redaka, a jedinstvenih profila u tim redcima 411. Dok se to ne IMENUJE, svaki postotak izracunat
// nad "brojem profila" znaci nesto drugo ovisno o tome tko ga racuna.
//
// Razlika nije kozmeticka nego nosi DVA stvarna nalaza, pa ih ovaj artefakt izdvaja umjesto da ih
// utopi u zbroj:
//   - ruta bez profila:   redak ima `unitId` i `programIds`, ali `profileId` je null. Student taj
//                         program moze odabrati, a odabir ne vodi nikamo.
//   - profil bez jedinice: redak ima `profileId` i verificirana pravila, ali `unitId` je null, pa
//                         profil nije dostizan kroz odabir (jedinica -> program -> vrsta rada).
//                         Rade se pravila koja nitko ne moze dobiti.
//
// Artefakt nosi `generatedAt` i `generatedFromCommit`, kojih do sada nije imao NIJEDAN od 21
// generiranog artefakta, pa se nije dalo utvrditi ni kada je koji pecen ni iz cega.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const IZLAZ = path.join(ROOT, 'docs', 'generated', 'STATUS.json');

function citaj(rel) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
}

/** Sve sto je izvedeno iz podataka, bez vremena i commita: nad ovime se moze tvrditi drift. */
export function izracunajStatus() {
  const registar = citaj('data/profiles/verified-profiles.json');
  const ledger = citaj('docs/generated/completion-ledger.json');
  const registriraniIds = new Set(registar.map((p) => p.id));

  const rutaBezProfila = ledger.rows
    .filter((r) => r.profileId === null)
    .map((r) => ({ unitId: r.unitId, workType: r.workType, programIds: r.programIds ?? [] }))
    .sort((a, b) => `${a.unitId}${a.workType}`.localeCompare(`${b.unitId}${b.workType}`));

  const profilBezJedinice = [...new Set(
    ledger.rows.filter((r) => r.profileId !== null && r.unitId === null).map((r) => r.profileId),
  )].sort();

  const uLedgeruNeURegistru = [...new Set(
    ledger.rows.map((r) => r.profileId).filter((id) => id !== null && !registriraniIds.has(id)),
  )].sort();

  const jedinstveniULedgeru = new Set(ledger.rows.map((r) => r.profileId).filter((id) => id !== null));

  return {
    schemaVersion: 1,
    nazivnici: {
      registriranihProfila: registriraniIds.size,
      ledgerRedaka: ledger.rows.length,
      ledgerJedinstvenihProfila: jedinstveniULedgeru.size,
      objasnjenje:
        'Redaka je vise od profila jer profil s vise vrsta rada nosi po redak za svaku. '
        + 'Jedinstvenih profila u ledgeru je vise nego u registru jer ledger biljezi i retke koji '
        + 'nisu registrirani profili; oni su izdvojeni u `anomalije`.',
    },
    anomalije: {
      rutaBezProfila,
      profilBezJedinice,
      uLedgeruNeURegistru,
    },
  };
}

function commit() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const status = izracunajStatus();
  const artefakt = {
    ...status,
    generatedAt: new Date().toISOString(),
    generatedFromCommit: commit(),
    generator: 'npm run status',
  };
  fs.mkdirSync(path.dirname(IZLAZ), { recursive: true });
  fs.writeFileSync(IZLAZ, `${JSON.stringify(artefakt, null, 2)}\n`);
  const a = status.anomalije;
  console.log(`[status] ${IZLAZ}`);
  console.log(`  registriranih profila: ${status.nazivnici.registriranihProfila}`);
  console.log(`  ledger: ${status.nazivnici.ledgerRedaka} redaka, ${status.nazivnici.ledgerJedinstvenihProfila} jedinstvenih profila`);
  console.log(`  ruta bez profila: ${a.rutaBezProfila.length} | profila bez jedinice: ${a.profilBezJedinice.length}`);
}

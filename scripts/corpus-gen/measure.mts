/**
 * MJERENJE SINTETICKOG KORPUSA: citljiv ispis nad PUNIM generiranim skupom.
 *
 *   npx vite-node scripts/corpus-gen/measure.mts -- [--dir <docx dir>]
 *
 * Odnos prema mrezi: `repair-net.mts` radi nad COMMITANIM podskupom, pece artefakt i cuva ratchet;
 * ovaj alat radi nad punim skupom izvan repozitorija i sluzi citanju, ne gardu. Oba dijele JEDNU
 * jezgru (`net-core.mts`), jer bi inace mjerila "isto" na dva nacina, sto je razred kvara koji je
 * repozitorij vec platio: real-corpus harness je popravke sastavljao na svoj nacin i zato mjerio uzu
 * povrsinu od one koju korisnik dobije.
 *
 * NE dira ljestvicu dokaza: dokumenti su `synthetic: true` i traka `authored`, pa ih `sidecarAdmitted`
 * odbija; ovaj artefakt je zaseban i nijedan potrosac tvrdnji ga ne cita.
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installXmlDomParser } from '../../src/docx/xml-dom-install';
import { ensureRepairMapHeavy } from '../../src/profiles/profile-runtime-maps';
import { enumerateRows } from './rows.mts';
import { measureDocument, aggregateByFixer, type DocumentMeasurement } from './net-core.mts';

installXmlDomParser();

const ROOT = resolve(join(dirname(fileURLToPath(import.meta.url)), '..', '..'));
const KORPUS = process.env.LEKTA_SYNTHETIC_CORPUS || join('C:', 'Users', 'PC', 'Desktop', 'Lekta-korpus', '04-sintetski');

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const dirIdx = argv.indexOf('--dir');
  const dir = dirIdx >= 0 ? resolve(ROOT, argv[dirIdx + 1]) : join(KORPUS, 'docx');

  await ensureRepairMapHeavy();
  const rows = new Map(enumerateRows().map((r) => [r.id, r]));

  let files: string[] = [];
  try {
    files = readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.docx')).sort();
  } catch {
    console.error(`Nema direktorija: ${dir}`);
    process.exit(2);
  }
  // Prazan skup NIJE tihi prolaz: mjerenje bez ijednog dokumenta ne znaci nista.
  if (!files.length) {
    console.error(`Nijedan .docx u ${dir}; mjerenje bi bilo vakuumsko.`);
    process.exit(2);
  }

  const nalazi: Array<DocumentMeasurement & { rowId: string; varijanta: string }> = [];
  for (const f of files) {
    const m = /^(.*)--(uskladjen|neuredan)\.docx$/i.exec(f);
    if (!m) continue;
    const row = rows.get(m[1]);
    const mjerenje = await measureDocument(join(dir, f), row?.routedProfileId ?? null);
    nalazi.push({ ...mjerenje, rowId: m[1], varijanta: m[2] });
  }

  console.log(`dokumenata: ${nalazi.length}\n`);
  for (const n of nalazi) {
    console.log(`=== ${n.dokument} (profil: ${n.profileId ?? 'baseline'}) ===`);
    console.log(`  palo prije popravka (${n.paloPrije.length}): ${n.paloPrije.join(', ') || '-'}`);
    console.log(`  zatrazeno fixera: ${n.zatrazeno.length} | promijenilo: ${n.promijenili.length}`);
    console.log(`  RIJESENO (${n.rijeseno.length}): ${n.rijeseno.join(', ') || '-'}`);
    console.log(`  NERIJESENO (${n.nerijeseno.length}): ${n.nerijeseno.join(', ') || '-'}`);
    console.log(`  regresije: ${n.regresije.length} | integritet: ${n.integrityFailure ?? 'ok'}`);
  }

  console.log('\n=== fixeri: zatrazen / promijenio / razlog ===');
  for (const r of aggregateByFixer(nalazi)) {
    const oznaka = r.changed === 0 ? '  MRTAV' : '       ';
    const razlozi = Object.entries(r.reasons)
      .map(([k, v]) => `${k}x${v}`)
      .join(' ');
    console.log(`${oznaka} ${r.fixerId.padEnd(38)} ${r.requested} / ${r.changed}  ${razlozi}`);
  }

  const out = join(KORPUS, 'mjerenje.json');
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(
    out,
    JSON.stringify({ schemaVersion: 1, nalazi, poFixeru: aggregateByFixer(nalazi) }, null, 2) + '\n',
  );
  console.log(`\nzapisano: ${out}`);
}

await main();

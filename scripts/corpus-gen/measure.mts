/**
 * MJERENJE SINTETICKOG KORPUSA: sto motor vidi, sto popravak rijesi, a sto ostane.
 *
 *   npx vite-node scripts/corpus-gen/measure.mts -- [--dir <docx dir>]
 *
 * Odgovara na pitanje zbog kojeg korpus postoji: KOJE provjere padaju i KOJI ih fixer doista rijesi.
 * Rezultat je imenovan, ne prebrojan, jer se broj zna zadrzati dok se sastav promijeni.
 *
 * NE dira ljestvicu dokaza. Dokumenti su `track: 'authored'` i `synthetic: true`, pa ih
 * `sidecarAdmitted` odbija; ovaj artefakt je zaseban i nijedan potrosac tvrdnji ga ne cita.
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installXmlDomParser } from '../../src/docx/xml-dom-install';
import { analyzeFixture, resolveProfile } from '../../src/analysis/golden-entry';
import { ensureRepairMapHeavy, repairEntriesFor } from '../../src/profiles/profile-runtime-maps';
import { buildAllRepairableItems } from '../../src/ui/repair-item-assembly';
import { buildDefaultRepairRequests } from '../../src/repair/default-selection';
import { applyFixers } from '../../src/repair/apply-fixers';
import { detectPassRegressions } from '../../src/analysis/repair-regression';
import { enumerateRows, composedRulesFor } from './rows.mts';

installXmlDomParser();

const ROOT = resolve(join(dirname(fileURLToPath(import.meta.url)), '..', '..'));
const KORPUS = process.env.LEKTA_SYNTHETIC_CORPUS || join('C:', 'Users', 'PC', 'Desktop', 'Lekta-korpus', '04-sintetski');
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

interface Nalaz {
  dokument: string;
  rowId: string;
  varijanta: string;
  profileId: string | null;
  /** Provjere koje su pale PRIJE popravka, imenovane po stabilnom id-u. */
  paloPrije: string[];
  /** Zatrazeni fixeri. */
  zatrazeno: string[];
  /** Fixeri koji su nesto stvarno promijenili (changelog). */
  promijenili: string[];
  /** Provjere koje su iz pada presle u prolaz. */
  rijeseno: string[];
  /** Provjere koje su i dalje pale nakon popravka: OVO je jaz motora. */
  nerijeseno: string[];
  regresije: string[];
  integrityFailure: string | null;
}

function paleProvjere(checks: Array<{ id?: string; status?: string; max?: number }>): string[] {
  return checks
    .filter((c) => c.id && (c.max ?? 0) > 0 && c.status !== 'pass')
    .map((c) => c.id as string)
    .sort();
}

async function mjeriDokument(path: string, rowId: string, varijanta: string, profileId: string | null): Promise<Nalaz | null> {
  const bytes = new Uint8Array(readFileSync(path));
  const naziv = path.split(/[\\/]/).pop() as string;
  const file = new File([bytes], naziv, { type: DOCX_MIME });
  const before = await analyzeFixture(file, { profileId: profileId ?? undefined });

  // ISTI sastavljac i isti ulazi koje koristi sucelje; harness je isti posao jednom radio na svoj
  // nacin i zato mjerio uzu povrsinu od one koju korisnik dobije. `entries` su nuzni, jer sedam
  // asistiranih graditelja cita `profile.ruleEntries`, kojega `resolveProfile` nema.
  const profile = profileId ? resolveProfile(profileId) : null;
  const items = buildAllRepairableItems({
    result: before,
    profile,
    entries: profileId ? repairEntriesFor(profileId) : [],
    titleTemplate: null, // naslovnica trazi UI odabir predloska, pa je izvan mjerenja
  });
  const requests = buildDefaultRepairRequests(items);
  const applied = await applyFixers(bytes, requests);

  const afterFile = new File([applied.docxBytes], `${naziv}-popravljen.docx`, { type: DOCX_MIME });
  const after = await analyzeFixture(afterFile, { profileId: profileId ?? undefined });

  const prije = paleProvjere(before.checks ?? []);
  const poslije = paleProvjere(after.checks ?? []);
  const promijenili = (applied.changelog ?? [])
    .map((c: { fixerId?: string }) => c.fixerId)
    .filter((x): x is string => Boolean(x));

  return {
    dokument: naziv,
    rowId,
    varijanta,
    profileId,
    paloPrije: prije,
    zatrazeno: [...new Set(requests.map((r) => r.fixerId))].sort(),
    promijenili: [...new Set(promijenili)].sort(),
    rijeseno: prije.filter((id) => !poslije.includes(id)),
    nerijeseno: poslije.filter((id) => prije.includes(id)),
    regresije: detectPassRegressions(before.checks ?? [], after.checks ?? []).map((r: unknown) =>
      typeof r === 'string' ? r : JSON.stringify(r),
    ),
    integrityFailure: (applied as { integrityFailure?: string | null }).integrityFailure ?? null,
  };
}

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
  if (!files.length) {
    // Prazan skup NIJE tihi prolaz: mjerenje bez ijednog dokumenta ne znaci nista.
    console.error(`Nijedan .docx u ${dir}; mjerenje bi bilo vakuumsko.`);
    process.exit(2);
  }

  const nalazi: Nalaz[] = [];
  for (const f of files) {
    const m = /^(.*)--(uskladjen|neuredan)\.docx$/i.exec(f);
    if (!m) continue;
    const row = rows.get(m[1]);
    const n = await mjeriDokument(join(dir, f), m[1], m[2], row?.routedProfileId ?? null);
    if (n) nalazi.push(n);
  }

  // Agregat po fixeru: koliko puta je zatrazen, koliko puta je NESTO promijenio.
  const poFixeru = new Map<string, { zatrazen: number; promijenio: number }>();
  for (const n of nalazi) {
    for (const f of n.zatrazeno) {
      const e = poFixeru.get(f) ?? { zatrazen: 0, promijenio: 0 };
      e.zatrazen += 1;
      if (n.promijenili.includes(f)) e.promijenio += 1;
      poFixeru.set(f, e);
    }
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

  console.log('\n=== fixeri: zatrazen / promijenio ===');
  for (const [f, e] of [...poFixeru.entries()].sort()) {
    const oznaka = e.promijenio === 0 ? '  MRTAV' : '       ';
    console.log(`${oznaka} ${f.padEnd(38)} ${e.zatrazen} / ${e.promijenio}`);
  }

  const out = join(KORPUS, 'mjerenje.json');
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify({ schemaVersion: 1, nalazi, poFixeru: Object.fromEntries(poFixeru) }, null, 2) + '\n');
  console.log(`\nzapisano: ${out}`);
}

await main();

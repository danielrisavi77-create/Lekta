/**
 * Seed predlozaka izjave o izvornosti (P6-3 u docs/PLAN_POTPUNA_POKRIVENOST.md).
 *
 *   npx vite-node scripts/seed-declarations.mts [--dry]
 *   npm run seed-declarations
 *
 * Dva izvora, dvije razine tvrdnje:
 *
 * 1. DOSLOVAN OBRAZAC iz snapshotiranog PDF-a (`scripts/extract_declarations.py`). Tekstualni sloj
 *    PDF-a cita se bez OCR-a, pa dijakritika ostaje netaknuta - a to je presudno za tekst koji
 *    student POTPISUJE. Takav zapis nosi `provenance.status: 'official'` i `wording`.
 *
 * 2. DOKAZ DA JE IZJAVA PROPISANA, bez njezina teksta. Preuzima se iz `ruleEntries` koji su vec
 *    prosli verifikaciju (status `verified` + `sourceId` + `sourcePage` + doslovan citat), i to
 *    onih koji izjavu navode kao obavezan dio rada. Takav zapis je `guidance` i NE SMIJE nositi
 *    `wording` (shema to tvrdo brani; izmisljen tekst je gori od opceg).
 *
 * SVI zapisi ostaju `status: 'draft'`. Za `official` to je bitno: PDF u dva stupca zna dati
 * izmijesan redoslijed redaka ("{Ime i prezime studenta, JMBAG)"), pa `provenance` govori ODAKLE
 * tekst dolazi, a `status` je li itko provjerio da je prepisan TOCNO. AI ne proglasava verified.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { VERIFIED_PROFILES_WITH_DRAFTS } from '../src/profiles/drafts-runtime';
import { findUnit } from '../src/catalog/catalog-loader';
import type { DeclarationTemplate } from '../src/declarations/declaration-schema';
import type { RuleEntry } from '../src/profiles/profile-schema';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(root, 'data', 'declarations', 'declarations.json');
const dry = process.argv.includes('--dry');

/** Usporedba teksta bez razmaka: dva izvatka istog obrasca nisu dva razlicita obrasca. */
const squash = (text: string): string => text.replace(/\s+/g, ' ').trim();

// --- 1. Doslovni obrasci iz snapshota -------------------------------------------------------

interface ExtractedForm {
  file: string;
  unitId: string;
  page: number;
  wording: string;
  accepted: boolean;
}

const CANDIDATES = join(root, 'data', 'declarations', 'extracted-candidates.json');
const extracted: ExtractedForm[] = existsSync(CANDIDATES)
  ? (JSON.parse(readFileSync(CANDIDATES, 'utf8')) as ExtractedForm[]).filter((c) => c.accepted)
  : [];

const sourceRegistry = JSON.parse(
  readFileSync(join(root, 'data', 'sources', 'source-registry.json'), 'utf8'),
) as Array<{ id: string; snapshotPath?: string | null }>;
const BACKSLASH = String.fromCharCode(92);
const sourceIdByPath = new Map(
  sourceRegistry
    .filter((s) => s.snapshotPath)
    .map((s) => [String(s.snapshotPath).split(BACKSLASH).join('/'), s.id]),
);

const formsByUnit = new Map<string, ExtractedForm[]>();
const notInRegistry: string[] = [];
for (const form of extracted) {
  if (!findUnit(form.unitId)) continue;
  if (!sourceIdByPath.has(form.file)) {
    // Snapshot postoji na disku, ali nije u registru izvora - ne moze se citirati, pa se ne koristi.
    notInRegistry.push(form.file);
    continue;
  }
  formsByUnit.set(form.unitId, [...(formsByUnit.get(form.unitId) ?? []), form]);
}

/**
 * Razina je `null` (vrijedi za sve vrste rada te jedinice). Kad jedinica ima VISE RAZLICITIH
 * obrazaca, razina se ne pogadja nego se jedinica preskace: kriva sluzbena formulacija za krivu
 * razinu gora je od opceg teksta (isto nacelo zbog kojeg loader nema cross-level reuse).
 */
const officialForms = new Map<string, ExtractedForm>();
const ambiguousUnits: string[] = [];
for (const [unitId, list] of formsByUnit) {
  if (new Set(list.map((f) => squash(f.wording))).size > 1) {
    ambiguousUnits.push(unitId);
    continue;
  }
  officialForms.set(unitId, list[0]);
}

const officialTemplates: DeclarationTemplate[] = [...officialForms.entries()].map(([unitId, form]) => ({
  id: `${unitId}-official`,
  unitId,
  level: null,
  provenance: {
    status: 'official' as const,
    sourceIds: [sourceIdByPath.get(form.file) as string],
    sourcePage: form.page,
    sourceNote: `doslovno iz snapshota, str. ${form.page}`,
    verifiedAt: null,
  },
  status: 'draft' as const,
  wording: squash(form.wording),
  notes:
    'Tekst je doslovno izvucen iz sluzbenog snapshota (tekstualni sloj PDF-a, bez OCR-a). ' +
    'Redoslijed redaka u viseslupcanom PDF-u zna biti izmijesan, pa prijepis treba potvrditi ' +
    'prije nego se zapis proglasi verificiranim.',
}));

const unitsWithForm = new Set(officialTemplates.map((t) => t.unitId));

// --- 2. Dokaz da je izjava propisana, bez teksta ---------------------------------------------

function declarationEvidence(entry: RuleEntry): boolean {
  if (entry.status !== 'verified' || !entry.sourceId || !entry.sourcePage || !entry.quote) return false;
  if (entry.checkId === 'required-section-rules') {
    const order = (entry.value as { order?: string[] } | undefined)?.order;
    return Array.isArray(order) && order.includes('originality-statement');
  }
  if (entry.checkId === 'required-sections') {
    const list = entry.value as unknown;
    return Array.isArray(list) && list.some((item) => /izjav/i.test(String(item)));
  }
  return false;
}

interface EvidenceCandidate {
  unitId: string;
  level: string;
  entry: RuleEntry;
  profileId: string;
}

const evidence: EvidenceCandidate[] = [];
for (const profile of VERIFIED_PROFILES_WITH_DRAFTS as unknown as Array<{
  id: string;
  unitId?: string;
  workTypes?: string[];
  ruleEntries?: RuleEntry[];
}>) {
  if (!profile.unitId || !findUnit(profile.unitId)) continue;
  if (unitsWithForm.has(profile.unitId)) continue; // jedinica vec ima doslovan obrazac
  const entry = (profile.ruleEntries ?? []).find(declarationEvidence);
  if (!entry) continue;
  for (const level of profile.workTypes ?? []) {
    evidence.push({ unitId: profile.unitId, level, entry, profileId: profile.id });
  }
}

// Jedinstven selektor (unitId, level); prvi po abecedi profila radi determinizma.
const bySelector = new Map<string, EvidenceCandidate>();
for (const candidate of evidence.sort((a, b) => a.profileId.localeCompare(b.profileId))) {
  const key = `${candidate.unitId}::${candidate.level}`;
  if (!bySelector.has(key)) bySelector.set(key, candidate);
}

const guidanceTemplates: DeclarationTemplate[] = [...bySelector.values()].map(
  ({ unitId, level, entry, profileId }) => ({
    id: `${unitId}-${level}`,
    unitId,
    level: level as DeclarationTemplate['level'],
    provenance: {
      status: 'guidance' as const,
      sourceIds: [entry.sourceId as string],
      // Shema trazi POZITIVAN broj ili null; nasi lokatori su tekstualni ("odjeljak 3.1."),
      // pa idu u `sourceNote`, a `sourcePage` ostaje null.
      sourcePage: null,
      sourceNote: `${entry.sourcePage}`,
      quote: entry.quote ?? null,
      verifiedAt: entry.lastVerified ?? null,
      note: `Izvedeno iz verificiranog pravila o strukturi rada (${profileId}, ${entry.checkId}).`,
    },
    status: 'draft' as const,
    notes:
      'Fakultet propisuje izjavu, ali doslovan obrazac jos nije prikupljen. Provjeri sluzbeni ' +
      'obrazac prije predaje; generator nudi opcu formulaciju.',
  }),
);

// --- izlaz -----------------------------------------------------------------------------------

const all = [...officialTemplates, ...guidanceTemplates].sort((a, b) => a.id.localeCompare(b.id));
if (!dry) writeFileSync(OUT, JSON.stringify(all, null, 2) + '\n');

console.log('=== Seed izjava o izvornosti ===');
console.log(`zapisa: ${all.length} (jedinica: ${new Set(all.map((t) => t.unitId)).size})${dry ? ' (dry)' : ''}`);
console.log(`  official (doslovan obrazac iz snapshota): ${officialTemplates.length}`);
console.log(`  guidance (znamo da je propisana, tekst nemamo): ${guidanceTemplates.length}`);
if (ambiguousUnits.length) {
  console.log('');
  console.log(
    `Preskoceno - jedinica ima VISE razlicitih obrazaca, razina se ne pogadja (${ambiguousUnits.length}): ${ambiguousUnits.join(', ')}`,
  );
}
if (notInRegistry.length) {
  console.log('');
  console.log(`Snapshot postoji, ali nije u registru izvora pa se ne moze citirati (${notInRegistry.length}):`);
  for (const file of notInRegistry) console.log(`  ${file}`);
}
console.log('');
console.log('Svi zapisi su `status: draft`. AI ne proglasava verified: prijepis iz viseslupcanog');
console.log('PDF-a treba ljudsku potvrdu prije nego zapis postane mjerodavan.');

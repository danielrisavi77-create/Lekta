/**
 * Seed predlozaka izjave o izvornosti iz VEC VERIFICIRANOG dokaza (P6-3 u
 * docs/PLAN_POTPUNA_POKRIVENOST.md).
 *
 *   npx vite-node scripts/seed-declarations.mts [--dry]
 *   npm run seed-declarations
 *
 * GRANICA KOJU OVAJ SEED NE PRELAZI: shema dopusta `wording` (doslovnu sluzbenu formulaciju) SAMO
 * uz `provenance.status === 'official'`. Doslovnu formulaciju nemamo - u repozitoriju je 255 PDF
 * snapshota, ali samo 15 OCR tekstova, a OCR gubi dijakritiku, pa bi "sluzbeni" tekst izvucen iz
 * njega bio netocan tamo gdje je najvazniji. Zato ovaj seed pise ISKLJUCIVO `guidance` zapise:
 * "fakultet izjavu propisuje, evo izvora i lokatora, provjeri obrazac prije predaje".
 *
 * Dokaz se NE prikuplja iznova nego preuzima iz `ruleEntries` koji su vec prosli verifikaciju:
 * uzimaju se samo zapisi sa `status: verified`, `sourceId`, `sourcePage` i DOSLOVNIM citatom, i to
 * oni koji izjavu navode kao obavezan dio rada. Time zapis o izjavi nasljeduje istu razinu dokaza
 * koju vec ima pravilo o strukturi rada.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { VERIFIED_PROFILES_WITH_DRAFTS } from '../src/profiles/drafts-runtime';
import { findUnit } from '../src/catalog/catalog-loader';
import type { DeclarationTemplate } from '../src/declarations/declaration-schema';
import type { RuleEntry } from '../src/profiles/profile-schema';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(root, 'data', 'declarations', 'declarations.json');
const dry = process.argv.includes('--dry');

/** Zapis dokazuje obavezu izjave ako je verificiran, sljediv i doslovno citiran. */
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

interface Candidate {
  unitId: string;
  level: string;
  entry: RuleEntry;
  profileId: string;
}

const candidates: Candidate[] = [];
for (const profile of VERIFIED_PROFILES_WITH_DRAFTS as unknown as Array<{
  id: string;
  unitId?: string;
  workTypes?: string[];
  ruleEntries?: RuleEntry[];
}>) {
  if (!profile.unitId || !findUnit(profile.unitId)) continue;
  const entry = (profile.ruleEntries ?? []).find(declarationEvidence);
  if (!entry) continue;
  for (const level of profile.workTypes ?? []) {
    candidates.push({ unitId: profile.unitId, level, entry, profileId: profile.id });
  }
}

// Jedinstven selektor (unitId, level): vise profila iste jedinice i razine dijeli isti obrazac, pa
// se uzima prvi po abecedi profila radi determinizma.
const bySelector = new Map<string, Candidate>();
for (const candidate of candidates.sort((a, b) => a.profileId.localeCompare(b.profileId))) {
  const key = `${candidate.unitId}::${candidate.level}`;
  if (!bySelector.has(key)) bySelector.set(key, candidate);
}

const templates: DeclarationTemplate[] = [...bySelector.values()]
  .map(({ unitId, level, entry, profileId }) => ({
    id: `${unitId}-${level}`,
    unitId,
    level: level as DeclarationTemplate['level'],
    provenance: {
      status: 'guidance' as const,
      sourceIds: [entry.sourceId as string],
      // Shema trazi da `sourcePage` bude POZITIVAN broj ili null; nasi lokatori su tekstualni
      // ("odjeljak 3.1. Struktura rada"), pa idu u `sourceNote`, a `sourcePage` ostaje null.
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
  }))
  .sort((a, b) => a.id.localeCompare(b.id));

if (!dry) writeFileSync(OUT, JSON.stringify(templates, null, 2) + '\n');

const byUnit = new Set(templates.map((t) => t.unitId));
console.log('=== Seed izjava o izvornosti ===');
console.log(`zapisa: ${templates.length} (jedinica: ${byUnit.size})${dry ? ' (dry)' : ''}`);
console.log(`svi su 'guidance': doslovan obrazac nije prikupljen, pa se tekst NE izmislja.`);
console.log(`po razini: ${[...new Set(templates.map((t) => t.level))].sort().join(', ')}`);
console.log('');
console.log('Sljedeci korak (ljudski): prikupiti doslovan obrazac i podici zapis na `official`.');

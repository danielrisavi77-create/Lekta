import type { ThesisProfile, RuleEntry, SourceEntry } from '../profiles/profile-schema';
import { computePublishedRules } from './published-rules';
import type { AiEvidenceAuditResult } from './ai-evidence-audit';

/**
 * Verifikacijski worklist za dokazni AI-audit preko cijelog registra (P0-1 u
 * docs/PLAN_POTPUNA_POKRIVENOST.md).
 *
 * Svako pravilo dobiva tocno jedan status i radnju. Stari batch unosi nisu dokaz; prihvaceni
 * AI dokaz mora proci deterministicki validator. Ljudski audit nije skriveni blocker.
 *
 * Zasto je ovo TS modul, a ne vise skripta: commitani izlaz je bio USTAJAO (tvrdio je 2150
 * bodovanih i 26 pravila za audit, a ziva regeneracija daje 2208 i 38 kroz 8 profila). Ranija
 * skripta je bila .mjs s vlastitom kopijom merge semantike, s CRLF zavrsecima koje vitest ne
 * moze uvesti, pa se izlaz nije mogao staviti pod drift gard. Sada logika zivi ovdje, cita
 * ISTE profile i ISTI bodovni uvjet kao coverage matrica (`computePublishedRules`), a
 * tests/verification-worklist.test.ts pada cim se commitani markdown razidje sa svjezim.
 *
 * Semantika brojeva je namjerno drugacija od coverage matrice i to je tocno:
 *   - coverage `scored` broji SAMO strojno provjerljiva pravila (nazivnik omjera),
 *   - ovdje `scored` broji SVA bodovana pravila, jer svako treba valjan dokazni status.
 * Razlika (danas 73: citation-style, required-sections, reference-count) nije nepomirena, nego
 * dvije populacije; vidi `scoredNonMachineCheckable` u coverage-report.ts.
 */

/** Oznaka masovnog odobrenja; takvo pravilo boduje, ali ga covjek jos nije pojedinacno vidio. */
export const BULK_APPROVAL = 'owner-bulk-approval';

export interface WorklistRow {
  profileId: string;
  /** Bodovana pravila iz legacy masovnog odobrenja. */
  bulk: number;
  /** Bodovana pravila iz legacy pojedinacne potvrde. */
  human: number;
  /** Sva bodovana pravila (bulk + human + eventualno bez verifiedBy). */
  scored: number;
  /** Pravila oborena u ponovnu provjeru (ne boduju se dok se ne isprave). */
  recheck: number;
  /** Pravila koja worklist još ne smatra dokazno riješenima. */
  pendingEvidence: number;
}

export interface WorklistTotals {
  profilesWithScored: number;
  scoredTotal: number;
  human: number;
  bulk: number;
  recheck: number;
  dossiersWritten: number;
  ruleCount: number;
  aiEvidenceVerified: number;
  needsAiEvidence: number;
  humanVerified: number;
  notScored: number;
}

export type RuleWorklistStatus =
  | 'not-scored'
  | 'human-verified'
  | 'ai-evidence-verified'
  | 'needs-ai-evidence'
  | 'needs-recheck';

export interface RuleWorklistRow {
  profileId: string;
  ruleId: string;
  sourceId: string | null;
  status: RuleWorklistStatus;
  reasonCodes: string[];
  action: 'none' | 'run-ai-evidence-audit';
}

export interface WorklistOptions {
  /** Rezultati iz validatora, vezani uz profil i pravilo nakon razrješenja snapshota/manifesta. */
  aiEvidenceResults?: Readonly<Record<string, AiEvidenceAuditResult>>;
}

export function ruleEvidenceKey(profileId: string, ruleId: string): string {
  return JSON.stringify([profileId, ruleId]);
}

export interface WorklistReport {
  /** Svi profili sa staging pravilima, sortirani po profileId. */
  rows: WorklistRow[];
  /** Svako registrirano pravilo dobiva točno jedan dokazni status i sljedeću radnju. */
  ruleItems: RuleWorklistRow[];
  totals: WorklistTotals;
  /**
   * profileId-jevi koji imaju draft datoteku ali NISU u registru profila. Danas prazno; da
   * postanu ne-prazni, pravila bi se tiho vodila mimo svakog registra i izvjestaja.
   */
  orphanDraftProfileIds: string[];
  /** Relativna putanja u repozitoriju -> tocan sadrzaj datoteke koju CLI zapisuje. */
  files: Record<string, string>;
}

const DOSSIER_DIR = 'data/verification/dossiers';

function snapshotPathFor(entry: RuleEntry, sourceById: Map<string, SourceEntry>): string {
  const src = entry.sourceId == null ? undefined : sourceById.get(entry.sourceId);
  return src?.snapshotPath ?? '(nema)';
}

function renderDossier(
  profileId: string,
  items: RuleWorklistRow[],
  entriesByRuleId: Map<string, RuleEntry>,
  sourceById: Map<string, SourceEntry>,
): string {
  const out: string[] = [];
  out.push(`# AI-evidence worklist: ${profileId}`);
  out.push('');
  out.push('Nema ljudskog reda odobravanja. Pravilo izlazi iz worklista tek uz valjan deterministicki dokazni paket.');
  out.push('');
  out.push(`Pravila za rad: ${items.length}.`);
  out.push('');
  for (const item of items) {
    const entry = entriesByRuleId.get(item.ruleId);
    out.push(`## ${entry?.label ?? item.ruleId}`);
    out.push(`- Pravilo: \`${item.ruleId}\``);
    out.push(`- Status: \`${item.status}\``);
    out.push(`- Razlozi: ${item.reasonCodes.length ? item.reasonCodes.map((code) => `\`${code}\``).join(', ') : '(nema)'}`);
    out.push(`- Radnja: \`${item.action}\``);
    out.push(`- Izvor: ${item.sourceId ?? '(nema)'}`);
    if (entry) {
      out.push(`- Autoritet: ${entry.authority ?? '(nije postavljen)'}`);
      out.push(`- Lokator: ${entry.sourcePage ?? '(nema)'}`);
      out.push(`- Snapshot: \`${snapshotPathFor(entry, sourceById)}\``);
      out.push(`- Vrijednost: \`${JSON.stringify(entry.value)}\``);
      out.push(`- Citat: ${entry.quote ? `"${entry.quote}"` : '(nema)'}`);
    }
    out.push('');
  }
  return out.join('\n') + '\n';
}

function renderIndex(items: RuleWorklistRow[], totals: WorklistTotals, orphans: string[]): string {
  const idx: string[] = [];
  idx.push('# Worklist dokaznog AI-audita');
  idx.push('');
  idx.push('Svako profilno pravilo ima jedan dokazni status. Nema ljudskog reda odobravanja; legacy batch oznake nisu dokaz.');
  idx.push('');
  idx.push(`Pravila ukupno: ${totals.ruleCount}; AI dokaz prihvaćen: ${totals.aiEvidenceVerified}; čekaju dokaz: ${totals.needsAiEvidence}; legacy ljudski dokaz: ${totals.humanVerified}; nebodovana/advisory: ${totals.notScored}.`);
  idx.push('');
  if (orphans.length) {
    // Tripwire: draft bez profila u registru znaci da se pravila vode mimo svakog izvjestaja.
    idx.push(`> Draft bez profila u registru (${orphans.length}): ${orphans.join(', ')}`);
    idx.push('');
  }
  const byProfile = new Map<string, number>();
  for (const item of items) {
    if (item.action !== 'none') byProfile.set(item.profileId, (byProfile.get(item.profileId) ?? 0) + 1);
  }
  idx.push('| Profil | Pravila koja traže dokaz | Dosje |');
  idx.push('|---|---:|---|');
  for (const [profileId, count] of [...byProfile].sort(([a], [b]) => a.localeCompare(b))) {
    idx.push(`| ${profileId} | ${count} | [${profileId}.md](${profileId}.md) |`);
  }
  idx.push('');
  return idx.join('\n') + '\n';
}

/**
 * Racuna worklist i tocan sadrzaj svake datoteke koju CLI zapisuje.
 *
 * `profiles` su profili sa staging pravilima (VERIFIED_PROFILES_WITH_DRAFTS + LEGAL_...);
 * profil bez ijednog ruleEntryja se preskace, isto kao u coverage matrici.
 */
export function computeWorklist(
  profiles: ThesisProfile[],
  sources: SourceEntry[],
  orphanDraftProfileIds: string[] = [],
  options: WorklistOptions = {},
): WorklistReport {
  const sourceById = new Map(sources.map((s) => [s.id, s]));
  const withEntries = profiles
    .filter((p) => (p.ruleEntries ?? []).length > 0)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const rows: WorklistRow[] = [];
  const ruleItems: RuleWorklistRow[] = [];
  const files: Record<string, string> = {};

  for (const profile of withEntries) {
    const { scored } = computePublishedRules(profile, sources);
    const bulk = scored.filter((e) => e.verifiedBy === BULK_APPROVAL);
    const human = scored.filter((e) => e.verifiedBy && e.verifiedBy !== BULK_APPROVAL);
    const recheck = (profile.ruleEntries ?? []).filter((e) => e.status === 'needs-recheck');
    let pendingEvidence = 0;
    for (const entry of profile.ruleEntries ?? []) {
      const key = ruleEvidenceKey(profile.id, entry.ruleId);
      const audit = options.aiEvidenceResults?.[key];
      let item: RuleWorklistRow;
      if (entry.status === 'advisory' || entry.status === 'retired') {
        item = { profileId: profile.id, ruleId: entry.ruleId, sourceId: entry.sourceId ?? null, status: 'not-scored', reasonCodes: [], action: 'none' };
      } else if (entry.status === 'needs-recheck') {
        item = { profileId: profile.id, ruleId: entry.ruleId, sourceId: entry.sourceId ?? null, status: 'needs-recheck', reasonCodes: ['source-or-evidence-recheck'], action: 'run-ai-evidence-audit' };
      } else if (entry.confirmedVia === 'ai-evidence-audit') {
        const provenanceRecheck = entry.aiEvidence?.schemaVersion === 1
          && entry.aiEvidence.model?.provider === 'OpenAI'
          && entry.aiEvidence.model.model === 'GPT-5'
          && entry.aiEvidence.model.version === 'runtime-version-not-exposed';
        if (provenanceRecheck) {
          item = { profileId: profile.id, ruleId: entry.ruleId, sourceId: entry.sourceId ?? null,
            status: 'needs-ai-evidence', reasonCodes: ['provider-provenance-recheck'], action: 'run-ai-evidence-audit' };
        } else if (entry.status === 'verified' && entry.aiEvidence && audit?.valid) {
          item = { profileId: profile.id, ruleId: entry.ruleId, sourceId: entry.sourceId ?? null, status: 'ai-evidence-verified', reasonCodes: [], action: 'none' };
        } else {
          const reasonCodes = audit && !audit.valid
            ? audit.reasons.map((reason) => reason.code)
            : ['ai-evidence-not-revalidated'];
          item = { profileId: profile.id, ruleId: entry.ruleId, sourceId: entry.sourceId ?? null, status: 'needs-ai-evidence', reasonCodes, action: 'run-ai-evidence-audit' };
        }
      } else if (entry.confirmedVia === 'ai-1pass-batch' || entry.confirmedVia === 'ai-3pass-batch') {
        item = { profileId: profile.id, ruleId: entry.ruleId, sourceId: entry.sourceId ?? null, status: 'needs-ai-evidence', reasonCodes: ['legacy-ai-batch-untrusted'], action: 'run-ai-evidence-audit' };
      } else if (entry.verifiedBy === BULK_APPROVAL) {
        item = { profileId: profile.id, ruleId: entry.ruleId, sourceId: entry.sourceId ?? null, status: 'needs-ai-evidence', reasonCodes: ['legacy-bulk-untrusted'], action: 'run-ai-evidence-audit' };
      } else if (entry.status === 'verified' && entry.confirmedVia === 'human') {
        item = { profileId: profile.id, ruleId: entry.ruleId, sourceId: entry.sourceId ?? null, status: 'needs-ai-evidence', reasonCodes: ['human-verification-not-ai-audited'], action: 'run-ai-evidence-audit' };
      } else if (entry.status === 'verified' && isRuleEligibleForWorklist(entry, scored)) {
        item = { profileId: profile.id, ruleId: entry.ruleId, sourceId: entry.sourceId ?? null, status: 'human-verified', reasonCodes: [], action: 'none' };
      } else {
        const reasonCodes = entry.sourceId == null ? ['source-missing'] : ['unverified-rule'];
        item = { profileId: profile.id, ruleId: entry.ruleId, sourceId: entry.sourceId ?? null, status: 'needs-ai-evidence', reasonCodes, action: 'run-ai-evidence-audit' };
      }
      ruleItems.push(item);
      if (item.action !== 'none') pendingEvidence += 1;
    }
    rows.push({
      profileId: profile.id,
      bulk: bulk.length,
      human: human.length,
      scored: scored.length,
      recheck: recheck.length,
      pendingEvidence,
    });
  }

  const orphans = [...orphanDraftProfileIds].sort();
  ruleItems.sort((a, b) => a.profileId.localeCompare(b.profileId) || a.ruleId.localeCompare(b.ruleId));

  for (const profile of withEntries) {
    const items = ruleItems.filter((item) => item.profileId === profile.id && item.action !== 'none');
    if (!items.length) continue;
    const entriesByRuleId = new Map((profile.ruleEntries ?? []).map((entry) => [entry.ruleId, entry]));
    files[`${DOSSIER_DIR}/${profile.id}.md`] = renderDossier(profile.id, items, entriesByRuleId, sourceById);
  }

  const totals: WorklistTotals = {
    profilesWithScored: rows.filter((r) => r.scored).length,
    scoredTotal: rows.reduce((n, r) => n + r.scored, 0),
    human: rows.reduce((n, r) => n + r.human, 0),
    bulk: rows.reduce((n, r) => n + r.bulk, 0),
    recheck: rows.reduce((n, r) => n + r.recheck, 0),
    dossiersWritten: Object.keys(files).filter((path) => path.endsWith('.md') && !path.endsWith('/INDEX.md')).length,
    ruleCount: ruleItems.length,
    aiEvidenceVerified: ruleItems.filter((item) => item.status === 'ai-evidence-verified').length,
    needsAiEvidence: ruleItems.filter((item) => item.status === 'needs-ai-evidence').length,
    humanVerified: ruleItems.filter((item) => item.status === 'human-verified').length,
    notScored: ruleItems.filter((item) => item.status === 'not-scored').length,
  };

  const statusCounts = ruleItems.reduce<Record<string, number>>((counts, item) => {
    counts[item.status] = (counts[item.status] ?? 0) + 1;
    return counts;
  }, {});
  files['data/verification/ai-evidence-worklist.json'] = `${JSON.stringify({
    schemaVersion: 1,
    ruleCount: ruleItems.length,
    statusCounts,
    rules: ruleItems,
  }, null, 2)}\n`;
  files[`${DOSSIER_DIR}/INDEX.md`] = renderIndex(ruleItems, totals, orphans);

  return { rows, ruleItems, totals, orphanDraftProfileIds: orphans, files };
}

function isRuleEligibleForWorklist(entry: RuleEntry, scored: RuleEntry[]): boolean {
  return scored.some((candidate) => candidate.ruleId === entry.ruleId);
}

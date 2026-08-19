import type { ThesisProfile, RuleEntry, SourceEntry } from '../profiles/profile-schema';
import { computePublishedRules } from './published-rules';

/**
 * Verifikacijski worklist za LJUDSKI pass preko cijelog porta (P0-1 u
 * docs/PLAN_POTPUNA_POKRIVENOST.md).
 *
 * Sto radi: za svaki profil odvaja bodovana pravila koja je covjek POJEDINACNO potvrdio od
 * onih odobrenih MASOVNO (`verifiedBy === 'owner-bulk-approval'`), pa za druge pise dosje s
 * vrijednoscu, izvorom, lokatorom, doslovnim citatom i putanjom snapshota. Covjek otvori PDF
 * na lokatoru, provjeri vrijednost protiv citata i postavi verifiedBy na svoje ime. Ovdje se
 * NISTA ne proglasava verificiranim.
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
 *   - ovdje `scored` broji SVA bodovana pravila, jer ih covjek sva mora proci.
 * Razlika (danas 73: citation-style, required-sections, reference-count) nije nepomirena, nego
 * dvije populacije; vidi `scoredNonMachineCheckable` u coverage-report.ts.
 */

/** Oznaka masovnog odobrenja; takvo pravilo boduje, ali ga covjek jos nije pojedinacno vidio. */
export const BULK_APPROVAL = 'owner-bulk-approval';

export interface WorklistRow {
  profileId: string;
  /** Bodovana pravila odobrena masovno (cekaju ljudski audit). */
  bulk: number;
  /** Bodovana pravila koja je covjek pojedinacno potvrdio. */
  human: number;
  /** Sva bodovana pravila (bulk + human + eventualno bez verifiedBy). */
  scored: number;
  /** Pravila oborena u ponovnu provjeru (ne boduju se dok se ne isprave). */
  recheck: number;
}

export interface WorklistTotals {
  profilesWithScored: number;
  scoredTotal: number;
  human: number;
  bulk: number;
  recheck: number;
  dossiersWritten: number;
}

export interface WorklistReport {
  /** Svi profili sa staging pravilima, sortirani po profileId. */
  rows: WorklistRow[];
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
  scored: RuleEntry[],
  bulk: RuleEntry[],
  human: RuleEntry[],
  recheck: RuleEntry[],
  sourceById: Map<string, SourceEntry>,
): string {
  const out: string[] = [];
  out.push(`# Verifikacijski dosje: ${profileId}`);
  out.push('');
  out.push(
    'Covjek potvrdjuje, AI ne proglasava verified. Otvori PDF snapshot na lokatoru (sourcePage), provjeri VRIJEDNOST protiv DOSLOVNOG citata, pa postavi verifiedBy=svoje ime (i po zelji reviewedBy).',
  );
  out.push('');
  out.push(
    `Scored ukupno: ${scored.length}. Vec ljudski potvrdjeno: ${human.length}. Za audit (bulk): ${bulk.length}. Needs-recheck: ${recheck.length}.`,
  );
  out.push('');

  if (bulk.length) {
    out.push(`## Za audit - masovno odobreno (${bulk.length})`);
    out.push('');
    for (const e of bulk) {
      out.push(`### ${e.checkId} - ${e.label ?? e.ruleId}`);
      out.push(`- Vrijednost: \`${JSON.stringify(e.value)}\``);
      out.push(`- Autoritet: ${e.authority}`);
      out.push(`- Izvor: ${e.sourceId} - ${e.sourcePage}`);
      out.push(`- Snapshot: \`${snapshotPathFor(e, sourceById)}\``);
      out.push(`- Citat: "${e.quote}"`);
      out.push('');
    }
  }

  if (recheck.length) {
    out.push(`## Needs-recheck (${recheck.length})`);
    out.push('');
    for (const e of recheck) {
      out.push(
        `- \`${e.checkId}\` - ${e.label ?? e.ruleId}: izvor ${e.sourceId ?? '(nema)'}${e.quote ? `, citat "${e.quote}"` : ', bez citata - treba ponovno citanje izvora'}`,
      );
    }
    out.push('');
  }

  return out.join('\n') + '\n';
}

function renderIndex(rows: WorklistRow[], totals: WorklistTotals, orphans: string[]): string {
  const idx: string[] = [];
  idx.push('# Verifikacijski worklist (ljudski pass)');
  idx.push('');
  idx.push(
    'Audit masovno odobrenih (owner-bulk-approval) scored pravila. Otvori dosje profila, provjeri svako pravilo protiv izvora na lokatoru, pa u konzoli/rucno postavi verifiedBy=svoje ime.',
  );
  idx.push('');
  idx.push(`Profila sa scored: ${totals.profilesWithScored}. Scored ukupno: ${totals.scoredTotal}.`);
  idx.push(
    `Vec ljudski potvrdjeno: ${totals.human}. Za audit (bulk): ${totals.bulk}. Needs-recheck: ${totals.recheck}. Dosjea zapisano: ${totals.dossiersWritten}.`,
  );
  idx.push('');
  if (orphans.length) {
    // Tripwire: draft bez profila u registru znaci da se pravila vode mimo svakog izvjestaja.
    idx.push(`> Draft bez profila u registru (${orphans.length}): ${orphans.join(', ')}`);
    idx.push('');
  }
  idx.push('| Profil | Za audit (bulk) | Ljudski OK | Scored | Recheck | Dosje |');
  idx.push('|---|---:|---:|---:|---:|---|');
  for (const r of rows
    .filter((r) => r.bulk || r.recheck)
    .sort((a, b) => b.bulk - a.bulk || (a.profileId < b.profileId ? -1 : 1))) {
    idx.push(
      `| ${r.profileId} | ${r.bulk} | ${r.human} | ${r.scored} | ${r.recheck} | [${r.profileId}.md](${r.profileId}.md) |`,
    );
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
): WorklistReport {
  const sourceById = new Map(sources.map((s) => [s.id, s]));
  const withEntries = profiles
    .filter((p) => (p.ruleEntries ?? []).length > 0)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const rows: WorklistRow[] = [];
  const files: Record<string, string> = {};

  for (const profile of withEntries) {
    const { scored } = computePublishedRules(profile, sources);
    const bulk = scored.filter((e) => e.verifiedBy === BULK_APPROVAL);
    const human = scored.filter((e) => e.verifiedBy && e.verifiedBy !== BULK_APPROVAL);
    const recheck = (profile.ruleEntries ?? []).filter((e) => e.status === 'needs-recheck');
    rows.push({
      profileId: profile.id,
      bulk: bulk.length,
      human: human.length,
      scored: scored.length,
      recheck: recheck.length,
    });
    if (!bulk.length && !recheck.length) continue;
    files[`${DOSSIER_DIR}/${profile.id}.md`] = renderDossier(
      profile.id,
      scored,
      bulk,
      human,
      recheck,
      sourceById,
    );
  }

  const orphans = [...orphanDraftProfileIds].sort();
  const totals: WorklistTotals = {
    profilesWithScored: rows.filter((r) => r.scored).length,
    scoredTotal: rows.reduce((n, r) => n + r.scored, 0),
    human: rows.reduce((n, r) => n + r.human, 0),
    bulk: rows.reduce((n, r) => n + r.bulk, 0),
    recheck: rows.reduce((n, r) => n + r.recheck, 0),
    dossiersWritten: Object.keys(files).length,
  };

  files[`${DOSSIER_DIR}/INDEX.md`] = renderIndex(rows, totals, orphans);

  return { rows, totals, orphanDraftProfileIds: orphans, files };
}

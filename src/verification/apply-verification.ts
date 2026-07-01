import type { RuleEntry, VerificationLedgerEntry, DraftsStagingFile } from '../profiles/profile-schema';

/**
 * Zatvaranje petlje verifikacije: primjena izvoza iz konzole natrag u staging.
 *
 * Verifikacijska konzola (src/ui/verification-console.ts) je klijentska i bez backenda
 * izvozi dvije datoteke: zakrpe pravila (`rule-patches.json`) i ledger dodatke
 * (`ledger-additions.json`). Ove ciste funkcije primjenjuju te izvoze na staging
 * (`law-drafts.json`) i append-only ledger, pa potvrdjeno pravilo stvarno postane
 * verified/scored i gate ga od tada cuva. Covjek je i dalje jedini koji je u konzoli
 * proglasio verified; ovo samo trajno upisuje njegovu odluku.
 */

export interface RulePatch {
  profileId: string;
  ruleId: string;
  entry: RuleEntry;
}

export interface ApplyResult {
  profiles: Record<string, RuleEntry[]>;
  applied: string[];
  skipped: Array<{ ruleId: string; reason: string }>;
}

function clone<T>(value: T): T {
  return (typeof structuredClone === 'function'
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value))) as T;
}

/**
 * Primijeni zakrpe pravila na staging mapu. Zamjenjuje postojeci ruleEntry po (profileId,
 * ruleId) verificiranim unosom iz konzole. Ne dira pravila kojih nema u zakrpama. Cista
 * funkcija: vraca novu mapu, ne mijenja ulaz.
 */
export function applyPatches(drafts: DraftsStagingFile, patches: RulePatch[]): ApplyResult {
  const profiles = clone(drafts.profiles ?? {});
  const applied: string[] = [];
  const skipped: Array<{ ruleId: string; reason: string }> = [];

  for (const patch of patches) {
    const list = profiles[patch.profileId];
    if (!list) {
      skipped.push({ ruleId: patch.ruleId, reason: `profil "${patch.profileId}" nije u stagingu` });
      continue;
    }
    const idx = list.findIndex((e) => e.ruleId === patch.ruleId);
    if (idx === -1) {
      skipped.push({ ruleId: patch.ruleId, reason: 'pravilo nije u profilu' });
      continue;
    }
    list[idx] = patch.entry;
    applied.push(patch.ruleId);
  }

  return { profiles, applied, skipped };
}

/**
 * Spoji ledger dodatke u postojeci append-only ledger, idempotentno po `id`. Postojeci
 * zapisi se NE mijenjaju (ledger se samo dodaje).
 */
export function mergeLedger(
  existing: VerificationLedgerEntry[],
  additions: VerificationLedgerEntry[],
): { ledger: VerificationLedgerEntry[]; added: string[] } {
  const ids = new Set(existing.map((e) => e.id));
  const ledger = [...existing];
  const added: string[] = [];
  for (const a of additions) {
    if (ids.has(a.id)) continue;
    ledger.push(a);
    ids.add(a.id);
    added.push(a.id);
  }
  return { ledger, added };
}

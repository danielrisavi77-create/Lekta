/**
 * Zastavica lokalnog popravka (WordReplica runner).
 *
 * Do 2026-09-22 je odluka zivjela kao inline izraz u module-scope konstanti Edge funkcije
 * `supabase/functions/repair-docx/index.ts`, pa se nije mogla testirati bez Dena i bez deploya.
 * Lansiranje ide BEZ lokalnog popravka (nema code-signing certifikata), a jedino sto stoji izmedju
 * korisnika i ponude runnera je bas ovaj boolean. Zato je izdvojen u cistu funkciju: semantika je
 * DOSLOVNO ista kao prije (usporedba s nizom 'true', dakle 'TRUE' ne ukljucuje nista), a sada ima
 * tablicu istine u `tests/repair-local-feature-flag.test.ts`.
 *
 * Dvije varijable, a ne jedna, namjerno: `REPAIR_LOCAL_ENABLED` ukljucuje, a `REPAIR_LOCAL_DISABLED`
 * je kill switch koji ima prednost i gasi tok bez deploya, isti obrazac kao `REPAIR_DISABLED`.
 */
export interface LocalRepairFlagEnv {
  /** Ukljucuje lokalni popravak samo uz tocnu vrijednost 'true'. */
  REPAIR_LOCAL_ENABLED?: string | undefined;
  /** Kill switch: vrijednost 'true' gasi tok cak i kad je ENABLED postavljen. */
  REPAIR_LOCAL_DISABLED?: string | undefined;
}

/** True samo kad je ENABLED tocno 'true' i DISABLED nije 'true'. Sve ostalo je false. */
export function localRepairFlagEnabled(env: LocalRepairFlagEnv): boolean {
  return env.REPAIR_LOCAL_ENABLED === 'true' && env.REPAIR_LOCAL_DISABLED !== 'true';
}

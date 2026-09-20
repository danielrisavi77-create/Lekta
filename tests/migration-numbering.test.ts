/**
 * Guard protiv AUD-17: dvije migracije s istim numerickim prefiksom.
 *
 * Supabase izvodi `version` migracije iz vodeceg broja prije prvog `_` i taj je version
 * primarni kljuc u `supabase_migrations.schema_migrations`. Dvije datoteke s istim prefiksom
 * (npr. 0008_analytics_views i 0008_checkout_consent) mapiraju se na isti version pa `db push`
 * tiho preskoci drugu, ostavljajuci njezine objekte (tablice, funkcije, RLS) nestvorenima.
 * Ovaj test rusi build cim se pojavi kolizija.
 */
import { describe, it, expect } from 'vitest';
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDir = join(root, 'supabase', 'migrations');

const files = readdirSync(migrationsDir)
  .filter((f) => f.endsWith('.sql'))
  .sort();

/**
 * Raspon verzija: Lekta od 2026-09-19 krece od 0200.
 *
 * Supabase staging (bnyemcnsphlitjradrst) dijeli tablicu
 * `supabase_migrations.schema_migrations` s Katedrom, koja je vec zauzela verzije 0104 do 0114
 * (agent_snapshot_privacy_and_cleanup ... agent_provider_execution_recovery). `db push`
 * odlucuje po VERZIJI (vodeci broj prije prvog `_`), pa bi Lektina migracija s prefiksom iz tog
 * raspona bila TIHO preskocena: datoteka postoji u repou, objekti u bazi ne. Zato je cijeli
 * raspon 0104 do 0199 rezerviran za Katedru, a nova Lekta migracija ide od 0200 navise.
 *
 * Izmjereno 2026-09-19: repo je imao 0104 do 0106, staging 0104 do 0114 (sudar na sva tri).
 */
const KATEDRA_RESERVED_FROM = 104;
const LEKTA_RANGE_FROM = 200;

/**
 * Migracije nastale PRIJE te odluke. Ratchet: ovaj popis smije samo PADATI (nikad rasti).
 * Nova migracija se ovdje ne dopisuje nego dobiva prefiks >= 0200.
 */
const INHERITED_BELOW_LEKTA_RANGE: readonly string[] = Object.freeze([
  '0001_monetization.sql',
  '0002_products_catalog.sql',
  '0003_coupons_manual_orders.sql',
  '0004_partner_accounts.sql',
  '0005_referrals.sql',
  '0006_rulebook_submissions.sql',
  '0007_guarantee_claims.sql',
  '0008_analytics_views.sql',
  '0009_log_retention.sql',
  '0010_do_obrane_sku.sql',
  '0011_faculty_requests.sql',
  '0012_deadline_subscriptions.sql',
  '0013_referral_signups.sql',
  '0014_slot_reminder_marker.sql',
  '0015_revoke_purge.sql',
  '0016_retention_slots_faculty.sql',
  '0017_thesis_pass.sql',
  '0018_integrity.sql',
  '0019_preflight.sql',
  '0020_set_product_price.sql',
  '0021_checkout_consent.sql',
  '0022_ip_rate_limits.sql',
  '0023_integrity_ip_hash.sql',
  '0024_webhook_idempotency.sql',
  '0025_ip_rate_limits_rls_fix.sql',
  '0026_repair_jobs.sql',
  '0027_repair_orphan_sweep.sql',
  '0028_lock_orphan_sweep_fn.sql',
  '0029_repair_gen_status_free.sql',
  '0030_corpus_works.sql',
  '0031_admin_users.sql',
  '0032_corpus_search.sql',
  '0033_anonymous_repair_retention.sql',
  '0034_analytics_events.sql',
  '0035_academic_suite_foundation.sql',
  '0036_academic_suite_rls_hardening.sql',
  '0037_academic_suite_api_grants.sql',
  '0038_academic_suite_least_privilege_grants.sql',
  '0039_academic_suite_permanent_account_gate.sql',
  '0040_academic_suite_performance_indexes.sql',
  '0041_completion_app_foundation.sql',
  '0042_completion_app_access_hardening.sql',
  '0043_completion_app_permanent_account_gate.sql',
  '0044_completion_ai_usage.sql',
  '0045_completion_ai_rate_reservation.sql',
  '0046_completion_ai_finalize_grant.sql',
  '0047_completion_workflow_mutations.sql',
  '0048_completion_mentor_sent_version.sql',
  '0049_completion_lekta_handoff_lifecycle.sql',
  '0050_completion_lekta_handoff_token_rotation.sql',
  '0051_completion_lekta_task_authority_guard.sql',
  '0052_completion_authenticated_lekta_workflow.sql',
  '0053_katedra_academic_documents.sql',
  '0054_faculty_requests_waitlist.sql',
  '0055_faculty_requests_retention_cron.sql',
  '0056_harden_purge_faculty_request_ip_search_path.sql',
  '0057_revoke_anon_execute_unsubscribe_deadline.sql',
  '0058_sihta_0001_init.sql',
  '0059_secure_reminder_cron.sql',
  '0060_revoke_purge_rpc_roles.sql',
  '0061_academic_source_classification.sql',
  '0062_analytics_conversion_stat.sql',
  '0063_deadline_reminder_tiers.sql',
  '0064_admin_dashboard_indexes.sql',
  '0065_admin_dashboard_stats.sql',
  '0066_security_advisor_hardening.sql',
  '0067_agentic_run_contract.sql',
  '0068_katedra_billing_v2.sql',
  '0069_attach_agent_payloads.sql',
  '0070_attach_agent_payloads_reuse_terminal.sql',
  '0071_katedra_pass_products.sql',
  '0072_harden_katedra_agent_scope.sql',
  '0073_harden_katedra_agent_resume_scope.sql',
  '0074_atomic_project_lock_idempotency.sql',
  '0075_agent_run_initialization_readiness.sql',
  '0076_stale_agent_run_recovery.sql',
  '0077_agent_payload_tombstone.sql',
  '0078_harden_agent_run_lifecycle.sql',
  '0079_fix_billing_daily_ceiling.sql',
  '0080_list_active_agent_payloads.sql',
  '0081_harden_create_and_register_scope.sql',
  '0082_replace_agent_payloads_for_run.sql',
  '0083_billing_pending_marker.sql',
  '0084_revoke_legacy_agent_payload_attach.sql',
  '0085_guard_locked_project_mutations.sql',
  '0086_academic_audit_insert_grants.sql',
  '0087_academic_audit_insert_policies.sql',
  '0088_academic_demo_usage.sql',
  '0089_academic_demo_usage_hardening.sql',
  '0090_academic_project_commercial_stages.sql',
  '0091_consent_server_time.sql',
  '0092_webhook_events_inbox.sql',
  '0093_security_advisor_2026_08.sql',
  '0094_repair_global_concurrency.sql',
  '0095_extensions_out_of_public.sql',
  '0096_two_rate_slots.sql',
  '0097_guarantee_evidence.sql',
  '0098_repair_deletion_state.sql',
  '0099_purge_anonymous_users.sql',
  '0100_bonus_outbox.sql',
  '0101_client_errors.sql',
  '0102_corpus_contributions.sql',
  '0103_health_ping.sql',
]);

/** Prikovano 2026-09-19. Ovaj broj smije samo padati; podizanje znaci nov sudar s Katedrom. */
const INHERITED_RATCHET_MAX = 103;

/** Cista funkcija nad POPISOM imena, da se gard moze mutirati bez diranja repozitorija. */
export function migrationRangeViolations(names: readonly string[]): string[] {
  const inherited = new Set(INHERITED_BELOW_LEKTA_RANGE);
  const violations: string[] = [];
  for (const name of names) {
    if (!name.endsWith('.sql')) continue;
    const match = /^(\d{4})_/.exec(name);
    if (!match) continue;
    const prefix = Number(match[1]);
    if (prefix >= LEKTA_RANGE_FROM) continue;
    if (inherited.has(name)) continue;
    violations.push(
      prefix >= KATEDRA_RESERVED_FROM
        ? `${name}: prefiks ${match[1]} je rezerviran za Katedru (0104 do 0199 na dijeljenom stagingu), nova Lekta migracija ide od 0200`
        : `${name}: prefiks ${match[1]} nije na popisu naslijedjenih, nova Lekta migracija ide od 0200`,
    );
  }
  return violations;
}

describe('supabase migracije: numeriranje', () => {
  it('svaka .sql migracija ima cetveroznamenkasti <prefiks>_<naziv> oblik', () => {
    for (const f of files) {
      expect(f, `nevaljano ime migracije: ${f}`).toMatch(/^\d{4}_[a-z0-9_]+\.sql$/);
    }
  });

  it('nijedan numericki prefiks se ne ponavlja (Supabase version je PK)', () => {
    const seen = new Map<string, string>();
    const collisions: string[] = [];
    for (const f of files) {
      const prefix = f.slice(0, 4);
      const prev = seen.get(prefix);
      if (prev) collisions.push(`${prefix}: ${prev} + ${f}`);
      else seen.set(prefix, f);
    }
    expect(collisions, `kolizija numeracije migracija:\n${collisions.join('\n')}`).toEqual([]);
  });

  it('nova Lekta migracija ima prefiks >= 0200; prefiksi 0104 do 0199 su rezervirani za Katedru', () => {
    // BASELINE: nemutiran repozitorij je cist.
    const violations = migrationRangeViolations(files);
    expect(violations, violations.join(', ')).toEqual([]);
  });

  it('gard grize: privremena 0150_x.sql pada, 0203_x.sql prolazi', () => {
    const scratch = mkdtempSync(join(tmpdir(), 'lekta-migration-range-'));
    try {
      // MUTACIJA: prefiks iz Katedrinog rezerviranog raspona.
      writeFileSync(join(scratch, '0150_x.sql'), '-- mutacija');
      const mutated = [...files, ...readdirSync(scratch).filter((f) => f.endsWith('.sql'))].sort();
      const caught = migrationRangeViolations(mutated);
      expect(caught).toHaveLength(1);
      expect(caught[0]).toContain('0150_x.sql');
      expect(caught[0]).toContain('rezerviran za Katedru');

      // KONTROLA: isti oblik imena, ali u Lektinom rasponu, mora proci.
      rmSync(join(scratch, '0150_x.sql'));
      writeFileSync(join(scratch, '0203_x.sql'), '-- kontrola');
      const control = [...files, ...readdirSync(scratch).filter((f) => f.endsWith('.sql'))].sort();
      expect(migrationRangeViolations(control)).toEqual([]);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });

  it('ratchet: popis naslijedjenih prefiksa smije samo padati', () => {
    expect(INHERITED_BELOW_LEKTA_RANGE.length).toBeLessThanOrEqual(INHERITED_RATCHET_MAX);
    expect(new Set(INHERITED_BELOW_LEKTA_RANGE).size).toBe(INHERITED_BELOW_LEKTA_RANGE.length);
    const present = new Set(files);
    const stale = INHERITED_BELOW_LEKTA_RANGE.filter((name) => !present.has(name));
    expect(stale, `naslijedjene migracije kojih vise nema: ${stale.join(', ')}`).toEqual([]);
  });

  it('log_retention (definira purge_old_report_generations) primjenjuje se prije revoke_purge', () => {
    // 0015_revoke_purge radi `revoke ... on function purge_old_report_generations` pa funkcija
    // mora vec postojati; cuvamo taj poredak i nakon renumeracije (AUD-17).
    const logRetention = files.find((f) => f.includes('log_retention'));
    const revoke = files.find((f) => f.includes('revoke_purge'));
    expect(logRetention, 'nema log_retention migracije').toBeTruthy();
    expect(revoke, 'nema revoke_purge migracije').toBeTruthy();
    expect(logRetention!.slice(0, 4) < revoke!.slice(0, 4)).toBe(true);
  });
});

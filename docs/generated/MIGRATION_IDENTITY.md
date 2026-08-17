# Migracijski identitet: repozitorij nasuprot primijenjenom stanju

> GENERIRANO (`npm run migration-identity`). Ne uredjuj rucno.

Migracije se usporedjuju po IMENU, ne po verziji. Dio ih je primijenjen Supabase MCP alatom
`apply_migration`, koji dodjeljuje timestamp verziju a ime cuva, pa usporedba po verziji daje
lazan dojam da gotovo nista nije primijenjeno.

## produkcija (`zrrjttizjyfcxmcpgzml`)

Repo: 90 migracija. Zapisa u bazi: 67. Poklopljeno po imenu: **67**. Nedostaje: **23**. Samo u bazi: **0**. Dvaput primijenjeno: **0**.

### U REPOU, NIJE primijenjeno

| Migracija | Kljuc |
| --- | --- |
| `0011_faculty_requests.sql` | `faculty_requests` |
| `0018_integrity.sql` | `integrity` |
| `0023_integrity_ip_hash.sql` | `integrity_ip_hash` |
| `0062_analytics_conversion_stat.sql` | `analytics_conversion_stat` |
| `0067_agentic_run_contract.sql` | `agentic_run_contract` |
| `0068_katedra_billing_v2.sql` | `katedra_billing_v2` |
| `0069_attach_agent_payloads.sql` | `attach_agent_payloads` |
| `0070_attach_agent_payloads_reuse_terminal.sql` | `attach_agent_payloads_reuse_terminal` |
| `0071_katedra_pass_products.sql` | `katedra_pass_products` |
| `0072_harden_katedra_agent_scope.sql` | `harden_katedra_agent_scope` |
| `0073_harden_katedra_agent_resume_scope.sql` | `harden_katedra_agent_resume_scope` |
| `0074_atomic_project_lock_idempotency.sql` | `atomic_project_lock_idempotency` |
| `0075_agent_run_initialization_readiness.sql` | `agent_run_initialization_readiness` |
| `0076_stale_agent_run_recovery.sql` | `stale_agent_run_recovery` |
| `0077_agent_payload_tombstone.sql` | `agent_payload_tombstone` |
| `0078_harden_agent_run_lifecycle.sql` | `harden_agent_run_lifecycle` |
| `0079_fix_billing_daily_ceiling.sql` | `fix_billing_daily_ceiling` |
| `0080_list_active_agent_payloads.sql` | `list_active_agent_payloads` |
| `0081_harden_create_and_register_scope.sql` | `harden_create_and_register_scope` |
| `0082_replace_agent_payloads_for_run.sql` | `replace_agent_payloads_for_run` |
| `0083_billing_pending_marker.sql` | `billing_pending_marker` |
| `0084_revoke_legacy_agent_payload_attach.sql` | `revoke_legacy_agent_payload_attach` |
| `0085_guard_locked_project_mutations.sql` | `guard_locked_project_mutations` |

### U BAZI, NEMA je u repozitoriju

Nema takvih.

<details><summary>Poklopljeno po imenu, ali pod drugom verzijom</summary>

66 od 67 poklopljenih ima drugaciju verziju u bazi nego u repou.

| Repo | Verzija u bazi |
| --- | --- |
| `0001_monetization.sql` | `20260719004453` |
| `0002_products_catalog.sql` | `20260719004548` |
| `0003_coupons_manual_orders.sql` | `20260719004603` |
| `0004_partner_accounts.sql` | `20260719004638` |
| `0005_referrals.sql` | `20260719004711` |
| `0006_rulebook_submissions.sql` | `20260719004755` |
| `0007_guarantee_claims.sql` | `20260719004845` |
| `0008_analytics_views.sql` | `20260719004919` |
| `0009_log_retention.sql` | `20260719004959` |
| `0010_do_obrane_sku.sql` | `20260719005035` |
| `0012_deadline_subscriptions.sql` | `20260709110357` |
| `0013_referral_signups.sql` | `20260719005122` |
| `0014_slot_reminder_marker.sql` | `20260719005153` |
| `0015_revoke_purge.sql` | `20260719005223` |
| `0016_retention_slots_faculty.sql` | `20260719005312` |
| `0017_thesis_pass.sql` | `20260719005348` |
| `0019_preflight.sql` | `20260719005535` |
| `0020_set_product_price.sql` | `20260719005611` |
| `0021_checkout_consent.sql` | `20260719005630` |
| `0022_ip_rate_limits.sql` | `20260719005705` |
| `0024_webhook_idempotency.sql` | `20260719005729` |
| `0025_ip_rate_limits_rls_fix.sql` | `20260719005853` |
| `0026_repair_jobs.sql` | `20260719202315` |
| `0027_repair_orphan_sweep.sql` | `20260719202334` |
| `0028_lock_orphan_sweep_fn.sql` | `20260719202531` |
| `0029_repair_gen_status_free.sql` | `20260719220700` |
| `0030_corpus_works.sql` | `20260720093724` |
| `0031_admin_users.sql` | `20260720103057` |
| `0032_corpus_search.sql` | `20260720102810` |
| `0033_anonymous_repair_retention.sql` | `20260720113528` |
| `0034_analytics_events.sql` | `20260801201534` |
| `0035_academic_suite_foundation.sql` | `20260803094603` |
| `0036_academic_suite_rls_hardening.sql` | `20260803094822` |
| `0037_academic_suite_api_grants.sql` | `20260803094900` |
| `0038_academic_suite_least_privilege_grants.sql` | `20260803095218` |
| `0039_academic_suite_permanent_account_gate.sql` | `20260803100137` |
| `0040_academic_suite_performance_indexes.sql` | `20260803100424` |
| `0041_completion_app_foundation.sql` | `20260803201257` |
| `0042_completion_app_access_hardening.sql` | `20260803201313` |
| `0043_completion_app_permanent_account_gate.sql` | `20260803201732` |
| `0044_completion_ai_usage.sql` | `20260803204311` |
| `0045_completion_ai_rate_reservation.sql` | `20260803204802` |
| `0046_completion_ai_finalize_grant.sql` | `20260803210015` |
| `0047_completion_workflow_mutations.sql` | `20260803210745` |
| `0048_completion_mentor_sent_version.sql` | `20260803211332` |
| `0049_completion_lekta_handoff_lifecycle.sql` | `20260803220302` |
| `0050_completion_lekta_handoff_token_rotation.sql` | `20260803220430` |
| `0051_completion_lekta_task_authority_guard.sql` | `20260803223519` |
| `0052_completion_authenticated_lekta_workflow.sql` | `20260804011112` |
| `0054_faculty_requests_waitlist.sql` | `20260709085734` |
| `0055_faculty_requests_retention_cron.sql` | `20260709091217` |
| `0056_harden_purge_faculty_request_ip_search_path.sql` | `20260709183153` |
| `0057_revoke_anon_execute_unsubscribe_deadline.sql` | `20260709184003` |
| `0058_sihta_0001_init.sql` | `20260717102047` |
| `0059_secure_reminder_cron.sql` | `20260804155525` |
| `0060_revoke_purge_rpc_roles.sql` | `20260804161716` |
| `0061_academic_source_classification.sql` | `20260805223216` |
| `0063_deadline_reminder_tiers.sql` | `20260804155404` |
| `0064_admin_dashboard_indexes.sql` | `20260803234133` |
| `0065_admin_dashboard_stats.sql` | `20260803234316` |
| `0066_security_advisor_hardening.sql` | `20260804161624` |
| `0086_academic_audit_insert_grants.sql` | `20260805184312` |
| `0087_academic_audit_insert_policies.sql` | `20260805184408` |
| `0088_academic_demo_usage.sql` | `20260805201955` |
| `0089_academic_demo_usage_hardening.sql` | `20260805202104` |
| `0090_academic_project_commercial_stages.sql` | `20260805202458` |

</details>

## staging (`bnyemcnsphlitjradrst`)

Repo: 90 migracija. Zapisa u bazi: 105. Poklopljeno po imenu: **67**. Nedostaje: **23**. Samo u bazi: **0**. Dvaput primijenjeno: **38**.

### DVAPUT primijenjeno (isti zahvat, dva identiteta)

Ista migracija zavedena je dva puta pod razlicitim identitetom: jednom kroz `supabase db push`
(verzija je redni broj, ime bez broja), pa opet kroz MCP `apply_migration` (verzija je timestamp,
ime s brojem). Proslo je samo zato sto su ti zahvati idempotentni. Migracijski dnevnik ovog
okruzenja od tada nije pouzdan izvor onoga sto je primijenjeno.

| Kljuc | Zapisi |
| --- | --- |
| `monetization` | `0001` (monetization) + `20260814020805` (0001_monetization) |
| `products_catalog` | `0002` (products_catalog) + `20260814020811` (0002_products_catalog) |
| `coupons_manual_orders` | `0003` (coupons_manual_orders) + `20260814020815` (0003_coupons_manual_orders) |
| `partner_accounts` | `0004` (partner_accounts) + `20260814020820` (0004_partner_accounts) |
| `referrals` | `0005` (referrals) + `20260814020825` (0005_referrals) |
| `rulebook_submissions` | `0006` (rulebook_submissions) + `20260814020830` (0006_rulebook_submissions) |
| `guarantee_claims` | `0007` (guarantee_claims) + `20260814020834` (0007_guarantee_claims) |
| `analytics_views` | `0008` (analytics_views) + `20260814020839` (0008_analytics_views) |
| `log_retention` | `0009` (log_retention) + `20260814020845` (0009_log_retention) |
| `do_obrane_sku` | `0010` (do_obrane_sku) + `20260814020850` (0010_do_obrane_sku) |
| `faculty_requests` | `0011` (faculty_requests) + `20260814020902` (0011_faculty_requests) |
| `deadline_subscriptions` | `0012` (deadline_subscriptions) + `20260814021004` (0012_deadline_subscriptions) |
| `referral_signups` | `0013` (referral_signups) + `20260814021028` (0013_referral_signups) |
| `slot_reminder_marker` | `0014` (slot_reminder_marker) + `20260814021033` (0014_slot_reminder_marker) |
| `revoke_purge` | `0015` (revoke_purge) + `20260814021038` (0015_revoke_purge) |
| `retention_slots_faculty` | `0016` (retention_slots_faculty) + `20260814021046` (0016_retention_slots_faculty) |
| `thesis_pass` | `0017` (thesis_pass) + `20260814021053` (0017_thesis_pass) |
| `integrity` | `0018` (integrity) + `20260814021106` (0018_integrity) |
| `preflight` | `0019` (preflight) + `20260814021112` (0019_preflight) |
| `set_product_price` | `0020` (set_product_price) + `20260814021116` (0020_set_product_price) |
| `checkout_consent` | `0021` (checkout_consent) + `20260814021121` (0021_checkout_consent) |
| `ip_rate_limits` | `0022` (ip_rate_limits) + `20260814021125` (0022_ip_rate_limits) |
| `integrity_ip_hash` | `0023` (integrity_ip_hash) + `20260814021130` (0023_integrity_ip_hash) |
| `webhook_idempotency` | `0024` (webhook_idempotency) + `20260814021135` (0024_webhook_idempotency) |
| `ip_rate_limits_rls_fix` | `0025` (ip_rate_limits_rls_fix) + `20260814021139` (0025_ip_rate_limits_rls_fix) |
| `repair_jobs` | `0026` (repair_jobs) + `20260814021156` (0026_repair_jobs) |
| `repair_orphan_sweep` | `0027` (repair_orphan_sweep) + `20260814021201` (0027_repair_orphan_sweep) |
| `lock_orphan_sweep_fn` | `0028` (lock_orphan_sweep_fn) + `20260814021206` (0028_lock_orphan_sweep_fn) |
| `repair_gen_status_free` | `0029` (repair_gen_status_free) + `20260814021211` (0029_repair_gen_status_free) |
| `corpus_works` | `0030` (corpus_works) + `20260814021215` (0030_corpus_works) |
| `admin_users` | `0031` (admin_users) + `20260814021220` (0031_admin_users) |
| `corpus_search` | `0032` (corpus_search) + `20260814021224` (0032_corpus_search) |
| `anonymous_repair_retention` | `0033` (anonymous_repair_retention) + `20260814021229` (0033_anonymous_repair_retention) |
| `analytics_events` | `0034` (analytics_events) + `20260814021234` (0034_analytics_events) |
| `analytics_conversion_stat` | `0035` (analytics_conversion_stat) + `20260814021533` (0062_analytics_conversion_stat) |
| `deadline_reminder_tiers` | `0036` (deadline_reminder_tiers) + `20260814021537` (0063_deadline_reminder_tiers) |
| `admin_dashboard_indexes` | `0037` (admin_dashboard_indexes) + `20260814021541` (0064_admin_dashboard_indexes) |
| `admin_dashboard_stats` | `0038` (admin_dashboard_stats) + `20260814021547` (0065_admin_dashboard_stats) |

### U REPOU, NIJE primijenjeno

| Migracija | Kljuc |
| --- | --- |
| `0058_sihta_0001_init.sql` | `sihta_0001_init` |
| `0059_secure_reminder_cron.sql` | `secure_reminder_cron` |
| `0060_revoke_purge_rpc_roles.sql` | `revoke_purge_rpc_roles` |
| `0071_katedra_pass_products.sql` | `katedra_pass_products` |
| `0072_harden_katedra_agent_scope.sql` | `harden_katedra_agent_scope` |
| `0073_harden_katedra_agent_resume_scope.sql` | `harden_katedra_agent_resume_scope` |
| `0074_atomic_project_lock_idempotency.sql` | `atomic_project_lock_idempotency` |
| `0075_agent_run_initialization_readiness.sql` | `agent_run_initialization_readiness` |
| `0076_stale_agent_run_recovery.sql` | `stale_agent_run_recovery` |
| `0077_agent_payload_tombstone.sql` | `agent_payload_tombstone` |
| `0078_harden_agent_run_lifecycle.sql` | `harden_agent_run_lifecycle` |
| `0079_fix_billing_daily_ceiling.sql` | `fix_billing_daily_ceiling` |
| `0080_list_active_agent_payloads.sql` | `list_active_agent_payloads` |
| `0081_harden_create_and_register_scope.sql` | `harden_create_and_register_scope` |
| `0082_replace_agent_payloads_for_run.sql` | `replace_agent_payloads_for_run` |
| `0083_billing_pending_marker.sql` | `billing_pending_marker` |
| `0084_revoke_legacy_agent_payload_attach.sql` | `revoke_legacy_agent_payload_attach` |
| `0085_guard_locked_project_mutations.sql` | `guard_locked_project_mutations` |
| `0086_academic_audit_insert_grants.sql` | `academic_audit_insert_grants` |
| `0087_academic_audit_insert_policies.sql` | `academic_audit_insert_policies` |
| `0088_academic_demo_usage.sql` | `academic_demo_usage` |
| `0089_academic_demo_usage_hardening.sql` | `academic_demo_usage_hardening` |
| `0090_academic_project_commercial_stages.sql` | `academic_project_commercial_stages` |

### U BAZI, NEMA je u repozitoriju

Nema takvih.

<details><summary>Poklopljeno po imenu, ali pod drugom verzijom</summary>

33 od 67 poklopljenih ima drugaciju verziju u bazi nego u repou.

| Repo | Verzija u bazi |
| --- | --- |
| `0035_academic_suite_foundation.sql` | `20260814021241` |
| `0036_academic_suite_rls_hardening.sql` | `20260814021245` |
| `0037_academic_suite_api_grants.sql` | `20260814021249` |
| `0038_academic_suite_least_privilege_grants.sql` | `20260814021254` |
| `0039_academic_suite_permanent_account_gate.sql` | `20260814021259` |
| `0040_academic_suite_performance_indexes.sql` | `20260814021303` |
| `0041_completion_app_foundation.sql` | `20260814021320` |
| `0042_completion_app_access_hardening.sql` | `20260814021325` |
| `0043_completion_app_permanent_account_gate.sql` | `20260814021329` |
| `0044_completion_ai_usage.sql` | `20260814021334` |
| `0045_completion_ai_rate_reservation.sql` | `20260814021402` |
| `0046_completion_ai_finalize_grant.sql` | `20260814021408` |
| `0047_completion_workflow_mutations.sql` | `20260814021412` |
| `0048_completion_mentor_sent_version.sql` | `20260814021416` |
| `0049_completion_lekta_handoff_lifecycle.sql` | `20260814021421` |
| `0050_completion_lekta_handoff_token_rotation.sql` | `20260814021429` |
| `0051_completion_lekta_task_authority_guard.sql` | `20260814021434` |
| `0052_completion_authenticated_lekta_workflow.sql` | `20260814021438` |
| `0053_katedra_academic_documents.sql` | `20260814021444` |
| `0054_faculty_requests_waitlist.sql` | `20260814021449` |
| `0055_faculty_requests_retention_cron.sql` | `20260814021454` |
| `0056_harden_purge_faculty_request_ip_search_path.sql` | `20260814021458` |
| `0057_revoke_anon_execute_unsubscribe_deadline.sql` | `20260814021502` |
| `0061_academic_source_classification.sql` | `20260814021529` |
| `0062_analytics_conversion_stat.sql` | `0035` |
| `0063_deadline_reminder_tiers.sql` | `0036` |
| `0064_admin_dashboard_indexes.sql` | `0037` |
| `0065_admin_dashboard_stats.sql` | `0038` |
| `0066_security_advisor_hardening.sql` | `20260814021551` |
| `0067_agentic_run_contract.sql` | `20260814021602` |
| `0068_katedra_billing_v2.sql` | `20260814093834` |
| `0069_attach_agent_payloads.sql` | `20260814101107` |
| `0070_attach_agent_payloads_reuse_terminal.sql` | `20260814101306` |

</details>

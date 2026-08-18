# Migracijski identitet: repozitorij nasuprot primijenjenom stanju

> GENERIRANO (`npm run migration-identity`). Ne uredjuj rucno.

Migracije se usporedjuju po IMENU, ne po verziji. Dio ih je primijenjen Supabase MCP alatom
`apply_migration`, koji dodjeljuje timestamp verziju a ime cuva, pa usporedba po verziji daje
lazan dojam da gotovo nista nije primijenjeno.

## produkcija (`zrrjttizjyfcxmcpgzml`)

Repo: 93 migracija. Zapisa u bazi: 67. Poklopljeno po imenu: **67**. Nedostaje: **26**. Samo u bazi: **0**. Dvaput primijenjeno: **0**.

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
| `0091_consent_server_time.sql` | `consent_server_time` |
| `0092_webhook_events_inbox.sql` | `webhook_events_inbox` |
| `0093_security_advisor_2026_08.sql` | `security_advisor_2026_08` |

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

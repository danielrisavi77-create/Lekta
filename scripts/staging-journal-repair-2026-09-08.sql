-- REVIEW / DRY RUN ONLY: staging bnyemcnsphlitjradrst, snapshot 2026-09-08.
-- This file ends in ROLLBACK. Applying it requires an explicit owner decision.
-- Never use against production. No public schema object or user data is changed.
-- Full backup: D:/output/lekta-staging-journal-backup-2026-09-08.json
begin;
lock table supabase_migrations.schema_migrations in access exclusive mode;
do $$ declare actual text; begin
  select md5(jsonb_agg(to_jsonb(m) order by version)::text) into actual from supabase_migrations.schema_migrations m;
  if actual is distinct from 'a2bb8567494e1cf132fa9d03de0617db' then
    raise exception 'STAGING_JOURNAL_SNAPSHOT_CHANGED';
  end if;
end $$;
create temporary table staging_journal_before on commit drop as select * from supabase_migrations.schema_migrations;
create temporary table staging_journal_map(old_version text primary key,target_version text not null,name text not null,keep boolean not null) on commit drop;
insert into staging_journal_map values
  ('0001','0001','monetization',true),
  ('0002','0002','products_catalog',true),
  ('0003','0003','coupons_manual_orders',true),
  ('0004','0004','partner_accounts',true),
  ('0005','0005','referrals',true),
  ('0006','0006','rulebook_submissions',true),
  ('0007','0007','guarantee_claims',true),
  ('0008','0008','analytics_views',true),
  ('0009','0009','log_retention',true),
  ('0010','0010','do_obrane_sku',true),
  ('0011','0011','faculty_requests',true),
  ('0012','0012','deadline_subscriptions',true),
  ('0013','0013','referral_signups',true),
  ('0014','0014','slot_reminder_marker',true),
  ('0015','0015','revoke_purge',true),
  ('0016','0016','retention_slots_faculty',true),
  ('0017','0017','thesis_pass',true),
  ('0018','0018','integrity',true),
  ('0019','0019','preflight',true),
  ('0020','0020','set_product_price',true),
  ('0021','0021','checkout_consent',true),
  ('0022','0022','ip_rate_limits',true),
  ('0023','0023','integrity_ip_hash',true),
  ('0024','0024','webhook_idempotency',true),
  ('0025','0025','ip_rate_limits_rls_fix',true),
  ('0026','0026','repair_jobs',true),
  ('0027','0027','repair_orphan_sweep',true),
  ('0028','0028','lock_orphan_sweep_fn',true),
  ('0029','0029','repair_gen_status_free',true),
  ('0030','0030','corpus_works',true),
  ('0031','0031','admin_users',true),
  ('0032','0032','corpus_search',true),
  ('0033','0033','anonymous_repair_retention',true),
  ('0034','0034','analytics_events',true),
  ('0035','0062','analytics_conversion_stat',true),
  ('0036','0063','deadline_reminder_tiers',true),
  ('0037','0064','admin_dashboard_indexes',true),
  ('0038','0065','admin_dashboard_stats',true),
  ('20260814020805','0001','monetization',false),
  ('20260814020811','0002','products_catalog',false),
  ('20260814020815','0003','coupons_manual_orders',false),
  ('20260814020820','0004','partner_accounts',false),
  ('20260814020825','0005','referrals',false),
  ('20260814020830','0006','rulebook_submissions',false),
  ('20260814020834','0007','guarantee_claims',false),
  ('20260814020839','0008','analytics_views',false),
  ('20260814020845','0009','log_retention',false),
  ('20260814020850','0010','do_obrane_sku',false),
  ('20260814020902','0011','faculty_requests',false),
  ('20260814021004','0012','deadline_subscriptions',false),
  ('20260814021028','0013','referral_signups',false),
  ('20260814021033','0014','slot_reminder_marker',false),
  ('20260814021038','0015','revoke_purge',false),
  ('20260814021046','0016','retention_slots_faculty',false),
  ('20260814021053','0017','thesis_pass',false),
  ('20260814021106','0018','integrity',false),
  ('20260814021112','0019','preflight',false),
  ('20260814021116','0020','set_product_price',false),
  ('20260814021121','0021','checkout_consent',false),
  ('20260814021125','0022','ip_rate_limits',false),
  ('20260814021130','0023','integrity_ip_hash',false),
  ('20260814021135','0024','webhook_idempotency',false),
  ('20260814021139','0025','ip_rate_limits_rls_fix',false),
  ('20260814021156','0026','repair_jobs',false),
  ('20260814021201','0027','repair_orphan_sweep',false),
  ('20260814021206','0028','lock_orphan_sweep_fn',false),
  ('20260814021211','0029','repair_gen_status_free',false),
  ('20260814021215','0030','corpus_works',false),
  ('20260814021220','0031','admin_users',false),
  ('20260814021224','0032','corpus_search',false),
  ('20260814021229','0033','anonymous_repair_retention',false),
  ('20260814021234','0034','analytics_events',false),
  ('20260814021241','0035','academic_suite_foundation',true),
  ('20260814021245','0036','academic_suite_rls_hardening',true),
  ('20260814021249','0037','academic_suite_api_grants',true),
  ('20260814021254','0038','academic_suite_least_privilege_grants',true),
  ('20260814021259','0039','academic_suite_permanent_account_gate',true),
  ('20260814021303','0040','academic_suite_performance_indexes',true),
  ('20260814021320','0041','completion_app_foundation',true),
  ('20260814021325','0042','completion_app_access_hardening',true),
  ('20260814021329','0043','completion_app_permanent_account_gate',true),
  ('20260814021334','0044','completion_ai_usage',true),
  ('20260814021402','0045','completion_ai_rate_reservation',true),
  ('20260814021408','0046','completion_ai_finalize_grant',true),
  ('20260814021412','0047','completion_workflow_mutations',true),
  ('20260814021416','0048','completion_mentor_sent_version',true),
  ('20260814021421','0049','completion_lekta_handoff_lifecycle',true),
  ('20260814021429','0050','completion_lekta_handoff_token_rotation',true),
  ('20260814021434','0051','completion_lekta_task_authority_guard',true),
  ('20260814021438','0052','completion_authenticated_lekta_workflow',true),
  ('20260814021444','0053','katedra_academic_documents',true),
  ('20260814021449','0054','faculty_requests_waitlist',true),
  ('20260814021454','0055','faculty_requests_retention_cron',true),
  ('20260814021458','0056','harden_purge_faculty_request_ip_search_path',true),
  ('20260814021502','0057','revoke_anon_execute_unsubscribe_deadline',true),
  ('20260814021529','0061','academic_source_classification',true),
  ('20260814021533','0062','analytics_conversion_stat',false),
  ('20260814021537','0063','deadline_reminder_tiers',false),
  ('20260814021541','0064','admin_dashboard_indexes',false),
  ('20260814021547','0065','admin_dashboard_stats',false),
  ('20260814021551','0066','security_advisor_hardening',true),
  ('20260814021602','0067','agentic_run_contract',true),
  ('20260814093834','0068','katedra_billing_v2',true),
  ('20260814101107','0069','attach_agent_payloads',true),
  ('20260814101306','0070','attach_agent_payloads_reuse_terminal',true),
  ('20260822063424','0071','katedra_pass_products',true),
  ('20260822063445','0072','harden_katedra_agent_scope',true),
  ('20260822063450','0073','harden_katedra_agent_resume_scope',true),
  ('20260822063456','0074','atomic_project_lock_idempotency',true),
  ('20260822063501','0075','agent_run_initialization_readiness',true),
  ('20260822063506','0076','stale_agent_run_recovery',true),
  ('20260822063512','0077','agent_payload_tombstone',true),
  ('20260822063517','0078','harden_agent_run_lifecycle',true),
  ('20260822063521','0079','fix_billing_daily_ceiling',true),
  ('20260822063527','0080','list_active_agent_payloads',true),
  ('20260822063532','0081','harden_create_and_register_scope',true),
  ('20260822063537','0082','replace_agent_payloads_for_run',true),
  ('20260822063542','0083','billing_pending_marker',true),
  ('20260822063547','0084','revoke_legacy_agent_payload_attach',true),
  ('20260822063553','0085','guard_locked_project_mutations',true),
  ('20260822063559','0104','agent_snapshot_privacy_and_cleanup',true);
do $$ begin
  if (select count(*) from staging_journal_map)<>121
    or (select count(*) from staging_journal_map where keep)<>83
    or (select count(distinct target_version) from staging_journal_map where keep)<>83
    or exists(select 1 from staging_journal_before b full join staging_journal_map m on m.old_version=b.version where b.version is null or m.old_version is null) then
    raise exception 'STAGING_JOURNAL_MAPPING_INVALID';
  end if;
end $$;
-- Remove only the explicitly mapped duplicate aliases, preserving the full backup.
delete from supabase_migrations.schema_migrations j using staging_journal_map m where j.version=m.old_version and not m.keep;
-- Two phases avoid numeric identity collisions (old 0035-0038 become 0062-0065).
update supabase_migrations.schema_migrations j set version='staging_repair_'||m.old_version
  from staging_journal_map m where m.keep and j.version=m.old_version;
update supabase_migrations.schema_migrations j set version=m.target_version,name=m.name
  from staging_journal_map m where m.keep and j.version='staging_repair_'||m.old_version;
do $$ begin
  if (select count(*) from supabase_migrations.schema_migrations)<>83
    or exists(select 1 from supabase_migrations.schema_migrations where version !~ '^[0-9]{4}$')
    or exists(select 1 from staging_journal_map m left join supabase_migrations.schema_migrations j on j.version=m.target_version and j.name=m.name where m.keep and j.version is null)
    or exists(select 1 from staging_journal_map m
      join staging_journal_before b on b.version=m.old_version
      join supabase_migrations.schema_migrations j on j.version=m.target_version
      where m.keep and (to_jsonb(j)-'version'-'name') is distinct from (to_jsonb(b)-'version'-'name')) then
    raise exception 'STAGING_JOURNAL_POSTCONDITION_FAILED';
  end if;
  raise notice 'STAGING_JOURNAL_REPAIR_DRY_RUN_PASS: 121 to 83, retained bodies and metadata unchanged';
end $$;
rollback;

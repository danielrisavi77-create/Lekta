\set ON_ERROR_STOP on

\i supabase/migrations/0040_academic_suite_performance_indexes.sql

do $$
begin
  if to_regclass('public.katedra_topups_user_time_idx') is null then
    raise exception 'katedra_topups ownership/time index missing';
  end if;
end $$;

select 'ACADEMIC_SUITE_PERFORMANCE_SMOKE_PASS' as result;

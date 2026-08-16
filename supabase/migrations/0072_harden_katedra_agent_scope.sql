-- Defense in depth for direct authenticated RPC calls.
-- Katedra routes perform the same capability checks, but the canonical
-- database must also reject a run or payload that bypasses the web layer.

alter table public.katedra_project_locks
  add column if not exists status text not null default 'locked';

alter table public.katedra_project_locks
  drop constraint if exists katedra_project_locks_status_check;

alter table public.katedra_project_locks
  add constraint katedra_project_locks_status_check
  check (status = 'locked');

create or replace function public.enforce_katedra_agent_scope()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  locked_product text;
begin
  select l.product_key
  into locked_product
  from public.katedra_project_locks l
  where l.project_id = new.project_id
    and l.user_id = new.user_id
    and l.status = 'locked';

  if locked_product is null then
    raise exception 'An active locked Katedra project is required' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.entitlements e
    where e.user_id = new.user_id
      and e.academic_project_id = new.project_id
      and e.product_id = ('katedra_pass_' || locked_product)
      and e.status = 'active'
      and e.purchase_expires_at > now()
  ) then
    raise exception 'An exact active Katedra Pass is required for this project' using errcode = '42501';
  end if;

  if tg_table_name = 'agent_runs'
     and new.mode = 'autonomous'
     and locked_product not in ('zavrsni', 'diplomski') then
    raise exception 'Autonomous runs are not available for this project tier' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_katedra_agent_run_scope on public.agent_runs;
create trigger enforce_katedra_agent_run_scope
before insert on public.agent_runs
for each row execute function public.enforce_katedra_agent_scope();

drop trigger if exists enforce_katedra_agent_payload_scope on public.agent_payload_manifests;
create trigger enforce_katedra_agent_payload_scope
before insert on public.agent_payload_manifests
for each row execute function public.enforce_katedra_agent_scope();

revoke all on function public.enforce_katedra_agent_scope() from public, anon, authenticated;

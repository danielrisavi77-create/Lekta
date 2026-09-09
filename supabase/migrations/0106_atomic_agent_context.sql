-- Rezerviraj prije uploada, objavi tek nakon oba objekta i transakcijske provjere.
-- Ne sadrzi rukopis. Pending rezervacije istjecu u postojece Storage-first ciscenje.
alter table public.agent_payload_manifests
  add column if not exists context_revision uuid,
  add column if not exists context_state text not null default 'active',
  add column if not exists context_base_manifest_id uuid,
  add column if not exists context_expires_at timestamptz,
  add column if not exists context_material_ids text[];
alter table public.agent_payload_manifests drop constraint if exists agent_context_state_check;
alter table public.agent_payload_manifests add constraint agent_context_state_check
  check(context_state in ('pending','active'));
create unique index if not exists agent_context_revision_unique
  on public.agent_payload_manifests(context_revision) where context_revision is not null;
create unique index if not exists agent_context_active_unique
  on public.agent_payload_manifests(run_id) where material_id='run-context' and context_state='active' and deleted_at is null;

create or replace function public.assert_agent_context_edit(p_user_id uuid,p_project_id uuid,p_run_id uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if p_user_id is null or p_project_id is null or p_run_id is null
    or ((select auth.uid()) is distinct from p_user_id and coalesce(current_setting('request.jwt.claim.role',true),'')<>'service_role') then
    raise exception 'Context owner mismatch' using errcode='42501';
  end if;
  perform 1 from public.agent_runs r where r.run_id=p_run_id and r.user_id=p_user_id and r.project_id=p_project_id
    and r.status in ('initializing','paused','blocked')
    and r.snapshot_consent_version='agentic-snapshot-v1'
    and r.snapshot_consent_at between now()-interval '90 days' and now()
    and r.payload_cleanup_status not in ('deletion_scheduled','deleted') for update;
  if not found then raise exception 'Run is not editable or snapshot consent is missing' using errcode='40901'; end if;
  if not exists(select 1 from public.academic_projects p
    join public.katedra_project_locks l on l.project_id=p.id and l.user_id=p.user_id and l.status='locked'
    join public.entitlements e on e.user_id=l.user_id and e.academic_project_id=p.id
      and e.product_id='katedra_pass_'||l.product_key and e.provider='stripe'
      and e.status='active' and e.purchase_expires_at>now()
    where p.id=p_project_id and p.user_id=p_user_id and p.deleted_at is null) then
    raise exception 'An active exact project Pass is required' using errcode='42501';
  end if;
end $$;

create or replace function public.reserve_agent_run_context(p_user_id uuid,p_project_id uuid,p_run_id uuid)
returns table(manifest_id uuid,context_revision uuid,storage_path text,manifest_path text,expires_at timestamptz)
language plpgsql security definer set search_path=public,pg_temp as $$
declare revision uuid:=gen_random_uuid(); base_id uuid; prefix text; target_expiry timestamptz:=now()+interval '72 hours';
begin
  perform public.assert_agent_context_edit(p_user_id,p_project_id,p_run_id);
  select m.manifest_id into base_id from public.agent_payload_manifests m
    where m.run_id=p_run_id and m.material_id='run-context' and m.context_state='active' and m.deleted_at is null;
  prefix:=p_user_id::text||'/'||p_project_id::text||'/'||p_run_id::text||'/contexts/'||revision::text||'/';
  return query insert into public.agent_payload_manifests as m
    (user_id,project_id,run_id,material_id,storage_bucket,storage_path,manifest_path,expires_at,
      context_revision,context_state,context_base_manifest_id,context_expires_at)
    values(p_user_id,p_project_id,p_run_id,'run-context','katedra-temporary-materials',prefix||'manuscript-context.json',
      prefix||'manuscript-context.manifest.json',now()+interval '15 minutes',revision,'pending',base_id,target_expiry)
    returning m.manifest_id,m.context_revision,m.storage_path,m.manifest_path,m.context_expires_at;
end $$;

create or replace function public.commit_agent_run_context(p_user_id uuid,p_project_id uuid,p_run_id uuid,p_manifest_id uuid,p_material_ids text[])
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare candidate public.agent_payload_manifests; current_id uuid; sorted_ids text[];
begin
  perform public.assert_agent_context_edit(p_user_id,p_project_id,p_run_id);
  select * into candidate from public.agent_payload_manifests m where m.manifest_id=p_manifest_id
    and m.user_id=p_user_id and m.project_id=p_project_id and m.run_id=p_run_id and m.material_id='run-context'
    and m.context_revision is not null and m.deleted_at is null and m.expires_at>now() for update;
  if not found then raise exception 'Context reservation unavailable' using errcode='40901'; end if;
  select coalesce(array_agg(v order by v),'{}') into sorted_ids from unnest(coalesce(p_material_ids,'{}')) v;
  select m.manifest_id into current_id from public.agent_payload_manifests m
    where m.run_id=p_run_id and m.material_id='run-context' and m.context_state='active' and m.deleted_at is null;
  if candidate.context_state='active' then
    if current_id=p_manifest_id and candidate.context_material_ids is not distinct from sorted_ids then return p_manifest_id; end if;
    raise exception 'Context commit replay differs' using errcode='40901';
  end if;
  if current_id is distinct from candidate.context_base_manifest_id then
    raise exception 'Active context changed since reservation' using errcode='40901';
  end if;
  if (select count(*) from storage.objects o where o.bucket_id=candidate.storage_bucket
    and o.name in(candidate.storage_path,candidate.manifest_path))<>2 then
    raise exception 'Both context objects must exist before commit' using errcode='40901';
  end if;
  -- Isti run lock i ista transakcija: nevaljan materijal ne mijenja ni izbor ni kontekst.
  perform public.replace_agent_payloads_for_run(p_user_id,p_project_id,p_run_id,p_material_ids);
  update public.agent_payload_manifests set deleted_at=now(),deletion_requested_at=now(),updated_at=now()
    where manifest_id=current_id;
  update public.agent_payload_manifests set context_state='active',expires_at=context_expires_at,
    context_material_ids=sorted_ids,updated_at=now() where manifest_id=p_manifest_id;
  return p_manifest_id;
end $$;

-- Prosiri kanonski namespace tocno jednom revizijom; ostali namespaceovi ostaju isti.
create or replace function public.enforce_agent_payload_storage_namespace()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare
  prefix text:=new.user_id::text||'/'||new.project_id::text||'/';
  run_prefix text:=prefix||coalesce(new.run_id::text,'')||'/';
  version_prefix text:=run_prefix||'contexts/'||coalesce(new.context_revision::text,'')||'/';
  valid boolean:=false;
begin
  if new.storage_bucket='katedra-temporary-materials' then
    if new.material_id='run-context' and new.run_id is not null and new.context_revision is not null then
      valid:=new.storage_path=version_prefix||'manuscript-context.json'
        and new.manifest_path=version_prefix||'manuscript-context.manifest.json';
    elsif new.context_revision is null and new.context_state='active' then
      if new.material_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
        valid:=new.manifest_path=prefix||new.material_id||'.manifest.json'
          and left(new.storage_path,length(prefix||new.material_id||'-'))=prefix||new.material_id||'-'
          and position('/' in substr(new.storage_path,length(prefix)+1))=0;
      elsif new.material_id='run-context' and new.run_id is not null then
        valid:=new.storage_path=run_prefix||'manuscript-context.json' and new.manifest_path=run_prefix||'manuscript-context.manifest.json';
      elsif new.material_id ~ '^agent-result:[A-Za-z0-9._-]+:[123]$' and new.run_id is not null then
        valid:=left(new.storage_path,length(run_prefix||'results/'))=run_prefix||'results/'
          and position('/' in substr(new.storage_path,length(run_prefix||'results/')+1))=0
          and new.storage_path like '%.json'
          and new.manifest_path=left(new.storage_path,length(new.storage_path)-5)||'.manifest.json';
      end if;
    end if;
  end if;
  if not coalesce(valid,false) then raise exception 'Agent payload storage namespace is invalid' using errcode='42501'; end if;
  return new;
end $$;
drop trigger if exists agent_payload_storage_namespace_guard on public.agent_payload_manifests;
create trigger agent_payload_storage_namespace_guard before insert or update on public.agent_payload_manifests
  for each row execute function public.enforce_agent_payload_storage_namespace();

-- Dodatne RESTRICTIVE politike ne daju nova prava. Verzijski objekti se ne prepisuju.
drop policy if exists agent_context_immutable on storage.objects;
create policy agent_context_immutable on storage.objects as restrictive for update to authenticated
  using(bucket_id<>'katedra-temporary-materials' or split_part(name,'/',4)<>'contexts')
  with check(bucket_id<>'katedra-temporary-materials' or split_part(name,'/',4)<>'contexts');
drop policy if exists agent_context_reserved_insert on storage.objects;
create policy agent_context_reserved_insert on storage.objects as restrictive for insert to authenticated
  with check(bucket_id<>'katedra-temporary-materials' or split_part(name,'/',4)<>'contexts' or exists(
    select 1 from public.agent_payload_manifests m where m.user_id=(select auth.uid())
      and m.storage_bucket=bucket_id and name in(m.storage_path,m.manifest_path)
      and m.context_revision is not null and m.context_state='pending' and m.deleted_at is null and m.expires_at>now()));

revoke all on function public.assert_agent_context_edit(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.enforce_agent_payload_storage_namespace() from public,anon,authenticated;
revoke all on function public.reserve_agent_run_context(uuid,uuid,uuid) from public,anon;
revoke all on function public.commit_agent_run_context(uuid,uuid,uuid,uuid,text[]) from public,anon;
grant execute on function public.reserve_agent_run_context(uuid,uuid,uuid) to authenticated,service_role;
grant execute on function public.commit_agent_run_context(uuid,uuid,uuid,uuid,text[]) to authenticated,service_role;

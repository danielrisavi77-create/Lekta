-- Agenticni Katedra run contract v1.
--
-- Lekta owns the durable lock, entitlement gate, run state and worker lease.
-- Katedra owns agent prompts, provider routing and document content. This
-- migration stores no raw document text or extracted academic passages.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. Paid project lock
-- ---------------------------------------------------------------------------

create table if not exists public.katedra_project_locks (
  lock_id       uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  project_id    uuid not null unique references public.academic_projects(id) on delete cascade,
  topic         text not null,
  work_type     text not null,
  product_key   text not null,
  payment_id    text not null unique,
  locked_at     timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists katedra_project_locks_user_idx
  on public.katedra_project_locks (user_id, locked_at desc);

alter table public.katedra_project_locks enable row level security;

drop policy if exists katedra_project_locks_select_own on public.katedra_project_locks;
create policy katedra_project_locks_select_own on public.katedra_project_locks
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- 2. Agent run state and temporary payload manifests
-- ---------------------------------------------------------------------------

create table if not exists public.agent_runs (
  run_id        uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  project_id    uuid not null references public.academic_projects(id) on delete cascade,
  mode          text not null check (mode in ('guided', 'accelerated', 'autonomous')),
  source_policy text not null check (source_policy in (
    'uploaded_only', 'uploaded_plus_suggestions', 'web_research'
  )),
  status        text not null default 'pending' check (status in (
    'pending', 'running', 'paused', 'completed', 'blocked', 'failed', 'cancelled'
  )),
  last_error    text,
  paused_at     timestamptz,
  cancelled_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists agent_runs_user_project_idx
  on public.agent_runs (user_id, project_id, created_at desc);

create unique index if not exists agent_runs_one_active_per_project_idx
  on public.agent_runs (project_id)
  where status in ('pending', 'running', 'paused');

create table if not exists public.agent_steps (
  step_id          uuid primary key default gen_random_uuid(),
  run_id           uuid not null references public.agent_runs(run_id) on delete cascade,
  project_id       uuid not null references public.academic_projects(id) on delete cascade,
  agent            text not null check (agent in (
    'intake', 'sources', 'structure', 'planning', 'writing', 'citation', 'review', 'export'
  )),
  verifier         text not null,
  section_id       text,
  step_order       integer not null check (step_order > 0),
  attempt          smallint not null default 1 check (attempt between 1 and 3),
  status           text not null default 'pending' check (status in (
    'pending', 'running', 'verified', 'blocked', 'failed'
  )),
  lease_owner      text,
  lease_expires_at timestamptz,
  claimed_at       timestamptz,
  completed_at     timestamptz,
  provider         text,
  usage            jsonb not null default '{}'::jsonb,
  last_verification jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (run_id, step_order)
);

create index if not exists agent_steps_claim_idx
  on public.agent_steps (run_id, status, step_order, lease_expires_at);

create table if not exists public.agent_payload_manifests (
  manifest_id    uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  project_id     uuid not null references public.academic_projects(id) on delete cascade,
  run_id         uuid references public.agent_runs(run_id) on delete set null,
  material_id    text not null,
  storage_bucket text not null,
  storage_path   text not null unique,
  manifest_path  text not null unique,
  expires_at     timestamptz not null,
  deleted_at     timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (expires_at <= created_at + interval '7 days')
);

create index if not exists agent_payload_manifests_expiry_idx
  on public.agent_payload_manifests (expires_at)
  where deleted_at is null;

alter table public.agent_runs enable row level security;
alter table public.agent_steps enable row level security;
alter table public.agent_payload_manifests enable row level security;

drop policy if exists agent_runs_select_own on public.agent_runs;
create policy agent_runs_select_own on public.agent_runs
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists agent_steps_select_own on public.agent_steps;
create policy agent_steps_select_own on public.agent_steps
  for select to authenticated
  using (exists (
    select 1 from public.agent_runs r
    where r.run_id = agent_steps.run_id and r.user_id = (select auth.uid())
  ));

drop policy if exists agent_payload_manifests_select_own on public.agent_payload_manifests;
create policy agent_payload_manifests_select_own on public.agent_payload_manifests
  for select to authenticated
  using ((select auth.uid()) = user_id and deleted_at is null);

-- ---------------------------------------------------------------------------
-- 3. Private temporary material bucket
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit)
values ('katedra-temporary-materials', 'katedra-temporary-materials', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = 52428800;

drop policy if exists katedra_temporary_materials_select_own on storage.objects;
create policy katedra_temporary_materials_select_own on storage.objects
  for select to authenticated
  using (
    bucket_id = 'katedra-temporary-materials'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1 from public.academic_projects p
      where p.id::text = (storage.foldername(name))[2]
        and p.user_id = (select auth.uid())
        and p.deleted_at is null
    )
  );

drop policy if exists katedra_temporary_materials_insert_own on storage.objects;
create policy katedra_temporary_materials_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'katedra-temporary-materials'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1 from public.academic_projects p
      where p.id::text = (storage.foldername(name))[2]
        and p.user_id = (select auth.uid())
        and p.deleted_at is null
    )
  );

drop policy if exists katedra_temporary_materials_delete_own on storage.objects;
create policy katedra_temporary_materials_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'katedra-temporary-materials'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- ---------------------------------------------------------------------------
-- 4. Canonical RPCs
-- ---------------------------------------------------------------------------

create or replace function public.lock_paid_project(
  p_user_id uuid,
  p_project_id uuid,
  p_topic text,
  p_work_type text,
  p_product_key text,
  p_payment_id text,
  p_locked_at timestamptz default now()
) returns table (
  lock_id uuid,
  project_id uuid,
  user_id uuid,
  topic text,
  work_type text,
  product_key text,
  payment_id text,
  locked_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_lock public.katedra_project_locks%rowtype;
  project_owner uuid;
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'Only service role may lock a paid project' using errcode = '42501';
  end if;
  if nullif(trim(p_topic), '') is null
     or nullif(trim(p_work_type), '') is null
     or nullif(trim(p_product_key), '') is null
     or nullif(trim(p_payment_id), '') is null then
    raise exception 'Paid project lock snapshot is incomplete' using errcode = '22023';
  end if;

  select p.user_id into project_owner
  from public.academic_projects p
  where p.id = p_project_id and p.deleted_at is null;

  if project_owner is null or project_owner <> p_user_id then
    raise exception 'Project is missing or is not owned by the payment user' using errcode = '42501';
  end if;

  select l.* into existing_lock
  from public.katedra_project_locks l
  where l.payment_id = p_payment_id or l.project_id = p_project_id
  order by l.created_at
  limit 1;

  if existing_lock.lock_id is not null then
    if existing_lock.payment_id <> p_payment_id or existing_lock.project_id <> p_project_id then
      raise exception 'Payment or project is already bound to a different project' using errcode = '23505';
    end if;
    if existing_lock.user_id <> p_user_id
       or existing_lock.topic <> p_topic
       or existing_lock.work_type <> p_work_type
       or existing_lock.product_key <> p_product_key then
      raise exception 'Paid project lock snapshot does not match' using errcode = '23514';
    end if;
    return query select existing_lock.lock_id, existing_lock.project_id, existing_lock.user_id,
      existing_lock.topic, existing_lock.work_type, existing_lock.product_key,
      existing_lock.payment_id, existing_lock.locked_at;
    return;
  end if;

  insert into public.katedra_project_locks (
    user_id, project_id, topic, work_type, product_key, payment_id, locked_at
  ) values (
    p_user_id, p_project_id, p_topic, p_work_type, p_product_key,
    p_payment_id, coalesce(p_locked_at, now())
  )
  returning katedra_project_locks.lock_id, katedra_project_locks.project_id,
    katedra_project_locks.user_id, katedra_project_locks.topic,
    katedra_project_locks.work_type, katedra_project_locks.product_key,
    katedra_project_locks.payment_id, katedra_project_locks.locked_at
  into lock_id, project_id, user_id, topic, work_type, product_key, payment_id, locked_at;

  return next;
end $$;

create or replace function public.create_agent_run(
  p_user_id uuid,
  p_project_id uuid,
  p_mode text,
  p_source_policy text,
  p_section_ids text[] default null
) returns table (run_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  new_run_id uuid;
  section_id text;
  step_no integer := 1;
  sections text[];
begin
  if (select auth.uid()) is distinct from p_user_id
     and coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'User may create runs only for the authenticated account' using errcode = '42501';
  end if;
  if p_mode not in ('guided', 'accelerated', 'autonomous') then
    raise exception 'Invalid agent run mode' using errcode = '22023';
  end if;
  if p_source_policy not in ('uploaded_only', 'uploaded_plus_suggestions', 'web_research') then
    raise exception 'Invalid source policy' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.academic_projects p
    where p.id = p_project_id and p.user_id = p_user_id and p.deleted_at is null
  ) then
    raise exception 'Project is missing or is not owned by the user' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.katedra_project_locks l
    where l.project_id = p_project_id and l.user_id = p_user_id
  ) then
    raise exception 'An active paid project lock is required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.entitlements e
    where e.user_id = p_user_id
      and e.academic_project_id = p_project_id
      and e.status = 'active'
      and e.purchase_expires_at > now()
  ) then
    raise exception 'An active project entitlement is required' using errcode = '42501';
  end if;

  sections := coalesce(nullif(p_section_ids, '{}'::text[]), array['main']::text[]);

  insert into public.agent_runs (user_id, project_id, mode, source_policy)
  values (p_user_id, p_project_id, p_mode, p_source_policy)
  returning agent_runs.run_id into new_run_id;

  insert into public.agent_steps (run_id, project_id, agent, verifier, section_id, step_order)
  values (new_run_id, p_project_id, 'intake', 'intake_verifier', null, step_no);
  step_no := step_no + 1;
  insert into public.agent_steps (run_id, project_id, agent, verifier, section_id, step_order)
  values (new_run_id, p_project_id, 'sources', 'sources_verifier', null, step_no);
  step_no := step_no + 1;
  insert into public.agent_steps (run_id, project_id, agent, verifier, section_id, step_order)
  values (new_run_id, p_project_id, 'structure', 'structure_verifier', null, step_no);
  step_no := step_no + 1;
  insert into public.agent_steps (run_id, project_id, agent, verifier, section_id, step_order)
  values (new_run_id, p_project_id, 'planning', 'planning_verifier', null, step_no);
  step_no := step_no + 1;

  foreach section_id in array sections loop
    insert into public.agent_steps (run_id, project_id, agent, verifier, section_id, step_order)
    values (new_run_id, p_project_id, 'writing', 'writing_verifier', section_id, step_no);
    step_no := step_no + 1;
  end loop;

  insert into public.agent_steps (run_id, project_id, agent, verifier, section_id, step_order)
  values (new_run_id, p_project_id, 'citation', 'citation_verifier', null, step_no);
  step_no := step_no + 1;
  insert into public.agent_steps (run_id, project_id, agent, verifier, section_id, step_order)
  values (new_run_id, p_project_id, 'review', 'review_verifier', null, step_no);
  step_no := step_no + 1;
  insert into public.agent_steps (run_id, project_id, agent, verifier, section_id, step_order)
  values (new_run_id, p_project_id, 'export', 'export_verifier', null, step_no);

  return query select new_run_id;
end $$;

create or replace function public.claim_agent_step(
  p_run_id uuid,
  p_worker_id text
) returns setof public.agent_steps
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed public.agent_steps;
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'Only service role may claim an agent step' using errcode = '42501';
  end if;
  if nullif(trim(p_worker_id), '') is null then
    raise exception 'Worker id is required' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.agent_runs r
    where r.run_id = p_run_id and r.status in ('pending', 'running')
  ) then
    return;
  end if;

  with candidate as (
    select s.step_id
    from public.agent_steps s
    where s.run_id = p_run_id
      and (
        s.status = 'pending'
        or (s.status = 'running' and s.lease_expires_at <= now())
      )
      and not exists (
        select 1 from public.agent_steps previous
        where previous.run_id = s.run_id
          and previous.step_order < s.step_order
          and previous.status <> 'verified'
      )
    order by s.step_order
    for update skip locked
    limit 1
  )
  update public.agent_steps s
  set status = 'running',
      lease_owner = p_worker_id,
      lease_expires_at = now() + interval '5 minutes',
      claimed_at = now(),
      updated_at = now()
  from candidate c
  where s.step_id = c.step_id
  returning s.* into claimed;

  if claimed.step_id is null then
    return;
  end if;

  update public.agent_runs
  set status = 'running', updated_at = now()
  where run_id = p_run_id and status = 'pending';

  return next claimed;
end $$;

create or replace function public.complete_agent_step(
  p_run_id uuid,
  p_step_id uuid,
  p_status text,
  p_attempt smallint,
  p_provider text,
  p_usage jsonb,
  p_worker_id text,
  p_verification jsonb default null,
  p_requeue boolean default false
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_step public.agent_steps;
  next_status text;
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'Only service role may complete an agent step' using errcode = '42501';
  end if;
  if p_status not in ('verified', 'blocked', 'failed') then
    raise exception 'Invalid agent step completion status' using errcode = '22023';
  end if;
  if p_attempt not between 1 and 3 then
    raise exception 'Agent step attempt must be between 1 and 3' using errcode = '22023';
  end if;
  if p_requeue and (p_status <> 'failed' or p_attempt >= 3) then
    raise exception 'Only failed attempts one or two may be requeued' using errcode = '22023';
  end if;

  select s.* into current_step
  from public.agent_steps s
  where s.step_id = p_step_id and s.run_id = p_run_id
  for update;

  if current_step.step_id is null then
    raise exception 'Agent step does not belong to the run' using errcode = '22023';
  end if;
  if current_step.status <> 'running' then
    raise exception 'Agent step is not currently leased' using errcode = '40901';
  end if;
  if current_step.lease_owner <> p_worker_id then
    raise exception 'Agent step lease belongs to another worker' using errcode = '42501';
  end if;
  if current_step.attempt <> p_attempt then
    raise exception 'Agent step attempt is stale' using errcode = '40901';
  end if;

  next_status := case when p_requeue then 'pending' else p_status end;
  update public.agent_steps
  set status = next_status,
      attempt = case when p_requeue then p_attempt + 1 else p_attempt end,
      lease_owner = null,
      lease_expires_at = null,
      provider = nullif(trim(p_provider), ''),
      usage = coalesce(p_usage, '{}'::jsonb),
      last_verification = p_verification,
      completed_at = case when p_requeue then null else now() end,
      updated_at = now()
  where step_id = p_step_id;

  if p_requeue then
    update public.agent_runs set status = 'running', updated_at = now()
    where run_id = p_run_id and status in ('pending', 'running');
  elsif p_status = 'blocked' then
    update public.agent_runs set status = 'blocked', updated_at = now()
    where run_id = p_run_id;
  elsif p_status = 'failed' then
    update public.agent_runs set status = 'failed', updated_at = now()
    where run_id = p_run_id;
  elsif not exists (
    select 1 from public.agent_steps s
    where s.run_id = p_run_id and s.status <> 'verified'
  ) then
    update public.agent_runs set status = 'completed', updated_at = now()
    where run_id = p_run_id;
  else
    update public.agent_runs set status = 'running', updated_at = now()
    where run_id = p_run_id and status in ('pending', 'running');
  end if;
end $$;

create or replace function public.register_agent_payload(
  p_user_id uuid,
  p_project_id uuid,
  p_run_id uuid,
  p_material_id text,
  p_storage_bucket text,
  p_storage_path text,
  p_manifest_path text,
  p_expires_at timestamptz
) returns table (manifest_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  new_manifest_id uuid;
begin
  if (select auth.uid()) is distinct from p_user_id
     and coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'User may register payloads only for the authenticated account' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.academic_projects p
    where p.id = p_project_id and p.user_id = p_user_id and p.deleted_at is null
  ) then
    raise exception 'Project is missing or is not owned by the user' using errcode = '42501';
  end if;
  if p_run_id is not null and not exists (
    select 1 from public.agent_runs r
    where r.run_id = p_run_id and r.project_id = p_project_id and r.user_id = p_user_id
  ) then
    raise exception 'Payload run does not belong to the project' using errcode = '42501';
  end if;
  if p_expires_at > now() + interval '7 days' or p_expires_at <= now() then
    raise exception 'Payload expiry must be within the seven day retention window' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.katedra_project_locks l
    where l.project_id = p_project_id and l.user_id = p_user_id
  ) or not exists (
    select 1 from public.entitlements e
    where e.user_id = p_user_id
      and e.academic_project_id = p_project_id
      and e.status = 'active'
      and e.purchase_expires_at > now()
  ) then
    raise exception 'An active paid project entitlement is required for temporary payloads' using errcode = '42501';
  end if;
  if p_storage_bucket <> 'katedra-temporary-materials'
     or p_storage_path not like p_user_id::text || '/' || p_project_id::text || '/%'
     or p_manifest_path not like p_user_id::text || '/' || p_project_id::text || '/%' then
    raise exception 'Payload storage path is outside the project namespace' using errcode = '42501';
  end if;

  insert into public.agent_payload_manifests (
    user_id, project_id, run_id, material_id, storage_bucket,
    storage_path, manifest_path, expires_at
  ) values (
    p_user_id, p_project_id, p_run_id, p_material_id, p_storage_bucket,
    p_storage_path, p_manifest_path, p_expires_at
  )
  on conflict (storage_path) do update
    set expires_at = excluded.expires_at, updated_at = now(), deleted_at = null
  returning agent_payload_manifests.manifest_id into new_manifest_id;

  return query select new_manifest_id;
end $$;

create or replace function public.cleanup_expired_agent_payloads(
  p_now timestamptz default now()
) returns table (
  manifest_id uuid,
  storage_bucket text,
  storage_path text,
  manifest_path text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'Only service role may clean temporary payload manifests' using errcode = '42501';
  end if;

  return query
  update public.agent_payload_manifests m
  set deleted_at = p_now, updated_at = p_now
  where m.deleted_at is null and m.expires_at <= p_now
  returning m.manifest_id, m.storage_bucket, m.storage_path, m.manifest_path;
end $$;

create or replace function public.pause_agent_run(
  p_user_id uuid,
  p_run_id uuid
) returns table (run_id uuid, status text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select auth.uid()) is distinct from p_user_id
     and coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'User may pause only its own agent run' using errcode = '42501';
  end if;
  return query
  update public.agent_runs r
  set status = 'paused', paused_at = now(), updated_at = now()
  where r.run_id = p_run_id and r.user_id = p_user_id
    and r.status in ('pending', 'running')
  returning r.run_id, r.status;
  if not found then
    raise exception 'Agent run is not active or does not belong to the user' using errcode = '40901';
  end if;
end $$;

create or replace function public.resume_agent_run(
  p_user_id uuid,
  p_run_id uuid
) returns table (run_id uuid, status text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select auth.uid()) is distinct from p_user_id
     and coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'User may resume only its own agent run' using errcode = '42501';
  end if;
  return query
  update public.agent_runs r
  set status = 'running', paused_at = null, updated_at = now()
  where r.run_id = p_run_id and r.user_id = p_user_id and r.status = 'paused'
  returning r.run_id, r.status;
  if not found then
    raise exception 'Agent run is not paused or does not belong to the user' using errcode = '40901';
  end if;
end $$;

create or replace function public.cancel_agent_run(
  p_user_id uuid,
  p_run_id uuid
) returns table (run_id uuid, status text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select auth.uid()) is distinct from p_user_id
     and coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'User may cancel only its own agent run' using errcode = '42501';
  end if;
  return query
  update public.agent_runs r
  set status = 'cancelled', cancelled_at = now(), updated_at = now()
  where r.run_id = p_run_id and r.user_id = p_user_id
    and r.status in ('pending', 'running', 'paused')
  returning r.run_id, r.status;
  if not found then
    raise exception 'Agent run is not active or does not belong to the user' using errcode = '40901';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Explicit least-privilege grants
-- ---------------------------------------------------------------------------

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'katedra_project_locks', 'agent_runs', 'agent_steps', 'agent_payload_manifests'
  ] loop
    execute format('revoke all on table public.%I from anon, authenticated', table_name);
    execute format('grant select on table public.%I to authenticated', table_name);
    execute format('grant all privileges on table public.%I to service_role', table_name);
  end loop;
end $$;

revoke all on function public.lock_paid_project(uuid, uuid, text, text, text, text, timestamptz)
  from public, anon, authenticated;
revoke all on function public.create_agent_run(uuid, uuid, text, text, text[])
  from public, anon;
revoke all on function public.claim_agent_step(uuid, text)
  from public, anon, authenticated;
revoke all on function public.complete_agent_step(uuid, uuid, text, smallint, text, jsonb, text, jsonb, boolean)
  from public, anon, authenticated;
revoke all on function public.register_agent_payload(uuid, uuid, uuid, text, text, text, text, timestamptz)
  from public, anon;
revoke all on function public.cleanup_expired_agent_payloads(timestamptz)
  from public, anon, authenticated;
revoke all on function public.pause_agent_run(uuid, uuid)
  from public, anon;
revoke all on function public.resume_agent_run(uuid, uuid)
  from public, anon;
revoke all on function public.cancel_agent_run(uuid, uuid)
  from public, anon;

grant execute on function public.lock_paid_project(uuid, uuid, text, text, text, text, timestamptz)
  to service_role;
grant execute on function public.create_agent_run(uuid, uuid, text, text, text[])
  to authenticated, service_role;
grant execute on function public.claim_agent_step(uuid, text)
  to service_role;
grant execute on function public.complete_agent_step(uuid, uuid, text, smallint, text, jsonb, text, jsonb, boolean)
  to service_role;
grant execute on function public.register_agent_payload(uuid, uuid, uuid, text, text, text, text, timestamptz)
  to authenticated, service_role;
grant execute on function public.cleanup_expired_agent_payloads(timestamptz)
  to service_role;
grant execute on function public.pause_agent_run(uuid, uuid)
  to authenticated, service_role;
grant execute on function public.resume_agent_run(uuid, uuid)
  to authenticated, service_role;
grant execute on function public.cancel_agent_run(uuid, uuid)
  to authenticated, service_role;

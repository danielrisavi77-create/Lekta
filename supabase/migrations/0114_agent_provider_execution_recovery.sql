-- Katedra owns provider calls/content. Lekta owns execution identity and custody.
-- No raw prompt/response enters these metadata rows. Consumed request identities
-- survive run/project/payload deletion; deleting bytes cannot reopen a start.
create table if not exists public.agent_provider_executions (
  execution_id uuid primary key default gen_random_uuid(),
  request_id text not null unique check(length(request_id) between 1 and 100),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null,
  run_id uuid not null,
  context_revision uuid not null,
  step_id uuid not null,
  attempt smallint not null check(attempt between 1 and 3),
  operation text not null check(operation in ('provider','passage')),
  provider text not null check(length(provider) between 1 and 100),
  model text not null check(length(model) between 1 and 100),
  input_sha256 text not null check(input_sha256 ~ '^[0-9a-f]{64}$'),
  state text not null default 'claimed' check(state in ('claimed','started','response_ready','settled')),
  lease_owner uuid not null,
  lease_expires_at timestamptz not null,
  start_token uuid,
  started_at timestamptz,
  manifest_id uuid,
  response_sha256 text check(response_sha256 ~ '^[0-9a-f]{64}$'),
  response_bytes bigint check(response_bytes between 1 and 1500000),
  descriptor_sha256 text check(descriptor_sha256 ~ '^[0-9a-f]{64}$'),
  descriptor_bytes bigint check(descriptor_bytes between 1 and 1500000),
  input_tokens integer check(input_tokens>=0),
  output_tokens integer check(output_tokens>=0),
  charged bigint check(charged>0),
  pricing_version text check(length(pricing_version) between 1 and 100),
  response_recorded_at timestamptz,
  response_committed_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.agent_provider_executions enable row level security;
revoke all on public.agent_provider_executions from public,anon,authenticated,service_role;
grant select on public.agent_provider_executions to service_role;

-- Global order: run -> execution -> manifest/intents -> billing advisory/row -> wallet.
-- Context replacement and withdrawal already lock the run first. Billing functions
-- never acquire run/execution locks, so this adds no reverse lock edge.
create or replace function public.assert_agent_execution_scope(
  p_user uuid,p_project uuid,p_run uuid,p_context uuid
) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.agent_runs;
begin
  if coalesce(current_setting('request.jwt.claim.role',true),'')<>'service_role' then
    raise exception 'Only service may access provider executions' using errcode='42501';
  end if;
  select * into r from public.agent_runs where run_id=p_run and user_id=p_user and project_id=p_project for update;
  if not found or r.status not in ('pending','running','paused','blocked','completed')
    or r.snapshot_consent_version is distinct from 'agentic-snapshot-v1'
    or r.snapshot_consent_at is null or r.snapshot_consent_at>now()
    or r.payload_cleanup_status in ('deletion_scheduled','deleted') then
    raise exception 'Execution run consent unavailable' using errcode='40901';
  end if;
  if not exists(select 1 from public.agent_payload_manifests m where m.run_id=p_run
    and m.user_id=p_user and m.project_id=p_project and m.material_id='run-context'
    and m.context_revision=p_context and m.context_state='active'
    and m.deleted_at is null and m.content_deleted_at is null and m.expires_at>now()) then
    raise exception 'Execution context unavailable' using errcode='40901';
  end if;
  if not exists(select 1 from public.academic_projects p
    join public.katedra_project_locks l on l.project_id=p.id and l.user_id=p.user_id and l.status='locked'
    join public.entitlements e on e.user_id=l.user_id and e.academic_project_id=p.id
      and e.product_id='katedra_pass_'||l.product_key and e.provider='stripe'
      and e.status='active' and e.purchase_expires_at>now()
    where p.id=p_project and p.user_id=p_user and p.deleted_at is null) then
    raise exception 'An active exact project Pass is required' using errcode='42501';
  end if;
end $$;
revoke all on function public.assert_agent_execution_scope(uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;

create or replace function public.claim_agent_provider_execution(p_identity jsonb,p_owner uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare e public.agent_provider_executions; m public.agent_payload_manifests;
  u uuid; p uuid; r uuid; c uuid; s uuid; a smallint;
begin
  if coalesce(current_setting('request.jwt.claim.role',true),'')<>'service_role' then
    raise exception 'Only service may claim provider executions' using errcode='42501';
  end if;
  if p_identity is null or jsonb_typeof(p_identity)<>'object' or p_owner is null
    or p_identity-array['userId','projectId','runId','contextRevision','stepId','attempt','operation','provider','model','inputSha256','requestId']<>'{}'::jsonb
    or not(p_identity ?& array['userId','projectId','runId','contextRevision','stepId','attempt','operation','provider','model','inputSha256','requestId'])
    or coalesce(jsonb_typeof(p_identity->'attempt'),'')<>'number'
    or coalesce(p_identity->>'attempt','') !~ '^[123]$'
    or coalesce(p_identity->>'operation','') not in ('provider','passage')
    or coalesce(p_identity->>'inputSha256','') !~ '^[0-9a-f]{64}$'
    or coalesce(length(trim(p_identity->>'requestId')),0) not between 1 and 100
    or coalesce(length(trim(p_identity->>'provider')),0) not between 1 and 100
    or coalesce(length(trim(p_identity->>'model')),0) not between 1 and 100 then
    raise exception 'Invalid execution identity' using errcode='22023';
  end if;
  u:=(p_identity->>'userId')::uuid; p:=(p_identity->>'projectId')::uuid;
  r:=(p_identity->>'runId')::uuid; c:=(p_identity->>'contextRevision')::uuid;
  s:=(p_identity->>'stepId')::uuid; a:=(p_identity->>'attempt')::smallint;
  if u is null or p is null or r is null or c is null or s is null or a not between 1 and 3 then
    raise exception 'Invalid execution scope' using errcode='22023';
  end if;
  perform public.assert_agent_execution_scope(u,p,r,c);
  -- The run lock serializes same-run callers; the unique request key catches
  -- cross-run collisions without leaking another execution's metadata.
  select * into e from public.agent_provider_executions where request_id=p_identity->>'requestId' for update;
  if found then
    if row(e.user_id,e.project_id,e.run_id,e.context_revision,e.step_id,e.attempt,e.operation,e.provider,e.model,e.input_sha256)
      is distinct from row(u,p,r,c,s,a,p_identity->>'operation',p_identity->>'provider',p_identity->>'model',p_identity->>'inputSha256') then
      raise exception 'Execution identity conflict' using errcode='23505';
    end if;
    if e.state<>'claimed' then
      select * into m from public.agent_payload_manifests where manifest_id=e.manifest_id;
      if not found or m.deleted_at is not null or m.content_deleted_at is not null or m.expires_at<=now() then
        return jsonb_build_object('status','unavailable','executionId',e.execution_id);
      end if;
      return jsonb_build_object('status',case when e.state in ('response_ready','settled') then e.state
          when e.response_recorded_at is not null then 'response_recorded' else 'unresolved' end,
        'executionId',e.execution_id,'manifestId',m.manifest_id,'storagePath',m.storage_path,
        'manifestPath',m.manifest_path,'expiresAt',m.expires_at,
        'responseSha256',e.response_sha256,'responseBytes',e.response_bytes,
        'descriptorSha256',e.descriptor_sha256,'descriptorBytes',e.descriptor_bytes,
        'inputTokens',e.input_tokens,'outputTokens',e.output_tokens,'charged',e.charged,'pricingVersion',e.pricing_version);
    end if;
    if e.lease_owner<>p_owner and e.lease_expires_at>now() then
      return jsonb_build_object('status','busy','executionId',e.execution_id);
    end if;
    if e.lease_expires_at<=now() then
      update public.agent_provider_executions set lease_owner=p_owner,lease_expires_at=now()+interval '60 seconds'
        where execution_id=e.execution_id returning * into e;
    end if;
  else
    insert into public.agent_provider_executions(request_id,user_id,project_id,run_id,context_revision,
      step_id,attempt,operation,provider,model,input_sha256,lease_owner,lease_expires_at)
    values(p_identity->>'requestId',u,p,r,c,s,a,p_identity->>'operation',p_identity->>'provider',
      p_identity->>'model',p_identity->>'inputSha256',p_owner,now()+interval '60 seconds') returning * into e;
  end if;
  return jsonb_build_object('status','claimed','executionId',e.execution_id,'leaseExpiresAt',e.lease_expires_at);
end $$;
revoke all on function public.claim_agent_provider_execution(jsonb,uuid) from public,anon,authenticated;
grant execute on function public.claim_agent_provider_execution(jsonb,uuid) to service_role;

create or replace function public.start_agent_provider_execution(p_execution uuid,p_owner uuid,p_worker_id text,p_step_claimed_at timestamptz)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare e public.agent_provider_executions; m public.agent_payload_manifests; prefix text;
begin
  if coalesce(current_setting('request.jwt.claim.role',true),'')<>'service_role' then
    raise exception 'Only service may start provider executions' using errcode='42501';
  end if;
  select * into e from public.agent_provider_executions where execution_id=p_execution;
  if not found then raise exception 'Execution unavailable' using errcode='40901'; end if;
  perform public.assert_agent_execution_scope(e.user_id,e.project_id,e.run_id,e.context_revision);
  select * into e from public.agent_provider_executions where execution_id=p_execution for update;
  if e.state<>'claimed' then return jsonb_build_object('status','unresolved','executionId',e.execution_id); end if;
  if p_owner is null or e.lease_owner<>p_owner or e.lease_expires_at<=now() then
    raise exception 'Execution lease unavailable' using errcode='40901';
  end if;
  if not exists(select 1 from public.agent_steps s where s.step_id=e.step_id and s.run_id=e.run_id
      and s.attempt=e.attempt and s.status='running'
      and s.lease_owner=p_worker_id and s.claimed_at=p_step_claimed_at and s.lease_expires_at>now())
    or not exists(select 1 from public.agent_runs r where r.run_id=e.run_id and r.status='running') then
    raise exception 'Execution step is not running' using errcode='40901';
  end if;
  prefix:=e.user_id::text||'/'||e.project_id::text||'/'||e.run_id::text||'/executions/'||e.execution_id::text;
  insert into public.agent_payload_manifests(user_id,project_id,run_id,material_id,storage_bucket,storage_path,manifest_path,expires_at)
    values(e.user_id,e.project_id,e.run_id,'agent-execution:'||e.execution_id::text,
      'katedra-temporary-materials',prefix||'.json',prefix||'.manifest.json',now()+interval '72 hours') returning * into m;
  -- Never regenerate under a legacy billing identity, even if its response was
  -- never captured. Existing billing authority uses the same advisory key.
  perform pg_advisory_xact_lock(hashtext(e.request_id));
  if exists(select 1 from public.katedra_billing_attempts where request_id=e.request_id) then
    raise exception 'Billing identity already consumed' using errcode='23505';
  end if;
  update public.agent_provider_executions set state='started',start_token=gen_random_uuid(),started_at=now(),manifest_id=m.manifest_id
    where execution_id=e.execution_id returning * into e;
  -- The token is returned only by this transition, never by a repeated start or claim.
  return jsonb_build_object('status','start','executionId',e.execution_id,'startToken',e.start_token,
    'manifestId',m.manifest_id,'storagePath',m.storage_path,'manifestPath',m.manifest_path,
    'createdAt',m.created_at,'expiresAt',m.expires_at);
end $$;
revoke all on function public.start_agent_provider_execution(uuid,uuid,text,timestamptz) from public,anon,authenticated;
grant execute on function public.start_agent_provider_execution(uuid,uuid,text,timestamptz) to service_role;

-- Original start token may submit late usage even after consent withdrawal.
-- This stores metadata only; upload/publication still require live custody.
create or replace function public.record_agent_provider_response(p_execution uuid,p_start_token uuid,p_evidence jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare e public.agent_provider_executions; i integer; o integer; amount bigint;
  body_hash text; descriptor_hash text; body_size bigint; descriptor_size bigint; pricing text;
begin
  if coalesce(current_setting('request.jwt.claim.role',true),'')<>'service_role' then
    raise exception 'Only service may record provider responses' using errcode='42501';
  end if;
  if p_evidence is null or jsonb_typeof(p_evidence)<>'object'
    or p_evidence-array['responseSha256','responseBytes','descriptorSha256','descriptorBytes','inputTokens','outputTokens','charged','pricingVersion']<>'{}'::jsonb then
    raise exception 'Invalid response evidence' using errcode='22023';
  end if;
  body_hash:=p_evidence->>'responseSha256'; descriptor_hash:=p_evidence->>'descriptorSha256';
  body_size:=(p_evidence->>'responseBytes')::bigint; descriptor_size:=(p_evidence->>'descriptorBytes')::bigint;
  i:=(p_evidence->>'inputTokens')::integer; o:=(p_evidence->>'outputTokens')::integer;
  amount:=(p_evidence->>'charged')::bigint; pricing:=p_evidence->>'pricingVersion';
  if coalesce(body_hash,'') !~ '^[0-9a-f]{64}$' or coalesce(descriptor_hash,'') !~ '^[0-9a-f]{64}$'
    or coalesce(body_size,0) not between 1 and 1500000 or coalesce(descriptor_size,0) not between 1 and 1500000
    or coalesce(length(pricing),0) not between 1 and 100
    or not ((i is null and o is null and amount is null)
      or (i is not null and o is not null and amount is not null and i>=0 and o>=0
        and (i>0 or o>0) and amount between 1 and 1000000000000)) then
    raise exception 'Invalid immutable response evidence' using errcode='22023';
  end if;
  select * into e from public.agent_provider_executions where execution_id=p_execution;
  if not found then raise exception 'Execution unavailable' using errcode='40901'; end if;
  perform 1 from public.agent_runs where run_id=e.run_id for update;
  select * into e from public.agent_provider_executions where execution_id=p_execution for update;
  if e.state='claimed' or p_start_token is null or e.start_token is distinct from p_start_token then
    raise exception 'Original execution start token required' using errcode='42501';
  end if;
  if e.response_recorded_at is not null then
    if row(e.response_sha256,e.response_bytes,e.descriptor_sha256,e.descriptor_bytes,e.input_tokens,e.output_tokens,e.charged,e.pricing_version)
      is distinct from row(body_hash,body_size,descriptor_hash,descriptor_size,i,o,amount,pricing) then
      raise exception 'Original response evidence is immutable' using errcode='23505';
    end if;
  else
    update public.agent_provider_executions set response_sha256=body_hash,response_bytes=body_size,
      descriptor_sha256=descriptor_hash,descriptor_bytes=descriptor_size,input_tokens=i,output_tokens=o,
      charged=amount,pricing_version=pricing,response_recorded_at=now() where execution_id=e.execution_id;
  end if;
  return jsonb_build_object('status','response_recorded','executionId',e.execution_id);
end $$;
revoke all on function public.record_agent_provider_response(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.record_agent_provider_response(uuid,uuid,jsonb) to service_role;

-- No caller-supplied replacement evidence or start token is needed here: a
-- later service worker can finish an ambiguous publication of identical bytes.
create or replace function public.commit_agent_provider_response(p_execution uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare e public.agent_provider_executions; m public.agent_payload_manifests;
begin
  if coalesce(current_setting('request.jwt.claim.role',true),'')<>'service_role' then
    raise exception 'Only service may publish provider responses' using errcode='42501';
  end if;
  select * into e from public.agent_provider_executions where execution_id=p_execution;
  if not found then raise exception 'Execution unavailable' using errcode='40901'; end if;
  perform public.assert_agent_execution_scope(e.user_id,e.project_id,e.run_id,e.context_revision);
  select * into e from public.agent_provider_executions where execution_id=p_execution for update;
  select * into m from public.agent_payload_manifests where manifest_id=e.manifest_id for update;
  if not found or m.deleted_at is not null or m.content_deleted_at is not null or m.expires_at<=now()
    or e.response_recorded_at is null or e.state='claimed' then
    raise exception 'Response custody unavailable' using errcode='40901';
  end if;
  if (select count(*) from public.agent_payload_upload_intents u where u.manifest_id=m.manifest_id and u.state='uploaded'
    and ((u.object_kind='body' and u.body_sha256=e.response_sha256 and u.body_bytes=e.response_bytes)
      or (u.object_kind='manifest' and u.body_sha256=e.descriptor_sha256 and u.body_bytes=e.descriptor_bytes)))<>2
    or (select count(*) from storage.objects o where o.bucket_id=m.storage_bucket and o.name in(m.storage_path,m.manifest_path))<>2 then
    raise exception 'Original response uploads are incomplete' using errcode='40901';
  end if;
  if e.state='started' then
    update public.agent_provider_executions set state='response_ready',response_committed_at=now() where execution_id=e.execution_id;
  end if;
  return jsonb_build_object('status','response_ready','executionId',e.execution_id);
end $$;
revoke all on function public.commit_agent_provider_response(uuid) from public,anon,authenticated;
grant execute on function public.commit_agent_provider_response(uuid) to service_role;

create or replace function public.settle_agent_provider_execution(p_execution uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare e public.agent_provider_executions; m public.agent_payload_manifests; outcome jsonb;
begin
  if coalesce(current_setting('request.jwt.claim.role',true),'')<>'service_role' then
    raise exception 'Only service may settle provider executions' using errcode='42501';
  end if;
  select * into e from public.agent_provider_executions where execution_id=p_execution;
  if not found then raise exception 'Execution unavailable' using errcode='40901'; end if;
  perform public.assert_agent_execution_scope(e.user_id,e.project_id,e.run_id,e.context_revision);
  select * into e from public.agent_provider_executions where execution_id=p_execution for update;
  select * into m from public.agent_payload_manifests where manifest_id=e.manifest_id for update;
  if not found or m.deleted_at is not null or m.content_deleted_at is not null or m.expires_at<=now()
    or e.state not in ('response_ready','settled') then
    raise exception 'Original response must be available before settlement' using errcode='40901';
  end if;
  if e.input_tokens is null or e.output_tokens is null or e.charged is null then
    return jsonb_build_object('status','pending_reconciliation','reason','usage_evidence_required');
  end if;
  -- record_katedra_billing_usage validates existing identity/usage/amount, including
  -- already-settled rows. No current pricing or replay input can change the debit.
  outcome:=public.record_katedra_billing_usage(e.user_id,e.project_id,e.request_id,e.charged,e.model,e.input_tokens,e.output_tokens);
  if outcome->>'status'<>'already_settled' then outcome:=public.reconcile_katedra_billing(e.request_id); end if;
  if outcome->>'status' in ('settled','already_settled') then
    update public.agent_provider_executions set state='settled' where execution_id=e.execution_id;
  end if;
  return outcome||jsonb_build_object('charged',e.charged,'inputTokens',e.input_tokens,'outputTokens',e.output_tokens,'pricingVersion',e.pricing_version);
end $$;
revoke all on function public.settle_agent_provider_execution(uuid) from public,anon,authenticated;
grant execute on function public.settle_agent_provider_execution(uuid) to service_role;

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
      elsif new.material_id ~ '^agent-execution:[0-9a-f-]{36}$' and new.run_id is not null then
        valid:=new.storage_path=run_prefix||'executions/'||substr(new.material_id,17)||'.json'
          and new.manifest_path=run_prefix||'executions/'||substr(new.material_id,17)||'.manifest.json';
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

-- Raw provider responses are service-recovery evidence, never owner Storage artifacts.
create or replace function public.can_read_agent_payload(p_bucket text,p_path text)
returns boolean language sql stable security definer set search_path=public,pg_temp
as $$
  select exists(
    select 1 from public.agent_payload_manifests m
    join public.academic_projects p on p.id=m.project_id and p.user_id=m.user_id and p.deleted_at is null
    where m.user_id=(select auth.uid()) and m.storage_bucket=p_bucket
      and p_path in(m.storage_path,m.manifest_path)
      and m.material_id not like 'agent-execution:%'
      and (m.material_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        or (m.material_consent_version='material-storage-v1' and m.material_consent_at is not null and m.material_upload_complete))
      and m.deleted_at is null and m.content_deleted_at is null and m.expires_at>now()
      and (m.run_id is null or exists(
        select 1 from public.agent_runs r where r.run_id=m.run_id and r.user_id=m.user_id and r.project_id=m.project_id
          and r.snapshot_consent_version='agentic-snapshot-v1' and r.snapshot_consent_at is not null
      ))
  );
$$;

-- Execution responses stay attached when user-selected materials change.
create or replace function public.replace_agent_payloads_for_run(
  p_user_id uuid,
  p_project_id uuid,
  p_run_id uuid,
  p_material_ids text[]
) returns table (
  material_id text,
  manifest_id uuid
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  requested_count integer := coalesce(array_length(p_material_ids, 1), 0);
  eligible_count integer := 0;
begin
  if (select auth.uid()) is distinct from p_user_id
     and coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'User may replace payloads only for the authenticated account' using errcode = '42501';
  end if;
  if p_user_id is null or p_project_id is null or p_run_id is null then
    raise exception 'Invalid agent payload replacement request' using errcode = '22023';
  end if;
  if requested_count > 100 then
    raise exception 'Too many payloads to replace' using errcode = '22023';
  end if;
  if exists (
    select 1 from (
      select unnest(coalesce(p_material_ids, '{}'::text[])) as material_id
      group by material_id
      having count(*) > 1
    ) duplicate_ids
  ) then
    raise exception 'Duplicate payload ids are not allowed' using errcode = '22023';
  end if;
  if exists (
    select 1
    from unnest(coalesce(p_material_ids, '{}'::text[])) as requested(material_id)
    where nullif(trim(requested.material_id), '') is null
       or length(requested.material_id) > 200
       or requested.material_id = 'run-context'
       or requested.material_id like 'agent-result:%'
       or requested.material_id like 'agent-execution:%'
  ) then
    raise exception 'Only user input material ids may be replaced' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.academic_projects p
    where p.id = p_project_id and p.user_id = p_user_id and p.deleted_at is null
  ) then
    raise exception 'Project is missing or is not owned by the user' using errcode = '42501';
  end if;
  -- Serialize replacement requests for the same run before checking or
  -- mutating its selection. This also keeps the lock order consistent with
  -- worker lifecycle transitions, which lock the run before its steps.
  perform 1
  from public.agent_runs r
  where r.run_id = p_run_id
    and r.project_id = p_project_id
    and r.user_id = p_user_id
    and r.status in ('initializing', 'pending', 'running', 'paused', 'blocked')
  for update;

  if not found then
    raise exception 'Agent run is missing, inactive or does not belong to the project' using errcode = '40901';
  end if;
  if not exists (
    select 1
    from public.katedra_project_locks l
    where l.project_id = p_project_id
      and l.user_id = p_user_id
      and l.status = 'locked'
      and exists (
        select 1 from public.entitlements e
        where e.user_id = p_user_id
          and e.academic_project_id = p_project_id
          and e.product_id = ('katedra_pass_' || l.product_key)
          and e.status = 'active'
          and e.purchase_expires_at > now()
      )
  ) then
    raise exception 'An active exact Katedra Pass is required for temporary payloads' using errcode = '42501';
  end if;

  -- Lock every requested material before eligibility is evaluated. Without
  -- this second lock, two runs could both observe the same unassigned
  -- material and attach it successfully in competing transactions.
  perform 1
  from public.agent_payload_manifests m
  where m.user_id = p_user_id
    and m.project_id = p_project_id
    and m.material_id = any(coalesce(p_material_ids, '{}'::text[]))
  order by m.material_id
  for update;

  select count(*)::integer into eligible_count
  from public.agent_payload_manifests m
  where m.user_id = p_user_id
    and m.project_id = p_project_id
    and m.material_id = any(coalesce(p_material_ids, '{}'::text[]))
    and m.deleted_at is null
    and m.expires_at > now()
    and (
      m.run_id is null
      or m.run_id = p_run_id
      or not exists (
        select 1 from public.agent_runs previous
        where previous.run_id = m.run_id
          and previous.status in ('initializing', 'pending', 'running', 'paused', 'blocked')
      )
    );

  if eligible_count <> requested_count then
    raise exception 'One or more requested payloads are missing, expired or already active in another run' using errcode = '40901';
  end if;

  update public.agent_payload_manifests m
  set run_id = null, updated_at = now()
  where m.user_id = p_user_id
    and m.project_id = p_project_id
    and m.run_id = p_run_id
    and m.deleted_at is null
    and m.material_id <> 'run-context'
    and m.material_id not like 'agent-result:%'
    and m.material_id not like 'agent-execution:%';

  return query
  update public.agent_payload_manifests m
  set run_id = p_run_id, updated_at = now()
  where m.user_id = p_user_id
    and m.project_id = p_project_id
    and m.material_id = any(coalesce(p_material_ids, '{}'::text[]))
    and m.deleted_at is null
    and m.expires_at > now()
    and (
      m.run_id is null
      or m.run_id = p_run_id
      or not exists (
        select 1 from public.agent_runs previous
        where previous.run_id = m.run_id
          and previous.status in ('initializing', 'pending', 'running', 'paused', 'blocked')
      )
    )
  returning m.material_id, m.manifest_id;
end $$;

revoke all on function public.replace_agent_payloads_for_run(uuid, uuid, uuid, text[])
  from public, anon;
grant execute on function public.replace_agent_payloads_for_run(uuid, uuid, uuid, text[])
  to authenticated, service_role;

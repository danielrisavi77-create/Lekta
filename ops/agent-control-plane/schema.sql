-- Lekta agent control plane v2B.
-- NAMJERNO nije u supabase/migrations/: ovaj SQL pripada zasebnom control-plane projektu,
-- nikad Lektinoj produkcijskoj ili staging bazi.

create schema if not exists agent_control;

revoke all on schema agent_control from public, anon, authenticated, service_role;

create table if not exists agent_control.control_settings (
  setting_key text primary key check (setting_key ~ '^[a-z][a-z0-9_]{1,63}$'),
  setting_value text not null,
  updated_at timestamptz not null default clock_timestamp()
);

create table if not exists agent_control.agent_sessions (
  session_name text primary key,
  machine text not null check (machine in ('laptop', 'desktop', 'claude_cloud')),
  role text not null check (role in ('coordinator', 'implementer', 'reviewer', 'integration', 'explorer', 'flex')),
  environment_kind text check (environment_kind is null or char_length(environment_kind) <= 128),
  registered_at timestamptz not null default clock_timestamp(),
  last_seen_at timestamptz not null default clock_timestamp(),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object')
);

create table if not exists agent_control.agent_leases (
  lease_id uuid primary key default gen_random_uuid(),
  task_id text not null check (task_id ~ '^T[0-9]{2,4}$'),
  session_name text not null references agent_control.agent_sessions(session_name) on update cascade on delete restrict,
  base_sha text not null check (base_sha ~ '^[0-9a-f]{40}$'),
  scope_hash text not null check (scope_hash ~ '^[0-9a-f]{64}$'),
  capability_hash text not null check (capability_hash ~ '^[0-9a-f]{64}$'),
  scope jsonb not null check (jsonb_typeof(scope) = 'object'),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  state text not null default 'active' check (state in ('active', 'released', 'expired')),
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  closed_at timestamptz,
  release_reason text check (release_reason is null or char_length(release_reason) <= 200)
);

create index if not exists agent_leases_active_expiry_idx
  on agent_control.agent_leases (expires_at)
  where state = 'active';

create index if not exists agent_leases_session_task_idx
  on agent_control.agent_leases (session_name, task_id, state);

create unique index if not exists agent_leases_one_active_task_idx
  on agent_control.agent_leases (task_id)
  where state = 'active';

create unique index if not exists agent_leases_one_active_session_idx
  on agent_control.agent_leases (session_name)
  where state = 'active';

create unique index if not exists agent_leases_one_active_capability_idx
  on agent_control.agent_leases (capability_hash)
  where state = 'active';

create table if not exists agent_control.agent_path_leases (
  lease_id uuid not null references agent_control.agent_leases(lease_id) on delete cascade,
  pattern text not null,
  root text not null,
  is_tree boolean not null,
  primary key (lease_id, pattern)
);

create index if not exists agent_path_leases_root_idx
  on agent_control.agent_path_leases (root);

create table if not exists agent_control.agent_events (
  event_id bigint generated always as identity primary key,
  occurred_at timestamptz not null default clock_timestamp(),
  event_type text not null,
  session_name text,
  task_id text,
  lease_id uuid,
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object')
);

create index if not exists agent_events_occurred_at_idx
  on agent_control.agent_events (occurred_at desc);

alter table agent_control.control_settings enable row level security;
alter table agent_control.agent_sessions enable row level security;
alter table agent_control.agent_leases enable row level security;
alter table agent_control.agent_path_leases enable row level security;
alter table agent_control.agent_events enable row level security;

create or replace function agent_control.valid_session_name(value text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select value is not null
    and value ~ '^[A-Za-z0-9][A-Za-z0-9._:@-]{0,63}$'
$$;

create or replace function agent_control.valid_scope_pattern(value text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_body text;
begin
  if value is null or value = '' or value <> btrim(value) then
    return false;
  end if;
  if left(value, 1) = '/'
     or left(value, 2) = './'
     or value ~ '^[A-Za-z]:/'
     or position(E'\\' in value) > 0
     or value like '%//%'
     or (right(value, 1) = '/' and right(value, 3) <> '/**') then
    return false;
  end if;
  if value ~ '(^|/)\.\.($|/)' then
    return false;
  end if;

  if right(value, 3) = '/**' then
    v_body := left(value, length(value) - 3);
  else
    v_body := value;
  end if;

  if v_body = ''
     or position('*' in v_body) > 0
     or position('?' in v_body) > 0
     or position('[' in v_body) > 0
     or position(']' in v_body) > 0 then
    return false;
  end if;

  return true;
end;
$$;

create or replace function agent_control.scope_root(value text)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select case when right(value, 3) = '/**' then left(value, length(value) - 3) else value end
$$;

create or replace function agent_control.scope_is_tree(value text)
returns boolean
language sql
immutable
strict
set search_path = ''
as $$
  select right(value, 3) = '/**'
$$;

create or replace function agent_control.paths_overlap(
  a_root text,
  a_tree boolean,
  b_root text,
  b_tree boolean
)
returns boolean
language sql
immutable
strict
set search_path = ''
as $$
  select case
    when not a_tree and not b_tree then a_root = b_root
    when a_tree and b_tree then
      a_root = b_root
      or left(a_root, length(b_root) + 1) = b_root || '/'
      or left(b_root, length(a_root) + 1) = a_root || '/'
    when a_tree then
      b_root = a_root or left(b_root, length(a_root) + 1) = a_root || '/'
    else
      a_root = b_root or left(a_root, length(b_root) + 1) = b_root || '/'
  end
$$;

create or replace function agent_control.canonical_scope_valid(scope jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_key text;
  v_item jsonb;
  v_previous text;
  v_current text;
  v_seen text[];
begin
  if scope is null or jsonb_typeof(scope) <> 'object' then
    return false;
  end if;
  if (scope - 'read' - 'write' - 'forbidden') <> '{}'::jsonb then
    return false;
  end if;

  foreach v_key in array array['read', 'write', 'forbidden'] loop
    if not (scope ? v_key) or jsonb_typeof(scope -> v_key) <> 'array' then
      return false;
    end if;
    if v_key = 'write' and jsonb_array_length(scope -> v_key) = 0 then
      return false;
    end if;

    v_previous := null;
    v_seen := array[]::text[];

    for v_item in select value from jsonb_array_elements(scope -> v_key) loop
      if jsonb_typeof(v_item) <> 'string' then
        return false;
      end if;
      v_current := v_item #>> '{}';
      if not agent_control.valid_scope_pattern(v_current) then
        return false;
      end if;
      if v_current = any(v_seen) then
        return false;
      end if;
      if v_previous is not null and v_previous collate "C" > v_current collate "C" then
        return false;
      end if;
      v_seen := array_append(v_seen, v_current);
      v_previous := v_current;
    end loop;
  end loop;

  return true;
end;
$$;

create or replace function agent_control.expire_stale_leases(v_at_time timestamptz)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  with expired as (
    update agent_control.agent_leases l
       set state = 'expired',
           closed_at = v_at_time,
           release_reason = coalesce(l.release_reason, 'ttl_expired')
     where l.state = 'active'
       and l.expires_at <= v_at_time
    returning l.lease_id, l.session_name, l.task_id
  )
  insert into agent_control.agent_events(event_type, session_name, task_id, lease_id, details)
  select 'lease_expired', session_name, task_id, lease_id, '{}'::jsonb
  from expired;
end;
$$;

create or replace function agent_control.register_session(payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_session_name text := payload ->> 'sessionName';
  v_machine text := payload ->> 'machine';
  v_role text := payload ->> 'role';
  v_environment_kind text := payload ->> 'environmentKind';
  v_at_time timestamptz := clock_timestamp();
  v_existing_machine text;
  v_existing_role text;
begin
  perform pg_catalog.pg_advisory_xact_lock(1279341101);

  if not agent_control.valid_session_name(v_session_name)
     or v_machine not in ('laptop', 'desktop', 'claude_cloud')
     or v_role not in ('coordinator', 'implementer', 'reviewer', 'integration', 'explorer', 'flex')
     or char_length(coalesce(v_environment_kind, '')) > 128 then
    return jsonb_build_object('ok', false, 'code', 'invalid_session', 'message', 'Nevaljana registracija sesije.');
  end if;

  select s.machine, s.role
    into v_existing_machine, v_existing_role
    from agent_control.agent_sessions s
   where s.session_name = v_session_name;

  if found then
    if v_existing_machine <> v_machine or v_existing_role <> v_role then
      return jsonb_build_object(
        'ok', false,
        'code', 'session_identity_conflict',
        'message', 'Session name je vec registriran za drugi stroj ili ulogu.'
      );
    end if;

    update agent_control.agent_sessions s
       set environment_kind = v_environment_kind,
           last_seen_at = v_at_time
     where s.session_name = v_session_name;

    return jsonb_build_object(
      'ok', true,
      'sessionName', v_session_name,
      'lastSeenAt', v_at_time,
      'idempotent', true
    );
  end if;

  insert into agent_control.agent_sessions(session_name, machine, role, environment_kind, registered_at, last_seen_at)
  values (v_session_name, v_machine, v_role, v_environment_kind, v_at_time, v_at_time);

  insert into agent_control.agent_events(event_type, session_name, details)
  values ('session_registered', v_session_name, jsonb_build_object('machine', v_machine, 'role', v_role));

  return jsonb_build_object(
    'ok', true,
    'sessionName', v_session_name,
    'lastSeenAt', v_at_time,
    'idempotent', false
  );
end;
$$;

create or replace function agent_control.heartbeat_session(payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_session_name text := payload ->> 'sessionName';
  v_at_time timestamptz := clock_timestamp();
begin
  if not agent_control.valid_session_name(v_session_name) then
    return jsonb_build_object('ok', false, 'code', 'invalid_session', 'message', 'Nevaljan sessionName.');
  end if;

  update agent_control.agent_sessions s
     set last_seen_at = v_at_time
   where s.session_name = v_session_name;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'session_not_registered', 'message', 'Sesija nije registrirana.');
  end if;

  return jsonb_build_object('ok', true, 'sessionName', v_session_name, 'lastSeenAt', v_at_time);
end;
$$;

create or replace function agent_control.claim_lease(payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_task_id text := payload ->> 'taskId';
  v_session_name text := payload ->> 'sessionName';
  v_base_sha text := lower(payload ->> 'baseSha');
  v_scope_hash text := lower(payload ->> 'scopeHash');
  v_capability_hash text := lower(payload ->> 'capabilityHash');
  v_scope jsonb := payload -> 'scope';
  v_metadata jsonb := coalesce(payload -> 'metadata', '{}'::jsonb);
  v_ttl_seconds integer;
  v_at_time timestamptz := clock_timestamp();
  v_existing agent_control.agent_leases%rowtype;
  v_busy agent_control.agent_leases%rowtype;
  v_conflict record;
  v_lease_id uuid;
  v_pattern text;
begin
  begin
    v_ttl_seconds := (payload ->> 'ttlSeconds')::integer;
  exception when others then
    return jsonb_build_object('ok', false, 'code', 'invalid_ttl', 'message', 'ttlSeconds nije valjan.');
  end;

  perform pg_catalog.pg_advisory_xact_lock(1279341101);
  perform agent_control.expire_stale_leases(v_at_time);

  if v_task_id !~ '^T[0-9]{2,4}$'
     or not agent_control.valid_session_name(v_session_name)
     or v_base_sha !~ '^[0-9a-f]{40}$'
     or v_scope_hash !~ '^[0-9a-f]{64}$'
     or v_capability_hash !~ '^[0-9a-f]{64}$'
     or v_ttl_seconds < 120
     or v_ttl_seconds > 3600
     or not agent_control.canonical_scope_valid(v_scope)
     or jsonb_typeof(v_metadata) <> 'object'
     or octet_length(v_metadata::text) > 2048 then
    return jsonb_build_object('ok', false, 'code', 'invalid_claim', 'message', 'Claim payload nije kanonski ili valjan.');
  end if;

  if not exists (
    select 1 from agent_control.agent_sessions s where s.session_name = v_session_name
  ) then
    return jsonb_build_object('ok', false, 'code', 'session_not_registered', 'message', 'Sesija nije registrirana.');
  end if;

  select *
    into v_existing
    from agent_control.agent_leases l
   where l.session_name = v_session_name
     and l.task_id = v_task_id
     and l.state = 'active'
     and l.expires_at > v_at_time
   order by l.created_at desc
   limit 1;

  if found then
    if v_existing.base_sha = v_base_sha
       and v_existing.scope_hash = v_scope_hash
       and v_existing.scope = v_scope then
      if v_existing.capability_hash <> v_capability_hash then
        return jsonb_build_object(
          'ok', false,
          'code', 'lease_capability_mismatch',
          'message', 'Aktivni lease postoji, ali capability ne odgovara izvornom claimu.',
          'leaseId', v_existing.lease_id
        );
      end if;
      return jsonb_build_object(
        'ok', true,
        'leaseId', v_existing.lease_id,
        'idempotent', true,
        'expiresAt', v_existing.expires_at,
        'scopeHash', v_existing.scope_hash
      );
    end if;

    return jsonb_build_object(
      'ok', false,
      'code', 'lease_requires_expand',
      'message', 'Sesija vec ima aktivan lease za task s drugim baseom ili scopeom.',
      'leaseId', v_existing.lease_id
    );
  end if;

  select *
    into v_busy
    from agent_control.agent_leases l
   where l.session_name = v_session_name
     and l.state = 'active'
     and l.expires_at > v_at_time
   limit 1;

  if found then
    return jsonb_build_object(
      'ok', false,
      'code', 'session_busy',
      'message', 'Sesija vec ima drugi aktivni write lease.',
      'leaseId', v_busy.lease_id,
      'taskId', v_busy.task_id
    );
  end if;

  select *
    into v_busy
    from agent_control.agent_leases l
   where l.task_id = v_task_id
     and l.state = 'active'
     and l.expires_at > v_at_time
   limit 1;

  if found then
    return jsonb_build_object(
      'ok', false,
      'code', 'task_busy',
      'message', 'Task vec ima aktivni write lease.',
      'leaseId', v_busy.lease_id,
      'sessionName', v_busy.session_name
    );
  end if;

  for v_pattern in
    select value #>> '{}' from jsonb_array_elements(v_scope -> 'write')
  loop
    select l.lease_id, l.task_id, l.session_name, p.pattern
      into v_conflict
      from agent_control.agent_path_leases p
      join agent_control.agent_leases l on l.lease_id = p.lease_id
     where l.state = 'active'
       and l.expires_at > v_at_time
       and agent_control.paths_overlap(
         p.root,
         p.is_tree,
         agent_control.scope_root(v_pattern),
         agent_control.scope_is_tree(v_pattern)
       )
     limit 1;

    if found then
      insert into agent_control.agent_events(event_type, session_name, task_id, lease_id, details)
      values (
        'claim_rejected_conflict',
        v_session_name,
        v_task_id,
        v_conflict.lease_id,
        jsonb_build_object(
          'requestedPattern', v_pattern,
          'conflictingPattern', v_conflict.pattern,
          'conflictingTask', v_conflict.task_id,
          'conflictingSession', v_conflict.session_name
        )
      );

      return jsonb_build_object(
        'ok', false,
        'code', 'lease_conflict',
        'message', 'Write scope se preklapa s aktivnim leaseom.',
        'conflict', jsonb_build_object(
          'leaseId', v_conflict.lease_id,
          'taskId', v_conflict.task_id,
          'sessionName', v_conflict.session_name,
          'pattern', v_conflict.pattern,
          'requestedPattern', v_pattern
        )
      );
    end if;
  end loop;

  insert into agent_control.agent_leases(task_id, session_name, base_sha, scope_hash, capability_hash, scope, metadata, expires_at)
  values (
    v_task_id,
    v_session_name,
    v_base_sha,
    v_scope_hash,
    v_capability_hash,
    v_scope,
    v_metadata,
    v_at_time + make_interval(secs => v_ttl_seconds)
  )
  returning lease_id into v_lease_id;

  insert into agent_control.agent_path_leases(lease_id, pattern, root, is_tree)
  select
    v_lease_id,
    value #>> '{}',
    agent_control.scope_root(value #>> '{}'),
    agent_control.scope_is_tree(value #>> '{}')
  from jsonb_array_elements(v_scope -> 'write');

  update agent_control.agent_sessions s
     set last_seen_at = v_at_time
   where s.session_name = v_session_name;

  insert into agent_control.agent_events(event_type, session_name, task_id, lease_id, details)
  values (
    'lease_claimed',
    v_session_name,
    v_task_id,
    v_lease_id,
    jsonb_build_object('baseSha', v_base_sha, 'scopeHash', v_scope_hash, 'ttlSeconds', v_ttl_seconds)
  );

  return jsonb_build_object(
    'ok', true,
    'leaseId', v_lease_id,
    'idempotent', false,
    'expiresAt', v_at_time + make_interval(secs => v_ttl_seconds),
    'scopeHash', v_scope_hash
  );
end;
$$;

create or replace function agent_control.renew_lease(payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_requested_id uuid;
  v_ttl_seconds integer;
  v_at_time timestamptz := clock_timestamp();
  v_lease agent_control.agent_leases%rowtype;
begin
  begin
    v_requested_id := (payload ->> 'leaseId')::uuid;
    v_ttl_seconds := (payload ->> 'ttlSeconds')::integer;
  exception when others then
    return jsonb_build_object('ok', false, 'code', 'invalid_renew', 'message', 'Lease ID ili TTL nije valjan.');
  end;

  if v_ttl_seconds < 120 or v_ttl_seconds > 3600 then
    return jsonb_build_object('ok', false, 'code', 'invalid_ttl', 'message', 'ttlSeconds izvan granica.');
  end if;

  perform pg_catalog.pg_advisory_xact_lock(1279341101);
  perform agent_control.expire_stale_leases(v_at_time);

  select *
    into v_lease
    from agent_control.agent_leases l
   where l.lease_id = v_requested_id;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'lease_not_found', 'message', 'Lease ne postoji.');
  end if;

  if v_lease.state <> 'active' or v_lease.expires_at <= v_at_time then
    return jsonb_build_object('ok', false, 'code', 'lease_expired', 'message', 'Lease vise nije aktivan.');
  end if;

  update agent_control.agent_leases l
     set expires_at = v_at_time + make_interval(secs => v_ttl_seconds)
   where l.lease_id = v_requested_id
   returning * into v_lease;

  update agent_control.agent_sessions s
     set last_seen_at = v_at_time
   where s.session_name = v_lease.session_name;

  insert into agent_control.agent_events(event_type, session_name, task_id, lease_id, details)
  values (
    'lease_renewed',
    v_lease.session_name,
    v_lease.task_id,
    v_requested_id,
    jsonb_build_object('ttlSeconds', v_ttl_seconds, 'expiresAt', v_lease.expires_at)
  );

  return jsonb_build_object('ok', true, 'leaseId', v_requested_id, 'expiresAt', v_lease.expires_at);
end;
$$;

create or replace function agent_control.expand_lease(payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_requested_id uuid;
  v_task_id text := payload ->> 'taskId';
  v_session_name text := payload ->> 'sessionName';
  v_base_sha text := lower(payload ->> 'baseSha');
  v_scope_hash text := lower(payload ->> 'scopeHash');
  v_scope jsonb := payload -> 'scope';
  v_metadata jsonb := coalesce(payload -> 'metadata', '{}'::jsonb);
  v_ttl_seconds integer;
  v_at_time timestamptz := clock_timestamp();
  v_lease agent_control.agent_leases%rowtype;
  v_conflict record;
  v_pattern text;
begin
  begin
    v_requested_id := (payload ->> 'leaseId')::uuid;
    v_ttl_seconds := (payload ->> 'ttlSeconds')::integer;
  exception when others then
    return jsonb_build_object('ok', false, 'code', 'invalid_expand', 'message', 'Lease ID ili TTL nije valjan.');
  end;

  perform pg_catalog.pg_advisory_xact_lock(1279341101);
  perform agent_control.expire_stale_leases(v_at_time);

  if v_task_id !~ '^T[0-9]{2,4}$'
     or not agent_control.valid_session_name(v_session_name)
     or v_base_sha !~ '^[0-9a-f]{40}$'
     or v_scope_hash !~ '^[0-9a-f]{64}$'
     or v_ttl_seconds < 120
     or v_ttl_seconds > 3600
     or not agent_control.canonical_scope_valid(v_scope)
     or jsonb_typeof(v_metadata) <> 'object'
     or octet_length(v_metadata::text) > 2048 then
    return jsonb_build_object('ok', false, 'code', 'invalid_expand', 'message', 'Expand payload nije kanonski ili valjan.');
  end if;

  select *
    into v_lease
    from agent_control.agent_leases l
   where l.lease_id = v_requested_id;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'lease_not_found', 'message', 'Lease ne postoji.');
  end if;

  if v_lease.state <> 'active' or v_lease.expires_at <= v_at_time then
    return jsonb_build_object('ok', false, 'code', 'lease_expired', 'message', 'Lease vise nije aktivan.');
  end if;

  if v_lease.task_id <> v_task_id or v_lease.session_name <> v_session_name then
    return jsonb_build_object('ok', false, 'code', 'lease_owner_mismatch', 'message', 'Lease ne pripada trazenoj sesiji/tasku.');
  end if;

  if v_lease.base_sha = v_base_sha
     and v_lease.scope_hash = v_scope_hash
     and v_lease.scope = v_scope
     and v_lease.metadata = v_metadata then
    return jsonb_build_object(
      'ok', true,
      'leaseId', v_requested_id,
      'idempotent', true,
      'expiresAt', v_lease.expires_at,
      'scopeHash', v_lease.scope_hash
    );
  end if;

  for v_pattern in
    select value #>> '{}' from jsonb_array_elements(v_scope -> 'write')
  loop
    select l.lease_id, l.task_id, l.session_name, p.pattern
      into v_conflict
      from agent_control.agent_path_leases p
      join agent_control.agent_leases l on l.lease_id = p.lease_id
     where l.state = 'active'
       and l.expires_at > v_at_time
       and l.lease_id <> v_requested_id
       and agent_control.paths_overlap(
         p.root,
         p.is_tree,
         agent_control.scope_root(v_pattern),
         agent_control.scope_is_tree(v_pattern)
       )
     limit 1;

    if found then
      insert into agent_control.agent_events(event_type, session_name, task_id, lease_id, details)
      values (
        'expand_rejected_conflict',
        v_session_name,
        v_task_id,
        v_requested_id,
        jsonb_build_object(
          'requestedPattern', v_pattern,
          'conflictingPattern', v_conflict.pattern,
          'conflictingLeaseId', v_conflict.lease_id,
          'conflictingTask', v_conflict.task_id,
          'conflictingSession', v_conflict.session_name
        )
      );

      return jsonb_build_object(
        'ok', false,
        'code', 'lease_conflict',
        'message', 'Prosireni write scope se preklapa s aktivnim leaseom.',
        'conflict', jsonb_build_object(
          'leaseId', v_conflict.lease_id,
          'taskId', v_conflict.task_id,
          'sessionName', v_conflict.session_name,
          'pattern', v_conflict.pattern,
          'requestedPattern', v_pattern
        )
      );
    end if;
  end loop;

  delete from agent_control.agent_path_leases p
   where p.lease_id = v_requested_id;

  insert into agent_control.agent_path_leases(lease_id, pattern, root, is_tree)
  select
    v_requested_id,
    value #>> '{}',
    agent_control.scope_root(value #>> '{}'),
    agent_control.scope_is_tree(value #>> '{}')
  from jsonb_array_elements(v_scope -> 'write');

  update agent_control.agent_leases l
     set base_sha = v_base_sha,
         scope_hash = v_scope_hash,
         scope = v_scope,
         metadata = v_metadata,
         expires_at = v_at_time + make_interval(secs => v_ttl_seconds)
   where l.lease_id = v_requested_id
   returning * into v_lease;

  insert into agent_control.agent_events(event_type, session_name, task_id, lease_id, details)
  values (
    'lease_expanded',
    v_session_name,
    v_task_id,
    v_requested_id,
    jsonb_build_object('baseSha', v_base_sha, 'scopeHash', v_scope_hash, 'ttlSeconds', v_ttl_seconds)
  );

  return jsonb_build_object(
    'ok', true,
    'leaseId', v_requested_id,
    'idempotent', false,
    'expiresAt', v_lease.expires_at,
    'scopeHash', v_lease.scope_hash
  );
end;
$$;

create or replace function agent_control.release_lease(payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_requested_id uuid;
  v_reason text := nullif(payload ->> 'reason', '');
  v_at_time timestamptz := clock_timestamp();
  v_lease agent_control.agent_leases%rowtype;
begin
  begin
    v_requested_id := (payload ->> 'leaseId')::uuid;
  exception when others then
    return jsonb_build_object('ok', false, 'code', 'invalid_release', 'message', 'Lease ID nije valjan.');
  end;

  if v_reason is not null and char_length(v_reason) > 200 then
    return jsonb_build_object('ok', false, 'code', 'invalid_release', 'message', 'Release reason je predugacak.');
  end if;

  perform pg_catalog.pg_advisory_xact_lock(1279341101);
  perform agent_control.expire_stale_leases(v_at_time);

  select *
    into v_lease
    from agent_control.agent_leases l
   where l.lease_id = v_requested_id;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'lease_not_found', 'message', 'Lease ne postoji.');
  end if;

  if v_lease.state <> 'active' then
    return jsonb_build_object(
      'ok', true,
      'leaseId', v_requested_id,
      'idempotent', true,
      'state', v_lease.state
    );
  end if;

  update agent_control.agent_leases l
     set state = 'released',
         closed_at = v_at_time,
         release_reason = coalesce(v_reason, 'released')
   where l.lease_id = v_requested_id
   returning * into v_lease;

  insert into agent_control.agent_events(event_type, session_name, task_id, lease_id, details)
  values (
    'lease_released',
    v_lease.session_name,
    v_lease.task_id,
    v_requested_id,
    jsonb_build_object('reason', v_lease.release_reason)
  );

  return jsonb_build_object(
    'ok', true,
    'leaseId', v_requested_id,
    'idempotent', false,
    'state', v_lease.state
  );
end;
$$;

create or replace function agent_control.validate_lease(payload jsonb)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_requested_id uuid;
  v_task_id text := payload ->> 'taskId';
  v_session_name text := payload ->> 'sessionName';
  v_base_sha text := lower(payload ->> 'baseSha');
  v_scope_hash text := lower(payload ->> 'scopeHash');
  v_capability_hash text := lower(payload ->> 'capabilityHash');
  v_at_time timestamptz := clock_timestamp();
  v_lease agent_control.agent_leases%rowtype;
begin
  begin
    v_requested_id := (payload ->> 'leaseId')::uuid;
  exception when others then
    return jsonb_build_object('ok', false, 'code', 'invalid_validation', 'message', 'Lease validation payload nije valjan.');
  end;

  if v_task_id !~ '^T[0-9]{2,4}$'
     or not agent_control.valid_session_name(v_session_name)
     or v_base_sha !~ '^[0-9a-f]{40}$'
     or v_scope_hash !~ '^[0-9a-f]{64}$'
     or v_capability_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok', false, 'code', 'invalid_validation', 'message', 'Lease validation payload nije valjan.');
  end if;

  select *
    into v_lease
    from agent_control.agent_leases l
   where l.lease_id = v_requested_id;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'lease_not_found', 'message', 'Lease ne postoji.');
  end if;

  if v_lease.state <> 'active' or v_lease.expires_at <= v_at_time then
    return jsonb_build_object('ok', false, 'code', 'lease_expired', 'message', 'Lease vise nije aktivan.');
  end if;

  if v_lease.task_id <> v_task_id
     or v_lease.session_name <> v_session_name
     or v_lease.base_sha <> v_base_sha
     or v_lease.scope_hash <> v_scope_hash
     or v_lease.capability_hash <> v_capability_hash then
    return jsonb_build_object(
      'ok', false,
      'code', 'lease_validation_mismatch',
      'message', 'Lease capability ili identitet ne odgovara aktivnom leaseu.'
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'leaseId', v_lease.lease_id,
    'taskId', v_lease.task_id,
    'sessionName', v_lease.session_name,
    'baseSha', v_lease.base_sha,
    'scopeHash', v_lease.scope_hash,
    'expiresAt', v_lease.expires_at
  );
end;
$$;

create or replace function agent_control.snapshot_state(payload jsonb)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_requested_session text := nullif(payload ->> 'sessionName', '');
  v_at_time timestamptz := now();
  v_sessions jsonb;
  v_leases jsonb;
begin
  if v_requested_session is not null
     and not agent_control.valid_session_name(v_requested_session) then
    return jsonb_build_object('ok', false, 'code', 'invalid_session', 'message', 'Nevaljan sessionName.');
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'sessionName', s.session_name,
        'machine', s.machine,
        'role', s.role,
        'environmentKind', s.environment_kind,
        'lastSeenAt', s.last_seen_at,
        'stale', s.last_seen_at < v_at_time - interval '10 minutes'
      )
      order by s.session_name
    ),
    '[]'::jsonb
  )
  into v_sessions
  from agent_control.agent_sessions s
  where v_requested_session is null or s.session_name = v_requested_session;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'leaseId', l.lease_id,
        'taskId', l.task_id,
        'sessionName', l.session_name,
        'baseSha', l.base_sha,
        'scopeHash', l.scope_hash,
        'scope', l.scope,
        'metadata', l.metadata,
        'expiresAt', l.expires_at
      )
      order by l.created_at
    ),
    '[]'::jsonb
  )
  into v_leases
  from agent_control.agent_leases l
  where l.state = 'active'
    and l.expires_at > v_at_time
    and (v_requested_session is null or l.session_name = v_requested_session);

  return jsonb_build_object(
    'ok', true,
    'serverTime', v_at_time,
    'sessions', v_sessions,
    'leases', v_leases
  );
end;
$$;

create or replace function agent_control.dispatch(operation text, payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if payload is null or jsonb_typeof(payload) <> 'object' then
    v_result := jsonb_build_object('ok', false, 'code', 'invalid_payload', 'message', 'Payload mora biti JSON objekt.');
  elsif operation = 'health' then
    v_result := jsonb_build_object('ok', true, 'serverTime', clock_timestamp());
  elsif operation = 'register' then
    v_result := agent_control.register_session(payload);
  elsif operation = 'heartbeat' then
    v_result := agent_control.heartbeat_session(payload);
  elsif operation = 'claim' then
    v_result := agent_control.claim_lease(payload);
  elsif operation = 'renew' then
    v_result := agent_control.renew_lease(payload);
  elsif operation = 'expand' then
    v_result := agent_control.expand_lease(payload);
  elsif operation = 'release' then
    v_result := agent_control.release_lease(payload);
  elsif operation = 'snapshot' then
    v_result := agent_control.snapshot_state(payload);
  else
    v_result := jsonb_build_object('ok', false, 'code', 'unknown_operation', 'message', 'Nepoznata operacija.');
  end if;

  return jsonb_build_object('protocolVersion', 1) || v_result;
end;
$$;

revoke all on all tables in schema agent_control from public, anon, authenticated, service_role;
revoke all on all sequences in schema agent_control from public, anon, authenticated, service_role;
revoke execute on all functions in schema agent_control from public, anon, authenticated, service_role;

alter default privileges in schema agent_control
  revoke all on tables from public, anon, authenticated, service_role;
alter default privileges in schema agent_control
  revoke all on sequences from public, anon, authenticated, service_role;
alter default privileges in schema agent_control
  revoke execute on functions from public, anon, authenticated, service_role;

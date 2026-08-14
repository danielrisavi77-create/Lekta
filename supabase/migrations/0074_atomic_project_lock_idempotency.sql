-- Make duplicate paid-project lock claims safe under concurrent webhook retries.
-- Lekta remains the canonical owner of this RPC and its database contract.

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
  inserted_lock public.katedra_project_locks%rowtype;
  project_lock public.katedra_project_locks%rowtype;
  payment_lock public.katedra_project_locks%rowtype;
  existing_lock public.katedra_project_locks%rowtype;
  candidate_lock public.katedra_project_locks%rowtype;
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

  -- This single insert is the claim. PostgreSQL waits for a concurrent unique
  -- conflict to resolve, so a retry cannot create a second lock or observe a
  -- false "no lock" state between a read and an insert.
  insert into public.katedra_project_locks (
    user_id, project_id, topic, work_type, product_key, payment_id, locked_at
  ) values (
    p_user_id, p_project_id, p_topic, p_work_type, p_product_key,
    p_payment_id, coalesce(p_locked_at, now())
  )
  on conflict do nothing
  returning katedra_project_locks.* into inserted_lock;

  if inserted_lock.lock_id is not null then
    return query select inserted_lock.lock_id, inserted_lock.project_id,
      inserted_lock.user_id, inserted_lock.topic, inserted_lock.work_type,
      inserted_lock.product_key, inserted_lock.payment_id, inserted_lock.locked_at;
    return;
  end if;

  -- A concurrent claim already won. Lock both possible unique-conflict rows
  -- in one deterministic order before validating them, so crossed invalid
  -- claims cannot acquire the same rows in opposite orders and deadlock.
  for candidate_lock in
    select l.*
    from public.katedra_project_locks l
    where l.project_id = p_project_id or l.payment_id = p_payment_id
    order by l.lock_id
    for update
  loop
    if candidate_lock.project_id = p_project_id then
      project_lock := candidate_lock;
    end if;
    if candidate_lock.payment_id = p_payment_id then
      payment_lock := candidate_lock;
    end if;
  end loop;

  if project_lock.lock_id is null and payment_lock.lock_id is null then
    raise exception 'Paid project lock claim could not be reconciled' using errcode = '40001';
  end if;
  if project_lock.lock_id is not null
     and payment_lock.lock_id is not null
     and project_lock.lock_id <> payment_lock.lock_id then
    raise exception 'Payment or project is already bound to a different project' using errcode = '23505';
  end if;

  if project_lock.lock_id is not null then
    existing_lock := project_lock;
  else
    existing_lock := payment_lock;
  end if;

  if existing_lock.user_id <> p_user_id
     or existing_lock.project_id <> p_project_id
     or existing_lock.topic <> p_topic
     or existing_lock.work_type <> p_work_type
     or existing_lock.product_key <> p_product_key
     or existing_lock.payment_id <> p_payment_id then
    raise exception 'Paid project lock snapshot does not match' using errcode = '23514';
  end if;

  return query select existing_lock.lock_id, existing_lock.project_id,
    existing_lock.user_id, existing_lock.topic, existing_lock.work_type,
    existing_lock.product_key, existing_lock.payment_id, existing_lock.locked_at;
end $$;

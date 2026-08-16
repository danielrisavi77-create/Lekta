-- Count actual or still-reconciling charges in the daily ceiling. An already
-- released reservation without a billing attempt is not a billable cost.

create or replace function public.katedra_reserve_request(
  p_user uuid,
  p_request_id text,
  p_estimated_charge bigint default 0
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  existing public.katedra_request_reservations;
  active_count integer;
  window_count integer;
  daily_charge bigint;
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'Only service role may reserve AI requests' using errcode = '42501';
  end if;
  if p_user is null or nullif(trim(p_request_id), '') is null
     or length(p_request_id) > 100 or p_estimated_charge < 0 then
    raise exception 'Invalid AI request reservation' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_user::text));
  select * into existing
  from public.katedra_request_reservations r
  where r.request_id = p_request_id
  for update;

  if existing.request_id is not null then
    if existing.user_id <> p_user then
      raise exception 'AI request belongs to another user' using errcode = '42501';
    end if;
    return jsonb_build_object('status', existing.status);
  end if;

  select count(*)::integer into active_count
  from public.katedra_request_reservations r
  where r.user_id = p_user
    and r.status = 'reserved'
    and r.created_at >= now() - interval '1 minute';
  if active_count >= 2 then
    return jsonb_build_object('status', 'concurrency');
  end if;

  select count(*)::integer into window_count
  from public.katedra_request_reservations r
  where r.user_id = p_user
    and r.created_at >= now() - interval '1 minute';
  if window_count >= 8 then
    return jsonb_build_object('status', 'rate');
  end if;

  -- Reservations are joined to their idempotent billing attempt. A settled
  -- or pending reconciliation attempt uses actual charge; only a currently
  -- reserved request without a final billing row uses its estimate. The second
  -- branch includes direct/legacy billing attempts with no reservation row.
  select coalesce(sum(cost), 0)::bigint into daily_charge
  from (
    select case
      when b.status in ('settled', 'pending_reconciliation') then b.charged
      when r.status = 'reserved' then r.estimated_charge
      else 0
    end::bigint as cost
    from public.katedra_request_reservations r
    left join public.katedra_billing_attempts b
      on b.request_id = r.request_id and b.user_id = r.user_id
    where r.user_id = p_user
      and r.created_at >= now() - interval '24 hours'

    union all

    select b.charged::bigint as cost
    from public.katedra_billing_attempts b
    where b.user_id = p_user
      and b.created_at >= now() - interval '24 hours'
      and b.status in ('settled', 'pending_reconciliation')
      and not exists (
        select 1
        from public.katedra_request_reservations r
        where r.request_id = b.request_id and r.user_id = b.user_id
      )
  ) costs;

  if daily_charge + p_estimated_charge > 100000 then
    return jsonb_build_object('status', 'rate');
  end if;

  insert into public.katedra_request_reservations (
    request_id, user_id, estimated_charge, status
  ) values (
    p_request_id, p_user, p_estimated_charge, 'reserved'
  );

  return jsonb_build_object('status', 'reserved');
end $$;

revoke all on function public.katedra_reserve_request(uuid, text, bigint)
  from public, anon, authenticated;
grant execute on function public.katedra_reserve_request(uuid, text, bigint)
  to service_role;

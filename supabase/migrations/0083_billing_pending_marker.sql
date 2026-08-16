-- Keep a provider attempt visible when the stream completed or emitted data,
-- but did not provide trustworthy token usage for katedra_consume.
--
-- This is deliberately separate from katedra_consume: zero tokens must not be
-- mistaken for a successfully settled request. A reconciliation worker can
-- later resolve this immutable request identity when provider evidence exists.

create or replace function public.katedra_mark_pending(
  p_user uuid,
  p_project_id uuid,
  p_request_id text,
  p_estimated_charge bigint,
  p_model text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  existing public.katedra_billing_attempts;
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'Only service role may mark AI billing pending' using errcode = '42501';
  end if;
  if p_user is null or p_project_id is null
     or nullif(trim(p_request_id), '') is null
     or length(p_request_id) > 100
     or p_estimated_charge < 0
     or nullif(trim(p_model), '') is null
     or length(p_model) > 100 then
    raise exception 'Invalid pending AI billing marker' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.academic_projects p
    where p.id = p_project_id and p.user_id = p_user and p.deleted_at is null
  ) then
    raise exception 'Project is missing or is not owned by the billing user' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_request_id));
  select * into existing
  from public.katedra_billing_attempts a
  where a.request_id = p_request_id
  for update;

  if existing.request_id is not null then
    if existing.user_id <> p_user or existing.project_id <> p_project_id then
      raise exception 'Billing request is bound to another project' using errcode = '23505';
    end if;
    return jsonb_build_object('status', existing.status);
  end if;

  insert into public.katedra_billing_attempts (
    request_id, user_id, project_id, model, input_tokens, output_tokens,
    charged, status
  ) values (
    p_request_id, p_user, p_project_id, p_model, 0, 0,
    p_estimated_charge, 'pending_reconciliation'
  );

  update public.katedra_request_reservations
  set status = 'released', released_at = coalesce(released_at, now())
  where request_id = p_request_id and user_id = p_user and status = 'reserved';

  return jsonb_build_object('status', 'pending_reconciliation');
end $$;

revoke all on function public.katedra_mark_pending(uuid, uuid, text, bigint, text)
  from public, anon, authenticated;
grant execute on function public.katedra_mark_pending(uuid, uuid, text, bigint, text)
  to service_role;

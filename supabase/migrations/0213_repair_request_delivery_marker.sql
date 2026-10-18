-- Persist that a repair may have consumed paid/free access before returning its DOCX. The paid
-- wrapper commits the slot and recovery marker in one transaction, so a failed final state write
-- cannot turn an already-charged, unstored result into an ordinary stale request.
create or replace function public.mark_repair_request_delivery_pending(
  p_user_id uuid,
  p_request_id uuid,
  p_request_fingerprint text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null or p_request_id is null or p_request_fingerprint is null
     or p_request_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_repair_request_identity' using errcode = '22023';
  end if;

  update public.repair_request_keys
     set status = 'processing', recovery_attempt = true, updated_at = now()
   where user_id = p_user_id
     and request_id = p_request_id
     and request_fingerprint = p_request_fingerprint
     and status in ('processing', 'unknown');
  return found;
end;
$$;

revoke all on function public.mark_repair_request_delivery_pending(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.mark_repair_request_delivery_pending(uuid, uuid, text)
  to service_role;

create or replace function public.consume_repair_slot_and_bind(
  p_entitlement_id uuid,
  p_user_id uuid,
  p_work_type text,
  p_fingerprint jsonb,
  p_label text,
  p_slot_expires_at timestamptz,
  p_profile_ref text,
  p_coverage_tier smallint,
  p_request_id uuid,
  p_request_fingerprint text
) returns public.document_slots
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slot public.document_slots%rowtype;
  v_marked integer;
begin
  if p_request_id is null or p_request_fingerprint is null
     or p_request_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_repair_request_identity' using errcode = '22023';
  end if;

  v_slot := public.consume_slot_and_bind(
    p_entitlement_id, p_user_id, p_work_type, p_fingerprint, p_label,
    p_slot_expires_at, p_profile_ref, p_coverage_tier
  );

  update public.repair_request_keys
     set status = 'processing', recovery_attempt = true, updated_at = now()
   where user_id = p_user_id
     and request_id = p_request_id
     and request_fingerprint = p_request_fingerprint
     and status in ('processing', 'unknown');
  get diagnostics v_marked = row_count;
  if v_marked = 0 then
    raise exception 'repair_request_state_unavailable' using errcode = '55000';
  end if;

  return v_slot;
end;
$$;

revoke all on function public.consume_repair_slot_and_bind(
  uuid, uuid, text, jsonb, text, timestamptz, text, smallint, uuid, text
) from public, anon, authenticated;
grant execute on function public.consume_repair_slot_and_bind(
  uuid, uuid, text, jsonb, text, timestamptz, text, smallint, uuid, text
) to service_role;

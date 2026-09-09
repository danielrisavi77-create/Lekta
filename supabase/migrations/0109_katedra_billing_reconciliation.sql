-- Resolve recorded usage, never estimates from katedra_mark_pending (zero tokens).
create or replace function public.reconcile_katedra_billing(p_request_id text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare item public.katedra_billing_attempts; available bigint; begin
  if coalesce(current_setting('request.jwt.claim.role',true),'')<>'service_role' then
    raise exception 'Only service role may reconcile AI billing' using errcode='42501';
  end if;
  if p_request_id is null or length(trim(p_request_id))=0 or length(p_request_id)>100 then
    raise exception 'Invalid billing identity' using errcode='22023';
  end if;
  -- Same lock order and key as katedra_consume, including concurrent retries.
  perform pg_advisory_xact_lock(hashtext(p_request_id));
  select * into item from public.katedra_billing_attempts where request_id=p_request_id for update;
  if not found then return jsonb_build_object('status','missing'); end if;
  if item.status='settled' then return jsonb_build_object('status','already_settled'); end if;
  if item.status<>'pending_reconciliation' then return jsonb_build_object('status',item.status); end if;
  if (item.input_tokens=0 and item.output_tokens=0) or item.charged<=0 then
    return jsonb_build_object('status','pending_reconciliation','reason','usage_evidence_required');
  end if;
  if not exists(select 1 from public.academic_projects where id=item.project_id and user_id=item.user_id and deleted_at is null) then
    return jsonb_build_object('status','pending_reconciliation','reason','project_unavailable');
  end if;
  select balance into available from public.katedra_wallets where user_id=item.user_id for update;
  if available is null or available<item.charged then
    return jsonb_build_object('status','pending_reconciliation','reason','insufficient_balance');
  end if;
  update public.katedra_wallets set balance=balance-item.charged,updated_at=now() where user_id=item.user_id;
  insert into public.katedra_usage(user_id,model,input_tokens,output_tokens,charged)
    values(item.user_id,item.model,item.input_tokens,item.output_tokens,item.charged);
  update public.katedra_billing_attempts set status='settled',settled_at=now(),updated_at=now() where request_id=p_request_id;
  return jsonb_build_object('status','settled');
end $$;

create or replace function public.list_reconcilable_katedra_billing()
returns setof public.katedra_billing_attempts language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if coalesce(current_setting('request.jwt.claim.role',true),'')<>'service_role' then
    raise exception 'Only service role may list AI billing work' using errcode='42501';
  end if;
  return query select a.* from public.katedra_billing_attempts a
    join public.katedra_wallets w on w.user_id=a.user_id and w.balance>=a.charged
    join public.academic_projects p on p.id=a.project_id and p.user_id=a.user_id and p.deleted_at is null
    where a.status='pending_reconciliation' and (a.input_tokens>0 or a.output_tokens>0) and a.charged>0
    order by a.created_at,a.request_id limit 25;
end $$;
revoke all on function public.reconcile_katedra_billing(text) from public,anon,authenticated;
revoke all on function public.list_reconcilable_katedra_billing() from public,anon,authenticated;
grant execute on function public.reconcile_katedra_billing(text) to service_role;
grant execute on function public.list_reconcilable_katedra_billing() to service_role;

-- Preserve server-observed usage when settlement response is ambiguous.
-- This RPC records evidence only; 0109 remains the atomic debit authority.
create or replace function public.record_katedra_billing_usage(
  p_user uuid,p_project_id uuid,p_request_id text,p_charged bigint,p_model text,p_in integer,p_out integer
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare item public.katedra_billing_attempts; begin
  if coalesce(current_setting('request.jwt.claim.role',true),'')<>'service_role' then
    raise exception 'Only service role may record AI usage' using errcode='42501';
  end if;
  if p_user is null or p_project_id is null or p_request_id is null or length(trim(p_request_id))=0 or length(p_request_id)>100
    or p_model is null or length(trim(p_model))=0 or length(p_model)>100
    or p_charged is null or p_charged<=0 or p_in is null or p_out is null or p_in<0 or p_out<0 or (p_in=0 and p_out=0) then
    raise exception 'Actual usage is required' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtext(p_request_id));
  select * into item from public.katedra_billing_attempts where request_id=p_request_id for update;
  if found then
    if item.user_id<>p_user or item.project_id<>p_project_id or item.model<>p_model then
      raise exception 'Billing identity conflict' using errcode='23505';
    end if;
    if item.input_tokens>0 or item.output_tokens>0 or item.status='settled' then
      if item.input_tokens<>p_in or item.output_tokens<>p_out or item.charged<>p_charged then
        raise exception 'Billing evidence conflict' using errcode='23505';
      end if;
      return jsonb_build_object('status',case when item.status='settled' then 'already_settled' else item.status end);
    end if;
    if item.status<>'pending_reconciliation' then return jsonb_build_object('status',item.status); end if;
  end if;
  if not exists(select 1 from public.academic_projects where id=p_project_id and user_id=p_user and deleted_at is null) then
    raise exception 'Billing project unavailable' using errcode='42501';
  end if;
  if item.request_id is null then
    insert into public.katedra_billing_attempts(request_id,user_id,project_id,model,input_tokens,output_tokens,charged,status)
      values(p_request_id,p_user,p_project_id,p_model,p_in,p_out,p_charged,'pending_reconciliation');
  else
    update public.katedra_billing_attempts set input_tokens=p_in,output_tokens=p_out,charged=p_charged,updated_at=now()
      where request_id=p_request_id;
  end if;
  return jsonb_build_object('status','pending_reconciliation');
end $$;
revoke all on function public.record_katedra_billing_usage(uuid,uuid,text,bigint,text,integer,integer) from public,anon,authenticated;
grant execute on function public.record_katedra_billing_usage(uuid,uuid,text,bigint,text,integer,integer) to service_role;

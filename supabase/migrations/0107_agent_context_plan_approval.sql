-- Odobrenje je metapodatak tocno aktivne revizije, bez izmjene Storage objekta.
alter table public.agent_payload_manifests add column if not exists context_plan_approval jsonb;
create or replace function public.approve_agent_run_context_plan(
  p_user_id uuid,p_project_id uuid,p_run_id uuid,p_context_revision uuid,p_plan_revision text,p_approve boolean
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare approval jsonb;
begin
  perform public.assert_agent_context_edit(p_user_id,p_project_id,p_run_id);
  if p_approve is distinct from true or p_plan_revision is null or p_plan_revision !~ '^[a-f0-9]{64}$' then
    raise exception 'Explicit approval of the displayed plan revision is required' using errcode='22023';
  end if;
  approval:=jsonb_build_object('schemaVersion',1,'runId',p_run_id,'projectId',p_project_id,
    'planRevision',p_plan_revision,'approvedBy',p_user_id,'approvedAt',now());
  update public.agent_payload_manifests set context_plan_approval=approval,updated_at=now()
    where user_id=p_user_id and project_id=p_project_id and run_id=p_run_id
      and material_id='run-context' and context_state='active' and context_revision=p_context_revision
      and deleted_at is null and expires_at>now();
  if not found then raise exception 'The active context revision changed' using errcode='40901'; end if;
  return approval;
end $$;
revoke all on function public.approve_agent_run_context_plan(uuid,uuid,uuid,uuid,text,boolean) from public,anon;
grant execute on function public.approve_agent_run_context_plan(uuid,uuid,uuid,uuid,text,boolean) to authenticated,service_role;

-- The atomic replacement RPC is now the only user-facing way to select
-- temporary materials for a run. Keep the legacy function for service-role
-- compatibility, but do not expose its older non-serialized attach semantics
-- to browser sessions.

revoke all on function public.attach_agent_payloads_to_run(uuid, uuid, uuid, text[])
  from public, anon, authenticated;
grant execute on function public.attach_agent_payloads_to_run(uuid, uuid, uuid, text[])
  to service_role;

-- Make the privilege required by completion_ai_finalize explicit for fresh
-- Academic Suite rebuilds. The function is SECURITY INVOKER and therefore the
-- service role must itself be allowed to UPDATE the usage row.

grant update on table public.completion_ai_usage to service_role;

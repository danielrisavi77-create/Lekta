-- Security hardening: fiksiraj search_path na purge_faculty_request_ip (advisor lint 0011_function_search_path_mutable).
create or replace function purge_faculty_request_ip(retention_days int default 30)
returns integer
language sql
set search_path = public
as $$
  with upd as (
    update faculty_requests
       set ip_hash = null
     where ip_hash is not null
       and created_at < now() - make_interval(days => retention_days)
    returning 1
  )
  select count(*)::int from upd;
$$;;

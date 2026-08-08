-- Aktiviraj pg_cron pa zakazi retenciju ip_hash-a (0011 DO-blok je bio no-op na svjezem
-- projektu jer pg_cron nije bio ukljucen). Anonimizira ip_hash stariji od 30 dana svaki dan u 03:15.
create extension if not exists pg_cron;
select cron.schedule('purge-faculty-request-ip', '15 3 * * *', 'select purge_faculty_request_ip(30);');;

-- 0015_revoke_purge.sql
-- Suzenje povrsine (security-06 / least privilege): purge funkcije se zovu ISKLJUCIVO iz
-- pg_cron (kao postgres), nikad iz klijenta (anon/authenticated). Makni implicitni PUBLIC
-- EXECUTE pa ih anon/authenticated ne mogu ni pozvati.
--
-- Danas bezopasno: obje su `language sql` BEZ security definer, pa se izvode s pravima
-- pozivatelja, a anon/authenticated ionako nemaju DELETE/UPDATE grant ni RLS prolaz na
-- report_generations / faculty_requests. Cron radi kao postgres (superuser) pa revoke ne
-- utjece na zakazano brisanje. Ovo je higijena po nacelu najmanje privilegije.

revoke execute on function purge_old_report_generations(int) from public;
revoke execute on function purge_faculty_request_ip(int) from public;

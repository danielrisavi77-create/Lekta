-- 0028_lock_orphan_sweep_fn.sql
-- Ispravak 0027 (Supabase security advisor 0028/0029): find_orphan_repair_objects je SECURITY DEFINER
-- pa ga je advisor oznacio izvrsivim od uloga anon i authenticated preko /rest/v1/rpc. `revoke ... from
-- public` (0027) NIJE dovoljno u Supabaseu: ALTER DEFAULT PRIVILEGES u shemi public automatski GRANT-a
-- EXECUTE ulogama anon i authenticated na SVAKU novu funkciju, neovisno o PUBLIC grantu. Zato ih moramo
-- EKSPLICITNO oduzeti. Funkciju smije zvati samo service_role (Edge cleanup-orphan-repairs).
-- Bez ovoga bi anonimni pozivatelj mogao enumerirati imena orphan Storage objekata (putanje sadrze user_id).
revoke all on function find_orphan_repair_objects(int, int) from public, anon, authenticated;
grant execute on function find_orphan_repair_objects(int, int) to service_role;

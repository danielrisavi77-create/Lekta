-- Lekta Control Center: rucna provjera 6 novih admin_*_stats() RPC-ova (0038). Pokreni kao
-- service role (psql ili Supabase SQL editor) NAKON `supabase db push`, PRIJE nego se dispatcher
-- (admin-stats/index.ts) uopce spoji na njih. Isti obrazac kao kpi-weekly.sql: obican niz
-- upita, bez asserta - citas izlaz okom. Provjeri da nijedan poziv ne baca gresku i da current/
-- previous za prazan prozor resolveaju u realne nula-vrijednosti (ne null).

-- 1) Overview, zadnjih 7 dana - osnovna zdrava putanja.
select admin_overview_stats(now() - interval '7 days', now());

-- 2) Overview, prozor sigurno bez ijednog retka (prosla godina, jedan dan) - current/previous
--    moraju biti objekti s nulama, ne null, headlineFunnel mora biti [] popunjen s count:0 po koraku.
select admin_overview_stats(timestamptz '2020-01-01', timestamptz '2020-01-02');

-- 3) Funnel, zadani (8 potvrdjenih) koraka.
select admin_funnel_stats(now() - interval '30 days', now());

-- 4) Funnel, custom podskup koraka - provjeri da p_events stvarno mijenja izlaz i redoslijed.
select admin_funnel_stats(now() - interval '30 days', now(), array['file_selected','analysis_completed']);

-- 5) Revenue, zadnjih 30 dana - provjeri feeAssumptions.verified=false uvijek prisutan.
select admin_revenue_stats(now() - interval '30 days', now());

-- 6) Revenue, prazan prozor - gross/net moraju biti 0, byWorkType/byProduct/byAudience [].
select admin_revenue_stats(timestamptz '2020-01-01', timestamptz '2020-01-02');

-- 7) Operations, raspon koji PRELAZI 90-dnevnu report_generations granicu (90 dana unatrag
--    zaracunato od proslog mjeseca) - repair/preflight ostaju puni, generations je NEPOTPUN;
--    provjeri da retention niz to doista kaze.
select admin_operations_stats(now() - interval '120 days', now() - interval '30 days');

-- 8) Operations, zadnjih 24h - normalna putanja.
select admin_operations_stats(now() - interval '1 day', now());

-- 9) Usage, zadnjih 30 dana.
select admin_usage_stats(now() - interval '30 days', now());

-- 10) Coverage, default limit (50).
select admin_coverage_stats(now() - interval '30 days', now());

-- 11) Coverage, eksplicitan mali limit - provjeri da topCells stvarno rezan na 3 retka.
select admin_coverage_stats(now() - interval '30 days', now(), 3);

-- 12) Coverage, limit izvan granica (0 i 500) - provjeri da greatest/least klamp radi
--     (ocekivano: 0 -> 1, 500 -> 200), ne baca gresku.
select admin_coverage_stats(now() - interval '30 days', now(), 0);
select admin_coverage_stats(now() - interval '30 days', now(), 500);

-- 13) Sigurnosni gard (ocekivana GRESKA, ne uspjeh): izvrsi kao anon/authenticated, ne
--     service_role, i provjeri da SVIH 6 funkcija odbija s "permission denied for function".
--     Npr. u SQL editoru: `set role authenticated; select admin_overview_stats(now(), now());`
--     pa `reset role;` nakon provjere.

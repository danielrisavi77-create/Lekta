-- 0018_integrity.sql
-- Lekta Faza 4: cloud integritetska provjera (plagijat, cross-lingual, AI). Vidi
-- docs/roadmap/PHASE4_CLOUD_INTEGRITY.md. Ovo je JEDINI dio koji salje tekst rada izvan
-- preglednika, i to samo uz eksplicitnu privolu (src/integrity/integrity-consent.ts) i
-- placeni/teaser gate. Schema je PROVIDER-AGNOSTICNA: embedding model i plagijat izvor su
-- owner-odluke, pa korpus tablica (integrity_corpus) dolazi kad se odabere model (dimenzija
-- vector(N) ovisi o modelu). Ovdje je samo audit/privola/retencija sloj, koji ih ne treba.
--
-- Retencija (odluka foundera): sirovi poslani tekst se cuva KRATKO (7 dana) radi ponovnog uvida
-- i reklamacije, pa se automatski NULira (pg_cron purge_integrity_text). Sazeti rezultat
-- (result_summary) i privola (consent) ostaju. Tekst se NIKAD ne koristi za treniranje.

-- pgvector za buducu cross-lingual pretragu (korpus tablica dolazi s odabirom embedding modela).
create extension if not exists vector;

create table if not exists integrity_checks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  -- Prozor cuvanja sirovog teksta; sent_text se NULira nakon isteka (retencija 7d).
  retention_expires_at timestamptz not null default (now() + interval '7 days'),
  work_type text,
  lang text,
  -- 'teaser' = ograniceni besplatni cross-lingual signal; 'full' = puni izvjestaj iza Passa.
  mode text not null default 'teaser' check (mode in ('teaser','full')),
  -- Trajni zapis privole (tekst, timestamp, verzija uvjeta, retencija). Nikad se ne NULira.
  consent jsonb not null,
  -- Sirovi poslani tekst; cuva se do retention_expires_at pa se NULira (kratko zadrzavanje).
  sent_text text,
  -- Sazeti rezultat (postotci slicnosti, poklopljeni izvori, AI-signal); ostaje nakon purge.
  result_summary jsonb,
  status text not null default 'pending' check (status in ('pending','done','error'))
);

create index if not exists integrity_checks_user_idx on integrity_checks (user_id);
create index if not exists integrity_checks_retention_idx on integrity_checks (retention_expires_at)
  where sent_text is not null;

alter table integrity_checks enable row level security;

-- Korisnik vidi SAMO svoje provjere (za povijest / ponovni uvid u UI-u).
create policy integrity_checks_select_own
  on integrity_checks for select
  to authenticated
  using (user_id = auth.uid());

-- NEMA insert/update/delete policy za authenticated/anon: red kreira i puni ISKLJUCIVO
-- integrity-check Edge Function (service role), koja provjeri entitlement i zabiljezi privolu.
-- Klijent nikad ne pise izravno (inace bi mogao lazirati privolu ili zaobici gate).

-- ---------------------------------------------------------------------------
-- Retencija sirovog teksta (7d): NULira sent_text nakon isteka; red i sazetak ostaju.
-- Obrazac identican 0016 (language sql, set search_path, revoke execute from public,
-- pg_cron guard + unschedule-u-try + schedule; staggeran POSLIJE postojecih 3:xx jobova).
create or replace function purge_integrity_text()
returns integer
language sql
set search_path = public
as $$
  with upd as (
    update integrity_checks
       set sent_text = null
     where sent_text is not null
       and retention_expires_at < now()
    returning 1
  )
  select count(*)::int from upd;
$$;

revoke execute on function purge_integrity_text() from public;

-- Fail-closed retencija (AUD-18 / LEKTA-SEC-02): bez pg_crona purge_integrity_text()
-- se nikad ne bi zakazao, a migracija bi tiho prosla zeleno, pa bi sirovi sent_text
-- (cijeli poslani tekst rada) zauvijek ostao. Zato izostanak pg_crona ovdje RUSI
-- migraciju (glasno) umjesto da je preskoci. Idempotentno: re-run radi unschedule pa
-- schedule istog imenovanog joba.
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise exception 'pg_cron nije dostupan: retencijski purge_integrity_text() se ne moze zakazati (fail-closed). Ukljuci pg_cron ekstenziju pa ponovno pokreni migraciju.';
  end if;
  begin
    perform cron.unschedule('purge-integrity-text');
  exception when others then
    null; -- job jos ne postoji
  end;
  perform cron.schedule('purge-integrity-text', '0 4 * * *', 'select purge_integrity_text();');
end $$;

comment on table integrity_checks is
  'Faza 4 cloud integritet (plagijat/cross-lingual/AI). sent_text se cuva 7d pa NULira (purge_integrity_text). Privola trajna. Vidi PHASE4_CLOUD_INTEGRITY.md.';

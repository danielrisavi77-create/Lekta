-- 0102: Kanal A, prilog korpusu uz zasebnu privolu (spec: docs/superpowers/specs/2026-09-05-kanal-a-privola-korpusa.md).
--
-- Sto se pohranjuje: PSEUDONIMIZIRANA kopija izvornog dokumenta (prije popravka) u privatni bucket 'corpus', bez
-- user_id u stazi (nepovezivost), plus redak provenijencije ovdje. Keyring (mapa pseudonim -> ime) se NE pohranjuje
-- nigdje. user_id postoji samo radi povlacenja privole i brisanja racuna.
--
-- Rok cuvanja: do povlacenja privole, a najdulje 36 mjeseci od predaje (CORPUS_RETENTION_MONTHS). Brisanje po roku
-- radi zaseban posao (faza 2), po istom obrascu kao anonimni popravci (0033).
--
-- Idempotentno: migracije se u praksi primjenjuju vise puta (vidi CLAUDE.md), i iskljucivo kroz `supabase db push`.

insert into storage.buckets (id, name, public)
values ('corpus', 'corpus', false)
on conflict (id) do nothing;

create table if not exists corpus_contributions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  repair_job_id uuid references repair_jobs(id) on delete set null,
  consent_version text not null,                 -- CORPUS_CONSENT_VERSION koju je korisnik vidio i potvrdio
  work_type text not null check (work_type in ('seminarski','zavrsni','diplomski','doktorski')),
  profile_ref text,                              -- id profila iz analize, ako je poznat
  path text not null,                            -- corpus/<yyyy-mm>/<id>.docx (bez user_id u stazi)
  bytes int check (bytes is null or bytes >= 0),
  pseudonymization jsonb not null,               -- { dictionarySize, carriersCleaned[], vacuous, leaks } : brojevi i oznake, nikad pojmovi
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '36 months'),
  withdrawn_at timestamptz                        -- povlacenje privole: datoteka obrisana, redak ostaje kao trag
);

create index if not exists corpus_contributions_user_idx on corpus_contributions (user_id, created_at desc);
create index if not exists corpus_contributions_active_idx on corpus_contributions (created_at) where withdrawn_at is null;

alter table corpus_contributions enable row level security;

-- Korisnik vidi i brise (povlaci) SAMO svoje priloge; upis radi iskljucivo service role (Edge funkcija).
drop policy if exists corpus_contributions_select_own on corpus_contributions;
create policy corpus_contributions_select_own on corpus_contributions
  for select using (user_id = auth.uid());

drop policy if exists corpus_contributions_update_own on corpus_contributions;
create policy corpus_contributions_update_own on corpus_contributions
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Namjerno NEMA nijedne policy na storage.objects za bucket 'corpus': korisnik ne cita ni ne pise datoteke
-- izravno. Cita ih samo vlasnik lokalnim alatom sa service role (scripts/corpus-pull.mts), a brise ih Edge
-- funkcija pri povlacenju privole. Staza bez user_id znaci da foldername-RLS ovdje ne bi ni imao sto reci.

comment on table corpus_contributions is
  'Kanal A: pseudonimizirane kopije radova zadrzane uz zasebnu privolu za mjerenje popravka. Bez keyringa. Rok 36 mjeseci ili povlacenje.';

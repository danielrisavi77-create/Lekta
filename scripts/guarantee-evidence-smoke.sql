-- Smoke za garancijski dokaz (audit P1-09), po uzoru na academic-suite-*-smoke.sql.
--
-- OPSEG. Ovdje se dokazuje ono sto je u BAZI: da `evidence_kind` prima samo poznate vrijednosti i
-- da dokaz u Storageu bez otiska ne moze uci. Same politike nad `storage.objects` iz 0097 ovdje se
-- NE vrte, jer prazan PostgreSQL nema `storage` shemu; njih pokriva Supabase pri `db push`, a
-- vlasnistvo putanje je ionako provjereno prije Storagea (src/report/guarantee-evidence.test.ts).
-- To je izricito ogranicenje ovog smokea, ne previd.
\set ON_ERROR_STOP on
\timing off

begin;

-- Minimalna kopija onoga sto 0097 mijenja (0007 shema, bez FK-ova na auth/document_slots).
create table if not exists guarantee_claims (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  slot_id uuid,
  rule_key text,
  evidence_path text,
  status text not null default 'pending' check (status in ('pending','approved','denied')),
  resolution text check (resolution in ('refund','manual_fix','both')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

-- Postojeci redak IZ STAROG SVIJETA: mora prezivjeti migraciju i zavrsiti kao 'text'.
insert into guarantee_claims (user_id, evidence_path)
values ('11111111-1111-4111-8111-111111111111', 'Referada mi je vratila rad zbog margina.');

-- Samo dio 0097 koji dira guarantee_claims; storage dio trazi Supabase shemu (vidi gore).
alter table guarantee_claims
  add column if not exists evidence_kind text not null default 'text',
  add column if not exists evidence_sha256 text,
  add column if not exists evidence_bytes bigint,
  add column if not exists evidence_mime text;

alter table guarantee_claims drop constraint if exists guarantee_claims_evidence_kind_check;
alter table guarantee_claims
  add constraint guarantee_claims_evidence_kind_check
  check (evidence_kind in ('text', 'storage'));

alter table guarantee_claims drop constraint if exists guarantee_claims_storage_evidence_check;
alter table guarantee_claims
  add constraint guarantee_claims_storage_evidence_check
  check (
    evidence_kind <> 'storage'
    or (evidence_path is not null and evidence_sha256 is not null and evidence_bytes is not null)
  );

create or replace function assert_eq(actual text, expected text, what text) returns void
language plpgsql as $$
begin
  if actual is distinct from expected then
    raise exception 'FAIL % : ocekivano %, dobiveno %', what, expected, actual;
  end if;
  raise notice 'ok: %', what;
end;
$$;

create or replace function assert_rejected(stmt text, what text) returns void
language plpgsql as $$
begin
  begin
    execute stmt;
  exception when check_violation then
    raise notice 'ok: %', what;
    return;
  end;
  raise exception 'FAIL % : zahvat je PROSAO, a morao je biti odbijen', what;
end;
$$;

-- 1. Migracija ne dira zatecene retke: stari dokaz ostaje, i to kao 'text'.
select assert_eq((select evidence_kind from guarantee_claims limit 1), 'text', 'stari redak je text');
select assert_eq((select count(*)::text from guarantee_claims), '1', 'stari redak nije izgubljen');

-- 2. Nepoznata vrsta dokaza ne moze uci.
select assert_rejected(
  $q$insert into guarantee_claims (user_id, evidence_kind, evidence_path)
     values ('11111111-1111-4111-8111-111111111111', 'datoteka', 'nesto')$q$,
  'nepoznata vrsta dokaza odbijena');

-- 3. KLJUCNI SLUCAJ (P1-09): dokaz u Storageu BEZ otiska je nedokaziv dokaz.
select assert_rejected(
  $q$insert into guarantee_claims (user_id, evidence_kind, evidence_path)
     values ('11111111-1111-4111-8111-111111111111', 'storage', 'uid/dopis.pdf')$q$,
  'storage dokaz bez sha256 odbijen');

select assert_rejected(
  $q$insert into guarantee_claims (user_id, evidence_kind, evidence_path, evidence_sha256)
     values ('11111111-1111-4111-8111-111111111111', 'storage', 'uid/dopis.pdf', 'abc')$q$,
  'storage dokaz bez velicine odbijen');

select assert_rejected(
  $q$insert into guarantee_claims (user_id, evidence_kind, evidence_sha256, evidence_bytes)
     values ('11111111-1111-4111-8111-111111111111', 'storage', 'abc', 10)$q$,
  'storage dokaz bez putanje odbijen');

-- 4. Potpun dokaz u Storageu prolazi.
insert into guarantee_claims (user_id, evidence_kind, evidence_path, evidence_sha256, evidence_bytes, evidence_mime)
values ('11111111-1111-4111-8111-111111111111', 'storage', 'uid/dopis.pdf',
        repeat('a', 64), 1024, 'application/pdf');
select assert_eq((select count(*)::text from guarantee_claims where evidence_kind = 'storage'),
                 '1', 'potpun storage dokaz prolazi');

-- 5. Tekstualni dokaz i dalje ne treba otisak (inace bi migracija srusila postojeci tok).
insert into guarantee_claims (user_id, evidence_kind, evidence_path)
values ('11111111-1111-4111-8111-111111111111', 'text', 'Vraceno zbog proreda, dopis u prilogu.');
select assert_eq((select count(*)::text from guarantee_claims where evidence_kind = 'text'),
                 '2', 'tekstualni dokaz ne trazi otisak');

rollback;

\echo 'guarantee-evidence-smoke: SVE TVRDNJE PROSLE'

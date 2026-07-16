-- Lekta: waitlist nepokrivenih fakulteta (WAITLIST_NEPOKRIVENI_FAKULTETI.md sekcije 5, 6).
-- Signal potraznje za discovery prioritizaciju (sekcija 7) + opcionalni kontakt za obavijest
-- kad fakultet bude gotov (sekcija 8). Anoniman upis je valjan (bez e-maila). IP se HASHIRA u
-- Edge Functionu (nikad sirovi IP, isto GDPR nacelo kao report_generations, 0001). Klijent NE
-- pise izravno: ip_hash i rate limit su serverska odluka, pa upis ide iskljucivo preko service role.

create table if not exists faculty_requests (
  id uuid primary key default gen_random_uuid(),
  faculty_id text,                         -- id iz ZAGREB_CATALOG; null ako fakultet nije u katalogu
  faculty_name_raw text,                   -- slobodni unos kad faculty_id je null (sekcija 3)
  program_id text,
  work_type text check (work_type is null or work_type in ('seminarski','zavrsni','diplomski','doktorski')),
  user_id uuid references auth.users(id) on delete set null,   -- null za anonimne
  email text,                              -- opcionalno; samo za jednu obavijest o pokrivenosti
  source text not null default 'upload_flow',
  ip_hash text,                            -- HASHIRAN (sha256 x-forwarded-for), samo za anti-spam prozor
  created_at timestamptz not null default now(),
  notified_at timestamptz,
  constraint faculty_ref_present check (faculty_id is not null or faculty_name_raw is not null)
);

-- discovery prioritizacija (sekcija 7) i notifikacijski upit (sekcija 8)
create index if not exists faculty_requests_cell
  on faculty_requests (faculty_id, program_id, work_type);
create index if not exists faculty_requests_created
  on faculty_requests (created_at);
-- rate limit po ip_hash u zadnjih N minuta (sekcija 6)
create index if not exists faculty_requests_ip_time
  on faculty_requests (ip_hash, created_at);
-- notifikacijski sken: samo redovi s e-mailom koji jos nisu obavijesteni (sekcija 8)
create index if not exists faculty_requests_pending_notify
  on faculty_requests (faculty_id, program_id, work_type)
  where email is not null and notified_at is null;

-- agregat za discovery prioritizaciju (sekcija 7)
drop view if exists faculty_request_counts;
create view faculty_request_counts as
select
  faculty_id,
  faculty_name_raw,
  program_id,
  work_type,
  count(*) as total_requests,
  count(distinct coalesce(email, user_id::text)) as unique_requesters,
  count(email) filter (where email is not null) as with_email,
  min(created_at) as first_seen,
  max(created_at) as last_seen
from faculty_requests
group by faculty_id, faculty_name_raw, program_id, work_type;

-- RLS: klijent NE cita i NE pise. Namjerno bez anon/authenticated politika, pa RLS odbija sve;
-- upis i citanje idu iskljucivo preko service role (Edge Function / discovery skripta).
-- Namjerno bez select-own: korisnik ne smije vidjeti ni svoje ni tude brojke (sekcija 5).
alter table faculty_requests enable row level security;

-- agregat nosi tude brojke: drzi ga izvan dohvata anon/authenticated (isto kao 0008 viewovi)
revoke all on faculty_request_counts from anon, authenticated;

-- Atomski upis uz rate limit (sekcija 6): security definer, provjerava ip_hash prozor pa upisuje.
-- Vraca id novog reda, ili null ako je iznad limita (edge tada tiho vrati ok bez upisa).
-- Klijent ovo NE moze zvati (revoke ispod); zove Edge Function preko service role.
create or replace function submit_faculty_request(
  p_faculty_id text,
  p_faculty_name_raw text,
  p_program_id text,
  p_work_type text,
  p_user_id uuid,
  p_email text,
  p_source text,
  p_ip_hash text,
  p_max_per_window int default 5,
  p_window_minutes int default 10
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recent int;
  v_id uuid;
begin
  if p_ip_hash is not null then
    select count(*) into v_recent
      from faculty_requests
     where ip_hash = p_ip_hash
       and created_at > now() - make_interval(mins => p_window_minutes);
    if v_recent >= p_max_per_window then
      return null;   -- iznad limita: tiho odbij (sekcija 6), bez greske korisniku
    end if;
  end if;

  insert into faculty_requests
    (faculty_id, faculty_name_raw, program_id, work_type, user_id, email, source, ip_hash)
  values
    (p_faculty_id, p_faculty_name_raw, p_program_id, p_work_type, p_user_id,
     nullif(btrim(p_email), ''), coalesce(nullif(p_source, ''), 'upload_flow'), p_ip_hash)
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function submit_faculty_request(text, text, text, text, uuid, text, text, text, int, int)
  from public, anon, authenticated;

-- Naknadno vezanje e-maila na vec upisan anoniman red (korisnik je ostavio e-mail u traci).
-- Vezuje se SAMO na svjez, jos anoniman red (unutar 1 h); stariji ili vec-popunjeni se ne diraju,
-- pa se ne moze prepisati tudi ni stari zapis ni ako procuri uuid.
create or replace function attach_email_to_faculty_request(
  p_request_id uuid,
  p_email text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated int;
begin
  update faculty_requests
     set email = nullif(btrim(p_email), '')
   where id = p_request_id
     and email is null
     and created_at > now() - interval '1 hour';
  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$$;

revoke all on function attach_email_to_faculty_request(uuid, text) from public, anon, authenticated;

-- Retencija (GDPR minimizacija, isto nacelo kao 0009): ip_hash je samo za anti-spam prozor,
-- pa se starijim redovima BRISE ip_hash umjesto brisanja cijelog reda. Signal potraznje
-- (faculty/program/work_type/created_at) prezivljava, anti-spam identifikator nestaje.
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
$$;

-- Fail-closed retencija (AUD-18/19 / LEKTA-SEC-02 obrazac, prosiren na cron sibling): bez pg_crona
-- purge_faculty_request_ip() se nikad ne bi zakazao, a migracija bi tiho prosla zeleno, pa bi
-- ip_hash (anti-spam identifikator) ostao zauvijek suprotno politici minimizacije (0009/0016 red).
-- Zato izostanak pg_crona RUSI migraciju (glasno). Idempotentno: re-run radi unschedule pa schedule.
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise exception 'pg_cron nije dostupan: purge_faculty_request_ip() se ne moze zakazati (fail-closed). Ukljuci pg_cron ekstenziju pa ponovno pokreni migraciju.';
  end if;
  begin
    perform cron.unschedule('purge-faculty-request-ip');
  exception when others then
    null; -- job jos ne postoji
  end;
  perform cron.schedule('purge-faculty-request-ip', '15 3 * * *', 'select purge_faculty_request_ip(30);');
end $$;

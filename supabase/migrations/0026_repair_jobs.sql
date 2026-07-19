-- 0026_repair_jobs.sql
-- WS-6 (placeni server-side repair): pohrana originala + popravljenog .docx vezano uz racun,
-- retencija "DOK GA KORISNIK NE OBRISE" (vlasnikova odluka 5). Podupire ekran "Moji popravci"
-- (lista + ponovni download + brisanje = right to erasure).
--
-- Obrazac je isti kao 0001_monetization.sql: pravo je uvijek serverska odluka, klijent NE pise
-- u ovu tablicu ni u bucket (RLS = enable + SAMO select-own = default deny za insert/update/delete
-- anon/authenticated). Server (repair-docx Edge, service role) upisuje; brisanje ide preko zasebne
-- Edge funkcije (service role) jer uklanjanje Storage BLOB-a mora ici kroz Storage API, ne SQL.
--
-- EU rezidentnost: projekt je eu-central-1 (Supabase Storage u istoj regiji). Doslovni tekst rada
-- NE ide u ovu tablicu (samo otisak + putanje); sam dokument zivi kao privatni Storage objekt.

-- 1) Privatni Storage bucket 'repair' (idempotentno). public=false -> pristup samo preko RLS-a na
--    storage.objects ili preko potpisanih URL-ova (service role / vlasnik objekta).
insert into storage.buckets (id, name, public)
values ('repair', 'repair', false)
on conflict (id) do nothing;

-- 2) Metapodaci posla popravka. Original i rezultat su Storage putanje (blobovi), ne bajtovi u bazi.
create table if not exists repair_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  slot_id uuid references document_slots(id) on delete set null,
  work_type text not null check (work_type in ('seminarski','zavrsni','diplomski','doktorski')),
  fingerprint jsonb not null,                    -- { titleNorm, authorNorm, headings[], sectionCount }
  label text,                                    -- za prikaz u "Moji popravci" (iz fingerprint.titleNorm)
  original_path text not null,                   -- repair/<user_id>/<job_id>/original.docx
  result_path text not null,                     -- repair/<user_id>/<job_id>/fixed.docx
  original_bytes int check (original_bytes is null or original_bytes >= 0),
  result_bytes int check (result_bytes is null or result_bytes >= 0),
  changes_count int check (changes_count is null or changes_count >= 0),
  status text not null default 'done' check (status in ('done','failed')),
  -- WS-6.3 privola na upload+pohranu: AUTORITATIVNA verzija Uvjeta/privatnosti (TERMS_VERSION) koju
  -- server utisne TEK nakon consent gatea (repair-docx odbija upload ako klijentska privola nije za
  -- tekucu verziju). NOT NULL: posao bez zabiljezene privole se ne smije pohraniti. Isti obrazac kao
  -- checkout_consents.terms_version (0008): biljezimo VERZIJU (sadrzaj je nepromjenjiv po verziji), ne tekst.
  consent_version text not null,
  -- Vrijeme SERVERSKOG zapisa posla (nakon uploada+popravka), NE tocan klik privole. Privola se dogodi
  -- u istom zahtjevu neposredno prije, pa je created_at pouzdana gornja granica trenutka pristanka.
  created_at timestamptz not null default now()
);
create index if not exists repair_jobs_user_time
  on repair_jobs (user_id, created_at desc);

-- 3) RLS: korisnik CITA samo svoje poslove (za "Moji popravci"). Bez insert/update/delete politika
--    -> klijentsko pisanje je odbijeno; server pise preko service role. Isti obrazac kao 0001.
alter table repair_jobs enable row level security;

drop policy if exists repair_jobs_select_own on repair_jobs;
create policy repair_jobs_select_own on repair_jobs
  for select using (user_id = auth.uid());

-- 4) Storage RLS na storage.objects za bucket 'repair': korisnik smije CITATI (i time potpisati URL
--    kroz createSignedUrl) samo objekte u svojoj mapi <user_id>/. Upload i brisanje BLOB-a radi
--    iskljucivo server (service role zaobilazi RLS). Putanja: '<user_id>/<job_id>/<datoteka>.docx',
--    pa je foldername[1] = user_id.
drop policy if exists repair_objects_read_own on storage.objects;
create policy repair_objects_read_own on storage.objects
  for select to authenticated
  using (bucket_id = 'repair' and (storage.foldername(name))[1] = (auth.uid())::text);

-- Namjerno NEMA insert/update/delete policy na storage.objects za bucket 'repair':
-- svako klijentsko pisanje/brisanje BLOB-a je odbijeno. Brisanje (right to erasure) ide preko
-- Edge funkcije 'delete-repair-job' (service role): storage.remove([original_path, result_path])
-- + delete from repair_jobs where id = :job and user_id = :uid.
--
-- OTVORENO (WS-7 deploy, obavezno prije go-livea): brisanje RACUNA. `on delete cascade` na user_id
-- uklanja SAMO redak repair_jobs; storage.objects nisu FK-vezani (owner je ON DELETE SET NULL), pa
-- BLOB-ovi (original.docx + fixed.docx) prezive brisanje racuna kao orphani, a gubitkom retka nestaje
-- i pokazivac na njih. Treba dedicirana sweep-Edge (service role) koja listing-om po '<user_id>/'
-- prefiksu uklanja objekte bez pripadnog auth.users racuna, okinuta pg_cronom (obrazac 0009/0011/0022)
-- ILI iz procesa brisanja racuna. Nije hitno PRIJE deploya jer je repair inertan dok repairEndpoint=''
-- (nijedan posao se ne pohranjuje), pa orphani ne mogu ni nastati do WS-7.

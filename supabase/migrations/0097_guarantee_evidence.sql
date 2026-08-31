-- 0097: garancijski dokaz prestaje biti proizvoljan string (audit P1-09).
--
-- ZATECENO STANJE. `guarantee_claims.evidence_path` je od 0007 obican `text` bez ijednog
-- ogranicenja, a Edge funkcija ga je uzimala kao `body.evidencePath ? String(...) : null` i
-- provjeravala SAMO truthiness (`hasEvidence: !!evidencePath`). Iz toga slijede tri kvara:
--
--   1. Stupac se ZOVE `evidence_path`, ali je u praksi drzao slobodan OPIS dokaza koji korisnik
--      utipka u obrazac. Tko god poslije cita bazu (admin, izvjestaj, buduci alat) razumno
--      pretpostavi da je to putanja i pokusa je otvoriti. Ime koje laze o sadrzaju je kvar sam
--      po sebi.
--   2. Ako netko RUCNO posalje zahtjev s putanjom (a nista ga u tome ne sprjecava), tu putanju
--      nitko ne provjerava. `drugi-korisnik/rad.docx` prolazi jednako dobro kao vlastita:
--      klasican IDOR prema tudjem dokumentu, s administratorom kao nesvjesnim posrednikom.
--   3. Minimalna duljina opisa (20 znakova) postojala je SAMO u pregledniku. Poziv na endpoint
--      mimo sucelja prolazio je s dokazom "x".
--
-- ZAHVAT. Vrsta dokaza postaje izricita (`evidence_kind`), a ne stvar pogadjanja. Za dokaz u
-- Storageu se uz zahtjev trajno zapisuje otisak (sha256, velicina, MIME) da se poslije moze
-- dokazati sto je tocno pregledano, cak i ako objekt u medjuvremenu nestane ili se zamijeni.
--
-- Idempotentno: `add column if not exists`, `drop ... if exists` prije `create`.

alter table guarantee_claims
  add column if not exists evidence_kind text not null default 'text',
  add column if not exists evidence_sha256 text,
  add column if not exists evidence_bytes bigint,
  add column if not exists evidence_mime text;

alter table guarantee_claims drop constraint if exists guarantee_claims_evidence_kind_check;
alter table guarantee_claims
  add constraint guarantee_claims_evidence_kind_check
  check (evidence_kind in ('text', 'storage'));

-- Dokaz u Storageu BEZ otiska je isto sto i nedokaziv dokaz, pa ga baza ne prima. Postojeci
-- redci su svi 'text' (default), pa ih ovo ne dira.
alter table guarantee_claims drop constraint if exists guarantee_claims_storage_evidence_check;
alter table guarantee_claims
  add constraint guarantee_claims_storage_evidence_check
  check (
    evidence_kind <> 'storage'
    or (evidence_path is not null and evidence_sha256 is not null and evidence_bytes is not null)
  );

comment on column guarantee_claims.evidence_kind is
  'text = slobodan opis u evidence_path; storage = putanja objekta u bucketu guarantee-evidence (audit P1-09).';
comment on column guarantee_claims.evidence_sha256 is
  'Otisak dokaza u trenutku podnosenja. Dokazuje STO je pregledano i kad objekt vise ne postoji.';

-- ---------------------------------------------------------------------------
-- Bucket za dokaze. Privatan, mali, uskog skupa tipova: ovo prima povrat referade
-- (snimka zaslona, skenirani dopis, PDF), nikad sam rad.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'guarantee-evidence',
  'guarantee-evidence',
  false,
  10485760,  -- 10 MiB
  array['image/png', 'image/jpeg', 'image/webp', 'application/pdf']
)
on conflict (id) do update
  set public = false,
      file_size_limit = 10485760,
      allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp', 'application/pdf'];

-- Vlasnistvo se izvodi iz PRVOG segmenta putanje (`<uid>/...`), isti obrazac kao ostali
-- privatni bucketi. Bez ovoga bi prijavljen korisnik mogao pisati po tudjem prefiksu.
drop policy if exists guarantee_evidence_insert_own on storage.objects;
create policy guarantee_evidence_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'guarantee-evidence'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );

drop policy if exists guarantee_evidence_select_own on storage.objects;
create policy guarantee_evidence_select_own on storage.objects
  for select to authenticated
  using (
    bucket_id = 'guarantee-evidence'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );

-- Namjerno NEMA update ni delete politike: dokaz koji je vezan uz zahtjev korisnik ne smije
-- naknadno zamijeniti ni maknuti. Ciscenje radi service role (admin), po rjesenju zahtjeva.
drop policy if exists guarantee_evidence_update_own on storage.objects;
drop policy if exists guarantee_evidence_delete_own on storage.objects;

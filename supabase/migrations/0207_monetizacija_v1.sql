-- 0207_monetizacija_v1.sql
--
-- Monetizacija V1, serverska strana (M2). Izvor istine: docs/decisions/MONETIZACIJA_V1.md
-- (odjeljci 3, 5, 6, 7, 10, 11, 13, 14, 24, 25 i 29), odluka vlasnika 2026-09-27.
--
-- NAPLATA JE TIJEKOM BETE ISKLJUCENA. Ova migracija mijenja katalog i shemu, ali nista ne
-- ukljucuje: create-checkout i dalje trazi Stripe kljuceve, a bez njih vraca 503.
--
-- Sto radi, redom:
--  1. `specijalisticki` postaje punopravna naplatna vrsta rada u svakom CHECK-u koji ogranicava
--     Lektin work_type (entitlements, products, faculty_requests, repair_jobs, corpus_contributions).
--     Katedrine tablice iz 0035 (academic_projects, katedra_projects) imaju VLASTITI imenski prostor
--     i ovdje se namjerno ne diraju.
--  2. Verzionirani skupovi prava (`offer_codes`, odjeljak 13) i `products.offer_code`.
--  3. Snapshot prava na entitlementu (`offer_code`, `capabilities`, `slot_window_days`,
--     `paid_amount_cents`) i stupci nadogradnje Repair -> Final Pass (odjeljak 14). Snapshot prozora
--     je ono sto odluka o pristupu stvarno cita (src/report/entitlement-access.ts), a trigger ga
--     upisuje i za prava koja ne dolaze kroz webhook (nagrade, kuponi).
--  4. Novi proizvodi: slot_specijalisticki, pass_specijalisticki, pass_doktorski.
--  5. Ciljne cijene i prozori V1. Cijena se mijenja ISKLJUCIVO kroz set_product_price (0020), i to
--     samo kad se razlikuje, pa drugi prolaz ne dopisuje pricing_changelog.
--  6. Deaktivacija slot_zavrsni_do_obrane i slot_diplomski_do_obrane (active=false, NE brisanje).
--  7. `bonus_outbox.status` dobiva `cancelled`: puni povrat otkazuje obvezu koja jos ceka (F21), a
--     `webhook_events.outcome_note` nosi korak i gresku sporednog pada povrata (F21);
--     `bonus_outbox.done_reason` nosi razlog trajne odluke bez izvrsenja (Codex PR #217, M2).
--  8. apply_entitlement_upgrade: atomska pretvorba Repair prava u Final Pass za ISTI entitlement.
--     Pretvorba pamti stanje Repair prava prije nje (upgraded_from_*).
--  9. revert_entitlement_upgrade: puni povrat SAMO uplate nadogradnje vraca pravo na zapamceni
--     Repair (proizvod, ponuda, prava, prozor, rok potrosnje i istek vezanog slota), ne gasi ga.
-- 10. note_entitlement_partial_refund: djelomican povrat se vodi u bazi (`refunded_cents`) i
--     uskladjuje s nadogradnjom pod istim zakljucavanjem kao pretvorba (Codex pregled PR #217, M1).
--
-- IDEMPOTENTNO: if not exists, on conflict do nothing, drop constraint prije add, i uvjetni upisi
-- (is distinct from). Drugi prolaz ne mijenja ni jedan redak.

-- ---------------------------------------------------------------------------------------------
-- 1. work_type CHECK: specijalisticki
-- ---------------------------------------------------------------------------------------------
-- Ogranicenja iz 0001, 0002, 0011/0054, 0026 i 0102 su stupcani CHECK bez deklariranog imena, pa
-- Postgres daje zadano ime `<tablica>_work_type_check` (izmjereno nad stvarnim migracijama u PGliteu,
-- tests/monetizacija-v1-sql.test.ts). BRISE SE SAMO TOCNO TO (Codex pregled PR #217, M3): nalazi se
-- svaki CHECK koji referencira stupac work_type (pg_constraint.conkey, ne podniz teksta), a brise se
-- samo ako mu je ime zadano, referencira JEDINO work_type i dopusta tocno stari skup vrijednosti (ili
-- novi, pri drugom prolazu). Sve drugo je RAISE EXCEPTION: nepoznato ogranicenje se ne brise naslijepo,
-- migracija pada glasno i trazi covjeka. Nakon toga se dodaje imenovano ogranicenje.
do $$
declare
  r record;
  v_vrijednosti text[];
begin
  for r in
    select t.relname as tabela, c.conname as ime, c.conkey as stupci, pg_catalog.pg_get_constraintdef(c.oid) as def
      from pg_catalog.pg_constraint c
      join pg_catalog.pg_class t on t.oid = c.conrelid
      join pg_catalog.pg_namespace n on n.oid = t.relnamespace
      join pg_catalog.pg_attribute a on a.attrelid = t.oid and a.attname = 'work_type'
     where n.nspname = 'public'
       and c.contype = 'c'
       and t.relname in ('entitlements', 'products', 'faculty_requests', 'repair_jobs', 'corpus_contributions')
       and a.attnum = any (c.conkey)
  loop
    select array_agg(distinct m[1] order by m[1]) into v_vrijednosti
      from regexp_matches(r.def, '''([^'']*)''', 'g') as m;
    if r.ime <> r.tabela || '_work_type_check'
       or cardinality(r.stupci) <> 1
       or (v_vrijednosti is distinct from array['diplomski', 'doktorski', 'seminarski', 'zavrsni']
           and v_vrijednosti is distinct from array['diplomski', 'doktorski', 'seminarski', 'specijalisticki', 'zavrsni']) then
      raise exception '0207: neocekivan work_type CHECK %.% (%); ne brise se naslijepo', r.tabela, r.ime, r.def;
    end if;
    execute format('alter table public.%I drop constraint %I', r.tabela, r.ime);
  end loop;
end $$;

alter table public.entitlements add constraint entitlements_work_type_check
  check (work_type in ('seminarski', 'zavrsni', 'diplomski', 'specijalisticki', 'doktorski'));
alter table public.products add constraint products_work_type_check
  check (work_type in ('seminarski', 'zavrsni', 'diplomski', 'specijalisticki', 'doktorski'));
alter table public.faculty_requests add constraint faculty_requests_work_type_check
  check (work_type is null or work_type in ('seminarski', 'zavrsni', 'diplomski', 'specijalisticki', 'doktorski'));
alter table public.repair_jobs add constraint repair_jobs_work_type_check
  check (work_type in ('seminarski', 'zavrsni', 'diplomski', 'specijalisticki', 'doktorski'));
alter table public.corpus_contributions add constraint corpus_contributions_work_type_check
  check (work_type in ('seminarski', 'zavrsni', 'diplomski', 'specijalisticki', 'doktorski'));

-- ---------------------------------------------------------------------------------------------
-- 2. Verzionirani skupovi prava (odjeljak 13)
-- ---------------------------------------------------------------------------------------------
-- Funkcije se ne vezu uz products.kind nego uz verzionirani offer_code. Postojeci kod se NE mijenja:
-- nova ponuda dobiva novi kod (repair_v2), a staro pravo zadrzava snapshot iz trenutka kupnje.
create table if not exists public.offer_codes (
  code text primary key,
  capabilities text[] not null check (cardinality(capabilities) > 0),
  note text,
  created_at timestamptz not null default now()
);

insert into public.offer_codes (code, capabilities, note) values
  ('repair_v1', array['full_report', 'repair', 'repair_diff', 'recheck'],
   'Repair: jedna faza ili verzija rada (odjeljak 5).'),
  ('final_pass_v1', array['full_report', 'repair', 'repair_diff', 'recheck', 'revision_history', 'revision_compare',
                          'citation_audit', 'submission_ready', 'verification_passport', 'final_submission_gate'],
   'Final Pass: isti rad do predaje ili obrane (odjeljak 6).'),
  ('semester_pass_v1', array['multi_document_slots', 'full_report', 'repair', 'repair_diff', 'recheck'],
   'Semester Pass: vise seminarskih radova, svaki u vlastitom slotu (odjeljak 7).'),
  ('expert_v1', array['human_review'],
   'Expert: ljudski pregled forme, bez pisanja sadrzaja (odjeljak 8).')
on conflict (code) do nothing;

comment on table public.offer_codes is
  'Verzionirani skupovi prava (MONETIZACIJA_V1.md odjeljak 13). Postojeci kod se ne mijenja; nova ponuda je novi kod.';

-- PRIVILEGIJE IZRICITO (Codex pregled PR #217, M4). Klijent (anon, authenticated) offer_codes ne
-- cita: paywall cita samo products, a prava ponude cita webhook-mor service roleom (ugradnja
-- products -> offer_codes). Supabase zadane privilegije bi anon i authenticated inace dale SELECT,
-- INSERT, UPDATE, DELETE i TRUNCATE, pa ih ovdje oduzimamo; service_role dobiva samo DML koji Edge
-- i odrzavanje kataloga trebaju. RLS ostaje ukljucen bez ijednog policyja (default deny), kao
-- druga crta. Gard: tests/monetizacija-v1-sql.test.ts (privilegeProblems) i gate-mutations.
alter table public.offer_codes enable row level security;
drop policy if exists offer_codes_select_all on public.offer_codes;
revoke all on table public.offer_codes from public, anon, authenticated;
grant select, insert, update, delete on table public.offer_codes to service_role;

alter table public.products add column if not exists offer_code text references public.offer_codes(code);

-- ---------------------------------------------------------------------------------------------
-- 3. Snapshot prava na entitlementu i nadogradnja
-- ---------------------------------------------------------------------------------------------
-- offer_code, capabilities i slot_window_days se upisuju PRI KUPNJI (webhook-mor,
-- buildEntitlementInsert), pa buduca promjena kataloga ne oduzima kupljeno. slot_window_days je
-- stvarno provedeno pravo: generate-report i repair-docx ga citaju prije zivog products retka.
-- paid_amount_cents je stvarno naplacen iznos (Stripe amount_received); jedino on smije umanjiti
-- cijenu nadogradnje. NULL = nepoznato, pa nadogradnja za takvo pravo NIJE dopustena (fail-closed),
-- umjesto da se iznos pogadja iz danasnjeg cjenika.
--
-- JEDAN STRANI KLJUC entitlements -> products (product_id iz 0002). upgraded_from_product_id je
-- NAMJERNO bez references: drugi kljuc prema products cini ugradnju `products(...)` dvosmislenom
-- (PostgREST PGRST201), a generate-report i repair-docx bi tada svako placeno pravo vidjeli kao
-- nepostojece. Gard: tests/monetizacija-v1-migracija.test.ts (jedan FK) i gate-mutations.
alter table public.entitlements
  add column if not exists offer_code text references public.offer_codes(code),
  add column if not exists capabilities text[],
  add column if not exists slot_window_days integer check (slot_window_days is null or slot_window_days > 0),
  add column if not exists paid_amount_cents integer check (paid_amount_cents is null or paid_amount_cents >= 0),
  add column if not exists upgrade_order_id text,
  add column if not exists upgrade_paid_cents integer check (upgrade_paid_cents is null or upgrade_paid_cents >= 0),
  add column if not exists upgraded_from_product_id text,
  add column if not exists upgraded_at timestamptz,
  -- Stanje Repair prava PRIJE nadogradnje (krug 4): povrat uplate nadogradnje ga vraca, pa placeni
  -- Repair ostaje, a Final Pass za vracen novac nestaje (revert_entitlement_upgrade, odjeljak 9).
  add column if not exists upgraded_from_offer_code text,
  add column if not exists upgraded_from_capabilities text[],
  add column if not exists upgraded_from_slot_window_days integer,
  add column if not exists upgraded_from_purchase_expires_at timestamptz,
  add column if not exists upgraded_from_slot_expires_at timestamptz,
  add column if not exists upgrade_reverted_at timestamptz,
  -- Djelomicno vraceno od IZVORNE uplate (order_id), kumulativno kao Stripe `amount_refunded`
  -- (M1). Upisuje ga SAMO note_entitlement_partial_refund (odjeljak 10), pod zakljucavanjem retka.
  add column if not exists refunded_cents integer not null default 0 check (refunded_cents >= 0);

-- Ako je raniji nacrt ove migracije ikad dodao kljuc na upgraded_from_product_id, ukloni ga.
alter table public.entitlements drop constraint if exists entitlements_upgraded_from_product_id_fkey;

-- Snapshot prozora za postojeca prava: prozor proizvoda PRIJE promjena iz odjeljka 5 nize, jer je
-- pravo kupljeno pod tim uvjetima (odjeljak 13: staro pravo zadrzava snapshot).
update public.entitlements e
   set slot_window_days = p.slot_window_days
  from public.products p
 where e.product_id = p.id
   and e.slot_window_days is null
   and p.slot_window_days is not null;

-- Snapshot pri svakom upisu prava, i kad ga ne pise webhook (friend referral, rulebook nagrada,
-- kuponi): popunjava SAMO prazna polja iz kataloga u trenutku upisa, pa eksplicitan snapshot
-- iz webhooka ostaje netaknut.
create or replace function public.entitlements_snapshot_offer()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_product public.products;
  v_caps text[];
begin
  if new.product_id is null then
    return new;
  end if;
  select * into v_product from public.products where id = new.product_id;
  if not found then
    return new;
  end if;
  if new.slot_window_days is null then
    new.slot_window_days := v_product.slot_window_days;
  end if;
  if new.offer_code is null then
    new.offer_code := v_product.offer_code;
  end if;
  if new.capabilities is null and new.offer_code is not null then
    select o.capabilities into v_caps from public.offer_codes o where o.code = new.offer_code;
    new.capabilities := v_caps;
  end if;
  return new;
end;
$$;

drop trigger if exists entitlements_snapshot_offer on public.entitlements;
create trigger entitlements_snapshot_offer
  before insert on public.entitlements
  for each row execute function public.entitlements_snapshot_offer();

-- Jedna uplata nadogradnje pretvara NAJVISE jedno pravo; retry iste uplate ne moze pretvoriti drugo.
create unique index if not exists entitlements_upgrade_order_uidx
  on public.entitlements (upgrade_order_id) where upgrade_order_id is not null;

comment on column public.entitlements.offer_code is
  'Snapshot products.offer_code u trenutku kupnje (MONETIZACIJA_V1.md odjeljak 13, Snapshot prava).';
comment on column public.entitlements.capabilities is
  'Snapshot offer_codes.capabilities u trenutku kupnje; promjena kataloga ga ne mijenja.';
comment on column public.entitlements.slot_window_days is
  'Snapshot products.slot_window_days u trenutku kupnje; odluka o pristupu ga cita prije zivog kataloga.';
comment on column public.entitlements.paid_amount_cents is
  'Stvarno naplaceno pri kupnji (Stripe amount_received). NULL = nepoznato, nadogradnja tada nije dopustena.';
comment on column public.entitlements.upgrade_order_id is
  'PaymentIntent nadogradnje Repair -> Final Pass koji je PRETVORIO ovo pravo (odjeljak 14). Najvise jedan.';
comment on column public.entitlements.upgraded_from_slot_expires_at is
  'Istek vezanog slota PRIJE nadogradnje; NULL = pravo pri nadogradnji nije bilo vezano uz rad.';
comment on column public.entitlements.upgrade_reverted_at is
  'Kad je puni povrat uplate nadogradnje vratio pravo na zapamceni Repair (revert_entitlement_upgrade).';
comment on column public.entitlements.refunded_cents is
  'Djelomicno vraceno od izvorne uplate (Stripe amount_refunded, kumulativno). > 0 = nadogradnja nije dopustena.';

-- ---------------------------------------------------------------------------------------------
-- 4. Novi proizvodi (odjeljci 3, 5, 6, 25)
-- ---------------------------------------------------------------------------------------------
-- purchase_window_days za slot_specijalisticki dokument ne propisuje; uzet je zadani rok potrosnje
-- slota (90 dana, kao slot_zavrsni i slot_diplomski). Pass trajanje je slot i purchase prozor (0017).
insert into public.products (id, kind, audience, work_type, slots_total, slot_window_days, purchase_window_days, price_eur, offer_code, sort) values
  ('slot_specijalisticki', 'slot', 'retail', 'specijalisticki', 1, 21, 90, 16.99, 'repair_v1', 35),
  ('pass_specijalisticki', 'pass', 'retail', 'specijalisticki', 1, 240, 240, 29.99, 'final_pass_v1', 36),
  ('pass_doktorski', 'pass', 'retail', 'doktorski', 1, 365, 365, 39.99, 'final_pass_v1', 42)
on conflict (id) do nothing;

insert into public.pricing_changelog (product_id, change_type, new_value, note)
select v.id, 'packaging', v.opis, 'Monetizacija V1 (docs/decisions/MONETIZACIJA_V1.md odjeljak 25): novi proizvod.'
  from (values
    ('slot_specijalisticki', 'slot, 21d prozor, 16.99, repair_v1'),
    ('pass_specijalisticki', 'pass, 240d prozor, 29.99, final_pass_v1'),
    ('pass_doktorski', 'pass, 365d prozor, 39.99, final_pass_v1')
  ) as v(id, opis)
 where not exists (
   select 1 from public.pricing_changelog c
    where c.product_id = v.id and c.change_type = 'packaging' and c.new_value = v.opis
 );

-- ---------------------------------------------------------------------------------------------
-- 5. Ciljno stanje V1: cijena, prozori i offer_code (odjeljak 25)
-- ---------------------------------------------------------------------------------------------
-- Jedan popis, jedan izvor: tests/monetizacija-v1-migracija.test.ts ga parsira i usporedjuje s
-- tablicom iz odjeljka 25. Cijena ide kroz set_product_price (products + pricing_changelog u istoj
-- transakciji), i to SAMO kad se razlikuje: set_product_price sam ne usporedjuje staru i novu
-- vrijednost, pa bi bezuvjetan poziv pri drugom prolazu dopisao suvisan redak u changelog.
-- Prozori nisu cijena; mijenjaju se izravno, uz packaging redak u changelogu, isto samo kad se razlikuju.
do $$
declare
  v record;
  p record;
begin
  for v in
    select * from (values
      ('slot_seminarski', 3.99, 7, 90, 'repair_v1'),
      ('slot_zavrsni', 5.99, 7, 90, 'repair_v1'),
      ('slot_diplomski', 9.99, 14, 90, 'repair_v1'),
      ('slot_specijalisticki', 16.99, 21, 90, 'repair_v1'),
      ('slot_doktorski', 24.99, 30, 120, 'repair_v1'),
      ('pass_zavrsni', 12.99, 180, 180, 'final_pass_v1'),
      ('pass_diplomski', 19.99, 180, 180, 'final_pass_v1'),
      ('pass_specijalisticki', 29.99, 240, 240, 'final_pass_v1'),
      ('pass_doktorski', 39.99, 365, 365, 'final_pass_v1'),
      ('pass_semestralni', 14.99, 7, 180, 'semester_pass_v1')
    ) as t(id, price_eur, slot_window_days, purchase_window_days, offer_code)
  loop
    select * into p from public.products where id = v.id for update;
    if not found then
      raise exception 'monetizacija_v1: proizvod % ne postoji', v.id;
    end if;

    if p.price_eur is distinct from v.price_eur::numeric then
      perform public.set_product_price(v.id, v.price_eur::numeric,
        'Monetizacija V1 (docs/decisions/MONETIZACIJA_V1.md odjeljci 3, 5, 6, 7), odluka vlasnika 2026-09-27');
    end if;

    if p.slot_window_days is distinct from v.slot_window_days
       or p.purchase_window_days is distinct from v.purchase_window_days then
      update public.products
         set slot_window_days = v.slot_window_days,
             purchase_window_days = v.purchase_window_days
       where id = v.id;
      insert into public.pricing_changelog (product_id, change_type, old_value, new_value, note)
      values (v.id, 'packaging',
              format('slot %sd, kupnja %sd', p.slot_window_days, p.purchase_window_days),
              format('slot %sd, kupnja %sd', v.slot_window_days, v.purchase_window_days),
              'Monetizacija V1 (docs/decisions/MONETIZACIJA_V1.md odjeljci 5, 6, 7): prozor.');
    end if;

    if p.offer_code is distinct from v.offer_code then
      update public.products set offer_code = v.offer_code where id = v.id;
    end if;
  end loop;
end $$;

-- Ostali Lektini proizvodi dobivaju offer_code po vrsti: bundle je N Repair slotova, premium_human
-- je ljudski pregled, a do_obrane su slotovi. Katedrini proizvodi (katedra_*) ostaju bez koda:
-- Lektin checkout ih ne prodaje, a njihova prava vodi Katedra.
update public.products
   set offer_code = case
     when kind in ('slot', 'bundle') then 'repair_v1'
     when kind = 'premium_human' then 'expert_v1'
   end
 where offer_code is null
   and id not like 'katedra\_%'
   and kind in ('slot', 'bundle', 'premium_human');

-- Postojeca prava dobivaju snapshot ponude svog proizvoda (samo gdje ga nemaju). paid_amount_cents
-- se NE izmislja: ostaje NULL, pa takvo pravo nije kandidat za nadogradnju.
update public.entitlements e
   set offer_code = p.offer_code,
       capabilities = o.capabilities
  from public.products p
  join public.offer_codes o on o.code = p.offer_code
 where e.product_id = p.id
   and e.offer_code is null;

-- ---------------------------------------------------------------------------------------------
-- 6. Kanibalizirajuci do_obrane SKU-ovi (odjeljak 10): deaktivacija, ne brisanje
-- ---------------------------------------------------------------------------------------------
-- Postojeca prava na njih ostaju (entitlements.product_id i dalje pokazuje na redak). Paywall ih
-- vise ne vidi (RLS products_select_active i fetchRetailCatalog citaju active=true), a
-- create-checkout ih ne prodaje (upit filtrira active=true, resolveCheckout odbija neaktivan).
with ugaseno as (
  update public.products
     set active = false
   where id in ('slot_zavrsni_do_obrane', 'slot_diplomski_do_obrane')
     and active is distinct from false
  returning id
)
insert into public.pricing_changelog (product_id, change_type, old_value, new_value, note)
select id, 'packaging', 'active=true', 'active=false',
       'Monetizacija V1 (docs/decisions/MONETIZACIJA_V1.md odjeljak 10): do obrane pripada Final Passu.'
  from ugaseno;

-- ---------------------------------------------------------------------------------------------
-- 7. bonus_outbox: otkazana obveza (F21)
-- ---------------------------------------------------------------------------------------------
-- Puni povrat otkazuje obvezu koja jos ceka (webhook-mor closeRefundConsequences), a radnik
-- (process-bonus-outbox) prije i poslije izvrsenja cita oznaku povrata. `cancelled` je zavrsno
-- stanje: claim_due_bonus_outbox (0100) uzima samo `pending`.
-- Isto pravilo kao work_type (M3): CHECK nad stupcem status smije biti samo zadani
-- `bonus_outbox_status_check` iz 0100 (ili ovaj, pri drugom prolazu); sve drugo je RAISE EXCEPTION.
do $$
declare
  r record;
  v_vrijednosti text[];
begin
  for r in
    select c.conname as ime, c.conkey as stupci, pg_catalog.pg_get_constraintdef(c.oid) as def
      from pg_catalog.pg_constraint c
      join pg_catalog.pg_class t on t.oid = c.conrelid
      join pg_catalog.pg_namespace n on n.oid = t.relnamespace
      join pg_catalog.pg_attribute a on a.attrelid = t.oid and a.attname = 'status'
     where n.nspname = 'public'
       and t.relname = 'bonus_outbox'
       and c.contype = 'c'
       and a.attnum = any (c.conkey)
  loop
    select array_agg(distinct m[1] order by m[1]) into v_vrijednosti
      from regexp_matches(r.def, '''([^'']*)''', 'g') as m;
    if r.ime <> 'bonus_outbox_status_check'
       or cardinality(r.stupci) <> 1
       or (v_vrijednosti is distinct from array['done', 'failed', 'pending']
           and v_vrijednosti is distinct from array['cancelled', 'done', 'failed', 'pending']) then
      raise exception '0207: neocekivan status CHECK bonus_outbox.% (%); ne brise se naslijepo', r.ime, r.def;
    end if;
    execute format('alter table public.bonus_outbox drop constraint %I', r.ime);
  end loop;
end $$;

alter table public.bonus_outbox add constraint bonus_outbox_status_check
  check (status in ('pending', 'done', 'failed', 'cancelled'));

-- Korak i greska sporednog pada povrata (F21, stavka 2). outcome_detail ostaje TOCNO oznaka iz
-- REFUND_MARKERS (webhook-mor je cita doslovnom usporedbom), pa detalj ide u zaseban stupac.
alter table public.webhook_events add column if not exists outcome_note text;
comment on column public.webhook_events.outcome_note is
  'Dijagnostika uz outcome_detail (npr. korak i greska sporednog pada povrata). Nikad se ne vraca klijentu.';

comment on column public.bonus_outbox.status is
  'pending = ceka ili se ponavlja; done = izvrseno; failed = odustalo nakon max pokusaja; cancelled = otkazano punim povratom izvorne uplate (F21).';

-- Trajna odluka bez izvrsenja (Codex pregled PR #217, M2): nagrada preporucitelju se ne dodjeljuje
-- jer preporuke nema ili je vec nagradjena, zbog prijevare po IP-u ili mjesecnog stropa, ili je
-- pravo vec izdao raniji pokusaj (insert padne na 23505, dovrsavanje referral_signups idempotentno).
-- Obveza je tada `done` uz razlog, a prolazan pad dodjele ostaje `pending` (radnik ga ponovi).
alter table public.bonus_outbox add column if not exists done_reason text;
comment on column public.bonus_outbox.done_reason is
  'Revizijska biljeska: razlog trajne odluke bez nove dodjele uz status done (npr. ip_match_fraud, already_granted). NULL obicno znaci da je nagrada izdana ovim redom, ali NIJE zajamceno (kasniji korak, npr. upis u referral_signups, mogao je tiho pasti); izvor istine o izdanoj nagradi je referral_signups.status/referrer_reward_entitlement_id.';

-- ---------------------------------------------------------------------------------------------
-- 8. Nadogradnja Repair -> Final Pass (odjeljak 14)
-- ---------------------------------------------------------------------------------------------
-- Poziva je SAMO webhook-mor nakon potvrdjene uplate nadogradnje. Cijenu racuna create-checkout
-- (ciljna cijena iz products.price_eur minus paid_amount_cents istog prava), a webhook je provjerava
-- istom funkcijom prije poziva. Ovdje se provode pravila koja ovise o stanju retka i moraju biti
-- atomska s pretvorbom:
--  * ISTI RAD: pretvara se ISTI entitlement (isti slot, isti otisak dokumenta), slots_total ostaje 1,
--    pa Final Pass ne moze prijeci na drugi rad; vezani slot dobiva dulji prozor.
--  * ISTA VRSTA RADA: ciljni proizvod mora imati isti work_type kao pravo.
--  * JEDNOM: pravo koje je vec nadogradjeno (upgrade_order_id) se ne pretvara ponovno; ista uplata
--    (retry) vraca `duplicate`, a druga uplata `unavailable` (webhook je salje na rucni pregled).
--  * AKTIVNO: pravo mora biti aktivno (nije vraceno ni ponisteno).
--  * ROK POTROSNJE (purchase_expires_at) vrijedi SAMO za nevezano pravo (slots_used = 0): to je rok
--    do kojeg se pravo smije vezati uz rad. Vezano pravo ga je vec iskoristilo, pa za njega nije
--    granica (krug 4): slot_diplomski kupljen na dan 0 (kupovni prozor 90) i vezan na dan 85 zivi
--    do dana 99, a purge ga anonimizira tek nakon dana 129; odbijanje na dan 92 kaznilo bi Repair
--    kupca. Pretvorba rok potrosnje produlji (greatest nize).
--  * VEZANI RAD JE JOS PREPOZNATLJIV: pravo koje je vec vezano uz rad (slots_used > 0) mora imati
--    slot ciji otisak NIJE anonimiziran. Ni istek prozora slota ni istek roka potrosnje nisu granica
--    (odjeljak 14: korisnik koji je prvo kupio Repair ne smije biti kaznjen); pretvorba tada ISTI
--    slot ozivi na prozor Final Passa (greatest nize). Granica je purge_document_slots (0016): 30 dana nakon isteka brise
--    naslov, autora i poglavlja iz otiska, i produljenje takvog slota dalo bi placen Final Pass koji
--    ne prepoznaje nijednu verziju rada. Kriterij je tocno obrat purgea: otisak ima barem jedan od
--    kljuceva koje purge brise (src/report/upgrade.ts ANONYMIZED_FINGERPRINT_KEYS, isti popis).
--    Slot se zakljucava (for update), pa purge koji krene istodobno ceka i nakon pretvorbe vise ne
--    pogadja produljen slot. Vraca `slot_anonymized`; webhook uplatu salje na rucni pregled.
--    Nevezano pravo (slots_used = 0) se smije pretvoriti.
--  * BEZ DJELOMICNOG POVRATA (Codex pregled PR #217, M1): odbitak je puni placeni iznos Repaira, pa
--    djelomicno vracena izvorna uplata (refunded_cents > 0 ili oznaka `partial_refund_noted` njezina
--    PaymentIntenta) ili djelomicno vracena uplata same nadogradnje vraca `partially_refunded`
--    (webhook uplatu salje na rucni pregled). Provjera je POD ZAKLJUCAVANJEM, u istoj transakciji
--    kao pretvorba, pa je citanje oznake u Edgeu (readSourcePartiallyRefunded) samo rani izlaz:
--      - povrat izvorne uplate: note_entitlement_partial_refund zakljucava ISTI redak (po order_id,
--        koji se ne mijenja); tko drugi dodje, vidi upis prvoga;
--      - povrat uplate nadogradnje: redak prije pretvorbe ne nosi njezin PaymentIntent, pa obje
--        funkcije PRVO uzimaju isti savjetodavni kljuc `lekta:refund:<PaymentIntent>`.
--    Webhook oznaku povrata upise (i potvrdi) PRIJE poziva note_entitlement_partial_refund, a ova
--    funkcija je cita tek nakon zakljucavanja, pa povrat koji ona ne vidi naidje na vec pretvoren
--    redak i salje ga na rucni pregled (odjeljak 10).
-- Snapshot prava (offer_code, capabilities) se cita iz kataloga U ISTOJ transakciji.
create or replace function public.apply_entitlement_upgrade(
  p_entitlement_id uuid,
  p_user_id uuid,
  p_upgrade_order_id text,
  p_target_product_id text,
  p_upgrade_paid_cents integer,
  p_purchase_expires_at timestamptz,
  p_slot_expires_at timestamptz
) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ent public.entitlements;
  v_target public.products;
  v_caps text[];
  v_slot_prije timestamptz;
begin
  if coalesce(p_upgrade_order_id, '') = '' then
    raise exception 'upgrade_order_missing';
  end if;

  -- Isti kljuc kao note_entitlement_partial_refund za PaymentIntent nadogradnje; uvijek PRIJE
  -- zakljucavanja retka (isti redoslijed u obje funkcije, bez zastoja).
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('lekta:refund:' || p_upgrade_order_id, 0));

  select * into v_ent from public.entitlements where id = p_entitlement_id for update;
  if not found or v_ent.user_id is distinct from p_user_id then
    return 'unavailable';
  end if;
  if v_ent.upgrade_order_id = p_upgrade_order_id then
    return 'duplicate';
  end if;
  -- Djelomican povrat izvorne uplate ili uplate nadogradnje (M1, vidi komentar iznad funkcije).
  if v_ent.refunded_cents > 0
     or exists (
       select 1
         from public.webhook_events w
        where w.provider = 'stripe'
          and w.outcome_detail = 'partial_refund_noted'
          and w.order_id in (v_ent.order_id, p_upgrade_order_id)
     ) then
    return 'partially_refunded';
  end if;
  if v_ent.upgrade_order_id is not null
     or v_ent.status <> 'active'
     or v_ent.offer_code is distinct from 'repair_v1'
     or v_ent.slots_total <> 1 then
    return 'unavailable';
  end if;
  -- Rok potrosnje vrijedi samo dok pravo nije vezano uz rad (vidi komentar iznad funkcije).
  if v_ent.slots_used = 0 and v_ent.purchase_expires_at <= now() then
    return 'unavailable';
  end if;

  perform 1
     from public.document_slots s
    where s.entitlement_id = p_entitlement_id
      and s.fingerprint ?| array['authorNorm', 'titleNorm', 'headings']
      for update;
  if v_ent.slots_used > 0 and not found then
    return 'slot_anonymized';
  end if;

  select * into v_target from public.products where id = p_target_product_id;
  if not found
     or not v_target.active
     or v_target.offer_code is distinct from 'final_pass_v1'
     or v_target.work_type is distinct from v_ent.work_type then
    return 'unavailable';
  end if;

  select o.capabilities into v_caps from public.offer_codes o where o.code = v_target.offer_code;
  if v_caps is null then
    return 'unavailable';
  end if;

  -- Istek vezanog slota PRIJE pretvorbe (slot je gore zakljucan); NULL ako pravo jos nije vezano.
  select max(s.slot_expires_at) into v_slot_prije
    from public.document_slots s
   where s.entitlement_id = p_entitlement_id;

  update public.entitlements
     set upgraded_from_product_id = product_id,
         upgraded_from_offer_code = offer_code,
         upgraded_from_capabilities = capabilities,
         upgraded_from_slot_window_days = slot_window_days,
         upgraded_from_purchase_expires_at = purchase_expires_at,
         upgraded_from_slot_expires_at = v_slot_prije,
         product_id = v_target.id,
         offer_code = v_target.offer_code,
         capabilities = v_caps,
         slot_window_days = v_target.slot_window_days,
         upgrade_order_id = p_upgrade_order_id,
         upgrade_paid_cents = p_upgrade_paid_cents,
         upgraded_at = now(),
         purchase_expires_at = greatest(purchase_expires_at, p_purchase_expires_at)
   where id = p_entitlement_id;

  update public.document_slots
     set slot_expires_at = greatest(slot_expires_at, p_slot_expires_at)
   where entitlement_id = p_entitlement_id;

  return 'upgraded';
end;
$$;

revoke all on function public.apply_entitlement_upgrade(uuid, uuid, text, text, integer, timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.apply_entitlement_upgrade(uuid, uuid, text, text, integer, timestamptz, timestamptz)
  to service_role;

comment on function public.apply_entitlement_upgrade(uuid, uuid, text, text, integer, timestamptz, timestamptz) is
  'Atomska pretvorba Repair prava u Final Pass za isti entitlement (MONETIZACIJA_V1.md odjeljak 14). Samo webhook-mor.';

-- ---------------------------------------------------------------------------------------------
-- 9. Povrat uplate nadogradnje vraca Repair (odjeljak 14, krug 4)
-- ---------------------------------------------------------------------------------------------
-- Poziva je SAMO webhook-mor, kad je PUNO vracena uplata NADOGRADNJE (PaymentIntent u
-- upgrade_order_id). Izvorna Repair uplata je i dalje naplacena, pa korisnik koji je prvo kupio
-- Repair ne smije ostati bez njega (odjeljak 14), a Final Pass za vracen novac ne smije ostati.
-- Zato se pravo NE gasi nego vraca na stanje zapamceno pri pretvorbi (upgraded_from_*):
--  * proizvod, ponuda, prava, prozor slota i rok potrosnje Repaira;
--  * vezani slot na istek prije nadogradnje; slot vezan TEK nakon nadogradnje (tada zapamcenog
--    isteka nema) dobiva Repair prozor od trenutka vezivanja (bound_at + zapamceni prozor). least:
--    povrat nikad ne produljuje slot.
-- Ishodi: `reverted`; `duplicate` (vec vraceno: ponovljena dostava ili istodobna uplata i povrat;
-- redak je zakljucan, pa pise samo jedan poziv); `inactive` (pravo je vec vraceno ili ponisteno,
-- npr. jer je prvo vracena izvorna Repair uplata: nista se ne ozivljava); `not_found`;
-- `no_snapshot` (stanje prije nadogradnje nije zapamceno: webhook tada pravo gasi i salje na
-- rucni pregled, sigurnije nego pogadjati Repair iz danasnjeg kataloga).
-- upgrade_order_id i upgrade_paid_cents ostaju kao trag, pa vraceno pravo samo sebe ne nadogradjuje
-- ponovno (apply_entitlement_upgrade vraca `unavailable`); nova nadogradnja ide kroz rucni pregled.
create or replace function public.revert_entitlement_upgrade(
  p_upgrade_order_id text
) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ent public.entitlements;
begin
  if coalesce(p_upgrade_order_id, '') = '' then
    raise exception 'upgrade_order_missing';
  end if;

  select * into v_ent from public.entitlements where upgrade_order_id = p_upgrade_order_id for update;
  if not found then
    return 'not_found';
  end if;
  if v_ent.upgrade_reverted_at is not null then
    return 'duplicate';
  end if;
  if v_ent.status <> 'active' then
    return 'inactive';
  end if;
  if v_ent.upgraded_from_product_id is null
     or v_ent.upgraded_from_offer_code is null
     or v_ent.upgraded_from_slot_window_days is null
     or v_ent.upgraded_from_purchase_expires_at is null then
    return 'no_snapshot';
  end if;

  update public.document_slots s
     set slot_expires_at = least(
           s.slot_expires_at,
           coalesce(v_ent.upgraded_from_slot_expires_at,
                    s.bound_at + make_interval(days => v_ent.upgraded_from_slot_window_days)))
   where s.entitlement_id = v_ent.id;

  update public.entitlements
     set product_id = upgraded_from_product_id,
         offer_code = upgraded_from_offer_code,
         capabilities = upgraded_from_capabilities,
         slot_window_days = upgraded_from_slot_window_days,
         purchase_expires_at = upgraded_from_purchase_expires_at,
         upgrade_reverted_at = now()
   where id = v_ent.id;

  return 'reverted';
end;
$$;

revoke all on function public.revert_entitlement_upgrade(text) from public, anon, authenticated;
grant execute on function public.revert_entitlement_upgrade(text) to service_role;

comment on function public.revert_entitlement_upgrade(text) is
  'Puni povrat uplate nadogradnje vraca pravo na zapamceni Repair (MONETIZACIJA_V1.md odjeljak 14). Samo webhook-mor.';

-- ---------------------------------------------------------------------------------------------
-- 10. Djelomican povrat i nadogradnja (Codex pregled PR #217, M1)
-- ---------------------------------------------------------------------------------------------
-- Poziva je SAMO webhook-mor za DJELOMICAN povrat (`charge.refunded` ispod punog iznosa), i to
-- tek NAKON sto je oznaku `partial_refund_noted` upisao u inbox. p_refunded_cents je kumulativni
-- Stripe `amount_refunded` (NULL ako ga dogadjaj ne nosi). Pravo po PaymentIntentu:
--  * IZVORNA uplata (order_id): refunded_cents raste na vraceni iznos (greatest, pa ponovljena ili
--    zakasnjela dostava nizeg iznosa ne smanjuje zapis). Nenadogradjeno pravo zatim vise nije
--    kandidat za nadogradnju (apply_entitlement_upgrade `partially_refunded`), a pristup ostaje
--    (djelomican povrat ne oduzima placenu uslugu, PAY-09).
--  * uplata NADOGRADNJE (upgrade_order_id): iznos se ne pise (to nije izvorna uplata), redak se
--    samo zakljucava i procjenjuje.
-- Ishodi:
--  * `noted`: pravo nije (ili vise nije) nadogradjeno, nista ne ceka operatera;
--  * `upgraded_needs_review`: pravo je VEC pretvoreno u Final Pass (upgrade_order_id postavljen,
--    upgrade_reverted_at prazan, status active). Pretvorba je racunala odbitak od punog iznosa, pa
--    Final Pass sada stoji uz manji neto iznos. Pravo se NE dira automatski: vracanje na Repair
--    oduzelo bi Final Pass koji je nadogradnja platila, a automatska naplata razlike ne postoji.
--    Webhook ishod biljezi kao `needs_manual_review` i operater bira (docs/GO_LIVE_NAPLATA.md,
--    odjeljak 5.2): povrat uplate nadogradnje (revert_entitlement_upgrade vraca Repair) ili svjesno
--    zadrzavanje Final Passa;
--  * `not_found`: nema Lektina prava za taj PaymentIntent (npr. uplata jos nije knjizena). Oznaka u
--    inboxu ostaje, pa je apply_entitlement_upgrade kasnije ipak vidi.
-- Zakljucavanje: savjetodavni kljuc `lekta:refund:<PaymentIntent>` pa redak, isti redoslijed kao u
-- apply_entitlement_upgrade (odjeljak 8).
create or replace function public.note_entitlement_partial_refund(
  p_order_id text,
  p_refunded_cents integer
) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ent public.entitlements;
  v_ishod text := 'not_found';
begin
  if coalesce(p_order_id, '') = '' then
    raise exception 'order_missing';
  end if;
  if p_refunded_cents is not null and p_refunded_cents < 0 then
    raise exception 'refunded_cents_invalid';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('lekta:refund:' || p_order_id, 0));

  for v_ent in
    select *
      from public.entitlements e
     where e.provider = 'stripe'
       and (e.order_id = p_order_id or e.upgrade_order_id = p_order_id)
     order by e.id
       for update
  loop
    if v_ent.order_id = p_order_id then
      update public.entitlements
         set refunded_cents = greatest(refunded_cents, coalesce(p_refunded_cents, 0))
       where id = v_ent.id
         and refunded_cents < coalesce(p_refunded_cents, 0);
    end if;
    if v_ent.upgrade_order_id is not null
       and v_ent.upgrade_reverted_at is null
       and v_ent.status = 'active' then
      v_ishod := 'upgraded_needs_review';
    elsif v_ishod = 'not_found' then
      v_ishod := 'noted';
    end if;
  end loop;

  return v_ishod;
end;
$$;

revoke all on function public.note_entitlement_partial_refund(text, integer) from public, anon, authenticated;
grant execute on function public.note_entitlement_partial_refund(text, integer) to service_role;

comment on function public.note_entitlement_partial_refund(text, integer) is
  'Djelomican povrat: vodi vraceni iznos izvorne uplate i javlja vec nadogradjeno pravo (Codex PR #217, M1). Samo webhook-mor.';

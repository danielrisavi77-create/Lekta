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
--     `webhook_events.outcome_note` nosi korak i gresku sporednog pada povrata (F21).
--  8. apply_entitlement_upgrade: atomska pretvorba Repair prava u Final Pass za ISTI entitlement.
--
-- IDEMPOTENTNO: if not exists, on conflict do nothing, drop constraint prije add, i uvjetni upisi
-- (is distinct from). Drugi prolaz ne mijenja ni jedan redak.

-- ---------------------------------------------------------------------------------------------
-- 1. work_type CHECK: specijalisticki
-- ---------------------------------------------------------------------------------------------
-- Imena ogranicenja iz 0001, 0002, 0011/0054, 0026 i 0102 nisu deklarirana (stupcani CHECK), pa se
-- ne pretpostavlja zadani naziv nego se STVARNO ime cita iz pg_constraint. Nakon toga se dodaje
-- imenovano ogranicenje; drugi prolaz ga opet nadje (sadrzi work_type i doktorski) i zamijeni istim.
do $$
declare
  r record;
begin
  for r in
    select t.relname as tabela, c.conname as ime
      from pg_catalog.pg_constraint c
      join pg_catalog.pg_class t on t.oid = c.conrelid
      join pg_catalog.pg_namespace n on n.oid = t.relnamespace
     where n.nspname = 'public'
       and c.contype = 'c'
       and t.relname in ('entitlements', 'products', 'faculty_requests', 'repair_jobs', 'corpus_contributions')
       and pg_catalog.pg_get_constraintdef(c.oid) like '%work_type%'
       and pg_catalog.pg_get_constraintdef(c.oid) like '%doktorski%'
  loop
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

-- Opis ponude nije tajna (paywall ga smije citati); pisanje samo service role (bez policyja).
alter table public.offer_codes enable row level security;
drop policy if exists offer_codes_select_all on public.offer_codes;
create policy offer_codes_select_all on public.offer_codes for select using (true);

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
  add column if not exists upgraded_at timestamptz;

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
do $$
declare
  r record;
begin
  for r in
    select c.conname as ime
      from pg_catalog.pg_constraint c
      join pg_catalog.pg_class t on t.oid = c.conrelid
      join pg_catalog.pg_namespace n on n.oid = t.relnamespace
     where n.nspname = 'public'
       and t.relname = 'bonus_outbox'
       and c.contype = 'c'
       and pg_catalog.pg_get_constraintdef(c.oid) like '%status%'
       and pg_catalog.pg_get_constraintdef(c.oid) like '%pending%'
  loop
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
--  * ROK: pravo mora biti aktivno i unutar roka potrosnje (purchase_expires_at).
--  * VEZANI RAD JE JOS PREPOZNATLJIV: pravo koje je vec vezano uz rad (slots_used > 0) mora imati
--    slot ciji otisak NIJE anonimiziran. Istek prozora slota nije granica (odjeljak 14: korisnik
--    koji je prvo kupio Repair ne smije biti kaznjen); pretvorba tada ISTI slot ozivi na prozor
--    Final Passa (greatest nize). Granica je purge_document_slots (0016): 30 dana nakon isteka brise
--    naslov, autora i poglavlja iz otiska, i produljenje takvog slota dalo bi placen Final Pass koji
--    ne prepoznaje nijednu verziju rada. Kriterij je tocno obrat purgea: otisak ima barem jedan od
--    kljuceva koje purge brise (src/report/upgrade.ts ANONYMIZED_FINGERPRINT_KEYS, isti popis).
--    Slot se zakljucava (for update), pa purge koji krene istodobno ceka i nakon pretvorbe vise ne
--    pogadja produljen slot. Vraca `slot_anonymized`; webhook uplatu salje na rucni pregled.
--    Nevezano pravo (slots_used = 0) se smije pretvoriti.
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
begin
  if coalesce(p_upgrade_order_id, '') = '' then
    raise exception 'upgrade_order_missing';
  end if;

  select * into v_ent from public.entitlements where id = p_entitlement_id for update;
  if not found or v_ent.user_id is distinct from p_user_id then
    return 'unavailable';
  end if;
  if v_ent.upgrade_order_id = p_upgrade_order_id then
    return 'duplicate';
  end if;
  if v_ent.upgrade_order_id is not null
     or v_ent.status <> 'active'
     or v_ent.purchase_expires_at <= now()
     or v_ent.offer_code is distinct from 'repair_v1'
     or v_ent.slots_total <> 1 then
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

  update public.entitlements
     set upgraded_from_product_id = product_id,
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

comment on function public.apply_entitlement_upgrade(uuid, uuid, text, text, integer, timestamptz, timestamptz) is
  'Atomska pretvorba Repair prava u Final Pass za isti entitlement (MONETIZACIJA_V1.md odjeljak 14). Samo webhook-mor.';

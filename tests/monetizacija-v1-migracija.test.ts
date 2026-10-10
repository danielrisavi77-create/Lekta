// @vitest-environment node
/**
 * Migracija 0207 (Monetizacija V1, M2) mjerena nad TEKSTOM, jer se migracije u ovom toku ne
 * primjenjuju ni na jednu bazu. Kriterij je IZVAN diffa: tablice iz
 * docs/decisions/MONETIZACIJA_V1.md (odjeljci 5, 6, 7, 10, 13, 24, 25) prepisane su ovdje kao
 * ocekivanje, a migracija se parsira i usporedjuje s njima.
 *
 * Sto ovaj test NE dokazuje: da se SQL izvrsava na Postgresu i da je drugi prolaz stvarno no-op u
 * bazi. To ostaje za `supabase db push` na stagingu. Ovdje se dokazuje oblik: da svaka ciljna
 * vrijednost postoji tocno jednom, da cijena ide samo kroz set_product_price uz usporedbu, da se
 * do_obrane gasi a ne brise, i da su konstrukcije idempotentne.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { seededProducts } from './helpers/product-seeds';
import { entitlementProductFkCount } from './helpers/monetizacija-v1-guards';
import { mapProductRow } from '../src/catalog/products-catalog';

const FILE = '0207_monetizacija_v1.sql';
const RAW = readFileSync(resolve(process.cwd(), 'supabase', 'migrations', FILE), 'utf8').replace(/\r\n/g, '\n');
/** SQL bez komentara, da tekst komentara ne moze zadovoljiti ni oboriti tvrdnju. */
const SQL = RAW.replace(/--[^\n]*/g, '');

const WORK_TYPES_V1 = ['seminarski', 'zavrsni', 'diplomski', 'specijalisticki', 'doktorski'];

/** Odjeljak 25 (i 5, 6, 7): ciljno stanje. Prozor slota, rok kupnje, cijena, ponuda. */
const V1_CATALOG: Record<string, { price: number; slotWindow: number; purchaseWindow: number; offer: string }> = {
  slot_seminarski: { price: 3.99, slotWindow: 7, purchaseWindow: 90, offer: 'repair_v1' },
  slot_zavrsni: { price: 5.99, slotWindow: 7, purchaseWindow: 90, offer: 'repair_v1' },
  slot_diplomski: { price: 9.99, slotWindow: 14, purchaseWindow: 90, offer: 'repair_v1' },
  slot_specijalisticki: { price: 16.99, slotWindow: 21, purchaseWindow: 90, offer: 'repair_v1' },
  slot_doktorski: { price: 24.99, slotWindow: 30, purchaseWindow: 120, offer: 'repair_v1' },
  pass_zavrsni: { price: 12.99, slotWindow: 180, purchaseWindow: 180, offer: 'final_pass_v1' },
  pass_diplomski: { price: 19.99, slotWindow: 180, purchaseWindow: 180, offer: 'final_pass_v1' },
  pass_specijalisticki: { price: 29.99, slotWindow: 240, purchaseWindow: 240, offer: 'final_pass_v1' },
  pass_doktorski: { price: 39.99, slotWindow: 365, purchaseWindow: 365, offer: 'final_pass_v1' },
  // Semester Pass: 6 seminarskih slotova, svaki s Repair prozorom seminarskog, kroz 180 dana.
  pass_semestralni: { price: 14.99, slotWindow: 7, purchaseWindow: 180, offer: 'semester_pass_v1' },
};

/** Odjeljak 13: skupovi prava po ponudi. */
const OFFER_CAPABILITIES: Record<string, string[]> = {
  repair_v1: ['full_report', 'repair', 'repair_diff', 'recheck'],
  final_pass_v1: [
    'full_report', 'repair', 'repair_diff', 'recheck', 'revision_history', 'revision_compare',
    'citation_audit', 'submission_ready', 'verification_passport', 'final_submission_gate',
  ],
  semester_pass_v1: ['multi_document_slots', 'full_report', 'repair', 'repair_diff', 'recheck'],
  expert_v1: ['human_review'],
};

/** Popis ciljnog stanja iz DO bloka (odjeljak 5 migracije). Baca ako ga nema, ne vraca prazno. */
function parseTargetValues(sql: string): Record<string, { price: number; slotWindow: number; purchaseWindow: number; offer: string }> {
  const m = /select \* from \(values([\s\S]*?)\)\s*as t\(id, price_eur, slot_window_days, purchase_window_days, offer_code\)/.exec(sql);
  if (!m) throw new Error('0207: popis ciljnog stanja V1 nije pronadjen');
  const out: Record<string, { price: number; slotWindow: number; purchaseWindow: number; offer: string }> = {};
  for (const t of m[1].matchAll(/\('([a-z_]+)',\s*([\d.]+),\s*(\d+),\s*(\d+),\s*'([a-z_0-9]+)'\)/g)) {
    if (out[t[1]]) throw new Error(`0207: ${t[1]} dvaput u popisu ciljnog stanja`);
    out[t[1]] = { price: Number(t[2]), slotWindow: Number(t[3]), purchaseWindow: Number(t[4]), offer: t[5] };
  }
  return out;
}

/** `insert into public.offer_codes ... values (...)`: kod -> prava. */
function parseOfferCodes(sql: string): Record<string, string[]> {
  const m = /insert into public\.offer_codes \(code, capabilities, note\) values([\s\S]*?)on conflict \(code\) do nothing/.exec(sql);
  if (!m) throw new Error('0207: insert u offer_codes nije pronadjen');
  const out: Record<string, string[]> = {};
  for (const t of m[1].matchAll(/\('([a-z_0-9]+)',\s*array\[([^\]]*)\]/g)) {
    out[t[1]] = [...t[2].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]);
  }
  return out;
}

describe('0207: generator (parser vidi cijelu migraciju)', () => {
  it('popis ciljnog stanja ima tocno 10 proizvoda iz odjeljka 25', () => {
    expect(Object.keys(parseTargetValues(SQL)).sort()).toEqual(Object.keys(V1_CATALOG).sort());
  });

  it('offer_codes ima tocno cetiri ponude iz odjeljka 13', () => {
    expect(Object.keys(parseOfferCodes(SQL)).sort()).toEqual(Object.keys(OFFER_CAPABILITIES).sort());
  });
});

describe('0207: ciljno stanje odgovara dokumentu', () => {
  it('cijena, prozor slota, rok kupnje i offer_code svakog proizvoda su iz odjeljka 25', () => {
    expect(parseTargetValues(SQL)).toEqual(V1_CATALOG);
  });

  it('skupovi prava su doslovno iz odjeljka 13', () => {
    expect(parseOfferCodes(SQL)).toEqual(OFFER_CAPABILITIES);
  });

  it('novi proizvodi su sijani s istim vrijednostima kao ciljno stanje (bez drugog izvora)', () => {
    const novi = seededProducts().filter((s) => s.file === FILE);
    expect(novi.map((s) => s.row.id).sort()).toEqual(['pass_doktorski', 'pass_specijalisticki', 'slot_specijalisticki']);
    for (const { row } of novi) {
      const id = String(row.id);
      const cilj = V1_CATALOG[id];
      const p = mapProductRow(row);
      expect(p.priceEur, id).toBe(cilj.price);
      expect(p.slotWindowDays, id).toBe(cilj.slotWindow);
      expect(p.purchaseWindowDays, id).toBe(cilj.purchaseWindow);
      expect(p.offerCode, id).toBe(cilj.offer);
      expect(p.slotsTotal, `${id}: svaki Repair SKU i Final Pass je tocno jedan slot`).toBe(1);
      expect(p.active, id).toBe(true);
    }
    const spec = novi.map((s) => mapProductRow(s.row)).filter((p) => p.workType === 'specijalisticki');
    expect(spec.map((p) => p.id).sort(), 'specijalisticki ima vlastiti Repair i Final Pass, ne diplomski ni doktorski')
      .toEqual(['pass_specijalisticki', 'slot_specijalisticki']);
  });

  it('pass_semestralni ostaje 6 seminarskih slotova (sijan u 0002, V1 mu mijenja samo ponudu)', () => {
    const sem = seededProducts().find((s) => s.row.id === 'pass_semestralni');
    expect(sem?.row).toMatchObject({ kind: 'pass', work_type: 'seminarski', slots_total: 6 });
  });
});

describe('0207: specijalisticki u svakom Lektinom work_type CHECK-u', () => {
  const tables = ['entitlements', 'products', 'faculty_requests', 'repair_jobs', 'corpus_contributions'];

  it.each(tables)('%s: ogranicenje se prvo trazi po stvarnom imenu, pa dodaje s pet vrsta', (table) => {
    // Codex PR #217 (M3): ogranicenje se nalazi po stupcu (conkey), ne po podnizu definicije.
    const dropLoop = /t\.relname in \(([^)]*)\)\s*and a\.attnum = any \(c\.conkey\)/.exec(SQL);
    expect(dropLoop?.[1]).toContain(`'${table}'`);
    const add = new RegExp(`alter table public\\.${table} add constraint ${table}_work_type_check\\s*check \\(([^;]*)\\);`).exec(SQL);
    expect(add, `${table}: nema add constraint`).not.toBeNull();
    const values = [...(add?.[1] ?? '').matchAll(/'([a-z]+)'/g)].map((x) => x[1]);
    expect(values).toEqual(WORK_TYPES_V1);
  });

  it('Katedrine tablice (0035) se ne diraju: drugi imenski prostor vrste rada', () => {
    expect(SQL).not.toMatch(/academic_projects|katedra_projects/);
  });

  it('nijedan drugi CHECK u migracijama ne ogranicava Lektin work_type bez specijalistickog', () => {
    // Populacija: svaka migracija s CHECK-om na work_type koja nabraja 'doktorski'. Katedra (0035)
    // koristi engleske ili kratke kodove pa se ne pojavljuje.
    const dir = resolve(process.cwd(), 'supabase', 'migrations');
    const withCheck = ['0001_monetization.sql', '0002_products_catalog.sql', '0011_faculty_requests.sql',
      '0026_repair_jobs.sql', '0054_faculty_requests_waitlist.sql', '0102_corpus_contributions.sql'];
    const tablesSeen = new Set<string>();
    for (const f of withCheck) {
      const sql = readFileSync(resolve(dir, f), 'utf8');
      expect(sql, f).toMatch(/work_type[^\n]*check \([^\n]*'doktorski'/);
      const t = /create table if not exists (\w+)/.exec(sql)?.[1];
      if (t) tablesSeen.add(t);
    }
    expect([...tablesSeen].sort()).toEqual([...tables].sort());
  });
});

describe('0207: disciplina cijene i idempotencija', () => {
  it('cijena postojeceg proizvoda se ne mijenja golim UPDATE-om, nego set_product_price uz usporedbu', () => {
    expect(SQL).not.toMatch(/update\s+(public\.)?products\s+set[^;]*price_eur/i);
    expect(SQL).toMatch(/if p\.price_eur is distinct from v\.price_eur::numeric then\s*perform public\.set_product_price\(/);
    // Tocno jedan poziv, unutar grane s usporedbom.
    expect([...SQL.matchAll(/set_product_price\(/g)]).toHaveLength(1);
  });

  it('do_obrane se gasi (active=false) i ne brise; ne uvode se novi do_obrane SKU-ovi', () => {
    expect(SQL).toMatch(/set active = false\s*where id in \('slot_zavrsni_do_obrane', 'slot_diplomski_do_obrane'\)\s*and active is distinct from false/);
    expect(SQL).not.toMatch(/delete\s+from\s+(public\.)?products/i);
    expect(SQL).not.toMatch(/specijalisticki_do_obrane|doktorski_do_obrane/);
  });

  it('konstrukcije su idempotentne (drugi prolaz ne dopisuje ni ne pada)', () => {
    expect(SQL).toMatch(/create table if not exists public\.offer_codes/);
    expect(SQL).toMatch(/on conflict \(code\) do nothing/);
    expect(SQL).toMatch(/on conflict \(id\) do nothing/);
    expect(SQL).toMatch(/add column if not exists offer_code text references public\.offer_codes/);
    expect(SQL).toMatch(/create unique index if not exists entitlements_upgrade_order_uidx/);
    expect(SQL).toMatch(/drop policy if exists offer_codes_select_all/);
    // changelog za nove proizvode samo kad ga jos nema
    expect(SQL).toMatch(/insert into public\.pricing_changelog[\s\S]*?where not exists \(/);
    // svaki add constraint ima drop petlju prije sebe
    const firstAdd = SQL.indexOf('add constraint entitlements_work_type_check');
    const drop = SQL.indexOf("execute format('alter table public.%I drop constraint %I'");
    expect(drop).toBeGreaterThan(0);
    expect(drop).toBeLessThan(firstAdd);
    const outboxAdd = SQL.indexOf('add constraint bonus_outbox_status_check');
    const outboxDrop = SQL.indexOf("execute format('alter table public.bonus_outbox drop constraint %I'");
    expect(outboxDrop).toBeGreaterThan(0);
    expect(outboxDrop).toBeLessThan(outboxAdd);
  });

  it('bonus_outbox dobiva zavrsno stanje cancelled (F21)', () => {
    expect(SQL).toMatch(/check \(status in \('pending', 'done', 'failed', 'cancelled'\)\)/);
  });

  it('snapshot prava postojecih entitlementa ne izmislja placeni iznos', () => {
    // Jedna naredba ([^;]), da se ne uhvati raspon preko backfilla prozora iznad.
    const backfill = /update public\.entitlements e\s*set([^;]*?)where e\.product_id = p\.id\s*and e\.offer_code is null;/.exec(SQL);
    expect(backfill).not.toBeNull();
    expect(backfill?.[1]).not.toMatch(/paid_amount_cents/);
  });
});

describe('0207: apply_entitlement_upgrade provodi pravila odjeljka 14 atomski', () => {
  const fn = (() => {
    const start = SQL.indexOf('create or replace function public.apply_entitlement_upgrade(');
    const end = SQL.indexOf('$$;', start);
    if (start < 0 || end < 0) throw new Error('0207: apply_entitlement_upgrade nije pronadjena');
    return SQL.slice(start, end);
  })();

  it('zakljucava redak i pretvara ISTI entitlement (ne umece novi)', () => {
    expect(fn).toMatch(/from public\.entitlements where id = p_entitlement_id for update/);
    expect(fn).not.toMatch(/insert into public\.entitlements/);
    expect(fn).toMatch(/update public\.entitlements\s*set upgraded_from_product_id = product_id/);
  });

  it('jednom: vec nadogradjeno pravo se ne pretvara ponovno; ista uplata je duplicate', () => {
    expect(fn).toMatch(/if v_ent\.upgrade_order_id = p_upgrade_order_id then\s*return 'duplicate';/);
    expect(fn).toMatch(/if v_ent\.upgrade_order_id is not null/);
  });

  it('rok, vlasnik, Repair ponuda, jedan slot i ista vrsta rada', () => {
    expect(fn).toMatch(/v_ent\.user_id is distinct from p_user_id/);
    // Krug 4: rok potrosnje vrijedi samo za nevezano pravo; vezanom je granica anonimizacija otiska.
    expect(fn).toMatch(/if v_ent\.slots_used = 0 and v_ent\.purchase_expires_at <= now\(\) then\s*return 'unavailable';/);
    expect(fn).toMatch(/v_ent\.status <> 'active'/);
    expect(fn).toMatch(/v_ent\.offer_code is distinct from 'repair_v1'/);
    expect(fn).toMatch(/v_ent\.slots_total <> 1/);
    expect(fn).toMatch(/v_target\.offer_code is distinct from 'final_pass_v1'/);
    expect(fn).toMatch(/v_target\.work_type is distinct from v_ent\.work_type/);
  });

  it('snapshot prava se cita iz kataloga u istoj transakciji, a vezani slot samo produljuje', () => {
    expect(fn).toMatch(/select o\.capabilities into v_caps from public\.offer_codes o where o\.code = v_target\.offer_code/);
    expect(fn).toMatch(/capabilities = v_caps/);
    expect(fn).toMatch(/set slot_expires_at = greatest\(slot_expires_at, p_slot_expires_at\)\s*where entitlement_id = p_entitlement_id/);
    expect(fn).not.toMatch(/slots_total\s*=/);
  });

  it('funkciju ne smije zvati klijent', () => {
    expect(SQL).toMatch(/revoke all on function public\.apply_entitlement_upgrade\([^)]*\)\s*from public, anon, authenticated/);
    // Krug 4: vracanje nadogradnje na Repair (povrat uplate nadogradnje) zove samo webhook-mor.
    expect(SQL).toMatch(/revoke all on function public\.revert_entitlement_upgrade\(text\)\s*from public, anon, authenticated/);
    expect(SQL).toMatch(/create or replace function public\.revert_entitlement_upgrade\([\s\S]*?security definer\s*set search_path = ''/);
  });
});

describe('0207: snapshot prozora i jedan strani kljuc prema products (krug 2)', () => {
  const MIGRATIONS = readdirSync(resolve(process.cwd(), 'supabase', 'migrations'))
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((name) => ({ name, sql: readFileSync(resolve(process.cwd(), 'supabase', 'migrations', name), 'utf8') }));

  it('generator: parser vidi postojeci kljuc iz 0002 (entitlements.product_id references products)', () => {
    const { where } = entitlementProductFkCount(MIGRATIONS);
    expect(where.some((w) => w.startsWith('0002_products_catalog.sql'))).toBe(true);
  });

  it('kroz sve migracije postoji TOCNO jedan FK entitlements -> products (inace PGRST201 na products(...))', () => {
    const { count, where } = entitlementProductFkCount(MIGRATIONS);
    expect(count, where.join(', ')).toBe(1);
    expect(SQL).toMatch(/add column if not exists upgraded_from_product_id text,/);
    expect(SQL).toMatch(/drop constraint if exists entitlements_upgraded_from_product_id_fkey/);
  });

  it('entitlements.slot_window_days je snapshot: stupac, backfill PRIJE promjene prozora, trigger i nadogradnja', () => {
    expect(SQL).toMatch(/add column if not exists slot_window_days integer check \(slot_window_days is null or slot_window_days > 0\)/);
    const backfill = SQL.indexOf('set slot_window_days = p.slot_window_days');
    const promjenaProzora = SQL.indexOf('set slot_window_days = v.slot_window_days');
    expect(backfill).toBeGreaterThan(0);
    expect(promjenaProzora).toBeGreaterThan(0);
    expect(backfill, 'postojece pravo mora zadrzati prozor pod kojim je kupljeno').toBeLessThan(promjenaProzora);
    expect(SQL).toMatch(/and e\.slot_window_days is null/);
    expect(SQL).toMatch(/drop trigger if exists entitlements_snapshot_offer on public\.entitlements;\s*create trigger entitlements_snapshot_offer\s*before insert on public\.entitlements/);
    // Trigger popunjava samo prazno: eksplicitan snapshot iz webhooka ostaje.
    expect(SQL).toMatch(/if new\.slot_window_days is null then\s*new\.slot_window_days := v_product\.slot_window_days;/);
    expect(SQL).toMatch(/if new\.offer_code is null then\s*new\.offer_code := v_product\.offer_code;/);
    expect(SQL).toMatch(/slot_window_days = v_target\.slot_window_days,/);
  });
});

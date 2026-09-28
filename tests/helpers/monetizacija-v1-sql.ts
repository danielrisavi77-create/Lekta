/**
 * Monetizacija V1 (M2): migracija 0207 IZVRSENA u stvarnom Postgresu (PGlite, WASM build Postgresa),
 * ne regexima nad tekstom (nalaz pregleda kruga 3).
 *
 * Baza se slaze iz STVARNIH migracija na kojima 0207 stoji (tablice koje dira i proizvodi koje
 * mijenja). Jedine zamjene su okolina koju Supabase daje, a PGlite nema: shema `auth`, uloge,
 * `storage.buckets/objects` i `cron.schedule`. Tekst migracija se ne mijenja, osim jedne izricito
 * provjerene zamjene: fail-closed provjera pg_crona u 0011 (PGlite ekstenziju nema, a cron raspored
 * nije predmet ovog mjerenja).
 *
 * Svaka tvrdnja vraca opis problema umjesto da baca, pa isti kod sluzi i testu
 * (tests/monetizacija-v1-sql.test.ts) i mutacijama (tests/gate-mutations.test.ts).
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { readAccessRows, type AccessDb, type AccessQuery } from '../../src/report/entitlement-access';
import type { BillableWorkType } from '../../src/report/billable-work-type';
import { decideReportAccess } from '../../src/report/slot-logic';

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');

/** Migracije ispod 0207 koje stvaraju tablice, funkcije i proizvode koje 0207 dira. */
export const BASE_MIGRATIONS = [
  '0001_monetization.sql',
  '0002_products_catalog.sql',
  // 0007 i 0016: guarantee_claims i purge_document_slots, da se granica nadogradnje (krug 4) mjeri
  // STVARNIM purgeom, a ne rukom napisanim otiskom.
  '0007_guarantee_claims.sql',
  '0010_do_obrane_sku.sql',
  '0011_faculty_requests.sql',
  '0016_retention_slots_faculty.sql',
  '0017_thesis_pass.sql',
  '0020_set_product_price.sql',
  '0026_repair_jobs.sql',
  '0054_faculty_requests_waitlist.sql',
  '0071_katedra_pass_products.sql',
  '0092_webhook_events_inbox.sql',
  '0100_bonus_outbox.sql',
  '0102_corpus_contributions.sql',
  '0204_stripe_provider_defaults.sql',
] as const;

export const V1_MIGRATION = '0207_monetizacija_v1.sql';

const PG_CRON_GUARD = "if not exists (select 1 from pg_extension where extname = 'pg_cron') then";

export function readMigration(name: string): string {
  const files = readdirSync(MIGRATIONS_DIR);
  if (!files.includes(name)) throw new Error(`migracija ${name} ne postoji`);
  return readFileSync(join(MIGRATIONS_DIR, name), 'utf8');
}

const SUPABASE_ENV = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid());
  create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
  create function auth.role() returns text language sql stable as $$ select null::text $$;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid, created_at timestamptz default now());
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language sql immutable as $$ select string_to_array(name, '/') $$;
  create schema cron;
  create function cron.schedule(a text, b text, c text) returns bigint language sql as $$ select 1::bigint $$;
  create function cron.unschedule(a text) returns boolean language sql as $$ select true $$;
`;

/** Baza sa svim BASE_MIGRATIONS; 0207 se primjenjuje zasebno (applyV1), da se moze mjeriti prije i poslije. */
export async function baseDatabase(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(SUPABASE_ENV);
  for (const name of BASE_MIGRATIONS) {
    let sql = readMigration(name);
    if (name === '0011_faculty_requests.sql' || name === '0016_retention_slots_faculty.sql') {
      if (!sql.includes(PG_CRON_GUARD)) throw new Error(`${name}: provjera pg_crona se promijenila, zamjena vise ne vrijedi`);
      sql = sql.replace(PG_CRON_GUARD, 'if false then');
    }
    try {
      await db.exec(sql);
    } catch (e) {
      throw new Error(`${name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return db;
}

export const USER_A = '11111111-1111-4111-8111-111111111111';
export const USER_B = '22222222-2222-4222-8222-222222222222';

type Row = Record<string, unknown>;

async function rows(db: PGlite, sql: string, params: unknown[] = []): Promise<Row[]> {
  return (await db.query<Row>(sql, params)).rows;
}

async function one(db: PGlite, sql: string, params: unknown[] = []): Promise<Row | undefined> {
  return (await rows(db, sql, params))[0];
}

/** Stanje koje drugi prolaz 0207 ne smije promijeniti. */
async function stateFingerprint(db: PGlite): Promise<string> {
  const dijelovi = await Promise.all([
    rows(db, 'select * from public.products order by id'),
    rows(db, 'select product_id, change_type, old_value, new_value, note from public.pricing_changelog order by product_id, change_type, old_value, new_value, note'),
    rows(db, 'select code, capabilities, note from public.offer_codes order by code'),
    rows(db, 'select id, product_id, offer_code, capabilities, slot_window_days, paid_amount_cents from public.entitlements order by id'),
    rows(db, `select t.relname, c.conname, pg_get_constraintdef(c.oid) as def
                from pg_constraint c join pg_class t on t.oid = c.conrelid
                join pg_namespace n on n.oid = t.relnamespace
               where n.nspname = 'public' and c.contype = 'c' order by t.relname, c.conname`),
  ]);
  return JSON.stringify(dijelovi);
}

/**
 * Ciljno stanje kataloga po MONETIZACIJA_V1.md (odjeljci 3, 5, 6, 7, 10 i 25), kako ga baza STVARNO
 * ima nakon 0207. [id, cijena, prozor slota, rok kupnje, offer_code, aktivan, broj slotova]
 */
export const V1_CATALOG: ReadonlyArray<readonly [string, string, number, number, string, boolean, number]> = [
  ['slot_seminarski', '3.99', 7, 90, 'repair_v1', true, 1],
  ['slot_zavrsni', '5.99', 7, 90, 'repair_v1', true, 1],
  ['slot_diplomski', '9.99', 14, 90, 'repair_v1', true, 1],
  ['slot_specijalisticki', '16.99', 21, 90, 'repair_v1', true, 1],
  ['slot_doktorski', '24.99', 30, 120, 'repair_v1', true, 1],
  ['pass_zavrsni', '12.99', 180, 180, 'final_pass_v1', true, 1],
  ['pass_diplomski', '19.99', 180, 180, 'final_pass_v1', true, 1],
  ['pass_specijalisticki', '29.99', 240, 240, 'final_pass_v1', true, 1],
  ['pass_doktorski', '39.99', 365, 365, 'final_pass_v1', true, 1],
  ['pass_semestralni', '14.99', 7, 180, 'semester_pass_v1', true, 6],
  ['slot_zavrsni_do_obrane', '9.99', 120, 180, 'repair_v1', false, 1],
  ['slot_diplomski_do_obrane', '16.99', 120, 180, 'repair_v1', false, 1],
];

const LEKTA_WORK_TYPE_TABLES = ['entitlements', 'products', 'faculty_requests', 'repair_jobs', 'corpus_contributions'] as const;

export interface V1Run {
  db: PGlite;
  /** Pravo upisano PRIJE 0207 (slot_doktorski s tadasnjim prozorom 14). */
  staroPravoId: string;
}

/** Baza, jedno pravo kupljeno prije 0207, pa 0207 (po zelji s izmijenjenim tekstom za mutaciju). */
export async function runV1(v1Sql: string = readMigration(V1_MIGRATION)): Promise<V1Run> {
  const db = await baseDatabase();
  await db.query('insert into auth.users (id) values ($1), ($2)', [USER_A, USER_B]);
  const staro = await one(db, `insert into public.entitlements (user_id, work_type, slots_total, order_id, provider, purchase_expires_at, product_id)
                               values ($1, 'doktorski', 1, 'pi_staro', 'stripe', now() + interval '60 days', 'slot_doktorski') returning id`, [USER_A]);
  await db.exec(v1Sql);
  return { db, staroPravoId: String(staro?.id) };
}

/** IDEMPOTENCIJA: drugi prolaz iste migracije ne mijenja nijedan redak ni ogranicenje. */
export async function idempotencyProblems(run: V1Run, v1Sql: string = readMigration(V1_MIGRATION)): Promise<string[]> {
  const prije = await stateFingerprint(run.db);
  const changelogPrije = await one(run.db, 'select count(*)::int as n from public.pricing_changelog');
  try {
    await run.db.exec(v1Sql);
  } catch (e) {
    return [`drugi prolaz 0207 pada: ${e instanceof Error ? e.message : String(e)}`];
  }
  const poslije = await stateFingerprint(run.db);
  const changelogPoslije = await one(run.db, 'select count(*)::int as n from public.pricing_changelog');
  const problems: string[] = [];
  if (changelogPrije?.n !== changelogPoslije?.n) {
    problems.push(`drugi prolaz 0207 dopisuje pricing_changelog (${String(changelogPrije?.n)} -> ${String(changelogPoslije?.n)})`);
  }
  if (prije !== poslije) problems.push('drugi prolaz 0207 mijenja katalog, prava ili ogranicenja (nije no-op)');
  return problems;
}

/** Katalog, cjenovni trag, CHECK-ovi vrste rada i status bonus_outboxa nakon 0207. */
export async function catalogProblems(db: PGlite): Promise<string[]> {
  const problems: string[] = [];
  for (const [id, cijena, prozor, rok, offer, aktivan, slotova] of V1_CATALOG) {
    const p = await one(db, 'select price_eur::text as cijena, slot_window_days, purchase_window_days, offer_code, active, slots_total from public.products where id = $1', [id]);
    if (!p) {
      problems.push(`${id}: proizvod ne postoji`);
      continue;
    }
    const ima = [p.cijena, p.slot_window_days, p.purchase_window_days, p.offer_code, p.active, p.slots_total];
    const treba = [cijena, prozor, rok, offer, aktivan, slotova];
    if (JSON.stringify(ima) !== JSON.stringify(treba)) problems.push(`${id}: ${JSON.stringify(ima)} umjesto ${JSON.stringify(treba)}`);
  }
  // Promjena cijene ide kroz set_product_price: products i pricing_changelog u istoj transakciji.
  for (const [id, stara, nova] of [['pass_zavrsni', '9.99', '12.99'], ['pass_diplomski', '14.99', '19.99']] as const) {
    const trag = await rows(db, "select old_value, new_value from public.pricing_changelog where product_id = $1 and change_type = 'price'", [id]);
    if (!trag.some((t) => Number(t.old_value) === Number(stara) && Number(t.new_value) === Number(nova))) {
      problems.push(`${id}: promjena cijene ${stara} -> ${nova} nije u pricing_changelog (cijena mimo set_product_price)`);
    }
  }
  for (const tabela of LEKTA_WORK_TYPE_TABLES) {
    const defs = await rows(db, `select pg_get_constraintdef(c.oid) as def from pg_constraint c
                                   join pg_class t on t.oid = c.conrelid join pg_namespace n on n.oid = t.relnamespace
                                  where n.nspname = 'public' and t.relname = $1 and c.contype = 'c'
                                    and pg_get_constraintdef(c.oid) like '%work_type%'`, [tabela]);
    if (defs.length !== 1 || !String(defs[0].def).includes('specijalisticki')) {
      problems.push(`${tabela}: work_type CHECK nije tocno jedan s specijalisticki (${defs.length})`);
    }
  }
  try {
    await db.query(`insert into public.entitlements (user_id, work_type, slots_total, order_id, provider, purchase_expires_at)
                    values ($1, 'nepoznato', 1, 'pi_krivo', 'stripe', now() + interval '1 day')`, [USER_A]);
    problems.push('entitlements prima nepoznatu vrstu rada');
  } catch {
    // ocekivano: check_violation
  }
  const obveza = await one(db, `insert into public.bonus_outbox (user_id, order_id, kind, status) values ($1, 'pi_x', 'referrer_reward', 'cancelled') returning status`, [USER_A]).catch(() => undefined);
  if (obveza?.status !== 'cancelled') problems.push('bonus_outbox ne prima status cancelled (F21)');
  return problems;
}

const REPAIR_CAPS = ['full_report', 'repair', 'repair_diff', 'recheck'];

/**
 * SNAPSHOT PRAVA (odjeljak 13): postojece pravo dobiva prozor iz trenutka kupnje (ne novi katalog),
 * novo pravo bez snapshota dobiva ga iz kataloga u trenutku upisa (trigger), eksplicitan snapshot
 * ostaje netaknut, a kasnija promjena kataloga ne mijenja upisano pravo.
 */
export async function snapshotProblems(run: V1Run): Promise<string[]> {
  const { db } = run;
  const problems: string[] = [];
  const staro = await one(db, 'select slot_window_days, offer_code, capabilities, paid_amount_cents from public.entitlements where id = $1', [run.staroPravoId]);
  if (staro?.slot_window_days !== 14) {
    problems.push(`pravo kupljeno prije 0207 dobiva prozor ${String(staro?.slot_window_days)} umjesto kupljenih 14 (backfill poslije promjene kataloga)`);
  }
  if (staro?.offer_code !== 'repair_v1' || JSON.stringify(staro?.capabilities) !== JSON.stringify(REPAIR_CAPS)) {
    problems.push('pravo kupljeno prije 0207 nema snapshot ponude');
  }
  if (staro?.paid_amount_cents !== null) problems.push('0207 izmislja placeni iznos starog prava');

  const novo = await one(db, `insert into public.entitlements (user_id, work_type, slots_total, order_id, provider, purchase_expires_at, product_id)
                              values ($1, 'diplomski', 1, 'pi_novo', 'internal', now() + interval '180 days', 'pass_diplomski')
                              returning id, offer_code, capabilities, slot_window_days`, [USER_A]);
  if (novo?.offer_code !== 'final_pass_v1' || novo?.slot_window_days !== 180 || !Array.isArray(novo?.capabilities) || !novo.capabilities.includes('final_submission_gate')) {
    problems.push('trigger ne snapshotira ponudu i prozor pravu upisanom mimo webhooka');
  }
  const izricito = await one(db, `insert into public.entitlements (user_id, work_type, slots_total, order_id, provider, purchase_expires_at, product_id, offer_code, capabilities, slot_window_days)
                                  values ($1, 'diplomski', 1, 'pi_izricito', 'stripe', now() + interval '90 days', 'slot_diplomski', 'repair_v1', array['full_report'], 11)
                                  returning capabilities, slot_window_days`, [USER_A]);
  if (JSON.stringify(izricito?.capabilities) !== '["full_report"]' || izricito?.slot_window_days !== 11) {
    problems.push('trigger prepisuje eksplicitan snapshot iz webhooka');
  }
  await db.exec("update public.products set slot_window_days = 30 where id = 'pass_diplomski'");
  await db.exec("update public.offer_codes set capabilities = array['full_report'] where code = 'final_pass_v1'");
  const poslije = await one(db, 'select slot_window_days, capabilities from public.entitlements where id = $1', [novo?.id]);
  if (poslije?.slot_window_days !== 180 || !Array.isArray(poslije?.capabilities) || !poslije.capabilities.includes('final_submission_gate')) {
    problems.push('promjena kataloga nakon kupnje mijenja vec upisano pravo');
  }
  return problems;
}

interface UpgradeCase {
  opis: string;
  productId: string;
  workType: string;
  slotsUsed: number;
  /** Pomak isteka vezanog slota u danima; null = pravo nema redak u document_slots. */
  slotDays: number | null;
  /** Prije nadogradnje pokreni STVARNI purge_document_slots(30) iz 0016 (cron anonimizacije). */
  purge?: boolean;
  /** Pomak roka potrosnje (purchase_expires_at) u danima; zadano +60 (unutar roka). */
  purchaseDays?: number;
  user?: string;
  targetId: string;
  ocekivano: string;
}

async function seedRepair(db: PGlite, c: UpgradeCase, n: number): Promise<string> {
  const e = await one(db, `insert into public.entitlements (user_id, work_type, slots_total, slots_used, order_id, provider, purchase_expires_at, product_id, paid_amount_cents)
                           values ($1, $2, 1, $3, $4, 'stripe', now() + make_interval(days => $6), $5, 999) returning id`,
  [USER_A, c.workType, c.slotsUsed, `pi_repair_${n}`, c.productId, c.purchaseDays ?? 60]);
  const id = String(e?.id);
  if (c.slotDays !== null) {
    await db.query(`insert into public.document_slots (entitlement_id, user_id, work_type, fingerprint, slot_expires_at)
                    values ($1, $2, $3, $4::jsonb, now() + make_interval(days => $5))`,
    [id, USER_A, c.workType, JSON.stringify({ titleNorm: 'rad', authorNorm: 'autor', headings: ['uvod'], sectionCount: 1 }), c.slotDays]);
  }
  if (c.purge) {
    const r = await one(db, 'select public.purge_document_slots(30) as n');
    if (Number(r?.n) < 1) throw new Error(`${c.opis}: purge_document_slots nije anonimizirao nijedan slot (generator ne proizvodi ciljani ulaz)`);
  }
  return id;
}

async function apply(db: PGlite, entitlementId: string, user: string, order: string, target: string): Promise<string> {
  const r = await one(db, `select public.apply_entitlement_upgrade($1::uuid, $2::uuid, $3, $4, 1000, now() + interval '180 days', now() + interval '180 days') as ishod`,
    [entitlementId, user, order, target]);
  return String(r?.ishod);
}

/**
 * NADOGRADNJA U BAZI (odjeljak 14): apply_entitlement_upgrade pretvara ISTO pravo (bez drugog retka),
 * jednom, samo za istu vrstu rada i samo dok je vezani rad jos prepoznatljiv (otisak nije
 * anonimiziran). Krug 4: istek prozora slota NIJE granica; pretvorba tada isti slot ozivi.
 */
export async function upgradeSqlProblems(db: PGlite): Promise<string[]> {
  const problems: string[] = [];
  const brojPrava = async () => Number((await one(db, 'select count(*)::int as n from public.entitlements'))?.n);

  const osnovno: UpgradeCase = { opis: 'vezan, slot ziv', productId: 'slot_diplomski', workType: 'diplomski', slotsUsed: 1, slotDays: 5, targetId: 'pass_diplomski', ocekivano: 'upgraded' };
  const id = await seedRepair(db, osnovno, 0);
  const prije = await brojPrava();
  const ishod = await apply(db, id, USER_A, 'pi_up_0', 'pass_diplomski');
  if (ishod !== 'upgraded') {
    problems.push(`valjana nadogradnja vraca ${ishod} umjesto upgraded`);
  } else {
    if ((await brojPrava()) !== prije) problems.push('nadogradnja stvara drugo pravo umjesto da pretvori postojece');
    const e = await one(db, 'select product_id, upgraded_from_product_id, offer_code, capabilities, slot_window_days, slots_total, upgrade_order_id, upgrade_paid_cents from public.entitlements where id = $1', [id]);
    if (e?.product_id !== 'pass_diplomski' || e?.upgraded_from_product_id !== 'slot_diplomski' || e?.offer_code !== 'final_pass_v1'
      || e?.slot_window_days !== 180 || e?.slots_total !== 1 || e?.upgrade_order_id !== 'pi_up_0' || e?.upgrade_paid_cents !== 1000
      || !Array.isArray(e?.capabilities) || !e.capabilities.includes('final_submission_gate')) {
      problems.push(`nadogradjeno pravo nema ocekivani oblik: ${JSON.stringify(e)}`);
    }
    const slot = await one(db, "select (slot_expires_at > now() + interval '170 days') as produljen from public.document_slots where entitlement_id = $1", [id]);
    if (slot?.produljen !== true) problems.push('nadogradnja ne produljuje prozor vezanog slota (isti rad)');
    if ((await apply(db, id, USER_A, 'pi_up_0', 'pass_diplomski')) !== 'duplicate') problems.push('ponovljena ista uplata nije duplicate');
    if ((await apply(db, id, USER_A, 'pi_up_drugi', 'pass_diplomski')) !== 'unavailable') problems.push('druga uplata nadogradnje pretvara isto pravo ponovno (nije jednom)');
  }

  const slucajevi: UpgradeCase[] = [
    { opis: 'tudje pravo', productId: 'slot_diplomski', workType: 'diplomski', slotsUsed: 1, slotDays: 5, user: USER_B, targetId: 'pass_diplomski', ocekivano: 'unavailable' },
    { opis: 'druga vrsta rada', productId: 'slot_diplomski', workType: 'diplomski', slotsUsed: 1, slotDays: 5, targetId: 'pass_zavrsni', ocekivano: 'unavailable' },
    // Krug 4 (odjeljak 14, kredit za popravak): istekao, ali neanonimiziran slot se nadogradjuje i ozivi.
    { opis: 'slot_zavrsni istekao prije 5 dana, otisak netaknut', productId: 'slot_zavrsni', workType: 'zavrsni', slotsUsed: 1, slotDays: -5, targetId: 'pass_zavrsni', ocekivano: 'upgraded' },
    { opis: 'istekao prije 40 dana, purge jos nije prosao', productId: 'slot_zavrsni', workType: 'zavrsni', slotsUsed: 1, slotDays: -40, targetId: 'pass_zavrsni', ocekivano: 'upgraded' },
    { opis: 'anonimiziran vezani slot (stvarni purge 0016)', productId: 'slot_zavrsni', workType: 'zavrsni', slotsUsed: 1, slotDays: -40, purge: true, targetId: 'pass_zavrsni', ocekivano: 'slot_anonymized' },
    { opis: 'vezano pravo bez retka slota', productId: 'slot_zavrsni', workType: 'zavrsni', slotsUsed: 1, slotDays: null, targetId: 'pass_zavrsni', ocekivano: 'slot_anonymized' },
    { opis: 'nevezan Repair', productId: 'slot_zavrsni', workType: 'zavrsni', slotsUsed: 0, slotDays: null, targetId: 'pass_zavrsni', ocekivano: 'upgraded' },
    // Krug 4 (nalaz pregleda): rok potrosnje je rok VEZIVANJA. Vezanom Repairu nije granica, nevezanom jest.
    { opis: 'vezan, rok potrosnje istekao prije 5 dana, slot istekao prije 3 dana, otisak netaknut', productId: 'slot_zavrsni', workType: 'zavrsni', slotsUsed: 1, slotDays: -3, purchaseDays: -5, targetId: 'pass_zavrsni', ocekivano: 'upgraded' },
    { opis: 'vezan, rok potrosnje istekao, slot jos ziv', productId: 'slot_diplomski', workType: 'diplomski', slotsUsed: 1, slotDays: 7, purchaseDays: -2, targetId: 'pass_diplomski', ocekivano: 'upgraded' },
    { opis: 'vezan izvan roka potrosnje, anonimiziran (stvarni purge 0016)', productId: 'slot_zavrsni', workType: 'zavrsni', slotsUsed: 1, slotDays: -40, purchaseDays: -45, purge: true, targetId: 'pass_zavrsni', ocekivano: 'slot_anonymized' },
    { opis: 'nevezan izvan roka potrosnje', productId: 'slot_zavrsni', workType: 'zavrsni', slotsUsed: 0, slotDays: null, purchaseDays: -1, targetId: 'pass_zavrsni', ocekivano: 'unavailable' },
    { opis: 'specijalisticki', productId: 'slot_specijalisticki', workType: 'specijalisticki', slotsUsed: 1, slotDays: 10, targetId: 'pass_specijalisticki', ocekivano: 'upgraded' },
  ];
  let n = 1;
  for (const c of slucajevi) {
    const eid = await seedRepair(db, c, n);
    const prijeRetka = JSON.stringify(await one(db, 'select * from public.entitlements where id = $1', [eid]));
    const got = await apply(db, eid, c.user ?? USER_A, `pi_up_${n}`, c.targetId);
    n += 1;
    if (got !== c.ocekivano) {
      problems.push(`${c.opis}: apply_entitlement_upgrade vraca ${got} umjesto ${c.ocekivano}`);
      continue;
    }
    if (c.ocekivano !== 'upgraded') {
      const poslije = JSON.stringify(await one(db, 'select * from public.entitlements where id = $1', [eid]));
      if (poslije !== prijeRetka) problems.push(`${c.opis}: odbijena nadogradnja ipak mijenja pravo`);
    } else if (c.slotDays !== null) {
      // Isti slot ozivljen na prozor Final Passa (ne novi redak).
      const s = await one(db, "select count(*)::int as n, bool_and(slot_expires_at > now() + interval '170 days') as ziv from public.document_slots where entitlement_id = $1", [eid]);
      if (s?.n !== 1 || s?.ziv !== true) problems.push(`${c.opis}: nadogradnja ne ozivi isti vezani slot na prozor Final Passa (${JSON.stringify(s)})`);
    }
    if (c.ocekivano === 'upgraded') {
      // Pretvorba produlji i rok potrosnje (greatest), pa nadogradjeno pravo nije odmah isteklo.
      const r = await one(db, "select (purchase_expires_at > now() + interval '170 days') as produljen from public.entitlements where id = $1", [eid]);
      if (r?.produljen !== true) problems.push(`${c.opis}: nadogradnja ne produljuje rok potrosnje na prozor Final Passa`);
    }
  }
  return problems;
}

/**
 * CITANJE PRISTUPA NAD STVARNIM RETCIMA PGlite baze: isti readAccessRows kao generate-report i
 * repair-docx, a filtri upita (eq, gt) se primjenjuju na retke koje baza stvarno ima. Tako odluka
 * o pristupu mjeri stanje koje je SQL (nadogradnja, povrat) stvarno ostavio, ne rukom slozen redak.
 */
function pgliteAccessDb(db: PGlite): AccessDb {
  return {
    from(table: 'document_slots' | 'entitlements') {
      return {
        select(_columns: string) {
          const filtri: Array<(r: Row) => boolean> = [];
          const q: AccessQuery = {
            eq(c: string, v: string) {
              filtri.push((r) => String(r[c]) === v);
              return q;
            },
            gt(c: string, v: string) {
              filtri.push((r) => Date.parse(String(r[c])) > Date.parse(v));
              return q;
            },
            // oxlint-disable-next-line unicorn/no-thenable
            then<A = { data: unknown; error: unknown }, B = never>(
              ok?: ((v: { data: unknown; error: unknown }) => A | PromiseLike<A>) | null,
              fail?: ((e: unknown) => B | PromiseLike<B>) | null,
            ): PromiseLike<A | B> {
              const sql = table === 'document_slots'
                ? 'select id::text as id, entitlement_id::text as entitlement_id, user_id::text as user_id, work_type, fingerprint, slot_expires_at from public.document_slots'
                : `select e.id::text as id, e.user_id::text as user_id, e.work_type, e.status, e.slots_used, e.slots_total, e.purchase_expires_at,
                          e.slot_window_days, json_build_object('slot_window_days', p.slot_window_days) as products
                     from public.entitlements e left join public.products p on p.id = e.product_id`;
              return rows(db, sql)
                .then((svi) => svi.map((r) => {
                  const iso: Row = { ...r };
                  for (const k of ['slot_expires_at', 'purchase_expires_at']) {
                    if (iso[k] instanceof Date) iso[k] = (iso[k] as Date).toISOString();
                  }
                  return iso;
                }))
                .then((svi) => ({ data: svi.filter((r) => filtri.every((f) => f(r))), error: null }))
                .then(ok, fail);
            },
          };
          return q;
        },
      };
    },
  };
}

const DAN_MS = 86_400_000;

async function accessDecision(db: PGlite, workType: BillableWorkType, danOdSada: number): Promise<string> {
  const now = new Date(Date.now() + danOdSada * DAN_MS).toISOString();
  const r = await readAccessRows(pgliteAccessDb(db), USER_A, workType, now);
  if (!r.ok) return `greska: ${r.error}`;
  return decideReportAccess({
    now,
    workType,
    fingerprint: { titleNorm: 'rad', authorNorm: 'autor', headings: ['uvod'], sectionCount: 1 },
    activeSlots: r.activeSlots,
    entitlements: r.entitlements,
    recentGenerationCount: 0,
  }).decision;
}

async function revert(db: PGlite, order: string): Promise<string> {
  const r = await one(db, 'select public.revert_entitlement_upgrade($1) as ishod', [order]);
  return String(r?.ishod);
}

/** Stanje prava i slota koje povrat nadogradnje smije ili ne smije mijenjati. */
async function pravoISlot(db: PGlite, id: string): Promise<string> {
  const e = await one(db, `select status, product_id, offer_code, capabilities, slot_window_days, purchase_expires_at, slots_used, slots_total
                             from public.entitlements where id = $1`, [id]);
  const s = await rows(db, 'select slot_expires_at from public.document_slots where entitlement_id = $1 order by id', [id]);
  return JSON.stringify({ e, s });
}

/**
 * POVRAT UPLATE NADOGRADNJE VRACA REPAIR (krug 4, odjeljak 14). Puni povrat SAMO uplate nadogradnje
 * ne smije oduzeti placeni Repair, a Final Pass (i produljen slot) za vracen novac ne smije ostati.
 * revert_entitlement_upgrade vraca pravo TOCNO na stanje prije pretvorbe, jednom (drugi prolaz je
 * no-op), nikad ne ozivljava ugaseno pravo, a bez zapamcenog stanja ne pogadja. Odluka o pristupu
 * se mjeri nad stvarnim retcima: dan 60 nakon povrata nije besplatan, a Repair unutar svog prozora
 * i dalje daje re-check.
 */
export async function upgradeRevertSqlProblems(db: PGlite): Promise<string[]> {
  const problems: string[] = [];
  const tudja = await one(db, "select count(*)::int as n from public.entitlements where user_id = $1 and work_type in ('zavrsni', 'diplomski')", [USER_A]);
  if (Number(tudja?.n) !== 0) return ['povrat: mjerenje treba svjezu bazu (druga prava istog korisnika mijenjaju odluku o pristupu)'];

  // 1. slot_zavrsni vezan danas (prozor 7), nadogradjen, pa puni povrat nadogradnje.
  const osnovno: UpgradeCase = { opis: 'povrat: vezan slot_zavrsni', productId: 'slot_zavrsni', workType: 'zavrsni', slotsUsed: 1, slotDays: 7, targetId: 'pass_zavrsni', ocekivano: 'upgraded' };
  const id = await seedRepair(db, osnovno, 900);
  const prije = await pravoISlot(db, id);
  if ((await apply(db, id, USER_A, 'pi_up_rev_0', 'pass_zavrsni')) !== 'upgraded') {
    problems.push('povrat: generator ne proizvodi nadogradjeno pravo');
    return problems;
  }
  // Generator mora proizvesti ciljanu klasu: nadogradnja je dan 60 ucinila besplatnim.
  const dan60Nadogradjeno = await accessDecision(db, 'zavrsni', 60);
  if (dan60Nadogradjeno !== 'recheck') {
    problems.push(`povrat: generator ne proizvodi produljen slot (nadogradjeno pravo na dan 60 daje ${dan60Nadogradjeno}, ne recheck)`);
  }
  const ishod = await revert(db, 'pi_up_rev_0');
  if (ishod !== 'reverted') problems.push(`povrat: revert_entitlement_upgrade vraca ${ishod} umjesto reverted`);
  const poslije = await pravoISlot(db, id);
  if (poslije !== prije) problems.push(`povrat: pravo i slot nisu vraceni na stanje prije nadogradnje (prije ${prije}, poslije ${poslije})`);
  const trag = await one(db, 'select upgrade_order_id, upgrade_reverted_at is not null as vraceno from public.entitlements where id = $1', [id]);
  if (trag?.upgrade_order_id !== 'pi_up_rev_0' || trag?.vraceno !== true) problems.push(`povrat: nema traga vracene nadogradnje (${JSON.stringify(trag)})`);
  const dan60 = await accessDecision(db, 'zavrsni', 60);
  if (dan60 !== 'payment_required') problems.push(`povrat: ponovna provjera na dan 60 nakon povrata nadogradnje daje ${dan60} umjesto 402`);
  const dan1 = await accessDecision(db, 'zavrsni', 1);
  if (dan1 !== 'recheck') problems.push(`povrat: placeni Repair unutar svog prozora (dan 1) daje ${dan1} umjesto besplatnog re-checka (Repair kupac kaznjen)`);
  // Idempotencija: drugi prolaz je no-op.
  const drugi = await revert(db, 'pi_up_rev_0');
  if (drugi !== 'duplicate') problems.push(`povrat: drugi prolaz vraca ${drugi} umjesto duplicate`);
  if ((await pravoISlot(db, id)) !== prije) problems.push('povrat: drugi prolaz mijenja pravo ili slot (nije no-op)');
  // Vraceno pravo se samo sebe ne nadogradjuje ponovno (nova nadogradnja ide kroz rucni pregled).
  if ((await apply(db, id, USER_A, 'pi_up_rev_novi', 'pass_zavrsni')) !== 'unavailable') problems.push('povrat: vraceno pravo se tiho nadogradjuje drugom uplatom');

  // 2. Istekao, neanonimiziran slot (kredit za popravak) oziven nadogradnjom: povrat ga vraca na stari istek.
  const ozivljen: UpgradeCase = { opis: 'povrat: ozivljen slot', productId: 'slot_zavrsni', workType: 'zavrsni', slotsUsed: 1, slotDays: -5, targetId: 'pass_zavrsni', ocekivano: 'upgraded' };
  const id2 = await seedRepair(db, ozivljen, 901);
  const prije2 = await pravoISlot(db, id2);
  await apply(db, id2, USER_A, 'pi_up_rev_1', 'pass_zavrsni');
  if ((await revert(db, 'pi_up_rev_1')) !== 'reverted' || (await pravoISlot(db, id2)) !== prije2) {
    problems.push('povrat: ozivljen slot nije vracen na istek prije nadogradnje');
  }

  // 3. Nevezan Repair nadogradjen, slot vezan TEK pod Final Passom: povrat daje Repair prozor od vezivanja.
  const nevezan: UpgradeCase = { opis: 'povrat: vezan nakon nadogradnje', productId: 'slot_diplomski', workType: 'diplomski', slotsUsed: 0, slotDays: null, targetId: 'pass_diplomski', ocekivano: 'upgraded' };
  const id3 = await seedRepair(db, nevezan, 902);
  await apply(db, id3, USER_A, 'pi_up_rev_2', 'pass_diplomski');
  await db.query(`insert into public.document_slots (entitlement_id, user_id, work_type, fingerprint, bound_at, slot_expires_at)
                  values ($1, $2, 'diplomski', $3::jsonb, now() - interval '2 days', now() + interval '178 days')`,
  [id3, USER_A, JSON.stringify({ titleNorm: 'rad', authorNorm: 'autor', headings: ['uvod'], sectionCount: 1 })]);
  await db.query('update public.entitlements set slots_used = 1 where id = $1', [id3]);
  await revert(db, 'pi_up_rev_2');
  const s3 = await one(db, `select (slot_expires_at = bound_at + interval '14 days') as repair_prozor from public.document_slots where entitlement_id = $1`, [id3]);
  if (s3?.repair_prozor !== true) problems.push('povrat: slot vezan pod Final Passom ne dobiva Repair prozor od vezivanja (bound_at + 14)');

  // 4. Pravo vec ugaseno (prvo je vracena izvorna Repair uplata): povrat nadogradnje ga ne ozivljava.
  const ugaseno: UpgradeCase = { opis: 'povrat: ugaseno pravo', productId: 'slot_zavrsni', workType: 'zavrsni', slotsUsed: 1, slotDays: 7, targetId: 'pass_zavrsni', ocekivano: 'upgraded' };
  const id4 = await seedRepair(db, ugaseno, 903);
  await apply(db, id4, USER_A, 'pi_up_rev_3', 'pass_zavrsni');
  await db.query("update public.entitlements set status = 'refunded' where id = $1", [id4]);
  const prije4 = await pravoISlot(db, id4);
  const ishod4 = await revert(db, 'pi_up_rev_3');
  if (ishod4 !== 'inactive' || (await pravoISlot(db, id4)) !== prije4) {
    problems.push(`povrat: povrat nadogradnje vec ugasenog prava vraca ${ishod4} ili ga mijenja (ozivljava ugaseno pravo)`);
  }

  // 5. Bez zapamcenog stanja: ne pogadja Repair iz danasnjeg kataloga.
  const bez: UpgradeCase = { opis: 'povrat: bez snapshota', productId: 'slot_zavrsni', workType: 'zavrsni', slotsUsed: 1, slotDays: 7, targetId: 'pass_zavrsni', ocekivano: 'upgraded' };
  const id5 = await seedRepair(db, bez, 904);
  await apply(db, id5, USER_A, 'pi_up_rev_4', 'pass_zavrsni');
  await db.query('update public.entitlements set upgraded_from_offer_code = null where id = $1', [id5]);
  const prije5 = await pravoISlot(db, id5);
  const ishod5 = await revert(db, 'pi_up_rev_4');
  if (ishod5 !== 'no_snapshot' || (await pravoISlot(db, id5)) !== prije5) {
    problems.push(`povrat: pravo bez zapamcenog stanja vraca ${ishod5} ili se mijenja (pogadja Repair)`);
  }
  if ((await revert(db, 'pi_nepostojeci')) !== 'not_found') problems.push('povrat: nepoznata uplata nadogradnje ne vraca not_found');
  return problems;
}

/** Oznaka djelomicnog povrata u inboxu, kako je webhook-mor upise PRIJE note_entitlement_partial_refund. */
async function partialMarker(db: PGlite, order: string): Promise<void> {
  await db.query(`insert into public.webhook_events (provider, event_name, order_id, raw_payload, signature_valid, outcome, outcome_detail)
                  values ('stripe', 'charge.refunded', $1, '{}'::jsonb, true, 'processed', 'partial_refund_noted')`, [order]);
}

async function notePartial(db: PGlite, order: string, cents: number | null): Promise<string> {
  const r = await one(db, 'select public.note_entitlement_partial_refund($1, $2) as ishod', [order, cents]);
  return String(r?.ishod);
}

/**
 * DJELOMICAN POVRAT I NADOGRADNJA (Codex pregled PR #217, M1). Pretvorba odbija puni placeni iznos
 * Repaira, pa djelomicno vracena uplata ne smije proci pretvorbu, a povrat koji stigne NAKON
 * pretvorbe ne smije tiho ostaviti Final Pass uz manji neto iznos. Oba redoslijeda se mjere nad
 * stvarnim funkcijama: povrat prije pretvorbe (iznos zapisan u bazi, pretvorba odbijena) i povrat
 * nakon pretvorbe (iznos zapisan, ishod `upgraded_needs_review` za rucni pregled). Negativne
 * kontrole: nepovezan povrat ne blokira cistu nadogradnju, a ponovljena dostava ne mijenja zapis.
 */
export async function partialRefundSqlProblems(db: PGlite): Promise<string[]> {
  const problems: string[] = [];
  const osnovno = (opis: string): UpgradeCase => ({ opis, productId: 'slot_diplomski', workType: 'diplomski', slotsUsed: 1, slotDays: 5, targetId: 'pass_diplomski', ocekivano: 'upgraded' });
  const vraceno = async (id: string) => Number((await one(db, 'select refunded_cents from public.entitlements where id = $1', [id]))?.refunded_cents);
  const redak = async (id: string) => JSON.stringify(await one(db, 'select * from public.entitlements where id = $1', [id]));

  // 1. POVRAT PRIJE PRETVORBE: oznaka pa funkcija (redoslijed webhooka), iznos se vodi u bazi.
  const id1 = await seedRepair(db, osnovno('prije'), 700);
  await partialMarker(db, 'pi_repair_700');
  const n1 = await notePartial(db, 'pi_repair_700', 500);
  if (n1 !== 'noted') problems.push(`povrat prije pretvorbe: note_entitlement_partial_refund vraca ${n1} umjesto noted`);
  if ((await vraceno(id1)) !== 500) problems.push(`povrat prije pretvorbe: refunded_cents je ${await vraceno(id1)} umjesto 500 (iznos se ne vodi u bazi)`);
  const prije1 = await redak(id1);
  const a1 = await apply(db, id1, USER_A, 'pi_up_700', 'pass_diplomski');
  if (a1 !== 'partially_refunded') problems.push(`povrat prije pretvorbe: apply_entitlement_upgrade vraca ${a1} umjesto partially_refunded`);
  if ((await redak(id1)) !== prije1) problems.push('povrat prije pretvorbe: odbijena pretvorba ipak mijenja pravo');
  // Ponovljena i zakasnjela dostava (nizi kumulativni iznos) ne smanjuje zapis.
  await notePartial(db, 'pi_repair_700', 500);
  await notePartial(db, 'pi_repair_700', 200);
  if ((await vraceno(id1)) !== 500) problems.push('povrat prije pretvorbe: ponovljena ili zakasnjela dostava mijenja refunded_cents');

  // 1b. Zapis u retku sam (bez oznake u inboxu) isto odbija: provjera je pod zakljucavanjem retka.
  const id1b = await seedRepair(db, osnovno('samo iznos'), 701);
  await notePartial(db, 'pi_repair_701', 300);
  const a1b = await apply(db, id1b, USER_A, 'pi_up_701', 'pass_diplomski');
  if (a1b !== 'partially_refunded') problems.push(`povrat prije pretvorbe (samo refunded_cents): apply vraca ${a1b} umjesto partially_refunded`);

  // 1c. Povrat stigao prije knjizenja Repaira (not_found): oznaka u inboxu i dalje odbija pretvorbu.
  if ((await notePartial(db, 'pi_repair_702', 400)) !== 'not_found') problems.push('povrat bez prava ne vraca not_found');
  await partialMarker(db, 'pi_repair_702');
  const id1c = await seedRepair(db, osnovno('oznaka prije prava'), 702);
  const a1c = await apply(db, id1c, USER_A, 'pi_up_702', 'pass_diplomski');
  if (a1c !== 'partially_refunded') problems.push(`povrat prije knjizenja prava: apply vraca ${a1c} umjesto partially_refunded`);

  // 1d. Djelomicno vracena uplata NADOGRADNJE prije pretvorbe (redak jos ne nosi njezin PaymentIntent).
  const id1d = await seedRepair(db, osnovno('povrat nadogradnje prije'), 703);
  await partialMarker(db, 'pi_up_703');
  if ((await notePartial(db, 'pi_up_703', 300)) !== 'not_found') problems.push('povrat nadogradnje prije pretvorbe ne vraca not_found');
  const a1d = await apply(db, id1d, USER_A, 'pi_up_703', 'pass_diplomski');
  if (a1d !== 'partially_refunded') problems.push(`povrat uplate nadogradnje prije pretvorbe: apply vraca ${a1d} umjesto partially_refunded`);

  // 2. POVRAT NAKON PRETVORBE: Repair 9,99 + nadogradnja 10,00, pa povrat 5,00 izvorne uplate.
  const id2 = await seedRepair(db, osnovno('nakon'), 710);
  if ((await apply(db, id2, USER_A, 'pi_up_710', 'pass_diplomski')) !== 'upgraded') {
    problems.push('povrat nakon pretvorbe: generator ne proizvodi nadogradjeno pravo');
  } else {
    await partialMarker(db, 'pi_repair_710');
    const n2 = await notePartial(db, 'pi_repair_710', 500);
    if (n2 !== 'upgraded_needs_review') problems.push(`povrat nakon pretvorbe: note_entitlement_partial_refund vraca ${n2} umjesto upgraded_needs_review (Final Pass tiho ostaje uz manji neto iznos)`);
    if ((await vraceno(id2)) !== 500) problems.push('povrat nakon pretvorbe: refunded_cents se ne vodi u bazi');
    const e2 = await one(db, 'select offer_code, status from public.entitlements where id = $1', [id2]);
    if (e2?.offer_code !== 'final_pass_v1' || e2?.status !== 'active') problems.push(`povrat nakon pretvorbe: pravo se mijenja automatski umjesto rucnog pregleda (${JSON.stringify(e2)})`);
    // Povrat dijela UPLATE NADOGRADNJE nakon pretvorbe: isti ishod, iznos izvorne uplate se ne dira.
    if ((await notePartial(db, 'pi_up_710', 300)) !== 'upgraded_needs_review') problems.push('povrat dijela uplate nadogradnje nakon pretvorbe nije upgraded_needs_review');
    if ((await vraceno(id2)) !== 500) problems.push('povrat uplate nadogradnje pise u refunded_cents izvorne uplate');
    // Nakon punog povrata nadogradnje (vracen Repair) isti povrat vise ne trazi pregled.
    await revert(db, 'pi_up_710');
    const n2r = await notePartial(db, 'pi_repair_710', 500);
    if (n2r !== 'noted') problems.push(`povrat nakon vracene nadogradnje vraca ${n2r} umjesto noted`);
  }

  // 3. NEGATIVNA KONTROLA: nepovezan djelomicni povrat ne blokira cistu nadogradnju.
  const id3 = await seedRepair(db, osnovno('kontrola'), 720);
  await partialMarker(db, 'pi_tudji');
  await notePartial(db, 'pi_tudji', 100);
  const a3 = await apply(db, id3, USER_A, 'pi_up_720', 'pass_diplomski');
  if (a3 !== 'upgraded') problems.push(`kontrola: nepovezan povrat blokira cistu nadogradnju (${a3})`);
  if ((await vraceno(id3)) !== 0) problems.push('kontrola: nepovezan povrat pise refunded_cents');
  return problems;
}

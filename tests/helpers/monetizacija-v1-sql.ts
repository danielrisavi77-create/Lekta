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

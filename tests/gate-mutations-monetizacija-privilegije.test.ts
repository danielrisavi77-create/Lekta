/**
 * Mutacije Monetizacije V1: privilegije i vlasnik funkcija (Codex M4), cijene i snapshot.
 * T106: izdvojeno iz tests/gate-mutations.test.ts doslovno (isti naslov bloka i testova), da PGlite
 * testovi ne drze jednog Vitest radnika 137 s u jednoj datoteci. Ugovor isti: cisti baseline, pa mutacija
 * koja mora oboriti gard.
 */
import { describe, it, expect } from 'vitest';
import { V1_MIGRATION, catalogProblems, definerOwnerProblems, idempotencyProblems, readMigration, runV1, snapshotProblems } from './helpers/monetizacija-v1-sql';
import { ROK_SQL, mutiraj, mutirajRe, privilegijeNad } from './helpers/monetizacija-mutations';

/**
 * Monetizacija V1 (M2) krug 3: asinkroni gardovi. Zajednicko citanje pristupa se IZVRSAVA, a 0207 se
 * izvrsava u stvarnom Postgresu (PGlite, tests/helpers/monetizacija-v1-sql.ts). Isti ugovor kao
 * MUTATIONS: cisti baseline, pa mutacija koja mora oboriti gard.
 */
describe('mutacije: Monetizacija V1 izvrseni gardovi', () => {
  it('catalogProblems: cijena mimo set_product_price (bez pricing_changelog traga) -> gard obara', async () => {
    const mutated = mutirajRe(
      /perform public\.set_product_price\(v\.id, v\.price_eur::numeric,\s*'[^']*'\);/,
      'update public.products set price_eur = v.price_eur::numeric where id = v.id;',
    );
    const run = await runV1(mutated);
    try {
      expect((await catalogProblems(run.db)).some((p) => p.includes('nije u pricing_changelog'))).toBe(true);
    } finally {
      await run.db.close();
    }
  }, ROK_SQL);

  it('Codex PR #217 M4: privilegije baseline ciste', async () => {
    expect(await privilegijeNad(readMigration(V1_MIGRATION))).toEqual([]);
  }, ROK_SQL);

  it('Codex PR #217 M4: offer_codes bez revoke (stanje f466d454) daje anon zadane privilegije i obara gard', async () => {
    const mutated = mutiraj('revoke all on table public.offer_codes from public, anon, authenticated;', '');
    const p = await privilegijeNad(mutated);
    expect(p.some((x) => x.startsWith('anon ima INSERT na offer_codes'))).toBe(true);
    expect(p.some((x) => x.startsWith('authenticated ima TRUNCATE na offer_codes'))).toBe(true);
  }, ROK_SQL);

  it('Codex PR #217 M4: RPC bez izricitog grant execute service_role (stanje f466d454) obara gard u bazi bez zadanih', async () => {
    const mutated = mutirajRe(/grant execute on function public\.apply_entitlement_upgrade\([^)]*\)\r?\n  to service_role;/, '');
    expect((await privilegijeNad(mutated)).some((x) => x.includes('service_role nema EXECUTE na public.apply_entitlement_upgrade') && x.includes('bez zadanih'))).toBe(true);
  }, ROK_SQL);

  it('Codex PR #217 M4: RPC bez revoke za anon obara gard', async () => {
    const mutated = mutiraj('revoke all on function public.note_entitlement_partial_refund(text, integer) from public, anon, authenticated;', '');
    expect((await privilegijeNad(mutated)).some((x) => x.startsWith('anon ima EXECUTE na public.note_entitlement_partial_refund'))).toBe(true);
  }, ROK_SQL);

  it('Codex PR #217 M4: offer_codes bez grant service_role obara gard u bazi bez zadanih', async () => {
    const mutated = mutiraj('grant select, insert, update, delete on table public.offer_codes to service_role;', '');
    expect((await privilegijeNad(mutated)).some((x) => x.startsWith('service_role nema SELECT na offer_codes (bez zadanih'))).toBe(true);
  }, ROK_SQL);

  it('Codex PR #217 r2 M4: vlasnik SECURITY DEFINER funkcija baseline cist (0207 pod drugom ulogom)', async () => {
    expect(await definerOwnerProblems()).toEqual([]);
  }, ROK_SQL);

  it('Codex PR #217 r2 M4: funkcija bez izricitog owner to postgres (stanje 7ae20bba) pripada ulozi koja je migrirala i obara gard', async () => {
    const mutated = mutirajRe(/alter function public\.revert_entitlement_upgrade\(text\) owner to postgres;\r?\n/, '');
    expect((await definerOwnerProblems(mutated)).some((x) => x.startsWith('revert_entitlement_upgrade: vlasnik je lekta_tudji_migrator'))).toBe(true);
  }, ROK_SQL);

  it('Codex PR #217 r2 M4: SECURITY DEFINER funkcija bez praznog search_path obara gard', async () => {
    const mutated = mutirajRe(/(create or replace function public\.note_entitlement_partial_refund\([\s\S]*?security definer\r?\n)set search_path = ''\r?\n/, '$1');
    expect((await definerOwnerProblems(mutated)).some((x) => x.startsWith('note_entitlement_partial_refund: search_path nije izricito prazan'))).toBe(true);
  }, ROK_SQL);

  it('bezuvjetan set_product_price: drugi prolaz dopisuje pricing_changelog i obara gard idempotencije', async () => {
    const mutated = mutiraj('    if p.price_eur is distinct from v.price_eur::numeric then', '    if true then');
    const run = await runV1(mutated);
    try {
      expect((await idempotencyProblems(run, mutated)).some((p) => p.includes('dopisuje pricing_changelog'))).toBe(true);
    } finally {
      await run.db.close();
    }
  }, ROK_SQL);

  it('backfill prozora POSLIJE promjene kataloga: staro pravo dobiva novi prozor i obara gard snapshota', async () => {
    const sql = readMigration(V1_MIGRATION);
    const backfill = sql.slice(
      sql.indexOf('update public.entitlements e\n   set slot_window_days = p.slot_window_days'),
      sql.indexOf('-- Snapshot pri svakom upisu prava'),
    );
    expect(backfill.length).toBeGreaterThan(50);
    const bez = sql.replace(backfill, '');
    const mutated = bez.replace('-- 6. Kanibalizirajuci', `${backfill}\n-- 6. Kanibalizirajuci`);
    expect(mutated).not.toBe(sql);
    const run = await runV1(mutated);
    try {
      expect((await snapshotProblems(run)).some((p) => p.includes('umjesto kupljenih 14'))).toBe(true);
    } finally {
      await run.db.close();
    }
  }, ROK_SQL);

  it('bez triggera snapshota: pravo upisano mimo webhooka ostaje bez ponude i obara gard', async () => {
    const mutated = mutiraj(
      'create trigger entitlements_snapshot_offer\n  before insert on public.entitlements\n  for each row execute function public.entitlements_snapshot_offer();',
      '',
    );
    const run = await runV1(mutated);
    try {
      expect((await snapshotProblems(run)).some((p) => p.includes('trigger ne snapshotira'))).toBe(true);
    } finally {
      await run.db.close();
    }
  }, ROK_SQL);
});

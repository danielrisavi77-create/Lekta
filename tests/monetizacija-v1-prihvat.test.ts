/**
 * Prihvatni kriteriji Monetizacije V1 (docs/decisions/MONETIZACIJA_V1.md odjeljak 29), serverski dio
 * (M2). Svaki `describe` nosi doslovnu recenicu kriterija. Kriteriji koje mjere izvrseni handleri
 * imaju testove uz handler; ovdje su oni koji se mjere nad katalogom iz migracija i nad cistom
 * odlukom o pristupu (slot-logic), bez baze:
 *
 *  - "svaki Repair SKU daje tocno jedan slot odgovarajuce vrste rada"
 *  - "Final Pass ne moze se primijeniti na drugi rad"
 *  - "Final Pass prihvaca novu verziju istog rada"
 *  - "deaktivirani *_do_obrane proizvodi vise se ne nude" (katalog; checkout je u
 *    tests/create-checkout-handler.test.ts)
 *  - "specijalisticki prolazi kroz pricing/catalog/checkout/entitlement tok" (katalog; checkout i
 *    webhook su uz handlere)
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { seededProducts } from './helpers/product-seeds';
import { fetchRetailCatalog, mapProductRow, type Product } from '../src/catalog/products-catalog';
import { decideReportAccess, type EntitlementRow } from '../src/report/slot-logic';
import { computeFingerprint } from '../src/fingerprint/fingerprint';
import { resolveCheckout } from '../src/report/checkout';
import { isBillableWorkType } from '../src/report/billable-work-type';

/** Ciljno stanje iz 0207 (prozor slota po proizvodu), parsirano, ne prepisano. */
const V1 = (() => {
  const sql = readFileSync(resolve(process.cwd(), 'supabase', 'migrations', '0207_monetizacija_v1.sql'), 'utf8').replace(/\r\n/g, '\n');
  const m = /select \* from \(values([\s\S]*?)\)\s*as t\(id, price_eur, slot_window_days, purchase_window_days, offer_code\)/.exec(sql);
  if (!m) throw new Error('0207: ciljno stanje nije pronadjeno');
  const out = new Map<string, { price: number; slotWindow: number; purchaseWindow: number; offer: string }>();
  for (const t of m[1].matchAll(/\('([a-z_]+)',\s*([\d.]+),\s*(\d+),\s*(\d+),\s*'([a-z_0-9]+)'\)/g)) {
    out.set(t[1], { price: Number(t[2]), slotWindow: Number(t[3]), purchaseWindow: Number(t[4]), offer: t[5] });
  }
  return out;
})();

/** Katalog kakav je nakon 0207: sjeme iz svih migracija uz ciljno stanje i gasenje do_obrane. */
const CATALOG: Product[] = (() => {
  const byId = new Map<string, Product>();
  for (const s of seededProducts()) byId.set(String(s.row.id), mapProductRow(s.row));
  for (const [id, v] of V1) {
    const p = byId.get(id);
    if (!p) throw new Error(`${id} nije sijan ni u jednoj migraciji`);
    byId.set(id, { ...p, priceEur: v.price, slotWindowDays: v.slotWindow, purchaseWindowDays: v.purchaseWindow, offerCode: v.offer });
  }
  for (const id of ['slot_zavrsni_do_obrane', 'slot_diplomski_do_obrane']) {
    const p = byId.get(id);
    if (!p) throw new Error(`${id} nije sijan (generator ne vidi ciljani razred)`);
    byId.set(id, { ...p, active: false });
  }
  return [...byId.values()];
})();

const NOW = '2026-09-27T12:00:00.000Z';
const at = (days: number) => new Date(Date.parse(NOW) + days * 86_400_000).toISOString();

const rad = computeFingerprint({
  title: 'Utjecaj digitalizacije na lokalnu upravu',
  author: 'Ana Anic',
  headings: [
    { level: 1, text: '1. Uvod' },
    { level: 1, text: '2. Teorijski okvir' },
    { level: 1, text: '3. Metodologija' },
    { level: 1, text: '4. Rezultati' },
    { level: 1, text: '5. Zakljucak' },
  ],
});
/** Nova verzija ISTOG rada: isti naslov i autor, dodano poglavlje rasprave. */
const novaVerzija = computeFingerprint({
  title: 'Utjecaj digitalizacije na lokalnu upravu',
  author: 'Ana Anic',
  headings: [
    { level: 1, text: '1. Uvod' },
    { level: 1, text: '2. Teorijski okvir' },
    { level: 1, text: '3. Metodologija' },
    { level: 1, text: '4. Rezultati' },
    { level: 1, text: '5. Rasprava' },
    { level: 1, text: '6. Zakljucak' },
  ],
});
const drugiRad = computeFingerprint({
  title: 'Energetska tranzicija u Hrvatskoj',
  author: 'Marko Maric',
  headings: [
    { level: 1, text: 'Uvod' },
    { level: 1, text: 'Izvori energije' },
    { level: 1, text: 'Politike' },
  ],
});

describe('"svaki Repair SKU daje tocno jedan slot odgovarajuce vrste rada"', () => {
  const repair = CATALOG.filter((p) => p.active && p.offerCode === 'repair_v1' && p.kind === 'slot');

  it('generator: aktivni Repair SKU-ovi su tocno pet vrsta rada iz odjeljka 5', () => {
    expect(repair.map((p) => p.id).sort()).toEqual([
      'slot_diplomski', 'slot_doktorski', 'slot_seminarski', 'slot_specijalisticki', 'slot_zavrsni',
    ]);
  });

  it.each(['seminarski', 'zavrsni', 'diplomski', 'specijalisticki', 'doktorski'])('slot_%s: jedan slot, vrsta rada iz imena', (wt) => {
    const p = CATALOG.find((x) => x.id === `slot_${wt}`)!;
    expect(p.slotsTotal).toBe(1);
    expect(p.workType).toBe(wt);
  });
});

describe('"Final Pass ne moze se primijeniti na drugi rad" i "prihvaca novu verziju istog rada"', () => {
  const passes = CATALOG.filter((p) => p.active && p.offerCode === 'final_pass_v1');

  it('generator: cetiri Final Passa (zavrsni, diplomski, specijalisticki, doktorski), svaki jedan slot', () => {
    expect(passes.map((p) => p.id).sort()).toEqual(['pass_diplomski', 'pass_doktorski', 'pass_specijalisticki', 'pass_zavrsni']);
    for (const p of passes) expect(p.slotsTotal, p.id).toBe(1);
  });

  it.each(['pass_diplomski', 'pass_specijalisticki', 'pass_doktorski'])('%s: vezan rad, druga verzija je recheck, drugi rad placa', (id) => {
    const pass = CATALOG.find((p) => p.id === id)!;
    // Vrsta rada prolazi ISTI validator kao generate-report i repair-docx, bez casta.
    const workType = pass.workType;
    if (!isBillableWorkType(workType)) throw new Error(`${id}: vrsta rada ${String(workType)} nije prodajna`);
    const ent: EntitlementRow = {
      id: 'ent-pass', workType, status: 'active', slotsUsed: 0, slotsTotal: pass.slotsTotal,
      purchaseExpiresAt: at(pass.purchaseWindowDays), slotWindowDays: pass.slotWindowDays,
    };
    // Prvi rad veze slot na prozor Final Passa.
    const prvi = decideReportAccess({ now: NOW, workType, fingerprint: rad, activeSlots: [], entitlements: [ent], recentGenerationCount: 0 });
    expect(prvi.decision).toBe('new_slot');
    if (prvi.decision !== 'new_slot') return;
    expect(prvi.newSlot.slotExpiresAt).toBe(at(pass.slotWindowDays));
    const slot = { id: 'slot-1', workType, fingerprint: rad, slotExpiresAt: prvi.newSlot.slotExpiresAt };
    const iskoristeno = { ...ent, slotsUsed: 1 };

    // Nova verzija istog rada, mjesecima kasnije (unutar trajanja passa): besplatan recheck.
    const kasnije = at(Math.min(150, pass.slotWindowDays - 1));
    const nova = decideReportAccess({ now: kasnije, workType, fingerprint: novaVerzija, activeSlots: [slot], entitlements: [iskoristeno], recentGenerationCount: 0 });
    expect(nova).toEqual({ decision: 'recheck', http: 200, slotId: 'slot-1' });

    // Drugi rad: pass je potrosen na prvi, pa trazi placanje.
    const drugi = decideReportAccess({ now: kasnije, workType, fingerprint: drugiRad, activeSlots: [slot], entitlements: [iskoristeno], recentGenerationCount: 0 });
    expect(drugi.decision).toBe('payment_required');
  });

  it('Semester Pass: svaki seminarski rad dobiva vlastiti slot (6), bez mijesanja pod isti otisak', () => {
    const sem = CATALOG.find((p) => p.id === 'pass_semestralni')!;
    expect(sem).toMatchObject({ offerCode: 'semester_pass_v1', slotsTotal: 6, workType: 'seminarski', purchaseWindowDays: 180 });
    const ent: EntitlementRow = { id: 'ent-sem', workType: 'seminarski', status: 'active', slotsUsed: 1, slotsTotal: 6, purchaseExpiresAt: at(180), slotWindowDays: sem.slotWindowDays };
    const slot = { id: 'slot-1', workType: 'seminarski' as const, fingerprint: rad, slotExpiresAt: at(7) };
    const drugi = decideReportAccess({ now: NOW, workType: 'seminarski', fingerprint: drugiRad, activeSlots: [slot], entitlements: [ent], recentGenerationCount: 0 });
    expect(drugi.decision).toBe('new_slot');
  });
});

describe('"deaktivirani *_do_obrane proizvodi vise se ne nude"', () => {
  it('katalog nakon 0207: oba do_obrane postoje (povijest), a neaktivni su', () => {
    const doObrane = CATALOG.filter((p) => p.id.endsWith('_do_obrane'));
    expect(doObrane.map((p) => [p.id, p.active])).toEqual([
      ['slot_zavrsni_do_obrane', false],
      ['slot_diplomski_do_obrane', false],
    ]);
  });

  it('paywall trazi samo aktivne (active=eq.true), a checkout neaktivan proizvod odbija', async () => {
    let url = '';
    await fetchRetailCatalog({ supabaseUrl: 'https://p.supabase.co', anonKey: 'anon' }, async (u) => {
      url = String(u);
      return new Response('[]', { status: 200 });
    });
    expect(url).toContain('active=eq.true');
    for (const p of CATALOG.filter((x) => x.id.endsWith('_do_obrane'))) {
      expect(resolveCheckout(p, { isPartnerActive: false }), p.id).toEqual({ ok: false, status: 404, error: 'unknown_product' });
    }
  });
});

describe('"specijalisticki prolazi kroz ... catalog ... tok" (katalog)', () => {
  it('specijalisticki ima vlastiti Repair i Final Pass izmedju diplomskog i doktorskog', () => {
    const cijena = (id: string) => CATALOG.find((p) => p.id === id)!.priceEur;
    expect(cijena('slot_diplomski')).toBeLessThan(cijena('slot_specijalisticki'));
    expect(cijena('slot_specijalisticki')).toBeLessThan(cijena('slot_doktorski'));
    expect(cijena('pass_diplomski')).toBeLessThan(cijena('pass_specijalisticki'));
    expect(cijena('pass_specijalisticki')).toBeLessThan(cijena('pass_doktorski'));
    for (const id of ['slot_specijalisticki', 'pass_specijalisticki']) {
      const p = CATALOG.find((x) => x.id === id)!;
      expect(p.workType, id).toBe('specijalisticki');
      expect(resolveCheckout(p, { isPartnerActive: false }).ok, id).toBe(true);
    }
  });
});

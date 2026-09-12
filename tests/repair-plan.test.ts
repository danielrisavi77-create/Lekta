import { describe, expect, it } from 'vitest';
import { defaultSelectedItems } from '../src/repair/default-selection';
import { buildRepairPlan, defaultPlanSelection, planSelectionSummary, selectablePlanRuleIds, type PlanItemInput } from '../src/ui/results/repair-plan';
import { repairPlanHtml } from '../src/ui/results/repair-plan-view';
import type { VisualFindingModel } from '../src/ui/results/visual-result-model';

/**
 * PLAN ISPRAVAKA. Sedma tocka vlasnikova pregleda: "Nalaz prirodno zavrsava u popravku."
 *
 * Dvije tvrdnje nose cijeli plan i obje se tiho gube:
 *   1. Sto je PREDODABRANO mora biti isto sto ce popravak stvarno primijeniti. Da plan koristi
 *      vlastito pravilo, obecavao bi jedno a motor radio drugo.
 *   2. Skupina RUCNO ne dolazi iz stavki popravka nego iz NALAZA. Bez nje bi plan tvrdio da je
 *      posao gotov cim se primijene automatski zahvati.
 */
const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;');

function nalaz(over: Partial<VisualFindingModel> = {}): VisualFindingModel {
  return {
    id: 'f1', title: 'Nalaz', severity: 'warning', category: 'formatting', status: 'open',
    kind: 'document', explanation: 'Objasnjenje.', priorityRank: 0, originalIndex: 0,
    matchKeys: [], capabilities: { repair: false, preview: true }, scope: { kind: 'document' },
    ...over,
  } as unknown as VisualFindingModel;
}

const STAVKA = (o: Partial<PlanItemInput> = {}): PlanItemInput =>
  ({ ruleId: 'r', label: 'Lijeva margina', ...o });

describe('tri skupine plana', () => {
  it('prekrseno bez potvrde je SIGURNO i predodabrano', () => {
    const p = buildRepairPlan([STAVKA({ violated: true })], [], true);
    expect(p.sigurni).toHaveLength(1);
    expect(p.odabrano).toBe(1);
  });

  it('stavka koja trazi potvrdu NIJE predodabrana, ma koliko bila prekrsena', () => {
    // Umetanje sekcije je semanticka odluka o mjestu; Lekta to MOZE, ali ne smije sama.
    const p = buildRepairPlan([
      STAVKA({ violated: true, requiresConfirmation: true, confirmationText: 'Potvrdi mjesto.' }),
    ], [], true);
    expect(p.sigurni).toHaveLength(0);
    expect(p.odluka).toHaveLength(1);
    expect(p.odabrano).toBe(0);
    expect(p.odluka[0].potvrda).toBe('Potvrdi mjesto.');
  });

  it('preporuka fakulteta je opt-in, pa ide u odluku a ne u sigurne', () => {
    const p = buildRepairPlan([STAVKA({ violated: false, recommended: true })], [], true);
    expect(p.sigurni).toHaveLength(0);
    expect(p.odluka[0].preporuka).toBe(true);
  });

  it('"uskladi sve" opt-in NIJE odluka i ne ulazi u plan', () => {
    /**
     * Nadjeno na SNIMCI 2026-09-08, ne u testu: plan je pod "Treba tvoju odluku" nabrajao Font,
     * Prored, Format papira A4 i Poravnanje, iako s njima nema nikakvog problema. To su stavke
     * koje NISU prekrsene (Feature B, "uskladi cijeli dokument"), pa zahvat samo forsira
     * jedinstvenu vrijednost. Plan nabraja POSAO KOJI TREBA OBAVITI, a to nije posao.
     *
     * Ne nestaju iz proizvoda: puni panel iza "Detalji provjere" ih i dalje nudi.
     */
    const p = buildRepairPlan([
      STAVKA({ ruleId: 'font', label: 'Font', violated: false }),
      STAVKA({ ruleId: 'prored', label: 'Prored', violated: false }),
    ], [], true);
    expect(p.sigurni).toHaveLength(0);
    expect(p.odluka).toHaveLength(0);
    expect(p.prazan).toBe(true);
  });

  it('UGOVOR S MOTOROM: predodabrano u planu = odabrano u `defaultSelectedItems`', () => {
    /**
     * Ovo je tvrdnja koja spaja prikaz i motor. Plan NE SMIJE imati vlastito pravilo o tome sto
     * je predodabrano: `buildDefaultRepairRequests` salje ono sto `defaultSelectedItems` vrati, a
     * korisnik cita ono sto plan pise. Da se ta dva raziđu, plan bi obecavao zahvate koji se ne
     * primjenjuju, ili obrnuto.
     */
    const items = [
      STAVKA({ ruleId: 'a', violated: true }),
      STAVKA({ ruleId: 'b', violated: false }),
      STAVKA({ ruleId: 'c' }),
    ];
    const plan = buildRepairPlan(items, [], true);
    const motor = defaultSelectedItems(items.map((i) => ({ ...i, fixerId: 'x' })) as never);
    expect(plan.sigurni.map((s) => s.ruleId).sort()).toEqual(motor.map((m) => m.ruleId).sort());
  });

  it('MUTACIJA: da plan uzme SVE stavke kao sigurne, ugovor bi pukao', () => {
    const items = [STAVKA({ ruleId: 'a', violated: true }), STAVKA({ ruleId: 'b', violated: false })];
    const plan = buildRepairPlan(items, [], true);
    expect(plan.sigurni).toHaveLength(1);
    expect(plan.sigurni.length).not.toBe(items.length);
  });
});

describe('skupina RUCNO dolazi iz nalaza, ne iz stavki', () => {
  it('nalaz koji nijedna stavka ne pokriva zavrsi u rucnima', () => {
    const p = buildRepairPlan([], [nalaz({ title: 'Novak (2022) nema puni zapis' })], true);
    expect(p.rucni).toHaveLength(1);
    expect(p.rucni[0].naslov).toContain('Novak');
  });

  it('nalaz koji STAVKA pokriva ne ponavlja se kao rucni', () => {
    const p = buildRepairPlan(
      [STAVKA({ violated: true, matchKeys: ['Lijeva margina'] })],
      [nalaz({ matchKeys: ['Lijeva margina'] as never })],
      true,
    );
    expect(p.sigurni).toHaveLength(1);
    expect(p.rucni).toHaveLength(0);
  });

  it('zanemaren nalaz ne ulazi u plan', () => {
    const p = buildRepairPlan([], [nalaz({ status: 'ignored' } as never)], true);
    expect(p.rucni).toHaveLength(0);
  });

  it('MUTACIJA: bez rucne skupine plan bi tvrdio da je posao gotov', () => {
    // Tri nalaza koje nista ne popravlja: da skupina ne postoji, plan bi bio prazan i korisnik bi
    // zakljucio da nakon automatskih zahvata nema sto raditi.
    const p = buildRepairPlan([], [nalaz({ id: 'a' }), nalaz({ id: 'b' }), nalaz({ id: 'c' })], true);
    expect(p.prazan).toBe(false);
    expect(p.rucni).toHaveLength(3);
  });
});

describe('prijelaz vrijednosti', () => {
  it('"prije -> poslije" dolazi iz nalaza, kad ga nalaz zna', () => {
    const p = buildRepairPlan(
      [STAVKA({ violated: true, matchKeys: ['m'] })],
      [nalaz({ matchKeys: ['m'] as never, measured: '2,3 cm', expected: '3,0 cm' } as never)],
      true,
    );
    expect(p.sigurni[0].prije).toBe('2,3 cm');
    expect(p.sigurni[0].poslije).toBe('3,0 cm');
  });

  it('kad vrijednosti nema, NE izmislja se strelica', () => {
    const p = buildRepairPlan([STAVKA({ violated: true })], [], true);
    expect(p.sigurni[0].prije).toBeNull();
    expect(repairPlanHtml(p, esc)).not.toContain('rp-prijelaz');
  });
});

describe('prikaz plana', () => {
  const plan = () => buildRepairPlan([
    STAVKA({ ruleId: 'a', label: 'Lijeva margina', violated: true, matchKeys: ['m'] }),
    STAVKA({ ruleId: 'b', label: 'Izjava o izvornosti', violated: true, requiresConfirmation: true, confirmationText: 'Ti potvrđuješ mjesto.' }),
  ], [
    nalaz({ id: 'x', matchKeys: ['m'] as never, measured: '2,3 cm', expected: '3,0 cm' } as never),
    nalaz({ id: 'y', title: 'Novak (2022) nema puni zapis' }),
  ], true);

  it('tri skupine imaju tri razlicita naslova', () => {
    const html = repairPlanHtml(plan(), esc);
    expect(html).toContain('Sigurni zahvati');
    expect(html).toContain('Treba tvoju odluku');
    expect(html).toContain('Ručno');
  });

  it('kvacica postoji SAMO ondje gdje se moze birati', () => {
    // Rucne stavke dobivaju tocku, ne praznu kvacicu: prazna kvacica bi izgledala kao nesto sto
    // korisnik moze ukljuciti, a Lekta to ne moze napraviti ni kad bi htio.
    const html = repairPlanHtml(plan(), esc);
    const rucniBlok = html.slice(html.indexOf('rp-popis--rucno'));
    expect(rucniBlok).not.toContain('rp-kvacica');
    expect(rucniBlok).toContain('rp-tocka');
  });

  it('predodabrano je oznaceno, a odluka nije', () => {
    const html = repairPlanHtml(plan(), esc);
    expect(html).toContain('data-odabrano="da"');
    expect(html).toContain('data-odabrano="ne"');
  });

  it('brojac se slaze s modelom i postuje hrvatsku mnozinu', () => {
    expect(repairPlanHtml(plan(), esc)).toContain('1 automatski zahvat odabran');
    const tri = buildRepairPlan([
      STAVKA({ ruleId: 'a', violated: true }), STAVKA({ ruleId: 'b', violated: true }), STAVKA({ ruleId: 'c', violated: true }),
    ], [], true);
    expect(repairPlanHtml(tri, esc)).toContain('3 automatska zahvata odabrana');
  });

  it('bez ponude popravka plan se ne crta kao prazan popis', () => {
    const p = buildRepairPlan([STAVKA({ violated: true })], [nalaz()], false);
    expect(p.prazan).toBe(true);
    expect(repairPlanHtml(p, esc)).toContain('nema automatskih zahvata');
  });

  it('naziv i potvrda se ESKAPIRAJU, jer dolaze iz podataka', () => {
    const p = buildRepairPlan([STAVKA({ violated: true, label: '<img src=x>' })], [], true);
    expect(repairPlanHtml(p, esc)).not.toContain('<img');
  });
});

describe('odabir u planu (T09)', () => {
  const plan = buildRepairPlan([
    STAVKA({ ruleId: 'a', label: 'Lijeva margina', violated: true }),
    STAVKA({ ruleId: 'b', label: 'Izjava', violated: true, requiresConfirmation: true, confirmationText: 'Potvrdi mjesto.' }),
    STAVKA({ ruleId: 'c', label: 'Preporuka', violated: false, recommended: true }),
    STAVKA({ ruleId: 'd', label: 'Uskladi sve', violated: false }),
  ], [nalaz({ id: 'r', title: 'Rucno' })], true);

  it('zadani odabir su tocno sigurni zahvati', () => {
    expect(defaultPlanSelection(plan)).toEqual(['a']);
  });

  it('sazetak broji SAMO stavke koje plan nudi; nepoznat ili nekontroliran ruleId se ignorira', () => {
    const s = planSelectionSummary(plan, ['a', 'c', 'd', 'nepoznat']);
    expect(s.count).toBe(2);
    expect(s.labels).toEqual(['Lijeva margina', 'Preporuka']);
    expect(s.needsConfirmation).toEqual([]);
    expect([...selectablePlanRuleIds(plan)].sort()).toEqual(['a', 'b', 'c']);
  });

  it('odabrana odluka s potvrdom se najavljuje, a iskljucen zahvat ne ukljucuje drugi', () => {
    const s = planSelectionSummary(plan, ['b']);
    expect(s.count).toBe(1);
    expect(s.needsConfirmation.map((x) => x.ruleId)).toEqual(['b']);
    expect(planSelectionSummary(plan, []).count).toBe(0);
  });

  it('prikaz: kvacice su pravi checkboxovi s labelom, rucne stavke bez kontrole', () => {
    const html = repairPlanHtml(plan, esc);
    expect(html).toContain('<input type="checkbox" class="rp-kvacica" id="rp-a" data-repair-plan-item="a" data-odabrano="da" checked />');
    expect(html).toContain('<label class="rp-naziv" for="rp-a">Lijeva margina</label>');
    expect(html).toContain('data-repair-plan-item="b" data-odabrano="ne" />');
    expect(html).not.toContain('data-repair-plan-item="d"');
    expect(html).toContain('data-testid="repair-plan-continue"');
    expect(html).toContain('data-testid="repair-selected-summary"');
    const rucni = html.slice(html.indexOf('rp-popis--rucno'));
    expect(rucni).not.toContain('<input');
  });
});

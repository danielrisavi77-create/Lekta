import { describe, expect, it } from 'vitest';
import type { DeskItem } from '../src/ui/results/desk-model';
import { queueHtml, queueRedci } from '../src/ui/results/desk-queue';
import type { VisualFindingModel } from '../src/ui/results/visual-result-model';

/**
 * RED CEKANJA NALAZA. Brif vlasnika: "Odmah je vidljivo: sto prvo, sto Lekta moze rijesiti, sto
 * mora student."
 *
 * Te tri stvari su DVIJE OSI, ne jedna ljestvica, i to je tvrdnja koju je najlakse izgubiti:
 * ozbiljnost kaze sto prvo, popravljivost tko to radi, i one se KRIZAJU. Blokator moze biti
 * automatski popravljiv, a sitnica ne mora. Kad bi se spojile u jednu oznaku, prikaz bi lagao.
 */
const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;');

function stavka(over: Partial<VisualFindingModel>, repair = false): DeskItem<VisualFindingModel> {
  return {
    finding: {
      id: 'x', title: 'Naslov', severity: 'warning', category: 'formatting', status: 'open',
      kind: 'document', explanation: '', priorityRank: 0, originalIndex: 0,
      capabilities: { repair, preview: true }, scope: { kind: 'document' }, ...over,
    } as unknown as VisualFindingModel,
    flagIndex: null,
  };
}

describe('retci reda cekanja', () => {
  it('redni broj je POLOZAJ u popisu, pa se slaze s "3 / 9"', () => {
    const r = queueRedci([stavka({}), stavka({}), stavka({})], true);
    expect(r.map((x) => x.redni)).toEqual([1, 2, 3]);
  });

  it('tri razine ozbiljnosti dobivaju tri oznake iz sazetka, ne nove rijeci', () => {
    const r = queueRedci([
      stavka({ severity: 'error' }), stavka({ severity: 'warning' }), stavka({ severity: 'info' }),
    ], true);
    expect(r.map((x) => x.oznaka)).toEqual(['KRITIČNO', 'VAŽNO', 'PROVJERI']);
    expect(r.map((x) => x.ton)).toEqual(['blok', 'dorada', 'provjera']);
  });

  it('AUTO i RUCNO dolaze s DRUGE osi i krizaju se s ozbiljnoscu', () => {
    // Blokator koji se popravlja sam, i sitnica koju mora covjek: da su osi spojene u jednu
    // ljestvicu, ova kombinacija ne bi mogla postojati, a u stvarnim rezultatima postoji.
    const r = queueRedci([
      stavka({ severity: 'error' }, true),
      stavka({ severity: 'info' }, false),
    ], true);
    expect(r[0].ton).toBe('blok');
    expect(r[0].automatski).toBe(true);
    expect(r[1].ton).toBe('provjera');
    expect(r[1].automatski).toBe(false);
  });

  it('kad popravak nije ponudjen, os se NE tvrdi umjesto da sve bude RUCNO', () => {
    // `null` znaci "ponude nema"; `false` bi tvrdilo da student mora sam, sto je druga tvrdnja.
    // Ista razlika koju `finding-summary.ts` cuva kroz `automatski: null`.
    const r = queueRedci([stavka({}, true)], false);
    expect(r[0].automatski).toBeNull();
    expect(queueHtml(r, 0, esc)).not.toContain('dq-fix');
  });
});

describe('prikaz reda cekanja', () => {
  const troje = () => queueRedci([
    stavka({ id: 'a', title: 'Lijeva margina', severity: 'error' }, true),
    stavka({ id: 'b', title: 'Nedostaje izvor', severity: 'warning' }, false),
    stavka({ id: 'c', title: 'Izjava o izvornosti', severity: 'info' }, true),
  ], true);

  it('svaki redak nudi klik kroz ISTI atribut koji koristi navigacija', () => {
    // Bez toga bi popis trazio drugi put kroz kod za istu radnju.
    const html = queueHtml(troje(), 0, esc);
    expect(html).toContain('data-desk-go="0"');
    expect(html).toContain('data-desk-go="1"');
    expect(html).toContain('data-desk-go="2"');
  });

  it('DETALJ SE OTVARA SAMO NA ODABRANOM RETKU', () => {
    // Doslovno po brifu: "kliknes 03 i samo se njegov detalj otvori".
    const html = queueHtml(troje(), 1, esc, '<p id="detalj">tijelo</p>');
    expect(html.match(/dq-detalj/g) ?? []).toHaveLength(1);
    expect(html).toContain('aria-expanded="true"');
    expect((html.match(/aria-expanded="false"/g) ?? []).length).toBe(2);
  });

  it('MUTACIJA: skriven detalj u SVAKOM retku bio bi isti card zoo', () => {
    // Najvjerojatnija buduca "optimizacija" je iscrtati sve detalje pa ih sakriti CSS-om. Tada
    // prikaz opet nosi N kartica, samo nevidljivih, i placa ih pri svakom ponovnom crtanju.
    const html = queueHtml(troje(), 1, esc, '<p>tijelo</p>');
    expect((html.match(/tijelo/g) ?? []).length).toBe(1);
  });

  it('bez detalja se popis i dalje crta: pregled ne ovisi o odabiru', () => {
    const html = queueHtml(troje(), 0, esc);
    expect(html).toContain('Lijeva margina');
    expect(html).toContain('Nedostaje izvor');
    expect(html).not.toContain('dq-detalj');
  });

  it('prazan popis ne crta prazan okvir', () => {
    expect(queueHtml([], 0, esc)).toBe('');
  });

  it('naslov nalaza se ESKAPIRA, jer dolazi iz podataka', () => {
    const r = queueRedci([stavka({ title: '<img src=x onerror=1>' })], true);
    expect(queueHtml(r, 0, esc)).not.toContain('<img');
  });

  it('polozaj izvan raspona ne otvara nijedan redak, i ne rusi popis', () => {
    const html = queueHtml(troje(), 99, esc, '<p>tijelo</p>');
    expect(html).toContain('Lijeva margina');
    expect(html).not.toContain('dq-detalj');
  });
});

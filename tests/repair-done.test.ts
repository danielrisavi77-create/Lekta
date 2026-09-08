import { describe, expect, it } from 'vitest';
import { repairDoneHtml, repairDoneModel } from '../src/ui/results/repair-done';

/**
 * ISHOD POPRAVKA (deveta tocka).
 *
 * Najvrjednija tvrdnja ovdje nije "prikazuje 3 / 3" nego ono sto se dogodi kad SE NE ZNA. Ekran
 * koji poslije neuspjele ponovne analize napise "0 novih problema" izmislja umirujucu tvrdnju o
 * dokumentu koji nitko nije pogledao, i to je najgori oblik kvara na placenom toku: izgleda
 * najbolje bas kad je najmanje istinit.
 */
const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const CL = (n: number) => Array.from({ length: n }, (_, i) => ({
  ruleId: `r${i}`, beforeLabel: `Times ${i}`, afterLabel: `Arial ${i}`,
}));

describe('brojka dolazi iz ishoda, ne iz changeloga', () => {
  it('"2 / 3" su razrijesene i ciljane provjere', () => {
    const m = repairDoneModel({
      outcome: { targeted: ['a', 'b', 'c'], resolved: ['a', 'b'] },
      regresije: [], changelog: CL(7),
    });
    expect(m.primijenjeno).toBe(2);
    expect(m.ciljano).toBe(3);
    expect(m.potpun).toBe(false);
  });

  it('MUTACIJA: da brojka dolazi iz changeloga, tvrdila bi 7 od 7', () => {
    /**
     * Changelog broji IZMJENE koje je motor napravio, a ishod broji PROVJERE koje su prestale
     * padati. Jedan popravak zna dirnuti sedam mjesta a razrijesiti dvije provjere, pa bi brojka
     * iz changeloga tvrdila zavrsen posao nad dokumentom koji jos pada.
     */
    const m = repairDoneModel({
      outcome: { targeted: ['a', 'b', 'c'], resolved: ['a', 'b'] },
      regresije: [], changelog: CL(7),
    });
    expect(m.primijenjeno).not.toBe(7);
    expect(repairDoneHtml(m, esc)).toContain('2 / 3');
  });

  it('sve ciljano razrijeseno znaci ZAVRSEN', () => {
    const m = repairDoneModel({ outcome: { targeted: ['a'], resolved: ['a'] }, regresije: [], changelog: [] });
    expect(m.potpun).toBe(true);
    expect(repairDoneHtml(m, esc)).toContain('Popravak završen');
  });

  it('bez ijedne ciljane provjere NE tvrdi ni "zavrsen" ni "djelomicno"', () => {
    // Nista ciljano znaci da se nema sto mjeriti, pa su OBA naslova tvrdnja o mjerenju koje se nije
    // dogodilo. Treci naslov postoji zbog toga, a ne radi ljepote.
    const m = repairDoneModel({ outcome: null, regresije: [], changelog: CL(2) });
    expect(m.potpun).toBe(false);
    const html = repairDoneHtml(m, esc);
    expect(html).not.toContain('Popravak završen');
    expect(html).not.toContain('djelomično');
    expect(html).toContain('Popravak primijenjen');
  });
});

describe('NE ZNAM se ne pise kao NULA', () => {
  it('neuspjela ponovna provjera daje `null`, ne 0', () => {
    const m = repairDoneModel({ outcome: { targeted: ['a'], resolved: ['a'] }, regresije: null, changelog: [] });
    expect(m.novihProblema).toBeNull();
  });

  it('MUTACIJA: HTML tada NE SMIJE tvrditi da novih problema nema', () => {
    const m = repairDoneModel({ outcome: { targeted: ['a'], resolved: ['a'] }, regresije: null, changelog: [] });
    const html = repairDoneHtml(m, esc);
    expect(html).not.toContain('0 novih problema');
    expect(html).toContain('nije bilo moguće provjeriti');
  });

  it('uspjesna provjera bez regresija JEST nula, i tako se i pise', () => {
    const m = repairDoneModel({ outcome: { targeted: ['a'], resolved: ['a'] }, regresije: [], changelog: [] });
    expect(repairDoneHtml(m, esc)).toContain('0 novih problema');
  });

  it('regresije se broje i slazu s hrvatskom mnozinom', () => {
    const s = (n: number) => repairDoneHtml(
      repairDoneModel({ outcome: null, regresije: Array.from({ length: n }, () => ({})), changelog: [] }),
      esc,
    );
    expect(s(1)).toContain('1 nov problem');
    expect(s(2)).toContain('2 nova problema');
    expect(s(5)).toContain('5 novih problema');
    expect(s(11)).toContain('11 novih problema');
  });
});

describe('tablica prije/poslije', () => {
  it('redak nastaje iz changeloga, s oba stupca', () => {
    const html = repairDoneHtml(repairDoneModel({ outcome: null, regresije: [], changelog: CL(2) }), esc);
    expect(html).toContain('Times 0');
    expect(html).toContain('Arial 1');
  });

  it('promjena bez "poslije" ne dobiva redak, jer ne moze pokazati sto tvrdi', () => {
    const m = repairDoneModel({
      outcome: null, regresije: [],
      changelog: [{ ruleId: 'r', beforeLabel: 'Times', afterLabel: '' }],
    });
    expect(m.redci).toHaveLength(0);
    expect(repairDoneHtml(m, esc)).not.toContain('rd__tablica');
  });

  it('prazan "prije" pada natrag na ruleId, umjesto da stupac ostane prazan', () => {
    const m = repairDoneModel({
      outcome: null, regresije: [],
      changelog: [{ ruleId: 'font-family', beforeLabel: '', afterLabel: 'Arial' }],
    });
    expect(m.redci[0].prije).toBe('font-family');
  });

  it('oznake se ESKAPIRAJU, jer dolaze iz odgovora posluzitelja', () => {
    const html = repairDoneHtml(repairDoneModel({
      outcome: null, regresije: [],
      changelog: [{ ruleId: 'r', beforeLabel: '<img src=x>', afterLabel: 'Arial' }],
    }), esc);
    expect(html).not.toContain('<img');
  });
});

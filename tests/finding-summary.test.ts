import { describe, expect, it } from 'vitest';
import { findingSummary, findingSummaryHtml, summaryNaslov } from '../src/ui/results/finding-summary';
import type { VisualReadinessSignals, VisualScoreModel } from '../src/ui/results/visual-result-model';

/**
 * Sazetak nalaza je prvo sto korisnik procita na ekranu rezultata, pa su njegove tvrdnje
 * najizlozenije. Dvije su takve i obje se lako izgube pri sljedecoj izmjeni:
 *
 *   1. Razine su particija po OZBILJNOSTI i moraju se zbrojiti u naslov. `automatski` dolazi s
 *      DRUGE osi (popravljivost) i NE ulazi u taj zbroj.
 *   2. Rijec "blokira" je tvrdnja o fakultetovom pravilu. Bez verificiranog izvora se ne smije
 *      izgovoriti, sto `result-readiness.ts` vec cuva na svojoj strani.
 */
const SIG = (o: Partial<VisualReadinessSignals> = {}): VisualReadinessSignals => ({
  blockers: 0, warnings: 0, manualReviews: 0, automaticFixes: 0,
  informationalChecks: 0, totalChecks: 0, ...o,
});
const BODOVAN: VisualScoreModel = { kind: 'scored', value: 85, max: 100, scoredChecks: 26, authority: 'verified' };
const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;');

describe('sazetak nalaza', () => {
  it('razine su particija: zbroj im je jednak ukupnom', () => {
    const s = findingSummary(SIG({ blockers: 2, warnings: 4, manualReviews: 3 }), BODOVAN, true, true);
    expect(s.ukupno).toBe(9);
    expect(s.razine.reduce((a, r) => a + r.broj, 0)).toBe(s.ukupno);
  });

  it('automatski popravci NE ulaze u zbroj razina, jer su druga os', () => {
    // Namjerno vise automatskih nego ukupno nalaza po ozbiljnosti: da `automatski` ikad usao u
    // zbroj, ova bi kombinacija dala nemoguc ukupan broj.
    const s = findingSummary(SIG({ blockers: 1, warnings: 1, automaticFixes: 5 }), BODOVAN, true, true);
    expect(s.ukupno).toBe(2);
    expect(s.automatski).toBe(5);
    expect(s.razine.reduce((a, r) => a + r.broj, 0)).toBe(2);
  });

  it('bez verificiranog profila se rijec "blokira" NE izgovara', () => {
    const ne = findingSummary(SIG({ blockers: 2 }), BODOVAN, false, true);
    expect(ne.razine[0].tekst).not.toContain('blokira');
    expect(ne.razine[0].ton).toBe('provjera');
    const da = findingSummary(SIG({ blockers: 2 }), BODOVAN, true, true);
    expect(da.razine[0].tekst).toContain('blokira');
    expect(da.razine[0].ton).toBe('blok');
  });

  it('kad popravak nije dostupan, ne tvrdi se "0 automatski"', () => {
    // `null` i `0` su razlicite tvrdnje: `0` kaze da motor ne moze nista, `null` da ponude nema.
    expect(findingSummary(SIG({ blockers: 1 }), BODOVAN, true, false).automatski).toBeNull();
    expect(findingSummary(SIG({ blockers: 1 }), BODOVAN, true, true).automatski).toBe(0);
  });

  it('razina s nulom se ne crta, jer nula nije nalaz nego odsutnost nalaza', () => {
    const s = findingSummary(SIG({ warnings: 3 }), BODOVAN, true, true);
    expect(s.razine).toHaveLength(1);
    expect(s.razine[0].broj).toBe(3);
  });

  it('profil koji ne boduje nema ocjenu, umjesto da je izmisli', () => {
    const bez: VisualScoreModel = { kind: 'unscored', reason: 'profil ne boduje' } as VisualScoreModel;
    expect(findingSummary(SIG({ warnings: 1 }), bez, true, true).ocjena).toBeNull();
    expect(findingSummary(SIG({ warnings: 1 }), BODOVAN, true, true).ocjena).toEqual({ vrijednost: 85, od: 100 });
  });

  it('naslov postuje hrvatsku mnozinu, pa "1 stvari" ne izlazi', () => {
    expect(summaryNaslov(1)).toBe('1 stvar traži tvoju pažnju');
    expect(summaryNaslov(3)).toBe('3 stvari traže tvoju pažnju');
    expect(summaryNaslov(9)).toBe('9 stvari traži tvoju pažnju');
    expect(summaryNaslov(11)).toBe('11 stvari traži tvoju pažnju');
    expect(summaryNaslov(22)).toBe('22 stvari traže tvoju pažnju');
    expect(summaryNaslov(0)).toBe('Nema otvorenih nalaza');
  });

  it('prikaz razdvaja osi rijecju "od toga", inace se cita kao pribrojnik', () => {
    const html = findingSummaryHtml(findingSummary(SIG({ blockers: 1, automaticFixes: 3 }), BODOVAN, true, true), esc);
    expect(html).toContain('od toga');
    // Crta iznad tog retka nosi isto razdvajanje; klasa je ono na sto se CSS veze.
    expect(html).toContain('fsum-auto');
  });

  it('MUTACIJA: da automatski udu u zbroj, particija bi pukla', () => {
    const s = findingSummary(SIG({ blockers: 1, warnings: 1, automaticFixes: 5 }), BODOVAN, true, true);
    const krivo = s.ukupno + (s.automatski ?? 0);
    expect(krivo).not.toBe(s.razine.reduce((a, r) => a + r.broj, 0));
  });
});

describe('nebodovan profil', () => {
  it('kaze koliko je provjereno umjesto da samo suti o ocjeni', () => {
    /**
     * Halo je za nebodovan profil pisao "Provjereno 4 pravila". Prva izvedba sazetka je taj podatak
     * ispustila i pisala samo "ovaj profil ne daje ocjenu", pa je rezultat izgledao kao da provjera
     * nije ni napravljena. Jest, samo se ne boduje, i to je razlika koju korisnik mora vidjeti.
     */
    const bez = { kind: 'unscored', reason: 'profil ne boduje' } as unknown as VisualScoreModel;
    const s = findingSummary(SIG({ warnings: 2, totalChecks: 4 }), bez, true, true);
    expect(s.ocjena).toBeNull();
    expect(s.provjerenoPravila).toBe(4);
    expect(findingSummaryHtml(s, esc)).toContain('Provjereno 4 pravila');
  });
});

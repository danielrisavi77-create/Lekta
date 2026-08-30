/**
 * Gard nad manifestom dokaza: kada pokretanje nad stvarnim radom vrijedi kao DOKAZ (razina A), a
 * kada je samo run koji se nije srusio.
 *
 * Svaka rupa ima vlastitu kontrolu, i svaka kontrola ima BASELINE (uredan manifest mora biti cist).
 * Bez baselinea "prolazi" i gard koji vristi na sve, sto je ovaj repozitorij vec jednom izmjerio.
 */
import { describe, it, expect } from 'vitest';
import {
  countsAsRealDocxProof,
  manifestGaps,
  expectationPrecedesRun,
  compareExpectedToActual,
  type EvidenceManifest,
} from '../src/corpus/evidence-manifest';

/** Uredan manifest: ocekivanje zapisano PRIJE runa, potpisano, uz potpisan vizualni pregled. */
const UREDAN: EvidenceManifest = {
  expected: {
    findings: [{ checkId: 'page.margins', expectFail: true, because: 'lijeva margina je 2 cm, profil trazi 3' }],
    recordedAt: '2026-08-30T09:00:00.000Z',
    recordedBy: 'Daniel',
  },
  visualReview: {
    reviewedAt: '2026-08-30T11:00:00.000Z',
    reviewedBy: 'Daniel',
    verdict: 'slaze-se',
  },
  runs: ['2026-08-30T10:00:00.000Z'],
};

describe('manifest dokaza', () => {
  it('uredan manifest nema nijednu rupu i vrijedi kao dokaz', () => {
    expect(manifestGaps(UREDAN)).toEqual([]);
    expect(countsAsRealDocxProof(UREDAN)).toBe(true);
  });

  it('bez ocekivanja nije dokaz', () => {
    const m: EvidenceManifest = { ...UREDAN, expected: undefined };
    expect(manifestGaps(m)).toContain('nema-ocekivanja');
    expect(countsAsRealDocxProof(m)).toBe(false);
  });

  it('prazan popis ocekivanja se cita kao da ga nema', () => {
    const m: EvidenceManifest = { ...UREDAN, expected: { ...UREDAN.expected, findings: [] } };
    expect(manifestGaps(m)).toContain('nema-ocekivanja');
  });

  /**
   * SRZ CIJELOG MANIFESTA. Ocekivanje zapisano nakon runa nije predvidjanje nego prepricavanje
   * ishoda; takav zapis se ne moze ne sloziti s alatom, pa ne dokazuje nista.
   */
  it('ocekivanje zapisano NAKON runa nije dokaz', () => {
    const m: EvidenceManifest = {
      ...UREDAN,
      expected: { ...UREDAN.expected, recordedAt: '2026-08-30T12:00:00.000Z' },
    };
    expect(expectationPrecedesRun(m)).toBe(false);
    expect(manifestGaps(m)).toContain('ocekivanje-zapisano-nakon-runa');
    expect(countsAsRealDocxProof(m)).toBe(false);
  });

  it('isti trenutak zapisa i runa se odbija (usporedba je stroga)', () => {
    const m: EvidenceManifest = {
      ...UREDAN,
      expected: { ...UREDAN.expected, recordedAt: '2026-08-30T10:00:00.000Z' },
    };
    expect(expectationPrecedesRun(m)).toBe(false);
  });

  it('ocekivanje bez runa je valjano, samo jos neiskusano', () => {
    const m: EvidenceManifest = { ...UREDAN, runs: [] };
    expect(expectationPrecedesRun(m)).toBe(true);
    expect(manifestGaps(m)).toEqual([]);
  });

  /**
   * Rupe koje je nasao neovisni verifikator, obje iz istog razreda: usporedba je bila stroga na
   * NIZU, ne na TRENUTKU.
   */
  it('sam datum bez sata nije dokaz da je ocekivanje prethodilo runu', () => {
    const m: EvidenceManifest = { ...UREDAN, expected: { ...UREDAN.expected, recordedAt: '2026-08-30' } };
    expect(expectationPrecedesRun(m), 'ponoc UTC bi propustila svaki run istoga dana').toBe(false);
  });

  it('redoslijed runova se cita po VREMENU, ne leksikografski', () => {
    // Leksikografski je "2026-08-31T01:00:00Z" ispred "2026-08-30T23:00:00.000-05:00",
    // a kronoloski je obrnuto: -05:00 run je 2026-08-31T04:00Z, dakle KASNIJI.
    const m: EvidenceManifest = {
      ...UREDAN,
      expected: { ...UREDAN.expected, recordedAt: '2026-08-31T02:00:00.000Z' },
      runs: ['2026-08-30T23:00:00.000-05:00', '2026-08-31T01:00:00Z'],
    };
    expect(expectationPrecedesRun(m), 'zapis je NAKON prvog stvarnog runa').toBe(false);
  });

  it('neispravan datum runa se odbija, ne preskace', () => {
    const m: EvidenceManifest = { ...UREDAN, runs: ['nije-datum'] };
    expect(expectationPrecedesRun(m)).toBe(false);
  });

  it('ocekivanje bez potpisa nije dokaz', () => {
    const m: EvidenceManifest = { ...UREDAN, expected: { ...UREDAN.expected, recordedBy: '  ' } };
    expect(manifestGaps(m)).toContain('ocekivanje-bez-potpisa');
  });

  it('bez vizualnog pregleda nije dokaz', () => {
    const m: EvidenceManifest = { ...UREDAN, visualReview: undefined };
    expect(manifestGaps(m)).toContain('nema-vizualnog-pregleda');
    expect(countsAsRealDocxProof(m)).toBe(false);
  });

  it('pregled bez potpisa nije dokaz', () => {
    const m: EvidenceManifest = { ...UREDAN, visualReview: { ...UREDAN.visualReview, reviewedBy: '' } };
    expect(manifestGaps(m)).toContain('pregled-bez-potpisa');
  });

  it('neobjasnjeno odstupanje NIKAD nije dokaz', () => {
    const m: EvidenceManifest = {
      ...UREDAN,
      visualReview: { ...UREDAN.visualReview, verdict: 'odstupa-neobjasnjeno' },
    };
    expect(manifestGaps(m)).toContain('pregled-odstupa-neobjasnjeno');
    expect(countsAsRealDocxProof(m)).toBe(false);
  });

  it('objasnjeno odstupanje JEST dokaz: razlika je poznata, ne skrivena', () => {
    const m: EvidenceManifest = {
      ...UREDAN,
      visualReview: { ...UREDAN.visualReview, verdict: 'odstupa-objasnjeno', note: 'alat broji naslovnicu' },
    };
    expect(manifestGaps(m)).toEqual([]);
    expect(countsAsRealDocxProof(m)).toBe(true);
  });
});

describe('usporedba ocekivanja i ishoda', () => {
  const expected = [
    { checkId: 'page.margins', expectFail: true },
    { checkId: 'format.font.dominant', expectFail: false },
  ];

  it('slaganje i neslaganje se imenuju, ne broje', () => {
    const r = compareExpectedToActual(expected, [
      { id: 'page.margins', status: 'fail' },
      { id: 'format.font.dominant', status: 'fail' },
    ]);
    expect(r.agreed).toEqual(['page.margins']);
    expect(r.disagreed).toEqual([
      { checkId: 'format.font.dominant', expectFail: false, actualStatus: 'fail' },
    ]);
  });

  /** Provjera koju alat NIJE emitirao je neslaganje, ne tiho slaganje. */
  it('provjera koje u ishodu nema broji se kao neslaganje', () => {
    const r = compareExpectedToActual(expected, [{ id: 'page.margins', status: 'fail' }]);
    expect(r.disagreed).toEqual([
      { checkId: 'format.font.dominant', expectFail: false, actualStatus: null },
    ]);
  });

  /** Ocekivanje je popis onoga na sto se pazi, ne potpun opis dokumenta. */
  it('provjere koje covjek nije ocekivao ne prijavljuju se kao razlika', () => {
    const r = compareExpectedToActual([{ checkId: 'page.margins', expectFail: true }], [
      { id: 'page.margins', status: 'fail' },
      { id: 'toc.present', status: 'fail' },
    ]);
    expect(r.agreed).toEqual(['page.margins']);
    expect(r.disagreed).toEqual([]);
  });
});

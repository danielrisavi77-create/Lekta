/**
 * Gard za uparivanje sastavnica iz Upisnika s nasim jedinicama (P1-6 u
 * docs/PLAN_POTPUNA_POKRIVENOST.md).
 *
 * Uparivanje je PRIJEDLOG za covjeka, ali prijedlog koji tiho grijesi gori je od nikakvog: covjek
 * potvrdjuje na brzinu ono sto izgleda uvjerljivo. Zato test cuva bas ona mjesta gdje je matcher
 * mjerenjem pokazao da grijesi, a ne sretne slucajeve.
 */
import { describe, it, expect } from 'vitest';
import {
  matchExecutor,
  buildMatchReport,
  splitExecutors,
  normalizeName,
  type CatalogUnitInput,
} from '../src/programs/unit-match';

const UNITS: CatalogUnitInput[] = [
  { unitId: 'riteh', unitName: 'Tehnički fakultet', institutionName: 'Sveučilište u Rijeci' },
  { unitId: 'efri', unitName: 'Ekonomski fakultet', institutionName: 'Sveučilište u Rijeci' },
  { unitId: 'efzg', unitName: 'Ekonomski fakultet', institutionName: 'Sveučilište u Zagrebu' },
  { unitId: 'biolos', unitName: 'Odjel za biologiju', institutionName: 'Sveučilište Josipa Jurja Strossmayera u Osijeku' },
  { unitId: 'fizos', unitName: 'Odjel za fiziku', institutionName: 'Sveučilište Josipa Jurja Strossmayera u Osijeku' },
  { unitId: 'effectus', unitName: 'EFFECTUS veleučilište', institutionName: 'EFFECTUS veleučilište' },
  { unitId: 'ozs', unitName: 'Fakultet zdravstvenih znanosti (Split)', institutionName: 'Sveučilište u Splitu' },
];

describe('normalizacija i rastavljanje', () => {
  it('hrvatsku dijakritiku svodi na ASCII, bez interpunkcije', () => {
    expect(normalizeName('Sveučilište u Rijeci, Tehnički fakultet')).toBe('sveuciliste u rijeci tehnicki fakultet');
    expect(normalizeName('Đakovo-Šibenik')).toBe('dakovo sibenik');
  });

  /** `$` razdvaja vise izvoditelja kod zdruzenih programa; 44 od 1312 programa ih ima vise. */
  it('rastavlja zdruzene izvoditelje po znaku $', () => {
    expect(splitExecutors('Sveučilište u Zadru$Universitat de Girona')).toEqual([
      'Sveučilište u Zadru',
      'Universitat de Girona',
    ]);
    expect(splitExecutors('Jedan izvoditelj')).toEqual(['Jedan izvoditelj']);
  });
});

describe('matcher: sto smije tvrditi', () => {
  it('exact trazi da se poklope I sastavnica I ustanova', () => {
    const { match } = matchExecutor('Sveučilište u Rijeci, Tehnički fakultet', UNITS);
    expect(match).toEqual({
      unitId: 'riteh',
      confidence: 'exact',
      reason: 'poklapaju se i sastavnica i ustanova',
    });
  });

  /**
   * "Ekonomski fakultet" postoji na vise sveucilista. Da se gledao samo naziv sastavnice, dva bi
   * se sveucilista tiho spojila; zato ustanova mora presuditi.
   */
  it('isti naziv sastavnice na dva sveucilista ne spaja krive ustanove', () => {
    expect(matchExecutor('Sveučilište u Zagrebu, Ekonomski fakultet', UNITS).match?.unitId).toBe('efzg');
    expect(matchExecutor('Sveučilište u Rijeci, Ekonomski fakultet', UNITS).match?.unitId).toBe('efri');
  });

  /**
   * IZMJERENA GRESKA (2026-08-19): goli naziv sveucilista je preklapanjem rijeci zavrsavao na
   * proizvoljnom odjelu ("Sveuciliste Josipa Jurja Strossmayera u Osijeku" -> `biolos`, 0.80).
   * Program koji izvodi cijelo sveuciliste ne pripada jednom odjelu i mora ostati NEUPAREN.
   */
  it('goli naziv ustanove s vise jedinica ostaje neuparen, uz alternative', () => {
    const result = matchExecutor('Sveučilište Josipa Jurja Strossmayera u Osijeku', UNITS);
    expect(result.match).toBeNull();
    expect(result.alternatives).toContain('biolos');
    expect(result.alternatives).toContain('fizos');
  });

  it('samostalna ustanova s jednom jedinicom istog naziva jest exact', () => {
    const { match } = matchExecutor('EFFECTUS veleučilište', UNITS);
    expect(match?.unitId).toBe('effectus');
    expect(match?.confidence).toBe('exact');
  });

  /** Upisnik koristi i crticu kao granicu: "Sveuciliste u Splitu - Sveucilisni odjel ...". */
  it('crtica s razmacima je granica segmenta, kao i zarez', () => {
    const { match } = matchExecutor('Sveučilište u Splitu - Fakultet zdravstvenih znanosti (Split)', UNITS);
    expect(match?.unitId).toBe('ozs');
    expect(match?.confidence).toBe('exact');
  });

  it('strana ustanova nema para i to se ne krpa preklapanjem rijeci', () => {
    expect(matchExecutor('Breda University of Applied Sciences', UNITS).match).toBeNull();
  });
});

describe('izvjestaj o uparivanju', () => {
  const rows = [
    { izvoditelj: 'Sveučilište u Rijeci, Tehnički fakultet' },
    { izvoditelj: 'Sveučilište u Rijeci, Tehnički fakultet' },
    { izvoditelj: 'Sveučilište u Zadru$Universitat de Girona' },
  ];
  const report = buildMatchReport(rows, UNITS);

  it('broji programe po izvoditelju, sto daje prioritet ljudskom pregledu', () => {
    const riteh = report.proposals.find((p) => p.executor.includes('Tehnički'));
    expect(riteh?.programCount).toBe(2);
  });

  it('imenuje nase jedinice kojima nijedan izvoditelj ne odgovara', () => {
    expect(report.unitsWithoutExecutor).toContain('efzg');
    expect(report.summary.unitsWithoutExecutor).toBe(report.unitsWithoutExecutor.length);
  });

  it('program ciji nijedan izvoditelj nije uparen broji se kao nasa slijepa tocka', () => {
    // Zadar + Girona: nijedan nije u UNITS, pa je taj program bez jedinice.
    expect(report.summary.programsWithoutUnit).toBe(1);
  });

  it('zbroj po pouzdanosti pokriva sve prijedloge', () => {
    const c = report.summary.byConfidence;
    expect(c.exact + c.strong + c.weak + c.none).toBe(report.summary.executorCount);
  });
});

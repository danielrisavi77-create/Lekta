/**
 * Ustanova s naslovnice iz kataloga (src/corpus/detect-unit.ts).
 *
 * Izmjereno 2026-09-05 nad 391 docx (vlasnikov Downloads + izbaceni): rucni popis od 25 zagrebackih imena promasio je
 * 28 od 32 radova s ustanova koje korpus nema (HKS, Zdravstveno veleuciliste, Libertas, Hrvatski studiji, GRF).
 * Katalog pokriva svih 131 jedinicu registra. Genericka imena (Ekonomski, Filozofski, Pravni, Medicinski fakultet)
 * postoje u vise gradova: razrjesava ih ime sveucilista, a bez njega ostaje zatecena pretpostavka Zagreba, izricito.
 */
import { describe, expect, it } from 'vitest';
import { detectUnitFromCatalog, normalizeForMatch } from '../src/corpus/detect-unit';
import { detectUnit } from '../src/corpus/detect-profile';

describe('detectUnitFromCatalog', () => {
  it('ustanove koje rucni popis nije znao: HKS, Zdravstveno veleuciliste, Libertas', () => {
    expect(detectUnitFromCatalog('HRVATSKO KATOLIČKO SVEUČILIŠTE Odjel za sociologiju')?.unitId).toBe('hks');
    expect(detectUnitFromCatalog('Zdravstveno veleučilište Zagreb Studij fizioterapije')?.unitId).toBe('zvu');
    expect(detectUnitFromCatalog('Sveučilište Libertas, Zagreb')?.unitId).toBe('libertas');
  });

  it('genericko ime + sveuciliste = jedinica TOG sveucilista', () => {
    expect(detectUnitFromCatalog('SVEUČILIŠTE U RIJECI EKONOMSKI FAKULTET')).toMatchObject({ unitId: 'efri', resolvedBy: 'university' });
    expect(detectUnitFromCatalog('Sveučilište u Splitu Pravni fakultet')).toMatchObject({ unitId: 'pravst' });
    expect(detectUnitFromCatalog('Sveučilište Josipa Jurja Strossmayera u Osijeku Filozofski fakultet')).toMatchObject({ unitId: 'ffos' });
    expect(detectUnitFromCatalog('Sveučilište u Zagrebu Filozofski fakultet')).toMatchObject({ unitId: 'ffzg', resolvedBy: 'university' });
  });

  it('ime s gradom u sufiksu pogadja i kad grad stoji, i kad ne stoji', () => {
    expect(detectUnitFromCatalog('Ekonomski fakultet u Rijeci')?.unitId).toBe('efri');
    expect(detectUnitFromCatalog('Filozofski fakultet u Rijeci')?.unitId).toBe('ffri');
  });

  it('genericko ime BEZ sveucilista pada na Zagreb, izricito (zatecena pretpostavka rucnog popisa)', () => {
    expect(detectUnitFromCatalog('Ekonomski fakultet')).toEqual({ unitId: 'efzg', institutionId: 'unizg', resolvedBy: 'zagreb-default' });
    expect(detectUnitFromCatalog('Pravni fakultet')).toMatchObject({ unitId: 'pravo', resolvedBy: 'zagreb-default' });
  });

  it('jedinstveno ime se prepoznaje bez sveucilista', () => {
    expect(detectUnitFromCatalog('Fakultet političkih znanosti')).toMatchObject({ unitId: 'fpzg', resolvedBy: 'unique' });
    expect(detectUnitFromCatalog('FAKULTET ELEKTROTEHNIKE I RAČUNARSTVA')?.unitId).toBe('fer');
  });

  it('NAJRANIJE ime na naslovnici pobjedjuje, ne najdulje: druga ustanova spomenuta kasnije nije maticna', () => {
    // Izmjereno 2026-09-05: FPZG rad koji na poziciji 748 spominje FKIT (mentor s drugog fakulteta) bio je pripisan FKIT-u.
    const front = 'Sveučilište u Zagrebu Fakultet političkih znanosti Diplomski rad Naslov Mentor: prof. s Fakulteta kemijskog inženjerstva i tehnologije';
    expect(detectUnitFromCatalog(front)?.unitId).toBe('fpzg');
    expect(detectUnitFromCatalog('Fakultet kemijskog inženjerstva i tehnologije, u suradnji s Fakultetom političkih znanosti')?.unitId).toBe('fkit');
  });

  it('bez ijednog imena iz kataloga vraca null, ne pogadja', () => {
    expect(detectUnitFromCatalog('Naslov rada. Ime Prezime. Zagreb, 2025.')).toBeNull();
    expect(detectUnitFromCatalog('')).toBeNull();
    // Sama rijec "sveuciliste" nije ustanova.
    expect(detectUnitFromCatalog('Sveučilište')).toBeNull();
  });

  it('normalizacija: dijakritika, velika slova i razmaci ne odlucuju', () => {
    expect(normalizeForMatch('  SVEUČILIŠTE   u  ŽUPANJI ')).toBe('sveuciliste u zupanji');
  });
});

describe('detectUnit (detect-profile) koristi katalog, s rucnim popisom kao rezervom', () => {
  it('nove ustanove prolaze kroz detectUnit', () => {
    expect(detectUnit('Hrvatsko katoličko sveučilište')).toBe('hks');
    expect(detectUnit('Sveučilište u Rijeci Ekonomski fakultet')).toBe('efri');
  });

  it('zatecene zagrebacke ustanove daju isti id kao prije', () => {
    expect(detectUnit('Sveučilište u Zagrebu Fakultet političkih znanosti')).toBe('fpzg');
    expect(detectUnit('Ekonomski fakultet')).toBe('efzg');
    expect(detectUnit('Fakultet kemijskog inženjerstva i tehnologije')).toBe('fkit');
    expect(detectUnit('Fakultet hrvatskih studija')).toBe('fhs');
  });
});

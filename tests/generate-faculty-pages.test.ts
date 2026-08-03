/**
 * scripts/generate-faculty-pages.mjs zavrsava s ESM entry-guardom (main() se izvrsava SAMO kad
 * je skripta pokrenuta kao CLI, ne pri importu), sto ovom testu dopusta da uveze imenovane ciste
 * funkcije bez sporednog efekta pisanja u dist/. normalizeSearch/matchesQuery pokrivaju pretragu
 * na /fakulteti master indeksu (Korak 3); klijentska FAKULTETI_SEARCH_JS skripta je namjeran
 * string-duplikat iste logike (nema bundlera za tu staticku stranicu) - ovaj test je jedini
 * dokaz da je logika ispravna prije nego se rucno duplicira u JS stringu.
 *
 * GOTCHA: ovaj .mjs fajl MORA imati LF (ne CRLF) line-endinge da bi ga vitest uopce mogao
 * uvesti - CRLF u .mjs/.js modulima (za razliku od .ts, koje esbuild uvijek normalizira na LF
 * kroz TS-strip transform) tjera Viteov import-analysis na "Invalid or unexpected token" na
 * IMPORTIRAJUCOJ strani, ne na samom fajlu (zbunjujuca poruka). Ako ovaj test pocne opet
 * padati nakon uredjivanja generatora, prvo provjeri git diff za CRLF prije bilo cega drugog.
 */
import { describe, it, expect } from 'vitest';
import {
  normalizeSearch,
  matchesQuery,
  formattingCoverage,
  citationCoverage,
  titlePageCoverage,
} from '../scripts/generate-faculty-pages.mjs';

describe('normalizeSearch', () => {
  it('lowercases i strippa dijakritiku', () => {
    expect(normalizeSearch('Fakultet Političkih Znanosti')).toBe('fakultet politickih znanosti');
  });

  it('mapira đ na d (NFD normalizacija ga ne hvata sama)', () => {
    expect(normalizeSearch('Đurđevac')).toBe('durdevac');
  });

  it('prazan/nullish ulaz vraca prazan string', () => {
    expect(normalizeSearch('')).toBe('');
    expect(normalizeSearch(undefined)).toBe('');
    expect(normalizeSearch(null)).toBe('');
  });
});

describe('matchesQuery', () => {
  const haystack = normalizeSearch('Sveučilište u Zagrebu Fakultet političkih znanosti');

  it('podudara se neosjetljivo na dijakritiku i velika/mala slova', () => {
    expect(matchesQuery('politickih', haystack)).toBe(true);
    expect(matchesQuery('POLITIČKIH', haystack)).toBe(true);
  });

  it('visetokenski upit trazi SVE tokene (AND), ne bilo koji (OR)', () => {
    expect(matchesQuery('fpzg zagreb', haystack)).toBe(false);
    expect(matchesQuery('zagreb politickih', haystack)).toBe(true);
  });

  it('prazan upit se podudara sa svime', () => {
    expect(matchesQuery('', haystack)).toBe(true);
    expect(matchesQuery('   ', haystack)).toBe(true);
  });

  it('ne podudara se kad token nije prisutan', () => {
    expect(matchesQuery('pravni', haystack)).toBe(false);
  });
});

describe('formattingCoverage (Coverage Card: Oblikovanje)', () => {
  it('nema format-redaka -> none', () => {
    expect(formattingCoverage([{ label: 'Citatni stil' }], 'verified')).toBe('none');
    expect(formattingCoverage([], 'verified')).toBe('none');
  });

  it('ima format-redak i status verified -> full', () => {
    expect(formattingCoverage([{ label: 'Font' }], 'verified')).toBe('full');
  });

  it('ima format-redak ali status nije verified -> partial (npr. seminarski checkFont:true uz status partial)', () => {
    expect(formattingCoverage([{ label: 'Font' }, { label: 'Prored' }], 'partial')).toBe('partial');
  });

  it('ne broji "Citatni stil" kao oblikovanje (izbjegava dvostruko brojanje s Citiranje dimenzijom)', () => {
    expect(formattingCoverage([{ label: 'Citatni stil' }, { label: 'Opseg (riječi)' }], 'verified')).toBe('none');
  });
});

describe('citationCoverage (Coverage Card: Citiranje)', () => {
  const citationIndex = [{ facultyId: 'fpzg', styleToken: 'fpzg' }];

  it('unitId ima verificiran spec -> full', () => {
    expect(citationCoverage('fpzg', [], citationIndex)).toBe('full');
  });

  it('nema spec ali factRows ima "Citatni stil" (obiteljski stil bez vlastitog speca) -> partial', () => {
    expect(citationCoverage('nepoznat', [{ label: 'Citatni stil' }], citationIndex)).toBe('partial');
  });

  it('nema ni spec ni "Citatni stil" redak -> none', () => {
    expect(citationCoverage('nepoznat', [{ label: 'Font' }], citationIndex)).toBe('none');
  });
});

describe('titlePageCoverage (Coverage Card: Naslovnica)', () => {
  it('nema nijedan predlozak za unitId -> none', () => {
    expect(titlePageCoverage('nepoznat', 'graduate', [{ unitId: 'fpzg', level: 'graduate' }])).toBe('none');
  });

  it('predlozak za TOCNU vrstu rada -> full', () => {
    expect(titlePageCoverage('fpzg', 'graduate', [{ unitId: 'fpzg', level: 'graduate' }])).toBe('full');
  });

  it('predlozak s level=null (genericki fakultetski, ne vezan uz vrstu rada) -> full, ne partial', () => {
    expect(titlePageCoverage('fpzg', 'seminar', [{ unitId: 'fpzg', level: null }])).toBe('full');
  });

  it('predlozak postoji ali SAMO za drugu vrstu rada -> partial (levelReused slucaj)', () => {
    expect(titlePageCoverage('fpzg', 'seminar', [{ unitId: 'fpzg', level: 'graduate' }])).toBe('partial');
  });
});

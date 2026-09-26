import { describe, expect, it } from 'vitest';
import {
  buildHandoffQuery,
  HANDOFF_EXACT_KEYS,
  HANDOFF_UTM_MAX_KEYS,
  HANDOFF_VALUE_MAX_LENGTH,
} from '../src/routes/intake/handoff-query';
import { handoffQueryProblems } from './helpers/handoff-query-contract';

/**
 * Prijenos konteksta s ulaza `/` na `/rad/`. SEO stranice fakulteta vode na `/?unit=...`, pa je
 * ovo jedino mjesto koje odlucuje sto od tog linka prezivi navigaciju.
 */
describe('buildHandoffQuery', () => {
  it('stvarna izvedba postuje cijeli ugovor bijele liste', () => {
    expect(handoffQueryProblems(buildHandoffQuery)).toEqual([]);
  });

  it('prenosi tocno bijelu listu i odbacuje sve ostalo', () => {
    const out = buildHandoffQuery('?unit=ffzg&work=diplomski&project=p-1&utm_source=faculty_page&ref=x&redirect=/admin');
    const params = new URLSearchParams(out.slice(1));
    expect([...params.keys()].sort()).toEqual(['project', 'unit', 'utm_source', 'work']);
    expect(params.get('unit')).toBe('ffzg');
    expect(params.get('work')).toBe('diplomski');
    expect(params.get('project')).toBe('p-1');
    expect(params.get('utm_source')).toBe('faculty_page');
  });

  it('vrijednost se ne mijenja osim URL enkodiranja', () => {
    // Znakovi koji bi inace probili query u fragment ili u nov par moraju biti enkodirani, a
    // dekodirana vrijednost mora ostati doslovno ista.
    const value = 'a b&c#d=e/f?g';
    const out = buildHandoffQuery(`?unit=${encodeURIComponent(value)}`);
    expect(out).not.toContain('#');
    expect(new URLSearchParams(out.slice(1)).get('unit')).toBe(value);
  });

  it('prvi pojavak kljuca pobjeduje, ponovljeni se odbacuje', () => {
    const out = buildHandoffQuery('?unit=ffzg&unit=fer');
    expect(out).toBe('?unit=ffzg');
  });

  it('prazna vrijednost ne putuje', () => {
    expect(buildHandoffQuery('?unit=&utm_source=')).toBe('');
    expect(buildHandoffQuery('?unit=%20%20')).toBe('');
  });

  it('granica broja utm kljuceva je postovana, a ostali kljucevi je ne trose', () => {
    const utm = Array.from({ length: HANDOFF_UTM_MAX_KEYS + 3 }, (_, i) => `utm_k${i}=v${i}`).join('&');
    const params = new URLSearchParams(buildHandoffQuery(`?unit=ffzg&${utm}`).slice(1));
    expect([...params.keys()].filter((k) => k.startsWith('utm_'))).toHaveLength(HANDOFF_UTM_MAX_KEYS);
    expect(params.get('unit')).toBe('ffzg');
  });

  it('granica duljine odbacuje par umjesto da ga krati', () => {
    const tooLong = 'x'.repeat(HANDOFF_VALUE_MAX_LENGTH + 1);
    expect(buildHandoffQuery(`?utm_campaign=${tooLong}&unit=ffzg`)).toBe('?unit=ffzg');
  });

  it('prima i URLSearchParams i niz sa znakom ? i bez njega', () => {
    expect(buildHandoffQuery('unit=ffzg')).toBe('?unit=ffzg');
    expect(buildHandoffQuery(new URLSearchParams('unit=ffzg'))).toBe('?unit=ffzg');
  });

  it('bijela lista imenuje tocno one kljuceve koje odrediste cita', () => {
    // `src/ui/selection-entry.ts` (`urlSelection`) cita `unit`, `work` i `project`. Kad bi se
    // popisi razisli, prijenos bi nosio kljuc koji nitko ne cita ili gubio onaj koji se cita.
    expect([...HANDOFF_EXACT_KEYS]).toEqual(['unit', 'work', 'project']);
  });
});

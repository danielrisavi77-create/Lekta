import { describe, it, expect, beforeEach } from 'vitest';

import {
  titleSimilarity,
  normalizeDoi,
  looksCroatian,
  scoreCandidate,
  verdictFromCandidates,
  crossrefWorksUrl,
  crossrefQueryUrl,
  verifyReference,
  verifyReferences,
  _clearExistenceCache,
} from '../src/citations/verify-existence';
import type { CitationInput } from '../src/tools/citation';

// Fake fetch: mapira URL -> {ok,status,json}. Bez ikakve prave mreze.
function fakeFetch(routes: Array<{ match: RegExp; ok?: boolean; status?: number; body?: any; throws?: boolean }>) {
  return async (url: string) => {
    const r = routes.find((x) => x.match.test(url));
    if (!r) return { ok: false, status: 500, json: async () => ({}) };
    if (r.throws) throw new Error('network');
    return { ok: r.ok ?? true, status: r.status ?? 200, json: async () => r.body ?? {} };
  };
}

const cr = (title: string, year?: number, doi = '10.1/x') => ({
  title: [title],
  issued: year ? { 'date-parts': [[year]] } : undefined,
  DOI: doi,
});

describe('normalizeDoi', () => {
  it('skida prefikse i zavrsnu interpunkciju', () => {
    expect(normalizeDoi('https://doi.org/10.1234/abc')).toBe('10.1234/abc');
    expect(normalizeDoi('doi: 10.1234/abc.')).toBe('10.1234/abc');
    expect(normalizeDoi(undefined)).toBe('');
  });
});

describe('titleSimilarity', () => {
  it('identican naslov -> 1, potpuno razlicit -> nizak', () => {
    expect(titleSimilarity('Analiza podataka', 'Analiza podataka')).toBe(1);
    expect(titleSimilarity('Analiza podataka', 'Kvantna mehanika fotona')).toBeLessThan(0.4);
  });
  it('dijakritika i interpunkcija ne mijenjaju rezultat (normalize)', () => {
    expect(titleSimilarity('Ustavno pravo', 'ustavno pravo!')).toBe(1);
  });
  it('mala razlika -> visoka slicnost', () => {
    expect(titleSimilarity('Analiza podataka', 'Analiza podatka')).toBeGreaterThan(0.85);
  });
  it('prazno -> 0', () => {
    expect(titleSimilarity('', 'x')).toBe(0);
    expect(titleSimilarity(undefined, undefined)).toBe(0);
  });
});

describe('looksCroatian', () => {
  it('hvata domace tragove (grad/tip rada/casopis)', () => {
    expect(looksCroatian({ place: 'Zagreb' })).toBe(true);
    expect(looksCroatian({ title: 'Neki završni rad o X' })).toBe(true);
    expect(looksCroatian({ container: 'Zbornik radova' })).toBe(true);
  });
  it('strani izvor -> false', () => {
    expect(looksCroatian({ title: 'Deep learning', container: 'Nature', place: 'London' })).toBe(false);
  });
});

describe('scoreCandidate / verdictFromCandidates', () => {
  const inp: Partial<CitationInput> = { title: 'Analiza podataka', year: '2019' };
  it('godina +-1 daje bonus', () => {
    expect(scoreCandidate(inp, cr('Analiza podataka', 2019))).toBeGreaterThanOrEqual(scoreCandidate(inp, cr('Analiza podataka', 1990)));
  });
  it('visok pogodak -> found', () => {
    expect(verdictFromCandidates(inp, [cr('Analiza podataka', 2019)]).verdict).toBe('found');
  });
  it('slab pogodak -> weak', () => {
    const v = verdictFromCandidates({ title: 'Analiza podataka o hrvatskim rijekama' }, [cr('Analiza podataka o njemackim planinama')]);
    expect(v.verdict).toBe('weak');
  });
  it('nema pogotka -> not-found', () => {
    expect(verdictFromCandidates(inp, [cr('Potpuno druga tema bez veze')]).verdict).toBe('not-found');
    expect(verdictFromCandidates(inp, []).verdict).toBe('not-found');
  });
});

describe('URL gradnja (ne salje tijelo rada)', () => {
  it('works/<doi>', () => {
    expect(crossrefWorksUrl('10.1234/abc')).toBe('https://api.crossref.org/works/10.1234%2Fabc');
  });
  it('bibliografski upit sadrzi naslov+autora+godinu, ne tijelo', () => {
    const url = crossrefQueryUrl({ title: 'Analiza podataka', authors: 'Horvat, Ana', year: '2019' }, 'x@y.hr');
    expect(url).toContain('query.bibliographic=');
    // URLSearchParams kodira razmak kao '+'; vrati ga u razmak za citljivu provjeru.
    const readable = decodeURIComponent(url).replace(/\+/g, ' ');
    expect(readable).toContain('Analiza podataka');
    expect(readable).toContain('Horvat');
    expect(url).toContain('mailto=x%40y.hr');
  });
});

describe('verifyReference (injektiran fetch)', () => {
  beforeEach(() => _clearExistenceCache());

  it('DOI razrijesen (200) -> found', async () => {
    const r = await verifyReference({ doi: '10.1234/abc', title: 'X' }, { fetchImpl: fakeFetch([{ match: /works\/10/, ok: true, status: 200 }]) as any });
    expect(r.verdict).toBe('found');
    expect(r.doiResolved).toBe(true);
  });

  it('DOI 404 -> not-found (izmisljen DOI)', async () => {
    const r = await verifyReference({ doi: '10.9999/fake' }, { fetchImpl: fakeFetch([{ match: /works\/10/, ok: false, status: 404 }]) as any });
    expect(r.verdict).toBe('not-found');
  });

  it('bibliografski visok pogodak -> found', async () => {
    const body = { message: { items: [cr('Analiza podataka', 2019)] } };
    const r = await verifyReference({ title: 'Analiza podataka', year: '2019' }, { fetchImpl: fakeFetch([{ match: /works\?/, body }]) as any });
    expect(r.verdict).toBe('found');
  });

  it('strani izvor bez pogotka -> not-found', async () => {
    const body = { message: { items: [cr('Nepovezana tema')] } };
    const r = await verifyReference({ title: 'Deep learning for vision', container: 'Nature' }, { fetchImpl: fakeFetch([{ match: /works\?/, body }]) as any });
    expect(r.verdict).toBe('not-found');
  });

  it('domaci izvor bez pogotka -> not-indexed (ne not-found)', async () => {
    const body = { message: { items: [] } };
    const r = await verifyReference({ title: 'Regionalni razvoj Slavonije', place: 'Osijek' }, { fetchImpl: fakeFetch([{ match: /works\?/, body }]) as any });
    expect(r.verdict).toBe('not-indexed');
  });

  it('mrezna greska -> unchecked', async () => {
    const r = await verifyReference({ title: 'Bilo sto' }, { fetchImpl: fakeFetch([{ match: /works\?/, throws: true }]) as any });
    expect(r.verdict).toBe('unchecked');
  });

  it('nema ni DOI ni naslov -> unchecked', async () => {
    const r = await verifyReference({ authors: 'Horvat, A.' }, { fetchImpl: fakeFetch([]) as any });
    expect(r.verdict).toBe('unchecked');
  });
});

describe('verifyReferences (batch, cache, deadline)', () => {
  beforeEach(() => _clearExistenceCache());

  it('provjeri niz i javlja napredak', async () => {
    const body = { message: { items: [cr('Analiza podataka', 2019)] } };
    const seen: number[] = [];
    const out = await verifyReferences(
      [{ title: 'Analiza podataka', year: '2019' }, { doi: '10.1/x' }],
      { fetchImpl: fakeFetch([{ match: /works\?/, body }, { match: /works\/10/, ok: true, status: 200 }]) as any, delayMs: 0, onProgress: (d) => seen.push(d) },
    );
    expect(out.map((r) => r.verdict)).toEqual(['found', 'found']);
    expect(seen).toEqual([1, 2]);
  });

  it('cache: ista referenca se ne pita dvaput', async () => {
    let calls = 0;
    const fetchImpl = (async (url: string) => { calls++; return { ok: true, status: 200, json: async () => ({ message: { items: [cr('Analiza podataka', 2019)] } }) }; }) as any;
    const list = [{ title: 'Analiza podataka', year: '2019' }, { title: 'Analiza podataka', year: '2019' }];
    const out = await verifyReferences(list, { fetchImpl, delayMs: 0 });
    expect(out.map((r) => r.verdict)).toEqual(['found', 'found']);
    expect(calls).toBe(1); // druga je iz cachea
  });

  it('istekao rok -> preostale unchecked', async () => {
    const out = await verifyReferences(
      [{ title: 'A' }, { title: 'B' }],
      { fetchImpl: fakeFetch([]) as any, delayMs: 0, deadlineMs: -1 },
    );
    expect(out.every((r) => r.verdict === 'unchecked')).toBe(true);
  });
});

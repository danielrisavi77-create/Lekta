// @vitest-environment node
/**
 * T98 korak 1 (issue #219): golden ZATECENOG ponasanja provjere postojanja nad stvarnim Crossref
 * snimkama iz `tests/fixtures/crossref/` (#292). Biljezi verdikte prije oznake povucenog rada; isti
 * verdikti moraju ostati i poslije, jer povlacenje ne mijenja verdikt postojanja.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { _clearExistenceCache, verifyReference } from '../src/citations/verify-existence';

type Snimka = { capture: { url: string; status: number }; response: unknown };
const snimka = (ime: string): Snimka =>
  JSON.parse(readFileSync(resolve('tests/fixtures/crossref', ime), 'utf8').replace(/\r\n/g, '\n')) as Snimka;

/** fetch koji vraca snimku za tocno njezin URL; sve ostalo je greska testa. */
function fetchIz(s: Snimka) {
  return async (url: string) => {
    if (url.split('?')[0] !== s.capture.url.split('?')[0]) throw new Error(`neocekivan URL ${url}`);
    return {
      ok: s.capture.status >= 200 && s.capture.status < 300,
      status: s.capture.status,
      json: async () => {
        const r = s.response as { nonJsonBody?: string };
        if (r && typeof r === 'object' && 'nonJsonBody' in r) throw new SyntaxError('tijelo nije JSON');
        return s.response;
      },
    };
  };
}

const DOI_SNIMKE: Array<[string, string]> = [
  ['retracted-rw-and-publisher.json', '10.1177/1758835919874651'],
  ['retracted-rw-only.json', '10.1538/expanim.54.1'],
  ['retracted-self-notice.json', '10.1007/s12652-021-02990-8'],
  ['retraction-notice.json', '10.1177/17588359211061903'],
  ['corrected.json', '10.1088/1361-6595/aaebdb'],
  ['correction-notice.json', '10.1088/1361-6595/ab245f'],
  ['plain.json', '10.1038/nature14539'],
  ['not-found.json', '10.9999/lekta-t98-ne-postoji'],
];

const verdiktIDoi = (r: { verdict: string; doiResolved?: boolean }) => ({ verdict: r.verdict, doiResolved: r.doiResolved });

describe('T98 golden: verdikt postojanja nad Crossref snimkama', () => {
  it('DOI put: 200 je found, 404 je not-found, za svaku snimku', async () => {
    const dobiveno: Record<string, unknown> = {};
    for (const [ime, doi] of DOI_SNIMKE) {
      _clearExistenceCache();
      dobiveno[ime] = verdiktIDoi(await verifyReference({ doi }, { fetchImpl: fetchIz(snimka(ime)) }));
    }
    expect(dobiveno).toEqual(ZATECENO.doi);
  });

  it('bibliografski put: naslov povucenog rada nad snimkom upita sa select=...,updated-by', async () => {
    const r = await verifyReference(
      { title: 'Downregulation of long noncoding RNA LINC01419 inhibits cell migration, invasion, and tumor growth and promotes autophagy via inactivation of the PI3K/Akt1/mTOR pathway in gastric cancer', year: '2019' },
      { fetchImpl: fetchIz(snimka('select-updated-by.json')) },
    );
    expect({ verdict: r.verdict, score: Number(r.score?.toFixed(4)), matchedTitle: r.matchedTitle?.slice(0, 40) }).toEqual(ZATECENO.bibliografski);
  });
});

// Izmjereno na origin/master 517270a0, prije oznake povucenog rada.
// Bibliografski pogodak je SAM povuceni rad ("RETRACTED: ..."), ne obavijest: slicnost 1 uz godinu 2019.
const ZATECENO = {
  doi: {
    'retracted-rw-and-publisher.json': { verdict: 'found', doiResolved: true },
    'retracted-rw-only.json': { verdict: 'found', doiResolved: true },
    'retracted-self-notice.json': { verdict: 'found', doiResolved: true },
    'retraction-notice.json': { verdict: 'found', doiResolved: true },
    'corrected.json': { verdict: 'found', doiResolved: true },
    'correction-notice.json': { verdict: 'found', doiResolved: true },
    'plain.json': { verdict: 'found', doiResolved: true },
    'not-found.json': { verdict: 'not-found', doiResolved: false },
  } as Record<string, unknown>,
  bibliografski: { verdict: 'found', score: 1, matchedTitle: 'RETRACTED: Downregulation of long noncod' } as Record<string, unknown>,
};

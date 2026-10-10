// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { _clearExistenceCache, retractionFromWork, verdictFromCandidates, verifyReference, verifyReferences } from '../src/citations/verify-existence';
import { RETRACTION_BADGE, summarizeVerification } from '../src/citations/verify-badges';
import { snimka, fetchIz } from './helpers/retraction-guard';

type Work = Parameters<typeof verdictFromCandidates>[1][number];
const capture = snimka('select-with-authors.json');
const items = (capture.response as { message: { items: Work[] } }).message.items;
const title = 'Downregulation of long noncoding RNA LINC01419 inhibits cell migration, invasion, and tumor growth and promotes autophagy via inactivation of the PI3K/Akt1/mTOR pathway in gastric cancer';
const reference = { title, year: '2019', authors: 'Wang, Lin-Lin; Zhang, Lei; Cui, Xiao-Feng' };
const work = items.find((x) => x.DOI === '10.1177/1758835919874651')!;

describe('T98: oznaka zahtijeva pouzdan identitet rada', () => {
  it('stvarna snimka s potpunim autorima daje oznaku; verdikt postojanja ostaje found', () => {
    expect(verdictFromCandidates(reference, items)).toMatchObject({ verdict: 'found', retraction: { kind: 'retracted' } });
  });
  it.each([
    ['susjedni naslov', { title: title.replace('gastric', 'colon') }],
    ['susjedna godina', { year: '2018' }],
    ['nema godine', { year: '' }],
    ['nema autora', { authors: '' }],
    ['drugi autor', { authors: 'Other, Person; Zhang, Lei; Cui, Xiao-Feng' }],
    ['inicijali', { authors: 'Wang, L.; Zhang, L.; Cui, X.' }],
    ['nedostaje koautor', { authors: 'Wang, Lin-Lin; Zhang, Lei' }],
  ])('%s ne pripisuje povlacenje slicnom pogotku', (_, delta) => {
    const out = verdictFromCandidates({ ...reference, ...delta }, [work]);
    expect(out.verdict).toBe('found');
    expect(out.retraction).toBeUndefined();
  });
  it('dva rada s istim naslovom/godinom/autorima daju nepoznatu oznaku', () => {
    expect(verdictFromCandidates(reference, [work, { ...work, DOI: '10.1/other-work' }]).retraction).toBeUndefined();
    expect(verdictFromCandidates(reference, [work, { ...work }]).retraction?.kind).toBe('retracted');
  });
  it('nepotpuni metapodaci drugog kandidata ne ruse vec pronadjeni rad', () => {
    expect(verdictFromCandidates(reference, [work, { title: [title], author: [] }])).toMatchObject({ verdict: 'found', retraction: { kind: 'retracted' } });
    expect(verdictFromCandidates(reference, [{ ...work, author: [{ family: 'Wang' }] }]).retraction).toBeUndefined();
  });
  it('DOI odgovor drugog rada ili bez DOI identiteta ne dobiva oznaku', async () => {
    for (const message of [work, { ...work, DOI: undefined }]) {
      const result = await verifyReference({ doi: '10.1/different-work' }, { fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ message }) }) });
      expect(result.verdict).toBe('found');
      expect(result.retraction).toBeUndefined();
    }
  });
  it('grcka slova ostaju dio identiteta i cachea, fuzzy found se ne mijenja', async () => {
    const alpha = { ...reference, title: title + ' α' };
    const beta = { ...reference, title: title + ' β' };
    expect(alpha.title).not.toBe(beta.title);
    expect(alpha.title.codePointAt(alpha.title.length - 1)).toBe(0x3b1);
    expect(beta.title.codePointAt(beta.title.length - 1)).toBe(0x3b2);
    const alphaWork = { ...work, title: [alpha.title] };
    expect(verdictFromCandidates(beta, [alphaWork])).toMatchObject({ verdict: 'found' });
    expect(verdictFromCandidates(beta, [alphaWork]).retraction).toBeUndefined();
    _clearExistenceCache(); let calls = 0;
    const results = await verifyReferences([alpha, beta], { delayMs: 0, fetchImpl: async () => { calls++; return { ok: true, status: 200, json: async () => ({ message: { items: [alphaWork] } }) }; } });
    expect(calls).toBe(2);
    expect(results.map((r) => r.retraction?.kind)).toEqual(['retracted', undefined]);
  });
  it('cache razdvaja autore istog naslova i godine', async () => {
    _clearExistenceCache();
    let calls = 0;
    const fetchImpl = async (url: string) => { calls++; return fetchIz(capture)(url); };
    const results = await verifyReferences([reference, { ...reference, authors: 'Other, Person' }, reference], { fetchImpl, delayMs: 0 });
    expect(calls).toBe(2);
    expect(results.map((r) => r.retraction?.kind)).toEqual(['retracted', undefined, 'retracted']);
  });
});

describe('T98: djelomicno povlacenje i zabrinutost', () => {
  const partial = { type: 'partial_retraction', source: 'publisher', DOI: '10.1/partial' };
  const concern = { type: 'expression_of_concern', source: 'publisher', DOI: '10.1/concern' };
  it('partial_retraction ostaje zasebna oznaka, uz prednost potpunog povlacenja', () => {
    expect(retractionFromWork({ 'updated-by': [concern, partial] })?.kind).toBe('partial');
    expect(retractionFromWork({ 'updated-by': [partial, { ...partial, type: 'retraction' }] })?.kind).toBe('retracted');
    expect(RETRACTION_BADGE.partial.text).toContain('Dio rada');
  });
  it('aria-live najavljuje oba upozorenja samo uz found, bez laznih nula', () => {
    const p = { kind: 'partial' as const, source: '', noticeDoi: '', date: '' };
    const c = { ...p, kind: 'concern' as const };
    expect(summarizeVerification([{ verdict: 'found', retraction: p }])).toContain('1 djelomično povučen rad');
    expect(summarizeVerification([{ verdict: 'found', retraction: c }])).toContain('1 izraz zabrinutosti');
    expect(summarizeVerification([{ verdict: 'weak', retraction: p }, { verdict: 'weak', retraction: c }])).not.toMatch(/povu?|zabrinut/);
    expect(summarizeVerification([{ verdict: 'found' }])).not.toMatch(/povu?|zabrinut/);
  });
});

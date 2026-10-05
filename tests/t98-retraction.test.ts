// @vitest-environment node
/**
 * T98 korak 1 (issue #219): oznaka povucenog rada iz Crossref `updated-by`, nad stvarnim snimkama (#292).
 * Verdikti postojanja ostaju kakvi su bili (tests/t98-retraction-golden.test.ts).
 */
import { describe, expect, it } from 'vitest';
import { _clearExistenceCache, retractionFromWork, verifyReference } from '../src/citations/verify-existence';
import { RETRACTION_BADGE, VERDICT_BADGE, existenceCellHtml, existenceEventProps, retractionNoticeUrl, summarizeVerification } from '../src/citations/verify-badges';
import { fetchIz, loadVerifyExistence, retractionProblems, snimka } from './helpers/retraction-guard';

const poruka = (ime: string) => (snimka(ime).response as { message?: unknown }).message;

describe('T98: retractionFromWork nad snimkama', () => {
  it('povuceni radovi daju retracted s izvorom, DOI-jem obavijesti i datumom', () => {
    expect(retractionFromWork(poruka('retracted-rw-and-publisher.json'))).toEqual({ kind: 'retracted', source: 'retraction-watch', noticeDoi: '10.1177/17588359211061903', date: '2021-12-15' });
    expect(retractionFromWork(poruka('retracted-rw-only.json'))).toEqual({ kind: 'retracted', source: 'retraction-watch', noticeDoi: '10.1538/expanim.54.1.r1', date: '2022-08-01' });
    expect(retractionFromWork(poruka('retracted-self-notice.json'))).toEqual({ kind: 'retracted', source: 'publisher', noticeDoi: '10.1007/s12652-021-02990-8', date: '2021-03-14' });
  });

  it('obavijest (samo update-to), ispravak i obican rad nemaju oznaku', () => {
    for (const ime of ['retraction-notice.json', 'correction-notice.json', 'corrected.json', 'plain.json']) expect(retractionFromWork(poruka(ime)), ime).toBeNull();
  });

  it('izraz zabrinutosti daje concern; povucen ima prednost', () => {
    const concern = { type: 'expression_of_concern', source: 'publisher', DOI: '10.1/eoc', updated: { 'date-parts': [[2020, 3, 4]] } };
    const retraction = { type: 'retraction', source: 'publisher', DOI: '10.1/r', updated: { 'date-time': '2021-01-02T00:00:00Z' } };
    expect(retractionFromWork({ 'updated-by': [concern] })).toEqual({ kind: 'concern', source: 'publisher', noticeDoi: '10.1/eoc', date: '2020-03-04' });
    expect(retractionFromWork({ 'updated-by': [concern, retraction] })?.kind).toBe('retracted');
  });

  it('nevaljan oblik daje null bez iznimke', () => {
    for (const los of [{ 'updated-by': 'retraction' }, { 'updated-by': [] }, { 'updated-by': [null, 5, 'x'] }, null, undefined, 7, 'x']) expect(retractionFromWork(los)).toBeNull();
  });
});

describe('T98: oznaka u provjeri postojanja', () => {
  it('DOI put: povuceni DOI-jevi dobivaju oznaku, obavijest i obican rad ne; 404 bez oznake', async () => {
    const out: Record<string, string | null> = {};
    for (const [ime, doi] of [
      ['retracted-rw-and-publisher.json', '10.1177/1758835919874651'],
      ['retracted-self-notice.json', '10.1007/s12652-021-02990-8'],
      ['retraction-notice.json', '10.1177/17588359211061903'],
      ['plain.json', '10.1038/nature14539'],
      ['not-found.json', '10.9999/lekta-t98-ne-postoji'],
    ]) {
      _clearExistenceCache();
      const r = await verifyReference({ doi }, { fetchImpl: fetchIz(snimka(ime)) });
      out[ime] = r.retraction?.kind ?? null;
    }
    expect(out).toEqual({
      'retracted-rw-and-publisher.json': 'retracted',
      'retracted-self-notice.json': 'retracted',
      'retraction-notice.json': null,
      'plain.json': null,
      'not-found.json': null,
    });
  });

  it('bibliografski put: pogodak found na povucenom radu nosi oznaku', async () => {
    _clearExistenceCache();
    const r = await verifyReference(
      { title: 'Downregulation of long noncoding RNA LINC01419 inhibits cell migration, invasion, and tumor growth and promotes autophagy via inactivation of the PI3K/Akt1/mTOR pathway in gastric cancer', year: '2019' },
      { fetchImpl: fetchIz(snimka('select-updated-by.json')) },
    );
    expect({ verdict: r.verdict, kind: r.retraction?.kind, notice: r.retraction?.noticeDoi }).toEqual({ verdict: 'found', kind: 'retracted', notice: '10.1177/17588359211061903' });
  });

  it('gard (tests/helpers/retraction-guard.ts) je cist nad stvarnim izvorom, i kroz esbuild granu (Node 20)', async () => {
    expect(await retractionProblems(loadVerifyExistence())).toEqual([]);
    expect(await retractionProblems(loadVerifyExistence((s) => s, null))).toEqual([]);
  });
});

describe('T98: znacke i sazetak', () => {
  it('tekst znacke je odobreni tekst; "nije povuceno" ne postoji nigdje', () => {
    expect(RETRACTION_BADGE.retracted.text).toBe('⚠ Rad je povučen (Crossref/Retraction Watch), provjeri prije citiranja');
    expect(RETRACTION_BADGE.concern.text).toBe('⚠ Izdavač je objavio izraz zabrinutosti');
    const svi = [...Object.values(RETRACTION_BADGE), ...Object.values(VERDICT_BADGE)].map((b) => b.text.toLowerCase());
    expect(svi.filter((t) => /nije\s+povu/.test(t))).toEqual([]);
  });

  it('poveznica na obavijest vodi na doi.org; bez DOI-ja je prazna', () => {
    expect(retractionNoticeUrl({ kind: 'retracted', source: 'publisher', noticeDoi: '10.1/r', date: '' })).toBe('https://doi.org/10.1/r');
    expect(retractionNoticeUrl(undefined)).toBe('');
  });

  it('celija analizatora: bez oznake isti HTML kao prije; s oznakom znacka i poveznica, samo uz found', () => {
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const r = { kind: 'retracted' as const, source: 'publisher', noticeDoi: '10.1/r"x', date: '' };
    // Prije T98 (app.ts): escapeHtml(meta.text) + " — podudara se s: „naslov”".
    expect(existenceCellHtml({ verdict: 'found', matchedTitle: 'Naslov <i>' }, esc)).toBe(`${esc(VERDICT_BADGE.found.text)} — podudara se s: „Naslov &lt;i&gt;”`);
    expect(existenceCellHtml({ verdict: 'not-found' }, esc)).toBe(esc(VERDICT_BADGE['not-found'].text));
    const s = existenceCellHtml({ verdict: 'found', retraction: r }, esc);
    expect(s).toContain(esc(RETRACTION_BADGE.retracted.text));
    expect(s).toContain('href="https://doi.org/10.1/r&quot;x"');
    expect(existenceCellHtml({ verdict: 'weak', matchedTitle: 'X', retraction: r }, esc)).not.toContain('povučen');
  });

  it('dogadjaj: retracted je vlastiti brojac, samo uz found', () => {
    const r = { kind: 'retracted' as const, source: 'publisher', noticeDoi: '', date: '' };
    expect(existenceEventProps([{ verdict: 'found', retraction: r }, { verdict: 'weak', retraction: r }, { verdict: 'not-found' }])).toEqual({ total: 3, found: 1, missing: 1, retracted: 1 });
  });

  it('sazetak broji povucene samo uz found i nikad ne najavljuje nulu', () => {
    const r = { kind: 'retracted' as const, source: 'publisher', noticeDoi: '10.1/r', date: '' };
    expect(summarizeVerification([{ verdict: 'found', retraction: r }, { verdict: 'found' }])).toContain('2 pronađeno, 1 povučen rad');
    expect(summarizeVerification([{ verdict: 'weak', retraction: r }])).not.toContain('povuč');
    expect(summarizeVerification([{ verdict: 'found' }])).not.toContain('povuč');
  });
});

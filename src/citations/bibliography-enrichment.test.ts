import { describe, expect, it } from 'vitest';
import { buildDomesticCorpusPayload, enrichWithCrossref, sanitizeBibliographyQuery } from './bibliography-enrichment';

describe('bibliography enrichment', () => {
  it('šalje samo strukturirane metapodatke', () => {
    const query = sanitizeBibliographyQuery({
      id: 'b-1',
      fields: { authors: 'Horvat, I.', title: 'Naslov', year: '2020', doi: 'doi:10.1234/test' },
    });
    expect(query).toEqual({ id: 'b-1', authors: 'Horvat, I.', title: 'Naslov', year: '2020', doi: '10.1234/test' });
    expect(JSON.stringify(buildDomesticCorpusPayload([{ id: 'b-1', fields: { title: 'Naslov' } }]))).not.toContain('tijelo');
  });

  it('bez privole ne poziva mrežu', async () => {
    let calls = 0;
    const result = await enrichWithCrossref([{ id: 'b-1', fields: { title: 'Naslov' } }], {
      consent: false,
      fetchImpl: async () => { calls += 1; return { ok: true, status: 200, json: async () => ({}) }; },
    });
    expect(result).toEqual([]);
    expect(calls).toBe(0);
  });

  it('uzima najbolji Crossref kandidat', async () => {
    const result = await enrichWithCrossref([{ id: 'b-1', fields: { title: 'Naslov rada', year: '2020' } }], {
      consent: true,
      fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ message: { items: [{ title: ['Drugi'], DOI: '10.1/x' }, { title: ['Naslov rada'], DOI: '10.2/y' }] } }) }),
    });
    expect(result[0]?.fields.title).toBe('Naslov rada');
    expect(result[0]?.provenance.label).toBe('Crossref');
  });
});

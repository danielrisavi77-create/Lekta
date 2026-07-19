import { describe, it, expect } from 'vitest';
import {
  sanitizeAnalysisResult,
  redactParagraphQuotes,
  buildReportRequest,
  buildFullReport,
} from '../src/report/report';

// data-flow-03: klijent je slao CIJELI currentResult, ukljucujuci doslovne isjecke teksta rada
// (details.typoLint.excerpt, reference .text, legalCitationEngine, "odlomak N: <tekst>" u opisima
// nalaza), iako privacy tvrdi da tekst rada ostaje lokalno. Test dokazuje da sanitizirani payload
// NE sadrzi doslovni tekst, a puni izvjestaj i dalje radi.

const SECRET = 'TAJNI_TEKST_TIJELA_RADA_XYZ';

function fullResult(): any {
  return {
    version: '2.2.1',
    file: { name: `${SECRET}-diplomski.docx`, size: 1234 },
    documentStructure: { title: SECRET, author: SECRET, headings: [{ level: 1, text: SECRET }] },
    profile: 'FPZG',
    profileStatus: 'verified',
    score: 82,
    stats: { words: 5000 },
    checks: [
      { category: 'citations', title: 'Potpunost zapisa', status: 'warn', earned: 3, max: 5, scored: true,
        detail: `odlomak 5: ${SECRET} nastavak reference`,
        issue: { severity: 'warning', category: 'citations', title: 'Nepotpuni', detail: `odlomak 8: ${SECRET}`, where: 'Literatura' } },
      { category: 'format', title: 'Font', status: 'pass', earned: 5, max: 5, scored: true,
        detail: '5 tablica, 3 naslova', issue: null },
    ],
    issues: [
      { severity: 'warning', category: 'citations', title: 'Nepotpuni', detail: `odlomak 8: ${SECRET}`, where: 'Literatura' },
      { severity: 'info', category: 'structure', title: 'Naslov', detail: `odlomak 12: ${SECRET}`, where: 'Struktura' },
    ],
    details: {
      ruleAuthority: 'official-source',
      profileDefinitionId: 'fpzg-diplomski',
      profileFingerprint: 'fp-abc',
      sources: [{ title: 'FPZG upute', url: 'https://example.hr' }],
      incompleteReferences: [{ p: 5, text: `${SECRET} referenca` }],
      references: [{ raw: `${SECRET} referenca za provjeru postojanja`, p: 5, author: 'Kovac', year: '2020' }],
      missingReferences: [{ author: 'Kovac', year: '2020', text: SECRET }],
      uncitedReferences: [{ author: 'Horvat', year: '2019', text: SECRET }],
      legalCitationEngine: { problems: [`${SECRET} problem`] },
      typoLint: { summary: { total: 2 }, findings: [{ kind: 'spacing', excerpt: SECRET }], truncated: false },
    },
  };
}

describe('redactParagraphQuotes', () => {
  it('makne tekst iza "odlomak N:", ostavi indeks', () => {
    expect(redactParagraphQuotes('odlomak 5: tajni tekst; odlomak 8: jos')).toBe('odlomak 5; odlomak 8');
  });
  it('ne dira opise bez ugradjenog citata', () => {
    expect(redactParagraphQuotes('5 tablica, 3 naslova')).toBe('5 tablica, 3 naslova');
    expect(redactParagraphQuotes('odlomak 5, odlomak 8')).toBe('odlomak 5, odlomak 8'); // bez dvotocke
  });
});

describe('sanitizeAnalysisResult (data-flow-03)', () => {
  it('serijalizirani rezultat NE sadrzi doslovni tekst rada', () => {
    const clean = sanitizeAnalysisResult(fullResult());
    const json = JSON.stringify(clean);
    expect(json).not.toContain(SECRET);
  });

  it('izbacuje sve nosace teksta iz details, zadrzava sigurnu metapodatkovnu jezgru', () => {
    const clean = sanitizeAnalysisResult(fullResult());
    expect(clean.details).toBeDefined();
    expect((clean.details as any).typoLint).toBeUndefined();
    expect((clean.details as any).incompleteReferences).toBeUndefined();
    expect((clean.details as any).references).toBeUndefined(); // feature #4: sirovi popis NE ide na mrezu
    expect((clean.details as any).legalCitationEngine).toBeUndefined();
    expect(clean.details!.ruleAuthority).toBe('official-source');
    expect(clean.details!.sources).toEqual([{ title: 'FPZG upute', url: 'https://example.hr' }]);
  });

  it('ne salje file.name ni documentStructure (idu zasebno kao parsedStructure)', () => {
    const clean = sanitizeAnalysisResult(fullResult()) as any;
    expect(clean.file).toBeUndefined();
    expect(clean.documentStructure).toBeUndefined();
  });

  it('zadrzava score, stats, broj nalaza i indeks odlomka u opisu', () => {
    const clean = sanitizeAnalysisResult(fullResult());
    expect(clean.score).toBe(82);
    expect(clean.stats).toEqual({ words: 5000 });
    expect(clean.checks).toHaveLength(2);
    expect(clean.issues).toHaveLength(2);
    expect(clean.checks![0].detail).toBe('odlomak 5'); // indeks ostao, tekst maknut
    expect(clean.checks![0].issue!.detail).toBe('odlomak 8');
  });

  it('puni izvjestaj (server) i dalje radi na saniziranom rezultatu', () => {
    const clean = sanitizeAnalysisResult(fullResult());
    const full = buildFullReport(clean, { traceToken: 't1' });
    expect(full.score).toBe(82);
    expect(full.checks).toHaveLength(2);
    expect(JSON.stringify(full)).not.toContain(SECRET);
  });

  it('buildReportRequest sanitizira analysisResult', () => {
    const req = buildReportRequest({ title: 'X', author: 'Y', headings: [] }, fullResult(), 'diplomski');
    expect(JSON.stringify(req.analysisResult)).not.toContain(SECRET);
    expect(req.analysisResult.score).toBe(82);
  });
});

import { describe, expect, it } from 'vitest';
import { buildFindingViewModels, findingCardHtml, topFindings, type FindingSessionState } from '../src/ui/finding-view-model';
import type { TriageModel } from '../src/analysis/triage';

const triage: TriageModel = {
  counts: { auto: 1, assisted: 0, manual: 2, total: 3 },
  findings: [
    { id: 'a', category: 'formatting', title: 'Margine', severity: 'warning', fixability: 'auto', fixId: 'margin-fixer', locations: [] },
    { id: 'b', category: 'structure', title: 'Naslov', severity: 'error', fixability: 'manual', locations: [{ paragraphIndex: 7, anchorId: 'loc-p7', excerpt: '' }] },
    { id: 'c', category: 'submission', title: 'Paket', severity: 'error', fixability: 'manual', locations: [] },
  ],
};

const result = {
  checks: [
    { category: 'formatting', title: 'Margine', status: 'warn', earned: 2, max: 5, detail: '2,0 cm', scored: true, issue: null },
  ],
  issues: [
    { severity: 'warning', category: 'formatting', title: 'Margine', detail: 'Margine odstupaju.', where: 'Postavke stranice' },
    { severity: 'error', category: 'structure', title: 'Naslov', detail: 'Naslov preskace razinu.', where: 'Odlomak 7' },
    { severity: 'error', category: 'submission', title: 'Paket', detail: 'Paket nije spreman i blokira predaju.', where: 'Predajni paket' },
  ],
  details: { triage, sources: [{ title: 'Službene upute', url: 'https://example.test/upute' }], verifiedAt: '2026-07-18' },
};

describe('FindingViewModel', () => {
  it('svakom nalazu daje anchor, document ili unavailable scope', () => {
    const findings = buildFindingViewModels(result);
    expect(findings[0].scope).toEqual({ kind: 'document' });
    expect(findings[1].scope).toEqual({ kind: 'anchor', paragraphIndex: 7 });
    expect(findings[2].scope.kind).toBe('unavailable');
  });

  it('tri prioriteta redaju blokator, ostale errore pa auto warning', () => {
    expect(topFindings(buildFindingViewModels(result)).map((finding) => finding.title)).toEqual(['Paket', 'Naslov', 'Margine']);
  });

  it('primjenjuje sesijski status bez promjene rezultata', () => {
    const states = new Map<string, FindingSessionState>([['finding:structure:naslov', { status: 'confirmed' }]]);
    const finding = buildFindingViewModels(result, states)[1];
    expect(finding.status).toBe('confirmed');
    expect(result.issues[1].title).toBe('Naslov');
  });

  it('matchKeys sadrzi issue.title, deduplicirano kad je check.title isti (RESULT-03)', () => {
    const findings = buildFindingViewModels(result);
    expect(findings[0].matchKeys).toEqual(['Margine']); // check.title==='Margine', bez duplikata
    expect(findings[1].matchKeys).toEqual(['Naslov']); // nema uparen check -> samo issue.title
  });

  it('matchKeys sadrzi I issue.title I check.title kad se razlikuju (npr. numeracija)', () => {
    const issue = { severity: 'warning', category: 'structure', title: 'Provjeri rimsku i arapsku numeraciju', detail: '', where: 'Sekcije dokumenta' };
    const numberingResult = {
      checks: [{ category: 'structure', title: 'Shema numeriranja stranica', status: 'warn', earned: 2, max: 4, detail: '', scored: true, issue }],
      issues: [issue],
    };
    const finding = buildFindingViewModels(numberingResult)[0];
    expect(finding.matchKeys).toEqual(['Provjeri rimsku i arapsku numeraciju', 'Shema numeriranja stranica']);
  });

  it('tool: prepoznat problem dobiva suggestTool CTA, kontekst selekcije ide u href (nekad renderActionPlan)', () => {
    const naslovnicaResult = {
      issues: [{ severity: 'error', category: 'elements', title: 'Nedostaje naslovnica', detail: '', where: '' }],
      settings: { selectionIds: { unit: 'fpzg' }, workType: 'graduate' },
      selection: { program: 'Politologija' },
    };
    const finding = buildFindingViewModels(naslovnicaResult)[0];
    expect(finding.tool).toEqual({ href: 'naslovnica.html?fakultet=fpzg&razina=diplomski&smjer=Politologija', label: 'Složi naslovnicu' });
    const html = findingCardHtml(finding, false);
    expect(html).toContain('class="action-tool"');
    expect(html).toContain('target="_blank" rel="noopener"');
    expect(html).toContain('Složi naslovnicu');
  });

  it('tool: nepovezan problem (npr. font) ostaje bez CTA (nema lazne ponude)', () => {
    const finding = buildFindingViewModels(result)[0]; // "Margine", formatting, ne odgovara nijednom obrascu
    expect(finding.tool).toBeUndefined();
    expect(findingCardHtml(finding, false)).not.toContain('action-tool');
  });

  it('rucna potvrda ne skriva nalaz iz prioriteta, a zanemareni se skriva', () => {
    const confirmed = new Map<string, FindingSessionState>([['finding:submission:paket', { status: 'confirmed' }]]);
    expect(topFindings(buildFindingViewModels(result, confirmed)).map((finding) => finding.title)).toContain('Paket');
    const ignored = new Map<string, FindingSessionState>([['finding:submission:paket', { status: 'ignored', ignoredReason: 'Mentor je potvrdio iznimku' }]]);
    expect(topFindings(buildFindingViewModels(result, ignored)).map((finding) => finding.title)).not.toContain('Paket');
  });

  it('kartica nikad nema praznu akcijsku ili lokacijsku zonu', () => {
    const [documentFinding, anchorFinding] = buildFindingViewModels(result);
    const documentHtml = findingCardHtml(documentFinding, true);
    const anchorHtml = findingCardHtml(anchorFinding, false);
    expect(documentHtml).toContain('Odnosi se na cijeli dokument');
    expect(documentHtml).toContain('Otvori mogućnost popravka');
    expect(anchorHtml).toContain('data-finding-jump');
    expect(anchorHtml).toContain('Označi ručno provjereno');
    expect(anchorHtml).toContain('Zanemari uz razlog');
    expect(anchorHtml).not.toContain('Kontekst profila');
  });

  it('rucno potvrden nalaz daje mogucnost ponistavanja', () => {
    const states = new Map<string, FindingSessionState>([['finding:structure:naslov', { status: 'confirmed' }]]);
    const html = findingCardHtml(buildFindingViewModels(result, states)[1], false);
    expect(html).toContain('Ručna potvrda ne mijenja automatsku ocjenu');
    expect(html).toContain('Poništi ručnu potvrdu');
  });

  it('zanemaren nalaz objasnjava utjecaj na prioritete i ocjenu, uz mogucnost vracanja', () => {
    const states = new Map<string, FindingSessionState>([['finding:structure:naslov', { status: 'ignored', ignoredReason: 'Mentor je potvrdio iznimku' }]]);
    const html = findingCardHtml(buildFindingViewModels(result, states)[1], false);
    expect(html).toContain('uklanja nalaz iz tri najvažnija koraka');
    expect(html).toContain('Vrati u otvorene nalaze');
    expect(html).toContain('Razlog: Mentor je potvrdio iznimku');
  });
  it('ogranicenje analize odvaja od problema ucitanog dokumenta', () => {
    const findings = buildFindingViewModels({
      issues: [
        { severity: 'info', category: 'structure', title: 'Profil ograničeno terenski testiran', detail: 'Uzorak je ograničen.', where: 'Terenska verifikacija' },
        { severity: 'warning', category: 'structure', title: 'Nedostaje izjava o autorstvu', detail: 'Nije prepoznata.', where: 'Struktura rada' },
      ],
    });
    expect(findings.map((finding) => finding.kind)).toEqual(['limitation', 'document']);
  });
});

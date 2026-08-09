import { describe, expect, it } from 'vitest';
import { buildFindingViewModels, findingCardHtml, topFindings, type FindingSessionState } from '../src/ui/finding-view-model';
import type { CanonicalFinding } from '../src/analysis/canonical-findings';
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
  it('prikazuje canonical upozorenje i informativno ogranicenje bez issues, uz konzervativan scope', () => {
    const findings: CanonicalFinding[] = [
      {
        id: 'check:margin', checkId: 'margin', ruleId: null, category: 'formatting', severity: 'warning', status: 'warn', measurementStatus: 'measured',
        title: 'Margine', detail: 'Lijeva margina je 2,0 cm.', locations: [{ where: 'Postavke stranice' }], evidence: [], hasIssue: true, scored: true, scoreImpact: { earned: 2, max: 5 }, blocking: true,
      },
      {
        id: 'check:field-test', checkId: 'field-test', ruleId: null, category: 'structure', severity: 'info', status: 'info', measurementStatus: 'not-applicable',
        title: 'Profil ograniceno terenski testiran', detail: 'Uzorak je ogranicen.', locations: [{ where: 'Terenska verifikacija' }], evidence: [], hasIssue: true, scored: false, scoreImpact: null, blocking: false,
      },
      {
        id: 'check:font', checkId: 'font', ruleId: null, category: 'formatting', severity: 'info', status: 'pass', measurementStatus: 'measured',
        title: 'Font', detail: 'Font odgovara profilu.', locations: [], evidence: [], hasIssue: false, scored: true, scoreImpact: { earned: 5, max: 5 }, blocking: false,
      },
    ];

    const viewModels = buildFindingViewModels({ findings });

    expect(viewModels).toMatchObject([
      { title: 'Margine', severity: 'warning', explanation: 'Lijeva margina je 2,0 cm.', scope: { kind: 'document' } },
      {
        title: 'Profil ograniceno terenski testiran',
        severity: 'info',
        explanation: 'Uzorak je ogranicen.',
        kind: 'limitation',
        scope: { kind: 'unavailable', reason: 'Lokacija nije pouzdano dostupna. Nalaz je opisan kao: Terenska verifikacija.' },
      },
    ]);
  });

  it('canonical issue copy zadrzava check mjerenje, oba match kljuca i triage sidra', () => {
    const canonicalFindings: CanonicalFinding[] = [
      {
        id: 'check:structure.heading', checkId: 'structure.heading', ruleId: null, category: 'structure', severity: 'warning', status: 'warn', measurementStatus: 'measured',
        title: 'Naslov preskače razinu', detail: 'Nakon naslova prve razine slijedi treća.', locations: [{ where: 'Odlomak 7' }], evidence: ['Razina 3 nakon razine 1'], hasIssue: true, scored: true, scoreImpact: { earned: 0, max: 4 }, blocking: false,
      },
      {
        id: 'check:citations.footnote', checkId: 'citations.footnote', ruleId: null, category: 'citations', severity: 'warning', status: 'warn', measurementStatus: 'measured',
        title: 'Nepotpuna bilješka', detail: 'Bilješka nema sve elemente.', locations: [{ where: 'Bilješka 4' }], evidence: ['Nedostaje godina'], hasIssue: true, scored: true, scoreImpact: { earned: 1, max: 3 }, blocking: false,
      },
    ];
    const checks = [
      { id: 'structure.heading', evidence: 'measured' as const, measurementStatus: 'measured' as const, category: 'structure', title: 'Hijerarhija naslova', status: 'warn', earned: 0, max: 4, detail: 'Razina 3 nakon razine 1', issue: null, scored: true },
      { id: 'citations.footnote', evidence: 'measured' as const, measurementStatus: 'measured' as const, category: 'citations', title: 'Citati u bilješkama', status: 'warn', earned: 1, max: 3, detail: 'Nedostaje godina', issue: null, scored: true },
    ];
    const canonicalTriage: TriageModel = {
      counts: { auto: 0, assisted: 0, manual: 2, total: 2 },
      findings: [
        { id: 'heading', category: 'structure', title: 'Hijerarhija naslova', severity: 'warning', fixability: 'manual', locations: [{ paragraphIndex: 7, anchorId: 'loc-p7', excerpt: '' }] },
        { id: 'footnote', category: 'citations', title: 'Citati u bilješkama', severity: 'warning', fixability: 'manual', locations: [{ paragraphIndex: 0, footnoteId: 4, anchorId: 'loc-fn4', excerpt: '' }] },
      ],
    };

    const projected = buildFindingViewModels({ findings: canonicalFindings, checks, details: { triage: canonicalTriage } });

    expect(projected[0]).toMatchObject({
      title: 'Naslov preskače razinu',
      explanation: 'Nakon naslova prve razine slijedi treća.',
      measured: 'Razina 3 nakon razine 1',
      matchKeys: ['Naslov preskače razinu', 'Hijerarhija naslova'],
      scope: { kind: 'anchor', paragraphIndex: 7 },
    });
    expect(projected[1].scope).toEqual({ kind: 'anchor', paragraphIndex: 0, footnoteId: 4 });
  });

  it('canonical unavailable i ambiguous mjerenja prikazuje kao ogranicenja', () => {
    const findings: CanonicalFinding[] = [
      {
        id: 'check:font', checkId: 'font', ruleId: null, category: 'formatting', severity: 'info', status: 'unknown', measurementStatus: 'unavailable',
        title: 'Font nije moguće očitati', detail: 'Mjerenje nije dostupno.', locations: [], evidence: [], hasIssue: false, scored: false, scoreImpact: null, blocking: false,
      },
      {
        id: 'check:method', checkId: 'method', ruleId: null, category: 'structure', severity: 'info', status: 'unknown', measurementStatus: 'ambiguous',
        title: 'Metoda nije jednoznačna', detail: 'Rezultat je dvosmislen.', locations: [], evidence: [], hasIssue: false, scored: false, scoreImpact: null, blocking: false,
      },
    ];

    expect(buildFindingViewModels({ findings }).map((finding) => finding.kind)).toEqual(['limitation', 'limitation']);
  });

  it('filtrira not-applicable bez issuea, zadrzava unmatched issue i originalne indekse', () => {
    const findings: CanonicalFinding[] = [
      {
        id: 'check:pass', checkId: 'pass', ruleId: null, category: 'formatting', severity: 'info', status: 'pass', measurementStatus: 'measured',
        title: 'Prolaz', detail: '', locations: [], evidence: [], hasIssue: false, scored: true, scoreImpact: { earned: 1, max: 1 }, blocking: false,
      },
      {
        id: 'check:info', checkId: 'info', ruleId: null, category: 'structure', severity: 'info', status: 'info', measurementStatus: 'not-applicable',
        title: 'Informativna provjera', detail: '', locations: [], evidence: [], hasIssue: false, scored: false, scoreImpact: null, blocking: false,
      },
      {
        id: 'issue:abc123', checkId: null, ruleId: null, category: 'citations', severity: 'warning', status: 'warn', measurementStatus: 'measured',
        title: 'Neupareni problem', detail: 'Problem ostaje vidljiv.', locations: [{ where: 'Literatura' }], evidence: [], hasIssue: true, scored: false, scoreImpact: null, blocking: false,
      },
      {
        id: 'check:advisory', checkId: 'advisory', ruleId: null, category: 'structure', severity: 'info', status: 'info', measurementStatus: 'not-applicable',
        title: 'Preporuka s nalazom', detail: 'Postoji konkretan nalaz.', locations: [], evidence: [], hasIssue: true, scored: false, scoreImpact: null, blocking: false,
      },
    ];

    const projected = buildFindingViewModels({ findings });

    expect(projected.map(({ title, originalIndex }) => ({ title, originalIndex }))).toEqual([
      { title: 'Neupareni problem', originalIndex: 2 },
      { title: 'Preporuka s nalazom', originalIndex: 3 },
    ]);
  });

  it('zadrzava legacy issues projekciju kad findings nije prisutan', () => {
    expect(buildFindingViewModels({
      issues: [{ severity: 'error', category: 'structure', title: 'Nedostaje sadrzaj', detail: 'Sadrzaj nije pronaden.', where: 'Cijeli dokument' }],
    })).toMatchObject([
      { title: 'Nedostaje sadrzaj', severity: 'error', explanation: 'Sadrzaj nije pronaden.', scope: { kind: 'document' } },
    ]);
  });

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

import { describe, expect, it } from 'vitest';
import { buildLektaResult } from '../src/integrations/lekta-result';
import type { FindingSessionState } from '../src/ui/finding-view-model';

const baseResult = {
  score: 84,
  generatedAt: '2026-08-02T18:00:00.000Z',
  checks: [{ category: 'formatting', title: 'Margine', status: 'warn', earned: 2, max: 5, detail: '2,0 cm', scored: true, issue: null }],
  issues: [
    { severity: 'warning', category: 'formatting', title: 'Margine', detail: 'Margine odstupaju.', where: 'Postavke stranice' },
    { severity: 'error', category: 'structure', title: 'Naslov', detail: 'Naslov preskace razinu.', where: 'Odlomak 7' },
    { severity: 'info', category: 'structure', title: 'Profil ograničeno terenski testiran', detail: 'Uzorak je ograničen.', where: 'Terenska verifikacija' },
  ],
  details: { profileFingerprint: 'LK-2.2.2-abc12345' },
};

describe('LektaResult v1', () => {
  it('gradi v1 oblik s profileId/projectId/rulesetVersion/score/checkedAt', () => {
    const out = buildLektaResult(baseResult, { projectId: 'proj-1', profileId: 'fpzg-politologija-diplomski' });
    expect(out).toMatchObject({
      v: 1,
      projectId: 'proj-1',
      profileId: 'fpzg-politologija-diplomski',
      rulesetVersion: 'LK-2.2.2-abc12345',
      score: 84,
      checkedAt: '2026-08-02T18:00:00.000Z',
    });
  });

  it('issueId je stabilan finding:{category}:{title} oblik, isti kao FindingViewModel.id', () => {
    const out = buildLektaResult(baseResult, { projectId: null, profileId: null });
    expect(out.issues).toEqual([
      { issueId: 'finding:formatting:margine', severity: 'warning', category: 'formatting', fixable: false, label: 'Margine' },
      { issueId: 'finding:structure:naslov', severity: 'error', category: 'structure', fixable: false, label: 'Naslov' },
    ]);
  });

  it('ogranicenja analize (kind=limitation) i zanemareni nalazi ne ulaze u issues', () => {
    const out = buildLektaResult(baseResult, { projectId: null, profileId: null });
    expect(out.issues.some((i) => i.label === 'Profil ograničeno terenski testiran')).toBe(false);
    expect(out.issues).toHaveLength(2);
  });

  it('postuje sesijski states (findingStates iz app.ts): rucno zanemaren nalaz ne ide u Katedru', () => {
    const states = new Map<string, FindingSessionState>([['finding:formatting:margine', { status: 'ignored', ignoredReason: 'Mentor je odobrio' }]]);
    const out = buildLektaResult(baseResult, { projectId: null, profileId: null }, states);
    expect(out.issues.map((i) => i.issueId)).toEqual(['finding:structure:naslov']);
  });

  it('rucno potvrden (ne zanemaren) nalaz i dalje ide u Katedru, samo status nije rijesen', () => {
    const states = new Map<string, FindingSessionState>([['finding:formatting:margine', { status: 'confirmed' }]]);
    const out = buildLektaResult(baseResult, { projectId: null, profileId: null }, states);
    expect(out.issues.map((i) => i.issueId)).toContain('finding:formatting:margine');
  });

  it('nedostajuci projectId/profileId/rulesetVersion ostaju null, ne izmisljaju se', () => {
    const out = buildLektaResult({ issues: [] }, { projectId: null, profileId: null });
    expect(out).toEqual({ v: 1, projectId: null, profileId: null, rulesetVersion: null, score: null, checkedAt: out.checkedAt, issues: [] });
  });

  it('nikad ne nosi tekst dokumenta ili detalje nalaza, samo issueId/severity/category/fixable/label', () => {
    const out = buildLektaResult(baseResult, { projectId: 'proj-1', profileId: 'fpzg' });
    const json = JSON.stringify(out);
    expect(json).not.toContain('odstupaju');
    expect(json).not.toContain('preskace');
    expect(json).not.toContain('Postavke stranice');
    for (const issue of out.issues) {
      expect(Object.keys(issue).sort()).toEqual(['category', 'fixable', 'issueId', 'label', 'severity']);
    }
  });
});

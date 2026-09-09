import { describe, expect, it } from 'vitest';
import { compareFindingRevisions, findingKey, type RevisionFinding, type RevisionSnapshot } from '../src/history/finding-revisions';

/**
 * T11: usporedba nalaza dviju revizija ne smije proizvesti lazan napredak.
 *
 * Fixturei su potpuno definirani; `spacing@document` je izvedeni testni kljuc `ruleId@scopeKey`, ne
 * produkcijski id pravila.
 */
function snap(id: string, findings: RevisionFinding[], over: Partial<RevisionSnapshot> = {}): RevisionSnapshot {
  return { id, documentGroupId: 'doc-1', profileId: 'fpzg-politologija-diplomski', rulesFingerprint: 'rules-v1',
    analysisContractVersion: 'analysis-3', findings, ...over };
}
const f = (ruleId: string, outcome: RevisionFinding['outcome'], scopeKey: string | null = null): RevisionFinding => ({ ruleId, scopeKey, outcome });

const before = snap('r1', [f('spacing', 'fail'), f('font', 'fail'), f('heading', 'fail', 'h:uvod'), f('margins', 'pass')]);

describe('compareFindingRevisions', () => {
  it('rijeseno je SAMO ono sto nova snimka izricito potvrdjuje kao pass', () => {
    const after = snap('r2', [f('spacing', 'pass'), f('font', 'fail'), f('heading', 'fail', 'h:uvod'), f('margins', 'pass')]);
    const delta = compareFindingRevisions(before, after);
    expect(delta.comparable).toBe(true);
    expect(delta.resolved).toEqual(['spacing@document']);
    expect(delta.persisting).toEqual(['font@document', 'heading@h:uvod']);
    expect(delta.introduced).toEqual([]);
    expect(delta.uncertain).toEqual([]);
  });

  it('neizmjereno ili nestalo NIJE rijeseno: ide u uncertain', () => {
    const unmeasurableAfter = snap('r2', [f('spacing', 'unmeasurable'), f('font', 'fail'), f('margins', 'pass')]);
    const delta = compareFindingRevisions(before, unmeasurableAfter);
    expect(delta.resolved).toEqual([]);
    expect(delta.uncertain).toEqual(['heading@h:uvod', 'spacing@document']);
    expect(delta.persisting).toEqual(['font@document']);
  });

  it('nov fail je uveden, ukljucujuci pogorsanje ranije prolazne provjere', () => {
    const after = snap('r2', [f('spacing', 'fail'), f('font', 'fail'), f('heading', 'fail', 'h:uvod'), f('margins', 'fail'), f('toc', 'fail')]);
    const delta = compareFindingRevisions(before, after);
    expect(delta.introduced).toEqual(['margins@document', 'toc@document']);
    expect(delta.resolved).toEqual([]);
  });

  it('promjena profila, pravila ili ugovora analize daje comparable=false s razlogom i praznim popisima', () => {
    for (const [over, reason] of [
      [{ rulesFingerprint: 'rules-v2' }, /pravila/],
      [{ profileId: 'fpzg-politologija-zavrsni' }, /profil/],
      [{ analysisContractVersion: 'analysis-4' }, /ugovor/],
      [{ documentGroupId: 'doc-2' }, /isti rad/],
    ] as Array<[Partial<RevisionSnapshot>, RegExp]>) {
      const delta = compareFindingRevisions(before, snap('r2', [f('spacing', 'pass')], over));
      expect(delta.comparable).toBe(false);
      expect(delta.reason).toMatch(reason);
      expect(delta.resolved).toEqual([]);
      expect(delta.introduced).toEqual([]);
    }
  });

  it('ponavljajuci isti naslovi (isti scopeKey dvaput) su nejednoznacni i ne sparuju se naslijepo', () => {
    const dup = snap('r1', [f('heading', 'fail', 'h:zakljucak'), f('heading', 'fail', 'h:zakljucak')]);
    const after = snap('r2', [f('heading', 'pass', 'h:zakljucak'), f('heading', 'fail', 'h:zakljucak')]);
    const delta = compareFindingRevisions(dup, after);
    expect(delta.resolved).toEqual([]);
    expect(delta.uncertain).toEqual(['heading@h:zakljucak']);
  });

  it('umetnut odlomak i premjestena sekcija ne mijenjaju kljuceve jer sidro nije indeks', () => {
    // Prije: dva lokalna nalaza sa stabilnim otiskom; poslije: novi odlomak umetnut ispred, sekcija premjestena.
    const b = snap('r1', [f('para-spacing', 'fail', 'p:otisak-A'), f('para-spacing', 'fail', 'p:otisak-B')]);
    const a = snap('r2', [f('para-spacing', 'pass', 'p:otisak-NOVI'), f('para-spacing', 'pass', 'p:otisak-B'), f('para-spacing', 'fail', 'p:otisak-A')]);
    const delta = compareFindingRevisions(b, a);
    expect(delta.resolved).toEqual(['para-spacing@p:otisak-B']);
    expect(delta.persisting).toEqual(['para-spacing@p:otisak-A']);
    expect(delta.introduced).toEqual([]);
  });

  it('kljuc globalnog pravila je ruleId@document', () => {
    expect(findingKey(f('spacing', 'fail'))).toBe('spacing@document');
    expect(findingKey(f('heading', 'fail', 'h:uvod'))).toBe('heading@h:uvod');
  });
});

import { describe, expect, it } from 'vitest';
import {
  initialContext, transition, canLinkSession, hasDocument, hasConfirmedProfile,
  WORKSPACE_STATES, type WorkspaceContext, type WorkspaceEvent, type WorkspaceState,
} from '../src/routes/workspace/workspace-state';

/**
 * STROJ STANJA RADNOG PROSTORA. Gardovi ne mjere da se prijelazi vrte, nego tri pravila koja bi
 * bez njih otisla tiho: analiza prije potvrde profila, greska koja baci rad, i poveznica na
 * sesiju koja nije zapisana.
 */

const run = (events: WorkspaceEvent[], fragment = false): WorkspaceContext =>
  events.reduce<WorkspaceContext>((ctx, e) => transition(ctx, e), initialContext(fragment));

/** Put od praznog do rezultata; koristi ga vecina tvrdnji ispod. */
const TO_RESULTS: WorkspaceEvent[] = [
  'documentOffered', 'documentAccepted', 'sessionPersisted', 'profileConfirmed', 'analysisCompleted',
];

describe('stroj stanja radnog prostora', () => {
  it('bez sesije u fragmentu krece prazan, sa sesijom krece u obnovu', () => {
    expect(initialContext(false).state).toBe('empty');
    expect(initialContext(true).state).toBe('restoring');
  });

  it('osnovni tok iz specifikacije prolazi do predaje', () => {
    const ctx = run([...TO_RESULTS, 'repairPlanOpened', 'repairStarted', 'repairCompleted', 'submissionOpened']);
    expect(ctx.state).toBe('submission');
    expect(ctx.rejected).toBeNull();
  });

  it('ANALIZA NE POCINJE PRIJE POTVRDE PROFILA', () => {
    // Bez ovoga bi se rad mjerio po profilu koji korisnik nije vidio, pa bi se ocjena odnosila
    // na pravila drugog studija. Jedini ulaz u `analyzing` je iz `profile`.
    // PAZI: odbijen dogadjaj ostavlja stanje nepromijenjeno, pa bi `state === 'analyzing'` samo
    // po sebi lazno prijavilo i sam `analyzing` kao vlastiti ulaz. Broje se ISKLJUCIVO prihvaceni
    // prijelazi. Prva izvedba ovog testa upravo je na tome pala.
    const SVI: WorkspaceEvent[] = ['restoreFound', 'restoreEmpty', 'restoreFailed', 'documentOffered',
      'documentAccepted', 'documentRejected', 'sessionPersisted', 'sessionPersistFailed',
      'profileConfirmed', 'analysisCompleted', 'analysisFailed', 'repairPlanOpened', 'repairStarted',
      'repairCompleted', 'repairFailed', 'submissionOpened', 'documentReplaced', 'recover'];
    const ulazi = WORKSPACE_STATES.filter((from) => {
      const ctx: WorkspaceContext = { state: from, lastSafe: null, sessionPersisted: true, rejected: null };
      return SVI.some((e) => {
        const res = transition(ctx, e);
        return res.rejected === null && res.state === 'analyzing' && from !== 'analyzing';
      });
    });
    expect(ulazi).toEqual(['profile']);
  });

  it('sesija spremna JOS nije potvrdjen profil', () => {
    const ctx = run(['documentOffered', 'documentAccepted']);
    expect(ctx.state).toBe('sessionReady');
    expect(hasDocument(ctx.state)).toBe(true);
    expect(hasConfirmedProfile(ctx.state)).toBe(false);
  });

  it('GRESKA ANALIZE NE BACI RAD: povratak vodi na potvrdjen profil, ne na pocetak', () => {
    const failed = run(['documentOffered', 'documentAccepted', 'sessionPersisted', 'profileConfirmed', 'analysisFailed']);
    expect(failed.state).toBe('error');
    expect(hasDocument(failed.state, failed.lastSafe)).toBe(true);
    const back = transition(failed, 'recover');
    expect(back.state).toBe('profile');
  });

  it('GRESKA POPRAVKA NE BACI ANALIZU: povratak vodi na rezultate', () => {
    const failed = run([...TO_RESULTS, 'repairPlanOpened', 'repairStarted', 'repairFailed']);
    expect(failed.state).toBe('error');
    const back = transition(failed, 'recover');
    expect(back.state).toBe('results');
    expect(hasConfirmedProfile(back.state)).toBe(true);
  });

  it('BEZ ZAPISA NEMA POVEZNICE: neuspjela pohrana vodi dalje, ali bez ponude sesije', () => {
    // Degradacija: rad ostaje u kartici. Poveznica bi vodila na sesiju koja ne postoji.
    const ok = run(['documentOffered', 'documentAccepted', 'sessionPersisted']);
    const degraded = run(['documentOffered', 'documentAccepted', 'sessionPersistFailed']);
    expect(ok.state).toBe('profile');
    expect(degraded.state).toBe('profile'); // isto stanje...
    expect(canLinkSession(ok)).toBe(true);
    expect(canLinkSession(degraded)).toBe(false); // ...ali NE ista ponuda
  });

  it('zamjena dokumenta ponistava zapis, jer stara sesija opisuje drugi rad', () => {
    const ctx = run([...TO_RESULTS, 'documentReplaced']);
    expect(ctx.state).toBe('validating');
    expect(canLinkSession(ctx)).toBe(false);
  });

  it('u gresci se poveznica ne nudi ni kad je sesija bila zapisana', () => {
    const failed = run(['documentOffered', 'documentAccepted', 'sessionPersisted', 'profileConfirmed', 'analysisFailed']);
    expect(failed.sessionPersisted).toBe(true);
    expect(canLinkSession(failed)).toBe(false);
  });

  it('nepoznat dogadjaj se ODBIJA i imenuje, a stanje ostaje', () => {
    // Tiho ignoriran dogadjaj vidi se tek kao zaglavljeno sucelje, bez ijednog traga.
    const ctx = run(['documentOffered']);
    const after = transition(ctx, 'repairStarted');
    expect(after.state).toBe('validating');
    expect(after.rejected).toMatch(/validating.*repairStarted/);
  });

  it('prihvacen dogadjaj brise raniji razlog odbijanja', () => {
    const rejected = transition(run(['documentOffered']), 'repairStarted');
    expect(rejected.rejected).toBeTruthy();
    expect(transition(rejected, 'documentAccepted').rejected).toBeNull();
  });

  it('svako stanje ima unos u tablici, pa nijedno nije slijepa ulica bez namjere', () => {
    const states: WorkspaceState[] = ['restoring', 'empty', 'validating', 'sessionReady', 'profile',
      'analyzing', 'results', 'repairPlan', 'repairing', 'comparison', 'submission', 'error'];
    expect([...WORKSPACE_STATES].sort()).toEqual([...states].sort());
  });

  it('obnova koja nista ne nadje zavrsava prazna, ne u gresci', () => {
    // Prazna ili istekla sesija je uredan ishod, ne kvar: korisnik jednostavno pocinje iznova.
    expect(run(['restoreEmpty'], true).state).toBe('empty');
    expect(run(['restoreFailed'], true).state).toBe('empty');
    expect(run(['restoreFound'], true).state).toBe('sessionReady');
  });
});

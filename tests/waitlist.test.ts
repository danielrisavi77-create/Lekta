import { describe, it, expect } from 'vitest';
import {
  cellCoverage, detectWaitlist, dedupeKeyFor, type CoverageRow,
} from '../src/waitlist/waitlist-detect';
import {
  isLikelyEmail, buildFacultyRequestBody, submitFacultyRequest, attachEmailToRequest,
  submitUnknownFaculty, type WaitlistConfig,
} from '../src/waitlist/waitlist-client';
import { waitlistCopy } from '../src/waitlist/waitlist-copy';

function res(status: number, body: unknown = {}): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
}
function fetchOnce(r: Response, capture?: (url: string, init: RequestInit) => void): typeof fetch {
  return (async (url: string, init: RequestInit) => { capture?.(url, init); return r; }) as unknown as typeof fetch;
}
function failing(): typeof fetch {
  return (async () => { throw new Error('offline'); }) as unknown as typeof fetch;
}

const REGISTRY: CoverageRow[] = [
  { unitId: 'ttf', programs: ['Tekstilni i modni dizajn'], workTypes: ['graduate', 'final'] },
  { unitId: 'ttf', programs: ['Diplomski studiji X'], workTypes: ['graduate'] },
  { unitId: 'fpzg', programs: ['Novinarstvo'], workTypes: ['graduate', 'doctoral'] },
];

describe('cellCoverage', () => {
  it('nalazi profil za tocnu celiju', () => {
    const c = cellCoverage(REGISTRY, 'ttf', 'Tekstilni i modni dizajn', 'graduate');
    expect(c.hasProfileForCell).toBe(true);
    expect(c.unitCoversProgramOtherWorkType).toBe(false);
  });
  it('program pokriven za drugu vrstu rada, ne ovu (stanje B)', () => {
    const c = cellCoverage(REGISTRY, 'ttf', 'Diplomski studiji X', 'final');
    expect(c.hasProfileForCell).toBe(false);
    expect(c.unitCoversProgramOtherWorkType).toBe(true);
  });
  it('program bez ijednog profila (stanje A)', () => {
    const c = cellCoverage(REGISTRY, 'ttf', 'Nepostojeci program', 'graduate');
    expect(c.hasProfileForCell).toBe(false);
    expect(c.unitCoversProgramOtherWorkType).toBe(false);
  });
});

describe('detectWaitlist', () => {
  const base = { facultyId: 'ttf', facultyName: 'TTF', program: 'Neki program', workType: 'graduate' };
  it('nepoznat fakultet (facultyId null)', () => {
    const d = detectWaitlist({ ...base, facultyId: null, facultyName: 'Neki fakultet' });
    expect(d.state).toBe('unknown-faculty');
    expect(d.uncovered).toBe(true);
  });
  it('blokiran izvor -> nepokriveno', () => {
    const d = detectWaitlist({ ...base, blocked: true, coverage: { hasProfileForCell: true, unitCoversProgramOtherWorkType: false } });
    expect(d.state).toBe('faculty-uncovered');
    expect(d.uncovered).toBe(true);
  });
  it('ima profil -> pokriveno', () => {
    const d = detectWaitlist({ ...base, coverage: { hasProfileForCell: true, unitCoversProgramOtherWorkType: false } });
    expect(d.state).toBe('covered');
    expect(d.uncovered).toBe(false);
  });
  it('pokriven drugi work_type -> worktype-uncovered', () => {
    const d = detectWaitlist({ ...base, coverage: { hasProfileForCell: false, unitCoversProgramOtherWorkType: true } });
    expect(d.state).toBe('worktype-uncovered');
    expect(d.uncovered).toBe(true);
  });
  it('nista nije pokriveno -> faculty-uncovered', () => {
    const d = detectWaitlist({ ...base, coverage: { hasProfileForCell: false, unitCoversProgramOtherWorkType: false } });
    expect(d.state).toBe('faculty-uncovered');
    expect(d.uncovered).toBe(true);
  });
  it('bez coverage argumenta pretpostavlja nepokriveno', () => {
    expect(detectWaitlist(base).state).toBe('faculty-uncovered');
  });
});

describe('dedupeKeyFor', () => {
  it('znana celija: fakultet|program|vrsta', () => {
    expect(dedupeKeyFor({ facultyId: 'ttf', facultyName: 'TTF', program: 'X', workType: 'graduate' }))
      .toBe('wl:ttf|X|graduate');
  });
  it('nepoznat fakultet: normalizirano ime', () => {
    expect(dedupeKeyFor({ facultyId: null, facultyName: '  Neki   Fakultet ', program: null, workType: 'final' }))
      .toBe('wl:raw:neki fakultet');
  });
});

describe('isLikelyEmail', () => {
  it('prihvaca valjan', () => expect(isLikelyEmail(' a@b.hr ')).toBe(true));
  it('odbija bez domene / s razmakom / prazno', () => {
    expect(isLikelyEmail('a@b')).toBe(false);
    expect(isLikelyEmail('a b@c.hr')).toBe(false);
    expect(isLikelyEmail('')).toBe(false);
    expect(isLikelyEmail(null)).toBe(false);
  });
});

describe('buildFacultyRequestBody', () => {
  const cell = { facultyId: 'fpzg', facultyName: 'FPZG', program: 'Novinarstvo', workType: 'doctoral' };
  it('mapira profilsku vrstu rada u naplatnu i drzi valjan e-mail', () => {
    const b = buildFacultyRequestBody(cell, { email: ' me@x.hr ' });
    expect(b.workType).toBe('doktorski');
    expect(b.email).toBe('me@x.hr');
    expect(b.source).toBe('upload_flow');
  });
  it('odbacuje neispravan e-mail (null)', () => {
    expect(buildFacultyRequestBody(cell, { email: 'nije-mail' }).email).toBeNull();
  });
  it('nepoznata profilska vrsta pada na zavrsni', () => {
    expect(buildFacultyRequestBody({ ...cell, workType: 'nesto' }).workType).toBe('zavrsni');
  });
  it('reze predugo ime fakulteta', () => {
    const long = 'x'.repeat(500);
    expect(buildFacultyRequestBody({ ...cell, facultyName: long }).facultyName!.length).toBe(200);
  });
});

const CFG: WaitlistConfig = { endpoint: 'https://p.functions.supabase.co/faculty-request', anonKey: 'anon-1' };
const BODY = buildFacultyRequestBody({ facultyId: 'ttf', facultyName: 'TTF', program: 'X', workType: 'graduate' });

describe('submitFacultyRequest', () => {
  it('bez endpointa: preskoci, nema mreze', async () => {
    const r = await submitFacultyRequest({ endpoint: '' }, BODY, '', fetchOnce(res(500)));
    expect(r).toEqual({ kind: 'skipped', reason: 'not_configured' });
  });
  it('2xx vraca requestId', async () => {
    const r = await submitFacultyRequest(CFG, BODY, '', fetchOnce(res(200, { requestId: 'req-9' })));
    expect(r).toEqual({ kind: 'ok', requestId: 'req-9' });
  });
  it('2xx bez id-a (rate-limited tiho) -> ok s null', async () => {
    const r = await submitFacultyRequest(CFG, BODY, '', fetchOnce(res(200, {})));
    expect(r).toEqual({ kind: 'ok', requestId: null });
  });
  it('salje apikey i Authorization (anon kad nema JWT-a)', async () => {
    let init: any = {};
    await submitFacultyRequest(CFG, BODY, '', fetchOnce(res(200, {}), (_u, i) => { init = i; }));
    expect(init.headers.apikey).toBe('anon-1');
    expect(init.headers.Authorization).toBe('Bearer anon-1');
  });
  it('koristi JWT kad je prijavljen', async () => {
    let init: any = {};
    await submitFacultyRequest(CFG, BODY, 'jwt-user', fetchOnce(res(200, {}), (_u, i) => { init = i; }));
    expect(init.headers.Authorization).toBe('Bearer jwt-user');
  });
  it('mrezna greska -> error', async () => {
    const r = await submitFacultyRequest(CFG, BODY, '', failing());
    expect(r.kind).toBe('error');
  });
  it('ne-2xx -> error sa statusom', async () => {
    const r = await submitFacultyRequest(CFG, BODY, '', fetchOnce(res(500)));
    expect(r).toMatchObject({ kind: 'error', status: 500 });
  });
});

describe('waitlistCopy', () => {
  const cell = { facultyId: 'x', facultyName: 'Filozofski fakultet', program: 'Povijest', workType: 'graduate' };
  it('faculty-uncovered spominje ime fakulteta', () => {
    const c = waitlistCopy({ state: 'faculty-uncovered', uncovered: true, cell, dedupeKey: 'k' });
    expect(c.title).toContain('Filozofski fakultet');
    expect(c.body).toContain('opća akademska pravila');
    expect(c.success).toContain('Filozofski fakultet');
  });
  it('worktype-uncovered spominje vrstu rada', () => {
    const c = waitlistCopy({ state: 'worktype-uncovered', uncovered: true, cell, dedupeKey: 'k' }, { workTypeLabel: 'doktorski rad' });
    expect(c.title).toContain('doktorski rad');
    expect(c.body).toContain('doktorski rad');
  });
  it('zajednicki tekstovi bez crtica i s privatnosnom napomenom', () => {
    const c = waitlistCopy({ state: 'faculty-uncovered', uncovered: true, cell, dedupeKey: 'k' });
    expect(c.note).toBe('Bez imena bilježimo da je ovaj fakultet tražen; e-mail koristimo samo za tu jednu obavijest.');
    expect(c.cta).toBeTruthy();
    // bez em/en crtica u tekstovima
    for (const v of Object.values(c)) expect(v).not.toMatch(/[–—]/);
  });
});

describe('submitUnknownFaculty', () => {
  it('salje facultyId null + slobodni naziv + source no_faculty', async () => {
    let body: any = {};
    const r = await submitUnknownFaculty(CFG, { name: 'Neki fakultet', workType: 'graduate', email: 'a@b.hr' }, '',
      fetchOnce(res(200, { requestId: 'r1' }), (_u, i) => { body = JSON.parse(i.body as string); }));
    expect(r).toEqual({ kind: 'ok', requestId: 'r1' });
    expect(body.facultyId).toBeNull();
    expect(body.facultyName).toBe('Neki fakultet');
    expect(body.source).toBe('no_faculty');
    expect(body.email).toBe('a@b.hr');
  });
  it('bez endpointa preskoci', async () => {
    const r = await submitUnknownFaculty({ endpoint: '' }, { name: 'X', workType: 'final' }, '', fetchOnce(res(200)));
    expect(r).toEqual({ kind: 'skipped', reason: 'not_configured' });
  });
});

describe('attachEmailToRequest', () => {
  it('bez endpointa: preskoci', async () => {
    const r = await attachEmailToRequest({ endpoint: '' }, 'req-1', 'a@b.hr', '', fetchOnce(res(200)));
    expect(r).toEqual({ kind: 'skipped', reason: 'not_configured' });
  });
  it('bez requestId-a: preskoci (poziv ide preko submit s e-mailom)', async () => {
    const r = await attachEmailToRequest(CFG, null, 'a@b.hr', '', fetchOnce(res(200)));
    expect(r).toEqual({ kind: 'skipped', reason: 'no_request' });
  });
  it('neispravan e-mail -> error bez mreze', async () => {
    const r = await attachEmailToRequest(CFG, 'req-1', 'nije-mail', '', fetchOnce(res(200)));
    expect(r.kind).toBe('error');
  });
  it('2xx attached true', async () => {
    const r = await attachEmailToRequest(CFG, 'req-1', 'a@b.hr', '', fetchOnce(res(200, { attached: true })));
    expect(r).toEqual({ kind: 'ok', attached: true });
  });
  it('ne-2xx -> error', async () => {
    const r = await attachEmailToRequest(CFG, 'req-1', 'a@b.hr', '', fetchOnce(res(409)));
    expect(r).toMatchObject({ kind: 'error', status: 409 });
  });
});

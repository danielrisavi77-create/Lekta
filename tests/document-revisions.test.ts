import { beforeEach, describe, expect, it } from 'vitest';
import {
  documentFingerprintFromResult,
  linkVerdict,
  revisionSnapshotFromResult,
  sanitizeStoredRevision,
  storedRevisionFromResult,
} from '../src/history/revision-snapshot';
import { createRevisions, NOTICE_REVISION_NOT_SAVED } from '../src/routes/workspace/revisions';
import { revisionLinkPromptHtml, revisionSummaryHtml } from '../src/ui/results/revision-summary';
import { compareFindingRevisions } from '../src/history/finding-revisions';
import { sanitizeLocalDocumentSession, type LocalDocumentSessionStore, type LocalDocumentSessionV1 } from '../src/session/local-document-session';

/**
 * T12: ucitavanje nove verzije rada i prikaz napretka.
 *
 * Sto se tvrdi: snimka iz rezultata NE nosi sadrzaj rada; identitet se ne izvodi iz imena datoteke; slab pogodak
 * trazi potvrdu, razlicit rad se ne spaja sam; promjena pravila ne prikazuje deltu kao napredak; puna kvota ne
 * prekida analizu nego javi da revizija nije spremljena; stariji zapis sesije bez revizija ostaje citljiv.
 */
const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function rezultat(over: { checks?: unknown[]; title?: string; author?: string; headings?: { level: number; text: string }[]; profile?: string; rules?: string; version?: string; at?: string } = {}) {
  return {
    version: over.version ?? '2.2.1',
    generatedAt: over.at ?? '2026-09-10T10:00:00.000Z',
    checks: over.checks ?? [
      { id: 'format.spacing.body', title: 'Prored osnovnog teksta', status: 'fail', earned: 0, max: 5 },
      { id: 'page.margins', title: 'Margine dokumenta', status: 'pass', earned: 3, max: 3 },
      { id: 'toc.format', title: 'Font sadržaja', status: 'unmeasurable', earned: 0, max: 2 },
    ],
    documentStructure: {
      title: over.title ?? 'Politička participacija mladih u Hrvatskoj',
      author: over.author ?? 'Ana Anić',
      headings: over.headings ?? [{ level: 1, text: '1. Uvod' }, { level: 1, text: '2. Metodologija' }, { level: 1, text: '3. Zaključak' }],
    },
    details: { profileDefinitionId: over.profile ?? 'fpzg-politologija-zavrsni', profileFingerprint: over.rules ?? 'fp-1' },
  };
}

describe('snimka revizije iz rezultata', () => {
  it('nosi samo identitete provjera i ishode, nikad tekst rada ni ime datoteke', () => {
    const snap = revisionSnapshotFromResult(rezultat(), 'g1');
    expect(snap.findings).toEqual([
      { ruleId: 'format.spacing.body', scopeKey: null, outcome: 'fail' },
      { ruleId: 'page.margins', scopeKey: null, outcome: 'pass' },
      { ruleId: 'toc.format', scopeKey: null, outcome: 'unmeasurable' },
    ]);
    // SNIMKA (ono sto se usporedjuje) ne nosi nista iz teksta rada. Otisak identiteta (fingerprint) nosi
    // NORMALIZIRAN naslov i naslove poglavlja, kao i postojeci `document_slots.fingerprint`; zivi samo lokalno.
    const json = JSON.stringify(snap);
    expect(json).not.toMatch(/participacija|Ana Ani|Uvod|\.docx/i);
    expect(JSON.stringify(storedRevisionFromResult(rezultat(), 'g1'))).not.toMatch(/\.docx/i);
    expect(snap.profileId).toBe('fpzg-politologija-zavrsni');
    expect(snap.rulesFingerprint).toBe('fp-1');
  });

  it('otisak identiteta dolazi iz naslova, autora i naslova poglavlja, ne iz imena datoteke', () => {
    const fp = documentFingerprintFromResult(rezultat());
    expect(fp.sectionCount).toBe(3);
    expect(fp.headings.length).toBe(3);
    expect(fp.titleNorm.length).toBeGreaterThan(0);
  });
});

describe('povezivanje verzija', () => {
  it('isti naslov = isti rad, bez pitanja', () => {
    expect(linkVerdict(documentFingerprintFromResult(rezultat()), documentFingerprintFromResult(rezultat({ headings: [{ level: 1, text: '1. Uvod' }] })))).toBe('same');
  });

  it('drugi naslov uz istog autora ili dio poglavlja = slab pogodak, trazi potvrdu', () => {
    const a = documentFingerprintFromResult(rezultat());
    const b = documentFingerprintFromResult(rezultat({ title: 'Sasvim drugi naslov rada', headings: [{ level: 1, text: 'Sažetak' }] }));
    expect(linkVerdict(a, b)).toBe('weak');
  });

  it('bez naslova prvi "Uvod" NIJE naslov: dva rada bez naslova s istim prvim poglavljem nisu automatski isti', () => {
    const a = documentFingerprintFromResult(rezultat({ title: '', author: 'Ana Anić', headings: [{ level: 1, text: 'Uvod' }, { level: 1, text: 'Politika' }] }));
    const b = documentFingerprintFromResult(rezultat({ title: '', author: 'Ivo Ivić', headings: [{ level: 1, text: 'Uvod' }, { level: 1, text: 'Kemija' }, { level: 1, text: 'Fizika' }] }));
    expect(a.titleNorm).toBe('');
    expect(linkVerdict(a, b)).not.toBe('same');
  });

  it('bez naslova i autora, gotovo identican skup od barem tri poglavlja je isti rad (verzija nakon popravka)', () => {
    const h = [{ level: 1, text: '1. Uvod' }, { level: 1, text: '2. Politicki sustav' }, { level: 1, text: '3. Rasprava' }, { level: 1, text: '4. Zakljucak' }];
    const a = documentFingerprintFromResult(rezultat({ title: '', author: '', headings: h }));
    const b = documentFingerprintFromResult(rezultat({ title: '', author: '', headings: h }));
    expect(linkVerdict(a, b)).toBe('same');
    // Dva poglavlja nisu dovoljna, ma koliko jednaka bila.
    const c = documentFingerprintFromResult(rezultat({ title: '', author: '', headings: h.slice(0, 2) }));
    const d = documentFingerprintFromResult(rezultat({ title: '', author: '', headings: h.slice(0, 2) }));
    expect(linkVerdict(c, d)).toBe('weak');
  });

  it('drugi naslov, drugi autor, druga poglavlja = drugi rad, ne spaja se sam', () => {
    const a = documentFingerprintFromResult(rezultat());
    const b = documentFingerprintFromResult(rezultat({ title: 'Analiza tržišta kapitala', author: 'Ivo Ivić', headings: [{ level: 1, text: 'Pregled literature' }] }));
    expect(linkVerdict(a, b)).toBe('different');
  });
});

describe('sanitizacija pohranjene revizije', () => {
  it('ispravan zapis prolazi, nepotpun vraca null (nikad djelomican objekt)', () => {
    const ok = storedRevisionFromResult(rezultat(), 'g1', 1000);
    expect(sanitizeStoredRevision(JSON.parse(JSON.stringify(ok)))).toEqual(ok);
    expect(sanitizeStoredRevision({ ...ok, schemaVersion: 2 })).toBeNull();
    expect(sanitizeStoredRevision({ ...ok, snapshot: { ...ok.snapshot, findings: [{ ruleId: 'x', scopeKey: null, outcome: 'maybe' }] } })).toBeNull();
    expect(sanitizeStoredRevision(null)).toBeNull();
  });

  it('starija sesija BEZ revizija ostaje citljiva; neispravna revizija se izostavi, sesija ostaje', () => {
    const bytes = new Uint8Array([1, 2, 3]).buffer;
    const base = {
      schemaVersion: 1, id: '11111111-2222-4333-8444-555555555555', createdAt: Date.now(), expiresAt: Date.now() + 3_600_000,
      document: { name: 'rad.docx', type: 'application/x', lastModified: 1, bytes },
      intake: { kind: 'ok', quickStats: { words: 1234, pages: 8 }, suspicious: false, suspicionReason: null, capability: { canAnalyze: true, canRepair: true, totalDeclaredBytes: 32768, entryCount: 12, repairBlocker: null } },
      workspace: { stage: 'results' },
    };
    const stara = sanitizeLocalDocumentSession(base as never);
    expect(stara, 'osnovna sesija mora proci sanitizaciju, inace tvrdnje nize ne mjere nista').not.toBeNull();
    expect(stara?.workspace?.stage).toBe('results');
    expect(stara?.workspace?.revision).toBeUndefined();
    const sNeispravnom = sanitizeLocalDocumentSession({ ...base, workspace: { stage: 'results', revision: { schemaVersion: 1 } } } as never);
    expect(sNeispravnom?.workspace?.stage).toBe('results');
    expect(sNeispravnom?.workspace?.revision).toBeUndefined();
    const rev = storedRevisionFromResult(rezultat(), 'g1', 5);
    const sIspravnom = sanitizeLocalDocumentSession({ ...base, workspace: { stage: 'results', revision: rev, previousRevision: rev } } as never);
    expect(sIspravnom?.workspace?.revision).toEqual(rev);
    expect(sIspravnom?.workspace?.previousRevision).toEqual(rev);
  });
});

describe('prikaz razlike', () => {
  const prije = revisionSnapshotFromResult(rezultat(), 'g1');
  const titleOf = (k: string) => ({ 'format.spacing.body@document': 'Prored osnovnog teksta', 'page.margins@document': 'Margine dokumenta' } as Record<string, string>)[k] ?? k;

  it('rijeseno, novo i neizvjesno su odvojene skupine; blokator sprjecava "spremno"', () => {
    const poslije = revisionSnapshotFromResult(rezultat({ checks: [
      { id: 'format.spacing.body', title: 'Prored osnovnog teksta', status: 'pass', earned: 5, max: 5 },
      { id: 'page.margins', title: 'Margine dokumenta', status: 'fail', earned: 0, max: 3 },
      { id: 'toc.format', title: 'Font sadržaja', status: 'unmeasurable', earned: 0, max: 2 },
    ] }), 'g1');
    const delta = compareFindingRevisions(prije, poslije);
    const html = revisionSummaryHtml({ delta, titleOf, previousAt: 0, hasOpenBlocker: true }, esc);
    expect(html).toContain('Riješeno (1)');
    expect(html).toContain('Novi problemi (1)');
    expect(html).toContain('Prored osnovnog teksta');
    expect(html).toContain('Margine dokumenta');
    expect(html).toContain('Ostaju otvoreni nalazi');
    expect(html).not.toContain('Spremno za predaju');
  });

  it('promjena pravila: usporedba nije moguca i delta ocjene se ne prikazuje kao napredak', () => {
    const poslije = revisionSnapshotFromResult(rezultat({ rules: 'fp-2' }), 'g1');
    const delta = compareFindingRevisions(prije, poslije);
    expect(delta.comparable).toBe(false);
    const html = revisionSummaryHtml({ delta, titleOf, previousAt: 0, hasOpenBlocker: false }, esc);
    expect(html).toContain('Usporedba nije moguća');
    expect(html).toContain('pravila su promijenjena');
    expect(html).not.toContain('Riješeno (');
  });

  it('pitanje o povezivanju razlikuje slab i razlicit identitet', () => {
    expect(revisionLinkPromptHtml('weak', esc)).toContain('data-revision-link="weak"');
    expect(revisionLinkPromptHtml('different', esc)).toContain('ne izgleda kao isti rad');
  });
});

describe('kontroler revizija u ruti', () => {
  let mount: HTMLElement;
  let updates: unknown[];
  let statusi: (string | null)[];
  let events: string[];
  let failQuota = false;
  const store = {
    update: async (_id: string, u: unknown) => { if (failQuota) throw new Error('quota'); updates.push(u); return {} as LocalDocumentSessionV1; },
  } as unknown as LocalDocumentSessionStore;

  beforeEach(() => {
    document.body.innerHTML = '<section id="m" class="hidden"></section>';
    mount = document.getElementById('m')!;
    updates = []; statusi = []; events = []; failQuota = false;
  });

  const make = () => createRevisions({ store: () => store, sessionId: () => 's1', mount: () => mount, esc, status: (t) => statusi.push(t), track: (e) => events.push(e) });

  it('prva analiza: snimka se spremi, nema usporedbe; nova verzija istog rada daje usporedbu i dogadjaj', async () => {
    const r = make();
    r.onResult(rezultat(), 1);
    await Promise.resolve();
    expect(updates.length).toBe(1);
    expect(mount.classList.contains('hidden')).toBe(true);
    r.beginNewVersion();
    r.onResult(rezultat({ checks: [{ id: 'format.spacing.body', title: 'Prored osnovnog teksta', status: 'pass', earned: 5, max: 5 }], at: '2026-09-11T10:00:00.000Z' }), 2);
    expect(mount.classList.contains('hidden')).toBe(false);
    expect(mount.querySelector('[data-revision-comparable="da"]')).not.toBeNull();
    expect(mount.textContent).toContain('Riješeno (1)');
    expect(events).toEqual(['revision_compared']);
  });

  it('slab identitet: pita, ne spaja; "Ne" daje novu skupinu bez usporedbe', () => {
    const r = make();
    r.onResult(rezultat(), 1);
    r.beginNewVersion();
    r.onResult(rezultat({ title: 'Sasvim drugi naslov rada', headings: [{ level: 1, text: 'Sažetak' }] }), 2);
    expect(mount.querySelector('[data-revision-link="weak"]')).not.toBeNull();
    expect(events).toEqual([]);
    const staraGrupa = r.state.groupId;
    mount.querySelector<HTMLButtonElement>('[data-revision-link-no]')!.click();
    expect(r.state.previous).toBeNull();
    expect(r.state.groupId).not.toBe(staraGrupa);
    expect(mount.classList.contains('hidden')).toBe(true);
  });

  it('slab identitet, "Da": usporedba se napravi u istoj skupini', () => {
    const r = make();
    r.onResult(rezultat(), 1);
    r.beginNewVersion();
    r.onResult(rezultat({ title: 'Sasvim drugi naslov rada', headings: [{ level: 1, text: 'Sažetak' }] }), 2);
    mount.querySelector<HTMLButtonElement>('[data-revision-link-yes]')!.click();
    expect(mount.querySelector('[data-revision-comparable]')).not.toBeNull();
    expect(events).toEqual(['revision_compared']);
  });

  it('puna kvota: analiza i usporedba ostaju, korisnik dobije poruku da revizija nije spremljena', async () => {
    const r = make();
    failQuota = true;
    r.onResult(rezultat(), 1);
    await new Promise((res) => setTimeout(res, 0));
    expect(statusi).toContain(NOTICE_REVISION_NOT_SAVED);
    expect(r.state.current).not.toBeNull();
  });

  it('obnova iz sesije vraca prethodnu snimku, pa usporedba prezivi ponovno ucitavanje', () => {
    const r = make();
    const prev = storedRevisionFromResult(rezultat(), 'g-restore', 1);
    r.restore(undefined, prev);
    r.onResult(rezultat({ checks: [{ id: 'format.spacing.body', title: 'Prored osnovnog teksta', status: 'pass', earned: 5, max: 5 }] }), 2);
    expect(mount.querySelector('[data-revision-comparable="da"]')).not.toBeNull();
    expect(r.state.current?.snapshot.documentGroupId).toBe('g-restore');
  });
});

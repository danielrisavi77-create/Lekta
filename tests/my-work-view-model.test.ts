import { describe, expect, it } from 'vitest';
import { accountView, expiryLabel, localWorkView } from '../src/routes/my-work/view-model';
import type { LocalDocumentSessionSummary } from '../src/session/local-document-session';
import type { RepairJob } from '../src/report/repair-history';

/**
 * MODEL PRIKAZA `/moji-radovi/`.
 *
 * Sve tvrdnje ovdje sluze JEDNOJ razlici: nepoznato stanje se ne smije prikazati kao tvrdnja o
 * korisniku. Stranica koja kaze "nemas spremljenih radova" studentu koji ih ima (a pohrana je
 * odbijena) laze u smjeru u kojem se laz ne primijeti, jer izgleda kao uredan prazan popis.
 */

const NOW = 1_700_000_000_000;
const H = 3_600_000;

function summary(over: Partial<LocalDocumentSessionSummary> = {}): LocalDocumentSessionSummary {
  return { id: 'a1', name: 'rad.docx', createdAt: NOW - H, expiresAt: NOW + 5 * H, stage: 'results', ...over };
}

function job(over: Partial<RepairJob> = {}): RepairJob {
  return {
    id: 'j1', workType: 'diplomski', label: null, status: 'done',
    originalBytes: 10, resultBytes: 12, changesCount: 3,
    resultPath: 'x/y.docx', createdAt: '2026-09-01T10:00:00Z', deleting: false, ...over,
  };
}

describe('lokalni rad', () => {
  it('NEDOSTUPNA POHRANA nije prazan popis', () => {
    // Srz cijele datoteke. Da se ova dva stopila, student u privatnom prozoru procitao bi da nema
    // rad koji ima, a nijedan zeleni test to ne bi vidio, jer prazan popis izgleda uredno.
    const v = localWorkView({ ok: false, reason: 'IndexedDB odbijen' }, NOW);
    expect(v.kind).toBe('unavailable');
    expect(v.kind === 'unavailable' && v.reason).toBe('IndexedDB odbijen');
  });

  it('prazna pohrana JEST tvrdnja o korisniku', () => {
    expect(localWorkView({ ok: true, summaries: [] }, NOW).kind).toBe('empty');
  });

  it('istekle sesije se ne nude, ni kad ih pohrana vrati', () => {
    // Rok je obecanje korisniku; poveznica na istekli rad vodi u prazan zaslon.
    const v = localWorkView({ ok: true, summaries: [summary({ expiresAt: NOW - 1 })] }, NOW);
    expect(v.kind).toBe('empty');
  });

  it('poveznica nosi SAMO nasumican id sesije, nikad ime dokumenta', () => {
    // Fragment se ne salje posluzitelju, ali stoji u povijesti preglednika i u dijeljenom linku.
    const v = localWorkView({ ok: true, summaries: [summary({ id: 'x9', name: 'Diplomski Ana Anic.docx' })] }, NOW);
    const item = v.kind === 'list' ? v.items[0] : null;
    expect(item?.href).toBe('/rad/#session=x9');
    expect(item?.href).not.toContain('Ana');
    expect(item?.href).not.toContain('.docx');
  });

  it('rok se prikazuje, jer bi presucen rok bio zavaravanje', () => {
    expect(expiryLabel(NOW + 5 * H, NOW)).toContain('5 h');
    expect(expiryLabel(NOW + 90_000, NOW)).toContain('min');
    expect(expiryLabel(NOW - 1, NOW)).toBe('istekao');
  });

  it('nepoznata faza ne rusi prikaz nego dobiva neutralnu oznaku', () => {
    const v = localWorkView({ ok: true, summaries: [summary({ stage: 'nesto-novo' as never })] }, NOW);
    expect(v.kind === 'list' && v.items[0].stageLabel).toBe('u tijeku');
  });
});

describe('racun', () => {
  const base = { configured: true, now: NOW, jobs: { ok: true as const, jobs: [] as RepairJob[] } };

  it('NEKONFIGURIRAN backend nije odjava', () => {
    // Inace bi stranica ponudila prijavu koja nigdje ne vodi.
    expect(accountView({ ...base, configured: false, session: null }).kind).toBe('not-configured');
  });

  it('bez sesije: odjavljen', () => {
    expect(accountView({ ...base, session: null }).kind).toBe('signed-out');
  });

  it('ISTEKLA sesija se imenuje, ne prikazuje kao odjava', () => {
    // Razlika je vazna korisniku: istekla prijava se produzi, odjava trazi novu prijavu.
    const v = accountView({ ...base, session: { email: 'a@b.hr', expiresAt: NOW - 1 } });
    expect(v.kind).toBe('expired');
  });

  it('PAO DOHVAT nije prazan popis popravaka', () => {
    const v = accountView({ ...base, session: { email: 'a@b.hr' }, jobs: { ok: false, message: 'mreza' } });
    expect(v.kind).toBe('error');
    expect(v.kind === 'error' && v.message).toBe('mreza');
  });

  it('posao koji se BRISE se ne nudi za preuzimanje', () => {
    // Blobovi su vec uklonjeni ili se uklanjaju, pa bi potpisani URL vodio u nista.
    const v = accountView({ ...base, session: { email: 'a@b.hr' }, jobs: { ok: true, jobs: [job({ deleting: true })] } });
    expect(v.kind === 'jobs' && v.items[0].downloadable).toBe(false);
    expect(v.kind === 'jobs' && v.items[0].statusLabel).toBe('briše se');
  });

  it('nedovrsen posao se ne nudi za preuzimanje', () => {
    const v = accountView({ ...base, session: { email: 'a@b.hr' }, jobs: { ok: true, jobs: [job({ status: 'running' })] } });
    expect(v.kind === 'jobs' && v.items[0].downloadable).toBe(false);
  });

  it('dovrsen posao se nudi', () => {
    const v = accountView({ ...base, session: { email: 'a@b.hr' }, jobs: { ok: true, jobs: [job()] } });
    expect(v.kind === 'jobs' && v.items[0].downloadable).toBe(true);
  });
});

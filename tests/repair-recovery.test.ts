import { beforeEach, describe, expect, it } from 'vitest';
import { recoveryFor } from '../src/repair/recovery-policy';
import { renderRepairRecovery } from '../src/ui/repair-recovery-view';
import { verifiedOutcomeFrom } from '../src/repair/repair-outcome-verified';
import { repairOutcomeHtml } from '../src/ui/results/repair-outcome-view';

/**
 * T10: oporavak nakon greske i provjereni ishod.
 *
 * Politika oporavka: nepoznat ishod NAKON slanja ne smije zavrsiti slijepim ponovnim pokusajem (drugi naplativi
 * posao); prvo provjera postojeceg posla. Odgovor servera (bilo koji status) daje poznat ishod i ponovni pokusaj je
 * siguran. Prikaz to provodi: gumb za ponovni pokusaj je onemogucen dok se provjera ne otvori.
 */
const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

describe('recoveryFor', () => {
  it('mrezna greska bez statusa NAKON slanja trazi provjeru postojeceg posla, bez ponovnog pokusaja', () => {
    const r = recoveryFor({ kind: 'error', message: 'Failed to fetch' }, 'after-send');
    expect(r.action).toBe('check-existing-job');
    expect(r.retryAllowed).toBe(false);
    expect(r.message).toMatch(/Moje popravke/);
  });

  it('ista greska PRIJE slanja dopusta ponovni pokusaj odmah', () => {
    const r = recoveryFor({ kind: 'error', message: 'Failed to fetch' }, 'before-send');
    expect(r.action).toBe('retry');
    expect(r.retryAllowed).toBe(true);
  });

  it('odgovor servera (status) je poznat ishod: ponovni pokusaj siguran', () => {
    expect(recoveryFor({ kind: 'error', status: 500, message: 'neocekivani odgovor 500' }, 'after-send').action).toBe('retry');
    expect(recoveryFor({ kind: 'error', status: 200, message: 'nedostaje docxBase64' }, 'after-send').retryAllowed).toBe(true);
  });

  it('istekla prava pristupa traze ponovnu prijavu; istekli uvjeti traze osvjezenje privole', () => {
    expect(recoveryFor({ kind: 'unauthorized' }, 'after-send').action).toBe('reauth');
    const c = recoveryFor({ kind: 'error', status: 400, message: 'Uvjeti su azurirani. Osvjezi stranicu i ponovno potvrdi privolu prije popravka.' }, 'after-send');
    expect(c.action).toBe('refresh-consent');
    expect(c.retryAllowed).toBe(false);
  });

  it('kvota, velicina i iskljuceni fixeri nemaju smislen ponovni pokusaj', () => {
    for (const kind of ['rate_limited', 'too_large', 'no_live_fixers', 'paywall']) {
      expect(recoveryFor({ kind }, 'after-send').action, kind).toBe('none');
    }
  });
});

describe('renderRepairRecovery', () => {
  let el: HTMLElement;
  beforeEach(() => { document.body.innerHTML = ''; el = document.createElement('div'); document.body.appendChild(el); });

  it('za nepoznat ishod: ponovni pokusaj je onemogucen dok se ne otvori provjera, pa se otkljuca', () => {
    let retries = 0;
    let opened = 0;
    renderRepairRecovery(el, recoveryFor({ kind: 'error', message: 'x' }, 'after-send'), { retry: () => { retries += 1; }, openJobs: () => { opened += 1; } }, esc);
    const retry = el.querySelector<HTMLButtonElement>('[data-repair-retry]')!;
    const jobs = el.querySelector<HTMLButtonElement>('[data-repair-check-jobs]')!;
    expect(retry.disabled).toBe(true);
    retry.click();
    expect(retries, 'onemogucen gumb ne smije pokrenuti ponovni pokusaj').toBe(0);
    jobs.click();
    expect(opened).toBe(1);
    expect(retry.disabled).toBe(false);
    retry.click();
    expect(retries).toBe(1);
    expect(el.querySelector('[data-repair-recovery]')?.getAttribute('data-repair-recovery')).toBe('check-existing-job');
  });

  it('bez prijave provjera poslova nije dostupna i to se kaze, umjesto tihog no-opa', () => {
    renderRepairRecovery(el, recoveryFor({ kind: 'error', message: 'x' }, 'after-send'), { retry: () => {}, openJobs: null }, esc);
    const jobs = el.querySelector<HTMLButtonElement>('[data-repair-check-jobs]')!;
    expect(jobs.disabled).toBe(true);
    expect(jobs.title).toMatch(/prijave/);
    // Nema slijepe ulice: ponovni pokusaj je dopusten, uz napomenu da prvi popravak mozda jest dovrsen.
    expect(el.querySelector<HTMLButtonElement>('[data-repair-retry]')?.disabled).toBe(false);
    expect(el.querySelector('[data-repair-recovery-note="no-jobs"]')?.textContent).toMatch(/dovršena kopija/);
  });

  it('za poznat ishod ponovni pokusaj je odmah dopusten; za `none` nema gumba', () => {
    renderRepairRecovery(el, recoveryFor({ kind: 'error', status: 500, message: 'pao' }, 'after-send'), { retry: () => {}, openJobs: null }, esc);
    expect(el.querySelector<HTMLButtonElement>('[data-repair-retry]')?.disabled).toBe(false);
    expect(el.querySelector('[data-repair-check-jobs]')).toBeNull();
    renderRepairRecovery(el, recoveryFor({ kind: 'rate_limited' }, 'after-send'), { retry: () => {}, openJobs: null }, esc);
    expect(el.querySelector('[data-repair-retry]')).toBeNull();
  });
});

describe('verifiedOutcomeFrom + repairOutcomeHtml', () => {
  const before = [
    { id: 'format.spacing.body', title: 'Prored osnovnog teksta', status: 'fail', earned: 0, max: 5 },
    { id: 'element.table.caption', title: 'Naslovi tablica', status: 'fail', earned: 0, max: 4 },
    { id: 'page.margins', title: 'Margine dokumenta', status: 'pass', earned: 3, max: 3 },
    { id: 'toc.format', title: 'Font i veličina sadržaja', status: 'pass', earned: 2, max: 2 },
  ];
  const selected = [
    { ruleId: 'r-spacing', matchKeys: ['Prored osnovnog teksta'] },
    { ruleId: 'r-heading', matchKeys: ['Naslovi tablica'] },
  ];

  it('razdvaja rijeseno, nerijeseno i regresiju izvan odabira; broj zahvata je zasebna velicina', () => {
    const after = [
      { id: 'format.spacing.body', title: 'Prored osnovnog teksta', status: 'pass', earned: 5, max: 5 },
      { id: 'element.table.caption', title: 'Naslovi tablica', status: 'fail', earned: 0, max: 4 },
      { id: 'page.margins', title: 'Margine dokumenta', status: 'pass', earned: 3, max: 3 },
      { id: 'toc.format', title: 'Font i veličina sadržaja', status: 'fail', earned: 0, max: 2 },
    ];
    const o = verifiedOutcomeFrom({ before, after, selected, skippedRuleIds: [], integrity: 'passed' });
    expect(o.resolvedIds).toEqual(['format.spacing.body']);
    expect(o.unresolvedIds).toEqual(['element.table.caption']);
    expect(o.regressedIds, 'regresija izvan odabranog skupa se broji').toEqual(['toc.format']);
    expect(o.recommendRepairedCopy).toBe(false);
    const html = repairOutcomeHtml({ outcome: o, titleOf: (id) => id, manualOnlyIds: [], appliedChangeCount: 7 }, esc);
    expect(html).toContain('Riješeno 1 od 2 ciljanih provjera');
    expect(html).toContain('Izvršeno zahvata u dokumentu: 7');
    expect(html).toContain('Regresija');
    expect(html).toContain('data-repair-recommend="ne"');
  });

  it('preskocen zahvat daje preskocenu provjeru, ne nerijesenu; neizmjereno nije rijeseno', () => {
    const after = [
      { id: 'format.spacing.body', title: 'Prored osnovnog teksta', status: 'unmeasurable', earned: 0, max: 5 },
      { id: 'element.table.caption', title: 'Naslovi tablica', status: 'fail', earned: 0, max: 4 },
      { id: 'page.margins', title: 'Margine dokumenta', status: 'pass', earned: 3, max: 3 },
      { id: 'toc.format', title: 'Font i veličina sadržaja', status: 'pass', earned: 2, max: 2 },
    ];
    const o = verifiedOutcomeFrom({ before, after, selected, skippedRuleIds: ['r-heading'], integrity: 'passed' });
    expect(o.skippedIds).toEqual(['element.table.caption']);
    expect(o.resolvedIds).toEqual([]);
    expect(o.unresolvedIds).toEqual(['format.spacing.body']);
    expect(o.regressedIds).toEqual([]);
    expect(o.recommendRepairedCopy).toBe(true);
  });

  it('bez ponovne analize nista nije rijeseno i integritet je `not-verified`', () => {
    const o = verifiedOutcomeFrom({ before, after: null, selected, skippedRuleIds: [], integrity: 'passed' });
    expect(o.resolvedIds).toEqual([]);
    expect(o.integrity).toBe('not-verified');
    const html = repairOutcomeHtml({ outcome: o, titleOf: (id) => id, manualOnlyIds: ['page.margins'], appliedChangeCount: 1 }, esc);
    expect(html).toContain('nije provjerena');
    expect(html).toContain('Ostaje za ručnu provjeru (1)');
  });
});

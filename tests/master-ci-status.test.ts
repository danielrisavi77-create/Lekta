import { describe, expect, it } from 'vitest';
// @ts-expect-error: cisti .mjs alat bez tipova, namjerno izvan `src/`
import { formatOcjenu, ocijeniRunove } from '../scripts/master-ci-core.mjs';

/**
 * PROSUDBA "JE LI GRANA ZELENA" NAD SINTETSKIM RUNOVIMA.
 *
 * Oba kvara koja ovi testovi cuvaju izmjerena su 2026-09-05/06, na vlastitom radu:
 *
 *   1. Alat je pitao SAMO `check.yml`, pa je `browser-matrix` bio nevidljiv. Bio je crven dva
 *      commita zaredom (firefox/webkit) dok je `check` bio zelen; alat bi javio ZELENO nad granom
 *      koja to nije, a kvar se otkrio tek rucnim gledanjem GitHuba.
 *   2. Sve sto nije `success` brojano je kao pad, pa je prekinuti (`cancelled`) run tudjim pushom
 *      dao lazan nalaz "CRVENO (3)", od cega su dva bila superseded.
 *
 * Zato prosudba ide PO COMMITU kroz SVE workflowe, a `cancelled` je neodlucno, ne pad.
 */

type Run = {
  head_sha: string; status: string; conclusion: string | null;
  name?: string; created_at?: string; html_url?: string;
};

const run = (sha: string, name: string, conclusion: string | null, status = 'completed'): Run =>
  ({ head_sha: sha, name, conclusion, status, created_at: '2026-09-06T10:00:00Z', html_url: `https://x/${name}` });

const ZELEN_COMMIT = (sha: string): Run[] => [
  run(sha, 'check', 'success'), run(sha, 'browser-matrix', 'success'),
  run(sha, 'conformance', 'success'), run(sha, 'repair-slow', 'success'),
];

describe('ocjena CI stanja grane', () => {
  it('kontrola: commit u kojem su svi workflowi uspjeli je ZELEN', () => {
    expect(ocijeniRunove(ZELEN_COMMIT('aaa1')).ishod).toBe('zeleno');
  });

  it('MUTACIJA: jedan pali workflow uz osam zelenih je CRVENO', () => {
    // Tocan oblik noci 2026-09-05: `check` pao, svi ostali prosli. Alat koji gleda samo zadnji
    // dovrseni run ili samo jedan workflow ovdje javi zeleno.
    const runovi = [
      run('bbb2', 'docx-smoke', 'success'), run('bbb2', 'db-smoke', 'success'),
      run('bbb2', 'security-audit', 'success'), run('bbb2', 'conformance', 'success'),
      run('bbb2', 'rule-claims', 'success'), run('bbb2', 'docx-strict-open', 'success'),
      run('bbb2', 'repair-slow', 'success'), run('bbb2', 'browser-matrix', 'success'),
      run('bbb2', 'check', 'failure'),
    ];
    const o = ocijeniRunove(runovi);
    expect(o.ishod).toBe('crveno');
    expect(o.pali.map((p: { name: string }) => p.name)).toEqual(['check']);
  });

  it('MUTACIJA: pao je SAMO browser-matrix, koji je alat prije ignorirao', () => {
    const runovi = [run('ccc3', 'check', 'success'), run('ccc3', 'browser-matrix', 'failure')];
    const o = ocijeniRunove(runovi);
    expect(o.ishod).toBe('crveno');
    expect(o.pali[0].name).toBe('browser-matrix');
  });

  it('MUTACIJA: `cancelled` NIJE pad (superseded tudjim pushom)', () => {
    // Ista noc: `check` i `repair-slow` prekinuti jer je stigao noviji commit; ostali zeleni.
    const runovi = [
      run('ddd4', 'check', 'cancelled'), run('ddd4', 'repair-slow', 'cancelled'),
      run('ddd4', 'docx-smoke', 'success'), run('ddd4', 'conformance', 'success'),
    ];
    expect(ocijeniRunove(runovi).ishod).toBe('zeleno');
  });

  it('commit u kojem su SVI runovi prekinuti je "ne znam", nikad zeleno', () => {
    const runovi = [run('eee5', 'check', 'cancelled'), run('eee5', 'browser-matrix', 'cancelled')];
    const o = ocijeniRunove(runovi);
    expect(o.ishod).toBe('ne-znam');
  });

  it('commit bez ijednog dovrsenog runa je "ne znam", ne zeleno', () => {
    const runovi = [run('fff6', 'check', null, 'in_progress'), run('fff6', 'browser-matrix', null, 'queued')];
    const o = ocijeniRunove(runovi);
    expect(o.ishod).toBe('ne-znam');
    expect(o.razlog).toContain('u tijeku');
  });

  it('niz se broji u COMMITIMA, ne u runovima', () => {
    // Tri crvena commita, svaki s vise runova. Brojanje po runovima dalo bi 9, a istina je 3.
    const crven = (sha: string): Run[] => [
      run(sha, 'check', 'failure'), run(sha, 'browser-matrix', 'failure'), run(sha, 'conformance', 'success'),
    ];
    const o = ocijeniRunove([...crven('g1'), ...crven('g2'), ...crven('g3'), ...ZELEN_COMMIT('g4')]);
    expect(o.ishod).toBe('crveno');
    expect(o.niz).toBe(3);
  });

  it('zeleni commit ispod crvenog prekida niz', () => {
    const o = ocijeniRunove([run('h1', 'check', 'failure'), ...ZELEN_COMMIT('h2'), run('h3', 'check', 'failure')]);
    expect(o.niz).toBe(1);
  });

  it('prazan ulaz je "ne znam": nula runova nije dokaz zdravlja', () => {
    expect(ocijeniRunove([]).ishod).toBe('ne-znam');
    expect(ocijeniRunove(null as never).ishod).toBe('ne-znam');
  });

  it('ispis imenuje pali workflow i broj uzastopnih commita', () => {
    const o = ocijeniRunove([run('i1', 'browser-matrix', 'failure'), run('i2', 'browser-matrix', 'failure')]);
    const tekst = formatOcjenu(o, 'docx-truthful-status').join('\n');
    expect(tekst).toContain('CRVENO');
    expect(tekst).toContain('browser-matrix');
    expect(tekst).toContain('Uzastopnih crvenih COMMITA na vrhu: 2');
  });

  it('MUTACIJA: zakazani smoke nad produkcijom NE obara presudu o kodu', () => {
    // Izmjereno 2026-09-06: `post-deploy-smoke` (cron) pao je 8 uzastopnih commita jer produkcija
    // jos servira staru stranicu (`/rad/` 404, Netlify je na rucnoj objavi). Kod je pritom bio
    // zelen. Bez razlucivanja bi alat proglasio master crvenim i zamaglio pravi nalaz.
    const runovi = [
      { ...run('j1', 'post-deploy-smoke', 'failure'), event: 'schedule' },
      { ...run('j1', 'check', 'success'), event: 'push' },
      { ...run('j1', 'browser-matrix', 'success'), event: 'push' },
    ];
    const o = ocijeniRunove(runovi);
    expect(o.ishod).toBe('zeleno');
    expect(o.produkcija).not.toBeNull();
    expect(o.produkcija.pali[0].name).toBe('post-deploy-smoke');
  });

  it('pad produkcije se PRIJAVLJUJE i kad je kod zelen: tisina je bila kvar', () => {
    const runovi = [
      { ...run('k1', 'post-deploy-smoke', 'failure'), event: 'schedule' },
      { ...run('k1', 'check', 'success'), event: 'push' },
    ];
    const tekst = formatOcjenu(ocijeniRunove(runovi), 'master').join('\n');
    expect(tekst).toContain('ZELENO');
    expect(tekst).toContain('PRODUKCIJA');
    expect(tekst).toContain('post-deploy-smoke');
  });

  it('zakazani run koji PROLAZI ne proizvodi nikakvu prijavu', () => {
    const runovi = [
      { ...run('l1', 'post-deploy-smoke', 'success'), event: 'schedule' },
      { ...run('l1', 'check', 'success'), event: 'push' },
    ];
    const o = ocijeniRunove(runovi);
    expect(o.produkcija).toBeNull();
    expect(formatOcjenu(o, 'master').join('\n')).not.toContain('PRODUKCIJA');
  });

  it('ispis nikad ne prikazuje "ne znam" kao zeleno', () => {
    const tekst = formatOcjenu(ocijeniRunove([]), 'master').join('\n');
    expect(tekst).toContain('NE ZNAM');
    expect(tekst).toContain('NIJE zeleno');
    expect(tekst).not.toMatch(/^ZELENO/m);
  });
});

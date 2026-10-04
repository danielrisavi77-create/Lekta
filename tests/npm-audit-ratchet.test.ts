/**
 * Ratchet nad punim grafom `npm audit` (vanjski audit 2026-09-08, nalaz 6).
 *
 * Do 2026-09-09 broj high/critical nalaza u punom grafu samo se ISPISIVAO u koraku s
 * `continue-on-error`, pa je rast bio nevidljiv: komentar u workflowu tvrdio je 21, izmjereno 23.
 * Ovdje se dokazuje da jezgra (1) broji tocno one severity razrede koje tvrdi, (2) porast iznad
 * stropa proglasava padom, (3) pad ispod stropa proglasava pozivom da se strop spusti, i (4) da je
 * commitani strop broj koji odgovara zapisu (inace ratchet nista ne drzi).
 */
import { describe, it, expect } from 'vitest';
import {
  compareAuditToRatchet,
  countHighCritical,
  formatVerdict,
  highCriticalAdvisoryPairs,
  highCriticalPackageNames,
  parseAuditResponse,
  syntheticAudit,
  validateRatchet,
} from '../scripts/npm-audit-ratchet-core.mjs';
import ratchet from '../data/security/npm-audit-ratchet.json';

const adv = (id: string, severity = 'high') => ({ severity, url: `https://github.com/advisories/${id}` });
const GA = 'GHSA-aaaa-aaaa-aaaa';
const GB = 'GHSA-bbbb-bbbb-bbbb';
/** Iznimka koja pokriva a i b za njihove advisoryje (T93: pokrice je par paket+advisory). */
const exceptionsAB = [{ packages: ['a'], advisories: [GA] }, { packages: ['b'], advisories: [GB] }];
const fixture = {
  vulnerabilities: {
    a: { severity: 'critical', via: [adv(GA, 'critical')] },
    b: { severity: 'high', via: [adv(GB)] },
    c: { severity: 'moderate' },
    d: { severity: 'low' },
    e: { severity: 'info' },
  },
};

describe('npm audit ratchet: jezgra', () => {
  it('broji SAMO high i critical', () => {
    expect(countHighCritical(fixture)).toBe(2);
    expect(highCriticalPackageNames(fixture)).toEqual(['a', 'b']);
  });

  it('valjan prazan vulnerabilities objekt broji 0', () => {
    expect(countHighCritical({ vulnerabilities: {} })).toBe(0);
    expect(parseAuditResponse({ vulnerabilities: {} })).toEqual({ vulnerabilities: {} });
  });

  it('nevaljan audit odgovor (error / bez vulnerabilities) baca, ne postaje nula', () => {
    expect(() => parseAuditResponse({ error: { code: 'ENOTFOUND' } })).toThrow(/ENOTFOUND|greska/i);
    expect(() => parseAuditResponse({})).toThrow(/vulnerabilities/);
    expect(() => parseAuditResponse({ vulnerabilities: null })).toThrow(/vulnerabilities/);
    expect(() => parseAuditResponse('{"error":{"code":"EAI_AGAIN"}}')).toThrow(/EAI_AGAIN|greska/i);
  });

  it('jednako stropu je equal (baseline)', () => {
    expect(compareAuditToRatchet(fixture, {
      fullGraphHighCritical: 2,
      fullGraphHighCriticalPackages: ['a', 'b'],
      exceptions: exceptionsAB,
    }).verdict).toBe('equal');
  });

  it('novi identitet pada i kad ukupan broj ostane isti', () => {
    const s = compareAuditToRatchet({
      vulnerabilities: {
        a: { severity: 'critical', via: [adv(GA, 'critical')] },
        novi: { severity: 'high', via: [adv(GB)] },
      },
    }, {
      fullGraphHighCritical: 2,
      fullGraphHighCriticalPackages: ['a', 'b'],
      exceptions: exceptionsAB,
    });
    expect(s.verdict).toBe('above');
    expect(s.unexpectedPackages).toEqual(['novi']);
    expect(s.resolvedPackages).toEqual(['b']);
    expect(formatVerdict(s)).toMatch(/^FAIL/);
    expect(formatVerdict(s)).toContain('novi');
  });

  it('ispod stropa je below i poziva na spustanje stropa, ne tihi prolaz', () => {
    const s = compareAuditToRatchet({ vulnerabilities: { a: { severity: 'high', via: [adv(GA)] } } }, {
      fullGraphHighCritical: 2,
      fullGraphHighCriticalPackages: ['a', 'b'],
      exceptions: exceptionsAB,
    });
    expect(s.verdict).toBe('below');
    expect(formatVerdict(s)).toMatch(/Spusti fullGraphHighCritical/);
  });

  it('T93: tranzitivni paket nasljeduje advisoryje high/critical paketa kroz via', () => {
    const audit = { vulnerabilities: {
      leaf1: { severity: 'high', via: [adv(GA)] },
      leaf2: { severity: 'high', via: [adv(GB), adv('GHSA-cccc-cccc-cccc', 'moderate')] },
      mid: { severity: 'high', via: ['leaf1'] },
      top: { severity: 'high', via: ['mid', 'leaf2', 'niski'] },
      niski: { severity: 'moderate', via: [adv('GHSA-dddd-dddd-dddd', 'moderate')] },
      ciklus: { severity: 'high', via: ['ciklus'] },
    } };
    expect(highCriticalAdvisoryPairs(audit)).toEqual({
      pairs: [`leaf1 ${GA}`, `leaf2 ${GB}`, `mid ${GA}`, `top ${GA}`, `top ${GB}`],
      unresolved: ['ciklus'],
    });
  });

  it('T93: novi GHSA na prihvacenom paketu pada i kad su ime i broj isti', () => {
    const r = { fullGraphHighCritical: 2, fullGraphHighCriticalPackages: ['a', 'b'], exceptions: exceptionsAB };
    const s = compareAuditToRatchet({ vulnerabilities: {
      a: { severity: 'critical', via: [adv(GA, 'critical'), adv('GHSA-nova-nova-nova')] },
      b: { severity: 'high', via: [adv(GB)] },
    } }, r);
    expect(s.verdict).toBe('above');
    expect(s.unexpectedPackages).toEqual([]);
    expect(s.uncoveredPairs).toEqual(['a GHSA-nova-nova-nova']);
    expect(formatVerdict(s)).toContain('a GHSA-nova-nova-nova');
  });

  it('T93: iznimka za drugi advisory ne pokriva paket; paket bez GHSA id-a pada', () => {
    const r = { fullGraphHighCritical: 1, fullGraphHighCriticalPackages: ['a'], exceptions: [{ packages: ['a'], advisories: [GB] }] };
    expect(compareAuditToRatchet({ vulnerabilities: { a: { severity: 'high', via: [adv(GA)] } } }, r).uncoveredPairs).toEqual([`a ${GA}`]);
    const bezId = compareAuditToRatchet({ vulnerabilities: { a: { severity: 'high', via: [{ severity: 'high', url: 'https://example.invalid/x' }] } } }, r);
    expect(bezId).toMatchObject({ verdict: 'above', unresolvedPackages: ['a'] });
  });

  it('T93 (Codex R1 na #282): neprepoznat high advisory uz prepoznat GHSA na istom paketu nije tiho zatvoren', () => {
    const r = { fullGraphHighCritical: 1, fullGraphHighCriticalPackages: ['a'], exceptions: [{ packages: ['a'], advisories: [GA] }] };
    const s = compareAuditToRatchet({ vulnerabilities: {
      a: { severity: 'high', via: [adv(GA), { severity: 'high', url: 'https://example.invalid/new' }] },
    } }, r);
    expect(s.verdict).toBe('above');
    expect(s.unresolvedPackages).toEqual(['a']);
    // Nerazrijesenost se prenosi i na paket koji je ranjiv KROZ a.
    expect(highCriticalAdvisoryPairs({ vulnerabilities: {
      a: { severity: 'high', via: [adv(GA), { severity: 'high', url: 'https://example.invalid/new' }] },
      gore: { severity: 'high', via: ['a'] },
    } }).unresolved).toEqual(['a', 'gore']);
  });

  it('T93 (Codex R3 na #282): via referenca na paket kojeg nema u auditu je nerazrijesena, ne tiho cista', () => {
    const r = { fullGraphHighCritical: 1, fullGraphHighCriticalPackages: ['a'], exceptions: [{ packages: ['a'], advisories: [GA] }] };
    const s = compareAuditToRatchet({ vulnerabilities: { a: { severity: 'high', via: [adv(GA), 'missing'] } } }, r);
    expect(s.verdict).toBe('above');
    expect(s.unresolvedPackages).toEqual(['a']);
    // Postojeci paket niske ozbiljnosti u via i dalje se ne broji kao problem.
    expect(compareAuditToRatchet({ vulnerabilities: {
      a: { severity: 'high', via: [adv(GA), 'niski'] },
      niski: { severity: 'moderate', via: [] },
    } }, r).verdict).toBe('equal');
  });

  it('T93 (Codex R2 na #282): ciklus kroz via ne gubi par; skupovi su zatvoreni do fiksne tocke', () => {
    const audit = { vulnerabilities: {
      a: { severity: 'high', via: [adv(GA), 'b'] },
      b: { severity: 'high', via: [adv(GB), 'a'] },
    } };
    expect(highCriticalAdvisoryPairs(audit)).toEqual({
      pairs: [`a ${GA}`, `a ${GB}`, `b ${GA}`, `b ${GB}`],
      unresolved: [],
    });
    const r = {
      fullGraphHighCritical: 2,
      fullGraphHighCriticalPackages: ['a', 'b'],
      exceptions: [{ packages: ['a'], advisories: [GA, GB] }, { packages: ['b'], advisories: [GB] }],
    };
    const s = compareAuditToRatchet(audit, r);
    expect(s.verdict).toBe('above');
    expect(s.uncoveredPairs).toEqual([`b ${GA}`]);
  });

  it('T93: iznimka bez advisoryja, s nevaljanim GHSA id-om ili duplim parom ne prolazi validaciju', () => {
    const base = { owner: 'o', mitigation: 'm', nextReviewOn: '2026-10-05', expiresOn: '2026-10-09' };
    const r = (exceptions: unknown[]) => ({ fullGraphHighCritical: 1, fullGraphHighCriticalPackages: ['a'], exceptions });
    expect(validateRatchet(r([{ ...base, packages: ['a'] }]), { today: '2026-10-04' })).toEqual([expect.stringMatching(/advisories je prazan/)]);
    expect(validateRatchet(r([{ ...base, packages: ['a'], advisories: ['CVE-2026-1'] }]), { today: '2026-10-04' })).toEqual([expect.stringMatching(/nevaljan GHSA/)]);
    expect(validateRatchet(r([{ ...base, packages: ['a'], advisories: [GA] }, { ...base, packages: ['a'], advisories: [GA] }]), { today: '2026-10-04' }))
      .toEqual([expect.stringMatching(/pokriven u exceptions\[0\] i exceptions\[1\]/)]);
    // isti paket u dvije iznimke za RAZLICITE advisoryje je ispravno
    expect(validateRatchet(r([{ ...base, packages: ['a'], advisories: [GA] }, { ...base, packages: ['a'], advisories: [GB] }]), { today: '2026-10-04' })).toEqual([]);
  });

  it('T93: istekla iznimka pada validaciju', () => {
    const r = { fullGraphHighCritical: 1, fullGraphHighCriticalPackages: ['a'],
      exceptions: [{ owner: 'o', mitigation: 'm', nextReviewOn: '2026-10-01', expiresOn: '2026-10-02', packages: ['a'], advisories: [GA] }] };
    expect(validateRatchet(r, { today: '2026-10-04' })).toEqual(expect.arrayContaining([expect.stringMatching(/istekla 2026-10-02/)]));
  });

  it('T93: sinteticki audit iz commitanog ratcheta je equal, a dodani advisory above', () => {
    const accepted = ratchet.fullGraphHighCriticalPackages;
    expect(compareAuditToRatchet(syntheticAudit(ratchet, accepted), ratchet).verdict).toBe('equal');
    expect(compareAuditToRatchet(syntheticAudit(ratchet, accepted, { braces: ['GHSA-zzzz-zzzz-zzzz'] }), ratchet).uncoveredPairs)
      .toEqual(['braces GHSA-zzzz-zzzz-zzzz']);
  });

  it('strop koji nije broj ne moze biti prolaz', () => {
    const empty = { vulnerabilities: {} };
    expect(compareAuditToRatchet(empty, { fullGraphHighCritical: 'puno' as unknown as number }).verdict).toBe('above');
    expect(compareAuditToRatchet(empty, {} as { fullGraphHighCritical: number }).verdict).toBe('above');
  });

  it('odbijanje iznimke bez vlasnika, mitigacije i buduceg roka nije prebaceno na dokumentaciju', () => {
    const invalid = {
      fullGraphHighCritical: 1,
      fullGraphHighCriticalPackages: ['sharp'],
      exceptions: [{
        packages: ['sharp'],
        advisories: ['GHSA-aaaa-aaaa-aaaa'],
        owner: '',
        mitigation: '',
        expiresOn: '2026-09-20',
        nextReviewOn: '2026-09-19',
      }],
    };
    expect(validateRatchet(invalid, { today: '2026-09-21' })).toEqual(expect.arrayContaining([
      expect.stringMatching(/owner/),
      expect.stringMatching(/mitigation/),
      expect.stringMatching(/istekla/),
      expect.stringMatching(/pregled/),
    ]));
  });
});

describe('npm audit ratchet: commitani zapis', () => {
  it('strop je konacan nenegativan cijeli broj s datumom i obrazlozenjem', () => {
    expect(Number.isInteger(ratchet.fullGraphHighCritical)).toBe(true);
    expect(ratchet.fullGraphHighCritical).toBeGreaterThanOrEqual(0);
    expect(ratchet.measuredAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(ratchet.changeNote.length).toBeGreaterThan(40);
    expect(ratchet.fullGraphHighCriticalPackages).toHaveLength(ratchet.fullGraphHighCritical);
    expect(validateRatchet(ratchet, { today: '2026-10-04' })).toEqual([]);
  });

  it('prethodno mjerenje je zapisano da se promjena ne moze procitati kao tiha', () => {
    expect(ratchet.priorMeasurement.fullGraphHighCritical).toBe(6);
    expect(ratchet.priorMeasurement.measuredAt).toBe('2026-10-02');
  });

  it('tooling iznimke su vremenski ogranicene i pokrivaju tocno aktivne identitete', () => {
    expect(ratchet.fullGraphHighCriticalPackages).toEqual([
      '@netlify/build',
      '@netlify/dev',
      '@netlify/functions-dev',
      '@netlify/functions-utils',
      '@netlify/git-utils',
      '@netlify/images',
      '@netlify/zip-it-and-ship-it',
      'braces',
      'fast-glob',
      'http-proxy-middleware',
      'ipx',
      'listhen',
      'micromatch',
      'netlify-cli',
      'node-forge',
    ]);
    expect(ratchet.exceptions).toHaveLength(2);
    expect(ratchet.exceptions[0]).toMatchObject({
      id: 'netlify-node-forge-cve-2026-85393',
      advisories: ['GHSA-86w9-cpqp-85rv'],
      nextReviewOn: '2026-10-05',
      expiresOn: '2026-10-09',
    });
    expect(ratchet.exceptions[1]).toMatchObject({
      id: 'netlify-braces-ghsa-vfj7-8cjw-p6xm',
      advisories: ['GHSA-vfj7-8cjw-p6xm'],
      packages: [
        '@netlify/build',
        '@netlify/dev',
        '@netlify/functions-dev',
        '@netlify/functions-utils',
        '@netlify/git-utils',
        '@netlify/zip-it-and-ship-it',
        'braces',
        'fast-glob',
        'http-proxy-middleware',
        'micromatch',
        'netlify-cli',
      ],
      owner: 'Daniel Risavi',
      nextReviewOn: '2026-10-10',
      expiresOn: '2026-10-17',
    });
  });
});

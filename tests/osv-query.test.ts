import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  SCANNED, batchQuery, collectPackages, compareOsvToRatchet, denoLockPackages, findingsFromBatch,
  requirementsPins, validateOsvRatchet,
} from '../scripts/osv-query.mjs';
import { osvWiringProblems } from './helpers/lockfile-sources';

/** T99 korak 2 (issue #220): OSV ratchet za Deno i Python. Mutacije su u gate-mutations. */
const read = (...p: string[]) => readFileSync(resolve(process.cwd(), ...p), 'utf8').replace(/\r\n?/g, '\n');
const fixture = JSON.parse(read('tests', 'fixtures', 'osv', 'querybatch-shema.json'));
const pkgs = [
  { ecosystem: 'npm', name: 'tslib', version: '2.8.1', file: 'a' },
  { ecosystem: 'npm', name: '@supabase/auth-js', version: '2.110.2', file: 'a' },
  { ecosystem: 'PyPI', name: 'pymupdf', version: '1.26.3', file: 'b' },
];

describe('T99 OSV: citanje ulaza', () => {
  it('stvarne datoteke daju pakete u svakoj skeniranoj datoteci', () => {
    const { perFile, problems, packages } = collectPackages();
    expect(problems).toEqual([]);
    expect(perFile.map((f: { file: string }) => f.file)).toEqual(SCANNED.map((s: { file: string }) => s.file));
    for (const f of perFile) expect(f.count, f.file).toBeGreaterThan(0);
    expect(packages.map((p: { name: string; version: string }) => `${p.name}@${p.version}`)).toContain('@supabase/auth-js@2.110.2');
  });

  it('deno.lock: remote i ciljevi redirecta, bez raspona iz kljuceva redirecta', () => {
    const out = denoLockPackages({
      remote: {
        'https://esm.sh/@supabase/supabase-js@2.110.2': 'h',
        'https://esm.sh/@supabase/supabase-js@2.110.2/denonext/supabase-js.mjs': 'h',
        'https://esm.sh/iceberg-js@0.8.1?target=denonext': 'h',
      },
      redirects: { 'https://esm.sh/iceberg-js@^0.8.1?target=denonext': 'https://esm.sh/iceberg-js@0.8.1?target=denonext' },
    }, 'd');
    expect(out.problems).toEqual([]);
    expect(out.packages.map((p: { name: string; version: string }) => `${p.name}@${p.version}`)).toEqual(['@supabase/supabase-js@2.110.2', 'iceberg-js@0.8.1']);
  });

  it('deno.lock: nepoznat host, raspon u remoteu i krivi oblik su problemi, ne tisina', () => {
    expect(denoLockPackages({ remote: { 'https://evil.example/x@1.0.0/x.js': 'h' } }, 'd').problems).toHaveLength(1);
    expect(denoLockPackages({ remote: { 'https://esm.sh/x@^1.0.0': 'h' } }, 'd').problems).toHaveLength(1);
    expect(denoLockPackages({ remote: [] }, 'd').problems).toHaveLength(1);
    expect(denoLockPackages(null, 'd').problems).toHaveLength(1);
  });

  it('requirements.txt: samo tocni pinovi, normalizirano ime, ostalo je imenovano', () => {
    const out = requirementsPins('# x\nPyMuPDF==1.26.3\npython_docx==1.2.0  # pin\nuvicorn[standard]==0.30.*\nlxml>=5\n\n', 'r');
    expect(out.packages.map((p: { name: string; version: string }) => `${p.name}@${p.version}`)).toEqual(['pymupdf@1.26.3', 'python-docx@1.2.0']);
    expect(out.unpinned).toEqual(['uvicorn[standard]==0.30.*', 'lxml>=5']);
  });

  it('datoteka s 0 paketa ili bez pina ruši mjerenje', () => {
    const out = collectPackages((f: string) => (f.endsWith('.lock') ? '{"remote":{}}' : 'lxml>=5'));
    expect(out.problems.filter((p: string) => p.includes('0 paketa'))).toHaveLength(3);
    expect(out.problems.some((p: string) => p.includes('redak bez tocnog pina (lxml>=5)'))).toBe(true);
  });
});

describe('T99 OSV: odgovor i ratchet', () => {
  it('upit ima jedan zapis po paketu', () => {
    expect(batchQuery(pkgs).queries[2]).toEqual({ package: { name: 'pymupdf', ecosystem: 'PyPI' }, version: '1.26.3' });
  });

  it('fixture po shemi daje imenovane identitete', () => {
    expect(findingsFromBatch(fixture, pkgs)).toEqual([
      'PyPI:pymupdf@1.26.3 GHSA-0000-0000-0002',
      'PyPI:pymupdf@1.26.3 PYSEC-2026-0001',
      'npm:tslib@2.8.1 GHSA-0000-0000-0001',
    ]);
  });

  it('krivi oblik odgovora nije nula nalaza', () => {
    for (const bad of [null, {}, { results: [{}] }, { results: [{}, {}, { next_page_token: 't' }] }, { results: [{}, {}, { vulns: {} }] }, { results: [{}, {}, { vulns: [{}] }] }]) {
      expect(() => findingsFromBatch(bad, pkgs), JSON.stringify(bad)).toThrow();
    }
  });

  it('presuda: novi identitet je above i kad broj ostane isti', () => {
    const r = { findings: ['npm:a@1.0.0 GHSA-a'] };
    expect(compareOsvToRatchet(['npm:a@1.0.0 GHSA-a'], r).verdict).toBe('equal');
    expect(compareOsvToRatchet([], r).verdict).toBe('below');
    expect(compareOsvToRatchet(['npm:b@1.0.0 GHSA-b'], r)).toMatchObject({ verdict: 'above', unexpected: ['npm:b@1.0.0 GHSA-b'] });
  });

  it('stvarni osv-ratchet.json je valjan i imenuje poznate rupe', () => {
    const ratchet = JSON.parse(read('data', 'security', 'osv-ratchet.json'));
    expect(validateOsvRatchet(ratchet)).toEqual([]);
    expect(ratchet.knownGaps.map((g: { file: string }) => g.file)).toEqual([
      'workers/field-renderer/pyproject.toml', '.claude/katedra-pkg/katedra-lite/pyproject.toml', '.claude/katedra-pkg/service/requirements.txt',
    ]);
  });

  it('ratchet: nalaz bez iznimke, istekla iznimka i nestala rupa su problemi', () => {
    const exists = () => true;
    const today = '2026-10-04';
    expect(validateOsvRatchet({ findings: ['npm:a@1 X'], exceptions: [], knownGaps: [] }, { today, exists })).toEqual(['nalaz bez iznimke: npm:a@1 X']);
    expect(validateOsvRatchet({ findings: ['npm:a@1 X'], exceptions: [{ findings: ['npm:a@1 X'], owner: 'o', mitigation: 'm', expiresOn: '2026-10-01' }], knownGaps: [] }, { today, exists }))
      .toEqual(['exceptions[0] je istekla 2026-10-01']);
    expect(validateOsvRatchet({ findings: [], exceptions: [], knownGaps: [{ file: 'nema', reason: 'r', since: '2026-10-04' }] }, { today, exists: () => false }))
      .toEqual(['knownGaps[0]: datoteka ne postoji (nema)']);
  });
});

describe('T99 OSV: skripta i CI', () => {
  it('selftest prolazi bez mreze', () => {
    const r = spawnSync(process.execPath, [resolve(process.cwd(), 'scripts', 'osv-query.mjs'), '--selftest'], { encoding: 'utf8' });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/SELF-TEST OK/);
  });

  it('security-audit.yml vrti osv-scan blokirajuce, selftest prije mjerenja (baseline)', () => {
    expect(osvWiringProblems(read('.github', 'workflows', 'security-audit.yml'))).toEqual([]);
  });

  it('Dependabot prati pip za training-pipeline', () => {
    expect(read('.github', 'dependabot.yml')).toMatch(/- package-ecosystem: "pip"\n {4}directory: "\/training-pipeline"/);
  });
});

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { findWordProofPreflightProblems, type WorkflowFile } from './helpers/ci-workflow-triggers';

import { findGateSplitProblems } from './helpers/ci-gate-split';

// DAN-80: gard podjele gatea (build-gate bez vitesta + vitest shardovi + agregat) i njegove mutacije.
const root = join(import.meta.dirname, '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { scripts: Record<string, string> };
const checkYml = readFileSync(join(root, '.github', 'workflows', 'check.yml'), 'utf8');
const wordYml = readFileSync(join(root, '.github', 'workflows', 'word-proof.yml'), 'utf8');
const wordProblems = (yaml: string): string[] => findWordProofPreflightProblems(parse(yaml) as WorkflowFile);

describe('podjela gatea: ciste osnovice', () => {
  it('stvarni package.json i check.yml nemaju problema', () => {
    expect(findGateSplitProblems(pkg.scripts, checkYml)).toEqual([]);
  });
});

describe('podjela gatea: mutacije obaraju gard', () => {
  const mutateYml = (from: string, to: string) => {
    expect(checkYml).toContain(from);
    return checkYml.replace(from, to);
  };

  it('build-gate vraćen na puni npm run check', () => {
    const m = mutateYml('run: npm run check:static', 'run: npm run check');
    expect(findGateSplitProblems(pkg.scripts, m).length).toBeGreaterThan(0);
  });

  it('agregat bez always() prolazi preskočen', () => {
    const m = mutateYml('    if: always()\n    needs: vitest-shard', '    needs: vitest-shard');
    expect(findGateSplitProblems(pkg.scripts, m)).toContain('vitest-gate nema if: always() (preskocen shard bi prosao)');
  });

  it('agregat ne traži success', () => {
    const m = mutateYml('test "$SHARD_RESULT" = "success"', 'true');
    expect(findGateSplitProblems(pkg.scripts, m)).toContain('vitest-gate ne trazi rezultat success');
  });

  it('shard izbačen iz matrice (nazivnik više ne odgovara)', () => {
    const m = mutateYml('shard: [1, 2, 3, 4]', 'shard: [1, 2, 3]');
    expect(findGateSplitProblems(pkg.scripts, m)).toContain('nazivnik --shard=i/N ne odgovara broju shardova u matrici');
  });

  it('Node 20 izbačen iz shardova', () => {
    const m = mutateYml('        node: [20, 24]\n        shard:', '        node: [24]\n        shard:');
    expect(findGateSplitProblems(pkg.scripts, m)).toContain('vitest-shard ne pokriva Node 20 i 24');
  });

  it('check:static:inner razišao od check:inner', () => {
    const scripts = { ...pkg.scripts, 'check:static:inner': pkg.scripts['check:static:inner'].replace('oxlint && ', '') };
    expect(findGateSplitProblems(scripts, checkYml)).toContain('check:static:inner nije check:inner bez vitest run (lanci su se razisli)');
  });

  it('check:static:inner dobio vitest natrag', () => {
    const scripts = { ...pkg.scripts, 'check:static:inner': pkg.scripts['check:inner'] };
    expect(findGateSplitProblems(scripts, checkYml).length).toBeGreaterThan(0);
  });
});


describe('Word proof preflight: mutacije stvarnog workflow YAML-a obaraju strukturni gard', () => {
  it('BASELINE: preflight za Deno i Python se izvrsava prije Word release gatea', () => {
    expect(wordProblems(wordYml)).toEqual([]);
  });

  const mutate = (oldText: string, newText: string): string => {
    expect(wordYml.split(oldText)).toHaveLength(2);
    return wordYml.replace(oldText, newText);
  };

  it('MUTANT: if false preskace Deno provjeru', () => {
    const broken = mutate(
      "      - name: Deno preflight (samo razine=sve)\n        if: inputs.razine == 'sve'",
      "      - name: Deno preflight (samo razine=sve)\n        if: false",
    );
    expect(wordProblems(broken)).toContain(
      'word-proof: Deno preflight (samo razine=sve) mora biti aktivan za sve na powershell runneru',
    );
  });

  it('MUTANT: naredba provjere komentirana, a tekst i dalje postoji', () => {
    const broken = mutate(
      '          $deno = Get-Command deno -ErrorAction Stop',
      '          # $deno = Get-Command deno -ErrorAction Stop',
    );
    expect(wordProblems(broken)).toContain(
      'word-proof: Deno preflight ne izvodi verzijsku provjeru uz fail-closed',
    );
  });

  it('MUTANT: Python preflight nakon Deno preflighta obavezan je, a premjestanje redoslijeda pada', () => {
    const d = wordYml.indexOf('      - name: Deno preflight (samo razine=sve)');
    const p = wordYml.indexOf('      - name: Python preflight (samo razine=sve)', d);
    const l = wordYml.indexOf('      - name: lxml i Playwright chromium (samo razine=sve)', p);
    expect(d).toBeGreaterThan(-1);
    expect(p).toBeGreaterThan(d);
    expect(l).toBeGreaterThan(p);
    const broken = wordYml.slice(0, d) + wordYml.slice(p, l) + wordYml.slice(d, p) + wordYml.slice(l);
    expect(wordProblems(broken)).toContain(
      'word-proof: preflighti, instalacija i release:check nisu u sigurnom redoslijedu',
    );
  });

  it('MUTANT: release:check je onemogucen dok preflight ostaje', () => {
    const broken = mutate(
      '      - name: release:check\n        shell: powershell',
      '      - name: release:check\n        if: false\n        shell: powershell',
    );
    expect(wordProblems(broken)).toContain(
      'word-proof: release:check je preskocen ili ne izvrsava postojeci gate',
    );
  });
});

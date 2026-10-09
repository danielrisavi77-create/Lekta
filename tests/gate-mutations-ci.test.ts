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


describe('Word proof: nezasticene i neizvedive PowerShell naredbe moraju pasti', () => {
  const mutant = (before: string, after: string): string => {
    expect(wordYml.split(before)).toHaveLength(2);
    return wordYml.replace(before, () => after);
  };
  it('blokira uklanjanje instalacije lxml biblioteke', () => {
    const changed = mutant(
      '          python -m pip install python-docx==1.2.0 lxml==6.1.3',
      '          # python -m pip install python-docx==1.2.0 lxml==6.1.3',
    );
    expect(wordProblems(changed)).toContain(
      'word-proof: lxml/Playwright instalacija nije aktivna ili nije vezana uz fail-closed',
    );
  });
  it('blokira uklanjanje instalacije Playwright browsera', () => {
    const changed = mutant(
      '          npx playwright install chromium',
      '          # npx playwright install chromium',
    );
    expect(wordProblems(changed)).toContain(
      'word-proof: lxml/Playwright instalacija nije aktivna ili nije vezana uz fail-closed',
    );
  });
  it('prepoznaje rani exit 0 prije Deno provjere', () => {
    const changed = mutant(
      '      - name: Deno preflight (samo razine=sve)\n        if: inputs.razine == \'sve\'\n        shell: powershell\n        run: |\n',
      '      - name: Deno preflight (samo razine=sve)\n        if: inputs.razine == \'sve\'\n        shell: powershell\n        run: |\n          exit 0\n',
    );
    expect(wordProblems(changed)).toContain('word-proof: Deno preflight ne izvodi verzijsku provjeru uz fail-closed');
  });
  it('prepoznaje rani exit 0 prije Python provjere', () => {
    const changed = mutant(
      '      - name: Python preflight (samo razine=sve)\n        if: inputs.razine == \'sve\'\n        shell: powershell\n        run: |\n',
      '      - name: Python preflight (samo razine=sve)\n        if: inputs.razine == \'sve\'\n        shell: powershell\n        run: |\n          exit 0\n',
    );
    expect(wordProblems(changed)).toContain('word-proof: Python preflight ne izvodi provjeru verzije i izoliranog okruzenja');
  });
  it('prepoznaje rani exit 0 u release:check', () => {
    const changed = mutant(
      '      - name: release:check\n        shell: powershell\n        env:',
      '      - name: release:check\n        shell: powershell\n        env:',
    );
    const withExit = changed.replace(
      "          $ErrorActionPreference = 'Continue'\n          $log = Join-Path $env:RUNNER_TEMP 'release-check.log'",
      "          exit 0\n          $ErrorActionPreference = 'Continue'\n          $log = Join-Path $env:RUNNER_TEMP 'release-check.log'",
    );
    expect(withExit).not.toBe(changed);
    expect(wordProblems(withExit)).toContain('word-proof: release:check je preskocen ili ne izvrsava postojeci gate');
  });
});


describe('Word proof: release gate error propagation and full-mode input wiring', () => {
  it('MUTANT: job-level continue-on-error true prikriva pad Word joba', () => {
    const before = "  word-proof:\\n    if: github.event.repository.fork == false";
    const after = "  word-proof:\\n    continue-on-error: true\\n    if: github.event.repository.fork == false";
    expect(wordYml.split(before)).toHaveLength(2);
    const changed = wordYml.replace(before, () => after);
    expect(wordProblems(changed)).toContain(
      'word-proof: job-level continue-on-error ne smije prikriti neuspjeli Word gate',
    );
  });

  it('MUTANT: continue-on-error true na release:check ne smije prikriti crveni Word gate', () => {
    const before = '      - name: release:check\n        shell: powershell';
    const after = '      - name: release:check\n        continue-on-error: true\n        shell: powershell';
    expect(wordYml.split(before)).toHaveLength(2);
    const changed = wordYml.replace(before, () => after);
    expect(wordProblems(changed)).toContain('word-proof: zasticeni koraci ne smiju imati continue-on-error');
  });

  it('MUTANT: continue-on-error true na Deno preflightu ne smije dati lazni GO', () => {
    const before = '      - name: Deno preflight (samo razine=sve)\n        if: inputs.razine == \'sve\'';
    const after = '      - name: Deno preflight (samo razine=sve)\n        continue-on-error: true\n        if: inputs.razine == \'sve\'';
    expect(wordYml.split(before)).toHaveLength(2);
    const changed = wordYml.replace(before, () => after);
    expect(wordProblems(changed)).toContain('word-proof: zasticeni koraci ne smiju imati continue-on-error');
  });

  it('MUTANT: full mode razine preimenovan u mode ne smije tiho pokrenuti samo Word', () => {
    const before = '      razine:\n';
    expect(wordYml.split(before)).toHaveLength(2);
    const changed = wordYml.replace(before, () => '      mode:\n');
    expect(wordProblems(changed)).toContain('word-proof: workflow_dispatch.razine input i opcije word/sve moraju ostati povezani');
  });

  it('MUTANT: release RAZINE odvojen od workflow_dispatch inputa', () => {
    const before = 'RAZINE: ' + String.fromCharCode(36) + "{{ inputs.razine || 'word' }}";
    expect(wordYml.split(before)).toHaveLength(2);
    const changed = wordYml.replace(before, () => 'RAZINE: word');
    expect(wordProblems(changed)).toContain('word-proof: release RAZINE ne cita odabir workflow_dispatch.razine');
  });
});

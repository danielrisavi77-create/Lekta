/**
 * Dokaz NEIZVODJENJA: kad server ne izda launch, klijent ne dohvaca modul ponude lokalnog popravka
 * i nista ne renderira.
 *
 * Staticki gard (`tests/repair-local-client-inert.test.ts`) dokazuje samo DOSEZLJIVOST: da se imena
 * pojavljuju unutar grane `if(out.localRepair)`. Pregled 2026-09-23 je pokazao zasto to nije dosta:
 * isjecak se moze prepisati tako da se modul ucitava bezuvjetno, a gard ostane zelen. Zato se ovdje
 * IZVRSAVA bas taj isjecak stvarnog izvora `src/ui/app.ts`.
 *
 * Zasto isjecak, a ne cijeli `app.ts`: grana je zakopana u zatvaracu `go()`, koji trazi cijeli tok
 * uploada (prijava, mreza, DOM carobnjaka). Isjecak se cita s diska pri svakom pokretanju, pa se ne
 * moze razici s izvorom; jedina izmjena je preusmjeravanje dinamickog importa na spijuna, i test
 * tvrdi da je ta izmjena tocno jedna i da je staza modula tocno ona ocekivana.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { LocalRepairLaunchV1 } from '../src/report/repair-client.ts';

const APP_SOURCE = join(import.meta.dirname, '..', 'src', 'ui', 'app.ts');
const BRANCH_HEAD = 'if(out.localRepair){';
const OFFER_MODULE = "'../report/local-repair-runner-download'";

const launch: LocalRepairLaunchV1 = {
  version: 1,
  jobId: '44444444-4444-4444-8444-444444444444',
  claimToken: 'B'.repeat(43),
  expiresAt: '2026-08-31T10:00:00.000Z',
};

/** Isjecak `if(out.localRepair){ ... }` iz stvarnog izvora, s uravnotezenom viticastom zagradom. */
function offerBranchSource(): string {
  const source = readFileSync(APP_SOURCE, 'utf8');
  const start = source.indexOf(BRANCH_HEAD);
  if (start < 0) throw new Error('src/ui/app.ts vise nema granu if(out.localRepair){');
  let depth = 0;
  for (let i = source.indexOf('{', start); i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error('grana if(out.localRepair){ nema zatvorenu viticastu zagradu');
}

interface BranchRun {
  (out: { localRepair: LocalRepairLaunchV1 | null }, summary: HTMLElement, load: (path: string) => Promise<unknown>): Promise<void>;
}

/**
 * Isjecak se izvodi kao asinkrona funkcija. `await import(...)` se preusmjerava na `__load`, jer
 * dinamicki import unutar Function konstruktora ne razrjesava relativne staze modula ovog testa.
 * Zamjena mora biti tocno jedna, inace bi test mjerio nesto drugo nego sto app.ts radi.
 */
function compileBranch(branch: string): BranchRun {
  const needle = `await import(${OFFER_MODULE})`;
  const occurrences = branch.split(needle).length - 1;
  expect(occurrences).toBe(1);
  const instrumented = branch.replace(needle, `await __load(${OFFER_MODULE})`);
  const factory = new Function('out', 'summary', '__load', `return (async () => { ${instrumented} })();`);
  return factory as unknown as BranchRun;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('app.ts: grana ponude lokalnog popravka se IZVRSAVA samo uz launch', () => {
  it('isjecak je doista dinamicki import bas tog modula', () => {
    const branch = offerBranchSource();
    expect(branch.startsWith(BRANCH_HEAD)).toBe(true);
    expect(branch).toContain(`await import(${OFFER_MODULE})`);
    expect(branch).toContain('renderLocalRepairRunnerOffer(summary,out.localRepair,localRepairRunnerConfig())');
  });

  it('localRepair null: modul se ne dohvaca i u DOM ne ulazi nista', async () => {
    const run = compileBranch(offerBranchSource());
    const load = vi.fn(async () => {
      throw new Error('modul ponude lokalnog popravka NE SMIJE se dohvatiti kad launcha nema');
    });
    const summary = document.createElement('div');

    await run({ localRepair: null }, summary, load);

    expect(load).not.toHaveBeenCalled();
    expect(summary.childElementCount).toBe(0);
    expect(summary.textContent).toBe('');
  });

  /**
   * Negativna kontrola: bez nje "spijun nije pozvan" ne znaci nista, jer bi ga zadovoljio i isjecak
   * koji se uopce ne izvrsava. Mutira se SAMO kopija u memoriji.
   */
  it('kontrola: uz uvijek istinit uvjet isti isjecak DOHVATI modul i renderira', async () => {
    const run = compileBranch(offerBranchSource().replace(BRANCH_HEAD, 'if(true){'));
    const render = vi.fn();
    const load = vi.fn(async () => ({
      renderLocalRepairRunnerOffer: render,
      localRepairRunnerConfig: () => ({ url: '', sha256: '' }),
    }));
    const summary = document.createElement('div');

    await run({ localRepair: null }, summary, load);

    expect(load).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledWith('../report/local-repair-runner-download');
    expect(render).toHaveBeenCalledTimes(1);
  });

  it('uz launch: modul se dohvaca jednom, a render dobiva sazetak, launch i config', async () => {
    const run = compileBranch(offerBranchSource());
    const render = vi.fn();
    const config = { url: 'https://lekta.hr/downloads/LektaRepair.exe', sha256: 'c'.repeat(64) };
    const load = vi.fn(async () => ({
      renderLocalRepairRunnerOffer: render,
      localRepairRunnerConfig: () => config,
    }));
    const summary = document.createElement('div');

    await run({ localRepair: launch }, summary, load);

    expect(load).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledWith('../report/local-repair-runner-download');
    expect(render).toHaveBeenCalledWith(summary, launch, config);
  });

  /**
   * Druga karika istog lanca, izvedena nad STVARNIM modulom ponude: i kad bi launch nekako stigao,
   * build bez `VITE_LEKTA_LOCAL_REPAIR_RUNNER_*` nema artefakt ni prikovani hash, pa ponuda ne
   * nastane. Varijable se postavljaju izricito na prazno, da test ne ovisi o zatecenoj okolini.
   */
  it('stvaran modul ponude uz prazne VITE varijable ne upise nista ni s valjanim launchem', async () => {
    vi.stubEnv('VITE_LEKTA_LOCAL_REPAIR_RUNNER_URL', '');
    vi.stubEnv('VITE_LEKTA_LOCAL_REPAIR_RUNNER_SHA256', '');
    vi.resetModules();
    const real = await import('../src/report/local-repair-runner-download.ts');

    const run = compileBranch(offerBranchSource());
    const load = vi.fn(async () => real);
    const summary = document.createElement('div');

    await run({ localRepair: launch }, summary, load);

    expect(load).toHaveBeenCalledTimes(1);
    expect(summary.childElementCount).toBe(0);
    expect(summary.textContent).toBe('');
  });
});

/**
 * Lansiranje bez lokalnog popravka: klijentski tok mora biti INERTAN.
 *
 * Lanac koji se ovdje cuva ima tri karike, a svaka sama za sebe drzi tok ugasenim:
 *  1. server bez zastavice ne izda `localLaunch` (dokaz: tests/repair-local-edge-flag-source.test.ts),
 *  2. odgovor bez `localLaunch` klijent parsira u `localRepair: null` (tests/repair-client.test.ts),
 *  3. app.ts ponudu lokalnog runnera spominje SAMO unutar grane `if(out.localRepair)`, pa se modul
 *     ni ne dohvaca, a i kad bi se dohvatio, build bez VITE_LEKTA_LOCAL_REPAIR_RUNNER_* daje prazan
 *     config pa render vraca null (tests/local-repair-runner-download.test.ts).
 *
 * Karika 3 se ovdje dokazuje STATICKI: grana je zakopana u zatvaracu `go()` u src/ui/app.ts, koji
 * trazi cijeli tok uploada (prijava, mreza, DOM carobnjaka). Ovo je dokaz DOSEZLJIVOSTI, ne dokaz
 * izvodjenja; da se dinamicki import ipak pozvao, ovaj test to ne bi vidio.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { localRepairOfferProblems } from './helpers/local-repair-flag-guard.ts';

const APP_SOURCE = join(import.meta.dirname, '..', 'src', 'ui', 'app.ts');

function appSource(): string {
  return readFileSync(APP_SOURCE, 'utf8');
}

describe('app.ts: ponuda lokalnog runnera iza grane if(out.localRepair)', () => {
  it('stvaran izvor nema nijedan problem', () => {
    expect(localRepairOfferProblems(appSource())).toEqual([]);
  });

  it('modul se uvozi dinamicki, unutar grane, a ne na vrhu datoteke', () => {
    const source = appSource();
    expect(source).toMatch(/if\(out\.localRepair\)\{/);
    expect(source).toMatch(/await import\('\.\.\/report\/local-repair-runner-download'\)/);
    expect(source).not.toMatch(/^import .*local-repair-runner-download/m);
  });

  /** Negativne kontrole nad kopijom u memoriji; datoteka na disku se ne dira. */
  it('gard grize kad se modul dohvati izvan grane', () => {
    const mutated = appSource().replace(
      /if\(out\.localRepair\)\{(\r?\n)(\s*)(const \{[^}]*\}=await import\('\.\.\/report\/local-repair-runner-download'\);)/,
      '$3$1$2if(out.localRepair){',
    );
    expect(mutated).not.toEqual(appSource());
    expect(localRepairOfferProblems(mutated).join(' | ')).toMatch(/izvan grane if\(out\.localRepair\)/);
  });

  it('gard grize kad se ponuda renderira bez provjere launcha', () => {
    const mutated = appSource().replace(
      'if(out.localRepair){',
      'renderLocalRepairRunnerOffer(summary,out.localRepair,localRepairRunnerConfig());\n    if(out.localRepair){',
    );
    expect(mutated).not.toEqual(appSource());
    expect(localRepairOfferProblems(mutated)).toContain(
      'ponuda lokalnog runnera se poziva izvan grane if(out.localRepair)',
    );
  });
});

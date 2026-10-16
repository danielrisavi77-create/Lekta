// @vitest-environment node
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
 * Karika 3 se ovdje dokazuje STATICKI: da se ponuda u app.ts uopce ne spominje izvan te grane.
 * To je dokaz DOSEZLJIVOSTI. Dokaz NEIZVODJENJA (spijun nad dinamickim importom uz
 * `out.localRepair === null`) je u `tests/repair-local-client-offer-runtime.test.ts`; njega je
 * trazio pregled 2026-09-23, jer se isjecak moze prepisati tako da se modul ucitava bezuvjetno, a
 * staticki gard ostane zelen.
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

  /**
   * Nalaz pregleda 2026-09-23: ponuda preseljena u omotac koji se ucitava BEZUVJETNO, a grana samo
   * odlucuje hoce li se pozvati. Prva verzija garda je gledala doslovno ime modula ponude, pa je
   * omotac pod drugim imenom prolazio zelen. Sada se prijavljuje svaki dinamicki import cija staza
   * spominje i "local" i "repair", osim izricito navedenih modula koji nisu ponuda.
   */
  it('gard grize kad se ponuda preseli u omotac koji se ucitava bezuvjetno', () => {
    const mutated = appSource().replace(
      /if\(out\.localRepair\)\{\r?\n\s*const \{renderLocalRepairRunnerOffer,localRepairRunnerConfig\}=await import\('\.\.\/report\/local-repair-runner-download'\);\r?\n\s*renderLocalRepairRunnerOffer\(summary,out\.localRepair,localRepairRunnerConfig\(\)\);\r?\n\s*\}/,
      "const offer=await import('../report/local-repair-offer');\n    if(out.localRepair){\n     offer.show(summary,out.localRepair);\n    }",
    );
    expect(mutated).not.toEqual(appSource());
    expect(localRepairOfferProblems(mutated)).toContain(
      'modul ponude lokalnog popravka se dohvaca izvan grane if(out.localRepair)',
    );
  });

  /** REGEX s navodnikom ne smije sakriti sintetski umetnut poziv ponude u kopiji izvora. */
  it('navodnik u regex literalu ne stvara slijepu zonu', () => {
    const mutated = appSource().replace(
      'if(out.localRepair){',
      `const quotedRegex = /["']/;
renderLocalRepairRunnerOffer(a,b,localRepairRunnerConfig());
if(out.localRepair){`,
    );
    expect(mutated).not.toEqual(appSource());
    expect(localRepairOfferProblems(mutated)).toContain(
      'ponuda lokalnog runnera se poziva izvan grane if(out.localRepair)',
    );
  });

  /** Kod unutar `${...}` predloška mora ostati vidljiv pregledu, iako je poziv izvan grane. */
  it('kod u supstituciji predloska nije slijepa zona', () => {
    const mutated = appSource().replace(
      'if(out.localRepair){',
      "`<p>${renderLocalRepairRunnerOffer(a,b,localRepairRunnerConfig())}</p>`;\nif(out.localRepair){",
    );
    expect(mutated).not.toEqual(appSource());
    expect(localRepairOfferProblems(mutated)).toContain(
      'ponuda lokalnog runnera se poziva izvan grane if(out.localRepair)',
    );
  });

  /** Kontrola u drugom smjeru: spominjanje u komentaru i u nizu NIJE problem. */
  it('spomen u komentaru i u nizu ne rusi gard', () => {
    const inComment = appSource().replace(
      'if(out.localRepair){',
      '// renderLocalRepairRunnerOffer(a,b,localRepairRunnerConfig()) je samo komentar\nif(out.localRepair){',
    );
    expect(inComment).not.toEqual(appSource());
    expect(localRepairOfferProblems(inComment)).toEqual([]);

    const inString = appSource().replace(
      "'Ipak preuzmi popravljeni dokument'",
      "'Ipak preuzmi popravljeni dokument renderLocalRepairRunnerOffer'",
    );
    expect(inString).not.toEqual(appSource());
    expect(localRepairOfferProblems(inString)).toEqual([]);
  });

  /**
   * Potvrdni tok (`local-repair-confirmation-flow`) se ucitava bezuvjetno i to je ispravno: on
   * skuplja potvrde za rizicne popravke, ne nudi runner. Bez ove kontrole bi gard bio lazno crven
   * i netko bi ga oslabio da ga utisa.
   */
  it('potvrdni tok lokalnih popravaka nije lazna uzbuna', () => {
    expect(appSource()).toContain("await import('./local-repair-confirmation-flow')");
    expect(localRepairOfferProblems(appSource())).toEqual([]);
  });

  /**
   * Kontrole iz adversarijalnog pregleda drugog alata (Codex, 2026-09-23). Prve dvije su bile
   * nacini da se modul ucita bezuvjetno, druge dvije lazno crveni slucajevi.
   */
  describe('nacini zaobilazenja iz adversarijalnog pregleda', () => {
    it('dinamicki import sa sastavljenom stazom', () => {
      const mutated = appSource().replace(
        "await import('../report/local-repair-runner-download')",
        "await import(`../report/${['local','repair','runner','download'].join('-')}`)",
      );
      expect(mutated).not.toEqual(appSource());
      expect(localRepairOfferProblems(mutated)).toContain(
        'dinamicki import bez doslovnog naziva modula; gard ne moze znati sto se ucitava',
      );
    });

    it('staticki uvoz ponude na vrhu datoteke', () => {
      const mutated = `import { renderLocalRepairRunnerOffer } from '../report/local-repair-runner-download';\n${appSource()}`;
      expect(localRepairOfferProblems(mutated)).toContain(
        'modul ponude lokalnog popravka se uvozi staticki, dakle ucitava bezuvjetno',
      );
    });

    /** Lazno crveno: tekst sucelja smije spominjati ime modula. */
    it('tekst koji spominje ime modula NE rusi gard', () => {
      const mutated = appSource().replace("'Ipak preuzmi popravljeni dokument'", '`Preuzmi: local-repair-runner-download`');
      expect(mutated).not.toEqual(appSource());
      expect(localRepairOfferProblems(mutated)).toEqual([]);
    });

    /** Lazno crveno: regex odmah iza glave `if (...)` nije dijeljenje, pa se mora obezbojiti. */
    it('regex iza glave if(...) NE rusi gard', () => {
      const mutated = appSource().replace(
        'if(out.localRepair){',
        'if(out.localRepair) /local-repair-runner-download/.test(String(out));\nif(out.localRepair){',
      );
      expect(mutated).not.toEqual(appSource());
      expect(localRepairOfferProblems(mutated)).toEqual([]);
    });
  });
});

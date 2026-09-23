/**
 * Izvorni dokaz: lokalni popravak se u Edge funkciji `repair-docx` izdaje SAMO iza zastavice.
 *
 * Dinamicki test to ne moze posvjedociti: ta datoteka se u Vitestu ne izvrsava (Deno.env, Supabase
 * klijent, pozadinski waitUntil). Zato se cita kao tekst, po uzoru na postojece izvorne garde
 * (`tests/helpers/entry-guard.ts`, `tests/helpers/edge-formdata.ts`). Tvrdnja koju cuva: POLJE
 * `localRepair` u odgovoru ne moze nositi launch ako zastavica nije ukljucena, pa je tok na
 * lansiranju inertan.
 *
 * Lanac ima cetiri karike i svaka ima vlastitu negativnu kontrolu nize: zastavica iz
 * `localRepairFlagEnabled`, izdavanje posla i `issuedLocalRepair` samo unutar grane, argument
 * `localLaunch` iz `issuedLocalRepair`, i polje odgovora iz `handoff.localRepair`.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { localRepairFlagProblems } from './helpers/local-repair-flag-guard.ts';

const EDGE_SOURCE = join(import.meta.dirname, '..', 'supabase', 'functions', 'repair-docx', 'index.ts');

function edgeSource(): string {
  return readFileSync(EDGE_SOURCE, 'utf8');
}

describe('repair-docx: lokalni popravak iza zastavice', () => {
  it('stvaran izvor nema nijedan problem', () => {
    expect(localRepairFlagProblems(edgeSource())).toEqual([]);
  });

  it('zastavica dolazi iz localRepairFlagEnabled, ne iz inline izraza', () => {
    const source = edgeSource();
    expect(source).toMatch(/import \{ localRepairFlagEnabled \} from '\.\.\/\.\.\/\.\.\/src\/repair\/local-runner\/feature-flag\.ts';/);
    expect(source).toMatch(/const LOCAL_REPAIR_ENABLED = localRepairFlagEnabled\(\{/);
  });

  /**
   * Negativne kontrole: mutira se SAMO kopija u memoriji (datoteka na disku se ne dira). Bez njih
   * tvrdnja iznad ne znaci nista, jer bi je zadovoljio i gard koji uvijek vraca prazan popis.
   */
  it('gard grize kad se zastavica vrati na inline izraz', () => {
    const mutated = edgeSource().replace(
      /const LOCAL_REPAIR_ENABLED = localRepairFlagEnabled\(\{[\s\S]*?\}\);/,
      "const LOCAL_REPAIR_ENABLED = Deno.env.get('REPAIR_LOCAL_ENABLED') === 'true'\n  && Deno.env.get('REPAIR_LOCAL_DISABLED') !== 'true';",
    );
    expect(mutated).not.toEqual(edgeSource());
    expect(localRepairFlagProblems(mutated).join(' | ')).toMatch(/localRepairFlagEnabled/);
  });

  it('gard grize kad se issuedLocalRepair postavi izvan grane sa zastavicom', () => {
    const mutated = edgeSource().replace(
      'const tStore = performance.now();',
      'issuedLocalRepair = issuedLocalRepair ?? null;\n    const tStore = performance.now();',
    );
    expect(mutated).not.toEqual(edgeSource());
    expect(localRepairFlagProblems(mutated)).toContain(
      'issuedLocalRepair se postavlja izvan grane koja provjerava LOCAL_REPAIR_ENABLED',
    );
  });

  it('gard grize kad ARGUMENT localLaunch prestane dolaziti iz issuedLocalRepair', () => {
    const mutated = edgeSource().replace(
      'localLaunch: issuedLocalRepair?.launch ?? null,',
      'localLaunch: provisionedLaunchForEveryone,',
    );
    expect(mutated).not.toEqual(edgeSource());
    expect(localRepairFlagProblems(mutated)).toContain('localLaunch se predaje iz izvora koji nije issuedLocalRepair');
  });

  /**
   * Pregled 2026-09-23: prva verzija garda gledala je samo redak s tokenom `localLaunch`, a to je
   * ARGUMENT za settleRepairStorageHandoff. Polje koje klijent stvarno dobije je
   * `localRepair: handoff.localRepair`. Sljedeci slucajevi su bas te mutacije, koje su tada
   * prolazile s praznim popisom problema.
   */
  it('gard grize kad polje localRepair u odgovoru prestane dolaziti iz handoffa', () => {
    const mutated = edgeSource().replace('localRepair: handoff.localRepair,', 'localRepair: rogueLaunch,');
    expect(mutated).not.toEqual(edgeSource());
    expect(localRepairFlagProblems(mutated)).toContain(
      'polje localRepair u odgovoru dolazi iz izvora koji nije handoff.localRepair',
    );
  });

  it('gard grize kad odgovor zaobidje handoff preko svjezeg poziva izdavanja', () => {
    const mutated = edgeSource().replace(
      'localRepair: handoff.localRepair,',
      'localRepair: handoff.localRepair ?? (await provisionLocalRepairJob(rogueArgs)).issued.launch,',
    );
    expect(mutated).not.toEqual(edgeSource());
    expect(localRepairFlagProblems(mutated)).toContain(
      'provisionLocalRepairJob se spominje izvan grane koja provjerava LOCAL_REPAIR_ENABLED',
    );
  });

  it('gard grize kad se posao izda izvan grane pa proslijedi u odgovor pod drugim imenom', () => {
    const mutated = edgeSource()
      .replace(
        'const tStore = performance.now();',
        'const rogue = await provisionLocalRepairJob(args);\n    const tStore = performance.now();',
      )
      .replace('localRepair: handoff.localRepair,', 'localRepair: rogue.issued.launch,');
    expect(mutated).not.toEqual(edgeSource());
    expect(localRepairFlagProblems(mutated)).toContain(
      'provisionLocalRepairJob se spominje izvan grane koja provjerava LOCAL_REPAIR_ENABLED',
    );
    expect(localRepairFlagProblems(mutated)).toContain(
      'polje localRepair u odgovoru dolazi iz izvora koji nije handoff.localRepair',
    );
  });

  it('gard grize kad se handoff.localRepair prepise nakon settleRepairStorageHandoff', () => {
    const mutated = edgeSource().replace(
      'const msStore =',
      'handoff.localRepair = rogueLaunch;\n    const msStore =',
    );
    expect(mutated).not.toEqual(edgeSource());
    expect(localRepairFlagProblems(mutated)).toContain(
      'polje objekta handoff se prepisuje nakon settleRepairStorageHandoff(...)',
    );
  });

  /**
   * Izdavanje posla (`provisionLocalRepairJob`) je jedina tocka koja moze proizvesti launch, pa i
   * ono mora ostati unutar grane. Bez ove kontrole bi se posao mogao izdati uvijek, a zastavica bi
   * tek birala hoce li se rezultat proslijediti.
   */
  it('gard grize kad se izdavanje posla preseli izvan grane sa zastavicom', () => {
    const mutated = edgeSource().replace(
      'const tStore = performance.now();',
      'const early = await provisionLocalRepairJob(args);\n    const tStore = performance.now();',
    );
    expect(mutated).not.toEqual(edgeSource());
    expect(localRepairFlagProblems(mutated)).toContain(
      'provisionLocalRepairJob se spominje izvan grane koja provjerava LOCAL_REPAIR_ENABLED',
    );
  });

  /**
   * Obezbojivac mora citati kod i unutar supstitucije predloska `${...}`; prije tokenizatora je
   * cijeli predlozak bio "niz", pa bi se izdavanje sakriveno u log poruku provuklo neprimjeceno.
   */
  it('gard grize i kad se izdavanje sakrije u supstituciju predloska', () => {
    const mutated = edgeSource().replace(
      'timings repair=${msRepair}',
      'timings repair=${(issuedLocalRepair = (await provisionLocalRepairJob(args)).issued, msRepair)}',
    );
    expect(mutated).not.toEqual(edgeSource());
    expect(localRepairFlagProblems(mutated)).toContain(
      'issuedLocalRepair se postavlja izvan grane koja provjerava LOCAL_REPAIR_ENABLED',
    );
  });

  /** Varijabla okoline smije se citati samo u pozivu zastavice; drugo citanje je zaobilazak. */
  it('gard grize kad se REPAIR_LOCAL_ENABLED cita izvan poziva zastavice', () => {
    const mutated = edgeSource().replace(
      'const LOCAL_REPAIR_PRIVATE_KEY =',
      "const SNEAKY = Deno.env.get('REPAIR_LOCAL_ENABLED');\nconst LOCAL_REPAIR_PRIVATE_KEY =",
    );
    expect(mutated).not.toEqual(edgeSource());
    expect(localRepairFlagProblems(mutated)).toContain(
      'varijabla okoline REPAIR_LOCAL_ENABLED se cita izvan poziva localRepairFlagEnabled(...)',
    );
  });

  /** Komentar koji spominje varijablu ne smije biti lazna uzbuna (gard cita kod, ne komentare). */
  it('komentar o zastavici ne rusi gard', () => {
    const mutated = edgeSource().replace(
      'const tStore = performance.now();',
      '// biljeska: issuedLocalRepair = nesto, REPAIR_LOCAL_ENABLED\n    const tStore = performance.now();',
    );
    expect(mutated).not.toEqual(edgeSource());
    expect(localRepairFlagProblems(mutated)).toEqual([]);
  });

  /**
   * Sljedece kontrole dolaze iz adversarijalnog pregleda drugog alata (Codex, 2026-09-23): svaka je
   * bila konkretan nacin da se gard prevari. Sve su ovdje reproducirane nad kopijom stvarnog izvora
   * i sve su sada uhvacene.
   */
  describe('nacini zaobilazenja iz adversarijalnog pregleda', () => {
    it('lazni import u nizu uz lokalnu definiciju zastavice', () => {
      const mutated = edgeSource().replace(
        "import { localRepairFlagEnabled } from '../../../src/repair/local-runner/feature-flag.ts';",
        'const marker = "import { localRepairFlagEnabled } from \'../../../src/repair/local-runner/feature-flag.ts\'";\n'
        + 'function localRepairFlagEnabled(_env) { return true; }',
      );
      expect(mutated).not.toEqual(edgeSource());
      expect(localRepairFlagProblems(mutated)).toContain(
        'localRepairFlagEnabled je definiran lokalno umjesto da se uvozi',
      );
    });

    it('hardkodirana vrijednost umjesto citanja okoline', () => {
      const mutated = edgeSource().replace(
        /const LOCAL_REPAIR_ENABLED = localRepairFlagEnabled\(\{[\s\S]*?\}\);/,
        "const LOCAL_REPAIR_ENABLED = localRepairFlagEnabled({ REPAIR_LOCAL_ENABLED: 'true' });",
      );
      expect(mutated).not.toEqual(edgeSource());
      expect(localRepairFlagProblems(mutated)).toContain(
        "poziv localRepairFlagEnabled(...) ne cita Deno.env.get('REPAIR_LOCAL_ENABLED')",
      );
    });

    it('zastavica prestane biti nuzan uvjet grane', () => {
      const mutated = edgeSource().replace(
        'if (LOCAL_REPAIR_ENABLED && !FREE_MODE && jobId && slotId) {',
        'if (LOCAL_REPAIR_ENABLED || true) {',
      );
      expect(mutated).not.toEqual(edgeSource());
      expect(localRepairFlagProblems(mutated)).toContain(
        'uvjet grane nije oblika `LOCAL_REPAIR_ENABLED && ...`, pa zastavica vise nije nuzan uvjet',
      );
    });

    it('logicko pridruzivanje i alias izdavaca izvan grane', () => {
      const mutated = edgeSource().replace(
        'const tStore = performance.now();',
        'const issue = provisionLocalRepairJob;\n    issuedLocalRepair ||= (await issue(args)).issued;\n    const tStore = performance.now();',
      );
      expect(mutated).not.toEqual(edgeSource());
      expect(localRepairFlagProblems(mutated)).toContain(
        'issuedLocalRepair se postavlja izvan grane koja provjerava LOCAL_REPAIR_ENABLED',
      );
      expect(localRepairFlagProblems(mutated)).toContain(
        'provisionLocalRepairJob se spominje izvan grane koja provjerava LOCAL_REPAIR_ENABLED',
      );
    });

    it('izracunat kljuc objekta sakriva ime polja', () => {
      const mutated = edgeSource().replace(
        'localRepair: handoff.localRepair,',
        "['local' + 'Repair']: rogueLaunch,\n      decoy: { localRepair: handoff.localRepair },",
      );
      expect(mutated).not.toEqual(edgeSource());
      expect(localRepairFlagProblems(mutated)).toContain(
        'izracunat kljuc objekta sakriva ime polja od garda; ovdje su dopusteni samo doslovni kljucevi',
      );
    });

    it('Object.assign prepisuje handoff prije odgovora', () => {
      const mutated = edgeSource().replace(
        'const msStore =',
        'Object.assign(handoff, { localRepair: rogueLaunch });\n    const msStore =',
      );
      expect(mutated).not.toEqual(edgeSource());
      expect(localRepairFlagProblems(mutated)).toContain(
        'handoff se koristi na nacin koji gard ne moze pratiti (dopusteni su samo storagePending i localRepair)',
      );
    });

    /** Lazno crveno iz istog pregleda: log poruka smije spominjati zastavicu. */
    it('log poruka koja spominje zastavicu NE rusi gard', () => {
      const mutated = edgeSource().replace(
        "console.error('[repair-docx]', e);",
        "console.error('[repair-docx] REPAIR_LOCAL_ENABLED nije konfiguriran', e);",
      );
      expect(mutated).not.toEqual(edgeSource());
      expect(localRepairFlagProblems(mutated)).toEqual([]);
    });
  });

  /**
   * DRUGI ADVERSARIJALNI PREGLED (2026-09-23, krug 3). Svaki od sljedecih slucajeva je tada
   * REPRODUCIRAN nad kopijom stvarnog izvora i gard je na njega vratio PRAZAN popis. Ovdje su svi
   * negativne kontrole: bez njih bi tvrdnja "issuedLocalRepair je dosezljiv samo iza zastavice"
   * bila jaca od onoga sto gard mjeri.
   */
  describe('rupe iz drugog adversarijalnog pregleda', () => {
    it('deklaracija issuedLocalRepair inicijalizirana launchem umjesto s null', () => {
      const mutated = edgeSource().replace(
        'let issuedLocalRepair: IssuedLocalRepairJob | null = null;',
        'let issuedLocalRepair: IssuedLocalRepairJob | null = rogueLaunch;',
      );
      expect(mutated).not.toEqual(edgeSource());
      const problems = localRepairFlagProblems(mutated);
      expect(problems).toContain('issuedLocalRepair se ne deklarira tocno jednom kao `let issuedLocalRepair: ... = null;`');
      expect(problems).toContain('issuedLocalRepair se spominje izvan grane i izvan dopustenih oblika citanja');
    });

    it('destrukturirano pridruzivanje u issuedLocalRepair izvan grane', () => {
      const mutated = edgeSource().replace(
        'const tStore = performance.now();',
        '({ issued: issuedLocalRepair } = rogueResult);\n    const tStore = performance.now();',
      );
      expect(mutated).not.toEqual(edgeSource());
      expect(localRepairFlagProblems(mutated)).toContain(
        'issuedLocalRepair se spominje izvan grane i izvan dopustenih oblika citanja',
      );
    });

    /** Izdavac dovucen dinamicki ne postoji u statickoj slici uvoza, pa se popis imena ne bi pomogao. */
    it('drugi izdavac dovucen dinamickim importom izvan grane', () => {
      const mutated = edgeSource().replace(
        'const tStore = performance.now();',
        "const svc = await import('../../../src/repair/local-runner/issue-service.ts');\n"
        + '    ({ issued: issuedLocalRepair } = await svc.issueLocalRepairJob(args));\n'
        + '    const tStore = performance.now();',
      );
      expect(mutated).not.toEqual(edgeSource());
      const problems = localRepairFlagProblems(mutated);
      expect(problems).toContain('dinamicki import u repair-docx; gard ne moze znati koji se modul ucitava');
      expect(problems).toContain(
        'izdavac lokalnog popravka (issueLocalRepairJob) se spominje izvan grane koja provjerava LOCAL_REPAIR_ENABLED',
      );
      expect(problems).toContain('issuedLocalRepair se spominje izvan grane i izvan dopustenih oblika citanja');
    });

    /**
     * Najvjerojatniji stvarni regresijski oblik: privremeno "forsiraj za lokalno testiranje" koje
     * ostane u kodu. Zasjenjenje je unutar Deno.serve handlera legalno i prolazi `check:edge`.
     */
    it('zastavica zasjenjena lokalnom konstantom unutar handlera', () => {
      const mutated = edgeSource().replace(
        'if (LOCAL_REPAIR_ENABLED && !FREE_MODE && jobId && slotId) {',
        'const LOCAL_REPAIR_ENABLED = true;\n    if (LOCAL_REPAIR_ENABLED && !FREE_MODE && jobId && slotId) {',
      );
      expect(mutated).not.toEqual(edgeSource());
      expect(localRepairFlagProblems(mutated)).toContain(
        'LOCAL_REPAIR_ENABLED se deklarira vise od jednom; lokalno zasjenjenje ponistava modul-konstantu',
      );
    });

    /** `|| true` iza konjunkcije koja POCINJE zastavicom: prethodni oblik uvjeta je to propustao. */
    it('alternativa dodana iza konjunkcije koja pocinje zastavicom', () => {
      const mutated = edgeSource().replace(
        'if (LOCAL_REPAIR_ENABLED && !FREE_MODE && jobId && slotId) {',
        'if (LOCAL_REPAIR_ENABLED && Boolean(jobId) || true) {',
      );
      expect(mutated).not.toEqual(edgeSource());
      expect(localRepairFlagProblems(mutated)).toContain(
        'uvjet grane nije oblika `LOCAL_REPAIR_ENABLED && ...`, pa zastavica vise nije nuzan uvjet',
      );
    });

    /** Uvjet prelomljen u dva retka: prethodni oblik ga uopce nije vidio i provjera se tiho preskakala. */
    it('alternativa u uvjetu prelomljenom u dva retka', () => {
      const mutated = edgeSource().replace(
        'if (LOCAL_REPAIR_ENABLED && !FREE_MODE && jobId && slotId) {',
        'if (LOCAL_REPAIR_ENABLED\n      || true) {',
      );
      expect(mutated).not.toEqual(edgeSource());
      expect(localRepairFlagProblems(mutated)).toContain(
        'uvjet grane nije oblika `LOCAL_REPAIR_ENABLED && ...`, pa zastavica vise nije nuzan uvjet',
      );
    });

    /** Uvjet prelomljen u dva retka koji je ISPRAVAN ne smije biti lazna uzbuna. */
    it('ispravan uvjet prelomljen u dva retka NE rusi gard', () => {
      const mutated = edgeSource().replace(
        'if (LOCAL_REPAIR_ENABLED && !FREE_MODE && jobId && slotId) {',
        'if (LOCAL_REPAIR_ENABLED && !FREE_MODE\n      && jobId && slotId) {',
      );
      expect(mutated).not.toEqual(edgeSource());
      expect(localRepairFlagProblems(mutated)).toEqual([]);
    });

    /** Zastavica upotrijebljena izvan svoje deklaracije i izvan uvjeta grane (npr. ternar u odgovoru). */
    it('zastavica citana na trecem mjestu', () => {
      const mutated = edgeSource().replace(
        'const tStore = performance.now();',
        'const forced = LOCAL_REPAIR_ENABLED ? 1 : 0;\n    const tStore = performance.now();',
      );
      expect(mutated).not.toEqual(edgeSource());
      expect(localRepairFlagProblems(mutated)).toContain(
        'LOCAL_REPAIR_ENABLED se spominje izvan svoje deklaracije i izvan uvjeta grane',
      );
    });
  });
});

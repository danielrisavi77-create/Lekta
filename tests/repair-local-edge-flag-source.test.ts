/**
 * Izvorni dokaz: lokalni popravak se u Edge funkciji `repair-docx` izdaje SAMO iza zastavice.
 *
 * Dinamicki test to ne moze posvjedociti: ta datoteka se u Vitestu ne izvrsava (Deno.env, Supabase
 * klijent, pozadinski waitUntil). Zato se cita kao tekst, po uzoru na postojece izvorne garde
 * (`tests/helpers/entry-guard.ts`, `tests/helpers/edge-formdata.ts`). Tvrdnja koju cuva: odgovor ne
 * moze ponijeti `localLaunch` ako zastavica nije ukljucena, pa je tok na lansiranju inertan.
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

  it('gard grize kad localLaunch u odgovoru prestane dolaziti iz issuedLocalRepair', () => {
    const mutated = edgeSource().replace(
      'localLaunch: issuedLocalRepair?.launch ?? null,',
      'localLaunch: provisionedLaunchForEveryone,',
    );
    expect(mutated).not.toEqual(edgeSource());
    expect(localRepairFlagProblems(mutated)).toContain('localLaunch u odgovoru ne dolazi iz issuedLocalRepair');
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
});

// @vitest-environment node
/**
 * T58: predlozak PR-a mora traziti oba obvezna retka, a primjer u predlosku (s popunjenim
 * vrijednostima) mora proci istu provjeru koju vrti CI job `pr-opis`.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { provjeriOpisPr } from '../scripts/agents/pr-lines.mjs';

const predlozak = readFileSync(resolve('.github/PULL_REQUEST_TEMPLATE.md'), 'utf8').replace(/\r/g, '');

describe('PULL_REQUEST_TEMPLATE.md', () => {
  it('ima odjeljke Sto, Dokaz i Nije dokazano', () => {
    expect(predlozak).toMatch(/^## Sto i zasto$/m);
    expect(predlozak).toMatch(/^## Dokaz da radi$/m);
    expect(predlozak).toMatch(/^## Nije dokazano$/m);
  });

  it('sadrzi oba obvezna retka izvan HTML komentara', () => {
    const bezKomentara = predlozak.replace(/<!--[\s\S]*?-->/g, '');
    expect(bezKomentara).toMatch(/^Neto redaka: \+<dodano>\/-<uklonjeno>$/m);
    expect(bezKomentara).toMatch(/^Nove ovisnosti: nema \| <popis paketa>$/m);
  });

  it('nepopunjen predlozak pada na provjeri, popunjen prolazi', () => {
    expect(provjeriOpisPr(predlozak, [])).toHaveLength(2);
    const popunjen = predlozak
      .replace('Neto redaka: +<dodano>/-<uklonjeno>', 'Neto redaka: +12/-3')
      .replace('Nove ovisnosti: nema | <popis paketa>', 'Nove ovisnosti: nema');
    expect(provjeriOpisPr(popunjen, [])).toEqual([]);
  });

  it('CI job pr-opis postoji, vrti provjeru i nije vezan uz push', () => {
    const wf = readFileSync(resolve('.github/workflows/foundation-check.yml'), 'utf8').replace(/\r/g, '');
    const blok = wf.slice(wf.indexOf('\n  pr-opis:'));
    expect(blok.length).toBeGreaterThan(1);
    expect(blok).toMatch(/if: github\.event_name == 'pull_request'/);
    expect(blok).toMatch(/PR_BODY: \$\{\{ github\.event\.pull_request\.body \}\}/);
    expect(blok).toMatch(/node scripts\/agents\/pr-lines\.mjs --provjeri/);
    // Tijelo PR-a ide kroz okolinu, nikad izravno u shell (injekcija kroz opis PR-a).
    expect(blok).not.toMatch(/run:[^\n]*github\.event\.pull_request\.body/);
  });
});

/**
 * Gard nad razinama dokaza u `npm run release:check`.
 *
 * Zasto postoji, izmjereno 2026-09-01 na VLASTITOJ izmjeni: cim je `check:edge` usao u
 * `npm run check`, razina `edge` u `release-check.mjs` postala je DRUGI PROLAZ ISTIM ALATOM. To
 * projekt izricito ne priznaje kao provjeru ("vise prolaza istim alatom nije provjera, nego
 * slaganje"), a uz to je kostalo 34 s po dokazu i u `RELEASE_PROOF.json` izgledalo kao dvije
 * nezavisne potvrde ondje gdje je bila jedna.
 *
 * Udvajanje se ne primijeti citanjem, jer se ne vidi u `release-check.mjs`: vidi se tek kad se
 * razvije lanac `npm run` skripti iz `package.json`. Zato ovaj gard IZVODI oboje iz izvora i
 * nikad ne nosi vlastiti popis; gard s prepisanim popisom stiti samo ono cega se netko sjetio, a
 * zaboravljanje je upravo kvar.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TIERS } from '../scripts/release-tiers.mjs';

const ROOT = join(__dirname, '..');
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
  scripts: Record<string, string>;
};
type Tier = { id: string; cmd: string; required: boolean };

/**
 * Razine se citaju iz izvora, ne prepisuju.
 *
 * Do 2026-09-13 se popis vadio REGEXOM iz `scripts/release-check.mjs`, jer se ta skripta pri uvozu
 * odmah izvrsi pa se nije mogla uvesti. Otkad popis zivi u `scripts/release-tiers.mjs` (dijeli ga i
 * gate pri deployu, koji potpunost dokaza racuna iz njega), cita se izravno. Razlika nije samo
 * urednost: regex koji promasi vrati PRAZAN popis, a prazan popis prolazi svaku tvrdnju nize kao
 * "nema udvajanja, sve skripte postoje", dakle vakuumski.
 */
function tiers(): Tier[] {
  return TIERS as Tier[];
}

/** Sve npm skripte koje `name` pokrece, tranzitivno (ukljucujuci samu sebe). */
function scriptClosure(name: string, seen = new Set<string>()): Set<string> {
  if (seen.has(name)) return seen;
  seen.add(name);
  const body = pkg.scripts[name];
  if (!body) return seen;
  for (const m of body.matchAll(/npm run ([a-z0-9:_-]+)/g)) scriptClosure(m[1], seen);
  return seen;
}

const npmScriptOf = (cmd: string) => /^npm run ([a-z0-9:_-]+)$/.exec(cmd)?.[1] ?? null;

/** Parovi (nadredjena, ugnijezdjena) medju razinama: ugnijezdjena je vec pokrivena nadredjenom. */
function duplicatedTiers(list: Tier[]): Array<[string, string]> {
  const dupes: Array<[string, string]> = [];
  for (const outer of list) {
    const outerScript = npmScriptOf(outer.cmd);
    if (!outerScript) continue;
    const closure = scriptClosure(outerScript);
    for (const inner of list) {
      if (inner.id === outer.id) continue;
      const innerScript = npmScriptOf(inner.cmd);
      if (innerScript && closure.has(innerScript)) dupes.push([outer.id, inner.id]);
    }
  }
  return dupes;
}

describe('razine dokaza o izdanju', () => {
  /** Prazan popis bi svaku tvrdnju nize ucinio vakuumskom, pa se prvo tvrdi da popis uopce postoji. */
  it('popis razina je neprazan i dolazi iz zajednickog modula', () => {
    expect(tiers().length).toBeGreaterThanOrEqual(9);
    expect(tiers().map((t) => t.id)).toContain('check');
  });

  it('nijedna razina nije vec pokrivena drugom razinom', () => {
    expect(duplicatedTiers(tiers())).toEqual([]);
  });

  /**
   * NEGATIVNA KONTROLA: bez nje bi gard "prolazio" i da detektor ne vidi nista. Podmece se tocno
   * ono stanje koje je 2026-09-01 postojalo (`edge` unutar `check`).
   */
  it('detektor prijavi udvajanje kad se ono podmetne', () => {
    const podmetnuto: Tier[] = [
      { id: 'check', cmd: 'npm run check', required: true },
      { id: 'edge', cmd: 'npm run check:edge', required: true },
    ];
    expect(duplicatedTiers(podmetnuto)).toEqual([['check', 'edge']]);
  });

  it('svaka razina gadja npm skriptu koja stvarno postoji', () => {
    for (const t of tiers()) {
      const script = npmScriptOf(t.cmd);
      if (script) expect(pkg.scripts, `razina ${t.id}`).toHaveProperty(script);
    }
  });

  /**
   * Svjezina projekcija je SCREENING i mora ostati `required: false`.
   *
   * Nije stilska odluka nego mjerenje: 2026-09-01 su sve tri prijavljene projekcije regenerirale
   * BAJT-IDENTICAN sadrzaj, dakle 3/3 lazno pozitivno. Kao obavezna razina blokirala bi izdanje
   * zbog commita koji izlaz nisu dirnuli, sto je definicija garda koji vristi na sve. Ovaj test
   * postoji da netko tu razinu ne "pojaca" u dobroj namjeri, ne primijetivsi zasto je slaba.
   */
  it('svjezina pecenih projekcija postoji, ali NE obara izdanje', () => {
    const t = tiers().find((x) => x.id === 'projections');
    expect(t, 'razina `projections` mora postojati').toBeTruthy();
    expect(t!.required, 'screening signal ne smije biti tvrdi gard').toBe(false);
    expect(t!.cmd).toBe('npm run projection-freshness');
  });
});

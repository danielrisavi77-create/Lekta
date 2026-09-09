import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildCommandLine } from '../scripts/build-production.mjs';

/**
 * NETLIFY I `dist-gate` MORAJU GRADITI ISTIM RUNTIMEOM I ISTIM LANCEM.
 *
 * Odluka vlasnika 2026-09-09: Netlify vise ne gradi na svaki push, nego tek kad se objava zatrazi.
 * To je sigurno SAMO zato sto `dist-gate` u `check.yml` vec vrti produkcijski build na svaki push,
 * pa se "gradi li se artefakt" zna i bez Netlifyja. Ta zamjena vrijedi dok su obje strane iste.
 *
 * Dok su se razlikovale (CI 24, Netlify 20), "CI zelen" nije znacilo "Netlify zelen", a upravo se
 * na to oslanjamo. Razlika je bila TIHA: nista je nije mjerilo, a otkrila se tek kad je produkcija
 * stala i kad se trazio uzrok.
 *
 * Gard usporedjuje DVIJE stvari, jer se raziden moze dogoditi na obje:
 *   1. verziju Nodea (`NODE_VERSION` u `netlify.toml` naspram `node-version` u `dist-gate` jobu);
 *   2. sam lanac naredbi (`command` naspram koraka "Produkcijski build").
 *
 * Drugu tvrdnju je lako podcijeniti: da netko doda generator u `netlify.toml` a ne u CI, CI bi i
 * dalje bio zelen nad artefaktom koji se ne isporucuje.
 */
const KORIJEN = process.cwd();
const TOML = readFileSync(join(KORIJEN, 'netlify.toml'), 'utf8');
const CI = readFileSync(join(KORIJEN, '.github/workflows/check.yml'), 'utf8');

/** Blok `dist-gate` joba; sve tvrdnje gledaju SAMO njega, ne cijeli workflow. */
function distGate(): string {
  const start = CI.indexOf('\n  dist-gate:');
  expect(start, 'job `dist-gate` ne postoji u check.yml').toBeGreaterThan(0);
  const rest = CI.slice(start + 1);
  const next = rest.search(/\n {2}[a-z][\w-]*:\n/);
  return next > 0 ? rest.slice(0, next) : rest;
}

/** Lanac se usporedjuje po KORACIMA, ne po nizu: razmaci i prijelomi nisu ugovor. */
function koraci(chain: string): string[] {
  return chain.split('&&').map((x) => x.trim().replace(/\s+/g, ' ')).filter(Boolean);
}

describe('produkcijski build: Netlify i CI se ne smiju razici', () => {
  it('grade istom verzijom Nodea', () => {
    const netlify = /NODE_VERSION\s*=\s*"(\d+)"/.exec(TOML)?.[1];
    const ci = /node-version:\s*(\d+)/.exec(distGate())?.[1];
    expect(netlify, 'NODE_VERSION nije nadjen u netlify.toml').toBeTruthy();
    expect(ci, '`node-version` nije nadjen u dist-gate jobu').toBeTruthy();
    expect(ci, `CI gradi na Node ${ci}, Netlify na ${netlify}`).toBe(netlify);
  });

  it('grade istim lancem naredbi', () => {
    // Od 2026-09-09 (plan T03) oba potrosaca zovu JEDNU skriptu, `scripts/build-production.mjs`, pa se
    // "isti lanac" dokazuje tako: Netlify `command` je poziv skripte (s verify), CI korak je poziv iste
    // skripte s `--skip-verify` pa zaseban `verify-deploy-dist.mjs`. Doslovan popis koraka mjeri
    // tests/build-production.test.ts nad samom skriptom; ovdje se tvrdi da nitko ne gradi mimo nje.
    const netlifyChain = /command\s*=\s*"([^"]+)"/.exec(TOML)?.[1] ?? '';
    // `.trim()`: radna kopija na Windowsu ima CRLF, pa bi `[^\n]*` pokupio i `\r` (CLAUDE.md: gard koji cita s diska normalizira CR).
    const ciChain = (/run:\s*(node scripts\/build-production\.mjs[^\n]*)/.exec(distGate())?.[1] ?? '').trim();
    expect(netlifyChain, 'build command nije nadjen u netlify.toml').toBe('node scripts/build-production.mjs');
    expect(ciChain, 'produkcijski build korak nije nadjen u dist-gate jobu').toBe('node scripts/build-production.mjs --skip-verify');

    // `verify-deploy-dist` je u CI-u ZASEBAN korak, pa ga skripta ondje preskace; u Netlifyju je dio skripte.
    expect(distGate(), 'CI ne provjerava dist artefakt').toContain('verify-deploy-dist.mjs');
    expect(koraci(buildCommandLine({ verify: false }))).toEqual(koraci(buildCommandLine()).filter((k) => !k.includes('verify-deploy-dist')));
    // Nitko ne smije graditi prepisanim nizom mimo skripte, ni u CI-u ni na hostingu.
    expect(distGate()).not.toMatch(/npm run build &&/);
    expect(TOML).not.toMatch(/^\s*command\s*=\s*"npm run build/m);
  });

  /**
   * TRECA OS, dodana 2026-09-09 nakon sto su prve dvije PROPUSTILE stvarni ispad produkcije.
   *
   * Netlify je 14 uzastopnih deploya gradio crveno dok je CI bio zelen nad ISTIM lancem i ISTIM
   * Nodeom. Razlika
   * je bila u OKOLINI: `netlify.toml` postavlja `LEKTA_REQUIRE_RELEASE_PROOF`, koji
   * `verify-deploy-dist.mjs` pretvara u tvrd gate nad `docs/generated/RELEASE_PROOF.json`. CI ga
   * nije postavljao, pa je isti skript ondje bio MEKAN i uredno prolazio.
   *
   * `LEKTA_REQUIRE_RELEASE_PROOF` je JEDINA dopustena razlika i nije previd nego posljedica: dokaz
   * izdanja se pece neposredno prije objave i vrijedi za jedan otisak stabla. Zahtijevati ga na
   * svaki push znacilo bi da CI mora biti crven cim itko nesto gurne, dakle gard koji po
   * konstrukciji nikad nije zelen. Provjerava se pri OBJAVI, a objava je od danas na zahtjev.
   *
   * Svaka DRUGA varijabla mora biti u oba, i to je poanta: nova varijabla u `netlify.toml` obara
   * ovaj gard dok netko svjesno ne odluci u koju od dvije skupine ide.
   */
  it('okolina je ista, uz jednu imenovanu iznimku', () => {
    const SAMO_PRI_OBJAVI = new Set(['LEKTA_REQUIRE_RELEASE_PROOF']);

    const blok = /\[build\.environment\]([\s\S]*?)(?=\n\[|$)/.exec(TOML)?.[1] ?? '';
    expect(blok, '`[build.environment]` nije nadjen u netlify.toml').toBeTruthy();
    const netlifyVars = [...blok.matchAll(/^\s*([A-Z_][A-Z0-9_]*)\s*=/gm)].map((m) => m[1]);
    expect(netlifyVars.length, 'nijedna varijabla nije procitana').toBeGreaterThan(2);

    const gate = distGate();
    const nedostaju = netlifyVars
      // NODE_VERSION se usporedjuje zasebno (gore), jer u CI-u nije `env:` nego `node-version:`.
      .filter((v) => v !== 'NODE_VERSION' && !SAMO_PRI_OBJAVI.has(v))
      .filter((v) => !new RegExp(`^\\s*${v}:`, 'm').test(gate));

    expect(
      nedostaju,
      `netlify.toml postavlja, a dist-gate ne: ${nedostaju.join(', ')}. `
      + 'Dodaj ih u `env:` produkcijskog build koraka ILI ih svjesno stavi u SAMO_PRI_OBJAVI uz razlog.',
    ).toEqual([]);
  });

  it('MUTACIJA: iznimka NIJE prazan popis koji sve propusta', () => {
    // Da je `SAMO_PRI_OBJAVI` prosiren "da prode", gard bi tiho prestao gristi. Ovo tvrdi da je
    // dopustena tocno jedna, imenovana varijabla, pa svako sljedece prosirenje mora dirati i test.
    const izvor = readFileSync(join(KORIJEN, 'tests/deploy-runtime-parity.test.ts'), 'utf8');
    const popis = /SAMO_PRI_OBJAVI = new Set\(\[([^\]]*)\]\)/.exec(izvor)?.[1] ?? '';
    expect([...popis.matchAll(/'([^']+)'/g)].map((m) => m[1])).toEqual(['LEKTA_REQUIRE_RELEASE_PROOF']);
  });

  it('SENTINEL: citaci stvarno nalazi sadrzaj, a ne prazan niz', () => {
    // Prazan `dist-gate` blok bi obje tvrdnje iznad ucinio vakuumskima.
    expect(distGate().length).toBeGreaterThan(400);
    expect(TOML.length).toBeGreaterThan(400);
  });
});

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * OSTATAK METAFORE (deseta tocka vlasnikova pregleda: "svedi na tri povrsine").
 *
 * Kad se markup neke scene ukloni, njezin STIL ostane. Ne pada nijedan test, ne mijenja se nijedan
 * ekran, i sljedeci citatelj vidi pravila za post-it, ocjenu na papiru i marquee vrpcu, pa zakljuci
 * da ta scena postoji. Izmjereno 2026-09-08: 31 takav razred, 8,1 KB, sve od scene koja je otisla.
 *
 * ZASTO RATCHET, A NE NULA: 16 preostalih zivi u `@media` blokovima i u jednom `:is(...)` popisu,
 * gdje automatsko rezanje trazi razumijevanje konteksta, a krivo skracena lista selektora tiho
 * mijenja sto se na sto primjenjuje. Brojka zato smije samo PADATI, kao i ostali ratcheti ovdje.
 *
 * MJERI SE DEFINICIJA PROTIV UPOTREBE, a ne prisutnost imena. Dva puta se pokazalo da je razlika
 * odlucujuca: spomen razreda u KOMENTARU nije definicija (prvo mjerenje je zbog toga tvrdilo da je
 * `.hd-back` ziv), a `grep` kroz cjevovod je za `demo-bar` javio "nigdje" dok stoji u
 * `rad/index.html`, jer je cjevovod djelomicno pukao pa ipak vratio broj.
 */
const KORIJEN = process.cwd();
const IZVORI = ['src/shared/page-app.css', 'src/shared/page-chrome.css', 'src/ui/hero-depth.css'];
const PREFIKSI = ['hd-', 'hero-', 'ks-'];

/**
 * NULA, ne ratchet. Prva izvedba ovog garda bila je ratchet na 16, jer je automatski rez stao pred
 * `@media` blokovima i jednim `:is(...)` popisom. Gard je odmah pokazao da tvrdnja nije istinita
 * (stil za post-it je stajao), pa je ostatak dovrsen rucno, osam doslovnih zahvata. Brojka je time
 * nula i takva se i cuva: mrtav stil koji "smije postojati do 16" je dozvola, ne gard.
 */
const DOPUSTENI_MRTVI: readonly string[] = [];

const PRESKOCI = new Set(['node_modules', 'dist', 'dist-packs', 'prototype', 'reference', '.git', 'tests', 'coverage']);

function skupi(dir: string, nastavci: readonly string[], out: string[] = []): string[] {
  for (const ime of readdirSync(dir)) {
    if (PRESKOCI.has(ime)) continue;
    const put = join(dir, ime);
    let jeDir = false;
    try { jeDir = statSync(put).isDirectory(); } catch { continue; }
    if (jeDir) skupi(put, nastavci, out);
    else if (nastavci.some((n) => ime.endsWith(n))) out.push(put);
  }
  return out;
}

function bezKomentara(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

function definiraniRazredi(): Set<string> {
  const out = new Set<string>();
  for (const f of IZVORI) {
    const s = bezKomentara(readFileSync(join(KORIJEN, f), 'utf8'));
    for (const m of s.matchAll(/\.([A-Za-z][A-Za-z0-9_-]*)/g)) {
      if (PREFIKSI.some((p) => m[1].startsWith(p))) out.add(m[1]);
    }
  }
  return out;
}

function upotreba(): string {
  const datoteke = [...skupi(KORIJEN, ['.html']), ...skupi(join(KORIJEN, 'src'), ['.ts'])];
  // SENTINEL: prazan skup bi dao "sve je mrtvo", dakle lazan nalaz umjesto pada.
  expect(datoteke.length, 'nije pronadjena nijedna datoteka za mjerenje upotrebe').toBeGreaterThan(50);
  return datoteke.map((f) => readFileSync(f, 'utf8')).join('\n');
}

function mrtvi(): string[] {
  const koristeno = upotreba();
  return [...definiraniRazredi()].filter((r) => !koristeno.includes(r)).sort();
}

describe('mrtav stil uklonjene scene', () => {
  it('nijedan `hd-/hero-/ks-` razred nema stil bez markupa', () => {
    const m = mrtvi().filter((r) => !DOPUSTENI_MRTVI.includes(r));
    expect(m, `stil postoji, a markup ne: ${m.join(', ')}`).toEqual([]);
  });

  it('scena iz brifa se ne vraca kroz stil', () => {
    // Cetiri imena koja je vlasnik izrijekom poslao van: post-it, ocjena na papiru, vrpca, replay.
    // Imenovana su posebno jer bi ih opci gard iznad propustio cim im netko doda i markup; ovdje se
    // trazi svjesna odluka, ne slucajno vracanje scene.
    const definirani = definiraniRazredi();
    for (const r of ['hd-postit', 'hd-score-n', 'ks-tape', 'hero-replay']) {
      expect(definirani.has(r), `\`.${r}\` je vracen u stil`).toBe(false);
    }
  });

  it('SENTINEL: mjerenje stvarno cita definicije, ne prazan skup', () => {
    // Bez ovoga bi pokvaren citac dao nula razreda, nula mrtvih i savrseno zelen gard.
    expect(definiraniRazredi().size).toBeGreaterThan(100);
  });
});

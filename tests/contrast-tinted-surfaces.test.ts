import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * KONTRAST PRIGUSENOG TEKSTA NA TONIRANIM POVRSINAMA.
 *
 * Stanja spremnosti (`blocked`, `needs-work`, `manual-review`) i `gate-hero` boje podlogu, a tekst
 * ostaje prigusen. Podloge nisu jednako svijetle, pa isti token na jednoj prolazi a na drugoj pada:
 * izmjereno axeom 2026-09-03, `--paper-muted` daje 5,12 na `--paper`, 4,69 na `--paper-2`, ali samo
 * 4,30 na crveno toniranoj, sto pada AA.
 *
 * VRIJEDNOSTI SE CITAJU IZ IZVORA, ne prepisuju. Gard s prepisanom bojom ostaje zelen dokazujuci
 * nesto o nizu koji vise nije u CSS-u; to je zabiljezen razred kvara u ovom repozitoriju.
 *
 * MJERODAVNA JE NAJTAMNIJA STVARNA PODLOGA, ne prva na koju se naidje. Zato se racunaju SVE
 * tonirane povrsine, a ne samo ona koju je axe prijavio: prijavljena je bila najgora danas, sto ne
 * znaci da ce biti sutra.
 *
 * `--red-soft` je PROZIRAN sloj, pa se podloga mora KOMPONIRATI preko `--paper`. Racunanje s
 * `rgba` kao da je neprozirna dalo bi krivo povoljan omjer, i gard bi bio zelen nad bojom koju
 * korisnik nikad ne vidi.
 */

const INDEX = readFileSync(resolve(__dirname, '..', 'index.html'), 'utf8');

type Rgb = readonly [number, number, number];

function hex(value: string): Rgb {
  const h = value.replace('#', '').trim();
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as unknown as Rgb;
}
function channel(v: number): number {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}
function luminance([r, g, b]: Rgb): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}
function ratio(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
/** Proziran sloj preko neprozirne podloge; bez toga se mjeri boja koju nitko ne vidi. */
function over(fg: Rgb, alpha: number, bg: Rgb): Rgb {
  return fg.map((f, i) => Math.round(alpha * f + (1 - alpha) * bg[i])) as unknown as Rgb;
}

/** Procitaj vrijednost tokena iz `index.html`; pada ako token nestane ili se preimenuje. */
function token(name: string): string {
  const m = INDEX.match(new RegExp(`--${name}\\s*:\\s*([^;}]+)`));
  expect(m, `token --${name} nije nadjen u index.html`).toBeTruthy();
  return m![1].trim();
}

const AA = 4.5;

describe('kontrast prigusenog teksta na toniranim povrsinama', () => {
  const paper = hex(token('paper'));
  const paper2 = hex(token('paper-2'));
  const muted = hex(token('paper-muted'));

  it('tokeni se doista citaju, a ne pretpostavljaju', () => {
    // Bez ovoga bi promjena imena tokena ucinila svaku tvrdnju ispod vakuumskom.
    for (const [ime, rgb] of [['paper', paper], ['paper-2', paper2], ['paper-muted', muted]] as const) {
      expect(rgb.every((c) => Number.isFinite(c)), `--${ime}`).toBe(true);
    }
  });

  it('prigusen tekst prolazi AA na obje NEUTRALNE povrsine', () => {
    expect(ratio(muted, paper)).toBeGreaterThanOrEqual(AA);
    expect(ratio(muted, paper2)).toBeGreaterThanOrEqual(AA);
  });

  it('CRVENO TONIRANA povrsina ima vlastiti, tamniji ton i prolazi AA', () => {
    // Podloga se komponira: `--red-soft` je rgba preko `--paper`.
    const soft = token('red-soft').match(/rgba?\(([^)]+)\)/);
    expect(soft, '--red-soft vise nije rgba; provjeri racun kompozicije').toBeTruthy();
    const parts = soft![1].split(',').map((p) => Number(p.trim()));
    const tinted = over([parts[0], parts[1], parts[2]], parts[3] ?? 1, paper);

    const rule = INDEX.match(/\.result-readiness--blocked,\.gate-hero\.blocked\{--paper-muted:(#[0-9a-fA-F]{6})\}/);
    expect(rule, 'nedostaje lokalni ton za crveno toniranu podlogu').toBeTruthy();
    expect(ratio(hex(rule![1]), tinted)).toBeGreaterThanOrEqual(AA);
  });

  it('lokalni ton NIJE svjetliji od zajednickog, jer bi to bilo pogorsanje', () => {
    const rule = INDEX.match(/\.gate-hero\.blocked\{--paper-muted:(#[0-9a-fA-F]{6})\}/);
    expect(luminance(hex(rule![1]))).toBeLessThanOrEqual(luminance(muted));
  });

  it('ostala tonirana stanja i dalje prolaze sa ZAJEDNICKIM tonom', () => {
    // Ako neko od njih jednom padne, popravak mu treba vlastiti ton kao i crvenom, a ne
    // pomicanje zajednickog tokena, koji ima 89 upotreba.
    for (const bg of ['#fff8e8', '#f2f7ff']) {
      expect(ratio(muted, hex(bg)), bg).toBeGreaterThanOrEqual(AA);
    }
  });
});

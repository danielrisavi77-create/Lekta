import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * KRUZNI UVOZI u `src/` (T16, korak B1).
 *
 * Kruzni import je najtisi kvar u ovom repozitoriju: `tsc` prolazi, `vite build` prolazi, a pada
 * tek u pregledniku, i to obicno kao "nesto je undefined" daleko od uzroka. Zato mu treba vlastita
 * mjera, a ne nada da ce ga netko primijetiti.
 *
 * MJERI SE SAMO ONO STO POSTOJI U IZVODJENJU. `import type` i `export type` TypeScript BRISE pri
 * prevodjenju, pa takav brid ne moze proizvesti kvar zbog kojeg ovaj gard postoji: nema modula koji
 * se izvodi, nema `undefined` u pregledniku. Brojati ih znaci mjeriti nesto drugo od onoga sto se
 * tvrdi.
 *
 * ZASTO JE TO VAZNO, izmjereno 2026-09-03: dok su se type-only bridovi brojali, gard je javljao 17
 * ciklusa, od kojih je STVARAN bio jedan. Trinaest prividnih bilo je `fixers.ts` -> pojedinacni
 * fixer -> `fixers.ts`, i upravo su ona navela na zakljucak da repair jezgra ima problem koji se
 * "ne popravlja usput jer je golden-zasticena". U izvodjenju ondje ciklusa NEMA nijednog.
 *
 * KOMENTARI SE NE BROJE. Ostatak nakon izuzeca type-only bridova bio je jedan jedini "ciklus",
 * `legal-content.ts <-> terms-version.ts`, i ni on nije postojao: `terms-version.ts` nema NIJEDAN
 * uvoz (osam redaka), a detektor je uhvatio `from '../legal/legal-content.ts'` napisano unutar
 * `//` komentara koji objasnjava da ga legal-content re-exporta. Regex nad sirovim tekstom ne zna
 * razliku izmedju koda i proze o kodu.
 *
 * Uklanjanje komentara gubi TOCNO JEDAN brid (531 -> 530) i obara ciklus 1 -> 0, dakle ne reze
 * nijedan stvaran uvoz. Brisu se blok komentari i CIJELI redci koji pocinju s `//`; zavrsni komentar
 * iza koda se NE dira, jer bi rezanje od `//` do kraja retka pojelo i `'https://...'` u nizu.
 *
 * Mjesoviti `import { type X, Y }` se NE izuzima: takav uvoz nosi i vrijednost, pa brid ostaje.
 */

const KORIJEN = path.resolve(__dirname, '..');

/**
 * Izmjereno 2026-09-03 nad grafom BEZ type-only bridova. Smije samo padati.
 *
 * POVIJEST PRAGA, imenovano a ne prepravljeno u tisini:
 *   16 -> 17, isti dan, zbog `heading-structure.ts <-> heading-numbering.ts`.
 *   17 -> 1, isti dan. TO NIJE NAPREDAK NEGO ISPRAVAK MJERE: nijedan ciklus nije razrijesen, nego
 *   je prestalo brojanje bridova koje TypeScript brise. Sesnaest od sedamnaest bilo je type-only,
 *   ukljucujuci svih trinaest u repair jezgri i onaj sedamnaesti nad hijerarhijom naslova.
 *   1 -> 0, isti dan, istim povodom: zadnji preostali nije bio uvoz nego RECENICA O UVOZU, napisana
 *   u `//` komentaru. Nula ovdje znaci da `src/` u izvodjenju nema nijedan kruzni uvoz, a NE da ih
 *   gard vise ne trazi; prvi stvarni pada odmah, jer prag je egzaktan.
 *
 * Svako sljedece dizanje trazi isti oblik: koji ciklus, odakle, i zasto se ne popravlja odmah.
 */
const MAX_CIKLUSA = 0;

/** Blok komentari i CIJELI `//` redci. Zavrsni komentar iza koda ostaje (vidi zaglavlje). */
const BLOK_KOMENTAR = /\/\*[\s\S]*?\*\//g;
const REDAK_KOMENTAR = /^[ \t]*\/\/.*$/gm;

/**
 * Cijele `import type` / `export type` naredbe. Namjerno se brise CIJELA naredba, a ne samo rijec
 * `type`: ostatak bi i dalje nosio `from '...'` i brid bi prezivio, pa bi izuzece izgledalo kao da
 * radi a ne bi radilo.
 */
const TYPE_ONLY = /^[ \t]*(?:import|export)[ \t]+type[ \t][\s\S]*?from[ \t]*['"][^'"]+['"][ \t]*;?/gm;

function svePutanje(): string[] {
  const out: string[] = [];
  const hodaj = (p: string) => {
    for (const d of fs.readdirSync(p, { withFileTypes: true })) {
      const q = path.join(p, d.name);
      if (d.isDirectory()) { hodaj(q); continue; }
      if (/\.tsx?$/.test(d.name) && !/\.test\.tsx?$/.test(d.name)) {
        out.push(path.relative(KORIJEN, q).split(path.sep).join('/'));
      }
    }
  };
  hodaj(path.join(KORIJEN, 'src'));
  return out;
}

function nadjiCikluse(): { ciklusi: string[]; graf: Map<string, string[]> } {
  const datoteke = svePutanje();
  const skup = new Set(datoteke);
  const razrijesi = (od: string, spec: string): string | null => {
    if (!spec.startsWith('.')) return null;
    const baza = path.posix.join(path.posix.dirname(od), spec);
    for (const nastavak of ['', '.ts', '.tsx', '/index.ts']) {
      const kandidat = (baza + nastavak).replace(/\.ts\.ts$/, '.ts');
      if (skup.has(kandidat)) return kandidat;
    }
    return null;
  };

  const graf = new Map<string, string[]>();
  for (const f of datoteke) {
    const t = fs.readFileSync(path.join(KORIJEN, f), 'utf8')
      .replace(BLOK_KOMENTAR, '')
      .replace(REDAK_KOMENTAR, '')
      .replace(TYPE_ONLY, '');
    const veze = new Set<string>();
    for (const m of t.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)) {
      const c = razrijesi(f, m[1]);
      if (c && c !== f) veze.add(c);
    }
    graf.set(f, [...veze]);
  }

  const stanje = new Map<string, number>();
  const ciklusi: string[] = [];
  const dfs = (n: string, staza: string[]) => {
    stanje.set(n, 1);
    for (const s of graf.get(n) ?? []) {
      if (stanje.get(s) === 1) { ciklusi.push([...staza.slice(staza.indexOf(s)), s].join(' -> ')); continue; }
      if (!stanje.has(s)) dfs(s, [...staza, s]);
    }
    stanje.set(n, 2);
  };
  for (const f of datoteke) if (!stanje.has(f)) dfs(f, [f]);
  return { ciklusi: [...new Set(ciklusi)], graf };
}

describe('graf modula u src/', () => {
  const { ciklusi, graf } = nadjiCikluse();

  it('mjerenje nije vakuumsko: graf je stvarno prosetan', () => {
    expect(svePutanje().length, 'nula datoteka znaci da setac ne radi').toBeGreaterThan(200);
  });

  it('ratchet: broj kruznih uvoza smije samo padati', () => {
    expect(ciklusi.length, `kruzne putanje:\n${ciklusi.slice(0, 10).join('\n')}`).toBeLessThanOrEqual(MAX_CIKLUSA);
  });

  /**
   * Bilo je `> MAX_CIKLUSA - 4`, sto je uz prag 17 imalo smisla, a uz prag 1 znaci `> -3`, dakle
   * uvijek istina. Egzaktna jednakost je jedini oblik koji uz mali prag jos nesto tvrdi.
   */
  it('kad ih se popravi, ratchet se MORA spustiti', () => {
    expect(
      ciklusi.length,
      `ciklusa je sada ${ciklusi.length}, a prag ${MAX_CIKLUSA}. Spusti MAX_CIKLUSA na izmjerenu vrijednost.`,
    ).toBe(MAX_CIKLUSA);
  });

  /** Oblik, ne broj. Uz nula ciklusa petlja je prazna i to je uredu: tvrdnja pazi na ISPIS kad se
   *  ciklus pojavi, a da se pojavio, prethodna dva testa bi vec pala. */
  it('ciklusi su IMENOVANI, ne samo prebrojani', () => {
    for (const c of ciklusi) expect(c).toContain(' -> ');
  });

  /**
   * Gard nad izuzecem KOMENTARA. Uvoz napisan u komentaru je upravo ono sto je godinama pravilo
   * lazan ciklus (`terms-version.ts` nema nijedan uvoz, a gard je tvrdio da ih ima).
   */
  it('uvoz napisan u komentaru se ne broji, a pravi kod se broji', () => {
    const ocisti = (s: string) => s
      .replace(new RegExp(BLOK_KOMENTAR.source, 'g'), '')
      .replace(new RegExp(REDAK_KOMENTAR.source, 'gm'), '');
    expect(ocisti("// vidi `from './x'` u drugom modulu"), 'redak-komentar mora nestati').not.toContain('./x');
    expect(ocisti("/* from './x' */"), 'blok-komentar mora nestati').not.toContain('./x');
    // NEGATIVNE KONTROLE: pravi kod ostaje, i zavrsni komentar ne smije pojesti redak koda.
    expect(ocisti("import { a } from './x';"), 'pravi uvoz mora ostati').toContain('./x');
    expect(ocisti("import { a } from './x'; // napomena"), 'kod ispred komentara mora ostati').toContain('./x');
  });

  /**
   * Gard nad IZUZECEM type-only bridova. Bez njega bi netko vratio njihovo brojanje, broj bi skocio
   * sa 1 na 17, a jedini simptom bio bi crven ratchet daleko od uzroka. Radi nad sintetickim
   * nizovima, pa ne ovisi o tome kako je izvor danas napisan.
   */
  it('type-only uvozi se izuzimaju, a mjesoviti NE', () => {
    const strip = (s: string) => s.replace(new RegExp(TYPE_ONLY.source, 'gm'), '');
    expect(strip("import type { A } from './x';").trim(), 'import type mora nestati').toBe('');
    expect(strip("export type { A } from './x';").trim(), 'export type mora nestati').toBe('');
    // NEGATIVNE KONTROLE: ovi nose vrijednost, pa brid MORA ostati.
    expect(strip("import { type A, b } from './x';"), 'mjesoviti uvoz nosi vrijednost').toContain('./x');
    expect(strip("import { a } from './x';"), 'obicni uvoz mora ostati').toContain('./x');
    // Mjerenje ne smije ostati bez bridova: izuzece cisti sum, ne graf.
    const bridova = [...graf.values()].reduce((n, v) => n + v.length, 0);
    expect(bridova, 'izuzece je pojelo graf').toBeGreaterThan(200);
  });
});

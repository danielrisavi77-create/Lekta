/**
 * buildFacultyStylePage()/buildIndexPage() u scripts/generate-citation-tools.mjs generiraju
 * <title>/<meta description> za staticke SEO stranice citatnog alata. Regresija: description
 * je tvrdio "provjereno i s izvorom" cak i kad style.spec uopce ne postoji (71/142 stranica), i
 * "tocno ... s izvorom i datumom provjere" cak i kad je style.spec samo style-pin (dokazuje SAMO
 * koji je stil propisan, ne i tocan format) - u oba slucaja SERP opis tvrdi razinu potvrde koju
 * stranica stvarno nema (runtime JS/#style-info interno vec ispravno priznaje "provjeri kod
 * mentora"). Test cita izvor kao tekst: main() ima tesku bocnu ucin (cita profile, pise dist/),
 * nije modul-safe za import (isti razlog kao tests/deploy-origin.test.ts).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'scripts/generate-citation-tools.mjs'), 'utf8');

function extractFn(name: string): string {
  const start = src.indexOf(`function ${name}(`);
  if (start === -1) throw new Error(`${name} nije nadjena u generate-citation-tools.mjs`);
  const next = src.indexOf('\nfunction ', start + 1);
  return src.slice(start, next === -1 ? src.length : next);
}

describe('generate-citation-tools.mjs: SEO description ne tvrdi vecu razinu potvrde nego stvarnu', () => {
  const facFn = extractFn('buildFacultyStylePage');
  const idxFn = extractFn('buildIndexPage');

  it('buildFacultyStylePage: description grana bez ikakvog speca ne tvrdi "provjereno" ni "s izvorom"', () => {
    expect(facFn).toContain('const description = style.spec && style.spec.pin');
    expect(facFn).toContain('prema profilu Lekte; točnu interpunkciju provjeri');
    expect(facFn).not.toMatch(/za \$\{displayName\}, provjereno i s izvorom/);
  });

  it('buildFacultyStylePage: description grana za style-pin ne tvrdi "tocno" ni "s izvorom i datumom provjere" (pin dokazuje samo koji je stil propisan, ne format)', () => {
    expect(facFn).toContain('službeno potvrđeno); format prema općem obliku stila');
    expect(facFn).not.toMatch(/Fakultet propisuje[\s\S]{0,80}točno[\s\S]{0,40}s izvorom i datumom provjere/);
  });

  it('buildFacultyStylePage: metaLine (vidljivi tekst) za style-pin ne spominje "službene upute" dvaput u istoj recenici', () => {
    // style.label (za razliku od shortLabel) vec nosi punu provenijenciju u zagradama; "Format:
    // opci oblik stila" MORA koristiti shortLabel, ne label, ili se "sluzbene upute" ponavlja.
    expect(facFn).toMatch(/Format: opći oblik stila \$\{escapeHtml\(style\.shortLabel\)\}/);
  });

  it('buildIndexPage: uvodna recenica i description ne tvrde blanket "provjereno"/"tocno ... provjereno i s izvorom" za sve fakultete', () => {
    expect(idxFn).not.toMatch(/Provjereno prema profilima Lekte/);
    expect(idxFn).not.toMatch(/točno po njegovim pravilima, provjereno i s izvorom/);
    expect(idxFn).toMatch(/razina potvrde ovisi o (dostupnom izvoru|fakultetu)/);
  });
});

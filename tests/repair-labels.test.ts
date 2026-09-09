import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * OZNAKE STAVKI POPRAVKA SU KORISNICKI TEKST, ne imena modula.
 *
 * Zateceno 2026-09-09: od 25 oznaka, SEDAM je bilo interno ime motora ("Consistency Engine",
 * "Section Surgery Engine", "Field Integrity", "Final Document Inspector", "Bibliography Repair
 * Engine", "Cross-file Submission Consistency", "Advanced Legal Footnote Repair"). Ostalih 18 su
 * uredne hrvatske recenice ("Sadrzaj: pretvori u zivo TOC polje"), pa kod vec zna kako se to radi;
 * tih sedam je jednostavno ostalo u razvojnom zargonu.
 *
 * Postalo je vidljivije sedmom tockom: plan ispravaka ih stavlja pod "Treba tvoju odluku", dakle
 * na mjesto gdje student odlucuje. "Section Surgery Engine" ondje nije ime nego prepreka.
 *
 * PRAVILO JE STRUKTURNO, NE POPIS. Popis od sedam imena bi cuvao proslost; ovo cuva OBLIK: oznaka
 * pisana za hrvatskog studenta nikad nije cist ASCII Title Case kroz sve rijeci. Time gard grize i
 * na fixer koji jos nije napisan, a hrvatske oznake (druga rijec malim slovom, dijakritici,
 * dvotocka, zagrade) prolaze bez iznimke.
 */
const IZVOR = join(process.cwd(), 'src/ui/repair-items.ts');

/** Cist ASCII Title Case kroz DVIJE ili vise rijeci: "Consistency Engine", "Field Integrity". */
const INTERNO_IME = /^[A-Z][a-zA-Z-]*(?: [A-Z][a-zA-Z-]*)+$/;

function oznake(): string[] {
  const bezKomentara = readFileSync(IZVOR, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const out: string[] = [];
  for (const m of bezKomentara.matchAll(/label:\s*'((?:[^'\\]|\\.)*)'/g)) out.push(m[1]);
  for (const m of bezKomentara.matchAll(/label:\s*`([^`]*)`/g)) out.push(m[1]);
  return out;
}

describe('oznake popravaka su na jeziku korisnika', () => {
  it('nijedna oznaka nije interno ime motora', () => {
    const lose = oznake().filter((o) => INTERNO_IME.test(o));
    expect(lose, `oznake koje zvuce kao ime modula: ${lose.join(' | ')}`).toEqual([]);
  });

  it('SENTINEL: citac stvarno nalazi oznake', () => {
    // Bez ovoga bi pokvaren izraz dao nula oznaka, nula losih i savrseno zelen gard.
    expect(oznake().length).toBeGreaterThan(20);
  });

  it('MUTACIJA: pravilo prepoznaje tocno ona imena koja su uklonjena', () => {
    for (const staro of [
      'Consistency Engine', 'Section Surgery Engine', 'Field Integrity',
      'Final Document Inspector', 'Bibliography Repair Engine',
      'Cross-file Submission Consistency', 'Advanced Legal Footnote Repair',
    ]) {
      expect(INTERNO_IME.test(staro), `${staro} bi prosao`).toBe(true);
    }
  });

  it('KONTROLA: hrvatske oznake NE padaju', () => {
    // Bez ove strane bi pravilo koje vristi na sve izgledalo jednako uspjesno.
    for (const dobra of [
      'Prazni odlomci',
      'Velika slova naslova',
      'Sekcije: margine, orijentacija i numeracija',
      'Word polja i sidra: osvježavanje pri otvaranju',
      'Numeriranje stranica od Uvoda (rimski/arapski)',
      'Hrvatski tehničko-tipografski čistač',
    ]) {
      expect(INTERNO_IME.test(dobra), `${dobra} bi bila lazno prijavljena`).toBe(false);
    }
  });
});

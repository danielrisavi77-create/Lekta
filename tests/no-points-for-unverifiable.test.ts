import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeCheck, unmeasurableCheck } from '../src/scoring/checks';

/**
 * BODOVI SE NE DAJU ZA ONO STO SE NIJE PROVJERILO.
 *
 * Razred je vec jednom ciscen (2026-08-20, uveden status `unmeasurable` za font/prored/margine),
 * ali su dvije provjere prezivjele jer njihov `detail` ne kaze "vrijednost nije zapisana" nego
 * "treba rucni pregled". Obje su davale PUNE bodove tocno zato sto se nesto NE MOZE provjeriti:
 *
 *   'Zahtjevi za ručnu završnu provjeru'  makeCheck(...,'warn',3,3,'... nije moguće pouzdano provjeriti ...')
 *   'Automatizacija citatnog stila'       makeCheck(...,'warn',3,3,'... ručna završna provjera potrebna')
 *
 * Izmjereno na 246 stvarnih radova: obje su pogadjale 246 od 246, dakle svaki je rad dobivao 6
 * bodova za dvije stvari koje nitko nije provjerio.
 *
 * Prvi test cuva sam mehanizam, drugi cuva da se isti obrazac ne vrati u jezgru.
 */

describe('nemjerljivo ne nosi bodove', () => {
  it('unmeasurableCheck je nebodovan i izlazi iz nazivnika', () => {
    const c = unmeasurableCheck('structure', 'Nesto', 'ne moze se ocitati');
    expect(c.earned).toBe(0);
    expect(c.max).toBe(0);
    expect(c.scored).toBe(false);
  });

  it('makeCheck sa statusom unmeasurable nulira i bodove koje mu se pokusa dati', () => {
    // Negativna kontrola mehanizma: da makeCheck ne nulira, poziv s 3,3 bi ih zadrzao.
    const c = makeCheck('structure', 'Nesto', 'unmeasurable', 3, 3, 'ne moze se ocitati');
    expect(c.earned).toBe(0);
    expect(c.max).toBe(0);
  });

  it('jezgra ne dodjeljuje bodove uz detail koji priznaje da provjere nema', () => {
    // Sken izvora, ne ponasanja: obrazac se vraca tihо (copy-paste novog checka), a golden ga ne
    // vidi jer golden mjeri ISHOD na fixturama, a ove provjere ovise o profilu, ne o dokumentu.
    const src = readFileSync(join(__dirname, '..', 'src', 'analysis', 'analyze-docx.ts'), 'utf8');
    const admissions = [
      'nije moguće pouzdano provjeriti',
      'ručna završna provjera potrebna',
      'nije moguće utvrditi',
    ];
    for (const phrase of admissions) {
      const at = src.indexOf(phrase);
      if (at < 0) continue;
      // Uzmi poziv koji tu frazu sadrzi: od zadnjeg 'makeCheck('/'unmeasurableCheck(' prije nje.
      const head = src.slice(Math.max(0, at - 400), at);
      const lastMake = head.lastIndexOf('makeCheck(');
      const lastUnmeasurable = head.lastIndexOf('unmeasurableCheck(');
      expect(
        lastUnmeasurable > lastMake,
        `Provjera koja u detailu priznaje "${phrase}" mora ici kroz unmeasurableCheck, ne makeCheck s bodovima`,
      ).toBe(true);
    }
  });
});

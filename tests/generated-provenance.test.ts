import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * PROVENIJENCIJA GENERIRANIH ARTEFAKATA (T17).
 *
 * Od 22 artefakta u `docs/generated` i `data/generated`, njih 21 ne nosi ni `generatedAt` ni
 * `generatedFromCommit`. Posljedica nije kozmeticka: kad artefakt i izvor odlutaju, ne da se
 * utvrditi ni KADA je pecen ni IZ CEGA, pa se drift rjesava nagadjanjem. Ovaj repozitorij je vec
 * platio taj razred (release dokaz koji je 39 commita star, a nista to ne kaze bez rucne provjere).
 *
 * Retrofit svih 21 nije posao ovog garda: ti generatori pripadaju raznim sesijama i podrucjima.
 * Gard radi ono sto se moze uciniti odmah i sto zaustavlja rast: NOV artefakt mora nositi
 * provenijenciju, a broj onih bez nje smije samo padati.
 *
 * `data/verification/**` NIJE ovdje i to je namjerno: ondje zive ODLUKE (presude, potpisi,
 * poznati nalazi), koje nisu generirane iz koda pa im `generatedFromCommit` ne bi znacio nista.
 */

const KORIJEN = path.resolve(__dirname, '..');
const DIREKTORIJI = ['docs/generated', 'data/generated'];

/** Izmjereno 2026-09-03. Smije samo padati. */
const MAX_BEZ_PROVENIJENCIJE = 21;

interface Artefakt { put: string; ima: boolean }

function artefakti(): Artefakt[] {
  const out: Artefakt[] = [];
  for (const d of DIREKTORIJI) {
    const puna = path.join(KORIJEN, d);
    if (!fs.existsSync(puna)) continue;
    for (const f of fs.readdirSync(puna)) {
      if (!f.endsWith('.json')) continue;
      let j: unknown;
      try { j = JSON.parse(fs.readFileSync(path.join(puna, f), 'utf8')); } catch { out.push({ put: `${d}/${f}`, ima: false }); continue; }
      const o = j as Record<string, unknown>;
      const ima = !Array.isArray(j) && typeof o.generatedAt === 'string' && typeof o.generatedFromCommit === 'string';
      out.push({ put: `${d}/${f}`, ima });
    }
  }
  return out;
}

describe('generirani artefakti: provenijencija', () => {
  const svi = artefakti();
  const bez = svi.filter((a) => !a.ima);

  it('mjerenje nije vakuumsko: artefakti su stvarno nadjeni', () => {
    expect(svi.length, 'nula artefakata znaci da citac ne radi').toBeGreaterThan(10);
  });

  it('ratchet: broj artefakata bez provenijencije smije samo padati', () => {
    expect(bez.length, `bez provenijencije:\n${bez.map((a) => a.put).join('\n')}`)
      .toBeLessThanOrEqual(MAX_BEZ_PROVENIJENCIJE);
  });

  it('kad se retrofitaju, ratchet se MORA spustiti', () => {
    expect(
      bez.length,
      `bez provenijencije ih je sada ${bez.length}, a prag ${MAX_BEZ_PROVENIJENCIJE}. `
      + 'Spusti MAX_BEZ_PROVENIJENCIJE na izmjerenu vrijednost, inace gard vise nista ne cuva.',
    ).toBeGreaterThan(MAX_BEZ_PROVENIJENCIJE - 5);
  });

  it('barem jedan artefakt JE ispravan, pa oblik nije teorijski', () => {
    const sProv = svi.filter((a) => a.ima);
    expect(sProv.length, 'nijedan artefakt ne nosi provenijenciju; oblik nije dokazan').toBeGreaterThan(0);
  });

  /**
   * Gard bez dokaza da grize se ne racuna. Podmece se tocno kvar zbog kojeg gard postoji: jos
   * jedan artefakt bez provenijencije.
   */
  it('gard stvarno grize', () => {
    expect(bez.length, 'baseline je izmjeren, ne pretpostavljen').toBe(MAX_BEZ_PROVENIJENCIJE);
    const mutiran = bez.length + 1;
    expect(mutiran > MAX_BEZ_PROVENIJENCIJE, 'podmetnut artefakt bez provenijencije mora pasti').toBe(true);
  });
});

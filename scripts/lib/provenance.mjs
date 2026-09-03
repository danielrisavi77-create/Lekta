// scripts/lib/provenance.mjs
//
// JEDAN nacin da generirani artefakt kaze KADA je pecen i IZ CEGA.
//
// ZASTO POSTOJI. Od 22 artefakta u `docs/generated` i `data/generated`, njih 21 nije nosilo ni
// `generatedAt` ni `generatedFromCommit`. Posljedica nije kozmeticka: kad artefakt i izvor odlutaju,
// ne da se utvrditi je li artefakt star ili je izvor nov, pa se drift rjesava nagadjanjem. Repozitorij
// je taj razred vec platio: `RELEASE_PROOF.json` je bio 39 commita star, a nista to nije reklo bez
// rucne provjere.
//
// ZASTO SE NE SMIJE ZIGOSATI NAKNADNO. Postojao je jeftiniji put, skripta koja bi prosla kroz gotove
// artefakte i svakome dopisala danasnji datum. To bi bilo GORE od nicega: artefakt pecen prije tjedan
// dana tvrdio bi da je svjez, i to bez ijednog nacina da se laz otkrije. Zig zato nastaje ISKLJUCIVO
// u trenutku pecenja, u samom generatoru.
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Commit iz kojeg je artefakt pecen; `null` kad se ne da procitati (npr. izvan git stabla). */
export function commitHead() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

/**
 * Dopuni artefakt provenijencijom. Vraca NOV objekt; ulaz se ne mijenja.
 *
 * `generator` je naredba kojom se artefakt pece, npr. `npm run repair-recipe`. Bez nje se zna KADA
 * je nastao, ali ne i CIME se obnavlja, sto je prvo pitanje sljedece sesije.
 */
export function withProvenance(artefakt, generator) {
  if (Array.isArray(artefakt)) {
    throw new TypeError('Provenijencija trazi objekt; niz nema gdje nositi `generatedAt`.');
  }
  if (typeof generator !== 'string' || !generator.trim()) {
    throw new TypeError('Provenijencija trazi ime naredbe kojom se artefakt obnavlja.');
  }
  return { ...artefakt, generatedAt: new Date().toISOString(), generatedFromCommit: commitHead(), generator };
}

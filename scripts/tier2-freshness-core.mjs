// scripts/tier2-freshness-core.mjs
//
// Ciste funkcije iza `npm run tier2-freshness`. Odvojene su da bi bile TESTIRLJIVE: sam skript zove
// git i cita disk.
//
// STO SE PITA: vrijedi li zapisani Tier 2 dokaz (pravi Microsoft Word) JOS UVIJEK za kod koji danas
// stoji u repozitoriju. Tier 2 je Windows-only i rucni, pa ga CI ne moze pokrenuti; jedino sto se
// moze automatizirati je ZNATI da nije pokrenut.
//
// ZASTO POSTOJI: `docs/generated/RELEASE_PROOF.json` biljezi commit na kojem su Word razine prosle,
// ali nista ne usporedjuje taj commit sa stanjem `src/repair/`. Izmjereno 2026-08-30: zapisani dokaz
// stoji na `75904ef3` (2026-08-23), a od tada je palo 8 commita nad `src/repair/`, ukljucujuci
// prepisivanje dubinskog ciscenja i jedan koji u vlastitoj poruci imenuje "tihu korupciju poveznica".
// Nista u repozitoriju to nije reklo. Isti dan su cetiri repair commita otisla u granu, a Word je
// pokrenut samo zato sto je netko tako odlucio.
//
// NE UVODI NOV DNEVNIK: dokaz vec postoji u `RELEASE_PROOF.json` i ondje mu je mjesto. Drugi
// mehanizam koji mjeri isto je greska koju smo isti dan dvaput uhvatili kod drugih alata.

/** Razine koje cine Tier 2 dokaz. Preskocena razina NIJE prolaz (vidi TIERS u release-check.mjs). */
export const TIER2_IDS = ['word', 'word-worst'];

/**
 * Presuda o svjezini.
 *
 * @param proof              parsirani RELEASE_PROOF.json, ili `null` kad ga nema
 * @param repairCommitsSince commiti nad `src/repair/` OD zapisanog commita do HEAD-a (`{sha, subject}`)
 *
 * Vraca `{ fresh, reason, provenCommit, staleCommits, missingTiers }`.
 */
export function tier2Freshness(proof, repairCommitsSince) {
  if (!proof || typeof proof.commit !== 'string' || !proof.commit) {
    return { fresh: false, reason: 'nema-dokaza', provenCommit: null, staleCommits: [], missingTiers: TIER2_IDS };
  }

  const byId = new Map((proof.results ?? []).map((r) => [r.id, r.status]));
  // Nedostajuca razina i preskocena razina su ISTO: dokaza nema. Windows-only preskok se namjerno
  // ne cita kao prolaz, inace bi svaki linux prolaz "dokazao" Word.
  const missingTiers = TIER2_IDS.filter((id) => byId.get(id) !== 'pass');
  if (missingTiers.length) {
    return { fresh: false, reason: 'tier2-nije-prosao', provenCommit: proof.commit, staleCommits: [], missingTiers };
  }

  // Dokaz snimljen nad PRLJAVIM stablom ne opisuje nijedan commit, pa ne moze nista dokazivati.
  if (proof.dirtyWorkingTree === true) {
    return { fresh: false, reason: 'dokaz-s-prljavog-stabla', provenCommit: proof.commit, staleCommits: [], missingTiers: [] };
  }

  if (repairCommitsSince.length) {
    return { fresh: false, reason: 'motor-se-promijenio', provenCommit: proof.commit, staleCommits: repairCommitsSince, missingTiers: [] };
  }

  return { fresh: true, reason: 'svjez', provenCommit: proof.commit, staleCommits: [], missingTiers: [] };
}

const UPUTA = 'Pokreni `npm run verify:word` i `npm run verify:word:worst` (Windows), pa `npm run release:check` da se dokaz zapise.';

/** Izvjestaj za terminal. Svjez ishod se mora citati kao dokaz, a ne kao sutnja. */
export function formatFreshness(status) {
  const kratko = (sha) => String(sha).slice(0, 8);
  switch (status.reason) {
    case 'svjez':
      return `tier2-freshness: SVJEZ. Word dokaz vrijedi za ovaj kod (zapisan na ${kratko(status.provenCommit)}, od tada nema izmjena u src/repair/).`;
    case 'nema-dokaza':
      return `tier2-freshness: NEMA DOKAZA. docs/generated/RELEASE_PROOF.json ne postoji ili nema commit.\n${UPUTA}`;
    case 'tier2-nije-prosao':
      return `tier2-freshness: ZASTARJELO. U zapisanom dokazu (${kratko(status.provenCommit)}) Word razine nisu prosle: ${status.missingTiers.join(', ')}.\nPreskocena razina NIJE prolaz.\n${UPUTA}`;
    case 'dokaz-s-prljavog-stabla':
      return `tier2-freshness: ZASTARJELO. Dokaz (${kratko(status.provenCommit)}) je snimljen nad PRLJAVIM radnim stablom, pa ne opisuje nijedan commit.\n${UPUTA}`;
    default:
      return [
        `tier2-freshness: ZASTARJELO. Od zapisanog dokaza (${kratko(status.provenCommit)}) motor se promijenio ${status.staleCommits.length} put(a):`,
        ...status.staleCommits.map((c) => `  ${kratko(c.sha)}  ${c.subject}`),
        UPUTA,
      ].join('\n');
  }
}

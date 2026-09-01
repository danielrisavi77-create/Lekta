// scripts/projection-freshness.mjs
//
// Tanki omotac oko `projection-freshness-core.mjs`: jedini posao mu je zvati git i ispisati.
// Sva presuda zivi u jezgri, da bi bila testirljiva bez repozitorija. Vidi docblock ondje.
//
//   npm run projection-freshness
//
// Izlazni kod 1 cim je ijedna pecena projekcija zaostala za svojim izvorom.
import { execFileSync } from 'node:child_process';
import { PROJECTIONS, projectionFreshness, formatProjection, exitCodeFor } from './projection-freshness-core.mjs';

const git = (args) => execFileSync('git', args, { encoding: 'utf8' }).trim();

/** Zadnji commit nad BILO KOJIM artefaktom projekcije; `null` ako nijedan nije commitan. */
function lastArtifactSha(artifacts) {
  const shas = artifacts
    .map((p) => { try { return git(['log', '-1', '--format=%H', '--', p]); } catch { return ''; } })
    .filter(Boolean);
  if (!shas.length) return null;
  /**
   * Mjerodavan je NAJNOVIJI artefakt, ne najstariji.
   *
   * Regeneracija ne mora promijeniti SVAKU datoteku projekcije: izmjereno 2026-09-01 na
   * `repair-recipe`, gdje su od cetiri izlaza dva ostala sadrzajno ista, pa nisu ni commitana.
   * Da se gleda najstariji, projekcija bi bila prijavljena kao ustajala odmah nakon urednog
   * pecenja, i alat bi trosio tudje vrijeme na lazan alarm.
   *
   * `--is-ancestor` izlazi s 1 kad je odgovor "ne", pa se cita kroz try, ne kroz izlazni tekst.
   */
  const isAncestor = (a, b) => {
    try { execFileSync('git', ['merge-base', '--is-ancestor', a, b], { stdio: 'ignore' }); return true; } catch { return false; }
  };
  return shas.reduce((newest, sha) => (isAncestor(newest, sha) ? sha : newest), shas[0]);
}

const verdicts = PROJECTIONS.map(({ id, artifacts, sources, regenerate }) => {
  const sha = lastArtifactSha(artifacts);
  if (!sha) return projectionFreshness(id, null, [], regenerate);
  const raw = git(['log', '--format=%h %s', `${sha}..HEAD`, '--', ...sources]);
  const commits = raw ? raw.split('\n').map((line) => {
    const [head, ...rest] = line.split(' ');
    return { sha: head, subject: rest.join(' ') };
  }) : [];
  return projectionFreshness(id, sha, commits, regenerate);
});

console.log('=== svjezina pecenih projekcija ===');
for (const v of verdicts) {
  console.log(formatProjection(v));
  for (const c of v.commits.slice(0, 3)) console.log(`             ${c.sha} ${c.subject.slice(0, 72)}`);
  if (v.commits.length > 3) console.log(`             ... i jos ${v.commits.length - 3}`);
}
const code = exitCodeFor(verdicts);
console.log(code === 0 ? 'sve projekcije prate svoj izvor.' : 'BAREM JEDNA projekcija je ustajala; naredbe za osvjezavanje su gore.');
process.exit(code);

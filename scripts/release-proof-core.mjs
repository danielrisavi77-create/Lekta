// scripts/release-proof-core.mjs
//
// Ciste funkcije iza dokaza izdanja (`docs/generated/RELEASE_PROOF.json`): kako se dokaz VEZE uz
// kod i kako se poslije provjerava je li jos vrijedi. Odvojene su da bi bile TESTIRLJIVE; git i disk
// zovu `release-check.mjs` (pise dokaz) i `verify-deploy-dist.mjs` (gate pri deployu).
//
// ZASTO OTISAK STABLA, A NE `git diff` MEDJU COMMITOVIMA (vanjski audit 2026-09-08, nalaz 1):
// gate je zastarjelost mjerio s `git diff --name-only <commitDokaza> <head>`, a kad git to nije mogao
// (plitak klon na Netlifyju/CI-ju, "fatal: bad object"), catch grana je vracala "nije zastario" i gate
// je ispisao "dokaz o provjerama OK" nad dokazom od kojeg se promijenilo 425 datoteka. Isti build je
// u punom klonu padao. Ishod obavezne provjere ovisio je o dubini klona.
//
// Dokaz zato nosi OTISAK STABLA BEZ SAME DATOTEKE DOKAZA (`treeDigest`), izracunat iz
// `git ls-tree -r HEAD`, koji radi i u plitkom klonu jer treba samo stablo HEAD-a, ne povijest.
// Semantika je ista kao dosadasnja namjera ("od dokaza se smjelo promijeniti samo RELEASE_PROOF.json"):
// otisak se mijenja kad se promijeni bilo koji blob osim dokaza. Blob hashevi dolaze iz gita, ne s
// diska, pa nema CRLF zamke (CLAUDE.md: "gard koji cita datoteku s diska mora normalizirati CR").
//
// TRI ISHODA, po uzoru na master-ci: `fresh`, `stale`, `unknown`. "Ne znam" nikad ne izlazi kao
// svjeze; uz obavezan dokaz i `stale` i `unknown` su pad.
import { createHash } from 'node:crypto';

/** Datoteka dokaza; jedina koja se smije promijeniti nakon pecenja, pa se iz otiska izuzima. */
export const PROOF_PATH = 'docs/generated/RELEASE_PROOF.json';

/**
 * Otisak stabla iz ispisa `git ls-tree -r <commit>`.
 *
 * Redci su oblika `<mode> <tip> <sha>\t<staza>`; uzimaju se samo blobovi, izuzete staze se
 * ispustaju, ostatak se sortira po stazi (git vec sortira, ali se ne oslanjamo na to) i hashira
 * kao `sha\tstaza` po retku. Zavrseci redaka se normaliziraju (`\r\n` -> `\n`).
 *
 * Vraca `null` za prazan ili neparsabilan ispis: prazno stablo nije stanje koje ovaj repozitorij
 * ikad ima, pa je prazno "ne znam", ne "isto".
 */
export function treeDigestFromLsTree(lsTreeText, excludePaths = [PROOF_PATH]) {
  if (typeof lsTreeText !== 'string') return null;
  const excluded = new Set(excludePaths);
  const entries = [];
  for (const raw of lsTreeText.replace(/\r\n/g, '\n').split('\n')) {
    const line = raw.trimEnd();
    if (!line) continue;
    const tab = line.indexOf('\t');
    if (tab < 0) return null;
    const meta = line.slice(0, tab).split(/\s+/);
    const stazaRaw = line.slice(tab + 1);
    if (meta.length < 3) return null;
    const [, tip, sha] = meta;
    if (tip !== 'blob') continue;
    // `git ls-tree` staze s posebnim znakovima ispisuje u navodnicima; skidamo ih da izuzimanje radi.
    const staza = stazaRaw.startsWith('"') && stazaRaw.endsWith('"') ? stazaRaw.slice(1, -1) : stazaRaw;
    if (excluded.has(staza)) continue;
    entries.push(`${sha}\t${staza}`);
  }
  if (!entries.length) return null;
  entries.sort();
  return createHash('sha256').update(entries.join('\n')).digest('hex');
}

/**
 * Presuda o zastarjelosti dokaza prema stablu koje se gradi.
 *
 * @param proof      parsirani RELEASE_PROOF.json (ili null)
 * @param headDigest otisak stabla koje se gradi, ili `null` kad se nije mogao izracunati
 * @returns `{ verdict: 'fresh' | 'stale' | 'unknown', reason }`
 */
export function proofStaleness(proof, headDigest) {
  const proofDigest = proof && typeof proof.treeDigest === 'string' ? proof.treeDigest : null;
  if (!proofDigest) {
    return { verdict: 'unknown', reason: 'dokaz nema treeDigest (stari format ili nije pecen kroz release-check)' };
  }
  if (typeof headDigest !== 'string' || !headDigest) {
    return { verdict: 'unknown', reason: 'otisak stabla koje se gradi nije izracunat (git ls-tree nije uspio)' };
  }
  if (proofDigest !== headDigest) {
    return { verdict: 'stale', reason: 'stablo koje se gradi razlikuje se od stabla nad kojim je dokaz pecen (u necem osim samog dokaza)' };
  }
  return { verdict: 'fresh', reason: 'stablo je jednako stablu dokaza, osim same datoteke dokaza' };
}

/** Poruka za dnevnik; `stale` i `unknown` nikad ne sadrze "OK". Bez em crtica. */
export function formatStaleness(status, proofCommit, headCommit) {
  const pc = String(proofCommit ?? '').slice(0, 12) || '?';
  const hc = String(headCommit ?? '').slice(0, 12) || '?';
  if (status.verdict === 'fresh') return `dokaz o provjerama OK (commit ${pc}, otisak stabla jednak)`;
  if (status.verdict === 'stale') return `ZASTARJELO: dokaz je pecen na ${pc}, a gradi se ${hc}; ${status.reason}`;
  return `NE ZNAM: dokaz ${pc}, gradi se ${hc}; ${status.reason}`;
}

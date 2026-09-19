/**
 * Dokaz izdanja se veze uz OTISAK STABLA, ne uz git povijest (vanjski audit 2026-09-08, nalaz 1).
 *
 * Stari gate je zastarjelost mjerio s `git diff --name-only <commitDokaza> <head>` i u catch grani
 * vracao "nije zastario". U plitkom klonu (Netlify, CI bez fetch-depth) git ne moze procitati stari
 * commit ("fatal: bad object"), pa je gate ispisao "dokaz o provjerama OK" nad dokazom od kojeg se
 * promijenilo 425 datoteka, dok je isti build u punom klonu padao. Nijedan test tu granu nije mjerio.
 *
 * Ovdje se dokazuje: (1) baseline, promjena SAMO datoteke dokaza ne mijenja otisak i daje `fresh`;
 * (2) mutacija, promjena bilo kojeg drugog bloba daje `stale`; (3) nepoznat otisak stabla daje
 * `unknown`, nikad `fresh`; (4) dokaz starog formata bez `treeDigest` daje `unknown`; (5) poruka za
 * `stale` i `unknown` nikad ne sadrzi "OK".
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { treeDigestFromLsTree, proofStaleness, formatStaleness, PROOF_PATH } from '../scripts/release-proof-core.mjs';

const A = '100644 blob 1111111111111111111111111111111111111111\tsrc/a.ts';
const B = '100644 blob 2222222222222222222222222222222222222222\tsrc/b.ts';
const DOKAZ_V1 = `100644 blob 3333333333333333333333333333333333333333\t${PROOF_PATH}`;
const DOKAZ_V2 = `100644 blob 4444444444444444444444444444444444444444\t${PROOF_PATH}`;
const STABLO = '040000 tree 5555555555555555555555555555555555555555\tsrc';

describe('treeDigestFromLsTree', () => {
  it('BASELINE: promjena samo datoteke dokaza ne mijenja otisak', () => {
    const prije = treeDigestFromLsTree([STABLO, A, B, DOKAZ_V1].join('\n'));
    const poslije = treeDigestFromLsTree([STABLO, A, B, DOKAZ_V2].join('\n'));
    expect(prije).toMatch(/^[0-9a-f]{64}$/);
    expect(poslije).toBe(prije);
  });

  it('MUTACIJA: promjena bilo kojeg drugog bloba mijenja otisak', () => {
    const prije = treeDigestFromLsTree([A, B, DOKAZ_V1].join('\n'));
    const drugiB = B.replace('2222222222222222222222222222222222222222', '2222222222222222222222222222222222222223');
    expect(treeDigestFromLsTree([A, drugiB, DOKAZ_V1].join('\n'))).not.toBe(prije);
  });

  it('redoslijed redaka i zavrseci redaka ne utjecu na otisak', () => {
    expect(treeDigestFromLsTree([B, A].join('\r\n') + '\r\n')).toBe(treeDigestFromLsTree([A, B].join('\n')));
  });

  it('prazan ili neparsabilan ispis je null (ne znam), ne prazan otisak', () => {
    expect(treeDigestFromLsTree('')).toBeNull();
    expect(treeDigestFromLsTree('nije ls-tree')).toBeNull();
    expect(treeDigestFromLsTree(null as unknown as string)).toBeNull();
  });
});

describe('proofStaleness', () => {
  const digest = treeDigestFromLsTree([A, B, DOKAZ_V1].join('\n'))!;
  const proof = { commit: 'abc', treeDigest: digest };

  it('BASELINE: isti otisak je fresh', () => {
    expect(proofStaleness(proof, digest).verdict).toBe('fresh');
  });

  it('MUTACIJA: drugi otisak je stale', () => {
    expect(proofStaleness(proof, 'f'.repeat(64)).verdict).toBe('stale');
  });

  it('otisak stabla koji se nije mogao izracunati je unknown, nikad fresh (bas kvar iz audita)', () => {
    expect(proofStaleness(proof, null).verdict).toBe('unknown');
    expect(proofStaleness(proof, '').verdict).toBe('unknown');
  });

  it('dokaz starog formata bez treeDigest je unknown', () => {
    expect(proofStaleness({ commit: 'abc' }, digest).verdict).toBe('unknown');
    expect(proofStaleness(null, digest).verdict).toBe('unknown');
  });

  it('poruke za stale i unknown nikad ne sadrze "OK"', () => {
    for (const s of [proofStaleness(proof, 'f'.repeat(64)), proofStaleness(proof, null), proofStaleness({}, digest)]) {
      expect(formatStaleness(s, 'abc', 'def')).not.toMatch(/\bOK\b/);
    }
    expect(formatStaleness(proofStaleness(proof, digest), 'abc', 'def')).toMatch(/OK/);
  });
});

describe('commitani dokaz', () => {
  it('RELEASE_PROOF.json u repozitoriju ili nosi treeDigest ili je za gate unknown (nikad tiho svjez)', () => {
    const proof = JSON.parse(readFileSync(resolve(process.cwd(), PROOF_PATH), 'utf8'));
    const s = proofStaleness(proof, null);
    // Bez otiska stabla koje se gradi presuda mora biti unknown bez obzira na format dokaza.
    expect(s.verdict).toBe('unknown');
    if (typeof proof.treeDigest === 'string') expect(proof.treeDigest).toMatch(/^[0-9a-f]{64}$/);
  });
});

/**
 * PET NEGATIVNIH SLUCAJEVA KOJI MORAJU ZAUSTAVITI OBJAVU (plan T19), mjereno nad stvarnim datotekama.
 *
 *   (a) `dist/build-info.json` nedostaje ili je neispravan
 *   (b) `dist/build-info.json` nosi commit koji NIJE onaj koji se gradi
 *   (c) dokaz izdanja je `stale`
 *   (d) praceni izvor promijenjen poslije ovjere (isto mjerenje kao (c), drugi uzrok: otisak stabla)
 *   (e) obavezna razina bez zapisanog prolaza u `results[]`
 *
 * Svaki ima BASELINE (zdravo stablo mora proci), inace tvrdnja nije o mutaciji nego o gardu koji
 * vristi na sve.
 *
 * Mjeri se `collectReleaseGate`, dakle sloj koji STVARNO cita disk i git, ne samo presuda nad
 * izmisljenim objektom. Da se mjeri li se i OZICENJE (izlazni kod prave skripte), odgovara
 * `tests/release-gate-cli.test.ts`; ta dva pitanja su razlicita i oba se traze.
 */
// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildInfoVerdict,
  collectReleaseGate,
  missingRequiredFromResults,
  proofAgeDays,
  releaseProofVerdict,
} from '../scripts/release-gate-core.mjs';
import { requiredTierIds } from '../scripts/release-tiers.mjs';
import {
  makeHealthyTree,
  proofObject,
  writeBuildInfo,
  writeProof,
  type GateTree,
} from './helpers/release-gate-tree';

const TVRDO = { LEKTA_REQUIRE_RELEASE_PROOF: '1', COMMIT_REF: '' } as NodeJS.ProcessEnv;
const MEKO = { COMMIT_REF: '' } as NodeJS.ProcessEnv;

let tree: GateTree | null = null;
afterEach(() => {
  tree?.cleanup();
  tree = null;
});

const gate = (t: GateTree, env: NodeJS.ProcessEnv = TVRDO) =>
  collectReleaseGate({ rootDir: t.root, distDir: t.dist, env });

const spojeno = (msgs: string[]) => msgs.join(' | ');

describe('gate izdanja: baseline', () => {
  it('zdravo stablo prolazi i uz tvrd gate', () => {
    tree = makeHealthyTree();
    const r = gate(tree);
    expect(spojeno(r.failures)).toBe('');
    expect(spojeno(r.warnings)).toBe('');
    expect(r.buildInfoCommit).toBe(tree.head);
    expect(r.expectedCommit).toBe(tree.head);
    expect(spojeno(r.notes)).toContain('identitet artefakta OK');
    expect(spojeno(r.notes)).toContain('dokaz o provjerama OK');
  });
});

describe('(a) build-info nedostaje ili je neispravan', () => {
  it('nedostaje: pad i bez tvrde zastavice (identitet artefakta nije stvar dokaza)', () => {
    tree = makeHealthyTree();
    rmSync(join(tree.dist, 'build-info.json'));
    for (const env of [TVRDO, MEKO]) {
      const r = gate(tree, env);
      expect(spojeno(r.failures)).toContain('dist/build-info.json ne postoji');
    }
  });

  it('nije valjan JSON', () => {
    tree = makeHealthyTree();
    writeFileSync(join(tree.dist, 'build-info.json'), '{ ovo nije json', 'utf8');
    expect(spojeno(gate(tree).failures)).toContain('nije valjan JSON');
  });

  it('skracen commit (7 znakova) nije identitet', () => {
    tree = makeHealthyTree();
    writeBuildInfo(tree, { commit: 'abc1234' });
    expect(spojeno(gate(tree).failures)).toContain('nema 40-znamenkasti commit');
  });
});

describe('(b) build-info nosi commit koji nije onaj koji se gradi', () => {
  it('drugi sha zaustavlja objavu, i to bez obzira na zastavicu dokaza', () => {
    tree = makeHealthyTree();
    const tudji = 'b'.repeat(40);
    writeBuildInfo(tree, { commit: tudji });
    for (const env of [TVRDO, MEKO]) {
      const r = gate(tree, env);
      expect(spojeno(r.failures)).toContain('artefakt nema identitet builda');
      // Poruka mora imenovati OBA commita, inace se ne zna je li kriv dist ili stablo.
      expect(spojeno(r.failures)).toContain(tudji.slice(0, 12));
      expect(spojeno(r.failures)).toContain(tree!.head.slice(0, 12));
    }
  });

  it('COMMIT_REF (Netlify) je mjerodavniji od HEAD-a, pa build-info mora slijediti njega', () => {
    tree = makeHealthyTree();
    // Netlify postavlja COMMIT_REF; kad je razrjesiv, i write-build-info i gate uzimaju njega.
    // Ovdje je namjerno NErazrjesiv (ne postoji u ovom repozitoriju), pa oba padaju na HEAD i slazu se.
    const r = collectReleaseGate({ rootDir: tree.root, distDir: tree.dist, env: { ...TVRDO, COMMIT_REF: 'c'.repeat(40) } });
    expect(spojeno(r.failures)).toContain('artefakt nema identitet builda');
  });

  it('commit koji se ne da razrijesiti je "ne znam": upozorenje u meku, pad u tvrdom gateu', () => {
    tree = makeHealthyTree();
    const bezGita = { rootDir: tree.root, distDir: tree.dist, git: slijepiGit() };
    const mek = collectReleaseGate({ ...bezGita, env: MEKO });
    expect(spojeno(mek.failures)).toBe('');
    expect(spojeno(mek.warnings)).toContain('identitet artefakta se ne da provjeriti');
    const tvrd = collectReleaseGate({ ...bezGita, env: TVRDO });
    expect(spojeno(tvrd.failures)).toContain('identitet artefakta se ne da provjeriti');
  });
});

describe('(c) i (d) dokaz je stale ili unknown', () => {
  it('promijenjen praceni izvor poslije ovjere: otisak stabla se razisao (stale)', () => {
    tree = makeHealthyTree();
    writeProof(tree, proofObject(tree, { treeDigest: 'f'.repeat(64) }));
    const r = gate(tree);
    expect(spojeno(r.failures)).toContain('ZASTARJELO');
    expect(spojeno(r.failures)).not.toContain('OK');
  });

  it('dokaz bez otiska stabla je unknown, i unknown je pad kao i stale', () => {
    tree = makeHealthyTree();
    writeProof(tree, proofObject(tree, { treeDigest: null }));
    expect(spojeno(gate(tree).failures)).toContain('NE ZNAM');
  });

  it('dokaza uopce nema', () => {
    tree = makeHealthyTree();
    rmSync(join(tree.root, 'docs', 'generated', 'RELEASE_PROOF.json'));
    expect(spojeno(gate(tree).failures)).toContain('RELEASE_PROOF.json ne postoji');
  });

  it('dokaz nije valjan JSON', () => {
    tree = makeHealthyTree();
    writeProof(tree, '{ pola dokaza');
    expect(spojeno(gate(tree).failures)).toContain('nije valjan JSON');
  });

  it('dokaz pecen nad necistim radnim stablom', () => {
    tree = makeHealthyTree();
    writeProof(tree, proofObject(tree, { dirtyWorkingTree: true }));
    expect(spojeno(gate(tree).failures)).toContain('NECISTIM radnim stablom');
  });

  it('dokaz stariji od dopustenog (Tier 1 i 2 ovise o alatima izvan repozitorija)', () => {
    tree = makeHealthyTree();
    writeProof(tree, proofObject(tree, { createdAt: '2020-01-01T00:00:00.000Z' }));
    expect(spojeno(gate(tree).failures)).toContain('dana (dopusteno 14)');
  });

  it('bez tvrde zastavice su iste presude UPOZORENJE, ne pad (postojeci ustupak se ne mijenja)', () => {
    tree = makeHealthyTree();
    writeProof(tree, proofObject(tree, { treeDigest: 'f'.repeat(64) }));
    const r = gate(tree, MEKO);
    expect(spojeno(r.failures)).toBe('');
    expect(spojeno(r.warnings)).toContain('ZASTARJELO');
  });
});

describe('(e) obavezna razina bez zapisanog prolaza', () => {
  it('razina koje NEMA u results[] pada iako dokaz o sebi tvrdi complete: true', () => {
    tree = makeHealthyTree();
    const bezWorda = proofObject(tree).results as Array<{ id: string }>;
    writeProof(tree, proofObject(tree, { results: bezWorda.filter((r) => r.id !== 'word'), complete: true, missingRequired: [] }));
    const r = gate(tree);
    expect(spojeno(r.failures)).toContain('obavezne razine bez zapisanog prolaza');
    expect(spojeno(r.failures)).toContain('word');
  });

  it('razina koja je pokusana i PALA jednako pada, i uz complete: true', () => {
    tree = makeHealthyTree();
    const results = (proofObject(tree).results as Array<{ id: string; status: string }>).map((r) =>
      r.id === 'strict-open' ? { ...r, status: 'fail' } : r,
    );
    writeProof(tree, proofObject(tree, { results, complete: true, missingRequired: [] }));
    expect(spojeno(gate(tree).failures)).toContain('strict-open');
  });

  it('nedostupna razina (unavailable) nije prolaz', () => {
    tree = makeHealthyTree();
    const results = (proofObject(tree).results as Array<{ id: string; status: string }>).map((r) =>
      r.id === 'word-worst' ? { ...r, status: 'unavailable', reason: 'not-windows' } : r,
    );
    writeProof(tree, proofObject(tree, { results, complete: true }));
    expect(spojeno(gate(tree).failures)).toContain('word-worst');
  });

  it('posten dokaz s complete: false prijavljuje i svoju listu', () => {
    tree = makeHealthyTree();
    const results = (proofObject(tree).results as Array<{ id: string }>).filter((r) => r.id !== 'ux');
    writeProof(tree, proofObject(tree, { results, complete: false, missingRequired: ['ux'] }));
    const r = gate(tree);
    expect(spojeno(r.failures)).toContain('nije potpun, bez prolaza ostaju: ux');
    expect(spojeno(r.failures)).toContain('obavezne razine bez zapisanog prolaza');
  });

  it('neobavezna razina koja nije prosla NE obara dokaz, ali se poimence ispisuje', () => {
    tree = makeHealthyTree();
    const results = [
      ...(proofObject(tree).results as unknown[]),
      { id: 'extraction', label: 'Tier 2: extraction probe (staging)', status: 'unavailable', reason: 'missing-env:LEKTA_STAGING_ORIGIN' },
    ];
    writeProof(tree, proofObject(tree, { results }));
    const r = gate(tree);
    expect(spojeno(r.failures)).toBe('');
    expect(spojeno(r.notes)).toContain('NIJE IZMJERENO (1)');
    expect(spojeno(r.notes)).toContain('extraction');
  });
});

describe('ciste presude (jedinicno, bez diska)', () => {
  it('missingRequiredFromResults racuna iz results[], ne iz polja complete', () => {
    const puni = requiredTierIds().map((id: string) => ({ id, status: 'pass' }));
    expect(missingRequiredFromResults({ results: puni, complete: false })).toEqual([]);
    expect(missingRequiredFromResults({ results: [], complete: true })).toEqual(requiredTierIds());
  });

  it('proofAgeDays bez valjanog createdAt je beskonacan, ne nula', () => {
    expect(proofAgeDays({ createdAt: 'juce' })).toBe(Number.POSITIVE_INFINITY);
    expect(proofAgeDays({ createdAt: '2026-09-01T00:00:00.000Z' }, Date.parse('2026-09-11T00:00:00.000Z'))).toBe(10);
  });

  it('buildInfoVerdict ne prijavljuje nista na podudarnom sha-u', () => {
    const sha = 'a'.repeat(40);
    const r = buildInfoVerdict({ raw: JSON.stringify({ commit: sha, builtAt: '2026-09-13T00:00:00Z' }), expectedCommit: sha });
    expect(r.blocking).toEqual([]);
    expect(r.conditional).toEqual([]);
  });

  it('releaseProofVerdict prijavljuje SVE razloge odjednom, ne samo prvi', () => {
    const r = releaseProofVerdict({
      exists: true,
      proof: { complete: false, missingRequired: ['ux'], results: [], treeDigest: null, dirtyWorkingTree: true, createdAt: '2020-01-01T00:00:00Z' },
      headDigest: 'a'.repeat(64),
      head: 'b'.repeat(40),
      nowMs: Date.parse('2026-09-13T00:00:00Z'),
    });
    const tekst = spojeno(r.conditional);
    expect(tekst).toContain('nije potpun');
    expect(tekst).toContain('obavezne razine bez zapisanog prolaza');
    expect(tekst).toContain('NE ZNAM');
    expect(tekst).toContain('NECISTIM');
    expect(tekst).toContain('dopusteno');
  });
});

/** Git koji nista ne zna: klon bez `.git`, plitak checkout bez HEAD-a, alat kojeg nema u PATH-u. */
function slijepiGit() {
  return {
    resolvable: () => false,
    head: () => '',
    lsTree: () => null,
    exec: () => {
      throw new Error('git nije dostupan');
    },
  };
}

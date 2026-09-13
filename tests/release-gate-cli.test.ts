/**
 * OZICENJE, NE SAMO ODLUKA: gate izdanja mora ZAUSTAVITI PROCES, ne samo vratiti popis nalaza.
 *
 * `tests/release-gate-core.test.ts` dokazuje da presuda prepoznaje svih pet negativnih slucajeva.
 * To nije isto pitanje kao "izlazi li skripta s ne-nultim kodom", a CLAUDE.md tocno taj razmak
 * imenuje kao lazno zeleno: testirana cista funkcija uz netestirano ozicenje. Do 2026-09-13
 * `verify-deploy-dist.mjs` nije imao NIJEDAN test koji ga pokrece kao proces, unatoc 600+ redaka
 * odluka o tome smije li se objaviti.
 *
 * Ovdje se pokrecu PRAVE ulazne tocke (`node scripts/...`) nad sintetickim stablom i mjeri se izlazni
 * kod i poruka. Obje skripte dijele isti `collectReleaseGate`, pa se mjeri i to da obje stvarno padnu.
 */
// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { makeHealthyTree, proofObject, writeBuildInfo, writeProof, type GateTree } from './helpers/release-gate-tree';

const SCRIPTS = resolve(process.cwd(), 'scripts');
const PROOF_CLI = join(SCRIPTS, 'verify-release-proof.mjs');
const DEPLOY_CLI = join(SCRIPTS, 'verify-deploy-dist.mjs');

let tree: GateTree | null = null;
afterEach(() => {
  tree?.cleanup();
  tree = null;
});

interface Run { code: number | null; out: string }

/** Cisto okruzenje: bez nasljedjenog COMMIT_REF i bez nasljedjene tvrde zastavice. */
function run(script: string, args: string[], env: Record<string, string> = {}): Run {
  const r = spawnSync(process.execPath, [script, ...args], {
    encoding: 'utf8',
    timeout: 120_000,
    env: { ...process.env, COMMIT_REF: '', LEKTA_REQUIRE_RELEASE_PROOF: '', ...env },
  });
  return { code: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

const proofCli = (t: GateTree, env: Record<string, string> = {}) =>
  run(PROOF_CLI, ['--root', t.root, '--dist', t.dist], env);
const deployCli = (t: GateTree, env: Record<string, string> = {}) =>
  run(DEPLOY_CLI, ['--proof-gate-only', '--root', t.root, '--dist', t.dist], env);

const TVRDO = { LEKTA_REQUIRE_RELEASE_PROOF: '1' };

describe('gate izdanja kao PROCES: baseline', () => {
  it('zdravo stablo: obje ulazne tocke izlaze s 0', () => {
    tree = makeHealthyTree();
    const p = proofCli(tree, TVRDO);
    expect(p.code, p.out).toBe(0);
    expect(p.out).toContain('OK: identitet artefakta i dokaz izdanja stoje');

    const d = deployCli(tree, TVRDO);
    expect(d.code, d.out).toBe(0);
    expect(d.out).toContain('SAMO gate dokaza');
  }, 120_000);
});

describe('gate izdanja kao PROCES: pet negativnih slucajeva zaustavlja objavu', () => {
  it('(a) dist/build-info.json nedostaje', () => {
    tree = makeHealthyTree();
    rmSync(join(tree.dist, 'build-info.json'));
    for (const r of [proofCli(tree, TVRDO), deployCli(tree, TVRDO)]) {
      expect(r.code, r.out).toBe(1);
      expect(r.out).toContain('dist/build-info.json ne postoji');
    }
  }, 120_000);

  it('(b) build-info nosi pogresan sha', () => {
    tree = makeHealthyTree();
    writeBuildInfo(tree, { commit: 'b'.repeat(40) });
    // Bez tvrde zastavice: identitet artefakta i dalje pada, jer to nije "ne znam" nego "znam da je krivo".
    for (const r of [proofCli(tree), deployCli(tree)]) {
      expect(r.code, r.out).toBe(1);
      expect(r.out).toContain('artefakt nema identitet builda');
    }
  }, 120_000);

  it('(c) dokaz je unknown (bez otiska stabla)', () => {
    tree = makeHealthyTree();
    writeProof(tree, proofObject(tree, { treeDigest: null }));
    for (const r of [proofCli(tree, TVRDO), deployCli(tree, TVRDO)]) {
      expect(r.code, r.out).toBe(1);
      expect(r.out).toContain('NE ZNAM');
    }
  }, 120_000);

  it('(d) praceni izvor promijenjen poslije ovjere: otisak stabla se razisao', () => {
    tree = makeHealthyTree();
    // Stvarna izmjena izvora, ne izmisljen otisak: novi commit mijenja stablo, dokaz ostaje na starom.
    writeFileSync(join(tree.root, 'README.md'), 'izmjena poslije ovjere\n', 'utf8');
    spawnSync('git', ['-c', 'user.email=t@example.invalid', '-c', 'user.name=Test', 'commit', '-q', '-am', 'izmjena'], { cwd: tree.root });
    for (const r of [proofCli(tree, TVRDO), deployCli(tree, TVRDO)]) {
      expect(r.code, r.out).toBe(1);
      expect(r.out).toContain('ZASTARJELO');
    }
  }, 120_000);

  it('(e) obavezna razina bez zapisanog prolaza, uz complete: true', () => {
    tree = makeHealthyTree();
    const bezUx = (proofObject(tree).results as Array<{ id: string }>).filter((r) => r.id !== 'ux');
    writeProof(tree, proofObject(tree, { results: bezUx, complete: true, missingRequired: [] }));
    for (const r of [proofCli(tree, TVRDO), deployCli(tree, TVRDO)]) {
      expect(r.code, r.out).toBe(1);
      expect(r.out).toContain('obavezne razine bez zapisanog prolaza');
      expect(r.out).toContain('ux');
    }
  }, 120_000);
});

describe('mek gate (razvojni CI) ostaje mek, i to se ne smije tiho promijeniti', () => {
  it('zastario dokaz bez LEKTA_REQUIRE_RELEASE_PROOF=1 je upozorenje, izlaz 0', () => {
    tree = makeHealthyTree();
    writeProof(tree, proofObject(tree, { treeDigest: 'f'.repeat(64) }));
    const r = proofCli(tree);
    expect(r.code, r.out).toBe(0);
    expect(r.out).toContain('UPOZORENJE');
    expect(r.out).toContain('ZASTARJELO');
    expect(r.out).toContain('gate je MEK');
  }, 120_000);
});

describe('deploy gate se ne da uperiti u drugo stablo', () => {
  it('--root bez --proof-gate-only je odbijen', () => {
    tree = makeHealthyTree();
    const r = run(DEPLOY_CLI, ['--root', tree.root]);
    expect(r.code, r.out).toBe(1);
    expect(r.out).toContain('dopusteni SAMO uz --proof-gate-only');
  }, 120_000);
});

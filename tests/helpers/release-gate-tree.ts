/**
 * Sinteticko STABLO za mjerenje gatea izdanja (plan T19).
 *
 * Gate cita tri stvari s diska i jednu iz gita: `dist/build-info.json`, `docs/generated/RELEASE_PROOF.json`,
 * commit koji se gradi i otisak stabla (`git ls-tree -r HEAD`). Da bi se negativni slucajevi mogli
 * PODMETNUTI, treba pravi mali git repozitorij, ne izmisljeni otisak: inace bi se tvrdnja o zastarjelosti
 * mjerila istom funkcijom koja je otisak i izracunala, pa bi test vrtio sam sebe.
 *
 * Stablo nastaje u sistemskom temp direktoriju, izvan repozitorija (vitest inace kolektira tudje test
 * datoteke; vidi biljesku "Vitest kolektira worktree iz korijena").
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { treeDigestFromLsTree } from '../../scripts/release-proof-core.mjs';
import { requiredTierIds } from '../../scripts/release-tiers.mjs';

export interface GateTree {
  root: string;
  dist: string;
  head: string;
  /** Otisak stabla HEAD-a: dokaz s ovom vrijednoscu je `fresh`, sa svakom drugom `stale`. */
  freshDigest: string;
  cleanup: () => void;
}

const git = (cwd: string, ...args: string[]): string =>
  // `core.autocrlf=false` samo da ispis ne bude zatrpan upozorenjima o zavrsecima redaka; otisak stabla
  // se ionako racuna iz blob hasheva koje daje git, ne s diska (vidi release-proof-core.mjs).
  execFileSync('git', ['-c', 'user.email=t@example.invalid', '-c', 'user.name=Test', '-c', 'core.autocrlf=false', ...args], {
    cwd,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });

export function makeGateTree(): GateTree {
  const root = mkdtempSync(join(tmpdir(), 'lekta-release-gate-'));
  writeFileSync(join(root, 'README.md'), 'sinteticko stablo za gate izdanja\n', 'utf8');
  git(root, 'init', '-q');
  git(root, 'add', 'README.md');
  git(root, 'commit', '-q', '-m', 'baza');
  const head = git(root, 'rev-parse', 'HEAD').trim();
  const freshDigest = treeDigestFromLsTree(git(root, 'ls-tree', '-r', 'HEAD')) as string;
  const dist = join(root, 'dist');
  mkdirSync(dist, { recursive: true });
  mkdirSync(join(root, 'docs', 'generated'), { recursive: true });
  return { root, dist, head, freshDigest, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

/** Ispravan `dist/build-info.json`: isti commit koji bi `write-build-info` upisao za ovo stablo. */
export function writeBuildInfo(tree: GateTree, over: Record<string, unknown> = {}): void {
  writeFileSync(
    join(tree.dist, 'build-info.json'),
    JSON.stringify({ commit: tree.head, builtAt: new Date().toISOString(), ...over }, null, 2),
    'utf8',
  );
}

/** Potpun i svjez dokaz izdanja: svaka obavezna razina ima zapisan `pass`, otisak je otisak HEAD-a. */
export function proofObject(tree: GateTree, over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    commit: tree.head,
    treeDigest: tree.freshDigest,
    dirtyWorkingTree: false,
    createdAt: new Date().toISOString(),
    platform: 'win32',
    partial: false,
    complete: true,
    missingRequired: [],
    results: requiredTierIds().map((id: string) => ({ id, label: id, status: 'pass', durationMs: 1 })),
    ...over,
  };
}

export function writeProof(tree: GateTree, proof: unknown): void {
  writeFileSync(
    join(tree.root, 'docs', 'generated', 'RELEASE_PROOF.json'),
    typeof proof === 'string' ? proof : JSON.stringify(proof, null, 2),
    'utf8',
  );
}

/** Zdravo stablo: sve na mjestu, gate mora proci i uz tvrd `LEKTA_REQUIRE_RELEASE_PROOF=1`. */
export function makeHealthyTree(): GateTree {
  const tree = makeGateTree();
  writeBuildInfo(tree);
  writeProof(tree, proofObject(tree));
  return tree;
}

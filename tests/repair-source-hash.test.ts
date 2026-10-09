// @vitest-environment node
/**
 * Otisak koda popravka (T74). Tvrdnje: otisak prati samo produkcijski .ts u src/repair, deterministican
 * je, a provjera svjezine nikad ne baca nego vraca stanje koje potrosac otvoreno degradira.
 */
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { lstatSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  REPAIR_SOURCE_HASH_VERSION,
  isRepairProductionSource,
  repairSourceFreshness,
  repairSourceHash,
  repairSourceHashAtCommit,
  repairSourceHashFromFiles,
} from '../scripts/lib/repair-source-hash.mjs';

describe('repair-source-hash: otisak iz git stabla commita (T75)', () => {
  it('na HEAD-u je jednak otisku s diska, a nepostojeci ili neispravan commit baca', () => {
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    const status = execFileSync('git', ['status', '--porcelain', '--', 'src/repair'], { encoding: 'utf8' }).trim();
    const izGita = repairSourceHashAtCommit(head);
    expect(izGita.hash).toMatch(/^[0-9a-f]{64}$/);
    // Usporedba s diskom vrijedi samo nad cistim src/repair (inace disk i commit legitimno odstupaju).
    if (status === '') expect(izGita).toEqual(repairSourceHash());
    expect(() => repairSourceHashAtCommit('0'.repeat(40))).toThrow();
    expect(() => repairSourceHashAtCommit('HEAD --output=x')).toThrow(/nije commit/);
  });

  it('F3 (Codex T75): tree i blob OID nisu commit i bacaju', () => {
    const stablo = execFileSync('git', ['rev-parse', 'HEAD^{tree}'], { encoding: 'utf8' }).trim();
    const blob = execFileSync('git', ['rev-parse', 'HEAD:package.json'], { encoding: 'utf8' }).trim();
    // Generator proizvodi ciljanu klasu: git za te OID-ove stvarno javlja tree i blob.
    expect(execFileSync('git', ['cat-file', '-t', stablo], { encoding: 'utf8' }).trim()).toBe('tree');
    expect(execFileSync('git', ['cat-file', '-t', blob], { encoding: 'utf8' }).trim()).toBe('blob');
    expect(() => repairSourceHashAtCommit(stablo)).toThrow(/je tree, a ne commit/);
    expect(() => repairSourceHashAtCommit(blob)).toThrow(/je blob, a ne commit/);
  });

  it('F2 (Codex T75): podmodul (gitlink 160000) i simbolicka veza (120000) u src/repair bacaju', () => {
    const repo = mkdtempSync(join(tmpdir(), 'lekta-rsh-git-'));
    const git = (...args: string[]) =>
      execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args], { cwd: repo, encoding: 'utf8' }).trim();
    try {
      git('init', '-q');
      mkdirSync(join(repo, 'src', 'repair'), { recursive: true });
      writeFileSync(join(repo, 'src', 'repair', 'fixers.ts'), 'export const f = 1;\n');
      git('add', '-A');
      git('commit', '-q', '-m', 'baseline');
      const baseline = git('rev-parse', 'HEAD');
      // Baseline: cisto stablo daje otisak jednak onom s diska.
      expect(repairSourceHashAtCommit(baseline, repo)).toEqual(repairSourceHash(repo));

      git('update-index', '--add', '--cacheinfo', `160000,${baseline},src/repair/podmodul`);
      git('commit', '-q', '-m', 'gitlink');
      const sPodmodulom = git('rev-parse', 'HEAD');
      expect(git('ls-tree', sPodmodulom, 'src/repair/podmodul')).toMatch(/^160000 commit /);
      expect(() => repairSourceHashAtCommit(sPodmodulom, repo)).toThrow(/podmodul src\/repair\/podmodul/);

      git('rm', '-q', '--cached', 'src/repair/podmodul');
      const blobVeze = execFileSync('git', ['hash-object', '-w', '--stdin'], { cwd: repo, encoding: 'utf8', input: 'fixers.ts' }).trim();
      git('update-index', '--add', '--cacheinfo', `120000,${blobVeze},src/repair/veza.ts`);
      git('commit', '-q', '-m', 'symlink');
      const sVezom = git('rev-parse', 'HEAD');
      expect(git('ls-tree', sVezom, 'src/repair/veza.ts')).toMatch(/^120000 blob /);
      expect(() => repairSourceHashAtCommit(sVezom, repo)).toThrow(/simbolicka veza src\/repair\/veza\.ts/);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});

const BASE = [
  { path: 'src/repair/apply-fixers.ts', content: 'export const a = 1;\n' },
  { path: 'src/repair/contract/hash.ts', content: 'export const h = 2;\n' },
  { path: 'src/repair/apply-fixers.test.ts', content: 'it("x", () => {});\n' },
  { path: 'src/repair/CLAUDE.md', content: '# Popravak\n' },
];
const hashOf = (files: typeof BASE) => repairSourceHashFromFiles(files).hash;
const zamijeni = (p: string, content: string) => BASE.map((f) => (f.path === p ? { ...f, content } : f));

describe('repair-source-hash: sto ulazi u otisak', () => {
  it('produkcijski .ts da; test, spec, d.ts, fixture i markdown ne', () => {
    expect(isRepairProductionSource('src/repair/fixers.ts')).toBe(true);
    expect(isRepairProductionSource('src/repair/contract/adapter.ts')).toBe(true);
    expect(isRepairProductionSource('src\\repair\\fixers.ts')).toBe(true);
    expect(isRepairProductionSource('src/repair/fixers.test.ts')).toBe(false);
    expect(isRepairProductionSource('src/repair/fixers.spec.ts')).toBe(false);
    expect(isRepairProductionSource('src/repair/types.d.ts')).toBe(false);
    expect(isRepairProductionSource('src/repair/fixtures/doc.ts')).toBe(false);
    expect(isRepairProductionSource('src/repair/CLAUDE.md')).toBe(false);
    expect(isRepairProductionSource('src/analysis/fixers.ts')).toBe(false);
  });

  it('izmjena CLAUDE.md ili testa ne mijenja otisak, izmjena produkcijskog .ts mijenja', () => {
    const base = hashOf(BASE);
    expect(hashOf(zamijeni('src/repair/CLAUDE.md', '# Popravak\n<!-- komentar -->\n'))).toBe(base);
    expect(hashOf(zamijeni('src/repair/apply-fixers.test.ts', 'it("y", () => {});\n'))).toBe(base);
    expect(hashOf(zamijeni('src/repair/contract/hash.ts', 'export const h = 3;\n'))).not.toBe(base);
  });

  it('deterministican: redoslijed ulaza i CRLF ne mijenjaju otisak, preimenovanje mijenja', () => {
    const base = hashOf(BASE);
    expect(hashOf([...BASE].reverse())).toBe(base);
    expect(hashOf(BASE.map((f) => ({ ...f, content: f.content.replace(/\n/g, '\r\n') })))).toBe(base);
    const preimenovano = BASE.map((f) => (f.path === 'src/repair/apply-fixers.ts' ? { ...f, path: 'src/repair/apply.ts' } : f));
    expect(hashOf(preimenovano)).not.toBe(base);
  });

  it('otisak s diska pokriva tocno produkcijske .ts datoteke iz git indeksa', () => {
    const tracked = execFileSync('git', ['ls-files', 'src/repair'], { encoding: 'utf8' })
      .split('\n').map((l) => l.trim()).filter(Boolean);
    const ocekivano = tracked.filter(isRepairProductionSource).sort();
    const { hash, files } = repairSourceHash();
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    // Generator testa proizvodi ciljanu klasu: repo stvarno ima i datoteke koje otisak MORA preskociti.
    expect(tracked.some((p) => p.endsWith('.test.ts'))).toBe(true);
    expect(tracked).toContain('src/repair/CLAUDE.md');
    expect(ocekivano.length).toBeGreaterThan(0);
    expect(files).toEqual(ocekivano);
    expect(repairSourceHash().hash).toBe(hash);
  });
});

describe('repair-source-hash: jednoznacan zapis i pouzdan izvor (Codex #176)', () => {
  it('F2: sadrzaj koji glumi granicu datoteka ne daje isti otisak kao dvije datoteke', () => {
    const jedna = repairSourceHashFromFiles([{ path: 'src/repair/a.ts', content: 'x\0src/repair/b.ts\0y' }]);
    const dvije = repairSourceHashFromFiles([
      { path: 'src/repair/a.ts', content: 'x' },
      { path: 'src/repair/b.ts', content: 'y' },
    ]);
    expect(jedna.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(dvije.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(jedna.hash).not.toBe(dvije.hash);
    // Isto za pomak granice izmedju putanje i sadrzaja, bez ijednog NUL znaka.
    const p1 = repairSourceHashFromFiles([{ path: 'src/repair/ab.ts', content: 'c' }]).hash;
    const p2 = repairSourceHashFromFiles([{ path: 'src/repair/a.ts', content: 'b.tsc' }]).hash;
    expect(p1).not.toBe(p2);
  });

  it('otisak nosi verziju zapisa', () => {
    expect(REPAIR_SOURCE_HASH_VERSION).toBe(1);
    expect(repairSourceHashFromFiles(BASE).version).toBe(REPAIR_SOURCE_HASH_VERSION);
  });

  it('F3: prazan skup nema otisak, svjezina je missing, a racunanje s diska baca', () => {
    const prazno = repairSourceHashFromFiles([]);
    expect(prazno.hash).toBeNull();
    expect(repairSourceFreshness(prazno.hash, prazno.hash).status).toBe('missing');
    expect(repairSourceHashFromFiles([{ path: 'src/repair/CLAUDE.md', content: '#' }]).hash).toBeNull();
    const root = mkdtempSync(join(tmpdir(), 'lekta-rsh-prazno-'));
    try {
      mkdirSync(join(root, 'src', 'repair'), { recursive: true });
      writeFileSync(join(root, 'src', 'repair', 'CLAUDE.md'), '# samo dokumentacija\n');
      expect(() => repairSourceHash(root)).toThrow(/nema nijednu produkcijsku/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('F4: simbolicka veza u src/repair se izricito odbija', () => {
    const root = mkdtempSync(join(tmpdir(), 'lekta-rsh-link-'));
    try {
      mkdirSync(join(root, 'src', 'repair'), { recursive: true });
      mkdirSync(join(root, 'izvan'), { recursive: true });
      writeFileSync(join(root, 'src', 'repair', 'fixers.ts'), 'export const f = 1;\n');
      writeFileSync(join(root, 'izvan', 'skriveno.ts'), 'export const s = 1;\n');
      // Baseline: bez veze otisak postoji.
      expect(repairSourceHash(root).files).toEqual(['src/repair/fixers.ts']);
      // 'junction' na Windowsu ne trazi administratorska prava; drugdje je obicna veza na direktorij.
      symlinkSync(join(root, 'izvan'), join(root, 'src', 'repair', 'kontrakt.ts'), 'junction');
      // Generator je proizveo ciljanu klasu: unos stvarno jest simbolicka veza.
      expect(lstatSync(join(root, 'src', 'repair', 'kontrakt.ts')).isSymbolicLink()).toBe(true);
      expect(() => repairSourceHash(root)).toThrow(/simbolicka veza src\/repair\/kontrakt\.ts/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('repair-source-hash: svjezina nikad ne baca', () => {
  const a = 'a'.repeat(64);
  const b = 'b'.repeat(64);

  it('isti otisak je fresh, drugaciji stale', () => {
    expect(repairSourceFreshness(a, a).status).toBe('fresh');
    expect(repairSourceFreshness(a, b).status).toBe('stale');
  });

  it('nedostajuci ili neispravan otisak je missing, bez iznimke', () => {
    for (const recorded of [undefined, null, '', 'abc', 42, {}, a.toUpperCase()]) {
      expect(() => repairSourceFreshness(recorded, b)).not.toThrow();
      expect(repairSourceFreshness(recorded, b).status).toBe('missing');
    }
    expect(repairSourceFreshness(a, undefined).status).toBe('missing');
  });
});

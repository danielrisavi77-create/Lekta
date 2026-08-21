// tests/disk-cleanup.test.ts
//
// Gard nad `scripts/disk-cleanup.mjs`.
//
// Prva verzija skripte nudila je `dist-packs` za brisanje, a to je PRACEN sadrzaj
// (commitani izlaz pakiranja, `git ls-files dist-packs` vraca dvije datoteke). Runtime
// gard bi ga preskocio, ali ponuda za brisanje pracenog sadrzaja ne smije ni postojati.
// Test hvata upravo tu klasu greske: svaki kandidat mora biti git-ignoriran.
//
// Vazan detalj: `git check-ignore` nad NEPOSTOJECOM putanjom ne moze znati je li rijec o
// direktoriju, pa uzorak s kosom crtom (`dist/`) ne pogadja golo `dist`. Zato se ovdje
// provjerava s dodanom kosom crtom. U samoj skripti taj problem ne postoji jer se gard
// izvodi tek nad putanjama koje na disku POSTOJE.

import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  GLOBAL_CANDIDATES,
  NEVER_DELETE,
  REPO_CANDIDATES,
  human,
  isSafeToRemove,
} from '../scripts/disk-cleanup.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function gitIgnores(rel: string): boolean {
  for (const candidate of [`${rel}/`, rel]) {
    try {
      execFileSync('git', ['check-ignore', '-q', '--', candidate], { cwd: ROOT, stdio: 'ignore' });
      return true;
    } catch {
      // sljedeci oblik
    }
  }
  return false;
}

describe('disk-cleanup kandidati', () => {
  it('svaki kandidat u repozitoriju je git-ignoriran', () => {
    const tracked = REPO_CANDIDATES.filter((c: { rel: string }) => !gitIgnores(c.rel));
    expect(tracked.map((c: { rel: string }) => c.rel)).toEqual([]);
  });

  it('nijedan zasticeni put nije ponudjen za brisanje', () => {
    const rels = new Set(REPO_CANDIDATES.map((c: { rel: string }) => c.rel));
    for (const guarded of NEVER_DELETE as Array<{ rel: string }>) {
      expect(rels.has(guarded.rel)).toBe(false);
    }
  });

  it('svaki kandidat kaze cime se vraca', () => {
    for (const candidate of [...REPO_CANDIDATES, ...GLOBAL_CANDIDATES] as Array<{
      rel: string;
      why: string;
      restore: string;
    }>) {
      expect(candidate.why.length).toBeGreaterThan(0);
      expect(candidate.restore.length).toBeGreaterThan(0);
    }
  });

  it('globalni kandidati su relativni na dom, nikad apsolutni', () => {
    for (const candidate of GLOBAL_CANDIDATES as Array<{ rel: string }>) {
      expect(path.isAbsolute(candidate.rel)).toBe(false);
      expect(candidate.rel.includes('..')).toBe(false);
    }
  });
});

describe('disk-cleanup gard', () => {
  it('odbija korijen, dom i sam repozitorij', () => {
    expect(isSafeToRemove('/')).toBe(false);
    expect(isSafeToRemove(ROOT)).toBe(false);
  });

  it('odbija praceni sadrzaj unutar repozitorija', () => {
    expect(isSafeToRemove(path.join(ROOT, 'package.json'))).toBe(false);
    expect(isSafeToRemove(path.join(ROOT, 'src'))).toBe(false);
    expect(isSafeToRemove(path.join(ROOT, 'dist-packs'))).toBe(false);
  });

  it('odbija putanju izvan repozitorija i doma', () => {
    expect(isSafeToRemove('/etc/passwd')).toBe(false);
    expect(isSafeToRemove('/var/log')).toBe(false);
  });

  it('prihvaca ignorirani artefakt u repozitoriju', () => {
    expect(isSafeToRemove(path.join(ROOT, 'node_modules'))).toBe(true);
  });
});

describe('human', () => {
  it('formatira velicine', () => {
    expect(human(512)).toBe('512 B');
    expect(human(1024)).toBe('1.0 KB');
    expect(human(1024 * 1024 * 5)).toBe('5.0 MB');
  });
});

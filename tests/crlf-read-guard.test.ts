// @vitest-environment node
/**
 * T92: trajni gard protiv testa koji cita tekst iz repozitorija i trazi `\n` bez normalizacije CR-a.
 * Na Linux CI-ju je takav test zelen, a na Windows checkoutu (CRLF) pada ili tiho slabi. Heuristika i
 * njezina ogranicenja opisani su u `tests/helpers/crlf-read-guard.ts`; mutacije su u
 * `tests/gate-mutations.test.ts` (`crlf/*`).
 */
import { describe, expect, it } from 'vitest';
import {
  collectScannedSources,
  crlfGuardVerdict,
  crlfReadProblems,
  readsRepoText,
  regexSeeksBareLf,
  seeksBareLf,
  stringSeeksBareLf,
} from './helpers/crlf-read-guard';

describe('T92 gard: citanje teksta iz repozitorija normalizira CR', () => {
  it('stablo nema novih nalaza, a allowlista nema zastarjelih unosa', () => {
    const files = collectScannedSources(process.cwd());
    // Generator mora vidjeti stvarnu populaciju, inace je prazan nalaz vakuumski zelen.
    expect(files.length).toBeGreaterThan(500);
    expect(files.some((f) => f.path === 'tests/helpers/crlf-read-guard.ts')).toBe(true);
    expect(crlfGuardVerdict(crlfReadProblems(files))).toEqual([]);
  });

  it('(a) broji tekstno citanje, ne binarno ni privremenu datoteku', () => {
    expect(readsRepoText("const s = readFileSync(resolve('ops/x.sql'), 'utf8');")).toBe(true);
    expect(readsRepoText("const s = await readFile(p, { encoding: 'utf-8' });")).toBe(true);
    expect(readsRepoText('const b = readFileSync(resolve(MAPA, ime));')).toBe(false);
    expect(readsRepoText("const s = readFileSync(join(tmpDir, 'out.txt'), 'utf8');")).toBe(false);
  });

  it('(b) regex: `\\n` iza znaka koji ne guta CR je osjetljiv', () => {
    expect(regexSeeksBareLf('\\nas \\$\\$\\n')).toBe(true);
    expect(regexSeeksBareLf('\\n {2}[a-z][\\w-]*:\\n')).toBe(true);
    expect(regexSeeksBareLf('a\\n\\nb')).toBe(true);
  });

  it('(b) regex: CR-svjesni i CR-tolerantni oblici nisu nalaz', () => {
    for (const body of [
      '\\nfunction ',
      'kraj\\r?\\n',
      'a[\\r\\n]+b',
      'permissions:\\s*\\n\\s+contents',
      "needs_manual_review'[^\\n]*\\n",
      'regexes = \\[([\\s\\S]*?)\\n\\s*\\]',
      '<\\/a>\\n?',
      '(?:^|\\n)x',
      'x|\\ny',
    ]) {
      expect(regexSeeksBareLf(body), body).toBe(false);
    }
    // Negirana klasa koja iskljucuje i `\r` ne guta CR.
    expect(regexSeeksBareLf('x[^\\r\\n]*\\n')).toBe(true);
  });

  it('(b) string: `\\n` na pocetku niza pogodi i CRLF, `split` po `\\n` nikad nije siguran', () => {
    expect(stringSeeksBareLf('indexOf', '\\nfunction ')).toBe(false);
    expect(stringSeeksBareLf('indexOf', '\\n  }\\n')).toBe(true);
    expect(stringSeeksBareLf('toContain', 'returns jsonb\\nlanguage')).toBe(true);
    expect(stringSeeksBareLf('split', '\\n')).toBe(true);
    expect(stringSeeksBareLf('split', '\\r\\n')).toBe(false);
  });

  it('nalaz trazi sve tri osi: citanje, trazenje i izostanak normalizacije', () => {
    const citanje = "const sql = readFileSync(resolve('ops/x.sql'), 'utf8');\n";
    const trazenje = "expect(sql).toMatch(/kraj;\\n/);\n";
    const izvor = (s: string) => [{ path: 'tests/x.test.ts', source: s }];
    expect(crlfReadProblems(izvor(citanje + trazenje))).toEqual(['tests/x.test.ts']);
    expect(crlfReadProblems(izvor(trazenje))).toEqual([]);
    expect(crlfReadProblems(izvor(citanje))).toEqual([]);
    for (const norm of [
      ".replace(/\\r\\n/g, '\\n')",
      ".replace(/\\r\\n?/g, '\\n')",
      ".replace(/\\r/g, '')",
      ".split('\\r\\n').join('\\n')",
      "readTextLf('x')",
      '.split(/\\r?\\n/)',
    ]) {
      expect(crlfReadProblems(izvor(citanje + trazenje + norm)), norm).toEqual([]);
    }
    expect(seeksBareLf(trazenje)).toBe(true);
  });

  it('presuda imenuje i novi nalaz i zastarjeli unos allowliste', () => {
    expect(crlfGuardVerdict(['tests/a.test.ts', 'tests/b.test.ts'], { 'tests/b.test.ts': 'r', 'tests/c.test.ts': 'r' })).toEqual([
      'novi nalaz bez normalizacije CR: tests/a.test.ts',
      'unos allowliste vise nije nalaz, ukloni ga: tests/c.test.ts',
    ]);
  });
});

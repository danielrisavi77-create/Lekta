// @vitest-environment node
/**
 * T92: trajni gard protiv testa koji cita tekst iz repozitorija i trazi `\n` bez normalizacije CR-a.
 * Na Linux CI-ju je takav test zelen, a na Windows checkoutu (CRLF) pada ili tiho slabi. Heuristika i
 * njezine granice opisane su u `tests/helpers/crlf-read-guard.ts`; mutacije su u
 * `tests/gate-mutations.test.ts` (`crlf/*`).
 */
import { describe, expect, it } from 'vitest';
import {
  blankStrings,
  collectScannedSources,
  crlfGuardVerdict,
  crlfReadProblems,
  regexSeeksBareLf,
  seeksBareLf,
  stringSeeksBareLf,
  stripComments,
  textReads,
} from './helpers/crlf-read-guard';

/** Nalazi nad jednom sintetickom test datotekom. */
const nalazi = (source: string) => crlfReadProblems([{ path: 'tests/x.test.ts', source }]);
const CITANJE = "const sql = readFileSync(resolve('ops/x.sql'), 'utf8');\n";
const TRAZENJE = "expect(sql).toContain('a\\nb');\n";

describe('T92 gard: citanje teksta iz repozitorija normalizira CR', () => {
  it('stablo nema novih nalaza, a allowlista nema zastarjelih ni praznih unosa', () => {
    const files = collectScannedSources(process.cwd());
    // Generator mora vidjeti stvarnu populaciju, inace je prazan nalaz vakuumski zelen.
    expect(files.length).toBeGreaterThan(500);
    expect(files.some((f) => f.path === 'tests/helpers/crlf-read-guard.ts')).toBe(true);
    expect(crlfGuardVerdict(crlfReadProblems(files))).toEqual([]);
  });

  it('izvorni oblik iz #243 je nalaz, a s normalizacijom nije', () => {
    expect(nalazi(CITANJE + 'const opens = (sql.match(/\\nas \\$\\$\\n/g) ?? []).length;\n')).toEqual(['tests/x.test.ts']);
    expect(nalazi(CITANJE.replace(";", ".replace(/\\r\\n/g, '\\n');") + 'sql.match(/\\nas \\$\\$\\n/g);\n')).toEqual([]);
  });

  it('(a) broji tekstno citanje, ne binarno, JSON, privremenu datoteku ni citanje u stringu', () => {
    expect(textReads("const s = readFileSync(resolve('ops/x.sql'), 'utf8');")).toHaveLength(1);
    expect(textReads("const s = await readFile(p, { encoding: 'utf-8' });")).toHaveLength(1);
    expect(textReads('const b = readFileSync(resolve(MAPA, ime));')).toHaveLength(0);
    expect(textReads("const j = JSON.parse(readFileSync(p, 'utf8'));")).toHaveLength(0);
    expect(textReads("const s = readFileSync(join(tmpDir, 'out.txt'), 'utf8');")).toHaveLength(0);
    expect(textReads("const s = readFileSync(join(tmpdir(), 'a', 'out.txt'), 'utf8');")).toHaveLength(0);
    expect(textReads("const s = readFileSync('/tmp/out.txt', 'utf8');")).toHaveLength(0);
    // R2 na #252: `templates` nije privremena mapa.
    expect(textReads("const s = readFileSync(resolve('src/templates/x.ts'), 'utf8');")).toHaveLength(1);
    expect(textReads(stripComments('const s = "readFileSync(x, \'utf8\')";'))).toHaveLength(0);
  });

  it('(b) regex: `\\n` iza znaka koji ne guta CR je osjetljiv', () => {
    expect(regexSeeksBareLf('\\nas \\$\\$\\n')).toBe(true);
    expect(regexSeeksBareLf('\\n {2}[a-z][\\w-]*:\\n')).toBe(true);
    expect(regexSeeksBareLf('a\\n\\nb')).toBe(true);
    // Negirana klasa koja iskljucuje i `\r` ne guta CR.
    expect(regexSeeksBareLf('x[^\\r\\n]*\\n')).toBe(true);
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
  });

  it('(b) `split(/\\n/)` je osjetljiv iako je `\\n` na pocetku uzorka, `split(/\\r?\\n/)` nije', () => {
    expect(seeksBareLf('x.split(/\\n/)')).toBe(true);
    expect(seeksBareLf('x.split(/\\r?\\n/)')).toBe(false);
  });

  it('(b) string: `\\n` na pocetku niza pogodi i CRLF, `split` po `\\n` nikad nije siguran', () => {
    expect(stringSeeksBareLf('indexOf', '\\nfunction ')).toBe(false);
    expect(stringSeeksBareLf('indexOf', '\\n  }\\n')).toBe(true);
    expect(stringSeeksBareLf('toContain', 'returns jsonb\\nlanguage')).toBe(true);
    expect(stringSeeksBareLf('split', '\\n')).toBe(true);
    expect(stringSeeksBareLf('split', '\\r\\n')).toBe(false);
  });

  it('(c) normalizacija oslobadja samo citanje uz koje je vezana', () => {
    for (const norm of [
      ".replace(/\\r\\n/g, '\\n')",
      ".replace(/\\r\\n?/g, '\\n')",
      ".replace(/\\r/g, '')",
      ".replaceAll('\\r\\n', '\\n')",
      // R4 na #252.
      ".replaceAll('\\r', '')",
      ".split('\\r\\n').join('\\n')",
    ]) {
      expect(nalazi(CITANJE.replace(';', `${norm};`) + TRAZENJE), norm).toEqual([]);
      expect(nalazi(CITANJE + `const lf = sql${norm};\n` + TRAZENJE.replace('sql', 'lf')), `alias ${norm}`).toEqual([]);
    }
    expect(nalazi(CITANJE + 'const t = normalizeLf(sql);\n' + TRAZENJE)).toEqual([]);
    // R1 na #252: oznaka u komentaru ili stringu ne oslobadja.
    expect(nalazi(CITANJE + '/* readTextLf( .replace(/\\r\\n/g */\n' + TRAZENJE)).toEqual(['tests/x.test.ts']);
    expect(nalazi(CITANJE + "const opis = 'sql.replace(/\\\\r\\\\n/g';\n" + TRAZENJE)).toEqual(['tests/x.test.ts']);
    // R1 na #252: dva citanja, normalizirano je samo jedno, a trazi se nad drugim.
    expect(nalazi(
      "const a = readFileSync(resolve('ops/a.sql'), 'utf8').replace(/\\r\\n/g, '\\n');\n" +
      "const b = readFileSync(resolve('ops/b.sql'), 'utf8');\n" +
      "expect(b).toContain('x\\ny');\n",
    )).toEqual(['tests/x.test.ts']);
  });

  it('vezanje prati funkciju omotac i alias, a ne mijesa isto ime iz drugog bloka', () => {
    const omotac = "function read(p) { return readFileSync(resolve(ROOT, p), 'utf8'); }\n";
    expect(nalazi(omotac + "expect(read('a.md').split('\\n')).toHaveLength(3);\n")).toEqual(['tests/x.test.ts']);
    expect(nalazi(omotac + "expect(read('a.md').split('\\r\\n').join('\\n')).toContain('a\\nb');\n")).toEqual([]);
    expect(nalazi(CITANJE + 'const rest = sql.slice(4);\nrest.search(/x\\n/);\n')).toEqual(['tests/x.test.ts']);
    expect(nalazi(
      "it('a', () => { const text = readFileSync(resolve('a.ps1'), 'utf8'); expect(problemi(text)).toEqual([]); });\n" +
      "it('b', () => { const text = readFileSync(resolve('a.ps1'), 'utf8').replace(/\\r/g, ''); /x\\ny/.exec(text); });\n",
    )).toEqual([]);
  });

  it('komentari i stringovi se prazne bez pomaka polozaja', () => {
    const izvor = "const a = '//x'; // komentar\nconst r = /['\"]/; /* b */ const c = `t`;";
    expect(stripComments(izvor)).toHaveLength(izvor.length);
    expect(stripComments(izvor)).toContain("'//x'");
    expect(stripComments(izvor)).not.toContain('komentar');
    expect(stripComments(izvor)).toContain("/['\"]/");
    expect(blankStrings(izvor)).not.toContain('//x');
    expect(blankStrings("f(p, 'utf8')")).toContain("'utf8'");
  });

  it('presuda imenuje novi nalaz, prazno obrazlozenje i zastarjeli unos allowliste', () => {
    expect(crlfGuardVerdict(['tests/a.test.ts', 'tests/b.test.ts'], { 'tests/b.test.ts': 'r', 'tests/c.test.ts': 'r' })).toEqual([
      'novi nalaz bez normalizacije CR: tests/a.test.ts',
      'unos allowliste vise nije nalaz, ukloni ga: tests/c.test.ts',
    ]);
    // R5 na #252.
    expect(crlfGuardVerdict(['tests/x.test.ts'], { 'tests/x.test.ts': '  ' })).toEqual([
      'unos allowliste bez obrazlozenja: tests/x.test.ts',
    ]);
  });
});

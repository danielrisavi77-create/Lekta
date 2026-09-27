/**
 * Granica Laya v2: do shadow GO odluke `src/**` ne uvozi nista iz Laye. Gard parsira import
 * specifikatore (static, dynamic, re-export, side-effect, require), ne trazi rijec "laya" u tekstu.
 *
 * Fail-closed: specifikator koji se ne moze procitati kao string literal (sastavljeni
 * `import('scripts/' + x)`, `require(varijabla)`) je nalaz sam po sebi, jer gard ne zna kamo
 * vodi. `src/**` danas nema nijedan takav poziv ni `require`. Alias, `dist` i symlink ovaj
 * tekstualni gard ne razrjesava: za njih je mjerodavan classification build gard nad
 * razrijesenim Rollup grafom (`scripts/**` je PRIVATE-IP/forbidden).
 */
export interface SourceFile { path: string; source: string }

const LITERAL = /\b(?:import|export)\s+(?:type\s+)?(?:[^'"]*?\sfrom\s+)?['"]([^'"]+)['"]|\b(?:import|require)\s*\(\s*['"`]([^'"`$]+)['"`]\s*\)/g;
const ANY_CALL = /\b(import|require)\s*\(/g;

/** Uklanja blok komentare i linijske komentare na pocetku retka, da primjer u komentaru nije nalaz. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter(line => !line.trim().startsWith('//')).join('\n');
}

export function importSpecifiers(source: string): string[] {
  const out: string[] = [];
  for (const match of stripComments(source).matchAll(LITERAL)) out.push(match[1] ?? match[2]);
  return out;
}

/** Broj `import(`/`require(` poziva ciji argument nije jedan string literal. */
export function nonLiteralLoads(source: string): number {
  const code = stripComments(source);
  const calls = [...code.matchAll(ANY_CALL)].length;
  const literal = [...code.matchAll(LITERAL)].filter(match => match[2] !== undefined).length;
  return calls - literal;
}

/** Laya modul je sve pod scripts/laya, schemas/laya ili bilo koji specifikator s `laya` segmentom. */
export function isLayaSpecifier(specifier: string): boolean {
  return specifier.split(/[\\/]/).some(segment => /^laya(?:[-_.].*)?$/i.test(segment) || segment === '@laya');
}

export function srcLayaImportProblems(files: SourceFile[]): string[] {
  return files.flatMap(({ path, source }) => [
    ...importSpecifiers(source).filter(isLayaSpecifier).map(specifier => `${path} uvozi ${specifier}`),
    ...(nonLiteralLoads(source) > 0 ? [`${path} ima dinamicki import/require koji gard ne moze procitati`] : []),
  ]);
}

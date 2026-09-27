/**
 * Granica Laya v2: do shadow GO odluke `src/**` ne uvozi nista iz Laye. Gard parsira import
 * specifikatore (static, dynamic, re-export, side-effect), ne trazi rijec "laya" u tekstu.
 */
export interface SourceFile { path: string; source: string }

const SPECIFIER = /\b(?:import|export)\s+(?:type\s+)?(?:[^'"]*?\sfrom\s+)?['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

export function importSpecifiers(source: string): string[] {
  const out: string[] = [];
  for (const match of source.matchAll(SPECIFIER)) out.push(match[1] ?? match[2]);
  return out;
}

/** Laya modul je sve pod scripts/laya, schemas/laya ili bilo koji specifikator s `laya` segmentom. */
export function isLayaSpecifier(specifier: string): boolean {
  return specifier.split(/[\\/]/).some(segment => /^laya(?:[-_.].*)?$/i.test(segment) || segment === '@laya');
}

export function srcLayaImportProblems(files: SourceFile[]): string[] {
  return files.flatMap(({ path, source }) => importSpecifiers(source)
    .filter(isLayaSpecifier)
    .map(specifier => `${path} uvozi ${specifier}`));
}

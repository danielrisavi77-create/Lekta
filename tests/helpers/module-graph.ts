import { existsSync, readFileSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';

/**
 * STATICKI GRAF UVOZA jednog ulaza, bez bundlera. Dijele ga `intake-entry-boundary` (sto ulaz
 * SMIJE dodirivati) i `entry-fonts` (koje obitelji ulaz ucitava), jer su dvije kopije istog
 * obilaska vec jednom razisle: kvar dolje bio je u kopiji koju nitko nije usporedjivao.
 *
 * OPCIONALNA `from` SKUPINA MORA BITI OGRADJENA. Do 2026-09-05 je glasila `[\s\S]*?\sfrom\s+`,
 * dakle smjela je preskociti PROIZVOLJAN tekst, ukljucujuci cijele naredbe. Posljedica: bare uvoz
 * (`import './x.css'`) koji stoji PRIJE nekog kasnijeg `from` uvoza u istoj datoteci bio je
 * progutan, pa ga graf nije vidio.
 *
 * Izmjereno na `src/shared/ui-boot.ts`: stari obrazac nasao je 5 uvoza, ispravan nalazi 19.
 * Nevidljivih 14 su svi fontovi i svih SEST dijeljenih CSS listova, dakle tvrdnja "ulaz nema
 * analizator" vrijedila je za graf uzi od stvarnog. Negirana klasa `[^'";]` ne moze preskociti
 * tocku-zarez, pa ne moze progutati prethodnu naredbu.
 */
export const IMPORT_PATTERN = String.raw`^[ \t]*import\s+(?!type[^\w])(?:[^'";]*?\sfrom\s+)?['"]([^'"]+)['"]\s*;?`;

/** Uvezena staza kakva stoji u kodu, bez razrjesavanja (i za pakete, ne samo relativne). */
export function rawImports(path: string): string[] {
  if (!/\.(ts|tsx|mts|js)$/.test(path)) return [];
  const code = readFileSync(path, 'utf8').replace(/^\s*import\s+type\b[\s\S]*?;\s*$/gm, '');
  return Array.from(code.matchAll(new RegExp(IMPORT_PATTERN, 'gm')), (m) => m[1]);
}

export function resolveRelativeImport(from: string, specifier: string): string | null {
  if (!specifier.startsWith('.')) return null;
  const base = resolve(dirname(from), specifier);
  const candidates = extname(base)
    ? [base]
    : [base, `${base}.ts`, `${base}.tsx`, `${base}.css`, `${base}.json`, resolve(base, 'index.ts')];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

/** Samo relativni uvozi, razrijeseni u apsolutne staze (ono sto zivi u repozitoriju). */
export function staticRuntimeImports(path: string): string[] {
  const out: string[] = [];
  for (const specifier of rawImports(path)) {
    const resolved = resolveRelativeImport(path, specifier);
    if (resolved) out.push(resolved);
  }
  return out;
}

export function collectStaticGraph(entry: string): Set<string> {
  const seen = new Set<string>();
  const queue = [entry];
  while (queue.length) {
    const path = queue.pop()!;
    if (seen.has(path)) continue;
    seen.add(path);
    for (const imported of staticRuntimeImports(path)) queue.push(imported);
  }
  return seen;
}

/** Svi PAKETNI uvozi (ne relativni) u cijelom grafu: ondje zive `@fontsource` specifikatori. */
export function packageImports(entry: string): string[] {
  const out: string[] = [];
  for (const path of collectStaticGraph(entry)) {
    for (const specifier of rawImports(path)) {
      if (!specifier.startsWith('.')) out.push(specifier);
    }
  }
  return out;
}

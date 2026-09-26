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

/**
 * IZVOR DATOTEKA KOJI GRAF CITA. Zadano je disk; `tests/gate-mutations.test.ts` podmece OVERLAY
 * (stvarni disk plus jedna datoteka izmijenjena u memoriji), pa mutacija prolazi kroz ISTI citac
 * grafa kao gard. Bez toga bi mutacija mogla mjeriti samo cistu funkciju iza citaca, a citac koji
 * npr. preskace `.css` specifikatore ostao bi slijepa tocka (nalaz pregleda Z7(a)).
 */
export interface IzvorDatoteka {
  procitaj(path: string): string;
  postoji(path: string): boolean;
}

export const DISK: IzvorDatoteka = {
  procitaj: (path) => readFileSync(path, 'utf8'),
  postoji: (path) => existsSync(path),
};

/** Uvezena staza kakva stoji u kodu, bez razrjesavanja (i za pakete, ne samo relativne). */
export function rawImports(path: string, izvor: IzvorDatoteka = DISK): string[] {
  if (!/\.(ts|tsx|mts|js)$/.test(path)) return [];
  const code = izvor.procitaj(path).replace(/^\s*import\s+type\b[\s\S]*?;\s*$/gm, '');
  return Array.from(code.matchAll(new RegExp(IMPORT_PATTERN, 'gm')), (m) => m[1]);
}

export function resolveRelativeImport(from: string, specifier: string, izvor: IzvorDatoteka = DISK): string | null {
  if (!specifier.startsWith('.')) return null;
  const base = resolve(dirname(from), specifier);
  const candidates = extname(base)
    ? [base]
    : [base, `${base}.ts`, `${base}.tsx`, `${base}.css`, `${base}.json`, resolve(base, 'index.ts')];
  return candidates.find((candidate) => izvor.postoji(candidate)) ?? null;
}

/** Samo relativni uvozi, razrijeseni u apsolutne staze (ono sto zivi u repozitoriju). */
export function staticRuntimeImports(path: string, izvor: IzvorDatoteka = DISK): string[] {
  const out: string[] = [];
  for (const specifier of rawImports(path, izvor)) {
    const resolved = resolveRelativeImport(path, specifier, izvor);
    if (resolved) out.push(resolved);
  }
  return out;
}

export function collectStaticGraph(entry: string, izvor: IzvorDatoteka = DISK): Set<string> {
  const seen = new Set<string>();
  const queue = [entry];
  while (queue.length) {
    const path = queue.pop()!;
    if (seen.has(path)) continue;
    seen.add(path);
    for (const imported of staticRuntimeImports(path, izvor)) queue.push(imported);
  }
  return seen;
}

/** Svi PAKETNI uvozi (ne relativni) u cijelom grafu: ondje zive `@fontsource` specifikatori. */
export function packageImports(entry: string, izvor: IzvorDatoteka = DISK): string[] {
  const out: string[] = [];
  for (const path of collectStaticGraph(entry, izvor)) {
    for (const specifier of rawImports(path, izvor)) {
      if (!specifier.startsWith('.')) out.push(specifier);
    }
  }
  return out;
}

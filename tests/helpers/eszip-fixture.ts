/**
 * Generator binarnog ESZIP v2.2/v2.3 za testove deploy-drifta (T101).
 *
 * Raspored je isti kao u `parseEszip` (`scripts/deploy-drift-core.mjs`): magic, opcije, zaglavlje
 * modula, npm snimka, izvori, source mape; svi brojevi su u32 big-endian. Da generator proizvodi
 * pravi format, a ne nesto sto samo nas parser prihvaca, dokazuje test koji iz stvarnog deployanog
 * bodyja (`tests/fixtures/deploy-drift/health.eszip`) ponovno sastavi iste bajtove.
 */

export type EszipZapis =
  | { specifier: string; kind: 'module'; moduleKind: number; source: string | Uint8Array; sourceMap: string | null }
  | { specifier: string; kind: 'redirect'; target: string }
  | { specifier: string; kind: 'npm'; packageId: number };

export interface EszipUlaz {
  version?: string;
  options?: number[];
  modules: EszipZapis[];
  npm?: Uint8Array;
}

const enc = new TextEncoder();
const bajtovi = (v: string | Uint8Array) => (typeof v === 'string' ? enc.encode(v) : v);
const u32 = (n: number) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
const sDuljinom = (b: Uint8Array) => [...u32(b.length), ...b];

export function buildEszip({ version = 'ESZIP2.3', options = [0, 0, 1, 0], modules, npm = new Uint8Array(0) }: EszipUlaz): Uint8Array {
  const zaglavlje: number[] = [];
  const izvori: number[] = [];
  const mape: number[] = [];
  for (const m of modules) {
    zaglavlje.push(...sDuljinom(enc.encode(m.specifier)));
    if (m.kind === 'module') {
      const izvor = bajtovi(m.source);
      const mapa = m.sourceMap === null ? new Uint8Array(0) : enc.encode(m.sourceMap);
      // Modul bez mape ima odmak 0 (izmjereno na stvarnom bodyju), ne trenutni polozaj u sekciji.
      zaglavlje.push(0, ...u32(izvori.length), ...u32(izvor.length), ...u32(mapa.length ? mape.length : 0), ...u32(mapa.length), m.moduleKind);
      izvori.push(...izvor);
      mape.push(...mapa);
    } else if (m.kind === 'redirect') {
      zaglavlje.push(1, ...sDuljinom(enc.encode(m.target)));
    } else {
      zaglavlje.push(2, ...u32(m.packageId));
    }
  }
  return new Uint8Array([
    ...enc.encode(version),
    ...sDuljinom(new Uint8Array(options)),
    ...sDuljinom(new Uint8Array(zaglavlje)),
    ...sDuljinom(npm),
    ...sDuljinom(new Uint8Array(izvori)),
    ...sDuljinom(new Uint8Array(mape)),
  ]);
}

/** Source mapa s jednim izvorom, imenovanim kao modul, i izvornim tekstom (oblik iz deploya). */
export const mapaModula = (specifier: string, sadrzaj: string | null) =>
  JSON.stringify({ version: 3, sources: [specifier], sourcesContent: [sadrzaj], mappings: 'AAAA' });

/** Metapodaci runtimea: ulaz, JSON razrjesavanja i binarni rep (kao u stvarnom bodyju). */
export const metapodaci = (ulaz: string, config: Record<string, unknown> = { import_map: null, jsr_pkgs: [], package_jsons: {} }) =>
  new Uint8Array([...enc.encode(`${ulaz}${JSON.stringify(config)}`), 0, 0xff, 0xff, 0xff, 0x10]);

/** Bundle funkcije: ulaz s metapodacima i zadani lokalni moduli `[specifier, izvorni tekst]`. */
export function bundleFunkcije(ulaz: string, moduli: [string, string][], dodatno: EszipZapis[] = []): Uint8Array {
  return buildEszip({
    modules: [
      ...moduli.map(([specifier, tekst]): EszipZapis => ({ specifier, kind: 'module', moduleKind: 0, source: `// js ${specifier}`, sourceMap: mapaModula(specifier, tekst) })),
      ...dodatno,
      { specifier: '---SUPABASE-ESZIP-VERSION-ESZIP---', kind: 'module', moduleKind: 3, source: '2.0', sourceMap: null },
      { specifier: '---EDGE-RUNTIME-METADATA---', kind: 'module', moduleKind: 3, source: metapodaci(ulaz), sourceMap: null },
    ],
  });
}

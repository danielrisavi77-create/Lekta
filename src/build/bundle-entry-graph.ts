/**
 * Mjerenje POCETNOG TROSKA jednog Rollup entryja: entry chunk PLUS cijeli njegov tranzitivni
 * graf STATICKIH uvoza. Cista funkcija (bez fs, bez Rollupa), pa je jedinicno testabilna.
 *
 * Zasto postoji, i zasto mjerenje samog entry chunka nije dovoljno:
 *
 * `bundleSizeGuard` je do sada mjerio `Buffer.byteLength(indexEntry.code)`, dakle VLASTITI kod
 * entry chunka, a ne ono sto preglednik zapravo mora skinuti prije prvog izvrsavanja. Dokle god
 * je `index` jedini HTML ulaz koji povlaci glavni graf, ta dva broja su bliska i guard izgleda
 * zdravo. Cim DRUGI HTML ulaz staticki uveze isti modul, Rollup zajednicki dio hoista u
 * ZAJEDNICKI chunk: entry se urusi u stub od nekoliko kilobajta, a guard nastavi prolaziti
 * zauvijek, mjereci nista. To je isti obrazac vakuumskog zelenog koji je ovaj repozitorij vec
 * platio drugdje (guard koji nije bio registriran, gard koji prestane gristi kad je posao gotov).
 *
 * MJERENJE 2026-08-31 (wt/temelji), prije ijedne promjene grafa: `index` na ovoj grani VEC ima 14
 * zajednickih chunkova statickih uvoza (ui-boot, zagreb-catalog, config-loader, citation,
 * parse-reference...). Entry sam nosi 665.976 B (650 KB), a cijeli staticki graf 815.148 B
 * (796 KB). Guard je dakle vec mjerio 82% stvarnog troska, ne 100%. Budzet od 960 KB i dalje drzi,
 * s rezervom od 164 KB.
 *
 * Brojke su MJERENJE, ne invarijanta: tocni bajtovi se mijenjaju sa sadrzajem i hashiranim imenima
 * chunkova (na stablu spajanja izmjereno 815.115 B). Reproduciraj ih pokretanjem builda s ovom
 * funkcijom, ne prepisivanjem.
 *
 * Dinamicki uvozi (`chunk.dynamicImports`) se NAMJERNO ne broje: oni su lijeni po definiciji
 * (lazy chunkovi analize, popravka, predlozaka) i ne ulaze u prvi paint. Broji se iskljucivo
 * `chunk.imports`, dakle ono sto preglednik mora imati prije nego entry uopce pocne raditi.
 */

/** Minimalni oblik Rollup chunka koji mjerenju treba (i koji test moze sintetizirati). */
export interface BundleChunkLike {
  readonly type: string;
  readonly name?: string;
  readonly isEntry?: boolean;
  readonly code?: string;
  readonly imports?: readonly string[];
}

/** Rollup bundle mapa: kljuc je fileName, isti identitet kojim `chunk.imports` referira uvoze. */
export type BundleLike = Readonly<Record<string, BundleChunkLike>>;

export interface EntryGraphMeasurement {
  /** fileName pronadjenog entry chunka. */
  readonly entryFileName: string;
  /** Svi dosezivi chunkovi (ukljucujuci sam entry), redoslijedom obilaska, bez ponavljanja. */
  readonly reachableFileNames: readonly string[];
  /**
   * Uvozi koje bundle mapa NE sadrzi. Nisu greska po sebi (Rollup ovdje moze prijaviti i vanjski
   * modul), ali se moraju IMENOVATI: precutno preskocen uvoz znaci da je mjera nepotpuna, a
   * nepotpuna mjera je opasnija od nikakve jer izgleda kao mjera.
   */
  readonly missingFileNames: readonly string[];
  /** Bajtovi samog entry chunka (stara, uza mjera; cuva se radi usporedbe). */
  readonly entryOwnBytes: number;
  /** Bajtovi cijelog statickog grafa (entry + svi dosezivi zajednicki chunkovi). */
  readonly totalBytes: number;
}

const encoder = new TextEncoder();

/** UTF-8 duljina u BAJTOVIMA, ne u znakovima (hrvatska dijakritika je dvobajtna). */
function byteLength(code: string | undefined): number {
  return code ? encoder.encode(code).length : 0;
}

function isChunk(value: BundleChunkLike | undefined): value is BundleChunkLike {
  return value !== undefined && value.type === 'chunk';
}

/**
 * Nadji entry chunk po Rollup `name` (npr. 'index') i zbroji bajtove njegovog tranzitivnog
 * statickog grafa. Vraca `null` kad entry ne postoji: pozivatelj tada mora ODLUCITI je li to
 * pad ili ne, umjesto da tiho ne izmjeri nista.
 *
 * Ciklusi (a -> b -> a) su ocekivani u Rollup izlazu i ne smiju vrtjeti beskonacno; svaki chunk
 * ulazi u zbroj tocno jednom.
 */
export function measureEntryGraphBytes(bundle: BundleLike, entryName: string): EntryGraphMeasurement | null {
  let entryFileName: string | null = null;
  for (const [fileName, chunk] of Object.entries(bundle)) {
    if (isChunk(chunk) && chunk.isEntry === true && chunk.name === entryName) {
      entryFileName = fileName;
      break;
    }
  }
  if (entryFileName === null) return null;

  const reachableFileNames: string[] = [];
  const missingFileNames: string[] = [];
  const seen = new Set<string>();
  const seenMissing = new Set<string>();
  const queue: string[] = [entryFileName];
  let totalBytes = 0;

  while (queue.length > 0) {
    const fileName = queue.shift() as string;
    if (seen.has(fileName)) continue;
    seen.add(fileName);

    const chunk = bundle[fileName];
    if (!isChunk(chunk)) {
      if (!seenMissing.has(fileName)) {
        seenMissing.add(fileName);
        missingFileNames.push(fileName);
      }
      continue;
    }

    reachableFileNames.push(fileName);
    totalBytes += byteLength(chunk.code);
    for (const imported of chunk.imports ?? []) {
      if (!seen.has(imported)) queue.push(imported);
    }
  }

  return {
    entryFileName,
    reachableFileNames,
    missingFileNames,
    entryOwnBytes: byteLength(bundle[entryFileName]?.code),
    totalBytes,
  };
}

/**
 * BUDZET PO ULAZU, ne po jednom imenu.
 *
 * Do 2026-09-05 je guard mjerio iskljucivo ulaz `index`. Kad `/` postane cisti ulaz za dokument
 * (~8 KB), taj ulaz prolazi zauvijek, a jedini teski ulaz (`rad`, koji nosi analizator) nitko ne
 * mjeri: regresija od pola megabajta ostala bi nevidljiva uz zelen guard. Zato budzet nosi SVAKI
 * imenovani ulaz, i svaki koji nedostaje u bundleu je pad, ne tihi preskok (isti sentinel kao prije).
 *
 * Vraca popis problema; prazan popis znaci prolaz. Cista funkcija, pa se mutacije mjere bez builda.
 */
export interface EntryBudgetProblem {
  entryName: string;
  kind: 'missing-entry' | 'over-budget';
  measuredBytes: number | null;
  budgetBytes: number;
  detail: string;
}

export function checkEntryBudgets(
  bundle: BundleLike,
  budgets: Readonly<Record<string, number>>,
): EntryBudgetProblem[] {
  const names = Object.keys(budgets);
  if (names.length === 0) {
    throw new Error('[bundle-guard] prazna mapa budzeta: guard bez ijednog ulaza bi prolazio vakuumski.');
  }
  const problems: EntryBudgetProblem[] = [];
  for (const entryName of names) {
    const budgetBytes = budgets[entryName];
    const measured = measureEntryGraphBytes(bundle, entryName);
    if (!measured) {
      problems.push({
        entryName, kind: 'missing-entry', measuredBytes: null, budgetBytes,
        detail: `entry chunk '${entryName}' ne postoji u bundleu, pa se budzet nije mogao izmjeriti`,
      });
      continue;
    }
    if (measured.totalBytes > budgetBytes) {
      problems.push({
        entryName, kind: 'over-budget', measuredBytes: measured.totalBytes, budgetBytes,
        detail: `pocetni staticki graf ulaza ${entryName} je ${Math.round(measured.totalBytes / 1024)} KB, `
          + `preko budzeta ${Math.round(budgetBytes / 1024)} KB. ${describeEntryGraph(measured)}`,
      });
    }
  }
  return problems;
}

/** Citljiv sazetak mjerenja za poruku o padu builda (bez skrivanja nepotpunosti). */
export function describeEntryGraph(measurement: EntryGraphMeasurement): string {
  const kb = (bytes: number): string => `${Math.round(bytes / 1024)} KB`;
  const parts = [
    `entry ${measurement.entryFileName} nosi ${kb(measurement.entryOwnBytes)}`,
    `cijeli staticki graf ${kb(measurement.totalBytes)} kroz ${measurement.reachableFileNames.length} chunk(ova)`,
  ];
  if (measurement.missingFileNames.length > 0) {
    parts.push(`uvozi izvan bundle mape (neizmjereni): ${measurement.missingFileNames.join(', ')}`);
  }
  return parts.join('; ');
}

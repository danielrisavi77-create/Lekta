import fs from 'node:fs';
import path from 'node:path';

/**
 * MJERENJE I PRESUDA ratcheta nad `src/ui`, izdvojeni iz `tests/ui-module-budget.test.ts`
 * 2026-09-13 da ih moze zvati i mutacija u `tests/gate-mutations.test.ts`.
 *
 * Razlog za izdvajanje, a ne za prepisivanje: mutacija koja ima VLASTITU kopiju pravila ne mjeri
 * gard nego samu sebe. Gard i njegova mutacija moraju dijeliti tocno jedan izvor istine.
 *
 * Uvoz same `.test.ts` datoteke NIJE bio opcija: vitest bi njezine `describe` blokove registrirao i
 * u datoteci koja je uvozi, pa bi se isti testovi vrtjeli dvaput.
 */

export const KORIJEN = process.cwd();

/** Koliko datoteka smije biti ISPOD budzeta prije nego ratchet trazi spustanje. */
export const POPUST = 8 * 1024;

/**
 * Velicina se mjeri NAD NORMALIZIRANIM sadrzajem, ne `statSync().size`.
 *
 * Zasto, izmjereno 2026-09-03 na `54bb11e3`: ista datoteka iz ISTOG commita ima dvije velicine,
 * ovisno samo o tome kako je radno stablo materijalizirano (CRLF u svjezem `git worktree add`,
 * LF u dijeljenom stablu i u blobu). Razlika je TOCNO broj redaka, pa bi gard nad sirovim bajtovima
 * mjerio KONFIGURACIJU GITA, ne sadrzaj repozitorija.
 *
 * CR bajtovi se ODBACUJU brojanjem, ne regexom nad tekstom: escape u regexu gradjenom kroz alat zna
 * se izgubiti (poznat razred kvara u ovom repozitoriju), a brojanje bajtova nema tu zamku.
 */
export function bajtova(rel: string): number {
  const sirovo = fs.readFileSync(path.join(KORIJEN, rel));
  let n = 0;
  for (const b of sirovo) if (b !== 0x0d) n += 1;
  return n;
}

/** Sve `.ts`/`.tsx` datoteke pod `rel`, bez testova, kao repo-relativne staze s `/`. */

/**
 * Presuda ratcheta nad jednom izmjerenom velicinom. Prazan niz znaci "uredu".
 *
 * DVIJE GRANE, i donja je jednako vazna kao gornja: bez nje bi budzet ostao naduvan nakon prvog
 * uspjesnog izdvajanja i sljedeci rast bi opet prosao neprimijeceno.
 */
export function presudaRatcheta(velicina: number, budzet: number): string[] {
  const out: string[] = [];
  if (velicina > budzet) out.push('preko-budzeta');
  if (velicina <= budzet - POPUST) out.push('budzet-naduvan');
  return out;
}

/**
 * PRAGOVI ZIVE OVDJE, uz `presudaRatcheta`, a ne u testu koji ih troši.
 *
 * Razlog je izmjeren 2026-09-13: mutacija `ui-budzet/rast-i-naduvan-budzet` je prvo vjezbala
 * presudu nad IZMISLJENIM budzetima, pa je ostajala zelena i kad se `BUDZET_APP` naduva na
 * `999 * 1024`, dakle na tocno onaj kvar koji imenuje. Mutacija koja ima vlastitu kopiju broja
 * ne mjeri gard nego samu sebe. Izvoz je zato jedan, i mutacija i gard citaju isti.
 */
/** Izmjereno 2026-09-03. Brojke se SPUSTAJU kako kod izlazi iz `app.ts`, nikad ne dizu. */
/**
 * Povijest: 359 -> 357 (T16 B5, telemetrija izasla u `src/ui/telemetry.ts`).
 * Spusta se na IZMJERENU vrijednost svaki put kad kod izadje, nikad se ne dize.
 */
// 2026-09-13 (zadatak B): 357 -> 347 KB. Tri javna demo izvjestaja (`DEMO_VARIANTS`, `demoResult`,
// `demoResultFpzg/Pravo/Seminar`, `demoAssemble`) izasla su u `src/demo/sample-results.ts`, dakle
// IZVAN `src/ui`. Selidba unutar `src/ui` ne bi oslobodila nista: donji budzet broji SVE .ts
// datoteke tog stabla, pa bi nova datoteka samo dodala zaglavlje uvoza.
// Izmjereno: app.ts 365332 -> 353286 B (-12046; 11 B od toga je uvoz `makeCheck`, koji je selidbom
// ostao neiskoristen). Budzet 355328 B ostavlja 2042 B zraka, pa gard grize na sljedeci rast, a
// jos je 6150 B IZNAD donje granice (355328 - 8192), pa ne trazi odmah novo spustanje.
export const BUDZET_APP = 347 * 1024;

// UKUPNI BUDZET `src/ui` JE UKINUT 2026-09-09, odlukom vlasnika, i ovdje se NE VRACA. Brojao je
// bajtove IZVORA ukljucujuci komentare, koje build odbaci i korisnik nikad ne preuzme, pa je
// oporezivao bas gusto objasnjene odluke koje ovaj repozitorij trazi. Obrazlozenje u cijelosti
// stoji u `tests/ui-module-budget.test.ts`. Tezinu koju korisnik STVARNO osjeti cuva
// `bundleSizeGuard` u `vite.config.ts`, nad izgradjenim entryjem.

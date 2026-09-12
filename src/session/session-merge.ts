/**
 * SPAJANJE RADA IZ DVIJE KARTICE (korak C1, 2026-09-12).
 *
 * ZASTO SPAJANJE, a ne "zadnji pobjedjuje". Zapis o radu je jedan objekt, ali nastaje iz vise
 * neovisnih dogadjaja: potvrda profila, zavrsetak analize, promjena odabira. Dvije kartice nad
 * istom sesijom (ili jedna kartica i zakasnjeli zapis iz prethodnog koraka) mogu pisati u razmaku
 * od nekoliko milisekundi. "Zadnji pobjedjuje" nad CIJELIM objektom bi tada tiho obrisao tudji
 * rad: tko god zapise drugi, njegov `profile` bi pregazio analizu koju nije ni vidio.
 *
 * Zato se spaja PO POLJU, i svako polje ima imenovano pravilo. Pravila su namjerno razlicita, jer
 * polja ne znace istu vrstu cinjenice.
 *
 * CIST MODUL: bez DOM-a, bez pohrane, bez vremena. Sve odluke ovise samo o vrijednostima koje
 * dobije, pa je testabilan bez ijedne utrke.
 */
import type { ConfirmedProfileSnapshot, LocalWorkspaceSnapshot } from './local-document-session';

/** Rad vezan uz sesiju. Bez bajtova dokumenta: oni se pisu jednom i ne spajaju se. */
export interface SessionWork {
  profile?: ConfirmedProfileSnapshot;
  workspace?: LocalWorkspaceSnapshot;
}

/**
 * Spaja `patch` preko `base`.
 *
 * PRAVILA, po polju:
 *  - `profile`: pobjedjuje VECI `confirmedAt`. Profil je korisnikova odluka s vremenom; starija
 *    odluka ne smije pregaziti noviju samo zato sto je stigla kasnije.
 *  - `workspace.analysis`: pobjedjuje VECI `createdAt`. Isti razlog; uz to je starija analiza nad
 *    istim dokumentom u najboljem slucaju suvisna, a u najgorem opisuje druga pravila.
 *  - `workspace.repairSelection`: pobjedjuje VECI `updatedAt`, ALI samo ako se `itemsDigest`
 *    poklapa. Tudji odabir nad DRUGIM popisom stavaka nije moj odabir, pa se odbacuje umjesto da
 *    se preslika na kljuceve koji slucajno postoje i ovdje.
 *  - `workspace.stage`: pobjedjuje MOJ. Stage je tvrdnja o tome sto korisnik gleda U OVOJ KARTICI,
 *    pa je jedino polje kod kojeg je "zadnji pobjedjuje" ispravno.
 *  - `workspace.selectedFindingId`: prati `stage`, iz istog razloga.
 */
export function mergeSessionWork(base: SessionWork, patch: SessionWork): SessionWork {
  const spojeno: SessionWork = {};

  const profile = noviji(base.profile, patch.profile, (p) => p.confirmedAt);
  if (profile) spojeno.profile = profile;

  const workspace = spojiWorkspace(base.workspace, patch.workspace);
  if (workspace) spojeno.workspace = workspace;

  return spojeno;
}

/** Vraca onaj s vecim biljegom. Kad je samo jedan prisutan, vraca njega; kad nijedan, `undefined`. */
function noviji<T>(a: T | undefined, b: T | undefined, biljeg: (v: T) => number): T | undefined {
  if (!a) return b;
  if (!b) return a;
  // Jednakost daje `b`: kad su biljezi isti, noviji zapis je onaj koji upravo stize.
  return biljeg(b) >= biljeg(a) ? b : a;
}

function spojiWorkspace(
  base: LocalWorkspaceSnapshot | undefined,
  patch: LocalWorkspaceSnapshot | undefined,
): LocalWorkspaceSnapshot | undefined {
  if (!base) return patch;
  if (!patch) return base;

  // Stage i odabrani nalaz dolaze iz kartice koja upravo pise.
  const spojen: LocalWorkspaceSnapshot = { stage: patch.stage };
  if (patch.selectedFindingId !== undefined) spojen.selectedFindingId = patch.selectedFindingId;

  const analysis = noviji(base.analysis, patch.analysis, (a) => a.createdAt);
  if (analysis) spojen.analysis = analysis;

  const odabir = spojiOdabir(base.repairSelection, patch.repairSelection);
  if (odabir) spojen.repairSelection = odabir;

  return spojen;
}

function spojiOdabir(
  base: LocalWorkspaceSnapshot['repairSelection'],
  patch: LocalWorkspaceSnapshot['repairSelection'],
): LocalWorkspaceSnapshot['repairSelection'] {
  if (!base) return patch;
  if (!patch) return base;
  // Otisci se razlikuju: popisi stavaka nisu isti, pa usporedba vremena nema smisla. Zadrzava se
  // onaj koji upravo stize, jer opisuje popis koji korisnik GLEDA.
  if (base.itemsDigest !== patch.itemsDigest) return patch;
  return patch.updatedAt >= base.updatedAt ? patch : base;
}

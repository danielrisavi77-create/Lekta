/**
 * IZBOR NA ULAZU (Z32): fakultet potvrdjen uz list i rok predaje, kao podatak.
 *
 * Zivi u `shared/`, a ne u `routes/intake/`, jer ga citaju DVIJE rute: ulaz `/` ga pise, a radna
 * povrsina `/rad/` iz njega zna da je profil vec potvrdjen (i Z34 i Z36 citaju rok). Modul ne dira
 * DOM; pohrana ide iskljucivo kroz `safeStorageGet`/`safeStorageSet` (CLAUDE.md, "Konvencije").
 *
 * STO SE PAMTI I ZASTO TOLIKO:
 *
 *   rok      Pamti se trajno i vraca na ulaz pri sljedecem dolasku: rok je svojstvo rada, ne
 *            posjeta, a Z34 (rezultat) i Z36 (popravak) ga trebaju na `/rad/`. Ako korisnik
 *            zatvori karticu prije ubacivanja, zapis ostaje bez rada; to je prihvatljivo, jer
 *            rada tada jos nema, a sljedeci dolazak dobiva isti rok vec upisan.
 *
 *   potvrda  Tko je sto potvrdio na ulazu, i ZA KOJU SESIJU. Vezanje za id sesije je cijela
 *            zastita: potvrda iz proslog posjeta ne smije se primijeniti na drugi dokument.
 *            Ulaz je pri ucitavanju NE vraca kao potvrdjenu; kartica fakulteta uvijek trazi novi
 *            klik na "Potvrdi" (Z32 tocka 3).
 *
 * NEPOZNATI KLJUCEVI ZAPISA SE CUVAJU: pisac spaja, ne prepisuje, pa kasniji zadatak (Z34, Z36)
 * moze dodati svoje polje bez da ga ulaz pri sljedecem upisu izbrise.
 */

import PLATE_INDEX from '../../data/coverage/unit-kratice.json';
import { workTypeFromSlug } from '../title-pages/level-slugs';
import { safeStorageGet, safeStorageSet, STORAGE_KEYS } from './browser-storage';
import { normalizirajRok, rokOdlucen, type RokStanje } from '../routes/intake/deadline-stamp';

/** Sto je korisnik potvrdio na ulazu. `program` postoji samo kad je predodabir dosao iz postavki. */
export interface PotvrdaUlaza {
  unit: string;
  program: string | null;
  workType: string | null;
  /** Id sesije dokumenta ubacenog uz ovu potvrdu; `null` dok dokument nije spremljen. */
  sesija: string | null;
  at: number;
}

export interface IzborUlaza {
  rok: RokStanje;
  potvrda: PotvrdaUlaza | null;
}

/** Odakle je fakultet na kartici predodabran. Odlucuje i o tome smije li se tvrditi studij. */
export type IzvorPredodabira = 'url' | 'postavke';

export interface Predodabir {
  unit: string;
  program: string | null;
  workType: string | null;
  izvor: IzvorPredodabira;
  /** Natpis kartice: "FPZG · Politologija · Dipl.", odnosno "FPZG · Dipl." bez studija. */
  natpis: string;
  /** Kratak natpis na listu: kratica i razina, kao plocica u traci. */
  kratko: string;
}

const UNITS = PLATE_INDEX.units as Record<string, string | undefined>;
const RAZINE = PLATE_INDEX.workTypes as Record<string, string | undefined>;

const tekstIli = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null);

function zapis(): Record<string, unknown> {
  const sirovo: unknown = safeStorageGet(STORAGE_KEYS.intake, null);
  return typeof sirovo === 'object' && sirovo !== null && !Array.isArray(sirovo) ? { ...(sirovo as Record<string, unknown>) } : {};
}

function normalizirajPotvrdu(v: unknown): PotvrdaUlaza | null {
  if (typeof v !== 'object' || v === null) return null;
  const p = v as Record<string, unknown>;
  const unit = tekstIli(p.unit);
  if (!unit || typeof p.at !== 'number' || !Number.isFinite(p.at)) return null;
  return { unit, program: tekstIli(p.program), workType: tekstIli(p.workType), sesija: tekstIli(p.sesija), at: p.at };
}

/** Procitan izbor; pokvarena ili tudja pohrana daje prazan izbor, nikad iznimku. */
export function procitajIzborUlaza(): IzborUlaza {
  const z = zapis();
  return { rok: normalizirajRok(z.rok), potvrda: normalizirajPotvrdu(z.potvrda) };
}

/**
 * Upis jednog polja zapisa uz cuvanje ostalih. Vraca `false` kad je vrijednost vec ista, pa drugi
 * upis iste vrijednosti NE dira pohranu (idempotencija se mjeri, ne pretpostavlja).
 */
function upisiPolje(kljuc: 'rok' | 'potvrda', vrijednost: unknown): boolean {
  const z = zapis();
  if (JSON.stringify(z[kljuc] ?? null) === JSON.stringify(vrijednost ?? null)) return false;
  z[kljuc] = vrijednost;
  safeStorageSet(STORAGE_KEYS.intake, z);
  return true;
}

export function zapisiRok(rok: RokStanje): boolean {
  return upisiPolje('rok', normalizirajRok(rok));
}

export function zapisiPotvrdu(potvrda: PotvrdaUlaza | null): boolean {
  return upisiPolje('potvrda', potvrda);
}

/** Vezuje zivu potvrdu za upravo spremljenu sesiju. Bez potvrde nema sto vezati. */
export function veziPotvrduZaSesiju(sesija: string): boolean {
  const { potvrda } = procitajIzborUlaza();
  if (!potvrda) return false;
  return zapisiPotvrdu({ ...potvrda, sesija });
}

/**
 * PREDODABIR KARTICE FAKULTETA, istim prvenstvom kao `/rad/` (`src/ui/selection-entry.ts`):
 * izricit `?unit=` link pobjeduje zapamcen odabir. Izvor natpisa je isti kao plocica u traci
 * (`data/coverage/unit-kratice.json` i `lekta.preferences.v2`), pa kartica i traka ne mogu
 * tvrditi razlicit fakultet.
 *
 * STUDIJ SE NAVODI SAMO IZ POSTAVKI. Kad fakultet dolazi iz linka, `/rad/` ga primijeni bez
 * studija i izbornik studija padne na abecedno prvi (`populatePrograms`), pa bi kartica s
 * studijem iz postavki obecavala nesto sto odrediste nece primijeniti.
 *
 * Nepoznata jedinica (nema je u indeksu) nije predodabir: vraca se `null`, a kartica nudi
 * postojeci odabir profila umjesto da pogadja.
 */
export function predodabirFakulteta(search: string, postavke: unknown): Predodabir | null {
  let params: URLSearchParams;
  try { params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search); } catch { params = new URLSearchParams(); }
  const urlUnit = tekstIli(params.get('unit'))?.trim() ?? null;
  if (urlUnit && UNITS[urlUnit]) {
    const workType = workTypeFromSlug((params.get('work') ?? '').trim());
    return sastavi(urlUnit, null, workType, 'url');
  }
  const p = (typeof postavke === 'object' && postavke !== null ? postavke : {}) as Record<string, unknown>;
  const unit = tekstIli(p.unit);
  if (!unit || !UNITS[unit]) return null;
  return sastavi(unit, tekstIli(p.program), tekstIli(p.workType), 'postavke');
}

function sastavi(unit: string, program: string | null, workType: string | null, izvor: IzvorPredodabira): Predodabir {
  const kratica = UNITS[unit] as string;
  const razina = workType ? RAZINE[workType] : undefined;
  const kratko = razina ? `${kratica} · ${razina}` : kratica;
  const natpis = [kratica, program, razina].filter((x): x is string => typeof x === 'string' && x !== '').join(' · ');
  return { unit, program, workType, izvor, natpis, kratko };
}

/** Postavke analizatora iz pohrane, istim putem kojim ih cita traka. */
export function procitajPostavke(): unknown {
  return safeStorageGet(STORAGE_KEYS.preferences, null);
}

/**
 * SPREMNOST ZA UBACIVANJE (Z32 tocka 3): fakultet potvrdjen I (rok ILI "Još ne znam rok").
 *
 * Natpis kad oboje nedostaje je doslovno iz predloska ("Prvo potvrdi fakultet i rok"). Kad
 * nedostaje samo jedno, natpis kaze samo to, skracivanjem istog teksta, jer nalog trazi natpis
 * "sto nedostaje"; predlozak ima samo zbirni oblik.
 */
export const NATPIS_SPREMNO = 'ili ispusti dokument ovdje';

export function spremnostUlaza(stanje: { fakultetPotvrden: boolean; rok: RokStanje }): { spremno: boolean; natpis: string } {
  const rok = rokOdlucen(stanje.rok);
  if (stanje.fakultetPotvrden && rok) return { spremno: true, natpis: NATPIS_SPREMNO };
  if (!stanje.fakultetPotvrden && !rok) return { spremno: false, natpis: 'Prvo potvrdi fakultet i rok' };
  return { spremno: false, natpis: stanje.fakultetPotvrden ? 'Prvo potvrdi rok' : 'Prvo potvrdi fakultet' };
}

/**
 * SMIJE LI `/rad/` PRIMIJENITI POTVRDU S ULAZA kao potvrdjen profil sesije.
 *
 * Sve cetiri stvari moraju vrijediti, jer svaka zatvara jednu tvrdnju koju ulaz ne smije dati:
 *   1. potvrda je vezana za OVU sesiju (ne za neki drugi dokument iz proslog posjeta);
 *   2. potvrda nosi studij (predodabir iz postavki); bez njega bi `/rad/` kao potvrdjen oznacio
 *      abecedni fallback izbornika, tocno slucaj koji `renderAnalyzeSummary` zove nepouzdanim;
 *   3. obrazac na `/rad/` nakon obnove postavki i linka pokazuje ISTI fakultet, studij i razinu
 *      (inace je korisnik potvrdio nesto drugo od onoga sto bi se bodovalo);
 *   4. sesija nema vlastiti potvrdjen profil (njegova obnova je jaca i ide svojim putem).
 */
export function potvrdaVrijediZaSesiju(
  potvrda: PotvrdaUlaza | null,
  sesija: { id: string; imaProfil: boolean },
  obrazac: { unit: string; program: string; workType: string },
): boolean {
  if (!potvrda || sesija.imaProfil) return false;
  if (potvrda.sesija !== sesija.id) return false;
  if (!potvrda.program) return false;
  return potvrda.unit === obrazac.unit
    && potvrda.program === obrazac.program
    && (potvrda.workType ?? '') === obrazac.workType;
}

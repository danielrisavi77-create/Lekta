/**
 * IZBOR NA ULAZU (Z32): fakultet potvrdjen uz list i rok predaje, kao podatak.
 *
 * Zivi u `shared/`, a ne u `routes/intake/`, jer ga citaju DVIJE rute: ulaz `/` ga pise, a radna
 * povrsina `/rad/` iz njega zna da je profil vec potvrdjen (i Z34 i Z36 citaju rok). Modul ne dira
 * DOM; pohrana ide iskljucivo kroz `safeStorageGet`/`safeStorageSet` (CLAUDE.md, "Konvencije").
 *
 * STO SE PAMTI I ZASTO TOLIKO:
 *
 *   rok      Pamti se i vraca na ulaz pri sljedecem dolasku, jer je rok svojstvo rada, ne
 *            posjeta. ISTEKAO datum se NE vraca (`rokZaPovratak`): vrata ulaza otvara samo rok,
 *            pa bi zaboravljen rok proslog rada sam otvorio vrata za novi rad.
 *
 *   rokSesije  Rok vezan za id sesije ubacenog rada (`veziRokZaSesiju`). Z34 (rezultat) i Z36
 *            (popravak) na `/rad/` citaju OVAJ zapis (`rokZaSesiju`), a ne `rok`, koji se pri
 *            sljedecem posjetu ulaza vec moze odnositi na drugi rad. NALAZ PREGLEDA Z32: ranije je
 *            ovo bio JEDAN slot (zadnja vezana sesija), pa je drugi upload pregazio rok prvog; sada
 *            je mapa po id-u sesije, kao `potvrdaSesije` ispod, pa `/rad/#session=S1` cita rok S1
 *            i nakon sto je S2 vezan.
 *
 *   potvrda  Tko je sto potvrdio na ulazu, JOS NEVEZANO za sesiju (dokument nije nuzno ni odabran).
 *            Kartica fakulteta uvijek trazi novi klik na "Potvrdi" (Z32 tocka 3); ovaj slot je zato
 *            uvijek "trenutni, jos nepotvrdjeni upload", NIKAD trajan zapis. Potvrda NIJE uvjet za
 *            ubacivanje (odluka vlasnika 2026-09-27): bez nje `/rad/` fakultet prepoznaje iz
 *            dokumenta, kao i prije Z32.
 *
 *   potvrdaSesije  Potvrda VEZANA za id sesije (`veziPotvrduZaSesiju`), mapa po id-u sesije, isto
 *            kao `rokSesije`. Vezanje je cijela zastita: potvrda iz proslog posjeta ne smije se
 *            primijeniti na drugi dokument. NALAZ PREGLEDA Z32: `potvrda` je ranije NOSILA i
 *            vezanje (polje `sesija` na istom jedinom slotu), pa je novi klik "Potvrdi" za
 *            SLJEDECI rad pregazio vezanje prethodnog; `potvrdaZaSesiju` cita iz mape i ne gubi
 *            raniju sesiju.
 *
 *   napomenaSesije  Odluka studenta o napomeni "drugi fakultet u dokumentu" na `/rad/` ("Zadrži"
 *            ili "Prebaci", `src/ui/confirmed-faculty.ts`), mapa po id-u sesije, isto kao
 *            `rokSesije` i `potvrdaSesije`. NALAZ PREGLEDA (Codex): odluka se prije pamtila samo u
 *            memoriji modula, pa je ponovno otvaranje iste sesije napomenu vratilo. Odluka pripada
 *            radu, ne posjetu, pa zivi uz njegovu sesiju.
 *
 * NEPOZNATI KLJUCEVI ZAPISA SE CUVAJU: pisac spaja, ne prepisuje, pa kasniji zadatak (Z34, Z36)
 * moze dodati svoje polje bez da ga ulaz pri sljedecem upisu izbrise.
 */

import PLATE_INDEX from '../../data/coverage/unit-kratice.json';
import { workTypeFromSlug } from '../title-pages/level-slugs';
import { safeStorageGet, safeStorageSet, STORAGE_KEYS } from './browser-storage';
import { danaDoRoka, normalizirajRok, ROK_PRAZAN, type RokStanje } from '../routes/intake/deadline-stamp';

/**
 * Sto je korisnik potvrdio na ulazu. `program` postoji samo kad je predodabir dosao iz postavki;
 * potvrda iz `?unit=` linka nosi samo fakultet (i razinu), i `/rad/` je primjenjuje kao potvrdjen
 * FAKULTET, dok studij ostaje na detekciji iz dokumenta.
 */
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
function upisiPolje(kljuc: 'rok' | 'potvrda' | 'rokSesije' | 'potvrdaSesije' | 'napomenaSesije', vrijednost: unknown): boolean {
  const z = zapis();
  if (JSON.stringify(z[kljuc] ?? null) === JSON.stringify(vrijednost ?? null)) return false;
  z[kljuc] = vrijednost;
  safeStorageSet(STORAGE_KEYS.intake, z);
  return true;
}

/** Mapa po id-u sesije iz zapisa; pokvaren ili stari (predz32) oblik daje praznu mapu. */
function mapaSesija(kljuc: 'rokSesije' | 'potvrdaSesije' | 'napomenaSesije'): Record<string, unknown> {
  const v = zapis()[kljuc];
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

export function zapisiRok(rok: RokStanje): boolean {
  return upisiPolje('rok', normalizirajRok(rok));
}

export function zapisiPotvrdu(potvrda: PotvrdaUlaza | null): boolean {
  return upisiPolje('potvrda', potvrda);
}

/**
 * ROK KOJI SE VRACA NA ULAZ. Istekao datum (prije danasnjeg kalendarskog dana) se ne vraca, jer
 * vrata ulaza otvara samo rok: zaboravljen rok proslog rada ne smije sam otvoriti vrata za novi
 * rad. "Još ne znam rok" i rok danas ili kasnije vracaju se kakvi jesu.
 */
export function rokZaPovratak(rok: RokStanje, danas: Date): RokStanje {
  if (rok.neznam || rok.datum === null) return rok;
  const dana = danaDoRoka(rok.datum, danas);
  return dana === null || dana < 0 ? { ...ROK_PRAZAN } : rok;
}

/**
 * Vezuje rok s kojim je rad ubacen za upravo spremljenu sesiju, pa Z34 i Z36 na `/rad/` citaju
 * rok TOG rada. Zapis je MAPA po id-u sesije (nalaz pregleda Z32: prva izvedba je ovo drzala u
 * jednom slotu, pa je sljedeci upload pregazio rok prvog rada), pa `veziRokZaSesiju('s-2', ...)`
 * ne dira rok vec vezan za `'s-1'`. Drugi upis iste vrijednosti za istu sesiju je no-op.
 */
export function veziRokZaSesiju(sesija: string, rok: RokStanje): boolean {
  const r = normalizirajRok(rok);
  const mapa = mapaSesija('rokSesije');
  return upisiPolje('rokSesije', { ...mapa, [sesija]: { datum: r.datum, neznam: r.neznam } });
}

/** Rok rada iz sesije `sesija`; `null` kad rok nije vezan za tu sesiju. */
export function rokZaSesiju(sesija: string): RokStanje | null {
  const v = mapaSesija('rokSesije')[sesija];
  if (typeof v !== 'object' || v === null) return null;
  const z = v as Record<string, unknown>;
  return normalizirajRok({ datum: z.datum, neznam: z.neznam });
}

/**
 * Vezuje zivu potvrdu za upravo spremljenu sesiju. Bez potvrde nema sto vezati. Upisuje na DVA
 * mjesta: u jedini "tekuci" slot `potvrda` (postojeci ugovor koji `/rad/` cita preko
 * `procitajIzborUlaza`, CLAUDE.md izmjena samo ovog modula) I u mapu `potvrdaSesije` po id-u
 * sesije (`potvrdaZaSesiju`), koja NE gubi ranije vezanu sesiju kad sljedeci klik "Potvrdi" na
 * ulazu prepiše tekuci slot za drugi rad.
 */
export function veziPotvrduZaSesiju(sesija: string): boolean {
  const { potvrda } = procitajIzborUlaza();
  if (!potvrda) return false;
  const vezano = { ...potvrda, sesija };
  const mapa = mapaSesija('potvrdaSesije');
  const upisanoUMapu = upisiPolje('potvrdaSesije', { ...mapa, [sesija]: vezano });
  const upisanoUSlot = zapisiPotvrdu(vezano);
  return upisanoUMapu || upisanoUSlot;
}

/**
 * Potvrda vezana za sesiju `sesija`, iz mape `potvrdaSesije`; NE ovisi o tome je li poslije
 * potvrdjen jos jedan rad (za razliku od tekuceg slota `procitajIzborUlaza().potvrda`, koji
 * pregazi sljedeci klik "Potvrdi"). `null` kad potvrda nije vezana za tu sesiju.
 */
export function potvrdaZaSesiju(sesija: string): PotvrdaUlaza | null {
  return normalizirajPotvrdu(mapaSesija('potvrdaSesije')[sesija]);
}

/** Odluka o napomeni o drugom prepoznatom fakultetu (`src/ui/confirmed-faculty.ts`). */
interface OdlukaNapomeneSesije {
  odluka: 'zadrzi' | 'prebaci';
  prepoznato: string;
}

/**
 * Pamti odluku o napomeni za sesiju `sesija`, u mapi po id-u sesije, pa odluka jednog rada ne
 * gazi odluku drugog. Drugi upis iste odluke za istu sesiju je no-op.
 */
export function zapisiOdlukuNapomene(sesija: string, odluka: OdlukaNapomeneSesije): boolean {
  const mapa = mapaSesija('napomenaSesije');
  return upisiPolje('napomenaSesije', { ...mapa, [sesija]: { odluka: odluka.odluka, prepoznato: odluka.prepoznato } });
}

/** Odluka o napomeni za sesiju `sesija`; `null` kad je nema ili je zapis pokvaren. */
export function odlukaNapomeneZaSesiju(sesija: string): OdlukaNapomeneSesije | null {
  const v = mapaSesija('napomenaSesije')[sesija];
  if (typeof v !== 'object' || v === null) return null;
  const z = v as Record<string, unknown>;
  const prepoznato = tekstIli(z.prepoznato);
  if (!prepoznato || (z.odluka !== 'zadrzi' && z.odluka !== 'prebaci')) return null;
  return { odluka: z.odluka, prepoznato };
}

/**
 * PREDODABIR KARTICE FAKULTETA, istim prvenstvom kao `/rad/` (`src/ui/selection-entry.ts`):
 * izricit `?unit=` link pobjeduje zapamcen odabir. Izvor natpisa je isti kao plocica u traci
 * (`data/coverage/unit-kratice.json` i `lekta.preferences.v2`), pa kartica i traka ne mogu
 * tvrditi razlicit fakultet.
 *
 * STUDIJ SE NAVODI SAMO IZ POSTAVKI. Kad fakultet dolazi iz linka, `/rad/` ga primijeni kao
 * potvrdjen fakultet, a studij prepoznaje iz dokumenta, pa bi kartica sa studijem iz postavki
 * obecavala nesto sto odrediste nece primijeniti.
 *
 * Nepoznata jedinica (nema je u indeksu) nije predodabir: vraca se `null`, a kartica kaze da ce
 * fakultet biti prepoznat iz rada, umjesto da pogadja.
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
 * SPREMNOST ZA UBACIVANJE: dokument se prima odmah. Rok i fakultet su korisni kontekst, ali nisu
 * preduvjet za prvu vrijednost proizvoda. Fakultet se bez potvrde prepoznaje iz dokumenta na
 * `/rad/`, a prazan rok ostaje prazan i korisnik ga može dodati kasnije.
 *
 * Ovaj mali adapter ostaje između kontrolera i UI-ja da se pravilo "rok nije gate" može
 * regresijski testirati na jednom mjestu i da ga buduća promjena obrasca ne uvede natrag.
 */
const NATPIS_SPREMNO = 'ili ispusti dokument ovdje';

export function spremnostUlaza(_stanje: { rok: RokStanje }): { spremno: boolean; natpis: string } {
  return { spremno: true, natpis: NATPIS_SPREMNO };
}

/**
 * SMIJE LI `/rad/` PRIMIJENITI POTVRDU S ULAZA, u bilo kojem obliku (cijeli profil ili samo
 * fakultet). Obje stvari moraju vrijediti:
 *   1. potvrda je vezana za OVU sesiju (ne za neki drugi dokument iz proslog posjeta);
 *   2. sesija nema vlastiti potvrdjen profil (njegova obnova je jaca i ide svojim putem).
 *
 * Potvrda BEZ studija (fakultet iz `?unit=` linka) vrijedi: student je izricito potvrdio fakultet,
 * pa ga `/rad/` ne smije pitati ponovo ni dopustiti detekciji da ga promijeni. Koliko se od potvrde
 * primjenjuje, odlucuje `potvrdaNosiCijeliProfil`.
 */
export function potvrdaVrijediZaSesiju(
  potvrda: PotvrdaUlaza | null,
  sesija: { id: string; imaProfil: boolean },
): potvrda is PotvrdaUlaza {
  if (!potvrda || sesija.imaProfil) return false;
  return potvrda.sesija === sesija.id;
}

/**
 * NOSI LI POTVRDA CIJELI PROFIL: studij je potvrdjen I obrazac na `/rad/` nakon obnove postavki i
 * linka pokazuje ISTI fakultet, studij i razinu. Samo tada se potvrda primjenjuje kao potvrdjen
 * PROFIL. Inace se primjenjuje samo kao potvrdjen FAKULTET, a studij ostaje na detekciji: potvrda
 * bez studija oznacila bi kao potvrdjen abecedni fallback izbornika, tocno slucaj koji
 * `renderAnalyzeSummary` zove nepouzdanim.
 */
export function potvrdaNosiCijeliProfil(
  potvrda: PotvrdaUlaza,
  obrazac: { unit: string; program: string; workType: string },
): boolean {
  if (!potvrda.program) return false;
  return potvrda.unit === obrazac.unit
    && potvrda.program === obrazac.program
    && (potvrda.workType ?? '') === obrazac.workType;
}

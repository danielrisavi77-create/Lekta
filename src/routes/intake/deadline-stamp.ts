/**
 * ROK PREDAJE NA ULAZU (Z32): racun dana i tekst malog pecata na listu.
 *
 * Cist modul, bez DOM-a i bez pohrane, po uzoru na `list-number.ts`: tri slucaja koja se lako
 * pobrkaju (rok danas, rok prosao, rok za 21 dan) mjere se izravno, bez preglednika.
 *
 * OBLIK PECATA JE IZ ALIGNMENT.md Z32 ("Rok 15. 10. · 22 dana"), NE iz predloska. Predlozak
 * `IntakeLive.dc.html` upisuje i godinu i rijec "jos" ("Rok 15. 10. 2026. · jos 22 dana"), a
 * nalog Z32 i dizajn-dokument oba navode kraci oblik; dva izvora koja se slazu imaju prednost pred
 * jednim. Rubne rijeci "danas" i "prošao" su doslovno iz predloska, jer nalog za njih nema oblik.
 *
 * DANI SE BROJE PO KALENDARU, NE PO SATIMA. Razlika se racuna nad `Date.UTC(godina, mjesec, dan)`
 * obaju datuma, pa je uvijek cijeli broj: prijelaz na ljetno vrijeme (dan od 23 ili 25 sati) ne
 * moze dati 21,96 dana koje bi zaokruzivanje pretvorilo u krivi broj. "Danas" je lokalni datum
 * uredjaja, isti koji korisnik vidi na satu; rok iz `<input type="date">` je vec lokalni datum.
 */

/** Stanje roka onako kako ga daje pribor uz list. */
export interface RokStanje {
  /** `YYYY-MM-DD` iz polja datuma, ili `null` kad datum nije upisan. */
  datum: string | null;
  /** Kvacica "Još ne znam rok". */
  neznam: boolean;
}

export const ROK_PRAZAN: RokStanje = Object.freeze({ datum: null, neznam: false });

/** Tekst pecata kad je korisnik oznacio da rok jos ne zna (predlozak, doslovno). */
export const PECAT_ROK_NIJE_ZADAN = 'Rok nije zadan';

const ISO_DATUM = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAN_MS = 86_400_000;

/**
 * Razlaze `YYYY-MM-DD` u stvaran kalendarski datum. `2026-02-30` i `2026-13-01` nisu datumi, pa
 * vracaju `null`, umjesto da ih `Date` tiho prelije u ozujak ili sljedecu godinu.
 */
export function razloziDatum(iso: string): { godina: number; mjesec: number; dan: number } | null {
  const m = ISO_DATUM.exec(iso);
  if (!m) return null;
  const godina = Number(m[1]);
  const mjesec = Number(m[2]);
  const dan = Number(m[3]);
  const provjera = new Date(Date.UTC(godina, mjesec - 1, dan));
  if (provjera.getUTCFullYear() !== godina || provjera.getUTCMonth() !== mjesec - 1 || provjera.getUTCDate() !== dan) {
    return null;
  }
  return { godina, mjesec, dan };
}

/**
 * Koliko kalendarskih dana ima od `danas` do roka. Nula je rok danas, negativno je rok koji je
 * prosao. `null` kad rok nije valjan datum.
 */
export function danaDoRoka(rokIso: string, danas: Date): number | null {
  const rok = razloziDatum(rokIso);
  if (!rok) return null;
  const odRoka = Date.UTC(rok.godina, rok.mjesec - 1, rok.dan);
  const odDanas = Date.UTC(danas.getFullYear(), danas.getMonth(), danas.getDate());
  return Math.round((odRoka - odDanas) / DAN_MS);
}

/** "1 dan", "21 dan", ali "11 dana", "22 dana": hrvatska sklonidba uz broj. */
export function daniRijecju(n: number): string {
  const zadnja = Math.abs(n) % 10;
  const zadnjeDvije = Math.abs(n) % 100;
  return `${n} ${zadnja === 1 && zadnjeDvije !== 11 ? 'dan' : 'dana'}`;
}

/**
 * Tekst malog pecata roka na listu, ili `null` kad o roku jos nista nije receno (tada pecata nema).
 *
 * "Još ne znam rok" pobjeduje upisan datum: kvacica je izricit izbor, a polje datuma je uz nju
 * onemoguceno, pa bi zaostali datum bio tvrdnja koju korisnik vise ne daje.
 */
export function pecatRoka(stanje: RokStanje, danas: Date): string | null {
  if (stanje.neznam) return PECAT_ROK_NIJE_ZADAN;
  if (!stanje.datum) return null;
  const rok = razloziDatum(stanje.datum);
  const dana = danaDoRoka(stanje.datum, danas);
  if (!rok || dana === null) return null;
  const kada = dana < 0 ? 'prošao' : dana === 0 ? 'danas' : daniRijecju(dana);
  return `Rok ${rok.dan}. ${rok.mjesec}. · ${kada}`;
}

/** Je li o roku odluceno: upisan valjan datum ILI izricito "Još ne znam rok". */
export function rokOdlucen(stanje: RokStanje): boolean {
  if (stanje.neznam) return true;
  return stanje.datum !== null && razloziDatum(stanje.datum) !== null;
}

/**
 * Stanje roka iz nepouzdanog izvora (pohrana je tudji prostor). Sve sto nije ocekivani oblik
 * postaje prazno stanje, nikad iznimka.
 */
export function normalizirajRok(vrijednost: unknown): RokStanje {
  if (typeof vrijednost !== 'object' || vrijednost === null) return { ...ROK_PRAZAN };
  const zapis = vrijednost as Record<string, unknown>;
  const neznam = zapis.neznam === true;
  const datum = typeof zapis.datum === 'string' && razloziDatum(zapis.datum) ? zapis.datum : null;
  return { datum: neznam ? null : datum, neznam };
}

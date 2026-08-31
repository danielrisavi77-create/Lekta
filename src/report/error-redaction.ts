// Redakcija klijentskih gresaka prije slanja (audit P1-28).
//
// ZASTO POSTOJI. `errorEndpoint` je bio prazan, pa greske koje se dogadjaju SAMO korisnicima nikad
// nisu stizale timu. Ali ukljuciti sabirnicu gresaka nije bezopasno: poruka i stack su SLOBODAN
// TEKST, za razliku od analitike gdje allowlist kljuceva (`sanitizeEventData`) rjesava sve. U
// gresku lako upadne ime datoteke ("Ivan_Horvat_diplomski.docx"), e-mail, token iz URL-a ili
// odlomak rada koji je netko ugurao u poruku iznimke.
//
// Tvrdo pravilo projekta je da sadrzaj rada NIKAD ne napusta preglednik osim za popravak. Zato se
// tekst ovdje REDAKTIRA, a ne samo skracuje.
//
// Modul je cist i izomorfan: koristi ga i klijent prije slanja i Edge funkcija pri primitku. To je
// obrana u dubinu, isti obrazac koji `analytics-event` vec primjenjuje na allowlist ("servis NIKAD
// ne vjeruje klijentu"): izravan POST mimo aplikacije prolazi kroz istu redakciju.

/** Gornje granice. Duga poruka je i sama rizik: sto je duza, to je vjerojatnije da nosi sadrzaj. */
export const ERROR_MESSAGE_MAX = 500;
export const ERROR_STACK_MAX = 2000;

/**
 * Uzorci koji se uklanjaju. Redoslijed je bitan: siri uzorci idu PRIJE uzih, inace uzi pojede dio
 * teksta i siri ga vise ne prepozna.
 *
 * Namjerno NE pokusavamo prepoznati "recenicu iz rada": to se ne da pouzdano, a lazni osjecaj
 * sigurnosti je gori od jasne granice. Umjesto toga se oslanjamo na ono sto JEST prepoznatljivo
 * (identifikatori, imena datoteka, tajne) i na tvrdu gornju granicu duljine.
 */
const REDAKCIJE: Array<{ re: RegExp; sa: string }> = [
  // Tajne prve: token u zaglavlju ili upitu ne smije prezivjeti ni u kojem obliku.
  { re: /\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, sa: 'Bearer <token>' },
  { re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]*/g, sa: '<jwt>' },
  { re: /\b(apikey|api_key|access_token|refresh_token|token|password|lozinka)=[^&\s"']+/gi, sa: '$1=<redigirano>' },
  // E-mail prije URL-a: adresa se inace moze sakriti u mailto: obliku.
  { re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, sa: '<email>' },
  // Ime datoteke je najcesci nacin na koji ime studenta procuri u poruku.
  { re: /[^\s"'/\\]+\.(docx|doc|pdf|odt|rtf|txt)\b/gi, sa: '<datoteka>' },
  // Upit u URL-u redovito nosi identifikatore; sama putanja je korisna i ostaje.
  { re: /(https?:\/\/[^\s"']+?)\?[^\s"']*/g, sa: '$1?<upit>' },
  // UUID: moze biti user_id ili job_id. Korelacija ide preko incidentId, ne preko ovoga.
  { re: /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, sa: '<uuid>' },
  // Dugi niz znamenki: OIB (11), JMBAG (10), broj kartice. Kratke brojeve (redak, stupac,
  // velicina) namjerno pustamo, jer su za dijagnostiku vrijedni.
  { re: /\b\d{9,}\b/g, sa: '<broj>' },
  // Dug base64 blok je gotovo sigurno sadrzaj dokumenta ili slike.
  { re: /\b[A-Za-z0-9+/]{80,}={0,2}/g, sa: '<blob>' },
];

/**
 * Redaktiraj slobodan tekst greske i skrati ga na granicu.
 *
 * Skracivanje ide POSLIJE redakcije: obrnutim redom bi rez mogao raspoloviti npr. JWT i ostaviti
 * njegovu prvu polovicu neprepoznatom, pa neredigiranom.
 */
export function redactErrorText(input: unknown, max: number): string {
  let tekst = typeof input === 'string' ? input : String(input ?? '');
  for (const { re, sa } of REDAKCIJE) tekst = tekst.replace(re, sa);
  // Kontrolni znakovi ne nose dijagnostiku, a lome zapis i prikaz.
  tekst = tekst.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ');
  tekst = tekst.replace(/[ \t]+/g, ' ').trim();
  return tekst.length > max ? `${tekst.slice(0, max)}…` : tekst;
}

export interface ErrorReportInput {
  kind?: unknown;
  message?: unknown;
  stack?: unknown;
  version?: unknown;
  path?: unknown;
  feature?: unknown;
  incidentId?: unknown;
  timestamp?: unknown;
}

export interface ErrorReport {
  kind: string;
  message: string;
  stack: string;
  version: string;
  path: string;
  feature: string;
  incidentId: string;
  timestamp: string;
}

/** Vrste koje primamo. Nepoznata se svodi na 'error', ne odbija: dijagnostika je vrijednija. */
const VRSTE = new Set(['error', 'unhandledrejection', 'manual']);

/** Znacajka u kojoj se greska dogodila; slobodan tekst ovdje ne treba, pa je allowlistana. */
const ZNACAJKE = new Set(['analiza', 'popravak', 'preflight', 'naplata', 'prijava', 'izvjestaj', 'nepoznato']);

/**
 * Slozi zapis koji SMIJE otici s uredjaja.
 *
 * Nema polja izvan ovog oblika: sto god posiljatelj doda, ovdje otpada. Time je i izravan POST
 * mimo aplikacije ogranicen na isto.
 */
export function buildErrorReport(input: ErrorReportInput, incidentId: string, now: string): ErrorReport {
  const kind = String(input.kind ?? 'error');
  const feature = String(input.feature ?? 'nepoznato');
  return {
    kind: VRSTE.has(kind) ? kind : 'error',
    message: redactErrorText(input.message, ERROR_MESSAGE_MAX),
    stack: redactErrorText(input.stack, ERROR_STACK_MAX),
    // Verzija i putanja su nase vlastite vrijednosti, ali dolaze s klijenta pa prolaze isti rez.
    version: redactErrorText(input.version, 40),
    // SAMO putanja, nikad upit ni fragment: ondje zavrsavaju tokeni iz magic linkova.
    path: redactErrorText(String(input.path ?? '/').split(/[?#]/)[0], 200),
    feature: ZNACAJKE.has(feature) ? feature : 'nepoznato',
    incidentId,
    timestamp: now,
  };
}

/** Oblik incident ID-a: kratak, izgovoriv preko telefona, bez osobnog sadrzaja. */
export const INCIDENT_ID_RE = /^LEK-[0-9A-Z]{8}$/;

/** Generiraj incident ID. `rnd` je injektabilan da test bude determinističan. */
export function makeIncidentId(rnd: () => number = Math.random): string {
  const abeceda = '0123456789ABCDEFGHJKMNPQRSTUVWXYZ'; // bez I, L, O: brkaju se s 1 i 0
  let out = '';
  for (let i = 0; i < 8; i++) out += abeceda[Math.floor(rnd() * abeceda.length)] ?? '0';
  return `LEK-${out}`;
}

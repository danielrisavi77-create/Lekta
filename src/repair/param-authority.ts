/**
 * SERVERSKI AUTORITET NAD CILJANOM VRIJEDNOSCU POPRAVKA.
 *
 * Zasto postoji: do 2026-08-16 je klijent slao `{fixerId, ruleId, params}`, a server je provjeravao
 * SAMO je li fixer poznat i ziv te sanirao parametre tipski i rasponski (`runFixer` u
 * apply-fixers.ts). Sto je ciljana vrijednost - koji font, koje margine, koji prored - dolazilo je
 * iskljucivo iz klijenta. Rucno skrojen zahtjev mogao je zatraziti margine koje nijedan profil ne
 * propisuje i server bi ih uredno primijenio.
 *
 * To nije klasicna ranjivost (korisnik mijenja vlastiti dokument), ali JEST rupa u integritetu
 * proizvoda: dok server sam ne izvodi vrijednost iz profila, tvrdnja "Lekta popravlja prema
 * pravilima tvog fakulteta" nije nesto sto server moze jamciti, nego nesto cemu vjeruje na rijec.
 *
 * Kako radi: `data/generated/repair-params-by-profile.json` je PECENA projekcija istog recepta iz
 * kojeg nastaje docs/REPAIR_RECIPE.md (src/repair/recipe.ts), dakle izvedena iz istih funkcija koje
 * se stvarno izvrsavaju u pregledniku. Server za `(profileRef, ruleId)` uzme SVOJU vrijednost i
 * klijentovu ignorira; kad zapisa nema (univerzalna higijena bez profila, npr. prazni odlomci ili
 * hrvatska tipografija), ostaje dosadasnji sanirani put, ali se to izricito oznaci u odgovoru.
 *
 * Bez tezih ovisnosti (samo JSON), da se moze uvesti i u Deno Edge funkciju.
 */
import authorityRaw from '../../data/generated/repair-params-by-profile.json' with { type: 'json' };

/** Jedan pecen zapis: fixer i njegovi kanonski parametri za to pravilo. */
export interface AuthoritativeParams {
  /** fixerId za koji vrijedi vrijednost; zahtjev s drugim fixerom se NE prepisuje. */
  f: string;
  /** Kanonski parametri izvedeni iz profila. */
  p: Record<string, unknown>;
}

/** profileId -> ruleId -> kanonski parametri. */
export type ParamAuthorityMap = Record<string, Record<string, AuthoritativeParams>>;

export const PARAM_AUTHORITY = authorityRaw as unknown as ParamAuthorityMap;

/** Odakle je stvarno dosla vrijednost primijenjenog popravka. */
export type ParamSource = 'profile' | 'client';

export interface ResolvedParams {
  params: Record<string, unknown>;
  source: ParamSource;
}

/**
 * Kanonski parametri za `(profileRef, ruleId, fixerId)`, ili klijentovi kad zapisa nema.
 *
 * `fixerId` se namjerno provjerava: zapis vrijedi za tocno jedan fixer, pa zahtjev koji tvrdi drugi
 * fixer za isti ruleId ne smije pokupiti tudju vrijednost.
 */
export function resolveParams(
  profileRef: string | null | undefined,
  ruleId: string,
  fixerId: string,
  clientParams: Record<string, unknown>,
): ResolvedParams {
  const forProfile = profileRef ? PARAM_AUTHORITY[profileRef] : undefined;
  const entry = forProfile ? forProfile[ruleId] : undefined;
  if (!entry || entry.f !== fixerId) return { params: clientParams, source: 'client' };
  // Klijentovi parametri se NE spajaju preko profilnih: spajanje bi vratilo upravo rupu koju ovo
  // zatvara (klijent bi dopisao kljuc koji profil ne propisuje).
  return { params: { ...entry.p }, source: 'profile' };
}

/** Ima li ovaj profil ijedno pravilo s pecenom vrijednoscu (za dijagnostiku i testove). */
export function hasParamAuthority(profileRef: string | null | undefined): boolean {
  return !!profileRef && !!PARAM_AUTHORITY[profileRef];
}

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
  /**
   * Z36 krug 4: akcije koje je server uklonio iz zahtjeva (danas samo 'add' sinkronizacije bez dozvole
   * profila). Edge funkcija ih vraca u odgovoru (`skippedActions` po ruleId), pa uklanjanje nije tiho.
   * Izostaje kad nista nije uklonjeno.
   */
  skippedActions?: string[];
}

const CITATION_SYNC_FIXER = 'citation-bibliography-sync-fixer';
const SKIPPED_NO_PERMISSION = 'zapis literature nije umetnut: profil fakulteta ne dopusta umetanje zapisa';

/** Z36: zahtjev sinkronizacije bez umetanja zapisa literature ('add') i bez veza na te zapise. */
function withoutEntryInsertion(params: Record<string, unknown>): Record<string, unknown> {
  if (!Array.isArray(params.entries)) return params;
  const isAdd = (entry: unknown) => !!entry && typeof entry === 'object' && (entry as Record<string, unknown>).action === 'add';
  const added = new Set(params.entries.filter(isAdd).map((entry) => (entry as Record<string, unknown>).id));
  if (!added.size) return params;
  const mappings = Array.isArray(params.mappings)
    ? params.mappings.filter((mapping) => !(mapping && typeof mapping === 'object' && added.has((mapping as Record<string, unknown>).bibliographyEntryId)))
    : params.mappings;
  return { ...params, entries: params.entries.filter((entry) => !isAdd(entry)), mappings };
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
  authority: ParamAuthorityMap = PARAM_AUTHORITY,
): ResolvedParams {
  const forProfile = profileRef ? authority[profileRef] : undefined;
  const entry = forProfile ? forProfile[ruleId] : undefined;
  if (fixerId === CITATION_SYNC_FIXER) {
    // Z36: sinkronizacija nosi klijentove potvrde (citati, veze), pa params ostaju klijentovi, ali
    // DOZVOLU umetanja zapisa literature daje samo peceni profil. Bez nje se svaki 'add' i njegova
    // veza uklanjaju, a ostatak zahtjeva prolazi. Zastavicu iz klijentovih params server ne cita.
    const allowed = !!entry && entry.f === fixerId && entry.p.allowMissingEntryInsertion === true;
    if (allowed) return { params: clientParams, source: 'client' };
    const stripped = withoutEntryInsertion(clientParams);
    // Krug 4: uklonjeni 'add' se javlja u odgovoru (withoutEntryInsertion vraca isti objekt kad nema sto ukloniti).
    return { params: stripped, source: 'client', ...(stripped !== clientParams ? { skippedActions: [SKIPPED_NO_PERMISSION] } : {}) };
  }
  if (!entry || entry.f !== fixerId) return { params: clientParams, source: 'client' };
  // Klijentovi parametri se NE spajaju preko profilnih: spajanje bi vratilo upravo rupu koju ovo
  // zatvara (klijent bi dopisao kljuc koji profil ne propisuje).
  return { params: { ...entry.p }, source: 'profile' };
}

/** Ima li ovaj profil ijedno pravilo s pecenom vrijednoscu (za dijagnostiku i testove). */
export function hasParamAuthority(profileRef: string | null | undefined): boolean {
  return !!profileRef && !!PARAM_AUTHORITY[profileRef];
}

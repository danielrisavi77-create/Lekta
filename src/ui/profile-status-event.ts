/**
 * Status profila za telemetriju koraka lijevka (`profile_completed`).
 *
 * Zasto postoji kao zaseban, cist modul: listener na `#stepToAnalyze` bio je SINKRON i citao
 * `currentProfile()` bez garda. Ta funkcija BACA kad pravila profila jos nisu ucitana (brana u
 * `currentProfile`), a iznimka u jednom listeneru ne zaustavlja ostale, pa je carobnjak svejedno
 * isao dalje (korak mijenja drugi listener) dok je dogadjaj tiho nestajao. Nista to nije
 * prijavljivalo, i nijedan test nije pokrivao `profile_completed`.
 *
 * PRAVILO: dogadjaj se salje UVIJEK, a status nosi istinu o tome sto se u tom trenutku zna.
 * `rules-unavailable` NIJE isto sto i `generic`: prvo znaci da profil nije bio citljiv, drugo da
 * je citljiv i da je opci. Spojiti ih znacilo bi telemetriji reci da su svi ti korisnici bili na
 * opcoj provjeri, sto nije izmjereno nego pretpostavljeno.
 */

/** Status kad se profil uopce nije mogao procitati. Namjerno razlicit od 'generic'. */
export const PROFILE_STATUS_UNREADABLE = 'rules-unavailable';

/** Status kad je profil citljiv, ali nema vlastiti kljuc statusa. */
export const PROFILE_STATUS_GENERIC = 'generic';

/**
 * Procitaj status profila bez ikakve mogucnosti da poziv baci.
 * @param readProfile funkcija koja vraca tekuci profil; smije baciti
 */
export function profileStatusForEvent(readProfile: () => { statusKey?: unknown } | null | undefined): string {
  let profile: { statusKey?: unknown } | null | undefined;
  try {
    profile = readProfile();
  } catch {
    return PROFILE_STATUS_UNREADABLE;
  }
  if (!profile) return PROFILE_STATUS_UNREADABLE;
  const key = profile.statusKey;
  return typeof key === 'string' && key.trim() ? key : PROFILE_STATUS_GENERIC;
}

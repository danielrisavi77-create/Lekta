/**
 * Privremena napomena uz ocjenu nakon zaostravanja provjera 2026-08-20.
 *
 * Zasto postoji: tog je dana ispravljeno da provjere `Sadrzaj dokumenta` i `Brojevi stranica`
 * bodove daju samo za STVARNO Word polje. Dotad je bodove nosio goli naslov "Sadrzaj", odnosno
 * bilo koje pojavljivanje niza "PAGE" u XML-u dokumenta, ukljucujuci obican prijelom stranice
 * (`<w:br w:type="page"/>` zadovoljava `\bPAGE\b`, jer navodnici nisu znakovi rijeci). Uz to
 * neocitana vrijednost (font, prored, margine) vise ne nosi pune bodove nego izlazi iz ocjene.
 *
 * Posljedica je da isti, NEPROMIJENJEN dokument dobiva nizu ocjenu nego u ranijoj provjeri
 * (mjereno na stvarnim radovima: 94 na 89, 93 na 84, 100 na 92). Ranija je ocjena bila
 * previsoka, ali korisnik koji ponovno ucita isti rad to bez objasnjenja cita kao kvar Lekte.
 *
 * Namjerno je vremenski ogranicena i sama se gasi: napomena je korisna dok postoje korisnici koji
 * pamte staru brojku, a poslije je samo sum. Bez `localStorage` i bez gumba za odbacivanje, pa
 * nema stanja koje bi se moglo raspariti izmedju uredjaja.
 */

/** Dan kad su provjere postale stroze (informativno, koristi se u tekstu napomene). */
export const SCORING_CHANGE_DATE = '20. kolovoza 2026.';

/** Prvi dan kad se napomena VISE NE prikazuje (ISO, UTC ponoc). */
export const SCORING_CHANGE_NOTE_UNTIL = '2026-11-01T00:00:00Z';

/** Tekst napomene; jedna recenica, bez isprike i bez obecanja. */
export const SCORING_CHANGE_NOTE_TEXT =
  `Od ${SCORING_CHANGE_DATE} provjere sadržaja i brojeva stranica traže stvarno Word polje, ` +
  'a ne samo naslov "Sadržaj" ili prijelom stranice, pa isti dokument može dobiti nekoliko bodova ' +
  'manje nego u ranijoj provjeri.';

/**
 * Napomena koju treba prikazati uz ocjenu, ili `null` kad je razdoblje proslo.
 *
 * `now` je parametar (a ne `Date.now()` u tijelu) da test moze dokazati i prikazivanje i gasenje
 * bez diranja sistemskog sata.
 */
export function scoringChangeNote(now: number | Date = Date.now()): string | null {
  const at = now instanceof Date ? now.getTime() : now;
  if (!Number.isFinite(at)) return null;
  return at < Date.parse(SCORING_CHANGE_NOTE_UNTIL) ? SCORING_CHANGE_NOTE_TEXT : null;
}

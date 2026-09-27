/**
 * POTVRDA FAKULTETA S ULAZA `/` NA `/rad/` (ALIGNMENT Z32 tocka 7).
 *
 * Z32 trazi da student fakultet potvrdi PRIJE ubacivanja, uz list. Da ga `/rad/` ne bi pitao
 * ponovo, potvrda mora stici do postojeceg puta za potvrdjen profil sesije (korak C4,
 * `confirmed-profile.ts`), a ne do novog, paralelnog mehanizma.
 *
 * ZASTO ULAZ NE PISE SNIMKU PROFILA U SESIJU SAM: snimka nosi `profileDefinitionId`, a njega daje
 * tek registar profila (`findVerifiedDefinition`), koji ulaz namjerno ne uvozi
 * (`tests/intake-entry-boundary.test.ts`). Snimka bez tog id-a bila bi odbacena
 * (`sanitizeProfile`), a pogodjen id bi pri obnovi dao `mismatch` i obavijest o promijenjenim
 * pravilima. Zato ulaz u pohranu upisuje SAMO sto je korisnik vidio i potvrdio, vezano za id
 * sesije (`src/shared/intake-choice.ts`), a ovdje, gdje registar postoji, potvrda prolazi ISTIM
 * putem kao obnova sesije: `applyConfirmedProfileSelection` (profil potvrdjen, detekcija iz
 * dokumenta ga ne gazi) i `onConfirmed` (snimka se zapise uz sesiju, pa ponovno ucitavanje vise
 * ne ovisi o ovom zapisu).
 *
 * KADA SE NE PRIMJENJUJE (i `/rad/` radi tocno kao prije Z32), vidi `potvrdaVrijediZaSesiju`:
 * potvrda za drugu sesiju, potvrda bez studija (fakultet iz `?unit=` linka), obrazac koji nakon
 * obnove postavki pokazuje nesto drugo, ili sesija koja vec ima vlastiti potvrdjen profil.
 */
import { potvrdaVrijediZaSesiju, procitajIzborUlaza, type IzborUlaza } from '../../shared/intake-choice';
import type { ProfileConfirmed } from '../../ui/profile-confirmed-events';
import type { SelectionIds } from '../../ui/profile-selection-ids';

export type IntakeConfirmationOutcome = 'none' | 'applied' | 'unresolved';

export interface IntakeConfirmationDeps {
  sessionId: string;
  sessionHasProfile: boolean;
  /** Tekuci odabir iz obrasca (`readSelectionIds(document)`), POSLIJE obnove postavki i linka. */
  readForm: () => SelectionIds;
  /** `applyConfirmedProfileSelection` iz `app.ts`: vraca razrijeseni id profila ili `null`. */
  apply: (ids: Record<string, string>) => string | null;
  /** `profil.onConfirmed`: snimka ide pisacu sesije. */
  confirm: (event: ProfileConfirmed) => void;
  read?: () => IzborUlaza;
}

/**
 * Primijeni potvrdu s ulaza ako vrijedi za ovu sesiju.
 *
 *   none        nista nije primijenjeno; `/rad/` radi kao i prije
 *   applied     profil je potvrdjen i snimka je predana pisacu sesije
 *   unresolved  korisnikov izbor je primijenjen i potvrdjen, ali ne daje verificiran profil
 *               (npr. fakultet u istrazivanju), pa se snimka ne pise; isto kao rucna potvrda
 */
export function primijeniPotvrduUlaza(deps: IntakeConfirmationDeps): IntakeConfirmationOutcome {
  const { potvrda } = (deps.read ?? procitajIzborUlaza)();
  let obrazac: SelectionIds;
  try { obrazac = deps.readForm(); } catch { return 'none'; }
  if (!potvrda || !potvrdaVrijediZaSesiju(potvrda, { id: deps.sessionId, imaProfil: deps.sessionHasProfile }, obrazac)) {
    return 'none';
  }
  const ids = Object.fromEntries(Object.entries(obrazac)) as Record<string, string>;
  let definicija: string | null;
  try { definicija = deps.apply(ids); } catch { return 'none'; }
  if (!definicija) return 'unresolved';
  deps.confirm({ profileDefinitionId: definicija, selectionIds: obrazac, confirmedAt: potvrda.at });
  return 'applied';
}

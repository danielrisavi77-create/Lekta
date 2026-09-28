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
 * DVA OBLIKA POTVRDE (Z32 popravak, odluka vlasnika 2026-09-27):
 *
 *   cijeli profil  potvrda nosi studij i obrazac nakon obnove postavki pokazuje isti fakultet,
 *                  studij i razinu (`potvrdaNosiCijeliProfil`): put C4, kao gore.
 *   samo fakultet  svaka druga vazeca potvrda, npr. fakultet iz `?unit=` linka bez studija.
 *                  `primijeniFakultetUlaza` (preko `applyFacultyIds` iz `app.ts`) postavi
 *                  ustanovu i fakultet (i razinu iz linka) i zabrani detekciji iz dokumenta da ga promijeni
 *                  (`src/ui/confirmed-faculty.ts`); STUDIJ ostaje na detekciji, jer ga student na
 *                  ulazu nije potvrdio. Snimka profila se ne pise: bez studija nema verificiranog
 *                  profila koji bi se potvrdio.
 *
 * OBA OBLIKA ZAKLJUCAVAJU FAKULTET (nalaz pregleda Codex): `apply` i `applyFaculty` dobivaju i
 * pamcenje odluke o napomeni za OVU sesiju (`pamcenjeOdlukeSesije`), pa `/rad/` napomenu o drugom
 * prepoznatom fakultetu pokaze i uz potvrdjen cijeli profil, a odluku "Zadrži"/"Prebaci" pri
 * ponovnom otvaranju iste sesije postuje umjesto da pita ponovo.
 *
 * PONOVNO OTVARANJE SESIJE S VLASTITIM PROFILOM. Cijeli profil pri prvom otvaranju zapise snimku
 * uz sesiju, pa ga svako sljedece otvaranje obnavlja C4 (`profil.restore`), a ova potvrda se ne
 * primjenjuje ponovo. Bez brave bi C4 detekciju preskocio, pa bi "Prebaci" iz prvog otvaranja
 * poslije ponovnog ucitavanja tiho vratio stari fakultet. Zato sesija koja je nastala iz potvrde s
 * ulaza (`potvrda.sesija` je ova sesija) dobije bravu na fakultet koji obrazac POSLIJE obnove
 * pokazuje (`zakljucajObnovljeno`), s istim pamcenjem odluke: "Zadrži" ostaje tih, "Prebaci" se
 * ponovi. Ishod je `locked`.
 *
 * KADA SE NE PRIMJENJUJE (i `/rad/` radi tocno kao prije Z32: detekcija iz dokumenta, prikaz
 * prepoznatog i mogucnost promjene), vidi `potvrdaVrijediZaSesiju`: nema potvrde, potvrda za
 * drugu sesiju, ili sesija koja vec ima vlastiti potvrdjen profil.
 */
import { ZAGREB_CATALOG } from '../../catalog/catalog-loader';
import {
  odlukaNapomeneZaSesiju, potvrdaNosiCijeliProfil, potvrdaVrijediZaSesiju, potvrdaZaSesiju, procitajIzborUlaza,
  zapisiOdlukuNapomene, type IzborUlaza, type PotvrdaUlaza,
} from '../../shared/intake-choice';
import type { PamcenjeOdluke } from '../../ui/confirmed-faculty';
import type { ProfileConfirmed } from '../../ui/profile-confirmed-events';
import type { SelectionIds } from '../../ui/profile-selection-ids';

export type IntakeConfirmationOutcome = 'none' | 'applied' | 'unresolved' | 'faculty' | 'locked';

export interface IntakeConfirmationDeps {
  sessionId: string;
  sessionHasProfile: boolean;
  /** Tekuci odabir iz obrasca (`readSelectionIds(document)`), POSLIJE obnove postavki i linka. */
  readForm: () => SelectionIds;
  /**
   * `primijeniProfilUlaza` (`src/ui/confirmed-faculty.ts`) nad `applyConfirmedProfileSelection` iz
   * `app.ts`: vraca razrijeseni id profila ili `null` i zakljucava potvrdjeni fakultet.
   */
  apply: (ids: Record<string, string>, pamcenje: PamcenjeOdluke) => string | null;
  /**
   * `primijeniFakultetUlaza` (`src/ui/confirmed-faculty.ts`) nad `applyFacultyIds` iz `app.ts`:
   * postavlja potvrdjen fakultet (ustanovu, jedinicu i razinu, kad je poznata) bez studija i
   * zakljucava ga; `false` kad obrazac tu jedinicu ne prihvati.
   */
  applyFaculty: (ids: Record<string, string>, pamcenje: PamcenjeOdluke) => boolean;
  /**
   * `zakljucajObnovljeniFakultet` (`src/ui/confirmed-faculty.ts`): brava na fakultet iz obrasca
   * nakon obnove vlastitog profila sesije (C4), s pamcenjem odluke za tu sesiju.
   */
  zakljucajObnovljeno?: (pamcenje: PamcenjeOdluke) => void;
  /** `profil.onConfirmed`: snimka ide pisacu sesije. */
  confirm: (event: ProfileConfirmed) => void;
  read?: () => IzborUlaza;
  /** `potvrdaZaSesiju` iz `intake-choice.ts`: potvrda vezana za `sessionId` iz mape po sesiji. */
  readSesiju?: (sessionId: string) => PotvrdaUlaza | null;
}

/**
 * Potvrda za OVU sesiju. Prvo mapa po id-u sesije (`potvrdaZaSesiju`), koja NE gubi ranije vezanu
 * sesiju kad sljedeci klik "Potvrdi" na ulazu prepiše tekuci slot za drugi rad (nalaz pregleda
 * Z32, vidi `intake-choice.ts`). Kad mapa nema zapis, pada na STARI jedini slot
 * (`procitajIzborUlaza().potvrda`), za pohranu iz prije ovog popravka koja jos nema zapis u mapi;
 * koristi ga SAMO ako pripada ovoj sesiji (`potvrdaVrijediZaSesiju` bi ga inace ipak odbio).
 */
function potvrdaZaOvuSesiju(deps: IntakeConfirmationDeps): PotvrdaUlaza | null {
  const izMape = (deps.readSesiju ?? potvrdaZaSesiju)(deps.sessionId);
  if (izMape) return izMape;
  const { potvrda } = (deps.read ?? procitajIzborUlaza)();
  return potvrda && potvrda.sesija === deps.sessionId ? potvrda : null;
}

/** Odluka o napomeni za sesiju `sesija`, kroz sigurne omotace u `intake-choice.ts`. */
function pamcenjeOdlukeSesije(sesija: string): PamcenjeOdluke {
  return {
    procitaj: () => odlukaNapomeneZaSesiju(sesija),
    zapisi: (odluka) => { zapisiOdlukuNapomene(sesija, odluka); },
  };
}

/**
 * Primijeni potvrdu s ulaza ako vrijedi za ovu sesiju.
 *
 *   none        nista nije primijenjeno; `/rad/` radi kao i prije
 *   applied     profil je potvrdjen i snimka je predana pisacu sesije
 *   unresolved  korisnikov izbor je primijenjen i potvrdjen, ali ne daje verificiran profil
 *               (npr. fakultet u istrazivanju), pa se snimka ne pise; isto kao rucna potvrda
 *   faculty     primijenjen je samo potvrdjen fakultet; studij prepoznaje detekcija iz dokumenta
 *   locked      sesija ima vlastiti profil (C4 ga je obnovio), a nastala je iz potvrde s ulaza:
 *               samo brava na fakultet iz obrasca, s pamcenjem odluke o napomeni
 */
export function primijeniPotvrduUlaza(deps: IntakeConfirmationDeps): IntakeConfirmationOutcome {
  const potvrda = potvrdaZaOvuSesiju(deps);
  const izUlazaOveSesije = potvrda !== null && potvrda.sesija === deps.sessionId;
  if (!potvrdaVrijediZaSesiju(potvrda, { id: deps.sessionId, imaProfil: deps.sessionHasProfile })) {
    if (!izUlazaOveSesije || !deps.sessionHasProfile || !deps.zakljucajObnovljeno) return 'none';
    try { deps.zakljucajObnovljeno(pamcenjeOdlukeSesije(deps.sessionId)); } catch { return 'none'; }
    return 'locked';
  }
  let obrazac: SelectionIds;
  try { obrazac = deps.readForm(); } catch { return 'none'; }
  if (potvrdaNosiCijeliProfil(potvrda, obrazac)) {
    const ids = Object.fromEntries(Object.entries(obrazac)) as Record<string, string>;
    let definicija: string | null;
    try { definicija = deps.apply(ids, pamcenjeOdlukeSesije(deps.sessionId)); } catch { return 'none'; }
    if (!definicija) return 'unresolved';
    deps.confirm({ profileDefinitionId: definicija, selectionIds: obrazac, confirmedAt: potvrda.at });
    return 'applied';
  }
  const ids = odabirFakulteta(potvrda);
  if (!ids) return 'none';
  try {
    return deps.applyFaculty(ids, pamcenjeOdlukeSesije(deps.sessionId)) ? 'faculty' : 'none';
  } catch {
    return 'none';
  }
}

/**
 * Odabir za obrazac iz potvrde BEZ studija: ustanova iz kataloga (obrazac bira fakultet unutar
 * ustanove), jedinica i razina kad je poznata. Studija nema namjerno. Jedinica koje nema u
 * katalogu daje `null`: tada se nista ne potvrdjuje.
 */
export function odabirFakulteta(potvrda: Pick<PotvrdaUlaza, 'unit' | 'workType'>): Record<string, string> | null {
  const ustanova = ZAGREB_CATALOG.find((u) => u.units.some((j) => j.id === potvrda.unit));
  if (!ustanova) return null;
  const ids: Record<string, string> = { institution: ustanova.id, unit: potvrda.unit };
  if (potvrda.workType) ids.workType = potvrda.workType;
  return ids;
}

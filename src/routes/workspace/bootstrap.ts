import {
  initialContext, transition, canLinkSession,
  type WorkspaceContext,
} from './workspace-state';
import { parseSessionFragment, type LocalDocumentSessionStore } from '../../session/local-document-session';

/**
 * BOOTSTRAP RADNE POVRSINE (`/rad/`), bez DOM-a i bez montaze.
 *
 * Sav sadrzaj ove datoteke je CIST, pa se svaki ugovor da provjeriti bez preglednika. Ono sto
 * dira DOM zivi u `main.ts`, koji je tanak i samo prosljedjuje ishode odavde.
 *
 * TRI UGOVORA IZ SPECIFIKACIJE, i sto od njih ovdje doista stoji:
 *
 * 1. DEGRADACIJA je potpuna. Kad pohrana nije dostupna (privatni prozor, blokirani kolacici,
 *    preglednik bez IndexedDB-a), rad OSTAJE u kartici i URL ostaje `/rad/`, ali se poveznica na
 *    sesiju NE nudi. Poveznica bi vodila na sesiju koja ne postoji, sto je gore od izostanka
 *    poveznice: korisnik bi povjerovao da mu je rad spremljen.
 *
 * 2. OBNOVA ide do pronalaska sesije. Fragment se cita, istekle se brisu, sesija se dohvaca.
 *    UBACIVANJE dokumenta natrag u analizator ceka `loadAnalyzerDocument` (korak 6 plana), pa
 *    ovdje zavrsava na `restoreFound` i to se KAZE, ne glumi.
 *
 * 3. ZAPIS jos nije ozicen, jer trazi dogadjaj o prihvacenom dokumentu iz analizatora (isti
 *    korak 6). Dok ga nema, `sessionPersisted` ostaje `false`, pa pravilo iz tocke 1 samo od
 *    sebe drzi sucelje postenim: nista se ne nudi.
 *
 * SPREMLJEN VERDIKT JE SAMO PREDMEMORIJA. Kad obnova prodje, intake gate se izvodi PONOVNO nad
 * bajtovima; spremljena ocjena o prihvatljivosti dokumenta nikad nije dokaz, jer su se granice
 * ili pravila u medjuvremenu mogla promijeniti.
 */

export type StorageAvailability =
  | { kind: 'available'; store: LocalDocumentSessionStore }
  | { kind: 'unavailable'; reason: string };

export interface RestoreOutcome {
  context: WorkspaceContext;
  /** Poruka za korisnika; `null` kad nema sto reci. */
  notice: string | null;
  /** Smije li se sesija ponuditi kao poveznica. Nikad `true` bez stvarnog zapisa. */
  offerLink: boolean;
}

const NOTICE_NO_STORAGE =
  'Tvoj preglednik ne dopusta lokalnu pohranu, pa rad ostaje samo u ovoj kartici. '
  + 'Zatvaranje ili osvjezavanje stranice znaci da dokument treba ucitati ponovno.';
const NOTICE_SESSION_GONE =
  'Spremljeni rad vise nije dostupan; sesija je istekla ili je obrisana. Ucitaj dokument ponovno.';

/**
 * Odluci sto se dogadja pri otvaranju rute.
 *
 * @param fragment  `location.hash` kakav jest
 * @param storage   ishod provjere pohrane
 * @param now       trenutak, radi determinisitickog testiranja isteka
 */
export async function openWorkspace(
  fragment: string,
  storage: StorageAvailability,
  now: number = Date.now(),
): Promise<RestoreOutcome> {
  const sessionId = parseSessionFragment(fragment);

  if (storage.kind === 'unavailable') {
    // Rad ostaje u kartici. Fragment se NE cisti: korisnik ga moze imati u povijesti, a brisanje
    // bi izgledalo kao da smo nesto obrisali. Poveznica se ipak ne nudi.
    return { context: initialContext(false), notice: NOTICE_NO_STORAGE, offerLink: false };
  }

  let context = initialContext(Boolean(sessionId));
  if (!sessionId) return { context, notice: null, offerLink: false };

  try {
    // Istekle se brisu PRIJE dohvata: sesija starija od roka ne smije se vratiti ni slucajno.
    await storage.store.deleteExpired(now);
    const session = await storage.store.get(sessionId, now);
    if (!session) {
      return { context: transition(context, 'restoreEmpty'), notice: NOTICE_SESSION_GONE, offerLink: false };
    }
    context = transition(context, 'restoreFound');
    return { context, notice: null, offerLink: canLinkSession(context) };
  } catch {
    // Kvar pohrane nije kvar rada: korisnik nastavlja ispocetka, uz jasnu poruku.
    return { context: transition(context, 'restoreFailed'), notice: NOTICE_SESSION_GONE, offerLink: false };
  }
}

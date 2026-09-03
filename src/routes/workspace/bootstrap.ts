import {
  initialContext, transition, canLinkSession,
  type WorkspaceContext,
} from './workspace-state';
import {
  parseSessionFragment, sessionFragment, createLocalDocumentSession, fileFromLocalDocumentSession,
  type LocalDocumentSessionStore, type LocalDocumentSessionV1,
} from '../../session/local-document-session';

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
  /** Pronadjena sesija, da je pozivatelj moze vratiti u analizator. `null` kad je nema. */
  session: LocalDocumentSessionV1 | null;
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
    return { context: initialContext(false), notice: NOTICE_NO_STORAGE, offerLink: false, session: null };
  }

  let context = initialContext(Boolean(sessionId));
  if (!sessionId) return { context, notice: null, offerLink: false, session: null };

  try {
    // Istekle se brisu PRIJE dohvata: sesija starija od roka ne smije se vratiti ni slucajno.
    await storage.store.deleteExpired(now);
    const session = await storage.store.get(sessionId, now);
    if (!session) {
      return { context: transition(context, 'restoreEmpty'), notice: NOTICE_SESSION_GONE, offerLink: false, session: null };
    }
    context = transition(context, 'restoreFound');
    return { context, notice: null, offerLink: canLinkSession(context), session };
  } catch {
    // Kvar pohrane nije kvar rada: korisnik nastavlja ispocetka, uz jasnu poruku.
    return { context: transition(context, 'restoreFailed'), notice: NOTICE_SESSION_GONE, offerLink: false, session: null };
  }
}


/* ---------------------------------------------------------------------------------------- *
 * ZAPIS I OBNOVA
 * ---------------------------------------------------------------------------------------- */

export type PersistOutcome =
  | { kind: 'persisted'; sessionId: string; fragment: string }
  | { kind: 'skipped'; notice: string }
  | { kind: 'failed'; notice: string };

const NOTICE_PERSIST_FAILED =
  'Rad nije uspjelo spremiti lokalno, pa ostaje samo u ovoj kartici. '
  + 'Analiza radi normalno, ali osvjezavanje stranice znaci ponovno ucitavanje dokumenta.';

/**
 * Zapisi prihvacen dokument u lokalnu sesiju.
 *
 * ZOVE SE TEK NA `accepted`, nikad na odabir datoteke. Zapis pogodjen prerano dao bi sesiju s
 * dokumentom koji je intake gate poslije odbio, pa bi se obnova raspala na dokumentu koji
 * analizator ne prima.
 *
 * PRETHODNA SESIJA SE BRISE TEK NAKON uspjesnog zapisa nove. Obrnut redoslijed znaci prozor u
 * kojem stara vise ne postoji a nova jos nije zapisana; prekid u tom trenutku gubi oboje.
 */
export async function persistAcceptedDocument(
  file: File,
  verdict: unknown,
  storage: StorageAvailability,
  previousSessionId: string | null = null,
): Promise<PersistOutcome> {
  if (storage.kind === 'unavailable') return { kind: 'skipped', notice: NOTICE_NO_STORAGE };
  try {
    const session = await createLocalDocumentSession(file, verdict as never);
    await storage.store.put(session);
    if (previousSessionId && previousSessionId !== session.id) {
      // Brisanje pretecene sesije NE SMIJE oboriti zapis koji je upravo uspio: zaostala sesija
      // je smece koje istekne sama od sebe, a izgubljen zapis je izgubljen rad.
      try { await storage.store.delete(previousSessionId); } catch { /* zaostalo, istice samo */ }
    }
    return { kind: 'persisted', sessionId: session.id, fragment: sessionFragment(session.id) };
  } catch {
    return { kind: 'failed', notice: NOTICE_PERSIST_FAILED };
  }
}

export type RestoreDocumentOutcome =
  | { kind: 'loaded' }
  | { kind: 'refused'; notice: string };

const NOTICE_RESTORE_REFUSED =
  'Spremljeni dokument vise ne prolazi provjeru pri ucitavanju, pa nije vracen. Ucitaj ga ponovno.';

/**
 * Vrati dokument iz sesije u analizator.
 *
 * SPREMLJEN VERDIKT JE SAMO PREDMEMORIJA: dokument se PONOVNO propusta kroz prijem, jer su se
 * granice i pravila mogli promijeniti od zapisa. Zato ova funkcija prima `load` i postuje njegov
 * ishod umjesto da vjeruje zapisanom.
 */
export async function restoreDocument(
  session: LocalDocumentSessionV1,
  load: (file: File) => Promise<{ kind: string }>,
): Promise<RestoreDocumentOutcome> {
  try {
    const admission = await load(fileFromLocalDocumentSession(session));
    if (admission.kind === 'accepted') return { kind: 'loaded' };
    return { kind: 'refused', notice: NOTICE_RESTORE_REFUSED };
  } catch {
    return { kind: 'refused', notice: NOTICE_RESTORE_REFUSED };
  }
}


/**
 * PRIJELAZ NA PRIHVACEN DOKUMENT, kao JEDAN korak prema van.
 *
 * Stroj stanja trazi dva dogadjaja (ponuda pa prihvacanje), a prijem javlja samo ishod. Ovdje se
 * ta dva spajaju, i to s razlikom koju stroj trazi: prvi dokument je PONUDA, svaki sljedeci je
 * ZAMJENA. Kriva rijec znaci odbijen prijelaz i stanje koje ostane na starom, dakle atribut koji
 * tvrdi `empty` dok dokument postoji.
 */
export function afterDocumentAccepted(context: WorkspaceContext): WorkspaceContext {
  const opened = transition(context, context.state === 'empty' ? 'documentOffered' : 'documentReplaced');
  return transition(opened, 'documentAccepted');
}

/** Prijelaz nakon pokusaja zapisa sesije; neuspjeh vodi dalje, samo bez poveznice. */
export function afterPersist(context: WorkspaceContext, persisted: boolean): WorkspaceContext {
  return transition(context, persisted ? 'sessionPersisted' : 'sessionPersistFailed');
}

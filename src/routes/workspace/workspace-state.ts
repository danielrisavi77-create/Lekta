/**
 * KNJIGA SESIJE RADNOG PROSTORA (prije: stroj stanja; povuceno 2026-09-12, korak B5).
 *
 * STO JE OVDJE BILO I ZASTO VISE NIJE.
 *
 * Do danas je ovaj modul bio stroj s dvanaest stanja i osamnaest dogadjaja, s tablicom prijelaza,
 * oporavkom iz greske i pojmom "posljednjeg sigurnog koraka". Napisan je dobro, ali je bio MRTAV:
 * izmjereno 2026-09-10, u produkciji su se dosezala samo cetiri stanja (`restoring`, `empty`,
 * `validating`, `sessionReady`, `profile`), a dogadjaji `profileConfirmed`, `analysisCompleted`,
 * `repairPlanOpened`, `repairStarted`, `repairCompleted`, `submissionOpened` i `recover` nisu se
 * emitirali nigdje osim u testovima. Jedini trag koji je dolazio do DOM-a bio je atribut
 * `data-workspace-state`, koji NIJEDAN citatelj nije imao: ni CSS, ni test, ni kod.
 *
 * Stanja korisnickog toka u meduvremenu vozi `src/ui/wizard-machine.ts`, koji STVARNO pise prikaz.
 * Dva stroja za istu stvar znace mogucnost da se raziđu, a traka faza koja lazno tvrdi gdje si
 * gora je od trake koje nema.
 *
 * STO OSTAJE, jer nije bilo mrtvo: knjiga o SESIJI. Je li dokument prihvacen i je li sesija stvarno
 * zapisana, i smije li se zato ponuditi poveznica na nju. To ne pripada stroju prikaza (ondje o
 * pohrani nema pojma) i za ovim ce podacima paket C tek imati potrebe.
 *
 * Tvrdnje o stanjima koja produkcija nikad nije dosegla obrisane su iz testa zajedno sa strojem:
 * gard koji ne moze pasti nije pokrivenost.
 */

/** Sto se zna o sesiji u ovoj kartici. Namjerno dvije cinjenice, ne stanje toka. */
export interface WorkspaceLedger {
  /** Je li analizator prihvatio dokument (prosao kroz prijem, ne samo odabran). */
  readonly documentPresent: boolean;
  /** Je li sesija STVARNO zapisana u pohranu. Jedini uvjet pod kojim se poveznica smije ponuditi. */
  readonly sessionPersisted: boolean;
}

export function emptyLedger(): WorkspaceLedger {
  return { documentPresent: false, sessionPersisted: false };
}

/**
 * ZASTO NEMA `afterSessionFound`, iako bi se cinilo prirodnim.
 *
 * Pronalazak sesije u pohrani NE postavlja `sessionPersisted`. To nije previd nego zatecen ugovor
 * o postenju, zapisan u `tests/workspace-bootstrap.test.ts`: poveznica se nudi samo za zapis koji
 * smo MI napravili, jer fragment je korisnikov, a ne nas dokaz. Tudji (ili vlastiti stariji) zapis
 * moze nestati izmedju citanja i klika, pa bi ponuda bila obecanje koje ne mozemo odrzati.
 *
 * Za tu granu se zato koristi `emptyLedger()`, i ova biljeska stoji da je sljedeca sesija ne
 * "popravi" u dobroj vjeri.
 */

/** Smije li sucelje ponuditi poveznicu na sesiju. Postojanje dokumenta nije dovoljno: treba ZAPIS. */
export function canLinkSession(ledger: WorkspaceLedger): boolean {
  return ledger.sessionPersisted;
}

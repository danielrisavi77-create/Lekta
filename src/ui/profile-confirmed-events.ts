/**
 * DOGADJAJ O POTVRDJENOM PROFILU (korak C4, 2026-09-12).
 *
 * Blizanac `analyzer-document-events.ts`, i iz istog razloga izvan `app.ts`: cist je (bez DOM-a,
 * bez stanja analizatora), a `app.ts` je pod ratchetom koji trazi da se SMANJUJE. Ruta radne
 * povrsine se pretplacuje IZRAVNO na ovaj modul, pa `app.ts` ne nosi ni re-izvoz.
 *
 * TRENUTAK POTVRDE JE POTVRDA, NE ANALIZA. Dogadjaj se emitira kad korisnik u carobnjaku klikne
 * "dalje" ili "analiziraj s ovim profilom", nikad iz same analize. Profil zato prezivi i kad
 * korisnik nikad ne pokrene analizu, sto je izricit zahtjev koraka: student koji je samo odabrao
 * fakultet i zatvorio karticu sutra ne bira ponovno.
 *
 * `profileDefinitionId` je `null` kad odabir ne razrjesava nijedan verificiran profil (opca
 * provjera). Pohrana takav zapis ODBIJA (`sanitizeProfile` trazi neprazan niz), pa pretplatnik
 * mora znati da takvu potvrdu nema kamo zapisati; ovdje se to ne skriva pretvaranjem u prazan niz.
 *
 * DRUGA STRANA, U `app.ts` (`applyConfirmedProfileSelection` i zastavica `_sessionProfileApplied`),
 * objasnjena ovdje jer je `app.ts` pod ratchetom:
 *
 *  - Dok zastavica vrijedi, detekcija iz dokumenta (`applyDetectedContext`) SUTI. Bez toga bi
 *    obnova izgledala kao da radi (obrazac se popuni) pa se tiho promijenila sekundu poslije, jer
 *    detekcija radi ASINKRONO iza `accepted`, dakle i nakon sto `restoreDocument` vrati `loaded`.
 *  - Zastavica se VEZE uz prvi prihvaceni dokument nakon primjene (obnovljeni rad). Odbijen ili
 *    pretecen dokument prije tog vezanja, kao i prihvacena DRUGA datoteka poslije njega, gase je;
 *    inace bi detekcija ostala trajno ugasena za sljedeci rad koji korisnik ubaci, a obrazac bi
 *    pokazivao profil rada koji nije ucitan.
 *  - `_restoringSessionProfile` je ograda protiv povratne petlje: obnova ne smije emitirati
 *    potvrdu (pisala bi ono sto je upravo procitala). `select.value=` danas ne okida `change`, pa
 *    petlja ne nastaje ni bez ograde; ograda postoji da zabrana ne ovisi o tom svojstvu DOM-a.
 */
import type { SelectionIds } from './profile-selection-ids';

export interface ProfileConfirmed {
  profileDefinitionId: string | null;
  selectionIds: SelectionIds;
  confirmedAt: number;
}

type ConfirmedListener = (event: ProfileConfirmed) => void;
const _listeners = new Set<ConfirmedListener>();

/** Vraca funkciju za odjavu. Dvostruka odjava je bezopasna. */
export function subscribeProfileConfirmed(listener: ConfirmedListener): () => void {
  _listeners.add(listener);
  return () => { _listeners.delete(listener); };
}

export function emitProfileConfirmed(event: ProfileConfirmed): void {
  // Kopija skupa: pretplatnik DODAN tijekom objave ne smije dobiti dogadjaj koji je prethodio
  // njegovoj pretplati (isti razlog kao kod ishoda prijema dokumenta).
  for (const listener of [..._listeners]) {
    // Greska pretplatnika ne smije srusiti carobnjak: korisnikov korak dalje je vazniji od zapisa.
    try { listener(event); } catch (error) { console.warn('Pretplatnik na potvrdu profila je pukao:', error); }
  }
}

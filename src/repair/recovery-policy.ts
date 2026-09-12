/**
 * OPORAVAK NAKON GRESKE POPRAVKA (plan T10). Cista funkcija: iz ishoda klijenta (`uploadRepair`) i faze u kojoj
 * je greska nastala izvodi STO korisnik smije sljedece, bez DOM-a.
 *
 * Kljucna razlika je "prije slanja" naspram "poslije slanja". Kad je zahtjev otisao i odgovor nije stigao (prekid
 * veze, istek roka), NE ZNA SE je li server posao izvrsio i naplatio; slijepi ponovni pokusaj bi tada mogao
 * potrositi drugo pravo. Zato je prvi korak provjera POSTOJECEG posla kroz postojeci mehanizam ("Moji popravci",
 * `repair-history.ts`), a ponovni pokusaj je dopusten tek nakon te provjere. Kad je server ODGOVORIO (bilo koji
 * HTTP status), ishod je poznat i ponovni pokusaj je siguran.
 */
export type RepairFailurePhase = 'before-send' | 'after-send';

export type RepairRecoveryAction =
  /** Ponovni pokusaj je siguran: server je odgovorio ili zahtjev nije ni otisao. */
  | 'retry'
  /** Nepoznat ishod nakon slanja: prvo provjeri postojeci posao, tek onda ponovni pokusaj. */
  | 'check-existing-job'
  /** Prava pristupa odbijena ili istekla: ponovna prijava, pa ponovni pokusaj. */
  | 'reauth'
  /** Privola ili uvjeti su promijenjeni: osvjezi i ponovno potvrdi. */
  | 'refresh-consent'
  /** Nema smislenog ponovnog pokusaja (kvota, prevelik dokument, iskljuceni fixeri). */
  | 'none';

export interface RepairRecovery {
  action: RepairRecoveryAction;
  /** Je li gumb za ponovni pokusaj odmah dopusten. Za `check-existing-job` je `false` dok se provjera ne otvori. */
  retryAllowed: boolean;
  message: string;
}

export interface RepairFailureLike {
  kind: string;
  status?: number;
  message?: string;
}

const CONSENT_MARKER = /uvjeti su a[zž]urirani|consent_required/i;

export function recoveryFor(outcome: RepairFailureLike, phase: RepairFailurePhase): RepairRecovery {
  if (outcome.kind === 'unauthorized') {
    return { action: 'reauth', retryAllowed: true, message: 'Prijava je istekla ili nije valjana. Prijavi se ponovno pa pokušaj popravak još jednom; ništa nije naplaćeno.' };
  }
  if (outcome.kind === 'error' && outcome.status === 400 && CONSENT_MARKER.test(outcome.message ?? '')) {
    return { action: 'refresh-consent', retryAllowed: false, message: 'Uvjeti su ažurirani. Osvježi stranicu i ponovno potvrdi privolu prije popravka.' };
  }
  if (outcome.kind === 'rate_limited' || outcome.kind === 'too_large' || outcome.kind === 'no_live_fixers' || outcome.kind === 'paywall') {
    return { action: 'none', retryAllowed: false, message: 'Ponovni pokušaj istim dokumentom i odabirom ne bi promijenio ishod.' };
  }
  if (outcome.kind === 'error' && outcome.status === undefined) {
    if (phase === 'after-send') {
      return {
        action: 'check-existing-job',
        retryAllowed: false,
        message: 'Veza je prekinuta nakon slanja, pa ne znamo je li popravak na serveru dovršen. Prvo provjeri Moje popravke; ako popravka ondje nema, tek onda pokušaj ponovno.',
      };
    }
    return { action: 'retry', retryAllowed: true, message: 'Dokument nije poslan (prekid veze prije slanja). Provjeri vezu i pokušaj ponovno; ništa nije naplaćeno.' };
  }
  if (outcome.kind === 'error') {
    return { action: 'retry', retryAllowed: true, message: outcome.message || 'Poslužitelj je vratio grešku. Pokušaj ponovno za koji trenutak.' };
  }
  return { action: 'retry', retryAllowed: true, message: outcome.message || 'Popravak nije uspio. Pokušaj ponovno.' };
}

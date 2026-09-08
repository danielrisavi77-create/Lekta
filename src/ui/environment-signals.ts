/**
 * SIGNALI OKOLINE: sto preglednik kaze o uredaju i o zelji za pokretom, i jedini prijelaz vida
 * koji sucelje koristi.
 *
 * Preseljeno iz `app.ts` 2026-09-08, kao selidba a ne kao dizanje budzeta: ratchet u
 * `tests/ui-module-budget.test.ts` izricito trazi da se probijeni `app.ts` rjesava izdvajanjem.
 *
 * NIJE SAMO SELIDBA RADI PROSTORA. Ovaj je klaster istoga dana bio glavni osumnjicenik za
 * nestabilnost `browser-matrixa` (`withViewTransition` upisuje stanje UNUTAR callbacka View
 * Transitions API-ja, pa je izgledalo da je `data-step` zarobljen iza animacije). Mjerenje ga je
 * oslobodilo krivnje, ali je usput pokazalo da cijeli klaster nema NIJEDAN test, iako o njemu ovisi
 * kada se mijenja ekran i koliki se dokument uopce prima. Sada se moze mjeriti.
 *
 * SVE PRIMA `win` I `doc`, umjesto da poseze za globalima. To nije stil nego uvjet mjerljivosti:
 * ove funkcije citaju `matchMedia`, `navigator` i `documentElement`, kojih u testu nema u zeljenom
 * obliku. Produkcija ih izostavlja i dobiva globale.
 */
import { uploadCapBytes } from '../analysis/memory-budget';

type Win = Pick<Window, 'matchMedia'> & { navigator?: { deviceMemory?: number } };

function win(): Win | null {
  return typeof window === 'undefined' ? null : (window as unknown as Win);
}

/** Podudaranje medijskog upita, otporno na okoline bez `matchMedia`. */
function medij(upit: string, w: Win | null = win()): boolean {
  try {
    return !!(w && typeof w.matchMedia === 'function' && w.matchMedia(upit).matches);
  } catch {
    // Stariji motori znaju baciti na nepoznat upit; odsutnost odgovora nije "da".
    return false;
  }
}

export function motionReduced(w: Win | null = win()): boolean {
  return medij('(prefers-reduced-motion:reduce)', w);
}

export function coarsePointer(w: Win | null = win()): boolean {
  return medij('(pointer:coarse)', w);
}

/** Deklarirana memorija uredaja u GB, ili `null` kad je preglednik ne objavljuje. */
export function deviceMemoryGb(w: Win | null = win()): number | null {
  try {
    return w?.navigator?.deviceMemory ?? null;
  } catch {
    return null;
  }
}

/**
 * "Vjerojatno mobitel" je PROCJENA i tako se i zove. Grubi pokazivac ili <= 4 GB memorije; nijedan
 * od ta dva signala nije dokaz, pa se koristi samo za granice i za ton poruke, nikad za bodovanje.
 */
export function isLikelyMobile(w: Win | null = win()): boolean {
  const gb = deviceMemoryGb(w);
  return coarsePointer(w) || (gb !== null && gb > 0 && gb <= 4);
}

export function effectiveUploadCap(w: Win | null = win()): number {
  return uploadCapBytes({ deviceMemory: deviceMemoryGb(w), coarsePointer: coarsePointer(w) });
}

/**
 * Lokalni View Transition: glatki morph pri zamjeni prikaza i koraka carobnjaka. Fallback na obicnu
 * mutaciju bez podrske ili uz reduced-motion. `.vt-local` (na <html>) gasi root fade i imenuje
 * prikaze (motion.css).
 *
 * `mutate` MORA biti sinkron, da novi snimak uhvati dovrsen DOM. Sekvencijalni pozivi su u redu;
 * prijelazi se ne preklapaju, novi preskoci stari.
 *
 * IZMJERENO 2026-09-08, jer je ova funkcija bila optuzena pa oslobodjena: uz
 * `reducedMotion: 'reduce'`, dakle uz izravni `mutate()`, prijelaz na korak 2 traje 169 odnosno
 * 2154 ms, a s prijelazom 197 odnosno 2589 ms. Razlika je ~400 ms; sekunde kasnjenja dolaze od
 * posla koji slijedi (`updateProfile` ceka pravila profila preko mreze), ne odavde.
 */
export function withViewTransition(mutate: () => void, doc: Document = document): void {
  const d = doc as Document & { startViewTransition?: (cb: () => void) => { ready?: Promise<unknown>; finished: Promise<unknown> } };
  const w = (doc.defaultView as unknown as Win) ?? win();
  if (motionReduced(w) || typeof d.startViewTransition !== 'function') { mutate(); return; }
  const root = doc.documentElement;
  root.classList.add('vt-local');
  try {
    const t = d.startViewTransition(() => mutate());
    t.ready?.catch(() => {});
    t.finished.catch(() => {}).finally(() => root.classList.remove('vt-local'));
  } catch {
    root.classList.remove('vt-local');
    mutate();
  }
}

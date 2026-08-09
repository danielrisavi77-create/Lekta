/**
 * ODLUKA O ISHODU POPRAVKA: je li rezultat prihvatljiv, i ako nije, koji ga zahvat kvari.
 *
 * Ciste funkcije bez DOM-a i bez mreze, da ih testovi mogu voziti bez pravog dokumenta.
 *
 * Zasto postoji: `detectPassRegressions` zna RECI da je nesto palo, ali nitko nije odlucivao sto
 * s tim. Do 2026-08-09 se popravak isporucivao prije nego sto se nova ocjena uopce izracuna, pa
 * odluka nije ni bila moguca; otkad isporuka ide nakon verifikacije, jest.
 *
 * Trosak je namjerno asimetrican. Ne analiziramo nakon svake faze, nego primijenimo sve i
 * analiziramo JEDNOM. Vecina dokumenata nema regresiju i time ne placa nista. Tek kad se
 * regresija dogodi, `isolateCulprit` trazi zahvat koji ju uzrokuje, uz jednu dodatnu analizu po
 * kandidatu. Obrnut redoslijed (analiza po fazi) naplatio bi svima trosak koji treba manjini.
 */

export interface OutcomeCheckLike {
  id?: string;
  title: string;
  status?: string;
  earned?: number;
  max?: number;
}

export interface OutcomeSnapshot {
  score: number | null;
  checks?: readonly OutcomeCheckLike[];
}

export type RejectReason = 'score-drop' | 'pass-regression' | 'integrity';

export interface OutcomeVerdict {
  accept: boolean;
  reason?: RejectReason;
  /** Provjere koje su prije prolazile, a poslije ne. Prazno kad ih nema. */
  regressed: string[];
  /** Razlika u ocjeni (negativna = pogorsanje). `null` kad ijedna strana nije bodovana. */
  delta: number | null;
}

/** Uparivanje po stabilnom id-u; naslov je rezerva za pozivatelje koji ga jos nemaju. */
function keyOf(check: OutcomeCheckLike): string {
  return check.id || check.title;
}

/**
 * Smije li se ovaj rezultat isporuciti?
 *
 * Odbija se u tri slucaja, tim redom po tezini:
 *   1. integritet paketa je odbijen (popravak bi proizveo neispravan .docx),
 *   2. provjera koja je PRIJE prolazila vise ne prolazi,
 *   3. ukupna ocjena je pala.
 *
 * Zasto (2) postoji uz (3): u zbroju se pad pojedine provjere ne vidi. +6 na marginama i -3 na
 * fusnotama izgleda kao cist +3, pa bi kriterij oslonjen samo na ocjenu propustio bas onu vrstu
 * stete koju korisnik najlakse primijeti u svom dokumentu.
 *
 * Jednaka ocjena BEZ regresije se prihvaca: popravak je mogao zatvoriti nebodovanu stavku
 * (npr. prazne odlomke), a to nije razlog da se odbaci.
 */
export function evaluateOutcome(
  before: OutcomeSnapshot,
  after: OutcomeSnapshot,
  options?: { integrityFailed?: boolean },
): OutcomeVerdict {
  const delta = before.score != null && after.score != null ? after.score - before.score : null;

  if (options?.integrityFailed) return { accept: false, reason: 'integrity', regressed: [], delta };

  // Gleda se PRISUTNOST polja, ne duljina: `undefined` znaci "pozivatelj nema provjere" (stariji
  // pozivatelji, testni harnessi) i tada se regresija ne moze ni ocijeniti. Prazan niz je nesto
  // posve drugo - analiza je vratila NULA provjera - i to je najsumnjiviji moguci ishod, pa mora
  // proci kroz petlju i zavrsiti kao regresija.
  const beforeChecks = before.checks;
  const afterChecks = after.checks;
  const regressed: string[] = [];
  if (beforeChecks && afterChecks) {
    for (const check of beforeChecks) {
      if (check.status !== 'pass') continue;
      const match = afterChecks.find((candidate) => keyOf(candidate) === keyOf(check));
      // Nestala provjera se racuna kao regresija: uz isti profil i iste postavke skup provjera
      // mora ostati isti, pa je nestanak jednako sumnjiv kao pad.
      if (match?.status !== 'pass') regressed.push(check.title);
    }
  }
  if (regressed.length) return { accept: false, reason: 'pass-regression', regressed, delta };
  if (delta != null && delta < 0) return { accept: false, reason: 'score-drop', regressed, delta };
  return { accept: true, regressed, delta };
}

/**
 * Nadji zahvat koji kvari ishod, izostavljajuci jedan po jedan kandidat.
 *
 * Linearno, ne binarno: `candidates` je popis odabranih popravaka (realno jedinice do
 * desetak), pa je O(n) analiza jeftinije od slozenosti bisekcije, a poruka korisniku je
 * preciznija ("ovaj zahvat je izostavljen" umjesto "neki iz ove skupine").
 *
 * Pretpostavlja JEDNOG krivca. Kad ga izostavljanje nijednog pojedinacnog kandidata ne rijesi
 * (dva zahvata se sukobljavaju tek zajedno), vraca `null` i pozivatelj mora odustati od cijele
 * baterije - radije nista nego dokument za koji je dokazano da je losiji.
 *
 * `attempt` prima skup koji se primjenjuje i vraca ishod te kombinacije.
 */
export async function isolateCulprit<T>(
  candidates: readonly T[],
  attempt: (subset: readonly T[]) => Promise<OutcomeVerdict>,
): Promise<{ culprit: T; kept: T[] } | null> {
  if (candidates.length < 2) return null; // jedan kandidat: nema sto izostaviti pa da nesto ostane
  for (const candidate of candidates) {
    const kept = candidates.filter((item) => item !== candidate);
    const verdict = await attempt(kept);
    if (verdict.accept) return { culprit: candidate, kept };
  }
  return null;
}

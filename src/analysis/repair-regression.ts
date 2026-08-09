/**
 * Regresija popravka: provjera koja je PRIJE popravka prolazila, a poslije vise ne prolazi.
 *
 * Zasto postoji kao produkcijski modul, a ne samo kao test-assert: ista logika je do sada zivjela
 * dvaput u testovima (tests/helpers/closed-loop-runner.ts, tests/real-corpus/harness.ts) i nigdje
 * u aplikaciji. Popravak koji obori prethodno prolaznu provjeru zato se isporucivao korisniku, a
 * oba re-check bloka prikazuju samo UKUPNI score, u kojem pad jedne provjere nestane u zbroju
 * (npr. +6 na marginama i -3 na fusnotama izgleda kao cist +3).
 *
 * Namjerno NE odlucuje sto s nalazom (blokada, upozorenje, rollback) - to je stvar pozivatelja.
 */

/**
 * Minimalni oblik provjere koji ovoj usporedbi treba. Namjerno labaviji od Check
 * (src/scoring/checks.ts) da ga mogu koristiti i testni harnessi koji nose samo naslov i status.
 */
export interface RegressionCheckLike {
  /** Stabilan identitet (Check.id). Neobavezan: testni harnessi jos slazu objekte bez njega,
   *  pa se tada pada natrag na naslov. Kad postoji, ima prednost. */
  id?: string;
  title: string;
  status?: string;
  category?: string;
  earned?: number;
  max?: number;
}

export interface PassRegression {
  title: string;
  category?: string;
  /** Status poslije popravka; undefined kad provjera vise uopce ne postoji u rezultatu. */
  after?: string;
  /** Koliko je bodova izgubljeno (0 kad provjera nije bodovana ili podaci nisu dostupni). */
  lostPoints: number;
}

/**
 * Provjere koje su prije bile 'pass', a poslije nisu.
 *
 * Uparivanje ide po STABILNOM ID-u (`Check.id`, vidi src/scoring/check-ids.ts). Do 2026-08-09
 * islo je po hrvatskom naslovu, jer Check tada nije imao id: to je tiho razvezivalo detekciju
 * cim se naslov preformulira, a bas ta detekcija sada odlucuje hoce li se popravak isporuciti
 * (vidi renderDeliveryChoice u repair-panel.ts), pa krhkost vise nije bila prihvatljiva.
 *
 * Naslov ostaje kao REZERVA za pozivatelje koji jos slazu Check-like objekte bez id-a (testni
 * harnessi); tada je ponasanje isto kao prije.
 *
 * Nestala provjera se RACUNA kao regresija, isto kao u postojecim testnim harnessima: uz isti
 * profil i iste postavke skup provjera mora ostati isti, pa je nestanak jednako sumnjiv kao pad.
 */
export function detectPassRegressions(
  before: readonly RegressionCheckLike[] = [],
  after: readonly RegressionCheckLike[] = [],
): PassRegression[] {
  const out: PassRegression[] = [];
  for (const check of before) {
    if (check.status !== 'pass') continue;
    const match = check.id
      ? after.find((candidate) => candidate.id === check.id)
      : after.find((candidate) => candidate.title === check.title);
    if (match?.status === 'pass') continue;
    const beforeEarned = check.earned ?? 0;
    const afterEarned = match?.earned ?? 0;
    out.push({
      title: check.title,
      ...(check.category != null ? { category: check.category } : {}),
      ...(match?.status != null ? { after: match.status } : {}),
      lostPoints: Math.max(0, beforeEarned - afterEarned),
    });
  }
  return out;
}

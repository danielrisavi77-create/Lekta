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
  /** Stabilan identitet provjere; kad postoji, uparivanje ide po njemu (vidi nize). */
  id?: string | null;
  title: string;
  status?: string;
  category?: string;
  earned?: number;
  max?: number;
}

export interface PassRegression {
  /** Stabilan identitet provjere, kad ga ima; pozivatelji filtriraju po njemu, ne po naslovu. */
  id?: string | null;
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
 * Uparivanje ide po STABILNOM `id` (src/scoring/check-id-registry.ts). Naslov ostaje samo
 * fallback za provjere koje jos nemaju registriran identitet. Prije se kljucalo iskljucivo po
 * hrvatskom naslovu, pa je preformulacija (ili dinamican sufiks kao kod formata stranice)
 * razvezivala par: nestala provjera se racuna kao regresija, sto je davalo LAZAN pad.
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
    // Kljuc: id kad ga OBJE strane imaju, inace naslov. Dvije razlicite neregistrirane
    // provjere (obje id === null) ne smiju se upariti samo zato sto su obje bez id-a.
    const match = check.id
      ? after.find((candidate) => candidate.id === check.id)
      : after.find((candidate) => !candidate.id && candidate.title === check.title);
    if (match?.status === 'pass') continue;
    const beforeEarned = check.earned ?? 0;
    const afterEarned = match?.earned ?? 0;
    out.push({
      ...(check.id != null ? { id: check.id } : {}),
      title: check.title,
      ...(check.category != null ? { category: check.category } : {}),
      ...(match?.status != null ? { after: match.status } : {}),
      lostPoints: Math.max(0, beforeEarned - afterEarned),
    });
  }
  return out;
}

/**
 * Provjere koje mjere POHRANJEN tekst Wordovog polja, a ne stvarno stanje dokumenta.
 *
 * Kad popravak doda naslov, `toc.coverage` usporedi 45 naslova s 41 stavkom sadrzaja i prijavi
 * pad, iako je sadrzaj ZIVO polje koje Word regenerira pri otvaranju. Izmjereno 2026-08-23 na
 * `corpus-0084`: 3/3 -> 1/3, naslova 42 -> 45, stavki sadrzaja 41 -> 41, uz 49 polja oznacenih
 * `w:dirty`. Dokument je bio ISPRAVAN; ustajao je samo pohranjeni tekst.
 */
const STALE_FIELD_CHECK_IDS: ReadonlySet<string> = new Set(['toc.coverage', 'toc.page-numbers']);

/**
 * Hoce li Word regenerirati sadrzaj pri otvaranju? Trazi ZIVO TOC polje koje je oznaceno kao
 * ustajalo (`w:dirty`, status `stale`). Bez oznake Word ne osvjezava sam, pa bi student vidio
 * stari sadrzaj i pad bi bio STVARAN: zato se uvjet ne smije svesti na "postoji TOC polje".
 */
export function tocFieldWillRefresh(result: unknown): boolean {
  // Lokalni panel ne barata punim rezultatom nego snimkom bodova, pa smije predati gotovu
  // zastavicu; serverski put i harness predaju cijeli rezultat i zastavica se izvodi ovdje.
  const direct = (result as { tocFieldWillRefresh?: unknown })?.tocFieldWillRefresh;
  if (typeof direct === 'boolean') return direct;
  const fields = (result as { details?: { fieldIntegrity?: { fields?: Array<{ kind?: string; dirty?: boolean; status?: string }> } } })
    ?.details?.fieldIntegrity?.fields;
  if (!Array.isArray(fields)) return false;
  const toc = fields.filter((field) => field.kind === 'toc');
  return toc.length > 0 && toc.some((field) => field.dirty === true || field.status === 'stale');
}

/**
 * Makni regresije koje su posljedica USTAJALOG polja, a ne stete.
 *
 * Zasto to nije "gutanje nalaza": bez ovoga `detectPassRegressions` demotira ispravno popravljen
 * dokument na sporedan izbor, pa sucelje korisniku preporuci IZVORNI dokument koji je losiji.
 * Uvjet je uzak i provjerljiv (zivo TOC polje oznaceno za osvjezavanje), a sve ostale regresije
 * prolaze nedirnute.
 */
export function dropStaleFieldRegressions(
  regressions: readonly PassRegression[],
  afterResult: unknown,
): PassRegression[] {
  if (!tocFieldWillRefresh(afterResult)) return [...regressions];
  return regressions.filter((regression) => !(regression.id && STALE_FIELD_CHECK_IDS.has(regression.id)));
}

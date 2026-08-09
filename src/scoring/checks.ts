/**
 * Bodovanje i zapisi provjera izvuceni iz monolita (src/main.ts), korak 3 porta enginea.
 *
 * Ciste funkcije bez UI-ja i globalnog stanja; tijela prepisana 1:1 (dodani tipovi) pa
 * golden snapshoti ostaju nepromijenjeni. `makeCheck` namjerno ima parametar `issue`
 * koji zasjenjuje funkciju `issue` u svom tijelu, identicno originalu.
 */
import { clamp } from '../utils/helpers.ts';
import { checkIdFor } from './check-ids.ts';

export interface Issue {
  severity: 'error' | 'warning' | 'info' | string;
  category: string;
  title: string;
  detail: string;
  where: string;
}

export type MeasurementStatus = 'measured' | 'unavailable' | 'ambiguous' | 'not-applicable';

export interface Check {
  /**
   * Stabilan, jezicno-neovisan identitet provjere (`src/scoring/check-ids.ts`).
   *
   * Postoji jer je identitet dosad bio hrvatski `title`, pa je svaka korelacija izgradjena nad
   * njim (triage, repair-items, regresija popravka, izvjestaji) pucala na preformulaciju naslova.
   * `title` od sada je ISKLJUCIVO tekst za korisnika.
   *
   * Nije u golden snapshotima: `tests/helpers/golden-normalize.ts` bira polja poimence.
   */
  id: string;
  /**
   * Je li ishod DOKAZAN mjerenjem, ili je pretpostavljen jer se vrijednost nije dala ocitati.
   *
   * Kad Word ne zapise font/velicinu/prored/margine, check dobiva status 'unknown' i ne ulazi u
   * score. `verificationCoverage` i dalje pokazuje koliko je bodovanih provjera bilo mjerljivo.
   *
   * 'not-applicable' = nije bodovano (max 0), pa ni ne ulazi u pokrivenost.
   */
  evidence: 'measured' | 'assumed' | 'not-applicable';
  measurementStatus: MeasurementStatus;
  category: string;
  title: string;
  status: string;
  earned: number;
  max: number;
  detail: string;
  issue: Issue | null;
  scored: boolean;
}

/** Jedan zapis provjere; max===0 znaci informativno (ne ulazi u ocjenu). */
export function makeCheck(
  category: string,
  title: string,
  status: string,
  earned: number,
  max: number,
  detail: string,
  issue: any = null,
): Check {
  if (max === 0) {
    status = 'info';
    detail = `Informativno: ne ulazi u službenu ocjenu. ${detail}`;
    if (issue) issue = { ...issue, severity: 'info', title: `Informativno: ${issue.title}` };
  }
  return {
    id: checkIdFor(category, title),
    // Default je 'measured'; neocitane vrijednosti analyzeDocx nakon toga oznaci kao unknown.
    evidence: max > 0 ? 'measured' : 'not-applicable',
    measurementStatus: max > 0 ? 'measured' : 'not-applicable',
    category,
    title,
    status,
    earned: clamp(earned, 0, max),
    max,
    detail,
    issue,
    scored: max > 0,
  };
}

/** Je li provjera dovoljno izmjerena da smije utjecati na score. */
export function isScoreEligible(check: Check): boolean {
  return check.scored && check.max > 0 && check.measurementStatus === 'measured';
}

/**
 * Oznaci provjere cija vrijednost NIJE bila citljiva.
 *
 * Zove se jednom, nakon sto je `checks` sastavljen, umjesto da se `evidence` provlaci kroz
 * svaki `makeCheck` poziv. Kljuc je stabilan `Check.id`, pa veza ne ovisi o formulaciji naslova.
 * `unreadable` mapira id -> je li bas u OVOM dokumentu vrijednost izostala.
 */
export function markAssumedEvidence(checks: Check[], unreadable: Record<string, boolean>): void {
  for (const c of checks) {
    if (c.max > 0 && unreadable[c.id]) {
      c.evidence = 'assumed';
      c.measurementStatus = 'unavailable';
      c.status = 'unknown';
      c.earned = 0;
      c.scored = false;
    }
  }
}

/** Zbroj bodova samo provjera koje su stvarno izmjerene. */
export function scoreTotals(checks: Check[] = []): { earned: number; max: number; score: number | null } {
  const eligible = checks.filter(isScoreEligible);
  const earned = eligible.reduce((sum, check) => sum + check.earned, 0);
  const max = eligible.reduce((sum, check) => sum + check.max, 0);
  return { earned, max, score: max ? Math.round((earned / max) * 100) : null };
}

/**
 * Udio BODOVANIH bodova cija je vrijednost stvarno izmjerena.
 *
 * Namjerno odvojeno od ocjene: `score` govori koliko je izmjerenih pravila zadovoljeno, a
 * `coverage` koliko je svih bodovanih pravila bilo moguce izmjeriti.
 *
 * Vraca `null` kad nema bodovanih provjera (tada ni ocjena ne postoji).
 */
export function verificationCoverage(checks: Check[] = []): { percent: number; assumed: number } | null {
  const scored = checks.filter((c) => c.max > 0);
  const max = scored.reduce((s, c) => s + c.max, 0);
  if (!max) return null;
  const measured = scored.filter((c) => c.measurementStatus === 'measured').reduce((s, c) => s + c.max, 0);
  return { percent: Math.round((measured / max) * 100), assumed: scored.filter((c) => c.measurementStatus !== 'measured').length };
}

/**
 * Zbroji earned/max po kategoriji za bodovane provjere (max > 0, scored). Jedini izvor
 * istine za `result.categories` (analyzeDocx) i placeni `categoryScores` (report.ts);
 * redoslijed kljuceva prati redoslijed provjera (insertion order), kao povijesno.
 */
export function categoryTotals(checks: Check[] = []): Record<string, { earned: number; max: number }> {
  const categories: Record<string, { earned: number; max: number }> = {};
  for (const c of checks) {
    if (!isScoreEligible(c)) continue;
    categories[c.category] ??= { earned: 0, max: 0 };
    categories[c.category].earned += c.earned;
    categories[c.category].max += c.max;
  }
  return categories;
}

/** Zapis problema (greska/upozorenje/info) s lokacijom. */
export function issue(severity: string, category: string, title: string, detail: string, where = ''): Issue {
  return { severity, category, title, detail, where };
}

/** Mapiraj numericki score na oznaku, boju i tekst. */
export function scoreMeta(s: number | null): { label: string; color: string; text: string } {
  if (s === null) return { label: 'Ocjena nije dostupna', color: 'var(--muted)', text: 'Nema dovoljno dostupnih mjerenja za izračun bodovne ocjene.' };
  if (s >= 90) return { label: 'Visoka usklađenost s profilom', color: 'var(--ok)', text: 'Dokument je visoko usklađen s automatski provjerljivim pravilima odabranog profila.' };
  if (s >= 75) return { label: 'Dobra usklađenost s profilom', color: 'var(--info)', text: 'Dokument je uglavnom usklađen, ali prije predaje provjeri označene stavke.' };
  if (s >= 60) return { label: 'Potrebne su dorade', color: 'var(--warn)', text: 'Pronađeno je više stavki koje bi trebalo ispraviti prije predaje.' };
  return { label: 'Slaba usklađenost s profilom', color: 'var(--danger)', text: 'Pronađene su važne tehničke ili citatne nedosljednosti koje treba ispraviti prije predaje.' };
}

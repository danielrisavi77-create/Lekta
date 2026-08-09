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
   * Analiza je namjerno fail-open: kad Word ne zapise font/velicinu/prored/margine, check dobiva
   * PUNE bodove i status 'pass' (vidi analyze-docx). To je ispravno jer stiti od laznih optuzbi,
   * ali znaci da `100/100` moze znaciti "nije bilo sto izmjeriti", a ne "dokazano ispravno".
   * Bodovanje se zbog toga NE mijenja; ova oznaka samo omogucuje da uz ocjenu stoji i posten
   * podatak koliko je od nje stvarno izmjereno (`verificationCoverage`).
   *
   * 'not-applicable' = nije bodovano (max 0), pa ni ne ulazi u pokrivenost.
   */
  evidence: 'measured' | 'assumed' | 'not-applicable';
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
    status = 'pass';
    detail = `Informativno: ne ulazi u službenu ocjenu. ${detail}`;
    if (issue) issue = { ...issue, severity: 'info', title: `Informativno: ${issue.title}` };
  }
  return {
    id: checkIdFor(category, title),
    // Default je 'measured'; fail-open grane analyzeDocx nakon toga oznace svoje provjere kao
    // 'assumed' (markAssumedEvidence), na jednom mjestu i po stabilnom id-u.
    evidence: max > 0 ? 'measured' : 'not-applicable',
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

/**
 * Oznaci provjere cija vrijednost NIJE bila citljiva, pa su prosle fail-open granom.
 *
 * Zove se jednom, nakon sto je `checks` sastavljen, umjesto da se `evidence` provlaci kroz
 * svaki `makeCheck` poziv. Kljuc je stabilan `Check.id`, pa veza ne ovisi o formulaciji naslova.
 * `unreadable` mapira id -> je li bas u OVOM dokumentu vrijednost izostala.
 */
export function markAssumedEvidence(checks: Check[], unreadable: Record<string, boolean>): void {
  for (const c of checks) {
    if (c.max > 0 && unreadable[c.id]) c.evidence = 'assumed';
  }
}

/**
 * Udio BODOVANIH bodova cija je vrijednost stvarno izmjerena.
 *
 * Namjerno odvojeno od ocjene: `score` govori koliko je pravila zadovoljeno, `coverage` koliko
 * je od toga dokazano. Dokument koji uopce ne zapisuje font, velicinu i prored dobiva pune bodove
 * (fail-open), ali nisku pokrivenost - i to je istina koju korisnik treba vidjeti.
 *
 * Vraca `null` kad nema bodovanih provjera (tada ni ocjena ne postoji).
 */
export function verificationCoverage(checks: Check[] = []): { percent: number; assumed: number } | null {
  const scored = checks.filter((c) => c.max > 0);
  const max = scored.reduce((s, c) => s + c.max, 0);
  if (!max) return null;
  const measured = scored.filter((c) => c.evidence !== 'assumed').reduce((s, c) => s + c.max, 0);
  return { percent: Math.round((measured / max) * 100), assumed: scored.filter((c) => c.evidence === 'assumed').length };
}

/**
 * Zbroji earned/max po kategoriji za bodovane provjere (max > 0, scored). Jedini izvor
 * istine za `result.categories` (analyzeDocx) i placeni `categoryScores` (report.ts);
 * redoslijed kljuceva prati redoslijed provjera (insertion order), kao povijesno.
 */
export function categoryTotals(checks: Check[] = []): Record<string, { earned: number; max: number }> {
  const categories: Record<string, { earned: number; max: number }> = {};
  for (const c of checks) {
    if (!c.scored || c.max <= 0) continue;
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
export function scoreMeta(s: number): { label: string; color: string; text: string } {
  if (s >= 90) return { label: 'Visoka usklađenost s profilom', color: 'var(--ok)', text: 'Dokument je visoko usklađen s automatski provjerljivim pravilima odabranog profila.' };
  if (s >= 75) return { label: 'Dobra usklađenost s profilom', color: 'var(--info)', text: 'Dokument je uglavnom usklađen, ali prije predaje provjeri označene stavke.' };
  if (s >= 60) return { label: 'Potrebne su dorade', color: 'var(--warn)', text: 'Pronađeno je više stavki koje bi trebalo ispraviti prije predaje.' };
  return { label: 'Slaba usklađenost s profilom', color: 'var(--danger)', text: 'Pronađene su važne tehničke ili citatne nedosljednosti koje treba ispraviti prije predaje.' };
}

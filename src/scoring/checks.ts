/**
 * Bodovanje i zapisi provjera izvuceni iz monolita (src/main.ts), korak 3 porta enginea.
 *
 * Ciste funkcije bez UI-ja i globalnog stanja; tijela prepisana 1:1 (dodani tipovi) pa
 * golden snapshoti ostaju nepromijenjeni. `makeCheck` namjerno ima parametar `issue`
 * koji zasjenjuje funkciju `issue` u svom tijelu, identicno originalu.
 */
import { clamp } from '../utils/helpers';

export interface Issue {
  severity: 'error' | 'warning' | 'info' | string;
  category: string;
  title: string;
  detail: string;
  where: string;
}

export interface Check {
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
  return { category, title, status, earned: clamp(earned, 0, max), max, detail, issue, scored: max > 0 };
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
  return { label: 'Nije spremno za predaju', color: 'var(--danger)', text: 'Pronađene su važne tehničke ili citatne nedosljednosti.' };
}

/**
 * INTERPUNKCIJA CITATA (faza 4, "zadnja milja"): posljednja preostala bodovana provjera bez
 * atomskog slucaja. Na referentnom fpzg profilu, NE treba izmjenu buildera:
 *   - citation.punctuation: oddCitationPunctuation okida na "(Prezime; 2019)" (tocka-zarez umjesto
 *     zareza izmedu autora i godine); cista varijanta koristi uredan zarez.
 *
 * page.numbers.scheme je namjerno demotirana na informativnu (max 0, uvijek 'pass') jer nema
 * sourced ruleEntry (CLAUDE.md "ne izmisljaj pravila") - atomski slucaj koji je ranije dokazivao
 * njen fail je uklonjen jer provjera vise nikad ne moze fail-ati.
 */
import type { DocSpec } from '../../helpers/docx-builder';
import { baselineSpec, cloneSpec, line, BASELINE_PROFILE_ID } from '../builder/baseline';
import type { ErrorCase } from '../error-case';

const PID = BASELINE_PROFILE_ID;

/** Baza s dodatnom citatnicom; `odd` -> tocka-zarez izmedu autora i godine. */
function punctSpec(odd: boolean): DocSpec {
  const s = cloneSpec(baselineSpec());
  const i = s.paragraphs.findIndex((p) => p.styleId && /1\. Uvod/.test(p.text));
  const cite = odd
    ? 'Neki autori (Prezime; 2019) tvrde suprotno u novijoj raspravi o temi.'
    : 'Neki autori (Prezime, 2019) tvrde suprotno u novijoj raspravi o temi.';
  s.paragraphs.splice(i + 1, 0, line(cite, { jc: 'both' }));
  return s;
}

export const SCHEME_PUNCT_ATOMIC_CASES: ErrorCase[] = [
  {
    id: 'atomic.citation.punctuation',
    title: 'Točka-zarez umjesto zareza u citatnici (Prezime; 2019)',
    category: 'citations', oracle: 'atomic-fail', profileId: PID, detectableNow: true,
    cleanBuild: () => punctSpec(false),
    build: () => punctSpec(true),
    expect: { checkId: 'citation.punctuation', title: 'Dosljednost interpunkcije citatnica', kind: 'status', outcome: 'not-pass' },
  },
];

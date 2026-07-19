/**
 * SHEMA NUMERIRANJA + INTERPUNKCIJA CITATA (faza 4, "zadnja milja"): posljednje dvije bodovane
 * provjere koje su ostale bez atomskog slucaja. Obje su na referentnom fpzg profilu i NE trebaju
 * izmjenu buildera:
 *   - page.numbers.scheme: schemeOk = hasRoman && hasDecimal && hasStartOne, tj. treba dokument s
 *     VISE sekcija (prednje stranice rimski, glavni tekst arapski od 1). Sekcijske prijelome radimo
 *     `raw` odlomkom s ugnijezdenim <w:sectPr><w:pgNumType .../></w:sectPr> (parser cita sve sectPr).
 *   - citation.punctuation: oddCitationPunctuation okida na "(Prezime; 2019)" (tocka-zarez umjesto
 *     zareza izmedu autora i godine); cista varijanta koristi uredan zarez.
 *
 * Time je pokriven cijeli atomski-pokrivljivi skup; preostaju samo 2 savjetodavne uvijek-warn
 * provjere (style-automation, manual.checks) koje strukturno nemaju "pass" stanje.
 */
import type { DocSpec, ParaSpec } from '../../helpers/docx-builder';
import { baselineSpec, cloneSpec, line, BASELINE_PROFILE_ID } from '../builder/baseline';
import type { ErrorCase } from '../error-case';

const PID = BASELINE_PROFILE_ID;

/** Sekcijski prijelom s formatom numeriranja stranica (raw sectPr; parser ga cita kao zasebnu sekciju). */
const sectBreak = (fmt: string, start?: number): ParaSpec => ({
  text: '',
  raw: `<w:p><w:pPr><w:sectPr><w:pgNumType w:fmt="${fmt}"${start != null ? ` w:start="${start}"` : ''}/></w:sectPr></w:pPr></w:p>`,
});

/** Baza s dvije sekcije: prednja (frontFmt) + glavna (arapska, pocinje od 1). */
function schemeSpec(frontFmt: string): DocSpec {
  const s = cloneSpec(baselineSpec());
  const introIdx = s.paragraphs.findIndex((p) => p.styleId && /1\. Uvod/.test(p.text));
  const litIdx = s.paragraphs.findIndex((p) => p.styleId && /Literatura/.test(p.text));
  // Prijelom glavne sekcije (arapski, start 1) neposredno prije Literature.
  s.paragraphs.splice(litIdx, 0, sectBreak('decimal', 1));
  // Prijelom prednje sekcije neposredno prije Uvoda.
  s.paragraphs.splice(introIdx, 0, sectBreak(frontFmt));
  return s;
}

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
    id: 'atomic.page.numbers.scheme',
    title: 'Prednje stranice arapski umjesto rimski (nepotpuna FPZG shema)',
    category: 'structure', oracle: 'atomic-fail', profileId: PID, detectableNow: true,
    // Cista: prednja sekcija rimski + glavna arapski od 1 -> puna shema. Mutacija: prednja arapski -> nema rimskih.
    cleanBuild: () => schemeSpec('lowerRoman'),
    build: () => schemeSpec('decimal'),
    expect: { checkId: 'page.numbers.scheme', title: 'Shema numeriranja stranica', kind: 'status', outcome: 'not-pass' },
  },
  {
    id: 'atomic.citation.punctuation',
    title: 'Točka-zarez umjesto zareza u citatnici (Prezime; 2019)',
    category: 'citations', oracle: 'atomic-fail', profileId: PID, detectableNow: true,
    cleanBuild: () => punctSpec(false),
    build: () => punctSpec(true),
    expect: { checkId: 'citation.punctuation', title: 'Dosljednost interpunkcije citatnica', kind: 'status', outcome: 'not-pass' },
  },
];

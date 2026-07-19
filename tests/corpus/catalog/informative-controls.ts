/**
 * INFORMATIVNI VALID-CONTROLI (P3): valjani dokumenti koji ciljanu INFORMATIVNU provjeru dovode
 * u pravi BODOVANI 'pass' (max > 0), a ne u informativni max-0 pass koji makeCheck iznudi za svaki
 * ne-bodovan check. Time dokazuju da provjera ne daje lazni 'warn' na valjanom (ali skliskom) obliku.
 *
 * Zasto 'earned' + 'pass': meetsExpectation za kind:'earned' trazi max>0 && earned===max, pa test
 * PADA ako check ostane samo informativan (coerced pass). To je jamstvo NEVAKUOZNOSTI - bez njega bi
 * valid-control bio zelen i za check koji strukturno nikad ne pada (fake pokrivenost koju ovaj modul
 * odbija, vidi coverage-report "ne lazira 100%").
 *
 * Svih 6 provjera dosize bodovani pass tek uz odgovarajuci profil + potvrdan prijelom prve stranice
 * (title.*), titlePg sekciju (page.numbers.title-suppressed) ili pravnu fusnotu (legal.*). Preostale
 * 3 informativne (scope.pages hardkodiran max 0; page.numbers.position/start trebaju stvarne footer
 * dijelove) NAMJERNO ostaju u gap-backlogu (KNOWN_ADVISORY), ne lazira ih se vakuoznim controlom.
 */
import type { DocSpec, ParaSpec } from '../../helpers/docx-builder';
import { legalBaselineSpec, LEGAL_PROFILE_ID } from '../builder/legal-baseline';
import { line, PAGE_FIELD } from '../builder/baseline';
import type { ErrorCase } from '../error-case';

const LEGAL = LEGAL_PROFILE_ID; // pravo-integrirani-diplomski (titlePageSequence + legal-centered + titlePg)
const SOCIAL = 'pravo-socijalni-rad-zavrsni'; // titlePageTypography: 'social-work'

/** Potvrdan prijelom prve stranice: paragraf s <w:br w:type="page"/> (parser -> pageBreakAfter). */
const PAGEBREAK: ParaSpec = { text: '', raw: '<w:p><w:r><w:br w:type="page"/></w:r></w:p>' };
/** Prva sekcija s razlicitom naslovnicom (w:titlePg) -> skriven broj na prvoj stranici. */
const TITLEPG: ParaSpec = { text: '', raw: '<w:p><w:pPr><w:sectPr><w:titlePg/><w:pgNumType w:fmt="decimal"/></w:sectPr></w:pPr></w:p>' };

/**
 * Valjan pravni rad s PUNOM naslovnicom: puni slijed (Pravni fakultet, vrsta rada, mentor,
 * Zagreb+godina) centriran, potvrdan prijelom prve stranice, PAGE polje i titlePg sekcija.
 * Jedan dokument koji istovremeno bodovano prolazi title.order, title.layout i title-suppressed.
 */
function legalTitleSpec(): DocSpec {
  const s = legalBaselineSpec();
  // Baza ima [0..3] = Sveuciliste / Pravni fakultet / naslov / Diplomski rad. Dopuni mentorom i
  // Zagrebom+godinom (slijed profila), pa PAGE polje + prijelom + titlePg sekcija prije Sazetka.
  s.paragraphs.splice(4, 0,
    line('Mentor: prof. dr. sc. A. K.', { jc: 'center' }),
    line('Zagreb, 2020.', { jc: 'center' }),
    PAGE_FIELD,
    PAGEBREAK,
    TITLEPG,
  );
  return s;
}

/** Valjana uporaba kratice id. u istoj biljesci: autor naveden, pa "; id., str." (isti autor). */
function idValidSpec(): DocSpec {
  const s = legalBaselineSpec();
  s.footnotes = [...(s.footnotes ?? []), 'Marić, P., Obvezno pravo, Školska knjiga, Zagreb, 2018., str. 12; id., str. 45.'];
  return s;
}

/** Druga POTPUNA sudska odluka (ESLJP, s datumom) uz domacu iz baze: potpuna sudska praksa. */
function caseValidSpec(): DocSpec {
  const s = legalBaselineSpec();
  s.footnotes = [...(s.footnotes ?? []), 'Europski sud za ljudska prava, X protiv Hrvatske, br. 12345/10, presuda od 3. lipnja 2019.'];
  return s;
}

/** Social-work naslovnica: standardni elementi TNR 14 bold centrirano, naslov 16 bold, potvrdan prijelom. */
function socialTitleSpec(): DocSpec {
  const s = legalBaselineSpec();
  const T = (text: string, sizePt: number): ParaSpec => line(text, { font: 'Times New Roman', sizePt, bold: true, jc: 'center' });
  s.paragraphs.splice(0, 4,
    T('Sveučilište u Zagrebu', 14),
    T('Pravni fakultet', 14),
    T('Studijski centar socijalnog rada', 14),
    T('NASILJE U OBITELJI I SOCIJALNA SKRB', 16),
    T('Završni rad', 14),
    T('Zagreb, 2020.', 14),
    PAGEBREAK,
  );
  return s;
}

export const INFORMATIVE_VALID_CASES: ErrorCase[] = [
  {
    id: 'valid.legal.case-law',
    title: 'Potpuna sudska odluka (ESLJP) uz domaću ostaje bez nalaza',
    category: 'citations', oracle: 'valid-control', profileId: LEGAL, detectableNow: true,
    build: caseValidSpec,
    expect: { checkId: 'legal.case-law', title: 'Sudska praksa', kind: 'earned', outcome: 'pass' },
    notes: 'Dvije potpune odluke (domaca + ESLJP) s datumom -> bodovani pass, ne lazni nedostajuci element.',
  },
  {
    id: 'valid.legal.id-abbrev',
    title: 'Kratica id. ispravno slijedi navedenog autora u istoj bilješci',
    category: 'citations', oracle: 'valid-control', profileId: LEGAL, detectableNow: true,
    build: idValidSpec,
    expect: { checkId: 'legal.id-abbrev', title: 'Kratica id. u istoj bilješci', kind: 'earned', outcome: 'pass' },
    notes: 'Autor naveden, pa "; id., str." -> uredna uporaba, bodovani pass (ne lazna nepravilna uporaba).',
  },
  {
    id: 'valid.page.numbers.title-suppressed',
    title: 'Naslovnica sa skrivenim brojem (titlePg sekcija) ostaje bez nalaza',
    category: 'structure', oracle: 'valid-control', profileId: LEGAL, detectableNow: true,
    build: legalTitleSpec,
    expect: { checkId: 'page.numbers.title-suppressed', title: 'Naslovnica bez broja stranice', kind: 'earned', outcome: 'pass' },
    notes: 'w:titlePg prva sekcija bez broja na prvoj stranici -> bodovani pass (skriven broj potvrdjen iz sekcija).',
  },
  {
    id: 'valid.title.order',
    title: 'Elementi naslovnice u očekivanom redoslijedu (potvrdan prijelom)',
    category: 'structure', oracle: 'valid-control', profileId: LEGAL, detectableNow: true,
    build: legalTitleSpec,
    expect: { checkId: 'title.order', title: 'Redoslijed elemenata naslovnice', kind: 'earned', outcome: 'pass' },
    notes: 'Pravni fakultet -> vrsta rada -> mentor -> Zagreb+godina uzlazno -> bodovani pass.',
  },
  {
    id: 'valid.title.layout',
    title: 'Svi elementi naslovnice centrirani (legal-centered) ostaju bez nalaza',
    category: 'structure', oracle: 'valid-control', profileId: LEGAL, detectableNow: true,
    build: legalTitleSpec,
    expect: { checkId: 'title.layout', title: 'Raspored naslovne stranice', kind: 'earned', outcome: 'pass' },
    notes: 'Svi eksplicitno poravnati elementi su centrirani -> bodovani pass, ne lazni raspored.',
  },
  {
    id: 'valid.title.typography',
    title: 'Social-work naslovnica (TNR 14 bold, naslov 16) ostaje bez nalaza',
    category: 'structure', oracle: 'valid-control', profileId: SOCIAL, detectableNow: true,
    build: socialTitleSpec,
    expect: { checkId: 'title.typography', title: 'Tipografija korica i naslovnice', kind: 'earned', outcome: 'pass' },
    notes: 'Standardni elementi TNR 14 bold centrirano + naslov 16 bold -> bodovani pass po social-work obrascu.',
  },
];

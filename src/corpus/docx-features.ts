/**
 * ZNACAJKE DOKUMENTA, IZVEDENE IZ PAKETA (F1).
 *
 * NIJE dio app bundlea (isti obrazac kao `src/repair/recipe.ts`): koriste ga `scripts/corpus-ingest.mts`
 * i testovi.
 *
 * Zasto se izvodi, a ne upisuje rukom: rucno upisano polje laze. Izmjereno 2026-08-23 na lokalnom
 * korpusu, 33 od 38 stvarnih radova ima `word/endnotes.xml`, a NIJEDAN nema stvarnu endnotu; taj
 * dio Word napise i kad endnota nema, sa samim separatorima. Prisutnost dijela nije prisutnost
 * sadrzaja, pa se svaka znacajka mjeri iz sadrzaja.
 */

/** Dijelovi paketa kao tekst (`ime -> xml`). */
export type DocxParts = Record<string, string>;

export interface DocxFeatures {
  /** Broj zivih sekcija (`w:sectPr`). */
  sections: number;
  paragraphs: number;
  tables: number;
  images: number;
  /** Stvarne fusnote i endnote, BEZ separatora. */
  footnotes: number;
  endnotes: number;
  /** Postoji li dio, neovisno o tome ima li sadrzaja (dijagnostika laznog signala). */
  endnotesPartPresent: boolean;
  comments: number;
  trackedChanges: number;
  /** Ima li `w:fldChar`/`instrText` TOC polje (nasuprot rucno tipkanom sadrzaju). */
  hasTocField: boolean;
  /** Naslov "Sadrzaj" bez TOC polja: uvjet pod kojim se nudi `toc-field-fixer`. */
  hasTocHeadingWithoutField: boolean;
  fields: number;
  /** Alat koji je ZADNJI spremio dokument (`docProps/app.xml`). */
  producer: string | null;
  producerFamily: 'word' | 'libreoffice' | 'unknown';
  appVersion: string | null;
  /** Moderni Word (2013+) dijelovi; Word 2010 ih ne pise. */
  modernWordParts: string[];
}

const SEPARATOR_TYPES = /w:type="(?:separator|continuationSeparator)"/;

/** Broj `w:footnote`/`w:endnote` zapisa koji NISU separatori. */
function realNoteCount(xml: string | undefined, tag: 'footnote' | 'endnote'): number {
  if (!xml) return 0;
  const blocks = xml.match(new RegExp(`<w:${tag}\\b[^>]*>`, 'g')) ?? [];
  return blocks.filter((open) => !SEPARATOR_TYPES.test(open)).length;
}

function countMatches(xml: string | undefined, re: RegExp): number {
  if (!xml) return 0;
  return (xml.match(re) ?? []).length;
}

/**
 * Obitelj alata iz `<Application>`.
 *
 * Za Apple Pages NE postoji izmjerena vrijednost na ovom stroju, pa `family` nikad ne poprima
 * 'pages' na temelju nagadjanja; takav dokument ostaje 'unknown'.
 *
 * GRANA ZA GOOGLE DOCS JE UKLONJENA 2026-09-08, i to isto pravilo primijenjeno dosljedno. Bila je
 * napisana kao `/Google/i.test(application)`, dakle pogodjena, i mjerenje nad 457 stvarnih radova
 * (`Lekta-korpus`) ne daje NIJEDAN dokument s takvim `<Application>`:
 *
 *     241  Microsoft Office Word          20  LibreOffice/26.2.5.2$Windows_X86_64
 *      49  Microsoft Macintosh Word        8  LibreOffice/25.2.3.2$Linux_X86_64
 *       8  Microsoft Word 12.0.0           2  <pseudonimizirano> Office Word
 *     129  app.xml BEZ <Application>       0  bilo sto s "Google"
 *
 * Google Docs izvoz je onih 129: `docProps/app.xml` postoji, ali je element `<Properties/>` PRAZAN,
 * uz `docProps/custom.xml` i direktorijske zapise u zipu. Iz `<Application>` se takav dokument ne
 * moze prepoznati, jer tog elementa nema, pa je 'unknown' ISTINIT odgovor ove funkcije. Identitet
 * Google Docsa zato zivi ondje gdje je i izmjeren, kao oblik `gdocs/potpis` u `docx-shapes.ts`,
 * koji gleda paket a ne niz.
 */
export function producerFamilyOf(application: string | null): DocxFeatures['producerFamily'] {
  if (!application) return 'unknown';
  if (/^LibreOffice\//i.test(application) || /^OpenOffice/i.test(application)) return 'libreoffice';
  if (/Microsoft/i.test(application)) return 'word';
  return 'unknown';
}

export function deriveDocxFeatures(parts: DocxParts): DocxFeatures {
  const doc = parts['word/document.xml'] ?? '';
  const app = parts['docProps/app.xml'] ?? '';
  const application = /<Application>([^<]*)<\/Application>/.exec(app)?.[1]?.trim() || null;
  const footnotes = realNoteCount(parts['word/footnotes.xml'], 'footnote');
  const endnotes = realNoteCount(parts['word/endnotes.xml'], 'endnote');

  const hasTocField = /TOC\s+\\?o|<w:instrText[^>]*>[^<]*TOC/i.test(doc);
  // Naslov "Sadrzaj" bez polja: LibreOffice izvoz ga zna proizvesti, i to je tocno stanje u kojem
  // `toc-field-fixer` ima sto raditi.
  const hasTocHeading = /<w:t[^>]*>\s*(?:Sadr[žz]aj|Contents|Table of Contents)\s*<\/w:t>/i.test(doc);

  const modernWordParts = ['word/people.xml', 'word/commentsExtended.xml', 'word/commentsIds.xml']
    .filter((name) => parts[name] !== undefined);

  return {
    sections: countMatches(doc, /<w:sectPr\b/g),
    paragraphs: countMatches(doc, /<w:p[\s/>]/g),
    tables: countMatches(doc, /<w:tbl>/g),
    images: countMatches(doc, /<w:drawing>|<w:pict>/g),
    footnotes,
    endnotes,
    endnotesPartPresent: parts['word/endnotes.xml'] !== undefined,
    comments: countMatches(parts['word/comments.xml'], /<w:comment\b/g),
    trackedChanges: countMatches(doc, /<w:ins\b|<w:del\b/g),
    hasTocField,
    hasTocHeadingWithoutField: hasTocHeading && !hasTocField,
    fields: countMatches(doc, /<w:fldChar\b|<w:instrText\b/g),
    producer: application,
    producerFamily: producerFamilyOf(application),
    appVersion: /<AppVersion>([^<]*)<\/AppVersion>/.exec(app)?.[1]?.trim() || null,
    modernWordParts,
  };
}

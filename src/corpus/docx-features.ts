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
  producerFamily: 'word' | 'libreoffice' | 'google-docs' | 'unknown';
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
 */
export function producerFamilyOf(application: string | null): DocxFeatures['producerFamily'] {
  if (!application) return 'unknown';
  if (/^LibreOffice\//i.test(application) || /^OpenOffice/i.test(application)) return 'libreoffice';
  if (/Microsoft/i.test(application)) return 'word';
  if (/Google/i.test(application)) return 'google-docs';
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

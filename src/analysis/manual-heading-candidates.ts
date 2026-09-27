import { extractReferences } from '../citations/author-year';

/**
 * Kandidati za rucno oblikovan naslov (`structure.heading.word-styles`): numeriran kratak odlomak
 * bez Heading stila, izvan sadrzaja.
 *
 * T26: numerirana stavka literature ("1. Aston, E. (1991). ...") nije rucno oblikovan naslov.
 * Izmjereno 2026-09-27: 12 od 14 uskladjenih fixtura (docx-authored) gubilo je 2/4 boda iskljucivo
 * zbog takvih stavki. Iskljucuje se odlomak koji extractReferences svrstava u zapis literature I koji
 * sam izgleda kao zapis: godina uz zavrsnu tocku ili zagradu, ili poveznica. Samo clanstvo nije dovoljno
 * (Codex #184 F1, F2): numerirani podnaslov "1. Knjige" i naslov iza zalutalog odlomka "Literatura"
 * takoder postaju zapisi, a to su upravo rucno oblikovani naslovi koje ova provjera trazi.
 *
 * Vraca i `refData`, jer ga analiza dalje koristi za citate; granica literature je jedna za oba nalaza.
 */
export interface HeadingCandidateParagraph {
  text: string;
  index?: number;
  headingLevel?: number | null;
  styleName?: string | null;
}

const YEAR_OR_NO_DATE = /\b(?:1[5-9]|20)\d{2}[a-z]?\b|\((?:b\.g\.|b\.d\.|n\.d\.|s\.a\.)\)/i;
const ENDS_LIKE_ENTRY = /[.)\]]\s*$/;
const HAS_LINK = /https?:\/\/|doi:|doi\.org/i;
const NUMBERED_SHORT = /^\d+(?:\.\d+)*\.?\s+[\p{Lu}]/u;

function looksLikeBibEntry(text: string): boolean {
  return YEAR_OR_NO_DATE.test(text) && (ENDS_LIKE_ENTRY.test(text) || HAS_LINK.test(text));
}

export function manualHeadingCandidates<P extends HeadingCandidateParagraph>(paragraphs: P[], language: string) {
  const refData = extractReferences(paragraphs, language);
  const bibEntryParagraphs = new Set<number>(
    refData.entries
      .flatMap((e: { ps: number[] }) => e.ps.map((n) => n - 1))
      .filter((i: number) => looksLikeBibEntry(String(paragraphs[i]?.text || ''))),
  );
  const candidates = paragraphs.filter((p, i) => !bibEntryParagraphs.has(i) && !p.headingLevel
    && !/^toc/i.test(p.styleName || '') && !/sadrzaj|contents/i.test(p.styleName || '')
    && NUMBERED_SHORT.test(p.text) && p.text.length < 140);
  return { candidates, refData };
}

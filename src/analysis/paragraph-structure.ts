/**
 * Lokalni, deterministički opis odlomaka za Repair panel.
 *
 * Modul ne odlučuje umjesto profila koje se vrijednosti moraju primijeniti. On samo
 * pronalazi signale koje korisnik može potvrditi: lažnu uvlačnu oznaku, ručni prijelom
 * retka, prvi odlomak nakon naslova i kratke blokove pogodne za keep-lines.
 */

export interface ParagraphFormattingCandidate {
  paragraphIndex: number;
  text: string;
  fakeIndent: boolean;
  manualLineBreak: boolean;
  firstAfterHeading: boolean;
  shortBlock: boolean;
  section: 'body' | 'abstract' | 'quote' | 'references';
  selectedByDefault: boolean;
  evidence: string[];
}

export interface ParagraphFormattingStructure {
  candidates: ParagraphFormattingCandidate[];
  manualLineBreakParagraphs: number[];
  summary: {
    total: number;
    fakeIndentCount: number;
    manualLineBreakCount: number;
    shortBlockCount: number;
  };
}

function normalized(text: string): string {
  return text.toLocaleLowerCase('hr-HR').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
}

function sectionFor(text: string, current: ParagraphFormattingCandidate['section']): ParagraphFormattingCandidate['section'] {
  const value = normalized(text);
  if (/^(sažetak|sazetak|abstract)\b/.test(value)) return 'abstract';
  if (/^(literatura|bibliografija|popis literature|izvori i literatura|references|bibliography)\b/.test(value)) return 'references';
  if (/^(citirani tekst|citat|quote)\b/.test(value)) return 'quote';
  return current;
}

/**
 * `preview.paragraphs` već dolazi iz lokalnog DOCX parsera i zadržava tabove i `w:br`
 * kao `\t` i `\n`, pa za ovu analizu nije potrebno ponovno čitati ZIP.
 */
export function analyzeParagraphFormatting(paragraphs: Array<{ index?: number; text?: string; headingLevel?: number | null; num?: boolean; runs?: Array<{ text?: string }> }>): ParagraphFormattingStructure {
  let section: ParagraphFormattingCandidate['section'] = 'body';
  let previousWasHeading = false;
  const candidates: ParagraphFormattingCandidate[] = [];
  for (const [position, paragraph] of paragraphs.entries()) {
    const text = String(paragraph.text ?? '');
    const rawText = Array.isArray(paragraph.runs) && paragraph.runs.length
      ? paragraph.runs.map((run) => String(run.text ?? '')).join('')
      : text;
    const index = Number.isInteger(paragraph.index) ? Number(paragraph.index) : position;
    const heading = typeof paragraph.headingLevel === 'number' && paragraph.headingLevel >= 1;
    if (heading) {
      section = sectionFor(text, section);
      previousWasHeading = true;
      continue;
    }
    section = sectionFor(text, section);
    const fakeIndent = /^[ \t]+/.test(rawText) && paragraph.num !== true;
    const manualLineBreak = /\r?\n/.test(rawText);
    const shortBlock = text.trim().length > 0 && text.trim().length <= 240;
    const evidence: string[] = [];
    if (fakeIndent) evidence.push('početni tabulatori ili razmaci');
    if (manualLineBreak) evidence.push('ručni prijelom retka');
    if (previousWasHeading) evidence.push('prvi odlomak nakon naslova');
    if (shortBlock) evidence.push('kratak blok');
    // Ne nudimo prazne odlomke kao formatne kandidate.
    if (evidence.length && text.trim()) {
      candidates.push({
        paragraphIndex: index,
        text: text.trim(),
        fakeIndent,
        manualLineBreak,
        firstAfterHeading: previousWasHeading,
        shortBlock,
        section,
        // Lažna uvlaka je sigurna za predodabir samo izvan popisa i citatnih blokova.
        selectedByDefault: fakeIndent && section === 'body' && !manualLineBreak,
        evidence,
      });
    }
    previousWasHeading = false;
  }
  const manualLineBreakParagraphs = candidates.filter((candidate) => candidate.manualLineBreak).map((candidate) => candidate.paragraphIndex);
  return {
    candidates,
    manualLineBreakParagraphs,
    summary: {
      total: candidates.length,
      fakeIndentCount: candidates.filter((candidate) => candidate.fakeIndent).length,
      manualLineBreakCount: manualLineBreakParagraphs.length,
      shortBlockCount: candidates.filter((candidate) => candidate.shortBlock).length,
    },
  };
}

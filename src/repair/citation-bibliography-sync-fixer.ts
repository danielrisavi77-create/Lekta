import { citationAnchorFingerprint } from '../analysis/citation-bibliography-sync.ts';
import { analyzeBibliographyStructure, bibliographyAnchorFingerprint } from '../analysis/bibliography-structure.ts';
import { extractCitationOccurrences } from '../citations/author-year.ts';
import type { DocxXmlParts, FixerOutput } from './fixers.ts';

export interface CitationBibliographySyncParams {
  version: 1;
  profileFingerprint?: string;
  citations: Array<{
    id: string;
    paragraphIndex: number;
    start: number;
    end: number;
    anchorFingerprint: string;
    replacementText: string;
    reason: string;
  }>;
  entries: Array<{
    id: string;
    paragraphIndices: number[];
    anchorFingerprint: string;
    action: 'add' | 'replace' | 'remove';
    replacementText?: string;
    /**
     * Z36: samo uz 'add' bez korisnikova teksta. Upucuje na citat iz `citations[]` (provjeren
     * otiskom); prezime i godinu fixer sam cita iz tog citata u dokumentu, nikad iz klijentova teksta.
     */
    citationId?: string;
    insertionAnchor?: { paragraphIndex: number; anchorFingerprint: string };
  }>;
  mappings: Array<{ citationId: string; bibliographyEntryId: string; confirmed: true }>;
}

interface ParagraphRange { start: number; end: number; index: number; }
interface TextNode { start: number; end: number; xmlStart: number; xmlEnd: number; attrs: string; text: string; }
interface Operation { start: number; end: number; replacement: string; priority: number; }

const noOp = (parts: DocxXmlParts, reason: FixerOutput['reason'], skippedActions: string[] = []): FixerOutput => ({ parts, applied: false, beforeLabel: '', afterLabel: '', reason, ...(skippedActions.length ? { skippedActions } : {}) });

/**
 * Z36, odluka vlasnika 2026-10-03: kad korisnik ne upise zapis, umece se predlozak. Iz citata dolaze
 * SAMO prezime i godina; sve ostalo su ova konstantna polja u uglatim zagradama, koja korisnik
 * popunjava u Wordu. Lekta ne izmislja ime, naslov ni izdavaca.
 */
const ENTRY_TEMPLATE_FIELDS = { name: '[ime]', title: '[Naslov djela]', publisher: '[Mjesto: Izdavač]' } as const;
const SKIPPED_NO_SOURCE = 'zapis literature nije umetnut: prezime i godina ne mogu se sigurno procitati iz citata';
const SKIPPED_NO_LIST = 'zapis literature nije umetnut: popis literature nije prepoznat oko zadnjeg zapisa';

function entryTemplate(author: string, year: string): string {
  return `${author}, ${ENTRY_TEMPLATE_FIELDS.name}. (${year}). ${ENTRY_TEMPLATE_FIELDS.title}. ${ENTRY_TEMPLATE_FIELDS.publisher}.`;
}

/** Usporedba "isti zapis": razmaci sazeti, rubovi odrezani. */
function sameEntryText(left: string, right: string): boolean {
  return left.replace(/\s+/g, ' ').trim() === right.replace(/\s+/g, ' ').trim();
}

function decodeXml(value: string): string {
  return value.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_match, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, n: string) => String.fromCodePoint(Number.parseInt(n, 16)));
}

function encodeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function paragraphRanges(xml: string): ParagraphRange[] {
  const masked = xml.replace(/<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>/g, (match) => ' '.repeat(match.length));
  const token = /<w:p(?=[\s/>])[^>]*\/?>|<\/w:p\s*>/g;
  const stack: number[] = [];
  const ranges: ParagraphRange[] = [];
  let match: RegExpExecArray | null;
  while ((match = token.exec(masked))) {
    if (/^<\/w:p/.test(match[0])) {
      const start = stack.pop();
      if (start !== undefined) ranges.push({ start, end: match.index + match[0].length, index: ranges.length + 1 });
    } else if (/\/\s*>$/.test(match[0])) {
      ranges.push({ start: match.index, end: match.index + match[0].length, index: ranges.length + 1 });
    } else stack.push(match.index);
  }
  return ranges.sort((a, b) => a.start - b.start).map((range, index) => ({ ...range, index: index + 1 }));
}

function paragraphText(block: string): string {
  return [...block.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/gi)].map((match) => decodeXml(match[1])).join('');
}

function unsupported(block: string): boolean {
  return /<w:(?:fldSimple|fldChar|instrText|sdt|ins|del|moveFrom|moveTo|drawing|pict|object|bookmarkStart|bookmarkEnd|commentRangeStart|commentRangeEnd)\b|<w:hyperlink\b|<w:(?:tab|br|cr)\b/i.test(block);
}

function excludedContainer(xml: string, range: ParagraphRange): boolean {
  const before = xml.slice(0, range.start);
  return before.lastIndexOf('<w:tc') > before.lastIndexOf('</w:tc>') || before.lastIndexOf('<w:txbxContent') > before.lastIndexOf('</w:txbxContent>');
}

function textNodes(block: string): TextNode[] {
  const nodes: TextNode[] = [];
  let offset = 0;
  for (const match of block.matchAll(/<w:t\b([^>]*)>([\s\S]*?)<\/w:t>/gi)) {
    const text = decodeXml(match[2]);
    const xmlStart = match.index ?? 0;
    const xmlEnd = xmlStart + match[0].length;
    nodes.push({ start: offset, end: offset + text.length, xmlStart, xmlEnd, attrs: match[1], text });
    offset += text.length;
  }
  return nodes;
}

function replaceTextRange(block: string, start: number, end: number, replacement: string): string | null {
  if (start < 0 || end <= start || unsupported(block)) return null;
  const nodes = textNodes(block);
  if (!nodes.length || end > nodes.at(-1)!.end) return null;
  const first = nodes.findIndex((node) => start >= node.start && start <= node.end);
  const last = nodes.findIndex((node) => end >= node.start && end <= node.end);
  if (first < 0 || last < first) return null;
  const edits = new Map<number, string>();
  for (let index = first; index <= last; index++) {
    const node = nodes[index];
    const localStart = index === first ? start - node.start : 0;
    const localEnd = index === last ? end - node.start : node.text.length;
    const value = index === first
      ? `${node.text.slice(0, localStart)}${replacement}${node.text.slice(localEnd)}`
      : node.text.slice(localEnd);
    edits.set(index, value);
  }
  let result = block;
  for (let index = last; index >= first; index--) {
    const node = nodes[index];
    result = result.slice(0, node.xmlStart) + `<w:t${node.attrs}>${encodeXml(edits.get(index) || '')}</w:t>` + result.slice(node.xmlEnd);
  }
  return result;
}

function replaceParagraphText(block: string, replacement: string): string | null {
  const text = paragraphText(block);
  return replaceTextRange(block, 0, text.length, replacement);
}

function paragraphTemplate(block: string, replacement: string): string | null {
  if (unsupported(block)) return null;
  const pPr = block.match(/<w:pPr\b[\s\S]*?<\/w:pPr>/i)?.[0] || '';
  const rPr = block.match(/<w:r\b[^>]*>\s*(<w:rPr\b[\s\S]*?<\/w:rPr>)?/i)?.[1] || '';
  return `<w:p>${pPr}<w:r>${rPr}<w:t xml:space="preserve">${encodeXml(replacement)}</w:t></w:r></w:p>`;
}

function bibliographyFingerprintMatches(
  indices: number[],
  blocks: Map<number, string>,
  expected: string,
): boolean {
  const text = indices.map((index) => paragraphText(blocks.get(index) || '')).join(' ').trim();
  return bibliographyAnchorFingerprint(indices, text) === expected;
}

function validateParams(params: CitationBibliographySyncParams): boolean {
  if (params.version !== 1 || !Array.isArray(params.citations) || !Array.isArray(params.entries) || !Array.isArray(params.mappings)) return false;
  if (params.citations.length > 500 || params.entries.length > 500 || params.mappings.length > 1000) return false;
  const citationIds = new Set<string>();
  for (const citation of params.citations) {
    if (!citation || typeof citation.id !== 'string' || !citation.id.trim() || citationIds.has(citation.id) || !Number.isInteger(citation.paragraphIndex) || citation.paragraphIndex < 1 || !Number.isInteger(citation.start) || !Number.isInteger(citation.end) || citation.start < 0 || citation.end <= citation.start || citation.end - citation.start > 1000 || typeof citation.anchorFingerprint !== 'string' || citation.anchorFingerprint.length > 100 || typeof citation.replacementText !== 'string' || citation.replacementText.length > 1000 || typeof citation.reason !== 'string' || citation.reason.length > 500) return false;
    citationIds.add(citation.id);
  }
  const entryIds = new Set<string>();
  for (const entry of params.entries) {
    if (!entry || typeof entry.id !== 'string' || !entry.id.trim() || entryIds.has(entry.id) || !Array.isArray(entry.paragraphIndices) || entry.paragraphIndices.some((index) => !Number.isInteger(index) || index < 1) || typeof entry.anchorFingerprint !== 'string' || entry.anchorFingerprint.length > 100 || !['add', 'replace', 'remove'].includes(entry.action)) return false;
    if (entry.action === 'replace' && (typeof entry.replacementText !== 'string' || entry.replacementText.length > 20000)) return false;
    if (entry.action === 'remove' && entry.replacementText !== undefined) return false;
    if (entry.action !== 'add' && entry.citationId !== undefined) return false;
    if (entry.action === 'add') {
      if (!entry.insertionAnchor || !Number.isInteger(entry.insertionAnchor.paragraphIndex) || entry.insertionAnchor.paragraphIndex < 1 || typeof entry.insertionAnchor.anchorFingerprint !== 'string') return false;
      if (entry.replacementText !== undefined && (typeof entry.replacementText !== 'string' || entry.replacementText.length > 20000)) return false;
      if (entry.citationId !== undefined && (typeof entry.citationId !== 'string' || !citationIds.has(entry.citationId))) return false;
      // Korisnikov tekst ILI citat iz kojeg fixer sam cita prezime i godinu; bez ijednog nema zapisa.
      if (!entry.replacementText?.trim() && entry.citationId === undefined) return false;
    }
    entryIds.add(entry.id);
  }
  const mappedCitations = new Set<string>();
  for (const mapping of params.mappings) {
    if (!mapping || mapping.confirmed !== true || !citationIds.has(mapping.citationId) || typeof mapping.bibliographyEntryId !== 'string' || !mapping.bibliographyEntryId.trim() || mappedCitations.has(mapping.citationId)) return false;
    mappedCitations.add(mapping.citationId);
  }
  return true;
}

/**
 * Z36: prezime i godina citata, procitani ISTIM parserom kojim ih je nasla analiza
 * (`extractCitationOccurrences`), nad tekstom odlomka u dokumentu, nikad iz klijentova teksta.
 * Samo zagradni oblik "(Novak, 2022)": u narativnom ("prema Novaku (2022)") prezime moze biti
 * sklonjeno, pa bi zapis nosio krivi oblik. Bez sigurnog izvora vraca null i nista se ne umece.
 */
function citationSource(text: string, start: number, end: number | null): { author: string; year: string } | null {
  const found = extractCitationOccurrences([{ index: 1, text }])
    .find((detail) => detail.form === 'parenthetical' && detail.start === start && (end === null || detail.end === end));
  // Parser ostavlja trag skracenice ("Kovač et al." daje "Kovač ."); zapis nosi samo prezime.
  const author = found?.author.replace(/[\s.,;:]+$/u, '') ?? '';
  if (!author || !found?.year || /\d/.test(author) || !/^\p{L}/u.test(author)) return null;
  return { author, year: found.year };
}

interface ListPosition { offset: number; key: string; language: 'hr' | 'en'; }

/**
 * Z36: abecedno mjesto predloska. Zapise i kljuc racuna ISTA analiza koja sudi "Abecedni poredak
 * literature" (`analyzeBibliographyStructure`, `sortKey`, hr ili en kolacija), pa umetnuti zapis ne
 * moze srusiti provjeru koju bi trebao postovati. Jezik je onaj u kojem analiza prepoznaje popis sa
 * sidrom. Gledaju se samo zapisi do sidra (zadnjeg zapisa analize); popis se ne preslaguje, nego
 * zapis ide ispred prvog zapisa s vecim kljucem, inace iza zadnjeg.
 */
function alphabeticalPosition(
  xml: string,
  ranges: ParagraphRange[],
  structures: (language: 'hr' | 'en') => ReturnType<typeof analyzeBibliographyStructure>,
  anchorIndex: number,
  template: string,
): ListPosition | null {
  for (const language of ['hr', 'en'] as const) {
    const entries = structures(language).entries.filter((entry) => entry.paragraphIndices[0] <= anchorIndex);
    if (!entries.some((entry) => entry.paragraphIndices.includes(anchorIndex))) continue;
    const heading = language === 'en' ? 'References' : 'Literatura';
    const key = analyzeBibliographyStructure([{ index: 1, text: heading }, { index: 2, text: template }], language).entries[0]?.sortKey;
    if (!key) return null;
    const next = entries.find((entry) => !!entry.sortKey && entry.sortKey.localeCompare(key, language) > 0);
    const target = next ? ranges[next.paragraphIndices[0] - 1] : ranges[(entries.at(-1)?.paragraphIndices.at(-1) ?? 0) - 1];
    if (!target || excludedContainer(xml, target)) return null;
    return { offset: next ? target.start : target.end, key, language };
  }
  return null;
}

export function citationBibliographySyncFixer(parts: DocxXmlParts, params: CitationBibliographySyncParams): FixerOutput {
  if (!validateParams(params)) return noOp(parts, 'invalid-params');
  const ranges = paragraphRanges(parts.documentXml);
  const blocks = new Map<number, string>();
  for (const range of ranges) blocks.set(range.index, parts.documentXml.slice(range.start, range.end));
  const knownEntryIds = new Set(params.entries.map((entry) => entry.id));
  for (const range of ranges) knownEntryIds.add(`bibliography-${range.index}`);
  if (params.mappings.some((mapping) => !knownEntryIds.has(mapping.bibliographyEntryId))) return noOp(parts, 'invalid-params');
  const citationParagraphs = new Set<number>();
  const entryParagraphs = new Set<number>();
  const citationGroups = new Map<number, { range: ParagraphRange; block: string; citations: CitationBibliographySyncParams['citations'] }>();
  const operations: Operation[] = [];
  // Z36: citati provjereni otiskom u ovom prolazu i citati cija je zamjena vec upisana.
  const verifiedCitations = new Set<string>();
  const appliedCitations = new Set<string>();
  const skippedActions: string[] = [];
  let changed = false;
  let alreadyApplied = 0;

  for (const citation of params.citations) {
    const range = ranges[citation.paragraphIndex - 1];
    const block = range && blocks.get(citation.paragraphIndex);
    if (!range || !block || excludedContainer(parts.documentXml, range) || unsupported(block)) return noOp(parts, 'unsupported-structure');
    if (citationAnchorFingerprint(citation.paragraphIndex, paragraphText(block)) !== citation.anchorFingerprint) {
      const current = paragraphText(block);
      const leading = current.length - current.trimStart().length;
      if (current.slice(citation.start + leading, citation.start + leading + citation.replacementText.length) === citation.replacementText) { alreadyApplied += 1; appliedCitations.add(citation.id); continue; }
      return noOp(parts, 'invalid-params');
    }
    verifiedCitations.add(citation.id);
    const leading = paragraphText(block).length - paragraphText(block).trimStart().length;
    const adjusted = { ...citation, start: citation.start + leading, end: citation.end + leading };
    if (citationGroups.get(citation.paragraphIndex)?.citations.some((other) => other.start < adjusted.end && adjusted.start < other.end)) return noOp(parts, 'invalid-params');
    citationParagraphs.add(citation.paragraphIndex);
    const group = citationGroups.get(citation.paragraphIndex) || { range, block, citations: [] };
    group.citations.push(adjusted);
    citationGroups.set(citation.paragraphIndex, group);
  }
  for (const group of citationGroups.values()) {
    let next = group.block;
    for (const citation of [...group.citations].sort((a, b) => b.start - a.start)) {
      // Nepromijenjen citat (npr. izvor predloska zapisa) se ne prepisuje: zamjena bi spojila runove.
      if (paragraphText(next).slice(citation.start, citation.end) === citation.replacementText) continue;
      const replacement = replaceTextRange(next, citation.start, citation.end, citation.replacementText);
      if (replacement === null) return noOp(parts, 'unsupported-structure');
      next = replacement;
    }
    if (next !== group.block) changed = true;
    operations.push({ start: group.range.start, end: group.range.end, replacement: next, priority: 1 });
  }

  const structureCache = new Map<'hr' | 'en', ReturnType<typeof analyzeBibliographyStructure>>();
  const structures = (language: 'hr' | 'en') => {
    if (!structureCache.has(language)) {
      const paragraphs = ranges.map((range) => ({ index: range.index, text: paragraphText(blocks.get(range.index) || '').trim() }));
      structureCache.set(language, analyzeBibliographyStructure(paragraphs, language));
    }
    return structureCache.get(language)!;
  };
  const plannedTexts: string[] = [];
  const templateInsertions = new Map<number, Array<{ key: string; text: string; xml: string; language: 'hr' | 'en' }>>();
  for (const entry of params.entries) {
    if (entry.action === 'add') {
      const literal = entry.replacementText?.trim() ? entry.replacementText : null;
      let insertionText = literal;
      if (literal === null) {
        const citation = params.citations.find((candidate) => candidate.id === entry.citationId)!;
        const current = paragraphText(blocks.get(citation.paragraphIndex) || '').trim();
        let source: { author: string; year: string } | null = null;
        if (verifiedCitations.has(citation.id)) {
          source = citationSource(current, citation.start, citation.end);
          // Ako isti recept mijenja i taj citat, prezime i godina moraju ostati isti; inace bi drugi
          // prolaz procitao drugi zapis i umetnuo ga ponovno.
          const replaced = source && citationSource(`(${citation.replacementText})`, 1, null);
          if (source && (!replaced || replaced.author !== source.author || replaced.year !== source.year)) return noOp(parts, 'invalid-params');
        } else if (appliedCitations.has(citation.id)) {
          source = citationSource(current, citation.start, citation.start + citation.replacementText.length);
        }
        if (!source) { skippedActions.push(SKIPPED_NO_SOURCE); continue; }
        insertionText = entryTemplate(source.author, source.year);
      }
      const text = insertionText!;
      // Idempotencija: zapis koji u dokumentu vec postoji, ili ga ovaj recept vec umece, ne umece se ponovno.
      if ([...blocks.values()].some((block) => sameEntryText(paragraphText(block), text))) { alreadyApplied += 1; continue; }
      if (plannedTexts.some((planned) => sameEntryText(planned, text))) continue;
      const anchor = entry.insertionAnchor!;
      const range = ranges[anchor.paragraphIndex - 1];
      const block = range && blocks.get(anchor.paragraphIndex);
      if (!range || !block || excludedContainer(parts.documentXml, range) || citationParagraphs.has(anchor.paragraphIndex)) return noOp(parts, 'unsupported-structure');
      if (!bibliographyFingerprintMatches([anchor.paragraphIndex], blocks, anchor.anchorFingerprint)
        && citationAnchorFingerprint(anchor.paragraphIndex, paragraphText(block)) !== anchor.anchorFingerprint) return noOp(parts, 'invalid-params');
      const insertion = paragraphTemplate(block, text);
      if (!insertion) return noOp(parts, 'unsupported-structure');
      if (literal !== null) {
        // Korisnikov potvrdjeni zapis: zateceno ponasanje, doslovno i iza sidra.
        operations.push({ start: range.end, end: range.end, replacement: insertion, priority: 2 });
      } else {
        const position = alphabeticalPosition(parts.documentXml, ranges, structures, anchor.paragraphIndex, text);
        if (!position) { skippedActions.push(SKIPPED_NO_LIST); continue; }
        const group = templateInsertions.get(position.offset) || [];
        group.push({ key: position.key, text, xml: insertion, language: position.language });
        templateInsertions.set(position.offset, group);
      }
      plannedTexts.push(text);
      changed = true;
      continue;
    }
    if (!entry.paragraphIndices.length) return noOp(parts, 'invalid-params');
    const entryRanges = entry.paragraphIndices.map((index) => ranges[index - 1]);
    if (entryRanges.some((range) => !range) || entry.paragraphIndices.some((index) => citationParagraphs.has(index))) return noOp(parts, 'unsupported-structure');
    if (new Set(entry.paragraphIndices).size !== entry.paragraphIndices.length) return noOp(parts, 'invalid-params');
    const firstRange = entryRanges[0];
    const firstBlock = blocks.get(entry.paragraphIndices[0])!;
    if (excludedContainer(parts.documentXml, firstRange) || entryRanges.some((range) => excludedContainer(parts.documentXml, range) || unsupported(blocks.get(range.index) || ''))) return noOp(parts, 'unsupported-structure');
    if (!bibliographyFingerprintMatches(entry.paragraphIndices, blocks, entry.anchorFingerprint)
      && !(entry.paragraphIndices.length === 1 && citationAnchorFingerprint(entry.paragraphIndices[0], paragraphText(firstBlock)) === entry.anchorFingerprint)) return noOp(parts, 'invalid-params');
    for (const index of entry.paragraphIndices) entryParagraphs.add(index);
    const replacement = entry.action === 'replace' ? replaceParagraphText(firstBlock, entry.replacementText!) : '';
    if (entry.action === 'replace' && replacement === null) return noOp(parts, 'unsupported-structure');
    operations.push({ start: firstRange.start, end: firstRange.end, replacement: replacement || '', priority: 1 });
    for (const range of entryRanges.slice(1)) operations.push({ start: range.start, end: range.end, replacement: '', priority: 1 });
    changed = true;
  }

  if (params.entries.some((entry) => entryParagraphs.has(entry.paragraphIndices[0])) && params.citations.some((citation) => entryParagraphs.has(citation.paragraphIndex))) return noOp(parts, 'invalid-params');
  // Predlosci na istom mjestu idu jednim umetanjem, medusobno abecedno. Prioritet 0: na istom
  // pomaku se umecu POSLIJE zamjene odlomka koji tamo pocinje, pa ga ne mogu prepoloviti.
  for (const [offset, group] of templateInsertions) {
    const ordered = [...group].sort((a, b) => a.key.localeCompare(b.key, a.language) || a.text.localeCompare(b.text, a.language));
    operations.push({ start: offset, end: offset, replacement: ordered.map((item) => item.xml).join(''), priority: 0 });
  }
  if (!operations.length) return noOp(parts, alreadyApplied ? 'already-ok' : skippedActions.length ? 'unsupported-structure' : 'no-target', skippedActions);
  let xml = parts.documentXml;
  for (const operation of operations.sort((a, b) => b.start - a.start || b.priority - a.priority)) {
    xml = xml.slice(0, operation.start) + operation.replacement + xml.slice(operation.end);
  }
  if (!changed || xml === parts.documentXml) return noOp(parts, skippedActions.length && !alreadyApplied ? 'unsupported-structure' : 'already-ok', skippedActions);
  return { parts: { ...parts, documentXml: xml }, applied: true, beforeLabel: 'potvrđene veze citata i literature', afterLabel: 'citatnice i bibliografija sinkronizirane', ...(skippedActions.length ? { skippedActions } : {}) };
}

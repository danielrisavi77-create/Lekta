export type TypographyCategory =
  | 'multiple-spaces'
  | 'punctuation-spacing'
  | 'missing-space-after-punctuation'
  | 'quotation-marks'
  | 'dash-consistency'
  | 'ellipsis'
  | 'nonbreaking-spaces'
  | 'decimal-comma'
  | 'percent-format'
  | 'date-format'
  | 'nested-quotes'
  | 'ordinal-numbers'
  | 'number-unit-spacing'
  | 'abbreviation-consistency'
  | 'repeated-punctuation'
  | 'text-tabs'
  | 'manual-line-breaks';

export type TypographyConfidence = 'high' | 'medium' | 'low';

export interface CroatianTypographyRules {
  quotationMarks?: { primary?: 'croatian' | 'english' | 'guillemets'; nested?: 'croatian' | 'english' | 'guillemets' };
  dash?: 'hyphen' | 'en' | 'em' | 'preserve';
  decimalSeparator?: ',' | '.';
  percentSpacing?: 'none' | 'space' | 'nbsp';
  dateFormat?: string;
  ordinalFormat?: 'dot' | 'no-dot';
  numberUnitSpacing?: 'space' | 'nbsp';
  nonbreakingPatterns?: string[];
  abbreviations?: Record<string, string>;
}

export interface TypographyOccurrence {
  id: string;
  category: TypographyCategory;
  paragraphIndex: number;
  textNodeIndex?: number;
  start: number;
  end: number;
  rawText: string;
  proposedText: string;
  confidence: TypographyConfidence;
  evidence: string[];
  anchorFingerprint: string;
  safe: boolean;
  skipReason?: string;
}

export interface TypographyStructure {
  occurrences: TypographyOccurrence[];
  byCategory: Partial<Record<TypographyCategory, TypographyOccurrence[]>>;
  skipped: Array<{ paragraphIndex: number; reason: string }>;
  summary: {
    total: number;
    high: number;
    medium: number;
    low: number;
    safe: number;
    needsConfirmation: number;
    text: string;
  };
}

export interface BodyParagraphRange {
  index: number;
  start: number;
  end: number;
  xml: string;
  fingerprint: string;
}

export interface EditableXmlNode {
  kind: 'text' | 'tab' | 'line-break';
  start: number;
  end: number;
  xml: string;
  text?: string;
}

const CATEGORIES: TypographyCategory[] = [
  'multiple-spaces', 'punctuation-spacing', 'missing-space-after-punctuation', 'quotation-marks',
  'dash-consistency', 'ellipsis', 'nonbreaking-spaces', 'decimal-comma', 'percent-format',
  'date-format', 'nested-quotes', 'ordinal-numbers', 'number-unit-spacing', 'abbreviation-consistency',
  'repeated-punctuation', 'text-tabs', 'manual-line-breaks',
];

function hash(value: string): string {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) { h ^= value.charCodeAt(i); h = Math.imul(h, 16777619); }
  return `typo-${(h >>> 0).toString(16).padStart(8, '0')}`;
}

export function xmlDecode(value: string): string {
  return value.replace(/&(?:amp|lt|gt|quot|apos|#39|#x27);/g, (entity) => ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&#39;': "'", '&#x27;': "'" }[entity] ?? entity));
}

export function xmlEncode(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function tagName(token: string): string | null {
  const match = token.match(/^<\/?\s*([\w:.-]+)/);
  return match?.[1] ?? null;
}

/** Vraća samo w:p koji su izravna djeca w:body. Ugniježđene tablice i tekstualni okviri se ne vraćaju. */
export function extractBodyParagraphs(documentXml: string): BodyParagraphRange[] {
  const bodyStart = documentXml.indexOf('<w:body');
  const bodyEnd = bodyStart < 0 ? -1 : documentXml.indexOf('</w:body>', bodyStart);
  if (bodyStart < 0 || bodyEnd < 0) return [];
  const body = documentXml.slice(bodyStart, bodyEnd + '</w:body>'.length);
  const tokenRe = /<[^>]+>/g;
  const stack: string[] = [];
  const paragraphs: BodyParagraphRange[] = [];
  let paragraphStart = -1;
  let paragraphDepth = 0;
  let token: RegExpExecArray | null;
  while ((token = tokenRe.exec(body))) {
    const raw = token[0];
    const name = tagName(raw);
    if (!name || raw.startsWith('<?') || raw.startsWith('<!')) continue;
    const closing = /^<\//.test(raw);
    const selfClosing = /\/\s*>$/.test(raw);
    if (!closing && name === 'w:p' && stack.length === 1 && stack[0] === 'w:body') {
      paragraphStart = bodyStart + token.index;
      paragraphDepth = stack.length;
    }
    if (closing && name === 'w:p' && paragraphStart >= 0 && stack.length === paragraphDepth + 1) {
      const end = bodyStart + token.index + raw.length;
      const xml = documentXml.slice(paragraphStart, end);
      paragraphs.push({ index: paragraphs.length + 1, start: paragraphStart, end, xml, fingerprint: hash(xml) });
      paragraphStart = -1;
    }
    if (selfClosing) continue;
    if (closing) { if (stack.at(-1) === name) stack.pop(); }
    else stack.push(name);
  }
  return paragraphs;
}

/**
 * Rasponi `<w:tabs>` blokova (definicije tab-stopova). `w:tabs` se po shemi ne ugnjezduje, pa je
 * plosno trazenje dovoljno. Sluzi kao DRUGA brana uz pravilo "tabulator nema atribute": ulazni
 * dokument koji vec sam po sebi krsi shemu (`<w:tab/>` bez atributa unutar `<w:tabs>`) inace bi
 * prosao kroz prvu.
 */
function tabStopRanges(paragraphXml: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  for (const match of paragraphXml.matchAll(/<w:tabs\b[^>]*>[\s\S]*?<\/w:tabs>/g)) {
    const start = match.index ?? 0;
    ranges.push([start, start + match[0].length]);
  }
  return ranges;
}

export function editableNodes(paragraphXml: string): EditableXmlNode[] {
  const nodes: EditableXmlNode[] = [];
  /**
   * TABULATOR U RUNU NEMA ATRIBUTE; DEFINICIJA TAB-STOPA IH UVIJEK IMA.
   *
   * Ista oznaka `w:tab` nosi dva nesrodna znacenja (OOXML):
   *   `<w:r><w:tab/></w:r>`                                 tabulator u tekstu, tip CT_Empty
   *   `<w:pPr><w:tabs><w:tab w:val="right" .../></w:tabs>`  tab-stop, tip CT_TabStop (`w:val` obavezan)
   *
   * Uzorak je bio `<w:tab\b[^>]*\/>` nad CIJELIM XML-om odlomka, dakle i nad `<w:pPr>`, pa je
   * hvatao oba. Pozivatelj (`croatian-typography-fixer`, kategorija `text-tabs`) urediv cvor
   * zamjenjuje s `<w:t>`, cime je nastajalo `<w:tabs><w:t> </w:t></w:tabs>`. To je dobro
   * OBLIKOVAN, ali shemom NEVALJAN XML.
   *
   * IZMJERENO 2026-09-03 (Word 14.0, `OpenAndRepair=false`): takav paket Word odbija otvoriti, uz
   * "error processing the XML file, Part: /word/document.xml". Nakon ZADANOG popravka pogodjeno je
   * 6 od 38 stvarnih studentskih radova, a 0 od 7 commitanih fixtura. Ni `package-integrity`
   * (`integrityFailure` je bio `null` na svih 6) ni Tier 1 (`lxml`) ga ne vide: paket je dobro
   * oblikovan, pa ga hvata tek shema, odnosno Word.
   */
  const re = /<w:t\b[^>]*>[\s\S]*?<\/w:t>|<w:tab\s*\/>|<w:br\b[^>]*\/>/g;
  const stopRanges = tabStopRanges(paragraphXml);
  let match: RegExpExecArray | null;
  while ((match = re.exec(paragraphXml))) {
    const xml = match[0];
    if (stopRanges.some(([start, end]) => match!.index >= start && match!.index < end)) continue;
    if (/^<w:t\b/i.test(xml)) {
      const inner = xml.match(/^<w:t\b[^>]*>([\s\S]*?)<\/w:t>$/i)?.[1] ?? '';
      nodes.push({ kind: 'text', start: match.index, end: match.index + xml.length, xml, text: xmlDecode(inner) });
    } else if (/^<w:tab\b/i.test(xml)) nodes.push({ kind: 'tab', start: match.index, end: match.index + xml.length, xml });
    else if (!/w:type\s*=\s*["'](?:page|column|textWrapping)["']/i.test(xml)) nodes.push({ kind: 'line-break', start: match.index, end: match.index + xml.length, xml });
  }
  return nodes;
}

function protectedParagraph(xml: string): string | null {
  const protectedTag = /<w:(?:tbl|hyperlink|fldChar|fldSimple|instrText|sdt|ins|del|moveFrom|moveTo|txbxContent)\b|<(?:m:oMath|w:customXml)\b/i;
  if (protectedTag.test(xml)) return 'složena Word struktura (polje, poveznica, tablica, SDT ili revizija)';
  return null;
}

function riskyText(text: string): boolean {
  return /(?:https?:\/\/|www\.|doi\.org|\bdoi:\s*10\.|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|```|<\/?[A-Za-z])/i.test(text);
}

function categoryForSafe(text: string, add: (category: TypographyCategory, start: number, end: number, proposed: string, confidence: TypographyConfidence, evidence: string[]) => void): void {
  for (const match of text.matchAll(/ {2,}/g)) add('multiple-spaces', match.index ?? 0, (match.index ?? 0) + match[0].length, ' ', 'high', ['više uzastopnih unutarnjih razmaka']);
  for (const match of text.matchAll(/\s+([,.;:!?])/g)) add('punctuation-spacing', match.index ?? 0, (match.index ?? 0) + match[0].length, match[1], 'high', ['razmak neposredno prije interpunkcije']);
  for (const match of text.matchAll(/([,;!?])(?=[\p{L}\p{N}])/gu)) add('missing-space-after-punctuation', (match.index ?? 0), (match.index ?? 0) + match[0].length, `${match[1]} `, 'high', ['nedostaje razmak nakon interpunkcije']);
  for (const match of text.matchAll(/(?<![\d.])\.(?=[\p{L}])/gu)) add('missing-space-after-punctuation', match.index ?? 0, (match.index ?? 0) + 1, '. ', 'high', ['nedostaje razmak nakon točke']);
  for (const match of text.matchAll(/([!?])\1+/g)) add('repeated-punctuation', match.index ?? 0, (match.index ?? 0) + match[0].length, match[1], 'high', ['ponovljen je isti interpunkcijski znak']);
  for (const match of text.matchAll(/\.\.\./g)) add('ellipsis', match.index ?? 0, (match.index ?? 0) + 3, '…', 'high', ['tri točke mogu se zapisati jednim znakom trotočke']);
}

function profileOccurrences(text: string, rules: CroatianTypographyRules, add: (category: TypographyCategory, start: number, end: number, proposed: string, confidence: TypographyConfidence, evidence: string[]) => void): void {
  if (rules.decimalSeparator === ',') for (const m of text.matchAll(/(?<![\w])\d+\.(\d+)(?![\w])/g)) add('decimal-comma', m.index ?? 0, (m.index ?? 0) + m[0].length, `${m[0].slice(0, m[0].indexOf('.'))},${m[1]}`, 'medium', ['profil traži decimalni zarez']);
  if (rules.percentSpacing === 'space' || rules.percentSpacing === 'nbsp') for (const m of text.matchAll(/(\d)\s*%/g)) add('percent-format', m.index ?? 0, (m.index ?? 0) + m[0].length, `${m[1]}${rules.percentSpacing === 'nbsp' ? '\u00a0' : ' '}%`, 'medium', ['profil definira razmak uz postotak']);
  if (rules.numberUnitSpacing === 'space' || rules.numberUnitSpacing === 'nbsp') for (const m of text.matchAll(/(\d)(?=(?:km|cm|mm|kg|g|mg|m|h|min|s)\b)/gi)) add('number-unit-spacing', m.index ?? 0, (m.index ?? 0) + m[0].length + 0, `${m[1]}${rules.numberUnitSpacing === 'nbsp' ? '\u00a0' : ' '}`, 'medium', ['profil definira razmak između broja i jedinice']);
  if (rules.dash && rules.dash !== 'preserve') {
    const wanted = rules.dash === 'en' ? '–' : rules.dash === 'em' ? '—' : '-';
    for (const m of text.matchAll(/(?<!https?:)[-–—](?!\d)/g)) if (m[0] !== wanted) add('dash-consistency', m.index ?? 0, (m.index ?? 0) + 1, wanted, 'medium', ['profil definira vrstu crtice']);
  }
  if (rules.abbreviations) for (const [from, to] of Object.entries(rules.abbreviations)) for (const m of text.matchAll(new RegExp(`\\b${from.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\b`, 'g'))) add('abbreviation-consistency', m.index ?? 0, (m.index ?? 0) + m[0].length, to, 'medium', ['profil definira standardnu kraticu']);
  if (rules.quotationMarks?.primary) {
    const quote = rules.quotationMarks.primary === 'guillemets' ? ['«', '»'] : rules.quotationMarks.primary === 'english' ? ['“', '”'] : ['„', '“'];
    let opening = true;
    for (const m of text.matchAll(/["“”„‟«»]/g)) { const replacement = opening ? quote[0] : quote[1]; opening = !opening; if (m[0] !== replacement) add('quotation-marks', m.index ?? 0, (m.index ?? 0) + 1, replacement, 'medium', ['profil definira tipografske navodnike']); }
  }
  if (rules.quotationMarks?.nested) {
    const quote = rules.quotationMarks.nested === 'guillemets' ? ['‹', '›'] : rules.quotationMarks.nested === 'english' ? ['‘', '’'] : ['‚', '’'];
    for (const m of text.matchAll(/'([^']+)'/g)) add('nested-quotes', m.index ?? 0, (m.index ?? 0) + m[0].length, `${quote[0]}${m[1]}${quote[1]}`, 'medium', ['profil definira ugniježđene navodnike']);
  }
  if (rules.nonbreakingPatterns) for (const pattern of rules.nonbreakingPatterns) {
    if (!pattern || pattern.length > 100) continue;
    const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    for (const m of text.matchAll(new RegExp(escaped, 'g'))) {
      const replacement = m[0].replace(/ /g, '\u00a0');
      if (replacement !== m[0]) add('nonbreaking-spaces', m.index ?? 0, (m.index ?? 0) + m[0].length, replacement, 'medium', ['profil definira nedjeljivi obrazac']);
    }
  }
  if (rules.dateFormat) for (const m of text.matchAll(/\b\d{1,2}\.\s*\d{1,2}\.\s*\d{4}\b/g)) if (!/\.$/.test(m[0])) add('date-format', m.index ?? 0, (m.index ?? 0) + m[0].length, `${m[0]}.`, 'medium', ['profil definira završnu točku datuma']);
  if (rules.ordinalFormat === 'dot') for (const m of text.matchAll(/\b\d+(?=\s+(?:poglavlje|stranica|razina|mjesto)\b)/gi)) add('ordinal-numbers', m.index ?? 0, (m.index ?? 0) + m[0].length, `${m[0]}.`, 'medium', ['profil traži točku uz redni broj']);
}

export interface TypographyAnalysisOptions { rules?: CroatianTypographyRules; profileRulesVerified?: boolean; }

export function analyzeTypographyStructure(documentXml: string, options: TypographyAnalysisOptions = {}): TypographyStructure {
  const occurrences: TypographyOccurrence[] = [];
  const skipped: Array<{ paragraphIndex: number; reason: string }> = [];
  for (const paragraph of extractBodyParagraphs(documentXml)) {
    const skip = protectedParagraph(paragraph.xml);
    if (skip) { skipped.push({ paragraphIndex: paragraph.index, reason: skip }); continue; }
    const nodes = editableNodes(paragraph.xml);
    let nodeIndex = 0;
    for (const node of nodes) {
      if (node.kind === 'tab' || node.kind === 'line-break') {
        occurrences.push({ id: hash(`${paragraph.fingerprint}:${nodeIndex}:${node.kind}`), category: node.kind === 'tab' ? 'text-tabs' : 'manual-line-breaks', paragraphIndex: paragraph.index, textNodeIndex: nodeIndex, start: 0, end: 1, rawText: node.kind === 'tab' ? '\\t' : '\\n', proposedText: ' ', confidence: 'high', evidence: [node.kind === 'tab' ? 'tabulator unutar jednostavnog teksta' : 'ručni prijelom retka u jednostavnom odlomku'], anchorFingerprint: paragraph.fingerprint, safe: true });
        nodeIndex++;
        continue;
      }
      const text = node.text ?? '';
      if (riskyText(text)) { nodeIndex++; continue; }
      const candidates: Array<{ category: TypographyCategory; start: number; end: number; proposed: string; confidence: TypographyConfidence; evidence: string[] }> = [];
      categoryForSafe(text, (category, start, end, proposed, confidence, evidence) => candidates.push({ category, start, end, proposed, confidence, evidence }));
      if (options.profileRulesVerified && options.rules) profileOccurrences(text, options.rules, (category, start, end, proposed, confidence, evidence) => candidates.push({ category, start, end, proposed, confidence, evidence }));
      candidates.sort((a, b) => a.start - b.start || a.end - b.end);
      let lastEnd = -1;
      for (const candidate of candidates) {
        if (candidate.start < lastEnd) continue;
        lastEnd = candidate.end;
        occurrences.push({ id: hash(`${paragraph.fingerprint}:${nodeIndex}:${candidate.category}:${candidate.start}:${candidate.end}:${candidate.proposed}`), category: candidate.category, paragraphIndex: paragraph.index, textNodeIndex: nodeIndex, start: candidate.start, end: candidate.end, rawText: text.slice(candidate.start, candidate.end), proposedText: candidate.proposed, confidence: candidate.confidence, evidence: candidate.evidence, anchorFingerprint: paragraph.fingerprint, safe: candidate.confidence === 'high' });
      }
      nodeIndex++;
    }
  }
  const byCategory: Partial<Record<TypographyCategory, TypographyOccurrence[]>> = {};
  for (const category of CATEGORIES) byCategory[category] = occurrences.filter((occurrence) => occurrence.category === category);
  const high = occurrences.filter((x) => x.confidence === 'high').length;
  const medium = occurrences.filter((x) => x.confidence === 'medium').length;
  const low = occurrences.length - high - medium;
  return { occurrences, byCategory, skipped, summary: { total: occurrences.length, high, medium, low, safe: occurrences.filter((x) => x.safe).length, needsConfirmation: occurrences.filter((x) => !x.safe).length, text: `${occurrences.length} nalaza, ${high} sigurnih, ${medium + low} traže potvrdu` } };
}

export function paragraphFingerprint(xml: string): string { return hash(xml); }

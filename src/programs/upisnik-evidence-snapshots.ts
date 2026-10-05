import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { extname } from 'node:path';
import { extractText, getDocumentProxy } from 'unpdf';
import { Window, type Node as HtmlNode, type Element as HtmlElement } from 'happy-dom';
import { DOMParser, type Node as XmlNode, type Element as XmlElement } from '@xmldom/xmldom';
import { readZip } from '../repair/zip-codec';
const WordExtractor = createRequire(import.meta.url)('word-extractor') as new () => { extract(bytes: Buffer): Promise<{ getBody(): string }> };
// unpdf 1.7.0 nema engines ogranicenje (1.8.x trazi Node >=22); isti tekst izmjeren na Node 20 i 24.
const decode = (b: Uint8Array) => new TextDecoder().decode(b);
export const UPISNIK_SNAPSHOT_RATCHET_CEILING = 380;
interface EvidenceRow { programCode: string; evidence: { sourceUrl: string; sourceLocator: string; quote: string } }
export interface UpisnikEvidenceFile { decisions: EvidenceRow[]; exclusions: EvidenceRow[]; integratedGraduateCoverage?: EvidenceRow[] }
/** Rucno potvrdjen prijepis skenirane snimke: sha256 tijela OCR pratitelja koje je covjek usporedio sa snimkom. */
export interface OcrTranscript { textHash: string; verifiedBy: string; verifiedAt: string }
export interface SnapshotSource { url: string; snapshotPath?: string; snapshotHash?: string; ocrTranscript?: OcrTranscript }
export interface SnapshotRatchet { schemaVersion: number; entries: Array<{ programCode: string; kind: 'decision' | 'exclusion'; sourceUrl: string }> }
const ratchetKey = (e: { programCode: string; kind: string; sourceUrl: string }) => JSON.stringify([e.programCode, e.kind, e.sourceUrl]);
function normalizeSnapshotQuote(s: string): string {
  return s.normalize('NFC').replace(/\u00ad/gu, '').replace(/(?<=\p{L})-\r?\n(?=\p{L})/gu, '')
    .replace(/[\u2018\u2019\u201a\u201b\u02bc]/gu, "'").replace(/[\u201c\u201d\u201e\u201f]/gu, '"')
    .replace(/\s+/gu, ' ').trim().toLocaleLowerCase('hr');
}
// Gard stiti od gresaka agenata: izmisljenog ili krivog citata, spajanja odlomaka
// i teksta koji je ocito skriven ili obrisan. Nije obrana od namjerno konstruiranog
// sadrzaja: CSS escapea/komentara u style atributu, klasa i vanjskog CSS-a,
// opacity:0, DOCX tema ili uvjetnog oblikovanja.
const inlineHtml = new Set('a abbr b bdi bdo cite code data dfn em font i kbd label mark q s samp small span strong sub sup time u var wbr'.split(' '));
const omittedHtml = new Set('head script style noscript template title iframe object svg canvas dialog datalist noembed noframes rp option'.split(' '));
function htmlText(s: string): string {
  const window = new Window({ settings: {
    disableJavaScriptEvaluation: true, enableJavaScriptEvaluation: false,
    disableJavaScriptFileLoading: true, disableCSSFileLoading: true,
    enableImageFileLoading: false, disableIframePageLoading: true,
    navigation: { disableMainFrameNavigation: true, disableChildFrameNavigation: true, disableChildPageNavigation: true, disableFallbackToSetURL: true },
  } });
  try {
    const document = new window.DOMParser().parseFromString(s, 'text/html');
    let result = '';
    const visit = (node: HtmlNode): void => {
      if (node.nodeType === 3) { result += node.nodeValue ?? ''; return; }
      if (node.nodeType !== 1) return;
      const element = node as HtmlElement;
      const name = element.localName.toLowerCase();
      if ((omittedHtml.has(name) && !(name === 'dialog' && element.hasAttribute('open'))) ||
        element.hasAttribute('hidden') ||
        element.getAttribute('aria-hidden')?.toLowerCase() === 'true' ||
        /display\s*:\s*none|visibility\s*:\s*hidden/iu.test(element.getAttribute('style') ?? '')) return;
      if (!inlineHtml.has(name)) result += '\n\n';
      if (name === 'details' && !element.hasAttribute('open')) {
        for (const child of Array.from(element.childNodes)) {
          if (child.nodeType === 1 && (child as HtmlElement).localName.toLowerCase() === 'summary') visit(child);
        }
      } else {
        for (const child of Array.from(element.childNodes)) visit(child);
      }
      if (!inlineHtml.has(name)) result += '\n\n';
    };
    visit(document.documentElement);
    return result;
  } finally { window.close(); }
}
const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const MC_NS = 'http://schemas.openxmlformats.org/markup-compatibility/2006';
function parseWordXml(xml: string) {
  try {
    // xmldom 0.9.12 ne prijavljuje goli ampersand u atributu kroz onError.
    if (/&(?!(?:amp|lt|gt|quot|apos|#[0-9]+|#x[0-9a-fA-F]+);)/u.test(xml)) throw new Error('DOCX XML nije ispravan');
    const document = new DOMParser({ onError: () => { throw new Error('DOCX XML nije ispravan'); } }).parseFromString(xml, 'application/xml');
    if (!document?.documentElement) throw new Error('DOCX XML nije ispravan');
    return document;
  } catch { throw new Error('DOCX XML nije ispravan'); }
}
function wordName(node: XmlNode, name: string): node is XmlElement {
  return node.nodeType === 1 && node.namespaceURI === WORD_NS && node.localName === name;
}
function wordChildren(node: XmlNode): XmlNode[] { return Array.from(node.childNodes); }
function direct(node: XmlNode, name: string): XmlElement | undefined {
  return wordChildren(node).find((child): child is XmlElement => wordName(child, name));
}
function wordAttr(node: XmlElement, name: string): string | null {
  return node.getAttributeNS(WORD_NS, name);
}
function descendants(node: XmlNode, name: string): XmlElement[] {
  return wordChildren(node).flatMap((child) => [
    ...(wordName(child, name) ? [child] : []), ...descendants(child, name),
  ]);
}
function vanish(properties?: XmlElement): boolean | undefined {
  if (!properties) return undefined;
  const marker = direct(properties, 'vanish');
  if (!marker) return undefined;
  return !['0', 'false', 'off'].includes((wordAttr(marker, 'val') ?? '').toLowerCase());
}
interface WordStyle { basedOn?: string; hidden: boolean }
interface WordStyles { character: Map<string, WordStyle>; paragraph: Map<string, WordStyle>; defaultHidden: boolean; defaultParagraph: string | null; defaultCharacter: string | null }
function wordStyles(stylesXml?: string): WordStyles {
  const character = new Map<string, WordStyle>();
  const paragraph = new Map<string, WordStyle>();
  // Zadani stil (w:default) vrijedi za odlomak bez pStyle i run bez rStyle.
  let defaultParagraph: string | null = null;
  let defaultCharacter: string | null = null;
  if (!stylesXml) return { character, paragraph, defaultHidden: false, defaultParagraph, defaultCharacter };
  const doc = parseWordXml(stylesXml);
  const defaults = descendants(doc, 'docDefaults')[0];
  const defaultHidden = vanish(defaults && direct(direct(defaults, 'rPrDefault') ?? defaults, 'rPr')) === true;
  for (const style of descendants(doc, 'style')) {
    const id = wordAttr(style, 'styleId');
    const type = wordAttr(style, 'type');
    if (!id) continue;
    const entry = { basedOn: direct(style, 'basedOn') ? wordAttr(direct(style, 'basedOn')!, 'val') ?? undefined : undefined, hidden: vanish(direct(style, 'rPr')) === true };
    const isDefault = ['1', 'true', 'on'].includes((wordAttr(style, 'default') ?? '').toLowerCase());
    if (type === 'paragraph') { paragraph.set(id, entry); if (isDefault) defaultParagraph = id; }
    else if (type === 'character' || !type) { character.set(id, entry); if (isDefault && type === 'character') defaultCharacter = id; }
  }
  return { character, paragraph, defaultHidden, defaultParagraph, defaultCharacter };
}
function styleHidden(id: string | null, styles: Map<string, WordStyle>): boolean {
  const seen = new Set<string>();
  while (id && !seen.has(id)) {
    seen.add(id);
    const style = styles.get(id);
    if (!style) break;
    if (style.hidden) return true;
    id = style.basedOn ?? null;
  }
  return false;
}
function docxText(xml: string, stylesXml?: string): string {
  const document = parseWordXml(xml);
  const styles = wordStyles(stylesXml);
  const fields: boolean[] = [];
  let result = '';
  const omitted = new Set(['del', 'moveFrom', 'instrText', 'delText']);
  const runParents = new Set(['p', 'hyperlink', 'ins', 'smartTag', 'sdtContent', 'fldSimple', 'customXml']);
  const visit = (node: XmlNode, parent: XmlNode | null = null, suppressed = false, paragraphHidden = false): void => {
    if (node.nodeType === 9) { for (const child of wordChildren(node)) visit(child, node, suppressed, paragraphHidden); return; }
    if (node.nodeType !== 1) return;
    if (node.namespaceURI === MC_NS && node.localName === 'AlternateContent') {
      const children = wordChildren(node);
      const chosen = children.find((c) => c.nodeType === 1 && c.namespaceURI === MC_NS && c.localName === 'Fallback') ??
        children.find((c) => c.nodeType === 1 && c.namespaceURI === MC_NS && c.localName === 'Choice');
      if (chosen) for (const child of wordChildren(chosen)) visit(child, parent, suppressed, paragraphHidden);
      return;
    }
    const hidden = suppressed || (node.namespaceURI === WORD_NS && omitted.has(node.localName ?? ''));
    if (wordName(node, 'p')) {
      const pStyle = direct(direct(node, 'pPr') ?? node, 'pStyle');
      const pHidden = styleHidden((pStyle ? wordAttr(pStyle, 'val') : null) ?? styles.defaultParagraph, styles.paragraph);
      if (!hidden) result += '\n\n';
      for (const child of wordChildren(node)) visit(child, node, hidden, pHidden);
      if (!hidden) result += '\n\n';
      return;
    }
    if (wordName(node, 'r')) {
      const deletedFieldRun = suppressed && parent?.namespaceURI === WORD_NS && (parent.localName === 'del' || parent.localName === 'moveFrom');
      if (!parent || parent.namespaceURI !== WORD_NS || (!runParents.has(parent.localName ?? '') && !deletedFieldRun)) return;
      const properties = direct(node, 'rPr');
      const ownVanish = vanish(properties);
      const rStyle = properties && direct(properties, 'rStyle');
      const styleIsHidden = styleHidden((rStyle ? wordAttr(rStyle, 'val') : null) ?? styles.defaultCharacter, styles.character);
      const runHidden = hidden || paragraphHidden || ownVanish === true || styleIsHidden || (styles.defaultHidden && ownVanish !== false);
      for (const child of wordChildren(node)) {
        if (wordName(child, 'fldChar')) {
          const kind = wordAttr(child, 'fldCharType');
          if (kind === 'begin') fields.push(false);
          else if (kind === 'separate' && fields.length) fields[fields.length - 1] = true;
          else if (kind === 'end') fields.pop();
        } else if (!runHidden && !fields.includes(false)) {
          if (wordName(child, 't')) result += child.textContent ?? '';
          else if (wordName(child, 'tab')) result += ' ';
          else if (wordName(child, 'noBreakHyphen')) result += '-';
          else if (wordName(child, 'softHyphen')) result += '\u00ad';
          else if (wordName(child, 'br') || wordName(child, 'cr')) result += '\n';
        }
      }
      return;
    }
    if (wordName(node, 'rPr') || wordName(node, 'pPr') || wordName(node, 'sdtPr')) return;
    for (const child of wordChildren(node)) visit(child, node, hidden, paragraphHidden);
  };
  visit(document);
  return result;
}
async function pdfSnapshotText(bytes: Uint8Array): Promise<string> {
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  return (await extractText(pdf, { mergePages: true })).text;
}
async function snapshotText(source: SnapshotSource, bytes: Uint8Array, readBytes: (path: string) => Uint8Array | null): Promise<string> {
  const path = source.snapshotPath!;
  switch (extname(path).toLowerCase()) {
    case '.html': case '.htm': return htmlText(decode(bytes));
    case '.pdf': {
      const text = await pdfSnapshotText(bytes);
      if (text.replace(/\s/gu, '').length > 200) return text;
      const companion = readBytes(path.replace(/\.pdf$/iu, '.snapshot-ocr.txt'));
      const lines = (companion ? decode(companion).replace(/^\uFEFF/u, '') : '').replace(/\r\n/gu, '\n').split('\n');
      if (lines[0] !== `# snapshotHash: ${source.snapshotHash}`) throw new Error('skenirana snimka bez OCR pratitelja');
      const body = lines.slice(2).join('\n');
      const bodyHash = createHash('sha256').update(body, 'utf8').digest('hex');
      if (lines[1] !== `# ocrTextHash: ${bodyHash}`) throw new Error('OCR pratitelj ne odgovara hashu vlastitog tijela');
      // Strojni OCR je pomocni tekst: zaglavlje veze pratitelja uz PDF, ali ne dokazuje da je tekst tocan prijepis.
      // Dokaz je samo prijepis koji je covjek potvrdio uz snimku i koji registar veze uz isti hash tijela (Codex R1).
      // Bez toga je ishod nepoznat i odluka ne prolazi. Stari *-ocr.txt i *.ocr.txt nikad nisu dokaz.
      const transcript = source.ocrTranscript;
      if (!transcript || transcript.textHash !== bodyHash || !transcript.verifiedBy?.trim() || !transcript.verifiedAt?.trim()) {
        throw new Error('skenirana snimka bez rucno potvrdjenog prijepisa (OCR je pomocni tekst)');
      }
      return body;
    }
    case '.docx': {
      const parts = await readZip(bytes);
      const xml = parts.find((e) => e.name === 'word/document.xml');
      if (!xml) throw new Error('DOCX bez word/document.xml');
      const styles = parts.find((e) => e.name === 'word/styles.xml');
      return docxText(decode(xml.data), styles ? decode(styles.data) : undefined);
    }
    case '.doc': case '.dot': return (await new WordExtractor().extract(Buffer.from(bytes))).getBody().replace(/\n/gu, '\n\n');
    default: throw new Error('nepodrzana vrsta snimke');
  }
}
export async function verifyUpisnikEvidenceSnapshots(
  file: UpisnikEvidenceFile, registry: SnapshotSource[], readBytes: (path: string) => Uint8Array | null, ratchet: SnapshotRatchet, baseline: SnapshotRatchet,
): Promise<string[]> {
  const problems: string[] = [];
  const registered = new Map(registry.map((s) => [s.url, s]));
  const ratchetKeys = new Set(ratchet.entries.map(ratchetKey));
  const baselineKeys = new Set(baseline.entries.map(ratchetKey));
  const active = new Set<string>();
  if (ratchet.schemaVersion !== 1 || baseline.schemaVersion !== 1) problems.push('nepoznata verzija ratcheta');
  for (const entry of ratchet.entries) if (!baselineKeys.has(ratchetKey(entry)))
    problems.push(`ratchet zapis izvan zamrznute osnovice: ${entry.kind} ${entry.programCode} ${entry.sourceUrl}`);
  if (ratchet.entries.length > UPISNIK_SNAPSHOT_RATCHET_CEILING) problems.push(`ratchet prelazi strop ${UPISNIK_SNAPSHOT_RATCHET_CEILING}: ${ratchet.entries.length}`);
  if (ratchetKeys.size !== ratchet.entries.length) problems.push('duplicirani ratchet zapis');
  const rows = [
    ...file.decisions.map((e) => ({ ...e, kind: 'decision' as const })),
    ...(file.integratedGraduateCoverage ?? []).map((e) => ({ ...e, kind: 'decision' as const })),
    ...file.exclusions.map((e) => ({ ...e, kind: 'exclusion' as const })),
  ];
  const cache = new Map<string, Promise<string>>();
  for (const row of rows) {
    const label = `${row.kind} ${row.programCode}`;
    const key = ratchetKey({ programCode: row.programCode, kind: row.kind, sourceUrl: row.evidence.sourceUrl });
    active.add(key);
    const source = registered.get(row.evidence.sourceUrl);
    if (!source) {
      if (!ratchetKeys.has(key)) problems.push(`${label}: nova obvezujuca odluka bez registrirane snimke`);
      continue;
    }
    const quote = normalizeSnapshotQuote(row.evidence.quote);
    if (quote.length < 20) { problems.push(`${label}: citat kraci od 20 znakova`); continue; }
    if (!source.snapshotPath || !source.snapshotHash || !/^[a-f0-9]{64}$/u.test(source.snapshotHash)) {
      problems.push(`${label}: snimka ili hash nisu registrirani`); continue;
    }
    // Kljuc nosi i potvrdu prijepisa: dva zapisa iste snimke (npr. http i https URL) s razlicitom potvrdom
    // ne smiju dijeliti rezultat, jer provjera ocrTranscript ide unutar citanja (Codex runda 2).
    const transcript = source.ocrTranscript;
    const cacheKey = JSON.stringify([source.snapshotPath, source.snapshotHash,
      transcript ? [transcript.textHash, transcript.verifiedBy, transcript.verifiedAt] : null]);
    if (!cache.has(cacheKey)) cache.set(cacheKey, (async () => {
      const bytes = readBytes(source.snapshotPath!);
      if (!bytes) throw new Error('snimka nedostaje');
      if (createHash('sha256').update(bytes).digest('hex') !== source.snapshotHash) throw new Error('hash snimke ne odgovara registru');
      return snapshotText(source, bytes, readBytes);
    })());
    try {
      if (!(await cache.get(cacheKey)!).split(/\n\s*\n/u).some((paragraph) => normalizeSnapshotQuote(paragraph).includes(quote))) problems.push(`${label}: citat nije doslovan podniz snimke`);
    } catch (e) { problems.push(`${label}: ${e instanceof Error ? e.message : String(e)}`); }
  }
  for (const entry of ratchet.entries) if (!active.has(ratchetKey(entry)) || registered.has(entry.sourceUrl))
    problems.push(`zastarjeli ratchet zapis: ${entry.kind} ${entry.programCode} ${entry.sourceUrl}`);
  return problems;
}

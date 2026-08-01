import { normalize } from '../utils/helpers';
import { analyzeFieldIntegrity } from './field-integrity';

export type FinalDocumentInspectorCategory =
  | 'tracking'
  | 'revisions'
  | 'comments'
  | 'hidden-text'
  | 'private-metadata'
  | 'revision-metadata'
  | 'custom-xml'
  | 'header-footer'
  | 'watermark'
  | 'invisible-object'
  | 'bookmarks'
  | 'fields';

export type FinalDocumentInspectorSeverity = 'info' | 'warning' | 'error';
export type FinalDocumentInspectorAction =
  | 'disable-tracking'
  | 'review-revisions'
  | 'remove-comments'
  | 'remove-metadata'
  | 'remove-hidden-text'
  | 'remove-revision-ids'
  | 'update-fields'
  | 'remove-unreferenced-custom-xml'
  | 'review-only';

export interface FinalDocumentInspectorEvidence {
  part: string;
  location: string;
  fingerprint: string;
  display?: string;
  revisionId?: string;
  revisionKind?: 'ins' | 'del' | 'moveFrom' | 'moveTo';
  commentId?: string;
  field?: string;
  dirty?: boolean;
}

export interface FinalDocumentFinding {
  id: string;
  category: FinalDocumentInspectorCategory;
  severity: FinalDocumentInspectorSeverity;
  count: number;
  summary: string;
  evidence: FinalDocumentInspectorEvidence[];
  action: FinalDocumentInspectorAction;
  supported: boolean;
  defaultSelected: boolean;
  destructive: boolean;
  warning?: string;
}

export interface FinalDocumentInspector {
  version: 1;
  findings: FinalDocumentFinding[];
  summary: {
    revisions: number;
    comments: number;
    hiddenText: number;
    privateMetadata: number;
    customXmlParts: number;
    headerFooterRisks: number;
    watermarks: number;
    invisibleObjects: number;
    brokenBookmarks: number;
    staleFields: number;
  };
  packageParts: Array<{ name: string; kind: string; fingerprint: string }>;
}

export interface FinalDocumentInspectorInput {
  parts: Record<string, string>;
  names?: string[];
}

function hash(value: string): string {
  let result = 2166136261;
  for (const char of value) {
    result ^= char.codePointAt(0) ?? 0;
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(16).padStart(8, '0');
}

export function inspectorFingerprint(part: string, value: string): string {
  return `inspector-${hash(`${part}|${normalize(value)}`)}`;
}

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_m, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, n: string) => String.fromCodePoint(Number.parseInt(n, 16)));
}

function attr(tag: string, name: string): string {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`\\b${escaped}=["']([^"']*)["']`, 'i').exec(tag);
  return match ? decodeXml(match[1]) : '';
}

function text(xml: string): string {
  return [...xml.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t\s*>/gi)].map((m) => decodeXml(m[1])).join(' ');
}

function xmlKind(name: string): string {
  if (name === 'word/document.xml') return 'document';
  if (/^word\/header\d+\.xml$/i.test(name)) return 'header';
  if (/^word\/footer\d+\.xml$/i.test(name)) return 'footer';
  if (/comments\.xml$/i.test(name)) return 'comments';
  if (/^docProps\//i.test(name)) return 'metadata';
  if (/(^|\/)customXml\//i.test(name)) return 'custom-xml';
  if (/\.rels$/i.test(name)) return 'relationships';
  return 'xml';
}

function evidence(part: string, location: string, value: string, extra: Partial<FinalDocumentInspectorEvidence> = {}): FinalDocumentInspectorEvidence {
  return { part, location, fingerprint: inspectorFingerprint(part, `${location}|${value}`), ...extra };
}

function finding(
  id: string,
  category: FinalDocumentInspectorCategory,
  severity: FinalDocumentInspectorSeverity,
  summary: string,
  items: FinalDocumentInspectorEvidence[],
  action: FinalDocumentInspectorAction,
  options: Partial<Pick<FinalDocumentFinding, 'supported' | 'defaultSelected' | 'destructive' | 'warning'>> = {},
): FinalDocumentFinding {
  return {
    id, category, severity, count: items.length, summary, evidence: items, action,
    supported: options.supported ?? true,
    defaultSelected: options.defaultSelected ?? false,
    destructive: options.destructive ?? false,
    ...(options.warning ? { warning: options.warning } : {}),
  };
}

function revisionEvidence(parts: Record<string, string>): FinalDocumentInspectorEvidence[] {
  const out: FinalDocumentInspectorEvidence[] = [];
  for (const [part, xml] of Object.entries(parts)) {
    for (const match of xml.matchAll(/<w:(ins|del|moveFrom|moveTo)\b[^>]*>[\s\S]*?<\/w:\1\s*>/gi)) {
      const raw = match[0];
      const kind = match[1] as 'ins' | 'del' | 'moveFrom' | 'moveTo';
      out.push(evidence(part, `${kind}:${match.index ?? 0}`, raw.slice(0, 160), {
        revisionId: attr(raw, 'w:id') || undefined,
        revisionKind: kind,
        display: `autor: ${attr(raw, 'w:author') || 'nepoznat'}${attr(raw, 'w:date') ? `, ${attr(raw, 'w:date')}` : ''}`,
      }));
    }
  }
  return out;
}

function commentsEvidence(parts: Record<string, string>): FinalDocumentInspectorEvidence[] {
  const out: FinalDocumentInspectorEvidence[] = [];
  const comments = parts['word/comments.xml'] || Object.entries(parts).find(([name]) => /comments\.xml$/i.test(name))?.[1] || '';
  for (const match of comments.matchAll(/<w:comment\b[^>]*>[\s\S]*?<\/w:comment\s*>/gi)) {
    const raw = match[0];
    const id = attr(raw, 'w:id');
    out.push(evidence('word/comments.xml', `comment:${id || match.index}`, raw.slice(0, 180), {
      commentId: id || undefined,
      display: `${attr(raw, 'w:author') || 'nepoznat autor'}${attr(raw, 'w:date') ? `, ${attr(raw, 'w:date')}` : ''}`,
    }));
  }
  for (const [part, xml] of Object.entries(parts)) {
    for (const match of xml.matchAll(/<w:commentReference\b[^>]*w:id=["']([^"']+)["'][^>]*/gi)) {
      if (!out.some((item) => item.commentId === decodeXml(match[1]))) {
        out.push(evidence(part, `commentReference:${match[1]}`, match[0], { commentId: decodeXml(match[1]) }));
      }
    }
  }
  return out;
}

function metadataEvidence(parts: Record<string, string>): FinalDocumentInspectorEvidence[] {
  const fields: Array<{ part: string; tag: string; field: string }> = [
    { part: 'docProps/core.xml', tag: 'dc:creator', field: 'creator' },
    { part: 'docProps/core.xml', tag: 'cp:lastModifiedBy', field: 'lastModifiedBy' },
    { part: 'docProps/core.xml', tag: 'dcterms:created', field: 'created' },
    { part: 'docProps/core.xml', tag: 'dcterms:modified', field: 'modified' },
    { part: 'docProps/core.xml', tag: 'cp:revision', field: 'revision' },
    { part: 'docProps/app.xml', tag: 'Company', field: 'company' },
    { part: 'docProps/app.xml', tag: 'Manager', field: 'manager' },
    { part: 'docProps/app.xml', tag: 'Application', field: 'application' },
    { part: 'docProps/app.xml', tag: 'AppVersion', field: 'appVersion' },
  ];
  const out: FinalDocumentInspectorEvidence[] = [];
  for (const item of fields) {
    const xml = parts[item.part];
    if (!xml) continue;
    const match = new RegExp(`<${item.tag}\\b[^>]*>([\\s\\S]*?)<\\/${item.tag}>`, 'i').exec(xml);
    if (!match || !decodeXml(match[1]).trim()) continue;
    out.push(evidence(item.part, item.field, match[1], { field: item.field, display: decodeXml(match[1]).trim() }));
  }
  const custom = Object.entries(parts).find(([name]) => /docProps\/custom\.xml$/i.test(name))?.[1] || '';
  for (const match of custom.matchAll(/<property\b[^>]*>[\s\S]*?<\/property\s*>/gi)) {
    const raw = match[0];
    out.push(evidence('docProps/custom.xml', `property:${attr(raw, 'name') || match.index}`, raw.slice(0, 160), { field: attr(raw, 'name') || 'custom-property', display: attr(raw, 'name') }));
  }
  return out;
}

function hiddenEvidence(parts: Record<string, string>): FinalDocumentInspectorEvidence[] {
  const out: FinalDocumentInspectorEvidence[] = [];
  for (const [part, xml] of Object.entries(parts)) {
    for (const match of xml.matchAll(/<w:r\b[^>]*>[\s\S]*?<\/w:r\s*>/gi)) {
      const raw = match[0];
      if (/<w:(?:vanish|specVanish)\b/i.test(raw) && /<w:t\b/i.test(raw)) out.push(evidence(part, `hidden-run:${match.index ?? 0}`, text(raw).slice(0, 160), { display: text(raw).slice(0, 160) }));
    }
  }
  return out;
}

function bookmarkAndFieldEvidence(parts: Record<string, string>): { bookmarks: FinalDocumentInspectorEvidence[]; fields: FinalDocumentInspectorEvidence[] } {
  const starts = new Map<string, FinalDocumentInspectorEvidence>();
  const ends = new Map<string, FinalDocumentInspectorEvidence>();
  const refs: Array<{ name: string; part: string; raw: string }> = [];
  const fields: FinalDocumentInspectorEvidence[] = [];
  for (const [part, xml] of Object.entries(parts)) {
    for (const match of xml.matchAll(/<w:bookmarkStart\b[^>]*>/gi)) {
      const id = attr(match[0], 'w:id');
      if (id) starts.set(`${part}:${id}`, evidence(part, `bookmarkStart:${id}`, match[0], { display: attr(match[0], 'w:name') || id }));
    }
    for (const match of xml.matchAll(/<w:bookmarkEnd\b[^>]*>/gi)) {
      const id = attr(match[0], 'w:id');
      if (id) ends.set(`${part}:${id}`, evidence(part, `bookmarkEnd:${id}`, match[0]));
    }
    for (const match of xml.matchAll(/<w:(?:fldSimple|instrText)\b[^>]*>[\s\S]*?<\/w:(?:fldSimple|instrText)\s*>/gi)) {
      const raw = match[0];
      const fieldText = decodeXml(text(raw) || raw.replace(/<[^>]+>/g, ' '));
      const fieldMatch = /\b(REF|PAGEREF|HYPERLINK)\s+(?:\\l\s+)?["']?([^"'\s\\]+)["']?/i.exec(fieldText);
      fields.push(evidence(part, `field:${match.index ?? 0}`, fieldText.slice(0, 160), { display: fieldText.trim(), field: fieldMatch?.[1] || 'field', dirty: /w:dirty\b/i.test(raw) }));
      if (fieldMatch) refs.push({ name: fieldMatch[2], part, raw });
    }
    for (const match of xml.matchAll(/<w:fldChar\b[^>]*w:dirty=["'](?:true|1)["'][^>]*\/?>(?:[\s\S]*?<\/w:fldChar\s*>)?/gi)) {
      fields.push(evidence(part, `dirty-field:${match.index ?? 0}`, match[0], { field: 'dirty', dirty: true }));
    }
  }
  const broken: FinalDocumentInspectorEvidence[] = [];
  for (const [key, start] of starts) if (!ends.has(key)) broken.push(start);
  for (const [key, end] of ends) if (!starts.has(key)) broken.push(end);
  for (const ref of refs) {
    const exists = [...starts.values()].some((item) => item.display === ref.name);
    if (!exists) broken.push(evidence(ref.part, `dangling-reference:${ref.name}`, ref.raw, { display: ref.name }));
  }
  return { bookmarks: broken, fields };
}

export function analyzeFinalDocumentInspector(input: FinalDocumentInspectorInput): FinalDocumentInspector {
  const parts = input.parts;
  const names = input.names || Object.keys(parts);
  const packageParts = names.filter((name) => parts[name] !== undefined).map((name) => ({ name, kind: xmlKind(name), fingerprint: inspectorFingerprint(name, parts[name]) }));
  const findings: FinalDocumentFinding[] = [];
  const revisions = revisionEvidence(parts);
  const comments = commentsEvidence(parts);
  const metadata = metadataEvidence(parts);
  const hidden = hiddenEvidence(parts);
  const bookmarkFields = bookmarkAndFieldEvidence(parts);
  const sharedFields = analyzeFieldIntegrity({ parts });
  const settings = parts['word/settings.xml'] || '';
  const tracking = /<w:trackRevisions\b/i.test(settings);
  const rsids = Object.entries(parts).flatMap(([part, xml]) => [...xml.matchAll(/\bw:rsid[A-Za-z]+=["'][^"']+["']/gi)].map((match) => evidence(part, `rsid:${match.index ?? 0}`, match[0])));
  const customXmlNames = names.filter((name) => /(^|\/)customXml\//i.test(name));
  const customXmlTags = Object.entries(parts).flatMap(([part, xml]) => /<w:customXml\b/i.test(xml) ? [evidence(part, 'w:customXml', 'content-control/customXml')] : []);
  const customXml = [...customXmlNames.map((name) => evidence(name, 'package-part', name)), ...customXmlTags];
  const headerFooter = Object.entries(parts).flatMap(([part, xml]) => {
    if (!/^word\/(?:header|footer)\d+\.xml$/i.test(part)) return [];
    const visible = text(xml).replace(/\b(?:PAGE|NUMPAGES)\b/gi, ' ').trim();
    return /[\p{L}]/u.test(visible) ? [evidence(part, 'visible-text', visible.slice(0, 180), { display: visible.slice(0, 180) })] : [];
  });
  const watermark = Object.entries(parts).flatMap(([part, xml]) => /<v:shape\b|<v:textpath\b|watermark|<wps:wsp\b/i.test(xml) ? [evidence(part, 'watermark-or-shape', 'VML/DrawingML shape')] : []);
  const invisible = Object.entries(parts).flatMap(([part, xml]) => {
    const matches = [...xml.matchAll(/<w:object\b|<w:pict\b|<a:alpha\b[^>]*val=["']0["']|<wp:extent\b[^>]*cx=["']0["']/gi)];
    return matches.map((match) => evidence(part, `object:${match.index ?? 0}`, match[0]));
  });
  const dirtyFields = bookmarkFields.fields.filter((item) => item.dirty === true);
  const fieldCount = sharedFields.fields.length || bookmarkFields.fields.length;

  if (tracking) findings.push(finding('tracking-enabled', 'tracking', 'warning', 'Praćenje promjena je uključeno.', [evidence('word/settings.xml', 'trackRevisions', '<w:trackRevisions/>')], 'disable-tracking', { defaultSelected: true, destructive: false }));
  if (revisions.length) findings.push(finding('unaccepted-revisions', 'revisions', 'warning', 'Pronađene su neprihvaćene izmjene. Za svaku treba odabrati prihvati ili odbaci.', revisions, 'review-revisions', { supported: true, destructive: true, warning: 'Prihvaćanje ili odbacivanje mijenja sadržaj i uklanja revizijsku povijest.' }));
  if (comments.length) findings.push(finding('comments', 'comments', 'warning', 'Pronađeni su komentari i njihove reference.', comments, 'remove-comments', { destructive: true, warning: 'Uklanjanje komentara briše komentare iz čiste kopije.' }));
  if (metadata.length) findings.push(finding('private-metadata', 'private-metadata', 'warning', 'Pronađeni su osobni ili aplikacijski metapodaci.', metadata, 'remove-metadata', { defaultSelected: true, destructive: true, warning: 'Odabrana metapodatkovna polja bit će uklonjena.' }));
  if (hidden.length) findings.push(finding('hidden-text', 'hidden-text', 'warning', 'Pronađen je tekst označen kao skriven.', hidden, 'remove-hidden-text', { destructive: true, warning: 'Skriveni tekst može biti namjeran; uklanja se samo nakon potvrde.' }));
  if (rsids.length) findings.push(finding('revision-metadata', 'revision-metadata', 'info', 'Pronađeni su Wordovi revizijski identifikatori.', rsids, 'remove-revision-ids', { defaultSelected: true, destructive: false }));
  if (customXml.length) findings.push(finding('custom-xml', 'custom-xml', 'warning', 'Pronađeni su custom XML dijelovi ili customXml kontrole.', customXml, 'remove-unreferenced-custom-xml', { supported: customXmlNames.length > 0, destructive: true, warning: 'Povezani custom XML može pokvariti content controls i neće se automatski uklanjati.' }));
  if (headerFooter.length) findings.push(finding('header-footer-content', 'header-footer', 'warning', 'Zaglavlje ili podnožje sadrži vidljiv tekst koji nije samo numeriranje stranice.', headerFooter, 'review-only', { supported: false, destructive: false }));
  if (watermark.length) findings.push(finding('watermarks', 'watermark', 'warning', 'Pronađen je mogući vodeni žig ili VML/DrawingML oblik.', watermark, 'review-only', { supported: false, destructive: true, warning: 'Uklanjanje grafičkih objekata nije automatski podržano u V1.' }));
  if (invisible.length) findings.push(finding('invisible-objects', 'invisible-object', 'warning', 'Pronađeni su mogući nevidljivi ili prazni objekti.', invisible, 'review-only', { supported: false, destructive: true }));
  if (bookmarkFields.bookmarks.length) findings.push(finding('broken-bookmarks', 'bookmarks', 'error', 'Pronađeni su prekinuti bookmarkovi ili cross-reference polja.', bookmarkFields.bookmarks, 'review-only', { supported: false, destructive: true }));
  if (fieldCount || dirtyFields.length) findings.push(finding('stale-fields', 'fields', 'info', dirtyFields.length ? 'Pronađena su polja označena za osvježavanje.' : 'Pronađena su Word polja koja treba provjeriti i osvježiti.', dirtyFields.length ? dirtyFields : bookmarkFields.fields, 'update-fields', { destructive: false }));

  return {
    version: 1,
    findings,
    summary: {
      revisions: revisions.length,
      comments: comments.length,
      hiddenText: hidden.length,
      privateMetadata: metadata.length,
      customXmlParts: customXml.length,
      headerFooterRisks: headerFooter.length,
      watermarks: watermark.length,
      invisibleObjects: invisible.length,
      brokenBookmarks: bookmarkFields.bookmarks.length,
      staleFields: dirtyFields.length || fieldCount,
    },
    packageParts,
  };
}

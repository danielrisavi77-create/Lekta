import { inspectorFingerprint } from '../analysis/final-document-inspector';
import type { DocxXmlParts, FixerOutput } from './fixers';

export interface FinalDocumentInspectorParams {
  version: 1;
  profileFingerprint?: string;
  revisions: Array<{ part: string; revisionId: string; action: 'accept' | 'reject'; anchorFingerprint: string; confirmed: true }>;
  comments: Array<{ commentId: string; anchorFingerprint: string; action: 'remove'; confirmed: true }>;
  metadata: Array<{ part: 'core' | 'app' | 'custom'; field: string; fingerprint: string; action: 'remove'; confirmed: true }>;
  hiddenText: Array<{ part: string; anchorFingerprint: string; action: 'remove'; confirmed: true }>;
  settings?: { disableTracking?: true; updateFields?: true; removeRevisionIds?: true };
  customXml?: Array<{ part: string; fingerprint: string; action: 'remove-unreferenced'; confirmed: true }>;
}

const NO_OP = (parts: DocxXmlParts, reason: FixerOutput['reason']): FixerOutput => ({ parts, applied: false, beforeLabel: '', afterLabel: '', reason });
const SAFE_PART = /^(?:\[Content_Types\]\.xml|[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*)$/;
const MAX_OPERATIONS = 500;

function xmlPartsOf(parts: DocxXmlParts): Record<string, string> {
  return parts.packageXmlParts ? { ...parts.packageXmlParts } : {};
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^$()|[\]\\]/g, '\\$&');
}

function attr(tag: string, name: string): string {
  const escaped = escapeRegex(name);
  const match = new RegExp("\\b" + escaped + "=[\"']([^\"']*)[\"']", 'i').exec(tag);
  return match?.[1] || '';
}

function commentPart(packageXml: Record<string, string>): string | undefined {
  return Object.keys(packageXml).find((name) => /(?:^|\/)comments\.xml$/i.test(name));
}

function replaceRevision(raw: string, action: 'accept' | 'reject', kind: string): string {
  const openEnd = raw.indexOf('>');
  const closeStart = raw.lastIndexOf('</w:');
  if (openEnd < 0 || closeStart < 0) return raw;
  const inner = raw.slice(openEnd + 1, closeStart);
  if (kind === 'ins' || kind === 'moveTo') return action === 'accept' ? inner : '';
  if (kind === 'del' || kind === 'moveFrom') {
    if (action === 'accept') return '';
    return inner.replace(/<w:del(Text|InstrText)\b/gi, '<w:$1');
  }
  return raw;
}

function revisionTarget(packageXml: Record<string, string>, part: string, revisionId: string, fingerprint: string) {
  const xml = packageXml[part];
  if (!xml) return { state: 'missing' as const };
  for (const match of xml.matchAll(/<w:(ins|del|moveFrom|moveTo)\b[^>]*>[^]*?<\/w:\1\s*>/gi)) {
    const raw = match[0];
    if (attr(raw, 'w:id') !== revisionId) continue;
    const kind = match[1];
    const location = kind + ':' + (match.index ?? 0);
    const current = inspectorFingerprint(part, location + '|' + raw.slice(0, 160));
    return current === fingerprint ? { state: 'target' as const, raw, kind, location } : { state: 'stale' as const };
  }
  return { state: 'missing' as const };
}

function hiddenTarget(packageXml: Record<string, string>, part: string, fingerprint: string) {
  const xml = packageXml[part];
  if (!xml) return { state: 'missing' as const };
  for (const match of xml.matchAll(/<w:r\b[^>]*>[^]*?<\/w:r\s*>/gi)) {
    const raw = match[0];
    if (!/<w:(?:vanish|specVanish)\b/i.test(raw) || !/<w:t\b/i.test(raw)) continue;
    const display = [...raw.matchAll(/<w:t\b[^>]*>([^]*?)<\/w:t\s*>/gi)].map((item) => item[1]).join(' ').slice(0, 160);
    const location = 'hidden-run:' + (match.index ?? 0);
    if (inspectorFingerprint(part, location + '|' + display) === fingerprint) return { state: 'target' as const, raw, location };
  }
  return { state: 'missing' as const };
}

function metadataTarget(packageXml: Record<string, string>, kind: 'core' | 'app' | 'custom', field: string, fingerprint: string) {
  const part = kind === 'core' ? 'docProps/core.xml' : kind === 'app' ? 'docProps/app.xml' : 'docProps/custom.xml';
  const xml = packageXml[part];
  if (!xml) return { state: 'missing' as const };
  if (kind === 'custom') {
    for (const match of xml.matchAll(/<property\b[^>]*>[^]*?<\/property\s*>/gi)) {
      const raw = match[0];
      if (attr(raw, 'name') !== field) continue;
      const current = inspectorFingerprint(part, 'property:' + field + '|' + raw.slice(0, 160));
      return current === fingerprint ? { state: 'target' as const, raw } : { state: 'stale' as const };
    }
    return { state: 'missing' as const };
  }
  const tag = kind === 'core'
    ? ({ creator: 'dc:creator', lastModifiedBy: 'cp:lastModifiedBy', created: 'dcterms:created', modified: 'dcterms:modified', revision: 'cp:revision' } as Record<string, string>)[field]
    : ({ company: 'Company', manager: 'Manager', application: 'Application', appVersion: 'AppVersion' } as Record<string, string>)[field];
  if (!tag) return { state: 'missing' as const };
  const match = new RegExp('<' + tag + '\\b[^>]*>([^]*?)</' + tag + '>', 'i').exec(xml);
  if (!match) return { state: 'missing' as const };
  const current = inspectorFingerprint(part, field + '|' + match[1]);
  return current === fingerprint ? { state: 'target' as const, raw: match[0] } : { state: 'stale' as const };
}

function removeCommentRefs(xml: string, id: string): string {
  const escaped = escapeRegex(id);
  return xml
    .replace(new RegExp("<w:comment(?:RangeStart|RangeEnd|Reference)\\b[^>]*w:id=[\"']" + escaped + "[\"'][^>]*/?>", 'gi'), '')
    .replace(new RegExp("<w:comment(?:RangeStart|RangeEnd|Reference)\\b[^>]*w:id=[\"']" + escaped + "[\"'][^>]*>[^]*?</w:comment(?:RangeStart|RangeEnd|Reference)\\s*>", 'gi'), '');
}

function isReferencedCustomXml(packageXml: Record<string, string>, part: string): boolean {
  const base = part.replace(/^word\//i, '');
  const escapedBase = escapeRegex(base);
  const escapedPart = escapeRegex(part);
  return Object.entries(packageXml).some(([name, xml]) => {
    if (name === part) return false;
    if (/<w:customXml\b/i.test(xml)) return true;
    if (!/\.rels$/i.test(name)) return false;
    return new RegExp("Target=[\"'][^\"']*(?:" + escapedBase + "|" + escapedPart + ")[^\"']*[\"']", 'i').test(xml);
  });
}

function removeRelationshipToComments(xml: string): string {
  return xml.replace(/<Relationship\b[^>]*(?:Target=["'][^"']*comments\.xml[^"']*["']|Type=["'][^"']*comments[^"']*["'])[^>]*\/>\s*/gi, '');
}

function removeContentTypeOverride(xml: string, part: string): string {
  const escaped = escapeRegex('/' + part.replace(/^\//, ''));
  return xml.replace(new RegExp("<Override\\b[^>]*PartName=[\"']" + escaped + "[\"'][^>]*/>\\s*", 'gi'), '');
}

export function finalDocumentInspectorFixer(parts: DocxXmlParts, params: FinalDocumentInspectorParams): FixerOutput {
  if (!params || params.version !== 1 || !Array.isArray(params.revisions) || !Array.isArray(params.comments)
    || !Array.isArray(params.metadata) || !Array.isArray(params.hiddenText)
    || (params.customXml !== undefined && !Array.isArray(params.customXml))
    || params.revisions.length + params.comments.length + params.metadata.length + params.hiddenText.length + (params.customXml?.length || 0) > MAX_OPERATIONS) {
    return NO_OP(parts, 'invalid-params');
  }
  const packageXml = xmlPartsOf(parts);
  if (!Object.keys(packageXml).length) return NO_OP(parts, 'unsupported-structure');
  const next = { ...packageXml };
  const removals = new Set<string>();
  let changed = false;
  let alreadyOk = false;
  const seenTargets = new Set<string>();

  for (const operation of params.revisions) {
    if (!operation || typeof operation !== 'object' || !operation.confirmed || !SAFE_PART.test(operation.part) || operation.part.length > 240 || !operation.revisionId || operation.revisionId.length > 100 || !['accept', 'reject'].includes(operation.action)
      || typeof operation.anchorFingerprint !== 'string') return NO_OP(parts, 'invalid-params');
    const revisionKey = operation.part + ':' + operation.revisionId;
    if (seenTargets.has(revisionKey)) return NO_OP(parts, 'invalid-params');
    seenTargets.add(revisionKey);
    const target = revisionTarget(packageXml, operation.part, operation.revisionId, operation.anchorFingerprint);
    if (target.state === 'stale') return NO_OP(parts, 'unsupported-structure');
    if (target.state === 'missing') { alreadyOk = true; continue; }
    if (target.kind === 'moveFrom' || target.kind === 'moveTo') return NO_OP(parts, 'unsupported-structure');
    next[operation.part] = next[operation.part].replace(target.raw, replaceRevision(target.raw, operation.action, target.kind));
    changed = true;
  }

  const commentsXmlName = commentPart(next);
  for (const operation of params.comments) {
    if (!operation || typeof operation !== 'object' || !operation.confirmed || operation.action !== 'remove' || !operation.commentId || operation.commentId.length > 100 || typeof operation.anchorFingerprint !== 'string') return NO_OP(parts, 'invalid-params');
    if (seenTargets.has('comment:' + operation.commentId)) return NO_OP(parts, 'invalid-params');
    seenTargets.add('comment:' + operation.commentId);
    const xml = commentsXmlName ? packageXml[commentsXmlName] : '';
    const match = [...xml.matchAll(/<w:comment\b[^>]*>[^]*?<\/w:comment\s*>/gi)].find((item) => attr(item[0], 'w:id') === operation.commentId);
    if (!match) { alreadyOk = true; continue; }
    const current = inspectorFingerprint(commentsXmlName || 'word/comments.xml', 'comment:' + operation.commentId + '|' + match[0].slice(0, 180));
    if (current !== operation.anchorFingerprint) return NO_OP(parts, 'unsupported-structure');
    next[commentsXmlName!] = next[commentsXmlName!].replace(match[0], '');
    for (const [name, value] of Object.entries(next)) next[name] = removeCommentRefs(value, operation.commentId);
    changed = true;
  }
  if (commentsXmlName && !/<w:comment\b/i.test(next[commentsXmlName])) {
    removals.add(commentsXmlName);
    for (const [name, value] of Object.entries(next)) if (/\.rels$/i.test(name)) next[name] = removeRelationshipToComments(value);
    if (next['[Content_Types].xml']) next['[Content_Types].xml'] = removeContentTypeOverride(next['[Content_Types].xml'], commentsXmlName);
  }

  for (const operation of params.metadata) {
    if (!operation || typeof operation !== 'object' || !operation.confirmed || operation.action !== 'remove' || !operation.field || operation.field.length > 200 || typeof operation.fingerprint !== 'string') return NO_OP(parts, 'invalid-params');
    if (seenTargets.has('metadata:' + operation.part + ':' + operation.field)) return NO_OP(parts, 'invalid-params');
    seenTargets.add('metadata:' + operation.part + ':' + operation.field);
    const target = metadataTarget(packageXml, operation.part, operation.field, operation.fingerprint);
    if (target.state === 'stale') return NO_OP(parts, 'unsupported-structure');
    if (target.state === 'missing') { alreadyOk = true; continue; }
    const part = operation.part === 'core' ? 'docProps/core.xml' : operation.part === 'app' ? 'docProps/app.xml' : 'docProps/custom.xml';
    next[part] = next[part].replace(target.raw, '');
    changed = true;
  }

  for (const operation of params.hiddenText) {
    if (!operation || typeof operation !== 'object' || !operation.confirmed || operation.action !== 'remove' || !SAFE_PART.test(operation.part) || operation.part.length > 240 || typeof operation.anchorFingerprint !== 'string') return NO_OP(parts, 'invalid-params');
    const target = hiddenTarget(packageXml, operation.part, operation.anchorFingerprint);
    if (target.state === 'missing') { alreadyOk = true; continue; }
    if (target.raw.includes('<w:fld') || target.raw.includes('<w:drawing') || target.raw.includes('<w:object')) return NO_OP(parts, 'unsupported-structure');
    next[operation.part] = next[operation.part].replace(target.raw, '');
    changed = true;
  }

  if (params.settings?.disableTracking) {
    if (!next['word/settings.xml']) return NO_OP(parts, 'no-target');
    if (/<w:trackRevisions\b/i.test(next['word/settings.xml'])) { next['word/settings.xml'] = next['word/settings.xml'].replace(/<w:trackRevisions\b[^>]*\/?>(?:<\/w:trackRevisions\s*>)?/gi, ''); changed = true; }
    else alreadyOk = true;
  }
  if (params.settings?.updateFields) {
    if (!next['word/settings.xml']) return NO_OP(parts, 'no-target');
    if (!/<w:updateFields\b/i.test(next['word/settings.xml'])) {
      next['word/settings.xml'] = next['word/settings.xml'].replace(/<w:settings\b[^>]*>/i, (tag) => tag + '<w:updateFields w:val="true"/>');
      changed = true;
    } else alreadyOk = true;
  }
  if (params.settings?.removeRevisionIds) {
    let removedIds = false;
    for (const [name, value] of Object.entries(next)) {
      const updated = value.replace(/\s+w:rsid[A-Za-z]+=["'][^"']*["']/gi, '');
      if (updated !== value) { next[name] = updated; removedIds = true; }
    }
    if (removedIds) changed = true; else alreadyOk = true;
  }

  for (const operation of params.customXml || []) {
    if (!operation.confirmed || operation.action !== 'remove-unreferenced' || !/(^|\/)customXml\//i.test(operation.part)) return NO_OP(parts, 'invalid-params');
    if (next[operation.part] === undefined) { alreadyOk = true; continue; }
    if (inspectorFingerprint(operation.part, 'package-part|' + operation.part) !== operation.fingerprint) return NO_OP(parts, 'unsupported-structure');
    if (isReferencedCustomXml(next, operation.part)) return NO_OP(parts, 'unsupported-structure');
    removals.add(operation.part);
    if (next['[Content_Types].xml']) next['[Content_Types].xml'] = removeContentTypeOverride(next['[Content_Types].xml'], operation.part);
    changed = true;
  }

  if (!changed) return NO_OP(parts, alreadyOk ? 'already-ok' : 'no-target');
  for (const name of removals) delete next[name];
  return {
    parts: { ...parts, packageXmlParts: next, removedPackageParts: [...removals] },
    applied: true,
    beforeLabel: 'Skriveni, revizijski i privatni podaci u DOCX paketu',
    afterLabel: 'Potvrđene stavke obrađene u novoj čistoj kopiji',
  };
}

import { submissionMetadataFingerprint } from '../analysis/cross-file-submission-consistency';
import type { DocxXmlParts, FixerOutput } from './fixers';

export interface SubmissionMetadataFixParams {
  version: 1;
  fileFingerprint?: string;
  fields: Array<{
    field: 'title' | 'author';
    part: 'docProps/core.xml';
    before: string;
    replacementText: string;
    fingerprint: string;
    confirmed: true;
  }>;
}

function noOp(parts: DocxXmlParts, reason: NonNullable<FixerOutput['reason']>): FixerOutput {
  return { parts, applied: false, beforeLabel: '', afterLabel: '', reason };
}

function xmlDecode(value: string): string {
  return value.replace(/&(?:amp|lt|gt|quot|apos|#39);/g, (entity) => ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&#39;': "'" }[entity] ?? entity));
}

function xmlEncode(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function tagFor(field: SubmissionMetadataFixParams['fields'][number]['field']): string {
  return field === 'title' ? 'dc:title' : 'dc:creator';
}

function partFingerprint(xml: string): string {
  let result = 2166136261;
  for (let index = 0; index < xml.length; index += 1) {
    result ^= xml.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return 'submission-' + (result >>> 0).toString(16).padStart(8, '0');
}

export function submissionMetadataFixer(parts: DocxXmlParts, params: SubmissionMetadataFixParams): FixerOutput {
  if (!params || params.version !== 1 || !Array.isArray(params.fields) || params.fields.length > 20) return noOp(parts, 'invalid-params');
  const core = parts.packageXmlParts?.['docProps/core.xml'];
  if (!core) return noOp(parts, 'no-target');
  if (params.fileFingerprint && params.fileFingerprint !== partFingerprint(core)) return noOp(parts, 'stale-anchor');
  const ids = new Set<string>();
  for (const field of params.fields) {
    if (!field || field.confirmed !== true || field.part !== 'docProps/core.xml' || (field.field !== 'title' && field.field !== 'author') || ids.has(field.field) || typeof field.before !== 'string' || field.before.length > 500 || typeof field.replacementText !== 'string' || field.replacementText.length > 500 || field.fingerprint !== submissionMetadataFingerprint(field.field, field.before)) return noOp(parts, 'invalid-params');
    ids.add(field.field);
  }
  if (!params.fields.length) return noOp(parts, 'no-target');
  let next = core;
  let changed = false;
  for (const field of params.fields) {
    const tag = tagFor(field.field);
    const pattern = new RegExp('(<' + tag + '\\b[^>]*>)([\\s\\S]*?)(</' + tag + '>)', 'i');
    const match = next.match(pattern);
    if (!match) return noOp(parts, 'no-target');
    const current = xmlDecode(match[2]);
    if (current !== field.before) {
      if (current === field.replacementText) continue;
      return noOp(parts, 'stale-anchor');
    }
    next = next.replace(pattern, '$1' + xmlEncode(field.replacementText) + '$3');
    changed = true;
  }
  if (!changed) return noOp(parts, 'already-ok');
  return {
    parts: { ...parts, packageXmlParts: { ...(parts.packageXmlParts ?? {}), 'docProps/core.xml': next } },
    applied: true,
    beforeLabel: 'Potvrđeni podaci u DOCX metapodacima',
    afterLabel: 'Usklađeni naslov ili autor u docProps/core.xml',
  };
}

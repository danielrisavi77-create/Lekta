import {
  classifyLegalBibliographyEntry,
  classifyLegalSource,
  legalBibliographyMatch,
  legalCitationFingerprint,
  legalFirstAuthor,
  legalOpCitData,
} from '../citations/legal-citation.ts';
import type { LegalFootnoteRepairRules } from '../profiles/profile-schema.ts';
import { normalize } from '../utils/helpers.ts';

export type LegalFootnoteConfidence = 'high' | 'medium' | 'low';

export type LegalFootnoteOperationKind =
  | 'convert-marker'
  | 'move-marker'
  | 'replace-text'
  | 'fix-ibid'
  | 'replace-op-cit'
  | 'normalize-law'
  | 'add-gazette'
  | 'split-sources'
  | 'link-bibliography'
  | 'introduce-abbreviation';

export interface LegalFootnoteOperation {
  id: string;
  kind: LegalFootnoteOperationKind;
  before: string;
  after: string;
  reason: string;
  confidence: LegalFootnoteConfidence;
  requiresConfirmation: true;
  start?: number;
  end?: number;
  paragraphIndex?: number;
  markerPosition?: 'before-punctuation' | 'after-punctuation';
}

export interface LegalFootnoteSourceSegment {
  rawText: string;
  type: string;
  fingerprint: string;
  start: number;
  end: number;
}

export interface LegalFootnoteCandidate {
  id: string;
  footnoteId: number;
  anchorFingerprint: string;
  rawText: string;
  type: 'full' | 'ibid' | 'op-cit' | 'law' | 'case' | 'mixed' | 'other';
  sources: LegalFootnoteSourceSegment[];
  previousFootnoteId?: number;
  resolvedSourceId?: string;
  bibliographyEntryId?: string;
  confidence: LegalFootnoteConfidence;
  evidence: string[];
  operations: LegalFootnoteOperation[];
}

export interface LegalFootnoteMarkerCandidate {
  id: string;
  paragraphIndex: number;
  start: number;
  end: number;
  footnoteId: number;
  rawText: string;
  anchorFingerprint: string;
  confidence: LegalFootnoteConfidence;
  evidence: string[];
  operation?: LegalFootnoteOperation;
}

export interface LegalFootnoteStructure {
  candidates: LegalFootnoteCandidate[];
  markers: LegalFootnoteMarkerCandidate[];
  warnings: string[];
  skipped: Array<{ footnoteId?: number; paragraphIndex?: number; reason: string }>;
  summary: {
    footnotes: number;
    operations: number;
    confirmedRequired: number;
    manualMarkers: number;
    highConfidence: number;
    review: number;
  };
}

interface LegalParagraphInput {
  index: number;
  text: string;
  cell?: unknown;
  fnMarks?: Array<{ id: number; offset: number }>;
  runs?: Array<{ text?: string; vertAlign?: string }>;
}

interface LegalFootnoteInput {
  id: number;
  text: string;
}

interface BibliographyInput {
  id?: string;
  text?: string;
  rawText?: string;
}

interface LegalEngineInput {
  notes?: Array<{ id: number; type?: string; text: string; anchorId?: number | null; resolved?: boolean }>;
  problems?: Array<{ kind?: string; note?: number; message?: string }>;
}

export interface LegalFootnoteStructureInput {
  paragraphs: LegalParagraphInput[];
  footnotes: LegalFootnoteInput[];
  bibliography?: BibliographyInput[];
  engine?: LegalEngineInput | null;
  rules?: LegalFootnoteRepairRules;
}

function hash(value: string): string {
  let result = 2166136261;
  for (const char of value) {
    result ^= char.codePointAt(0) ?? 0;
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(16).padStart(8, '0');
}

export function legalFootnoteAnchorFingerprint(footnoteId: number, text: string): string {
  return `legal-footnote-${hash(`${footnoteId}|${normalize(text)}`)}`;
}

export function legalMarkerAnchorFingerprint(paragraphIndex: number, start: number, end: number, text: string): string {
  return `legal-marker-${hash(`${paragraphIndex}|${start}|${end}|${normalize(text)}`)}`;
}

function operationId(footnoteId: number, kind: string, before: string): string {
  return `legal-op-${footnoteId}-${kind}-${hash(before)}`;
}

function segments(text: string): LegalFootnoteSourceSegment[] {
  const result: LegalFootnoteSourceSegment[] = [];
  let offset = 0;
  for (const raw of text.split(';')) {
    const trimmed = raw.trim();
    const leading = raw.indexOf(trimmed);
    if (trimmed) {
      const type = classifyLegalSource(trimmed);
      result.push({ rawText: trimmed, type, fingerprint: legalCitationFingerprint(trimmed, type).key, start: offset + leading, end: offset + leading + trimmed.length });
    }
    offset += raw.length + 1;
  }
  return result;
}

function candidateType(type: string, sourceSegments: LegalFootnoteSourceSegment[]): LegalFootnoteCandidate['type'] {
  if (type === 'ibid') return 'ibid';
  if (type === 'opcit') return 'op-cit';
  if (sourceSegments.length > 1) return 'mixed';
  if (type === 'law' || type === 'euAct' || type === 'international') return 'law';
  if (type === 'domesticCase' || type === 'echrCase' || type === 'cjeuCase') return 'case';
  if (type === 'other') return 'other';
  return 'full';
}

function shortCitation(target: LegalFootnoteInput | undefined): string | null {
  if (!target) return null;
  const author = legalFirstAuthor(target.text);
  const text = target.text.split(',').map((part) => part.trim()).filter(Boolean);
  const title = text.find((part) => part.length > 8 && !/^(?:str\.|br\.|vol\.|god\.)/i.test(part));
  if (!author && !title) return null;
  return [author, title].filter(Boolean).join(', ');
}

function markerCandidates(
  paragraphs: LegalParagraphInput[],
  footnotes: Map<number, LegalFootnoteInput>,
  rules?: LegalFootnoteRepairRules,
): LegalFootnoteMarkerCandidate[] {
  const manualConversionEnabled = rules?.marker?.convertManualNumbers === true;
  const markerPosition = rules?.marker?.position;
  const positionRepairEnabled = markerPosition !== undefined;
  if (!manualConversionEnabled && !positionRepairEnabled) return [];
  const markers: LegalFootnoteMarkerCandidate[] = [];
  for (const paragraph of paragraphs) {
    if (paragraph.cell || !Array.isArray(paragraph.runs)) continue;
    const leading = paragraph.text.length - paragraph.text.trimStart().length;
    if (manualConversionEnabled) {
      let offset = 0;
      for (const run of paragraph.runs) {
        const text = String(run.text || '');
        const superscript = run.vertAlign === 'superscript';
        const tokenPattern = superscript ? /(?<!\d)(\d{1,3})(?!\d)/g : /^\s*(\d{1,3})\s*$/g;
        let match: RegExpExecArray | null;
        while ((match = tokenPattern.exec(text))) {
          const footnoteId = Number(match[1]);
          if (!footnotes.has(footnoteId)) continue;
          const start = Math.max(0, offset + match.index - leading);
          const end = start + match[1].length;
          const rawText = paragraph.text.slice(start, end) || match[1];
          const confidence: LegalFootnoteConfidence = superscript ? 'high' : 'medium';
          markers.push({
            id: `manual-marker-${paragraph.index}-${start}-${footnoteId}`,
            paragraphIndex: paragraph.index,
            start,
            end,
            footnoteId,
            rawText,
            anchorFingerprint: legalMarkerAnchorFingerprint(paragraph.index, start, end, paragraph.text),
            confidence,
            evidence: [superscript ? 'broj je u superscript runu' : 'samostalni numerički run', 'postoji fusnota s istim ID-om'],
            operation: {
              id: operationId(footnoteId, 'convert-marker', rawText),
              kind: 'convert-marker',
              before: rawText,
              after: `Word fusnota ${footnoteId}`,
              reason: 'Ručni broj može se sigurno povezati s postojećim zapisom u footnotes.xml.',
              confidence,
              requiresConfirmation: true,
            },
          });
        }
        offset += text.length;
      }
    }
    if (Array.isArray(paragraph.fnMarks) && markerPosition) {
      for (const mark of paragraph.fnMarks) {
        const offsetAtMarker = Math.max(0, Math.min(paragraph.text.length, mark.offset));
        const before = paragraph.text[offsetAtMarker - 1] || '';
        const after = paragraph.text[offsetAtMarker] || '';
        const punctuationBefore = /[.,;:!?)]/.test(before);
        const punctuationAfter = /[.,;:!?)]/.test(after);
        const alreadyCorrect = markerPosition === 'before-punctuation' ? punctuationAfter : punctuationBefore;
        if (alreadyCorrect || (!punctuationBefore && !punctuationAfter)) continue;
        const markerText = `fusnota ${mark.id}`;
        markers.push({
          id: `footnote-marker-${paragraph.index}-${offsetAtMarker}-${mark.id}`,
          paragraphIndex: paragraph.index,
          start: offsetAtMarker,
          end: offsetAtMarker,
          footnoteId: mark.id,
          rawText: markerText,
          anchorFingerprint: legalMarkerAnchorFingerprint(paragraph.index, offsetAtMarker, offsetAtMarker, paragraph.text),
          confidence: 'high',
          evidence: ['pronađena stvarna Word fusnotna oznaka', 'interpunkcija je neposredno uz oznaku'],
          operation: {
            id: operationId(mark.id, 'move-marker', `${paragraph.index}:${offsetAtMarker}`),
            kind: 'move-marker',
            before: punctuationBefore ? 'oznaka iza interpunkcije' : 'oznaka ispred interpunkcije',
            after: markerPosition === 'before-punctuation' ? 'oznaka ispred interpunkcije' : 'oznaka iza interpunkcije',
            reason: 'Položaj oznake fusnote treba uskladiti s verificiranim profilnim pravilom.',
            confidence: 'high',
            requiresConfirmation: true,
            start: offsetAtMarker,
            end: offsetAtMarker,
            paragraphIndex: paragraph.index,
            markerPosition,
          },
        });
      }
    }
  }
  return markers;
}

export function analyzeLegalFootnoteStructure(input: LegalFootnoteStructureInput): LegalFootnoteStructure {
  const rules = input.rules;
  const footnotes = new Map(input.footnotes.filter((note) => note.id > 0).map((note) => [note.id, note]));
  const engine = input.engine || {};
  const engineNotes = new Map((engine.notes || []).map((note) => [note.id, note]));
  const problemsByNote = new Map<number, Array<{ kind?: string; message?: string }>>();
  for (const problem of engine.problems || []) {
    if (!Number.isInteger(problem.note)) continue;
    const list = problemsByNote.get(problem.note!) || [];
    list.push(problem);
    problemsByNote.set(problem.note!, list);
  }
  const bibliography = (input.bibliography || []).filter((entry) => String(entry.rawText || entry.text || '').trim());
  const candidates: LegalFootnoteCandidate[] = [];
  const warnings: string[] = [];
  const skipped: LegalFootnoteStructure['skipped'] = [];
  const ordered = [...footnotes.values()].sort((a, b) => a.id - b.id);

  for (let index = 0; index < ordered.length; index++) {
    const note = ordered[index];
    const engineNote = engineNotes.get(note.id);
    const sourceSegments = segments(note.text);
    const type = String(engineNote?.type || classifyLegalSource(note.text));
    const noteProblems = problemsByNote.get(note.id) || [];
    const evidence = sourceSegments.length ? ['prepoznat pravni izvor ili citatni segment'] : ['tekst fusnote nije pouzdano klasificiran'];
    const operations: LegalFootnoteOperation[] = [];
    if (type === 'ibid' && rules?.repeatedCitation?.ibidPolicy === 'immediate-previous') {
      for (const problem of noteProblems) {
        if (problem.kind !== 'ibidCapital') continue;
        const after = note.text.replace(/^\s*ibid\./i, 'Ibid.');
        operations.push({ id: operationId(note.id, 'fix-ibid', note.text), kind: 'fix-ibid', before: note.text, after, reason: problem.message || 'Ujednačavanje oznake Ibid.', confidence: 'high', requiresConfirmation: true });
      }
      if (engineNote?.resolved && index > 0) evidence.push('Ibid. ima razrješiv prethodni izvor');
    }
    if (type === 'opcit' && rules?.repeatedCitation?.opCitPolicy === 'replace-with-short-citation') {
      const parsed = legalOpCitData(note.text);
      const target = parsed ? footnotes.get(parsed.target) : undefined;
      const short = shortCitation(target);
      if (short && noteProblems.some((problem) => ['opcit', 'opcitAuthor', 'shortTitle'].includes(String(problem.kind)))) {
        const page = parsed?.page ? `, str. ${parsed.page}` : '';
        const after = `${short}${page}.`;
        operations.push({ id: operationId(note.id, 'replace-op-cit', note.text), kind: 'replace-op-cit', before: note.text, after, reason: noteProblems.map((problem) => problem.message).filter(Boolean).join(' ') || 'op. cit. treba zamijeniti jasnim kratkim navodom.', confidence: 'medium', requiresConfirmation: true });
      }
    }
    if (sourceSegments.length > 1 && rules?.legalSources?.splitMultipleSources === true) {
      operations.push({ id: operationId(note.id, 'split-sources', note.text), kind: 'split-sources', before: note.text, after: sourceSegments.map((source) => source.rawText).join('\n'), reason: 'Jedna fusnota sadrži više logičkih izvora.', confidence: 'medium', requiresConfirmation: true });
    }
    const bibliographyEntry = bibliography.find((entry) => legalBibliographyMatch({ fingerprint: legalCitationFingerprint(note.text, type) }, { text: String(entry.rawText || entry.text) }));
    if (bibliographyEntry && rules?.bibliography?.linkLegalSources === true) {
      evidence.push('fusnota ima podudaranje u bibliografiji');
      operations.push({ id: operationId(note.id, 'link-bibliography', note.text), kind: 'link-bibliography', before: note.text, after: note.text, reason: 'Potvrđeno podudaranje pravnog izvora s bibliografijskim zapisom.', confidence: 'high', requiresConfirmation: true });
    }
    const confidence: LegalFootnoteConfidence = engineNote?.resolved && type !== 'other' ? (operations.length ? 'medium' : 'high') : 'low';
    if (confidence === 'low') skipped.push({ footnoteId: note.id, reason: 'Nije pronađena dovoljno pouzdana pravna struktura.' });
    candidates.push({
      id: `legal-footnote-${note.id}`,
      footnoteId: note.id,
      anchorFingerprint: legalFootnoteAnchorFingerprint(note.id, note.text),
      rawText: note.text,
      type: candidateType(type, sourceSegments),
      sources: sourceSegments,
      ...(engineNote?.anchorId && engineNote.anchorId !== note.id ? { resolvedSourceId: `legal-footnote-${engineNote.anchorId}` } : {}),
      ...(bibliographyEntry?.id ? { bibliographyEntryId: String(bibliographyEntry.id) } : {}),
      ...(index > 0 ? { previousFootnoteId: ordered[index - 1].id } : {}),
      confidence,
      evidence,
      operations,
    });
  }

  const markers = markerCandidates(input.paragraphs, footnotes, rules);
  if (rules?.marker?.convertManualNumbers === true && !markers.length) warnings.push('Nisu pronađeni sigurni ručno upisani brojevi povezivi s postojećim fusnotama.');
  if (candidates.some((candidate) => candidate.type === 'other')) warnings.push('Dio pravnih fusnota nije dovoljno pouzdano klasificiran i preskočen je.');
  return {
    candidates,
    markers,
    warnings,
    skipped,
    summary: {
      footnotes: candidates.length,
      operations: candidates.reduce((sum, candidate) => sum + candidate.operations.length, 0) + markers.filter((marker) => marker.operation).length,
      confirmedRequired: candidates.reduce((sum, candidate) => sum + candidate.operations.length, 0) + markers.filter((marker) => marker.operation).length,
      manualMarkers: markers.length,
      highConfidence: candidates.filter((candidate) => candidate.confidence === 'high').length,
      review: candidates.filter((candidate) => candidate.confidence !== 'high').length,
    },
  };
}

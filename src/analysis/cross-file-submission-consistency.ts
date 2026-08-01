export type SubmissionField =
  | 'title'
  | 'author'
  | 'mentor'
  | 'academicYear'
  | 'study'
  | 'track'
  | 'filename'
  | 'institution'
  | 'workType';

export type SubmissionSource =
  | 'docx'
  | 'pdf'
  | 'docx-metadata'
  | 'pdf-metadata'
  | 'form'
  | 'filename';

export type CrossFileConfidence = 'high' | 'medium' | 'low';

export interface CrossFileSubmissionRules {
  requiredFields?: SubmissionField[];
  canonicalSources?: Partial<Record<SubmissionField, SubmissionSource[]>>;
  titleComparison?: 'exact' | 'normalized' | 'fuzzy-warning';
  personComparison?: 'exact' | 'normalized';
  academicYearFormat?: string;
  filenamePattern?: string;
  allowMissingPdfMetadata?: boolean;
  requirePdfMetadataMatch?: boolean;
  requireFilenameMatch?: boolean;
}

export interface SubmissionValue {
  field: SubmissionField;
  value: string;
  normalizedValue: string;
  source: SubmissionSource;
  fileName?: string;
  location?: string;
  confidence: CrossFileConfidence;
  fingerprint: string;
  evidence: string[];
}

export interface SubmissionConsistencyIssue {
  id: string;
  field: SubmissionField;
  values: SubmissionValue[];
  status: 'consistent' | 'mismatch' | 'missing' | 'ambiguous' | 'malformed';
  severity: 'info' | 'warning' | 'error';
  suggestedCanonical?: string;
  reason: string;
}

export interface CrossFileSubmissionFile {
  name: string;
  type: 'docx' | 'pdf' | 'form' | 'unknown';
  size?: number;
  fingerprint?: string;
  values?: Array<{
    field: SubmissionField;
    value: string;
    source?: SubmissionSource;
    location?: string;
    confidence?: CrossFileConfidence;
    evidence?: string[];
    fingerprint?: string;
  }>;
}

export interface CrossFileSubmissionConsistency {
  version: 1;
  files: Array<{ name: string; type: CrossFileSubmissionFile['type']; size?: number; fingerprint: string }>;
  values: SubmissionValue[];
  issues: SubmissionConsistencyIssue[];
  summary: {
    fieldsChecked: number;
    consistent: number;
    mismatches: number;
    missing: number;
    ambiguous: number;
    errors: number;
    text: string;
  };
}

const FIELD_LABELS: Record<SubmissionField, string> = {
  title: 'Naslov rada',
  author: 'Autor',
  mentor: 'Mentor',
  academicYear: 'Akademska godina',
  study: 'Studij',
  track: 'Smjer',
  filename: 'Naziv datoteke',
  institution: 'Ustanova',
  workType: 'Vrsta rada',
};

const FIELD_ORDER: SubmissionField[] = ['title', 'author', 'mentor', 'academicYear', 'study', 'track', 'institution', 'workType', 'filename'];
const SOURCE_PRIORITY: SubmissionSource[] = ['form', 'docx', 'pdf', 'docx-metadata', 'pdf-metadata', 'filename'];

function hash(value: string): string {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return 'submission-' + (result >>> 0).toString(16).padStart(8, '0');
}

export function crossFileFingerprint(value: string): string {
  return hash(value);
}

export function submissionMetadataFingerprint(field: 'title' | 'author', value: string): string {
  return hash(field + ':' + clean(value));
}

function clean(value: string): string {
  return value.normalize('NFKC').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

export function normalizeSubmissionValue(field: SubmissionField, value: string): string {
  let result = clean(value).toLocaleLowerCase('hr-HR');
  if (field === 'title') {
    result = result.replace(/[„“”«»"'\\x60]/g, '').replace(/[‐‑‒–—−-]/g, ' ').replace(/[.,;:!?]+$/g, '');
  } else if (field === 'author' || field === 'mentor') {
    result = result.replace(/\b(?:prof\.?|doc\.?|izv\.?|dr\.?|mr\.?|sc\.?|univ\.?)\b/g, '').replace(/[(),.]/g, ' ');
  } else if (field === 'academicYear') {
    result = result.replace(/\b(?:akademska|ak\.?)\s+godina\b/g, '').replace(/\s+/g, '');
  } else if (field === 'filename') {
    result = result.replace(/\.(?:docx|pdf|doc)$/i, '').replace(/[_-]+/g, ' ');
  }
  return result.replace(/\s+/g, ' ').trim();
}

function validValue(value: unknown): value is string {
  return typeof value === 'string' && clean(value).length > 0 && clean(value).length <= 500;
}

function confidenceFor(field: SubmissionField, value: string, source: SubmissionSource, requested?: CrossFileConfidence): CrossFileConfidence {
  if (requested) return requested;
  if (source === 'form' || source === 'docx') return 'high';
  if (field === 'filename') return 'low';
  return value.length >= 3 ? 'medium' : 'low';
}

function sourceFromFile(file: CrossFileSubmissionFile): SubmissionSource {
  return file.type === 'pdf' ? 'pdf' : file.type === 'docx' ? 'docx' : file.type === 'form' ? 'form' : 'filename';
}

function filenameValues(file: CrossFileSubmissionFile): NonNullable<CrossFileSubmissionFile['values']> {
  const values: NonNullable<CrossFileSubmissionFile['values']> = [
    { field: 'filename', value: file.name, source: 'filename', location: 'naziv datoteke', confidence: 'low', evidence: ['pomoćni podatak iz naziva datoteke'] },
  ];
  const year = file.name.match(/(?:19|20)\d{2}(?:[./-](?:19|20)?\d{2})?/)?.[0];
  if (year) values.push({ field: 'academicYear', value: year, source: 'filename', location: 'naziv datoteke', confidence: 'low', evidence: ['godina prepoznata u nazivu datoteke'] });
  return values;
}

function fuzzyEquivalent(left: string, right: string): boolean {
  if (left === right) return true;
  if (left.length < 5 || right.length < 5) return false;
  const shorter = left.length <= right.length ? left : right;
  const longer = left.length <= right.length ? right : left;
  return longer.includes(shorter) && shorter.length / longer.length >= 0.82;
}

function chooseCanonical(field: SubmissionField, values: SubmissionValue[], rules?: CrossFileSubmissionRules): string | undefined {
  const preferred = rules?.canonicalSources?.[field];
  const rank = (value: SubmissionValue): number => {
    const sourceRank = preferred?.indexOf(value.source);
    if (sourceRank != null && sourceRank >= 0) return sourceRank;
    return SOURCE_PRIORITY.indexOf(value.source) + 10;
  };
  return [...values].sort((a, b) => rank(a) - rank(b) || b.confidence.localeCompare(a.confidence) || a.value.localeCompare(b.value, 'hr'))[0]?.value;
}

function issueFor(field: SubmissionField, values: SubmissionValue[], rules?: CrossFileSubmissionRules): SubmissionConsistencyIssue {
  const unique = new Map<string, SubmissionValue[]>();
  for (const value of values) unique.set(value.normalizedValue, [...(unique.get(value.normalizedValue) ?? []), value]);
  const keys = [...unique.keys()];
  const canonical = chooseCanonical(field, values, rules);
  if (!values.length) return { id: hash(field + ':missing'), field, values, status: 'missing', severity: rules?.requiredFields?.includes(field) ? 'error' : 'info', reason: 'Nedostaje podatak: ' + FIELD_LABELS[field] + '.' };
  if (keys.length === 1) return { id: hash(field + ':' + keys[0]), field, values, status: 'consistent', severity: 'info', ...(canonical ? { suggestedCanonical: canonical } : {}), reason: FIELD_LABELS[field] + ' se podudara u dostupnim izvorima.' };
  const fuzzy = keys.length === 2 && fuzzyEquivalent(keys[0], keys[1]);
  const strictTitle = field === 'title' && rules?.titleComparison === 'exact';
  const requiredPdf = rules?.requirePdfMetadataMatch === true && values.some((value) => value.source === 'pdf-metadata');
  const severity = strictTitle || requiredPdf || rules?.requiredFields?.includes(field) ? 'error' : 'warning';
  return { id: hash(field + ':' + keys.join('|')), field, values, status: fuzzy ? 'ambiguous' : 'mismatch', severity, ...(canonical ? { suggestedCanonical: canonical } : {}), reason: fuzzy ? FIELD_LABELS[field] + ' ima vrlo slične, ali ne potvrđeno jednake vrijednosti.' : FIELD_LABELS[field] + ' se razlikuje između izvora.' };
}

export function analyzeCrossFileSubmission(input: { files: CrossFileSubmissionFile[]; rules?: CrossFileSubmissionRules }): CrossFileSubmissionConsistency {
  const files = input.files.slice(0, 20).map((file) => ({ ...file, fingerprint: file.fingerprint || hash(file.name + ':' + (file.size ?? 0)) }));
  const values: SubmissionValue[] = [];
  for (const file of files) {
    const supplied = [...(file.values ?? []), ...filenameValues(file)];
    const seen = new Set<string>();
    for (const item of supplied) {
      if (!validValue(item.value)) continue;
      const value = clean(item.value);
      const source = item.source ?? sourceFromFile(file);
      const normalizedValue = normalizeSubmissionValue(item.field, value);
      const key = file.name + ':' + item.field + ':' + source + ':' + normalizedValue;
      if (!normalizedValue || seen.has(key)) continue;
      seen.add(key);
      values.push({ field: item.field, value, normalizedValue, source, fileName: file.name, ...(item.location ? { location: item.location } : {}), confidence: confidenceFor(item.field, value, source, item.confidence), fingerprint: item.fingerprint || hash(file.fingerprint + ':' + key), evidence: item.evidence ?? [] });
    }
  }
  const issues = FIELD_ORDER.map((field) => issueFor(field, values.filter((value) => value.field === field), input.rules));
  const summary = {
    fieldsChecked: FIELD_ORDER.filter((field) => values.some((value) => value.field === field)).length,
    consistent: issues.filter((issue) => issue.status === 'consistent').length,
    mismatches: issues.filter((issue) => issue.status === 'mismatch').length,
    missing: issues.filter((issue) => issue.status === 'missing').length,
    ambiguous: issues.filter((issue) => issue.status === 'ambiguous').length,
    errors: issues.filter((issue) => issue.severity === 'error').length,
    text: '',
  };
  summary.text = (summary.mismatches + summary.ambiguous) + ' neslaganja, ' + summary.missing + ' nedostajućih podataka';
  return { version: 1, files: files.map(({ name, type, size, fingerprint }) => ({ name, type, ...(size != null ? { size } : {}), fingerprint })), values, issues, summary };
}

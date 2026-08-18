import { firstPageParagraphs } from '../audits/structure';
import { buildTitlePage, type TitlePageInput, type TitlePageModel } from '../tools/title-page';
import type { TitlePageTemplate } from '../title-pages/template-schema';

export interface TitlePageRepairValues extends TitlePageInput {
  university?: string;
  faculty?: string;
  study?: string;
}

export interface TitlePageRepairPlan {
  paragraphCount: number;
  values: TitlePageRepairValues;
  model: TitlePageModel;
  warnings: string[];
  outdated: boolean;
  logoRequired: boolean;
  logoAvailable: boolean;
}

const SUPPORTED_FIELDS: Array<keyof TitlePageRepairValues> = [
  'university', 'faculty', 'study', 'author', 'title', 'workType', 'mentor',
  'comentor', 'place', 'year', 'studentId',
];

function clean(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function lineText(lines: string[], pattern: RegExp): string {
  const line = lines.find((value) => pattern.test(value));
  if (!line) return '';
  return clean(line.replace(pattern, '$1'));
}

function yearFrom(lines: string[]): string {
  const hit = lines.join(' ').match(/\b(19\d{2}|20\d{2})\b/);
  return hit?.[1] ?? '';
}

function placeFrom(lines: string[], year: string): string {
  const candidate = lines.find((line) => year && line.includes(year)) ?? '';
  if (!candidate) return '';
  return clean(candidate.replace(year, '').replace(/[,.\-]+$/g, ''));
}

function inferValues(result: any, profile: any): TitlePageRepairValues {
  const front = firstPageParagraphs(result?.preview?.paragraphs ?? [])
    .filter((paragraph: any) => paragraph && typeof paragraph.text === 'string' && paragraph.text.trim())
    .map((paragraph: any) => clean(paragraph.text));
  const joined = front.join(' ');
  const year = yearFrom(front);
  const terms = Array.isArray(profile?.titlePageRequirements) ? profile.titlePageRequirements : [];
  const placeTerm = terms.find((entry: any) => /mjesto|zagreb|grad/i.test(String(entry?.label ?? '')));
  const placeHint = Array.isArray(placeTerm?.terms) ? clean(placeTerm.terms[0]) : '';
  const place = placeFrom(front, year) || (placeHint && new RegExp(placeHint, 'i').test(joined) ? placeHint : '');
  const workType = clean(profile?.titleWorkTerms?.[0]) || clean(result?.details?.titlePageWorkType);
  const title = clean(result?.documentStructure?.title);
  const author = clean(result?.documentStructure?.author);
  const mentor = lineText(front, /^\s*(?:mentor(?:ica)?|supervisor)\s*[:\-]?\s*(.+)$/i);
  const comentor = lineText(front, /^\s*(?:komentor(?:ica)?|co[- ]?mentor)\s*[:\-]?\s*(.+)$/i);
  const studentId = lineText(front, /^\s*(?:jmbag|mati(?:č|c)ni\s+broj)\s*[:\-]?\s*(.+)$/i);

  return {
    university: '',
    faculty: '',
    study: clean(result?.selection?.program),
    author,
    title,
    workType,
    mentor,
    comentor,
    place,
    year,
    studentId,
  };
}

/**
 * Sastavlja asistirani plan za naslovnicu. Plan se nudi samo za verificirani službeni
 * predložak i pouzdano omeđenu prvu stranicu. Tekst se ne šalje u analizu niti se mijenja
 * prije korisničke potvrde.
 */
export function buildTitlePageRepairPlan(
  result: any,
  profile: any,
  template: TitlePageTemplate | null,
): TitlePageRepairPlan | null {
  if (!template || template.status !== 'verified' || template.provenance.status !== 'official') return null;
  if (profile?.checkTitlePage !== true) return null;

  const paragraphs = firstPageParagraphs(result?.preview?.paragraphs ?? []);
  const textParagraphs = paragraphs.filter((paragraph: any) => paragraph && typeof paragraph.text === 'string' && paragraph.text.trim());
  if (!paragraphs.length || !textParagraphs.length || !paragraphs.confident) return null;
  if (paragraphs.some((paragraph: any) => paragraph?.cell)) return null;

  const values = inferValues(result, profile);
  const model = buildModel(values, template);
  const warnings: string[] = [];
  if (template.level !== null && template.level !== (result?.settings?.workType ?? result?.selection?.workType)) {
    warnings.push('Predložak je preuzet iz druge vrste rada istog fakulteta. Provjeri ga prije primjene.');
  }
  if (template.supersededBy || template.outdated === true) {
    warnings.push('Za ovaj profil postoji novija ili označena zastarjela verzija naslovnice.');
  }
  if (template.logoRequired === true) {
    warnings.push(template.logoAvailable === true
      ? 'Službeni logo je obvezan prema profilu, ali neće biti umetnut bez zasebno verificirane datoteke.'
      : 'Službeni profil traži logo. Lekta ga neće umetnuti bez verificiranog službenog izvora.');
  }
  const missingSupported = template.elements
    .filter((element) => element.required && SUPPORTED_FIELDS.includes(element.role as keyof TitlePageRepairValues))
    .some((element) => !model.lines.some((line) => line.role === element.role));
  if (missingSupported) warnings.push('Neka obvezna polja naslovnice nisu prepoznata. Potvrdi ih u obrascu prije primjene.');

  return {
    paragraphCount: paragraphs.length,
    values,
    model,
    warnings,
    outdated: template.supersededBy !== undefined || template.outdated === true,
    logoRequired: template.logoRequired === true,
    logoAvailable: template.logoAvailable === true,
  };
}

function buildModel(values: TitlePageRepairValues, template: TitlePageTemplate): TitlePageModel {
  return buildTitlePage(values, template);
}

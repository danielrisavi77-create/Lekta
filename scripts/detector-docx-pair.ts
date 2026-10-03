import type { RuleEntry } from '../src/profiles/profile-schema';
import { buildDocx, TOC_FIELD_PARA, type ParaSpec } from '../tests/helpers/docx-builder';

export interface DetectorDocxPair {
  violatingBytes: Uint8Array;
  correctBytes: Uint8Array;
}

/** Controlled synthetic documents. Unsupported axes return null and can never yield a passing proof. */
export function buildDetectorDocxPair(
  entry: RuleEntry, profile: Record<string, any>, boundary: 'min' | 'max' = 'min',
): DetectorDocxPair | null {
  const body: ParaSpec = { text: 'Ovo je sintetički odlomak za provjeru detektora.' };
  const base: ParaSpec[] = [{ text: 'Naslov rada' }, { text: 'Uvod', styleId: 'Heading1' }, body,
    { text: 'Zaključak', styleId: 'Heading1' }];
  if (entry.checkId === 'toc' && entry.value === true && profile.requireToc === true) {
    return {
      violatingBytes: buildDocx({ paragraphs: base }),
      correctBytes: buildDocx({ paragraphs: [base[0], TOC_FIELD_PARA, ...base.slice(1)] }),
    };
  }
  if (entry.checkId === 'word-count') {
    const min = Number((entry.value as { min?: unknown } | null)?.min);
    const max = Number((entry.value as { max?: unknown } | null)?.max);
    if (!Number.isInteger(min) || min < 30 || min > 20_000
      || (Number.isFinite(max) && max < min)
      || (boundary === 'max' && (!Number.isInteger(max) || max > 20_000))) return null;
    const violatingCount = boundary === 'max' ? Math.floor(max * 1.1) + 1 : Math.ceil(min * 0.9) - 1;
    // The analyzer's scoped count also includes the one-word Zaključak heading.
    const words = (count: number) => Array.from({ length: count - 1 }, () => 'tekst').join(' ');
    return {
      violatingBytes: buildDocx({ paragraphs: [base[0], base[1], { text: words(violatingCount) }, base[3]] }),
      correctBytes: buildDocx({ paragraphs: [base[0], base[1], { text: words(min) }, base[3]] }),
    };
  }
  if (entry.checkId === 'required-sections') {
    const required = Array.isArray(profile.requiredSections) ? profile.requiredSections : [];
    const labels = required.map((section: { label?: unknown; terms?: unknown }) => section.label)
      .filter((value: unknown): value is string => typeof value === 'string' && value.trim().length > 0);
    if (!labels.length || labels.length !== required.length || labels.length > 30) return null;
    const headings = labels.map((label: string): ParaSpec => ({ text: label, styleId: 'Heading1' }));
    return {
      violatingBytes: buildDocx({ paragraphs: [base[0], ...headings.slice(1), body] }),
      correctBytes: buildDocx({ paragraphs: [base[0], ...headings, body] }),
    };
  }
  if (entry.checkId === 'reference-count') {
    const minimum = Number(entry.value);
    if (!Number.isInteger(minimum) || minimum < 1 || minimum > 100) return null;
    const references = Array.from({ length: minimum }, (_, index): ParaSpec => ({
      text: `Autor${index + 1}, I. (${2000 + index}). Naslov izvora ${index + 1}. Zagreb: Izdavač.`,
    }));
    return {
      violatingBytes: buildDocx({ paragraphs: [...base, { text: 'Literatura', styleId: 'Heading1' }, ...references.slice(0, -1)] }),
      correctBytes: buildDocx({ paragraphs: [...base, { text: 'Literatura', styleId: 'Heading1' }, ...references] }),
    };
  }
  return null;
}

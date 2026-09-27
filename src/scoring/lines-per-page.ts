import { makeCheck, unmeasurableCheck, type Check } from './checks.ts';
import type { SectionMeasurement } from './evaluate/measurements.ts';

export interface LinesPerPageInput {
  size: unknown;
  spacing: unknown;
  font: unknown;
  sections: ReadonlyArray<Pick<SectionMeasurement, 'page' | 'margins'> & Partial<Pick<SectionMeasurement, 'paragraphIndex'>>>;
}

export interface LinesPerPageRange {
  min: number | null;
  max: number;
}

const TITLE = 'Redaka po stranici (kapacitet)';
const TNR_LINE_HEIGHT_FACTOR = 1.15;
const POINTS_PER_CM = 72 / 2.54;

interface CapacityDependencies {
  lineHeightFactor: number;
  supportsFont: (font: unknown) => boolean;
}

const DEFAULT_DEPENDENCIES: CapacityDependencies = {
  lineHeightFactor: TNR_LINE_HEIGHT_FACTOR,
  supportsFont: (font) => typeof font === 'string' && font.trim().toLowerCase() === 'times new roman',
};

/** Procijenjeni kapacitet, samo za Times New Roman s potpunim mjerenjima. */
export function linesPerPageCapacity(input: LinesPerPageInput, dependencies: CapacityDependencies = DEFAULT_DEPENDENCIES): number | null {
  if (!dependencies.supportsFont(input.font)) return null;
  const size = input.size;
  const spacing = input.spacing;
  if (typeof size !== 'number' || !Number.isFinite(size) || size <= 0 ||
      typeof spacing !== 'number' || !Number.isFinite(spacing) || spacing <= 0) return null;
  const sections = input.sections;
  let section = sections[0];
  if (sections.length > 1) {
    let previous = 0;
    let longest = -1;
    for (const candidate of sections) {
      const end = candidate?.paragraphIndex;
      if (typeof end !== 'number' || !Number.isInteger(end) || end < previous) return null;
      const length = end - previous;
      if (length > longest) {
        section = candidate;
        longest = length;
      }
      previous = end;
    }
  }
  if (!section?.page || !section.margins) return null;
  const { h, w } = section.page;
  const { top, bottom, left, right } = section.margins;
  if ([h, w, top, bottom, left, right].some((v) => typeof v !== 'number' || !Number.isFinite(v)) ||
      h! <= 0 || w! <= 0 || top! < 0 || bottom! < 0 || left! < 0 || right! < 0 ||
      h! <= top! + bottom! || w! <= left! + right!) return null;
  return Math.floor(((h! - top! - bottom!) * POINTS_PER_CM) / (size * dependencies.lineHeightFactor * spacing));
}

/** Informativna usporedba; max je uvijek nula i odstupanje je u detalju. */
export function evaluateLinesPerPage(input: LinesPerPageInput, range: LinesPerPageRange | null | undefined): Check | null {
  if (!range) return null;
  const capacity = linesPerPageCapacity(input);
  if (capacity == null || !Number.isFinite(range.max) || (range.min != null && !Number.isFinite(range.min))) {
    return unmeasurableCheck('formatting', TITLE, 'Potreban je Times New Roman te zapisani font, veličina, prored, format stranice i sve margine.');
  }
  const expected = range.min == null ? `do ${range.max}` : `${range.min}-${range.max}`;
  const passed = capacity <= range.max && (range.min == null || capacity >= range.min);
  return makeCheck('formatting', TITLE, 'informational', 0, 0,
    `Kapacitet ${capacity} redaka po stranici ${passed ? 'odgovara' : 'ne odgovara'} rasponu iz pravilnika: ${expected}.`);
}

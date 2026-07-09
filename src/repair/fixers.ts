// src/repair/fixers.ts
//
// Fixer registry iz REPAIR_ENGINE.md sekcije 5, prilagoden regex-patch
// pristupu iz xml-patch.ts umjesto DOM pristupa. Svaki fixer prima trenutne
// XML stringove (document.xml, styles.xml) i vraca nove stringove plus
// citljiv changelog (hrvatski, "2,0 cm -> 2,5 cm", ne sirovi twips).

import {
  patchMargins,
  patchPaperSize,
  patchDefaultFont,
  patchDefaultSpacing,
  patchDefaultAlignment,
} from './xml-patch';

export interface DocxXmlParts {
  documentXml: string;
  stylesXml: string;
}

export interface FixerOutput {
  parts: DocxXmlParts;
  applied: boolean;
  beforeLabel: string;
  afterLabel: string;
}

const NO_OP = (parts: DocxXmlParts): FixerOutput => ({ parts, applied: false, beforeLabel: '', afterLabel: '' });

// === Konverzije jedinica ===
// OOXML koristi twips (1/1440 inca) za marge/format stranice, half-points za
// velicinu fonta, i "twips po redu" gdje 240 = jednostruki prored (lineRule=auto).

function cmToTwips(cm: number): number {
  return Math.round((cm / 2.54) * 1440);
}
function twipsToCmLabel(twips: string): string {
  const n = parseInt(twips, 10);
  return `${(n / 1440 * 2.54).toFixed(2).replace('.', ',')} cm`;
}
function ptToHalfPoints(pt: number): number {
  return Math.round(pt * 2);
}
function halfPointsToPtLabel(hp: string): string {
  const n = parseInt(hp, 10);
  return `${n / 2} pt`;
}
function multiplierToTwips(multiplier: number): number {
  return Math.round(multiplier * 240);
}
function twipsToMultiplierLabel(twips: string): string {
  const n = parseInt(twips, 10);
  return `${(n / 240).toFixed(2).replace('.', ',')}x prored`;
}

function joinLabels(entries: Record<string, string>, formatFn: (v: string) => string): string {
  return Object.values(entries).map(formatFn).join(', ');
}

// Imena strana za margins changelog: bez ovoga korisnik vidi samo vrijednosti
// i ne zna KOJA se margina promijenila.
const MARGIN_SIDE_LABELS: Record<string, string> = {
  'w:top': 'gornja',
  'w:right': 'desna',
  'w:bottom': 'donja',
  'w:left': 'lijeva',
};

function joinMarginLabels(entries: Record<string, string>): string {
  return Object.entries(entries)
    .map(([attr, v]) => `${MARGIN_SIDE_LABELS[attr] ?? attr} ${twipsToCmLabel(v)}`)
    .join(', ');
}

// === Fixeri ===

export function marginsFixer(
  parts: DocxXmlParts,
  marginsCm: Partial<Record<'top' | 'right' | 'bottom' | 'left', number>>,
): FixerOutput {
  const twips: Partial<Record<'top' | 'right' | 'bottom' | 'left', number>> = {};
  for (const key of ['top', 'right', 'bottom', 'left'] as const) {
    if (marginsCm[key] !== undefined) twips[key] = cmToTwips(marginsCm[key]!);
  }
  const result = patchMargins(parts.documentXml, twips);
  if (!result.applied) return NO_OP(parts);

  return {
    parts: { ...parts, documentXml: result.xml },
    applied: true,
    beforeLabel: `Margine: ${joinMarginLabels(result.before)}`,
    afterLabel: `Margine: ${joinMarginLabels(result.after)}`,
  };
}

export function paperSizeFixer(parts: DocxXmlParts, sizeCm: { w: number; h: number }): FixerOutput {
  const result = patchPaperSize(parts.documentXml, { w: cmToTwips(sizeCm.w), h: cmToTwips(sizeCm.h) });
  if (!result.applied) return NO_OP(parts);

  return {
    parts: { ...parts, documentXml: result.xml },
    applied: true,
    beforeLabel: `Format stranice: ${twipsToCmLabel(result.before['w:w'])} x ${twipsToCmLabel(result.before['w:h'])}`,
    afterLabel: `Format stranice: ${twipsToCmLabel(result.after['w:w'])} x ${twipsToCmLabel(result.after['w:h'])}`,
  };
}

export function fontFixer(
  parts: DocxXmlParts,
  update: { fontName?: string; fontSizePt?: number },
): FixerOutput {
  const result = patchDefaultFont(parts.stylesXml, {
    fontName: update.fontName,
    sizeHalfPoints: update.fontSizePt !== undefined ? ptToHalfPoints(update.fontSizePt) : undefined,
  });
  if (!result.applied) return NO_OP(parts);

  const beforeParts: string[] = [];
  const afterParts: string[] = [];
  if (result.before.fontName !== undefined) {
    beforeParts.push(`Font: ${result.before.fontName}`);
    afterParts.push(`Font: ${result.after.fontName}`);
  }
  if (result.before.sizeHalfPoints !== undefined) {
    beforeParts.push(`Veličina: ${halfPointsToPtLabel(result.before.sizeHalfPoints)}`);
    afterParts.push(`Veličina: ${halfPointsToPtLabel(result.after.sizeHalfPoints)}`);
  }

  return {
    parts: { ...parts, stylesXml: result.xml },
    applied: true,
    beforeLabel: beforeParts.join(', '),
    afterLabel: afterParts.join(', '),
  };
}

export function lineSpacingFixer(parts: DocxXmlParts, multiplier: number): FixerOutput {
  const result = patchDefaultSpacing(parts.stylesXml, multiplierToTwips(multiplier), 'auto');
  if (!result.applied) return NO_OP(parts);

  return {
    parts: { ...parts, stylesXml: result.xml },
    applied: true,
    beforeLabel: `Prored: ${twipsToMultiplierLabel(result.before['w:line'])}`,
    afterLabel: `Prored: ${twipsToMultiplierLabel(result.after['w:line'])}`,
  };
}

const ALIGNMENT_LABELS: Record<string, string> = {
  left: 'lijevo',
  right: 'desno',
  center: 'sredina',
  both: 'obostrano (justify)',
};

export function alignmentFixer(parts: DocxXmlParts, val: 'left' | 'right' | 'center' | 'both'): FixerOutput {
  const result = patchDefaultAlignment(parts.stylesXml, val);
  if (!result.applied) return NO_OP(parts);

  return {
    parts: { ...parts, stylesXml: result.xml },
    applied: true,
    beforeLabel: `Poravnanje: ${ALIGNMENT_LABELS[result.before['w:val']] ?? result.before['w:val']}`,
    afterLabel: `Poravnanje: ${ALIGNMENT_LABELS[result.after['w:val']] ?? result.after['w:val']}`,
  };
}

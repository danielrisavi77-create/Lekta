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
  patchDefaultParagraphSpacing,
  patchDefaultAlignment,
  patchSectionPageNumbering,
  type SectionNumberingTarget,
} from './xml-patch';
import { stripDirectFormatting, type RunLevelResult } from './run-level';
import { stripOrphanedEmptyParagraphs } from './paragraph-cleanup';

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
function twentiethsToPtLabel(twentieths: string): string {
  const n = parseInt(twentieths, 10);
  return `${n / 20} pt`;
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

// Feature B (deep): spoji rezultat stilskog patcha s v2 ciscenjem izravnog
// formatiranja (run-level.ts). Deep radi na document.xml, stilski fixeri na
// styles.xml, pa se rezultati ne preklapaju. applied je true cim je BILO STO
// promijenjeno; changelog objasnjava oba dijela.
function combineDeep(base: FixerOutput, parts: DocxXmlParts, deep: RunLevelResult | null): FixerOutput {
  if (!deep || !deep.applied) return base;
  const mergedParts: DocxXmlParts = { ...(base.applied ? base.parts : parts), documentXml: deep.xml };
  const deepNote = `izravno formatiranje uklonjeno u ${deep.paragraphsTouched} odlomaka`;
  if (!base.applied) {
    return {
      parts: mergedParts,
      applied: true,
      beforeLabel: 'Izravno formatiranje u tekstu',
      afterLabel: deepNote,
    };
  }
  return {
    parts: mergedParts,
    applied: true,
    beforeLabel: base.beforeLabel,
    afterLabel: `${base.afterLabel}; ${deepNote}`,
  };
}

// === Normal stil: provjera nadjacava li cilj (za sigurnost deep ciscenja) ===
// Deep skida run-level font/velicinu tako da run nasljedi iz Normal stila pa
// docDefaults. Ako Normal stil sam definira DRUGACIJI font/velicinu, skidanje
// bi regresiralo run na Normal umjesto na cilj: te slucajeve deep preskace.

/** Run-rPr Normal stila (child od <w:style>, ne pPr>rPr paragraph-mark). */
function normalRunRPr(stylesXml: string): string {
  const styleMatch = stylesXml.match(/<w:style\b[^>]*w:styleId="Normal"[^>]*>[\s\S]*?<\/w:style>/);
  if (!styleMatch) return '';
  const withoutPPr = styleMatch[0].replace(/<w:pPr\b[\s\S]*?<\/w:pPr>/, '');
  const rPr = withoutPPr.match(/<w:rPr\b[\s\S]*?<\/w:rPr>/);
  return rPr ? rPr[0] : '';
}

function normalStyleConflictsFont(stylesXml: string, target: string): boolean {
  const m = normalRunRPr(stylesXml).match(/<w:rFonts\b[^>]*w:ascii="([^"]*)"/);
  return !!m && m[1] !== target;
}

function normalStyleConflictsSize(stylesXml: string, targetHalfPoints: number): boolean {
  const m = normalRunRPr(stylesXml).match(/<w:sz\b[^>]*w:val="([^"]*)"/);
  return !!m && Number(m[1]) !== targetHalfPoints;
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
  update: { fontName?: string; fontSizePt?: number; deep?: boolean },
): FixerOutput {
  const result = patchDefaultFont(parts.stylesXml, {
    fontName: update.fontName,
    sizeHalfPoints: update.fontSizePt !== undefined ? ptToHalfPoints(update.fontSizePt) : undefined,
  });

  let base: FixerOutput;
  if (!result.applied) {
    base = NO_OP(parts);
  } else {
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
    base = {
      parts: { ...parts, stylesXml: result.xml },
      applied: true,
      beforeLabel: beforeParts.join(', '),
      afterLabel: afterParts.join(', '),
    };
  }

  // Deep SAMO za svojstva ciji stilski backstop postoji (result.found) I gdje
  // Normal stil NE nadjacava cilj drugom vrijednoscu. Efektivni font/velicina
  // Normal-odlomka dolazi iz Normal stila (ako ga definira) pa tek onda iz
  // docDefaults; da Normal ima drugaciji font, skidanje run-override-a bi run
  // regresiralo na Normal, ne na cilj. Bez backstopa (npr. theme-only docDefaults)
  // isto ne diramo (dokument bi pao na theme/naslijedjeno).
  const fontOk =
    update.fontName !== undefined &&
    result.found.fontName === true &&
    !normalStyleConflictsFont(parts.stylesXml, update.fontName);
  const sizeTarget = update.fontSizePt !== undefined ? ptToHalfPoints(update.fontSizePt) : undefined;
  const sizeOk =
    sizeTarget !== undefined &&
    result.found.sizeHalfPoints === true &&
    !normalStyleConflictsSize(parts.stylesXml, sizeTarget);
  const deepOpts = update.deep
    ? {
        stripFontName: fontOk,
        stripFontSizeNearHalfPoints: sizeOk ? sizeTarget : undefined,
      }
    : null;
  const deep =
    deepOpts && (deepOpts.stripFontName || deepOpts.stripFontSizeNearHalfPoints !== undefined)
      ? stripDirectFormatting(parts.documentXml, deepOpts)
      : null;
  return combineDeep(base, parts, deep);
}

export function lineSpacingFixer(parts: DocxXmlParts, multiplier: number, deep = false): FixerOutput {
  const result = patchDefaultSpacing(parts.stylesXml, multiplierToTwips(multiplier), 'auto');
  const base: FixerOutput = !result.applied
    ? NO_OP(parts)
    : {
        parts: { ...parts, stylesXml: result.xml },
        applied: true,
        beforeLabel: `Prored: ${twipsToMultiplierLabel(result.before['w:line'])}`,
        afterLabel: `Prored: ${twipsToMultiplierLabel(result.after['w:line'])}`,
      };

  // Backstop uvjet: Normal stil ima w:spacing s w:line (result.found), inace
  // bi skidanje direct proreda vratilo dokument na Word default, ne na cilj.
  const deepResult =
    deep && result.found['w:line'] === true
      ? stripDirectFormatting(parts.documentXml, { stripLineSpacing: true })
      : null;
  return combineDeep(base, parts, deepResult);
}

const ALIGNMENT_LABELS: Record<string, string> = {
  left: 'lijevo',
  right: 'desno',
  center: 'sredina',
  both: 'obostrano (justify)',
};

export function alignmentFixer(
  parts: DocxXmlParts,
  val: 'left' | 'right' | 'center' | 'both',
  deep = false,
): FixerOutput {
  const result = patchDefaultAlignment(parts.stylesXml, val);
  const base: FixerOutput = !result.applied
    ? NO_OP(parts)
    : {
        parts: { ...parts, stylesXml: result.xml },
        applied: true,
        beforeLabel: `Poravnanje: ${ALIGNMENT_LABELS[result.before['w:val']] ?? result.before['w:val']}`,
        afterLabel: `Poravnanje: ${ALIGNMENT_LABELS[result.after['w:val']] ?? result.after['w:val']}`,
      };

  // Deep ima smisla samo kad je cilj obostrano: skida se iskljucivo left/start
  // (Word default), namjerno centriranje/desno ostaje. Backstop uvjet: Normal
  // stil ima w:jc (result.found), inace nema jamstva ciljanog poravnanja.
  const deepResult =
    deep && val === 'both' && result.found['w:val'] === true
      ? stripDirectFormatting(parts.documentXml, { stripLeftJustify: true })
      : null;
  return combineDeep(base, parts, deepResult);
}

export function paragraphSpacingFixer(parts: DocxXmlParts, deep = false): FixerOutput {
  const result = patchDefaultParagraphSpacing(parts.stylesXml, 0, 0);
  const base: FixerOutput = !result.applied
    ? NO_OP(parts)
    : {
        parts: { ...parts, stylesXml: result.xml },
        applied: true,
        beforeLabel: `Razmak prije/poslije: ${twentiethsToPtLabel(result.before['w:before'] ?? '0')} / ${twentiethsToPtLabel(result.before['w:after'] ?? '0')}`,
        afterLabel: `Razmak prije/poslije: ${twentiethsToPtLabel(result.after['w:before'] ?? '0')} / ${twentiethsToPtLabel(result.after['w:after'] ?? '0')}`,
      };

  // Backstop uvjet: Normal stil ima w:spacing s w:before I w:after (result.found),
  // inace bi skidanje direct razmaka vratilo dokument na Word default, ne na cilj.
  const deepResult =
    deep && result.found['w:before'] === true && result.found['w:after'] === true
      ? stripDirectFormatting(parts.documentXml, { stripParagraphSpacing: true })
      : null;
  return combineDeep(base, parts, deepResult);
}

// Numeriranje stranica po sekcijama: rimski na prednjim listovima, arapski od Uvoda
// (start=1). Radi ISKLJUCIVO nad postojecim sekcijama (BL-06 korak a); ciljeve (koje su
// sekcije rimske, koja je prva glavna) racuna repair-items iz granice Uvoda, pa je fixer
// cisti XML transform. Nema deep varijante (pgNumType nije izravno formatiranje u tijelu).
export function pageNumberingFixer(parts: DocxXmlParts, targets: SectionNumberingTarget[]): FixerOutput {
  const result = patchSectionPageNumbering(parts.documentXml, targets);
  if (!result.applied) return NO_OP(parts);
  const roman = targets.filter((t) => /roman/i.test(t.fmt)).length;
  const decimal = targets.filter((t) => t.fmt === 'decimal').length;
  return {
    parts: { ...parts, documentXml: result.xml },
    applied: true,
    beforeLabel: 'Numeriranje stranica po sekcijama nije postavljeno',
    afterLabel: `Rimski na prednjim (${roman}), arapski od Uvoda (${decimal}), prva stranica = 1`,
  };
}

// Hrvatska deklinacija broja odlomaka (1 odlomak, 2-4 odlomka, 5+ odlomaka; 11-14 iznimka).
function odlomakLabel(n: number): string {
  const mod100 = n % 100;
  const mod10 = n % 10;
  let word: string;
  if (mod10 === 1 && mod100 !== 11) word = 'odlomak';
  else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) word = 'odlomka';
  else word = 'odlomaka';
  return `${n} ${word}`;
}

export function emptyParagraphFixer(parts: DocxXmlParts): FixerOutput {
  const result = stripOrphanedEmptyParagraphs(parts.documentXml);
  if (!result.applied) return NO_OP(parts);

  const totalBefore = result.paragraphsRemoved + result.runsCollapsed;
  return {
    parts: { ...parts, documentXml: result.xml },
    applied: true,
    beforeLabel: `Prazni odlomci: ${odlomakLabel(totalBefore)}`,
    afterLabel: `svedeno na ${odlomakLabel(result.runsCollapsed)}, uklonjeno ${result.paragraphsRemoved}`,
  };
}

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
  addFooterReferenceToSection,
  addContentTypeOverride,
  addRelationship,
  nextRelationshipId,
  nextFooterPartName,
  buildFooterPageXml,
  extractFinalSectionGeometry,
  insertSectionBreakBeforeHeading,
  FOOTER_CONTENT_TYPE,
  FOOTER_REL_TYPE,
  type SectionNumberingTarget,
  patchFootnoteTextSpacing,
  patchFooterPageAlignment,
  buildTocFieldXml,
  documentHasTocField,
  findParagraphEndAfterMatch,
} from './xml-patch';
import { stripDirectFormatting, type RunLevelResult } from './run-level';
import { stripOrphanedEmptyParagraphs } from './paragraph-cleanup';
import { sectionName } from '../utils/helpers';

export interface DocxXmlParts {
  documentXml: string;
  stylesXml: string;
  /** [Content_Types].xml (K5 footer part flow). Opcionalno: stariji pozivi daju samo doc+styles. */
  contentTypesXml?: string;
  /** word/_rels/document.xml.rels (K5). */
  documentRelsXml?: string;
  /** Novi partovi za dodati u zip (npr. word/footer1.xml). apply-fixers ih pise iz allow-liste. */
  addedParts?: { name: string; content: string }[];
  /** SVA imena zip entryja ulaznog docx-a (apply-fixers ih puni). Nuzno da imenovanje novog
   *  footer parta ne kolidira s orphan partom koji postoji u zipu ali NIJE u content-typesu. */
  existingParts?: string[];
  /** word/footnotes.xml, ako docx ima fusnote. Opcionalan: mnogi dokumenti nemaju
   * nijednu fusnotu, tada je dio odsutan iz zipa (isti obrazac kao stylesXml koji
   * je optional u apply-fixers.ts, samo strozi jer footnotes.xml smije potpuno
   * izostati). Postojeci fixeri ga ne diraju, samo ga transparentno prenose kroz
   * spread {...parts, ...}. */
  footnotesXml?: string;
  /** Sve postojece word/footerN.xml i word/headerN.xml datoteke iz zipa, kljucane
   *  punim imenom zip entryja. Popunjava apply-fixers.ts (isti regex kao PAGE
   *  detekcija u analyze-docx.ts). Za razliku od footer-page-fixer (K5) koji DODAJE
   *  nove partove, ovo su POSTOJECI partovi koje fixer smije UREDITI. */
  footerHeaderParts?: Record<string, string>;
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

export interface FooterPageTarget {
  /** Sekcija (dokument-poredak, isto kao pgNumType) u koju se umece podnozje s brojem stranice. */
  sectionIndex: number;
  align?: 'left' | 'center' | 'right';
}

// Podnozje s automatskim brojem stranice (K5, BL-07b). Umece novi footer part + <Override> +
// <Relationship> + <w:footerReference> u ciljni sectPr, uskladjeno (ili sve ili NO_OP). No-op i
// kad sekcija vec ima footer (ne diramo tudji), kad nema part flowa (content-types/rels) ili kad
// indeks ne postoji. NEMA deep varijante.
//
// POZNATA OGRANICENJA (svjesno deferirano, adversarial review K5):
//  - Ne suzbija naslovnicu i ne dijeli sekcije: to orkestrira K6 (titlePg + potvrda korisnika),
//    zato je K5 DARK (nije wiran u repair-items). Na jednosekcijskom radu broj bi pao i na
//    naslovnicu, pa se footer NE smije nuditi dok naslovnica nije zasebna sekcija (K6).
//  - Ne cita word/settings.xml: kod <w:evenAndOddHeaders/> broj bi bio samo na neparnim
//    stranicama (rijetka konfiguracija). Puna pokrivenost (even footerReference) je K6 dorada.
//  - Realna Word/LibreOffice valjanost dokazuje se rucnom K5 matricom (izlazni gate), ne
//    automatskim gateom (golden pokriva samo sinteticku XML-transform putanju).
export function footerPageFixer(parts: DocxXmlParts, target: FooterPageTarget): FixerOutput {
  const contentTypesXml = parts.contentTypesXml ?? '';
  const documentRelsXml = parts.documentRelsXml ?? '';
  const addedParts = parts.addedParts ?? [];
  if (!contentTypesXml || !documentRelsXml) return NO_OP(parts); // bez part flowa ne umecemo footer

  const rId = nextRelationshipId(documentRelsXml);
  // 1. footerReference u ciljni sectPr (no-op ako sekcija vec ima footer ili ne postoji).
  const secRes = addFooterReferenceToSection(parts.documentXml, target.sectionIndex, rId);
  if (!secRes.applied) return NO_OP(parts);
  // 2. novi footer part + content-type + relationship (sve troje ili NO_OP: bez djelomicnog stanja).
  // Ime bira preko content-types Override-a, dodanih partova I stvarnih zip entryja (existingParts),
  // inace bi orphan word/footerN.xml (u zipu bez Override-a) doveo do kolizije: apply-fixers bi
  // odbacio nas part kao "postoji", a footerReference/Override/rel bi ostali dangling na stari.
  const takenNames = [...addedParts.map((p) => p.name), ...(parts.existingParts ?? [])];
  const footerName = nextFooterPartName(contentTypesXml, takenNames);
  const ctRes = addContentTypeOverride(contentTypesXml, `/${footerName}`, FOOTER_CONTENT_TYPE);
  const relsRes = addRelationship(documentRelsXml, rId, FOOTER_REL_TYPE, footerName.replace(/^word\//, ''));
  if (!ctRes.applied || !relsRes.applied) return NO_OP(parts);

  // align iz nesigurnog params casta: svedi na whitelist (inace bi navodnik u vrijednosti
  // razbio <w:jc w:val="..."/> i proizveo nevaljan footer XML).
  const align: 'left' | 'center' | 'right' =
    target.align === 'left' || target.align === 'center' ? target.align : 'right';
  const alignLabel = align === 'right' ? 'desno' : align === 'center' ? 'sredina' : 'lijevo';
  return {
    parts: {
      ...parts,
      documentXml: secRes.xml,
      contentTypesXml: ctRes.xml,
      documentRelsXml: relsRes.xml,
      addedParts: [...addedParts, { name: footerName, content: buildFooterPageXml(align) }],
    },
    applied: true,
    beforeLabel: 'Podnozje s brojem stranice: nije postavljeno',
    afterLabel: `Umetnuto podnozje s automatskim brojem stranice (${alignLabel})`,
  };
}

// Fusnote: isti patch-only cilj kao paragraphSpacingFixer (0/0), ali preko FootnoteText
// stila umjesto Normal stila. FootnoteText JE stilska definicija pa zivi u word/styles.xml
// (isto mjesto kao Normal), NE u word/footnotes.xml; footnotes.xml sadrzi samo sam tekst
// fusnota (paragraphs), ne definicije stilova. Zato base patch cilja parts.stylesXml.
// Deep ciscenje ipak radi nad parts.footnotesXml: DIREKTNI pPr>spacing override na
// pojedinacnom footnote odlomku zivi u footnotes.xml, isto kao sto direktni override
// tijela zivi u document.xml. Provjera parts.footnotesXml na pocetku ostaje kao gate:
// dokument bez ijedne fusnote nema footnotes.xml u zipu, pa nema ni stvarnog cilja za
// ovaj popravak (analyzeDocx checkFootnoteParagraphSpacingZero ne prijavljuje nista
// kad nema fusnota), i ne pokusava se patchati prazan string.
export function footnoteSpacingFixer(parts: DocxXmlParts, deep = false): FixerOutput {
  if (!parts.footnotesXml) return NO_OP(parts);

  const result = patchFootnoteTextSpacing(parts.stylesXml, 0, 0);
  const base: FixerOutput = !result.applied
    ? NO_OP(parts)
    : {
        parts: { ...parts, stylesXml: result.xml },
        applied: true,
        beforeLabel: `Razmak prije/poslije (fusnote): ${twentiethsToPtLabel(result.before['w:before'] ?? '0')} / ${twentiethsToPtLabel(result.before['w:after'] ?? '0')}`,
        afterLabel: `Razmak prije/poslije (fusnote): ${twentiethsToPtLabel(result.after['w:before'] ?? '0')} / ${twentiethsToPtLabel(result.after['w:after'] ?? '0')}`,
      };

  // Backstop uvjet: FootnoteText stil ima w:spacing s w:before I w:after (result.found),
  // inace bi skidanje direct razmaka u fusnotama vratilo dokument na Word default, ne na cilj.
  // allowedStyleId: 'FootnoteText' jer footnote odlomci nose taj pStyle (ne
  // "Normal"), za razliku od stripDirectFormatting default poziva nad tijelom.
  const deepResult =
    deep && result.found['w:before'] === true && result.found['w:after'] === true
      ? stripDirectFormatting(parts.footnotesXml, { stripParagraphSpacing: true, allowedStyleId: 'FootnoteText' })
      : null;

  // combineDeep se ne moze ponovno iskoristiti ovdje: hardkodirano spaja deep izlaz u
  // parts.documentXml, a deep ciscenje fusnota radi nad zasebnim zip dijelom
  // (parts.footnotesXml). Isti obrazac spajanja prepisan rucno za footnotesXml.
  if (!deepResult || !deepResult.applied) return base;

  const mergedParts: DocxXmlParts = { ...(base.applied ? base.parts : parts), footnotesXml: deepResult.xml };
  const deepNote = `izravno formatiranje uklonjeno u ${deepResult.paragraphsTouched} odlomaka (fusnote)`;
  if (!base.applied) {
    return {
      parts: mergedParts,
      applied: true,
      beforeLabel: 'Izravno formatiranje u fusnotama',
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

export interface SectionInsertTarget {
  /** 1-based redni broj odlomka Uvoda (analyzeDocx introParagraphIndex). Sluzi SAMO kao gate signal
   *  (repair-items ga daje kad Uvod postoji, >=2); stvarno sidro fixer RE-DERIVIRA iz trenutnog XML-a
   *  po tekstu (adversarial K6 follow-up: raniji fixer u bateriji moze pomaknuti anal-time indeks). */
  introParagraphIndex: number;
  /** Poravnanje broja stranice u podnozju (kao footerPageFixer); default 'center'. */
  align?: 'left' | 'center' | 'right';
  /** w:fmt prednjih listova; default 'lowerRoman' (rimski mala slova). */
  frontFmt?: 'lowerRoman' | 'upperRoman';
}

// Naslovi Uvoda (ISTI kriterij kao analyzeDocx introParagraphIndex: sectionName(text) in ovom skupu).
const INTRO_HEADING_TERMS = ['uvod', 'introduction'];

// Umetanje sekcije prije Uvoda + kompletno "numeriranje od Uvoda" (K6, BL-07c). KOMPOZITNI
// fixer koji spaja tri koraka u jednu atomsku operaciju (sve ili NO_OP):
//  1. umetne prijelom sekcije prije Uvoda (insertSectionBreakBeforeHeading, sidro re-derivirano po
//     tekstu iz trenutnog XML-a); marker prednje
//     sekcije nosi geometriju stranice zavrsnog sectPr-a + <w:titlePg/> (naslovnica = "drukcija
//     prva stranica"; bez definiranog "first" footera Word na njoj ne prikaze broj),
//  2. postavi pgNumType: prednja sekcija (0) rimski start=1, glavna (1) arapski start=1 (K4),
//  3. umetne podnozje s PAGE poljem u prednju sekciju (K5 footerPageFixer); glavnu sekciju Word
//     NASLJEDJUJE, pa isti footer daje rimski broj na prednjim, arapski od Uvoda.
//
// NO_OP kad se prijelom ne moze umetnuti (Uvod nepoznat/ordinal<2, dokument vec ima prijelom
// tocno prije Uvoda -> idempotencija, sectPrChange, ili Uvod nije na razini tijela). pgNum i
// footer su najbolji trud NAD uspjesnim prijelomom; ako footer part flow (content-types/rels)
// nedostaje, prijelom + pgNum svejedno vrijede (broj se tada oslanja na postojece zaglavlje/
// podnozje). applied je true cim je prijelom umetnut.
//
// OPSEG K6 v1: SAMO jednosekcijski dokument (najcesci student rad; pipeline "dokument bez
// sekcija"). Hardkodirani ciljevi [{0,rimski},{1,arapski}] vrijede TEK kad umetanje da tocno
// dvije sekcije. Visesekcijski rad (npr. zasebna naslovnica s vlastitim sectPr, ili prijelom
// negdje u tijelu) trazio bi dinamicko mapiranje rimski/arapski preko svih sekcija i footer
// nasljedjivanje kroz vise granica; svjesno je odgodjeno (rucna matrica ga ne moze pouzdano
// pokriti). Zato je ovdje tvrdi backstop preSectPr.length===1; visesekcijski = NO_OP.
//
// POZNATA OGRANICENJA (svjesno deferirano na rucnu Word/LibreOffice matricu, izlazni gate K6):
//  - Realnu valjanost (otvara li Word bez upozorenja, nasljedjuje li glavna sekcija footer,
//    je li naslovnica doista bez broja) dokazuje rucna matrica; golden pokriva XML-transform.
//  - <w:evenAndOddHeaders/> u settings.xml (samo neparne stranice) se ne cita, kao u K5.
//  - Marker je prazan odlomak: neznatno povecava broj odlomaka, ali ga stiti nested-sectPr
//    guard u paragraph-cleanup (empty-paragraph-fixer ga nikad ne brise).
export function sectionInsertFixer(parts: DocxXmlParts, target: SectionInsertTarget): FixerOutput {
  if (/<w:sectPrChange\b/.test(parts.documentXml)) return NO_OP(parts);

  // Tvrdi backstop: samo jednosekcijski rad (ista enumeracija sectPr kao patchSectionPageNumbering).
  // Kad dokument vec ima prijelom (>1 sectPr), umetanje bi dalo >=3 sekcije i hardkodirani ciljevi
  // bi krivo mapirali prednji/glavni dio; radije NO_OP nego pogresno numeriranje.
  const preSectPr = parts.documentXml.match(/<w:sectPr\b[^>]*?(?:\/>|>[\s\S]*?<\/w:sectPr>)/g) ?? [];
  if (preSectPr.length !== 1) return NO_OP(parts);
  // Dokument s VLASTITOM prvo-stranica/zaglavlje/podnozje konfiguracijom se ne dira: ako jedina
  // sekcija vec ima <w:titlePg/> (autor je "drukcijom prvom stranicom" zabijelio naslovnicu) ili
  // header/footerReference, umetanje markera bi ostavilo titlePg na GLAVNOJ sekciji (Uvod bi ostao
  // bez broja jer bi mu prva stranica gadjala nedefinirani "first" footer), a postojeci footer bi
  // presao nasljedjivanje. Takve slucajeve svjesno deferiramo na rucnu matricu (isti oprez kao K5).
  // COMPOSABILITY (adversarial K6): repair-items UVIJEK poziva section-insert kao JEDINI zahtjev,
  // pa je preSectPr[0] izvorni dokument. U kombiniranoj bateriji s footer-page-fixerom (samo
  // sinteticki golden __kombinirano, nikad zivo) ovaj guard vidi vec ubacen footer pa NO_OP-a
  // (sigurno, posteno u skipped[]); prije batchanja section-inserta uz footer-page prebaci provjeru
  // na izvorni document.xml uhvacen u apply-fixers prije ijednog fixera.
  if (/<w:titlePg\b|<w:footerReference\b|<w:headerReference\b/.test(preSectPr[0])) return NO_OP(parts);

  const geo = extractFinalSectionGeometry(parts.documentXml);
  const markerSectPr = `<w:sectPr>${geo.pgSz ?? ''}${geo.pgMar ?? ''}<w:titlePg/></w:sectPr>`;
  // Sidro (Uvod) se RE-DERIVIRA iz TRENUTNOG documentXml po tekstu (sectionName), NE iz anal-time
  // target.introParagraphIndex (gate): raniji fixer u istoj bateriji (npr. empty-paragraph-fixer koji
  // brise odlomke) pomakne indeks pa bi prijelom pao na krivi odlomak (adversarial K6 follow-up).
  const ins = insertSectionBreakBeforeHeading(
    parts.documentXml,
    (t) => INTRO_HEADING_TERMS.includes(sectionName(t)),
    markerSectPr,
  );
  if (!ins.applied) return NO_OP(parts);

  // pgNumType: sekcija 0 (prednja) rimski start=1, sekcija 1 (glavna) arapski start=1.
  const front = target.frontFmt === 'upperRoman' ? 'upperRoman' : 'lowerRoman';
  const numbered = patchSectionPageNumbering(ins.xml, [
    { sectionIndex: 0, fmt: front, start: 1 },
    { sectionIndex: 1, fmt: 'decimal', start: 1 },
  ]);
  const docAfterNum = numbered.applied ? numbered.xml : ins.xml;

  // Footer s PAGE poljem u prednju sekciju (0); glavnu (1) Word nasljedjuje. Reuse K5.
  const align: 'left' | 'center' | 'right' =
    target.align === 'left' || target.align === 'right' ? target.align : 'center';
  const interim: DocxXmlParts = { ...parts, documentXml: docAfterNum };
  const footerRes = footerPageFixer(interim, { sectionIndex: 0, align });
  const finalParts = footerRes.applied ? footerRes.parts : interim;

  const footerNote = footerRes.applied ? ', broj stranice u podnožju' : '';
  return {
    parts: finalParts,
    applied: true,
    beforeLabel: 'Numeriranje od Uvoda nije postavljeno (jedna sekcija)',
    afterLabel: `Umetnut prijelom sekcije prije Uvoda: rimski na prednjim listovima, arapski od Uvoda (od 1), naslovnica bez broja${footerNote}`,
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

// Poravnanje broja stranice: postojeci footer/header partovi cije PAGE polje NIJE
// poravnato desno (analyzeDocx pageNumberAlignment check). BEZ deep moda: nema
// "direktni override u tijelu koji nadjaca stil" koncepta za footer/header poravnanje,
// cilj je jedini direktni zapis unutar samog footer/header parta. Prolazi kroz SVE
// postojece footerHeaderParts (deterministicki sort() zbog stabilnog golden snapshota),
// popravlja svaki koji ima krivo poravnano PAGE polje; namjerno siri opseg od audita
// (koji gleda samo sectPr-referencirane mete) jer popravljanje nereferenciranog
// ("orphan") footera je bezopasno, vidi CLAUDE.md/plan zabiljesku.
export function pageNumberAlignmentFixer(parts: DocxXmlParts): FixerOutput {
  const partsMap = parts.footerHeaderParts ?? {};
  const names = Object.keys(partsMap).sort();
  const updated: Record<string, string> = {};
  let firstBefore: string | null = null;
  let touchedCount = 0;
  for (const name of names) {
    const result = patchFooterPageAlignment(partsMap[name], 'right');
    if (!result.applied) continue;
    touchedCount += 1;
    if (firstBefore == null) firstBefore = result.before['w:val'] ?? null;
    updated[name] = result.xml;
  }
  if (touchedCount === 0) return NO_OP(parts);
  const countNote = touchedCount > 1 ? ` (${touchedCount} podnožja/zaglavlja)` : '';
  return {
    parts: { ...parts, footerHeaderParts: { ...partsMap, ...updated } },
    applied: true,
    beforeLabel: `Poravnanje broja stranice: ${ALIGNMENT_LABELS[firstBefore ?? ''] ?? firstBefore}`,
    afterLabel: `Poravnanje broja stranice: desno${countNote}`,
  };
}

export interface TocFieldTarget {
  /** 1-based redni broj odlomka naslova "Sadrzaj" (analyzeDocx details.sadrzajParagraphIndex).
   *  Sluzi SAMO kao gate signal (repair-items ga daje kad Sadrzaj postoji); stvarnu poziciju
   *  umetanja fixer RE-DERIVIRA iz trenutnog XML-a (vidi nize). */
  sadrzajParagraphIndex: number;
}

// Naslovi koji oznacavaju sadrzaj (ISTI kriterij kao analyzeDocx sadrzajParagraphIndex / tocEntryParagraphs).
const TOC_HEADING_TERMS = ['sadrzaj', 'contents', 'tableofcontents'];

// TOC polje s dirty flagom (K7, BL-09). Umece ZIVO TOC polje (fldChar, w:dirty) neposredno IZA
// naslova "Sadrzaj". Rucno utipkane stavke se NE brisu (samo dodajemo polje; preporuka za brisanje
// je u afterLabel, panel je prikaze u sazetku). NEMA deep varijante.
//
// SIDRO SE RE-DERIVIRA iz TRENUTNOG documentXml po tekstu naslova (sectionName), NE iz anal-time
// indeksa (adversarial K7, HIGH): raniji fixeri u bateriji (empty-paragraph-fixer BRISE odlomke,
// section-insert-fixer DODAJE odlomak) pomicu broj odlomaka pa bi anal-time indeks umetnuo TOC na
// krivo mjesto. target.sadrzajParagraphIndex zato sluzi SAMO kao gate (postoji li Sadrzaj po analizi).
//
// NO_OP kad: nema sidra po analizi (sadrzajParagraphIndex<1), dokument VEC ima zivo TOC polje
// (documentHasTocField -> ne dupliciramo, idempotencija), ili se naslov Sadrzaj ne nadje na razini
// tijela u trenutnom XML-u.
//
// POZNATA OGRANICENJA (svjesno deferirano, izlazni gate K7 = rucna Word provjera):
//  - w:dirty na begin fldChar tjera Word da regenerira TOC pri otvaranju; NE pisemo
//    <w:updateFields> u word/settings.xml, pa preglednici koji ne osvjezavaju polja na otvaranju
//    (LibreOffice, Google Docs) prikazu placeholder tekst dok korisnik rucno ne osvjezi. Word (cilj
//    izlaznog gatea) postuje w:dirty; cross-viewer updateFields je moguca K7 dorada.
//  - Ako "Sadrzaj" postoji SAMO ugnjezden (tablica/okvir), sidro se ne nadje na razini tijela pa je
//    NO_OP (analyzeDocx sadrzajParagraphIndex broji i ugnjezdene odlomke pa repair-items ga svejedno
//    moze ponuditi; ishod je siguran no-op, ne kriva izmjena).
export function tocFieldFixer(parts: DocxXmlParts, target: TocFieldTarget): FixerOutput {
  if (!target || typeof target.sadrzajParagraphIndex !== 'number' || target.sadrzajParagraphIndex < 1) {
    return NO_OP(parts);
  }
  // Ne dupliciraj: ako dokument vec ima zivo TOC polje, ne diramo ga. Ovime je fixer idempotentan
  // (nas vlastiti izlaz ima fldChar TOC polje koje documentHasTocField prepozna).
  if (documentHasTocField(parts.documentXml)) return NO_OP(parts);

  const pos = findParagraphEndAfterMatch(parts.documentXml, (t) => TOC_HEADING_TERMS.includes(sectionName(t)));
  if (pos < 0) return NO_OP(parts);
  const documentXml = parts.documentXml.slice(0, pos) + buildTocFieldXml() + parts.documentXml.slice(pos);
  return {
    parts: { ...parts, documentXml },
    applied: true,
    beforeLabel: 'Sadržaj: ručno upisane stavke (bez živog TOC polja)',
    afterLabel: 'Umetnuto automatsko TOC polje (Word ga osvježi pri otvaranju); ručno upisane stavke sadržaja ispod možeš obrisati',
  };
}

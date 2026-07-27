// src/repair/apply-fixers.ts
//
// Spaja zip-codec.ts (citanje/pisanje docx zipa) i fixers.ts (ciljani XML
// patch) u jedan tijek: ucitaj docx, primijeni odabrane popravke SAMO na
// word/document.xml i word/styles.xml, vrati novi docx gdje su SVI ostali
// zip entryji (slike, headeri, footeri, _rels, theme) neizmijenjeni.

import { readZip, writeZip, type ZipEntry } from './zip-codec.ts';
import {
  marginsFixer,
  paperSizeFixer,
  fontFixer,
  lineSpacingFixer,
  alignmentFixer,
  paragraphSpacingFixer,
  pageNumberingFixer,
  footerPageFixer,
  sectionInsertFixer,
  emptyParagraphFixer,
  footnoteSpacingFixer,
  pageNumberAlignmentFixer,
  tocFieldFixer,
  headingFormatFixer,
  footnoteTypographyFixer,
  headingCaseFixer,
  type HeadingLevelTarget,
  type DocxXmlParts,
  type FooterPageTarget,
  type SectionInsertTarget,
  type TocFieldTarget,
  type FixerNoOpReason,
} from './fixers.ts';
import type { SectionNumberingTarget } from './xml-patch.ts';

/** Poznati fixeri kao runtime konstanta: profile-validator provjerava clanstvo
 * fixerId-a iz podataka u ovom popisu (tipfeler u draftu = strukturna greska,
 * ne tihi no-op u runtimeu). Tip FixerId se izvodi iz istog popisa. */
export const FIXER_IDS = [
  'margins-fixer',
  'paper-size-fixer',
  'font-fixer',
  'line-spacing-fixer',
  'alignment-fixer',
  'paragraph-spacing-fixer',
  'page-numbering-fixer',
  'footer-page-fixer',
  'section-insert-fixer',
  'empty-paragraph-fixer',
  'footnote-spacing-fixer',
  'page-number-alignment-fixer',
  'toc-field-fixer',
  'heading-format-fixer',
  'footnote-typography-fixer',
  'heading-case-fixer',
] as const;

export type FixerId = (typeof FIXER_IDS)[number];

export interface FixerRequest {
  fixerId: FixerId;
  ruleId: string;
  params: Record<string, unknown>;
}

export interface ChangelogEntry {
  ruleId: string;
  fixerId: FixerId;
  beforeLabel: string;
  afterLabel: string;
}

export interface ApplyFixersResult {
  docxBytes: Uint8Array;
  changelog: ChangelogEntry[];
  skipped: string[]; // ruleId-evi koje nismo uspjeli primijeniti (fail-safe, ne baca)
  /** RE-36/41: ruleId -> zasto (kad je poznato). Cisto ADITIVNO polje (skipped ostaje nepromijenjen
   *  radi wire-kompatibilnosti sa serverskim putem); UI ga koristi da "vec uskladjeno" ne izgleda
   *  kao "nije bilo moguce". Bez zapisa za ruleId = razlog nije klasificiran (npr. fixer je bacio). */
  skippedReasons: Record<string, FixerNoOpReason>;
}

const DOCUMENT_XML_PATH = 'word/document.xml';
const STYLES_XML_PATH = 'word/styles.xml';
const CONTENT_TYPES_PATH = '[Content_Types].xml';
const DOCUMENT_RELS_PATH = 'word/_rels/document.xml.rels';
// Engine POLITIKA (K5): jedini novi partovi koje engine smije DODATI su word/footerN.xml.
// Backstop protiv fixera koji bi (greskom) pokusao ubaciti bilo sto izvan te maske.
const ENGINE_ADDABLE_PART = /^word\/footer\d+\.xml$/;
const FOOTNOTES_XML_PATH = 'word/footnotes.xml';
// Isti regex kao PAGE-part enumeracija u analyze-docx.ts (linija ~47): svi POSTOJECI
// footer/header partovi, ne samo footeri koje K5 smije dodati (ENGINE_ADDABLE_PART).
const FOOTER_HEADER_PART_RE = /^word\/(footer|header)\d+\.xml$/i;

// RE-27: skalarni parametar mora biti PRAVI konacan broj prije nego udje u cmToTwips/
// ptToHalfPoints/multiplierToTwips; inace NaN prolazi kroz Number(...)/String(...) i zavrsi kao
// LITERALNI string "NaN" upisan u XML atribut (schema-nevaljan dokument prijavljen kao popravljen).
function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

const ALIGNMENT_VAL_VALUES = new Set(['left', 'right', 'center', 'both']);
const PAGE_ALIGN_VALUES = new Set(['left', 'center', 'right']);

function runFixer(fixerId: FixerId, parts: DocxXmlParts, rawParams: Record<string, unknown>) {
  // Nedostajuci parametri su NO-OP, ne pad: pozivatelj (Edge, UI, golden harness) smije poslati
  // zahtjev bez `params`, a citanje polja iz undefined bi srusilo cijeli popravak.
  const params = rawParams ?? {};
  switch (fixerId) {
    case 'margins-fixer': {
      // RE-27: svaka margina se validira POJEDINACNO (ne cijeli objekt odjednom), pa jedna
      // nevaljana vrijednost ne obara ostale ispravne margine u istom zahtjevu.
      const p = params as Partial<Record<'top' | 'right' | 'bottom' | 'left', unknown>>;
      const marginsCm: Partial<Record<'top' | 'right' | 'bottom' | 'left', number>> = {};
      for (const key of ['top', 'right', 'bottom', 'left'] as const) {
        if (isFiniteNumber(p[key])) marginsCm[key] = p[key];
      }
      return marginsFixer(parts, marginsCm);
    }
    case 'paper-size-fixer': {
      const p = params as { w?: unknown; h?: unknown };
      return isFiniteNumber(p.w) && isFiniteNumber(p.h)
        ? paperSizeFixer(parts, { w: p.w, h: p.h })
        : { parts, applied: false, beforeLabel: '', afterLabel: '', reason: 'invalid-params' as const };
    }
    case 'font-fixer': {
      const p = params as { fontName?: unknown; fontSizePt?: unknown; deep?: boolean };
      const fontName = typeof p.fontName === 'string' && p.fontName.trim() !== '' ? p.fontName : undefined;
      const fontSizePt = isFiniteNumber(p.fontSizePt) ? p.fontSizePt : undefined;
      return fontName !== undefined || fontSizePt !== undefined
        ? fontFixer(parts, { fontName, fontSizePt, deep: p.deep === true })
        : { parts, applied: false, beforeLabel: '', afterLabel: '', reason: 'invalid-params' as const };
    }
    case 'line-spacing-fixer': {
      const p = params as { multiplier?: unknown; deep?: boolean };
      return isFiniteNumber(p.multiplier)
        ? lineSpacingFixer(parts, p.multiplier, p.deep === true)
        : { parts, applied: false, beforeLabel: '', afterLabel: '', reason: 'invalid-params' as const };
    }
    case 'alignment-fixer': {
      const p = params as { val?: unknown; deep?: boolean };
      return typeof p.val === 'string' && ALIGNMENT_VAL_VALUES.has(p.val)
        ? alignmentFixer(parts, p.val as 'left' | 'right' | 'center' | 'both', p.deep === true)
        : { parts, applied: false, beforeLabel: '', afterLabel: '', reason: 'invalid-params' as const };
    }
    case 'paragraph-spacing-fixer': {
      const p = params as { deep?: boolean };
      return paragraphSpacingFixer(parts, p.deep === true);
    }
    case 'page-numbering-fixer': {
      const p = params as { targets?: SectionNumberingTarget[] };
      return pageNumberingFixer(parts, Array.isArray(p.targets) ? p.targets : []);
    }
    case 'footer-page-fixer': {
      const p = params as { target?: FooterPageTarget };
      return p.target ? footerPageFixer(parts, p.target) : { parts, applied: false, beforeLabel: '', afterLabel: '', reason: 'invalid-params' as const };
    }
    case 'section-insert-fixer': {
      const p = params as { target?: SectionInsertTarget };
      return p.target && typeof p.target.introParagraphIndex === 'number'
        ? sectionInsertFixer(parts, p.target)
        : { parts, applied: false, beforeLabel: '', afterLabel: '', reason: 'invalid-params' as const };
    }
    case 'empty-paragraph-fixer':
      return emptyParagraphFixer(parts);
    case 'footnote-spacing-fixer': {
      const p = params as { deep?: boolean };
      return footnoteSpacingFixer(parts, p.deep === true);
    }
    case 'page-number-alignment-fixer': {
      // RE-27: nevaljana vrijednost se NE prosljedjuje doslovno (schema-nevaljan w:jc); tretira se
      // kao da nije poslana, pa fixerov vlastiti default ('right', jedina vrijednost koju ijedan
      // stvaran profil danas trazi) i dalje vrijedi.
      const p = params as { align?: unknown };
      const align = typeof p.align === 'string' && PAGE_ALIGN_VALUES.has(p.align) ? (p.align as 'left' | 'center' | 'right') : undefined;
      return pageNumberAlignmentFixer(parts, align);
    }
    case 'toc-field-fixer': {
      const p = params as { target?: TocFieldTarget };
      return p.target && typeof p.target.sadrzajParagraphIndex === 'number'
        ? tocFieldFixer(parts, p.target)
        : { parts, applied: false, beforeLabel: '', afterLabel: '', reason: 'invalid-params' as const };
    }
    case 'heading-format-fixer': {
      const p = params as { targets?: HeadingLevelTarget[] };
      return Array.isArray(p.targets) && p.targets.length
        ? headingFormatFixer(parts, p.targets)
        : { parts, applied: false, beforeLabel: '', afterLabel: '', reason: 'invalid-params' as const };
    }
    case 'footnote-typography-fixer': {
      const p = params as { fontName?: unknown; fontSizePt?: unknown };
      const fontName = typeof p.fontName === 'string' && p.fontName.trim() !== '' ? p.fontName : undefined;
      const fontSizePt = isFiniteNumber(p.fontSizePt) ? p.fontSizePt : undefined;
      return fontName !== undefined || fontSizePt !== undefined
        ? footnoteTypographyFixer(parts, { fontName, fontSizePt })
        : { parts, applied: false, beforeLabel: '', afterLabel: '', reason: 'invalid-params' as const };
    }
    case 'heading-case-fixer': {
      const p = params as { levels?: number[] };
      const levels = Array.isArray(p.levels) ? p.levels.map(Number).filter((n) => n >= 1 && n <= 9) : [];
      return levels.length
        ? headingCaseFixer(parts, levels)
        : { parts, applied: false, beforeLabel: '', afterLabel: '', reason: 'invalid-params' as const };
    }
    default:
      return { parts, applied: false, beforeLabel: '', afterLabel: '', reason: 'invalid-params' as const };
  }
}

export async function applyFixers(
  docxBytes: Uint8Array,
  requests: FixerRequest[],
): Promise<ApplyFixersResult> {
  const entries = await readZip(docxBytes);
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();

  const documentEntry = entries.find((e) => e.name === DOCUMENT_XML_PATH);
  const stylesEntry = entries.find((e) => e.name === STYLES_XML_PATH);
  const contentTypesEntry = entries.find((e) => e.name === CONTENT_TYPES_PATH);
  const documentRelsEntry = entries.find((e) => e.name === DOCUMENT_RELS_PATH);
  const footnotesEntry = entries.find((e) => e.name === FOOTNOTES_XML_PATH);
  const footerHeaderEntries = entries.filter((e) => FOOTER_HEADER_PART_RE.test(e.name));

  if (!documentEntry) {
    throw new Error(`apply-fixers: nedostaje ${DOCUMENT_XML_PATH} u docx-u, nije valjan Word dokument`);
  }

  let parts: DocxXmlParts = {
    documentXml: decoder.decode(documentEntry.data),
    stylesXml: stylesEntry ? decoder.decode(stylesEntry.data) : '',
    contentTypesXml: contentTypesEntry ? decoder.decode(contentTypesEntry.data) : '',
    documentRelsXml: documentRelsEntry ? decoder.decode(documentRelsEntry.data) : '',
    addedParts: [],
    // Sva postojeca imena partova: footer imenovanje ih mora vidjeti da ne kolidira s
    // orphan word/footerN.xml koji je u zipu ali ne u content-typesu (adversarial K5 nalaz).
    existingParts: entries.map((e) => e.name),
    footnotesXml: footnotesEntry ? decoder.decode(footnotesEntry.data) : undefined,
    footerHeaderParts: Object.fromEntries(
      footerHeaderEntries.map((e) => [e.name, decoder.decode(e.data)]),
    ),
  };
  // Zapamti pocetne stringove: dio se re-enkodira SAMO ako ga je neki fixer
  // stvarno promijenio. TextDecoder je non-fatal (nevaljani UTF-8 -> U+FFFD),
  // pa bi bezuvjetni decode+encode tiho prepisao bajtove i netaknutog dijela.
  const originalDocumentXml = parts.documentXml;
  const originalStylesXml = parts.stylesXml;
  const originalContentTypes = parts.contentTypesXml;
  const originalDocumentRels = parts.documentRelsXml;
  const originalFootnotesXml = parts.footnotesXml;
  const originalFooterHeaderParts = { ...parts.footerHeaderParts };

  const changelog: ChangelogEntry[] = [];
  const skipped: string[] = [];
  const skippedReasons: Record<string, FixerNoOpReason> = {};

  for (const request of requests) {
    let result: ReturnType<typeof runFixer>;
    try {
      result = runFixer(request.fixerId, parts, request.params);
    } catch {
      // RE-26: fixer koji BACI (neocekivana/rubna kombinacija ulaza) ne smije oboriti CIJELU
      // bateriju, ukljucivo popravke VEC uspjesno primijenjene prije njega u istom pozivu. Server
      // bez ovoga mapira ijedan takav pad u 422 invalid_docx, sto krivo optuzuje korisnikov
      // dokument umjesto internog buga fixera. Isti fail-safe tretman kao "nije uspio primijeniti".
      // Razlog se ovdje NAMJERNO ne biljezi (neocekivan pad, ne uobicajen no-op).
      skipped.push(request.ruleId);
      continue;
    }
    if (!result.applied) {
      // Fail-safe: fixer nije uspio primijeniti popravak (npr. atribut ne
      // postoji u ovom dokumentu), tiho preskoci, ne baca korisniku gresku.
      skipped.push(request.ruleId);
      // RE-36/41: reason (kad ga fixer racuna) omogucuje UI-ju da razdvoji "vec uskladjeno" od
      // "nije bilo moguce", umjesto identicnog popisa krivnji za oba slucaja.
      if (result.reason) skippedReasons[request.ruleId] = result.reason;
      continue;
    }
    parts = result.parts;
    changelog.push({
      ruleId: request.ruleId,
      fixerId: request.fixerId,
      beforeLabel: result.beforeLabel,
      afterLabel: result.afterLabel,
    });
  }

  // Nijedan popravak nije primijenjen: vrati ULAZNE bajtove bit-identicne
  // (bez rekompresije, bez re-encode), da "popravljeni" dokument bez popravaka
  // ne bude tiho prepisan.
  if (changelog.length === 0) {
    return { docxBytes, changelog, skipped, skippedReasons };
  }

  // Rekonstruiraj zip: SAMO stvarno promijenjeni dio (document.xml odnosno
  // styles.xml) dobiva novi sadrzaj, svi ostali entryji prolaze bez ikakve
  // izmjene (isti Uint8Array objekt).
  const newEntries: ZipEntry[] = entries.map((entry) => {
    if (entry.name === DOCUMENT_XML_PATH && parts.documentXml !== originalDocumentXml) {
      return { name: entry.name, data: encoder.encode(parts.documentXml) };
    }
    if (entry.name === STYLES_XML_PATH && stylesEntry && parts.stylesXml !== originalStylesXml) {
      return { name: entry.name, data: encoder.encode(parts.stylesXml) };
    }
    if (entry.name === CONTENT_TYPES_PATH && contentTypesEntry && (parts.contentTypesXml ?? '') !== originalContentTypes) {
      return { name: entry.name, data: encoder.encode(parts.contentTypesXml ?? '') };
    }
    if (entry.name === DOCUMENT_RELS_PATH && documentRelsEntry && (parts.documentRelsXml ?? '') !== originalDocumentRels) {
      return { name: entry.name, data: encoder.encode(parts.documentRelsXml ?? '') };
    }
    if (entry.name === FOOTNOTES_XML_PATH && footnotesEntry && parts.footnotesXml !== originalFootnotesXml) {
      return { name: entry.name, data: encoder.encode(parts.footnotesXml) };
    }
    if (
      FOOTER_HEADER_PART_RE.test(entry.name) &&
      parts.footerHeaderParts?.[entry.name] !== undefined &&
      parts.footerHeaderParts[entry.name] !== originalFooterHeaderParts[entry.name]
    ) {
      return { name: entry.name, data: encoder.encode(parts.footerHeaderParts[entry.name]) };
    }
    return entry; // netaknuto, isti podatak
  });

  // Novi partovi (K5 footer flow): SAMO iz allow-liste (word/footerN.xml) i SAMO imena koja
  // jos ne postoje u zipu (ne prepisujemo postojeci part). Ostalo se tiho odbacuje (backstop
  // protiv fixera koji bi pokusao dodati part izvan politike enginea).
  const existingNames = new Set(entries.map((e) => e.name));
  for (const p of parts.addedParts ?? []) {
    if (!ENGINE_ADDABLE_PART.test(p.name) || existingNames.has(p.name)) continue;
    existingNames.add(p.name);
    newEntries.push({ name: p.name, data: encoder.encode(p.content) });
  }

  const newDocxBytes = await writeZip(newEntries);

  return { docxBytes: newDocxBytes, changelog, skipped, skippedReasons };
}

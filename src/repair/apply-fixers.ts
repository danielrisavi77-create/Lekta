// src/repair/apply-fixers.ts
//
// Spaja zip-codec.ts (citanje/pisanje docx zipa) i fixers.ts (ciljani XML
// patch) u jedan tijek: ucitaj docx, primijeni odabrane popravke SAMO na
// word/document.xml i word/styles.xml, vrati novi docx gdje su SVI ostali
// zip entryji (slike, headeri, footeri, _rels, theme) neizmijenjeni.

import { readZip, writeZip, type ZipEntry } from './zip-codec';
import {
  marginsFixer,
  paperSizeFixer,
  fontFixer,
  lineSpacingFixer,
  alignmentFixer,
  paragraphSpacingFixer,
  pageNumberingFixer,
  footerPageFixer,
  emptyParagraphFixer,
  footnoteSpacingFixer,
  pageNumberAlignmentFixer,
  type DocxXmlParts,
  type FooterPageTarget,
} from './fixers';
import type { SectionNumberingTarget } from './xml-patch';

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
  'empty-paragraph-fixer',
  'footnote-spacing-fixer',
  'page-number-alignment-fixer',
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

function runFixer(fixerId: FixerId, parts: DocxXmlParts, params: Record<string, unknown>) {
  switch (fixerId) {
    case 'margins-fixer':
      return marginsFixer(parts, params as never);
    case 'paper-size-fixer':
      return paperSizeFixer(parts, params as never);
    case 'font-fixer':
      return fontFixer(parts, params as never);
    case 'line-spacing-fixer': {
      const p = params as { multiplier: number; deep?: boolean };
      return lineSpacingFixer(parts, p.multiplier, p.deep === true);
    }
    case 'alignment-fixer': {
      const p = params as { val: 'left' | 'right' | 'center' | 'both'; deep?: boolean };
      return alignmentFixer(parts, p.val, p.deep === true);
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
      return p.target ? footerPageFixer(parts, p.target) : { parts, applied: false, beforeLabel: '', afterLabel: '' };
    }
    case 'empty-paragraph-fixer':
      return emptyParagraphFixer(parts);
    case 'footnote-spacing-fixer': {
      const p = params as { deep?: boolean };
      return footnoteSpacingFixer(parts, p.deep === true);
    }
    case 'page-number-alignment-fixer':
      return pageNumberAlignmentFixer(parts);
    default:
      return { parts, applied: false, beforeLabel: '', afterLabel: '' };
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

  for (const request of requests) {
    const result = runFixer(request.fixerId, parts, request.params);
    if (!result.applied) {
      // Fail-safe: fixer nije uspio primijeniti popravak (npr. atribut ne
      // postoji u ovom dokumentu), tiho preskoci, ne baca korisniku gresku.
      skipped.push(request.ruleId);
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
    return { docxBytes, changelog, skipped };
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

  return { docxBytes: newDocxBytes, changelog, skipped };
}

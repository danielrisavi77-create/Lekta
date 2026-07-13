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
  emptyParagraphFixer,
  type DocxXmlParts,
} from './fixers';

/** Poznati fixeri kao runtime konstanta: profile-validator provjerava clanstvo
 * fixerId-a iz podataka u ovom popisu (tipfeler u draftu = strukturna greska,
 * ne tihi no-op u runtimeu). Tip FixerId se izvodi iz istog popisa. */
export const FIXER_IDS = [
  'margins-fixer',
  'paper-size-fixer',
  'font-fixer',
  'line-spacing-fixer',
  'alignment-fixer',
  'empty-paragraph-fixer',
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
    case 'empty-paragraph-fixer':
      return emptyParagraphFixer(parts);
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

  if (!documentEntry) {
    throw new Error(`apply-fixers: nedostaje ${DOCUMENT_XML_PATH} u docx-u, nije valjan Word dokument`);
  }

  let parts: DocxXmlParts = {
    documentXml: decoder.decode(documentEntry.data),
    stylesXml: stylesEntry ? decoder.decode(stylesEntry.data) : '',
  };
  // Zapamti pocetne stringove: dio se re-enkodira SAMO ako ga je neki fixer
  // stvarno promijenio. TextDecoder je non-fatal (nevaljani UTF-8 -> U+FFFD),
  // pa bi bezuvjetni decode+encode tiho prepisao bajtove i netaknutog dijela.
  const originalDocumentXml = parts.documentXml;
  const originalStylesXml = parts.stylesXml;

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
    return entry; // netaknuto, isti podatak
  });

  const newDocxBytes = await writeZip(newEntries);

  return { docxBytes: newDocxBytes, changelog, skipped };
}

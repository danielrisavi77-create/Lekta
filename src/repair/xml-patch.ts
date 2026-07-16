// src/repair/xml-patch.ts
//
// NAMJERNA ODLUKA (odstupanje od REPAIR_ENGINE.md sekcije 4, u konzervativnijem
// smjeru): umjesto DOMParser + XMLSerializer round-trip, ovo koristi CILJANE
// regexe koji mijenjaju SAMO vrijednosti konkretnih atributa unutar konkretno
// imenovanog taga (sve pojave), ostavljajuci apsolutno svaki drugi bajt netaknut.
//
// Razlog: DOMParser/XMLSerializer round-trip moze suptilno promijeniti
// formatiranje (poredak atributa, whitespace, self-closing notaciju) na
// DIJELOVIMA dokumenta koje NISMO namjeravali dirati, sto je tocno onaj tihi
// rizik zbog kojeg GOLDEN.md postoji. Regex na tocno imenovanom atributu
// unutar tocno imenovanog taga je uze i sigurnije: ili se atribut nade i
// promijeni, ili se ne dira NISTA. Dodatna prednost: nema DOMParser
// ovisnosti, pa je testabilno u cistom Node bez happy-dom/jsdom polyfilla.

export interface PatchResult {
  xml: string;
  applied: boolean;
  before: Record<string, string>;
  after: Record<string, string>;
  /**
   * Po trazenom atributu: je li atribut uopce PRONADJEN u ciljanom tagu.
   * applied:false + found:true znaci "vec je na ciljanoj vrijednosti" (backstop
   * postoji); applied:false + found:false znaci "nema ga i nije umetnut"
   * (patch-only politika). Deep ciscenje (fixers.ts) smije brisati direct
   * override-e SAMO kad backstop postoji, inace bi dokument regresirao na
   * theme/naslijedjene vrijednosti umjesto na cilj.
   */
  found: Record<string, boolean>;
}

const NO_OP: PatchResult = { xml: '', applied: false, before: {}, after: {}, found: {} };

// Krpa imenovane atribute u SVIM pojavama ciljanog taga (analyzeDocx provjerava
// margine/format preko SVIH w:sectPr sekcija, pa i popravak mora pogoditi svaku;
// naslovnica s vlastitim sectPr je standard u tezama). Tag se prepoznaje po
// otvarajucem obliku, i self-closing (<w:pgMar .../>) i obicnom (<w:pgMar ...>),
// jer atributi u OOXML-u zive iskljucivo u otvarajucem tagu. before/after biljeze
// prvu promijenjenu vrijednost po atributu (za citljiv changelog).
function patchTagAttributes(
  xml: string,
  tagPattern: RegExp,
  attrUpdates: Record<string, string>,
): PatchResult {
  const globalPattern = new RegExp(tagPattern.source, 'g');
  const before: Record<string, string> = {};
  const after: Record<string, string> = {};
  const found: Record<string, boolean> = {};
  let changed = false;

  const newXml = xml.replace(globalPattern, (tag) => {
    let out = tag;
    for (const [attr, newValue] of Object.entries(attrUpdates)) {
      const attrRegex = new RegExp(`(${escapeRegex(attr)}=")([^"]*)(")`);
      const attrMatch = out.match(attrRegex);
      if (!attrMatch) continue; // atribut ne postoji na ovom tagu, ne izmisljaj ga
      found[attr] = true;
      const oldValue = attrMatch[2];
      const escapedValue = escapeXmlAttr(newValue);
      if (oldValue === escapedValue) continue;
      if (!(attr in before)) {
        before[attr] = oldValue;
        after[attr] = escapedValue;
      }
      // Replacer funkcija umjesto replacement stringa: vrijednost s '$' ($&, $1)
      // se ne smije interpretirati kao referenca na grupu.
      out = out.replace(attrRegex, (_m, p1: string, _old: string, p3: string) => p1 + escapedValue + p3);
      changed = true;
    }
    return out;
  });

  if (!changed) return { ...NO_OP, xml, found };
  return { xml: newXml, applied: true, before, after, found };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Vrijednost ide unutar dvostrukih navodnika XML atributa: escapaj &, < i ".
function escapeXmlAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

// === Margine i format stranice (documentXml, sectPr je uvijek u document.xml) ===

export function patchMargins(
  documentXml: string,
  marginsTwips: Partial<Record<'top' | 'right' | 'bottom' | 'left', number>>,
): PatchResult {
  const attrUpdates: Record<string, string> = {};
  if (marginsTwips.top !== undefined) attrUpdates['w:top'] = String(marginsTwips.top);
  if (marginsTwips.right !== undefined) attrUpdates['w:right'] = String(marginsTwips.right);
  if (marginsTwips.bottom !== undefined) attrUpdates['w:bottom'] = String(marginsTwips.bottom);
  if (marginsTwips.left !== undefined) attrUpdates['w:left'] = String(marginsTwips.left);
  return patchTagAttributes(documentXml, /<w:pgMar\b[^>]*\/?>/, attrUpdates);
}

export function patchPaperSize(documentXml: string, sizeTwips: { w: number; h: number }): PatchResult {
  return patchTagAttributes(documentXml, /<w:pgSz\b[^>]*\/?>/, {
    'w:w': String(sizeTwips.w),
    'w:h': String(sizeTwips.h),
  });
}

// === Zadani font, velicina, prored, poravnanje (stylesXml, v1 opseg: samo
// docDefaults / Normal stil, NE svaki pojedinacni run/odlomak koji odstupa,
// vidi REPAIR_ENGINE.md sekciju 2, "granica presjeka" ===

function findBlock(xml: string, pattern: RegExp): { block: string; start: number; end: number } | null {
  const match = xml.match(pattern);
  if (!match || match.index === undefined) return null;
  return { block: match[0], start: match.index, end: match.index + match[0].length };
}

export function patchDefaultFont(
  stylesXml: string,
  update: { fontName?: string; sizeHalfPoints?: number },
): PatchResult {
  const found = findBlock(stylesXml, /<w:docDefaults>[\s\S]*?<\/w:docDefaults>/);
  if (!found) return { ...NO_OP, xml: stylesXml };

  let block = found.block;
  const before: Record<string, string> = {};
  const after: Record<string, string> = {};
  const foundAttrs: Record<string, boolean> = {};
  let changed = false;

  if (update.fontName !== undefined) {
    const fontResult = patchTagAttributes(block, /<w:rFonts\b[^>]*\/?>/, {
      'w:ascii': update.fontName,
      'w:hAnsi': update.fontName,
    });
    // Backstop postoji tek kad docDefaults ima LITERALNI w:ascii I w:hAnsi
    // (theme-only rFonts se patch-only politikom ne dira). Deep strippa OBA
    // slota s runova, pa i backstop mora jamciti oba: inace bi High-ANSI slot
    // (hrvatski dijakritici c/z-kvacica, dj) pao na theme font.
    if (fontResult.found['w:ascii'] && fontResult.found['w:hAnsi']) foundAttrs.fontName = true;
    if (fontResult.applied) {
      block = fontResult.xml;
      before.fontName = fontResult.before['w:ascii'] ?? '';
      after.fontName = update.fontName;
      changed = true;
    }
  }

  if (update.sizeHalfPoints !== undefined) {
    const szResult = patchTagAttributes(block, /<w:sz\b[^>]*\/?>/, {
      'w:val': String(update.sizeHalfPoints),
    });
    if (szResult.found['w:val']) foundAttrs.sizeHalfPoints = true;
    if (szResult.applied) {
      block = szResult.xml;
      before.sizeHalfPoints = szResult.before['w:val'] ?? '';
      after.sizeHalfPoints = String(update.sizeHalfPoints);
      changed = true;
    }
  }

  if (!changed) return { ...NO_OP, xml: stylesXml, found: foundAttrs };

  const newXml = stylesXml.slice(0, found.start) + block + stylesXml.slice(found.end);
  return { xml: newXml, applied: true, before, after, found: foundAttrs };
}

function findStyleBlock(stylesXml: string, styleId: string) {
  const escapedId = escapeRegex(styleId);
  return findBlock(
    stylesXml,
    new RegExp(`<w:style\\b[^>]*w:styleId="${escapedId}"[^>]*>[\\s\\S]*?<\\/w:style>`),
  );
}

const findNormalStyleBlock = (stylesXml: string) => findStyleBlock(stylesXml, 'Normal');

export function patchDefaultSpacing(
  stylesXml: string,
  lineTwips: number,
  lineRule = 'auto',
): PatchResult {
  const found = findNormalStyleBlock(stylesXml);
  if (!found) return { ...NO_OP, xml: stylesXml };

  const result = patchTagAttributes(found.block, /<w:spacing\b[^>]*\/?>/, {
    'w:line': String(lineTwips),
    'w:lineRule': lineRule,
  });
  if (!result.applied) return { ...NO_OP, xml: stylesXml, found: result.found };

  const newXml = stylesXml.slice(0, found.start) + result.xml + stylesXml.slice(found.end);
  return { xml: newXml, applied: true, before: result.before, after: result.after, found: result.found };
}

export function patchDefaultParagraphSpacing(
  stylesXml: string,
  beforeTwentieths: number,
  afterTwentieths: number,
): PatchResult {
  const found = findNormalStyleBlock(stylesXml);
  if (!found) return { ...NO_OP, xml: stylesXml };

  const result = patchTagAttributes(found.block, /<w:spacing\b[^>]*\/?>/, {
    'w:before': String(beforeTwentieths),
    'w:after': String(afterTwentieths),
  });
  if (!result.applied) return { ...NO_OP, xml: stylesXml, found: result.found };

  const newXml = stylesXml.slice(0, found.start) + result.xml + stylesXml.slice(found.end);
  return { xml: newXml, applied: true, before: result.before, after: result.after, found: result.found };
}

// Word ugradjeni stil za tekst fusnota ima stabilan (locale-neovisan) styleId
// "FootnoteText" (za razliku od w:name koji je lokaliziran, npr. "Fusnota").
// Isti patch-only obrazac kao patchDefaultParagraphSpacing: ako dokument ne
// deklarira taj stil u styles.xml, findStyleBlock vraca null i funkcija je
// posten no-op (ne izmislja stil koji ne postoji).
export function patchFootnoteTextSpacing(
  stylesXml: string,
  beforeTwentieths: number,
  afterTwentieths: number,
): PatchResult {
  const found = findStyleBlock(stylesXml, 'FootnoteText');
  if (!found) return { ...NO_OP, xml: stylesXml };

  const result = patchTagAttributes(found.block, /<w:spacing\b[^>]*\/?>/, {
    'w:before': String(beforeTwentieths),
    'w:after': String(afterTwentieths),
  });
  if (!result.applied) return { ...NO_OP, xml: stylesXml, found: result.found };

  const newXml = stylesXml.slice(0, found.start) + result.xml + stylesXml.slice(found.end);
  return { xml: newXml, applied: true, before: result.before, after: result.after, found: result.found };
}

export function patchDefaultAlignment(stylesXml: string, val: string): PatchResult {
  const found = findNormalStyleBlock(stylesXml);
  if (!found) return { ...NO_OP, xml: stylesXml };

  const result = patchTagAttributes(found.block, /<w:jc\b[^>]*\/?>/, { 'w:val': val });
  if (!result.applied) return { ...NO_OP, xml: stylesXml, found: result.found };

  const newXml = stylesXml.slice(0, found.start) + result.xml + stylesXml.slice(found.end);
  return { xml: newXml, applied: true, before: result.before, after: result.after, found: result.found };
}

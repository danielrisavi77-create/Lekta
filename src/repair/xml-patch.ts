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
//
// POZNATO OGRANICENJE (svjesno prihvaceno, ne DOM parsiranje): tag-granica regexi (`[^>]*`) ne
// razlikuju doslovni `>` unutar navodnicima omedjene vrijednosti atributa od stvarnog kraja taga.
// XML shema NE zahtijeva escapeanje `>` u vrijednosti atributa (samo `<`, `&` i navodnik), pa je
// takva vrijednost VALJANA XML, ali je nas regex ne razlikuje od stvarnog `>`. Stvaran Word/
// LibreOffice izlaz OVO NIKAD ne proizvodi (dosljedno escapeaju `>` kao `&gt;` iako nije obavezno),
// pa je rizik realno ogranicen na rucno/adversarijalno sastavljen docx, ne na prave studentske
// radove. Puno rjesenje (kontekst navodnika kroz cijelu datoteku) je izvan opsega Faze 2.

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
  // Fiksna mapa atributa, ili funkcija koja je racuna PO TAGU (null = preskoci ovaj tag).
  // Per-tag varijanta postoji zbog sekcija: polozeni prilog treba ISTI format papira, ali sa
  // zamijenjenim stranicama, pa mu se ne smiju upisati uspravne dimenzije.
  attrUpdates: Record<string, string> | ((tag: string) => Record<string, string> | null),
): PatchResult {
  const globalPattern = new RegExp(tagPattern.source, 'g');
  const before: Record<string, string> = {};
  const after: Record<string, string> = {};
  const found: Record<string, boolean> = {};
  let changed = false;

  const newXml = xml.replace(globalPattern, (tag) => {
    const updates = typeof attrUpdates === 'function' ? attrUpdates(tag) : attrUpdates;
    if (!updates) return tag;
    let out = tag;
    for (const [attr, newValue] of Object.entries(updates)) {
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

// Tolerancija za prepoznavanje "ista stranica, druga orijentacija" (~0,7 cm u twipsima). Namjerno
// siroka: posljedica pogodka je da sekciju NE diramo, a to je uvijek sigurniji ishod.
const ORIENTATION_SWAP_TOLERANCE_TWIPS = 400;

/**
 * Smije li se OVA sekcija uspravljati? Ne smije, ako je namjerno POLOZENA.
 *
 * Analiza polozenu sekciju izricito TOLERIRA (`near(w,h) || near(h,w)` u analyze-docx), dakle to
 * uopce nije prekrsaj; kad bi je popravak uspravio, polozeni prilog sa sirokom tablicom raspao bi
 * se, i to uz zaostali `w:orient="landscape"`. Pravilo je jednosmjerno: polozenu sekciju nikad ne
 * uspravljamo, ali zahtjev profila da stranica BUDE polozena i dalje prolazi.
 *
 * Prepoznaje se na dva nacina, jer polozenu sekciju ne pisu svi generatori jednako:
 *   1. eksplicitan `w:orient="landscape"` (tako je pise Word i LibreOffice),
 *   2. dimenzije koje su zamjena ciljanih, dok je cilj uspravan (sirina manja od visine).
 */
function isIntentionalLandscape(tag: string, target: { w: number; h: number }): boolean {
  const targetIsPortrait = target.w < target.h;
  if (!targetIsPortrait) return false; // profil sam trazi polozenu stranicu: krpaj normalno
  if (/w:orient="landscape"/i.test(tag)) return true;
  const w = Number(tag.match(/w:w="(\d+)"/)?.[1]);
  const h = Number(tag.match(/w:h="(\d+)"/)?.[1]);
  if (!Number.isFinite(w) || !Number.isFinite(h)) return false;
  const tol = ORIENTATION_SWAP_TOLERANCE_TWIPS;
  return Math.abs(w - target.h) <= tol && Math.abs(h - target.w) <= tol;
}

export function patchPaperSize(documentXml: string, sizeTwips: { w: number; h: number }): PatchResult {
  // Polozena sekcija dobiva ISTI format papira, samo sa zamijenjenim stranicama. Time se rjesavaju
  // oba kvara odjednom: prilog ostaje polozen (uspravljanje bi razbilo siroku tablicu), ali mu se
  // format ispravlja (prije je ostajao npr. Letter jer smo takvu sekciju preskakali u cijelosti).
  return patchTagAttributes(documentXml, /<w:pgSz\b[^>]*\/?>/, (tag) =>
    isIntentionalLandscape(tag, sizeTwips)
      ? { 'w:w': String(sizeTwips.h), 'w:h': String(sizeTwips.w) }
      : { 'w:w': String(sizeTwips.w), 'w:h': String(sizeTwips.h) });
}

// === Zadani font, velicina, prored, poravnanje (stylesXml, v1 opseg: samo
// docDefaults / Normal stil, NE svaki pojedinacni run/odlomak koji odstupa,
// vidi REPAIR_ENGINE.md sekciju 2, "granica presjeka" ===

function findBlock(xml: string, pattern: RegExp): { block: string; start: number; end: number } | null {
  const match = xml.match(pattern);
  if (!match || match.index === undefined) return null;
  return { block: match[0], start: match.index, end: match.index + match[0].length };
}

// === POSTAVLJANJE vrijednosti koje u dokumentu NE POSTOJE ===
//
// ZASTO OVO UOPCE TREBA: Word vecinu oblikovanja ne zapisuje doslovno. Font sprema kao referencu
// na temu (w:asciiTheme="minorHAnsi"), poravnanje izostavlja kad je lijevo (zadano), a razmake
// odlomaka drzi u zadanim postavkama dokumenta umjesto u stilu. Politika "krpaj samo postojece"
// je zato na dokumentu koji je Word sam napravio odbijala popraviti font, prored, poravnanje i
// razmake, dakle bas ona pravila zbog kojih se popravak i kupuje. Mjereno Wordom
// (scripts/word-verify): od cetiri pravila primjenjivalo se nula do jedno.
//
// SIGURNOSNA GRANICA OSTAJE ISTA: pise se ISKLJUCIVO u docDefaults i u stil Normal (i FootnoteText
// za fusnote). Naslovi, tablice i ostali stilovi se ne diraju, kao ni pojedinacni odlomci.
//
// Redoslijed djece je u OOXML-u STROG (shema koristi xsd:sequence). Word dokument s elementima u
// krivom redoslijedu prijavljuje kao ostecen, pa se novi element mora umetnuti tocno na svoje
// mjesto, ne na kraj.
const CT_RPR_ORDER = [
  'w:rStyle', 'w:rFonts', 'w:b', 'w:bCs', 'w:i', 'w:iCs', 'w:caps', 'w:smallCaps', 'w:strike',
  'w:dstrike', 'w:outline', 'w:shadow', 'w:emboss', 'w:imprint', 'w:noProof', 'w:snapToGrid',
  'w:vanish', 'w:webHidden', 'w:color', 'w:spacing', 'w:w', 'w:kern', 'w:position', 'w:sz',
  'w:szCs', 'w:highlight', 'w:u', 'w:effect', 'w:bdr', 'w:shd', 'w:fitText', 'w:vertAlign',
  'w:rtl', 'w:cs', 'w:em', 'w:lang', 'w:eastAsianLayout', 'w:specVanish', 'w:oMath',
];

const CT_PPR_ORDER = [
  'w:pStyle', 'w:keepNext', 'w:keepLines', 'w:pageBreakBefore', 'w:framePr', 'w:widowControl',
  'w:numPr', 'w:suppressLineNumbers', 'w:pBdr', 'w:shd', 'w:tabs', 'w:suppressAutoHyphens',
  'w:kinsoku', 'w:wordWrap', 'w:overflowPunct', 'w:topLinePunct', 'w:autoSpaceDE', 'w:autoSpaceDN',
  'w:bidi', 'w:adjustRightInd', 'w:snapToGrid', 'w:spacing', 'w:ind', 'w:contextualSpacing',
  'w:mirrorIndents', 'w:suppressOverlap', 'w:jc', 'w:textDirection', 'w:textAlignment',
  'w:textboxTightWrap', 'w:outlineLvl', 'w:divId', 'w:cnfStyle', 'w:rPr', 'w:sectPr', 'w:pPrChange',
];

const CT_STYLE_ORDER = [
  'w:name', 'w:aliases', 'w:basedOn', 'w:next', 'w:link', 'w:autoRedefine', 'w:hidden',
  'w:uiPriority', 'w:semiHidden', 'w:unhideWhenUsed', 'w:qFormat', 'w:locked', 'w:personal',
  'w:personalCompose', 'w:personalReply', 'w:rsid', 'w:pPr', 'w:rPr', 'w:tblPr', 'w:trPr',
  'w:tcPr', 'w:tblStylePr',
];

/**
 * Zamijeni SADRZAJ svih <tag>...</tag> blokova NUL znakovima jednake duljine.
 * Duljina ostaje ista pa indeksi nadjeni na maskiranom nizu vrijede i za izvorni. Sluzi da se
 * pretraga izravne djece ne zavara istoimenim elementom iz ugnjezdenog bloka: `w:spacing` postoji
 * i u CT_PPr (prored) i u CT_RPr (razmak medju znakovima), pa bi bez maskiranja `w:rPr` unutar
 * `w:pPr` prored zavrsio na krivom elementu.
 * RE-24 (P-B): samozatvarajuci oblik (`<tag/>`) mora se prepoznati KAO CJELINA, inace bi ostao
 * nemaskiran, a `[\s\S]*?</tag>` pretraga (koja OVAJ regex koristi za upareni oblik) bi mimo njega
 * "progutala" kroz zatvarajuci tag SLJEDECEG (drukcijeg) elementa istog imena.
 */
function maskElement(xml: string, tag: string): string {
  const escaped = escapeRegex(tag);
  const re = new RegExp(`<${escaped}\\b[^>]*/>|<${escaped}\\b[^>]*>[\\s\\S]*?</${escaped}>`, 'g');
  return xml.replace(re, (m) => '\0'.repeat(m.length));
}

function maskAll(xml: string, tags: string[]): string {
  let out = xml;
  for (const t of tags) out = maskElement(out, t);
  return out;
}

/** Nadji izravno dijete `name`, preskacuci ugnjezdene blokove navedene u `maskTags`. */
function findDirectChild(
  inner: string, name: string, maskTags: string[],
): { start: number; end: number; tag: string } | null {
  const probe = maskAll(inner, maskTags);
  const n = escapeRegex(name);
  const m = probe.match(new RegExp(`<${n}\\b[^>]*/>|<${n}\\b[^>]*>[\\s\\S]*?</${n}>`));
  if (!m || m.index === undefined) return null;
  return { start: m.index, end: m.index + m[0].length, tag: inner.slice(m.index, m.index + m[0].length) };
}

/** Mjesto na koje `name` smije doci prema shemi: odmah iza zadnjeg elementa koji mu prethodi. */
function schemaInsertIndex(inner: string, name: string, order: string[], maskTags: string[]): number {
  const idx = order.indexOf(name);
  if (idx < 0) return inner.length;
  const probe = maskAll(inner, maskTags);
  let at = 0;
  for (let i = 0; i < idx; i++) {
    const n = escapeRegex(order[i]);
    const re = new RegExp(`<${n}\\b[^>]*/>|<${n}\\b[^>]*>[\\s\\S]*?</${n}>`, 'g');
    let m: RegExpExecArray | null;
    let last: RegExpExecArray | null = null;
    while ((m = re.exec(probe)) !== null) last = m;
    if (last) at = Math.max(at, last.index + last[0].length);
  }
  return at;
}

function buildSelfClosingTag(name: string, attrs: Record<string, string>): string {
  const a = Object.entries(attrs).map(([k, v]) => ` ${k}="${escapeXmlAttr(v)}"`).join('');
  return `<${name}${a}/>`;
}

/** Ukloni imenovane atribute s jednog taga (koristi se da referenca na temu ne nadjaca doslovni font). */
function removeAttributes(tag: string, names: string[]): string {
  let out = tag;
  for (const n of names) out = out.replace(new RegExp(`\\s${escapeRegex(n)}="[^"]*"`, 'g'), '');
  return out;
}

interface UpsertResult {
  inner: string;
  changed: boolean;
  before: Record<string, string>;
  after: Record<string, string>;
}

/**
 * Postavi atribute na izravno dijete `name`: postojece vrijednosti se mijenjaju, atributi koji
 * nedostaju se DODAJU, a ako elementa uopce nema, stvara se na shemom propisanom mjestu.
 * `dropAttrs` se uklanjaju s postojeceg elementa (referenca na temu ima prednost pred doslovnim
 * imenom fonta, pa bi bez uklanjanja upis bio tihi promasaj).
 */
function upsertChild(
  inner: string,
  name: string,
  attrs: Record<string, string>,
  order: string[],
  maskTags: string[],
  dropAttrs: string[] = [],
): UpsertResult {
  const before: Record<string, string> = {};
  const after: Record<string, string> = {};
  // RE-07 dodatak (Codex adversarijalni nalaz, ista klasa kao RE-10 u heading-case.ts): trazeni
  // element se NIKAD ne smije naci UNUTAR <w:pPrChange> (stari snimak iz track changes revizija,
  // Word ga nikad ne renderira). Bez ovog maskiranja, kad ZIVI element ne postoji, pretraga
  // pogresno pronadje HISTORIJSKI element unutar pPrChangea i izmijeni NJEGA: fixer prijavi uspjeh
  // (before/after popunjeni), a stvarno, vidljivo oblikovanje ostane NEPROMIJENJENO.
  const searchMaskTags = [...maskTags, 'w:pPrChange'];
  const existing = findDirectChild(inner, name, searchMaskTags);

  if (!existing) {
    const at = schemaInsertIndex(inner, name, order, searchMaskTags);
    for (const [k, v] of Object.entries(attrs)) { before[k] = ''; after[k] = v; }
    return {
      inner: inner.slice(0, at) + buildSelfClosingTag(name, attrs) + inner.slice(at),
      changed: true, before, after,
    };
  }

  let tag = existing.tag;
  let changed = false;
  const dropped = removeAttributes(tag, dropAttrs);
  if (dropped !== tag) { tag = dropped; changed = true; }

  for (const [k, v] of Object.entries(attrs)) {
    const escaped = escapeXmlAttr(v);
    const attrRe = new RegExp(`(${escapeRegex(k)}=")([^"]*)(")`);
    const m = tag.match(attrRe);
    if (m) {
      if (m[2] === escaped) continue;
      before[k] = m[2]; after[k] = escaped;
      tag = tag.replace(attrRe, (_x, p1: string, _old: string, p3: string) => p1 + escaped + p3);
      changed = true;
    } else {
      // Atribut ne postoji: DODAJ ga (prije je ovdje bio tihi preskok, zbog cega se dokument koji
      // vrijednost ne zapisuje nije dao popraviti). RE-02 (P0 korupcija): umetni ISKLJUCIVO u
      // OTVARAJUCI tag. Za samozatvarajuci oblik `tag` JEST cijeli otvarajuci tag (ponasanje
      // nepromijenjeno); za upareni PRAZAN oblik (`<name></name>`, npr. dio LibreOffice/starijeg
      // Worda) `tag` sadrzi CIJELI element ukljucujuci zatvarajuci, pa bi umetanje na kraj niza
      // pogodilo ZATVARAJUCI tag (`</name attr="...">`) i proizvelo XML koji parseri odbijaju.
      before[k] = ''; after[k] = escaped;
      const openTagRe = new RegExp(`^<${escapeRegex(name)}\\b[^>]*?/?>`);
      tag = tag.replace(openTagRe, (openTag) =>
        openTag.replace(/\s*\/?>$/, (end) => ` ${k}="${escaped}"${end.trimStart()}`));
      changed = true;
    }
  }

  if (!changed) return { inner, changed: false, before, after };
  return { inner: inner.slice(0, existing.start) + tag + inner.slice(existing.end), changed: true, before, after };
}

/** Dohvati sadrzaj kontejnera (npr. w:pPr) unutar bloka; stvori ga na shemom propisanom mjestu ako ga nema. */
function withContainer(
  block: string,
  name: string,
  order: string[],
  maskTags: string[],
  transform: (inner: string) => UpsertResult,
): UpsertResult {
  const n = escapeRegex(name);
  // Pretraga ide po MASKIRANOM nizu: stil ima w:rPr i na svojoj razini i unutar w:pPr (svojstva
  // znaka oznake odlomka), pa bi neoprezno trazenje pogodilo pogresan, ugnjezdeni element.
  // Maskiranje cuva duljine, pa indeksi nadjeni ovdje vrijede i nad izvornim blokom.
  // RE-07 dodatak (Codex adversarijalni nalaz): w:pPrChange/w:rPrChange (track changes stari
  // snimak) UVIJEK nose UGNIJEZDJENI element ISTOG imena (w:pPr unutar pPrChange, w:rPr unutar
  // rPrChange), sto ovaj regex (bez brojanja dubine) ne razlikuje od stvarne zatvarajuce oznake
  // trazenog kontejnera. Bez maskiranja, non-greedy trazilica na odlomku BEZ zivog w:pPr/w:rPr ali
  // s pPrChange/rPrChange stane na UNUTARNJOJ zatvarajucoj oznaci, odrezuci "inner" prerano i to
  // bas prije stvarne pPrChange/rPrChange zatvarajuce oznake; naknadno maskiranje u upsertChild
  // tada vise ne moze djelovati jer odrezani "inner" vise nema svoju zatvarajucu oznaku. Uvijek se
  // maskira, neovisno o maskTags koje pozivatelj salje (nikad legitiman cilj pretrage).
  const probe = maskAll(block, [...maskTags.filter((t) => t !== name), 'w:pPrChange', 'w:rPrChange']);
  const m = probe.match(new RegExp(`<${n}\\b[^>]*>[\\s\\S]*?</${n}>`));
  if (m && m.index !== undefined) {
    const openTag = m[0].match(new RegExp(`^<${n}\\b[^>]*>`))![0];
    const innerStart = m.index + openTag.length;
    const innerEnd = m.index + m[0].length - (name.length + 3); // </name>
    const res = transform(block.slice(innerStart, innerEnd));
    if (!res.changed) return { ...res, inner: block };
    return { ...res, inner: block.slice(0, innerStart) + res.inner + block.slice(innerEnd) };
  }
  // Samozatvarajuci oblik (<w:pPr/>) ili element uopce ne postoji: gradi ga iz praznog sadrzaja.
  const res = transform('');
  if (!res.changed) return { ...res, inner: block };
  const created = `<${name}>${res.inner}</${name}>`;
  // Pretraga i ovdje ide po MASKIRANOM `probe`, ne po sirovom `block` (isti razlog kao pretraga
  // uparenog oblika iznad): bez toga bi ugnjezdeni samozatvarajuci istoimeni element (npr. rPr
  // paragraph-marka unutar pPr) bio pogresno pogodjen umjesto PRAVOG, stil-razine elementa koji se
  // trazi. Maskiranje cuva duljine, pa indeks nadjen na probeu vrijedi i za rezanje izvornog blocka.
  const selfClosing = probe.match(new RegExp(`<${n}\\b[^>]*/>`));
  if (selfClosing && selfClosing.index !== undefined) {
    return { ...res, inner: block.slice(0, selfClosing.index) + created + block.slice(selfClosing.index + selfClosing[0].length) };
  }
  // Umetanje unutar RODITELJA: pronadji njegov sadrzaj (blok je npr. cijeli <w:style ...>...</w:style>).
  const open = block.match(/^<[^>]*>/);
  const close = block.match(/<\/[^>]+>$/);
  // RE-23: RODITELJ sam po sebi je samozatvarajuci (npr. cijeli <w:rPrDefault/> ili prazan
  // <w:style .../>): `open` uhvati CIJELI tag (zavrsava na "/>"), a `close` ne postoji jer nema
  // zasebnog zatvarajuceg taga. Prije se ovdje tiho vracao NEPROMIJENJEN blok uz naslijedjeni
  // changed:true (lazni "uspjeh": fixer prijavi izmjenu, a styles.xml ostane bajt-identican).
  // Ispravno je pretvoriti roditelja u upareni oblik i umetnuti novi sadrzaj UNUTAR njega.
  if (open && !close && open[0].endsWith('/>')) {
    const tagName = open[0].match(/^<([^\s/>]+)/)?.[1];
    if (tagName) {
      const openTag = open[0].slice(0, -2) + '>';
      return { ...res, inner: openTag + created + `</${tagName}>` };
    }
  }
  if (!open || !close) return { ...res, inner: block };
  const innerStart = open[0].length;
  const innerEnd = block.length - close[0].length;
  const parentInner = block.slice(innerStart, innerEnd);
  const at = schemaInsertIndex(parentInner, name, order, maskTags);
  return {
    ...res,
    inner: block.slice(0, innerStart) + parentInner.slice(0, at) + created + parentInner.slice(at) + block.slice(innerEnd),
  };
}

/**
 * Zadani font i velicina osnovnog teksta.
 *
 * Pise na DVA mjesta, jer oba mogu odlucivati o izgledu tijela rada:
 *  1. `docDefaults` (temelj cijelog dokumenta),
 *  2. stil `Normal`, ali SAMO ako on sam definira font ili velicinu; tada nadjacava docDefaults pa
 *     bi ispravak samo temelja bio bez ucinka.
 *
 * Referenca na temu (`w:asciiTheme`) po shemi IMA PREDNOST pred doslovnim imenom, pa se pri upisu
 * doslovnog imena mora ukloniti, inace bi promjena bila tihi promasaj (dokument bi ostao Calibri).
 */
export function patchDefaultFont(
  stylesXml: string,
  update: { fontName?: string; sizeHalfPoints?: number },
): PatchResult {
  const before: Record<string, string> = {};
  const after: Record<string, string> = {};
  const foundAttrs: Record<string, boolean> = {};
  let xml = stylesXml;
  let changed = false;

  // Zajednicki transform za "font+velicina unutar w:rPr" (koraci 1 i 3 dijele isti obrazac).
  const rPrTransform = (inner: string): UpsertResult => {
    let cur = inner; const b: Record<string, string> = {}; const a: Record<string, string> = {}; let ch = false;
    if (update.fontName !== undefined) {
      const r = upsertChild(cur, 'w:rFonts', { 'w:ascii': update.fontName, 'w:hAnsi': update.fontName },
        CT_RPR_ORDER, [], ['w:asciiTheme', 'w:hAnsiTheme']);
      if (r.changed) { cur = r.inner; Object.assign(b, r.before); Object.assign(a, r.after); ch = true; }
      foundAttrs.fontName = true;
    }
    if (update.sizeHalfPoints !== undefined) {
      const r = upsertChild(cur, 'w:sz', { 'w:val': String(update.sizeHalfPoints) }, CT_RPR_ORDER, []);
      if (r.changed) { cur = r.inner; Object.assign(b, r.before); Object.assign(a, r.after); ch = true; }
      foundAttrs.sizeHalfPoints = true;
    }
    return { inner: cur, changed: ch, before: b, after: a };
  };

  // 1. docDefaults -> w:rPrDefault -> w:rPr
  const dd = findBlock(xml, /<w:docDefaults>[\s\S]*?<\/w:docDefaults>/);
  if (dd) {
    const rPrDefault = dd.block.match(/<w:rPrDefault\b[^>]*>[\s\S]*?<\/w:rPrDefault>|<w:rPrDefault\b[^>]*\/>/);
    if (rPrDefault && rPrDefault.index !== undefined) {
      const absStart = dd.start + rPrDefault.index;
      const res = withContainer(rPrDefault[0], 'w:rPr', ['w:rPr'], [], rPrTransform);
      if (res.changed) {
        if (update.fontName !== undefined && before.fontName === undefined) {
          before.fontName = res.before['w:ascii'] ?? '';
          after.fontName = update.fontName;
        }
        if (update.sizeHalfPoints !== undefined && before.sizeHalfPoints === undefined) {
          before.sizeHalfPoints = res.before['w:val'] ?? '';
          after.sizeHalfPoints = String(update.sizeHalfPoints);
        }
        xml = xml.slice(0, absStart) + res.inner + xml.slice(absStart + rPrDefault[0].length);
        changed = true;
      }
    }
  }

  // 2. Naslovi: Wordovi ugradjeni stilovi HeadingN nose VLASTITU referencu na temu
  //    (w:asciiTheme="majorHAnsi", u praksi Cambria), koja pobjeduje nasljedjivanje iz docDefaults.
  //    Zbog nje font dokumenta nikad ne stigne do naslova, pa rad ispada dvofontan.
  //    Uklanja se SAMO referenca na temu; naslov kojem je autor izricito zadao font (npr. Georgia)
  //    ostaje netaknut, jer to nije prepreka nego namjera.
  if (update.fontName !== undefined) {
    // RE-24 (P-B): samozatvarajuca alternativa PRIJE uparene. Bez nje, prazan (samozatvarajuci)
    // Heading stil "guta" kroz zatvarajuci tag SLJEDECEG stila (cak i ne-heading, npr.
    // FootnoteText), pa se referenca na temu skida iz TOG (pogresnog) stila.
    const headingRe = /<w:style\b[^>]*w:styleId="Heading[1-9]"[^>]*\/>|<w:style\b[^>]*w:styleId="Heading[1-9]"[\s\S]*?<\/w:style>/g;
    let hm: RegExpExecArray | null;
    const rebuilt: Array<{ start: number; end: number; block: string }> = [];
    while ((hm = headingRe.exec(xml)) !== null) {
      const rFonts = hm[0].match(/<w:rFonts\b[^>]*\/?>/);
      if (!rFonts) continue;
      if (/w:ascii="/.test(rFonts[0])) continue; // izricit font: ne diramo
      const cleaned = removeAttributes(rFonts[0], ['w:asciiTheme', 'w:hAnsiTheme']);
      if (cleaned === rFonts[0]) continue;
      rebuilt.push({ start: hm.index, end: hm.index + hm[0].length, block: hm[0].replace(rFonts[0], () => cleaned) });
    }
    for (let i = rebuilt.length - 1; i >= 0; i--) {
      xml = xml.slice(0, rebuilt[i].start) + rebuilt[i].block + xml.slice(rebuilt[i].end);
      changed = true;
    }
  }

  // 3. default paragraf stil (RE-03: dinamicki razrijesen, ne doslovni "Normal"), ali samo ako sam
  // definira rPr (inace vrijedi docDefaults i nema sto ispravljati).
  // RE-22: koristi withContainer (isti obrazac kao korak 1 i patchHeadingFormat/patchFootnoteTypography)
  // umjesto rucnog upserta nad cijelim <w:rPr>...</w:rPr> nizom: prijasnji kod je taj niz tretirao
  // KAO SVOJ SADRZAJ (bez izdvajanja unutrasnjosti), pa je nedostajuci w:rFonts zavrsavao IZVAN rPr-a,
  // kao izravno (schema-nevaljano) dijete <w:style>, umjesto UNUTAR postojeceg rPr-a.
  const normal = findStyleByIdOrName(xml, resolveDefaultParagraphStyleId(xml), DEFAULT_PARAGRAPH_NAME_RE);
  if (normal) {
    // "Sam definira rPr" = ima STIL-RAZINE rPr (ne racuna se rPr paragraph-marka ugnjezden u pPr).
    const hasOwnRPr = /<w:rPr\b/.test(maskElement(normal.block, 'w:pPr'));
    if (hasOwnRPr) {
      const res = withContainer(normal.block, 'w:rPr', CT_STYLE_ORDER, ['w:pPr', 'w:rPr'], rPrTransform);
      if (res.changed) {
        if (update.fontName !== undefined && before.fontName === undefined) {
          before.fontName = res.before['w:ascii'] ?? '';
          after.fontName = update.fontName;
        }
        if (update.sizeHalfPoints !== undefined && before.sizeHalfPoints === undefined) {
          before.sizeHalfPoints = res.before['w:val'] ?? '';
          after.sizeHalfPoints = String(update.sizeHalfPoints);
        }
        xml = xml.slice(0, normal.start) + res.inner + xml.slice(normal.end);
        changed = true;
      }
    }
  }

  if (!changed) return { ...NO_OP, xml: stylesXml, found: foundAttrs };
  return { xml, applied: true, before, after, found: foundAttrs };
}

/**
 * Postavi atribute unutar w:pPr stila (stvarajuci pPr i sam element ako ne postoje). `namePattern`
 * je opcionalna rezerva na lokalizirano ime (findStyleByIdOrName) kad `styleId` doslovno ne postoji;
 * bez njega ponasanje ostaje EXACT-id-only (findStyleBlock), kao prije.
 */
function patchNormalParagraphProps(
  stylesXml: string,
  styleId: string,
  element: string,
  attrs: Record<string, string>,
  namePattern?: RegExp,
): PatchResult {
  const found = namePattern ? findStyleByIdOrName(stylesXml, styleId, namePattern) : findStyleBlock(stylesXml, styleId);
  if (!found) return { ...NO_OP, xml: stylesXml };

  // maskTags: w:rPr unutar w:pPr ima svoj w:spacing (razmak medju znakovima), koji se NE smije
  // zamijeniti s proredom odlomka.
  const res = withContainer(found.block, 'w:pPr', CT_STYLE_ORDER, ['w:pPr', 'w:rPr'],
    (inner) => upsertChild(inner, element, attrs, CT_PPR_ORDER, ['w:rPr']));

  const foundAttrs: Record<string, boolean> = {};
  for (const k of Object.keys(attrs)) foundAttrs[k] = true;
  if (!res.changed) return { ...NO_OP, xml: stylesXml, found: foundAttrs };

  const newXml = stylesXml.slice(0, found.start) + res.inner + stylesXml.slice(found.end);
  return { xml: newXml, applied: true, before: res.before, after: res.after, found: foundAttrs };
}

// RE-24 (P-B): samozatvarajuci alternativa MORA doci PRIJE uparene u regexu ispod. Bez nje, kad je
// CILJANI stil samozatvarajuci (`<w:style .../>`, npr. prazan LibreOffice placeholder), lazni
// `[\s\S]*?<\/w:style>` nastavak "guta" kroz zatvarajuci tag SLJEDECEG (drukcijeg) stila, pa patch
// zavrsi u pogresnom, susjednom stilu umjesto no-op/kreiranja na ciljanome (H-1 klasa korupcije).
function findStyleBlock(stylesXml: string, styleId: string) {
  const escapedId = escapeRegex(styleId);
  return findBlock(
    stylesXml,
    new RegExp(
      `<w:style\\b[^>]*w:styleId="${escapedId}"[^>]*/>` +
        `|<w:style\\b[^>]*w:styleId="${escapedId}"[^>]*>[\\s\\S]*?<\\/w:style>`,
    ),
  );
}

/**
 * Razrijesi styleId stila koji je DEFAULT paragraf stil dokumenta: prvo stil tipa paragraph s
 * w:default="1" (ISTI kriterij kao styleData.defaultParagraphStyleId u src/docx/parser.ts, da se
 * popravak i analiza slazu), inace "Normal" (Wordov fallback i kad atribut nije eksplicitno
 * zapisan). Skenira SAMO otvarajuce tagove (samozatvarajuci ili ne), pa nema rizika "gutanja"
 * susjednog stila (RE-24 klasa buga) jer se nikad ne trazi zatvarajuci tag.
 *
 * RE-03 (kljucni primitiv, P-A): fixeri su dosad tvrdo ciljali doslovni styleId "Normal", pa su na
 * LibreOffice/Google Docs izlazu (default stil "Standard", oznacen w:default="1") tiho no-opali
 * prored, poravnanje i razmak, iako je analiza ISTI dokument dinamicki citala ispravno.
 */
export function resolveDefaultParagraphStyleId(stylesXml: string): string {
  const re = /<w:style\b[^>]*>/g;
  let m: RegExpExecArray | null;
  // POSLJEDNJI pogodak pobjedjuje (ne prvi): shema dopusta samo JEDAN w:default="1" po tipu, ali
  // ako je dokument malformiran i ima vise, ISTI kriterij kao parseStyles (src/docx/parser.ts, koji
  // u petlji bez prekida stalno reasignira) drzi popravak i analizu usuglasenima.
  let resolved: string | null = null;
  while ((m = re.exec(stylesXml)) !== null) {
    const tag = m[0];
    if (!/w:type="paragraph"/.test(tag)) continue;
    if (!/w:default="1"/.test(tag)) continue;
    const idMatch = tag.match(/w:styleId="([^"]*)"/);
    if (idMatch) resolved = idMatch[1];
  }
  return resolved ?? 'Normal';
}

// Lokalizirana imena defaultnog paragraf stila: "Normal" (Word) i "Standard" (LibreOffice/OpenOffice
// AND njemacki Word). Koristi se SAMO kao rezerva kad resolveDefaultParagraphStyleId-ov rezultat ne
// postoji doslovno pod tim styleId-em (findStyleByIdOrName prvo uvijek proba TOCAN id).
const DEFAULT_PARAGRAPH_NAME_RE = /^\s*(?:normal|standard)\s*$/i;

export function patchDefaultSpacing(
  stylesXml: string,
  lineTwips: number,
  lineRule = 'auto',
): PatchResult {
  return patchNormalParagraphProps(stylesXml, resolveDefaultParagraphStyleId(stylesXml), 'w:spacing', {
    'w:line': String(lineTwips),
    'w:lineRule': lineRule,
  }, DEFAULT_PARAGRAPH_NAME_RE);
}

export function patchDefaultParagraphSpacing(
  stylesXml: string,
  beforeTwentieths: number,
  afterTwentieths: number,
): PatchResult {
  return patchNormalParagraphProps(stylesXml, resolveDefaultParagraphStyleId(stylesXml), 'w:spacing', {
    'w:before': String(beforeTwentieths),
    'w:after': String(afterTwentieths),
  }, DEFAULT_PARAGRAPH_NAME_RE);
}

export interface ParagraphStyleFormattingRule {
  styleId: string;
  beforeTwentieths?: number;
  afterTwentieths?: number;
  firstLineTwips?: number;
  hangingTwips?: number;
  keepLines?: boolean;
  keepNext?: boolean;
  widowControl?: boolean;
}

export interface ParagraphFormattingTarget {
  paragraphIndex: number;
  firstLineTwips?: number;
  hangingTwips?: number;
  keepLines?: boolean;
  keepNext?: boolean;
  widowControl?: boolean;
  removeFakeIndent?: boolean;
  clearDirectIndent?: boolean;
}

function upsertParagraphFlag(inner: string, name: string, enabled: boolean): UpsertResult {
  const existing = findDirectChild(inner, name, ['w:rPr']);
  if (enabled) {
    if (!existing) {
      const at = schemaInsertIndex(inner, name, CT_PPR_ORDER, ['w:rPr']);
      return { inner: inner.slice(0, at) + `<${name}/>` + inner.slice(at), changed: true, before: { [name]: '' }, after: { [name]: 'ukljuceno' } };
    }
    if (!/w:val="(?:0|false|off)"/.test(existing.tag)) return { inner, changed: false, before: {}, after: {} };
    const tag = removeAttributes(existing.tag, ['w:val']);
    return { inner: inner.slice(0, existing.start) + tag + inner.slice(existing.end), changed: true, before: { [name]: 'iskljuceno' }, after: { [name]: 'ukljuceno' } };
  }
  if (!existing) return { inner, changed: false, before: {}, after: {} };
  return { inner: inner.slice(0, existing.start) + '', changed: true, before: { [name]: 'ukljuceno' }, after: { [name]: 'iskljuceno' } };
}

function upsertParagraphIndent(
  inner: string,
  firstLineTwips?: number,
  hangingTwips?: number,
): UpsertResult {
  if (firstLineTwips === undefined && hangingTwips === undefined) return { inner, changed: false, before: {}, after: {} };
  const existing = findDirectChild(inner, 'w:ind', ['w:rPr']);
  const attrs: Record<string, string> = {};
  if (firstLineTwips !== undefined) attrs['w:firstLine'] = String(Math.trunc(firstLineTwips));
  if (hangingTwips !== undefined) attrs['w:hanging'] = String(Math.trunc(hangingTwips));
  let tag = existing?.tag ?? '';
  if (!existing) {
    const at = schemaInsertIndex(inner, 'w:ind', CT_PPR_ORDER, ['w:rPr']);
    return { inner: inner.slice(0, at) + buildSelfClosingTag('w:ind', attrs) + inner.slice(at), changed: true, before: {}, after: attrs };
  }
  // Prvi redak i viseća uvlaka su međusobno isključive. Ciljano uklanjamo samo suprotni atribut.
  const drop = firstLineTwips !== undefined ? ['w:hanging'] : ['w:firstLine'];
  const dropped = removeAttributes(tag, drop);
  if (dropped !== tag) tag = dropped;
  let changed = dropped !== existing.tag;
  const before: Record<string, string> = {};
  const after: Record<string, string> = {};
  for (const [key, value] of Object.entries(attrs)) {
    const re = new RegExp(`(${escapeRegex(key)}=")([^"]*)(")`);
    const match = tag.match(re);
    if (match) {
      if (match[2] === value) continue;
      before[key] = match[2];
      after[key] = value;
      tag = tag.replace(re, (_m, p1: string, _old: string, p3: string) => p1 + value + p3);
      changed = true;
    } else {
      after[key] = value;
      tag = tag.replace(/^<w:ind\b[^>]*>/, (openTag) => openTag.replace(/\s*\/?>$/, (end) => ` ${key}="${value}"${end.trimStart()}`));
      changed = true;
    }
  }
  return changed
    ? { inner: inner.slice(0, existing.start) + tag + inner.slice(existing.end), changed: true, before, after }
    : { inner, changed: false, before: {}, after: {} };
}

function paragraphRulePatch(block: string, rule: Omit<ParagraphStyleFormattingRule, 'styleId'> | ParagraphFormattingTarget): UpsertResult {
  return withContainer(block, 'w:pPr', CT_STYLE_ORDER, ['w:pPr', 'w:rPr'], (inner) => {
    const indent = upsertParagraphIndent(inner, rule.firstLineTwips, rule.hangingTwips);
    let result = indent;
    if ('beforeTwentieths' in rule || 'afterTwentieths' in rule) {
      const spacing = upsertChild(result.inner, 'w:spacing', {
        ...('beforeTwentieths' in rule && rule.beforeTwentieths !== undefined ? { 'w:before': String(Math.trunc(rule.beforeTwentieths)) } : {}),
        ...('afterTwentieths' in rule && rule.afterTwentieths !== undefined ? { 'w:after': String(Math.trunc(rule.afterTwentieths)) } : {}),
      }, CT_PPR_ORDER, ['w:rPr']);
      result = { inner: spacing.inner, changed: result.changed || spacing.changed, before: { ...result.before, ...spacing.before }, after: { ...result.after, ...spacing.after } };
    }
    for (const [name, enabled] of [['w:keepLines', rule.keepLines], ['w:keepNext', rule.keepNext], ['w:widowControl', rule.widowControl] ] as const) {
      if (enabled === undefined) continue;
      const next = upsertParagraphFlag(result.inner, name, enabled);
      result = { inner: next.inner, changed: result.changed || next.changed, before: { ...result.before, ...next.before }, after: { ...result.after, ...next.after } };
    }
    return result;
  });
}

export function patchParagraphStyles(
  stylesXml: string,
  rules: ParagraphStyleFormattingRule[],
): PatchResult {
  let xml = stylesXml;
  let applied = false;
  const before: Record<string, string> = {};
  const after: Record<string, string> = {};
  const found: Record<string, boolean> = {};
  for (const rule of rules) {
    if (!rule.styleId) continue;
    const namePattern = rule.styleId === 'Normal'
      ? DEFAULT_PARAGRAPH_NAME_RE
      : new RegExp(`^\\s*${escapeRegex(rule.styleId)}\\s*$`, 'i');
    const foundStyle = findStyleByIdOrName(xml, rule.styleId, namePattern);
    if (!foundStyle) continue;
    found[rule.styleId] = true;
    const result = paragraphRulePatch(foundStyle.block, rule);
    if (!result.changed) continue;
    xml = xml.slice(0, foundStyle.start) + result.inner + xml.slice(foundStyle.end);
    applied = true;
    Object.assign(before, result.before);
    Object.assign(after, result.after);
  }
  return applied ? { xml, applied: true, before, after, found } : { ...NO_OP, xml: stylesXml, found };
}

function decodeLeadingXmlWhitespace(raw: string): string {
  return raw.replace(/&#x20;|&#32;|&nbsp;/gi, ' ');
}

function stripLeadingFakeIndent(paragraphXml: string): { xml: string; applied: boolean } {
  if (/<w:numPr\b|<w:ins\b|<w:del\b|<w:moveFrom\b|<w:moveTo\b/.test(paragraphXml)) return { xml: paragraphXml, applied: false };
  const visible = [...paragraphXml.matchAll(/<w:tab\b[^>]*\/?>|<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)]
    .map((m) => m[0].startsWith('<w:tab') ? '\t' : decodeLeadingXmlWhitespace(m[1] ?? '')).join('');
  const prefix = visible.match(/^[ \t]+/);
  if (!prefix) return { xml: paragraphXml, applied: false };
  let remaining = prefix[0].length;
  let applied = false;
  const xml = paragraphXml.replace(/<w:tab\b[^>]*\/?>|<w:t\b([^>]*)>([\s\S]*?)<\/w:t>/g, (node, attrs: string, raw: string) => {
    if (remaining <= 0) return node;
    if (node.startsWith('<w:tab')) { remaining--; applied = true; return ''; }
    const leading = raw.match(/^(?:[ \t]|&#x20;|&#32;|&nbsp;)+/i)?.[0] ?? '';
    if (!leading) return node;
    const remove = Math.min(remaining, decodeLeadingXmlWhitespace(leading).length);
    remaining -= remove;
    applied = remove > 0 || applied;
    return `<w:t${attrs}>${leading.slice(leading.length - Math.max(0, leading.length - remove))}${raw.slice(leading.length)}</w:t>`;
  });
  return { xml, applied };
}

export function detectManualLineBreakParagraphs(documentXml: string): number[] {
  const out: number[] = [];
  const paragraphs = paragraphRanges(documentXml);
  for (let i = 0; i < paragraphs.length; i++) {
    const xml = documentXml.slice(paragraphs[i].start, paragraphs[i].end);
    if (/<w:br\b[^>]*>|<w:cr\b[^>]*\/?\s*>/.test(xml)) out.push(i);
  }
  return out;
}

export function patchParagraphTargets(
  documentXml: string,
  targets: ParagraphFormattingTarget[],
): PatchResult {
  const wanted = new Map(targets.filter((target) => Number.isInteger(target.paragraphIndex)).map((target) => [target.paragraphIndex, target]));
  if (!wanted.size) return { ...NO_OP, xml: documentXml };
  let index = 0;
  let changed = false;
  const xml = documentXml.replace(/<w:p(?:\s[^>]*[^/>])?>[\s\S]*?<\/w:p>/g, (paragraph) => {
    const target = wanted.get(index++);
    if (!target) return paragraph;
    const p = paragraphRulePatch(paragraph, target);
    let next = p.inner;
    if (target.removeFakeIndent) next = stripLeadingFakeIndent(next).xml;
    if (target.clearDirectIndent) {
      next = next.replace(/<w:ind\b([^>]*)\/>/g, (node, attrs: string) => {
        const cleaned = attrs.replace(/\s+w:(?:firstLine|hanging)="[^"]*"/g, '');
        return cleaned.trim() ? `<w:ind${cleaned}/>` : '';
      }).replace(/<w:ind\b([^>]*)>([\s\S]*?)<\/w:ind>/g, (node, attrs: string, inner: string) => {
        const cleaned = attrs.replace(/\s+w:(?:firstLine|hanging)="[^"]*"/g, '');
        return cleaned.trim() ? `<w:ind${cleaned}>${inner}</w:ind>` : inner;
      });
    }
    if (next !== paragraph) changed = true;
    return next;
  });
  return changed ? { xml, applied: true, before: {}, after: {}, found: {} } : { ...NO_OP, xml: documentXml };
}

// Word ugradjeni stil za tekst fusnota ima stabilan (locale-neovisan) styleId
// "FootnoteText" (za razliku od w:name koji je lokaliziran, npr. "Fusnota").
// Isti patch-only obrazac kao patchDefaultParagraphSpacing: ako dokument ne
// deklarira taj stil u styles.xml, findStyleBlock vraca null i funkcija je
// posten no-op (ne izmislja stil koji ne postoji).
// Dijeljeno s patchFootnoteTypography (ista lokalizirana imena).
const FOOTNOTE_TEXT_NAME_RE = /^\s*(?:footnote text|tekst fusnote|fusnota)\s*$/i;

export function patchFootnoteTextSpacing(
  stylesXml: string,
  beforeTwentieths: number,
  afterTwentieths: number,
): PatchResult {
  // RE-21: findStyleByIdOrName (id-ili-ime), isti obrazac kao patchFootnoteTypography. Prije je ovo
  // bio exact-match findStyleBlock, pa je na lokaliziranom radu (styleId "Fusnota") tipografija
  // fusnota bila popravljena a razmak ne, iako je posrijedi ISTI stil.
  // Stil se i dalje NE izmislja: ako dokument nema FootnoteText/Fusnota, nema ni fusnota kojima
  // bismo razmak popravljali (patchNormalParagraphProps vraca no-op kad stil ne postoji).
  return patchNormalParagraphProps(stylesXml, 'FootnoteText', 'w:spacing', {
    'w:before': String(beforeTwentieths),
    'w:after': String(afterTwentieths),
  }, FOOTNOTE_TEXT_NAME_RE);
}

/**
 * Nadji stil po styleId, a ako ga nema, po lokaliziranom imenu (`w:name`). Wordovi ugradjeni
 * styleId-evi su stabilni i neovisni o jeziku ("Heading1", "FootnoteText"), ali dokumenti iz
 * LibreOfficea i starijih verzija znaju imati vlastite ("Naslov1"), pa ime sluzi kao rezerva.
 */
function findStyleByIdOrName(stylesXml: string, styleId: string, namePattern: RegExp) {
  const byId = findStyleBlock(stylesXml, styleId);
  if (byId) return byId;
  // RE-24 (P-B): samozatvarajuca alternativa PRIJE uparene, isti razlog kao findStyleBlock: bez nje
  // bi svaki prazan (samozatvarajuci) stil na putu "progutao" susjeda, pa bi imena iza njega ostala
  // nedostizna ovoj petlji.
  const re = /<w:style\b[^>]*\/>|<w:style\b[^>]*>[\s\S]*?<\/w:style>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(stylesXml)) !== null) {
    // RE-03 (Codex adversarijalni nalaz): ime-podudaranje SAMO PO SEBI nije dovoljno; svi
    // pozivatelji (naslovi, fusnote, default paragraf stil) traze paragraph stil, pa NE-paragraph
    // stil (npr. character) slucajno nazvan npr. "Standard" ne smije proci kao pogodak.
    if (!/w:type="paragraph"/.test(m[0])) continue;
    const nameVal = m[0].match(/<w:name\b[^>]*w:val="([^"]*)"/);
    if (nameVal && namePattern.test(nameVal[1])) {
      return { block: m[0], start: m.index, end: m.index + m[0].length };
    }
  }
  return null;
}

/** Prekidacko svojstvo (w:b, w:i): prisutnost znaci ukljuceno, `w:val="0"` iskljuceno. */
function upsertToggle(inner: string, name: string): UpsertResult {
  const existing = findDirectChild(inner, name, []);
  if (!existing) {
    const at = schemaInsertIndex(inner, name, CT_RPR_ORDER, []);
    return { inner: inner.slice(0, at) + `<${name}/>` + inner.slice(at), changed: true, before: { [name]: 'iskljuceno' }, after: { [name]: 'ukljuceno' } };
  }
  const off = /w:val="(?:0|false|off)"/.test(existing.tag);
  if (!off) return { inner, changed: false, before: {}, after: {} };
  const tag = removeAttributes(existing.tag, ['w:val']);
  return {
    inner: inner.slice(0, existing.start) + tag + inner.slice(existing.end),
    changed: true, before: { [name]: 'iskljuceno' }, after: { [name]: 'ukljuceno' },
  };
}

export interface HeadingFormatSpec {
  sizeHalfPoints?: number;
  bold?: boolean;
  italic?: boolean;
  alignLeft?: boolean;
}

export interface HeadingParagraphTarget {
  paragraphIndex: number;
  level: number;
  numbered?: boolean;
  numberingNumId?: number;
  numberingManaged?: boolean;
  removeManualNumbering?: boolean;
  clearDirectFont?: boolean;
  clearDirectSize?: boolean;
  clearDirectAlignment?: boolean;
}

export interface HeadingStyleOptions {
  keepNext?: boolean;
  pageBreakLevels?: number[];
}

function paragraphRanges(documentXml: string): Array<{ start: number; end: number }> {
  const masked = documentXml.replace(
    /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>/g,
    (m) => ' '.repeat(m.length),
  );
  const tokenRe = /<w:p(?=[\s/>])[^>]*\/?>|<\/w:p\s*>/g;
  const stack: number[] = [];
  const ranges: Array<{ start: number; end: number }> = [];
  let token: RegExpExecArray | null;
  while ((token = tokenRe.exec(masked))) {
    if (/^<\/w:p/.test(token[0])) {
      const start = stack.pop();
      if (start !== undefined) ranges.push({ start, end: token.index + token[0].length });
      continue;
    }
    if (/\/\s*>$/.test(token[0])) {
      ranges.push({ start: token.index, end: token.index + token[0].length });
    } else {
      stack.push(token.index);
    }
  }
  return ranges.sort((a, b) => a.start - b.start);
}

function removeDirectRunProperties(
  paragraphXml: string,
  options: Pick<HeadingParagraphTarget, 'clearDirectFont' | 'clearDirectSize'>,
): string {
  if (!options.clearDirectFont && !options.clearDirectSize) return paragraphXml;
  return paragraphXml.replace(/<w:r\b[^>]*>[\s\S]*?<\/w:r>/g, (run) =>
    run.replace(/<w:rPr\b[^>]*>[\s\S]*?<\/w:rPr>/g, (rPr) => {
      let out = rPr;
      if (options.clearDirectFont) out = out.replace(/<w:rFonts\b[^>]*\/?>(?:<\/w:rFonts>)?/g, '');
      if (options.clearDirectSize) out = out.replace(/<w:sz(?:Cs)?\b[^>]*\/?>(?:<\/w:sz(?:Cs)>)?/g, '');
      return out;
    }),
  );
}

function removeDirectParagraphProperties(paragraphXml: string, clearAlignment?: boolean): string {
  if (!clearAlignment) return paragraphXml;
  return paragraphXml.replace(/<w:pPr\b[^>]*>[\s\S]*?<\/w:pPr>/g, (pPr) =>
    pPr.replace(/<w:jc\b[^>]*\/?>(?:<\/w:jc>)?/g, ''),
  );
}

function decodeXmlText(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code: string) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function removeDecodedPrefix(raw: string, count: number): string {
  let remaining = count;
  let offset = 0;
  const tokens = raw.match(/&(?:#\d+|#x[0-9a-f]+|[a-z]+);|[\s\S]/gi) ?? [];
  for (const token of tokens) {
    if (remaining <= 0) break;
    remaining -= Array.from(decodeXmlText(token)).length;
    offset += token.length;
  }
  return raw.slice(offset);
}

function stripManualHeadingNumbering(paragraphXml: string): { xml: string; applied: boolean } {
  const textNodes = [...paragraphXml.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)];
  if (!textNodes.length) return { xml: paragraphXml, applied: false };
  const visible = textNodes.map((match) => decodeXmlText(match[1])).join('');
  const prefix = visible.match(/^\s*((?:(?:\d+\.){1,8}\d*|[IVXLCDM]+)(?:[.)])?)\s+/i);
  if (!prefix) return { xml: paragraphXml, applied: false };
  let remaining = prefix[0].length;
  let applied = false;
  const xml = paragraphXml.replace(/<w:t\b([^>]*)>([\s\S]*?)<\/w:t>/g, (node, attributes: string, raw: string) => {
    if (remaining <= 0) return node;
    const decodedLength = Array.from(decodeXmlText(raw)).length;
    const remove = Math.min(remaining, decodedLength);
    remaining -= remove;
    if (remove <= 0) return node;
    applied = true;
    const next = removeDecodedPrefix(raw, remove);
    return `<w:t${attributes}>${next}</w:t>`;
  });
  return { xml, applied };
}

function patchHeadingParagraph(
  paragraphXml: string,
  target: HeadingParagraphTarget,
): { xml: string; applied: boolean } {
  const level = Math.max(1, Math.min(9, Math.trunc(target.level)));
  const pStyle = `Heading${level}`;
  const pPr = withContainer(
    paragraphXml,
    'w:pPr',
    CT_PPR_ORDER,
    ['w:rPr'],
    (inner) => upsertChild(inner, 'w:pStyle', { 'w:val': pStyle }, CT_PPR_ORDER, ['w:rPr']),
  );
  let cleaned = removeDirectParagraphProperties(
    removeDirectRunProperties(pPr.inner, target),
    target.clearDirectAlignment,
  );
  if (target.removeManualNumbering) {
    cleaned = stripManualHeadingNumbering(cleaned).xml;
  }
  if (!pPr.changed && cleaned === paragraphXml) return { xml: paragraphXml, applied: false };
  return {
    xml: cleaned,
    applied: true,
  };
}

function addHeadingNumbering(paragraphXml: string, target: HeadingParagraphTarget): { xml: string; applied: boolean } {
  if (!target.numberingManaged) return { xml: paragraphXml, applied: false };
  const pPrMatch = paragraphXml.match(/<w:pPr\b[^>]*>[\s\S]*?<\/w:pPr>/);
  if (!pPrMatch || pPrMatch.index === undefined) return { xml: paragraphXml, applied: false };
  const pPr = pPrMatch[0];
  const open = pPr.match(/^<w:pPr\b[^>]*>/)?.[0];
  if (!open) return { xml: paragraphXml, applied: false };
  const inner = pPr.slice(open.length, -'</w:pPr>'.length);
  const withoutNumPr = inner
    .replace(/<w:numPr\b[^>]*>[\s\S]*?<\/w:numPr>/g, '')
    .replace(/<w:numPr\b[^>]*\/>/g, '');
  if (target.numbered !== true || target.numberingNumId == null) {
    if (withoutNumPr === inner) return { xml: paragraphXml, applied: false };
    const next = open + withoutNumPr + '</w:pPr>';
    return {
      xml: paragraphXml.slice(0, pPrMatch.index) + next + paragraphXml.slice(pPrMatch.index + pPr.length),
      applied: true,
    };
  }
  const numPr = `<w:numPr><w:ilvl w:val="${Math.max(0, target.level - 1)}"/><w:numId w:val="${target.numberingNumId}"/></w:numPr>`;
  const at = schemaInsertIndex(withoutNumPr, 'w:numPr', CT_PPR_ORDER, ['w:rPr']);
  const next = open + withoutNumPr.slice(0, at) + numPr + withoutNumPr.slice(at) + '</w:pPr>';
  if (next === pPr) return { xml: paragraphXml, applied: false };
  return {
    xml: paragraphXml.slice(0, pPrMatch.index) + next + paragraphXml.slice(pPrMatch.index + pPr.length),
    applied: true,
  };
}

function headingStyleBlock(level: number): string {
  return `<w:style w:type="paragraph" w:styleId="Heading${level}"><w:name w:val="heading ${level}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="${9 + level}"/><w:qFormat/><w:pPr><w:keepNext/><w:outlineLvl w:val="${level - 1}"/></w:pPr></w:style>`;
}

export function ensureHeadingStyles(
  stylesXml: string,
  levels: number[],
  options: HeadingStyleOptions = {},
): { xml: string; applied: boolean } {
  if (!stylesXml || !/<w:styles\b/i.test(stylesXml)) return { xml: stylesXml, applied: false };
  const wanted = [...new Set(levels.map((level) => Math.trunc(level)).filter((level) => level >= 1 && level <= 9))];
  if (!wanted.length) return { xml: stylesXml, applied: false };
  let xml = stylesXml;
  let applied = false;
  for (const level of wanted) {
    const found = findStyleByIdOrName(xml, `Heading${level}`, new RegExp(`^\\s*(?:heading|naslov)\\s*${level}\\s*$`, 'i'));
    if (!found) {
      const close = xml.lastIndexOf('</w:styles>');
      if (close < 0) continue;
      xml = xml.slice(0, close) + headingStyleBlock(level) + xml.slice(close);
      applied = true;
      continue;
    }
    const pPr = withContainer(found.block, 'w:pPr', CT_STYLE_ORDER, ['w:pPr', 'w:rPr'], (inner) => {
      let result = upsertChild(inner, 'w:keepNext', {}, CT_PPR_ORDER, ['w:rPr']);
      const outline = upsertChild(result.inner, 'w:outlineLvl', { 'w:val': String(level - 1) }, CT_PPR_ORDER, ['w:rPr']);
      return { ...outline, before: { ...result.before, ...outline.before }, after: { ...result.after, ...outline.after } };
    });
    if (pPr.changed) {
      xml = xml.slice(0, found.start) + pPr.inner + xml.slice(found.end);
      applied = true;
    }
  }
  const pageBreakLevels = new Set((options.pageBreakLevels ?? []).filter((level) => level >= 1 && level <= 9));
  for (const level of pageBreakLevels) {
    const found = findStyleByIdOrName(xml, `Heading${level}`, new RegExp(`^\\s*(?:heading|naslov)\\s*${level}\\s*$`, 'i'));
    if (!found) continue;
    const pPr = withContainer(found.block, 'w:pPr', CT_STYLE_ORDER, ['w:pPr', 'w:rPr'], (inner) =>
      upsertChild(inner, 'w:pageBreakBefore', {}, CT_PPR_ORDER, ['w:rPr']),
    );
    if (pPr.changed) {
      xml = xml.slice(0, found.start) + pPr.inner + xml.slice(found.end);
      applied = true;
    }
  }
  return { xml, applied };
}

export interface HeadingNumberingOptions {
  maxLevel: number;
  format?: 'decimal' | 'upperRoman' | 'lowerRoman';
  trailingDot?: boolean;
}

export function ensureHeadingNumbering(
  numberingXml: string | undefined,
  options: HeadingNumberingOptions,
): { xml: string; applied: boolean; numId: number | null } {
  let xml = numberingXml?.trim() || '<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"></w:numbering>';
  if (!/<w:numbering\b/i.test(xml)) return { xml: numberingXml ?? '', applied: false, numId: null };
  const maxLevel = Math.max(1, Math.min(9, Math.trunc(options.maxLevel)));
  const format = options.format ?? 'decimal';
  const suffix = options.trailingDot === false ? '' : '.';
  const levelText = (index: number): string => `${Array.from({ length: index + 1 }, (_, part) => `%${part + 1}`).join('.')}${suffix}`;
  const marker = /<w:abstractNum\b[^>]*>[\s\S]*?<\/w:abstractNum>/g;
  let existing = marker.exec(xml);
  while (existing) {
    const block = existing[0];
    const abstractNumId = Number(block.match(/\bw:abstractNumId="(\d+)"/)?.[1]);
    if (!Number.isInteger(abstractNumId) || !/<w:name\b[^>]*w:val="Lekta Heading Numbering"/.test(block)) {
      existing = marker.exec(xml);
      continue;
    }
    // Provjeri svaku razinu kao zaseban XML blok. Prethodni regex je razine hvatao kroz
    // cijeli abstractNum, pa je nakon kombiniranog popravka ponekad zaključio da postojeća
    // shema nije kompatibilna i svaki bi drugi prolaz dodao novi numId.
    const levelMatches = [...block.matchAll(/<w:lvl\b[^>]*>[\s\S]*?<\/w:lvl>/g)].map((match) => {
      const level = match[0];
      return {
        index: Number(level.match(/\bw:ilvl="(\d+)"/)?.[1]),
        format: level.match(/<w:numFmt\b[^>]*\bw:val="([^"]+)"/)?.[1],
        text: level.match(/<w:lvlText\b[^>]*\bw:val="([^"]+)"/)?.[1],
      };
    });
    const compatible = levelMatches.length === maxLevel && levelMatches.every((level, index) =>
      level.index === index && level.format === format && level.text === levelText(index),
    );
    if (compatible) {
      const num = [...xml.matchAll(/<w:num\b[^>]*>[\s\S]*?<\/w:num>/g)]
        .map((match) => match[0])
        .find((candidate) => candidate.includes(`w:val="${abstractNumId}"`));
      const existingNumId = num?.match(/w:numId="(\d+)"/)?.[1];
      if (existingNumId) return { xml: numberingXml ?? xml, applied: false, numId: Number(existingNumId) };
    }
    existing = marker.exec(xml);
  }
  const abstractIds = [...xml.matchAll(/<w:abstractNum\b[^>]*w:abstractNumId="(\d+)"/g)].map((match) => Number(match[1]));
  const numIds = [...xml.matchAll(/<w:num\b[^>]*w:numId="(\d+)"/g)].map((match) => Number(match[1]));
  const abstractNumId = (abstractIds.length ? Math.max(...abstractIds) : 0) + 1;
  const numId = (numIds.length ? Math.max(...numIds) : 0) + 1;
  const levels = Array.from({ length: maxLevel }, (_, index) =>
    `<w:lvl w:ilvl="${index}"><w:start w:val="1"/><w:numFmt w:val="${format}"/>${index > 0 ? `<w:lvlRestart w:val="${index}"/>` : ''}<w:pStyle w:val="Heading${index + 1}"/><w:lvlText w:val="${levelText(index)}"/><w:lvlJc w:val="left"/><w:pPr><w:tabs><w:tab w:val="num" w:pos="${720 + index * 360}"/></w:tabs><w:ind w:left="${720 + index * 360}" w:hanging="360"/></w:pPr></w:lvl>`,
  ).join('');
  const abstract = `<w:abstractNum w:abstractNumId="${abstractNumId}"><w:multiLevelType w:val="multilevel"/><w:name w:val="Lekta Heading Numbering"/>${levels}</w:abstractNum>`;
  const num = `<w:num w:numId="${numId}"><w:abstractNumId w:val="${abstractNumId}"/></w:num>`;
  const close = xml.lastIndexOf('</w:numbering>');
  if (close < 0) return { xml: numberingXml ?? '', applied: false, numId: null };
  return { xml: xml.slice(0, close) + abstract + num + xml.slice(close), applied: true, numId };
}

export function patchHeadingParagraphs(
  documentXml: string,
  targets: HeadingParagraphTarget[],
): { xml: string; applied: boolean; changed: number } {
  if (!targets.length) return { xml: documentXml, applied: false, changed: 0 };
  const ranges = paragraphRanges(documentXml);
  let xml = documentXml;
  let changed = 0;
  // Apply from the end so earlier offsets remain valid.
  for (const target of [...targets].sort((a, b) => b.paragraphIndex - a.paragraphIndex)) {
    if (!Number.isInteger(target.paragraphIndex) || target.paragraphIndex < 1) continue;
    const range = ranges[target.paragraphIndex - 1];
    if (!range) continue;
    const block = documentXml.slice(range.start, range.end);
    const result = patchHeadingParagraph(block, target);
    const numbered = addHeadingNumbering(result.xml, target);
    if (!result.applied && !numbered.applied) continue;
    const nextXml = numbered.xml;
    const delta = nextXml.length - block.length;
    xml = xml.slice(0, range.start) + nextXml + xml.slice(range.end);
    if (delta !== 0) {
      // Ranges are based on the original XML and are processed backwards, so no offset update is needed.
    }
    changed += 1;
  }
  return { xml, applied: changed > 0, changed };
}

/**
 * Oblikovanje naslova JEDNE razine, kroz ugradjeni stil `HeadingN`.
 *
 * Radi kroz stil, a ne po odlomcima, jer analiza razrjesava nasljedjivanje
 * (`merge(docDefaults, stilOdlomka, znakovniStil, izravno)` u analyze-docx), pa je stilski
 * ispravak vidljiv i Wordu i nasoj ponovnoj provjeri. Stil se NE izmislja: dokument koji nema
 * `HeadingN` nema ni naslove te razine.
 */
export function patchHeadingFormat(stylesXml: string, level: number, spec: HeadingFormatSpec): PatchResult {
  const found = findStyleByIdOrName(stylesXml, `Heading${level}`, new RegExp(`^\\s*(?:heading|naslov)\\s*${level}\\s*$`, 'i'));
  if (!found) return { ...NO_OP, xml: stylesXml };

  let block = found.block;
  const before: Record<string, string> = {};
  const after: Record<string, string> = {};
  const foundAttrs: Record<string, boolean> = {};
  let changed = false;

  if (spec.sizeHalfPoints !== undefined || spec.bold || spec.italic) {
    const res = withContainer(block, 'w:rPr', CT_STYLE_ORDER, ['w:pPr', 'w:rPr'], (inner) => {
      let cur = inner; const b: Record<string, string> = {}; const a: Record<string, string> = {}; let ch = false;
      if (spec.sizeHalfPoints !== undefined) {
        const r = upsertChild(cur, 'w:sz', { 'w:val': String(spec.sizeHalfPoints) }, CT_RPR_ORDER, []);
        if (r.changed) { cur = r.inner; b['velicina'] = r.before['w:val'] ?? ''; a['velicina'] = String(spec.sizeHalfPoints); ch = true; }
      }
      if (spec.bold) {
        const r = upsertToggle(cur, 'w:b');
        if (r.changed) { cur = r.inner; b['podebljano'] = 'ne'; a['podebljano'] = 'da'; ch = true; }
      }
      if (spec.italic) {
        const r = upsertToggle(cur, 'w:i');
        if (r.changed) { cur = r.inner; b['kurziv'] = 'ne'; a['kurziv'] = 'da'; ch = true; }
      }
      return { inner: cur, changed: ch, before: b, after: a };
    });
    if (res.changed) { block = res.inner; Object.assign(before, res.before); Object.assign(after, res.after); changed = true; }
  }

  if (spec.alignLeft) {
    const res = withContainer(block, 'w:pPr', CT_STYLE_ORDER, ['w:pPr', 'w:rPr'],
      (inner) => upsertChild(inner, 'w:jc', { 'w:val': 'left' }, CT_PPR_ORDER, ['w:rPr']));
    if (res.changed) {
      block = res.inner;
      before['poravnanje'] = res.before['w:val'] ?? '';
      after['poravnanje'] = 'left';
      changed = true;
    }
  }

  for (const k of Object.keys(after)) foundAttrs[k] = true;
  if (!changed) return { ...NO_OP, xml: stylesXml, found: foundAttrs };
  return { xml: stylesXml.slice(0, found.start) + block + stylesXml.slice(found.end), applied: true, before, after, found: foundAttrs };
}

/**
 * Font i velicina teksta fusnota (stil `FootnoteText`). Isti obrazac kao naslovi; stil se ne
 * izmislja, jer dokument bez njega nema ni fusnota za oblikovati.
 */
export function patchFootnoteTypography(
  stylesXml: string,
  update: { fontName?: string; sizeHalfPoints?: number; alignJustify?: boolean },
): PatchResult {
  const found = findStyleByIdOrName(stylesXml, 'FootnoteText', FOOTNOTE_TEXT_NAME_RE);
  if (!found) return { ...NO_OP, xml: stylesXml };

  const before: Record<string, string> = {};
  const after: Record<string, string> = {};
  const res = withContainer(found.block, 'w:rPr', CT_STYLE_ORDER, ['w:pPr', 'w:rPr'], (inner) => {
    let cur = inner; const b: Record<string, string> = {}; const a: Record<string, string> = {}; let ch = false;
    if (update.fontName !== undefined) {
      const r = upsertChild(cur, 'w:rFonts', { 'w:ascii': update.fontName, 'w:hAnsi': update.fontName },
        CT_RPR_ORDER, [], ['w:asciiTheme', 'w:hAnsiTheme']);
      if (r.changed) { cur = r.inner; b['font'] = r.before['w:ascii'] ?? ''; a['font'] = update.fontName; ch = true; }
    }
    if (update.sizeHalfPoints !== undefined) {
      const r = upsertChild(cur, 'w:sz', { 'w:val': String(update.sizeHalfPoints) }, CT_RPR_ORDER, []);
      if (r.changed) { cur = r.inner; b['velicina'] = r.before['w:val'] ?? ''; a['velicina'] = String(update.sizeHalfPoints); ch = true; }
    }
    return { inner: cur, changed: ch, before: b, after: a };
  });

  let block = res.changed ? res.inner : found.block;
  let changed = res.changed;
  Object.assign(before, res.before); Object.assign(after, res.after);

  // Poravnanje fusnota je dio ISTE provjere ("Oblikovanje fusnota"), pa bi bez njega popravak
  // ostavio provjeru crvenom i nakon uspjesnog ispravka fonta i velicine.
  if (update.alignJustify) {
    const jc = withContainer(block, 'w:pPr', CT_STYLE_ORDER, ['w:pPr', 'w:rPr'],
      (inner) => upsertChild(inner, 'w:jc', { 'w:val': 'both' }, CT_PPR_ORDER, ['w:rPr']));
    if (jc.changed) {
      block = jc.inner;
      before['poravnanje'] = jc.before['w:val'] ?? '';
      after['poravnanje'] = 'both';
      changed = true;
    }
  }

  const foundAttrs: Record<string, boolean> = {};
  if (update.fontName !== undefined) foundAttrs['font'] = true;
  if (update.sizeHalfPoints !== undefined) foundAttrs['velicina'] = true;
  if (update.alignJustify) foundAttrs['poravnanje'] = true;
  if (!changed) return { ...NO_OP, xml: stylesXml, found: foundAttrs };
  return { xml: stylesXml.slice(0, found.start) + block + stylesXml.slice(found.end), applied: true, before, after, found: foundAttrs };
}

export function patchDefaultAlignment(stylesXml: string, val: string): PatchResult {
  // Word izostavlja w:jc kad je poravnanje lijevo (zadano), pa je ovo najcesci slucaj u kojem se
  // element mora STVORITI, a ne samo promijeniti.
  return patchNormalParagraphProps(
    stylesXml, resolveDefaultParagraphStyleId(stylesXml), 'w:jc', { 'w:val': val }, DEFAULT_PARAGRAPH_NAME_RE,
  );
}

// === Numeriranje stranica po sekcijama (documentXml, w:pgNumType u w:sectPr) ===
//
// Za razliku od patchMargins/patchPaperSize koji UNIFORMNO krpaju atribute istog
// taga preko SVIH sekcija, numeriranje je PER-SEKCIJA s RAZLICITIM vrijednostima
// (rimski na prednjim listovima, arapski od Uvoda) i cesto ga treba UMETNUTI
// (student rijetko ima eksplicitan w:pgNumType). Zato ovdje enumeriramo sectPr
// blokove u dokument-poretku i primjenjujemo ciljanu vrijednost samo na trazeni indeks.

export interface SectionNumberingTarget {
  /** Redni broj sekcije u dokument-poretku (isti kao els(doc,'w:sectPr') u analyzeDocx). */
  sectionIndex: number;
  /** w:fmt: 'lowerRoman'/'upperRoman' (prednji dio) ili 'decimal' (glavni tekst od Uvoda). */
  fmt: 'lowerRoman' | 'upperRoman' | 'decimal';
  /** w:start; kad je zadan postavlja se (npr. 1 na prvoj prednjoj i prvoj glavnoj sekciji),
   *  kad je undefined numeriranje se NASTAVLJA (postojeci w:start se ne dira). */
  start?: number;
}

// Postavi (ili umetni ako fali) imenovani atribut u OTVARAJUCEM tagu, cuvajuci
// self-closing oblik. Vraca nepromijenjen tag ako je vrijednost vec ista.
function setTagAttribute(tag: string, attr: string, value: string): string {
  const escaped = escapeXmlAttr(value);
  const attrRegex = new RegExp(`(${escapeRegex(attr)}=")([^"]*)(")`);
  if (attrRegex.test(tag)) {
    return tag.replace(attrRegex, (m, p1: string, old: string, p3: string) => (old === escaped ? m : p1 + escaped + p3));
  }
  const inject = ` ${attr}="${escaped}"`;
  return tag.endsWith('/>') ? tag.slice(0, -2).trimEnd() + inject + '/>' : tag.slice(0, -1).trimEnd() + inject + '>';
}

// Umetni pgNumType na CT_SectPr poziciju (ISO 29500): pgNumType neposredno prethodi
// <w:cols>, a dolazi iza pgSz/pgMar. Redoslijed pokusaja: tik prije <w:cols> (najsigurnije
// sidro, hvata i pgBorders/lnNumType koji su prije cols), inace iza <w:pgMar>, iza <w:pgSz>,
// inace odmah iza otvarajuceg taga. Self-closing sectPr se pretvara u kontejner.
function insertIntoSectPr(sectPrBlock: string, insertTag: string): string {
  if (/^<w:sectPr\b[^>]*\/>$/.test(sectPrBlock)) {
    return sectPrBlock.replace(/\/>$/, `>${insertTag}</w:sectPr>`);
  }
  // pgNumType neposredno prethodi <w:cols> u CT_SectPr, pa je umetanje TIK prije cols
  // ispravno bez obzira na pgBorders/lnNumType (koji su takodjer prije cols).
  const cols = sectPrBlock.match(/<w:cols\b[^>]*\/?>/);
  if (cols) return sectPrBlock.replace(cols[0], insertTag + cols[0]);
  // Bez cols: umetni IZA posljednjeg prisutnog elementa koji po CT_SectPr redoslijedu dolazi
  // PRIJE pgNumType (najblizi prvi: lnNumType, pgBorders, paperSrc, pgMar, pgSz, type), da
  // pgNumType ne zavrsi ispred pgBorders/lnNumType kad oni postoje (schema-nevaljan poredak).
  for (const name of ['w:lnNumType', 'w:pgBorders', 'w:paperSrc', 'w:pgMar', 'w:pgSz', 'w:type']) {
    const m = sectPrBlock.match(new RegExp(`<${name}\\b[^>]*?(?:\\/>|>[\\s\\S]*?<\\/${name}>)`));
    if (m) return sectPrBlock.replace(m[0], m[0] + insertTag);
  }
  const open = sectPrBlock.match(/^<w:sectPr\b[^>]*>/);
  if (open) return sectPrBlock.replace(open[0], open[0] + insertTag);
  return sectPrBlock; // teoretski nedostizno (regex je vec potvrdio sectPr oblik)
}

function applyPageNumberingToSection(sectPrBlock: string, target: SectionNumberingTarget): string {
  const existing = sectPrBlock.match(/<w:pgNumType\b[^>]*\/?>/);
  if (existing) {
    let tag = setTagAttribute(existing[0], 'w:fmt', target.fmt);
    if (target.start !== undefined) tag = setTagAttribute(tag, 'w:start', String(target.start));
    return tag === existing[0] ? sectPrBlock : sectPrBlock.replace(existing[0], tag);
  }
  const startAttr = target.start !== undefined ? ` w:start="${escapeXmlAttr(String(target.start))}"` : '';
  const tag = `<w:pgNumType w:fmt="${escapeXmlAttr(target.fmt)}"${startAttr}/>`;
  return insertIntoSectPr(sectPrBlock, tag);
}

export function patchSectionPageNumbering(documentXml: string, targets: SectionNumberingTarget[]): PatchResult {
  if (!targets.length) return { ...NO_OP, xml: documentXml };
  // Sigurnosni izlaz: praceni sectPrChange ugnjezduje <w:sectPr> u <w:sectPr>, sto bi
  // razbilo poredak enumeracije (lazy zatvarajuci tag). Radije bit-identican no-op nego
  // pogresno mapiranje sekcija; takvi radovi su rijetki (nezavrsene track-changes verzije).
  if (/<w:sectPrChange\b/.test(documentXml)) return { ...NO_OP, xml: documentXml };

  const byIndex = new Map(targets.map((t) => [t.sectionIndex, t]));
  let sectionIdx = -1;
  let changed = false;

  // Enumerira sve sekcije u dokument-poretku, i container (<w:sectPr>...</w:sectPr>) i
  // self-closing (<w:sectPr .../>) oblik, da se indeksi poklope s els(doc,'w:sectPr').
  const sectPrPattern = /<w:sectPr\b[^>]*?(?:\/>|>[\s\S]*?<\/w:sectPr>)/g;
  const newXml = documentXml.replace(sectPrPattern, (block) => {
    sectionIdx += 1;
    const target = byIndex.get(sectionIdx);
    if (!target) return block;
    const patched = applyPageNumberingToSection(block, target);
    if (patched !== block) changed = true;
    return patched;
  });

  if (!changed) return { ...NO_OP, xml: documentXml };
  return { xml: newXml, applied: true, before: {}, after: {}, found: {} };
}

// === Podnozje s brojem stranice (footer part + rels + content-types + footerReference) ===
//
// K5 (BL-07b): PRVO prosirenje engine politike izvan document.xml/styles.xml. Umetanje
// podnozja s PAGE poljem trazi uskladjenu izmjenu na 4 mjesta: novi word/footerN.xml,
// <Override> u [Content_Types].xml, <Relationship> u document.xml.rels i <w:footerReference>
// u ciljni sectPr. Svaki primitiv je no-op kad je cilj vec prisutan (bit-identicna sigurnost).

export const FOOTER_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml';
export const FOOTER_REL_TYPE =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer';
const RELATIONSHIPS_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

// Novi footer s PAGE poljem (fldChar sekvenca; instrText " PAGE " s xml:space preserve; jc
// po zelji). Word prikaze automatski broj stranice prema sekcijskoj pgNumType shemi (K4).
export function buildFooterPageXml(align: 'left' | 'center' | 'right' = 'right'): string {
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    `<w:p><w:pPr><w:jc w:val="${align}"/></w:pPr>` +
    '<w:r><w:fldChar w:fldCharType="begin"/></w:r>' +
    '<w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r>' +
    '<w:r><w:fldChar w:fldCharType="separate"/></w:r>' +
    '<w:r><w:t>1</w:t></w:r>' +
    '<w:r><w:fldChar w:fldCharType="end"/></w:r>' +
    '</w:p></w:ftr>'
  );
}

// Sljedeci slobodan rIdN (max postojeci + 1; rId1 ako nema nijednog).
export function nextRelationshipId(relsXml: string): string {
  let max = 0;
  for (const m of relsXml.matchAll(/\bId="rId(\d+)"/g)) {
    const n = parseInt(m[1], 10);
    if (n > max) max = n;
  }
  return `rId${max + 1}`;
}

// Sljedeci slobodan word/footerN.xml (N od 1) koji nije u content-typesu ni u dodanim partovima.
export function nextFooterPartName(contentTypesXml: string, addedNames: string[]): string {
  const taken = new Set<string>();
  for (const m of contentTypesXml.matchAll(/PartName="\/word\/footer(\d+)\.xml"/g)) taken.add(m[1]);
  for (const name of addedNames) {
    const m = name.match(/^word\/footer(\d+)\.xml$/);
    if (m) taken.add(m[1]);
  }
  let n = 1;
  while (taken.has(String(n))) n += 1;
  return `word/footer${n}.xml`;
}

// Dodaj <Override> u [Content_Types].xml prije </Types> (no-op ako partName vec postoji).
export function addContentTypeOverride(
  contentTypesXml: string,
  partName: string,
  contentType: string,
): PatchResult {
  if (contentTypesXml.includes(`PartName="${partName}"`)) return { ...NO_OP, xml: contentTypesXml };
  if (!contentTypesXml.includes('</Types>')) return { ...NO_OP, xml: contentTypesXml };
  const tag = `<Override PartName="${escapeXmlAttr(partName)}" ContentType="${escapeXmlAttr(contentType)}"/>`;
  return { xml: contentTypesXml.replace('</Types>', tag + '</Types>'), applied: true, before: {}, after: {}, found: {} };
}

// Dodaj <Relationship> u rels prije </Relationships> (no-op ako Id vec postoji).
export function addRelationship(relsXml: string, id: string, type: string, target: string): PatchResult {
  if (new RegExp(`\\bId="${escapeRegex(id)}"`).test(relsXml)) return { ...NO_OP, xml: relsXml };
  if (!relsXml.includes('</Relationships>')) return { ...NO_OP, xml: relsXml };
  const tag = `<Relationship Id="${escapeXmlAttr(id)}" Type="${escapeXmlAttr(type)}" Target="${escapeXmlAttr(target)}"/>`;
  return { xml: relsXml.replace('</Relationships>', tag + '</Relationships>'), applied: true, before: {}, after: {}, found: {} };
}

// r:id trazi deklariran xmlns:r na <w:document>; realni docx ga ima, minimalni (sinteticki)
// ne mora. Dodaj ga ako fali, inace bi footerReference s r:id bio nevaljan XML.
function ensureRelationshipsNamespace(documentXml: string): string {
  if (/<w:document\b[^>]*\sxmlns:r=/.test(documentXml)) return documentXml;
  return documentXml.replace(/<w:document\b/, `<w:document xmlns:r="${RELATIONSHIPS_NS}"`);
}

// === Umetanje sekcije prije Uvoda (K6, BL-07c) ===
//
// Prednji dio rada (naslovnica, sazetak, sadrzaj) i glavni tekst se u Wordu razlikuju u
// numeriranju (rimski vs arapski od 1) TEK ako su zasebne sekcije. Student najcesce ima
// jednu sekciju, pa "numeriranje od Uvoda" trazi UMETANJE prijeloma sekcije neposredno
// prije odlomka Uvoda. To se sprema kao NOVI prazan odlomak <w:p><w:pPr><w:sectPr/></w:pPr></w:p>
// koji postaje zavrsni odlomak prednje sekcije; zavrsni body-level sectPr definira glavnu.

// Geometrija stranice (pgSz, pgMar) iz ZADNJEG sectPr-a = body-level zavrsni sectPr (definira
// glavnu sekciju). Marker prednje sekcije preuzima istu geometriju da se format ne promijeni.
export function extractFinalSectionGeometry(documentXml: string): { pgSz: string | null; pgMar: string | null } {
  const sects = documentXml.match(/<w:sectPr\b[^>]*?(?:\/>|>[\s\S]*?<\/w:sectPr>)/g);
  const last = sects && sects.length ? sects[sects.length - 1] : '';
  return {
    pgSz: last.match(/<w:pgSz\b[^>]*\/?>/)?.[0] ?? null,
    pgMar: last.match(/<w:pgMar\b[^>]*\/?>/)?.[0] ?? null,
  };
}

// Ima li odlomak (koji POCINJE na start) vlastiti w:sectPr u svom (prvom) w:pPr bloku. pPr je
// prvi dijete w:p, sectPr (kad ga ima) je zadnji u pPr; sidrimo na pocetku odlomka i uzimamo
// PRVI </w:pPr> (vlastiti pPr), pa ugnjezdeni okvir/tablica u tijelu odlomka ne moze zavarati.
function paragraphOwnsSectPr(documentXml: string, start: number): boolean {
  const slice = documentXml.slice(start);
  // Samozatvarajuci odlomak (<w:p/> ili <w:p attrs/>) nema djece pa ne moze nositi sectPr;
  // bez ovog izlaza greedy [^>]* progutao bi "/" i match bi zahvatio pPr SLJEDECEG odlomka.
  if (/^<w:p\b[^>]*\/>/.test(slice)) return false;
  const ppr = slice.match(/^<w:p\b[^>]*>\s*<w:pPr\b[\s\S]*?<\/w:pPr>/);
  if (!ppr) return false;
  // ZIVI sectPr je zadnji element pPr-a i po CT_PPr redoslijedu dolazi neposredno PRIJE
  // w:pPrChange (povijest pracenih izmjena, koja i sama moze sadrzavati stari <w:sectPr>).
  // Testiraj samo dio prije pPrChange, inace bi povijesni sectPr lazno oznacio inace popravljiv
  // dokument kao "vec ima prijelom" i tiho odbio popravak. (Lazy match iznad staje na PRVOM
  // </w:pPr>, koji kod pPrChange zatvara njegov ugnjezdeni pPr, pa split hvata tocno zivi dio.)
  const live = ppr[0].split(/<w:pPrChange\b/)[0];
  return /<w:sectPr\b/.test(live);
}

// Je li pozicija na razini <w:body> (ne unutar tablice, tekstualnog okvira ni blok-kontrole
// sadrzaja). Umetanje sekcijskog markera je valjano SAMO na razini tijela; Uvod je u praksi
// uvijek ondje, ali branimo se od patoloskih dokumenata (uravnotezeni broj otvaranja/zatvaranja
// prije pozicije). Poziva se nad MASKIRANIM XML-om (bez komentara) pa zakomentiran zatvarac ne
// kvari balans.
function isBodyLevelPosition(documentXml: string, pos: number): boolean {
  const before = documentXml.slice(0, pos);
  const openMinusClose = (open: RegExp, close: RegExp) =>
    (before.match(open)?.length ?? 0) - (before.match(close)?.length ?? 0);
  const tbl = openMinusClose(/<w:tbl\b/g, /<\/w:tbl>/g);
  const txbx = openMinusClose(/<w:txbxContent\b/g, /<\/w:txbxContent>/g);
  const sdt = openMinusClose(/<w:sdtContent\b/g, /<\/w:sdtContent>/g);
  return tbl <= 0 && txbx <= 0 && sdt <= 0;
}

// Umetni prijelom sekcije PRIJE zadanog odlomka (1-based redni broj u dokument-poretku, isti
// koordinatni sustav kao analyzeDocx paragraph.index / introParagraphIndex: n-ti <w:p> start-tag
// u document.xml == n-ti element els(doc,'w:p')). Ubacuje <w:p><w:pPr>{markerSectPr}</w:pPr></w:p>
// tik prije ciljnog <w:p>, cime prednji dio postaje zasebna sekcija (zavrsava markerom), a ciljni
// odlomak (Uvod) zapocinje glavnu sekciju definiranu zavrsnim body-level sectPr-om.
//
// applied:false (bez izmjene bajtova) kad:
//  - ordinal < 2 (nema prednjeg dijela za rimske listove) ili ciljni <w:p> ne postoji,
//  - dokument ima <w:sectPrChange> (praceni sectPr; enumeracija bi bila kriva) -- kao K4/K5,
//  - ciljni odlomak VEC ima sectPr u pPr (idempotencija: to je vec marker),
//  - odlomak neposredno PRIJE cilja vec ima sectPr u pPr (prijelom vec postoji tocno na Uvodu),
//  - ciljni <w:p> nije na razini tijela (unutar w:tbl / w:txbxContent / w:sdtContent).
export function insertSectionBreakBeforeParagraph(
  documentXml: string,
  paragraphOrdinal: number,
  markerSectPr: string,
): { xml: string; applied: boolean } {
  if (paragraphOrdinal < 2) return { xml: documentXml, applied: false };
  if (/<w:sectPrChange\b/.test(documentXml)) return { xml: documentXml, applied: false };

  // getElementsByTagName('w:p') (analyzeDocx) ne vidi komentare, CDATA ni PI, pa <w:p unutar
  // njih ne smije pomaknuti indeks (inace bi se marker umetnuo u komentar ili ciljao krivi
  // odlomak, npr. round-trip alati znaju ostaviti <w:p u <!-- ... -->). Maskiraj te regije
  // istoduljinskim razmacima: SVE pozicije i svi PRAVI strukturni tagovi ostaju netaknuti pa
  // offset vrijedi i u izvornom documentXml-u. Guardovi rade nad maskiranim XML-om da
  // zakomentiran </w:tbl> i sl. ne pokvare balans razine tijela.
  const masked = documentXml.replace(
    /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>/g,
    (m) => ' '.repeat(m.length),
  );

  // Pocetne pozicije svih odlomackih tagova (<w:p>, <w:p ...>, <w:p/>), u dokument-poretku.
  // Lookahead [\s/>] iskljucuje <w:pPr>/<w:pStyle>/<w:pgSz>/<w:pgNumType> (nema granice na "P"/"g").
  const starts: number[] = [];
  const pOpen = /<w:p(?=[\s/>])/g;
  for (let m = pOpen.exec(masked); m; m = pOpen.exec(masked)) starts.push(m.index);
  if (paragraphOrdinal > starts.length) return { xml: documentXml, applied: false };

  const targetStart = starts[paragraphOrdinal - 1];
  const prevStart = starts[paragraphOrdinal - 2]; // ordinal >= 2 zajamcen gore
  if (paragraphOwnsSectPr(masked, targetStart)) return { xml: documentXml, applied: false };
  if (paragraphOwnsSectPr(masked, prevStart)) return { xml: documentXml, applied: false };
  if (!isBodyLevelPosition(masked, targetStart)) return { xml: documentXml, applied: false };

  const marker = `<w:p><w:pPr>${markerSectPr}</w:pPr></w:p>`;
  return { xml: documentXml.slice(0, targetStart) + marker + documentXml.slice(targetStart), applied: true };
}

// Umetni <w:footerReference> na POCETAK ciljne sekcije (footerReference/headerReference su
// prvi u CT_SectPr). No-op ako sekcija vec ima BILO KAKAV footerReference (ne diramo tudji
// footer), ako trazeni indeks ne postoji ili ima sectPrChange. Enumeracija = ista kao pgNumType.
export function addFooterReferenceToSection(
  documentXml: string,
  sectionIndex: number,
  rId: string,
  type: 'default' | 'first' | 'even' = 'default',
): PatchResult {
  if (/<w:sectPrChange\b/.test(documentXml)) return { ...NO_OP, xml: documentXml };
  const ref = `<w:footerReference w:type="${type}" r:id="${escapeXmlAttr(rId)}"/>`;
  let idx = -1;
  let applied = false;
  const sectPrPattern = /<w:sectPr\b[^>]*?(?:\/>|>[\s\S]*?<\/w:sectPr>)/g;
  const patched = documentXml.replace(sectPrPattern, (block) => {
    idx += 1;
    if (idx !== sectionIndex) return block;
    if (/<w:footerReference\b/.test(block)) return block; // vec ima footer -> ne diramo
    if (/^<w:sectPr\b[^>]*\/>$/.test(block)) {
      applied = true;
      return block.replace(/\/>$/, `>${ref}</w:sectPr>`);
    }
    const open = block.match(/^<w:sectPr\b[^>]*>/);
    if (!open) return block;
    applied = true;
    return block.replace(open[0], open[0] + ref);
  });
  if (!applied) return { ...NO_OP, xml: documentXml };
  return { xml: ensureRelationshipsNamespace(patched), applied: true, before: {}, after: {}, found: {} };
}

// === Poravnanje broja stranice u postojecem footeru/headeru (word/footerN.xml,
// word/headerN.xml) ===
//
// Za razliku od gornjih footer primitiva (K5, koji DODAJU novi footer part), ovo
// UREDUJE vec postojeci part. Odlomak s PAGE poljem se trazi istim kriterijem kao
// analyzeDocx (PRVI <w:p> ciji tekst sadrzi "PAGE", case-insensitive), pa fixer i
// audit nikad ne mogu gledati razlicit odlomak. Ista SELF_CLOSING_SRC/PAIRED_SRC
// alternacija kao paragraph-cleanup.ts/run-level.ts (ne naivni /<w:p>[\s\S]*?<\/w:p>/g,
// koji moze "progutati" sljedeci pravi odlomak kad mu prethodi samozatvarajuci <w:p/>).
//
// RE-07: Word IZOSTAVLJA w:jc kad je poravnanje lijevo (zadano), sto je bas najcesci prekrsaj
// ("broj lijevo, trazi se desno"). Prijasnja "patch-only" politika (patchTagAttributes, mijenja
// SAMO postojeci atribut) taj slucaj nije mogla popraviti; sada se w:jc UMECE u pPr PAGE odlomka
// (upsertChild/withContainer, ista infrastruktura kao patchDefaultAlignment). Ako je PRVI PAGE
// odlomak vec na ciljanoj vrijednosti (no-op), petlja nastavlja na SLJEDECI PAGE odlomak u ISTOM
// partu umjesto da odustane od cijelog parta (prije: prvi PAGE odlomak bez izmjene odmah je vracao
// NO_OP, pa bi drugi, stvarno pogresno poravnati PAGE odlomak u istom partu ostao netaknut).

const FOOTER_SELF_CLOSING_SRC = String.raw`<w:p(?:\s[^>]*)?/>`;
const FOOTER_PAIRED_SRC = String.raw`<w:p(?:\s[^>]*[^/>])?>[\s\S]*?</w:p>`;
const FOOTER_PARAGRAPH_RE = new RegExp(`${FOOTER_SELF_CLOSING_SRC}|${FOOTER_PAIRED_SRC}`, 'g');

export function patchFooterPageAlignment(
  partXml: string,
  align: 'left' | 'center' | 'right' = 'right',
): PatchResult {
  FOOTER_PARAGRAPH_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = FOOTER_PARAGRAPH_RE.exec(partXml))) {
    const block = match[0];
    if (!/\bPAGE\b/i.test(block)) continue;
    const res = withContainer(block, 'w:pPr', ['w:pPr'], [],
      (inner) => upsertChild(inner, 'w:jc', { 'w:val': align }, CT_PPR_ORDER, ['w:rPr']));
    if (!res.changed) continue; // vec ciljano poravnat: probaj sljedeci PAGE odlomak istog parta
    return {
      xml: partXml.slice(0, match.index) + res.inner + partXml.slice(match.index + block.length),
      applied: true,
      before: res.before,
      after: res.after,
      found: { 'w:val': true },
    };
  }
  return { ...NO_OP, xml: partXml };
}

// === TOC polje s dirty flagom (K7, BL-09) ===
//
// Student cesto ima naslov "Sadrzaj" i ISPOD njega rucno utipkane stavke (ili zastarjelo/staticno
// polje). K7 umece ZIVO TOC polje neposredno IZA naslova Sadrzaj; Word ga na otvaranju regenerira
// (w:dirty). Rucne stavke se NE brisu (fixer samo dodaje polje; preporuka za brisanje ide u
// changelog i panel). Isti fldChar oblik kao K5 PAGE polje.

// Postoji li VEC zivo TOC polje u dokumentu: fldSimple s TOC instrukcijom, fldChar polje s TOC
// instrukcijom, ili SDT sadrzaj-kontrola (docPartGallery "Table of Contents"). Koristi ga I
// analyzeDocx (details.hasTocField, repair-items gate) da se odluka ne razilazi (jedan izvor).
//
// Detekcija je usidrena na GRAMATIKU field koda: instrukcija MORA pocinjati s "TOC" (adversarial
// K7): (a) izbjegava lazni POZITIV kad "toc" stoji unutar argumenta drugog polja (npr. HYPERLINK
// URL ".../toc"), koji bi tiho suzbio ponudu; (b) fldChar instrukcija se cita iz cijele regije
// begin..separate/end (bez tagova), pa "TOC" razbijen na vise <w:instrText> runova NIJE lazni
// NEGATIV koji bi doveo do umetanja DRUGOG (dupliciranog) TOC-a.
export function documentHasTocField(documentXml: string): boolean {
  // fldSimple: vrijednost w:instr pocinje s TOC.
  if (/<w:fldSimple\b[^>]*\sw:instr="\s*TOC\b/i.test(documentXml)) return true;
  // SDT sadrzaj-kontrola (moderni Word auto-TOC je uvijek ovako omotan).
  if (/<w:docPartGallery\b[^>]*w:val="Table of Contents"/i.test(documentXml)) return true;
  // fldChar polje: instrukcija zivi izmedju begin i separate/end i moze biti razbijena na vise
  // <w:instrText> runova. Skini tagove iz te regije i trazi da instrukcija POCINJE s TOC.
  const regions = documentXml.match(
    /<w:fldChar\b[^>]*w:fldCharType="begin"[\s\S]*?<w:fldChar\b[^>]*w:fldCharType="(?:separate|end)"/gi,
  );
  if (regions) {
    for (const r of regions) {
      const instr = r.replace(/<[^>]+>/g, '').replace(/&[a-zA-Z]+;/g, ' ').trim();
      if (/^TOC\b/i.test(instr)) return true;
    }
  }
  return false;
}

/**
 * RE-47: dodaj atribut u OTVARAJUCI tag, ispravno i za samozatvarajuci oblik.
 *
 * Naivni `tag.replace(/>$/, ' w:dirty="true">')` na `<w:fldChar .../>` proizvede
 * `<w:fldChar ... / w:dirty="true">`: atribut zavrsi IZA kose crte, tag prestane biti
 * samozatvarajuci i XML vise nije valjan. Word to tolerira, ali nas vlastiti regex parser
 * (extractBodyParagraphs) od te tocke krivo broji odlomke, pa svi anchor-osjetljivi fixeri
 * poslije toga tiho vrate 'no-target' (dokazano na stvarnom radu: 392 -> 71 odlomaka).
 *
 * Izvezeno da isti popravak dijele xml-patch.ts i field-integrity-fixer.ts (obje su
 * pisale isti pogresan replace).
 */
export function withAddedAttribute(openingTag: string, attribute: string): string {
  return /\/>$/.test(openingTag)
    ? openingTag.replace(/\s*\/>$/, ` ${attribute}/>`)
    : openingTag.replace(/>$/, ` ${attribute}>`);
}

/** Označi postojeće TOC polje za osvježavanje nakon promjene Heading stilova. */
export function markTocFieldsDirty(documentXml: string): { xml: string; applied: boolean } {
  const regions = documentXml.match(
    /<w:fldChar\b[^>]*w:fldCharType="begin"[\s\S]*?<w:fldChar\b[^>]*w:fldCharType="(?:separate|end)"/gi,
  );
  if (
    !regions &&
    !/<w:fldSimple\b[^>]*\bw:instr="[^\"]*\bTOC\b/i.test(documentXml) &&
    !/<w:docPartGallery\b[^>]*w:val="Table of Contents"/i.test(documentXml)
  ) {
    return { xml: documentXml, applied: false };
  }
  let applied = false;
  let xml = documentXml.replace(
    /<w:fldSimple\b[^>]*>/gi,
    (opening) => {
      const instruction = opening.match(/\bw:instr="([^"]*)"/i)?.[1] || '';
      if (!/\bTOC\b/i.test(instruction) || /\bw:dirty="true"/i.test(opening)) return opening;
      applied = true;
      return withAddedAttribute(opening, 'w:dirty="true"');
    },
  );
  xml = xml.replace(
    /<w:fldChar\b[^>]*w:fldCharType="begin"[\s\S]*?<w:fldChar\b[^>]*w:fldCharType="(?:separate|end)"/gi,
    (region) => {
      const instruction = region.replace(/<[^>]+>/g, ' ').replace(/&[a-zA-Z]+;/g, ' ').trim();
      if (!/^TOC\b/i.test(instruction)) return region;
      const begin = region.match(/<w:fldChar\b[^>]*w:fldCharType="begin"[^>]*>/i)?.[0];
      if (!begin || /\bw:dirty="true"/.test(begin)) return region;
      applied = true;
      return region.replace(begin, withAddedAttribute(begin, 'w:dirty="true"'));
    },
  );
  return { xml, applied };
}

// Novo TOC polje OMOTANO u SDT sadrzaj-kontrolu (docPartGallery "Table of Contents") - tocno kako
// Word gradi automatski sadrzaj preko Reference > Sadrzaj. SDT omot je ono sto Wordu daje pravu TOC
// karticu s gumbom "Azuriraj tablicu" (Update Table); goli fldChar bez SDT-a je valjano polje, ali
// ga Word tretira kao obicno polje (samo F9/desni klik > Azuriraj polje, bez TOC UI-a). Zato SDT.
// Unutar sdtContent je fldChar (ne fldSimple): rezultat TOC-a je VISEODLOMACNI, pa begin..separate..end
// (kao K5 PAGE polje) tocno modelira polje ciji rezultat Word regenerira preko vise odlomaka. w:dirty
// na begin fldChar -> Word osvjezi polje pri otvaranju. Placeholder tekst se vidi dok se polje ne osvjezi.
// documentHasTocField prepoznaje i docPartGallery i fldChar TOC, pa idempotencija ostaje.
export function buildTocFieldXml(): string {
  return (
    '<w:sdt>' +
    '<w:sdtPr><w:docPartObj><w:docPartGallery w:val="Table of Contents"/><w:docPartUnique/></w:docPartObj></w:sdtPr>' +
    '<w:sdtEndPr/>' +
    '<w:sdtContent>' +
    '<w:p>' +
    '<w:r><w:fldChar w:fldCharType="begin" w:dirty="true"/></w:r>' +
    '<w:r><w:instrText xml:space="preserve"> TOC \\o "1-3" \\h \\z \\u </w:instrText></w:r>' +
    '<w:r><w:fldChar w:fldCharType="separate"/></w:r>' +
    '<w:r><w:t xml:space="preserve">Sadrzaj se azurira u Wordu: kartica Reference &gt; Azuriraj tablicu (ili desni klik na sadrzaj &gt; Azuriraj polje).</w:t></w:r>' +
    '<w:r><w:fldChar w:fldCharType="end"/></w:r>' +
    '</w:p>' +
    '</w:sdtContent>' +
    '</w:sdt>'
  );
}

// Pozicija neposredno IZA </w:p> odlomka koji pocinje na start. Balansirano brojanje <w:p>/</w:p>
// (podnosi ugnjezdene <w:p> iz tekstualnih okvira: naslov Sadrzaj je jednostavan, ali branimo se).
// Samozatvarajuci <w:p/> zavrsava odmah. -1 ako se kraj ne nadje (malformiran XML).
function paragraphEndPosition(xml: string, start: number): number {
  const selfClose = xml.slice(start).match(/^<w:p\b[^>]*\/>/);
  if (selfClose) return start + selfClose[0].length;
  const token = /<w:p(?=[\s/>])[^>]*?(\/?)>|<\/w:p>/g;
  token.lastIndex = start;
  let depth = 0;
  for (let m = token.exec(xml); m; m = token.exec(xml)) {
    if (m[0] === '</w:p>') {
      depth -= 1;
      if (depth === 0) return m.index + m[0].length;
    } else if (m[1] !== '/') {
      depth += 1;
    }
  }
  return -1;
}

// Umetni odlomak newParaXml NEPOSREDNO IZA odlomka na 1-based rednom broju (isti koordinatni sustav
// kao analyzeDocx: n-ti <w:p> == n-ti els(doc,'w:p')). Maskira komentare/CDATA/PI da <w:p u njima
// ne pomakne indeks (kao K6). Guard: cilj mora biti na razini tijela (ne u tablici/okviru/kontroli).
// applied:false kad ordinal<1, ordinal izvan raspona, cilj nije na razini tijela ili se kraj odlomka
// ne nadje.
export function insertParagraphAfterParagraph(
  documentXml: string,
  paragraphOrdinal: number,
  newParaXml: string,
): { xml: string; applied: boolean } {
  if (paragraphOrdinal < 1) return { xml: documentXml, applied: false };
  const masked = documentXml.replace(
    /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>/g,
    (m) => ' '.repeat(m.length),
  );
  const starts: number[] = [];
  const pOpen = /<w:p(?=[\s/>])/g;
  for (let m = pOpen.exec(masked); m; m = pOpen.exec(masked)) starts.push(m.index);
  if (paragraphOrdinal > starts.length) return { xml: documentXml, applied: false };
  const targetStart = starts[paragraphOrdinal - 1];
  if (!isBodyLevelPosition(masked, targetStart)) return { xml: documentXml, applied: false };
  const endPos = paragraphEndPosition(masked, targetStart);
  if (endPos < 0) return { xml: documentXml, applied: false };
  return { xml: documentXml.slice(0, endPos) + newParaXml + documentXml.slice(endPos), applied: true };
}

// Pozicija neposredno IZA </w:p> PRVOG odlomka NA RAZINI TIJELA ciji goli tekst zadovoljava
// matches(). Za razliku od insertParagraphAfterParagraph (koji uzima anal-time redni broj),
// ovo RE-DERIVIRA sidro iz TRENUTNOG documentXml po tekstu, pa je otporno na promjenu broja
// odlomaka od RANIJIH fixera u istoj bateriji (adversarial K7: brisanje praznih odlomaka ili
// umetanje sekcije prije nas pomakne anal-time indeks i TOC bi sletio na krivo mjesto). Vraca
// -1 ako nema takvog odlomka. Goli tekst = odlomak bez tagova, s dekodiranim osnovnim entitetima
// (ukljucuje diakritiku iz izvornog XML-a); pozivatelj normalizira (npr. sectionName).
export function findParagraphEndAfterMatch(
  documentXml: string,
  matches: (paragraphText: string) => boolean,
): number {
  const masked = documentXml.replace(
    /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>/g,
    (m) => ' '.repeat(m.length),
  );
  const pOpen = /<w:p(?=[\s/>])/g;
  for (let m = pOpen.exec(masked); m; m = pOpen.exec(masked)) {
    const start = m.index;
    if (!isBodyLevelPosition(masked, start)) continue;
    const endPos = paragraphEndPosition(masked, start);
    if (endPos < 0) continue;
    if (matches(paragraphPlainText(documentXml, start, endPos))) return endPos;
    // Preskoci CIJELI ovaj odlomak: bez ovoga bi pOpen uhvatio ugnjezdene <w:p> (tekstualni okvir)
    // kao zasebne kandidate i dvaput procesirao isto tijelo.
    pOpen.lastIndex = endPos;
  }
  return -1;
}

// Goli tekst odlomka [start, endPos) iz IZVORNOG XML-a: bez tagova, s dekodiranim osnovnim
// entitetima (ukljucuje diakritiku). Pozivatelj normalizira (npr. sectionName). Zajednicki za
// re-derivaciju sidra po tekstu (K6 Uvod, K7 Sadrzaj).
function paragraphPlainText(documentXml: string, start: number, endPos: number): string {
  return documentXml
    .slice(start, endPos)
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

// Umetni prijelom sekcije (marker <w:p><w:pPr>{markerSectPr}</w:pPr></w:p>) NEPOSREDNO PRIJE prvog
// odlomka NA RAZINI TIJELA ciji tekst zadovoljava matches() (npr. "Uvod"). Kao
// insertSectionBreakBeforeParagraph, ali sidro se RE-DERIVIRA iz TRENUTNOG documentXml po tekstu,
// ne iz anal-time indeksa (adversarial K6/K7 HIGH): raniji fixer u istoj bateriji -- npr.
// empty-paragraph-fixer koji BRISE odlomke -- pomakne anal-time indeks pa bi prijelom pao na krivi
// odlomak. "prevStart" je PRETHODNI odlomak NA RAZINI TIJELA (preskace ugnjezdene <w:p> iz okvira).
//
// applied:false kad: dokument ima <w:sectPrChange> (praceni sectPr); nema odlomka koji zadovoljava
// matches() na razini tijela; taj odlomak je PRVI na razini tijela (nema prednjeg dijela za rimske
// listove); sam ciljni odlomak VEC ima sectPr u pPr (idempotencija); ili odlomak neposredno PRIJE
// njega vec ima sectPr (prijelom vec tocno prije Uvoda).
export function insertSectionBreakBeforeHeading(
  documentXml: string,
  matches: (paragraphText: string) => boolean,
  markerSectPr: string,
): { xml: string; applied: boolean } {
  if (/<w:sectPrChange\b/.test(documentXml)) return { xml: documentXml, applied: false };
  const masked = documentXml.replace(
    /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>/g,
    (m) => ' '.repeat(m.length),
  );
  const pOpen = /<w:p(?=[\s/>])/g;
  let prevStart = -1;
  for (let m = pOpen.exec(masked); m; m = pOpen.exec(masked)) {
    const start = m.index;
    if (!isBodyLevelPosition(masked, start)) continue;
    const endPos = paragraphEndPosition(masked, start);
    if (endPos < 0) continue;
    if (matches(paragraphPlainText(documentXml, start, endPos))) {
      // Prednji dio (za rimske listove) mora postojati: ili prethodni odlomak NA RAZINI TIJELA
      // (prevStart), ili tablica prije Uvoda (naslovnica zna biti tablica pa nema prednjeg ODLOMKA,
      // ali prednji dio ipak postoji). Bez ikakvog sadrzaja prije Uvoda -> no-op.
      const hasFrontMatter = prevStart >= 0 || /<w:tbl\b/.test(masked.slice(0, start));
      if (!hasFrontMatter) return { xml: documentXml, applied: false };
      if (paragraphOwnsSectPr(masked, start)) return { xml: documentXml, applied: false };
      if (prevStart >= 0 && paragraphOwnsSectPr(masked, prevStart)) return { xml: documentXml, applied: false };
      const marker = `<w:p><w:pPr>${markerSectPr}</w:pPr></w:p>`;
      return { xml: documentXml.slice(0, start) + marker + documentXml.slice(start), applied: true };
    }
    prevStart = start;
    pOpen.lastIndex = endPos; // preskoci ugnjezdene <w:p> ovog odlomka (tekstualni okvir)
  }
  return { xml: documentXml, applied: false };
}

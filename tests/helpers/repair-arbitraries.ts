/**
 * T96 (#209): fast-check generatori minimalnog WordprocessingML-a i svojstva popravka.
 *
 * Generator gradi MODEL dokumenta (odlomci, runovi s w:rPr, razmaci i NBSP, tabulatori, prijelomi,
 * neprelomive crtice, fldSimple, fldChar, fusnote, vise sekcija), a valjan OPC paket se iz modela
 * izvodi deterministicki. Model je ono sto fast-check smanjuje, pa protuprimjer ostaje citljiv.
 *
 * Svojstva su funkcije nad proizvoljnom funkcijom popravka, a popravak se gradi nad proizvoljnim
 * `applyFixers`, da gard u tests/gate-mutations.test.ts moze podmetnuti neispravan fixer UNUTAR
 * stvarnog lanca (redoslijed, changelog, vrata integriteta).
 */
import fc from 'fast-check';
import { DOMParser, type Element as XmlElement, type Node as XmlNode } from '@xmldom/xmldom';
import { applyFixers, type ApplyFixersResult, type FixerId, type FixerRequest } from '../../src/repair/apply-fixers';
import { checkPackageStructure } from '../../src/repair/package-integrity';
import { readZip, writeZip } from '../../src/repair/zip-codec';

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const W = `xmlns:w="${W_NS}"`;
const NBSP = ' ';

/** Komad sadrzaja runa: tekst ili vidljivi inline element. */
type Piece = { t: string } | 'tab' | 'br' | 'nbh';

type RunModel =
  | { kind: 'text'; rPr: RunProps; pieces: Piece[] }
  | { kind: 'empty'; rPr: RunProps }
  | { kind: 'fldSimple'; instr: string; result: string }
  | { kind: 'fldChar'; instr: string; result: string }
  | { kind: 'footnoteRef'; footnote: string };

interface RunProps {
  bold: boolean;
  italic: boolean;
  font: string | null;
  sizeHalfPoints: number | null;
}

interface ParagraphModel {
  jc: 'left' | 'center' | 'both' | null;
  spacingAfter: number | null;
  runs: RunModel[];
  /** Odlomak zatvara sekciju (w:sectPr u w:pPr), pa dokument ima vise sekcija. */
  sectionBreak: boolean;
}

export interface DocModel {
  paragraphs: ParagraphModel[];
  marginTwips: number;
  letter: boolean;
}

// Tekst: slova (i hrvatska), razmaci, NBSP i znakovi koje XML mora escapeati.
const charArb = fc.constantFrom('a', 'b', 'Z', 'č', 'ž', 'đ', ' ', ' ', NBSP, '.', ',', '&', '<', '"', '1');
const textArb = fc.string({ unit: charArb, minLength: 1, maxLength: 12 });

const pieceArb: fc.Arbitrary<Piece> = fc.oneof(
  { weight: 4, arbitrary: textArb.map((t) => ({ t })) },
  { weight: 1, arbitrary: fc.constantFrom<Piece>('tab', 'br', 'nbh') },
);

const runPropsArb: fc.Arbitrary<RunProps> = fc.record({
  bold: fc.boolean(),
  italic: fc.boolean(),
  font: fc.option(fc.constantFrom('Calibri', 'Arial'), { nil: null }),
  sizeHalfPoints: fc.option(fc.constantFrom(18, 22, 28), { nil: null }),
});

const instrArb = fc.constantFrom(' PAGE ', ' NUMPAGES ', ' DATE \\@ "d.M.yyyy." ', ' REF _Ref1 \\h ');
const fieldResultArb = fc.string({ unit: fc.constantFrom('1', '2', 'x', ' '), minLength: 1, maxLength: 3 });

const runArb: fc.Arbitrary<RunModel> = fc.oneof(
  {
    weight: 5,
    arbitrary: fc.record({
      kind: fc.constant('text' as const),
      rPr: runPropsArb,
      pieces: fc.array(pieceArb, { minLength: 1, maxLength: 3 }),
    }),
  },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant('empty' as const), rPr: runPropsArb }) },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant('fldSimple' as const), instr: instrArb, result: fieldResultArb }) },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant('fldChar' as const), instr: instrArb, result: fieldResultArb }) },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant('footnoteRef' as const), footnote: textArb }) },
);

const paragraphArb: fc.Arbitrary<ParagraphModel> = fc.record({
  jc: fc.option(fc.constantFrom('left' as const, 'center' as const, 'both' as const), { nil: null }),
  spacingAfter: fc.option(fc.constantFrom(0, 120, 240), { nil: null }),
  runs: fc.array(runArb, { minLength: 0, maxLength: 5 }),
  sectionBreak: fc.boolean(),
});

export const docModelArb: fc.Arbitrary<DocModel> = fc.record({
  paragraphs: fc.array(paragraphArb, { minLength: 1, maxLength: 6 }),
  // Nijedna vrijednost nije cilj recepta (2,5 cm = 1417), pa margins-fixer uvijek radi.
  marginTwips: fc.constantFrom(1134, 1701, 2268),
  letter: fc.boolean(),
});

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function tEl(text: string): string {
  const preserve = /^[  ]|[  ]$/.test(text) ? ' xml:space="preserve"' : '';
  return `<w:t${preserve}>${esc(text)}</w:t>`;
}

function pieceXml(p: Piece): string {
  if (p === 'tab') return '<w:tab/>';
  if (p === 'br') return '<w:br/>';
  if (p === 'nbh') return '<w:noBreakHyphen/>';
  return tEl(p.t);
}

function rPrXml(p: RunProps): string {
  const inner =
    (p.font ? `<w:rFonts w:ascii="${p.font}" w:hAnsi="${p.font}"/>` : '') +
    (p.bold ? '<w:b/>' : '') +
    (p.italic ? '<w:i/>' : '') +
    (p.sizeHalfPoints ? `<w:sz w:val="${p.sizeHalfPoints}"/>` : '');
  return inner ? `<w:rPr>${inner}</w:rPr>` : '';
}

const SECT = (m: DocModel) =>
  `<w:sectPr><w:pgSz w:w="${m.letter ? 12240 : 11906}" w:h="${m.letter ? 15840 : 16838}"/>` +
  `<w:pgMar w:top="${m.marginTwips}" w:right="${m.marginTwips}" w:bottom="${m.marginTwips}" w:left="${m.marginTwips}"/></w:sectPr>`;

// Stilski backstop kakav Word zapisuje: docDefaults i Normal nose font, velicinu i razmake, pa
// font-fixer, line-spacing-fixer i paragraph-spacing-fixer imaju stvarnu metu (Codex R3 na #287).
const STYLES_XML =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ${W}>` +
  '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/></w:rPr></w:rPrDefault>' +
  '<w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="259" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>' +
  '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/>' +
  '<w:pPr><w:spacing w:after="160" w:line="259" w:lineRule="auto"/><w:jc w:val="left"/></w:pPr>' +
  '<w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/></w:rPr></w:style>' +
  '<w:style w:type="paragraph" w:styleId="FootnoteText"><w:name w:val="footnote text"/><w:basedOn w:val="Normal"/>' +
  '<w:pPr><w:spacing w:after="120"/></w:pPr><w:rPr><w:sz w:val="18"/></w:rPr></w:style>' +
  '<w:style w:type="character" w:styleId="FootnoteReference"><w:name w:val="footnote reference"/><w:rPr><w:vertAlign w:val="superscript"/></w:rPr></w:style>' +
  '</w:styles>';

const CT_MAIN = 'application/vnd.openxmlformats-officedocument.wordprocessingml';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

/** Model -> partovi valjanog OPC paketa. Fusnote dobivaju id redom pojave (1, 2, ...). */
function buildParts(m: DocModel): { name: string; xml: string }[] {
  const footnotes: string[] = [];
  const body = m.paragraphs
    .map((p, pi) => {
      const isLast = pi === m.paragraphs.length - 1;
      const pPrInner =
        (p.spacingAfter !== null ? `<w:spacing w:after="${p.spacingAfter}"/>` : '') +
        (p.jc ? `<w:jc w:val="${p.jc}"/>` : '') +
        (p.sectionBreak && !isLast ? SECT(m) : '');
      const runs = p.runs
        .map((r) => {
          switch (r.kind) {
            case 'text':
              return `<w:r>${rPrXml(r.rPr)}${r.pieces.map(pieceXml).join('')}</w:r>`;
            case 'empty':
              return `<w:r>${rPrXml(r.rPr)}</w:r>`;
            case 'fldSimple':
              return `<w:fldSimple w:instr="${esc(r.instr)}"><w:r>${tEl(r.result)}</w:r></w:fldSimple>`;
            case 'fldChar':
              return (
                '<w:r><w:fldChar w:fldCharType="begin"/></w:r>' +
                `<w:r><w:instrText xml:space="preserve">${esc(r.instr)}</w:instrText></w:r>` +
                '<w:r><w:fldChar w:fldCharType="separate"/></w:r>' +
                `<w:r>${tEl(r.result)}</w:r>` +
                '<w:r><w:fldChar w:fldCharType="end"/></w:r>'
              );
            case 'footnoteRef': {
              footnotes.push(r.footnote);
              return `<w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteReference w:id="${footnotes.length}"/></w:r>`;
            }
          }
        })
        .join('');
      return `<w:p>${pPrInner ? `<w:pPr>${pPrInner}</w:pPr>` : ''}${runs}</w:p>`;
    })
    .join('');

  const hasFootnotes = footnotes.length > 0;
  const parts = [
    {
      name: '[Content_Types].xml',
      xml:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        `<Override PartName="/word/document.xml" ContentType="${CT_MAIN}.document.main+xml"/>` +
        `<Override PartName="/word/styles.xml" ContentType="${CT_MAIN}.styles+xml"/>` +
        (hasFootnotes ? `<Override PartName="/word/footnotes.xml" ContentType="${CT_MAIN}.footnotes+xml"/>` : '') +
        '</Types>',
    },
    {
      name: '_rels/.rels',
      xml:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        `<Relationship Id="rId1" Type="${REL}/officeDocument" Target="word/document.xml"/>` +
        '</Relationships>',
    },
    {
      name: 'word/_rels/document.xml.rels',
      xml:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        `<Relationship Id="rId1" Type="${REL}/styles" Target="styles.xml"/>` +
        (hasFootnotes ? `<Relationship Id="rId2" Type="${REL}/footnotes" Target="footnotes.xml"/>` : '') +
        '</Relationships>',
    },
    {
      name: 'word/document.xml',
      xml: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${W}><w:body>${body}${SECT(m)}</w:body></w:document>`,
    },
    { name: 'word/styles.xml', xml: STYLES_XML },
  ];
  if (hasFootnotes) {
    parts.push({
      name: 'word/footnotes.xml',
      xml:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:footnotes ${W}>` +
        footnotes
          .map(
            (t, i) =>
              `<w:footnote w:id="${i + 1}"><w:p><w:pPr><w:pStyle w:val="FootnoteText"/><w:spacing w:before="60" w:after="60"/></w:pPr>` +
              `<w:r><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="16"/></w:rPr>${tEl(t)}</w:r></w:p></w:footnote>`,
          )
          .join('') +
        '</w:footnotes>',
    });
  }
  return parts;
}

export async function packModel(m: DocModel): Promise<Uint8Array> {
  const enc = new TextEncoder();
  return writeZip(buildParts(m).map((p) => ({ name: p.name, data: enc.encode(p.xml) })));
}

/** Strukturni nalazi paketa (manifest, relacije, shema) preko produkcijskog checkPackageStructure. */
export async function packageIssues(bytes: Uint8Array): Promise<string[]> {
  return checkPackageStructure(await readZip(bytes)).map((i) => `${i.kind} ${i.part}: ${i.detail}`);
}

/** Klasa ulaza koju generator mora stvarno proizvoditi (CLAUDE.md: dokaz klase ulaza). */
export interface ModelClasses {
  field: boolean;
  emptyRun: boolean;
  multiSection: boolean;
  footnote: boolean;
  nbsp: boolean;
  tab: boolean;
  br: boolean;
  noBreakHyphen: boolean;
}

export function classify(m: DocModel): ModelClasses {
  const runs = m.paragraphs.flatMap((p) => p.runs);
  const pieces = runs.flatMap((r) => (r.kind === 'text' ? r.pieces : []));
  const texts = [
    ...pieces.flatMap((p) => (typeof p === 'object' ? [p.t] : [])),
    ...runs.flatMap((r) => (r.kind === 'footnoteRef' ? [r.footnote] : [])),
  ];
  return {
    field: runs.some((r) => r.kind === 'fldSimple' || r.kind === 'fldChar'),
    emptyRun: runs.some((r) => r.kind === 'empty'),
    multiSection: m.paragraphs.slice(0, -1).some((p) => p.sectionBreak),
    footnote: runs.some((r) => r.kind === 'footnoteRef'),
    nbsp: texts.some((t) => t.includes(NBSP)),
    tab: pieces.includes('tab'),
    br: pieces.includes('br'),
    noBreakHyphen: pieces.includes('nbh'),
  };
}

/**
 * Recept popravka FORME koji po src/repair/CLAUDE.md ne smije dirati vidljivi tekst: nijedan od
 * namjernih iznimaka (heading-case, croatian-typography, DOI, toc-field, required-section) nije u
 * njemu. Fiksni parametri razlikuju se od generiranih vrijednosti, pa recept stvarno radi.
 */
export function formRecipe(deep: boolean): FixerRequest[] {
  const d = deep ? { deep: true } : {};
  return [
    { ruleId: 'margins', fixerId: 'margins-fixer', params: { top: 2.5, right: 2.5, bottom: 2.5, left: 2.5 } },
    { ruleId: 'paper', fixerId: 'paper-size-fixer', params: { w: 21.0, h: 29.7 } },
    { ruleId: 'font', fixerId: 'font-fixer', params: { fontName: 'Times New Roman', fontSizePt: 12, ...d } },
    { ruleId: 'line', fixerId: 'line-spacing-fixer', params: { multiplier: 1.5, ...d } },
    { ruleId: 'justify', fixerId: 'alignment-fixer', params: { val: 'both', ...d } },
    { ruleId: 'para-spacing', fixerId: 'paragraph-spacing-fixer', params: { ...d } },
    { ruleId: 'fn-spacing', fixerId: 'footnote-spacing-fixer', params: { ...d } },
    { ruleId: 'fn-typo', fixerId: 'footnote-typography-fixer', params: { fontName: 'Times New Roman', fontSizePt: 10 } },
    { ruleId: 'empty', fixerId: 'empty-paragraph-fixer', params: {} },
  ];
}

export type RepairFn = (bytes: Uint8Array, deep: boolean) => Promise<Uint8Array>;
type ApplyFn = (bytes: Uint8Array, requests: FixerRequest[]) => Promise<ApplyFixersResult>;

/** Popravak receptom forme nad zadanim applyFixers. Odbijen popravak (integrityFailure) baca. */
export function repairWith(apply: ApplyFn): RepairFn {
  return async (bytes, deep) => {
    const r = await apply(bytes, formRecipe(deep));
    if (r.integrityFailure) throw new Error(`integrityFailure: ${JSON.stringify(r.integrityFailure)}`);
    return r.docxBytes;
  };
}

export const realRepair: RepairFn = repairWith(applyFixers);

/** Koji fixeri recepta su stvarno primijenjeni (changelog) na zadanom modelu. */
export async function appliedFixers(m: DocModel, deep: boolean): Promise<Set<FixerId>> {
  const r = await applyFixers(await packModel(m), formRecipe(deep));
  return new Set(r.changelog.map((c) => c.fixerId));
}

/**
 * Svi dijelovi paketa: XML i .rels kao tekst uz normalizaciju CR, binarni kao sirovi bajtovi
 * (hex). Kljuc je ime dijela, pa se usporeduje i skup imena (Codex R1 na #287).
 */
export async function allParts(bytes: Uint8Array): Promise<Record<string, string>> {
  const dec = new TextDecoder();
  const out: Record<string, string> = {};
  for (const e of await readZip(bytes)) {
    out[e.name] = /\.(xml|rels)$/i.test(e.name)
      ? dec.decode(e.data).replace(/\r/g, '')
      : Array.from(e.data, (b) => b.toString(16).padStart(2, '0')).join('');
  }
  return out;
}

const VISIBLE_INLINE: Record<string, string> = { tab: '\t', br: '\n', cr: '\n', noBreakHyphen: '‑', softHyphen: '­' };

/**
 * Vidljivi tok znakova po odlomku, u redoslijedu cvorova: w:t, w:tab, w:br, w:cr, w:noBreakHyphen,
 * w:softHyphen (Codex R4 na #287). Parsira se DOM-om, ne regexom. Prazni odlomci se izostavljaju
 * jer empty-paragraph-fixer smije ukloniti odlomak bez ijednog vidljivog znaka.
 */
export function visibleParagraphs(xml: string): string[] {
  const dom = new DOMParser().parseFromString(xml, 'text/xml');
  const out: string[] = [];
  const ps = dom.getElementsByTagNameNS(W_NS, 'p');
  for (let i = 0; i < ps.length; i++) {
    let text = '';
    const walk = (node: XmlNode): void => {
      for (let c = node.firstChild; c; c = c.nextSibling) {
        if (c.nodeType !== 1) continue;
        const el = c as XmlElement;
        const ime = el.namespaceURI === W_NS ? (el.localName ?? '') : '';
        if (ime === 'p') continue; // ugnijezdeni odlomak broji se zasebno
        if (ime === 't') text += el.textContent ?? '';
        else if (ime in VISIBLE_INLINE) text += VISIBLE_INLINE[ime];
        else walk(el);
      }
    };
    walk(ps[i]);
    if (text !== '') out.push(text);
  }
  return out;
}

const envInt = (v: string | undefined, fallback: number) => (v && Number.isInteger(Number(v)) && Number(v) > 0 ? Number(v) : fallback);
const RUNS = envInt(process.env.LEKTA_FC_RUNS, 50);
const SEED = envInt(process.env.LEKTA_FC_SEED, 20261004);

interface PropertyOutcome {
  failed: boolean;
  counterexample: DocModel | null;
  numShrinks: number;
  error: string | null;
}

async function runProperty(
  predicate: (m: DocModel, deep: boolean) => Promise<void>,
  numRuns = RUNS,
): Promise<PropertyOutcome> {
  const details = await fc.check(
    fc.asyncProperty(docModelArb, fc.boolean(), async (m, deep) => {
      await predicate(m, deep);
    }),
    { numRuns, seed: SEED },
  );
  return {
    failed: details.failed,
    counterexample: details.counterexample ? details.counterexample[0] : null,
    numShrinks: details.numShrinks,
    error: details.failed ? String(details.errorInstance) : null,
  };
}

/** Idempotencija: repair(repair(x)) === repair(x) nad SVIM dijelovima paketa, ukljucujuci skup imena. */
export function idempotenceProperty(repair: RepairFn, numRuns?: number): Promise<PropertyOutcome> {
  return runProperty(async (m, deep) => {
    const onceBytes = await repair(await packModel(m), deep);
    const once = await allParts(onceBytes);
    const twice = await allParts(await repair(onceBytes, deep));
    const names = (o: Record<string, string>) => JSON.stringify(Object.keys(o).sort());
    if (names(once) !== names(twice)) throw new Error(`skup dijelova: ${names(once)} -> ${names(twice)}`);
    for (const name of Object.keys(once)) {
      if (once[name] !== twice[name]) throw new Error(`${name}: drugi prolaz nije no-op`);
    }
  }, numRuns);
}

const TEXT_PARTS = ['word/document.xml', 'word/footnotes.xml'];

/** Vidljivi tok znakova odlomaka (tijelo i fusnote) isti je prije i poslije popravka. */
export function visibleTextProperty(repair: RepairFn, numRuns?: number): Promise<PropertyOutcome> {
  return runProperty(async (m, deep) => {
    const before = await allParts(await packModel(m));
    const after = await allParts(await repair(await packModel(m), deep));
    for (const name of TEXT_PARTS) {
      if (!(name in before)) continue;
      const b = JSON.stringify(visibleParagraphs(before[name]));
      const a = JSON.stringify(visibleParagraphs(after[name] ?? ''));
      if (a !== b) throw new Error(`${name}: vidljivi tekst promijenjen ${b} -> ${a}`);
    }
  }, numRuns);
}

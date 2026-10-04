/**
 * T96 (#209): fast-check generatori minimalnog WordprocessingML-a i svojstva popravka.
 *
 * Generator gradi MODEL dokumenta (odlomci, runovi s w:rPr, razmaci i NBSP, fldSimple, fldChar,
 * fusnote, vise sekcija), a XML se iz modela izvodi deterministicki. Model je ono sto fast-check
 * smanjuje, pa protuprimjer ostaje citljiv: broj odlomaka, runova i polja.
 *
 * Svojstva su izvedena kao funkcije nad proizvoljnom funkcijom popravka, da ih gard u
 * tests/gate-mutations.test.ts moze pokrenuti nad namjerno neispravnim popravkom.
 */
import fc from 'fast-check';
import { DOMParser } from '@xmldom/xmldom';
import { applyFixers, type FixerRequest } from '../../src/repair/apply-fixers';
import { readZip, writeZip } from '../../src/repair/zip-codec';

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const W = `xmlns:w="${W_NS}"`;
const NBSP = ' ';

type RunModel =
  | { kind: 'text'; rPr: RunProps; text: string }
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

const runPropsArb: fc.Arbitrary<RunProps> = fc.record({
  bold: fc.boolean(),
  italic: fc.boolean(),
  font: fc.option(fc.constantFrom('Calibri', 'Arial', 'Times New Roman'), { nil: null }),
  sizeHalfPoints: fc.option(fc.constantFrom(18, 22, 24, 28), { nil: null }),
});

const instrArb = fc.constantFrom(' PAGE ', ' NUMPAGES ', ' DATE \\@ "d.M.yyyy." ', ' REF _Ref1 \\h ');
const fieldResultArb = fc.string({ unit: fc.constantFrom('1', '2', 'x', ' '), minLength: 1, maxLength: 3 });

const runArb: fc.Arbitrary<RunModel> = fc.oneof(
  { weight: 5, arbitrary: fc.record({ kind: fc.constant('text' as const), rPr: runPropsArb, text: textArb }) },
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

/** Model -> partovi paketa. Fusnote dobivaju id redom pojave (1, 2, ...). */
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
              return `<w:r>${rPrXml(r.rPr)}${tEl(r.text)}</w:r>`;
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
  const parts = [
    {
      name: 'word/document.xml',
      xml: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${W}><w:body>${body}${SECT(m)}</w:body></w:document>`,
    },
    {
      name: 'word/styles.xml',
      xml:
        `<w:styles ${W}>` +
        '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>' +
        '<w:style w:type="paragraph" w:styleId="FootnoteText"><w:name w:val="footnote text"/><w:pPr><w:spacing w:after="120"/></w:pPr><w:rPr><w:sz w:val="18"/></w:rPr></w:style>' +
        '</w:styles>',
    },
  ];
  if (footnotes.length) {
    parts.push({
      name: 'word/footnotes.xml',
      xml:
        `<w:footnotes ${W}>` +
        footnotes
          .map(
            (t, i) =>
              `<w:footnote w:id="${i + 1}"><w:p><w:pPr><w:pStyle w:val="FootnoteText"/></w:pPr>` +
              `<w:r><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/></w:rPr>${tEl(t)}</w:r></w:p></w:footnote>`,
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

/** Klasa ulaza koju generator mora stvarno proizvoditi (CLAUDE.md: dokaz klase ulaza). */
export interface ModelClasses {
  field: boolean;
  emptyRun: boolean;
  multiSection: boolean;
  footnote: boolean;
  nbsp: boolean;
}

export function classify(m: DocModel): ModelClasses {
  const runs = m.paragraphs.flatMap((p) => p.runs);
  return {
    field: runs.some((r) => r.kind === 'fldSimple' || r.kind === 'fldChar'),
    emptyRun: runs.some((r) => r.kind === 'empty'),
    multiSection: m.paragraphs.slice(0, -1).some((p) => p.sectionBreak),
    footnote: runs.some((r) => r.kind === 'footnoteRef'),
    nbsp: runs.some((r) => (r.kind === 'text' || r.kind === 'footnoteRef') && (r.kind === 'text' ? r.text : r.footnote).includes(NBSP)),
  };
}

/**
 * Recept popravka FORME koji po src/repair/CLAUDE.md ne smije dirati vidljivi tekst: nijedan od
 * namjernih iznimaka (heading-case, croatian-typography, DOI, toc-field, required-section) nije u
 * njemu. Fiksni parametri razlikuju se od generiranih vrijednosti, pa recept stvarno radi.
 */
function formRecipe(deep: boolean): FixerRequest[] {
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

/** Stvarni popravak: applyFixers s receptom forme. Ispravnost paketa je uvjet svojstva. */
export const realRepair: RepairFn = async (bytes, deep) => {
  const r = await applyFixers(bytes, formRecipe(deep));
  if (r.integrityFailure) throw new Error(`integrityFailure: ${JSON.stringify(r.integrityFailure)}`);
  return r.docxBytes;
};

const PROPERTY_PARTS = ['word/document.xml', 'word/footnotes.xml'];

/** XML partovi nakon normalizacije CR (CLAUDE.md: tekstualne usporedbe normaliziraju CR). */
export async function xmlParts(bytes: Uint8Array): Promise<Record<string, string>> {
  const dec = new TextDecoder();
  const out: Record<string, string> = {};
  for (const e of await readZip(bytes)) {
    if (PROPERTY_PARTS.includes(e.name)) out[e.name] = dec.decode(e.data).replace(/\r/g, '');
  }
  return out;
}

/**
 * Vidljivi tekst: spojeni w:t po odlomku, parsiran DOM-om (ne regexom). Prazni odlomci se
 * izostavljaju jer empty-paragraph-fixer smije ukloniti odlomak bez teksta.
 */
function visibleParagraphs(xml: string): string[] {
  const dom = new DOMParser().parseFromString(xml, 'text/xml');
  const out: string[] = [];
  const ps = dom.getElementsByTagNameNS(W_NS, 'p');
  for (let i = 0; i < ps.length; i++) {
    const ts = ps[i].getElementsByTagNameNS(W_NS, 't');
    let text = '';
    for (let j = 0; j < ts.length; j++) text += ts[j].textContent ?? '';
    if (text !== '') out.push(text);
  }
  return out;
}

const RUNS = Number(process.env.LEKTA_FC_RUNS ?? 50);
const SEED = Number(process.env.LEKTA_FC_SEED ?? 20261004);

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

/** Idempotencija: repair(repair(x)) === repair(x) nad document.xml i footnotes.xml. */
export function idempotenceProperty(repair: RepairFn, numRuns?: number): Promise<PropertyOutcome> {
  return runProperty(async (m, deep) => {
    const once = await repair(await packModel(m), deep);
    const twice = await repair(once, deep);
    const a = await xmlParts(once);
    const b = await xmlParts(twice);
    for (const name of Object.keys(a)) {
      if (a[name] !== b[name]) throw new Error(`${name}: drugi prolaz nije no-op`);
    }
  }, numRuns);
}

/** Vidljivi tekst odlomaka (tijelo i fusnote) isti prije i poslije popravka. */
export function visibleTextProperty(repair: RepairFn, numRuns?: number): Promise<PropertyOutcome> {
  return runProperty(async (m, deep) => {
    const before = await xmlParts(await packModel(m));
    const after = await xmlParts(await repair(await packModel(m), deep));
    for (const name of Object.keys(before)) {
      const b = JSON.stringify(visibleParagraphs(before[name]));
      const a = JSON.stringify(visibleParagraphs(after[name] ?? ''));
      if (a !== b) throw new Error(`${name}: vidljivi tekst promijenjen ${b} -> ${a}`);
    }
  }, numRuns);
}

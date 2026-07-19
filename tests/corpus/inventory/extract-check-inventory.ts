/**
 * Lekta Error Corpus - INVENTAR PROVJERA (faza 1, LEKTA_ERROR_CORPUS_MASTER_PROMPT.md).
 *
 * Izvor istine za "sto Lekta trenutno moze detektirati" je STVARNI KOD, ne ovaj prompt.
 * Zato inventar gradimo hibridno, iz dva neovisna izvora koje spajamo:
 *
 *  1) STATICKI: skeniramo izvorne datoteke koje emitiraju provjere (makeCheck) i nalaze
 *     (issue). Daje lokaciju u kodu (datoteka:redak) i literalne naslove; hvata i grane
 *     koje se u runtimeu nisu okinule. Dinamicki naslovi (template/ternar) ostaju kao
 *     obrazac jer se iz statike ne mogu pouzdano razrijesiti.
 *  2) RUNTIME: pokrenemo PRAVI analyzeDocx nad reprezentativnim skupom profila i nad
 *     "kitchen-sink" uskladjenim/neuskladjenim dokumentom. Daje RAZRIJESENE naslove
 *     (ukljucujuci dinamicke), stvarne statuse i je li provjera bodovana (max>0).
 *
 * Intake kodovi se RUNTIME-dokazuju: sagradimo nedvosmisleno lose ulaze i pustimo ih
 * kroz inspectDocxIntake (nije nagadjanje iz union tipa). COMPILED_CHECK_IDS se uvoze
 * izravno. Profili se broje iz registra.
 *
 * Cist modul bez fs-zapisa: `buildInventory()` vraca objekt, CLI (tests/corpus/cli/inventory.ts)
 * ga serijalizira. NE mijenja engine ni parser (CLAUDE.md); samo ga promatra.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { installXmlDomParser } from '../../../src/docx/xml-dom-install';
import { analyzeDocx } from '../../../src/analysis/analyze-docx';
import { resolveProfile } from '../../../src/analysis/golden-entry';
import { VERIFIED_PROFILE_REGISTRY } from '../../../src/profiles/profile-registry';
import { COMPILED_CHECK_IDS } from '../../../src/profiles/rule-compiler';
import { inspectDocxIntake, type IntakeRejectCode } from '../../../src/docx/intake-gate';
import { buildDocxFile, zipStore, type ParaSpec, type DocSpec } from '../../helpers/docx-builder';

installXmlDomParser(true); // analyzeDocx trazi globalni DOMParser (@xmldom/xmldom), kao Web Worker.

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../../..');

// --- Tipovi inventara -----------------------------------------------------------------------

export interface CheckSource {
  file: string;
  line: number;
  /** 'emitter' = stvarni analizator; 'demo' = uzorak-izvjestaj u UI-ju (src/ui/app.ts), NIJE detekcija. */
  provenance: 'emitter' | 'demo';
  titleLiteral: string | null; // null kad je naslov dinamican (template/ternar)
}

export interface CheckInventoryEntry {
  /** Kanonski naslov (runtime razrijesen kad postoji, inace staticki literal ili obrazac). */
  title: string;
  category: string;
  /** true kad je ikad vidjen bodovan (max>0); false kad je uvijek informativan; 'dynamic' kad ovisi o profilu. */
  scored: boolean | 'dynamic';
  statuses: string[]; // runtime vidjeni statusi (pass/warn/fail...)
  observedAtRuntime: boolean;
  sources: CheckSource[]; // lokacije u kodu (moze biti prazno ako je samo runtime)
  exampleDetail: string | null;
}

export interface IssueInventoryEntry {
  title: string;
  category: string;
  severities: string[];
  observedAtRuntime: boolean;
  sources: CheckSource[];
}

export interface IntakeCodeEntry {
  code: IntakeRejectCode | 'suspicious';
  proven: boolean; // dokazan runtime pokretanjem inspectDocxIntake
  message: string | null;
}

export interface Inventory {
  meta: {
    note: string;
    runtimeProfileSample: string[];
    scannedSourceFiles: string[];
    /** Emitteri s dinamicnim naslovom (template/ternar) koje runtime razrjesava; lokacija radi transparentnosti. */
    dynamicEmitters: Array<{ file: string; line: number }>;
  };
  counts: {
    checks: number;
    scoredChecks: number;
    informativeChecks: number;
    dynamicScoredChecks: number;
    uniqueIssueTitles: number;
    intakeRejectCodes: number;
    compiledCheckIds: number;
    profiles: number;
    checksWithoutSource: number; // runtime-only (dinamicki naslov bez staticke lokacije)
    checksWithStableId: number; // faza 1: jos nijedan (stabilni ID dolazi u fazi 2)
  };
  checks: CheckInventoryEntry[];
  issues: IssueInventoryEntry[];
  intakeCodes: IntakeCodeEntry[];
  compiledCheckIds: string[];
  scoredDimensions: string[]; // konformansne dimenzije koje profili aktiviraju
  profileMatrix: ProfileMatrixRow[];
}

export interface ProfileMatrixRow {
  profileId: string;
  unitId: string | null;
  status: string | null;
  workType: string | null;
  dims: Record<string, 0 | 1>;
}

// --- Staticki skener poziva ------------------------------------------------------------------

interface ScannedCall {
  args: string[];
  line: number;
}

/**
 * Nadji sve pozive `fnName(` na vrhu izraza i vrati sirove argumente svakog poziva.
 * Preskace stringove ('...', "...", `...`) i template interpolacije `${...}` kod brojanja
 * dubine zagrada, pa `Format stranice (${x})` ne razbija parsiranje. Vraca argumente
 * odvojene top-level zarezima do zatvarajuce zagrade poziva.
 */
function scanCalls(src: string, fnName: string): ScannedCall[] {
  const out: ScannedCall[] = [];
  const needle = fnName + '(';
  let i = 0;
  while ((i = src.indexOf(needle, i)) !== -1) {
    const prev = src[i - 1];
    if (prev && /[A-Za-z0-9_$.]/.test(prev)) { i += needle.length; continue; } // dio veceg identifikatora / .issue(
    const argsStart = i + needle.length;
    const parsed = readTopLevelArgs(src, argsStart);
    if (parsed) {
      out.push({ args: parsed.args, line: src.slice(0, i).split('\n').length });
    }
    i = argsStart;
  }
  return out;
}

/** Cita argumente od pozicije odmah nakon '(' do uravnotezene ')'. Robustno na stringove i template. */
function readTopLevelArgs(src: string, start: number): { args: string[] } | null {
  const args: string[] = [];
  let depth = 0; // () [] {} dubina
  let cur = '';
  // stog stringovnih konteksta: "'" | '"' | '`'; unutar `${}` pushamo pseudo-kontekst '}' preko deptha
  let str: '"' | "'" | '`' | null = null;
  const templateExprDepth: number[] = []; // dubine na kojima je zapoceo ${ unutar template-a
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if (str) {
      cur += c;
      if (c === '\\') { if (i + 1 < src.length) { cur += src[++i]; } continue; }
      if (str === '`' && c === '$' && src[i + 1] === '{') { cur += '{'; i++; templateExprDepth.push(depth); depth++; str = null; continue; }
      if (c === str) str = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { str = c; cur += c; continue; }
    if (c === '(' || c === '[' || c === '{') { depth++; cur += c; continue; }
    if (c === ')' || c === ']' || c === '}') {
      if (c === '}' && templateExprDepth.length && templateExprDepth[templateExprDepth.length - 1] === depth - 1) {
        // zatvaranje ${...} -> natrag u template string
        templateExprDepth.pop(); depth--; cur += '}'; str = '`'; continue;
      }
      if (c === ')' && depth === 0) { if (cur.trim().length) args.push(cur.trim()); return { args }; }
      depth--; cur += c; continue;
    }
    if (c === ',' && depth === 0) { args.push(cur.trim()); cur = ''; continue; }
    cur += c;
  }
  return null; // nije nadjena zatvarajuca zagrada (ne bi se smjelo dogoditi na validnom kodu)
}

/** Ako je raw argument cisti string literal ('x' / "x" / `x` bez ${}), vrati vrijednost, inace null. */
function literalString(raw: string | undefined): string | null {
  if (!raw) return null;
  const t = raw.trim();
  if ((t.startsWith("'") && t.endsWith("'")) || (t.startsWith('"') && t.endsWith('"'))) {
    return t.slice(1, -1).replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }
  if (t.startsWith('`') && t.endsWith('`') && !t.includes('${')) return t.slice(1, -1);
  return null;
}

const SCAN_TARGETS: Array<{ file: string; provenance: 'emitter' | 'demo' }> = [
  { file: 'src/analysis/analyze-docx.ts', provenance: 'emitter' },
  { file: 'src/audits/structure.ts', provenance: 'emitter' },
  { file: 'src/citations/legal-citation.ts', provenance: 'emitter' },
  { file: 'src/ui/app.ts', provenance: 'demo' }, // makeCheck ovdje su UZORCI izvjestaja, ne detekcija
];

interface StaticCheck { titleLiteral: string | null; category: string | null; file: string; line: number; provenance: 'emitter' | 'demo'; }
interface StaticIssue { titleLiteral: string | null; category: string | null; severity: string | null; file: string; line: number; provenance: 'emitter' | 'demo'; }

function staticScan(): { checks: StaticCheck[]; issues: StaticIssue[]; files: string[] } {
  const checks: StaticCheck[] = [];
  const issues: StaticIssue[] = [];
  const files: string[] = [];
  for (const target of SCAN_TARGETS) {
    let src: string;
    try { src = readFileSync(resolve(REPO, target.file), 'utf8'); } catch { continue; }
    files.push(target.file);
    for (const call of scanCalls(src, 'makeCheck')) {
      checks.push({
        category: literalString(call.args[0]),
        titleLiteral: literalString(call.args[1]),
        file: target.file, line: call.line, provenance: target.provenance,
      });
    }
    for (const call of scanCalls(src, 'issue')) {
      // issue(severity, category, title, detail, where)
      issues.push({
        severity: literalString(call.args[0]),
        category: literalString(call.args[1]),
        titleLiteral: literalString(call.args[2]),
        file: target.file, line: call.line, provenance: target.provenance,
      });
    }
  }
  return { checks, issues, files };
}

// --- Runtime: kitchen-sink dokumenti ---------------------------------------------------------

const TNR = 'Times New Roman';
const SENTENCE = 'Ovo je rečenica akademskog teksta koja nosi smislen sadržaj rada. ';
const body = (n: number, f = TNR, sz = 12, jc: ParaSpec['jc'] = 'both'): ParaSpec[] => {
  const out: ParaSpec[] = [];
  for (let c = 0; c < n; c += 60) out.push({ text: SENTENCE.repeat(6), font: f, sizePt: sz, jc, spacing15: true });
  return out;
};
const H = (text: string, f = TNR): ParaSpec => ({ text, font: f, sizePt: 12, styleId: 'Heading1' });

const PAGE_FIELD: ParaSpec = {
  text: '',
  raw: '<w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>',
};
const TABLE_RAW: ParaSpec = {
  text: '',
  raw: '<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/></w:tblPr><w:tblGrid><w:gridCol w:w="4000"/><w:gridCol w:w="4000"/></w:tblGrid>' +
    '<w:tr><w:tc><w:tcPr><w:tcW w:w="4000" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>Stupac A</w:t></w:r></w:p></w:tc>' +
    '<w:tc><w:tcPr><w:tcW w:w="4000" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>Stupac B</w:t></w:r></w:p></w:tc></w:tr></w:tbl>',
};
const IMAGE_RAW: ParaSpec = {
  text: '',
  raw: '<w:p><w:r><w:drawing><wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><wp:extent cx="3000000" cy="2000000"/></wp:inline></w:drawing></w:r></w:p>',
};

/** Uskladjen dokument bogat elementima: cilj je okinuti sto vise razlicitih provjera. */
function compliantSpec(): DocSpec {
  const paras: ParaSpec[] = [
    { text: 'Sveučilište u Zagrebu', font: TNR, sizePt: 12, jc: 'center' },
    { text: 'Fakultet političkih znanosti', font: TNR, sizePt: 12, jc: 'center' },
    { text: 'Analiza medijske pismenosti mladih', font: TNR, sizePt: 16, bold: true, jc: 'center' },
    { text: 'Diplomski rad', font: TNR, sizePt: 12, jc: 'center' },
    { text: 'Student: I. H.', font: TNR, sizePt: 12, jc: 'center' },
    { text: 'Mentor: prof. dr. sc. A. K.', font: TNR, sizePt: 12, jc: 'center' },
    { text: 'Zagreb, 2024.', font: TNR, sizePt: 12, jc: 'center', raw: undefined },
    H('Sažetak'),
    { text: 'Sažetak rada u jednom odlomku s ključnim spoznajama istraživanja o temi.', font: TNR, sizePt: 12, jc: 'both' },
    { text: 'Ključne riječi: analiza, metoda, istraživanje, rezultat', font: TNR, sizePt: 12 },
    H('Abstract'),
    { text: 'This abstract summarises the key findings of the study in a single paragraph.', font: TNR, sizePt: 12, jc: 'both' },
    { text: 'Keywords: analysis, method, research, result', font: TNR, sizePt: 12 },
    H('Sadržaj'),
    PAGE_FIELD,
    { text: 'Uvod\t1', font: TNR, sizePt: 12 },
    { text: 'Razrada\t3', font: TNR, sizePt: 12 },
    { text: 'Zaključak\t9', font: TNR, sizePt: 12 },
    H('Popis tablica'),
    { text: 'Tablica 1. Prikaz podataka\t4', font: TNR, sizePt: 12 },
    H('Popis slika'),
    { text: 'Slika 1. Dijagram toka\t5', font: TNR, sizePt: 12 },
    H('1. Uvod'),
    ...body(600),
    { text: 'Kako navodi jedan autor (Kovač, 2020), medijska pismenost raste. Prema drugom izvoru "pismenost je ključna" (Horvat, 2019, str. 12).', font: TNR, sizePt: 12, jc: 'both' },
    H('2. Razrada'),
    ...body(1400),
    TABLE_RAW,
    { text: 'Tablica 1. Prikaz podataka istraživanja', font: TNR, sizePt: 12 },
    { text: 'Izvor: autor prema anketi (2020).', font: TNR, sizePt: 12 },
    IMAGE_RAW,
    { text: 'Slika 1. Dijagram toka procesa', font: TNR, sizePt: 12 },
    { text: 'Izvor: autor.', font: TNR, sizePt: 12 },
    H('3. Zaključak'),
    ...body(600),
    H('Literatura'),
    { text: 'Horvat, I. (2019). Digitalne kompetencije mladih. Rijeka: Izdavač.', font: TNR, sizePt: 12 },
    { text: 'Kovač, A. (2020). Medijska pismenost. Zagreb: Naklada.', font: TNR, sizePt: 12 },
    { text: 'Ministarstvo (2021). Izvješće. Dostupno na: https://www.primjer.hr/izvjesce (pristupljeno 1. 5. 2022.).', font: TNR, sizePt: 12 },
  ];
  return {
    paragraphs: paras,
    marginsCm: { top: 2.5, right: 2.5, bottom: 2.5, left: 2.5 },
    footnotes: ['Usp. čl. 3. Zakona o radu, NN 93/14.', 'Ibid., str. 12.', 'Vidjeti šire Kovač, A. (2020). Medijska pismenost. Zagreb: Naklada, str. 40.'],
  };
}

/** Neuskladjen dokument: kriv font/velicina/prored/margine/format, bez strukture, s losim citatima/elementima. */
function violatingSpec(): DocSpec {
  const paras: ParaSpec[] = [
    { text: 'Nasumičan naslov rada bez strukture.', font: 'Arial', sizePt: 14, jc: 'left' },
    ...Array.from({ length: 6 }, () => ({ text: 'Nasumičan odlomak bez akademske strukture, oznaka ni dijelova rada. Poveznica www.primjer.hr/stranica u tekstu.', font: 'Arial', sizePt: 14, jc: 'left' as const })),
    { text: 'Tablica 1. Prva', font: 'Arial', sizePt: 14 },
    { text: 'Tablica 3. Treca (preskocen broj 2)', font: 'Arial', sizePt: 14 },
    { text: 'Neki tekst koji spominje (Kovač, 2021) ali literatura ima drugu godinu.', font: 'Arial', sizePt: 14 },
    { text: 'Literatura', font: 'Arial', sizePt: 14, styleId: 'Heading1' },
    { text: 'Kovač, A. (2020). Medijska pismenost. Zagreb: Naklada.', font: 'Arial', sizePt: 14 },
    { text: 'Babić. Komunikologija bez godine izdanja.', font: 'Arial', sizePt: 14 },
  ];
  return { paragraphs: paras, pageCm: { w: 14.8, h: 21.0 }, marginsCm: { top: 4, right: 4, bottom: 4, left: 4 } };
}

const SETTINGS_BASE = {
  citationStyle: 'fpzg', language: 'hr', strictness: 'standard', methodology: 'auto', selectionIds: {},
};

async function analyzeWith(profileId: string, spec: DocSpec, name: string): Promise<any> {
  const profile = resolveProfile(profileId);
  const settings = {
    ...SETTINGS_BASE,
    profileId,
    workType: profile.selection?.workType || 'final',
    language: profile.documentLanguage || 'hr',
  };
  return analyzeDocx(buildDocxFile(spec, name), profile, settings, () => {});
}

// --- Reprezentativni profili i konformansne dimenzije ----------------------------------------

const DIM_KEYS = ['font', 'size', 'spacing', 'margins', 'paper', 'justify', 'toc', 'pagenums', 'sections', 'words', 'struktura', 'fusnote'] as const;
type DimKey = (typeof DIM_KEYS)[number];

/** Bodovane dimenzije koje profil aktivira (zrcali conformance.ts add(...) uvjete). */
function scoredDims(p: any): Set<DimKey> {
  const d = new Set<DimKey>();
  if (p.checkFont !== false) d.add('font');
  if (p.checkSize !== false) d.add('size');
  if (p.checkSpacing !== false) d.add('spacing');
  if (p.checkMargins !== false) d.add('margins');
  if (p.paperSizes?.length || p.requireA4) d.add('paper');
  if (p.justify && p.checkJustify !== false) d.add('justify');
  if (p.requireToc) d.add('toc');
  if (p.requirePageNumbers) d.add('pagenums');
  if (Array.isArray(p.requiredSections) && p.requiredSections.length) d.add('sections');
  if (p.wordMin || p.wordMax) d.add('words');
  if (p.scoreStructure !== false) d.add('struktura');
  if (p.legalFootnoteProfile) d.add('fusnote');
  return d;
}

/** Razrijesi sve profile jednom (cache) za matricu i izbor reprezentativnog uzorka. */
function resolveAllProfiles(): Array<{ id: string; unitId: string | null; status: string | null; workType: string | null; resolved: any }> {
  const out: Array<{ id: string; unitId: string | null; status: string | null; workType: string | null; resolved: any }> = [];
  for (const entry of VERIFIED_PROFILE_REGISTRY as unknown as Array<{ id: string; unitId?: string; status?: string; workTypes?: string[] }>) {
    let resolved: any = null;
    try { resolved = resolveProfile(entry.id); } catch { resolved = null; }
    out.push({
      id: entry.id,
      unitId: entry.unitId ?? null,
      status: entry.status ?? null,
      workType: (entry.workTypes || [])[0] ?? null,
      resolved,
    });
  }
  return out;
}

/**
 * Izaberi kompaktan ali reprezentativan uzorak profila za runtime analizu: po jedan profil za
 * svaki razliciti "potpis" (skup bodovanih dimenzija + ima li paperSizes/legal/social-work/manualChecks).
 * Time svaki oblik profila udje u runtime bar jednom, a broj analiza ostaje malen.
 */
function pickRuntimeSample(all: ReturnType<typeof resolveAllProfiles>, limit?: number): string[] {
  const seen = new Set<string>();
  const picked: string[] = [];
  for (const p of all) {
    if (!p.resolved) continue;
    const r = p.resolved;
    const sig = [
      [...scoredDims(r)].sort().join(','),
      r.paperSizes?.length ? 'ps' : '',
      r.legalFootnoteProfile ? 'legal' : '',
      r.titlePageTypography === 'social-work' ? 'sw' : '',
      Array.isArray(r.manualChecks) && r.manualChecks.length ? 'mc' : '',
      r.documentLanguage === 'en' ? 'en' : '',
    ].join('|');
    if (seen.has(sig)) continue;
    seen.add(sig);
    picked.push(p.id);
    if (limit && picked.length >= limit) break;
  }
  return picked;
}

// --- Intake kodovi (runtime dokaz) -----------------------------------------------------------

function file(bytes: Uint8Array, name: string): File {
  return new File([bytes], name, { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}
function pkBytes(n: number, magic = true): Uint8Array {
  const b = new Uint8Array(n);
  if (magic) { b[0] = 0x50; b[1] = 0x4b; b[2] = 0x03; b[3] = 0x04; }
  for (let i = 4; i < n; i++) b[i] = 0x41; // 'A' punjenje
  return b;
}

/** Dokazi svaki intake reject kod pokretanjem inspectDocxIntake nad namjerno losim ulazom. */
async function proveIntakeCodes(): Promise<IntakeCodeEntry[]> {
  const enc = new TextEncoder();
  const out: IntakeCodeEntry[] = [];
  const record = async (label: IntakeRejectCode | 'suspicious', f: File, wantSuspicious = false) => {
    const v = await inspectDocxIntake(f);
    if (wantSuspicious) {
      out.push({ code: 'suspicious', proven: v.kind === 'ok' && v.suspicious === true, message: v.kind === 'ok' ? v.suspicionReason : null });
    } else {
      out.push({ code: label, proven: v.kind === 'reject' && v.code === label, message: v.kind === 'reject' ? v.message : null });
    }
  };

  // too-small: ispod MIN_DOCX_BYTES
  await record('too-small', file(pkBytes(100), 'tiny.docx'));
  // not-zip: dovoljno velik, ali bez PK potpisa
  await record('not-zip', file(pkBytes(5000, false), 'notzip.docx'));
  // corrupt: PK potpis ali neispravan ZIP
  await record('corrupt', file(pkBytes(6000, true), 'corrupt.docx'));
  // macros: valjan zip s vbaProject.bin
  {
    const bomb = zipStore([
      { name: '[Content_Types].xml', data: enc.encode('<?xml version="1.0"?><Types/>') },
      { name: 'word/document.xml', data: enc.encode('<?xml version="1.0"?><w:document xmlns:w="x"><w:body><w:p><w:r><w:t>tekst dovoljne duljine za punu velicinu</w:t></w:r></w:p></w:body></w:document>') },
      { name: 'word/vbaProject.bin', data: enc.encode('X'.repeat(4096)) },
    ]);
    await record('macros', file(bomb, 'macros.docx'));
  }
  // no-document: zip bez word/document.xml
  {
    const z = zipStore([
      { name: '[Content_Types].xml', data: enc.encode('<?xml version="1.0"?><Types/>') },
      { name: '_rels/.rels', data: enc.encode('X'.repeat(5000)) },
    ]);
    await record('no-document', file(z, 'nodoc.docx'));
  }
  // Filler zapis: gura velicinu datoteke iznad MIN_DOCX_BYTES (4 KB) a da ne dira document.xml
  // (empty/suspicious inace padnu na 'too-small' prije nego se logika uopce provjeri).
  const filler = { name: 'word/media/filler.bin', data: new Uint8Array(6000) };
  // empty: valjan docx bez teksta (<10 alnum), dovoljno velik
  {
    const empties: ParaSpec[] = Array.from({ length: 200 }, () => ({ text: '', empty: true as const }));
    await record('empty', buildDocxFile({ paragraphs: empties }, 'empty.docx', [filler]));
  }
  // suspicious: app.xml Words < SUSPICIOUS_WORDS_MAX
  {
    const app = enc.encode('<?xml version="1.0"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Words>42</Words></Properties>');
    const f = buildDocxFile({ paragraphs: [{ text: 'Kratak dokument s tekstom.', font: TNR, sizePt: 12 }] }, 'susp.docx', [{ name: 'docProps/app.xml', data: app }, filler]);
    await record('suspicious', f, true);
  }
  return out;
}

// --- Glavna gradnja --------------------------------------------------------------------------

export async function buildInventory(opts: { sampleLimit?: number } = {}): Promise<Inventory> {
  const staticRes = staticScan();
  const all = resolveAllProfiles();
  const sample = pickRuntimeSample(all, opts.sampleLimit);

  // Runtime: analiziraj kitchen-sink par nad svakim uzorkovanim profilom.
  const runtimeChecks = new Map<string, CheckInventoryEntry>(); // key = category::title
  const runtimeIssues = new Map<string, IssueInventoryEntry>();
  const ckey = (cat: string, title: string) => `${cat}::${title}`;

  const ingest = (r: any) => {
    for (const c of r?.checks ?? []) {
      const title = String(c.title ?? '');
      const cat = String(c.category ?? '');
      if (!title) continue;
      const k = ckey(cat, title);
      const e = runtimeChecks.get(k) ?? { title, category: cat, scored: false as boolean | 'dynamic', statuses: [], observedAtRuntime: true, sources: [], exampleDetail: null };
      if (c.status && !e.statuses.includes(String(c.status))) e.statuses.push(String(c.status));
      const isScored = typeof c.max === 'number' && c.max > 0;
      if (isScored && e.scored === false) e.scored = true;
      if (!e.exampleDetail && c.detail) e.exampleDetail = String(c.detail).slice(0, 160);
      runtimeChecks.set(k, e);
    }
    for (const iss of r?.issues ?? []) {
      const title = String(iss.title ?? '');
      const cat = String(iss.category ?? '');
      if (!title) continue;
      const k = ckey(cat, title);
      const e = runtimeIssues.get(k) ?? { title, category: cat, severities: [], observedAtRuntime: true, sources: [] };
      if (iss.severity && !e.severities.includes(String(iss.severity))) e.severities.push(String(iss.severity));
      runtimeIssues.set(k, e);
    }
  };

  const compliant = compliantSpec();
  const violating = violatingSpec();
  for (const id of sample) {
    try { ingest(await analyzeWith(id, compliant, `${id}-ok.docx`)); } catch { /* profil-specifican problem ne smije srusiti inventar */ }
    try { ingest(await analyzeWith(id, violating, `${id}-bad.docx`)); } catch { /* isto */ }
  }

  // Spoji staticke lokacije na runtime naslove; dodaj staticke-only unose (dinamicki/neokinuti).
  const byTitle = new Map<string, CheckInventoryEntry>();
  for (const e of runtimeChecks.values()) byTitle.set(e.title, e);

  // Spoji staticke lokacije. Emitter s DINAMICNIM naslovom (template/ternar) ne moze se pouzdano
  // vezati po naslovu; takve biljezimo u meta.dynamicEmitters (transparentnost), a NE kao lazne
  // provjere (inace bi se "Format stranice (A4)" brojao dvaput: runtime + placeholder).
  const dynamicEmitters: Array<{ file: string; line: number }> = [];
  for (const s of staticRes.checks) {
    if (s.provenance === 'demo') continue; // demo (uzorci izvjestaja u UI-ju) se ne broji kao detekcija
    if (s.titleLiteral && byTitle.has(s.titleLiteral)) {
      const e = byTitle.get(s.titleLiteral)!;
      if (!e.sources.some((x) => x.file === s.file && x.line === s.line)) {
        e.sources.push({ file: s.file, line: s.line, provenance: s.provenance, titleLiteral: s.titleLiteral });
      }
    } else if (s.titleLiteral) {
      // staticki literal koji runtime nije okinuo -> neokinuti unos (bodovanje nepoznato)
      byTitle.set(s.titleLiteral, {
        title: s.titleLiteral, category: s.category ?? '(nepoznato)', scored: 'dynamic', statuses: [],
        observedAtRuntime: false, sources: [{ file: s.file, line: s.line, provenance: s.provenance, titleLiteral: s.titleLiteral }], exampleDetail: null,
      });
    } else {
      dynamicEmitters.push({ file: s.file, line: s.line });
    }
  }

  const checks = [...byTitle.values()].sort((a, b) => a.category.localeCompare(b.category) || a.title.localeCompare(b.title));

  // Issues: runtime + staticki literali.
  const issuesByKey = new Map<string, IssueInventoryEntry>();
  for (const e of runtimeIssues.values()) issuesByKey.set(`${e.category}::${e.title}`, e);
  for (const s of staticRes.issues) {
    if (!s.titleLiteral) continue;
    const k = `${s.category ?? ''}::${s.titleLiteral}`;
    const e = issuesByKey.get(k) ?? issuesByKey.get(`${s.category}::${s.titleLiteral}`);
    if (e) {
      if (!e.sources.some((x) => x.file === s.file && x.line === s.line)) e.sources.push({ file: s.file, line: s.line, provenance: s.provenance, titleLiteral: s.titleLiteral });
    } else {
      issuesByKey.set(k, {
        title: s.titleLiteral, category: s.category ?? '(nepoznato)', severities: s.severity ? [s.severity] : [],
        observedAtRuntime: false, sources: [{ file: s.file, line: s.line, provenance: s.provenance, titleLiteral: s.titleLiteral }],
      });
    }
  }
  const issues = [...issuesByKey.values()].sort((a, b) => a.category.localeCompare(b.category) || a.title.localeCompare(b.title));

  const intakeCodes = await proveIntakeCodes();

  // Profilna matrica (sve profile, jeftino - bez analize).
  const profileMatrix: ProfileMatrixRow[] = all.map((p) => {
    const dims: Record<string, 0 | 1> = {};
    const set = p.resolved ? scoredDims(p.resolved) : new Set<DimKey>();
    for (const k of DIM_KEYS) dims[k] = set.has(k) ? 1 : 0;
    return { profileId: p.id, unitId: p.unitId, status: p.status, workType: p.workType, dims };
  });

  const scoredChecks = checks.filter((c) => c.scored === true).length;
  const informativeChecks = checks.filter((c) => c.scored === false).length;
  const dynamicScoredChecks = checks.filter((c) => c.scored === 'dynamic').length;

  return {
    meta: {
      note: 'Hibridni inventar: STATICKI (makeCheck/issue izvor) UNIJA RUNTIME (analyzeDocx nad reprezentativnim profilima). Intake kodovi runtime-dokazani. Nije izvor pravila (CLAUDE.md).',
      runtimeProfileSample: sample,
      scannedSourceFiles: staticRes.files,
      dynamicEmitters,
    },
    counts: {
      checks: checks.length,
      scoredChecks,
      informativeChecks,
      dynamicScoredChecks,
      uniqueIssueTitles: new Set(issues.map((i) => i.title)).size,
      intakeRejectCodes: intakeCodes.filter((c) => c.code !== 'suspicious').length,
      compiledCheckIds: COMPILED_CHECK_IDS.length,
      profiles: VERIFIED_PROFILE_REGISTRY.length,
      checksWithoutSource: checks.filter((c) => c.sources.length === 0).length,
      checksWithStableId: 0,
    },
    checks,
    issues,
    intakeCodes,
    compiledCheckIds: [...COMPILED_CHECK_IDS],
    scoredDimensions: [...DIM_KEYS],
    profileMatrix,
  };
}

// --- Renderi --------------------------------------------------------------------------------

export function renderMarkdown(inv: Inventory): string {
  const L: string[] = [];
  L.push('# Lekta - inventar provjera (auto-generirano)', '');
  L.push('> Izvor istine je KOD, ne prompt. Hibridno: staticki (makeCheck/issue) + runtime (analyzeDocx).', '');
  L.push(inv.meta.note, '');
  L.push('## Brojke', '');
  L.push(`- Provjere ukupno: **${inv.counts.checks}** (bodovane ${inv.counts.scoredChecks}, informativne ${inv.counts.informativeChecks}, dinamicne/neokinute ${inv.counts.dynamicScoredChecks})`);
  L.push(`- Jedinstveni naslovi nalaza (issue): **${inv.counts.uniqueIssueTitles}**`);
  L.push(`- Intake reject kodovi: **${inv.counts.intakeRejectCodes}** (+ suspicious signal)`);
  L.push(`- COMPILED_CHECK_IDS: **${inv.counts.compiledCheckIds}**`);
  L.push(`- Profili u registru: **${inv.counts.profiles}**`);
  L.push(`- Provjere bez stabilnog ID-a (faza 1): **${inv.counts.checks}** (svi; ID dolazi u fazi 2)`);
  L.push('');
  L.push('## Provjere', '');
  L.push('| Kategorija | Naslov | Bodovano | Statusi | Izvor(i) |');
  L.push('|---|---|---|---|---|');
  for (const c of inv.checks) {
    const scored = c.scored === true ? 'da' : c.scored === false ? 'info' : 'dinamično';
    const src = c.sources.map((s) => `${s.file}:${s.line}`).join(', ') || (c.observedAtRuntime ? '(samo runtime)' : '-');
    L.push(`| ${c.category} | ${c.title.replace(/\|/g, '\\|')} | ${scored} | ${c.statuses.join('/') || '-'} | ${src} |`);
  }
  L.push('');
  L.push('## Intake kodovi (runtime-dokazani)', '');
  L.push('| Kod | Dokazan | Poruka |');
  L.push('|---|---|---|');
  for (const c of inv.intakeCodes) L.push(`| ${c.code} | ${c.proven ? 'da' : 'NE'} | ${(c.message || '').replace(/\|/g, '\\|').slice(0, 80)} |`);
  L.push('');
  L.push('## COMPILED_CHECK_IDS', '');
  L.push(inv.compiledCheckIds.map((x) => `\`${x}\``).join(', '), '');
  L.push('## Nalazi (issue naslovi)', '');
  L.push('| Kategorija | Naslov | Severity | Izvor(i) |');
  L.push('|---|---|---|---|');
  for (const i of inv.issues) {
    const src = i.sources.map((s) => `${s.file}:${s.line}`).join(', ') || '(samo runtime)';
    L.push(`| ${i.category} | ${i.title.replace(/\|/g, '\\|')} | ${i.severities.join('/') || '-'} | ${src} |`);
  }
  L.push('');
  return L.join('\n');
}

export function renderMatrixCsv(inv: Inventory): string {
  const header = ['profileId', 'unitId', 'status', 'workType', ...inv.scoredDimensions];
  const rows = [header.join(',')];
  for (const r of inv.profileMatrix) {
    rows.push([r.profileId, r.unitId ?? '', r.status ?? '', r.workType ?? '', ...inv.scoredDimensions.map((d) => String(r.dims[d] ?? 0))].join(','));
  }
  return rows.join('\n') + '\n';
}

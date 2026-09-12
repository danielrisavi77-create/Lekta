/**
 * ZAJEDNICKI IZLAZNI SLOJ generatora: naslovnica, sidecar i provjera tvrdnji o oblicima.
 *
 * Dijele ga LibreOffice trak (`generate.mts`) i Word trak (`generate-word.mts`). Bez ovog izdvajanja
 * bi svaki alat imao vlastitu naslovnicu i vlastiti sidecar, pa bi se razlika medju trakama citala
 * kao razlika medju ALATIMA, a bila bi razlika medju nasim dvjema izvedbama. Isti razred kao mjerenje
 * koje su dva alata radila "svako na svoj nacin".
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { detectShapes, presentShapes, verifyShapeClaims, type DocxShapeCounts } from '../../src/corpus/docx-shapes';
import { readZip } from '../../src/repair/zip-codec';
import { wordCount, type ProseBody } from '../../src/corpus/prose-schema';
import { TITLE_PAGE_TEMPLATES, resolveTemplate, ensureTemplatesHeavy } from '../../src/title-pages/template-loader';
import { shapeForMutation, verifyOutputProofs } from './mutations.mts';
import type { CorpusRow } from './rows.mts';

/** Natpis vrste rada; koristi se samo kad ga proza nije zadala. */
const NATPIS_PO_VRSTI: Record<string, string> = {
  seminar: 'SEMINARSKI RAD',
  final: 'ZAVRŠNI RAD',
  graduate: 'DIPLOMSKI RAD',
  specialist: 'SPECIJALISTIČKI RAD',
  doctoral: 'DOKTORSKI RAD',
  article: 'ZNANSTVENI ČLANAK',
  project: 'PROJEKTNI RAD',
};

/**
 * Redci naslovnice iz LEKTINA predloska.
 *
 * Naslovnica je jedina fakultetska dimenzija koju proza ne nosi, i jedina po kojoj se vecina redaka
 * uopce razlikuje: izmjereno 2026-09-06, 720 redaka daje samo 163 razlicita skupa pravila tijela.
 * Uzima se po ULOGAMA koje predlozak propisuje, ne po nasem redoslijedu.
 */
export async function titleLinesFor(
  row: CorpusRow,
  body: ProseBody,
): Promise<{ lines: string[]; templateId: string | null }> {
  await ensureTemplatesHeavy();
  const t = resolveTemplate(TITLE_PAGE_TEMPLATES, row.unitId, row.workType as never) as
    | { id: string; elements?: Array<{ role: string; fixedText?: string; uppercase?: boolean }> }
    | null;
  const vrijednost: Record<string, string> = {
    university: 'Sveučilište u Zagrebu',
    faculty: row.unitName,
    study: row.program,
    author: body.titlePage.author,
    title: body.titlePage.title,
    subtitle: '',
    worktype: body.titlePage.label || NATPIS_PO_VRSTI[row.workType] || 'RAD',
    mentor: `Mentor: ${body.titlePage.mentor}`,
    comentor: '',
    placeyear: 'Zagreb, 2026.',
  };
  if (!t?.elements?.length) {
    // Bez predloska se NE izmislja fakultetski raspored; uzima se neutralan minimum i to se biljezi.
    return {
      lines: [
        row.unitName,
        row.program,
        '',
        body.titlePage.author,
        '',
        body.titlePage.title,
        '',
        vrijednost.worktype,
        '',
        vrijednost.mentor,
        '',
        vrijednost.placeyear,
      ],
      templateId: null,
    };
  }
  const lines: string[] = [];
  for (const e of t.elements) {
    const v = e.fixedText ?? vrijednost[e.role] ?? '';
    if (!v) continue;
    lines.push(e.uppercase ? v.toUpperCase() : v);
    lines.push('');
  }
  return { lines, templateId: t.id };
}

export interface EmitInput {
  docxPath: string;
  row: CorpusRow;
  body: ProseBody;
  templateId: string | null;
  /** `libreoffice` ili `word`; nikad se ne pise alat koji dokument nije napravio. */
  tool: string;
  toolPath: string;
  command: string;
  /** Brojaci mutacija; prazno za usklađen primjerak. */
  counters: Record<string, number>;
  /** Mutacije koje na OVAJ dokument nisu primjenjive, uz razlog; nije isto sto i brojac 0. */
  notApplicable?: Record<string, string>;
  /** Trazi li profil sadrzaj; ulaz za popis ogranicenja alata. */
  requireToc: boolean;
}

export interface EmitResult {
  shapes: DocxShapeCounts;
  claimed: string[];
  /** Neispunjene tvrdnje i brojaci koje izlaz ne potvrdjuje; prazno znaci da je sve dokazano. */
  problems: string[];
  /** Sto alat NE MOZE, imenovano po osi. NIJE nalaz, ali se ne presucuje. */
  limitations: string[];
}

/**
 * Izmjeri oblike u gotovom paketu, provjeri tvrdnje i zapisi sidecar.
 *
 * Sidecar nosi DVA POJASA (`synthetic: true` i traka `authored`), jer jedan ne bi bio dovoljan:
 * `generated` je dopustena traka, pa bi dokument s nasom prozom, krivo oznacen, usao u `results`,
 * matricu pokrivenosti i ulaz ovjere.
 */
export async function emitSidecar(input: EmitInput): Promise<EmitResult> {
  const bytes = new Uint8Array(readFileSync(input.docxPath));
  const entries = await readZip(bytes);
  const shapes = detectShapes(entries);
  const claimed = presentShapes(shapes);
  const presuda = verifyShapeClaims(claimed, shapes, input.counters, shapeForMutation());

  // Dokazi forme se citaju iz istih bajtova, ne iz `DocSpec`-a: mutacija koja krsi bodovanu formu
  // nema katalogiziran oblik, a LibreOffice zna tiho odbaciti ono sto mu upises (ovaj katalog je taj
  // kvar vec platio dvaput na fontovima).
  const decoder = new TextDecoder();
  const parts: Record<string, string> = {};
  for (const e of entries) if (/\.(xml|rels)$/i.test(e.name)) parts[e.name] = decoder.decode(e.data);
  const dokaziForme = verifyOutputProofs(input.counters, parts);

  /**
   * Izmjereno 2026-09-06: `soffice --convert-to docx` ne pise TOC polje UOPCE (nula `w:instrText`,
   * `w:fldChar`, `w:fldSimple`); `text:table-of-content` postane staticni popis. Isto vrijedi za vec
   * commitanu fixturu `lo-fpzg-zavrsni-uskladjen.docx`, kojoj ime obecava vise nego sto nosi. Celija
   * koju alat ne pokriva je NEPOKRIVENA, nikad "prolazi"; Word to moze (`TablesOfContents.Add`).
   */
  const limitations: string[] = [];
  if (input.requireToc && shapes['toc/polje'] === 0) {
    limitations.push(
      `toc: ${input.tool} nije proizveo TOC polje (0 instrText/fldChar/fldSimple); os sadrzaja je ` +
        'NEPOKRIVENA ovim alatom',
    );
  }

  const sidecar = {
    profileId: input.row.routedProfileId,
    synthetic: true,
    track: 'authored',
    row: {
      id: input.row.id,
      unitId: input.row.unitId,
      workType: input.row.workType,
      level: input.row.level,
      program: input.row.program,
      variant: input.row.variant,
      fallbackFamily: input.row.fallbackFamily,
      titlePageTemplateId: input.templateId,
    },
    prose: { id: input.body.id, words: wordCount(input.body), authoring: input.body.authoring },
    provenance: {
      tool: input.tool,
      toolPath: input.toolPath,
      os: `${process.platform} ${process.arch}`,
      command: input.command,
      generatedAt: new Date().toISOString(),
    },
    mutations: input.counters,
    mutationsNotApplicable: input.notApplicable ?? {},
    shapes: { claimed },
    toolLimitations: limitations,
  };
  writeFileSync(input.docxPath.replace(/\.docx$/i, '.json'), JSON.stringify(sidecar, null, 2) + '\n', 'utf8');

  return {
    shapes,
    claimed,
    problems: [...presuda.missing, ...presuda.unknown, ...presuda.underDetected, ...dokaziForme],
    limitations,
  };
}

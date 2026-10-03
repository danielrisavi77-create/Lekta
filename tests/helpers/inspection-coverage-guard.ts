/**
 * Gard T64 census-a (inspectionCoverage), izdvojen da ga tests/inspection-coverage.test.ts i
 * tests/gate-mutations.test.ts vrte nad ISTOM funkcijom: stvarni census mora biti cist, a svaka
 * podmetnuta mutacija census-a mora dati barem jedan problem.
 *
 * Paketi su u memoriji (names + text), bez ZIP-a: gard mjeri census, ne ZipReader.
 */
import {
  INSPECTION_STRUCTURES,
  type InspectionCoverage,
  type InspectionPackage,
  type InspectionStructureKind,
} from '../../src/analysis/inspection-coverage';

export type InspectionCensus = (
  zip: InspectionPackage,
  details: Record<string, unknown> | null | undefined,
) => Promise<InspectionCoverage>;

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const R = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const PLAIN_BODY = `<w:document ${W}><w:body><w:p><w:r><w:t>Obican tekst</w:t></w:r></w:p></w:body></w:document>`;
/** Tijelo cija sekcija referencira zaglavlje (rIdH) i podnozje (rIdF), kao sto Word pise sectPr. */
const BODY_WITH_REFS =
  `<w:document ${W} ${R}><w:body><w:p><w:r><w:t>Obican tekst</w:t></w:r></w:p>` +
  '<w:sectPr><w:headerReference w:type="default" r:id="rIdH"/><w:footerReference w:type="default" r:id="rIdF"/></w:sectPr>' +
  '</w:body></w:document>';

export const REL_BASE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const RELS_PATH = 'word/_rels/document.xml.rels';

/** word/_rels/document.xml.rels iz parova [Id, kratki tip, Target]. */
export function documentRels(entries: ReadonlyArray<readonly [string, string, string]>): string {
  const body = entries
    .map(([id, type, target]) => `<Relationship Id="${id}" Type="${REL_BASE}/${type}" Target="${target}"/>`)
    .join('');
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${body}</Relationships>`
  );
}

export function memoryPackage(parts: Record<string, string>, failing: readonly string[] = []): InspectionPackage {
  return {
    names: () => Object.keys(parts),
    text: async (name: string) => {
      if (failing.includes(name)) throw new Error('simuliran kvar citanja dijela');
      return parts[name] ?? '';
    },
  };
}

/** Po jedan minimalan uzorak za svaku vrstu census-a, smjesten samo u tijelo dokumenta. */
export const STRUCTURE_SAMPLES: Readonly<Record<InspectionStructureKind, string>> = {
  'content-control': '<w:sdt><w:sdtContent><w:p/></w:sdtContent></w:sdt>',
  'text-box': '<w:p><w:r><w:txbxContent><w:p/></w:txbxContent></w:r></w:p>',
  math: '<w:p><m:oMath xmlns:m="m"><m:r/></m:oMath></w:p>',
  'tracked-change': '<w:ins><w:r/></w:ins>',
  'embedded-object': '<w:p><w:r><w:object><o:OLEObject xmlns:o="o"/></w:object></w:r></w:p>',
  'nested-table': '<w:tbl><w:tr><w:tc><w:tbl><w:tr><w:tc/></w:tr></w:tbl></w:tc></w:tr></w:tbl>',
  'unbalanced-field': '<w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r></w:p>',
};

function bodyWith(fragment: string): string {
  return `<w:document ${W}><w:body>${fragment}</w:body></w:document>`;
}

function kindCount(coverage: InspectionCoverage, kind: InspectionStructureKind): number {
  return coverage.items.find((item) => item.kind === kind)?.count ?? 0;
}

/** Vraca popis problema; prazan popis znaci da census drzi sve tvrdnje. */
export async function inspectionCensusProblems(census: InspectionCensus): Promise<string[]> {
  const problems: string[] = [];

  // Baseline: cist paket mora ostati no-known-limits, inace gard vristi na sve.
  const clean = await census(memoryPackage({ 'word/document.xml': PLAIN_BODY }), {});
  if (clean.status !== 'no-known-limits') problems.push(`cist paket nije no-known-limits (${clean.status})`);
  const cleanLinked = await census(memoryPackage({
    'word/document.xml': BODY_WITH_REFS,
    [RELS_PATH]: documentRels([['rIdH', 'header', 'header1.xml'], ['rIdF', 'footer', 'footer1.xml']]),
    'word/header1.xml': `<w:hdr ${W}><w:p/></w:hdr>`,
    'word/footer1.xml': `<w:ftr ${W}><w:p/></w:ftr>`,
  }), {});
  if (cleanLinked.status !== 'no-known-limits') {
    problems.push(`cist paket s povezanim zaglavljem i podnozjem nije no-known-limits (${cleanLinked.status})`);
  }

  // (a) zaglavlja i podnozja povezana relacijom moraju biti u census-u.
  const header = await census(memoryPackage({
    'word/document.xml': BODY_WITH_REFS,
    [RELS_PATH]: documentRels([['rIdH', 'header', 'header1.xml']]),
    'word/header1.xml': `<w:hdr ${W}>${STRUCTURE_SAMPLES['text-box']}</w:hdr>`,
  }), {});
  if (header.status !== 'partial' || kindCount(header, 'text-box') !== 1) {
    problems.push('tekstni okvir samo u zaglavlju nije prijavljen kao ogranicenje');
  }
  const footer = await census(memoryPackage({
    'word/document.xml': BODY_WITH_REFS,
    [RELS_PATH]: documentRels([['rIdF', 'footer', 'footer3.xml']]),
    'word/footer3.xml': `<w:ftr ${W}>${STRUCTURE_SAMPLES['content-control']}</w:ftr>`,
  }), {});
  if (footer.status !== 'partial' || kindCount(footer, 'content-control') !== 1) {
    problems.push('strukturirana kontrola samo u podnozju nije prijavljena kao ogranicenje');
  }

  // (a2) Codex M1b: izbor ide po STVARNOJ relaciji, ne po imenu dijela.
  const custom = await census(memoryPackage({
    'word/document.xml': BODY_WITH_REFS,
    [RELS_PATH]: documentRels([['rIdH', 'header', 'headerCustom.xml']]),
    'word/headerCustom.xml': `<w:hdr ${W}>${STRUCTURE_SAMPLES['text-box']}</w:hdr>`,
  }), {});
  if (custom.status !== 'partial' || kindCount(custom, 'text-box') !== 1) {
    problems.push('zaglavlje povezano relacijom pod imenom izvan header*.xml nije prijavljeno kao ogranicenje');
  }
  const unlinked = await census(memoryPackage({
    'word/document.xml': PLAIN_BODY,
    [RELS_PATH]: documentRels([['rIdS', 'styles', 'styles.xml']]),
    'word/header1.xml': `<w:hdr ${W}>${STRUCTURE_SAMPLES['text-box']}</w:hdr>`,
  }), {});
  if (unlinked.status !== 'no-known-limits') {
    problems.push(`nepovezano zaglavlje bez relacije promijenilo je status (${unlinked.status})`);
  }
  const invalidRels = await census(memoryPackage({
    'word/document.xml': BODY_WITH_REFS,
    [RELS_PATH]: '<Relationships><Relationship Id="rIdH"',
    'word/header1.xml': `<w:hdr ${W}><w:p/></w:hdr>`,
  }), {});
  if (invalidRels.status !== 'unknown') problems.push(`nevaljan document.xml.rels dao je ${invalidRels.status}, ne unknown`);
  const missingRels = await census(memoryPackage({
    'word/document.xml': BODY_WITH_REFS,
    'word/header1.xml': `<w:hdr ${W}><w:p/></w:hdr>`,
  }), {});
  if (missingRels.status !== 'unknown') {
    problems.push(`referenca zaglavlja bez document.xml.rels dala je ${missingRels.status}, ne unknown`);
  }

  // (b) svaka vrsta census-a mora biti prepoznata.
  for (const { kind } of INSPECTION_STRUCTURES) {
    const out = await census(memoryPackage({ 'word/document.xml': bodyWith(STRUCTURE_SAMPLES[kind]) }), {});
    if (out.status !== 'partial' || kindCount(out, kind) < 1) problems.push(`vrsta ${kind} nije prepoznata u census-u`);
  }

  // Neuravnotezeno polje samo u fusnoti (Codex M2).
  const footnote = await census(memoryPackage({
    'word/document.xml': PLAIN_BODY,
    'word/footnotes.xml': `<w:footnotes ${W}><w:footnote w:id="1">${STRUCTURE_SAMPLES['unbalanced-field']}</w:footnote></w:footnotes>`,
  }), {});
  if (footnote.status === 'no-known-limits') problems.push('neuravnotezeno polje samo u fusnoti dalo je no-known-limits');

  // Codex M2b: begin u fusnoti 1 i samostalni end u fusnoti 2 se NE smiju ponistiti.
  const split = await census(memoryPackage({
    'word/document.xml': PLAIN_BODY,
    'word/footnotes.xml':
      `<w:footnotes ${W}>` +
      '<w:footnote w:id="1"><w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r></w:p></w:footnote>' +
      '<w:footnote w:id="2"><w:p><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p></w:footnote>' +
      '</w:footnotes>',
  }), {});
  if (split.status === 'no-known-limits' || kindCount(split, 'unbalanced-field') < 1) {
    problems.push('polje otvoreno u jednoj fusnoti i zatvoreno u drugoj dalo je no-known-limits');
  }

  // (m) komentari i glossary dio su u census-u.
  const comments = await census(memoryPackage({
    'word/document.xml': PLAIN_BODY,
    'word/comments.xml': `<w:comments ${W}><w:comment w:id="0">${STRUCTURE_SAMPLES['content-control']}</w:comment></w:comments>`,
  }), {});
  if (comments.status !== 'partial' || kindCount(comments, 'content-control') !== 1) {
    problems.push('strukturirana kontrola samo u komentarima nije prijavljena kao ogranicenje');
  }
  const glossary = await census(memoryPackage({
    'word/document.xml': PLAIN_BODY,
    'word/glossary/document.xml':
      `<w:glossaryDocument ${W}><w:docParts><w:docPart><w:docPartBody>${STRUCTURE_SAMPLES['text-box']}</w:docPartBody></w:docPart></w:docParts></w:glossaryDocument>`,
  }), {});
  if (glossary.status !== 'partial' || kindCount(glossary, 'text-box') !== 1) {
    problems.push('tekstni okvir samo u glossary dijelu nije prijavljen kao ogranicenje');
  }

  // (c) kvar census-a nikad ne smije postati no-known-limits.
  const failed = await census(memoryPackage({
    'word/document.xml': BODY_WITH_REFS,
    [RELS_PATH]: documentRels([['rIdH', 'header', 'header1.xml']]),
    'word/header1.xml': `<w:hdr ${W}/>`,
  }, ['word/header1.xml']), {});
  if (failed.status !== 'unknown') problems.push(`kvar citanja dijela dao je ${failed.status}, ne unknown`);

  return problems;
}

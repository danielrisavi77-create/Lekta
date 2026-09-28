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
const PLAIN_BODY = `<w:document ${W}><w:body><w:p><w:r><w:t>Obican tekst</w:t></w:r></w:p></w:body></w:document>`;

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

  // (a) zaglavlja i podnozja moraju biti u census-u.
  const header = await census(memoryPackage({
    'word/document.xml': PLAIN_BODY,
    'word/header1.xml': `<w:hdr ${W}>${STRUCTURE_SAMPLES['text-box']}</w:hdr>`,
  }), {});
  if (header.status !== 'partial' || kindCount(header, 'text-box') !== 1) {
    problems.push('tekstni okvir samo u zaglavlju nije prijavljen kao ogranicenje');
  }
  const footer = await census(memoryPackage({
    'word/document.xml': PLAIN_BODY,
    'word/footer3.xml': `<w:ftr ${W}>${STRUCTURE_SAMPLES['content-control']}</w:ftr>`,
  }), {});
  if (footer.status !== 'partial' || kindCount(footer, 'content-control') !== 1) {
    problems.push('strukturirana kontrola samo u podnozju nije prijavljena kao ogranicenje');
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

  // (c) kvar census-a nikad ne smije postati no-known-limits.
  const failed = await census(memoryPackage({
    'word/document.xml': PLAIN_BODY,
    'word/header1.xml': `<w:hdr ${W}/>`,
  }, ['word/header1.xml']), {});
  if (failed.status !== 'unknown') problems.push(`kvar citanja dijela dao je ${failed.status}, ne unknown`);

  return problems;
}

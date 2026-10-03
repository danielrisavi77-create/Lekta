/**
 * Z36 (odluka vlasnika 2026-10-03, "svo troje"): gardovi za dodavanje zapisa literature.
 *
 * Svaki gard prima IMPLEMENTACIJU kao argument i vraca popis problema (prazan = cisto), pa isti gard
 * koristi i obican test (stvarna implementacija mora dati []) i tests/gate-mutations.test.ts
 * (mutirani izvor mora dati barem jedan problem s ocekivanom oznakom).
 *
 * Generatori ulaza su namjerno doslovni: svaki popis literature je vec abecedan po hr kolaciji, a
 * mjesto umetanja se racuna iz susjeda u spojenom tekstu odlomaka, nikad iz sirovog XML-a.
 */
import { analyzeBibliographyStructure, bibliographyAnchorFingerprint } from '../../src/analysis/bibliography-structure';
import { citationAnchorFingerprint } from '../../src/analysis/citation-bibliography-sync';
import type { citationBibliographySyncFixer } from '../../src/repair/citation-bibliography-sync-fixer';
import type { validateAssistedParams } from '../../src/repair/contract/assisted-request-policy';
import type { citationBibliographySyncRepairableItem } from '../../src/ui/repair-items';

type SyncFixer = typeof citationBibliographySyncFixer;

const paragraph = (text: string) => `<w:p><w:pPr><w:ind w:left="720" w:hanging="720"/></w:pPr><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;

/** Spojeni tekst svakog odlomka tijela (w:t unutar w:p), s dekodiranim entitetima. */
export function paragraphTexts(xml: string): string[] {
  return [...xml.matchAll(/<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g)].map((match) => [...match[1].matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)]
    .map((t) => t[1].replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')).join(''));
}

export const entryText = (surname: string, year: string) => `${surname}, A. (${year}). Naslov djela ${surname}.`;

/** Dokument: odlomak s citatom, naslov "Literatura" i zadani (abecedni) zapisi. */
export function syncCase(citationText: string, citationRaw: string, surnames: Array<[string, string]>) {
  const entries = surnames.map(([surname, year]) => entryText(surname, year));
  const documentXml = `<w:document><w:body>${paragraph(citationText)}${paragraph('Literatura')}${entries.map(paragraph).join('')}<w:sectPr/></w:body></w:document>`;
  const start = citationText.indexOf(citationRaw);
  const lastIndex = 2 + entries.length;
  const params: Parameters<SyncFixer>[1] = {
    version: 1,
    citations: [{ id: 'c1', paragraphIndex: 1, start, end: start + citationRaw.length, anchorFingerprint: citationAnchorFingerprint(1, citationText), replacementText: citationRaw, reason: 'citat uz dodani zapis literature' }],
    entries: [{ id: 'sync-entry-c1', paragraphIndices: [], anchorFingerprint: '', action: 'add', citationId: 'c1', insertionAnchor: { paragraphIndex: lastIndex, anchorFingerprint: bibliographyAnchorFingerprint([lastIndex], entries.at(-1)!) } }],
    mappings: [{ citationId: 'c1', bibliographyEntryId: 'sync-entry-c1', confirmed: true }],
  };
  return { parts: { documentXml, stylesXml: '' }, params, before: paragraphTexts(documentXml) };
}

const BASE: Array<[string, string]> = [['Cvitan', '2015'], ['Čuljak', '2016'], ['Dukić', '2017'], ['Horvat', '2020'], ['Sušić', '2018'], ['Zubak', '2019']];

/**
 * Ocekivani susjedi za svaki slucaj. Dijakriticki slucajevi su odabrani tako da hr kolacija daje
 * DRUGO mjesto od korijenske (en) kolacije i od usporedbe po kodnim tockama: "Čavić" je po hr iza
 * "Cvitan" (č iza c), a po korijenskoj ispred (a ispred v).
 */
const PLACEMENT_CASES: Array<{ tag: string; surname: string; year: string; after: string | null; beforeSurname: string | null }> = [
  { tag: 'abeceda:pocetak', surname: 'Babić', year: '2021', after: null, beforeSurname: 'Cvitan' },
  { tag: 'abeceda:sredina', surname: 'Novak', year: '2022', after: 'Horvat', beforeSurname: 'Sušić' },
  { tag: 'abeceda:kraj', surname: 'Zupan', year: '2014', after: 'Zubak', beforeSurname: null },
  { tag: 'dijakritika:č', surname: 'Čavić', year: '2013', after: 'Cvitan', beforeSurname: 'Čuljak' },
  { tag: 'dijakritika:ć', surname: 'Ćaćić', year: '2012', after: 'Čuljak', beforeSurname: 'Dukić' },
  { tag: 'dijakritika:đ', surname: 'Đakić', year: '2011', after: 'Dukić', beforeSurname: 'Horvat' },
  { tag: 'dijakritika:š', surname: 'Šarić', year: '2010', after: 'Sušić', beforeSurname: 'Zubak' },
  { tag: 'dijakritika:ž', surname: 'Žabić', year: '2009', after: 'Zubak', beforeSurname: null },
];

export const template = (surname: string, year: string) => `${surname}, [ime]. (${year}). [Naslov djela]. [Mjesto: Izdavač].`;

/** Gard fixera: predlozak, abecedno mjesto, dijakritika, idempotencija, vidljivi tekst, padez. */
export function zapisLiteratureProblemi(fixer: SyncFixer): string[] {
  const problems: string[] = [];
  for (const placement of PLACEMENT_CASES) {
    const raw = `${placement.surname}, ${placement.year}`;
    const { parts, params, before } = syncCase(`Tekst rada (${raw}).`, raw, BASE);
    // Generator mora proizvesti ciljanu klasu: popis je vec abecedan po istoj provjeri.
    if (!analyzeBibliographyStructure(before.map((text, i) => ({ index: i + 1, text })), 'hr').alphabetical.expected) problems.push(`${placement.tag}: ulazni popis nije abecedan`);
    const result = fixer(parts, params);
    const after = paragraphTexts(result.parts.documentXml);
    const expected = template(placement.surname, placement.year);
    const at = after.indexOf(expected);
    if (!result.applied || at < 0) { problems.push(`${placement.tag}: predlozak nije umetnut`); continue; }
    const previous = after[at - 1];
    const next = after[at + 1] ?? null;
    if (placement.after === null ? previous !== 'Literatura' : previous !== entryText(placement.after, BASE.find(([s]) => s === placement.after)![1])) problems.push(`${placement.tag}: krivi prethodnik (${previous})`);
    if ((placement.beforeSurname === null) !== (next === null) || (next !== null && !next.startsWith(`${placement.beforeSurname},`))) problems.push(`${placement.tag}: krivi sljedbenik (${next})`);
    // Vidljivi tekst: osim umetnutog zapisa nijedan odlomak se ne mijenja.
    if (JSON.stringify(after.filter((_text, index) => index !== at)) !== JSON.stringify(before)) problems.push(`${placement.tag}: promijenjen postojeci tekst`);
    if (!analyzeBibliographyStructure(after.map((text, i) => ({ index: i + 1, text })), 'hr').alphabetical.expected) problems.push(`${placement.tag}: provjera abecede pada nakon umetanja`);
  }

  const idem = syncCase('Tekst rada (Novak, 2022a).', 'Novak, 2022a', BASE);
  const first = fixer(idem.parts, idem.params);
  const second = fixer(first.parts, idem.params);
  const count = paragraphTexts(second.parts.documentXml).filter((text) => text === template('Novak', '2022a')).length;
  if (!first.applied) problems.push('sufiks: predlozak s godinom 2022a nije umetnut');
  if (second.applied || second.reason !== 'already-ok' || count !== 1) problems.push(`idempotencija: drugi prolaz nije no-op (${second.reason}, ${count} zapisa)`);

  for (const [raw, surname] of [['Horvat i Novak, 2020', 'Horvat'], ['Kovač et al., 2019', 'Kovač']] as const) {
    const multi = syncCase(`Tekst rada (${raw}).`, raw, BASE);
    const texts = paragraphTexts(fixer(multi.parts, multi.params).parts.documentXml);
    if (!texts.some((text) => text.startsWith(`${surname}, [ime]. (`))) problems.push(`vise-autora: zapis ne nosi prvo prezime ${surname}`);
  }

  // Narativni citat moze nositi sklonjeno prezime ("Prema Novaku (2022)"): nista se ne umece.
  const narrative = syncCase('Prema Novaku (2022) tekst rada.', 'Novaku (2022)', BASE);
  const narrativeResult = fixer(narrative.parts, narrative.params);
  if (narrativeResult.applied || paragraphTexts(narrativeResult.parts.documentXml).some((text) => text.includes('[ime]'))) problems.push('padez: narativni citat dao je zapis');
  return problems;
}

type PlanBuilder = typeof citationBibliographySyncRepairableItem;

const planResult = () => ({
  details: {
    citationBibliographySync: {
      citations: [{ id: 'c1', paragraphIndex: 1, start: 11, end: 22, rawText: 'Novak, 2022', author: 'Novak', year: '2022', anchorFingerprint: 'citation-1', confidence: 'high' }],
      links: [{ citationId: 'c1', status: 'missing', candidates: [], reason: 'nedostaje' }],
      missingEntries: [{ id: 'c1' }],
      duplicateCandidates: [],
      summary: { citations: 1, matched: 0, missing: 1, ambiguous: 0, pageIssues: 0 },
    },
    bibliographyStructure: { entries: [{ id: 'bibliography-3', paragraphIndices: [3], anchorFingerprint: 'biblio-3', rawText: entryText('Horvat', '2020') }] },
  },
});
const planProfile = (value: Record<string, unknown>) => ({ ruleEntries: [{ checkId: 'citation-sync-rules', status: 'verified', sourceId: 's', sourcePage: '1', quote: 'pravilo', value }] });

/** Gard plana: dodavanje zapisa samo uz dozvolu profila; prazan tekst salje id citata, ne predlozak. */
export function planZapisaProblemi(build: PlanBuilder): string[] {
  const problems: string[] = [];
  const offered = (value: Record<string, unknown>) => {
    const item = build(planResult(), planProfile(value))[0];
    const form = item?.citationBibliographySyncForm;
    if (!form) return { rows: 0, adds: 0 };
    for (const missing of form.missingEntries) missing.selected = true;
    const params = form.buildParams(form) as { entries: Array<{ action: string }> };
    return { rows: form.missingEntries.length, adds: params.entries.filter((entry) => entry.action === 'add').length };
  };
  const denied = offered({ mode: 'author-year' });
  if (denied.rows || denied.adds) problems.push('dozvola: plan nudi zapis bez allowMissingEntryInsertion');
  if (build(planResult(), planProfile({ mode: 'numeric', allowMissingEntryInsertion: true })).length) problems.push('nacin: plan nudi sinkronizaciju izvan author-year');
  if (build(planResult(), { ruleEntries: [] }).length) problems.push('pravilo: plan nudi sinkronizaciju bez verificiranog pravila');

  const item = build(planResult(), planProfile({ mode: 'author-year', allowMissingEntryInsertion: true }))[0];
  const form = item?.citationBibliographySyncForm;
  if (!form?.missingEntries.length) return [...problems, 'dozvola: uz dozvolu plan ne nudi zapis'];
  form.missingEntries[0].selected = true;
  const params = form.buildParams(form) as { citations: Array<{ id: string; replacementText: string }>; entries: Array<Record<string, unknown>> };
  const add = params.entries.find((entry) => entry.action === 'add');
  if (!add || add.citationId !== 'c1' || 'replacementText' in add) problems.push('predlozak: prazan tekst ne salje samo id citata');
  if (!params.citations.some((citation) => citation.id === 'c1' && citation.replacementText === 'Novak, 2022')) problems.push('predlozak: izvorni citat nije u zahtjevu nepromijenjen');
  return problems;
}

/** Gard servera: 'add' bez teksta trazi id citata iz istog zahtjeva; nepoznat kljuc se odbija. */
export function serverZapisaProblemi(validate: typeof validateAssistedParams): string[] {
  const problems: string[] = [];
  const citation = { id: 'c1', paragraphIndex: 1, start: 0, end: 11, anchorFingerprint: 'citation-1', replacementText: 'Novak, 2022', reason: 'r' };
  const add = (extra: Record<string, unknown>) => ({ version: 1, citations: [citation], entries: [{ id: 'e1', paragraphIndices: [], anchorFingerprint: 'biblio-3', action: 'add', insertionAnchor: { paragraphIndex: 3, anchorFingerprint: 'biblio-3' }, ...extra }], mappings: [] });
  const ok = (params: Record<string, unknown>) => validate('citation-bibliography-sync-fixer', params);
  if (!ok(add({ citationId: 'c1' }))) problems.push('server: odbija predlozak s poznatim citatom');
  if (!ok(add({ replacementText: 'Novak, N. (2022). Naslov.' }))) problems.push('server: odbija korisnikov zapis');
  if (ok(add({}))) problems.push('server: prima zapis bez teksta i bez citata');
  if (ok(add({ replacementText: '   ' }))) problems.push('server: prima prazan tekst bez citata');
  if (ok(add({ citationId: 'c9' }))) problems.push('server: prima nepoznat citat');
  if (ok(add({ citationId: 'c1', template: 'Kovač, I. (2022).' }))) problems.push('server: prima klijentski predlozak');
  return problems;
}

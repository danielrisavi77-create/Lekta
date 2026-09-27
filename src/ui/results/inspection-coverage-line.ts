/**
 * T64: jedan kratak redak "Nije provjereno: ..." u prikazu rezultata.
 *
 * "Nisam dirao" nije "provjerio sam i ispravno je". Kad analiza neki dio rada nije pregledala
 * (tekstni okviri, polja upravitelja literature, tablice...), korisnik to mora procitati uz
 * rezultat, a ne zakljuciti iz sutnje. Redak se NE crta kad je sve provjereno, ne mijenja
 * bodovanje i nije novi ekran. Hrvatski, bez em i en crtica.
 */
import type { InspectionCoverage, InspectionSkipKind } from '../../analysis/inspection-coverage';
import { pluralHr } from './plural-hr';

const ODLOMAK: readonly [string, string, string] = ['odlomak', 'odlomka', 'odlomaka'];

/** Opis jedne vrste preskocenog dijela, s ispravnim hrvatskim mnozinskim oblikom. */
function phrase(kind: InspectionSkipKind, count: number): string {
  const odlomaka = `${count} ${pluralHr(count, ODLOMAK)}`;
  switch (kind) {
    case 'citationField': return `${odlomaka} sa Zotero, Mendeley ili EndNote poljima`;
    case 'textBox': return `${odlomaka} u tekstnim okvirima`;
    case 'nestedTable': return `${odlomaka} u ugniježđenim tablicama`;
    case 'tableCell': return `${odlomaka} u tablicama`;
    case 'contentControl': return `${odlomaka} u kontrolama sadržaja`;
    case 'trackedChange': return `${odlomaka} s praćenim promjenama`;
    case 'equation': return `${odlomaka} s formulama`;
    case 'embeddedObject': return `${odlomaka} s ugrađenim objektima`;
    case 'fieldOrHyperlink': return `${odlomaka} s poljima ili poveznicama`;
    case 'legalFootnote': return `${count} ${pluralHr(count, ['fusnota', 'fusnote', 'fusnota'])} bez pouzdane pravne strukture`;
    case 'complexTable': return `${count} ${pluralHr(count, ['složena tablica', 'složene tablice', 'složenih tablica'])} za automatski popravak`;
    case 'analysisUnavailable': return 'dio analize nije izračunat';
  }
}

/** Tekst retka ili `null` kad ga ne treba prikazati. Izdvojeno radi testa bez DOM-a. */
export function inspectionCoverageText(coverage: InspectionCoverage | null | undefined): string | null {
  if (!coverage || coverage.status === 'fullyChecked' || !Array.isArray(coverage.skippedParts) || !coverage.skippedParts.length) return null;
  const parts = coverage.skippedParts.map((part) => phrase(part.kind, part.count));
  const lead = coverage.status === 'manualReviewRequired' ? 'Potrebna je ručna provjera. ' : '';
  return `${lead}Nije provjereno: ${parts.join(', ')}.`;
}

export function inspectionCoverageLineHtml(coverage: InspectionCoverage | null | undefined, esc: (value: unknown) => string): string {
  const text = inspectionCoverageText(coverage);
  if (!text || !coverage) return '';
  return `<p class="cockpit-inspection-coverage" role="note" data-inspection-coverage="${esc(coverage.status)}">${esc(text)}</p>`;
}

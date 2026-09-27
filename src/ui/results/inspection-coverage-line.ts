/**
 * T64: jedan kratak redak u prikazu rezultata o tome sto analiza NIJE provjerila.
 *
 * "Nisam dirao" nije "provjerio sam i ispravno je", ali ni "nije provjereno" ne smije lagati u
 * suprotnom smjeru. Zato redak za svaki dio kaze TKO ga nije procitao (`scope`):
 * - provjera tehnicko-tipografske dosljednosti (provjere fonta, velicine, proreda i
 *   poravnanja te odlomke citaju, sto redak i kaze);
 * - prijedlozi popravka;
 * - nijedna provjera (sadrzaj ugradjenih objekata);
 * - nepoznato (dio analize nije izracunat).
 * Redak se NE crta kad je sve provjereno, ne mijenja bodovanje i nije novi ekran. Hrvatski, bez
 * em i en crtica.
 */
import type { InspectionCoverage, InspectionSkipKind, InspectionSkippedPart } from '../../analysis/inspection-coverage';
import { pluralHr } from './plural-hr';

const ODLOMAK: readonly [string, string, string] = ['odlomak', 'odlomka', 'odlomaka'];

/** Opis jedne vrste preskocenog dijela (akuzativ), s ispravnim hrvatskim mnozinskim oblikom. */
function phrase(kind: InspectionSkipKind, count: number): string {
  const odlomaka = `${count} ${pluralHr(count, ODLOMAK)}`;
  switch (kind) {
    case 'citationField': return `${odlomaka} s poljima upravitelja literature (Zotero, Mendeley, EndNote)`;
    case 'textBox': return `${odlomaka} u tekstnim okvirima`;
    case 'nestedTable': return `${odlomaka} u ugniježđenim tablicama`;
    case 'tableCell': return `${odlomaka} u tablicama`;
    case 'contentControl': return `${odlomaka} u kontrolama sadržaja`;
    case 'trackedChange': return `${odlomaka} s praćenim promjenama`;
    case 'equation': return `${odlomaka} s formulama`;
    case 'fieldOrHyperlink': return `${odlomaka} s poljima ili poveznicama`;
    case 'otherStructure': return `${odlomaka} u drugim složenim Word strukturama`;
    case 'embeddedObject': return `${count} ${pluralHr(count, ['ugrađenog objekta', 'ugrađena objekta', 'ugrađenih objekata'])}`;
    case 'legalFootnote': return `${count} ${pluralHr(count, ['fusnotu', 'fusnote', 'fusnota'])} bez pouzdane pravne strukture`;
    case 'complexTable': return `${count} ${pluralHr(count, ['složenu tablicu', 'složene tablice', 'složenih tablica'])}`;
    case 'analysisUnavailable': return 'dio analize';
  }
}

function list(parts: InspectionSkippedPart[]): string {
  return parts.map((part) => phrase(part.kind, part.count)).join(', ');
}

/** Tekst retka ili `null` kad ga ne treba prikazati. Izdvojeno radi testa bez DOM-a. */
export function inspectionCoverageText(coverage: InspectionCoverage | null | undefined): string | null {
  if (!coverage || coverage.status === 'fullyChecked' || !Array.isArray(coverage.skippedParts) || !coverage.skippedParts.length) return null;
  const byScope = (scope: InspectionSkippedPart['scope']) => coverage.skippedParts.filter((part) => part.scope === scope);
  const typography = byScope('typographyCheck');
  const repair = byScope('repairSuggestions');
  const noCheck = byScope('noCheck');
  const unknown = byScope('unknown');
  const sentences: string[] = [];
  if (coverage.status === 'manualReviewRequired') sentences.push('Potrebna je ručna provjera tehničko-tipografske dosljednosti.');
  if (typography.length) {
    sentences.push(`Provjera tehničko-tipografske dosljednosti nije obuhvatila ${list(typography)}; provjere fonta, veličine, proreda i poravnanja pročitale su i te odlomke.`);
  }
  if (noCheck.length) sentences.push(`Sadržaj ${list(noCheck)} ne čita nijedna provjera.`);
  if (repair.length) sentences.push(`Prijedlozi popravka ne obuhvaćaju ${list(repair)}.`);
  if (unknown.length) sentences.push('Dio analize nije izračunat.');
  return sentences.length ? sentences.join(' ') : null;
}

export function inspectionCoverageLineHtml(coverage: InspectionCoverage | null | undefined, esc: (value: unknown) => string): string {
  const text = inspectionCoverageText(coverage);
  if (!text || !coverage) return '';
  return `<p class="cockpit-inspection-coverage" role="note" data-inspection-coverage="${esc(coverage.status)}">${esc(text)}</p>`;
}

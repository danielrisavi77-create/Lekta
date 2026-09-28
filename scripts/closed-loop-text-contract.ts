import { applyFixers, type FixerRequest } from '../src/repair/apply-fixers';
import { documentText } from '../src/verification/docx-visible-text.ts';

/** Iznimke iz ugovora proizvoda: smiju promijeniti vidljivi tekst samo svojim zahvatom. */
const TEXT_CHANGING_FIXERS = new Set<FixerRequest['fixerId']>([
  'croatian-typography-fixer',
  'heading-case-fixer',
  'link-doi-fixer',
  'toc-field-fixer',
  'required-section-fixer',
]);
const EARLY_TEXT_FIXERS = new Set<FixerRequest['fixerId']>([
  'croatian-typography-fixer',
  'link-doi-fixer',
]);

/** Zavrsni tekst mora biti nepromijenjen ili jednak izlazu samih dopustenih tekstualnih fixera. */
export async function textContractPreserved(
  inputBytes: Uint8Array,
  beforeText: string,
  afterText: string,
  requests: readonly FixerRequest[],
): Promise<boolean> {
  if (beforeText === afterText) return true;
  const permitted = requests.filter((request) => TEXT_CHANGING_FIXERS.has(request.fixerId));
  if (!permitted.length) return false;
  const permittedOnly = await applyFixers(inputBytes, permitted);
  if (!permittedOnly.integrityFailure && await documentText(permittedOnly.docxBytes) === afterText) return true;

  // Stil i struktura mogu pripremiti naslov koji heading-case zatim mijenja.
  // U tom slucaju prvo dokazujemo da ostali fixeri sami cuvaju tekst, pa na njih primjenjujemo iznimke.
  const neutral = requests.filter((request) => !TEXT_CHANGING_FIXERS.has(request.fixerId));
  const neutralOnly = await applyFixers(inputBytes, neutral);
  if (neutralOnly.integrityFailure || await documentText(neutralOnly.docxBytes) !== beforeText) return false;
  const permittedAfterNeutral = await applyFixers(neutralOnly.docxBytes, permitted);
  if (permittedAfterNeutral.integrityFailure) return false;
  if (await documentText(permittedAfterNeutral.docxBytes) === afterText) return true;

  // Tipografija i DOI koriste sidra izvornika, a heading-case i TOC mogu trebati prethodni stil.
  // Treca varijanta cuva taj redoslijed i izricito dokazuje da srednja faza ne dira tekst.
  const early = await applyFixers(inputBytes, permitted.filter((request) => EARLY_TEXT_FIXERS.has(request.fixerId)));
  if (early.integrityFailure) return false;
  const earlyText = await documentText(early.docxBytes);
  const middle = await applyFixers(early.docxBytes, neutral);
  if (middle.integrityFailure || await documentText(middle.docxBytes) !== earlyText) return false;
  const late = await applyFixers(middle.docxBytes, permitted.filter((request) => !EARLY_TEXT_FIXERS.has(request.fixerId)));
  if (late.integrityFailure) return false;
  return await documentText(late.docxBytes) === afterText;
}

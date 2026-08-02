/**
 * Orkestrator: spaja preklapanje (source-overlap.ts) i cross-check tvrdnji (source-claim-check.ts,
 * tvrdnje iz domains.ts `extractUniversalClaims`) protiv izvorne gradje koju je student uploadao
 * uz rad (izvještaji, projekti, radovi koje je stvarno citirao).
 *
 * Ovo je ciSTO informativni sloj: NIKAD ne pise u result.checks/result.issues/result.score, isto
 * nacelo kao submissionLint/crossFileSubmissionConsistency (analyze-docx.ts/app.ts). Poziva se
 * SAMO kad postoje izvorne datoteke (opt-in, placeno); kad ih nema, ovaj modul se uopce ne poziva
 * i `details.sourceCrossCheck` ostaje odsutan, pa golden ostaje netaknut.
 */
import { extractUniversalClaims } from './domains';
import { buildSourceOverlapReport, type SourceOverlapOptions, type SourceOverlapReport } from './source-overlap';
import { crossCheckClaims, type ClaimCrossCheckResult } from './source-claim-check';
import type { SourceMaterialDoc } from './source-material-text';

export interface SourceMaterialFileRef {
  fileName: string;
  paragraphCount: number;
}

export interface SourceCrossCheckSummary {
  paragraphsFlagged: number;
  claimsChecked: number;
  claimsFound: number;
  claimsNotFound: number;
  text: string;
}

export interface SourceCrossCheckResult {
  version: 1;
  sourceFiles: SourceMaterialFileRef[];
  overlap: SourceOverlapReport;
  claims: ClaimCrossCheckResult[];
  summary: SourceCrossCheckSummary;
}

export interface SourceCrossCheckInput {
  thesisParagraphs: Array<{ index: number; text: string }>;
  sourceDocs: SourceMaterialDoc[];
  options?: { overlap?: SourceOverlapOptions };
}

export function analyzeSourceCrossCheck(input: SourceCrossCheckInput): SourceCrossCheckResult {
  const thesisParagraphs = input.thesisParagraphs || [];
  const sourceDocs = input.sourceDocs || [];

  const overlap = buildSourceOverlapReport(
    thesisParagraphs,
    sourceDocs.map((d) => ({ fileName: d.fileName, paragraphs: d.paragraphs })),
    input.options?.overlap,
  );

  const universalClaims = extractUniversalClaims(thesisParagraphs);
  const claims = crossCheckClaims(
    universalClaims,
    sourceDocs.map((d) => ({ fileName: d.fileName, rawText: d.rawText })),
  );

  const claimsFound = claims.filter((c) => c.foundInAnySource).length;
  const claimsNotFound = claims.length - claimsFound;

  return {
    version: 1,
    sourceFiles: sourceDocs.map((d) => ({ fileName: d.fileName, paragraphCount: d.paragraphs.length })),
    overlap,
    claims,
    summary: {
      paragraphsFlagged: overlap.flaggedCount,
      claimsChecked: claims.length,
      claimsFound,
      claimsNotFound,
      text: claims.length
        ? `${overlap.flaggedCount} odlomak(a) za provjeru citata · ${claimsNotFound} od ${claims.length} tvrdnji nije pronađeno u izvorima`
        : `${overlap.flaggedCount} odlomak(a) za provjeru citata`,
    },
  };
}

import type { AnalysisResultLike } from '../report/report';
import type { LektaResult } from './academic-suite-contracts';
import { toSharedLektaResult, type LektaResultContext } from './lekta-result-adapter';
import { currentKatedraProjectId } from './katedra-entry';

function encodeUtf8Base64(value: unknown): string {
  const json = JSON.stringify(value);
  const encoded = encodeURIComponent(json).replace(/%([0-9A-F]{2})/g, (_match, hex) =>
    String.fromCharCode(Number.parseInt(hex, 16)),
  );
  return btoa(encoded);
}

/**
 * Builds the canonical v0.1 payload consumed by Katedra's bootstrap bridge.
 * Raw document text is not part of `LektaResult` and therefore cannot leak into
 * the URL fragment through this helper.
 */
export function buildKatedraHandoffFragment(result: LektaResult): string {
  return `#lekta=${encodeURIComponent(encodeUtf8Base64(result))}`;
}

export function buildKatedraHandoffUrl(katedraBaseUrl: string, result: LektaResult): string {
  const base = String(katedraBaseUrl || '').replace(/#.*$/, '').replace(/\/$/, '');
  return `${base}/${buildKatedraHandoffFragment(result)}`;
}

/**
 * Convenience adapter for a Lekta analysis that originated from a Katedra
 * project. The remembered project ID came from safe entry routing metadata.
 */
export function toKatedraSharedResult(
  result: AnalysisResultLike,
  context: Omit<LektaResultContext, 'projectId'> & { projectId?: string },
): LektaResult {
  return toSharedLektaResult(result, {
    ...context,
    projectId: context.projectId || currentKatedraProjectId(),
  });
}

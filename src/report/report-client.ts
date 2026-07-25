import { buildReportRequest, type AnalysisResultLike } from './report';
import type { FingerprintInput } from '../fingerprint/fingerprint';
import { isReportWorkType, type ReportWorkType } from './pricing';
export { toReportWorkType } from './report-work-type';
import { toReportWorkType } from './report-work-type';

/**
 * Klijentska strana paywalla (MONETIZATION_AND_ANTI_ABUSE.md sekcija 5, korak klijenta).
 *
 * Teaser je lokalan i besplatan; za PUNI izvjestaj klijent salje parsiranu strukturu i
 * rezultat Edge Functionu, koji serverski odlucuje (re-check, novi slot, 402 paywall,
 * 429 rate limit). Klijent NIKAD ne odlucuje o pravu pristupa, samo prikazuje ishod.
 *
 * Ciste funkcije uz injektabilan `fetch` (testabilno bez mreze). `unlockFullReport` je
 * orkestrator koji UI sloj (app.ts) zove.
 */

export interface ReportClientConfig {
  /** URL Edge Functiona generate-report; prazno znaci nije konfigurirano. */
  endpoint: string;
}

export type UnlockOutcome =
  | { kind: 'ok'; report: unknown; slotId?: string }
  | { kind: 'paywall'; workType: ReportWorkType }
  | { kind: 'rate_limited' }
  | { kind: 'unauthorized' }
  | { kind: 'error'; status?: number; message: string };

/** Profilska vrsta rada (engine) -> naplatna vrsta rada (monetizacija). */
/** Izvuce otisak-ulaz iz rezultata analize (analyzeDocx attacha `documentStructure`). */
export function extractParsedStructure(
  result: { documentStructure?: FingerprintInput } | null | undefined,
): FingerprintInput {
  const ds = result?.documentStructure;
  return { title: ds?.title ?? null, author: ds?.author ?? null, headings: ds?.headings ?? [] };
}

/** Posalji zahtjev za puni izvjestaj i mapiraj HTTP odgovor u ishod. */
export async function requestFullReport(
  config: ReportClientConfig,
  accessToken: string,
  request: ReturnType<typeof buildReportRequest>,
  fetchImpl: typeof fetch = fetch,
): Promise<UnlockOutcome> {
  if (!config.endpoint) return { kind: 'error', message: 'reportEndpoint nije konfiguriran' };
  let res: Response;
  try {
    res = await fetchImpl(config.endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify(request),
    });
  } catch (e) {
    return { kind: 'error', message: e instanceof Error ? e.message : 'mrezna greska' };
  }

  if (res.status === 200) {
    const data = (await res.json().catch(() => ({}))) as { report?: unknown; slotId?: string };
    return { kind: 'ok', report: data.report, slotId: data.slotId };
  }
  if (res.status === 402) {
    const data = (await res.json().catch(() => ({}))) as { workType?: string };
    const wt = data.workType && isReportWorkType(data.workType) ? data.workType : request.workType;
    return { kind: 'paywall', workType: wt };
  }
  if (res.status === 429) return { kind: 'rate_limited' };
  if (res.status === 401) return { kind: 'unauthorized' };
  return { kind: 'error', status: res.status, message: `neocekivani odgovor ${res.status}` };
}

/**
 * Orkestrator za UI: iz rezultata analize sastavi otisak-ulaz i zahtjev pa zovi server.
 * `accessToken` je Supabase JWT (prazan dok auth nije spojen -> server vraca 401).
 */
export async function unlockFullReport(
  result: AnalysisResultLike & { documentStructure?: FingerprintInput },
  workType: string,
  config: ReportClientConfig,
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<UnlockOutcome> {
  const structure = extractParsedStructure(result);
  const request = buildReportRequest(structure, result, toReportWorkType(workType));
  return requestFullReport(config, accessToken, request, fetchImpl);
}

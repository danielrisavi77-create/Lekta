/**
 * Klijentska strana SERVER-SIDE repaira (WS-3). Placeni popravak vise ne trosi klijentski
 * src/repair/* kao put isporuke: dokument se uploada (multipart), server iza entitlementa
 * pokrene isti engine i vrati ispravljen .docx (base64). Klijent NIKAD ne odlucuje o pravu
 * pristupa ni o vrsti rada, samo prikazuje ishod.
 *
 * Ciste funkcije uz injektabilan `fetch` (testabilno bez mreze), isti obrazac kao report-client
 * i checkout. Doslovni tekst rada NE ide u `meta` (samo otisak-struktura + brojevi/enumi);
 * sam dokument putuje kao binarni 'file' dio, na plin placeni tok, uz izricitu privolu.
 */

import { isReportWorkType, type ReportWorkType } from './pricing';
import type { FingerprintInput } from '../fingerprint/fingerprint';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export interface RepairClientConfig {
  /** URL repair-docx Edge Functiona; prazno znaci nije konfigurirano. */
  endpoint: string;
}

/** Sanitizirani signali vrste rada (za WS-2/WS-5 enforcement): SAMO broj rijeci + enum marker. */
export interface RepairSignals {
  words: number | null;
  titleMarker?: string | null;
}

/** Jedan zahtjev za popravak: koji fixer, koje pravilo, s kojim parametrima. */
export interface RepairFixerRequest {
  fixerId: string;
  ruleId: string;
  params: Record<string, unknown>;
}

/** Meta uz upload (JSON dio multiparta). Bez doslovnog teksta rada. */
export interface RepairMeta {
  workType: ReportWorkType;
  parsedStructure: FingerprintInput;
  signals: RepairSignals;
  requests: RepairFixerRequest[];
  profileStatus?: string | null;
  profileRef?: string | null;
  fileName?: string | null;
  /** Korisnik je svjesno potvrdio kupnju/popravak nizeg tiera (preskace tier_mismatch). */
  confirmedMismatch?: boolean;
}

export interface RepairChange { ruleId: string; beforeLabel: string; afterLabel: string }

export type RepairOutcome =
  | { kind: 'ok'; docxBytes: Uint8Array; fileName: string; changelog: RepairChange[]; skipped: string[]; slotId?: string; jobId?: string | null }
  | { kind: 'tier_mismatch'; suggestedWorkType: string }
  | { kind: 'paywall'; workType: ReportWorkType }
  | { kind: 'rate_limited' }
  | { kind: 'unauthorized' }
  | { kind: 'too_large' }
  | { kind: 'no_live_fixers' }
  | { kind: 'invalid_docx' }
  | { kind: 'error'; status?: number; message: string };

/** base64 -> Uint8Array (cisto, bez Node Buffera; `atob` je globalan u pregledniku/Deno/vitest). */
export function decodeBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Sastavi sanitizirani meta objekt. `signals.words` je profilni officialWords (ili sirovi broj
 * rijeci), `titleMarker` je detektirani naslovnicki marker. Nikad ne ukljucuje doslovni tekst.
 */
export function buildRepairMeta(input: {
  workType: string;
  parsedStructure: FingerprintInput;
  requests: RepairFixerRequest[];
  words?: number | null;
  titleMarker?: string | null;
  profileStatus?: string | null;
  profileRef?: string | null;
  fileName?: string | null;
  confirmedMismatch?: boolean;
}): RepairMeta {
  const workType: ReportWorkType = isReportWorkType(input.workType) ? input.workType : 'zavrsni';
  const meta: RepairMeta = {
    workType,
    parsedStructure: {
      title: input.parsedStructure?.title ?? null,
      author: input.parsedStructure?.author ?? null,
      headings: input.parsedStructure?.headings ?? [],
    },
    signals: { words: typeof input.words === 'number' ? input.words : null, titleMarker: input.titleMarker ?? null },
    requests: input.requests,
  };
  if (input.profileStatus != null) meta.profileStatus = input.profileStatus;
  if (input.profileRef != null) meta.profileRef = input.profileRef;
  if (input.fileName != null) meta.fileName = input.fileName;
  if (input.confirmedMismatch) meta.confirmedMismatch = true;
  return meta;
}

/**
 * Uploadaj dokument + meta na repair-docx i mapiraj HTTP odgovor u ishod. Ne postavlja
 * `content-type` rucno: FormData sam postavi multipart boundary. Bacanje mreze -> {kind:'error'}.
 */
export async function uploadRepair(
  config: RepairClientConfig,
  accessToken: string,
  fileBytes: Uint8Array,
  meta: RepairMeta,
  fetchImpl: typeof fetch = fetch,
): Promise<RepairOutcome> {
  if (!config.endpoint) return { kind: 'error', message: 'repairEndpoint nije konfiguriran' };

  const form = new FormData();
  const blob = new Blob([fileBytes as Uint8Array<ArrayBuffer>], { type: DOCX_MIME });
  form.append('file', blob, meta.fileName || 'rad.docx');
  form.append('meta', JSON.stringify(meta));

  let res: Response;
  try {
    res = await fetchImpl(config.endpoint, {
      method: 'POST',
      headers: { ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
      body: form,
    });
  } catch (e) {
    return { kind: 'error', message: e instanceof Error ? e.message : 'mrezna greska' };
  }

  if (res.status === 200) {
    const data = (await res.json().catch(() => ({}))) as {
      docxBase64?: string; fileName?: string; changelog?: RepairChange[]; skipped?: string[]; slotId?: string; jobId?: string | null;
    };
    if (!data.docxBase64) return { kind: 'error', status: 200, message: 'nedostaje docxBase64' };
    return {
      kind: 'ok',
      docxBytes: decodeBase64(data.docxBase64),
      fileName: data.fileName || 'rad-popravljeno.docx',
      changelog: Array.isArray(data.changelog) ? data.changelog : [],
      skipped: Array.isArray(data.skipped) ? data.skipped : [],
      slotId: data.slotId,
      jobId: data.jobId ?? null,
    };
  }
  if (res.status === 409) {
    const data = (await res.json().catch(() => ({}))) as { suggestedWorkType?: string; workType?: string };
    return { kind: 'tier_mismatch', suggestedWorkType: String(data.suggestedWorkType || data.workType || '') };
  }
  if (res.status === 402) {
    const data = (await res.json().catch(() => ({}))) as { workType?: string };
    const wt = data.workType && isReportWorkType(data.workType) ? data.workType : meta.workType;
    return { kind: 'paywall', workType: wt };
  }
  if (res.status === 429) return { kind: 'rate_limited' };
  if (res.status === 401) return { kind: 'unauthorized' };
  if (res.status === 413) return { kind: 'too_large' };
  if (res.status === 415) return { kind: 'invalid_docx' };
  if (res.status === 422) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    return data?.error === 'no_live_fixers' ? { kind: 'no_live_fixers' } : { kind: 'invalid_docx' };
  }
  return { kind: 'error', status: res.status, message: `neocekivani odgovor ${res.status}` };
}

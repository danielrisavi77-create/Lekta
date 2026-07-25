/**
 * Klijentska strana waitlista (WAITLIST_NEPOKRIVENI_FAKULTETI.md sekcije 4, 5, 6).
 *
 * Ciste funkcije uz injektabilan `fetch` (testabilno bez mreze), isti kroj kao report-client.
 * Sav upis ide preko Edge Functiona `faculty-request` (service role): ip_hash i rate limit su
 * serverska odluka, klijent NE pise izravno u tablicu. Dvije akcije, jedan endpoint, razlucene
 * poljem `requestId`: bez njega je novi upis (vraca id), s njim je naknadno vezanje e-maila.
 *
 * Model: anoniman upis nastaje pri prikazu teasera (vraca requestId); ako korisnik ostavi
 * e-mail, veze se na taj isti red. Ako je anoniman upis bio odbijen rate limitom (requestId
 * null), slanje e-maila salje novi upis koji vec nosi e-mail.
 */

import { toReportWorkType } from '../report/report-work-type';
import type { WaitlistCell } from './waitlist-detect';

export interface WaitlistConfig {
  /** URL Edge Functiona faculty-request; prazno znaci nije konfigurirano (feature-gate). */
  endpoint: string;
  /** Supabase anon key (apikey/bearer za anonimni poziv kroz gateway); prazno dopusteno. */
  anonKey?: string;
}

/** Tijelo za novi upis (submit). workType je naplatna vrsta rada (DB vokabular). */
export interface FacultyRequestBody {
  facultyId: string | null;
  facultyName: string | null;
  programId: string | null;
  workType: 'seminarski' | 'zavrsni' | 'diplomski' | 'doktorski';
  email: string | null;
  source: string;
}

export type SubmitOutcome =
  | { kind: 'ok'; requestId: string | null }
  | { kind: 'skipped'; reason: 'not_configured' }
  | { kind: 'error'; status?: number; message: string };

export type AttachOutcome =
  | { kind: 'ok'; attached: boolean }
  | { kind: 'skipped'; reason: 'not_configured' | 'no_request' }
  | { kind: 'error'; status?: number; message: string };

/** Blaga provjera e-maila (isti duh kao auth/session): jedan @, tekst oko njega, bez razmaka. */
export function isLikelyEmail(value: unknown): value is string {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

/** Sastavi tijelo upisa iz detektirane celije. E-mail se ukljucuje samo ako je valjan. */
export function buildFacultyRequestBody(
  cell: WaitlistCell,
  opts: { email?: string | null; source?: string } = {},
): FacultyRequestBody {
  const email = opts.email && isLikelyEmail(opts.email) ? opts.email.trim() : null;
  return {
    facultyId: cell.facultyId,
    facultyName: cell.facultyName ? cell.facultyName.slice(0, 200) : null,
    programId: cell.program,
    workType: toReportWorkType(cell.workType),
    email,
    source: opts.source || 'upload_flow',
  };
}

function headers(config: WaitlistConfig, accessToken?: string): Record<string, string> {
  const h: Record<string, string> = { 'content-type': 'application/json' };
  const bearer = accessToken || config.anonKey || '';
  if (config.anonKey) h.apikey = config.anonKey;
  if (bearer) h.Authorization = `Bearer ${bearer}`;
  return h;
}

/** Novi upis (anoniman ili s e-mailom). Vraca requestId za kasnije vezanje e-maila. */
export async function submitFacultyRequest(
  config: WaitlistConfig,
  body: FacultyRequestBody,
  accessToken = '',
  fetchImpl: typeof fetch = fetch,
): Promise<SubmitOutcome> {
  if (!config.endpoint) return { kind: 'skipped', reason: 'not_configured' };
  let res: Response;
  try {
    res = await fetchImpl(config.endpoint, {
      method: 'POST',
      headers: headers(config, accessToken),
      body: JSON.stringify(body),
    });
  } catch (e) {
    return { kind: 'error', message: e instanceof Error ? e.message : 'mrezna greska' };
  }
  if (res.status >= 200 && res.status < 300) {
    const data = (await res.json().catch(() => ({}))) as { requestId?: string | null };
    return { kind: 'ok', requestId: data.requestId ?? null };
  }
  return { kind: 'error', status: res.status, message: `neocekivani odgovor ${res.status}` };
}

/** Upis fakulteta izvan kataloga (stanje C, sekcija 3): facultyId null, slobodni naziv. */
export async function submitUnknownFaculty(
  config: WaitlistConfig,
  input: { name: string; workType: string; email?: string },
  accessToken = '',
  fetchImpl: typeof fetch = fetch,
): Promise<SubmitOutcome> {
  const cell: WaitlistCell = { facultyId: null, facultyName: input.name, program: null, workType: input.workType };
  const body = buildFacultyRequestBody(cell, { email: input.email, source: 'no_faculty' });
  return submitFacultyRequest(config, body, accessToken, fetchImpl);
}

/** Nakndno vezanje e-maila na vec upisan anoniman red. */
export async function attachEmailToRequest(
  config: WaitlistConfig,
  requestId: string | null,
  email: string,
  accessToken = '',
  fetchImpl: typeof fetch = fetch,
): Promise<AttachOutcome> {
  if (!config.endpoint) return { kind: 'skipped', reason: 'not_configured' };
  if (!requestId) return { kind: 'skipped', reason: 'no_request' };
  if (!isLikelyEmail(email)) return { kind: 'error', message: 'neispravan e-mail' };
  let res: Response;
  try {
    res = await fetchImpl(config.endpoint, {
      method: 'POST',
      headers: headers(config, accessToken),
      body: JSON.stringify({ requestId, email: email.trim() }),
    });
  } catch (e) {
    return { kind: 'error', message: e instanceof Error ? e.message : 'mrezna greska' };
  }
  if (res.status >= 200 && res.status < 300) {
    const data = (await res.json().catch(() => ({}))) as { attached?: boolean };
    return { kind: 'ok', attached: !!data.attached };
  }
  return { kind: 'error', status: res.status, message: `neocekivani odgovor ${res.status}` };
}

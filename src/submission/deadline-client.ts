/**
 * Klijentska strana opt-in podsjetnika na rok (ROKOVI_PODSJETNICI.md).
 *
 * Cista funkcija uz injektabilan `fetch` (testabilno bez mreze), isti kroj kao
 * `waitlist-client` i `auth/session`. Bez supabase-js u bundleu: direktan REST
 * (PostgREST) insert u `deadline_subscriptions`. Migracija 0012 ima RLS `insert-own`
 * (with check user_id = auth.uid()), pa je autenticiran insert siguran bez Edge
 * Functiona ni ip-hashiranja; ovo je licni preferens prijavljenog korisnika, ne
 * javni signal. Token dolazi iz `auth/session` (getValidAccessToken).
 */

import type { AcademicDeadlineEntry } from './types';

export interface DeadlineConfig {
  /** Supabase projekt URL; prazno = nije konfigurirano (feature-gate). */
  supabaseUrl: string;
  /** Supabase anon (public) kljuc; ide u apikey header. */
  anonKey: string;
}

export type SubscribeOutcome =
  | { kind: 'ok' }
  | { kind: 'skipped'; reason: 'not_configured' | 'not_authenticated' }
  | { kind: 'error'; status?: number; message: string };

function trimUrl(url: string): string {
  return url.replace(/\/+$/, '');
}

/**
 * Pretplati prijavljenog korisnika na podsjetnik za potvrden rok. `accessToken` je
 * valjan korisnicki Supabase JWT (RLS provjerava da user_id odgovara auth.uid()).
 */
export async function subscribeToDeadline(
  config: DeadlineConfig,
  accessToken: string,
  userId: string,
  entry: AcademicDeadlineEntry,
  fetchImpl: typeof fetch = fetch,
): Promise<SubscribeOutcome> {
  if (!config.supabaseUrl || !config.anonKey) return { kind: 'skipped', reason: 'not_configured' };
  if (!accessToken || !userId) return { kind: 'skipped', reason: 'not_authenticated' };
  let res: Response;
  try {
    res = await fetchImpl(`${trimUrl(config.supabaseUrl)}/rest/v1/deadline_subscriptions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        apikey: config.anonKey,
        Authorization: `Bearer ${accessToken}`,
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        user_id: userId,
        faculty_id: entry.facultyId,
        work_type: entry.workType,
        academic_year: entry.academicYear,
        deadline_date: entry.deadlineDate,
        deadline_source: entry.source,
      }),
    });
  } catch (e) {
    return { kind: 'error', message: e instanceof Error ? e.message : 'mrezna greska' };
  }
  if (res.status >= 200 && res.status < 300) return { kind: 'ok' };
  return { kind: 'error', status: res.status, message: `neocekivani odgovor ${res.status}` };
}

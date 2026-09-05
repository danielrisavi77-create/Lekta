/**
 * Kanal A, klijent za "Moji popravci": popis vlastitih AKTIVNIH priloga korpusu i povlacenje privole.
 *
 * Popis ide izravno na PostgREST s korisnickim JWT-om (RLS `corpus_contributions_select_own`), povlacenje na Edge
 * funkciju `withdraw-corpus-contribution`, koja brise kopiju pa oznacava redak. Cisti fetch + JWT, kao i ostatak
 * `src/report`. Nikad ne baca prema sucelju zbog mreze: popis vraca prazno, povlacenje vraca `{ ok: false }`.
 */

export interface CorpusContributionConfig {
  supabaseUrl: string;
  anonKey: string;
  withdrawEndpoint: string;
}

export interface CorpusContributionRef {
  id: string;
  repairJobId: string | null;
  createdAt: string;
}

export function corpusContributionConfigFrom(config: { supabaseUrl?: unknown; supabaseAnonKey?: unknown }): CorpusContributionConfig {
  const supabaseUrl = String(config?.supabaseUrl ?? '').trim().replace(/\/+$/, '');
  return {
    supabaseUrl,
    anonKey: String(config?.supabaseAnonKey ?? '').trim(),
    withdrawEndpoint: supabaseUrl ? `${supabaseUrl}/functions/v1/withdraw-corpus-contribution` : '',
  };
}

/** Aktivni (nepovuceni) prilozi prijavljenog korisnika. Prazan popis i kad konfiguracije nema ili poziv padne. */
export async function fetchActiveCorpusContributions(
  config: CorpusContributionConfig,
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<CorpusContributionRef[]> {
  if (!config.supabaseUrl || !config.anonKey || !accessToken) return [];
  try {
    const url = `${config.supabaseUrl}/rest/v1/corpus_contributions?select=id,repair_job_id,created_at&withdrawn_at=is.null&order=created_at.desc`;
    const res = await fetchImpl(url, { headers: { apikey: config.anonKey, Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) return [];
    const rows = (await res.json()) as unknown;
    if (!Array.isArray(rows)) return [];
    return rows
      .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object' && typeof (r as Record<string, unknown>).id === 'string')
      .map((r) => ({
        id: String(r.id),
        repairJobId: typeof r.repair_job_id === 'string' ? r.repair_job_id : null,
        createdAt: typeof r.created_at === 'string' ? r.created_at : '',
      }));
  } catch {
    return [];
  }
}

export type WithdrawOutcome = { ok: true; alreadyWithdrawn: boolean } | { ok: false; error: string };

export async function withdrawCorpusContribution(
  config: CorpusContributionConfig,
  accessToken: string,
  contributionId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<WithdrawOutcome> {
  if (!config.withdrawEndpoint || !accessToken) return { ok: false, error: 'not_configured' };
  try {
    const res = await fetchImpl(config.withdrawEndpoint, {
      method: 'POST',
      headers: { apikey: config.anonKey, Authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ contributionId }),
    });
    const body = (await res.json().catch(() => null)) as { ok?: unknown; error?: unknown; alreadyWithdrawn?: unknown } | null;
    if (res.ok && body?.ok === true) return { ok: true, alreadyWithdrawn: body.alreadyWithdrawn === true };
    return { ok: false, error: typeof body?.error === 'string' ? body.error : `http_${res.status}` };
  } catch {
    return { ok: false, error: 'network' };
  }
}

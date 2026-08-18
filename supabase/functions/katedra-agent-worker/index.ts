import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.2';
import { isCronAuthorized } from '../_shared/cron-auth.ts';
import { dispatchAgentRuns } from './dispatcher.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CRON_SECRET = Deno.env.get('KATEDRA_AGENT_WORKER_CRON_SECRET');
const APP_URL = String(Deno.env.get('KATEDRA_WORKER_APP_URL') || '').replace(/\/$/, '');
const WORKER_TOKEN = Deno.env.get('KATEDRA_AGENT_WORKER_TOKEN') || '';
const DEFAULT_BATCH = 4;
const MAX_BATCH = 10;
const MAX_RUNS_PER_TICK = normalizeBatch(Deno.env.get('KATEDRA_AGENT_WORKER_BATCH'));

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

Deno.serve(async (req) => {
  if (!isCronAuthorized(req, CRON_SECRET)) return json({ error: 'unauthorized' }, 401);
  if (!APP_URL || !WORKER_TOKEN) return json({ error: 'worker_dispatcher_not_configured' }, 503);

  /**
   * ATOMSKO PREUZIMANJE RUNOVA (audit OPS-18, OPS-20).
   *
   * Prije se runovi samo CITALI (`select` po statusu), pa su dva ticka, ili cron i rucno
   * okidanje, vidjeli isti skup i oba ga dispatchala. Uz to je djelomican neuspjeh vracao 502,
   * pa bi ponovni pokusaj ponovno poslao i one runove koji su vec uspjeli.
   *
   * Preuzimanje je UPDATE s uvjetom `updated_at < cutoff`: run se smatra zauzetim LEASE_MS nakon
   * sto ga netko dohvati. Drugi tick tada vise ne vidi te retke, jer im je `updated_at` upravo
   * pomaknut. Ne treba nova kolona ni migracija; koristi se ista kolona po kojoj se ionako
   * sortira.
   */
  const LEASE_MS = 10 * 60 * 1000;
  const cutoff = new Date(Date.now() - LEASE_MS).toISOString();

  const { data: candidates, error } = await supabase
    .from('agent_runs')
    .select('run_id, updated_at')
    .in('status', ['pending', 'running'])
    .lt('updated_at', cutoff)
    .order('updated_at', { ascending: true })
    .limit(MAX_RUNS_PER_TICK);
  if (error) return json({ error: 'run_queue_unavailable' }, 503);

  const candidateIds = (candidates || []).map((r) => r.run_id).filter((id): id is string => typeof id === 'string');
  if (!candidateIds.length) return json({ dispatched: 0, failed: 0, deferred: 0, claimed: 0 }, 200);

  // Uvjet `lt(cutoff)` se PONAVLJA u updateu: samo tako je preuzimanje stvarno atomicno. Tick koji
  // je u medjuvremenu preuzeo iste retke vec im je pomaknuo updated_at, pa ih ovaj vise ne dobiva.
  const { data: claimed, error: claimErr } = await supabase
    .from('agent_runs')
    .update({ updated_at: new Date().toISOString() })
    .in('run_id', candidateIds)
    .lt('updated_at', cutoff)
    .select('run_id');
  if (claimErr) return json({ error: 'run_claim_failed' }, 503);

  const runs = claimed || [];
  if (!runs.length) return json({ dispatched: 0, failed: 0, deferred: 0, claimed: 0 }, 200);

  // Budzet ticka drzi trajanje ispod Edge runtime limita (OPS-19): serijska petlja s 180 s po runu
  // mogla je inace trajati do 30 minuta.
  const TICK_BUDGET_MS = 100_000;
  const dispatched = await dispatchAgentRuns(runs, {
    appUrl: APP_URL,
    workerToken: WORKER_TOKEN,
    timeoutMs: 45_000,
    maxRuns: MAX_RUNS_PER_TICK,
    deadlineAt: Date.now() + TICK_BUDGET_MS,
  });

  // 200 i kod djelomicnog neuspjeha (OPS-20): 502 je navodio cron i monitoring na ponavljanje
  // CIJELOG ticka, cime bi se vec uspjeli runovi dispatchali drugi put. Neuspjeli runovi se
  // ionako sami vrate u red kad im lease istekne, pa ponavljanje nije potrebno.
  return json(
    {
      dispatched: dispatched.results.length,
      failed: dispatched.failed,
      deferred: dispatched.deferred,
      claimed: runs.length,
    },
    200,
  );
});

function normalizeBatch(value: string | undefined): number {
  const parsed = Number(value || DEFAULT_BATCH);
  if (!Number.isFinite(parsed)) return DEFAULT_BATCH;
  return Math.min(MAX_BATCH, Math.max(1, Math.trunc(parsed)));
}


function json(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

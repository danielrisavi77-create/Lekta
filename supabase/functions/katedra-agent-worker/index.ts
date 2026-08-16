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

  const { data: runs, error } = await supabase
    .from('agent_runs')
    .select('run_id')
    .in('status', ['pending', 'running'])
    .order('updated_at', { ascending: true })
    .limit(MAX_RUNS_PER_TICK);
  if (error) return json({ error: 'run_queue_unavailable' }, 503);

  const dispatched = await dispatchAgentRuns(runs || [], {
    appUrl: APP_URL,
    workerToken: WORKER_TOKEN,
    timeoutMs: 180_000,
    maxRuns: MAX_RUNS_PER_TICK,
  });
  return json({ dispatched: dispatched.results.length, failed: dispatched.failed }, dispatched.failed ? 502 : 200);
});

function normalizeBatch(value: string | undefined): number {
  const parsed = Number(value || DEFAULT_BATCH);
  if (!Number.isFinite(parsed)) return DEFAULT_BATCH;
  return Math.min(MAX_BATCH, Math.max(1, Math.trunc(parsed)));
}


function json(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

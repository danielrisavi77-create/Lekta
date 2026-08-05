// Lekta Edge Function: preflight-result (Deno, Supabase).
// Provjera prije predaje, korak 3: polling + JEDINI izlaz nalaza prema
// klijentu. Puni forenzicki nalaz zivi u preflight_results_full (service-role
// only, nijedna RLS policy za authenticated) i studentu se NIKAD ne vraca
// sirov: ovdje se filtrira kroz src/preflight/tier-filter.ts (deny-by-default
// allowlista; RSID, TotalTime i jednosesijski tragovi ostaju mentorska razina).
//
// Depth (teaser/full): v1 soft-launch je 'full' za sve. Paywall grana je
// ugradjena i USPAVANA: PREFLIGHT_REQUIRE_ENTITLEMENT='true' pali teaser rez
// za korisnike bez aktivnog entitlementa (isti MVP gate kao integrity-check).
//
// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.2';
import { corsHeadersFor } from '../_shared/cors.ts';
import {
  filterReportForTier,
  type PreflightReport,
} from '../../../src/preflight/tier-filter.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const REQUIRE_ENTITLEMENT =
  (Deno.env.get('PREFLIGHT_REQUIRE_ENTITLEMENT') ?? '') === 'true';

const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGIN') ?? 'https://lektahr.netlify.app')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

function json(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeadersFor(origin, ALLOWED_ORIGINS),
      'content-type': 'application/json',
    },
  });
}

Deno.serve(async (req: Request) => {
 const origin = req.headers.get('origin');
 try {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeadersFor(origin, ALLOWED_ORIGINS) });
  }
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, origin);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
  const authHeader = req.headers.get('Authorization') ?? '';
  const { data: userData } = await admin.auth.getUser(authHeader.replace(/^Bearer\s+/i, ''));
  const user = userData?.user;
  if (!user) return json({ error: 'unauthorized' }, 401, origin);

  let body: any = null;
  try { body = await req.json(); } catch { body = null; }
  const jobId = typeof body?.jobId === 'string' ? body.jobId : '';
  if (!jobId) return json({ error: 'bad_request' }, 400, origin);

  // Vlasnistvo se provjerava eksplicitno (service role zaobilazi RLS).
  const { data: rows } = await admin
    .from('preflight_checks')
    .select('id, status, error_code, retention_expires_at, pipeline_version')
    .eq('id', jobId)
    .eq('user_id', user.id)
    .limit(1);
  const check = rows?.[0];
  if (!check) return json({ error: 'not_found' }, 404, origin);

  if (check.status === 'pending' || check.status === 'running') {
    return json({ status: check.status }, 200, origin);
  }
  if (check.status === 'error') {
    return json({ status: 'error', errorCode: check.error_code ?? 'unknown' }, 200, origin);
  }

  // done: nalaz mozda vise ne postoji (7d retencija, purge_preflight_results)
  if (new Date(check.retention_expires_at).getTime() <= Date.now()) {
    return json({ status: 'expired' }, 200, origin);
  }
  const { data: fullRows } = await admin
    .from('preflight_results_full')
    .select('result_full')
    .eq('check_id', jobId)
    .limit(1);
  const full = fullRows?.[0]?.result_full as PreflightReport | undefined;
  if (!full) return json({ status: 'expired' }, 200, origin);

  // Teaser/full granica NA SERVERU (uspavana dok se naplata ne upali).
  let depth: 'teaser' | 'full' = 'full';
  if (REQUIRE_ENTITLEMENT) {
    const { data: ent } = await admin
      .from('entitlements')
      .select('id')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .gt('purchase_expires_at', new Date().toISOString())
      .limit(1);
    if (!ent || ent.length === 0) depth = 'teaser';
  }

  const report = filterReportForTier(full, 'student', depth);
  return json({ status: 'done', depth, report }, 200, origin);
 } catch (e) {
  console.error('[preflight-result]', e);
  return json({ error: 'internal' }, 500, origin);
 }
});

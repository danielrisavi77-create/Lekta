// Lekta Edge Function: analytics-event (Deno, Supabase).
// Sink za prvostrane (first-party) klijentske analytics dogadjaje (trackEvent u src/ui/app.ts).
// ANONIMAN upis, isti obrazac kao faculty-request: deploy s --no-verify-jwt, nema 401 grane.
//
// Klijent vec allowlista podatke prije slanja (sanitizeEventData u app.ts), ali servis NIKAD ne
// vjeruje klijentu: primljeni payload se ovdje ponovno propusta kroz ISTI allowlist (obrana u dubinu
// protiv izravnog POST-a mimo aplikacije). Bez ip_hash-a ili bilo kojeg osobnog identifikatora u
// upisanom retku; ip_hash se koristi SAMO prolazno za rate limit (claim_ip_rate_slot, 0022).
//
// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.2';
import { corsHeadersFor } from '../_shared/cors.ts';
import { hashClientIpSalted } from '../_shared/hash-ip.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const IP_HASH_SALT = Deno.env.get('IP_HASH_SALT') ?? '';
// Velikodusan cap: dijeljeni fakultetski NAT moze imati stotine istovremenih posjetitelja, a
// jedna sesija lako generira desetak dogadjaja (file_selected, analysis_started, result_shown...).
const DAILY_CAP_IP = Number(Deno.env.get('ANALYTICS_DAILY_CAP_IP') ?? '2000');

const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGIN') ?? 'https://lektahr.netlify.app')
  .split(',').map((s) => s.trim()).filter(Boolean);

const MAX_BODY = 4 * 1024;
const EVENT_RE = /^[a-z][a-z0-9_]{0,59}$/;

// ISTI allowlist kao sanitizeEventData (src/ui/app.ts): samo primitivne, unaprijed poznate
// dimenzije prezive. Prosiruj OBA mjesta zajedno kad novi trackEvent poziv treba novo polje.
const ALLOWED_DATA_KEYS = new Set([
  'package', 'profileId', 'workType', 'scoreBand', 'provider', 'source',
  'total', 'found', 'missing', 'flagged', 'checked',
  'profileStatus', 'pick', 'sizeBucket', 'category', 'issueCount', 'kind',
  'manual', 'count', 'score', 'demo', 'method', 'product', 'ruleId',
  'changes', 'stored', 'ms',
]);

function sanitizeData(input: any): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  if (!input || typeof input !== 'object') return out;
  for (const [k, v] of Object.entries(input)) {
    if (!ALLOWED_DATA_KEYS.has(k)) continue;
    if (typeof v !== 'string' && typeof v !== 'number' && typeof v !== 'boolean') continue;
    if (typeof v === 'string' && v.length > 200) continue;
    out[k] = v;
  }
  return out;
}

Deno.serve(async (req: Request) => {
  const cors = corsHeadersFor(req.headers.get('Origin'), ALLOWED_ORIGINS);
  const json = (body: unknown, status = 200): Response =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } });
  try {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
    if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

    const clen = Number(req.headers.get('content-length') ?? '0');
    if (clen && clen > MAX_BODY) return json({ error: 'payload_too_large' }, 413);
    const raw = await req.text();
    if (raw.length > MAX_BODY) return json({ error: 'payload_too_large' }, 413);
    let body: any = null;
    try { body = JSON.parse(raw); } catch { body = null; }

    const event = typeof body?.event === 'string' ? body.event : '';
    if (!EVENT_RE.test(event)) return json({ error: 'bad_request' }, 400);
    const path = typeof body?.path === 'string' ? body.path.slice(0, 200) : null;
    const appVersion = typeof body?.version === 'string' ? body.version.slice(0, 20) : null;
    const data = sanitizeData(body);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

    const ipHash = await hashClientIpSalted(req.headers.get('x-forwarded-for'), IP_HASH_SALT, SERVICE_ROLE);
    const { data: ipOk } = await admin.rpc('claim_ip_rate_slot', {
      p_scope: 'analytics',
      p_ip_hash: ipHash,
      p_daily_cap: DAILY_CAP_IP,
    });
    if (ipOk !== true) return json({ ok: true, stored: false }, 200); // tiho odbij, isti obrazac kao faculty-request

    const { error } = await admin.from('analytics_events').insert({
      event, path, app_version: appVersion, data,
    });
    if (error) {
      console.error('[analytics-event] insert', error.code ?? error);
      // 202, ne 200 (audit SEC-13). Klijent i dalje nije srusen (telemetrija nije kriticni put),
      // ali monitoring sada moze razlikovati zapisan dogadjaj od izgubljenog. Dok je i neuspjeh
      // vracao 200, endpoint je skrivao vlastite kvarove: gubitak cijele telemetrije izgledao je
      // izvana jednako kao uredan rad.
      return json({ ok: true, stored: false, reason: 'insert_failed' }, 202);
    }

    return json({ ok: true, stored: true }, 200);
  } catch (e) {
    console.error('[analytics-event]', e);
    return json({ ok: true, stored: false, reason: 'unhandled' }, 202);
  }
});

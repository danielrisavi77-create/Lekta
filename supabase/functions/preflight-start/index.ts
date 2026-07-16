// Lekta Edge Function: preflight-start (Deno, Supabase).
// Provjera prije predaje, korak 1: gate + izdavanje jednokratne propusnice.
// Edge NIJE u data-pathu datoteke (50 MB + 15-150 s obrade probija Edge
// limite): browser uploada IZRAVNO na Python servis s HMAC tokenom koji ova
// funkcija minta NAKON autha, privole i rate limita. Token nije tajna servisa;
// on je propusnica za tocno jedan job, a jednokratnost garantira atomski DB
// flip pending->running na Python strani (in-memory nonce je fikcija pod
// autoscaleom).
//
// Tok: auth (getUser) -> privola (kanonski PreflightConsent iz src/preflight)
// -> kill switch -> caps (dnevni per-user i per-IP; partial unique index u
// 0019 atomski brani paralelne jobove) -> dedup po sha256+verziji -> INSERT
// pending (service role, s privolom) -> mint token -> {jobId, uploadUrl, token}.
//
// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.2';
import { corsHeadersFor } from '../_shared/cors.ts';
import { hashClientIpSalted } from '../_shared/hash-ip.ts';
import {
  isValidPreflightConsent,
  PREFLIGHT_RESULT_RETENTION_DAYS,
} from '../../../src/preflight/preflight-consent.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SERVICE_URL = Deno.env.get('PREFLIGHT_SERVICE_URL') ?? '';
const UPLOAD_SECRET = Deno.env.get('PREFLIGHT_UPLOAD_SECRET') ?? '';
const IP_HASH_SALT = Deno.env.get('IP_HASH_SALT') ?? '';
const DISABLED = (Deno.env.get('PREFLIGHT_DISABLED') ?? '') === 'true';
const DAILY_CAP_USER = Number(Deno.env.get('PREFLIGHT_DAILY_CAP_USER') ?? '3');
const DAILY_CAP_IP = Number(Deno.env.get('PREFLIGHT_DAILY_CAP_IP') ?? '10');
const MAX_UPLOAD_MB = Number(Deno.env.get('PREFLIGHT_MAX_UPLOAD_MB') ?? '30');
const MAX_REFS = Number(Deno.env.get('PREFLIGHT_MAX_REFS') ?? '50');
const TOKEN_TTL_S = 15 * 60;
const MAX_BODY = 32 * 1024; // JSON meta + privola, bez datoteke

const ALLOWED_ORIGINS = ['https://lektahr.netlify.app'];

function json(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeadersFor(origin, ALLOWED_ORIGINS),
      'content-type': 'application/json',
    },
  });
}

function b64url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Paritet s lekta_pipeline/server/ticket.py: HMAC-SHA256 nad base64url
// STRINGOM payloada (ASCII bajtovi), pa Deno i Python ne moraju kanonizirati
// JSON identicno.
async function mintToken(payload: unknown, secret: string): Promise<string> {
  const body = b64url(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body)));
  return `${body}.${b64url(sig)}`;
}

Deno.serve(async (req: Request) => {
 const origin = req.headers.get('origin');
 try {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeadersFor(origin, ALLOWED_ORIGINS) });
  }
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, origin);
  if (DISABLED || !SERVICE_URL || !UPLOAD_SECRET) {
    // Kill switch / nekonfigurirano: iskljuceno bez deploya, klijent inertan.
    return json({ error: 'disabled' }, 503, origin);
  }

  // 1. auth: prijavljen korisnik (i u soft-launchu; 15-150 s computea nije anon)
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
  const authHeader = req.headers.get('Authorization') ?? '';
  const { data: userData } = await admin.auth.getUser(authHeader.replace(/^Bearer\s+/i, ''));
  const user = userData?.user;
  if (!user) return json({ error: 'unauthorized' }, 401, origin);

  // 2. body + privola (bez valjane privole se NE kreira job)
  const clen = Number(req.headers.get('content-length') ?? '0');
  if (clen > MAX_BODY) return json({ error: 'payload_too_large' }, 413, origin);
  const raw = await req.text();
  if (raw.length > MAX_BODY) return json({ error: 'payload_too_large' }, 413, origin);
  let body: any = null;
  try { body = JSON.parse(raw); } catch { body = null; }
  const consent = body?.consent;
  if (!body || !isValidPreflightConsent(consent)) {
    return json({ error: 'bad_request' }, 400, origin);
  }
  const fileSize = Number(body.fileSize ?? 0);
  const fileSha256 = typeof body.fileSha256 === 'string' ? body.fileSha256.slice(0, 64) : '';
  const maxBytes = MAX_UPLOAD_MB * 1024 * 1024;
  if (!fileSize || fileSize > maxBytes) {
    return json({ error: 'payload_too_large', maxBytes }, 413, origin);
  }

  // 3. dnevni capovi. Per-USER cap ostaje COUNT-pa-INSERT: partial unique index u
  //    0019 (po user_id) atomski jamci <=1 AKTIVAN job po korisniku, pa su zahtjevi
  //    istog korisnika serijalizirani i dnevni COUNT ih stigne uhvatiti (TOCTOU je
  //    benigni). Per-IP cap je SADA atomican (AUD-27): claim_ip_rate_slot (0022)
  //    rezervira slot pod row-lockom umjesto ranijeg stale COUNT-a nad ip_hash, pa
  //    vise RAZLICITIH racuna s istog IP-a vise ne moze paralelno proci ispod capa.
  const now = new Date();
  const dayAgo = new Date(now.getTime() - 24 * 3600 * 1000).toISOString();
  const { count: userCount } = await admin
    .from('preflight_checks')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .gt('created_at', dayAgo);
  if ((userCount ?? 0) >= DAILY_CAP_USER) return json({ error: 'rate_limited' }, 429, origin);

  const ipHash = await hashClientIpSalted(
    req.headers.get('x-forwarded-for'), IP_HASH_SALT, SERVICE_ROLE);
  // AUD-27: atomicna rezervacija per-IP dnevnog slota (0022). Zamjenjuje raniji
  // ne-atomicni COUNT nad preflight_checks.ip_hash. claim_ip_rate_slot radi ON
  // CONFLICT increment WHERE count < cap pod row-lockom, pa nema TOCTOU. Ugovor:
  // true = dopusteno; false / error / null = tretiraj kao odbijeno (429). ipHash
  // se i dalje upisuje u preflight_checks.insert nize.
  const { data: ipOk } = await admin.rpc('claim_ip_rate_slot', {
    p_scope: 'preflight',
    p_ip_hash: ipHash,
    p_daily_cap: DAILY_CAP_IP,
  });
  if (ipOk !== true) return json({ error: 'rate_limited' }, 429, origin);

  // 4. dedup: isti korisnik + ista datoteka + jos zivi nalaz -> vrati postojeci
  //    job bez novog computea (ponovljeni pregled je besplatan i trenutan)
  if (fileSha256) {
    const { data: existing } = await admin
      .from('preflight_checks')
      .select('id')
      .eq('user_id', user.id)
      .eq('file_sha256', fileSha256)
      .eq('status', 'done')
      .gt('retention_expires_at', now.toISOString())
      .order('created_at', { ascending: false })
      .limit(1);
    if (existing && existing.length === 1) {
      return json({ jobId: existing[0].id, dedup: true }, 200, origin);
    }
  }

  // 5. kreiraj pending job (service role; privola se trajno biljezi)
  const retentionExpires = new Date(
    now.getTime() + PREFLIGHT_RESULT_RETENTION_DAYS * 24 * 3600 * 1000).toISOString();
  const { data: inserted, error: insErr } = await admin
    .from('preflight_checks')
    .insert({
      user_id: user.id,
      consent,
      ip_hash: ipHash,
      work_type: typeof body.workType === 'string' ? body.workType : null,
      lang: typeof body.lang === 'string' ? body.lang : 'hr',
      file_sha256: fileSha256 || null,
      file_size_bytes: fileSize,
      retention_expires_at: retentionExpires,
    })
    .select('id')
    .single();
  if (insErr || !inserted) {
    // 23505 = partial unique index: vec postoji aktivan job ovog korisnika.
    if ((insErr as any)?.code === '23505') return json({ error: 'job_active' }, 409, origin);
    console.error('[preflight-start] insert', insErr?.code ?? insErr);
    return json({ error: 'internal' }, 500, origin);
  }

  // 6. jednokratna propusnica za upload izravno na Python servis
  const token = await mintToken({
    v: 1,
    job_id: inserted.id,
    uid: user.id,
    exp: Math.floor(now.getTime() / 1000) + TOKEN_TTL_S,
    max_bytes: maxBytes,
    max_refs: MAX_REFS,
  }, UPLOAD_SECRET);

  return json({
    jobId: inserted.id,
    uploadUrl: SERVICE_URL.replace(/\/$/, '') + '/v1/check',
    uploadToken: token,
    expiresInS: TOKEN_TTL_S,
    maxBytes,
  }, 200, origin);
 } catch (e) {
  console.error('[preflight-start]', e);
  return json({ error: 'internal' }, 500, origin);
 }
});

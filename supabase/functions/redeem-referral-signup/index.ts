// supabase/functions/redeem-referral-signup/index.ts
//
// Poziva klijent ODMAH nakon uspjesne registracije/potvrde e-maila, SAMO ako postoji
// zapamcen referral kod iz landing posjeta (?ref, vidi src/referral). Zahtijeva JWT
// (korisnik je vec prijavljen). Pise u referral_signups (0013), status 'signed_up'.
//
// Deploy: supabase functions deploy redeem-referral-signup   (BEZ --no-verify-jwt: treba JWT)
// Env: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, IP_HASH_SALT

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.2';

import { hashClientIpSalted } from '../_shared/hash-ip.ts';
import { corsHeadersFor } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
// Bez dediciranog IP_HASH_SALT derivira se stabilan salt iz service-role kljuca (hash-ip.ts),
// pa ip_hash nikad nije nesoljen (security-02); ista derivacija kao generate-report.
const IP_HASH_SALT = Deno.env.get('IP_HASH_SALT') ?? '';

// Dopusteno CORS porijeklo (SEC-05): produkcijska domena; override preko ALLOWED_ORIGIN (zarezom
// odvojeno). Localhost je uvijek dopusten (dev). Reflektira se u corsHeadersFor (nikad '*'), isti
// obrazac kao faculty-request/preflight-start.
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGIN') ?? 'https://lektahr.netlify.app')
  .split(',').map((s) => s.trim()).filter(Boolean);

Deno.serve(async (req: Request) => {
  const cors = corsHeadersFor(req.headers.get('Origin'), ALLOWED_ORIGINS);
  const jsonResponse = (body: unknown, status: number): Response =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return jsonResponse({ ok: false }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return jsonResponse({ ok: false, reason: 'unauthenticated' }, 401);

  // Klijent inicijaliziran s korisnikovim JWT-om, da auth.getUser() vrati PRAVI identitet.
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userAuth, error: userError } = await userClient.auth.getUser();
  if (userError || !userAuth?.user) return jsonResponse({ ok: false, reason: 'unauthenticated' }, 401);

  const currentUserId = userAuth.user.id;

  let body: { code?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ ok: false }, 400);
  }

  const code = (body.code ?? '').trim().toUpperCase();
  if (!code) return jsonResponse({ ok: false }, 400);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: codeRow } = await supabase
    .from('referral_codes')
    .select('user_id')
    .eq('code', code)
    .maybeSingle();

  // Nepoznat kod: tiho ok, ne otkrivaj klijentu je li kod ikad postojao.
  if (!codeRow) return jsonResponse({ ok: true, reason: 'invalid_code' }, 200);

  if (codeRow.user_id === currentUserId) {
    // Self-referral: tiho ignoriraj (fail-safe, ne fail-loud prema korisniku).
    return jsonResponse({ ok: true, reason: 'self_referral_ignored' }, 200);
  }

  // Dedupe: osoba moze biti "referred" samo jednom ikad (i unique index to jamci).
  const { data: existing } = await supabase
    .from('referral_signups')
    .select('id')
    .eq('referred_user_id', currentUserId)
    .maybeSingle();

  if (existing) return jsonResponse({ ok: true, reason: 'already_referred' }, 200);

  // Isti kanonski hash (ekstrakcija + izvedeni salt) kao generate-report, inace fraud usporedba pada.
  const ipHash = await hashClientIpSalted(req.headers.get('x-forwarded-for'), IP_HASH_SALT, SERVICE_ROLE_KEY);

  const { error: insertError } = await supabase.from('referral_signups').insert({
    referrer_user_id: codeRow.user_id,
    code,
    referred_user_id: currentUserId,
    referred_ip_hash: ipHash,
    status: 'signed_up',
    signed_up_at: new Date().toISOString(),
  });

  if (insertError) return jsonResponse({ ok: false }, 500);

  return jsonResponse({ ok: true }, 200);
});

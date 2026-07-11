// Lekta Edge Function: faculty-request (Deno, Supabase).
// Spec: WAITLIST_NEPOKRIVENI_FAKULTETI.md sekcije 4, 5, 6. Signal potraznje za nepokrivene
// fakultete + opcionalni kontakt za obavijest. ANONIMAN upis je dopusten (za razliku od
// checkout funkcija): deploy s `--no-verify-jwt`, a funkcija sama opcionalno razrijesi JWT.
//
// Dvije akcije, razlucene poljem `requestId`:
//   bez requestId  -> novi upis (submit_faculty_request), vraca { requestId }.
//   s requestId    -> naknadno vezanje e-maila (attach_email_to_faculty_request), vraca { attached }.
// ip_hash se racuna SERVERSKI iz x-forwarded-for (nikad sirovi IP, isto kao generate-report),
// uz TAJNI salt (IP_HASH_SALT ili izveden iz service-role kljuca) da sha256 ne bude reverzibilan.
// Rate limit i upis su u SQL security-definer funkcijama (0011), ovdje je samo I/O omotac.
//
// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json' } });
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// IP hash salt (GDPR): bez salta je sha256(IPv4) reverzibilan brute-forceom 2^32 prostora.
// Prioritet: dedicirani IP_HASH_SALT (`supabase secrets set IP_HASH_SALT=...`); ako nije
// postavljen, izvedi salt iz service-role kljuca ali HASHIRAN (ne sirovi kljuc) pa ip_hash
// NIKAD nije nesoljen ni prije nego korisnik postavi dedicirani secret. Salt je stabilan.
const IP_HASH_SALT_ENV = Deno.env.get('IP_HASH_SALT') ?? '';
let _ipSalt: Promise<string> | null = null;
function ipSalt(): Promise<string> {
  if (IP_HASH_SALT_ENV) return Promise.resolve(IP_HASH_SALT_ENV);
  if (!_ipSalt) _ipSalt = sha256Hex('lekta-ip-hash-salt|' + SERVICE_ROLE);
  return _ipSalt;
}

const WORK_TYPES = ['seminarski', 'zavrsni', 'diplomski', 'doktorski'];
const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

Deno.serve(async (req: Request) => {
 try {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  // input guard: odbij predimenzioniran payload prije parsiranja
  const MAX_BODY = 8 * 1024;
  const clen = Number(req.headers.get('content-length') ?? '0');
  if (clen && clen > MAX_BODY) return json({ error: 'payload_too_large' }, 413);
  const raw = await req.text();
  if (raw.length > MAX_BODY) return json({ error: 'payload_too_large' }, 413);
  let body: any = {};
  try { body = JSON.parse(raw); } catch { body = {}; }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  // OPCIONALAN auth: prijavljeni korisnik salje svoj JWT (getUser ga razrijesi); anoniman
  // salje anon kljuc (getUser vrati null) pa je user_id null. Nema 401 grane.
  let userId: string | null = null;
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (token) {
    const { data } = await admin.auth.getUser(token);
    userId = data?.user?.id ?? null;
  }

  // grana: vezanje e-maila na postojeci red
  if (body.requestId) {
    const email = String(body.email ?? '').trim();
    if (!isEmail(email)) return json({ error: 'bad_email' }, 400);
    const { data: attached, error } = await admin.rpc('attach_email_to_faculty_request', {
      p_request_id: String(body.requestId),
      p_email: email.slice(0, 320),
    });
    if (error) return json({ error: 'attach_failed' }, 500);
    return json({ ok: true, attached: !!attached });
  }

  // grana: novi upis (anoniman ili s e-mailom)
  const facultyId = body.facultyId ? String(body.facultyId).slice(0, 120) : null;
  const facultyNameRaw = body.facultyName ? String(body.facultyName).slice(0, 200) : null;
  if (!facultyId && !facultyNameRaw) return json({ error: 'bad_request' }, 400);
  const programId = body.programId ? String(body.programId).slice(0, 200) : null;
  const workTypeRaw = body.workType ? String(body.workType) : null;
  const workType = workTypeRaw && WORK_TYPES.includes(workTypeRaw) ? workTypeRaw : null;
  const emailIn = String(body.email ?? '').trim();
  const email = emailIn && isEmail(emailIn) ? emailIn.slice(0, 320) : null;
  const source = body.source ? String(body.source).slice(0, 40) : 'upload_flow';
  const ipHash = await sha256Hex((await ipSalt()) + '|' + (req.headers.get('x-forwarded-for') ?? ''));

  const { data: requestId, error } = await admin.rpc('submit_faculty_request', {
    p_faculty_id: facultyId,
    p_faculty_name_raw: facultyNameRaw,
    p_program_id: programId,
    p_work_type: workType,
    p_user_id: userId,
    p_email: email,
    p_source: source,
    p_ip_hash: ipHash,
  });
  if (error) return json({ error: 'insert_failed' }, 500);

  // requestId je null kad je rate limit odbio upis: klijentu i dalje vracamo ok (tiho, sekcija 6).
  return json({ ok: true, requestId: requestId ?? null });
 } catch (e) {
  console.error('[faculty-request]', e); // Edge Function logovi = error tracking (P0 8-1)
  return json({ error: 'internal' }, 500);
 }
});

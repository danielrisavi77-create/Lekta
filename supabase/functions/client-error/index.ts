// Lekta Edge Function: client-error (Deno, Supabase).
//
// Prvostrana sabirnica klijentskih gresaka (audit P1-28, migracija 0101).
//
// ZASTO POSTOJI. `errorEndpoint` je u `DEFAULT_PRODUCTION_CONFIG` bio PRAZAN, pa je
// `installErrorTracking` u app.ts skupljao greske i nikamo ih nije slao. Greska koja se dogodi SAMO
// korisniku (odredjen preglednik, odredjen dokument, spora mreza) ostajala je u njegovoj konzoli i
// tim za nju nikad nije saznao.
//
// SIGURNOST PODATAKA JE OVDJE VAZNIJA OD DIJAGNOSTIKE. Poruka i stack su SLOBODAN tekst, za razliku
// od analitike gdje allowlist kljuceva rjesava sve. Zato:
//   - `buildErrorReport` (src/report/error-redaction.ts) redaktira i ODBACUJE svako polje izvan
//     dogovorenog oblika. Isti modul vrti i klijent prije slanja; ovo je obrana u dubinu, isti
//     obrazac koji analytics-event vec primjenjuje ("servis NIKAD ne vjeruje klijentu"), pa izravan
//     POST mimo aplikacije prolazi kroz istu redakciju.
//   - IP se koristi SAMO prolazno za rate limit i NE SPREMA se, ni kao hash.
//   - `user_id` se ne trazi ni ne sprema. Korelacija ide preko `incidentId` koji korisnik sam
//     procita podrsci.
//
// Anoniman upis, `verify_jwt = false`: greska se cesto dogodi PRIJE nego korisnik uopce ima sesiju,
// a upravo su te greske najzanimljivije.
//
// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.2';
import { corsHeadersFor } from '../_shared/cors.ts';
import { hashClientIpSalted } from '../_shared/hash-ip.ts';
import { readTextBounded } from '../_shared/read-body.ts';
import { buildErrorReport, makeIncidentId, INCIDENT_ID_RE } from '../../../src/report/error-redaction.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const IP_HASH_SALT = Deno.env.get('IP_HASH_SALT') ?? '';
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGIN') ?? 'https://lektahr.netlify.app')
  .split(',').map((s) => s.trim()).filter(Boolean);

// Jedan pokvaren build moze generirati gresku po svakom kliku. Cap je zato po IP-u i dnevni; sam
// klijent se dodatno zaustavlja nakon 20 gresaka po ucitavanju stranice (`_errSent` u app.ts).
const DAILY_CAP_IP = Number(Deno.env.get('CLIENT_ERROR_DAILY_CAP_IP') ?? '200');

// Tijelo je jedan mali zapis; sve preko toga je ili greska ili napad (audit P1-04).
const MAX_BODY = 8 * 1024;

/** Obitelj preglednika iz UA, NIKAD puni UA: puni UA je otisak uredjaja. */
function browserFamily(ua: string | null): string {
  const s = String(ua ?? '');
  if (/Firefox\//.test(s)) return 'firefox';
  if (/Edg\//.test(s)) return 'edge';
  if (/OPR\//.test(s)) return 'opera';
  if (/Chrome\//.test(s)) return 'chrome';
  if (/Safari\//.test(s)) return 'safari';
  return 'ostalo';
}

Deno.serve(async (req: Request) => {
  const cors = corsHeadersFor(req.headers.get('Origin'), ALLOWED_ORIGINS);
  const json = (body: unknown, status = 200): Response =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } });
  try {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
    if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

    const raw = await readTextBounded(req, MAX_BODY);
    if (!raw.ok) return json({ error: 'payload_too_large' }, 413);
    let body: any = {};
    try { body = raw.text ? JSON.parse(raw.text) : {}; } catch { return json({ error: 'bad_request' }, 400); }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

    // Rate limit PRIJE upisa. IP hash je prolazan: koristi se za kvotu i nikad ne ulazi u redak.
    const ipHash = await hashClientIpSalted(req.headers.get('x-forwarded-for'), IP_HASH_SALT, SERVICE_ROLE);
    const { data: ok } = await admin.rpc('claim_ip_rate_slot', {
      p_scope: 'client_error', p_ip_hash: ipHash, p_daily_cap: DAILY_CAP_IP,
    });
    // Tiho odbijanje s 200: klijent salje preko `sendBeacon` i ionako ne cita odgovor, a 429 bi ga
    // samo naveo na ponovni pokusaj. Kvota je zastita nas, ne poruka njemu.
    if (ok !== true) return json({ ok: true, throttled: true }, 200);

    // Klijent salje svoj incidentId da ga moze pokazati korisniku; prihvacamo ga SAMO ako ima
    // dogovoren oblik, inace generiramo svoj. Time proizvoljan niz iz tijela ne moze u bazu.
    const poslan = String(body?.incidentId ?? '');
    const incidentId = INCIDENT_ID_RE.test(poslan) ? poslan : makeIncidentId();

    const report = buildErrorReport(body, incidentId, new Date().toISOString());
    // Prazna poruka nije dijagnostika nego smece; ne trosimo redak na nju.
    if (!report.message) return json({ ok: true, ignored: 'empty_message' }, 200);

    const { error } = await admin.from('client_errors').insert({
      incident_id: report.incidentId,
      kind: report.kind,
      message: report.message,
      stack: report.stack || null,
      version: report.version || null,
      path: report.path || null,
      feature: report.feature,
      browser: browserFamily(req.headers.get('user-agent')),
    });
    if (error) {
      console.error('[client-error] insert', error);
      return json({ error: 'insert_failed' }, 500);
    }

    return json({ ok: true, incidentId }, 200);
  } catch (e) {
    console.error('[client-error]', e);
    return json({ error: 'internal' }, 500);
  }
});

// Lekta Edge Function: integrity-check (Deno, Supabase). Faza 4, odluka A.
// Cloud integritetska provjera: cross-lingual (prijevodni plagijat) + AI-signal. Ovo je JEDINI
// posluziteljski put koji prima tekst rada, i to SAMO uz eksplicitnu privolu (src/integrity).
// Tanki omotac: auth, entitlement/teaser gate, poziv providera (env-konfigurirani seam-ovi), zapis
// uz retenciju. INERTNO dok se ne postave tajne providera i ne popuni korpus; do tada svaki seam
// vraca {available:false} umjesto da rusi funkciju (kao ostale Edge funkcije bez tajni).
//
// Odluke foundera: MVP = cross-lingual + AI (BEZ istojezicnog plagijata; institucije to imaju kroz
// Turnitin/Srce); embedding = hostani multilingual API; AI = vanjski detektor, STROGO informativno.
//
// Verificirano preko cistih modula i klijentskih testova (src/integrity/*, tests/integrity.test.ts).
// Ovaj file je glue; ne kompajlira se u npm run check (samo tests/supabase-edge-imports.test.ts ga
// skenira: esm.sh import mora biti EKSAKTNO pinan).
//
// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.2';
import { INTEGRITY_RETENTION_DAYS } from '../../../src/integrity/integrity-consent.ts';
import { corsHeadersFor } from '../_shared/cors.ts';
import { hashClientIpSalted } from '../_shared/hash-ip.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
// Provider tajne (env). Prazno = seam inertan ("nije konfiguriran"); funkcija svejedno radi.
const EMBEDDING_API_URL = Deno.env.get('EMBEDDING_API_URL') ?? '';
const EMBEDDING_API_KEY = Deno.env.get('EMBEDDING_API_KEY') ?? '';
const AI_DETECTOR_API_URL = Deno.env.get('AI_DETECTOR_API_URL') ?? '';
const AI_DETECTOR_API_KEY = Deno.env.get('AI_DETECTOR_API_KEY') ?? '';
// Dnevni limit besplatnih teaser provjera po korisniku (anti-abuse; teaser salje tekst pa nije nula).
const TEASER_DAILY_CAP = Number(Deno.env.get('INTEGRITY_TEASER_DAILY_CAP') ?? '2');
// Dnevni limit PUNIH (placenih) provjera po korisniku (SEC-01, AUD-22/29): aktivan entitlement NE
// znaci neograniceno placenih vanjskih poziva ni pohrane punog teksta; svaki puni poziv okine
// embedding + AI-detektor i upise red s punim tekstom (~300 KB), pa i on treba gornju granicu.
const FULL_DAILY_CAP = Number(Deno.env.get('INTEGRITY_FULL_DAILY_CAP') ?? '20');
// Dnevni per-IP limit PUNIH provjera (AUD-22): per-user cap gore ne backstopa vise RAZLICITIH
// racuna s istog IP-ja. Enforcement je ATOMICAN preko claim_ip_rate_slot (0022, scope=integrity_full),
// ne TOCTOU COUNT. Zaseban od per-user capa (razlicit prag je namjeran).
const FULL_DAILY_CAP_IP = Number(Deno.env.get('INTEGRITY_FULL_DAILY_CAP_IP') ?? '20');
// Timeout na vanjske providere (SEC-01, AUD-29): bez njega spor/viseci provider drzi zahtjev otvoren.
const PROVIDER_TIMEOUT_MS = Number(Deno.env.get('INTEGRITY_PROVIDER_TIMEOUT_MS') ?? '10000');
// Salt za per-IP hash (isti obrazac kao preflight-start / generate-report). Prazno -> hash-ip
// izvodi stabilan salt iz service-role kljuca (nikad nesoljeno).
const IP_HASH_SALT = Deno.env.get('IP_HASH_SALT') ?? '';
const MAX_TEXT = 300 * 1024; // ~300 KB teksta rada

// Dopusteno CORS porijeklo (SEC-05): produkcijska domena; override preko ALLOWED_ORIGIN (zarezom
// odvojeno). Localhost je uvijek dopusten (dev). Reflektira se u corsHeadersFor (nikad '*'), isti
// obrazac kao faculty-request/preflight-start.
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGIN') ?? 'https://lektahr.netlify.app')
  .split(',').map((s) => s.trim()).filter(Boolean);

// sha256 (hex): idempotency kljuc za tekst. Nema zaseban stupac u shemi (izvan dosega Edge funkcije),
// pa se kljuc sprema unutar result_summary jsonb-a i deduplicira preko jsonb contains (vidi 3b).
async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// --- Provider seam-ovi (env-konfigurirani). Vracaju {available:false} dok tajne/korpus nisu spremni. ---

// Cross-lingual: embed tekst hostanim multilingual API-jem, pa najblize u integrity_corpus (pgvector).
// Korpus tablica i match RPC (match_integrity_corpus) dolaze S ODABIROM MODELA (vector(N) dimenzija
// ovisi o modelu), pa dok ih nema seam vraca "korpus jos nije popunjen", ne rusi funkciju.
async function crossLingualCheck(admin: any, text: string, lang: string, full: boolean) {
  if (!EMBEDDING_API_URL || !EMBEDDING_API_KEY) return { available: false, reason: 'embedding provider nije konfiguriran' };
  let embedding: number[] | null = null;
  try {
    const res = await fetch(EMBEDDING_API_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${EMBEDDING_API_KEY}` },
      body: JSON.stringify({ input: text.slice(0, MAX_TEXT), lang }),
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS), // SEC-01: prekid viseceg providera
    });
    if (!res.ok) return { available: false, reason: `embedding ${res.status}` };
    const data = await res.json();
    embedding = data?.embedding ?? data?.data?.[0]?.embedding ?? null;
  } catch (_e) {
    return { available: false, reason: 'embedding poziv pao' };
  }
  if (!embedding) return { available: false, reason: 'embedding prazan' };
  try {
    const { data: matches, error } = await admin.rpc('match_integrity_corpus', {
      query_embedding: embedding,
      match_count: full ? 10 : 3,
    });
    if (error) return { available: false, reason: 'korpus jos nije popunjen' };
    const rows = (matches ?? []) as any[];
    const top = Number(rows[0]?.similarity ?? 0);
    return {
      available: true,
      similarity: Math.max(0, Math.min(100, Math.round(top * 100))),
      // Detaljan popis poklopljenih izvora samo u punom (placeni) izvjestaju.
      sources: full ? rows.map((r) => ({ ref: r.source_ref, lang: r.lang, similarity: Math.round(Number(r.similarity ?? 0) * 100) })) : undefined,
    };
  } catch (_e) {
    return { available: false, reason: 'korpus jos nije popunjen' };
  }
}

// AI-signal: vanjski detektor. STROGO informativno: raspon vjerojatnosti + caveat, NIKAD presuda
// (plan sek. 4: stiti korisnika i brand od laznog pozitiva).
async function aiSignalCheck(text: string) {
  if (!AI_DETECTOR_API_URL || !AI_DETECTOR_API_KEY) return { available: false, reason: 'AI-detektor nije konfiguriran' };
  try {
    const res = await fetch(AI_DETECTOR_API_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${AI_DETECTOR_API_KEY}` },
      body: JSON.stringify({ text: text.slice(0, MAX_TEXT) }),
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS), // SEC-01: prekid viseceg providera
    });
    if (!res.ok) return { available: false, reason: `ai ${res.status}` };
    const data = await res.json();
    const p = Number(data?.ai_probability ?? data?.score ?? 0);
    return {
      available: true,
      aiProbability: Math.max(0, Math.min(100, Math.round(p * 100))),
      caveat: 'Ovaj signal nije dokaz. Institucije koriste vlastite alate; tretiraj kao orijentaciju, ne presudu.',
    };
  } catch (_e) {
    return { available: false, reason: 'ai poziv pao' };
  }
}

Deno.serve(async (req: Request) => {
 const cors = corsHeadersFor(req.headers.get('Origin'), ALLOWED_ORIGINS);
 const json = (body: unknown, status = 200): Response =>
   new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } });
 try {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  // 1. auth: prijavljen korisnik (Supabase JWT)
  const authHeader = req.headers.get('Authorization') ?? '';
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
  const { data: userData } = await admin.auth.getUser(authHeader.replace(/^Bearer\s+/i, ''));
  const user = userData?.user;
  if (!user) return json({ error: 'unauthorized' }, 401);

  // 2. body + guard
  const clen = Number(req.headers.get('content-length') ?? '0');
  if (clen && clen > MAX_TEXT + 8 * 1024) return json({ error: 'payload_too_large' }, 413);
  const raw = await req.text();
  if (raw.length > MAX_TEXT + 8 * 1024) return json({ error: 'payload_too_large' }, 413);
  let body: any = null;
  try { body = JSON.parse(raw); } catch { body = null; }
  const mode = body?.mode === 'full' ? 'full' : body?.mode === 'teaser' ? 'teaser' : null;
  const text = typeof body?.text === 'string' ? body.text : '';
  const consent = body?.consent;
  // KLJUCNO (integritetska granica): bez valjane privole tekst se NE obraduje ni ne pohranjuje.
  if (!body || !mode || !text || !consent || consent.sendsFullText !== true) {
    return json({ error: 'bad_request' }, 400);
  }
  if (text.length > MAX_TEXT) return json({ error: 'payload_too_large' }, 413);
  const lang = typeof body.lang === 'string' ? body.lang : 'hr';
  const workType = typeof body.workType === 'string' ? body.workType : null;
  const now = new Date();
  const nowIso = now.toISOString();

  const dayAgoIso = new Date(now.getTime() - 24 * 3600 * 1000).toISOString();
  // Per-IP identitet (AUD-22): soljeni hash klijentskog IP-ja. Racuna se prije capa (full
  // koristi ga za claim_ip_rate_slot) i upisuje se u integrity_checks.ip_hash (stupac 0023).
  const ipHash = await hashClientIpSalted(req.headers.get('x-forwarded-for'), IP_HASH_SALT, SERVICE_ROLE);

  // 3. gate: teaser = besplatno uz dnevni limit; full = trazi aktivan entitlement (Thesis Pass/slot).
  //    (MVP: bilo koji aktivan entitlement otkljucava puni izvjestaj; vezanje iskljucivo na Pass
  //    ili trosenje zasebnog integ. kredita je buduce profinjenje.)
  if (mode === 'teaser') {
    const { count } = await admin
      .from('integrity_checks')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('mode', 'teaser')
      .gt('created_at', dayAgoIso);
    if ((count ?? 0) >= TEASER_DAILY_CAP) return json({ error: 'rate_limited' }, 429);
  } else {
    const { data: ent } = await admin
      .from('entitlements')
      .select('id')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .gt('purchase_expires_at', nowIso)
      .limit(1);
    if (!ent || ent.length === 0) return json({ error: 'payment_required' }, 402);
  }

  // 3b. idempotency (SEC-01, AUD-29): identican tekst istog korisnika u istom nacinu, jos unutar
  //     dnevnog prozora, vraca VEC izracunati rezultat BEZ ponovnog (placenog) poziva providerima i
  //     BEZ novog reda punog teksta. Nema hash stupca (schema izvan dosega Edge funkcije), pa se
  //     kljuc sprema u result_summary.idempotencyHash i deduplicira preko jsonb contains (kratak
  //     upit; filtriranje po cijelom 300 KB tekstu bi probilo duljinu PostgREST URL-a).
  const idempotencyHash = await sha256Hex(`${mode}|${lang}|${text}`);
  const { data: prior } = await admin
    .from('integrity_checks')
    .select('result_summary')
    .eq('user_id', user.id)
    .eq('status', 'done')
    .gt('created_at', dayAgoIso)
    .contains('result_summary', { idempotencyHash })
    .order('created_at', { ascending: false })
    .limit(1);
  if (prior && prior.length === 1 && prior[0].result_summary) {
    // Ne vracaj interni idempotencyHash klijentu; izlaz je identican svjezoj provjeri.
    const { idempotencyHash: _omit, ...cached } = prior[0].result_summary as any;
    return json({ report: cached, idempotent: true }, 200);
  }

  // 3c. dnevni capovi za PUNE provjere (SEC-01, AUD-22): nova (ne-idempotentna) puna provjera trosi
  //     kvotu; sprjecava petlju N placenih poziva i N redaka punog teksta iza jednog entitlementa.
  //     Per-USER cap je rolling-24h COUNT; per-IP cap je ATOMICAN (claim_ip_rate_slot, 0022,
  //     scope='integrity_full') pa vise racuna s istog IP-ja ne moze paralelno proci stale COUNT.
  //     Oba se zovu tek NAKON entitlement + idempotency gatea, pa idempotentni replay (3b) ne
  //     trosi slot. claim_ip_rate_slot inkrementira brojac UNAPRIJED (prije platnih poziva u 4).
  if (mode === 'full') {
    const { count: fullCount } = await admin
      .from('integrity_checks')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('mode', 'full')
      .gt('created_at', dayAgoIso);
    if ((fullCount ?? 0) >= FULL_DAILY_CAP) return json({ error: 'rate_limited' }, 429);

    // Ugovor: true = dopusteno; false / error / null = tretiraj kao odbijeno (429).
    const { data: ipOk } = await admin.rpc('claim_ip_rate_slot', {
      p_scope: 'integrity_full',
      p_ip_hash: ipHash,
      p_daily_cap: FULL_DAILY_CAP_IP,
    });
    if (ipOk !== true) return json({ error: 'rate_limited' }, 429);
  }

  // 4. provjere (env-seam-ovi). full = svi detalji; teaser = ograniceni signal.
  const full = mode === 'full';
  const [crossLingual, ai] = await Promise.all([
    crossLingualCheck(admin, text, lang, full),
    aiSignalCheck(text),
  ]);
  const report: any = { mode, crossLingual };
  // Teaser skriva AI-postotak (samo dostupnost); puni postotak i caveat su u placenom izvjestaju.
  report.ai = full ? ai : { available: (ai as any).available === true };

  // 5. zapis uz retenciju (sirovi tekst se cuva do purge_integrity_text, 7d; migracija 0018).
  //    idempotencyHash se sprema UZ sazetak (interni kljuc za 3b; ne vraca se klijentu).
  const retentionExpires = new Date(now.getTime() + INTEGRITY_RETENTION_DAYS * 24 * 3600 * 1000).toISOString();
  await admin.from('integrity_checks').insert({
    user_id: user.id,
    work_type: workType,
    lang,
    mode,
    consent,
    ip_hash: ipHash, // AUD-22: trajna per-IP atribucija reda (stupac 0023)
    sent_text: text,
    result_summary: { ...report, idempotencyHash },
    retention_expires_at: retentionExpires,
    status: 'done',
  });

  return json({ report }, 200);
 } catch (e) {
  console.error('[integrity-check]', e); // Supabase Edge logovi = error tracking (P0 8-1)
  return json({ error: 'internal' }, 500);
 }
});

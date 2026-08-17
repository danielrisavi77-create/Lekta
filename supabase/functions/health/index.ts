// Lekta Edge Function: health (Deno, Supabase).
//
// Provjera zivosti serverskih putova za vanjski uptime monitor (pre-launch checklist P1 8-3).
//
// PREPISANO 2026-08-17 (audit OPS-01, OPS-02, OPS-03). Prijasnja verzija je za SVAKI zahtjev
// osim OPTIONS vracala 200 sa `status: 'ok'`, a nije dirala nijednu ovisnost. Posljedica: monitor
// je javljao "zdravo" i kad je baza bila nedostupna, i kad je bio pogresno konfiguriran (npr.
// slao POST umjesto GET). Endpoint koji ne moze pasti ne mjeri nista osim da Edge runtime radi.
//
// Sada:
//   - metode osim GET/HEAD/OPTIONS dobiju 405, pa krivo konfiguriran monitor bude vidljiv;
//   - provjerava se BAZA, jer bez nje ne radi nijedan placeni put;
//   - odgovor nosi verziju i commit, pa se iz ispada moze odmah reci sto je bilo deployano;
//   - kad ovisnost padne, HTTP status je 503, jer 200 uz `status: 'degraded'` u tijelu vecina
//     monitora ne gleda i ispad bi opet prosao neopazeno.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
/** Postavlja ih deploy; prazno znaci "nepoznato", nikad izmisljena vrijednost. */
const RELEASE = Deno.env.get('LEKTA_RELEASE') ?? '';
const COMMIT = Deno.env.get('LEKTA_COMMIT') ?? '';

/** Kratak timeout: health koji visi je jednako beskoristan kao health koji uvijek kaze ok. */
const DEP_TIMEOUT_MS = 3000;

type DepResult = { ok: boolean; detail?: string };

/**
 * Najjeftiniji dokaz da je PostgREST ziv i da baza odgovara.
 *
 * Namjerno se ne cita nijedna aplikacijska tablica: health je javan (verify_jwt=false), pa ne
 * smije postati besplatan upit nad podacima. Dovoljno je da REST korijen odgovori.
 */
async function checkDatabase(): Promise<DepResult> {
  if (!SUPABASE_URL || !ANON_KEY) return { ok: false, detail: 'not_configured' };
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
      signal: AbortSignal.timeout(DEP_TIMEOUT_MS),
    });
    return res.ok ? { ok: true } : { ok: false, detail: `http_${res.status}` };
  } catch (e) {
    return { ok: false, detail: e instanceof Error && e.name === 'TimeoutError' ? 'timeout' : 'unreachable' };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return new Response(JSON.stringify({ status: 'error', error: 'method_not_allowed' }), {
      status: 405,
      headers: { ...CORS, 'content-type': 'application/json', allow: 'GET, HEAD, OPTIONS' },
    });
  }

  const database = await checkDatabase();
  const healthy = database.ok;

  const body = {
    status: healthy ? 'ok' : 'degraded',
    service: 'lekta',
    release: RELEASE || null,
    commit: COMMIT || null,
    dependencies: { database },
    time: new Date().toISOString(),
  };

  return new Response(JSON.stringify(body), {
    status: healthy ? 200 : 503,
    headers: { ...CORS, 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
});

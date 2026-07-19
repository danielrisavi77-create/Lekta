// Lekta Edge Function: delete-repair-job (Deno, Supabase) — NACRT (WS-6).
// Right to erasure za "Moji popravci": korisnik trajno brise jedan repair-posao. Uklanja I Storage
// BLOB-ove (original + fixed) I redak u repair_jobs. Blob-brisanje MORA ici kroz Storage API
// (service role), pa se ne moze samo RLS-om na klijentu; zato zasebna Edge funkcija.
//
// Vjeran obrascu repair-docx/index.ts: tanki glue (HTTP/JWT/SQL), auth prije svega, service role
// za pisanje. Vlasnistvo se provjerava dvostruko: SELECT po (id, user_id) i DELETE po (id, user_id).
//
// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.2';
import { corsHeadersFor } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGIN') ?? 'https://lektahr.netlify.app')
  .split(',').map((s) => s.trim()).filter(Boolean);

Deno.serve(async (req: Request) => {
  const cors = corsHeadersFor(req.headers.get('Origin'), ALLOWED_ORIGINS);
  const json = (body: unknown, status = 200): Response =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } });
  try {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
    if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

    // 1. auth
    const authHeader = req.headers.get('Authorization') ?? '';
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
    const { data: userData } = await admin.auth.getUser(authHeader.replace(/^Bearer\s+/i, ''));
    const user = userData?.user;
    if (!user) return json({ error: 'unauthorized' }, 401);

    // 2. body: { jobId }
    let body: any = null;
    try { body = await req.json(); } catch { body = null; }
    const jobId = body && typeof body.jobId === 'string' ? body.jobId : null;
    if (!jobId) return json({ error: 'bad_request' }, 400);

    // 3. dohvati putanje SAMO za vlasnika (RLS bi ionako sakrio tudje, ali service role zaobilazi
    //    RLS pa vlasnistvo provjeravamo eksplicitno u WHERE).
    const { data: jobRow } = await admin
      .from('repair_jobs').select('original_path, result_path')
      .eq('id', jobId).eq('user_id', user.id).maybeSingle();
    if (!jobRow) return json({ error: 'not_found' }, 404); // vec obrisano ili nije korisnikovo

    // 4. ukloni BLOB-ove pa redak. Storage.remove je idempotentan (nepostojeci kljuc ne baca),
    //    pa ponovni poziv nakon djelomicnog pada svejedno konvergira u "obrisano".
    const paths = [ (jobRow as any).original_path, (jobRow as any).result_path ].filter(Boolean);
    if (paths.length) await admin.storage.from('repair').remove(paths);
    const { error: delErr } = await admin
      .from('repair_jobs').delete().eq('id', jobId).eq('user_id', user.id);
    if (delErr) return json({ error: 'delete_failed' }, 500);

    return json({ ok: true, jobId }, 200);
  } catch (e) {
    console.error('[delete-repair-job]', e);
    return json({ error: 'internal' }, 500);
  }
});

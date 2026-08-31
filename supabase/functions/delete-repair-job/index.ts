// Lekta Edge Function: delete-repair-job (Deno, Supabase). ZIVO u produkciji (v7, ACTIVE).
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

    // 4. ZAPISI NAMJERU prije nego dira igdje drugdje (audit P1-10, migracija 0098).
    //
    //    Poredak "blobovi pa redak" je namjeran i ostaje: dok redak postoji, postoje i putanje, pa
    //    je ponovni pokusaj moguc. Ono sto taj poredak sam po sebi ne pokriva je PREKID izmedju dva
    //    koraka (blobovi otisli, redak ostao): korisnik tada trajno vidi posao koji se ne da
    //    preuzeti, a nista taj raskorak ne primjecuje.
    //
    //    Zato se namjera biljezi prva. Prekid nakon nje ostavlja redak OZNACEN kao "u brisanju",
    //    sto sucelje ne nudi za preuzimanje, a `cleanup-orphan-repairs` dovrsi.
    const { error: markErr } = await admin
      .from('repair_jobs').update({ deleting_at: new Date().toISOString() })
      .eq('id', jobId).eq('user_id', user.id);
    if (markErr) { console.error('[delete-repair-job] mark', markErr); return json({ error: 'delete_failed' }, 500); }

    // 5. Ukloni BLOB-ove PA tek onda redak, i SAMO ako je uklanjanje uspjelo. storage.remove vraca
    //    {error} (ne baca), pa gresku moramo eksplicitno provjeriti; ako BLOB nije uklonjen, NE brisemo
    //    redak (inace posao nestane iz "Moji popravci" a dokument ostane pohranjen, bez moguceg retryja).
    const paths = [ (jobRow as any).original_path, (jobRow as any).result_path ].filter(Boolean);
    if (paths.length) {
      const { error: rmErr } = await admin.storage.from('repair').remove(paths);
      // Oznaka NAMJERNO ostaje postavljena: posao je na putu van, a cron ce ga dovrsiti. Vracanje
      // oznake ovdje bi posao vratilo u "preuzmi" stanje iako mu blobovi mozda vise ne postoje.
      if (rmErr) { console.error('[delete-repair-job] storage.remove', rmErr); return json({ error: 'blob_delete_failed' }, 502); }
    }
    const { error: delErr } = await admin
      .from('repair_jobs').delete().eq('id', jobId).eq('user_id', user.id);
    if (delErr) return json({ error: 'delete_failed' }, 500);

    return json({ ok: true, jobId }, 200);
  } catch (e) {
    console.error('[delete-repair-job]', e);
    return json({ error: 'internal' }, 500);
  }
});

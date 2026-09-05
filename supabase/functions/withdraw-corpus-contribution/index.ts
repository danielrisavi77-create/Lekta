// Kanal A: POVLACENJE privole za prilog korpusu (spec docs/superpowers/specs/2026-09-05-kanal-a-privola-korpusa.md).
//
// Korisnik smije povuci samo SVOJ prilog. Povlacenje brise pseudonimiziranu kopiju iz bucketa 'corpus' i biljezi
// `withdrawn_at`; redak ostaje kao trag da je privola postojala i da je povucena (bez sadrzaja). Vlasnikov alat
// `scripts/corpus-pull.mts` pri sljedecem dohvatu brise i lokalnu kopiju.
//
// Redoslijed je namjeran: prvo se brise DATOTEKA, pa se oznacava redak. Kad bi bilo obrnuto, pad brisanja bi ostavio
// kopiju na disku uz redak koji tvrdi da je povucena. Ako brisanje datoteke padne, vracamo 502 i redak ostaje
// nepovucen, pa korisnik moze ponoviti; nikad ne tvrdimo povlacenje koje se nije dogodilo.
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
    const authHeader = req.headers.get('Authorization') ?? '';
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
    const { data: userData } = await admin.auth.getUser(authHeader.replace(/^Bearer\s+/i, ''));
    const user = userData?.user;
    if (!user) return json({ error: 'unauthorized' }, 401);

    let body: any = null;
    try { body = await req.json(); } catch { body = null; }
    const contributionId = body && typeof body.contributionId === 'string' ? body.contributionId : null;
    if (!contributionId) return json({ error: 'bad_request' }, 400);

    const { data: row } = await admin
      .from('corpus_contributions').select('id, path, withdrawn_at')
      .eq('id', contributionId).eq('user_id', user.id).maybeSingle();
    if (!row) return json({ error: 'not_found' }, 404); // nije korisnikov ili ne postoji
    if (row.withdrawn_at) return json({ ok: true, contributionId, alreadyWithdrawn: true }, 200);

    const { error: rmErr } = await admin.storage.from('corpus').remove([row.path]);
    if (rmErr) {
      console.error('[withdraw-corpus-contribution] storage.remove', rmErr.message);
      return json({ error: 'blob_delete_failed' }, 502);
    }
    const { error: markErr } = await admin
      .from('corpus_contributions').update({ withdrawn_at: new Date().toISOString() })
      .eq('id', contributionId).eq('user_id', user.id);
    if (markErr) {
      console.error('[withdraw-corpus-contribution] mark', markErr.message);
      return json({ error: 'withdraw_failed' }, 500);
    }
    return json({ ok: true, contributionId }, 200);
  } catch (e) {
    console.error('[withdraw-corpus-contribution]', e instanceof Error ? e.message : e);
    return json({ error: 'internal' }, 500);
  }
});

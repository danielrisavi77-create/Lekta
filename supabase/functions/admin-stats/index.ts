// supabase/functions/admin-stats/index.ts
//
// Read-only agregati za vlasnicki pregled: stari "mini stats" put (admin-panel.ts, prazno
// tijelo) I novi Lekta Control Center (admin.html, {view,range,...}). Vraca ISKLJUCIVO
// brojeve: nikad naslov rada, otisak, putanju, e-mail ni bilo sto vezano uz pojedini dokument.
//
// Autorizacija je DVOSTRUKA i obje su serverske, ISTA za oba puta:
//   1. valjan JWT (verify_jwt=true + admin.auth.getUser),
//   2. redak u `admin_users` (0031). Bez njega -> 403, bez obzira na valjanu prijavu.
// Klijentska zastavica `localStorage.lekta.admin` otvara samo UI i ovdje ne znaci nista.
//
// Jedan dispatcher umjesto sedam Edge funkcija: gate se pise i pregledava JEDNOM (svaka kopija
// je prilika da fail-closed ponasanje regresira), postojeci productionConfig.adminStatsEndpoint
// i CORS allowlist ostaju netaknuti. buildAdminRpcCall (src/admin/admin-dispatch.ts) odlucuje
// KOJU rpc pozvati - sve su security definer, grant samo service_role (0031/0038), pa nijedan
// redak ne napusta bazu i odgovor je uvijek {generatedAt, current, previous, retention}.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.2';
import { corsHeadersFor } from '../_shared/cors.ts';
import { buildAdminRpcCall } from '../../../src/admin/admin-dispatch.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGIN') ?? 'https://lektahr.netlify.app')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

Deno.serve(async (req) => {
  const cors = corsHeadersFor(req.headers.get('Origin'), ALLOWED_ORIGINS);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } });

  try {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
    if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

    const authHeader = req.headers.get('Authorization') ?? '';
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

    const { data: userData } = await admin.auth.getUser(authHeader.replace(/^Bearer\s+/i, ''));
    const user = userData?.user;
    if (!user) return json({ error: 'unauthorized' }, 401);

    // Fail-closed: bilo kakva greska u provjeri clanstva znaci NIJE admin.
    const { data: adminRow, error: adminErr } = await admin
      .from('admin_users')
      .select('user_id')
      .eq('user_id', user.id)
      .maybeSingle();
    if (adminErr || !adminRow) return json({ error: 'forbidden' }, 403);

    // Prazno/neparsirljivo tijelo -> {} -> buildAdminRpcCall ga tretira kao legacy put, isto
    // kao dosad (klijent je oduvijek slao '{}', a server ga dosad uopce nije citao).
    const body = await req.json().catch(() => ({}));
    const call = buildAdminRpcCall(body);
    if ('error' in call) return json({ error: call.error }, 400);

    const { data: stats, error: statsErr } = await admin.rpc(call.rpcName, call.rpcParams);
    if (statsErr || !stats) {
      console.error('[admin-stats] rpc', call.rpcName, statsErr);
      return json({ error: 'stats_failed' }, 500);
    }

    // Legacy put (call.view undefined): oblik ostaje BAJT-IDENTICAN dosadasnjem {ok,stats} da
    // admin-panel.ts radi nepromijenjeno. Novi putevi dodaju `view` da klijent zna sto je dobio.
    return json(call.view ? { ok: true, view: call.view, stats } : { ok: true, stats }, 200);
  } catch (e) {
    console.error('[admin-stats]', e);
    return json({ error: 'internal' }, 500);
  }
});

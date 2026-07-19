// Lekta Edge Function: cleanup-orphan-repairs (Deno, Supabase) — NACRT (WS-7).
// GDPR higijena za "Moji popravci": uklanja SIROCE Storage BLOB-ove iz bucketa 'repair' koji vise nemaju
// pripadni repair_jobs redak. Nastaju kad se obrise RACUN: user_id `on delete cascade` (0026) makne redak
// repair_jobs, ali storage.objects nisu FK-cascade vezani (owner je ON DELETE SET NULL), pa original.docx
// i fixed.docx prezive kao siroce. Ovaj sweep zatvara right-to-erasure na razini brisanja racuna (v. 0026 TODO).
//
// Sigurnost: cron-okidano, verify_jwt=false, stiti se DEDICIRANOM tajnom REPAIR_CLEANUP_CRON_SECRET
// (Bearer, NIKAD service role), fail-closed kao send-reminders. pg_cron salje Authorization: Bearer <tajna>.
//
// Detekcija siroceta je u SQL funkciji find_orphan_repair_objects (0027): objekti u bucketu 'repair'
// STARIJI od grace perioda (da se ne dira upravo uploadan BLOB dok storeRepairJob jos nije upisao redak;
// storeRepairJob uploada BLOB pa TEK onda insertira) BEZ pripadnog repair_jobs.original_path/result_path.
// Brisanje ide Storage APIjem (ne SQL) jer SQL delete storage.objects retka NE uklanja fizicki objekt.
//
// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.2';
import { isCronAuthorized } from '../_shared/cron-auth.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CRON_SECRET = Deno.env.get('REPAIR_CLEANUP_CRON_SECRET');
const GRACE_MINUTES = Number(Deno.env.get('REPAIR_CLEANUP_GRACE_MINUTES') ?? '60');
const BATCH = 500;      // objekata po rundi (jedan storage.remove poziv)
const MAX_ROUNDS = 40;  // gornja granica (~20k objekata po pozivu); ostatak pocisti sljedeci cron

Deno.serve(async (req: Request) => {
  const json = (body: unknown, status = 200): Response =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  try {
    if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
    // fail-closed: bez ispravne cron tajne funkcija NE dira Storage (kao send-reminders, security-01)
    if (!isCronAuthorized(req, CRON_SECRET)) return json({ error: 'unauthorized' }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

    let removed = 0;
    for (let round = 0; round < MAX_ROUNDS; round++) {
      const { data, error } = await admin.rpc('find_orphan_repair_objects', {
        p_grace_minutes: GRACE_MINUTES, p_limit: BATCH,
      });
      if (error) { console.error('[cleanup-orphan-repairs] rpc', error); return json({ error: 'query_failed', removed }, 500); }
      const paths = ((data ?? []) as any[]).map((r) => r.object_name).filter((s: unknown) => typeof s === 'string');
      if (paths.length === 0) break;
      // Storage API brise I fizicki objekt I storage.objects redak (SQL delete ne bi maknuo fizicki BLOB).
      const { error: rmErr } = await admin.storage.from('repair').remove(paths);
      if (rmErr) { console.error('[cleanup-orphan-repairs] remove', rmErr); return json({ error: 'remove_failed', removed }, 502); }
      removed += paths.length;
      if (paths.length < BATCH) break; // zadnja (nepuna) runda
    }
    return json({ ok: true, removed }, 200);
  } catch (e) {
    console.error('[cleanup-orphan-repairs]', e);
    return json({ error: 'internal' }, 500);
  }
});

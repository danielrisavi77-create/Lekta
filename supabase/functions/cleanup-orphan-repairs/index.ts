// Lekta Edge Function: cleanup-orphan-repairs (Deno, Supabase). ZIVO u produkciji (v8, ACTIVE).
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
// Retencija anonimnih popravaka (0033). Vlasnikova odluka: 30 dana.
const ANON_RETENTION_DAYS = Number(Deno.env.get('REPAIR_ANON_RETENTION_DAYS') ?? '30');

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

    // FAZA 2 (0033): istekli ANONIMNI popravci. Anonimni racun zivi samo u pregledniku, pa tko
    // ocisti podatke vise ne moze sam obrisati svoj dokument; bez ovoga bismo ga drzali zauvijek,
    // suprotno objavljenoj politici. Redoslijed je bitan: prvo Storage (kroz Storage API, jer SQL
    // ne mice fizicki BLOB), pa tek onda redak. Padne li brisanje objekta, redak OSTAJE i sljedeci
    // cron pokusava ponovno; nikad ne brisemo evidenciju o datoteci koja je jos gore.
    let anonymousRemoved = 0;
    for (let round = 0; round < MAX_ROUNDS; round++) {
      const { data, error } = await admin.rpc('find_expired_anonymous_repairs', {
        p_days: ANON_RETENTION_DAYS, p_limit: BATCH,
      });
      if (error) { console.error('[cleanup-orphan-repairs] anon rpc', error); return json({ error: 'anon_query_failed', removed, anonymousRemoved }, 500); }
      const rows = (data ?? []) as Array<{ job_id: string; original_path: string | null; result_path: string | null }>;
      if (rows.length === 0) break;

      const paths = rows.flatMap((r) => [r.original_path, r.result_path]).filter((s): s is string => typeof s === 'string' && !!s);
      if (paths.length) {
        const { error: rmErr } = await admin.storage.from('repair').remove(paths);
        if (rmErr) { console.error('[cleanup-orphan-repairs] anon remove', rmErr); return json({ error: 'anon_remove_failed', removed, anonymousRemoved }, 502); }
      }
      const { error: delErr } = await admin.from('repair_jobs').delete().in('id', rows.map((r) => r.job_id));
      if (delErr) { console.error('[cleanup-orphan-repairs] anon delete', delErr); return json({ error: 'anon_delete_failed', removed, anonymousRemoved }, 500); }

      anonymousRemoved += rows.length;
      if (rows.length < BATCH) break;
    }

    return json({ ok: true, removed, anonymousRemoved }, 200);
  } catch (e) {
    console.error('[cleanup-orphan-repairs]', e);
    return json({ error: 'internal' }, 500);
  }
});

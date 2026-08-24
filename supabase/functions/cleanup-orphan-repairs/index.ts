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
// Koliko dugo brisanje smije "trajati" prije nego ga cron smatra zaglavljenim (0098). Edge poziv
// traje sekunde, pa je 15 minuta velikodusno i ne moze uhvatiti brisanje koje je jos u letu.
const STUCK_GRACE_MINUTES = Number(Deno.env.get('REPAIR_STUCK_DELETE_GRACE_MINUTES') ?? '15');
// ---------------------------------------------------------------------------
// Ciscenje NAPUSTENIH anonimnih racuna (audit P1-11, migracija 0099).
//
// SUHI HOD JE ZADANO STANJE. Brisanje auth racuna kaskadno brise podatke kroz cetrdesetak
// tablica i nema povrata, pa se ne pali samo time sto je kod deployan. Prvo se gleda broj u
// odgovoru i logu, pa se tek onda svjesno postavi ANON_PURGE_APPLY=1.
//
// Da suhi hod nije uzaludan, mjereno je na produkciji 2026-08-24: od 3 racuna koja je audit
// nazvao brisivima ("stariji od 30 dana bez repair poslova"), predikat iz kataloga vraca SAMO
// JEDAN. Druga dva imaju 7 odnosno 1 redak u `report_generations`. Rucni popis tablica obrisao
// bi ih i tiho odnio tih 8 zapisa.
const ANON_PURGE_APPLY = Deno.env.get('ANON_PURGE_APPLY') === '1';
const ANON_PURGE_DAYS = Number(Deno.env.get('ANON_PURGE_DAYS') ?? '30');
const ANON_PURGE_BATCH = Number(Deno.env.get('ANON_PURGE_BATCH') ?? '50');

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

    // FAZA 3 (0098, audit P1-10): ZAGLAVLJENA BRISANJA. `delete-repair-job` prvo zapise namjeru
    // (`deleting_at`), pa ukloni blobove, pa obrise redak. Prekid izmedju ta dva koraka ostavlja
    // redak koji pokazuje na datoteke kojih vise nema; korisnik bi inace trajno gledao posao koji
    // se ne da preuzeti. Faza 1 cisti suprotan smjer (blob bez retka), pa ovaj slucaj do sada nije
    // imao vlasnika.
    //
    // Ponavljanje je bezopasno: Storage remove nad nepostojecim objektom nije greska, pa dovrsavanje
    // vec dovrsenog brisanja jednostavno prodje. Prag (`STUCK_GRACE_MINUTES`) postoji da se ne dira
    // brisanje koje upravo traje, isti razlog kao grace period u fazi 1.
    let stuckCompleted = 0;
    for (let round = 0; round < MAX_ROUNDS; round++) {
      const { data, error } = await admin.rpc('find_stuck_repair_deletions', {
        p_grace_minutes: STUCK_GRACE_MINUTES, p_limit: BATCH,
      });
      if (error) { console.error('[cleanup-orphan-repairs] stuck rpc', error); return json({ error: 'stuck_query_failed', removed, anonymousRemoved, stuckCompleted }, 500); }
      const rows = (data ?? []) as Array<{ job_id: string; original_path: string | null; result_path: string | null }>;
      if (rows.length === 0) break;

      const paths = rows.flatMap((r) => [r.original_path, r.result_path]).filter((s): s is string => typeof s === 'string' && !!s);
      if (paths.length) {
        const { error: rmErr } = await admin.storage.from('repair').remove(paths);
        if (rmErr) { console.error('[cleanup-orphan-repairs] stuck remove', rmErr); return json({ error: 'stuck_remove_failed', removed, anonymousRemoved, stuckCompleted }, 502); }
      }
      const { error: delErr } = await admin.from('repair_jobs').delete().in('id', rows.map((r) => r.job_id));
      if (delErr) { console.error('[cleanup-orphan-repairs] stuck delete', delErr); return json({ error: 'stuck_delete_failed', removed, anonymousRemoved, stuckCompleted }, 500); }

      stuckCompleted += rows.length;
      if (rows.length < BATCH) break;
    }

    // FAZA 4 (0099, audit P1-11): NAPUSTENI ANONIMNI RACUNI.
    //
    // Faza 2 cisti anonimne DOKUMENTE, ali sam racun ostaje zauvijek. Svaki posjet koji dodirne
    // popravak stvara jedan, pa auth.users raste bez gornje granice i botu je dovoljan jedan
    // poziv da doda novi.
    //
    // Kandidate bira `find_purgeable_anonymous_users`, koja popis tablica cita iz pg_constraint
    // pri svakom pozivu: racun s ijednim retkom bilo gdje NIJE kandidat, pa nova tablica
    // automatski stiti racune bez ijedne izmjene koda.
    let anonUsersPurgeable = 0;
    let anonUsersDeleted = 0;
    {
      const { data, error } = await admin.rpc('find_purgeable_anonymous_users', {
        p_days: ANON_PURGE_DAYS, p_limit: ANON_PURGE_BATCH,
      });
      if (error) {
        // NE rusi cijeli cron: faze 1-3 su vec odradile posao i njihov rezultat je vrijedan.
        console.error('[cleanup-orphan-repairs] anon users rpc', error);
      } else {
        const rows = (data ?? []) as Array<{ user_id: string }>;
        anonUsersPurgeable = rows.length;
        if (ANON_PURGE_APPLY) {
          for (const row of rows) {
            if (!row?.user_id) continue;
            const { error: delErr } = await admin.auth.admin.deleteUser(row.user_id);
            if (delErr) { console.error('[cleanup-orphan-repairs] deleteUser', row.user_id, delErr); continue; }
            anonUsersDeleted++;
          }
        }
      }
      console.log(`[cleanup-orphan-repairs] anon racuni: kandidata=${anonUsersPurgeable} obrisano=${anonUsersDeleted} apply=${ANON_PURGE_APPLY}`);
    }

    return json({
      ok: true, removed, anonymousRemoved, stuckCompleted,
      anonUsersPurgeable, anonUsersDeleted, anonUsersDryRun: !ANON_PURGE_APPLY,
    }, 200);
  } catch (e) {
    console.error('[cleanup-orphan-repairs]', e);
    return json({ error: 'internal' }, 500);
  }
});

// Lekta Edge Function: process-bonus-outbox (Deno, Supabase).
//
// Ponavlja obveze nakon kupnje koje pri prvom pokusaju nisu prosle (audit P1-07, migracija 0100).
//
// ZASTO POSTOJI. `webhook-mor` nakon entitlementa radi tri bonusa (nagrada preporucitelju, pass
// kupon, referral atribucija) i svaki lovi svoju gresku pa nastavlja, da tranzijentni pad ne srusi
// handler u 500. To je ispravno rezoniranje, ali uhvacena greska se dosad SAMO LOGIRALA: nigdje
// nije ostajao zapis da obveza postoji, pa je nitko nikad nije ponovio. Iduci webhook za isti
// order izlazi na `duplicate_ignored` PRIJE bonusa. Korisnik je platio, a obecani kupon ili
// referral nagrada ne stignu nikad.
//
// Sada `webhook-mor` obvezu ZAPISE prije nego je pokusa izvrsiti, a ovaj radnik pokupi ono sto je
// ostalo `pending`.
//
// IDEMPOTENCIJA. Svi bonusi su i sami idempotentni preko vlastitih unique indeksa
// (`referrals_converted_order_key`, `coupon_grants_order_reason_key`, unique(provider, order_id) na
// nagradi), pa ponovni pokusaj nad vec izvrsenom obvezom ne moze duplicirati nista. Zato je
// sigurno ponavljati i kad nismo sigurni je li prvi pokusaj prosao.
//
// Sigurnost: cron-okidano, `verify_jwt = false`, stiti se DEDICIRANOM tajnom BONUS_OUTBOX_CRON_SECRET
// (Bearer, NIKAD service role), fail-closed kao send-reminders i cleanup-orphan-repairs.
//
// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.2';
import { isCronAuthorized } from '../_shared/cron-auth.ts';
import { tryGrantReferrerReward } from '../_shared/grant-referrer-reward.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CRON_SECRET = Deno.env.get('BONUS_OUTBOX_CRON_SECRET');

// Nakon toliko pokusaja obveza se prestaje ponavljati i ceka covjeka. Uz eksponencijalni odmak iz
// 0100 (2, 4, 8, 16 ... minuta) to je vise od pola dana pokusavanja, sto je daleko iznad svake
// tranzijentne smetnje. Ono sto ni tada ne prodje nije tranzijentno.
const MAX_ATTEMPTS = Number(Deno.env.get('BONUS_OUTBOX_MAX_ATTEMPTS') ?? '8');
const BATCH = Number(Deno.env.get('BONUS_OUTBOX_BATCH') ?? '50');

interface OutboxRow {
  id: string;
  user_id: string;
  order_id: string;
  kind: string;
  payload: Record<string, unknown>;
  attempts: number;
}

Deno.serve(async (req: Request) => {
  const json = (body: unknown, status = 200): Response =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  try {
    if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
    if (!isCronAuthorized(req, CRON_SECRET)) return json({ error: 'unauthorized' }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

    // `claim_due_bonus_outbox` uzima dospjelo pod `for update skip locked` i VEC PRI PREUZIMANJU
    // uvecava broj pokusaja. Zato dva paralelna radnika ne mogu uzeti istu obvezu, a obveza koja
    // srusi radnika prije nego stigne javiti gresku ne moze se vrtjeti u beskonacnoj petlji.
    const { data, error } = await admin.rpc('claim_due_bonus_outbox', {
      p_max_attempts: MAX_ATTEMPTS, p_limit: BATCH,
    });
    if (error) {
      console.error('[process-bonus-outbox] rpc', error);
      return json({ error: 'query_failed' }, 500);
    }

    const rows = (data ?? []) as OutboxRow[];
    let done = 0;
    let failed = 0;

    for (const row of rows) {
      try {
        if (row.kind === 'referrer_reward') {
          const workType = String(row.payload?.workType ?? '');
          if (!workType) throw new Error('payload bez workType');
          await tryGrantReferrerReward(admin, row.user_id, workType, row.order_id);
        } else if (row.kind === 'pass_coupon' || row.kind === 'referral_attribution') {
          // OVE DVIJE OVISE O PODACIMA KOJI ZIVE U webhook-mor MODULU (kod kupona, katalog
          // proizvoda, oblik dogadjaja za atribuciju). Ne rekonstruiraju se ovdje iz payloada, jer
          // bi to bila DRUGA implementacija istog pravila i te dvije bi se s vremenom razisle.
          //
          // Umjesto toga obveza ostaje `pending` uz jasan razlog, pa je vidljiva u nadzoru i moze
          // se rijesiti ponovnim slanjem webhooka (Lemon Squeezy "resend"), sto prolazi kroz
          // `duplicate_ignored` put i ondje je opet pokusava. To je posteno djelomicno rjesenje,
          // ne tiho preskakanje: broj se vraca u odgovoru i vidi se u logu.
          throw new Error(`vrsta '${row.kind}' se ponavlja slanjem webhooka, ne iz radnika`);
        } else {
          throw new Error(`nepoznata vrsta obveze: ${row.kind}`);
        }

        await admin.from('bonus_outbox')
          .update({ status: 'done', done_at: new Date().toISOString(), last_error: null })
          .eq('id', row.id);
        done++;
      } catch (e) {
        const poruka = e instanceof Error ? e.message : String(e);
        // Na granici pokusaja obveza prelazi u 'failed': prestaje se vrtjeti i ceka covjeka.
        const iscrpljeno = row.attempts >= MAX_ATTEMPTS;
        await admin.from('bonus_outbox')
          .update({ status: iscrpljeno ? 'failed' : 'pending', last_error: poruka.slice(0, 500) })
          .eq('id', row.id);
        if (iscrpljeno) failed++;
        console.error('[process-bonus-outbox] obveza', { id: row.id, kind: row.kind, poruka });
      }
    }

    console.log(`[process-bonus-outbox] preuzeto=${rows.length} izvrseno=${done} odustalo=${failed}`);
    return json({ ok: true, claimed: rows.length, done, failed }, 200);
  } catch (e) {
    console.error('[process-bonus-outbox]', e);
    return json({ error: 'internal' }, 500);
  }
});

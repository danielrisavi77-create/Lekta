// Lekta Edge Function: generate-report (Deno, Supabase).
// Spec: docs/MONETIZATION_AND_ANTI_ABUSE.md sekcija 5. Tanki omotac: auth i I/O nad bazom,
// a odluku donosi CISTA, testirana logika iz src/report/slot-logic.ts (npm run check je
// pokriva). Server racuna otisak iz ISTOG payloada iz kojeg gradi izvjestaj, pa lazirani
// otisak ne moze dobiti koristan izvjestaj za tudji slot. Pravo pristupa je serverska odluka.
//
// Napomena: ovo se izvodi u Supabase Deno runtimeu, ne u klijentskom `npm run check`.
// Logika je verificirana preko cistih modula; ovdje je samo glue (HTTP, JWT, SQL).
//
// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

import { computeFingerprint } from '../../../src/fingerprint/fingerprint.ts';
import { isReportWorkType } from '../../../src/report/pricing.ts';
import { buildFullReport } from '../../../src/report/report.ts';
import { decideReportAccess } from '../../../src/report/slot-logic.ts';
import { resolveDailyCap } from '../../../src/report/partner.ts';
import { coverageTierForStatus } from '../../../src/report/guarantee.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const DAILY_CAP = Number(Deno.env.get('DAILY_CAP') ?? '30');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'content-type': 'application/json' },
  });
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req: Request) => {
 try {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  // 1. auth: prijavljen korisnik (Supabase JWT)
  const authHeader = req.headers.get('Authorization') ?? '';
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
  const { data: userData } = await admin.auth.getUser(authHeader.replace(/^Bearer\s+/i, ''));
  const user = userData?.user;
  if (!user) return json({ error: 'unauthorized' }, 401);

  // input guard (P0 5.4): odbij predimenzioniran ili maliciozno napuhan payload prije obrade
  const MAX_BODY = 512 * 1024;
  const clen = Number(req.headers.get('content-length') ?? '0');
  if (clen && clen > MAX_BODY) return json({ error: 'payload_too_large' }, 413);
  const raw = await req.text();
  if (raw.length > MAX_BODY) return json({ error: 'payload_too_large' }, 413);
  let body: any = null;
  try { body = JSON.parse(raw); } catch { body = null; }
  if (!body || !isReportWorkType(body.workType) || !body.parsedStructure || !body.analysisResult) {
    return json({ error: 'bad_request' }, 400);
  }
  // kapiraj velicinu nizova (predimenzioniran payload -> 413, ne rusi funkciju)
  const withinCap = (a: unknown, n: number) => !Array.isArray(a) || a.length <= n;
  const ps = body.parsedStructure ?? {}, ar = body.analysisResult ?? {};
  if (
    !withinCap(ps.headings, 5000) ||
    !withinCap(ps.paragraphs, 20000) ||
    !withinCap(ar.checks, 4000) ||
    !withinCap(ar.details?.checks, 4000) ||
    !withinCap(ar.issues, 6000)
  ) {
    return json({ error: 'payload_too_large' }, 413);
  }
  const workType = body.workType;
  const now = new Date().toISOString();

  // 3. otisak iz payloada (serverski)
  const fingerprint = computeFingerprint(body.parsedStructure);

  // partner cap (sekcija 7): aktivan partner dobiva svoj daily_cap, inace retail DAILY_CAP
  const { data: partner } = await admin
    .from('partner_accounts')
    .select('status, daily_cap')
    .eq('user_id', user.id)
    .maybeSingle();
  const dailyCap = resolveDailyCap(
    partner ? { status: (partner as any).status, dailyCap: (partner as any).daily_cap } : null,
    DAILY_CAP,
  );

  // dohvat konteksta za odluku
  const [{ data: slots }, { data: entitlements }, { count: recent }] = await Promise.all([
    admin
      .from('document_slots')
      .select('id, work_type, fingerprint, slot_expires_at')
      .eq('user_id', user.id)
      .eq('work_type', workType)
      .gt('slot_expires_at', now),
    admin
      .from('entitlements')
      // products join preko product_id: slot_window_days s proizvoda (npr. Do obrane SKU 120d)
      .select('id, work_type, status, slots_used, slots_total, purchase_expires_at, products(slot_window_days)')
      .eq('user_id', user.id)
      .eq('work_type', workType)
      .eq('status', 'active'),
    admin
      .from('report_generations')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gt('created_at', new Date(Date.now() - 24 * 3600 * 1000).toISOString()),
  ]);

  const decision = decideReportAccess(
    {
      now,
      workType,
      fingerprint,
      activeSlots: (slots ?? []).map((s: any) => ({
        id: s.id,
        workType: s.work_type,
        fingerprint: s.fingerprint,
        slotExpiresAt: s.slot_expires_at,
      })),
      entitlements: (entitlements ?? []).map((e: any) => ({
        id: e.id,
        workType: e.work_type,
        status: e.status,
        slotsUsed: e.slots_used,
        slotsTotal: e.slots_total,
        purchaseExpiresAt: e.purchase_expires_at,
        slotWindowDays: e.products?.slot_window_days ?? undefined,
      })),
      recentGenerationCount: recent ?? 0,
    },
    { dailyCap },
  );

  const ipHash = await sha256Hex(req.headers.get('x-forwarded-for') ?? '');
  const log = (status: string, slotId: string | null) =>
    admin.from('report_generations').insert({
      user_id: user.id,
      slot_id: slotId,
      doc_fingerprint: fingerprint,
      ip_hash: ipHash,
      status,
    });

  if (decision.decision === 'rate_limited') {
    await log('rate_limited', null);
    return json({ error: 'rate_limited' }, 429);
  }

  if (decision.decision === 'payment_required') {
    await log('denied', null);
    return json({ error: 'payment_required', workType: decision.workType }, 402);
  }

  let slotId: string;
  if (decision.decision === 'recheck') {
    slotId = decision.slotId;
    await log('recheck', slotId);
  } else {
    // new_slot: atomsko trosenje entitlementa + bind slota (zastita od racea)
    const label = (fingerprint.titleNorm || 'rad').slice(0, 60);
    // tier snapshot na slotu (sekcija 10): iz statusa profila u trenutku vezivanja
    const coverageTier = coverageTierForStatus(body.analysisResult?.profileStatus);
    const profileRef = body.analysisResult?.details?.profileDefinitionId ?? body.analysisResult?.profile ?? null;
    const { data: slot, error } = await admin.rpc('consume_slot_and_bind', {
      p_entitlement_id: decision.entitlementId,
      p_user_id: user.id,
      p_work_type: workType,
      p_fingerprint: fingerprint,
      p_label: label,
      p_slot_expires_at: decision.newSlot.slotExpiresAt,
      p_profile_ref: profileRef,
      p_coverage_tier: coverageTier,
    });
    if (error || !slot) {
      await log('denied', null);
      return json({ error: 'payment_required', workType }, 402);
    }
    slotId = (slot as any).id;
    await log('new_slot', slotId);
  }

  const traceToken = await sha256Hex(`${slotId}.${now}.${user.id}`);
  const report = buildFullReport(body.analysisResult, { traceToken });
  return json({ report, slotId, fingerprint }, 200);
 } catch (e) {
  console.error('[generate-report]', e); // Supabase Edge Function logovi = error tracking (P0 8-1)
  return json({ error: 'internal' }, 500);
 }
});

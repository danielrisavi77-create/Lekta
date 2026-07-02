// Lekta Edge Function: file-guarantee-claim (Deno, Supabase).
// Spec: docs/MONETIZATION_PLAN.md sekcija 10, korak 15.7. Ulazni gate za garancijski zahtjev;
// odluka o povratu je poslije, rucna (admin). Tanki omotac: gate je testirani core
// src/report/guarantee.ts (canFileGuaranteeClaim). Auth JWT obavezan.
//
// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { canFileGuaranteeClaim } from '../../../src/report/guarantee.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'unauthorized' }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
  const { data: userData } = await admin.auth.getUser(token);
  const user = userData?.user;
  if (!user) return json({ error: 'unauthorized' }, 401);

  const body = await req.json().catch(() => ({} as any));
  const slotId = String(body.slotId ?? '');
  const ruleKey = body.ruleKey ? String(body.ruleKey) : null;
  const evidencePath = body.evidencePath ? String(body.evidencePath) : null;
  if (!slotId) return json({ error: 'bad_request' }, 400);

  // slot mora biti korisnikov; tier i bound_at su snimljeni pri vezivanju
  const { data: slot } = await admin
    .from('document_slots')
    .select('id, user_id, coverage_tier, bound_at')
    .eq('id', slotId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!slot) return json({ error: 'slot_not_found' }, 404);

  const decision = canFileGuaranteeClaim({
    coverageTier: (slot as any).coverage_tier ?? 0,
    boundAtMs: new Date((slot as any).bound_at).getTime(),
    nowMs: Date.now(),
    hasEvidence: !!evidencePath,
    ruleKey,
  });
  if (!decision.ok) return json({ error: decision.reason }, 422);

  const { data: claim, error } = await admin
    .from('guarantee_claims')
    .insert({ user_id: user.id, slot_id: slotId, rule_key: ruleKey, evidence_path: evidencePath })
    .select('id')
    .single();
  if (error) return json({ error: 'insert_failed', detail: error.message }, 500);

  return json({ ok: true, claimId: (claim as any).id, status: 'pending' });
});

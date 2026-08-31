// Lekta Edge Function: file-guarantee-claim (Deno, Supabase).
// Spec: docs/MONETIZATION_PLAN.md sekcija 10, korak 15.7. Ulazni gate za garancijski zahtjev;
// odluka o povratu je poslije, rucna (admin). Tanki omotac: gate je testirani core
// src/report/guarantee.ts (canFileGuaranteeClaim). Auth JWT obavezan.
//
// DOKAZ (audit P1-09). Do 2026-08-23 se `evidencePath` provjeravao samo na truthiness
// (`hasEvidence: !!evidencePath`) i takav zapisivao. Sada:
//   1. oblik i vlasnistvo odlucuje cisti modul src/report/guarantee-evidence.ts,
//   2. za dokaz u Storageu se TEK NAKON toga dira Storage: postojanje, velicina, MIME,
//   3. uz zahtjev se trajno zapisuje otisak (sha256), pa se poslije da dokazati sto je
//      pregledano i kad objekt vise ne postoji.
//
// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.2';
import { canFileGuaranteeClaim } from '../../../src/report/guarantee.ts';
import {
  validateGuaranteeEvidence,
  EVIDENCE_EXTENSIONS,
} from '../../../src/report/guarantee-evidence.ts';
import { corsHeadersFor } from '../_shared/cors.ts';
import { readTextBounded } from '../_shared/read-body.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Dopusteno CORS porijeklo (SEC-05): produkcijska domena; override preko ALLOWED_ORIGIN (zarezom
// odvojeno). Localhost je uvijek dopusten (dev). Reflektira se u corsHeadersFor (nikad '*'), isti
// obrazac kao faculty-request/preflight-start.
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGIN') ?? 'https://lektahr.netlify.app')
  .split(',').map((s) => s.trim()).filter(Boolean);

// Tijelo je opis dokaza i nekoliko identifikatora; granica je velikodusna prema tome, a tvrda
// prema napuhanom zahtjevu (audit P1-04, vidi _shared/read-body.ts).
const MAX_BODY_BYTES = 16 * 1024;

// Bucket i granice moraju odgovarati migraciji 0097.
const EVIDENCE_BUCKET = 'guarantee-evidence';
const EVIDENCE_MAX_BYTES = 10 * 1024 * 1024;
const EVIDENCE_MIME = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'];

interface EvidenceMeta {
  path: string;
  sha256: string;
  bytes: number;
  mime: string | null;
}

/**
 * Provjeri da objekt STVARNO postoji, da stane u granice i izracunaj mu otisak.
 *
 * Poziva se tek nakon sto je cisti modul potvrdio da putanja pripada pozivatelju: nikad ne diramo
 * Storage na temelju nevalidirane putanje. Velicina se cita iz metapodataka PRIJE preuzimanja, pa
 * prevelik objekt nikad ne udje u memoriju.
 */
async function inspectEvidence(
  admin: any,
  path: string,
): Promise<{ ok: true; meta: EvidenceMeta } | { ok: false; reason: string }> {
  const slash = path.lastIndexOf('/');
  const prefix = path.slice(0, slash);
  const name = path.slice(slash + 1);

  const { data: listed, error: listError } = await admin.storage
    .from(EVIDENCE_BUCKET)
    .list(prefix, { search: name, limit: 100 });
  if (listError) return { ok: false, reason: 'evidence_unavailable' };

  const entry = (listed ?? []).find((o: any) => o?.name === name);
  // Nepostojeci objekt NIJE dokaz. Stara provjera ovo nije ni gledala.
  if (!entry) return { ok: false, reason: 'evidence_not_found' };

  const bytes = Number(entry?.metadata?.size ?? 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return { ok: false, reason: 'evidence_not_found' };
  if (bytes > EVIDENCE_MAX_BYTES) return { ok: false, reason: 'evidence_too_large' };

  const mime = entry?.metadata?.mimetype ? String(entry.metadata.mimetype) : null;
  // MIME je i na bucketu (0097), ali ga provjeravamo i ovdje: bucket policy se da promijeniti iz
  // dashboarda, a ovaj kod je pod reviewom i testom.
  if (mime && !EVIDENCE_MIME.includes(mime)) return { ok: false, reason: 'evidence_type_not_allowed' };

  const { data: blob, error: dlError } = await admin.storage.from(EVIDENCE_BUCKET).download(path);
  if (dlError || !blob) return { ok: false, reason: 'evidence_unavailable' };

  const buf = new Uint8Array(await blob.arrayBuffer());
  // Preuzeta velicina mora odgovarati prijavljenoj; razlika znaci da se objekt mijenja pod nama.
  if (buf.byteLength !== bytes) return { ok: false, reason: 'evidence_unavailable' };

  const digest = await crypto.subtle.digest('SHA-256', buf);
  const sha256 = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return { ok: true, meta: { path, sha256, bytes, mime } };
}

Deno.serve(async (req: Request) => {
  const cors = corsHeadersFor(req.headers.get('Origin'), ALLOWED_ORIGINS);
  const json = (body: unknown, status = 200): Response =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } });
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'unauthorized' }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
  const { data: userData } = await admin.auth.getUser(token);
  const user = userData?.user;
  if (!user) return json({ error: 'unauthorized' }, 401);

  const raw = await readTextBounded(req, MAX_BODY_BYTES);
  if (!raw.ok) return json({ error: 'payload_too_large' }, 413);
  let body: any = {};
  try { body = raw.text ? JSON.parse(raw.text) : {}; } catch { return json({ error: 'bad_request' }, 400); }

  const slotId = String(body.slotId ?? '');
  const ruleKey = body.ruleKey ? String(body.ruleKey) : null;
  if (!slotId) return json({ error: 'bad_request' }, 400);

  // OBLIK I VLASNISTVO. `user.id` dolazi iz provjerenog JWT-a, nikad iz tijela zahtjeva.
  const evidence = validateGuaranteeEvidence({
    kind: body.evidenceKind ?? null,
    evidencePath: body.evidencePath,
    userId: user.id,
  });
  if (!evidence.ok) return json({ error: evidence.reason }, 422);

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
    // Dokaz je vec provjeren gore, pa je ovo sada tvrdnja koja nesto znaci, a ne `!!string`.
    hasEvidence: true,
    ruleKey,
  });
  if (!decision.ok) return json({ error: decision.reason }, 422);

  let meta: EvidenceMeta | null = null;
  if (evidence.kind === 'storage') {
    const inspected = await inspectEvidence(admin, evidence.path);
    if (!inspected.ok) return json({ error: inspected.reason }, 422);
    meta = inspected.meta;
  }

  const { data: claim, error } = await admin
    .from('guarantee_claims')
    .insert({
      user_id: user.id,
      slot_id: slotId,
      rule_key: ruleKey,
      evidence_kind: evidence.kind,
      evidence_path: evidence.kind === 'storage' ? evidence.path : evidence.text,
      evidence_sha256: meta?.sha256 ?? null,
      evidence_bytes: meta?.bytes ?? null,
      evidence_mime: meta?.mime ?? null,
    })
    .select('id')
    .single();
  if (error) return json({ error: 'insert_failed', detail: error.message }, 500);

  return json({
    ok: true,
    claimId: (claim as any).id,
    status: 'pending',
    evidenceKind: evidence.kind,
    // Otisak se vraca da ga korisnik moze usporediti s vlastitom datotekom; nije tajna.
    evidenceSha256: meta?.sha256 ?? null,
    acceptedTypes: EVIDENCE_EXTENSIONS,
  });
});

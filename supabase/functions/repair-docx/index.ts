// Lekta Edge Function: repair-docx (Deno, Supabase) — NACRT (WS-3).
// Placeni SERVER-SIDE repair: korisnik uploada .docx, server iza entitlementa pokrene isti
// CISTI repair engine iz src/repair/* (koji klijent vise NE isporucuje) i vrati ispravljen docx.
//
// Vjeran obrascu generate-report/index.ts: tanki glue (HTTP/JWT/SQL), a ODLUKE donose ciste,
// testirane funkcije (decideReportAccess, unambiguousMismatch, applyFixers) koje pokriva npm run check.
// Server racuna otisak iz parsedStructure (kao generate-report), pa lazirani otisak ne dobiva tudji slot.
//
// STATUS NACRTA (NIJE deployano):
//  - Tok auth -> mismatch-gate -> entitlement -> applyFixers -> vrati docx je KOMPLETAN i koristi
//    postojecu, testiranu logiku.
//  - WS-6 (pohrana "do brisanja") je STUB (storeRepairJob) dok ne postoji migracija repair_jobs +
//    Storage bucket. Bez toga funkcija radi, ali ne pohranjuje (nema "Moji popravci").
//  - DENO CAVEAT: work-type-estimate.ts uvozi data/work-type-scope.json bez import-attributa; u Denu
//    JSON uvoz treba `with { type: 'json' }`. Potvrdi pri deployu (WS-3). deflate-raw u Deno: potvrdi
//    _deno-smoke.ts prije deploya.
//
// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.2';

import { corsHeadersFor } from '../_shared/cors.ts';
import { hashClientIpSalted } from '../_shared/hash-ip.ts';
import { computeFingerprint } from '../../../src/fingerprint/fingerprint.ts';
import { isReportWorkType } from '../../../src/report/pricing.ts';
import { decideReportAccess } from '../../../src/report/slot-logic.ts';
import { coverageTierForStatus } from '../../../src/report/guarantee.ts';
import { resolveDailyCap } from '../../../src/report/partner.ts';
import { unambiguousMismatch } from '../../../src/report/work-type-estimate.ts';
import { applyFixers, FIXER_IDS, type FixerRequest } from '../../../src/repair/apply-fixers.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const DAILY_CAP = Number(Deno.env.get('DAILY_CAP') ?? '30');
const IP_HASH_SALT = Deno.env.get('IP_HASH_SALT') ?? '';
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGIN') ?? 'https://lektahr.netlify.app')
  .split(',').map((s) => s.trim()).filter(Boolean);

// Gornja granica uploada (sirovi docx). Base64 odgovor ~+33%; Edge memorija 256MB. Velik docx s
// puno medija drzi na oku (WS-3 rizik). Uskladi s klijentskim uploadMaxBytes.
const MAX_DOCX_BYTES = Number(Deno.env.get('REPAIR_MAX_DOCX_BYTES') ?? String(20 * 1024 * 1024));

// ZIVI fixeri (WS-4): strukturni K5/K6/K7 su TAMNI dok se ne odradi rucna Word/LibreOffice validacija.
// Server NE smije pokrenuti tamni fixer i kad ga klijent zatrazi (obrana protiv over-promisea/povrata).
// Mora ostati u sinkronizaciji s repair-items.ts (SECTION_INSERT_LIVE / TOC_FIELD_LIVE) i DEEP_CAPABLE.
const DARK_FIXERS = new Set(['section-insert-fixer', 'toc-field-fixer', 'footer-page-fixer']);
const LIVE_FIXERS = new Set(FIXER_IDS.filter((f) => !DARK_FIXERS.has(f)));

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

// WS-6 STUB: pohrani original + rezultat vezano uz korisnika (retencija "do brisanja"). Zahtijeva
// migraciju repair_jobs (original_path, result_path, work_type, fingerprint, status, created_at) +
// Storage bucket 'repair' (privatan, RLS po user_id, enkripcija at-rest). Vraca jobId ili null.
async function storeRepairJob(_admin: any, _userId: string, _meta: {
  workType: string; fingerprint: unknown; slotId: string; originalBytes: Uint8Array; resultBytes: Uint8Array;
}): Promise<string | null> {
  // TODO(WS-6): const orig = await admin.storage.from('repair').upload(`${userId}/${jobId}/original.docx`, originalBytes)
  //             const res  = await admin.storage.from('repair').upload(`${userId}/${jobId}/fixed.docx`, resultBytes)
  //             await admin.from('repair_jobs').insert({ user_id, work_type, fingerprint, status:'done', original_path, result_path })
  //             Brisanje u "Moji popravci" uklanja Storage objekte + redak (right to erasure).
  return null;
}

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

    // 2. multipart: 'file' (.docx binarno) + 'meta' (JSON: workType, parsedStructure, signals, requests,
    //    profileStatus, profileRef, confirmedMismatch). Doslovni tekst rada NE ide u meta (samo brojevi/enumi).
    const clen = Number(req.headers.get('content-length') ?? '0');
    if (clen && clen > MAX_DOCX_BYTES * 1.4) return json({ error: 'payload_too_large' }, 413);
    let form: FormData;
    try { form = await req.formData(); } catch { return json({ error: 'bad_request' }, 400); }
    const filePart = form.get('file');
    const metaRaw = form.get('meta');
    if (!(filePart instanceof File) || typeof metaRaw !== 'string') return json({ error: 'bad_request' }, 400);

    const docxBytes = new Uint8Array(await filePart.arrayBuffer());
    if (docxBytes.length === 0 || docxBytes.length > MAX_DOCX_BYTES) return json({ error: 'payload_too_large' }, 413);
    // brzi sanity: docx je ZIP (PK\x03\x04). Puni intake-gate (zip bomba/entry-cap) je u parseru; ovdje
    // applyFixers ionako baca na nevaljan docx (hvatamo nize).
    if (!(docxBytes[0] === 0x50 && docxBytes[1] === 0x4b)) return json({ error: 'not_a_docx' }, 415);

    let meta: any = null;
    try { meta = JSON.parse(metaRaw); } catch { meta = null; }
    if (!meta || !isReportWorkType(meta.workType) || !meta.parsedStructure) return json({ error: 'bad_request' }, 400);
    const workType = meta.workType;
    const now = new Date().toISOString();

    // 3. WS-2 enforcement: nedvosmislen nesklad vrste rada -> 409 (osim ako je korisnik potvrdio).
    //    Signali su sanitizirani (broj rijeci + enum marker), nikad doslovni tekst.
    const signals = { words: Number(meta.signals?.words) || null, titleMarker: meta.signals?.titleMarker ?? null };
    if (meta.confirmedMismatch !== true && unambiguousMismatch(workType, signals)) {
      return json({ error: 'tier_mismatch', workType }, 409);
    }

    // 4. validacija fixer-zahtjeva: samo poznati I ZIVI fixeri (K5/K6/K7 tamni dok WS-4 ne prodje).
    const rawReqs: any[] = Array.isArray(meta.requests) ? meta.requests : [];
    if (!rawReqs.length || rawReqs.length > 64) return json({ error: 'bad_request' }, 400);
    const requests: FixerRequest[] = [];
    for (const r of rawReqs) {
      if (!r || typeof r.fixerId !== 'string' || !LIVE_FIXERS.has(r.fixerId)) continue; // tihi preskok tamnih
      requests.push({ fixerId: r.fixerId, ruleId: String(r.ruleId ?? r.fixerId), params: (r.params && typeof r.params === 'object') ? r.params : {} });
    }
    if (!requests.length) return json({ error: 'no_live_fixers' }, 422);

    // 5. otisak iz parsedStructure (serverski) + entitlement odluka (isti model kao generate-report)
    const fingerprint = computeFingerprint(meta.parsedStructure);
    const { data: partner } = await admin
      .from('partner_accounts').select('status, daily_cap').eq('user_id', user.id).maybeSingle();
    const dailyCap = resolveDailyCap(
      partner ? { status: (partner as any).status, dailyCap: (partner as any).daily_cap } : null, DAILY_CAP);

    const [{ data: slots }, { data: entitlements }, { count: recent }] = await Promise.all([
      admin.from('document_slots').select('id, work_type, fingerprint, slot_expires_at')
        .eq('user_id', user.id).eq('work_type', workType).gt('slot_expires_at', now),
      admin.from('entitlements')
        .select('id, work_type, status, slots_used, slots_total, purchase_expires_at, products(slot_window_days)')
        .eq('user_id', user.id).eq('work_type', workType).eq('status', 'active'),
      admin.from('report_generations').select('id', { count: 'exact', head: true })
        .eq('user_id', user.id).gt('created_at', new Date(Date.now() - 24 * 3600 * 1000).toISOString()),
    ]);

    const decision = decideReportAccess({
      now, workType, fingerprint,
      activeSlots: (slots ?? []).map((s: any) => ({ id: s.id, workType: s.work_type, fingerprint: s.fingerprint, slotExpiresAt: s.slot_expires_at })),
      entitlements: (entitlements ?? []).map((e: any) => ({ id: e.id, workType: e.work_type, status: e.status, slotsUsed: e.slots_used, slotsTotal: e.slots_total, purchaseExpiresAt: e.purchase_expires_at, slotWindowDays: e.products?.slot_window_days ?? undefined })),
      recentGenerationCount: recent ?? 0,
    }, { dailyCap });

    const ipHash = await hashClientIpSalted(req.headers.get('x-forwarded-for'), IP_HASH_SALT, SERVICE_ROLE);
    const log = (status: string, slotId: string | null) =>
      admin.from('report_generations').insert({ user_id: user.id, slot_id: slotId, doc_fingerprint: fingerprint, ip_hash: ipHash, status });

    if (decision.decision === 'rate_limited') { await log('rate_limited', null); return json({ error: 'rate_limited' }, 429); }
    if (decision.decision === 'payment_required') { await log('denied', null); return json({ error: 'payment_required', workType: decision.workType }, 402); }

    let slotId: string;
    if (decision.decision === 'recheck') {
      slotId = decision.slotId; await log('recheck', slotId);
    } else {
      const label = (fingerprint.titleNorm || 'rad').slice(0, 60);
      const coverageTier = coverageTierForStatus(meta.profileStatus);
      const profileRef = meta.profileRef ?? null;
      const { data: slot, error } = await admin.rpc('consume_slot_and_bind', {
        p_entitlement_id: decision.entitlementId, p_user_id: user.id, p_work_type: workType,
        p_fingerprint: fingerprint, p_label: label, p_slot_expires_at: decision.newSlot.slotExpiresAt,
        p_profile_ref: profileRef, p_coverage_tier: coverageTier,
      });
      if (error || !slot) { await log('denied', null); return json({ error: 'payment_required', workType }, 402); }
      slotId = (slot as any).id; await log('new_slot', slotId);
    }

    // 6. POPRAVAK: isti engine kao klijent (src/repair). applyFixers je fail-safe (ne baca na
    //    pojedinacnom fixeru; baca samo ako docx nema word/document.xml).
    let result: Awaited<ReturnType<typeof applyFixers>>;
    try {
      result = await applyFixers(docxBytes, requests);
    } catch (_e) {
      await log('repair_failed', slotId);
      return json({ error: 'invalid_docx' }, 422);
    }

    // 7. WS-6 STUB: pohrana originala + rezultata (retencija do brisanja). Ne blokira odgovor ako padne.
    let jobId: string | null = null;
    try { jobId = await storeRepairJob(admin, user.id, { workType, fingerprint, slotId, originalBytes: docxBytes, resultBytes: result.docxBytes }); } catch (_e) { /* WS-6: log */ }

    const traceToken = await sha256Hex(`${slotId}.${now}.${user.id}`);
    return json({
      docxBase64: toBase64(result.docxBytes),
      fileName: (meta.fileName ? String(meta.fileName).replace(/\.docx$/i, '') : 'rad') + '-popravljeno.docx',
      changelog: result.changelog,
      skipped: result.skipped,
      slotId, jobId, traceToken, fingerprint,
    }, 200);
  } catch (e) {
    console.error('[repair-docx]', e);
    return json({ error: 'internal' }, 500);
  }
});

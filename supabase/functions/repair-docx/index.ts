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
import { unambiguousMismatch, estimateWorkType } from '../../../src/report/work-type-estimate.ts';
import { applyFixers, FIXER_IDS, type FixerRequest } from '../../../src/repair/apply-fixers.ts';
import { TERMS_VERSION } from '../../../src/legal/terms-version.ts';
import { verifyCorpusBatch, type CorpusCandidate } from '../../../src/citations/corpus-verify.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const DAILY_CAP = Number(Deno.env.get('DAILY_CAP') ?? '30');
const IP_HASH_SALT = Deno.env.get('IP_HASH_SALT') ?? '';
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGIN') ?? 'https://lektahr.netlify.app')
  .split(',').map((s) => s.trim()).filter(Boolean);

// Gornja granica uploada (sirovi docx). Base64 odgovor ~+33%; Edge memorija 256MB. Velik docx s
// puno medija drzi na oku (WS-3 rizik). Uskladi s klijentskim uploadMaxBytes.
const MAX_DOCX_BYTES = Number(Deno.env.get('REPAIR_MAX_DOCX_BYTES') ?? String(20 * 1024 * 1024));

// Provjera postojanja domacih izvora u M4 korpusu (plan docs/PLAN_KORPUS_PROVJERA_IZVORA.md, K3).
// Placeni dodatak uz popravak; besplatni sloj se NE mijenja i ostaje 100% lokalan.
// Brojke su izvedene iz mjerenja na produkciji: dohvat kosta ~2,8 ms po znaku naslova (85 ms za
// kratak, 200 ms za dug), pa rad s 40 referenci trazi 6 do 10 s. Zato budzet + serije + posten
// djelomican rezultat, umjesto da popravak ceka bez ogranicenja.
const CORPUS_ENABLED = (Deno.env.get('CORPUS_SOURCE_CHECK') ?? 'true') !== 'false';
const CORPUS_MAX_REFS = Number(Deno.env.get('CORPUS_MAX_REFS') ?? '60');
const CORPUS_BUDGET_MS = Number(Deno.env.get('CORPUS_BUDGET_MS') ?? '6000');
const CORPUS_CHUNK = Number(Deno.env.get('CORPUS_CHUNK') ?? '8');

// Besplatna beta (WS-7): kad je REPAIR_FREE_MODE=true, preskace se NAPLATNI gate (nema 402 ni trosenja
// slota), ali auth, consent, upload, popravak, POHRANA ("Moji popravci") i rate-limit po korisniku OSTAJU.
// Prijelaz na naplatu = ukloni zastavicu (bez ijedne klijentske izmjene). REPAIR_FREE_DAILY_CAP ogranicava
// broj besplatnih popravaka po korisniku u 24h (obrana od zlouporabe; broji se iz report_generations).
const FREE_MODE = Deno.env.get('REPAIR_FREE_MODE') === 'true';
const FREE_DAILY_CAP = Number(Deno.env.get('REPAIR_FREE_DAILY_CAP') ?? '10');
// Limit po IP-u: nuzan otkad anonimna prijava daje novi user_id u jednom pozivu, pa je limit po
// korisniku sam po sebi bezvrijedan protiv farmanja. Prag je namjerno visi od korisnickog da
// dijeljeni izlaz (faks, studentski dom) ne padne zbog nekoliko urednih korisnika.
const FREE_IP_DAILY_CAP = Number(Deno.env.get('REPAIR_FREE_IP_DAILY_CAP') ?? '40');

// ZIVI fixeri: strukturni K5/K6/K7 su UPALJENI 2026-07-19 nakon vlasnicke Word/LibreOffice validacije
// (WS-4): SECTION_INSERT_LIVE / TOC_FIELD_LIVE = true u repair-items.ts, TOC je SDT sadrzaj-kontrola.
// DARK_FIXERS je sada prazan (svi fixeri zivi); ostaje kao tocka gasenja ako se neki fixer mora vratiti
// u tamno bez ponovnog uvodjenja filtera. Mora ostati u sinkronizaciji s repair-items.ts.
// 'footer-page-fixer' je namjerno izvan SAMOSTALNIH zahtjeva: na jednosekcijskom radu bi broj
// stranice pao i na naslovnicu, pa ga klijent ni ne nudi kao zasebnu stavku. Zivi iskljucivo unutar
// kompozita section-insert-fixer, koji ga zove IZNUTRA (ne kroz `requests`), pa ovo filtriranje ne
// dira strukturni popravak. Prije je odluka postojala samo u klijentu, a rucno skrojen zahtjev
// zaobisao bi je.
const DARK_FIXERS = new Set<string>(['footer-page-fixer']);
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

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

// WS-6: pohrani original + rezultat vezano uz korisnika (retencija "do brisanja"). Migracija
// 0026_repair_jobs.sql daje tablicu repair_jobs (RLS select-own) + privatni bucket 'repair'.
// Putanja je '<user_id>/<job_id>/{original,fixed}.docx' (poklapa se sa storage RLS foldername[1]).
// Vraca jobId ili null. null NIJE greska za korisnika: popravak se svejedno vraca, samo se ne
// pojavi u "Moji popravci". Pri djelomicnom padu cisti vec uploadane BLOB-ove (bez orphana).
async function storeRepairJob(admin: any, userId: string, meta: {
  workType: string; fingerprint: any; slotId: string | null;
  originalBytes: Uint8Array; resultBytes: Uint8Array; changesCount: number;
  consentVersion: string; // WS-6.3: uvijek prisutna (consent gate iznad je zahtijeva), NOT NULL u bazi
  // Anonimni racun (bez e-maila). Bitno za RETENCIJU: takav korisnik izgubi pristup ciscenjem
  // preglednika i vise ne moze obrisati svoj dokument, pa se ti poslovi brisu automatski nakon
  // 30 dana (0033). Prijavljeni e-mailom zadrzavaju "dok ih sam ne obrise".
  anonymous: boolean;
}): Promise<string | null> {
  const jobId = crypto.randomUUID();
  const origPath = `${userId}/${jobId}/original.docx`;
  const resPath = `${userId}/${jobId}/fixed.docx`;
  const bucket = admin.storage.from('repair');

  // Oba uploada idu USPOREDNO: nisu medjusobno ovisni, a serijski su se njihove latencije zbrajale
  // na kriticnom putu. Pri padu bilo kojeg cistimo OBA patha (uspjeli upload ne smije ostati siroce).
  const [up1, up2] = await Promise.all([
    bucket.upload(origPath, meta.originalBytes, { contentType: DOCX_MIME, upsert: false }),
    bucket.upload(resPath, meta.resultBytes, { contentType: DOCX_MIME, upsert: false }),
  ]);
  if (up1.error || up2.error) {
    console.error('[repair-docx] storage upload failed', up1.error?.message ?? up2.error?.message);
    await bucket.remove([origPath, resPath]).catch(() => {});
    return null;
  }

  const label = String(meta.fingerprint?.titleNorm || 'rad').slice(0, 120);
  const { data, error } = await admin.from('repair_jobs').insert({
    id: jobId, user_id: userId, slot_id: meta.slotId, work_type: meta.workType,
    fingerprint: meta.fingerprint, label, original_path: origPath, result_path: resPath,
    original_bytes: meta.originalBytes.length, result_bytes: meta.resultBytes.length,
    changes_count: meta.changesCount, status: 'done', consent_version: meta.consentVersion,
    anonymous: meta.anonymous,
  }).select('id').single();
  if (error || !data) {
    console.error('[repair-docx] repair_jobs insert failed', error?.message);
    await bucket.remove([origPath, resPath]).catch(() => {});
    return null;
  }
  return jobId;
}

interface SourceCheckResult {
  found: Array<{ index: number; verdict: 'found' | 'weak'; score: number; matchedTitle: string; where: string; url: string | null }>;
  checked: number; total: number; truncated: boolean;
}

/**
 * PLACENI DODATAK: postoje li navedeni domaci izvori (M4 korpus, 526k radova iz Dabra i Hrcka).
 *
 * Cijeli je fail-open: greska, timeout ili ugasena zastavica znace da `sourceCheck` izostane, a
 * popravak se svejedno vrati. NIKAD ne baca (pozivatelj ga pokrece bez await pa bi odbijeni promise
 * bio neuhvacen) i nikad ne smije srusiti ono za sto je korisnik platio.
 *
 * Naslove salje klijent (`meta.references`), jer ih je vec izdvojio pri analizi. To je bibliografski
 * metapodatak, a ne novo otkrivanje: cijeli .docx je ionako u istom zahtjevu.
 *
 * PRESUDA: promasaj u korpusu NIJE dokaz da izvor ne postoji (korpus pokriva hrvatske repozitorije,
 * ne knjige ni strane izvore), pa se vraca samo ono sto je NADJENO, uz brojac koliko je referenci
 * stiglo na red. Sucelje mora prikazati `checked`/`total`, inace bi djelomican rezultat izgledao
 * kao potpun.
 */
async function runCorpusCheck(admin: any, references: unknown): Promise<SourceCheckResult | null> {
  if (!CORPUS_ENABLED) return null;
  try {
    const rawRefs: any[] = Array.isArray(references) ? references : [];
    const items = rawRefs.slice(0, CORPUS_MAX_REFS).map((r) => ({
      title: typeof r?.title === 'string' ? r.title : null,
      year: Number.isFinite(Number(r?.year)) ? Number(r.year) : null,
    }));
    if (!items.length) return null;

    const batch = await verifyCorpusBatch(items, async (keys, o) => {
      const { data, error } = await admin.rpc('corpus_search_many', {
        qs: keys, min_sim: o.min, top_n: o.top,
      });
      if (error) throw new Error(error.message);
      // RPC vraca plosnat popis s q_index; presloziti u niz kandidata po indeksu unutar serije.
      const byIndex: Array<CorpusCandidate[]> = keys.map(() => []);
      for (const row of (data ?? []) as any[]) {
        const i = Number(row.q_index) - 1; // generate_subscripts je 1-based
        if (i >= 0 && i < byIndex.length) {
          byIndex[i].push({
            title: String(row.title ?? ''), year: row.year ?? null,
            institution: row.institution ?? null, repo: row.repo ?? null, url: row.url ?? null,
          });
        }
      }
      return byIndex;
    }, { chunkSize: CORPUS_CHUNK, budgetMs: CORPUS_BUDGET_MS });

    return {
      found: batch.matches.flatMap((m, i) => (m ? [{
        index: i, verdict: m.verdict, score: Number(m.score.toFixed(3)),
        matchedTitle: m.matchedTitle, where: m.where, url: m.url,
      }] : [])),
      checked: batch.checked, total: batch.total, truncated: batch.truncated,
    };
  } catch (e) {
    console.error('[repair-docx] corpus check failed', e instanceof Error ? e.message : e);
    return null; // fail-open: popravak je vazniji od dodatka
  }
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
    //    profileStatus, profileRef, confirmedMismatch, references).
    //    Iz meta je izostavljen tekst RADA (ostaju brojevi i enumi); jedina iznimka su `references`,
    //    tj. naslovi i godine iz popisa literature, koji su nuzni za provjeru postojanja izvora
    //    (korak 8). To nije novo otkrivanje jer cijeli .docx putuje u istom zahtjevu.
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

    // 2a. WS-6.3 consent gate: dokument se NE uploada ni pohranjuje bez privole na TRENUTNE uvjete.
    //     Server je izvor istine (klijent zigose consentVersion=TERMS_VERSION); odbijamo ako privola
    //     nedostaje ili je za zastarjelu verziju (korisnik mora ponovno pristati). Isti obrazac kao
    //     create-checkout (consent_required 400). Gate je PRIJE entitlementa pa slot ne trosimo uzalud.
    if (meta.consentVersion !== TERMS_VERSION) {
      return json({ error: 'consent_required', termsVersion: TERMS_VERSION }, 400);
    }

    // 3. WS-2 enforcement: nedvosmislen nesklad vrste rada -> 409 (osim ako je korisnik potvrdio).
    //    Signali su sanitizirani (broj rijeci + enum marker), nikad doslovni tekst.
    const signals = { words: Number(meta.signals?.words) || null, titleMarker: meta.signals?.titleMarker ?? null };
    if (meta.confirmedMismatch !== true && unambiguousMismatch(workType, signals)) {
      return json({ error: 'tier_mismatch', workType, suggestedWorkType: estimateWorkType(signals).workType }, 409);
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

    // 5. otisak iz parsedStructure (serverski) + naplatni gate ILI besplatna beta (FREE_MODE)
    const fingerprint = computeFingerprint(meta.parsedStructure);
    const ipHash = await hashClientIpSalted(req.headers.get('x-forwarded-for'), IP_HASH_SALT, SERVICE_ROLE);
    const log = (status: string, sId: string | null) =>
      admin.from('report_generations').insert({ user_id: user.id, slot_id: sId, doc_fingerprint: fingerprint, ip_hash: ipHash, status });

    let slotId: string | null = null;
    if (FREE_MODE) {
      // Besplatna beta: bez naplate i bez slota (slot_id null), ali rate-limit OSTAJE, i to DVOSTRUK.
      //
      // Po korisniku NIJE dovoljno otkad su anonimne prijave ukljucene: anonimni racun se dobiva
      // jednim pozivom, pa se limit po user_id resetira ciscenjem preglednika. Zato uz njega ide i
      // limit po IP-u (isti ip_hash koji vec biljezimo), s vecim pragom da legitimni dijeljeni
      // izlaz (faks, dom, knjiznica) ne padne. Oba su fail-open na gresci upita: radije propusti
      // nego da srusi popravak, jer ovo nije sigurnosna granica nego zastita od farmanja.
      //
      // BROJI SE SAMO POTROSNJA OVOG PROIZVODA, i to samo pokusaji koji su stigli do popravka:
      //  - 'rate_limited' retke MORAMO iskljuciti, inace svaki blokiran pokusaj sam sebi produzuje
      //    blokadu (korisnik koji pokusava nikad ne izadje iz limita),
      //  - statusi izvjestaja ('new_slot', 'recheck', 'denied') pripadaju generate-reportu koji pise u
      //    ISTU tablicu, pa bi generirani izvjestaji trosili besplatne popravke,
      //  - 'free' se biljezi TEK nakon uspjesnog popravka (nize), a 'repair_failed' vrijedi jedan
      //    pokusaj: neuspio popravak tako kosta jedan slot umjesto dva, ali ni ne ostaje neogranicen.
      const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      const COUNTED = ['free', 'repair_failed'];
      const [{ count: recentUser }, { count: recentIp }] = await Promise.all([
        admin.from('report_generations').select('id', { count: 'exact', head: true })
          .eq('user_id', user.id).in('status', COUNTED).gt('created_at', since),
        admin.from('report_generations').select('id', { count: 'exact', head: true })
          .eq('ip_hash', ipHash).in('status', COUNTED).gt('created_at', since),
      ]);
      if ((recentUser ?? 0) >= FREE_DAILY_CAP || (recentIp ?? 0) >= FREE_IP_DAILY_CAP) {
        await log('rate_limited', null);
        return json({ error: 'rate_limited' }, 429);
      }
    } else {
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

      if (decision.decision === 'rate_limited') { await log('rate_limited', null); return json({ error: 'rate_limited' }, 429); }
      if (decision.decision === 'payment_required') { await log('denied', null); return json({ error: 'payment_required', workType: decision.workType }, 402); }

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
    }

    // 6. PROVJERA IZVORA KRECE ODMAH, USPOREDNO s popravkom i pohranom. Ovisi iskljucivo o
    //    meta.references, koje su dostupne od pocetka zahtjeva, pa ju je serijsko cekanje na kraju
    //    stajalo do 6 sekundi cistog dodatka na vrijeme odgovora. Namjerno BEZ await ovdje;
    //    runCorpusCheck ne baca, pa promise ne moze zavrsiti kao neuhvacena greska ni kad izadjemo
    //    ranije (npr. 422 na nevaljanom docx-u).
    const corpusPromise = runCorpusCheck(admin, meta.references);

    // 7. POPRAVAK: isti engine kao klijent (src/repair). applyFixers je fail-safe (ne baca na
    //    pojedinacnom fixeru; baca samo ako docx nema word/document.xml).
    let result: Awaited<ReturnType<typeof applyFixers>>;
    try {
      result = await applyFixers(docxBytes, requests);
    } catch (_e) {
      await log('repair_failed', slotId);
      return json({ error: 'invalid_docx' }, 422);
    }

    // Besplatna beta: potrosnja se biljezi TEK sada, kad je popravak stvarno napravljen. Ranije je
    // redak isao prije popravka, pa je neuspio pokusaj trosio dva slota od deset (jedan 'free' i
    // jedan 'repair_failed'), a korisnik nije dobio nista.
    if (FREE_MODE) await log('free', null);

    // 8. WS-6: pohrana originala + rezultata (retencija do brisanja). Ne blokira odgovor ako padne.
    let jobId: string | null = null;
    // Gate iznad je zajamcio meta.consentVersion === TERMS_VERSION, pa biljezimo AUTORITATIVNU serversku
    // verziju (nikad null, nikad klijentov proizvoljni string). consent_version je NOT NULL u 0026.
    try {
      jobId = await storeRepairJob(admin, user.id, { workType, fingerprint, slotId, originalBytes: docxBytes, resultBytes: result.docxBytes, changesCount: result.changelog.length, consentVersion: TERMS_VERSION, anonymous: user.is_anonymous === true });
    } catch (e) {
      // Tiho je bilo pogresno: klijentu obecavamo "Moji popravci", pa pad pohrane mora ostaviti trag.
      console.error('[repair-docx] storeRepairJob threw', e instanceof Error ? e.message : e);
    }

    // 9. Provjera izvora (pokrenuta u koraku 6) tek se sada preuzima. U pravilu je gotova jos
    //    tijekom popravka i pohrane, pa se ovdje ne ceka nista; u najgorem slucaju placa se razlika
    //    do njezina vlastitog budzeta, a ne cijelo njezino trajanje.
    const sourceCheck = await corpusPromise;

    const traceToken = await sha256Hex(`${slotId}.${now}.${user.id}`);
    return json({
      docxBase64: toBase64(result.docxBytes),
      fileName: (meta.fileName ? String(meta.fileName).replace(/\.docx$/i, '') : 'rad') + '-popravljeno.docx',
      changelog: result.changelog,
      skipped: result.skipped,
      slotId, jobId, traceToken, fingerprint, sourceCheck,
    }, 200);
  } catch (e) {
    console.error('[repair-docx]', e);
    return json({ error: 'internal' }, 500);
  }
});

// Lekta Edge Function: repair-docx (Deno, Supabase) — ZIVO U PRODUKCIJI.
// Placeni SERVER-SIDE repair: korisnik uploada .docx, server iza entitlementa pokrene isti
// CISTI repair engine iz src/repair/* (koji klijent vise NE isporucuje) i vrati ispravljen docx.
//
// Vjeran obrascu generate-report/index.ts: tanki glue (HTTP/JWT/SQL), a ODLUKE donose ciste,
// testirane funkcije (decideReportAccess, unambiguousMismatch, applyFixers) koje pokriva npm run check.
// RE-18 (2026-07-27): otisak se racuna iz STVARNO UPLOADANIH bajtova (extractFingerprintInputFromDocx
// nad word/document.xml + styles.xml), NIKAD iz klijentske meta.parsedStructure - inace bi lazirana
// meta (kopirana iz ranije analize) omogucila da se jedan potroseni slot "posudi" za popravak bilo
// kojeg drugog dokumenta iste vrste rada. Slot/kvota se trose TEK nakon sto applyFixers stvarno nesto
// promijeni (korak 7a, RE-17/RE-32): pao popravak ili 0 izmjena vise ne kostaju nista.
//
// STATUS: DEPLOYANO i aktivno (docs/GO_LIVE_REPAIR.md, docs/AUDIT_MASTER.md). Zaglavlje je do
// 2026-08-16 i dalje tvrdilo "NACRT / NIJE deployano" iako je funkcija bila u produkciji i imala
// produkcijske obrane ispod (ConcurrencyGate, storage kvota, kill switch); ostavljati taj tekst
// znaci da citatelj ne moze vjerovati nijednom statusu u datoteci.
//  - Tok auth -> mismatch-gate -> entitlement -> applyFixers -> vrati docx koristi postojecu,
//    testiranu logiku (npm run check je pokriva kroz ciste funkcije).
//  - Pohrana "do brisanja" (WS-6) je ZIVA: repair_jobs + Storage bucket postoje, a dovrsava se u
//    pozadini (EdgeRuntime.waitUntil), pa odgovor nosi `storagePending` dok ishod jos nije poznat.
//  - Rijeseni Deno caveati (potvrdjeni pri deployu): JSON uvoz u work-type-estimate.ts i
//    deflate-raw (_deno-smoke.ts).
//
// Operativni podsjetnik: prije svakog deploya repair motora rucno pokreni Tier 2 provjere
// (npm run verify:strict-open, npm run verify:word) - `npm run check` je samo Tier 0 i ne otvara
// dokument nijednim stvarnim uredivacem.
//
// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.2';

import { corsHeadersFor } from '../_shared/cors.ts';
import { hashClientIpSalted } from '../_shared/hash-ip.ts';
import { computeFingerprint } from '../../../src/fingerprint/fingerprint.ts';
import { extractFingerprintInputFromDocx } from '../../../src/fingerprint/extract-from-docx.ts';
import { readZip } from '../../../src/repair/zip-codec.ts';
import { DOCX_MAX_UPLOAD_BYTES, REPAIR_MAX_REQUESTS, paramsWithinBudget } from '../../../src/repair/docx-budget.ts';
import { resolveParams, type ParamSource } from '../../../src/repair/param-authority.ts';
import { isReportWorkType } from '../../../src/report/pricing.ts';
import { decideReportAccess } from '../../../src/report/slot-logic.ts';
import { coverageTierForStatus } from '../../../src/report/guarantee.ts';
import { resolveDailyCap } from '../../../src/report/partner.ts';
import { unambiguousMismatch, estimateWorkType } from '../../../src/report/work-type-estimate.ts';
import { applyFixers, FIXER_IDS, type FixerRequest } from '../../../src/repair/apply-fixers.ts';
import { TERMS_VERSION } from '../../../src/legal/terms-version.ts';
import { runCorpusCheck, corpusConfigFromEnv } from '../_shared/corpus-check.ts';
import { ConcurrencyGate, storageQuotaExceeded } from '../../../src/report/repair-limits.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const DAILY_CAP = Number(Deno.env.get('DAILY_CAP') ?? '30');
const IP_HASH_SALT = Deno.env.get('IP_HASH_SALT') ?? '';
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGIN') ?? 'https://lektahr.netlify.app')
  .split(',').map((s) => s.trim()).filter(Boolean);

// Kill switch (isti obrazac kao preflight-start PREFLIGHT_DISABLED): iskljuci bez deploya.
const REPAIR_DISABLED = (Deno.env.get('REPAIR_DISABLED') ?? '') === 'true';

// Concurrency (AUDIT_MASTER.md poglavlje 9): repair-docx je imao file-size + dnevni cap po
// korisniku/IP-u, ali nikakvu branu na PARALELNE teske zahtjeve unutar iste tople instance.
// Best-effort po izolatu (ConcurrencyGate dokumentira zasto nije globalno atomican).
const REPAIR_GATE = new ConcurrencyGate(Number(Deno.env.get('REPAIR_MAX_CONCURRENT') ?? '4'));

// Storage-kvota (AUDIT_MASTER.md poglavlje 9): globalni dnevni strop broja NOVIH repair_jobs
// redaka. Pri dosegnutoj kvoti popravak i dalje radi (korisnik dobiva docx), samo se
// preskace pohrana u "Moji popravci" (isto fail-open ponasanje kao vec postojeci null-storage
// slucajevi), da neograničen upis u Storage ne postane trosak/DoS povrsina.
const REPAIR_STORAGE_DAILY_CAP = Number(Deno.env.get('REPAIR_STORAGE_DAILY_CAP') ?? '500');

// Gornja granica uploada (sirovi docx). Base64 odgovor ~+33%; Edge memorija 256MB. Velik docx s
// puno medija drzi na oku (WS-3 rizik).
//
// Vrijednost se UVOZI iz src/repair/docx-budget.ts, ne ponavlja kao literal: prije je ovdje stajao
// vlastiti `20 * 1024 * 1024` uz komentar "Uskladi s klijentskim uploadMaxBytes", dakle uskladjenost
// je ovisila o tome da se netko sjeti promijeniti dva mjesta. Env override ostaje za hitne zahvate.
const MAX_DOCX_BYTES = Number(Deno.env.get('REPAIR_MAX_DOCX_BYTES') ?? String(DOCX_MAX_UPLOAD_BYTES));

// Provjera postojanja domacih izvora u M4 korpusu (plan docs/PLAN_KORPUS_PROVJERA_IZVORA.md, K3).
// Placeni dodatak uz popravak; besplatni sloj se NE mijenja i ostaje 100% lokalan. Konfiguracija i
// fail-open ugovor zive u _shared/corpus-check.ts (dijeljeno sa source-check funkcijom).
//
// OVAJ put je sada NASLIJEDJENI: novi klijent salje meta.sourceCheckSeparate i zove source-check
// usporedno, pa popravak ne ceka korpus. Grana ispod ostaje zbog starijih klijenata (deploy nije
// atomaran: server se objavi prije klijenta), da nitko ne ostane bez znacajke u medjuvremenu.
const CORPUS_CONFIG = corpusConfigFromEnv(Deno.env);

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
//
// jobId dolazi IZVANA (od pozivatelja), a ne generira se ovdje, jer se pohrana od 2026-07-27 vrti
// kao POZADINSKI zadatak: odgovor korisniku odlazi prije nego ona zavrsi, pa mora znati jobId
// unaprijed. Vracena vrijednost tada sluzi samo logu (nitko je vise ne ceka).
async function storeRepairJob(admin: any, userId: string, jobId: string, meta: {
  workType: string; fingerprint: any; slotId: string | null;
  originalBytes: Uint8Array; resultBytes: Uint8Array; changesCount: number;
  consentVersion: string; // WS-6.3: uvijek prisutna (consent gate iznad je zahtijeva), NOT NULL u bazi
  // Anonimni racun (bez e-maila). Bitno za RETENCIJU: takav korisnik izgubi pristup ciscenjem
  // preglednika i vise ne moze obrisati svoj dokument, pa se ti poslovi brisu automatski nakon
  // 30 dana (0033). Prijavljeni e-mailom zadrzavaju "dok ih sam ne obrise".
  anonymous: boolean;
}): Promise<string | null> {
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

Deno.serve(async (req: Request) => {
  const cors = corsHeadersFor(req.headers.get('Origin'), ALLOWED_ORIGINS);
  const json = (body: unknown, status = 200): Response =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } });
  // Mjerenje trajanja po fazama: bez njega je "popravak je spor" osjecaj, ne podatak. Ispisuje se
  // jednim retkom na kraju uspjesnog puta (koraci koji izadju ranije ionako nisu spori).
  const t0 = performance.now();
  const ms = (from: number) => Math.round(performance.now() - from);
  // Postavlja se true tek nakon uspjesnog REPAIR_GATE.tryAcquire(); finally ispod smije zvati
  // release() SAMO tada (ranije 401/disabled/OPTIONS izlazi nikad nisu uzeli slot).
  let gateAcquired = false;
  try {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
    if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
    if (REPAIR_DISABLED) return json({ error: 'disabled' }, 503);

    // 1. auth
    const authHeader = req.headers.get('Authorization') ?? '';
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
    const { data: userData } = await admin.auth.getUser(authHeader.replace(/^Bearer\s+/i, ''));
    const user = userData?.user;
    if (!user) return json({ error: 'unauthorized' }, 401);

    // Concurrency gate: NAKON autha (necemo brojati neautorizirani sum), PRIJE ijednog teskog
    // koraka (multipart parsing, zip citanje, applyFixers). release() u finally ispod jamci
    // oslobadjanje na SVAKOM izlazu (rani return, uspjeh ili baceni izuzetak).
    if (!REPAIR_GATE.tryAcquire()) return json({ error: 'busy' }, 503);
    gateAcquired = true;

    // 2. multipart: 'file' (.docx binarno) + 'meta' (JSON: workType, signals, requests,
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
    //
    // Provjeravaju se SVA CETIRI bajta lokalnog zaglavlja, ne samo "PK" (audit SEC-21). Sam par
    // PK dijele i prazan arhiv (PK 05 06) i raspareni segment (PK 07 08), koji nisu ulaz s kojim
    // ovaj put smije raditi. Isto vec radi field-render, pa su dvije ulazne tocke sada jednako
    // stroge umjesto da jedna bude slabija bez razloga.
    const ZIP_LOCAL_HEADER = [0x50, 0x4b, 0x03, 0x04];
    if (!ZIP_LOCAL_HEADER.every((b, i) => docxBytes[i] === b)) return json({ error: 'not_a_docx' }, 415);

    let meta: any = null;
    try { meta = JSON.parse(metaRaw); } catch { meta = null; }
    // `parsedStructure` se od 2026-08-17 vise NE trazi (audit DOCX-01/02). Bio je obavezan, a
    // koristio se iskljucivo kao presence-check: otisak se racuna iz stvarnih bajtova uploadanog
    // zipa (vidi RE-18 nize), ne iz njega. Time je popravak na svaki poziv primao naslov, autora i
    // naslove poglavlja, dakle doslovan tekst rada, bez ijedne funkcije.
    //
    // Stariji klijenti iz predmemorije ga jos salju; polje se jednostavno ignorira, pa nema
    // prijelaznog razdoblja u kojem bi im popravak pukao.
    if (!meta || !isReportWorkType(meta.workType)) return json({ error: 'bad_request' }, 400);
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
    //
    // RE-62 (2026-08-16): CILJANA VRIJEDNOST se od sada izvodi na serveru, iz pecenog recepta
    // (param-authority.ts), a ne preuzima od klijenta. Do sada je klijent slao i `params`, pa je
    // rucno skrojen zahtjev mogao traziti npr. margine koje nijedan profil ne propisuje - server
    // ih je samo tipski sanirao i primijenio. Klijentov `params` sada vrijedi SAMO tamo gdje
    // fakultetskog pravila nema (univerzalna higijena), i to se izricito biljezi u odgovoru.
    const rawReqs: any[] = Array.isArray(meta.requests) ? meta.requests : [];
    if (!rawReqs.length || rawReqs.length > REPAIR_MAX_REQUESTS) return json({ error: 'bad_request' }, 400);
    const profileRefForParams: string | null = typeof meta.profileRef === 'string' ? meta.profileRef : null;
    const requests: FixerRequest[] = [];
    const paramSources: Record<string, ParamSource> = {};
    /**
     * Zahtjevi koje server NE prepoznaje (audit DOCX-13).
     *
     * Do sada su se tiho preskakali: korisnik bi poslao stavku, dobio dokument i vjerovao da je
     * primijenjena, iako je server nikad nije vidio kao zivu. Tisina je ovdje najgori ishod, jer
     * je nerazlucva od uspjeha. Sada se vracaju u odgovoru pa ih sucelje moze prikazati.
     */
    const unknownFixers: string[] = [];
    for (const r of rawReqs) {
      if (!r || typeof r.fixerId !== 'string' || !LIVE_FIXERS.has(r.fixerId)) {
        if (r && typeof r.fixerId === 'string') unknownFixers.push(r.fixerId.slice(0, 80));
        continue;
      }
      const ruleId = String(r.ruleId ?? r.fixerId);
      const clientParams = (r.params && typeof r.params === 'object') ? r.params : {};
      // Broj zahtjeva je bio ogranicen, ali NJIHOV SADRZAJ nije (audit DOCX-14): jedan zahtjev
      // mogao je nositi niz od desetaka tisuca indeksa i time napuhati obradu unutar dopustenih
      // 64 zahtjeva. Prekoracenje se ODBIJA glasno, ne preskace tiho.
      const budget = paramsWithinBudget(clientParams);
      if (!budget.ok) return json({ error: 'bad_request', reason: budget.reason }, 400);
      const resolved = resolveParams(profileRefForParams, ruleId, r.fixerId, clientParams);
      paramSources[ruleId] = resolved.source;
      requests.push({ fixerId: r.fixerId, ruleId, params: resolved.params });
    }
    if (!requests.length) return json({ error: 'no_live_fixers' }, 422);

    // 5. otisak IZ STVARNIH bajtova (RE-18): document.xml/styles.xml se citaju direktno iz
    //    uploadanog zipa, NIKAD iz klijentske meta.parsedStructure. Prije je otisak dolazio iz
    //    klijentskog JSON-a pa je jedan potroseni slot mogao "posuditi" identitet za popravak
    //    BILO KOJEG drugog dokumenta iste vrste rada (isti meta, zamijenjen file). title/author
    //    se namjerno ne pokusavaju izvuci (naslovnica varijante); computeFingerprint pada na prvi H1.
    let fingerprint: ReturnType<typeof computeFingerprint>;
    try {
      const entries = await readZip(docxBytes);
      const decoder = new TextDecoder();
      const documentEntry = entries.find((e) => e.name === 'word/document.xml');
      const stylesEntry = entries.find((e) => e.name === 'word/styles.xml');
      if (!documentEntry) return json({ error: 'invalid_docx' }, 422);
      fingerprint = computeFingerprint(extractFingerprintInputFromDocx(
        decoder.decode(documentEntry.data),
        stylesEntry ? decoder.decode(stylesEntry.data) : '',
      ));
    } catch (_e) {
      return json({ error: 'invalid_docx' }, 422);
    }
    const ipHash = await hashClientIpSalted(req.headers.get('x-forwarded-for'), IP_HASH_SALT, SERVICE_ROLE);
    const log = (status: string, sId: string | null) =>
      admin.from('report_generations').insert({ user_id: user.id, slot_id: sId, doc_fingerprint: fingerprint, ip_hash: ipHash, status });

    // Naplatni gate ILI besplatna beta (FREE_MODE): ODLUCI ovdje (rate_limited/payment_required
    // vracaju odmah, ne trose nista), ali STVARNU potrosnju (RPC/log upis) odgodi u `commit` do
    // koraka 7a: RE-17/RE-32, pao popravak (422) ili uspjeh s 0 izmjena vise NE smiju trositi
    // placeni slot ni besplatnu dnevnu kvotu bez ijedne stvarne izmjene.
    let commit: () => Promise<{ slotId: string | null; entitlementFailed?: boolean }>;
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
      //  - 'free' se biljezi TEK nakon uspjesnog popravka s >0 izmjena (7a), a 'repair_failed'
      //    vrijedi jedan pokusaj (RE-17 catch grana ispod); nula-izmjena (RE-32) se NE biljezi
      //    uopce, ne trosi kvotu jer korisnik nista nije dobio ali ni izgubio.
      const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      const COUNTED = ['free', 'repair_failed'];
      const [{ count: recentUser }, { count: recentIp }] = await Promise.all([
        admin.from('report_generations').select('id', { count: 'exact', head: true })
          .eq('user_id', user.id).in('status', COUNTED).gt('created_at', since),
        admin.from('report_generations').select('id', { count: 'exact', head: true })
          .eq('ip_hash', ipHash).in('status', COUNTED).gt('created_at', since),
      ]);
      // RE-33: 429 nosi razlog, da klijent ne mora tvrditi "besplatnih" i kad je posrijedi
      // dijeljeni IP-cap (korisnik osobno nije potrosio nista) ili placeni dnevni strop.
      if ((recentUser ?? 0) >= FREE_DAILY_CAP) { await log('rate_limited', null); return json({ error: 'rate_limited', reason: 'free_user' }, 429); }
      if ((recentIp ?? 0) >= FREE_IP_DAILY_CAP) { await log('rate_limited', null); return json({ error: 'rate_limited', reason: 'free_ip' }, 429); }
      commit = async () => { await log('free', null); return { slotId: null }; };
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

      if (decision.decision === 'rate_limited') { await log('rate_limited', null); return json({ error: 'rate_limited', reason: 'paid_daily' }, 429); }
      if (decision.decision === 'payment_required') { await log('denied', null); return json({ error: 'payment_required', workType: decision.workType }, 402); }

      if (decision.decision === 'recheck') {
        const slotId = decision.slotId;
        commit = async () => { await log('recheck', slotId); return { slotId }; };
      } else {
        const label = (fingerprint.titleNorm || 'rad').slice(0, 60);
        const coverageTier = coverageTierForStatus(meta.profileStatus);
        const profileRef = meta.profileRef ?? null;
        commit = async () => {
          const { data: slot, error } = await admin.rpc('consume_slot_and_bind', {
            p_entitlement_id: decision.entitlementId, p_user_id: user.id, p_work_type: workType,
            p_fingerprint: fingerprint, p_label: label, p_slot_expires_at: decision.newSlot.slotExpiresAt,
            p_profile_ref: profileRef, p_coverage_tier: coverageTier,
          });
          if (error || !slot) { await log('denied', null); return { slotId: null, entitlementFailed: true }; }
          const sId = (slot as any).id; await log('new_slot', sId); return { slotId: sId };
        };
      }
    }

    // 6. PROVJERA IZVORA (naslijedjeni put). Novi klijent salje sourceCheckSeparate:true i zove
    //    source-check funkciju USPOREDNO s uploadom, pa popravak na nju uopce ne ceka; tada je
    //    ovdje preskacemo da se isti posao ne odradi dvaput (dvostruki trosak baze bez ijedne
    //    koristi). Za starijeg klijenta ostaje kako je bilo: krece odmah, usporedno s popravkom i
    //    pohranom, namjerno BEZ await (runCorpusCheck ne baca, pa promise ne moze zavrsiti kao
    //    neuhvacena greska ni kad izadjemo ranije, npr. 422 na nevaljanom docx-u).
    const corpusPromise = meta.sourceCheckSeparate === true
      ? Promise.resolve(null)
      : runCorpusCheck(admin, meta.references, CORPUS_CONFIG);

    // 7. POPRAVAK: isti engine kao klijent (src/repair). applyFixers je fail-safe (ne baca na
    //    pojedinacnom fixeru; baca samo ako docx nema word/document.xml).
    let result: Awaited<ReturnType<typeof applyFixers>>;
    const tRepair = performance.now();
    try {
      result = await applyFixers(docxBytes, requests);
    } catch (_e) {
      // RE-17: nijedan slot/kvota nije jos potrosen (commit se zove tek ispod), pa pao popravak
      // vise ne kosta nista. 'repair_failed' se ipak biljezi (slotId uvijek null) da FREE_MODE
      // racuna neuspjeli pokusaj kao jedan slot, ne dva (isti razlog kao ranije).
      await log('repair_failed', null);
      return json({ error: 'invalid_docx' }, 422);
    }

    // 7a. RE-32: 0 stvarnih izmjena vise NIJE "uspjeh" koji trosi slot/kvotu ili pise u "Moji
    //     popravci" - dokument je vec uskladjen (ili nista od trazenog nije bilo primjenjivo), pa
    //     se vraca bit-identican dokument BEZ ikakve potrosnje. changelog:[] u odgovoru je signal
    //     klijentu da ne tvrdi "Popravljeno".
    // 7aa. VRATA INTEGRITETA: applyFixers je odbio isporuku jer bi izlazni paket bio neispravan
    //      (vidi detectIntegrityFailure). Ovo je NAS bug, a ne korisnikov dokument, pa se NE vraca
    //      422 invalid_docx - to bi optuzilo njegov rad. Kao i kod nula izmjena (RE-32) ne biljezi
    //      se nista: korisnik nije nista dobio ali ni izgubio, pa ne smije platiti ni slotom ni
    //      besplatnom kvotom. console.error je jedini trag, namjerno glasan.
    if (result.integrityFailure) {
      console.error(
        `[repair-docx] vrata integriteta odbila isporuku: ${result.integrityFailure.part}: ${result.integrityFailure.problem}` +
        (result.integrityFailure.offset != null ? ` (offset ${result.integrityFailure.offset})` : ''),
      );
      return json({ error: 'integrity_failed', integrityFailure: result.integrityFailure }, 200);
    }

    if (result.changelog.length === 0) {
      const msRepair = ms(tRepair);
      const tCorpus = performance.now();
      const sourceCheck = await corpusPromise;
      console.log(`[repair-docx] timings repair=${msRepair} store=0 corpus=${ms(tCorpus)} total=${ms(t0)} (nula izmjena)`);
      return json({
        docxBase64: toBase64(result.docxBytes),
        fileName: (meta.fileName ? String(meta.fileName).replace(/\.docx$/i, '') : 'rad') + '-popravljeno.docx',
        changelog: [], skipped: result.skipped, skippedReasons: result.skippedReasons,
        slotId: null, jobId: null, fingerprint, sourceCheck,
      }, 200);
    }

    // RE-17: popravak je STVARNO nesto promijenio - tek sada trosimo slot/kvotu.
    const msRepair = ms(tRepair);
    const committed = await commit();
    if (committed.entitlementFailed) return json({ error: 'payment_required', workType }, 402);
    const slotId = committed.slotId;

    // 8. WS-6: pohrana originala + rezultata (retencija do brisanja).
    //
    // Storage-kvota (poglavlje 9): globalni dnevni strop broja NOVIH poslova, provjeren PRIJE
    // ijednog Storage uploada. Prekoracenje NIKAD ne kvari sam popravak (docx se svejedno
    // vraca korisniku), samo se preskace pohrana - isto fail-open ponasanje kao vec postojeci
    // slucajevi gdje storeRepairJob vrati null (Storage/DB pad).
    const { count: recentJobCount } = await admin
      .from('repair_jobs')
      .select('id', { count: 'exact', head: true })
      .gt('created_at', new Date(Date.now() - 24 * 3600 * 1000).toISOString());
    const storageAllowed = !storageQuotaExceeded(recentJobCount ?? 0, REPAIR_STORAGE_DAILY_CAP);
    if (!storageAllowed) {
      console.warn(`[repair-docx] storage-kvota dosegnuta (${recentJobCount ?? 0}/${REPAIR_STORAGE_DAILY_CAP}), preskacem pohranu`);
    }

    // POZADINSKI ZADATAK: dva Storage uploada (do 2 x 20 MB) su drzala odgovor iako korisnik na njih
    // ne ceka nista - popravljeni dokument je vec u memoriji i mogao je krenuti prema njemu.
    // EdgeRuntime.waitUntil drzi izolat zivim dok zadatak ne zavrsi, pa se pohrana dovrsi nakon
    // odgovora. jobId se generira OVDJE da ga odgovor moze nositi prije nego pohrana zavrsi.
    //
    // FALLBACK je namjeran: ako runtime nema waitUntil (lokalni serve, starija verzija), pohrana se
    // ceka kao dosad. Radije sporije nego izgubljen dokument.
    const jobId = storageAllowed ? crypto.randomUUID() : null;
    const tStore = performance.now();
    // Gate iznad je zajamcio meta.consentVersion === TERMS_VERSION, pa biljezimo AUTORITATIVNU serversku
    // verziju (nikad null, nikad klijentov proizvoljni string). consent_version je NOT NULL u 0026.
    const storeTask = jobId ? (async () => {
      try {
        const stored = await storeRepairJob(admin, user.id, jobId, { workType, fingerprint, slotId, originalBytes: docxBytes, resultBytes: result.docxBytes, changesCount: result.changelog.length, consentVersion: TERMS_VERSION, anonymous: user.is_anonymous === true });
        console.log(`[repair-docx] store job=${jobId} ok=${stored ? 1 : 0} ms=${ms(tStore)}`);
      } catch (e) {
        // Tiho je bilo pogresno: klijentu obecavamo "Moji popravci", pa pad pohrane mora ostaviti trag.
        // U pozadinskom zadatku je ovaj log JEDINI trag: korisnik je odgovor vec dobio.
        console.error('[repair-docx] storeRepairJob threw', e instanceof Error ? e.message : e);
      }
    })() : null;
    const bg = (globalThis as any).EdgeRuntime?.waitUntil;
    let msStore = 0;
    if (storeTask) {
      if (typeof bg === 'function') {
        bg.call((globalThis as any).EdgeRuntime, storeTask);
      } else {
        await storeTask;
        msStore = ms(tStore);
      }
    }

    // 9. Provjera izvora (naslijedjeni put) tek se sada preuzima. Za novog klijenta je ovo vec
    //    razrijesen null (provjeru vodi zaseban, usporedan poziv), pa se ne ceka nista.
    const tCorpus = performance.now();
    const sourceCheck = await corpusPromise;
    console.log(`[repair-docx] timings repair=${msRepair} store=${msStore} corpus=${ms(tCorpus)} total=${ms(t0)}`);

    const traceToken = await sha256Hex(`${slotId}.${now}.${user.id}`);
    return json({
      docxBase64: toBase64(result.docxBytes),
      fileName: (meta.fileName ? String(meta.fileName).replace(/\.docx$/i, '') : 'rad') + '-popravljeno.docx',
      changelog: result.changelog,
      skipped: result.skipped,
      skippedReasons: result.skippedReasons,
      // storagePending: pohrana jos traje u pozadini, pa jobId JEST rezerviran ali posao mozda jos
      // nije vidljiv u "Moji popravci". Klijent zato ne smije tvrditi da je spremljeno. Kad je
      // jobId null (storage-kvota dosegnuta), pending je uvijek false: pohrana nije ni pokusana.
      slotId, jobId, storagePending: !!jobId && typeof bg === 'function', traceToken, fingerprint, sourceCheck,
      // ruleId -> je li ciljanu vrijednost izveo SERVER iz profila ('profile') ili je preuzeta od
      // klijenta jer za to pravilo nema fakultetskog zapisa ('client'). Bez ovoga sucelje ne moze
      // posteno razlikovati "popravljeno prema pravilu tvog fakulteta" od "popravljeno prema
      // opcoj preporuci", a upravo je ta razlika ono sto Lekta prodaje.
      paramSources,
      // Zahtjevi koje server nije prepoznao kao zive (audit DOCX-13). Izostavljeno kad ih nema, da
      // sucelje ne mora razlikovati praznu listu od nepostojanja polja.
      ...(unknownFixers.length ? { unknownFixers } : {}),
    }, 200);
  } catch (e) {
    console.error('[repair-docx]', e);
    return json({ error: 'internal' }, 500);
  } finally {
    if (gateAcquired) REPAIR_GATE.release();
  }
});

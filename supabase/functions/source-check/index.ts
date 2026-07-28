// Lekta Edge Function: source-check (Deno, Supabase).
//
// Provjera postojanja navedenih izvora u M4 korpusu (526k hrvatskih radova iz Dabra i Hrcka),
// IZDVOJENA iz repair-docx odgovora. Prije je popravak cekao i nju: korpusni budzet je do 45 s,
// pa je korisnik cesto gledao spinner jos 10-15 sekundi nakon sto je dokument vec bio popravljen.
// Sada klijent zove ovu funkciju USPOREDNO s uploadom dokumenta (ovisi samo o naslovima literature,
// koje ima lokalno prije uploada), pa popravak stize u svom vremenu, a izvori se dopune kad budu.
//
// SADRZAJ: prima ISKLJUCIVO bibliografske metapodatke (naslov + godina), nikad tekst rada i nikad
// dokument. To je uzi ulaz nego sto repair-docx ionako prima.
//
// Tanki glue (HTTP/JWT/rate-limit), odluke su u cistim modulima: runCorpusCheck (_shared/
// corpus-check.ts, dijeljeno s repair-docx) i verifyCorpusBatch (src/citations/corpus-verify.ts,
// pokriveno s npm run check).
//
// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.2';

import { corsHeadersFor } from '../_shared/cors.ts';
import { hashClientIpSalted } from '../_shared/hash-ip.ts';
import { runCorpusCheck, corpusConfigFromEnv } from '../_shared/corpus-check.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const IP_HASH_SALT = Deno.env.get('IP_HASH_SALT') ?? '';
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGIN') ?? 'https://lektahr.netlify.app')
  .split(',').map((s) => s.trim()).filter(Boolean);

const CORPUS_CONFIG = corpusConfigFromEnv(Deno.env);

// Dnevni limiti. Endpoint bez dokumenta je inace besplatan javni pretrazivac nad korpusom, pa
// prijava sama po sebi nije dovoljna: anonimni racun se dobiva jednim pozivom. Zato ide DVOSTRUK
// atomski cap preko postojeceg claim_ip_rate_slot (0022_ip_rate_limits): jedan po korisniku, jedan
// po IP-u, s visim pragom da dijeljeni izlaz (faks, dom, knjiznica) ne padne zbog nekoliko urednih
// korisnika. Prag po korisniku je namjerno velikodusniji od popravka: provjera je jeftinija i
// korisnik ju smije ponoviti nakon ispravaka literature, ne trosi ni slot ni kvotu popravaka.
const USER_DAILY_CAP = Number(Deno.env.get('SOURCE_CHECK_USER_DAILY_CAP') ?? '40');
const IP_DAILY_CAP = Number(Deno.env.get('SOURCE_CHECK_IP_DAILY_CAP') ?? '120');
// Obrana od napuhanog tijela: 60 referenci je i inace gornja granica obrade (CORPUS_MAX_REFS),
// pa vece tijelo ne moze donijeti nista osim troska parsiranja.
const MAX_BODY_BYTES = 256 * 1024;

Deno.serve(async (req: Request) => {
  const cors = corsHeadersFor(req.headers.get('Origin'), ALLOWED_ORIGINS);
  const json = (body: unknown, status = 200): Response =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } });
  try {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
    if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

    const clen = Number(req.headers.get('content-length') ?? '0');
    if (clen && clen > MAX_BODY_BYTES) return json({ error: 'payload_too_large' }, 413);

    // 1. auth: isti obrazac kao repair-docx. Bez identiteta nema rate-limita, pa nema ni endpointa.
    const authHeader = req.headers.get('Authorization') ?? '';
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
    const { data: userData } = await admin.auth.getUser(authHeader.replace(/^Bearer\s+/i, ''));
    const user = userData?.user;
    if (!user) return json({ error: 'unauthorized' }, 401);

    // 2. tijelo: { references: [{ title, year }] }. Sve ostalo se ignorira (runCorpusCheck ionako
    //    cita samo ta dva polja), pa buduci klijent ne moze slucajno protrljati vise podataka.
    let body: any = null;
    try { body = await req.json(); } catch { return json({ error: 'bad_request' }, 400); }
    const references = Array.isArray(body?.references) ? body.references : null;
    if (!references || !references.length) return json({ error: 'bad_request' }, 400);

    // 3. rate-limit: ATOMSKI (claim_ip_rate_slot, 0022) pa paralelni pozivi ne mogu proci kroz
    //    stale COUNT. Drugi argument je IDENTITET za dani scope: uuid korisnika za per-user scope,
    //    soljeni hash IP-ja za per-IP scope. Ugovor RPC-a: true = dopusteno, sve ostalo = odbijeno.
    //    Korisnicki cap ide PRVI, da dijeljeni IP ne bude okrivljen za tudju potrosnju.
    const { data: userOk } = await admin.rpc('claim_ip_rate_slot', {
      p_scope: 'source_check_user', p_ip_hash: user.id, p_daily_cap: USER_DAILY_CAP,
    });
    if (userOk !== true) return json({ error: 'rate_limited', reason: 'user' }, 429);

    const ipHash = await hashClientIpSalted(req.headers.get('x-forwarded-for'), IP_HASH_SALT, SERVICE_ROLE);
    const { data: ipOk } = await admin.rpc('claim_ip_rate_slot', {
      p_scope: 'source_check_ip', p_ip_hash: ipHash, p_daily_cap: IP_DAILY_CAP,
    });
    if (ipOk !== true) return json({ error: 'rate_limited', reason: 'ip' }, 429);

    // 4. provjera. Fail-open po ugovoru: greska ili istekao budzet daju null, sto klijent cita kao
    //    "provjera nije dostupna", NIKAD kao "izvor ne postoji". Isti modul koji zove repair-docx.
    const t0 = performance.now();
    const result = await runCorpusCheck(admin, references, CORPUS_CONFIG);
    console.log(`[source-check] refs=${references.length} ms=${Math.round(performance.now() - t0)} found=${result?.found.length ?? -1}`);
    if (!result) return json({ error: 'unavailable' }, 503);
    return json(result, 200);
  } catch (e) {
    console.error('[source-check]', e);
    return json({ error: 'internal' }, 500);
  }
});

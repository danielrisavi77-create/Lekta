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
import { readTextBounded } from '../_shared/read-body.ts';

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

    // 1. auth: isti obrazac kao repair-docx. Bez identiteta nema rate-limita, pa nema ni endpointa.
    const authHeader = req.headers.get('Authorization') ?? '';
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
    const { data: userData } = await admin.auth.getUser(authHeader.replace(/^Bearer\s+/i, ''));
    const user = userData?.user;
    if (!user) return json({ error: 'unauthorized' }, 401);

    // 2. tijelo: { references: [{ title, year }] }. Sve ostalo se ignorira (runCorpusCheck ionako
    //    cita samo ta dva polja), pa buduci klijent ne moze slucajno protrljati vise podataka.
    //    Tijelo se cita s TVRDOM granicom (audit P1-04). Dosad se granica oslanjala na
    //    `content-length`, sto je tvrdnja klijenta: bez zaglavlja (chunked) granice nije ni bilo,
    //    pa je `req.json()` citao koliko god posiljatelj posalje. Vidi _shared/read-body.ts.
    const raw = await readTextBounded(req, MAX_BODY_BYTES);
    if (!raw.ok) return json({ error: 'payload_too_large' }, 413);
    let body: any = null;
    try { body = JSON.parse(raw.text); } catch { return json({ error: 'bad_request' }, 400); }
    const references = Array.isArray(body?.references) ? body.references : null;
    if (!references || !references.length) return json({ error: 'bad_request' }, 400);

    // 3. rate-limit: ATOMSKI I SVE-ILI-NISTA (claim_two_rate_slots, 0096).
    //
    //    Dvije kvote se trose zajedno: jedna po korisniku, jedna po IP-u. Do audita P1-05 su se
    //    uzimale dvama odvojenim pozivima, korisnicka prva, BEZ vracanja prve ako druga padne.
    //    Korisnik iza zasicenog dijeljenog izlaza (dom, knjiznica, fakultetski NAT) tako je gubio
    //    vlastitu dnevnu kvotu na provjeru koja nikad nije izvrsena. Kvota mora mjeriti obavljen
    //    posao, pa se sada ili uzmu oba slota ili nijedan.
    //
    //    Drugi argument svakog para je IDENTITET za taj scope: uuid korisnika za per-user,
    //    soljeni hash IP-ja za per-IP. Ugovor RPC-a: 'ok' | 'denied_a' (korisnik) | 'denied_b' (IP).
    const ipHash = await hashClientIpSalted(req.headers.get('x-forwarded-for'), IP_HASH_SALT, SERVICE_ROLE);
    const { data: slots } = await admin.rpc('claim_two_rate_slots', {
      p_scope_a: 'source_check_user', p_hash_a: user.id, p_cap_a: USER_DAILY_CAP,
      p_scope_b: 'source_check_ip', p_hash_b: ipHash, p_cap_b: IP_DAILY_CAP,
    });
    if (slots !== 'ok') {
      // Nepoznat odgovor (RPC nedostupan, migracija nije primijenjena) tretiramo kao odbijanje:
      // rate-limit koji tiho otpadne nije rate-limit.
      const reason = slots === 'denied_b' ? 'ip' : 'user';
      return json({ error: 'rate_limited', reason }, 429);
    }

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

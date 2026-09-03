// Lekta Edge Function: profile-rules (Deno, Supabase).
//
// Rules-on-demand isporuka (faza B plana zastite baze pravila): vraca pravila i
// prezentacijska polja JEDNOG profila + njegove repair-map unose, umjesto da browser
// dohvaca bulk chunkove sa svih 407 profila. Analiza dokumenta ostaje 100% lokalna:
// ovaj zahtjev nosi ISKLJUCIVO identifikator profila koji je korisnik odabrao, nikad
// dokument, tekst ni rezultate analize.
//
// IZVOR PODATAKA: peceni artefakt data/generated/profile-rules-server.json (generator
// scripts/gen-profile-rules-server.mts, drift cuva tests/profile-rules-server.test.ts).
// Statican import -> podaci i kod se deployaju ATOMSKI (isti obrazac kao param-authority
// u repair-docx). PRAG ZA REVIZIJU: na ~10x rastu artefakta (~15 MB) prijeci na Postgres
// tablicu (presedan academic_ruleset_snapshots + deny-all RLS + security-definer RPC).
//
// DEPLOY: `npx supabase functions deploy profile-rules --no-verify-jwt` (obrazac
// faculty-request); funkcija sama opcionalno razrijesi Bearer za user-scope rate limit.
// Besplatna analiza NE ovisi o GoTrue: bez tokena vrijedi samo IP cap. Env prekidac
// PROFILE_RULES_REQUIRE_AUTH=true kasnije poostrava bez promjene koda.
//
// ANTI-ENUMERATION: atomski dvostruki dnevni cap (claim_ip_rate_slot, migracija 0022;
// user prvi da dijeljeni IP ne bude okrivljen za tudju potrosnju). I 304 i 404 TROSE
// slot: revalidacija je jeftina po bajtovima ali enumeracija preko nje ne smije biti
// besplatna. Posteno u planu: skrejper s rotirajucim IP-ovima kroz dane i dalje moze
// izvuci profile; obrana dize CIJENU bulk ekstrakcije, vrijednosti pravila su ionako
// namjerno javne na SEO stranicama.
//
// DOKAZI: odredba "evidence (drafts/ledger) NIKAD nije u artefaktu" vrijedila je do 2026-09-03,
// kad ju je vlasnik izricito promijenio, nakon iznesenih brojki i protuargumenata. Artefakt sada
// nosi i doslovne navode iz sluzbenih uputa, po profilu (76 od 407 profila, 687 unosa, prosjecno
// 1,6 kB po profilu). NE nosi ledger, potpise verifikatora ni kanarince: projekcija u
// `src/profiles/evidence-projection.ts` gradi NOV objekt sa sest poznatih polja, pa novo polje u
// draftu ne moze procuriti samo od sebe. Cap iznad time postaje vazniji, jer je nagrada za
// bulk ekstrakciju veca nego prije.
//
// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.2';

import { corsHeadersFor } from '../_shared/cors.ts';
import { hashClientIpSalted } from '../_shared/hash-ip.ts';
import type { ProfileRulesServerArtifact, ProfileRulesResponseV1 } from '../../../src/profiles/profile-rules-contract.ts';
import artifactRaw from '../../../data/generated/profile-rules-server.json' with { type: 'json' };

const ARTIFACT = artifactRaw as unknown as ProfileRulesServerArtifact;

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const IP_HASH_SALT = Deno.env.get('IP_HASH_SALT') ?? '';
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGIN') ?? 'https://lektahr.netlify.app')
  .split(',').map((s) => s.trim()).filter(Boolean);

// Kill switch bez deploya (obrazac REPAIR_DISABLED).
const DISABLED = Deno.env.get('PROFILE_RULES_DISABLED') === 'true';
// Poostravanje bez promjene koda: zahtijevaj valjan JWT (klijent zna signInAnonymously).
const REQUIRE_AUTH = Deno.env.get('PROFILE_RULES_REQUIRE_AUTH') === 'true';

// Dnevni capovi: student legitimno promijeni profil nekoliko puta (memo + HTTP cache u
// klijentu gase ponavljanja); 407 profila s jednog IP-a u danu NE prolazi; kampus NAT
// dobiva prostor. Isti red velicine kao source-check (40/120).
const USER_DAILY_CAP = Number(Deno.env.get('PROFILE_RULES_USER_DAILY_CAP') ?? '40');
const IP_DAILY_CAP = Number(Deno.env.get('PROFILE_RULES_IP_DAILY_CAP') ?? '150');

// profileId format iz registra (kebab, npr. fpzg-politologija-diplomski).
const PROFILE_ID_RE = /^[a-z0-9][a-z0-9-]{0,79}$/;

Deno.serve(async (req: Request) => {
  const cors = corsHeadersFor(req.headers.get('Origin'), ALLOWED_ORIGINS, 'GET, OPTIONS');
  const json = (body: unknown, status = 200, extra: Record<string, string> = {}): Response =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, 'content-type': 'application/json', ...extra },
    });
  const t0 = performance.now();
  try {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
    if (req.method !== 'GET') return json({ error: 'method_not_allowed' }, 405);
    if (DISABLED) return json({ error: 'disabled' }, 503);

    const url = new URL(req.url);
    if (url.searchParams.get('v') !== '1') return json({ error: 'bad_version' }, 400);
    const profileId = url.searchParams.get('profileId') ?? '';
    if (!PROFILE_ID_RE.test(profileId)) return json({ error: 'bad_request' }, 400);

    // Auth je OPCIONALAN: bez tokena vrijedi samo IP cap (osim uz REQUIRE_AUTH).
    const authHeader = req.headers.get('Authorization') ?? '';
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
    let user: { id: string } | null = null;
    if (authHeader) {
      const { data: userData } = await admin.auth.getUser(authHeader.replace(/^Bearer\s+/i, ''));
      user = userData?.user ?? null;
    }
    if (REQUIRE_AUTH && !user) return json({ error: 'unauthorized' }, 401);

    // Atomski rate limit PRIJE lookupa: i 404 (enumeracija imena) i 304 trose slot.
    if (user) {
      const { data: userOk } = await admin.rpc('claim_ip_rate_slot', {
        p_scope: 'profile_rules_user', p_ip_hash: user.id, p_daily_cap: USER_DAILY_CAP,
      });
      if (userOk !== true) return json({ error: 'rate_limited', reason: 'user' }, 429);
    }
    const ipHash = await hashClientIpSalted(req.headers.get('x-forwarded-for'), IP_HASH_SALT, SERVICE_ROLE);
    const { data: ipOk } = await admin.rpc('claim_ip_rate_slot', {
      p_scope: 'profile_rules_ip', p_ip_hash: ipHash, p_daily_cap: IP_DAILY_CAP,
    });
    if (ipOk !== true) return json({ error: 'rate_limited', reason: 'ip' }, 429);

    const entry = ARTIFACT.profiles[profileId];
    const log = (status: number) =>
      console.log(`[profile-rules] id=${profileId} status=${status} user=${Boolean(user)} ms=${Math.round(performance.now() - t0)}`);
    if (!entry) { log(404); return json({ error: 'not_found' }, 404); }

    // Jak ETag predizracunat pri pecenju; browser cache je privatan i vezan uz deploy podataka.
    const etag = `"${entry.etag}"`;
    const cacheHeaders = { ETag: etag, 'Cache-Control': 'private, max-age=3600' };
    const inm = req.headers.get('If-None-Match') ?? '';
    if (inm.includes(etag)) {
      log(304);
      return new Response(null, { status: 304, headers: { ...cors, ...cacheHeaders } });
    }

    const body: ProfileRulesResponseV1 = {
      v: 1,
      profileId,
      verifiedAt: typeof entry.profile.verifiedAt === 'string' ? entry.profile.verifiedAt : null,
      datasetVersion: ARTIFACT.datasetVersion,
      profile: entry.profile,
      repairEntries: entry.repairEntries,
    };
    log(200);
    return json(body, 200, cacheHeaders);
  } catch (e) {
    console.error('[profile-rules]', e);
    return json({ error: 'internal' }, 500);
  }
});

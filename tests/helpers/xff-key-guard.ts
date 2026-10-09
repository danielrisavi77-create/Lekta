/**
 * T84 XFF: IP kljuc za limite i anti-fraud dolazi iz zaglavlja cf-connecting-ip, koje postavlja
 * Cloudflare ispred Supabase gatewaya i koje klijent ne moze podmetnuti (mjereno na stagingu 2026-10-09:
 * gateway prepisuje klijentski x-forwarded-for, zadnji unos mu je promjenjivi unutarnji cvor). Gard trazi
 * (1) da _shared/hash-ip.ts cita samo cf-connecting-ip, i izvorom i ponasanjem, (2) da nijedan .ts modul
 * Edge funkcija ne navodi naziv IP headera (x-forwarded-for, x-real-ip, cf-connecting-ip, true-client-ip)
 * mimo hash-ip.ts, (3) da svaki poziv hashClientIpSalted dobije req.headers, (4) da svaki od 10 IP
 * pozivatelja bude omotan u requireTrustedClientIp (403 prije rukovatelja, dakle prije citanja tijela,
 * auth poziva, upisa, rezervacije ili nagrade) i da omotac to stvarno cini, i (5) da hash nosi oznaku sheme v2: a nagrada preporucitelju ne
 * usporeduje hasheve iz razlicitih shema. Baseline je u
 * tests/xff-key.test.ts, mutacije u tests/gate-mutations.test.ts.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { transformSync } from 'esbuild';

export interface SourceFile { path: string; text: string }
export interface HeaderReader { get(name: string): string | null }

/** Svaki doslovni naziv IP headera, bez obzira na velika slova i vrstu navodnika (Codex XFF-3 na #295). */
const HEADER_LITERAL = /(['"`])(?:x-forwarded-for|x-real-ip|cf-connecting-ip|true-client-ip|forwarded)\1/gi;
/** Zabranjeni tragovi citanja IP-a u funkcijama, i kad je naziv sastavljen (Codex XFF-1 na #346). */
const IP_SOURCE_TRACE = /forwarded|x-real-ip|real-ip|cf-connecting|connecting-ip|true-client|remoteaddr|conninfo/i;
/** Jedina dopustena veza `ipHash` s pomocnikom. */
const CANONICAL_BINDING = /\bconst ipHash = await hashClientIpSalted\(req\.headers, IP_HASH_SALT, SERVICE_ROLE(?:_KEY)?\);/g;
/** Funkcije koje limitiraju ili usporeduju po IP-u. Ispad ili zamjena pozivatelja mora pasti na gardu. */
export const IP_CALLERS = [
  'analytics-event', 'client-error', 'faculty-request', 'generate-report', 'integrity-check',
  'preflight-start', 'profile-rules', 'redeem-referral-signup', 'repair-docx', 'source-check',
].map((n) => `supabase/functions/${n}/index.ts`);
/** Ulazni omotac: nepouzdan IP vraca 403 client_ip_untrusted prije rukovatelja. */
const ENTRY_WRAP = /Deno\.serve\(requireTrustedClientIp\(async \(req: Request\) => \{/g;
/** Poziv pomocnika, s prvim argumentom do zareza. */
const HELPER_CALL = /hashClientIpSalted\(\s*([^,]*?)\s*,/g;

/** Izvor bez komentara, da opis u komentaru ne bude citanje headera. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

export function xffKeyProblems(hashIpSrc: string, functions: SourceFile[]): string[] {
  const out: string[] = [];
  const code = stripComments(hashIpSrc);
  if (!/headers\.get\('cf-connecting-ip'\)/.test(code)) out.push('hash-ip: kljuc nije cf-connecting-ip');
  if (!/IP_HASH_SCHEME_PREFIX = 'v2:'/.test(code) || !/return IP_HASH_SCHEME_PREFIX \+ \(await sha256Hex\(salt \+ ip\)\);/.test(code)) {
    out.push('hash-ip: hash ne nosi oznaku sheme v2:');
  }
  const others = (code.match(HEADER_LITERAL) ?? []).filter((l) => !/cf-connecting-ip/i.test(l));
  if (others.length > 0) out.push('hash-ip: cita se i drugi IP header (' + others.join(' ') + ')');
  for (const f of functions) {
    const literals = (stripComments(f.text).match(HEADER_LITERAL) ?? []).length;
    if (literals > 0) out.push(`${f.path}: IP header se cita mimo hash-ip.ts (${literals}x)`);
    const code = stripComments(f.text);
    if (IP_SOURCE_TRACE.test(code)) out.push(`${f.path}: IP se cita mimo hash-ip.ts (trag headera ili adrese veze)`);
    if (/\bipHash\b/.test(code)) {
      const bindings = (code.match(CANONICAL_BINDING) ?? []).length;
      const assigns = (code.match(/\bipHash\s*=(?!=)/g) ?? []).length;
      if (bindings !== 1 || assigns !== 1) out.push(`${f.path}: ipHash ne dolazi iskljucivo iz hashClientIpSalted(req.headers, ...) (${bindings} kanonskih, ${assigns} dodjela)`);
    }
    const badCalls = [...stripComments(f.text).matchAll(HELPER_CALL)].filter((m) => m[1] !== 'req.headers').length;
    if (badCalls > 0) out.push(`${f.path}: hashClientIpSalted ne dobiva req.headers (${badCalls}x)`);
  }
  return out;
}

/** Svaki poznati IP pozivatelj postoji i jedini mu je ipHash kanonska veza s pomocnikom (Codex XFF-1 na #346). */
export function xffCallerProblems(functions: SourceFile[]): string[] {
  const out: string[] = [];
  for (const path of IP_CALLERS) {
    const f = functions.find((x) => x.path === path);
    if (!f) { out.push(`${path}: IP pozivatelj nedostaje`); continue; }
    const code = stripComments(f.text);
    if ((code.match(CANONICAL_BINDING) ?? []).length !== 1) out.push(`${path}: nema kanonske veze ipHash s hashClientIpSalted`);
    if ((code.match(ENTRY_WRAP) ?? []).length !== 1) out.push(`${path}: Deno.serve nije omotan u requireTrustedClientIp (403 client_ip_untrusted)`);
  }
  return out;
}

/** Nagrada preporucitelju ne smije usporedivati hasheve iz razlicitih shema (Codex P1 na #346). */
export function referrerSchemeProblems(grantSrc: string): string[] {
  const out: string[] = [];
  const code = stripComments(grantSrc);
  if (!/\bipHashScheme\(/.test(code)) out.push('grant-referrer-reward: ne razlikuje sheme ip hasha');
  if (!/return \{ granted: false, reason: 'ip_scheme_unverifiable' \};/.test(code)) out.push('grant-referrer-reward: mijesane sheme ne zadrzavaju nagradu');
  if (!/'ip_scheme_unverifiable', 'monthly_cap_reached'\]\)/.test(code)) out.push('grant-referrer-reward: ip_scheme_unverifiable nije trajna odluka');
  return out;
}

/** Svi .ts moduli Edge funkcija i _shared (osim kanonskog hash-ip.ts i *.test.ts, koji namjerno navode headere) sa stvarnog diska (Codex XFF-2). */
export function xffRealSources(root: string = process.cwd()): { hashIp: string; functions: SourceFile[] } {
  const read = (rel: string) => readFileSync(join(root, rel), 'utf8').replace(/\r\n?/g, '\n');
  const walk = (rel: string): string[] => readdirSync(join(root, rel), { withFileTypes: true }).flatMap((e) => {
    const child = `${rel}/${e.name}`;
    if (e.isDirectory()) return e.name === 'node_modules' ? [] : walk(child);
    return e.name.endsWith('.ts') && !e.name.endsWith('.test.ts') ? [child] : [];
  });
  const functions = walk('supabase/functions')
    .filter((p) => p !== 'supabase/functions/_shared/hash-ip.ts' && existsSync(join(root, p)))
    .sort()
    .map((path) => ({ path, text: read(path) }));
  return { hashIp: read('supabase/functions/_shared/hash-ip.ts'), functions };
}

/**
 * Izvrsi izvor hash-ip.ts (TS -> JS kroz esbuild) i vrati clientIpFromHeaders, da mutacija izvora
 * pada na PONASANJU, ne samo na tekstu (Codex XFF-4 na #295).
 */
export function loadClientIpFromHeaders(hashIpSrc: string): (headers: HeaderReader) => string {
  const js = transformSync(hashIpSrc, { loader: 'ts', format: 'esm' }).code.replace(/^export /gm, '');
  return new Function(`${js}\nreturn clientIpFromHeaders;`)() as (headers: HeaderReader) => string;
}

/** Izvrsi izvor hash-ip.ts i vrati omotac requireTrustedClientIp (za bihevioralni gard ulaza). */
export function loadRequireTrustedClientIp(hashIpSrc: string): (handler: (req: Request) => Response | Promise<Response>) => (req: Request) => Response | Promise<Response> {
  const js = transformSync(hashIpSrc, { loader: 'ts', format: 'esm' }).code.replace(/^export /gm, '');
  return new Function(`${js}\nreturn requireTrustedClientIp;`)() as ReturnType<typeof loadRequireTrustedClientIp>;
}

/** Omotac mora odbiti nepouzdan IP s 403 BEZ poziva rukovatelja, a pouzdan i OPTIONS propustiti. */
export function entryWrapperProblems(wrap: ReturnType<typeof loadRequireTrustedClientIp>): string[] {
  const out: string[] = [];
  let pozivi = 0;
  const handler = wrap(() => { pozivi += 1; return new Response('ok'); });
  const zahtjev = (method: string, headers: Record<string, string>) => new Request('http://lazni/fn', { method, headers });
  for (const [ime, headers] of [
    ['bez zaglavlja', {}],
    ['izmisljen x-forwarded-for', { 'x-forwarded-for': '203.0.113.9' }],
    ['nevaljan cf-connecting-ip', { 'cf-connecting-ip': 'napadac' }],
  ] as const) {
    const odgovor = handler(zahtjev('POST', headers)) as Response;
    if (odgovor.status !== 403) out.push(`${ime}: status ${odgovor.status}, ocekivan 403`);
    if (odgovor.headers.get('content-type') !== 'application/json') out.push(`${ime}: odgovor nije JSON`);
  }
  if (pozivi !== 0) out.push('rukovatelj je pozvan za nepouzdan IP');
  const dobar = handler(zahtjev('POST', { 'cf-connecting-ip': '203.0.113.9' }));
  if ((dobar as Response).status !== 200 || pozivi !== 1) out.push('pouzdan IP ne dolazi do rukovatelja');
  const preflight = handler(zahtjev('OPTIONS', {}));
  if ((preflight as Response).status !== 200 || pozivi !== 2) out.push('OPTIONS preflight ne prolazi do rukovatelja');
  return out;
}

function fake(values: Record<string, string>): HeaderReader {
  return { get: (name) => values[name.toLowerCase()] ?? null };
}

/** Behavorial contract: only verified Cloudflare client IPs; missing/malformed must fail closed. */
export function xffBehaviourProblems(clientIpFromHeaders: (headers: HeaderReader) => string): string[] {
  const out: string[] = [];
  const cf = '203.0.113.50';
  const spoofed = { 'x-forwarded-for': '198.51.100.1, 10.9.9.9', 'x-real-ip': '198.51.100.2', 'true-client-ip': '198.51.100.3' };
  const rejects = (input: HeaderReader): boolean => {
    try { clientIpFromHeaders(input); return false; }
    catch (error) { return error instanceof Error && error.message === 'UNTRUSTED_CLIENT_IP'; }
  };
  if (clientIpFromHeaders(fake({ ...spoofed, 'cf-connecting-ip': cf })) !== cf) out.push('uz izmisljene headere kljuc nije cf-connecting-ip');
  if (clientIpFromHeaders(fake({ 'cf-connecting-ip': ' ' + cf + ' ' })) !== cf) out.push('razmaci oko cf-connecting-ip se ne skidaju');
  if (!rejects(fake(spoofed))) out.push('bez cf-connecting-ip nije fail-closed');
  if (!rejects(fake({ 'cf-connecting-ip': '   ' }))) out.push('prazan cf-connecting-ip nije fail-closed');
  if (!rejects(fake({ 'cf-connecting-ip': 'a'.repeat(65) }))) out.push('predugacak cf-connecting-ip nije fail-closed');
  if (!rejects(fake({ 'cf-connecting-ip': 'attacker-value' }))) out.push('proizvoljan string ne smije biti IP kljuc');
  if (!rejects(fake({ 'cf-connecting-ip': '999.999.9.9' }))) out.push('nevaljani IPv4 ne smije biti IP kljuc');
  return out;
}

/**
 * T84 XFF: IP kljuc za limite i anti-fraud dolazi iz zaglavlja cf-connecting-ip, koje postavlja
 * Cloudflare ispred Supabase gatewaya i koje klijent ne moze podmetnuti (mjereno na stagingu 2026-10-09:
 * gateway prepisuje klijentski x-forwarded-for, zadnji unos mu je promjenjivi unutarnji cvor). Gard trazi
 * (1) da _shared/hash-ip.ts cita samo cf-connecting-ip, i izvorom i ponasanjem, (2) da nijedan .ts modul
 * Edge funkcija ne navodi naziv IP headera (x-forwarded-for, x-real-ip, cf-connecting-ip, true-client-ip)
 * mimo hash-ip.ts i (3) da svaki poziv hashClientIpSalted dobije req.headers. Baseline je u
 * tests/xff-key.test.ts, mutacije u tests/gate-mutations.test.ts.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { transformSync } from 'esbuild';

export interface SourceFile { path: string; text: string }
export interface HeaderReader { get(name: string): string | null }

/** Svaki doslovni naziv IP headera, bez obzira na velika slova i vrstu navodnika (Codex XFF-3 na #295). */
const HEADER_LITERAL = /(['"`])(?:x-forwarded-for|x-real-ip|cf-connecting-ip|true-client-ip|forwarded)\1/gi;
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
  const others = (code.match(HEADER_LITERAL) ?? []).filter((l) => !/cf-connecting-ip/i.test(l));
  if (others.length > 0) out.push('hash-ip: cita se i drugi IP header (' + others.join(' ') + ')');
  for (const f of functions) {
    const literals = (stripComments(f.text).match(HEADER_LITERAL) ?? []).length;
    if (literals > 0) out.push(`${f.path}: IP header se cita mimo hash-ip.ts (${literals}x)`);
    const badCalls = [...stripComments(f.text).matchAll(HELPER_CALL)].filter((m) => m[1] !== 'req.headers').length;
    if (badCalls > 0) out.push(`${f.path}: hashClientIpSalted ne dobiva req.headers (${badCalls}x)`);
  }
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

function fake(values: Record<string, string>): HeaderReader {
  return { get: (name) => values[name.toLowerCase()] ?? null };
}

/** Bihevioralni ugovor kljuca: odlucuje samo cf-connecting-ip, ostali IP headeri se ne citaju. */
export function xffBehaviourProblems(clientIpFromHeaders: (headers: HeaderReader) => string): string[] {
  const out: string[] = [];
  const cf = '203.0.113.50';
  const spoofed = { 'x-forwarded-for': '198.51.100.1, 10.9.9.9', 'x-real-ip': '198.51.100.2', 'true-client-ip': '198.51.100.3' };
  if (clientIpFromHeaders(fake({ ...spoofed, 'cf-connecting-ip': cf })) !== cf) out.push('uz izmisljene headere kljuc nije cf-connecting-ip');
  if (clientIpFromHeaders(fake({ 'cf-connecting-ip': ` ${cf} ` })) !== cf) out.push('razmaci oko cf-connecting-ip se ne skidaju');
  if (clientIpFromHeaders(fake(spoofed)) !== 'unknown') out.push('bez cf-connecting-ip kljuc nije unknown (cita se drugi header)');
  if (clientIpFromHeaders(fake({ 'cf-connecting-ip': '   ' })) !== 'unknown') out.push('prazan cf-connecting-ip nije unknown');
  if (clientIpFromHeaders(fake({ 'cf-connecting-ip': 'a'.repeat(65) })) !== 'unknown') out.push('predugacak cf-connecting-ip nije unknown');
  return out;
}

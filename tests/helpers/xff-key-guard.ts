/**
 * T84 XFF: IP kljuc za limite i anti-fraud uzima ZADNJI unos x-forwarded-for (hop gatewaya), jer
 * Supabase gateway cuva klijentski header i svoju adresu dodaje iza njega (mjereno na stagingu
 * 2026-10-04). Gard trazi (1) zadnji unos u _shared/hash-ip.ts, i izvorom i ponasanjem, i (2) da nijedan
 * .ts modul Edge funkcija ne navodi naziv headera mimo hashClientIpSalted. Baseline je u tests/xff-key.test.ts, mutacije u
 * tests/gate-mutations.test.ts.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { transformSync } from 'esbuild';

export interface SourceFile { path: string; text: string }

/** Svaki doslovni naziv headera, bez obzira na velika slova i vrstu navodnika (Codex XFF-3 na #295). */
const HEADER_LITERAL = /(['"`])x-forwarded-for\1/gi;
/** Jedini dopusteni oblik: kanonski naziv izravno u hashClientIpSalted. */
const ALLOWED_READ = /hashClientIpSalted\(\s*req\.headers\.get\(\s*'x-forwarded-for'\s*\)/g;

export function xffKeyProblems(hashIpSrc: string, functions: SourceFile[]): string[] {
  const out: string[] = [];
  if (!/return hops\.at\(-1\) \?\? 'unknown';/.test(hashIpSrc)) out.push('hash-ip: kljuc nije zadnji unos x-forwarded-for');
  for (const f of functions) {
    const literals = (f.text.match(HEADER_LITERAL) ?? []).length;
    const viaHelper = (f.text.match(ALLOWED_READ) ?? []).length;
    if (literals !== viaHelper) out.push(`${f.path}: x-forwarded-for se cita mimo hashClientIpSalted (${literals - viaHelper}x)`);
  }
  return out;
}

/** Svi .ts moduli Edge funkcija i _shared (osim kanonskog hash-ip.ts) sa stvarnog diska (Codex XFF-2). */
export function xffRealSources(root: string = process.cwd()): { hashIp: string; functions: SourceFile[] } {
  const read = (rel: string) => readFileSync(join(root, rel), 'utf8').replace(/\r\n?/g, '\n');
  const walk = (rel: string): string[] => readdirSync(join(root, rel), { withFileTypes: true }).flatMap((e) => {
    const child = `${rel}/${e.name}`;
    if (e.isDirectory()) return e.name === 'node_modules' ? [] : walk(child);
    return e.name.endsWith('.ts') ? [child] : [];
  });
  const functions = walk('supabase/functions')
    .filter((p) => p !== 'supabase/functions/_shared/hash-ip.ts' && existsSync(join(root, p)))
    .sort()
    .map((path) => ({ path, text: read(path) }));
  return { hashIp: read('supabase/functions/_shared/hash-ip.ts'), functions };
}

/**
 * Izvrsi izvor hash-ip.ts (TS -> JS kroz esbuild) i vrati clientIpFromForwarded, da mutacija izvora
 * pada na PONASANJU, ne samo na tekstu (Codex XFF-4 na #295).
 */
export function loadClientIpFromForwarded(hashIpSrc: string): (fwd: string | null) => string {
  const js = transformSync(hashIpSrc, { loader: 'ts', format: 'esm' }).code.replace(/^export /gm, '');
  return new Function(`${js}\nreturn clientIpFromForwarded;`)() as (fwd: string | null) => string;
}

/** Bihevioralni ugovor kljuca: izmisljeni prefiksi ne mijenjaju kljuc, odlucuje zadnji hop. */
export function xffBehaviourProblems(clientIpFromForwarded: (fwd: string | null) => string): string[] {
  const out: string[] = [];
  const gateway = '203.0.113.50';
  for (const spoof of ['198.51.100.1', '198.51.100.2, 10.9.9.9']) {
    const got = clientIpFromForwarded(`${spoof}, ${gateway}`);
    if (got !== gateway) out.push(`kljuc za "${spoof}, ${gateway}" je ${got}, ocekivan hop gatewaya`);
  }
  if (clientIpFromForwarded('1.1.1.1, 2.2.2.2 , 3.3.3.3') !== '3.3.3.3') out.push('vise unosa: ne odlucuje zadnji');
  if (clientIpFromForwarded(null) !== 'unknown') out.push('bez headera kljuc nije unknown');
  return out;
}

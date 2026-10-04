/**
 * T84 XFF: IP kljuc za limite i anti-fraud uzima ZADNJI unos x-forwarded-for (hop gatewaya), jer
 * Supabase gateway cuva klijentski header i svoju adresu dodaje iza njega (mjereno na stagingu
 * 2026-10-04). Gard trazi (1) zadnji unos u _shared/hash-ip.ts i (2) da nijedna Edge funkcija ne cita
 * x-forwarded-for mimo hashClientIpSalted. Baseline je u tests/xff-key.test.ts, mutacije u
 * tests/gate-mutations.test.ts.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface SourceFile { path: string; text: string }

export function xffKeyProblems(hashIpSrc: string, functions: SourceFile[]): string[] {
  const out: string[] = [];
  if (!/return hops\.at\(-1\) \?\? 'unknown';/.test(hashIpSrc)) out.push('hash-ip: kljuc nije zadnji unos x-forwarded-for');
  for (const f of functions) {
    const reads = (f.text.match(/headers\.get\(\s*'x-forwarded-for'\s*\)/g) ?? []).length;
    const viaHelper = (f.text.match(/hashClientIpSalted\(\s*req\.headers\.get\(\s*'x-forwarded-for'\s*\)/g) ?? []).length;
    if (reads !== viaHelper) out.push(`${f.path}: x-forwarded-for se cita mimo hashClientIpSalted (${reads - viaHelper}x)`);
  }
  return out;
}

/** Svi index.ts Edge funkcija i _shared/hash-ip.ts sa stvarnog diska. */
export function xffRealSources(root: string = process.cwd()): { hashIp: string; functions: SourceFile[] } {
  const read = (rel: string) => readFileSync(join(root, rel), 'utf8').replace(/\r\n?/g, '\n');
  const dir = join(root, 'supabase', 'functions');
  const functions = readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name !== '_shared' && existsSync(join(dir, e.name, 'index.ts')))
    .map((e) => `supabase/functions/${e.name}/index.ts`)
    .sort()
    .map((path) => ({ path, text: read(path) }));
  return { hashIp: read('supabase/functions/_shared/hash-ip.ts'), functions };
}

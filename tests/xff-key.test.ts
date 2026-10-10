// @vitest-environment node
/**
 * T84 XFF: baseline garda izvora (kljuc je cf-connecting-ip, svi pozivatelji kroz hashClientIpSalted s
 * req.headers) i bihevioralni ugovor izvrsenog izvora hash-ip.ts. Ponasanje pomocnika je i u
 * supabase/functions/_shared/hash-ip.test.ts.
 */
import { describe, expect, it } from 'vitest';
import { entryWrapperProblems, IP_CALLERS, loadClientIpFromHeaders, loadRequireTrustedClientIp, referrerSchemeProblems, xffBehaviourProblems, xffCallerProblems, xffKeyProblems, xffRealSources } from './helpers/xff-key-guard';

const ok = 'const ipHash = await hashClientIpSalted(req.headers, IP_HASH_SALT, SERVICE_ROLE);';

describe('T84 XFF: IP kljuc iz cf-connecting-ip', () => {
  it('stvarni izvor: hash-ip cita cf-connecting-ip, nijedan .ts modul ne navodi IP header mimo njega', () => {
    const { hashIp, functions } = xffRealSources();
    expect(functions.some((f) => f.path === 'supabase/functions/faculty-request/index.ts')).toBe(true);
    expect(functions.some((f) => f.path.startsWith('supabase/functions/_shared/') && f.path !== 'supabase/functions/_shared/hash-ip.ts')).toBe(true);
    expect(functions.some((f) => f.path.endsWith('/global-slot.ts') || f.path.endsWith('/corpus-check.ts'))).toBe(true);
    expect(IP_CALLERS).toHaveLength(10);
    expect(xffCallerProblems(functions)).toEqual([]);
    expect(xffKeyProblems(hashIp, functions)).toEqual([]);
    const grant = functions.find((f) => f.path === 'supabase/functions/_shared/grant-referrer-reward.ts');
    expect(referrerSchemeProblems(grant?.text ?? '')).toEqual([]);
  });

  it('izvrseni hash-ip.ts: odlucuje samo cf-connecting-ip, izmisljeni headeri ne mijenjaju kljuc', () => {
    expect(xffBehaviourProblems(loadClientIpFromHeaders(xffRealSources().hashIp))).toEqual([]);
  });

  it('negativna kontrola: ispad ili zamjena IP pozivatelja pada na gardu pozivatelja', () => {
    const { functions } = xffRealSources();
    expect(xffCallerProblems(functions.filter((f) => f.path !== 'supabase/functions/source-check/index.ts'))).toEqual(['supabase/functions/source-check/index.ts: IP pozivatelj nedostaje']);
    const swapped = functions.map((f) => (f.path.endsWith('source-check/index.ts') ? { ...f, text: f.text.replace(/const ipHash = await hashClientIpSalted\([^;]*;/, 'const ipHash = String(body.ipHash);') } : f));
    expect(xffCallerProblems(swapped)).toEqual(['supabase/functions/source-check/index.ts: nema kanonske veze ipHash s hashClientIpSalted']);
    expect(xffKeyProblems(xffRealSources().hashIp, swapped)).not.toEqual([]);
  });

  it('ulazni omotac: izvrseni hash-ip.ts odbija nepouzdan IP s 403 bez poziva rukovatelja, OPTIONS i pouzdan IP prolaze', () => {
    expect(entryWrapperProblems(loadRequireTrustedClientIp(xffRealSources().hashIp))).toEqual([]);
  });

  it('ulazna provjera: svih 10 pozivatelja ima Deno.serve u omotacu (negativna kontrola po funkciji)', () => {
    const { functions } = xffRealSources();
    for (const path of IP_CALLERS) {
      const f = functions.find((x) => x.path === path)!;
      expect(f.text, path).toContain('Deno.serve(requireTrustedClientIp(async (req: Request) => {');
      const gola = functions.map((x) => (x === f ? { ...x, text: x.text.replace('Deno.serve(requireTrustedClientIp(async (req: Request) => {', 'Deno.serve(async (req: Request) => {') } : x));
      expect(xffCallerProblems(gola), path).toEqual([`${path}: Deno.serve nije omotan u requireTrustedClientIp (403 client_ip_untrusted)`]);
    }
  });

  it('nagrada preporucitelju: gard sheme je cist i hvata uklanjanje', () => {
    const { functions } = xffRealSources();
    const grant = functions.find((f) => f.path === 'supabase/functions/_shared/grant-referrer-reward.ts')!;
    expect(referrerSchemeProblems(grant.text.replaceAll('ipHashScheme(', 'ime('))).not.toEqual([]);
  });

  it('negativne kontrole: velika slova, dvostruki navodnici, template, varijabla, drugi IP headeri i krivi argument', () => {
    const { hashIp } = xffRealSources();
    const bad = [
      "const ip = req.headers.get('X-Forwarded-For');",
      'const ip = req.headers.get("x-forwarded-for");',
      'const ip = req.headers.get(`x-forwarded-for`);',
      "const H = 'x-forwarded-for';\nconst ip = req.headers.get(H);",
      "const ip = req.headers.get('x-real-ip');",
      "const ip = req.headers.get('cf-connecting-ip');",
      "const ipHash = await hashClientIpSalted(req.headers.get('x-forwarded-for'), SALT, KEY);",
      'const ipHash = await hashClientIpSalted(headersCopy, SALT, KEY);',
      "const H = 'x-forwarded-' + 'for';\nconst ip = req.headers.get(H);",
      'const ipHash = String(body.ipHash);',
      'const ipHash = await hashClientIpSalted(req.headers, IP_HASH_SALT, KEY);\nipHash = other;',
    ];
    for (const text of bad) {
      expect(xffKeyProblems(hashIp, [{ path: 'supabase/functions/x/index.ts', text }]), text).not.toHaveLength(0);
    }
    expect(xffKeyProblems(hashIp, [{ path: 'supabase/functions/x/index.ts', text: ok }])).toEqual([]);
    expect(xffKeyProblems(hashIp, [{ path: 'supabase/functions/x/index.ts', text: `${ok}\n// komentar: x-forwarded-for se ne cita` }])).toEqual([]);
  });
});

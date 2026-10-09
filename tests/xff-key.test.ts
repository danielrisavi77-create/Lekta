// @vitest-environment node
/**
 * T84 XFF: baseline garda izvora (kljuc je cf-connecting-ip, svi pozivatelji kroz hashClientIpSalted s
 * req.headers) i bihevioralni ugovor izvrsenog izvora hash-ip.ts. Ponasanje pomocnika je i u
 * supabase/functions/_shared/hash-ip.test.ts.
 */
import { describe, expect, it } from 'vitest';
import { IP_CALLERS, loadClientIpFromHeaders, xffBehaviourProblems, xffCallerProblems, xffKeyProblems, xffRealSources } from './helpers/xff-key-guard';

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

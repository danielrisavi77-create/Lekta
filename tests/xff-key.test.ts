// @vitest-environment node
/**
 * T84 XFF: baseline garda izvora (kljuc je cf-connecting-ip, svi pozivatelji kroz hashClientIpSalted s
 * req.headers) i bihevioralni ugovor izvrsenog izvora hash-ip.ts. Ponasanje pomocnika je i u
 * supabase/functions/_shared/hash-ip.test.ts.
 */
import { describe, expect, it } from 'vitest';
import { loadClientIpFromHeaders, xffBehaviourProblems, xffKeyProblems, xffRealSources } from './helpers/xff-key-guard';

const ok = 'const ipHash = await hashClientIpSalted(req.headers, SALT, KEY);';

describe('T84 XFF: IP kljuc iz cf-connecting-ip', () => {
  it('stvarni izvor: hash-ip cita cf-connecting-ip, nijedan .ts modul ne navodi IP header mimo njega', () => {
    const { hashIp, functions } = xffRealSources();
    expect(functions.some((f) => f.path === 'supabase/functions/faculty-request/index.ts')).toBe(true);
    expect(functions.some((f) => f.path.startsWith('supabase/functions/_shared/') && f.path !== 'supabase/functions/_shared/hash-ip.ts')).toBe(true);
    expect(functions.some((f) => f.path.endsWith('/global-slot.ts') || f.path.endsWith('/corpus-check.ts'))).toBe(true);
    expect(functions.filter((f) => f.text.includes('hashClientIpSalted(req.headers,')).length).toBeGreaterThanOrEqual(9);
    expect(xffKeyProblems(hashIp, functions)).toEqual([]);
  });

  it('izvrseni hash-ip.ts: odlucuje samo cf-connecting-ip, izmisljeni headeri ne mijenjaju kljuc', () => {
    expect(xffBehaviourProblems(loadClientIpFromHeaders(xffRealSources().hashIp))).toEqual([]);
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
    ];
    for (const text of bad) {
      expect(xffKeyProblems(hashIp, [{ path: 'supabase/functions/x/index.ts', text }]), text).not.toHaveLength(0);
    }
    expect(xffKeyProblems(hashIp, [{ path: 'supabase/functions/x/index.ts', text: ok }])).toEqual([]);
    expect(xffKeyProblems(hashIp, [{ path: 'supabase/functions/x/index.ts', text: `${ok}\n// komentar: x-forwarded-for se ne cita` }])).toEqual([]);
  });
});

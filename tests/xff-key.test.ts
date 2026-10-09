// @vitest-environment node
/**
 * T84 XFF: baseline garda izvora (zadnji unos x-forwarded-for, svi pozivatelji kroz hashClientIpSalted)
 * i bihevioralni ugovor izvrsenog izvora hash-ip.ts. Ponasanje pomocnika je i u
 * supabase/functions/_shared/hash-ip.test.ts.
 */
import { describe, expect, it } from 'vitest';
import { loadClientIpFromForwarded, xffBehaviourProblems, xffKeyProblems, xffRealSources } from './helpers/xff-key-guard';

const ok = "const ipHash = await hashClientIpSalted(req.headers.get('x-forwarded-for'), SALT, KEY);";

describe('T84 XFF: IP kljuc iz zadnjeg unosa', () => {
  it('stvarni izvor: hash-ip uzima zadnji unos, nijedan .ts modul ne navodi header mimo pomocnika', () => {
    const { hashIp, functions } = xffRealSources();
    expect(functions.some((f) => f.path === 'supabase/functions/faculty-request/index.ts')).toBe(true);
    expect(functions.some((f) => f.path.startsWith('supabase/functions/_shared/') && f.path !== 'supabase/functions/_shared/hash-ip.ts')).toBe(true);
    expect(functions.some((f) => f.path.endsWith('/global-slot.ts') || f.path.endsWith('/corpus-check.ts'))).toBe(true);
    expect(functions.filter((f) => f.text.includes("'x-forwarded-for'")).length).toBeGreaterThanOrEqual(9);
    expect(xffKeyProblems(hashIp, functions)).toEqual([]);
  });

  it('izvrseni hash-ip.ts: izmisljeni prefiksi ne mijenjaju kljuc, odlucuje zadnji hop', () => {
    expect(xffBehaviourProblems(loadClientIpFromForwarded(xffRealSources().hashIp))).toEqual([]);
  });

  it('negativne kontrole: velika slova, dvostruki navodnici, template i varijabla s nazivom headera (Codex XFF-3)', () => {
    const { hashIp } = xffRealSources();
    const bad = [
      "const ip = req.headers.get('X-Forwarded-For');",
      'const ip = req.headers.get("x-forwarded-for");',
      'const ip = req.headers.get(`x-forwarded-for`);',
      "const H = 'x-forwarded-for';\nconst ip = req.headers.get(H);",
      "const ipHash = await sha256(SALT + (req.headers.get('x-forwarded-for') ?? ''));",
    ];
    for (const text of bad) {
      expect(xffKeyProblems(hashIp, [{ path: 'supabase/functions/x/index.ts', text }]), text).toHaveLength(1);
    }
    expect(xffKeyProblems(hashIp, [{ path: 'supabase/functions/x/index.ts', text: ok }])).toEqual([]);
    expect(xffKeyProblems(hashIp, [{ path: 'supabase/functions/x/index.ts', text: `${ok}\n// komentar: x-forwarded-for se cita gore` }])).toEqual([]);
  });
});

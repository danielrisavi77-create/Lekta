/**
 * Gard T89: svaki Auth poziv koji GoTrue stiti captchom salje token kroz `withCaptcha`.
 *
 * GoTrue captcha stiti signup (i anonimni), otp, token?grant_type=password i recover. Poziv na
 * te putanje s tijelom mimo `withCaptcha` bi nakon ukljucivanja captche na Authu tiho pucao (za
 * anonimnu prijavu: popravak bez identiteta). Gard cita izvore, pa hvata i buduci tok, npr. reset
 * lozinke kroz /recover, koji danas ne postoji. Mutacije su u `tests/gate-mutations.test.ts`.
 */
import { normalizeLf } from './naplata-env';

export interface SourceFile {
  path: string;
  text: string;
}

/** Putanje koje GoTrue stiti captchom kad je ukljucen. */
const PROTECTED = ['/auth/v1/signup', '/auth/v1/otp', '/auth/v1/token?grant_type=password', '/auth/v1/recover'];

export function captchaWiringProblems(files: SourceFile[]): string[] {
  const out: string[] = [];
  let calls = 0;
  for (const { path, text } of files) {
    const src = normalizeLf(text);
    for (const endpoint of PROTECTED) {
      for (let at = src.indexOf(endpoint); at !== -1; at = src.indexOf(endpoint, at + endpoint.length)) {
        // Samo stvarni pozivi (template URL u fetchu), ne spominjanja u komentarima.
        const lineStart = src.lastIndexOf('\n', at) + 1;
        const line = src.slice(lineStart, src.indexOf('\n', at));
        if (!/\bfetch\w*\(`/.test(line)) continue;
        calls++;
        const call = src.slice(at, src.indexOf('\n    });', at));
        const body = /\bbody:\s*([^\n]*)/.exec(call)?.[1] ?? '';
        if (!body.startsWith('withCaptcha(')) {
          out.push(`${path}: ${endpoint} salje tijelo mimo withCaptcha (${body.trim() || 'nema body'})`);
        } else if (!/,\s*captchaToken\)/.test(body)) {
          out.push(`${path}: ${endpoint} zove withCaptcha bez captchaToken`);
        }
      }
    }
  }
  if (calls < 3) out.push(`nadjeno samo ${calls} zasticenih Auth poziva (ocekivano barem signup, otp i password)`);
  return out;
}

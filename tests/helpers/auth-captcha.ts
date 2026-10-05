/**
 * Gard T89: svaki Auth poziv koji GoTrue stiti captchom salje token kroz `withCaptcha`.
 *
 * GoTrue captcha stiti signup (i anonimni), otp, token?grant_type=password i recover. Poziv na
 * te putanje s tijelom mimo `withCaptcha` bi nakon ukljucivanja captche na Authu tiho pucao (za
 * anonimnu prijavu: popravak bez identiteta). Mutacije su u `tests/gate-mutations.test.ts`.
 *
 * OPSEG TVRDNJE (Codex T89-04): gard vidi (1) `fetch*(\`` poziv s tom putanjom na istom retku i
 * (2) supabase-js pozive `.auth.<metoda>(`. NE vidi putanju slozenu iz varijabli, poziv kroz drugi
 * HTTP klijent ni kod izvan skeniranih mapa (test skenira src/ i supabase/functions).
 */
import { normalizeLf } from './naplata-env';

export interface SourceFile {
  path: string;
  text: string;
}

/**
 * supabase-js metode koje GoTrue stiti captchom (Codex T89-04). Lekta ih danas ne koristi (Auth je
 * cisti fetch u src/auth/session.ts); svaki takav poziv u src/ ili supabase/functions je nalaz dok ga
 * netko svjesno ne ozici s `options.captchaToken` i ne prosiri ovaj gard.
 * `auth.admin.*` (service role na serveru) captchu ne trazi i nije u popisu.
 */
const SDK_PROTECTED = /\.auth\.(signInAnonymously|signUp|signInWithPassword|signInWithOtp|resetPasswordForEmail)\s*\(/g;

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
        const prefix = src.slice(lineStart, at);
        // T49 omata OTP URL u withRedirectQuery(...); endpoint mora biti unutar fetch templatea.
        if (!/\bfetch\w*\(\s*(?:withRedirectQuery\s*\(\s*)?`[^`]*$/.test(prefix)) continue;
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
  for (const { path, text } of files) {
    for (const m of normalizeLf(text).matchAll(SDK_PROTECTED)) {
      out.push(`${path}: supabase-js ${m[1]}() mimo withCaptcha; ozici captchaToken i prosiri gard`);
    }
  }
  if (calls < 3) out.push(`nadjeno samo ${calls} zasticenih Auth poziva (ocekivano barem signup, otp i password)`);
  return out;
}

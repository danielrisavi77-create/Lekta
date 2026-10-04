/**
 * T102: gard zastavice prijave Googleom.
 *
 * `VITE_AUTH_GOOGLE_ENABLED` se ne smije ukljuciti kroz repozitorij dok vlasnik ne odluci: Google
 * provider na Supabaseu dijeli Auth s Katedrom, pa ukljucivanje ide uskladjeno, kroz Netlify
 * okolinu, ne commitom. Gard zato trazi da `netlify.toml` zastavicu uopce ne dodjeljuje i da je
 * `.env.example` dokumentira kao `[klijent]` s praznom (iskljucenom) vrijednoscu.
 *
 * Gard ne vidi varijable postavljene u Netlify sucelju; to ostaje vlasnikova radnja.
 */
const FLAG = 'VITE_AUTH_GOOGLE_ENABLED';

function lines(text: string): string[] {
  return text.replace(/\r/g, '').split('\n');
}

export function googleFlagProblems(netlifyToml: string, envExample: string): string[] {
  const problems: string[] = [];

  for (const [i, raw] of lines(netlifyToml).entries()) {
    const line = raw.trim();
    if (line.startsWith('#')) continue;
    if (new RegExp(`^"?${FLAG}"?\\s*=`).test(line)) {
      problems.push(`netlify.toml:${i + 1} dodjeljuje ${FLAG}; ukljucivanje je vlasnikova odluka izvan repozitorija`);
    }
  }

  const env = lines(envExample);
  const idx = env.findIndex((l) => new RegExp(`^${FLAG}=`).test(l.trim()));
  if (idx < 0) {
    problems.push(`.env.example ne dokumentira ${FLAG}`);
  } else {
    const value = env[idx].trim().slice(FLAG.length + 1).trim();
    if (value !== '') problems.push(`.env.example postavlja ${FLAG}=${value}; primjer mora biti iskljucen (prazno)`);
    const comment = env.slice(Math.max(0, idx - 6), idx).filter((l) => l.trim().startsWith('#')).join('\n');
    if (!comment.includes('[klijent]')) problems.push(`.env.example: ${FLAG} nema oznaku [klijent] u komentaru iznad`);
  }
  return problems;
}

/**
 * Ugovor zastavice izvrsen nad zadanom funkcijom (stvarnom ili mutiranom iz izvora): ukljucena je
 * samo izricitim `true`/`1`, a sve nepoznato je iskljuceno (fail-closed).
 */
export function flagContractProblems(enabled: (env: Record<string, unknown>) => boolean): string[] {
  const problems: string[] = [];
  for (const v of [undefined, null, '', ' ', 'false', '0', 'no', 'yes', 'on', 'TRUE1']) {
    if (enabled({ VITE_AUTH_GOOGLE_ENABLED: v }) !== false) problems.push(`ukljucena za ${JSON.stringify(v)}`);
  }
  if (enabled({}) !== false) problems.push('ukljucena bez varijable');
  for (const v of ['true', '1', ' TRUE ']) {
    if (enabled({ VITE_AUTH_GOOGLE_ENABLED: v }) !== true) problems.push(`iskljucena za ${JSON.stringify(v)}`);
  }
  return problems;
}

type Pending = { verifier: string; createdAt: number };
type Complete = (
  cfg: { supabaseUrl: string; anonKey: string },
  search: string,
  opts: { store: { load(): Pending | null; save(v: Pending | null): void }; fetchImpl?: typeof fetch; now?: number },
) => Promise<{ ok: boolean } | null>;

/**
 * Ugovor PKCE povratka izvrsen nad zadanom completeGoogleSignIn: tudji `?code=` bez verifiera se
 * ignorira bez mreze, istekao verifier je neuspjeh bez mreze, a verifier je jednokratan.
 */
export async function pkceContractProblems(complete: Complete, maxAgeMs: number): Promise<string[]> {
  const problems: string[] = [];
  const cfg = { supabaseUrl: 'https://proj.supabase.co', anonKey: 'anon' };
  const body = { access_token: 'a', refresh_token: 'r', expires_in: 3600, user: { id: 'u', email: 'e@x.hr' } };
  const mk = (p: Pending | null) => {
    let v = p;
    return { load: () => v, save: (x: Pending | null) => { v = x; }, value: () => v };
  };
  let calls = 0;
  const f = (async () => { calls++; return { ok: true, status: 200, json: async () => body }; }) as unknown as typeof fetch;
  const p: Pending = { verifier: 'v'.repeat(43), createdAt: 1_000 };

  calls = 0;
  if ((await complete(cfg, '?code=tudji', { store: mk(null), fetchImpl: f, now: 1_500 })) !== null || calls) {
    problems.push('tudji code bez verifiera nije ignoriran');
  }
  calls = 0;
  const istekao = mk(p);
  const out = await complete(cfg, '?code=x', { store: istekao, fetchImpl: f, now: p.createdAt + maxAgeMs + 1 });
  if (!out || out.ok || calls) problems.push('istekao verifier nije odbijen bez mreze');
  calls = 0;
  const jednom = mk(p);
  const prvi = await complete(cfg, '?code=x', { store: jednom, fetchImpl: f, now: 1_500 });
  if (!prvi?.ok || calls !== 1) problems.push('valjan povratak nije zamijenjen tocno jednim pozivom');
  if (jednom.value() !== null) problems.push('verifier nije potrosen');
  return problems;
}

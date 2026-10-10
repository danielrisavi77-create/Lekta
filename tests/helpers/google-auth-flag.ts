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

const TOML_ESCAPE: Record<string, string> = { b: '\b', t: '\t', n: '\n', f: '\f', r: '\r', '"': '"', '\\': '\\', e: '\x1b' };

/**
 * TOML redak bez komentara i s DEKODIRANIM osnovnim nizovima: `#` izvan navodnika zapocinje
 * komentar, a u "..." se razrjesuju escape sekvence (\uXXXX, \UXXXXXXXX, \", \\ ...), pa
 * `"VITE_AUTH_GOOGLE_ENABLED"` postaje ime zastavice (Codex R4 runda 2 na #307). Doslovni
 * '...' nizovi nemaju escapea. Nepoznata sekvenca ostaje doslovno (fail-closed: ne skriva ime).
 */
function tomlDekodiranRedak(line: string): string {
  let out = '';
  let quote: string | null = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote === '"') {
      if (c === '\\') {
        const n = line[i + 1] ?? '';
        const duljina = n === 'u' ? 4 : n === 'U' ? 8 : 0;
        const hex = duljina ? line.slice(i + 2, i + 2 + duljina) : '';
        if (duljina && hex.length === duljina && /^[0-9a-fA-F]+$/.test(hex)) {
          out += String.fromCodePoint(parseInt(hex, 16));
          i += 1 + duljina;
        } else if (n in TOML_ESCAPE) {
          out += TOML_ESCAPE[n];
          i += 1;
        } else out += c;
      } else if (c === '"') quote = null;
      else out += c;
    } else if (quote === "'") {
      if (c === "'") quote = null;
      else out += c;
    } else if (c === '"' || c === "'") quote = c;
    else if (c === '#') break;
    else out += c;
  }
  return out;
}

export function googleFlagProblems(netlifyToml: string, envExample: string): string[] {
  const problems: string[] = [];

  // Bilo koje pojavljivanje imena izvan komentara: gol, "dvostruko" ili 'jednostruko' citiran
  // kljuc, tockasti kljuc (environment.X) i inline tablica ({ X = "true" }). Fail-closed: i
  // spominjanje u vrijednosti je nalaz, jer zastavica u netlify.toml nema legitimnu upotrebu.
  for (const [i, raw] of lines(netlifyToml).entries()) {
    if (tomlDekodiranRedak(raw).includes(FLAG)) {
      problems.push(`netlify.toml:${i + 1} dodjeljuje ${FLAG}; ukljucivanje je vlasnikova odluka izvan repozitorija`);
    }
  }

  const env = lines(envExample);
  const dodjela = new RegExp(`^\\s*(?:export\\s+)?${FLAG}\\s*=(.*)$`);
  const pogodci = env.map((l, i) => ({ i, m: dodjela.exec(l) })).filter((x) => x.m);
  if (pogodci.length === 0) {
    problems.push(`.env.example ne dokumentira ${FLAG}`);
  } else {
    if (pogodci.length > 1) problems.push(`.env.example dodjeljuje ${FLAG} ${pogodci.length} puta; dopusten je tocno jedan unos`);
    for (const { m } of pogodci) {
      const value = m![1].replace(/\s+#.*$/, '').trim().replace(/^(['"])(.*)\1$/, '$2');
      if (value !== '') problems.push(`.env.example postavlja ${FLAG}=${value}; primjer mora biti iskljucen (prazno)`);
    }
    const idx = pogodci[0].i;
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

  // Identitet (Codex R3 na #307): odgovor bez `user` i anonimni korisnik nisu uspjeh.
  for (const [ime, tijelo] of [
    ['bez user', { access_token: 'a', refresh_token: 'r', expires_in: 3600 }],
    ['anonimni korisnik', { ...body, user: { id: 'u', email: '', is_anonymous: true } }],
  ] as const) {
    const g = (async () => ({ ok: true, status: 200, json: async () => tijelo })) as unknown as typeof fetch;
    const r = await complete(cfg, '?code=x', { store: mk(p), fetchImpl: g, now: 1_500 });
    if (!r || r.ok) problems.push(`odgovor ${ime} prihvacen kao prijava`);
  }
  return problems;
}

// scripts/verify-naplata-secrets.mjs
//
// PREFLIGHT NAPLATE: tvrdo odbija deploy naplate kad tajna nedostaje ili je prazna.
//
// ZASTO POSTOJI, izmjereno 2026-09-22: `webhook-mor` je citao `LS_STORE_ID`, a `create-checkout`
// `LEMONSQUEEZY_STORE_ID`. Dvije funkcije iste naplate trazile su dvije razlicite tajne za ISTU
// trgovinu. Operater koji je postavio jednu imao je checkout koji radi i webhook koji svaku kupnju
// tiho odbija s `store_unverifiable`: kupac plati, entitlement ne nastane, a jedini trag je redak u
// logu. Imena su sada ujednacena, ali sama ujednacenost ne jamci da je vrijednost POSTAVLJENA.
//
// KOJU OKOLINU MJERI (ispravak nalaza pregleda 2026-09-23): prva verzija ove skripte citala je
// `process.env`, dakle ljusku operatera. To je KRIVA OS. `webhook-mor` ne vidi ljusku nego Supabase
// Edge Functions Secrets. Operater s izvezenim `LEMONSQUEEZY_STORE_ID` dobio bi zeleno, deployao, a
// tajna u projektu bi ostala prazna; obrnuto, tko vrijednosti drzi samo u Supabaseu dobio bi lazni
// crveni. Zato je ZADANI izvor `supabase secrets list`, dakle okolina u kojoj funkcija stvarno radi.
// Lokalna ljuska se mjeri samo na izricit `--env` i tada se u izlazu IMENUJE kao druga os.
//
// Kad se okolina ne moze procitati (CLI nije instaliran, projekt nije povezan, izlaz je prazan ili
// neprepoznat), izlazni kod je 1 s imenovanim razlogom. Nepoznato se NE tumaci kao zeleno.
//
// Pokretanje prije `supabase functions deploy` (vidi docs/GO_LIVE_NAPLATA.md):
//   npm run verify-naplata-secrets                 (mjeri Supabase Edge secrets; zadano)
//   npm run verify-naplata-secrets -- --project-ref <ref>
//   npm run verify-naplata-secrets -- --env        (mjeri LOKALNU ljusku; slabija tvrdnja)
// Vrijednosti se nikad ne ispisuju, samo imena.
//
// Odluke su CISTE funkcije (`parseSupabaseSecretsList`, `supabaseSecretsVerdict`,
// `naplataSecretsVerdict`), odvojene od procesa, da se mogu mutirati u `tests/gate-mutations.test.ts`
// i `tests/naplata-secrets.test.ts`. Proces koji zove `process.exit` ne moze biti mutiran u memoriji,
// pa bi gard bez tih funkcija tvrdio da grize, a nitko to ne bi provjerio.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

/**
 * Tajne bez kojih naplata ne radi ili radi lazno.
 *
 * `LEMONSQUEEZY_STORE_ID` citaju OBJE funkcije naplate (`create-checkout`, `webhook-mor`); da
 * popis ne moze cuvati ime koje vise nitko ne cita, `tests/naplata-secrets.test.ts` trazi da se
 * svako ime ovdje stvarno pojavi u izvoru Edge funkcije.
 */
export const NAPLATA_SECRETS = Object.freeze([
  'MOR_WEBHOOK_SECRET',
  'LEMONSQUEEZY_API_KEY',
  'LEMONSQUEEZY_STORE_ID',
]);

/**
 * SHA-256 PRAZNOG stringa. Supabase u popisu tajni ne pokazuje vrijednost nego njezin digest, pa je
 * ovo jedini nacin da se tajna POSTAVLJENA NA PRAZNO razlikuje od postavljene vrijednosti.
 *
 * Granica tvrdnje: ako Supabase promijeni nacin racunanja digesta, ova provjera prestaje okidati i
 * preflight pada natrag na "ime postoji". To je tisa, ali ne i lazno zelena provjera, jer se
 * nedostajuce ime i dalje hvata. Nad zivim projektom u ovoj grani NIJE provjereno.
 */
export const EMPTY_VALUE_DIGEST = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

/**
 * Razbij izlaz `supabase secrets list` na retke `{ name, digest }`.
 *
 * Podrzana su oba oblika koja CLI daje: JSON (`--output json`) i zadana tablica s okomitom crtom.
 * Nepoznat oblik daje prazan niz, a prazan niz pozivatelj tretira kao "okolina nije procitana", ne
 * kao "nema tajni".
 *
 * @param {string} text
 * @returns {{ name: string; digest: string }[]}
 */
export function parseSupabaseSecretsList(text) {
  const trimmed = String(text ?? '').trim();
  if (!trimmed) return [];
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      const rows = Array.isArray(parsed) ? parsed : [parsed];
      return rows
        .map((r) => ({
          name: String(r?.name ?? r?.NAME ?? ''),
          digest: String(r?.value ?? r?.digest ?? r?.DIGEST ?? '').toLowerCase(),
        }))
        .filter((r) => r.name !== '');
    } catch {
      return [];
    }
  }
  /** @type {{ name: string; digest: string }[]} */
  const out = [];
  for (const line of trimmed.split(/\r?\n/)) {
    if (!line.includes('|')) continue;
    const [rawName, rawDigest = ''] = line.split('|');
    const name = rawName.trim();
    // Zaglavlje tablice i redak razdjelnika nisu tajne. Imena tajni su velikim slovima i podvlakama.
    if (name === 'NAME' || !/^[A-Z][A-Z0-9_]*$/.test(name)) continue;
    out.push({ name, digest: rawDigest.trim().toLowerCase() });
  }
  return out;
}

/**
 * Presuda nad SUPABASE Edge secretima: okolina u kojoj `webhook-mor` stvarno radi.
 *
 * Tajna nedostaje kad je nema u popisu, ili kad je postavljena na prazno (digest praznog stringa).
 * Supabase secret postavljen na prazno u sucelju izgleda kao da postoji, a `acceptEvent` ga vidi
 * isto kao da ga nema i odbija svaku kupnju s 200, bez retryja.
 *
 * @param {{ name: string; digest?: string }[]} rows
 * @param {readonly string[]} [required]
 * @returns {{ ok: boolean; missing: { name: string; reason: 'nema' | 'prazna' }[] }}
 */
export function supabaseSecretsVerdict(rows, required = NAPLATA_SECRETS) {
  const byName = new Map(
    (Array.isArray(rows) ? rows : []).map((r) => [String(r?.name ?? ''), String(r?.digest ?? '').toLowerCase()]),
  );
  /** @type {{ name: string; reason: 'nema' | 'prazna' }[]} */
  const missing = [];
  for (const name of required) {
    if (!byName.has(name)) missing.push({ name, reason: 'nema' });
    else if (byName.get(name) === EMPTY_VALUE_DIGEST) missing.push({ name, reason: 'prazna' });
  }
  return { ok: missing.length === 0, missing };
}

/**
 * Presuda nad LOKALNOM ljuskom (`--env`). Prazan string i sam razmak broje se kao NEPOSTAVLJENO.
 *
 * Ovo NIJE okolina u kojoj Edge funkcija radi; koristi se samo tamo gdje tajne stvarno zive u
 * okolini procesa (CI korak koji ih sam prosljedjuje), i izlaz to mora reci naglas.
 *
 * @param {Record<string, string | undefined>} env
 * @param {readonly string[]} [required]
 * @returns {{ ok: boolean; missing: string[] }}
 */
export function naplataSecretsVerdict(env, required = NAPLATA_SECRETS) {
  const source = env ?? {};
  const missing = required.filter((name) => String(source[name] ?? '').trim() === '');
  return { ok: missing.length === 0, missing };
}

/**
 * Dohvati popis Supabase Edge secreta kroz CLI. Vraca i neuspjeh, s razlogom; pozivatelj ga NE
 * smije protumaciti kao "nema tajni".
 *
 * @param {string[]} [extraArgs]
 * @returns {{ ok: true, rows: { name: string, digest: string }[] } | { ok: false, reason: string }}
 */
export function readSupabaseSecrets(extraArgs = []) {
  const args = ['secrets', 'list', ...extraArgs];
  const res = spawnSync('supabase', args, {
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  if (res.error) return { ok: false, reason: `Supabase CLI se ne moze pokrenuti (${res.error.message})` };
  if (res.status !== 0) {
    const detail = String(res.stderr ?? '').trim().split(/\r?\n/).slice(0, 3).join(' ');
    return {
      ok: false,
      reason: `supabase ${args.join(' ')} je vratio izlazni kod ${res.status}: ${detail || 'bez poruke'}`,
    };
  }
  const rows = parseSupabaseSecretsList(res.stdout);
  if (rows.length === 0) return { ok: false, reason: 'izlaz naredbe supabase secrets list je prazan ili neprepoznat' };
  return { ok: true, rows };
}

// Isti obrazac kao ostale skripte: CLI blok se izvodi SAMO kad je ova datoteka ulazna tocka.
// Test je uvozi kao modul (`process.argv[1]` je tada vitest), pa `process.exit` nikad ne okine.
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const argv = process.argv.slice(2);
  const upute = 'docs/GO_LIVE_NAPLATA.md, korak 5';
  if (argv.includes('--env')) {
    // IZRICITO druga os: mjeri se ljuska, ne okolina Edge funkcije. Izlaz to kaze naglas.
    const verdict = naplataSecretsVerdict(process.env);
    if (!verdict.ok) {
      console.error('[verify-naplata-secrets] LOKALNA OKOLINA (--env): nedostaju ili su prazne tajne:');
      for (const name of verdict.missing) console.error(`  - ${name}`);
      process.exit(1);
    }
    console.error('[verify-naplata-secrets] UPOZORENJE: mjerena je LOKALNA ljuska (--env), ne Supabase Edge secrets.');
    console.error('  Zeleno ovdje NE dokazuje da je tajna postavljena u projektu iz kojeg webhook-mor radi.');
    console.log(`[verify-naplata-secrets] lokalna okolina: sve tajne naplate su postavljene (${NAPLATA_SECRETS.length}).`);
  } else {
    const projectRef = (() => {
      const i = argv.indexOf('--project-ref');
      return i >= 0 && argv[i + 1] ? ['--project-ref', argv[i + 1]] : [];
    })();
    const read = readSupabaseSecrets(projectRef);
    if (!read.ok) {
      // NEPOZNATO NIJE ZELENO: bez ocitanja okoline deploya nema tvrdnje.
      console.error('[verify-naplata-secrets] deploy naplate ODBIJEN: okolina se ne moze procitati.');
      console.error(`  razlog: ${read.reason}`);
      console.error('  Provjeri da je Supabase CLI instaliran i projekt povezan (supabase link), pa ponovi.');
      console.error('  Za mjerenje LOKALNE ljuske (druga os, slabija tvrdnja) pokreni s: -- --env');
      process.exit(1);
    }
    const verdict = supabaseSecretsVerdict(read.rows);
    if (!verdict.ok) {
      console.error('[verify-naplata-secrets] deploy naplate ODBIJEN: Supabase Edge secrets nisu potpuni:');
      for (const m of verdict.missing) console.error(`  - ${m.name} (${m.reason})`);
      console.error(`  Postavi ih kao Supabase Edge secrets (${upute}) pa ponovi.`);
      process.exit(1);
    }
    console.log(
      `[verify-naplata-secrets] Supabase Edge secrets: sve tajne naplate su postavljene (${NAPLATA_SECRETS.length} od ${read.rows.length} u projektu).`,
    );
  }
}

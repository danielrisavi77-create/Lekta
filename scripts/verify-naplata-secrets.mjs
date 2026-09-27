// scripts/verify-naplata-secrets.mjs
//
// PREFLIGHT NAPLATE: tvrdo odbija deploy naplate kad tajna nedostaje ili je prazna.
//
// PRUZATELJ JE STRIPE (F18, odluka vlasnika 2026-09-23). Skripta je dosla s mastera, gdje je
// pisana za prijasnjeg pruzatelja; pri spajanju mastera u design/pack3 (2026-09-26) prenesena je na
// Stripe tajne uz istu strogocu: nepostavljena ili prazna obavezna tajna, i nepoznata okolina,
// obaraju deploy. Tijekom bete je naplata iskljucena (vlasnik 2026-09-26), tajne su prazne, pa
// ova skripta deploy naplate namjerno ODBIJA dok se beta ne zavrsi.
//
// ZASTO POSTOJI, izmjereno na masteru 2026-09-22: dvije funkcije iste naplate citale su dvije
// razlicite tajne za istu stvar, pa je operater mogao postaviti jednu i vjerovati da je naplata
// konfigurirana. Za Stripe vrijedi isto nacelo: `webhook-mor` bez `STRIPE_WEBHOOK_SECRET` odbija
// SVAKI dogadjaj s `missing_secret` (401), a `create-checkout` bez `STRIPE_SECRET_KEY` ili
// `STRIPE_PUBLISHABLE_KEY` vraca `stripe_not_configured`. Ime tajne u kodu ne jamci da je
// vrijednost POSTAVLJENA u okolini deploya.
//
// KOJU OKOLINU MJERI (ispravak nalaza pregleda 2026-09-23): prva verzija ove skripte citala je
// `process.env`, dakle ljusku operatera. To je KRIVA OS. `webhook-mor` ne vidi ljusku nego Supabase
// Edge Functions Secrets. Operater s izvezenim `STRIPE_WEBHOOK_SECRET` dobio bi zeleno, deployao, a
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
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

/** Korijen repozitorija: ova datoteka je u `scripts/`. */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Tajne bez kojih naplata ne radi ili radi lazno.
 *
 * `STRIPE_SECRET_KEY` i `STRIPE_PUBLISHABLE_KEY` cita `create-checkout` (PaymentIntent i kljuc za
 * Payment Element), `STRIPE_WEBHOOK_SECRET` cita `webhook-mor` (provjera `Stripe-Signature`). Da
 * popis ne moze cuvati ime koje vise nitko ne cita, `tests/naplata-secrets.test.ts` trazi da se
 * svako ime ovdje stvarno pojavi u izvoru Edge funkcije.
 *
 * NIJE obavezna: `STRIPE_ALLOW_TEST_MODE` (u produkciji MORA biti prazno; vidi {@link testModeVerdict}).
 * ZABRANJENA je `STRIPE_ACCOUNT_ID`; vidi {@link NAPLATA_FORBIDDEN_SECRETS}.
 */
export const NAPLATA_SECRETS = Object.freeze([
  'STRIPE_SECRET_KEY',
  'STRIPE_PUBLISHABLE_KEY',
  'STRIPE_WEBHOOK_SECRET',
]);

/** Neobavezne tajne naplate koje funkcije citaju; njihov izostanak NE obara preflight. */
export const NAPLATA_OPTIONAL_SECRETS = Object.freeze(['STRIPE_ALLOW_TEST_MODE']);

/**
 * Tajne koje u okolini deploya NE SMIJU imati vrijednost.
 *
 * `STRIPE_ACCOUNT_ID` (nalaz pregleda kruga 3 spajanja, 2026-09-27; Stripe ekvivalent drugog
 * dijela masterova 4addb5db, "isti identitet trgovine u obje funkcije"). Do kruga 3 ju je citao
 * SAMO `webhook-mor`: postavljena, odbijala je svaki dogadjaj bez istog polja `account`, a
 * `create-checkout` PaymentIntent stvara na vlastitom racunu, pa njegovi dogadjaji to polje nikad
 * ne nose. Svaka kupnja bi zavrsila kao 200 `event_refused` bez retryja, a preflight je tu tajnu
 * vodio kao neobaveznu i bio zelen. Lekta ne koristi Stripe Connect, pa je tajna uklonjena iz obje
 * funkcije. Ostane li postavljena u projektu, operater vjeruje da nesto konfigurira, a nitko je ne
 * cita; zato je preflight imenuje i odbija deploy, umjesto da je sutke preskoci.
 */
export const NAPLATA_FORBIDDEN_SECRETS = Object.freeze(['STRIPE_ACCOUNT_ID']);

/** Ime tajne koja u `webhook-mor` otvara testni nacin rada (`=== '1'`). */
export const TEST_MODE_SECRET = 'STRIPE_ALLOW_TEST_MODE';

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
 * SHA-256 niza `1`: jedina vrijednost `STRIPE_ALLOW_TEST_MODE` koju `webhook-mor` tumaci kao
 * "dopusti testni nacin" (`Deno.env.get('STRIPE_ALLOW_TEST_MODE') === '1'`).
 *
 * Granica tvrdnje ista kao za {@link EMPTY_VALUE_DIGEST}: ovisi o tome da Supabase prikazuje SHA-256
 * vrijednosti. Nad zivim projektom u ovoj grani NIJE provjereno.
 */
export const TEST_MODE_ON_DIGEST = '6b86b273ff34fce19d6b804eff5a3f5747ada4eaa22f1d49c01e52ddb7875b4b';

/**
 * Je li digest iz popisa tajni PREPOZNATLJIV: neprazan heksadecimalni niz. Sve drugo (prazan
 * stupac, status ili tekst na mjestu digesta nakon promjene CLI izlaza) je nepoznata vrijednost.
 * Namjerno ne trazi tocno 64 znaka: duljina digesta nad zivim projektom u ovoj grani NIJE
 * izmjerena, a gard koji je uvijek crven zbog formata ne mjeri tajne (Codex pregled kruga 3).
 *
 * @param {unknown} digest
 * @returns {boolean}
 */
export function isKnownDigest(digest) {
  return /^[0-9a-f]+$/i.test(String(digest ?? '').trim());
}

/**
 * Je li u okolini deploya UKLJUCEN testni nacin rada, ILI mu se vrijednost ne vidi.
 *
 * Testni Stripe dogadjaj s ispravnim potpisom bi uz tu zastavicu dodijelio PRAVO pravo pristupa
 * (audit PAY-05). Na stagingu je to namjerno, u produkciji nikad; zato ga preflight odbija, osim
 * uz izricit `--dopusti-testni-nacin`, koji je tvrdnja operatera da deploya na staging.
 *
 * Redak `STRIPE_ALLOW_TEST_MODE` s neprepoznatim digestom broji se kao ukljucen: vrijednost bi
 * mogla biti `1`, a nepoznato nije zeleno (Codex pregled kruga 3 spajanja, 2026-09-27).
 *
 * @param {{ name: string; digest?: string }[]} rows
 * @returns {boolean}
 */
export function testModeVerdict(rows) {
  const row = (Array.isArray(rows) ? rows : []).find((r) => String(r?.name ?? '') === TEST_MODE_SECRET);
  if (!row) return false;
  if (!isKnownDigest(row.digest)) return true;
  return String(row.digest ?? '').trim().toLowerCase() === TEST_MODE_ON_DIGEST;
}

/**
 * Je li u LOKALNOJ ljusci (`--env`) ukljucen testni nacin rada. Strozi od `webhook-mor`
 * (`=== '1'`): i `1` s razmakom se broji kao ukljuceno. Bez ove provjere `--env` je bio zelen uz
 * `STRIPE_ALLOW_TEST_MODE=1` (Codex pregled kruga 3 spajanja, 2026-09-27).
 *
 * @param {Record<string, string | undefined>} env
 * @returns {boolean}
 */
export function testModeEnvVerdict(env) {
  return String((env ?? {})[TEST_MODE_SECRET] ?? '').trim() === '1';
}

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
 * Supabase secret postavljen na prazno u sucelju izgleda kao da postoji, a `verifyStripeSignature`
 * ga vidi isto kao da ga nema i odbija svaki dogadjaj s `missing_secret`.
 *
 * Redak BEZ prepoznatljivog digesta (prazan stupac ili tekst koji nije heksadecimalan, vidi
 * {@link isKnownDigest}) je `nepoznata`, ne postavljena: bez digesta se postavljena vrijednost ne
 * moze razlikovati od prazne, a nepoznato nije zeleno (Codex pregled kruga 3 spajanja, 2026-09-27).
 *
 * @param {{ name: string; digest?: string }[]} rows
 * @param {readonly string[]} [required]
 * @returns {{ ok: boolean; missing: { name: string; reason: 'nema' | 'prazna' | 'nepoznata' }[] }}
 */
export function supabaseSecretsVerdict(rows, required = NAPLATA_SECRETS) {
  const byName = new Map(
    (Array.isArray(rows) ? rows : []).map((r) => [String(r?.name ?? ''), String(r?.digest ?? '').toLowerCase()]),
  );
  /** @type {{ name: string; reason: 'nema' | 'prazna' | 'nepoznata' }[]} */
  const missing = [];
  for (const name of required) {
    if (!byName.has(name)) missing.push({ name, reason: 'nema' });
    else if (byName.get(name) === EMPTY_VALUE_DIGEST) missing.push({ name, reason: 'prazna' });
    else if (!isKnownDigest(byName.get(name))) missing.push({ name, reason: 'nepoznata' });
  }
  return { ok: missing.length === 0, missing };
}

/**
 * Presuda o ZABRANJENIM tajnama nad Supabase Edge secretima ({@link NAPLATA_FORBIDDEN_SECRETS}).
 *
 * Zabranjena tajna je postavljena kad je ima u popisu s digestom koji NIJE digest praznog stringa.
 * Redak bez digesta (neprepoznat stupac) broji se kao postavljen: nepoznato nije zeleno.
 *
 * @param {{ name: string; digest?: string }[]} rows
 * @param {readonly string[]} [forbidden]
 * @returns {{ ok: boolean; present: string[] }}
 */
export function forbiddenSecretsVerdict(rows, forbidden = NAPLATA_FORBIDDEN_SECRETS) {
  const list = Array.isArray(rows) ? rows : [];
  const present = forbidden.filter((name) =>
    list.some(
      (r) => String(r?.name ?? '') === name && String(r?.digest ?? '').toLowerCase() !== EMPTY_VALUE_DIGEST,
    ),
  );
  return { ok: present.length === 0, present };
}

/**
 * Presuda o zabranjenim tajnama nad LOKALNOM ljuskom (`--env`). Prazno i sam razmak su nepostavljeno.
 *
 * @param {Record<string, string | undefined>} env
 * @param {readonly string[]} [forbidden]
 * @returns {{ ok: boolean; present: string[] }}
 */
export function forbiddenEnvVerdict(env, forbidden = NAPLATA_FORBIDDEN_SECRETS) {
  const source = env ?? {};
  const present = forbidden.filter((name) => String(source[name] ?? '').trim() !== '');
  return { ok: present.length === 0, present };
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
 * Gdje je Supabase CLI.
 *
 * NE GOLO IME IZ PATH-a (nalaz pregleda 2026-09-23). Repozitorij CLI isporucuje kao devDependency
 * (`supabase` u package.json), dakle u `node_modules/.bin`, i nigdje ne trazi globalnu instalaciju.
 * Prva verzija preflighta pokretala je golo ime iz PATH-a, pa je na ovom stroju IZMJERENO
 * vracala izlazni kod 1 uz `'supabase' is not recognized`, i to JEDNAKO i kad su tajne ispravne i
 * kad je tajna naplate prazna. Gard koji je uvijek crven iz razloga koji ne mjeri nije
 * gard nego nauk da ga se preskoci. Isti izvod rade `scripts/run-local-repair-release.mts`
 * (`node_modules/.bin/supabase.cmd`) i `scripts/deploy-profile-rules.mjs` (kroz `npx`).
 *
 * Globalna instalacija ostaje zadnja mogucnost, da skripta radi i izvan repozitorija.
 *
 * @param {string} [root]
 * @param {string} [platform]
 * @param {(p: string) => boolean} [exists]
 * @returns {string}
 */
export function resolveSupabaseCli(root = ROOT, platform = process.platform, exists = existsSync) {
  const bin = path.join(root, 'node_modules', '.bin', platform === 'win32' ? 'supabase.cmd' : 'supabase');
  return exists(bin) ? bin : 'supabase';
}

/**
 * Pokreni Supabase CLI. Na Windowsu `.cmd` trazi ljusku, pa se putanja s razmakom navodi.
 *
 * @param {string[]} args
 * @param {{ stdio?: 'pipe' | 'inherit' }} [opts]
 */
function runSupabase(args, opts = {}) {
  const cli = resolveSupabaseCli();
  const shell = process.platform === 'win32';
  const cmd = shell && cli.includes(' ') ? `"${cli}"` : cli;
  return spawnSync(cmd, args, {
    cwd: ROOT,
    encoding: 'utf8',
    shell,
    stdio: opts.stdio ?? 'pipe',
    windowsHide: true,
  });
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
  const res = runSupabase(args);
  if (res.error) return { ok: false, reason: `Supabase CLI se ne moze pokrenuti (${res.error.message})` };
  if (res.status !== 0) {
    // Supabase CLI poruku o gresci zna pisati na STDOUT (npr. LegacyProjectNotLinkedError kao
    // JSON), pa citanje samo stderr-a daje 'bez poruke' i skriva pravi razlog. Gledamo oboje.
    const detail = [res.stderr, res.stdout]
      .map((v) => String(v ?? '').trim())
      .filter((v) => v !== '')
      .join(' ')
      .split(/\r?\n/)
      .slice(0, 3)
      .join(' ')
      .slice(0, 300);
    return {
      ok: false,
      reason: `supabase ${args.join(' ')} je vratio izlazni kod ${res.status}: ${detail || 'bez poruke'}`,
    };
  }
  const rows = parseSupabaseSecretsList(res.stdout);
  if (rows.length === 0) return { ok: false, reason: 'izlaz naredbe supabase secrets list je prazan ili neprepoznat' };
  return { ok: true, rows };
}

/**
 * Funkcije naplate koje `npm run deploy:naplata` deploya, redom.
 *
 * ZASTO JE DEPLOY U ISTOJ SKRIPTI KAO PREFLIGHT (nalaz pregleda 2026-09-23): dok je preflight bio
 * zaseban redak u runbooku, jedina obrana od prazne tajne bila je da ga se operater sjeti pokrenuti.
 * `npm run check` ga ne vidi (trazi zivi CLI i povezan projekt), a `release:check` ne zna za
 * naplatu. Preskocen korak znaci deploy s praznim `STRIPE_WEBHOOK_SECRET`, dakle svaki dogadjaj
 * odbijen s `missing_secret`, ili s praznim `STRIPE_SECRET_KEY`, dakle checkout koji ne radi. Sada je deploy naplate JEDNA naredba koja
 * preflight nosi u sebi, bez zastavice za preskakanje: put kojim se ide ne moze zaobici provjeru.
 */
export const NAPLATA_FUNCTIONS = Object.freeze(['create-checkout', 'webhook-mor']);

// Isti obrazac kao ostale skripte: CLI blok se izvodi SAMO kad je ova datoteka ulazna tocka.
// Test je uvozi kao modul (`process.argv[1]` je tada vitest), pa `process.exit` nikad ne okine.
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const argv = process.argv.slice(2);
  const upute = 'docs/GO_LIVE_NAPLATA.md, korak 5';
  const deploy = argv.includes('--deploy');
  if (argv.includes('--env')) {
    // IZRICITO druga os: mjeri se ljuska, ne okolina Edge funkcije. Izlaz to kaze naglas.
    if (deploy) {
      console.error('[verify-naplata-secrets] --env i --deploy se iskljucuju: deploy ne ide na tvrdnji o ljusci.');
      process.exit(1);
    }
    const verdict = naplataSecretsVerdict(process.env);
    if (!verdict.ok) {
      console.error('[verify-naplata-secrets] LOKALNA OKOLINA (--env): nedostaju ili su prazne tajne:');
      for (const name of verdict.missing) console.error(`  - ${name}`);
      process.exit(1);
    }
    const zabranjene = forbiddenEnvVerdict(process.env);
    if (!zabranjene.ok) {
      console.error('[verify-naplata-secrets] LOKALNA OKOLINA (--env): postavljene su zabranjene tajne naplate:');
      for (const name of zabranjene.present) console.error(`  - ${name} (Stripe Connect nije podrzan)`);
      process.exit(1);
    }
    if (testModeEnvVerdict(process.env) && !argv.includes('--dopusti-testni-nacin')) {
      console.error(`[verify-naplata-secrets] LOKALNA OKOLINA (--env): ${TEST_MODE_SECRET} je postavljen na 1 (testni nacin).`);
      console.error('  U produkciji mora biti prazan. Za staging ponovi s: -- --env --dopusti-testni-nacin');
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
      console.error(`  CLI koji je pokusan: ${resolveSupabaseCli()}`);
      console.error('  Provjeri da si prijavljen (supabase login) i da je projekt povezan (supabase link), pa ponovi.');
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
    const zabranjene = forbiddenSecretsVerdict(read.rows);
    if (!zabranjene.ok) {
      // Nitko je ne cita: ostavljena, lazno tvrdi da je Connect racun konfiguriran.
      console.error('[verify-naplata-secrets] deploy naplate ODBIJEN: postavljene su zabranjene tajne naplate:');
      for (const name of zabranjene.present) console.error(`  - ${name}`);
      console.error('  Lekta ne koristi Stripe Connect: create-checkout i webhook-mor rade na racunu kljuca STRIPE_SECRET_KEY.');
      console.error('  Ukloni tajnu (supabase secrets unset <IME>) pa ponovi.');
      process.exit(1);
    }
    if (testModeVerdict(read.rows) && !argv.includes('--dopusti-testni-nacin')) {
      // Testni dogadjaj bi uz ovu zastavicu dodijelio pravo pravo pristupa (PAY-05).
      console.error(`[verify-naplata-secrets] deploy naplate ODBIJEN: ${TEST_MODE_SECRET} je postavljen na 1 (testni nacin) ili mu se vrijednost ne vidi.`);
      console.error('  U produkciji mora biti prazan. Za staging ponovi s: -- --dopusti-testni-nacin');
      process.exit(1);
    }
    console.log(
      `[verify-naplata-secrets] Supabase Edge secrets: sve tajne naplate su postavljene (${NAPLATA_SECRETS.length} od ${read.rows.length} u projektu).`,
    );
    if (deploy) {
      // Deploy ide TEK nakon zelenog preflighta i nikako drukcije: nema zastavice koja ga preskace.
      // Redoslijed je fiksan (NAPLATA_FUNCTIONS), a prvi pad prekida lanac.
      for (const fn of NAPLATA_FUNCTIONS) {
        console.log(`[verify-naplata-secrets] supabase functions deploy ${fn}`);
        const res = runSupabase(['functions', 'deploy', fn, ...projectRef], { stdio: 'inherit' });
        if (res.error || res.status !== 0) {
          console.error(`[verify-naplata-secrets] deploy funkcije ${fn} nije uspio (izlazni kod ${res.status}).`);
          process.exit(1);
        }
      }
      console.log(`[verify-naplata-secrets] deploy naplate gotov (${NAPLATA_FUNCTIONS.join(', ')}).`);
    }
  }
}

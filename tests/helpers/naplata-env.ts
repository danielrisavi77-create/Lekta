/**
 * Ciste funkcije nad IZVOROM Edge funkcija naplate, da se gard moze mutirati bez diranja diska.
 *
 * Porijeklo: master (2026-09-22/23, 4addb5db, 31b802ad, 81a89f2f, daf5f53a, 2f1621bf) ih je
 * uveo za prijasnjeg pruzatelja naplate. Pri spajanju mastera u design/pack3 (2026-09-26)
 * prenesene su na Stripe (F18): ista pitanja, Stripe imena tajni i dogadjaja.
 *
 * Deno ulaz (`index.ts`) se pod vitestom ne izvodi, pa je jedino sto se o njemu moze mjeriti ono
 * sto izvor DEKLARIRA: koja imena tajni cita. To je manje od "funkcija radi", i tako je i imenovano.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';

/**
 * Normalizira CRLF i usamljeni CR u LF (CLAUDE.md: "tekstualne usporedbe normaliziraju CR").
 *
 * Kvar koji ovo gasi (izmjereno 2026-09-23 u worktreeu s CRLF checkoutom, core.autocrlf=true):
 * testovi koji nad procitanim runbookom rade `text.replace('nesto\n', ...)` s doslovnim `\n` u
 * uzorku ne pogode redak koji na disku zavrsava s `\r\n`, pa `expect(mutated).not.toBe(izvor)`
 * pada iako je mutacija namjeravana. Isti izvor u LF checkoutu (i na CI-ju) prolazi, sto skriva
 * kvar dok se ne otvori radna kopija s drugom `core.autocrlf` postavkom.
 */
export function normalizeLf(text: string): string {
  return text.replace(/\r\n?/g, '\n');
}

/** Cita tekstualnu datoteku s diska i odmah normalizira CRLF u LF (vidi {@link normalizeLf}). */
export function readTextLf(path: string): string {
  return normalizeLf(readFileSync(path, 'utf8'));
}

/** Sva imena koja izvor cita kroz `Deno.env.get('IME')`. */
export function envNames(src: string): Set<string> {
  const out = new Set<string>();
  for (const m of src.matchAll(/Deno\.env\.get\(\s*['"]([A-Z0-9_]+)['"]\s*\)/g)) out.add(m[1]);
  return out;
}

/** Koje Stripe tajne koja funkcija naplate MORA citati (imena iz `.env.example` i runbooka). */
export const STRIPE_SECRETS_BY_FUNCTION: Readonly<Record<string, readonly string[]>> = Object.freeze({
  'create-checkout': Object.freeze(['STRIPE_SECRET_KEY', 'STRIPE_PUBLISHABLE_KEY']),
  'webhook-mor': Object.freeze(['STRIPE_WEBHOOK_SECRET', 'STRIPE_ALLOW_TEST_MODE']),
});

/**
 * Imena koja NIJEDNA funkcija naplate ne smije citati. `STRIPE_ACCOUNT_ID` je do kruga 3 spajanja
 * citao samo webhook-mor, pa su se checkout (vlastiti racun) i webhook (ocekivani povezani racun)
 * mogli razici oko identiteta racuna (Stripe ekvivalent masterova 4addb5db, drugi dio).
 */
export const FORBIDDEN_PAYMENT_ENV_NAMES: readonly string[] = Object.freeze(['STRIPE_ACCOUNT_ID']);

/**
 * Prefiksi imena tajni ukinutog pruzatelja naplate. Namjerna iznimka od pravila da testovi vise
 * ne spominju tog pruzatelja: ovo je popis ZABRANJENIH imena, dakle gard, ne upotreba.
 */
export const LEGACY_PAYMENT_ENV_PREFIXES: readonly string[] = Object.freeze(['LEMONSQUEEZY_', 'LS_', 'MOR_']);

/**
 * Nalazi o imenima tajni naplate (Stripe ekvivalent masterova gard-a 4addb5db).
 *
 * Kvar koji je master mjerio: dvije funkcije iste naplate citale su dvije razlicite tajne za istu
 * stvar, pa je operater postavio jednu i vjerovao da je naplata konfigurirana. Za Stripe se mjeri
 * isto nacelo: svaka funkcija cita tocno ono ime koje runbook i preflight imenuju, i nijedna vise
 * ne cita ime ukinutog pruzatelja (tajna koju nitko ne postavlja bila bi tiho prazna).
 */
export function stripeSecretNameProblems(sources: Readonly<Record<string, string>>): string[] {
  const problems: string[] = [];
  for (const [fn, expected] of Object.entries(STRIPE_SECRETS_BY_FUNCTION)) {
    const src = sources[fn];
    if (src === undefined) {
      problems.push(`${fn}: izvor nije predan`);
      continue;
    }
    const names = envNames(src);
    for (const name of expected) if (!names.has(name)) problems.push(`${fn}: ne cita ${name}`);
    for (const name of names) {
      if (LEGACY_PAYMENT_ENV_PREFIXES.some((p) => name.startsWith(p))) {
        problems.push(`${fn}: jos cita ime ukinutog pruzatelja ${name}`);
      }
      if (FORBIDDEN_PAYMENT_ENV_NAMES.includes(name)) {
        problems.push(`${fn}: cita ${name}, a racun se ne konfigurira (checkout i webhook bi se razisli)`);
      }
    }
  }
  return problems;
}

/**
 * Nalazi o PREFLIGHTU naplate, mjereni nad njegovim izvorom.
 *
 * Kvar koji se ovim gasi (nalaz pregleda 2026-09-23): preflight je citao `process.env`, dakle
 * ljusku operatera, dok tajne koje `webhook-mor` stvarno koristi zive u Supabase Edge Functions
 * Secretsima. Zeleno u ljusci nije dokaz o okolini deploya; operater s izvezenom varijablom dobio
 * bi prolaz iako je tajna u projektu prazna.
 */
export function preflightSourceProblems(src: string): string[] {
  const problems: string[] = [];
  if (!src.includes("['secrets', 'list'")) problems.push('preflight ne cita Supabase Edge secrets');
  // CLI se NE smije zvati golim imenom iz PATH-a: repo ga isporucuje kao devDependency, pa bi takav
  // poziv na cistom stroju uvijek padao istom greskom, i kad su tajne ispravne i kad su prazne
  // (izmjereno 2026-09-23: `'supabase' is not recognized`). Gard koji je uvijek crven iz razloga
  // koji ne mjeri nauci operatera da ga preskoci.
  if (/spawnSync\(\s*'supabase'/.test(src)) {
    problems.push('preflight zove goli `supabase` iz PATH-a umjesto CLI-ja iz node_modules/.bin');
  }
  if (!src.includes("node_modules', '.bin'")) {
    problems.push('preflight ne razrjesava Supabase CLI iz node_modules/.bin');
  }
  // Razlog pada mora razlikovati "CLI se ne moze pokrenuti" od "tajna je prazna". CLI poruku o
  // gresci pise i na stdout, pa citanje samo stderr-a daje "bez poruke".
  if (!/res\.stderr, res\.stdout/.test(src)) {
    problems.push('preflight cita samo stderr pa razlog pada ostaje neimenovan');
  }
  // UVJET svake grane koja rusi proces mora biti UPRAVO presuda, ne samo poziv presude negdje u
  // tekstu. Kvar koji se ovim gasi (nalaz pregleda nakon spajanja mastera, 2026-09-27; izmjereno):
  // `if (!zabranjene.ok) {` zamijenjen s `if (false) {`, ili `testModeEnvVerdict(process.env) && false`,
  // ostavljao je ovaj gard PRAZNIM, jer je trazio samo tekst poziva. Ovdje se pribija OBLIK
  // uvjeta; da grana stvarno obara proces (i da je presuda ispod nje ispravna) dokazuje tek
  // izvrseni gard {@link preflightExecutionProblems}.
  const deployPoziv = src.indexOf("'functions', 'deploy'");
  const prijeDeploya = (i: number): boolean => i >= 0 && (deployPoziv < 0 || i < deployPoziv);
  if (!prijeDeploya(src.search(/const verdict = supabaseSecretsVerdict\(read\.rows\);\s*if \(!verdict\.ok\) \{/))) {
    problems.push('preflight ne odbija nepotpune obavezne tajne prije deploya');
  }
  if (!/const verdict = naplataSecretsVerdict\(process\.env\);\s*if \(!verdict\.ok\) \{/.test(src)) {
    problems.push('--env grana preflighta ne odbija nepotpune obavezne tajne');
  }
  // Ukljucen testni nacin (`STRIPE_ALLOW_TEST_MODE=1`) mora oboriti deploy PRIJE deploya: uz njega
  // testni Stripe dogadjaj daje pravo pravo pristupa (PAY-05). Dodano pri prijenosu na Stripe.
  const testni = src.indexOf("if (testModeVerdict(read.rows) && !argv.includes('--dopusti-testni-nacin')) {");
  if (!prijeDeploya(testni)) {
    problems.push('preflight ne odbija ukljucen testni nacin prije deploya');
  }
  // Postavljen STRIPE_ACCOUNT_ID mora oboriti deploy PRIJE deploya (nalaz pregleda kruga 3):
  // nitko ga ne cita, a operater vjeruje da je Connect racun konfiguriran.
  const zabranjene = src.search(/const zabranjene = forbiddenSecretsVerdict\(read\.rows\);\s*if \(!zabranjene\.ok\) \{/);
  if (!prijeDeploya(zabranjene)) {
    problems.push('preflight ne odbija postavljenu zabranjenu tajnu (STRIPE_ACCOUNT_ID) prije deploya');
  }
  if (!/const zabranjene = forbiddenEnvVerdict\(process\.env\);\s*if \(!zabranjene\.ok\) \{/.test(src)) {
    problems.push('--env grana preflighta ne odbija postavljenu zabranjenu tajnu');
  }
  // I --env grana mora odbiti ukljucen testni nacin (Codex pregled kruga 3).
  if (!src.includes("if (testModeEnvVerdict(process.env) && !argv.includes('--dopusti-testni-nacin')) {")) {
    problems.push('--env grana preflighta ne odbija ukljucen testni nacin');
  }
  const envGate = src.indexOf("argv.includes('--env')");
  if (envGate < 0) {
    problems.push('preflight nema izricitu --env granu za lokalnu ljusku');
    return problems;
  }
  const zadano = src.slice(src.indexOf('} else {', envGate));
  if (zadano === '' || !zadano.includes('readSupabaseSecrets')) {
    problems.push('zadani put preflighta ne dohvaca Supabase secrets');
  }
  if (zadano.includes('process.env')) {
    problems.push('zadani put preflighta jos cita process.env (mjeri ljusku, ne okolinu deploya)');
  }
  return problems;
}

/** Tri obavezne tajne s prepoznatljivim (heksadecimalnim, nepraznim) digestom. */
const PUNI_POPIS: readonly string[] = Object.freeze([
  'STRIPE_SECRET_KEY | 11aa',
  'STRIPE_PUBLISHABLE_KEY | 22bb',
  'STRIPE_WEBHOOK_SECRET | 33cc',
]);

/** Iste tri tajne u lokalnoj ljusci (`--env`). */
const PUNA_LJUSKA: Readonly<Record<string, string>> = Object.freeze({
  STRIPE_SECRET_KEY: 'sk_lazni',
  STRIPE_PUBLISHABLE_KEY: 'pk_lazni',
  STRIPE_WEBHOOK_SECRET: 'whsec_lazni',
});

/**
 * Jedan izvrseni slucaj preflighta nad laznim Supabase CLI-jem.
 *
 * `popis` je doslovni izlaz `supabase secrets list` (tablica s okomitom crtom) koji lazni CLI
 * vraca; `null` znaci da slucaj ide kroz `--env` i CLI se ne smije ni pozvati.
 */
export interface PreflightSlucaj {
  id: string;
  args: readonly string[];
  popis: readonly string[] | null;
  ljuska: Readonly<Record<string, string>>;
  /** true: proces MORA izaci s kodom razlicitim od 0, bez ijednog deploya. */
  pada: boolean;
  /** Ime koje stderr mora imenovati kad proces pada (imenovan razlog, ne bilo koji pad). */
  razlog?: string;
}

/**
 * Slucajevi izvrsenog preflighta. Svaka grana koja rusi proces ima vlastiti slucaj, a dva cista
 * slucaja (`*-cisto`) dokazuju da lazni ulaz nije vakuum: ista okolina bez kvara prolazi, a
 * zadani put pritom stvarno deploya obje funkcije kroz lazni CLI.
 *
 * Digest `STRIPE_ALLOW_TEST_MODE=1` racuna se ovdje (SHA-256 niza `1`), ne uvozi iz skripte:
 * mutacija konstante u skripti inace bi pomaknula i ocekivanje.
 */
export const PREFLIGHT_SLUCAJEVI: readonly PreflightSlucaj[] = Object.freeze([
  { id: 'zadano-cisto', args: ['--deploy'], popis: PUNI_POPIS, ljuska: {}, pada: false },
  {
    id: 'zadano-zabranjena-tajna', args: ['--deploy'], popis: [...PUNI_POPIS, 'STRIPE_ACCOUNT_ID | 5f5e'],
    ljuska: {}, pada: true, razlog: 'STRIPE_ACCOUNT_ID',
  },
  {
    id: 'zadano-obavezna-bez-digesta', args: ['--deploy'],
    popis: ['STRIPE_SECRET_KEY | 11aa', 'STRIPE_PUBLISHABLE_KEY | 22bb', 'STRIPE_WEBHOOK_SECRET | '],
    ljuska: {}, pada: true, razlog: 'STRIPE_WEBHOOK_SECRET',
  },
  {
    id: 'zadano-testni-bez-digesta', args: ['--deploy'], popis: [...PUNI_POPIS, 'STRIPE_ALLOW_TEST_MODE | '],
    ljuska: {}, pada: true, razlog: 'STRIPE_ALLOW_TEST_MODE',
  },
  {
    id: 'zadano-testni-ukljucen', args: ['--deploy'],
    popis: [...PUNI_POPIS, `STRIPE_ALLOW_TEST_MODE | ${createHash('sha256').update('1').digest('hex')}`],
    ljuska: {}, pada: true, razlog: 'STRIPE_ALLOW_TEST_MODE',
  },
  // Isto bez `--deploy` (samostalna provjera, `npm run verify-naplata-secrets`): grana uvjetovana
  // zastavicom deploya (`&& deploy`) bila bi zelena bas u koraku kojim operater provjerava tajne.
  {
    id: 'provjera-zabranjena-tajna', args: [], popis: [...PUNI_POPIS, 'STRIPE_ACCOUNT_ID | 5f5e'],
    ljuska: {}, pada: true, razlog: 'STRIPE_ACCOUNT_ID',
  },
  {
    id: 'provjera-testni-ukljucen', args: [],
    popis: [...PUNI_POPIS, `STRIPE_ALLOW_TEST_MODE | ${createHash('sha256').update('1').digest('hex')}`],
    ljuska: {}, pada: true, razlog: 'STRIPE_ALLOW_TEST_MODE',
  },
  { id: 'env-cisto', args: ['--env'], popis: null, ljuska: PUNA_LJUSKA, pada: false },
  {
    id: 'env-zabranjena-tajna', args: ['--env'], popis: null,
    ljuska: { ...PUNA_LJUSKA, STRIPE_ACCOUNT_ID: 'acct_lazni' }, pada: true, razlog: 'STRIPE_ACCOUNT_ID',
  },
  {
    id: 'env-testni-ukljucen', args: ['--env'], popis: null,
    ljuska: { ...PUNA_LJUSKA, STRIPE_ALLOW_TEST_MODE: '1' }, pada: true, razlog: 'STRIPE_ALLOW_TEST_MODE',
  },
]);

/** Lazni Supabase CLI za Windows (`supabase.cmd`): biljezi poziv, na `secrets list` vraca popis. */
const LAZNI_CLI_CMD = [
  '@echo off',
  '>>"%LEKTA_LAZNI_DNEVNIK%" echo %*',
  'if /i "%~1"=="secrets" goto popis',
  'if /i "%~1"=="functions" exit /b 0',
  'exit /b 3',
  ':popis',
  'type "%LEKTA_LAZNI_POPIS%"',
  'exit /b 0',
  '',
].join('\r\n');

/** Isti lazni CLI za POSIX (`supabase`). */
const LAZNI_CLI_SH = [
  '#!/bin/sh',
  'echo "$*" >> "$LEKTA_LAZNI_DNEVNIK"',
  'case "$1" in',
  '  secrets) cat "$LEKTA_LAZNI_POPIS"; exit 0 ;;',
  '  functions) exit 0 ;;',
  'esac',
  'exit 3',
  '',
].join('\n');

/**
 * Okolina podprocesa: ljuska testa BEZ ijedne `STRIPE_*` varijable (inace bi operaterova ljuska
 * mijenjala ishod) i bez `SUPABASE_*` (npr. pristupni token; Codex pregled 2026-09-27), bez
 * `NODE_OPTIONS` (vitestovi hookovi nisu dio preflighta), uz direktorij laznog CLI-ja na pocetku
 * PATH-a, pa i pad natrag na goli `supabase` pogadja lazni CLI. Granica: ovo nije sandbox.
 * Mutirani izvor koji bi sam zvao pravi CLI apsolutnom putanjom mogao bi koristiti prijavu iz
 * korisnickog profila; mutacije pise ovaj repozitorij i nijedna to ne radi.
 */
function okolinaPodprocesa(binDir: string, dodatak: Readonly<Record<string, string>>): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [kljuc, vrijednost] of Object.entries(process.env)) {
    if (/^(STRIPE_|SUPABASE_)/i.test(kljuc) || /^NODE_OPTIONS$/i.test(kljuc)) continue;
    env[kljuc] = vrijednost;
  }
  const pathKljuc = Object.keys(env).find((k) => k.toUpperCase() === 'PATH') ?? 'PATH';
  env[pathKljuc] = `${binDir}${delimiter}${env[pathKljuc] ?? ''}`;
  return { ...env, ...dodatak };
}

/** Nalazi po (slucaj, izvor): isti slucaj nad istim izvorom izvodi se jednom po procesu testa. */
const izvrseniPreflight = new Map<string, readonly string[]>();

/** Izvedi jedan slucaj nad vec pripremljenim direktorijem i vrati njegove nalaze. */
function izvrsiSlucaj(korijen: string, binDir: string, skripta: string, slucaj: PreflightSlucaj): string[] {
  const problems: string[] = [];
  const oznaka = `[${slucaj.id}]`;
  const dnevnik = join(korijen, `dnevnik-${slucaj.id}.txt`);
  const popis = join(korijen, `popis-${slucaj.id}.txt`);
  writeFileSync(dnevnik, '', 'utf8');
  if (slucaj.popis) {
    const tablica = ['  NAME | DIGEST', '  -----|-------', ...slucaj.popis.map((r) => `  ${r}`)];
    writeFileSync(popis, `${tablica.join('\n')}\n`, 'utf8');
  }
  const res = spawnSync(process.execPath, [skripta, ...slucaj.args], {
    cwd: korijen,
    encoding: 'utf8',
    env: okolinaPodprocesa(binDir, {
      ...slucaj.ljuska,
      LEKTA_LAZNI_DNEVNIK: dnevnik,
      LEKTA_LAZNI_POPIS: popis,
    }),
    timeout: 30_000,
    windowsHide: true,
  });
  if (res.error) return [`${oznaka} podproces se nije pokrenuo: ${res.error.message}`];
  const pozivi = readFileSync(dnevnik, 'utf8').split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== '');
  const deployi = pozivi.filter((l) => l.startsWith('functions deploy'));
  const stderr = String(res.stderr ?? '');
  if (slucaj.popis && !pozivi.includes('secrets list')) {
    problems.push(`${oznaka} lazni CLI nije pitan za popis tajni (mjerena je druga okolina)`);
  }
  if (!slucaj.popis && pozivi.length > 0) {
    problems.push(`${oznaka} --env grana je zvala Supabase CLI (${pozivi.join('; ')})`);
  }
  if (slucaj.pada) {
    if (res.status === 0 || res.status === null) {
      problems.push(`${oznaka} preflight NIJE srusio proces (izlazni kod ${String(res.status)})`);
    } else if (slucaj.razlog && !stderr.includes(slucaj.razlog)) {
      problems.push(`${oznaka} preflight je pao bez imenovanog razloga ${slucaj.razlog}: ${stderr.slice(0, 200)}`);
    }
    if (deployi.length > 0) problems.push(`${oznaka} preflight je deployao unatoc odbijanju (${deployi.join('; ')})`);
    return problems;
  }
  if (res.status !== 0) {
    problems.push(`${oznaka} cista okolina nije prosla (izlazni kod ${String(res.status)}): ${stderr.slice(0, 300)}`);
  }
  if (slucaj.args.includes('--deploy')) {
    for (const fn of ['create-checkout', 'webhook-mor']) {
      if (!deployi.some((l) => l.split(/\s+/)[2] === fn)) {
        problems.push(`${oznaka} cista okolina nije deployala ${fn} kroz lazni CLI`);
      }
    }
  }
  return problems;
}

/**
 * Nalazi o PREFLIGHTU naplate, mjereni IZVRSAVANJEM predanog izvora u podprocesu.
 *
 * Kvar koji se ovim gasi (nalaz pregleda nakon spajanja mastera, 2026-09-27): {@link
 * preflightSourceProblems} gleda tekst, pa nije vidio ni ugasenu granu (`if (false) {`) ni
 * pokvarenu presudu ispod nje (npr. `supabaseSecretsVerdict` bez razloga `nepoznata`). Ovdje se
 * predani izvor zapise u privremeni direktorij kao `scripts/verify-naplata-secrets.mjs`, uz lazni
 * Supabase CLI u `node_modules/.bin`, i za svaki {@link PREFLIGHT_SLUCAJEVI} pokrene pravim
 * `node`-om. Tvrdi se ono sto operater vidi: izlazni kod, imenovan razlog u stderr-u, i to da se
 * pri odbijanju nijedna funkcija nije deployala (lazni CLI biljezi svaki poziv).
 *
 * Mutacija se radi nad TEKSTOM u memoriji; disk repozitorija se ne dira. `slucajevi` suzava mjerenje
 * na imenovane slucajeve (jedan podproces traje oko pola sekunde do sekunde, a mutacija gasi jednu
 * granu); bez njega se izvode svi. Nalaz se pamti po slucaju i izvoru, pa isti slucaj nad istim
 * izvorom u vise garda ne pokrece proces ponovno.
 *
 * Granica tvrdnje: pravi Supabase CLI i zivi projekt se ovdje ne pokrecu. Dokazuje se da skripta
 * na zadani ulaz CLI-ja reagira ispravno, ne da pravi CLI daje taj ulaz.
 */
export function preflightExecutionProblems(
  src: string,
  slucajevi: readonly string[] = PREFLIGHT_SLUCAJEVI.map((s) => s.id),
): string[] {
  const problems: string[] = [];
  const odabrani = PREFLIGHT_SLUCAJEVI.filter((s) => slucajevi.includes(s.id));
  for (const id of slucajevi) {
    if (!odabrani.some((s) => s.id === id)) problems.push(`[${id}] nepoznat slucaj preflighta`);
  }
  if (odabrani.length === 0) problems.push('nijedan slucaj preflighta nije izveden (nema sto mjeriti)');
  const kljuc = (id: string): string => JSON.stringify([id, src]);
  const neizvedeni = odabrani.filter((s) => !izvrseniPreflight.has(kljuc(s.id)));
  if (neizvedeni.length > 0) {
    const korijen = realpathSync(mkdtempSync(join(tmpdir(), 'lekta-preflight-')));
    try {
      const binDir = join(korijen, 'node_modules', '.bin');
      mkdirSync(join(korijen, 'scripts'), { recursive: true });
      mkdirSync(binDir, { recursive: true });
      const skripta = join(korijen, 'scripts', 'verify-naplata-secrets.mjs');
      writeFileSync(skripta, src, 'utf8');
      writeFileSync(join(binDir, 'supabase.cmd'), LAZNI_CLI_CMD, 'utf8');
      writeFileSync(join(binDir, 'supabase'), LAZNI_CLI_SH, 'utf8');
      chmodSync(join(binDir, 'supabase'), 0o755);
      for (const slucaj of neizvedeni) {
        izvrseniPreflight.set(kljuc(slucaj.id), Object.freeze(izvrsiSlucaj(korijen, binDir, skripta, slucaj)));
      }
    } finally {
      rmSync(korijen, { recursive: true, force: true });
    }
  }
  for (const slucaj of odabrani) problems.push(...(izvrseniPreflight.get(kljuc(slucaj.id)) ?? []));
  return problems;
}

/** Odluka koju `classifyStripeEvent` donosi; uzi potpis od pravog tipa, da se moze mutirati. */
type KlasifikatorUlaz = {
  eventName: string;
  status: string;
  amountReceivedCents: number | null;
  refunded: boolean;
  userId: string;
};
type Klasifikator = (ev: KlasifikatorUlaz) => { kind: string; reason?: string };

/**
 * Nalazi o KLASIFIKATORU uplate (Stripe ekvivalent masterova 31b802ad: "obradi samo placenu
 * narudzbu"). Prima funkciju, pa se mutacija radi zamjenom funkcije, ne teksta izvora.
 *
 * Kvar koji se ovim gasi: `payment_intent.succeeded` tretiran kao placen samo po IMENU, bez
 * gledanja na `status` i `amount_received` objekta. Dogadjaj koji se zove kao uplata, a naplatu ne
 * potvrdjuje, dobio bi puno pravo pristupa.
 *
 * Drugi kvar (masterov `needs_manual_link`, 31b802ad i 81a89f2f): potvrdjena naplata bez
 * `user_id` utopljena u `ignored`, dakle u isti WARN kanal kao konfiguracijski sum. Mora biti
 * vlastita vrsta `needs_manual_link`.
 */
export function paidClassificationProblems(classify: Klasifikator): string[] {
  const problems: string[] = [];
  const base = {
    eventName: 'payment_intent.succeeded',
    status: 'succeeded',
    amountReceivedCents: 999,
    refunded: false,
    userId: 'user-1',
  };
  if (classify(base).kind !== 'paid') problems.push('placen payment_intent.succeeded nije prepoznat kao paid');
  if (classify({ ...base, status: 'SUCCEEDED' }).kind !== 'paid') {
    problems.push('status SUCCEEDED velikim slovom nije prepoznat kao placeno');
  }
  for (const status of ['processing', 'requires_payment_method', '']) {
    if (classify({ ...base, status }).kind === 'paid') {
      problems.push(`payment_intent.succeeded sa statusom "${status}" knjizi pravo bez potvrdjene naplate`);
    }
  }
  for (const amountReceivedCents of [0, null]) {
    if (classify({ ...base, amountReceivedCents }).kind === 'paid') {
      problems.push(`payment_intent.succeeded s amount_received ${String(amountReceivedCents)} knjizi pravo`);
    }
  }
  for (const userId of ['', '   ']) {
    const kind = classify({ ...base, userId }).kind;
    if (kind !== 'needs_manual_link') {
      problems.push(`potvrdjena naplata bez user_id ("${userId}") je ${kind}, a ne needs_manual_link`);
    }
  }
  // Nepotvrdjena naplata bez korisnika ostaje ignored: needs_manual_link je samo za stvaran novac.
  if (classify({ ...base, userId: '', status: 'processing' }).kind !== 'ignored') {
    problems.push('nepotvrdjena naplata bez user_id nije ignored');
  }
  return problems;
}

/**
 * Nalazi o KLASIFIKATORU povrata. Prima funkciju, pa se mutacija radi zamjenom funkcije, ne
 * zamjenom teksta izvora.
 *
 * Kvar koji se ovim gasi (nalaz pregleda na masteru 2026-09-23, daf5f53a): povrat prepoznat po
 * ZASTAVICI `ev.refunded` umjesto po imenu dogadjaja. `parseStripeEvent` tu zastavicu postavlja i
 * za Refund objekt pod drugim imenom (`refund.created`, isRefundBearing), a refund grana handlera pise
 * `update entitlements ... where order_id = ev.orderId` i povlaci referral nagrade po istom id-u.
 * Samo kod `charge.refunded` je `orderId` sigurno PaymentIntent povrata (`charge.payment_intent`).
 *
 * Zato: refund SAMO iz `charge.refunded`. Vracen novac pod drugim imenom nije tiho odbacen nego
 * `ignored` s razlogom `povrat_bez_charge_refunded:*`, koji mora biti medju `notable` prefiksima
 * (ERROR u logu i vlastiti redak u runbooku).
 */
export function refundClassificationProblems(classify: Klasifikator, notablePrefixes: readonly string[] = []): string[] {
  const problems: string[] = [];
  // Povrat po imenu, bez obzira na status i na zastavicu, i bez user_id (povrat ide po PaymentIntentu).
  for (const status of ['succeeded', '', 'failed']) {
    const out = classify({ eventName: 'charge.refunded', status, amountReceivedCents: null, refunded: true, userId: '' });
    if (out.kind !== 'refund') problems.push(`charge.refunded sa statusom "${status}" nije prepoznat kao povrat`);
  }
  // Tudje ime sa zastavicom povrata NE SMIJE upasti u refund granu.
  for (const eventName of ['payment_intent.succeeded', 'charge.updated', 'refund.created', 'nesto.novo.od.providera']) {
    const out = classify({ eventName, status: 'succeeded', amountReceivedCents: 999, refunded: true, userId: 'user-1' });
    if (out.kind === 'refund') {
      problems.push(`dogadjaj ${eventName} je usao u refund granu iako nije charge.refunded`);
      continue;
    }
    // Uplata sa zastavicom je i dalje uplata po imenu (nije povrat, nije tihi ignored).
    if (eventName === 'payment_intent.succeeded') continue;
    if (out.kind !== 'ignored') {
      problems.push(`dogadjaj ${eventName} sa zastavicom povrata nije ignored nego ${out.kind}`);
      continue;
    }
    // Ignoriran, ali ne tiho: razlog mora biti medju onima koji se logiraju na ERROR razini.
    const reason = String(out.reason ?? '');
    if (notablePrefixes.length > 0 && !notablePrefixes.some((prefix) => reason.startsWith(prefix))) {
      problems.push(`povrat pod imenom ${eventName} je ignoriran TIHO (razlog "${reason}" nije notable)`);
    }
  }
  return problems;
}

/** Minimalni oblik Stripe payloada koji ovaj gard salje kroz parser. */
type PovratPayload = {
  type: string;
  livemode: boolean;
  data: {
    object: {
      id?: string;
      object?: string;
      payment_intent?: string;
      amount?: number;
      amount_refunded?: number;
      refunded?: boolean;
      status?: string;
    };
  };
};

/**
 * DOHVATLJIVOST grane povrata pod drugim imenom, mjerena kroz STVARNI lanac odluka handlera:
 * parser, pa gate porijekla, pa klasifikator (nalaz pregleda kruga 2 pri spajanju, 2026-09-26).
 *
 * Kvar koji se ovim gasi: `refundClassificationProblems` je zelen nad izoliranim klasifikatorom,
 * a gate (`acceptEvent`) je vrste izvan `STRIPE_HANDLED_EVENTS` odbijao PRIJE njega. Grana
 * `povrat_bez_charge_refunded:` tako nije mogla nastati ni za jedan dogadjaj koji handler primi, pa
 * je test bio zelen vakuumski. Ovdje se svaka od tri funkcije predaje, pa se mutacija radi zamjenom
 * funkcije (npr. gate koji opet filtrira vrstu), ne teksta izvora.
 */
export function refundReachabilityProblems(
  parse: (payload: PovratPayload) => KlasifikatorUlaz & { livemode: boolean | null; accountId: string },
  accept: (
    ev: { livemode: boolean | null; accountId: string; eventName: string },
    opts: { allowTestMode: boolean },
  ) => { ok: boolean },
  classify: Klasifikator,
  notablePrefixes: readonly string[],
): string[] {
  const problems: string[] = [];
  const slucajevi: PovratPayload[] = [
    { type: 'refund.created', livemode: true, data: { object: { id: 're_1', object: 'refund', payment_intent: 'pi_1', amount: 999, status: 'succeeded' } } },
    { type: 'refund.updated', livemode: true, data: { object: { id: 're_1', object: 'refund', payment_intent: 'pi_1', amount: 999, status: 'succeeded' } } },
    { type: 'charge.refund.updated', livemode: true, data: { object: { id: 're_1', object: 'refund', payment_intent: 'pi_1', amount: 999 } } },
  ];
  for (const payload of slucajevi) {
    const ev = parse(payload);
    if (!ev.refunded) {
      problems.push(`parser ne vidi vracen novac u ${payload.type}`);
      continue;
    }
    if (!accept(ev, { allowTestMode: false }).ok) {
      problems.push(`gate odbija ${payload.type} prije klasifikatora, pa povrat pod drugim imenom nikad nije glasan`);
      continue;
    }
    const out = classify(ev);
    const reason = String(out.reason ?? '');
    if (out.kind === 'refund') {
      problems.push(`${payload.type} je usao u refund granu iako nije charge.refunded`);
    } else if (out.kind !== 'ignored' || !notablePrefixes.some((prefix) => reason.startsWith(prefix))) {
      problems.push(`${payload.type} nije glasan ignored (kind ${out.kind}, razlog "${reason}")`);
    }
  }
  // Vrsta bez vracenog novca je konfiguracijski sum, ne ERROR: inace bi ERROR kanal oglusio.
  // Ukljucuje propao povrat i Charge s trajnim tragom starog povrata (Codex pregled kruga 2).
  const sumovi: PovratPayload[] = [
    { type: 'customer.created', livemode: true, data: { object: { id: 'cus_1', object: 'customer' } } },
    { type: 'refund.failed', livemode: true, data: { object: { id: 're_1', object: 'refund', payment_intent: 'pi_1', amount: 999, status: 'failed' } } },
    { type: 'charge.updated', livemode: true, data: { object: { id: 'ch_1', object: 'charge', payment_intent: 'pi_1', amount: 999, amount_refunded: 999, refunded: true } } },
  ];
  for (const payload of sumovi) {
    const out = classify(parse(payload));
    if (out.kind !== 'ignored' || notablePrefixes.some((prefix) => String(out.reason ?? '').startsWith(prefix))) {
      problems.push(`${payload.type} bez vracenog novca je glasan kao povrat ili nije ignored`);
    }
  }
  return problems;
}

/** Svi ishodi koje handler upisuje u `webhook_events.outcome`, izvedeni iz izvora. */
export function handlerOutcomes(src: string): string[] {
  const out = new Set<string>();
  for (const m of src.matchAll(/settle\(\s*'([a-z_]+)'/g)) out.add(m[1]);
  return [...out].sort();
}

/**
 * Nalazi o RUNBOOKU naplate (`docs/GO_LIVE_NAPLATA.md`).
 *
 * Dva kvara koja se ovim gase (nalaz pregleda na masteru 2026-09-23, preneseno na Stripe):
 *  1. Runbook ne imenuje koje dogadjaje treba pretplatiti. Handler obradjuje tocno
 *     `payment_intent.succeeded` i `charge.refunded`, pa operater koji pretplati samo prvi dobije
 *     naplatu koja radi i povrate koji se nikad ne obrade.
 *  2. Ishodi `ignored` i `refused` traze ljudsku radnju, a nisu u djelomicnom indeksu
 *     `webhook_events_unresolved`; bez retka u runbooku nitko ih nema po cemu naci.
 */
export function naplataRunbookProblems(
  runbook: string,
  outcomes: readonly string[],
  detailPrefixes: readonly string[] = [],
): string[] {
  const problems: string[] = [];
  for (const event of ['payment_intent.succeeded', 'charge.refunded']) {
    if (!runbook.includes(`\`${event}\``)) problems.push(`runbook ne imenuje dogadjaj ${event} za pretplatu`);
  }
  for (const outcome of outcomes) {
    if (!runbook.includes(`\`${outcome}\``)) problems.push(`runbook ne opisuje ishod ${outcome} iz webhook_events`);
  }
  // Ishod `ignored` pokriva vise razlicitih razloga, a dva od njih traze razlicitu radnju. Ime
  // ishoda zato nije dovoljno: runbook mora imenovati svaki prefiks koji klasifikator moze upisati
  // u `outcome_detail`.
  for (const prefix of detailPrefixes) {
    if (!runbook.includes(`\`${prefix}\``)) {
      problems.push(`runbook ne opisuje razlog ${prefix} iz webhook_events.outcome_detail`);
    }
  }
  if (!runbook.includes('webhook_events_unresolved')) {
    problems.push('runbook ne spominje da djelomicni indeks webhook_events_unresolved ne pokriva nove ishode');
  }
  if (!/from webhook_events/i.test(runbook)) {
    problems.push('runbook nema upit kojim se neobradjeni dogadjaji nalaze');
  }
  return problems;
}

/** SQL kljucne rijeci i funkcije koje se u upitima pojavljuju, a nisu imena stupaca. */
const SQL_RIJECI = new Set([
  'select', 'from', 'where', 'order', 'by', 'group', 'having', 'limit', 'offset', 'asc', 'desc',
  'and', 'or', 'not', 'in', 'is', 'null', 'as', 'on', 'join', 'left', 'right', 'inner', 'outer',
  'update', 'set', 'insert', 'into', 'values', 'delete', 'distinct', 'case', 'when', 'then', 'else',
  'end', 'exists', 'between', 'like', 'ilike', 'count', 'sum', 'min', 'max', 'coalesce', 'now',
  'interval', 'true', 'false', 'returning', 'with', 'using', 'all', 'any', 'public',
]);

/**
 * Imena stupaca tablice `webhook_events`, procitana iz migracije koja ju stvara.
 *
 * Izvod, ne prepisan popis: kad se tablici doda stupac, gard ga vidi bez diranja testa.
 */
export function webhookEventsColumns(migrationSql: string): string[] {
  const start = migrationSql.search(/create table if not exists public\.webhook_events\s*\(/i);
  if (start < 0) return [];
  const open = migrationSql.indexOf('(', start);
  let depth = 0;
  let end = -1;
  for (let i = open; i < migrationSql.length; i += 1) {
    if (migrationSql[i] === '(') depth += 1;
    else if (migrationSql[i] === ')') {
      depth -= 1;
      if (depth === 0) { end = i; break; }
    }
  }
  if (end < 0) return [];
  const body = migrationSql.slice(open + 1, end);
  const columns: string[] = [];
  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.replace(/--.*$/, '').trim();
    const m = /^([a-z_][a-z0-9_]*)\s+[a-z]/i.exec(line);
    if (m && !SQL_RIJECI.has(m[1].toLowerCase())) columns.push(m[1]);
  }
  return columns;
}

/**
 * Nalazi o SQL UPITIMA u runbooku: imena stupaca moraju postojati u tablici.
 *
 * Kvar koji se ovim gasi (nalaz pregleda 2026-09-23): oba upita u sekciji 5.1 citala su i sortirala
 * po `created_at`, stupcu kojeg `webhook_events` nema (migracija 0092 ima `received_at`). Bas ti
 * upiti su jedini dokumentirani nacin da se nadju redci s ishodom `ignored`, jer ih
 * djelomicni indeks `webhook_events_unresolved` namjerno ne pokriva. Operater bi umjesto popisa
 * placenih narudzbi bez prava pristupa dobio `ERROR: column "created_at" does not exist`.
 *
 * Postojeci gard to nije mogao vidjeti: trazio je samo da se niz `from webhook_events` negdje
 * pojavi, dakle POSTOJANJE upita, ne njegovu valjanost.
 *
 * Granica tvrdnje: ovo nije SQL parser. Mjeri se samo da svaki goli identifikator u upitu nad
 * `webhook_events` bude ili stupac te tablice, ili SQL rijec, ili alias uveden s `as`. Tocnost
 * semantike upita (vraca li ono sto treba) ostaje neprovjerena.
 */
export function runbookSqlColumnProblems(runbook: string, migrationSql: string): string[] {
  const columns = new Set(webhookEventsColumns(migrationSql));
  if (columns.size === 0) return ['migracija webhook_events se ne moze procitati (izvod stupaca je prazan)'];

  // Ogradjeni blokovi prvo, pa se IZ TEKSTA maknu: inace bi parovi obicnih navodnika presli preko
  // ograde i spojili prozu u lazan "upit".
  const blocks: string[] = [];
  let proza = runbook;
  for (const m of runbook.matchAll(/```[a-z]*\r?\n([\s\S]*?)```/g)) {
    blocks.push(m[1]);
    proza = proza.replace(m[0], '\n');
  }
  // Upit napisan u redu teksta (npr. korak zatvaranja traga), unutar jednog para navodnika.
  for (const m of proza.matchAll(/`([^`]+)`/g)) blocks.push(m[1]);

  const problems: string[] = [];
  let mjereno = 0;
  for (const block of blocks) {
    if (!/\bwebhook_events\b/.test(block)) continue;
    if (!/\b(select|update|delete|insert)\b/i.test(block)) continue;
    mjereno += 1;
    const ocisceno = block
      .replace(/--[^\r\n]*/g, ' ') // SQL komentari nisu upit
      .replace(/'[^']*'/g, ' ') // znakovni nizovi
      .replace(/<[^>]*>/g, ' '); // mjesta za popunjavanje, npr. <id>
    const aliasi = new Set<string>();
    for (const m of ocisceno.matchAll(/\bas\s+([a-z_][a-z0-9_]*)/gi)) aliasi.add(m[1].toLowerCase());
    for (const m of ocisceno.matchAll(/[a-z_][a-z0-9_]*/gi)) {
      const ime = m[0].toLowerCase();
      if (ime === 'webhook_events' || SQL_RIJECI.has(ime) || aliasi.has(ime)) continue;
      if (columns.has(ime)) continue;
      problems.push(`upit nad webhook_events koristi "${ime}", a taj stupac tablica nema`);
    }
  }
  if (mjereno === 0) problems.push('runbook nema nijedan SQL upit nad webhook_events (nema sto mjeriti)');
  return [...new Set(problems)];
}

/**
 * Sva imena log redaka `webhook-mor <ime>` koje izvor Edge funkcije stvarno ispisuje
 * (`console.error`/`console.warn`), izvedena iz izvora, ne popisana rucno.
 */
export function webhookMorLogNames(src: string): Set<string> {
  const out = new Set<string>();
  for (const m of src.matchAll(/console\.(?:error|warn)\(\s*'webhook-mor ([a-z_]+)'/g)) out.add(m[1]);
  return out;
}

/**
 * Nalazi o IMENIMA LOG REDAKA u runbooku (nalaz pregleda 2026-09-23): runbook je spominjao
 * `webhook-mor ignored_unpaid_order`, redak koji izvor nikad nije ispisao (stvarno ime je
 * `ignored_needs_attention`). Tko bi taj redak trazio u logu (npr. grepom) ne bi nasao nista i
 * zakljucio da se ignorirane narudzbe uopce ne dogadjaju.
 */
export function runbookLogNameProblems(runbook: string, logNames: ReadonlySet<string>): string[] {
  const problems: string[] = [];
  const spomenuta = new Set<string>();
  for (const m of runbook.matchAll(/`webhook-mor ([a-z_]+)`/g)) spomenuta.add(m[1]);
  if (spomenuta.size === 0) problems.push('runbook ne spominje nijedno ime log retka webhook-mor (nema sto mjeriti)');
  for (const ime of spomenuta) {
    if (!logNames.has(ime)) problems.push(`runbook spominje webhook-mor ${ime}, a izvor taj redak ne ispisuje`);
  }
  return problems;
}

/**
 * Oznake punog povrata (`REFUND_MARKERS`) procitane iz izvora `webhook-mor/handler.ts`, ne
 * prepisane: kad handler doda oznaku, runbook koji je ne navodi postane crven bez diranja testa.
 */
export function handlerRefundMarkers(handlerSrc: string): string[] {
  const m = /const REFUND_MARKERS\s*=\s*\[([^\]]*)\]/.exec(handlerSrc);
  if (!m) return [];
  return [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]);
}

/** Svi popisi `outcome_detail in (...)` u SQL tekstu, kao nizovi vrijednosti. */
function outcomeDetailInPopisi(sql: string): string[][] {
  return [...sql.matchAll(/outcome_detail\s+in\s*\(([^)]*)\)/gi)].map((m) => [...m[1].matchAll(/'([^']*)'/g)].map((x) => x[1]));
}

/**
 * Nalazi o RUCNOM VEZIVANJU u runbooku (odjeljak 5.1): prije upisa prava mora se provjeriti je li
 * isti PaymentIntent vec vracen.
 *
 * Kvar koji se ovim gasi (nalaz pregleda nakon spajanja mastera, 2026-09-27): uplata bez
 * `user_id` (`needs_manual_link`) nema pravo, pa puni povrat za nju zavrsi kao
 * `refund_without_entitlement`. Runbook je operatera vodio ravno na `insert into entitlements`,
 * a upit "uplate koje cekaju rucno vezivanje" nije iskljucivao vracene uplate: pravo bi bilo
 * upisano za vracen novac i nitko ga vise ne bi ugasio.
 *
 * Mjeri se: (1) ogradjeni SQL blok s `from webhook_events`, `order_id = '<order_id>'` i
 * `outcome_detail in (...)` s TOCNO oznakama iz handlera stoji PRIJE bloka s `insert into
 * entitlements`; (2) upit nad uplatama koje cekaju (`needs_manual_link` i
 * `payment_intent.succeeded`) ima `not exists` s istim popisom; (3) nijedan popis u runbooku koji
 * sadrzi neku oznaku ne odstupa od skupa oznaka iz handlera.
 *
 * Granica tvrdnje: nije SQL parser. Da upit vraca tocno ono sto treba nad zivom bazom nije
 * provjereno; stupci se provjeravaju zasebno ({@link runbookSqlColumnProblems}).
 */
export function runbookRefundCheckProblems(runbook: string, handlerSrc: string): string[] {
  const oznake = handlerRefundMarkers(handlerSrc);
  if (oznake.length === 0) return ['REFUND_MARKERS se ne mogu procitati iz handlera (nema sto mjeriti)'];
  const istiSkup = (popis: readonly string[]): boolean =>
    new Set(popis).size === oznake.length && oznake.every((o) => popis.includes(o));
  const blokovi = [...runbook.matchAll(/```[a-z]*\r?\n([\s\S]*?)```/g)].map((m) => ({ index: m.index ?? 0, sql: m[1] }));
  const provjeravaPovrat = (sql: string): boolean =>
    /\bfrom webhook_events\b/i.test(sql) && outcomeDetailInPopisi(sql).some(istiSkup);

  const problems: string[] = [];
  const upis = blokovi.find((b) => /insert into entitlements/i.test(b.sql));
  if (!upis) {
    problems.push('runbook nema upis prava za rucno vezivanje (nema sto mjeriti)');
  } else if (
    !blokovi.some((b) => b.index < upis.index && provjeravaPovrat(b.sql) && /order_id\s*=\s*'<order_id>'/.test(b.sql))
  ) {
    problems.push('rucno vezivanje upisuje pravo bez prethodne provjere povrata istog PaymentIntenta (REFUND_MARKERS)');
  }
  const cekaju = blokovi.filter(
    (b) => /'needs_manual_link'/.test(b.sql) && /event_name\s*=\s*'payment_intent\.succeeded'/.test(b.sql),
  );
  if (cekaju.length === 0) {
    problems.push('runbook nema upit uplata koje cekaju rucno vezivanje (nema sto mjeriti)');
  } else if (!cekaju.every((b) => /\bnot exists\s*\(/i.test(b.sql) && provjeravaPovrat(b.sql))) {
    problems.push('upit uplata koje cekaju rucno vezivanje ne iskljucuje uplate ciji je PaymentIntent vracen');
  }
  for (const b of blokovi) {
    for (const popis of outcomeDetailInPopisi(b.sql)) {
      if (popis.some((v) => oznake.includes(v)) && !istiSkup(popis)) {
        problems.push(`popis oznaka povrata u runbooku (${popis.join(', ')}) nije REFUND_MARKERS iz handlera (${oznake.join(', ')})`);
      }
    }
  }
  return problems;
}

/** Koliko je upita nad `webhook_events` gard stvarno izmjerio; stiti baseline od vakuuma. */
export function runbookSqlQueryCount(runbook: string): number {
  let n = 0;
  let proza = runbook;
  for (const m of runbook.matchAll(/```[a-z]*\r?\n([\s\S]*?)```/g)) {
    proza = proza.replace(m[0], '\n');
    if (/\bwebhook_events\b/.test(m[1]) && /\b(select|update|delete|insert)\b/i.test(m[1])) n += 1;
  }
  for (const m of proza.matchAll(/`([^`]+)`/g)) {
    if (/\bwebhook_events\b/.test(m[1]) && /\b(select|update|delete|insert)\b/i.test(m[1])) n += 1;
  }
  return n;
}

/**
 * Nalazi o PUTU DEPLOYA naplate.
 *
 * Kvar koji se ovim gasi (nalaz pregleda 2026-09-23): preflight je postojao, ali ga nije dosezao
 * nijedan automatski put. `npm run check` ga ne vidi (trazi zivi CLI i povezan projekt),
 * `release:check` ne zna za naplatu, pa je jedina obrana od prazne tajne bila da se operater sjeti
 * pokrenuti skriptu iz runbooka. Tko preskoci taj redak deploya `webhook-mor` s praznim
 * `STRIPE_WEBHOOK_SECRET`, a `verifyStripeSignature` je fail-closed: svaki dogadjaj dobije
 * `missing_secret`.
 *
 * Lijek koji se ovdje mjeri: deploy naplate je JEDNA naredba koja preflight nosi u sebi, i runbook
 * goli `supabase functions deploy` za te dvije funkcije vise ne nudi.
 */
export function naplataDeployPathProblems(
  runbook: string,
  packageJson: { scripts?: Record<string, string> },
  preflightSrc: string,
): string[] {
  const problems: string[] = [];
  const script = packageJson.scripts?.['deploy:naplata'] ?? '';
  if (!script.includes('verify-naplata-secrets.mjs')) {
    problems.push('npm skripta deploy:naplata ne ide kroz preflight verify-naplata-secrets.mjs');
  }
  if (!script.includes('--deploy')) problems.push('npm skripta deploy:naplata ne predaje --deploy');
  if (!runbook.includes('npm run deploy:naplata')) {
    problems.push('runbook ne upucuje na npm run deploy:naplata kao put deploya naplate');
  }
  for (const fn of ['webhook-mor', 'create-checkout']) {
    if (runbook.includes(`supabase functions deploy ${fn}`)) {
      problems.push(`runbook jos nudi goli supabase functions deploy ${fn}, koji zaobilazi preflight`);
    }
  }
  // Deploy u skripti smije poceti TEK nakon presude o tajnama; inace bi lanac bio samo kozmeticki.
  const verdict = preflightSrc.indexOf('const verdict = supabaseSecretsVerdict(read.rows);');
  const deployCall = preflightSrc.indexOf("'functions', 'deploy'");
  if (verdict < 0 || deployCall < 0 || deployCall < verdict) {
    problems.push('preflight ne deploya tek nakon presude o tajnama');
  }
  if (/--(skip|no)-preflight/.test(preflightSrc)) {
    problems.push('preflight ima zastavicu za preskakanje, pa put deploya moze zaobici provjeru');
  }
  return problems;
}

/** Gate porijekla kakav `acceptEvent` jest; uzi potpis, da se mutacija radi zamjenom funkcije. */
type GatePorijekla = (
  ev: { livemode: boolean | null; accountId: string; eventName: string },
  opts: { allowTestMode: boolean },
) => { ok: boolean; reason?: string };

/**
 * ISTI RACUN U OBJE FUNKCIJE NAPLATE (Stripe ekvivalent drugog dijela masterova 4addb5db; nalaz
 * pregleda kruga 3 spajanja, 2026-09-27).
 *
 * `create-checkout` PaymentIntent stvara na vlastitom racunu kljuca (bez `Stripe-Account`), pa
 * njegovi dogadjaji NE nose polje `account`. Gate mora (1) takav dogadjaj prihvatiti, jer inace nijedna
 * kupnja ne dobije pravo, i (2) odbiti svaki dogadjaj s povezanim racunom, jer ga nas checkout nije
 * mogao stvoriti. Kvar koji ovo gasi: gate koji uz postavljen `STRIPE_ACCOUNT_ID` odbija nase
 * dogadjaje (1), ili bez njega pusti tudji povezani racun (2).
 */
export function accountIdentityProblems(accept: GatePorijekla): string[] {
  const problems: string[] = [];
  const nas = { livemode: true, accountId: '', eventName: 'payment_intent.succeeded' };
  if (!accept(nas, { allowTestMode: false }).ok) {
    problems.push('gate odbija dogadjaj bez polja account, a upravo takve salje PaymentIntent iz naseg checkouta');
  }
  for (const accountId of ['acct_tudji', 'acct_1Nas', ' ']) {
    for (const eventName of ['payment_intent.succeeded', 'charge.refunded']) {
      const out = accept({ ...nas, accountId, eventName }, { allowTestMode: false });
      if (out.ok) problems.push(`gate prihvaca ${eventName} s povezanim racunom "${accountId}"`);
      else if (out.reason !== 'account_mismatch') {
        problems.push(`gate odbija povezani racun "${accountId}" s razlogom ${String(out.reason)}, ne account_mismatch`);
      }
    }
  }
  return problems;
}

/** Zaglavlja i parametri kojima bi checkout PaymentIntent stvorio na POVEZANOM racunu. */
export const CONNECT_MARKERS: readonly string[] = Object.freeze([
  'stripe-account',
  'on_behalf_of',
  'transfer_data',
  'application_fee_amount',
]);

/**
 * Nalazi o STVARNO POSLANOM Stripe pozivu checkouta: nosi li ijedan trag povezanog racuna.
 * Prima zaglavlja i tijelo iz izvrsenog handlera (tests/naplata-racun.test.ts), ne izvor.
 */
export function checkoutAccountScopeProblems(call: { headers: Record<string, string>; body: string }): string[] {
  const problems: string[] = [];
  for (const header of Object.keys(call.headers ?? {})) {
    if (CONNECT_MARKERS.includes(header.toLowerCase())) problems.push(`checkout salje zaglavlje ${header}`);
  }
  const keys = [...new URLSearchParams(call.body ?? '').keys()];
  for (const marker of CONNECT_MARKERS) {
    if (keys.some((k) => k === marker || k.startsWith(`${marker}[`))) problems.push(`checkout salje parametar ${marker}`);
  }
  return problems;
}

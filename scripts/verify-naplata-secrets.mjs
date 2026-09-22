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
// Prazna vrijednost je najgori oblik kvara jer je fail-closed tiho: `acceptEvent` odbija sve
// dogadjaje i vraca 200, pa ni provider ne retryja. Zato ovdje nema "upozorenja": izlazni kod je 1
// i poruka IMENUJE svaku tajnu koja nedostaje.
//
// Pokretanje prije `supabase functions deploy` (vidi docs/GO_LIVE_NAPLATA.md):
//   node scripts/verify-naplata-secrets.mjs
// ili `npm run verify-naplata-secrets`. Vrijednosti se citaju iz okoline, nikad iz repozitorija;
// skripta ih ne ispisuje, samo imena.
//
// Odluka je CISTA funkcija (`naplataSecretsVerdict`), odvojena od procesa, da se moze mutirati u
// `tests/gate-mutations.test.ts`. Proces koji zove `process.exit` ne moze biti mutiran u memoriji,
// pa bi gard bez te funkcije tvrdio da grize, a nitko to ne bi provjerio.

import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
 * Presuda nad okolinom deploya naplate. Prazan string i sam razmak broje se kao NEPOSTAVLJENO:
 * Supabase secret postavljen na prazno izgleda u sucelju kao da postoji, a `acceptEvent` ga vidi
 * isto kao da ga nema.
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

// Isti obrazac kao ostale skripte: CLI blok se izvodi SAMO kad je ova datoteka ulazna tocka.
// Test je uvozi kao modul (`process.argv[1]` je tada vitest), pa `process.exit` nikad ne okine.
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const verdict = naplataSecretsVerdict(process.env);
  if (!verdict.ok) {
    console.error('[verify-naplata-secrets] deploy naplate ODBIJEN: nedostaju ili su prazne tajne:');
    for (const name of verdict.missing) console.error(`  - ${name}`);
    console.error('Postavi ih kao Supabase Edge secrets (docs/GO_LIVE_NAPLATA.md, korak 5) pa ponovi.');
    process.exit(1);
  }
  console.log(`[verify-naplata-secrets] sve tajne naplate su postavljene (${NAPLATA_SECRETS.length}).`);
}

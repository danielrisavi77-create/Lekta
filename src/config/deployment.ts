const PRODUCTION_SUPABASE_URL = 'https://zrrjttizjyfcxmcpgzml.supabase.co';
const PRODUCTION_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpycmp0dGl6anlmY3htY3Bnem1sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM1ODIzMTcsImV4cCI6MjA5OTE1ODMxN30.OOUm0_WszIhV1SE2Li3HUhE4QR-voe7CsmiMFuwAx_8';

const requestedMode = String(import.meta.env.VITE_LEKTA_ENV || 'production').trim().toLowerCase();
if (requestedMode !== 'production' && requestedMode !== 'staging') {
  throw new Error(`Nepoznata Lekta build okolina: ${requestedMode}`);
}

const configuredUrl = String(import.meta.env.VITE_LEKTA_SUPABASE_URL || '').trim();
const configuredAnonKey = String(import.meta.env.VITE_LEKTA_SUPABASE_ANON_KEY || '').trim();
const isStaging = requestedMode === 'staging';

// Staging build ne smije tiho pasti natrag na produkcijsku bazu ako Netlify varijable
// nisu unesene. Produkcija ostaje backward-compatible i koristi kanonske zadane vrijednosti.
if (isStaging && (!configuredUrl || !configuredAnonKey)) {
  throw new Error(
    'Staging build zahtijeva VITE_LEKTA_SUPABASE_URL i VITE_LEKTA_SUPABASE_ANON_KEY.',
  );
}

/**
 * LOKALNI RAZVOJ NE SMIJE GADJATI PRODUKCIJU (audit A26-07).
 *
 * `requestedMode` je po zadanom 'production', pa je `npm run dev` bez env varijabli koristio
 * PRODUKCIJSKI URL i anon kljuc, uz istovremeno upaljene interne dev alate. Lokalni rad je time
 * mogao citati i pisati zivu bazu, a nista u sucelju to nije govorilo.
 *
 * NE bacamo iznimku. Prvo rjesenje je bilo upravo to, ali ono rusi cijeli app na ucitavanju
 * modula, pa i Playwright UX suite (koji dize `npm run dev` i uopce ne treba backend) i svakog
 * tko samo hoce vidjeti sucelje. Provjera koja rusi nevine tokove brzo se iskljuci i time ne
 * stiti nista.
 *
 * Umjesto toga dev bez konfiguracije pokazuje na LOKALNI Supabase (zadani port CLI-ja). Posljedica
 * je da slucajan poziv pukne vidljivo na nepostojecem lokalnom hostu umjesto da tiho uspije nad
 * produkcijom. Produkcijski BUILD zadrzava kanonske vrijednosti, jer bi inace deploy puknuo na
 * okolini koja varijable jos nema.
 */
const LOCAL_SUPABASE_URL = 'http://127.0.0.1:54321';
const devWithoutConfig = import.meta.env.DEV && !import.meta.env.TEST && (!configuredUrl || !configuredAnonKey);
if (devWithoutConfig) {
  console.warn(
    '[lekta] VITE_LEKTA_SUPABASE_URL / _ANON_KEY nisu postavljeni, pa dev koristi LOKALNI Supabase ' +
      `(${LOCAL_SUPABASE_URL}), ne produkciju. Kopiraj .env.example u .env ako trebas pravi backend.`,
  );
}

const supabaseUrl = configuredUrl || (devWithoutConfig ? LOCAL_SUPABASE_URL : PRODUCTION_SUPABASE_URL);

export const DEPLOYMENT_CONFIG = {
  mode: requestedMode,
  supabaseUrl,
  supabaseAnonKey: configuredAnonKey || (devWithoutConfig ? 'lokalni-dev-bez-kljuca' : PRODUCTION_SUPABASE_ANON_KEY),
  functionEndpoint: (name: string) => `${supabaseUrl.replace(/\/+$/, '')}/functions/v1/${name}`,
} as const;

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
 * LOKALNI RAZVOJ TAKODJER NE SMIJE TIHO GADJATI PRODUKCIJU (audit A26-07).
 *
 * `requestedMode` po zadanom je 'production', pa je `npm run dev` bez env varijabli koristio
 * produkcijski URL i anon kljuc. Istovremeno su u dev buildu upaljeni interni alati. Lokalni
 * rad je time mogao citati i pisati zivu bazu, a da nista u sucelju to ne kaze.
 *
 * Zato dev server pada isto kao staging. Produkcijski BUILD zadrzava zadane vrijednosti, jer bi
 * inace deploy puknuo na okolini koja varijable jos nema.
 *
 * `TEST` se izuzima: vitest vrti u dev nacinu, a testovi ne diraju mrezu (endpointi se stubaju),
 * pa bi ih ovo srusilo bez ikakve dobiti.
 */
if (import.meta.env.DEV && !import.meta.env.TEST && (!configuredUrl || !configuredAnonKey)) {
  throw new Error(
    'Lokalni dev server zahtijeva VITE_LEKTA_SUPABASE_URL i VITE_LEKTA_SUPABASE_ANON_KEY. ' +
      'Kopiraj .env.example u .env i popuni ih. Bez toga bi se dev spajao na PRODUKCIJSKU bazu.',
  );
}

const supabaseUrl = configuredUrl || PRODUCTION_SUPABASE_URL;

export const DEPLOYMENT_CONFIG = {
  mode: requestedMode,
  supabaseUrl,
  supabaseAnonKey: configuredAnonKey || PRODUCTION_SUPABASE_ANON_KEY,
  functionEndpoint: (name: string) => `${supabaseUrl.replace(/\/+$/, '')}/functions/v1/${name}`,
} as const;

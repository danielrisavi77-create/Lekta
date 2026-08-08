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

const supabaseUrl = configuredUrl || PRODUCTION_SUPABASE_URL;

export const DEPLOYMENT_CONFIG = {
  mode: requestedMode,
  supabaseUrl,
  supabaseAnonKey: configuredAnonKey || PRODUCTION_SUPABASE_ANON_KEY,
  functionEndpoint: (name: string) => `${supabaseUrl.replace(/\/+$/, '')}/functions/v1/${name}`,
} as const;

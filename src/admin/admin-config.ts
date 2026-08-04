/**
 * Lekta Control Center: produkcijska konfiguracija. admin.html je samostalan MPA entry (ne
 * uvozi src/ui/app.ts), pa ne dijeli app.ts-ov DEFAULT_PRODUCTION_CONFIG - isti Supabase
 * projekt, ista vrijednost, zaseban mali objekt. app.ts jos nije rastavljen na dijeljeni
 * config modul (CLAUDE.md: "Meta: dovrsiti split"), pa ovo namjerno NE uvodi novu dijeljenu
 * apstrakciju preko dva mjesta - samo ponavlja tri javne vrijednosti koje su ionako vidljive
 * u glavnom bundleu (anon kljuc je namjenski javan, RLS je stvarna granica).
 */
export const ADMIN_CONFIG = {
  supabaseUrl: 'https://zrrjttizjyfcxmcpgzml.supabase.co',
  supabaseAnonKey:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpycmp0dGl6anlmY3htY3Bnem1sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM1ODIzMTcsImV4cCI6MjA5OTE1ODMxN30.OOUm0_WszIhV1SE2Li3HUhE4QR-voe7CsmiMFuwAx_8',
  adminStatsEndpoint: 'https://zrrjttizjyfcxmcpgzml.supabase.co/functions/v1/admin-stats',
} as const;

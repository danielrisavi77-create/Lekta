/**
 * Lekta Control Center: produkcijska konfiguracija. admin.html je samostalan MPA entry (ne
 * uvozi src/ui/app.ts), pa ne dijeli app.ts-ov DEFAULT_PRODUCTION_CONFIG - isti Supabase
 * projekt, ista vrijednost, zaseban mali objekt. Javne vrijednosti dolaze iz deployment modula
 * kako staging build ne bi mogao slucajno citati produkcijsku bazu.
 */
import { DEPLOYMENT_CONFIG } from '../config/deployment';

export const ADMIN_CONFIG = {
  supabaseUrl: DEPLOYMENT_CONFIG.supabaseUrl,
  supabaseAnonKey: DEPLOYMENT_CONFIG.supabaseAnonKey,
  adminStatsEndpoint: DEPLOYMENT_CONFIG.functionEndpoint('admin-stats'),
} as const;

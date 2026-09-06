import { DEPLOYMENT_CONFIG } from '../config/deployment';
import { STORAGE_KEYS, safeStorageGet } from '../shared/browser-storage';

/**
 * PRODUKCIJSKA KONFIGURACIJA, izdvojena iz `src/ui/app.ts` 2026-09-03.
 *
 * Odgovara na jedno pitanje: je li placena ponuda ZIVA. O tome ovisi prikazuje li se cjenik s
 * gumbima ili s oznakom "uskoro", pa kriv odgovor znaci ponuditi naplatu koja ne radi.
 *
 * FUNKCIJE PRIMAJU KONFIGURACIJU KAO ARGUMENT, ne citaju modulsku promjenjivu. `app.ts` svoju
 * mijenja TRI puta u izvodjenju (pri pokretanju, pri spremanju i pri vracanju postavki), pa bi
 * dijeljeno stanje izmedju modula znacilo da jedna strana vidi staru vrijednost. Cist ulaz to
 * iskljucuje po konstrukciji.
 *
 * `app.ts` zadrzava tanke omotace pod ISTIM imenima, pa je svih 23 pozivnih mjesta ostalo
 * bajt identicno; isti obrazac kao pri izdvajanju telemetrije (`6abe8c21`).
 */

export const DEFAULT_PRODUCTION_CONFIG={enabled:false,submissionMode:'netlify-form',orderEndpoint:'/',paymentProvider:'lemonsqueezy',paymentLinks:{format:'',panic:'',premium:''},corpusContribution:true,businessName:'Lekta',contactEmail:'lekta.kontakt@gmail.com',privacyController:'',retentionDays:30,uploadMaxBytes:8*1024*1024,analyticsEndpoint:DEPLOYMENT_CONFIG.functionEndpoint('analytics-event'),serverAnalytics:'netlify-optional',reportEndpoint:'',fieldRenderEndpoint:'',repairEndpoint:DEPLOYMENT_CONFIG.functionEndpoint('repair-docx'),profileRulesEndpoint:DEPLOYMENT_CONFIG.functionEndpoint('profile-rules'),checkoutEndpoint:'',guaranteeEndpoint:'',supabaseUrl:DEPLOYMENT_CONFIG.supabaseUrl,supabaseAnonKey:DEPLOYMENT_CONFIG.supabaseAnonKey,waitlistEndpoint:DEPLOYMENT_CONFIG.functionEndpoint('faculty-request'),referralEndpoint:'',errorEndpoint:DEPLOYMENT_CONFIG.functionEndpoint('client-error'),preflightStartEndpoint:'',preflightResultEndpoint:'',preflightMaxUploadMb:30,adminStatsEndpoint:DEPLOYMENT_CONFIG.functionEndpoint('admin-stats')};

export type ProductionConfig = typeof DEFAULT_PRODUCTION_CONFIG;

export function loadProductionConfig(){const saved=safeStorageGet(STORAGE_KEYS.production,{});return{...structuredClone(DEFAULT_PRODUCTION_CONFIG),...(saved||{}),paymentLinks:{...DEFAULT_PRODUCTION_CONFIG.paymentLinks,...(saved?.paymentLinks||{})}}}

export function productionStatus(productionConfig: any){const links=Object.values(productionConfig?.paymentLinks||{}).filter(Boolean).length,endpoint=String(productionConfig?.orderEndpoint||'').trim();return{active:!!productionConfig?.enabled&&!!endpoint,links,endpoint,provider:productionConfig?.paymentProvider||'lemonsqueezy'}}

export function reportEndpointConfigured(productionConfig: any){return!!String(productionConfig?.reportEndpoint||'').trim()}

export function checkoutConfigured(productionConfig: any){return!!String(productionConfig?.checkoutEndpoint||'').trim()}

export function paidOffersLive(productionConfig: any){return reportEndpointConfigured(productionConfig)||checkoutConfigured(productionConfig)||productionStatus(productionConfig).active}

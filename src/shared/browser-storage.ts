/**
 * POHRANA U PREGLEDNIKU, izdvojena iz `src/ui/app.ts` 2026-09-03.
 *
 * Razlog je lanac rute: `/saznaj-vise/` treba ispisati cjenik, cjenik treba `paidOffersLive`, ono
 * treba produkcijsku konfiguraciju, a ona ovo. Dok je sve zivjelo u `app.ts`, svaka ruta koja
 * dotakne bilo koji clan tog lanca morala je uvesti cijeli analizator.
 *
 * `SESSION_MEMORY` SELI ZAJEDNO S FUNKCIJAMA, jer im je zajednicko stanje: to je zamjena za
 * `localStorage` kad ga preglednik odbije (privatni prozor, blokirani podaci stranice). Da je
 * ostao u `app.ts`, funkcije bi se tiho vratile na `fallback` umjesto na zapamcenu vrijednost, i
 * to tek u onim preglednicima gdje pohrana ne radi, dakle ondje gdje se najteze primijeti.
 *
 * Modul NEMA vanjskih ovisnosti i ne dira DOM.
 */

export const STORAGE_KEYS={preferences:'lekta.preferences.v2',history:'lekta.history.v2',production:'lekta.production.v2.1',submission:'lekta.submission.v2.2.2',analyticsConsent:'lekta.analytics-consent.v1',orders:'lekta.orders.v1',waitlist:'lekta.waitlist.v1'};/* jednokratna migracija starih lokalnih podataka na lekta.* (sigurno, bez gubitka) */(function migrateLegacyStorage(){try{var MIG: any={'thesisready.preferences.v2':'lekta.preferences.v2','thesisready.history.v2':'lekta.history.v2','thesisready.production.v2.1':'lekta.production.v2.1','thesisready.submission.v2.2.2':'lekta.submission.v2.2.2','thesisready.analytics-consent.v1':'lekta.analytics-consent.v1','thesisready.orders.v1':'lekta.orders.v1','thesisready.theme':'lekta.theme'};for(var o in MIG){var nk=MIG[o],ov=localStorage.getItem(o);if(ov!==null&&localStorage.getItem(nk)===null)localStorage.setItem(nk,ov);localStorage.removeItem(o);}}catch(e: any){}})();

/** Zamjena za `localStorage` kad ga preglednik odbije; vrijedi do kraja kartice. */
const SESSION_MEMORY=new Map();

export function safeStorageGet(key: any,fallback: any=null){try{const raw=localStorage.getItem(key);if(raw)return JSON.parse(raw)}catch(e: any){}return SESSION_MEMORY.has(key)?structuredClone(SESSION_MEMORY.get(key)):fallback}

export function safeStorageSet(key: any,value: any){SESSION_MEMORY.set(key,structuredClone(value));try{localStorage.setItem(key,JSON.stringify(value));return true}catch(e: any){return false}}

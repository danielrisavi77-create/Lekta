// Jedini izvor istine za verziju pravnih uvjeta. Izdvojeno iz legal-content.ts u zaseban,
// ovisnostima-cist modul (BEZ uvoza provider.json) da ga smije uvesti i Deno Edge Function
// (supabase/functions/repair-docx) kao autoritativnu verziju za server-side consent gate, bez
// povlacenja cijelog legal modula ni JSON import-atributa. legal-content.ts ga re-exporta pa
// svi postojeci uvoznici (`from '../legal/legal-content.ts'`) rade nepromijenjeno.
//
// Bump SAMO kad se pravni tekst materijalno mijenja (uskladi s legal-content.ts sadrzajem).
export const TERMS_VERSION = '2026-07-20';

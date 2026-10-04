/**
 * Ozicenje garda #5 u scripts/verify-deploy-dist.mjs (T49, Codex runda 3, nalaz 7b na #273).
 *
 * Logika garda je `seoOriginProblems` u scripts/site-origin.mjs i testira se nad sintetickim
 * artefaktom. Ostaje pitanje vodi li svaki problem stvarno u `fail`: gard koji racuna probleme a
 * ne rusi build tiho propusta. Ovaj helper to provjerava nad izvorom skripte; mutacija u
 * tests/gate-mutations.test.ts uklanja `fail` i mora pasti.
 */
export const GUARD5_WIRING = 'for (const problem of seoOriginProblems(seoFiles, SITE_ORIGIN)) fail(problem);';

/** True kad izvor verify-deploy-dist za svaki problem garda #5 zove `fail`. */
export function guard5Wired(source: string): boolean {
  return source.replace(/\r\n?/g, '\n').includes(GUARD5_WIRING);
}

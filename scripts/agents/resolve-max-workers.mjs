/**
 * Cista funkcija koja racuna zadani broj Vitest radnika iz `VITEST_MAX_THREADS` env varijable.
 * Izdvojena iz `vitest.config.ts` da je test moze pozvati izravno, bez oslanjanja na to hoce li
 * Vite ponovno izvrsiti config modul za istu putanju unutar istog procesa (ne izvrsava).
 *
 * @param {string | undefined} envValue - sirova vrijednost `process.env.VITEST_MAX_THREADS`.
 * @returns {number} broj radnika: parsirana pozitivna cijela vrijednost, ili zadano 2.
 */
export function resolveMaxWorkers(envValue) {
  const DEFAULT_MAX_WORKERS = 2;
  if (envValue === undefined || envValue === '') return DEFAULT_MAX_WORKERS;
  const parsed = Number.parseInt(envValue, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_WORKERS;
}

// scripts/dev-console.mjs
//
// Odluka ukljucuje li build interne dev alate: setup modal, QA konzola (JS pod __DEV_TOOLS__)
// i verification.html entry (interna verifikacijska konzola + import ~163MB source PDF-ova).
//
// SAFE-BY-DEFAULT (routes-02): dev server (vite 'serve') ih UVIJEK ima; produkcijski build
// (vite 'build') ih ukljucuje SAMO uz eksplicitni DEV_CONSOLE=1. Ranije je bilo obrnuto
// (ukljuceno po defaultu, iskljuceno tek uz DEPLOY=1), pa je host koji zaboravi DEPLOY (npr.
// Cloudflare Pages sa `npm run build`) objavljivao internu konzolu. Sada plain `vite build`
// na bilo kojem hostu ne sadrzi konzolu; DEV_CONSOLE=1 je namjeran QA opt-in.

/**
 * @param {string} command  vite command: 'serve' ili 'build'
 * @param {Record<string, string | undefined>} [env]  process.env
 * @returns {boolean} ukljuciti dev alate (konzola/verification/setup) u ovaj serve/build
 */
export function resolveDevTools(command, env = {}) {
  if (command === 'serve') return true; // dev server uvijek ima alate
  return env.DEV_CONSOLE === '1'; // build: samo uz eksplicitni opt-in
}

/**
 * Gard za traku privole na mobitelu (mobilni audit 2026-09-28, PR 3): ispod 721 px obje trake (`#consentBanner` na
 * `/rad/` i `.lekta-consent-banner` na alatima) stoje u toku stranice, rezerva ispod sadrzaja vrijedi samo iznad
 * 720 px, a `syncConsentBannerInset` postavlja inline rezervu samo za fiksnu traku. Cista funkcija nad tekstom
 * izvora, pa se smije mutirati; izravni dokaz u pregledniku je `tests/ux/mobile-consent-inflow.spec.ts`.
 */
const cisto = (s: string) => s.replace(/\r/g, '').replace(/\/\*[\s\S]*?\*\//g, ' ');

export function mobileConsentProblems(src: { pageApp: string; pageChrome: string; toolPage: string; appTs: string }): string[] {
  const problemi: string[] = [];
  const app = cisto(src.pageApp);
  const chrome = cisto(src.pageChrome);
  const tool = cisto(src.toolPage);
  if (!/@media\(max-width:720px\)\{\.consent-banner\{position:static[;}]/.test(app)) problemi.push('/rad/: traka nije u toku na uskom ekranu');
  if (!/@media\(max-width:720px\)\{\.lekta-consent-banner\{position:static[;}]/.test(tool)) problemi.push('alati: traka nije u toku na uskom ekranu');
  if (/max-width:720px\)\s*\{\s*body:has\([^)]*consent-banner/.test(chrome + tool)) problemi.push('rezerva za traku i na uskom ekranu');
  if (/@media screen\{\s*body:has\([^)]*consent-banner/.test(chrome + tool)) problemi.push('rezerva za traku bez praga sirine');
  if (!/fiksna\?`\$\{h\+34\}px`:''/.test(src.appTs) || !/getComputedStyle\(b\)\.position==='fixed'/.test(src.appTs)) problemi.push('inline rezerva ne ovisi o fiksnoj traci');
  return problemi;
}

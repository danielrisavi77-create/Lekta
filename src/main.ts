// @ts-nocheck
/*
 * Lekta runtime entry.
 *
 * NAPOMENA (bootstrap): puni runtime (DOCX parser, auditi, Legal Citation Engine,
 * UI, narudzbe) zivi u prototipu kao jedan veliki inline <script>. Zbog vjernosti
 * (i jer je kopija u ovom repou mojibake) taj kod se NE prepisuje rucno, nego se
 * generira iz tvog izvornog prototipa:
 *
 *   1. Stavi pristinu, ispravno UTF-8 kodiranu single-file verziju u
 *      reference/prototype.html  (tvoj Lekta_v2_2_2_Full_Institutional_Coverage_Matrix.html).
 *   2. Pokreni:  npm run bootstrap
 *      (scripts/split-prototype.mjs izvuce <script> u src/main.ts i prepise index.html).
 *   3. npm run dev  ->  puna aplikacija.
 *
 * Do tada index.html renderira staticki landing (markup je vec tu), a ovaj modul
 * samo provjeri kljucne preglednicke API-je i ostavi vidljivu uputu.
 */

const REQUIRED_APIS: Array<[string, boolean]> = [
  ['DecompressionStream', typeof (globalThis as any).DecompressionStream === 'function'],
  ['DOMParser', typeof (globalThis as any).DOMParser === 'function'],
  ['File API', typeof (globalThis as any).File === 'function' && typeof FileReader === 'function'],
];

function bootstrapNotice(): void {
  const missing = REQUIRED_APIS.filter(([, ok]) => !ok).map(([name]) => name);
  // eslint-disable-next-line no-console
  console.info(
    '[Lekta] Scaffold aktivan. Puni runtime jos nije generiran iz prototipa. ' +
      'Vidi src/main.ts (bootstrap) i pokreni `npm run bootstrap`.' +
      (missing.length ? ` Preglednik ne podrzava: ${missing.join(', ')}.` : ''),
  );

  const analyzeBtn = document.getElementById('analyzeBtn') as HTMLButtonElement | null;
  if (analyzeBtn) {
    analyzeBtn.disabled = true;
    analyzeBtn.textContent = 'Pokreni `npm run bootstrap`';
  }
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrapNotice, { once: true });
  } else {
    bootstrapNotice();
  }
}

export {};

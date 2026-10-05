/**
 * "POSTAVKE PRIVATNOSTI" DOVODE TRAKU PRED KORISNIKA (mobilni audit 2026-09-28, PR 3; Codex R1 na #305).
 *
 * Na uskom ekranu traka privole stoji u toku stranice, iza podnozja (page-app.css). Gumb u podnozju je nakon ranije
 * odluke ponovno prikazuje (`openPrivacySettings` u app.ts), ali bez pomaka prikaza i fokusa: klik je izgledao kao da
 * nije ucinio nista. Ovdje, nakon tog klika, vidljivu traku dovodimo u vidokrug i fokusiramo njezinu prvu radnju.
 *
 * Zaseban modul, ne izmjena app.ts: app.ts je 19 B ispod budzeta (tests/ui-module-budget.test.ts). Slusac ceka
 * sljedeci kadar, jer app.ts svoj `onclick` postavlja tek u `initAnalyzerApp`, pa redoslijed slusaca nije zajamcen.
 */
export function mountConsentReveal(doc: Document = document): void {
  doc.getElementById('privacySettingsBtn')?.addEventListener('click', () => {
    requestAnimationFrame(() => {
      const traka = doc.getElementById('consentBanner');
      if (!traka || traka.classList.contains('hidden')) return;
      traka.scrollIntoView({ block: 'nearest' });
      traka.querySelector<HTMLElement>('button, [href], input, [tabindex]:not([tabindex="-1"])')?.focus({ preventScroll: true });
    });
  });
}

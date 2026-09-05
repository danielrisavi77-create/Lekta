import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * TANKA RUTA: analizator se mora montirati na stranici koja NEMA cjenik, narudzbe, povijest ni
 * pravne modale.
 *
 * Do sada nije mogao. `bind()` je rukovatelje pridruzivao bezuvjetno (`$('#x').onclick=...`), pa
 * bi montaza pukla na prvom elementu koji nedostaje, a granica je zato smjela raditi samo kad je
 * prisutno svih pet korijena zatecene stranice. Time je `/rad/` bio nemoguc: svaka tanka ruta
 * morala bi nositi cijeli cjenik da bi se analizator uopce ozicio.
 *
 * Fixture NIJE rucno pisan nego IZVADJEN iz stvarnog `index.html`: uzima se samo `#analyzer`.
 * Rucno pisan minimalni DOM mjeri ono sto je autor testa zamislio, a ovaj mjeri ono sto ruta
 * doista dobiva. To je ista razlika koju vodic opisuje kod sweepova: generator ulaza je i sam
 * neprovjeren dok mu ne dokazes da proizvodi oblik koji tvrdis da pokrivas.
 */

const INDEX = readFileSync(resolve(__dirname, '..', 'rad', 'index.html'), 'utf8');

/** Samo radna povrsina iz stvarnog `index.html`, bez ijedne druge skupine. */
function workspaceOnlyDocument(): Document {
  const parsed = document.implementation.createHTMLDocument('izvor');
  parsed.documentElement.innerHTML = INDEX;
  const analyzer = parsed.getElementById('analyzer');
  if (!analyzer) throw new Error('index.html nema #analyzer, fixture se ne moze izvesti');

  const doc = document.implementation.createHTMLDocument('tanka ruta');
  doc.body.innerHTML = analyzer.outerHTML;
  return doc;
}

describe('tanka ruta: montaza bez cjenika i narudzbi', () => {
  it('fixture je STVARNA radna povrsina, a ostale skupine su odsutne', () => {
    // Bez ove tvrdnje test bi mogao prolaziti nad fixtureom koji slucajno sadrzi sve, pa ne bi
    // dokazivao nista o tankoj ruti.
    const doc = workspaceOnlyDocument();
    expect(doc.getElementById('analyzer')).toBeTruthy();
    expect(doc.getElementById('dropzone')).toBeTruthy();
    for (const odsutan of ['checkGrid', 'pricingGrid', 'orderModal', 'historyModal', 'legalModal']) {
      expect(doc.getElementById(odsutan), `${odsutan} ne smije biti u fixtureu`).toBeNull();
    }
  });

  it('analizator se MONTIRA na tankoj ruti', async () => {
    const { initAnalyzerApp, isAnalyzerMounted, disposeAnalyzerApp } = await import('../src/ui/app');
    const doc = workspaceOnlyDocument();
    try {
      initAnalyzerApp(doc);
      expect(isAnalyzerMounted(doc)).toBe(true);
    } finally {
      disposeAnalyzerApp(doc);
    }
  }, 180000);

  it('montaza je ozicila radnu povrsinu, ne samo zabiljezila dokument', async () => {
    // Registracija bez ozicenja bi prosla gornju tvrdnju a ne bi radila nista. Dokaz je da
    // dropzone ima rukovatelja, dakle da je `bind()` doista prosao.
    const { initAnalyzerApp, disposeAnalyzerApp } = await import('../src/ui/app');
    const doc = workspaceOnlyDocument();
    try {
      initAnalyzerApp(doc);
      const dropzone = doc.getElementById('dropzone') as HTMLElement & { onclick?: unknown };
      expect(typeof dropzone.onclick).toBe('function');
    } finally {
      disposeAnalyzerApp(doc);
    }
  }, 180000);
});

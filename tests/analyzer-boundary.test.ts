import { describe, expect, it } from 'vitest';

/**
 * GRANICA ANALIZATORA: ulaz (`initAnalyzerApp`) i izlaz (`disposeAnalyzerApp`).
 *
 * Ovaj korak NE mijenja ozicenje; dokaz za to su postojeci testovi, koji prolaze bez ijedne
 * izmjene. Ovdje se mjeri ono sto ti testovi ne mogu vidjeti: ponasanje granice na RUBOVIMA,
 * gdje se granice i lome.
 *
 * Dva ruba nose stvaran rizik i oba su ovdje:
 *
 * 1. OTROVANA REGISTRACIJA. Modul se ucitava PRIJE nego ruta ispise svoj DOM, pa poziv nad
 *    praznom stranicom ne smije potrositi mjesto u registru. Da ga potrosi, kasniji izricit
 *    poziv tiho bi izasao na idempotentnom returnu i ruta bi ostala bez ijednog ozicenja, bez
 *    greske i bez traga u konzoli. To je kvar koji se ne vidi ni u jednom postojecem testu.
 *
 * 2. POVRAT NAKON NEUSPJEHA. Montaza koja pukne na pola ne smije ostaviti dokument zabiljezen
 *    kao montiran. Inace prvi pokusaj baci gresku, a svaki sljedeci TIHO ne napravi nista, pa
 *    se kvar prijavi jednom i onda nestane.
 *
 * SVJESNO NIJE OVDJE: uspjesna montaza. Ona trazi cijelu zatecenu stranicu, jer `initLegacy`
 * bezuvjetno dohvaca #packagePicks i ostale tocke izvan pet korijena. Kad `bind()` bude razlozen
 * i minimalan fixture radne povrsine postane moguc, tu dolaze idempotencija, ogranicenje na
 * jedan aktivni Document i stvaran opseg disposea.
 */

const FIVE_ROOTS = ['checkGrid', 'pricingGrid', 'orderModal', 'historyModal', 'legalModal'] as const;

function emptyDoc(): Document {
  return document.implementation.createHTMLDocument('t');
}
function docWithRoots(ids: readonly string[]): Document {
  const doc = emptyDoc();
  doc.body.innerHTML = ids.map((id) => `<div id="${id}"></div>`).join('');
  return doc;
}
/** Uhvacena greska ili `null`; tvrdnja "bacilo je" nije dovoljna, treba i ZASTO. */
function grab(run: () => void): Error | null {
  try { run(); return null; } catch (error) { return error as Error; }
}
const SINGLE_DOCUMENT_GUARD = /jedan aktivni Document/;

describe('granica analizatora', () => {
  it('stranica bez ijednog korijena se ne montira, i ne baca', async () => {
    const { initAnalyzerApp, isAnalyzerMounted } = await import('../src/ui/app');
    const doc = emptyDoc();
    expect(() => initAnalyzerApp(doc)).not.toThrow();
    expect(isAnalyzerMounted(doc)).toBe(false);
  }, 180000);

  it('trazi SVIH pet korijena: svaki nedostajuci znaci da montaze nema', async () => {
    // `initLegacy` bezuvjetno dohvaca `$('#checkGrid').innerHTML` i slicno, pa bi na stranici s
    // dijelom korijena bacilo na prvom koji nedostaje. Uvjet je zato konjunkcija, ne disjunkcija.
    const { initAnalyzerApp, isAnalyzerMounted } = await import('../src/ui/app');
    for (const missing of FIVE_ROOTS) {
      const doc = docWithRoots(FIVE_ROOTS.filter((id) => id !== missing));
      expect(() => initAnalyzerApp(doc)).not.toThrow();
      expect(isAnalyzerMounted(doc)).toBe(false);
    }
  }, 180000);

  it('PRAZNA STRANICA NE TROSI MJESTO U REGISTRU: isti dokument se poslije moze montirati', async () => {
    // Srz otrovane registracije. Prvi poziv dolazi prije nego ruta ispise DOM i mora biti
    // BEZ TRAGA. Kad korijeni stignu, drugi poziv mora stvarno pokusati montazu; da je prvi
    // potrosio mjesto, ovdje bi tiho izasao i dokument bi ostao mrtav.
    const { initAnalyzerApp } = await import('../src/ui/app');
    const doc = emptyDoc();
    initAnalyzerApp(doc);
    doc.body.innerHTML = FIVE_ROOTS.map((id) => `<div id="${id}"></div>`).join('');
    // Montaza sada KRECE (pa pukne dalje, jer fixture nema ostale tocke). Bitno je da je
    // krenula: tihi izlaz bez greske znacio bi da je registar otrovan.
    const error = grab(() => initAnalyzerApp(doc));
    expect(error).toBeTruthy();
    expect(String(error?.message)).not.toMatch(SINGLE_DOCUMENT_GUARD);
  }, 180000);

  it('neuspjela montaza se vraca u cisto stanje, pa se pokusaj moze ponoviti', async () => {
    const { initAnalyzerApp, isAnalyzerMounted } = await import('../src/ui/app');
    const doc = docWithRoots(FIVE_ROOTS);
    const first = grab(() => initAnalyzerApp(doc));
    const second = grab(() => initAnalyzerApp(doc));
    expect(first).toBeTruthy();
    // Drugi pokusaj mora opet BACITI, ne tiho izaci: greska koja se prijavi jednom pa nestane
    // je gora od greske koja se ponavlja.
    expect(second).toBeTruthy();
    // I mora pasti na SAMOJ MONTAZI. Izmjereno pri pisanju ovog garda: bez ove tvrdnje test
    // prolazi i kad povrata nema, jer procurjelo stanje iz prethodnog testa natjera zastitu
    // "jedan aktivni Document" da baci umjesto montaze. Tvrdnja "bacilo je" tada mjeri krivi
    // mehanizam, a mutacija koja brise povrat prolazi neopazeno.
    expect(String(first?.message)).not.toMatch(SINGLE_DOCUMENT_GUARD);
    expect(String(second?.message)).not.toMatch(SINGLE_DOCUMENT_GUARD);
    expect(isAnalyzerMounted(doc)).toBe(false);
  }, 180000);

  it('dispose nad nemontiranim dokumentom je bezopasan', async () => {
    const { disposeAnalyzerApp, isAnalyzerMounted } = await import('../src/ui/app');
    const doc = emptyDoc();
    expect(() => disposeAnalyzerApp(doc)).not.toThrow();
    expect(isAnalyzerMounted(doc)).toBe(false);
  }, 180000);

  it('globalni document bez #analyzer ne montira nista pri ucitavanju modula', async () => {
    // Auto-montaza na dnu modula je ogradjena. Bez te ograde bi svaki uvoz modula u testu
    // pokusao montazu nad praznim happy-dom dokumentom.
    const { isAnalyzerMounted } = await import('../src/ui/app');
    expect(isAnalyzerMounted(document)).toBe(false);
  }, 180000);
});

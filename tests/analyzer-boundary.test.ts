import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * GRANICA ANALIZATORA: ulaz (`initAnalyzerApp`) i izlaz (`disposeAnalyzerApp`).
 *
 * Mjeri se ponasanje na RUBOVIMA, gdje se granice lome. Dva nose stvaran rizik:
 *
 * 1. OTROVANA REGISTRACIJA. Modul se ucitava PRIJE nego ruta ispise svoj DOM, pa poziv nad
 *    praznom stranicom ne smije potrositi mjesto u registru. Da ga potrosi, kasniji izricit poziv
 *    tiho bi izasao na idempotentnom returnu i ruta bi ostala bez ijednog ozicenja, bez greske i
 *    bez traga u konzoli.
 *
 * 2. JEDAN AKTIVAN DOKUMENT. Dva montirana dokumenta dijelila bi modulsko stanje
 *    (`currentResult`, `analyzedProfile`), pa bi drugi tiho pregazio prvome rezultat.
 *
 * PRIJASNJA VERZIJA OVOG TESTA imala je biljesku da uspjesna montaza "svjesno nije ovdje", jer je
 * trazila cijelu zatecenu stranicu. Otkad ozicenje ide kroz `ctl`, uvjet montaze je radna
 * povrsina (`#analyzer` + `#dropzone`), pa se ono sto je ondje bilo odgodjeno sada doista mjeri:
 * idempotencija, ogranicenje na jedan Document i opseg disposea. Tvrdnje o "svih pet korijena"
 * su zato ZAMIJENJENE, ne obrisane, i nova je provjera jaca: mjeri ISHOD, ne samo iznimku.
 *
 * Fixture se VADI iz stvarnog `index.html`. Rucno pisan minimalan DOM mjerio bi ono sto je autor
 * testa zamislio, a ovaj mjeri ono sto ruta doista dobiva.
 */

const INDEX = readFileSync(resolve(__dirname, '..', 'rad', 'index.html'), 'utf8');

function emptyDoc(): Document {
  return document.implementation.createHTMLDocument('t');
}

function workspaceHtml(): string {
  const parsed = document.implementation.createHTMLDocument('izvor');
  parsed.documentElement.innerHTML = INDEX;
  /**
   * DVA KORIJENA, NE JEDAN. Od 2026-09-07 kontrole profila zive u `#profileSheet`, koji stoji IZVAN
   * `<main>` jer `setBackgroundInert` (modal-utils.ts) postavlja `inert` na `header.topbar`, `main`
   * i `footer`; list ostavljen unutar `#analyzer` bio bi inertan zajedno s pozadinom, dakle
   * nedostupan tipkovnicom. Isto vrijedi za svih 12 ostalih dijaloga na stranici.
   *
   * Fixture zato uzima OBA korijena. To NIJE popustanje tvrdnje o tankoj ruti nego njezino
   * precizno izricanje: tanka ruta mora nositi radnu povrsinu, a radna povrsina je od tada dva
   * odvojena podstabla. Bez lista `initCatalog` pada na `#institutionSelect` koji je `null`, i to
   * je ISPRAVNO ponasanje: montaza bez kontrola profila znacila bi analizu pod zatecenim zadanim
   * profilom, dakle tvrdnju korisniku cija se pravila primjenjuju, a da to nitko nije birao.
   */
  const analyzer = parsed.getElementById('analyzer');
  if (!analyzer) throw new Error('index.html nema #analyzer, fixture se ne moze izvesti');
  return analyzer.outerHTML + (parsed.getElementById('profileSheet')?.outerHTML ?? '');
}

function workspaceDoc(): Document {
  const doc = emptyDoc();
  doc.body.innerHTML = workspaceHtml();
  return doc;
}

describe('granica analizatora', () => {
  it('stranica bez radne povrsine se ne montira, i ne baca', async () => {
    const { initAnalyzerApp, isAnalyzerMounted } = await import('../src/ui/app');
    const doc = emptyDoc();
    expect(() => initAnalyzerApp(doc)).not.toThrow();
    expect(isAnalyzerMounted(doc)).toBe(false);
  }, 180000);

  it('sam omotac bez #dropzone nije radna povrsina', async () => {
    // `#analyzer` moze postojati na stranici koja radnu povrsinu tek najavljuje. Bez `#dropzone`
    // nema sto montirati, pa bi registracija bila prazna.
    const { initAnalyzerApp, isAnalyzerMounted } = await import('../src/ui/app');
    const doc = emptyDoc();
    doc.body.innerHTML = '<section id="analyzer"></section>';
    initAnalyzerApp(doc);
    expect(isAnalyzerMounted(doc)).toBe(false);
  }, 180000);

  it('PRAZNA STRANICA NE TROSI MJESTO U REGISTRU: isti dokument se poslije montira', async () => {
    const { initAnalyzerApp, isAnalyzerMounted, disposeAnalyzerApp } = await import('../src/ui/app');
    const doc = emptyDoc();
    initAnalyzerApp(doc);
    expect(isAnalyzerMounted(doc)).toBe(false);
    doc.body.innerHTML = workspaceHtml();
    try {
      initAnalyzerApp(doc);
      // Da je prvi poziv potrosio mjesto, ovaj bi tiho izasao i dokument bi ostao mrtav.
      expect(isAnalyzerMounted(doc)).toBe(true);
    } finally {
      disposeAnalyzerApp(doc);
    }
  }, 180000);

  it('ponovljena montaza istog dokumenta je bezopasna', async () => {
    const { initAnalyzerApp, isAnalyzerMounted, disposeAnalyzerApp } = await import('../src/ui/app');
    const doc = workspaceDoc();
    try {
      initAnalyzerApp(doc);
      expect(() => initAnalyzerApp(doc)).not.toThrow();
      expect(isAnalyzerMounted(doc)).toBe(true);
    } finally {
      disposeAnalyzerApp(doc);
    }
  }, 180000);

  it('DRUGI dokument se odbija dok je prvi montiran, i to se kaze naglas', async () => {
    const { initAnalyzerApp, disposeAnalyzerApp } = await import('../src/ui/app');
    const prvi = workspaceDoc();
    const drugi = workspaceDoc();
    try {
      initAnalyzerApp(prvi);
      expect(() => initAnalyzerApp(drugi)).toThrow(/jedan aktivni Document/);
    } finally {
      disposeAnalyzerApp(prvi);
    }
  }, 180000);

  it('dispose oslobadja mjesto, pa drugi dokument moze na red', async () => {
    const { initAnalyzerApp, disposeAnalyzerApp, isAnalyzerMounted } = await import('../src/ui/app');
    const prvi = workspaceDoc();
    const drugi = workspaceDoc();
    initAnalyzerApp(prvi);
    disposeAnalyzerApp(prvi);
    expect(isAnalyzerMounted(prvi)).toBe(false);
    try {
      expect(() => initAnalyzerApp(drugi)).not.toThrow();
      expect(isAnalyzerMounted(drugi)).toBe(true);
    } finally {
      disposeAnalyzerApp(drugi);
    }
  }, 180000);

  it('dispose nad nemontiranim dokumentom je bezopasan', async () => {
    const { disposeAnalyzerApp, isAnalyzerMounted } = await import('../src/ui/app');
    const doc = emptyDoc();
    expect(() => disposeAnalyzerApp(doc)).not.toThrow();
    expect(isAnalyzerMounted(doc)).toBe(false);
  }, 180000);

  /**
   * ODMONTIRANJE DOK DOHVAT PRAVILA JOS TRAJE.
   *
   * `bind()` vjesa `updateProfile()` na promjenu stila citiranja, a `updateProfile` je `async` i
   * nigdje se ne ceka: svih sest poziva su fire-and-forget. Unutra se ceka
   * `ensureRulesForCurrentSelection`, koja POSLIJE awaita ponovno cita odabir iz DOM-a
   * (`readId()` -> `currentDefinitionId` -> `selectedInstitution` -> `$('#institutionSelect').value`).
   *
   * `disposeAnalyzerApp` u tom prozoru postavi `_runtimeDocument` na `null`, pa `runtimeDocument()`
   * padne natrag na GLOBALNI `document`, koji kontrole profila nema. Nastavak pukne na `null.value`,
   * a jer poziv nitko ne ceka, iznimka ne stigne ni do jednog pozivatelja nego ispliva kao
   * NENADZIRANA REJEKCIJA, izvan testa koji ju je izazvao.
   *
   * Izmjereno 2026-09-12: cetiri puna gatea zaredom bila su cista, a peti, koji je trajao 1783 s
   * umjesto uobicajenih ~1200 s, dao je 16 takvih rejekcija, sve pripisane
   * `tests/analyzer-document-entry.test.ts`. Nijedan test nije pao, svih 5900 je proslo, a vitest je
   * svejedno izasao s 1. To je najgori oblik kvara jer izgleda kao opterecenje stroja.
   *
   * ZASTO PROVIDER, A NE PUKA MONTAZA PA DISPOSE: bez postavljenog providera `ensureProfileRules`
   * ceka `PROVIDER_WAIT_MS` (8 s) prije nego odustane, pa prva inacica ovog garda nije ni dotakla
   * nastavak i PROLAZILA JE I BEZ POPRAVKA. Vrata koja test sam otvara drze taj trenutak, pa je
   * redoslijed (dohvat krenuo -> odmontirano -> dohvat zavrsio) izmjeren, a ne docekan.
   */
  it('odmontiranje tijekom dohvata pravila ne ostavlja nenadziranu rejekciju', async () => {
    const { initAnalyzerApp, disposeAnalyzerApp } = await import('../src/ui/app');
    const registry = await import('../src/profiles/profile-registry');
    const doc = workspaceDoc();
    const uhvacene: unknown[] = [];
    const biljezi = (razlog: unknown) => { uhvacene.push(razlog); };
    process.on('unhandledRejection', biljezi);
    let otvoriVrata: () => void = () => {};
    let pozvanProvider = 0;
    try {
      initAnalyzerApp(doc);
      // Provider se postavlja TEK POSLIJE montaze: `initLegacy` prvi zove `wireProfileRulesProvider`,
      // pa bi ga montaza inace pregazila.
      registry.resetProfileRulesForTests();
      const vrata = new Promise<void>((res) => { otvoriVrata = res; });
      registry.setProfileRulesProvider(async () => {
        pozvanProvider += 1;
        await vrata;
        return { kind: 'failed', reason: 'test' };
      });
      const stil = doc.querySelector('#citationStyle');
      expect(stil, 'fixture nema #citationStyle, pa se updateProfile ne bi ni pokrenuo').not.toBeNull();
      stil?.dispatchEvent(new Event('change'));
      await new Promise((r) => setTimeout(r, 30));
      // ANTI-VAKUUM: bez ovoga bi tvrdnja nize bila istinita ni nad cim.
      expect(pozvanProvider, 'dohvat pravila nije ni krenuo; scenarij nije reproduciran').toBe(1);
      disposeAnalyzerApp(doc);
      otvoriVrata();
      // Pusti i mikro i makro zadatke, inace bi rejekcija stigla tek poslije tvrdnje.
      for (let i = 0; i < 8; i += 1) await new Promise((r) => setTimeout(r, 20));
    } finally {
      process.off('unhandledRejection', biljezi);
      otvoriVrata();
      registry.resetProfileRulesForTests();
    }
    expect(uhvacene.map((e) => (e instanceof Error ? e.message : String(e)))).toEqual([]);
  }, 180000);

  it('globalni document bez #analyzer ne montira nista pri ucitavanju modula', async () => {
    // Auto-montaza na dnu modula je ogradjena. Bez te ograde bi svaki uvoz modula u testu
    // pokusao montazu nad praznim happy-dom dokumentom.
    const { isAnalyzerMounted } = await import('../src/ui/app');
    expect(isAnalyzerMounted(document)).toBe(false);
  }, 180000);
});

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
  const analyzer = parsed.getElementById('analyzer');
  if (!analyzer) throw new Error('index.html nema #analyzer, fixture se ne moze izvesti');
  return analyzer.outerHTML;
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

  it('globalni document bez #analyzer ne montira nista pri ucitavanju modula', async () => {
    // Auto-montaza na dnu modula je ogradjena. Bez te ograde bi svaki uvoz modula u testu
    // pokusao montazu nad praznim happy-dom dokumentom.
    const { isAnalyzerMounted } = await import('../src/ui/app');
    expect(isAnalyzerMounted(document)).toBe(false);
  }, 180000);
});

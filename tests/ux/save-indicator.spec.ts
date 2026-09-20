import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { potvrdiProfil } from './confirm-profile';
import { cekajApp, cekajKorak } from './app-ready';

/**
 * INDIKATOR SPREMANJA KOJI NE LAZE (korak C7, 2026-09-13), od kraja do kraja u pregledniku.
 *
 * Tri tvrdnje, svaka s razlogom zasto se ne moze dokazati jedinicno:
 *  (a) nakon potvrde profila indikator prolazi `saving` pa `saved`, i `saved` se pojavi TEK kad je
 *      zapis vidljiv u STVARNOJ IndexedDB pohrani (cita se pohrana, ne DOM);
 *  (b) uz nedostupan IndexedDB indikator kaze `off` i NIJEDAN njegov natpis nikad ne sadrzi korijen
 *      "sprem" (mjeri se kroz MutationObserver, dakle svaki natpis koji je ikad bio na ekranu);
 *  (c) negativna kontrola: bez ijedne promjene indikator nikad ne prijedje u `saved`.
 *
 * Prijelazi se biljeze MutationObserverom u stranici, ne uzorkovanjem iz testa: `saving` na brzoj
 * pohrani traje krace od jednog ocitanja, pa bi uzorkovanje tvrdilo da ga nije bilo.
 */
const FIXTURE = path.resolve('tests/fixtures/docx/fer-diplomski-prazni-odlomci.docx');
const DB = 'lekta-local-documents';
const STORE = 'sessions';

type Prijelaz = { state: string; text: string; t: number };

declare global {
  interface Window { __lektaSaveLog?: Prijelaz[] }
}

/** Biljezi SVAKU promjenu stanja ili teksta indikatora, s vremenom stranice. */
async function pratiIndikator(page: Page): Promise<void> {
  await page.evaluate(() => {
    const el = document.getElementById('radDocSave');
    if (!el) throw new Error('nema #radDocSave');
    window.__lektaSaveLog = [{ state: el.dataset.saveState ?? '', text: el.textContent ?? '', t: Date.now() }];
    new MutationObserver(() => {
      window.__lektaSaveLog!.push({ state: el.dataset.saveState ?? '', text: el.textContent ?? '', t: Date.now() });
    }).observe(el, { attributes: true, childList: true, characterData: true, subtree: true });
  });
}

const dnevnik = (page: Page): Promise<Prijelaz[]> => page.evaluate(() => window.__lektaSaveLog ?? []);
const ocistiDnevnik = (page: Page): Promise<void> => page.evaluate(() => { window.__lektaSaveLog = []; });

function sessionIdIzUrla(url: string): string {
  const id = new URLSearchParams(new URL(url).hash.slice(1)).get('session');
  if (!id) throw new Error(`URL nema #session=: ${url}`);
  return id;
}

/** Cita `profile` iz STVARNE pohrane, mimo aplikacije. */
async function zapisaniProfil(page: Page, id: string): Promise<string | null> {
  return page.evaluate(async ({ db, store, id }) => {
    const open = await new Promise<IDBDatabase>((res, rej) => { const r = indexedDB.open(db); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    try {
      const rec = await new Promise<any>((res, rej) => { const r = open.transaction(store, 'readonly').objectStore(store).get(id); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
      return rec?.profile?.profileDefinitionId ?? null;
    } finally { open.close(); }
  }, { db: DB, store: STORE, id });
}

const nosiSprem = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().includes('sprem');

test.describe('C7: indikator spremanja', () => {
  test.setTimeout(300_000);

  test('(a) potvrda profila: saving pa saved, a saved tek kad je zapis u IndexedDB', async ({ page }) => {
    await page.goto('/rad/');
    await page.locator('#analyticsDecline').click({ timeout: 3_000 }).catch(() => {});
    await cekajApp(page);
    await pratiIndikator(page);

    // Dokument je prvi zapis: indikator ga pokaze kao saved (zapis dokumenta je potvrdjen upis).
    await page.locator('#fileInput').setInputFiles(FIXTURE);
    await expect(page.locator('#radDocBar')).toBeVisible();
    await expect(page).toHaveURL(/#session=/, { timeout: 20_000 });
    const id = sessionIdIzUrla(page.url());
    await expect(page.locator('#radDocSave')).toHaveAttribute('data-save-state', 'saved', { timeout: 20_000 });
    expect(await zapisaniProfil(page, id), 'prije potvrde u pohrani nema profila').toBeNull();

    // Od ovog trenutka gledamo SAMO prijelaze koje proizvede potvrda profila.
    await ocistiDnevnik(page);
    await cekajKorak(page, '2');
    await potvrdiProfil(page);

    // ZAPIS SE CEKA U POHRANI, ne u DOM-u. `t` je vrijeme stranice u trenutku kad je pohrana odgovorila.
    const tPohrana = await expect.poll(async () => (await zapisaniProfil(page, id)) ? Date.now() : null,
      { timeout: 30_000, message: 'profil se mora pojaviti u IndexedDB' }).toBeTruthy().then(() => Date.now());
    void tPohrana;
    await expect(page.locator('#radDocSave')).toHaveAttribute('data-save-state', 'saved', { timeout: 20_000 });

    const log = await dnevnik(page);
    const stanja = log.map((p) => p.state);
    expect(stanja, 'potvrda mora proci kroz saving').toContain('saving');
    const iSaving = stanja.indexOf('saving');
    const iSaved = stanja.indexOf('saved', iSaving);
    expect(iSaved, 'saved mora doci POSLIJE saving').toBeGreaterThan(iSaving);
    // U trenutku kad je DOM prvi put rekao saved, pohrana je zapis vec imala: cita se ponovno, i to
    // je tvrdnja o pohrani, ne o DOM-u. Ako bi indikator bio optimistican, ovdje bi profil bio null
    // bar u jednom od prolaza (vidi negativnu kontrolu u tests/workspace-save-state.test.ts).
    expect(await zapisaniProfil(page, id)).not.toBeNull();
    expect(log[iSaved].text, 'saved nosi natpis Spremljeno s vremenom').toMatch(/^Spremljeno \d\d:\d\d$/);
    expect(log[iSaving].text).toBe('Zapisujem');
  });

  test('(b) bez IndexedDB: indikator kaze off i nijedan natpis nikad ne sadrzi sprem', async ({ page }) => {
    // Uklanja se PRIJE ucitavanja, pa `detectStorage()` u ruti vidi nedostupnu pohranu.
    await page.addInitScript(() => {
      Object.defineProperty(window, 'indexedDB', { value: undefined, configurable: true });
    });
    await page.goto('/rad/');
    await page.locator('#analyticsDecline').click({ timeout: 3_000 }).catch(() => {});
    await cekajApp(page);
    await pratiIndikator(page);
    await page.locator('#fileInput').setInputFiles(FIXTURE);
    await expect(page.locator('#radDocBar')).toBeVisible();
    await expect(page.locator('#radDocSave')).toHaveAttribute('data-save-state', 'off');
    await expect(page.locator('#radDocSave')).toHaveText('Bez lokalne pohrane');
    await expect(page.locator('#radDocSave')).toBeVisible();
    // Bez pohrane URL ne dobiva #session= (nema sto ponuditi).
    await cekajKorak(page, '2');
    await potvrdiProfil(page);
    await expect(page.locator('#resultView')).toBeVisible({ timeout: 120_000 });
    expect(page.url()).not.toMatch(/#session=/);

    const log = await dnevnik(page);
    expect(log.length, 'sentinel: dnevnik mora imati bar pocetni zapis').toBeGreaterThan(0);
    for (const p of log) expect(nosiSprem(p.text), `natpis "${p.text}" tvrdi spremanje bez pohrane`).toBe(false);
    expect(log.at(-1)?.state).toBe('off');
  });

  test('(c) negativna kontrola: bez ijedne promjene indikator ne prelazi u saved', async ({ page }) => {
    await page.goto('/rad/');
    await cekajApp(page);
    await pratiIndikator(page);
    // Vrijeme da se sve sto boot pokrece (obnova, detekcija) smiri; bez dokumenta nema sto zapisati.
    await page.waitForTimeout(3_000);
    const log = await dnevnik(page);
    expect(log.length).toBeGreaterThan(0);
    expect(log.map((p) => p.state)).not.toContain('saved');
    expect(log.map((p) => p.state)).not.toContain('saving');
    await expect(page.locator('#radDocSave')).toHaveAttribute('data-save-state', 'idle');
    await expect(page.locator('#radDocSave')).toBeHidden();
  });
});

import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';
import { potvrdiProfil } from './confirm-profile';
import { cekajApp, cekajKorak } from './app-ready';

/**
 * ODABIR POPRAVAKA PREZIVI OSVJEZAVANJE STRANICE (korak C6, 2026-09-12), od kraja do kraja.
 *
 * Tok: analiza, ulazak u fazu popravka, promjena JEDNE kucice kroz ledger (kao korisnik), cekanje
 * da zapis stigne u IndexedDB (cita se STVARNA pohrana, ne DOM), F5 na `/rad/#session=...`,
 * ponovna analiza, ponovni ulazak u fazu popravka: ista kucica je u istom stanju.
 *
 * NEGATIVNA KONTROLA: isti zapis s podmetnutim drugim otiskom ponude (`itemsDigest`) se NE vraca;
 * kucica je opet u zadanom stanju i korisniku se KAZE da je odabir odbacen. Bez nje bi pozitivna
 * tvrdnja mogla prolaziti i zato sto je kucica u tom stanju po zadanom, a ne zato sto je vracena.
 *
 * Panel na dev posluzitelju je SERVERSKI (repairEndpoint je konfiguriran), dakle put koji korisnik
 * s konfiguriranim serverom stvarno vidi; jedinicni testovi pokrivaju lokalni panel.
 */
const fixture = path.resolve('tests/fixtures/docx/fer-diplomski-prazni-odlomci.docx');
const DB = 'lekta-local-documents';
const STORE = 'sessions';

async function prviDolazak(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    const st = document.createElement('style');
    st.textContent = 'html,body,*{scroll-behavior:auto!important}';
    document.documentElement.appendChild(st);
  });
  await page.goto('/rad/');
  await page.locator('#analyticsDecline').click({ timeout: 3_000 }).catch(() => {});
  await cekajApp(page);
  await page.locator('#fileInput').setInputFiles(fixture);
  await cekajKorak(page, '2');
  await expect(page.locator('#analyzeBtn')).toBeEnabled();
  await page.locator('#analyzeBtn').click();
  await potvrdiProfil(page);
  await expect(page.locator('#resultView')).toBeVisible({ timeout: 120_000 });
}

/**
 * Nakon obnove sesije profil je vec potvrdjen (C4), pa kartice potvrde obicno NEMA i klik na
 * `#analyzeBtn` odmah pokrece analizu. Oba ishoda se cekaju zajedno, bez ocitavanja trenutnog stanja
 * (isti obrazac kao `document-revisions.spec.ts`).
 */
async function analizaNakonObnove(page: Page) {
  await cekajApp(page);
  await expect(page.locator('#radDocBar')).toBeVisible({ timeout: 30_000 });
  await cekajKorak(page, '2');
  const gumb = page.locator('#analyzeBtn');
  await expect(gumb).toBeEnabled({ timeout: 60_000 }).catch(() => {});
  await gumb.click({ timeout: 10_000 }).catch(() => {});
  await expect(page.locator('[data-confirm-profile]:visible, #resultView:visible').first()).toBeVisible({ timeout: 120_000 });
  if ((await page.locator('#resultView:not(.hidden)').count()) === 0) await potvrdiProfil(page);
  await expect(page.locator('#resultView')).toBeVisible({ timeout: 120_000 });
}

async function udjiUPopravak(page: Page) {
  const safe = page.locator('#resultCockpit [data-cockpit-action="repair-safe"]');
  const simulate = page.locator('#resultCockpit [data-cockpit-action="simulate-repair"]');
  const safeEnabled = (await safe.count()) > 0 && (await safe.first().isEnabled());
  const simulateEnabled = (await simulate.count()) > 0 && (await simulate.first().isEnabled());
  expect(safeEnabled || simulateEnabled, 'ni repair-safe ni simulate-repair nisu omoguceni').toBe(true);
  await (safeEnabled ? safe : simulate).first().click();
  await expect(page.locator('#repairView')).toBeVisible();
  await expect(page.locator('#repairPanelMount .lekta-repair-trigger__btn')).toBeVisible();
}

/** Stanje kucice za dani ruleId u skrivenoj listi (izvor istine za kontroler). */
async function kucica(page: Page, ruleId: string): Promise<boolean | null> {
  return page.evaluate((id) => {
    const cb = document.querySelector<HTMLInputElement>(`#repairPanelMount li.lekta-repair-panel__item[data-rule-id="${id}"] input[type="checkbox"]`);
    return cb ? cb.checked : null;
  }, ruleId);
}

/** Preklopi kucicu KAO KORISNIK: kroz redak ledgera, pa zatvori ledger. */
async function preklopiKrozLedger(page: Page, ruleId: string) {
  await page.locator('#repairPanelMount .lekta-repair-trigger__btn').click();
  const ledger = page.locator('.modal-backdrop[data-lekta-repair-ledger-modal]');
  await expect(ledger).toBeVisible();
  await ledger.locator(`.lekta-repair-ledger-row[data-rule-id="${ruleId}"]`).click();
  await page.keyboard.press('Escape');
  await expect(ledger).toBeHidden();
}

function sessionIdIzUrla(url: string): string {
  const hash = new URL(url).hash;
  const id = new URLSearchParams(hash.slice(1)).get('session');
  if (!id) throw new Error(`URL nema #session=: ${url}`);
  return id;
}

/** Cita `workspace.repairSelection` iz STVARNE IndexedDB pohrane, mimo aplikacije. */
async function zapisaniOdabir(page: Page, id: string): Promise<{ selected: string[]; itemsDigest: string } | null> {
  return page.evaluate(async ({ db, store, id }) => {
    const open = await new Promise<IDBDatabase>((res, rej) => { const r = indexedDB.open(db); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    try {
      const rec = await new Promise<any>((res, rej) => { const r = open.transaction(store, 'readonly').objectStore(store).get(id); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
      const s = rec?.workspace?.repairSelection;
      return s ? { selected: [...s.selected], itemsDigest: String(s.itemsDigest) } : null;
    } finally { open.close(); }
  }, { db: DB, store: STORE, id });
}

/** Podmetne drugi otisak ponude u zapis (negativna kontrola), izravno u pohrani. */
async function podmetniOtisak(page: Page, id: string, digest: string) {
  await page.evaluate(async ({ db, store, id, digest }) => {
    const open = await new Promise<IDBDatabase>((res, rej) => { const r = indexedDB.open(db); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    try {
      const tx = open.transaction(store, 'readwrite');
      const os = tx.objectStore(store);
      const rec = await new Promise<any>((res, rej) => { const r = os.get(id); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
      if (!rec?.workspace?.repairSelection) throw new Error('zapis nema repairSelection; kontrola bi bila vakuumska');
      rec.workspace.repairSelection.itemsDigest = digest;
      await new Promise<void>((res, rej) => { const r = os.put(rec); r.onsuccess = () => res(); r.onerror = () => rej(r.error); });
      await new Promise<void>((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
    } finally { open.close(); }
  }, { db: DB, store: STORE, id, digest });
}

test.describe('C6: odabir popravaka prezivi F5', () => {
  test.setTimeout(600_000);

  test('oznaci kucicu, F5 na #session=, nakon ponovne analize ista kucica; drugi otisak NE vraca odabir', async ({ page }) => {
    await prviDolazak(page);
    await expect(page).toHaveURL(/#session=/, { timeout: 20_000 });
    const id = sessionIdIzUrla(page.url());
    await udjiUPopravak(page);

    // Prva PREDODABRANA stavka (prekrsena): preklop je promjena iz zadanog stanja, pa se poslije
    // obnove ne moze zamijeniti s predodabirom.
    const ruleId = await page.evaluate(() => {
      const cb = [...document.querySelectorAll<HTMLInputElement>('#repairPanelMount li.lekta-repair-panel__item input[type="checkbox"]')].find((c) => c.checked);
      return cb?.closest<HTMLElement>('li')?.dataset.ruleId ?? null;
    });
    expect(ruleId, 'fixture mora imati bar jednu predodabranu stavku; inace se promjena ne moze izmjeriti').toBeTruthy();
    expect(await kucica(page, ruleId!)).toBe(true);
    await preklopiKrozLedger(page, ruleId!);
    expect(await kucica(page, ruleId!), 'ledger mora preklopiti kucicu').toBe(false);

    // ZAPIS SE CEKA U POHRANI, ne pretpostavlja: pisac koalescira 250 ms i pise asinkrono.
    await expect.poll(async () => {
      const z = await zapisaniOdabir(page, id);
      return z ? z.selected.some((k) => k.endsWith(`|${ruleId}`)) : 'nema zapisa';
    }, { timeout: 20_000, message: 'zapis u IndexedDB mora izbaciti preklopljenu stavku iz selected' }).toBe(false);
    const zapis = (await zapisaniOdabir(page, id))!;
    expect(zapis.selected.length, 'ostale predodabrane stavke ostaju zapisane').toBeGreaterThan(0);
    expect(zapis.itemsDigest).toMatch(/^[0-9a-f]{8}$/);

    // F5. Sesija se obnavlja iz fragmenta, analiza ide iznova, ponuda se ponovno slaze.
    await page.reload();
    await expect(page).toHaveURL(new RegExp(`#session=${id}`));
    await analizaNakonObnove(page);
    await udjiUPopravak(page);
    expect(await kucica(page, ruleId!), 'ista kucica mora ostati NEOZNACENA nakon obnove').toBe(false);
    await expect(page.locator('#workspace-status')).not.toContainText('odbacen');

    // NEGATIVNA KONTROLA: drugi otisak ponude. Isti zapis, isti dokument, ali snimka tvrdi da je
    // nastala nad drugom ponudom; odabir se NE vraca i to se kaze.
    await podmetniOtisak(page, id, 'deadbeef');
    expect((await zapisaniOdabir(page, id))?.itemsDigest).toBe('deadbeef');
    await page.reload();
    await analizaNakonObnove(page);
    await udjiUPopravak(page);
    expect(await kucica(page, ruleId!), 'uz drugi otisak kucica je opet u ZADANOM stanju (predodabrana)').toBe(true);
    await expect(page.locator('#workspace-status')).toBeVisible();
    await expect(page.locator('#workspace-status')).toContainText('odbacen');
  });
});

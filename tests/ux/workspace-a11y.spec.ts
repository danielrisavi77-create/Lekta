import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { potvrdiProfil } from './confirm-profile';
import { cekajApp, cekajKorak } from './app-ready';

/**
 * PRISTUPACNOST RADNOG PROSTORA `/rad/` KROZ TRI FAZE (korak D, 2026-09-13).
 *
 * Sve se MJERI U PREGLEDNIKU, ne pregledom koda: fokus kroz `document.activeElement`, vidljivost
 * fokusa kroz `getComputedStyle`, prelijevanje kroz `scrollWidth`/`clientWidth`, smanjeno kretanje
 * kroz `emulateMedia` i `document.getAnimations()`. Tvrdnja o prisutnosti klase ovdje ne vrijedi
 * nista, jer klasa moze stajati na elementu koji preglednik ne crta.
 *
 * SENTINELI su dio svake tvrdnje o fokusu: prije nego se tvrdi GDJE je fokus, tvrdi se da
 * fokusabilnih elemenata u fazi ima vise od nule i da `activeElement` nije `body`. Bez toga bi
 * "fokus je unutar faze" prolazio i nad praznom fazom, jer `contains(null)` nije istina ali ni
 * mjerenje.
 *
 * Zasto zaseban od `workspace-entry.spec.ts`: onaj mjeri ULAZ i pojedine ekrane; ovaj mjeri da se
 * cijeli tok da proci bez misa i bez ocnog kontakta s ekranom, sto je druga os.
 *
 * MUTACIJE (izvedene, ne opisane; vidi poruku commita): (1) u `repair-phase.ts` maknut povrat fokusa
 * na okidac, tvrdnja o izlasku pada; (2) u `rad/index.html` dodan `tabindex="-1"` na `#browseBtn`,
 * tvrdnja o Tab redoslijedu pada.
 */
const FIXTURE = path.resolve('tests/fixtures/docx/fer-diplomski-prazni-odlomci.docx');

/**
 * KANDIDATI ZA TAB REDOSLIJED: kontrole koje korisnik VIDI u korijenu, u DOM redoslijedu.
 *
 * Racunaju se iz vrste elementa, NE iz `tabindex`: da se racunalo iz `tabindex`, gumb s podmetnutim
 * `tabindex="-1"` ispao bi iz ocekivanja umjesto iz stvarnosti, i mutacija ne bi ugrizla. Izuzeci su
 * imenovani i svaki ima razlog:
 *  - `role="tab"` i `role="menuitem"`: roving tabindex, u tim skupinama se krece strelicama i to je
 *    ispravan obrazac (WAI-ARIA), pa ih Tab i NE SMIJE obici sve;
 *  - `input[type="file"]`: skriveni izvorni izbornik datoteke iza dropzonea (`.sr-only`), koji vec
 *    ima vlastitu ulogu gumba;
 *  - elementi koje preglednik ne crta (`getClientRects` prazan ili `visibility:hidden`), jer Tab do
 *    njih ne dolazi ni u ispravnom sucelju.
 */
async function kandidati(page: Page, korijen: string): Promise<string[]> {
  return page.evaluate((sel) => {
    const root = document.querySelector(sel);
    if (!root) return [];
    const sve = [...root.querySelectorAll<HTMLElement>(
      'button,a[href],input,select,textarea,summary,[role="button"],[tabindex="0"]',
    )];
    const out: string[] = [];
    let n = 0;
    for (const el of sve) {
      if (el.hasAttribute('disabled') || el.closest('[inert],[aria-hidden="true"]')) continue;
      const role = el.getAttribute('role');
      if (role === 'tab' || role === 'menuitem') continue;
      if (el instanceof HTMLInputElement && el.type === 'file') continue;
      if (!el.getClientRects().length) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none') continue;
      const id = el.id || `${el.tagName.toLowerCase()}#${n}`;
      if (out.includes(id)) continue;
      el.dataset.a11yIdx = String(out.length);
      out.push(id);
      n++;
    }
    return out;
  }, korijen);
}

type Stanica = { idx: number | null; unutar: boolean; tag: string; id: string; fokusVidljiv: boolean };

/** Sto je trenutno aktivno, i vidi li se to. Fokusni prsten je globalni `:focus-visible{box-shadow}`. */
async function aktivno(page: Page, korijen: string): Promise<Stanica> {
  return page.evaluate((sel) => {
    const a = document.activeElement as HTMLElement | null;
    const root = document.querySelector(sel);
    if (!a || a === document.body) return { idx: null, unutar: false, tag: 'BODY', id: '', fokusVidljiv: false };
    const cs = getComputedStyle(a);
    const prsten = a.matches(':focus-visible') && (cs.boxShadow !== 'none' || (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0));
    const idx = a.dataset.a11yIdx;
    return { idx: idx === undefined ? null : Number(idx), unutar: !!root && root.contains(a), tag: a.tagName, id: a.id, fokusVidljiv: prsten };
  }, korijen);
}

/**
 * Prodje Tabom kroz korijen pocevsi od sidra IZVAN njega i vrati redom kandidate koje je fokus
 * pogodio. Staje kad fokus izadje iz korijena nakon sto je u njemu bio, ili kad potrosi rezervu.
 */
async function prodjiTabom(page: Page, sidro: string, korijen: string, ocekivano: number): Promise<{ posjeceni: number[]; bezPrstena: string[] }> {
  await page.locator(sidro).focus();
  const posjeceni: number[] = [];
  const bezPrstena: string[] = [];
  let bioUnutra = false;
  for (let i = 0; i < ocekivano + 12; i++) {
    await page.keyboard.press('Tab');
    let s = await aktivno(page, korijen);
    // WEBKIT CITA PRSTEN S ZAKASNJENJEM: uz `transition: all` i `prefers-reduced-motion` (koji trajanje
    // skrati na 0,000001 s) WebKit u prvom ocitanju nakon Tab-a vrati MEDJUVRIJEDNOST prijelaza, oblik
    // `none` prosiren u prozirne sjene (`rgba(0,0,0,0) 0 0 0 0`), a 250 ms poslije stvarnu vrijednost
    // (izmjereno sondom u koraku D). Chromium vraca konacnu vrijednost odmah. Zato se prsten koji
    // nedostaje potvrdjuje drugim ocitanjem; fokus (idx) se cita iz prvog, jer on ne kasni.
    if (s.unutar && !s.fokusVidljiv) {
      await page.waitForTimeout(120);
      const ponovno = await aktivno(page, korijen);
      if (ponovno.idx === s.idx) s = ponovno;
    }
    if (s.unutar) {
      bioUnutra = true;
      if (s.idx !== null) posjeceni.push(s.idx);
      if (!s.fokusVidljiv) bezPrstena.push(`${s.tag}#${s.id}`);
    } else if (bioUnutra) break;
    if (s.tag === 'BODY') break;
  }
  return { posjeceni, bezPrstena };
}

/** Sentinel pa tvrdnja: fokus je unutar korijena, na necemu sto NIJE body. */
async function fokusUnutar(page: Page, korijen: string, gdje: string): Promise<void> {
  const n = (await kandidati(page, korijen)).length;
  expect(n, `sentinel: ${gdje} nema nijednu fokusabilnu kontrolu, tvrdnja o fokusu bi bila vakuumska`).toBeGreaterThan(0);
  const s = await aktivno(page, korijen);
  expect(s.tag, `${gdje}: fokus je pao na body`).not.toBe('BODY');
  expect(s.unutar, `${gdje}: fokus je na ${s.tag}#${s.id}, izvan ${korijen}`).toBe(true);
}

/** Vodoravno prelijevanje dokumenta i obrasca, kako ga korisnik vidi (scrollWidth naspram clientWidth). */
async function prelijevanje(page: Page): Promise<{ html: [number, number]; wrap: [number, number] }> {
  return page.evaluate(() => {
    const h = document.documentElement;
    const w = document.querySelector('.analyzer-wrap') as HTMLElement | null;
    return { html: [h.scrollWidth, h.clientWidth], wrap: w ? [w.scrollWidth, w.clientWidth] : [0, 0] };
  });
}

async function bezVodoravnogSkrola(page: Page, gdje: string): Promise<void> {
  const m = await prelijevanje(page);
  // Sentinel: mjere postoje. Nula bi znacila da se mjeri element koji nije iscrtan.
  expect(m.html[1], `sentinel: ${gdje} clientWidth je 0`).toBeGreaterThan(0);
  expect(m.wrap[1], `sentinel: ${gdje} .analyzer-wrap nije iscrtan`).toBeGreaterThan(0);
  expect(m.html[0], `${gdje}: dokument se vodoravno prelijeva (${m.html[0]} > ${m.html[1]})`).toBeLessThanOrEqual(m.html[1] + 1);
  expect(m.wrap[0], `${gdje}: obrazac se vodoravno prelijeva (${m.wrap[0]} > ${m.wrap[1]})`).toBeLessThanOrEqual(m.wrap[1] + 1);
}

/**
 * Animacije koje se KRECU. `getAnimations()` vraca i dovrsene animacije s `fill`, koje ne mrdaju,
 * pa se broje samo one u stanju `running`; a `motion.css` pod `reduce` skracuje CSS animacije na
 * 0,001 ms, pa ono sto ovdje ostane `running` moze biti samo JS animacija (`element.animate`) ili
 * beskonacna animacija koja tu medijsku ogradu zaobilazi.
 *
 * PRAG OD JEDNOG OKVIRA (16 ms) NA AKTIVNOM TRAJANJU, izmjereno u Firefoxu (korak D): isto pravilo
 * `*{transition-duration:.001ms}` pretvara SVAKU promjenu svojstva na svakom elementu u prijelaz od
 * 0,001 ms, a Firefox te prijelaze (boja i rub na `.rail-step` pri promjeni faze, 24 komada) i 350 ms
 * poslije prijavljuje kao `running`; Chromium i WebKit ih ne navode. Prijelaz od 0,001 ms nista ne
 * pomice, on JEST mehanizam smanjenog kretanja na djelu, pa se ne broji. Sentinel (60 s, beskonacno)
 * prag prolazi i dalje.
 */
async function pokretneAnimacije(page: Page): Promise<string[]> {
  return page.evaluate(() => document.getAnimations()
    .filter((a) => a.playState === 'running')
    .filter((a) => {
      const t = a.effect?.getComputedTiming();
      const trajanje = t ? Number(t.activeDuration) : Infinity;
      return !(Number.isFinite(trajanje) && trajanje <= 16);
    })
    .map((a) => {
      const t = (a.effect as KeyframeEffect | null)?.target as Element | null;
      const ime = (a as CSSAnimation).animationName ?? (a as CSSTransition).transitionProperty ?? a.id ?? 'js';
      return `${ime}@${t ? `${t.tagName.toLowerCase()}${t.id ? '#' + t.id : ''}.${[...t.classList].slice(0, 2).join('.')}` : '?'}`;
    }));
}

async function bezKretanja(page: Page, gdje: string): Promise<void> {
  // Sentinel da mjerenje vidi animaciju kad je ima: podmetne se JS animacija, mora biti izbrojena,
  // pa se ukloni. Bez toga bi `0` bio i rezultat pokvarenog mjerenja.
  const vidiProbu = await page.evaluate(() => {
    const el = document.body;
    const a = el.animate([{ opacity: 1 }, { opacity: 0.99 }], { duration: 60_000, iterations: Infinity });
    const vidi = document.getAnimations().some((x) => x === a && x.playState === 'running');
    a.cancel();
    return vidi;
  });
  expect(vidiProbu, 'sentinel: getAnimations ne vidi podmetnutu animaciju, mjerenje je pokvareno').toBe(true);
  await page.waitForTimeout(350);
  const pokretne = await pokretneAnimacije(page);
  expect(pokretne, `${gdje}: uz prefers-reduced-motion nesto se jos krece: ${pokretne.join(', ')}`).toEqual([]);
}

/**
 * DO NALAZA, I DO KRAJA NJEGOVA CRTANJA.
 *
 * `#resultView` postane vidljiv PRIJE nego je gotov: iz `renderResult` se pokrece asinkroni
 * `renderRepairSection`, koji tek u svom `finally` ponovno crta `#repairEntry` i CIJELI
 * `#resultCockpit`. Tko u tom prozoru krene Tabom, ostane bez fokusa cim zamjena odnese element
 * na kojem fokus stoji (`document.activeElement` padne na `<body>`), pa obilazak stane na pola.
 *
 * IZMJERENO 2026-09-23 (chromium, dev posluzitelj, MutationObserver nad `#resultCockpit`): prozor
 * je bio 343 ms. Reproducirano istim danom uz ciljano kasnjenje `templates-heavy.json` od 3 s:
 * obilazak je stao na 12 odnosno 5 od 22 kontrole. Na CI-ju (`ux-gate`, run 35867005928, master
 * 45208425) isti se pad vidio kao `posjeceni = [0, 1]` uz 22 kandidata; `browser-matrix` (PR #115,
 * run 35862903200) ga je dao u Firefoxu.
 *
 * ZATO SE CEKA `data-result-ready="1"`, deterministican signal koji `src/ui/result-ready-signal.ts`
 * postavlja TEK kad se taj lanac slegne. Nije cekanje na sat: dok se ekran crta, atribut je "0".
 */
async function dodjiDoNalaza(page: Page): Promise<void> {
  await page.locator('#fileInput').setInputFiles(FIXTURE);
  await cekajKorak(page, '2');
  await expect(page.locator('#analyzeProfile .ap-kartica')).toBeVisible({ timeout: 20_000 });
  await potvrdiProfil(page);
  await expect(page.locator('#resultView')).toBeVisible({ timeout: 120_000 });
  await expect(page.locator('#resultView')).toHaveAttribute('data-result-ready', '1', { timeout: 120_000 });
}

test.describe('pristupacnost radnog prostora', () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/rad/');
    // Traka privole prekriva donji rub i hvata Tab; odbija se kao sto to radi korisnik.
    await page.locator('#analyticsDecline').click({ timeout: 3_000 }).catch(() => {});
    await cekajApp(page);
  });

  test('faza Dokument: Tab obilazi svaku kontrolu redom, s vidljivim prstenom, a Enter i Space na dropzoneu otvaraju izbor datoteke', async ({ page }) => {
    const k = await kandidati(page, '#wizardView');
    expect(k.length, 'sentinel: faza Dokument nema kontrola').toBeGreaterThan(1);
    expect(k, 'dropzone i gumb za odabir moraju biti medju kontrolama faze').toEqual(expect.arrayContaining(['dropzone', 'browseBtn']));

    const { posjeceni, bezPrstena } = await prodjiTabom(page, '#themeBtn', '#wizardView', k.length);
    expect(posjeceni, `Tab je preskocio kontrolu ili promijenio redoslijed; kandidati: ${k.join(', ')}`)
      .toEqual(k.map((_, i) => i));
    expect(bezPrstena, 'kontrola dobiva fokus tipkovnicom bez vidljivog prstena').toEqual([]);

    // Enter i Space na dropzoneu otvaraju IZVORNI izbornik datoteke; mjeri se dogadjaj preglednika,
    // ne poziv funkcije.
    for (const tipka of ['Enter', 'Space'] as const) {
      await page.locator('#dropzone').focus();
      expect((await aktivno(page, '#wizardView')).id, 'sentinel: dropzone nije primio fokus').toBe('dropzone');
      const izbornik = page.waitForEvent('filechooser', { timeout: 5_000 });
      await page.keyboard.press(tipka);
      const fc = await izbornik;
      expect(fc.isMultiple(), `${tipka}: izbornik je otvoren, ali za vise datoteka`).toBe(false);
    }
  });

  test('faza Dokument: 200 posto zoom bez vodoravnog skrola; smanjeno kretanje bez ijedne pokretne animacije', async ({ page }) => {
    // 200 posto zoom na zaslonu od 1280 px daje CSS viewport od 640 px (WCAG 1.4.10 mjeri reflow na
    // 320 px pri 400 posto; 640 pri 200 posto je ista os). Preglednik iz testa ne moze mijenjati
    // razinu zooma, ali sirina viewporta u CSS pikselima je ono sto zoom stvarno mijenja.
    await page.setViewportSize({ width: 640, height: 512 });
    await bezVodoravnogSkrola(page, 'Dokument @200%');
    await bezKretanja(page, 'Dokument');
    await page.locator('#fileInput').setInputFiles(FIXTURE);
    await cekajKorak(page, '2');
    await expect(page.locator('#analyzeProfile .ap-kartica')).toBeVisible({ timeout: 20_000 });
    await bezVodoravnogSkrola(page, 'Profil @200%');
    await bezKretanja(page, 'Profil');
  });

  test('list profila: Tab kruzi unutar lista (zamka), Escape vraca fokus na Promijeni', async ({ page }) => {
    await page.locator('#fileInput').setInputFiles(FIXTURE);
    await cekajKorak(page, '2');
    await expect(page.locator('[data-change-profile]')).toBeVisible({ timeout: 20_000 });
    await page.locator('[data-change-profile]').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#profileSheet')).toBeVisible();
    // `trapModal` fokusira gumb zatvaranja tek nakon 30 ms.
    await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest('#profileSheet')), { timeout: 3_000 }).toBe(true);
    await fokusUnutar(page, '#profileSheet', 'list profila');

    // ZAMKA SE MJERI KRUGOM, ne samo ulaskom: `workspace-entry.spec.ts` vec tvrdi da je fokus usao;
    // ovdje se tvrdi da Shift+Tab s PRVOG elementa NE izlazi iz lista nego slijece na zadnji, i da
    // Tab sa zadnjeg slijece na prvi. To je ono sto zamka stvarno radi.
    const kl = await kandidati(page, '#profileSheet');
    expect(kl.length, 'sentinel: list nema kontrola').toBeGreaterThan(2);
    await page.evaluate(() => (document.querySelector('#profileSheet [data-a11y-idx="0"]') as HTMLElement).focus());
    await page.keyboard.press('Shift+Tab');
    let s = await aktivno(page, '#profileSheet');
    expect(s.unutar, `Shift+Tab s prvog elementa je pobjegao iz lista na ${s.tag}#${s.id}`).toBe(true);
    expect(s.idx, 'Shift+Tab s prvog elementa mora sletjeti na ZADNJI').toBe(kl.length - 1);
    await page.keyboard.press('Tab');
    s = await aktivno(page, '#profileSheet');
    expect(s.idx, 'Tab sa zadnjeg elementa mora sletjeti na PRVI').toBe(0);

    await page.keyboard.press('Escape');
    await expect(page.locator('#profileSheet')).toBeHidden();
    const vracen = await page.evaluate(() => !!document.activeElement?.closest('[data-change-profile]'));
    expect(vracen, 'fokus se nakon Escape nije vratio na Promijeni').toBe(true);
  });

  test('faze Nalaz i Popravak: Tab obilazi kontrole redom, ulazak u popravak fokusira odluku, izlazak vraca fokus na CTA', async ({ page }) => {
    test.setTimeout(300_000);
    await dodjiDoNalaza(page);

    // NALAZ. Kontrola je mnogo; dovoljan je jedan prolaz.
    const kn = await kandidati(page, '#resultView');
    expect(kn.length, 'sentinel: nalaz nema kontrola').toBeGreaterThan(3);
    const nalaz = await prodjiTabom(page, '#themeBtn', '#resultView', kn.length);
    expect(nalaz.posjeceni, `nalaz: Tab je preskocio kontrolu ili promijenio redoslijed; kandidati: ${kn.join(', ')}`)
      .toEqual(kn.map((_, i) => i));
    expect(nalaz.bezPrstena, 'nalaz: kontrola dobiva fokus tipkovnicom bez vidljivog prstena').toEqual([]);
    await bezKretanja(page, 'Nalaz');

    // ULAZAK TIPKOVNICOM: fokus na CTA pa Enter, ne klik misem. Tako se mjeri i put kojim
    // `enterRepairPhase` sazna tko ga je otvorio (activeElement), a ne samo da se povrsina otvorila.
    const safe = page.locator('#resultCockpit [data-cockpit-action="repair-safe"]');
    const simulate = page.locator('#resultCockpit [data-cockpit-action="simulate-repair"]');
    const safeEnabled = (await safe.count()) > 0 && (await safe.first().isEnabled());
    const simulateEnabled = (await simulate.count()) > 0 && (await simulate.first().isEnabled());
    expect(safeEnabled || simulateEnabled, 'ni repair-safe ni simulate-repair nisu omoguceni').toBe(true);
    const cta = (safeEnabled ? safe : simulate).first();
    const ctaAkcija = await cta.getAttribute('data-cockpit-action');
    await cta.focus();
    expect(await cta.evaluate((el) => el === document.activeElement), 'sentinel: CTA nije primio fokus').toBe(true);
    await page.keyboard.press('Enter');
    await expect(page.locator('#repairView')).toBeVisible();
    await expect(page.locator('#resultView')).toBeHidden();
    await fokusUnutar(page, '#repairView', 'ulazak u popravak');
    // Slijetanje je na ODLUCI (privola ili glavni gumb), ne na naslovu: `repairLanding` to bira, i to
    // je jaca garancija od naslova jer korisnik odmah ima sto pritisnuti.
    const naKontroli = await page.evaluate(() => {
      const a = document.activeElement as HTMLElement | null;
      return !!a && a.matches('button,a[href],input,select,textarea,[role="button"]');
    });
    expect(naKontroli, 'fokus pri ulasku mora sletjeti na kontrolu, ne na kontejner').toBe(true);

    // POPRAVAK: Tab redoslijed. Gumb za povratak je prva kontrola faze.
    const kp = await kandidati(page, '#repairView');
    expect(kp.length, 'sentinel: faza Popravak nema kontrola').toBeGreaterThan(1);
    expect(kp[0], 'povratak na nalaz mora biti prva kontrola faze').toBe('repairBackToResults');
    const popravak = await prodjiTabom(page, '#themeBtn', '#repairView', kp.length);
    expect(popravak.posjeceni, `popravak: Tab je preskocio kontrolu ili promijenio redoslijed; kandidati: ${kp.join(', ')}`)
      .toEqual(kp.map((_, i) => i));
    expect(popravak.bezPrstena, 'popravak: kontrola dobiva fokus tipkovnicom bez vidljivog prstena').toEqual([]);
    await bezKretanja(page, 'Popravak');
    await bezVodoravnogSkrola(page, 'Popravak');

    // IZLAZAK TIPKOVNICOM: fokus se vraca na CTA koji je fazu otvorio. Do koraka D je ovdje bio
    // `BODY`, jer je `scrollToRepairPanel` zvao `enterRepairPhase(null)` i okidac nikad nije bio
    // zapamcen; jedinicni test je jamstvo dokazivao samo uz izricito proslijedjen gumb.
    await page.locator('#repairBackToResults').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#resultView')).toBeVisible();
    await expect(page.locator('#repairView')).toBeHidden();
    const poslije = await page.evaluate(() => {
      const a = document.activeElement as HTMLElement | null;
      return { tag: a?.tagName ?? 'null', akcija: a?.getAttribute('data-cockpit-action') ?? null };
    });
    expect(poslije.tag, 'nakon izlaska fokus je pao na body').not.toBe('BODY');
    expect(poslije.akcija, 'fokus se nakon izlaska mora vratiti na CTA koji je popravak otvorio').toBe(ctaAkcija);
  });
});

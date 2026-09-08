import path from 'node:path';
import { expect, test } from '@playwright/test';
import { potvrdiProfil } from './confirm-profile';
import { cekajApp, cekajKorak } from './app-ready';

const FIXTURE = path.resolve('tests/fixtures/docx/fer-diplomski-prazni-odlomci.docx');

/**
 * UX SPECOVI RADNOG PROSTORA `/rad/`. Zaseban od `intake-entry`, jer gard u
 * `tests/intake-entry-boundary.test.ts` brani `goto('/')` svakoj datoteci koja spominje
 * analizatorske selektore, a mjeri po DATOTECI (po testu ne moze bez parsiranja). Tvrdnje o ulazu
 * i tvrdnje o radnom prostoru zato ne smiju dijeliti datoteku.
 */

test('/rad/: radni prostor je vidljiv ODMAH, bez ijednog klika', async ({ page }) => {
  /**
   * Na `/rad/` korisnik dolazi S DOKUMENTOM, pa nema sto otkljucavati. Do reza je ondje stajao
   * marketinski hero (naslov, demo papir, post-it, ocjena, "Ucitaj rad"), a carobnjak je bio
   * `display:none` iza `.lek-col-form:not(.lek-engaged) .analyzer-wrap`, gdje `.lek-engaged`
   * postavlja ISKLJUCIVO JS na klik tog papira.
   *
   * ZASTO OVA TVRDNJA POSTOJI: cetiri postojeca UX speca (`desktop-flow`, `a11y-states`,
   * `parser-parity`, `repair-panel`) kliknu cover PRIJE nego bilo sto provjere, pa bi svi ostali
   * zeleni i da je carobnjak nevidljiv. Mjere put starog korisnika, ne stanje ekrana.
   */
  await page.goto('/rad/');
  await expect(page.locator('#wizardView')).toBeVisible();
  await expect(page.locator('#dropzone')).toBeVisible();
});

test('/rad/ korak Pravila: potvrda je ekran, kontrole cekaju iza Promijeni', async ({ page }) => {
  /**
   * `UX_PRINCIPLES.md` odjeljak 2 trazi: "jedan redak s popunjenim defaultom, primarna akcija
   * Potvrdi, promjena sekundarna i skrivena iza promijeni, cilj nula do jedan tap". Do
   * 2026-09-07 je bilo obrnuto: devet selectova kao glavni sadrzaj, kartica profila ispod njih,
   * a pokretanje provjere tek na SLJEDECEM koraku.
   *
   * Koraci 2 i 3 su spojeni: potvrda JEST pokretanje, pa `lek-stepnav-2` ("Nastavi na provjeru")
   * vise ne postoji kao treci gumb za istu radnju.
   *
   * PISE SE KAO TEST, NE KAO RUCNO MJERENJE, i to je nauceno danas: rucno uzorkovanje preko
   * `waitForTimeout` dalo je pet razlicitih ocitanja istog stanja, ovisno o tome je li `app.ts`
   * stigao zavrsiti boot. `expect(locator)` ponavlja dok ne istekne, pa mjeri stanje a ne trenutak.
   */
  await page.goto('/rad/');
  await cekajApp(page);
  await page.locator('#fileInput').setInputFiles(FIXTURE);
  // Korak 2 dolazi SAM kad je detekcija pouzdana (`isConfidentDetection`), bez klika na
  // "Nastavi na profil". To je i smisao "nula do jedan tap": kad je studij prepoznat iz
  // dokumenta, korisniku preostaje samo potvrda.
  await cekajKorak(page, '2');

  // Kartica je ekran: vidi se profil i obje akcije.
  // Duzi rok NIJE skrivanje sporosti: kartica se crta u `updateProfile`, koji CEKA pravila
  // profila (`ensureProfileRules`, mrezni dohvat). Na hladnom posluzitelju to premasi zadanih
  // 5 s, pa bi kraci rok mjerio brzinu prvog prevodjenja modula, a ne postojanje kartice.
  await expect(page.locator('#analyzeProfile .ap-kartica')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('[data-confirm-profile]')).toBeVisible();
  await expect(page.locator('[data-change-profile]')).toBeVisible();
  // Provjera se pokrece s OVOG koraka: spajanje 2 i 3.
  await expect(page.locator('#analyzeBtn')).toBeVisible();

  // Kontrole nisu na ekranu: od 2026-09-07 uopce nisu u `#wizardView`, nego u listu izvan
  // `<main>`. Tvrdnja gleda VIDLJIVOST, ne postojanje, pa vrijedi i za jedno i za drugo.
  await expect(page.locator('.wizard-col-profile .form-grid:visible')).toHaveCount(0);
  await page.locator('[data-change-profile]').click();
  await expect(page.locator('#profileSheet')).toBeVisible();
  const vidljivi = await page.locator('#profileSheet .form-grid:visible').count();
  expect(vidljivi, 'list mora otvoriti SVE obrasce profila').toBeGreaterThan(1);
});

test('/rad/ zaglavlje: identitet, ucitani dokument i gdje se obraduje, bez marketinga', async ({ page }) => {
  /**
   * Brif vlasnika: "Marketing je zavrsio onog trenutka kada je student ubacio svoj diplomski."
   * Do 2026-09-07 je zaglavlje radne povrsine nosilo 12 marketinskih poveznica i CTA "Provjeri
   * rad" koji vodi na stranicu na kojoj korisnik vec jest.
   *
   * ZASTO SE MJERI VIDLJIVOST, A NE POSTOJANJE U HTML-u: stara navigacija se na uskom zaslonu
   * krila CSS-om (`.nav-links{display:none}`) i selila u `#mobileNav`. Tvrdnja "nema ih u
   * izvoru" bi zato bila zelena i da su samo premjestene, sto je upravo ono sto se ne zeli.
   */
  await page.goto('/rad/');
  const zaglavlje = page.locator('header.topbar');
  await expect(zaglavlje.getByRole('link', { name: 'Lekta' })).toBeVisible();
  await expect(zaglavlje.locator('a[href*="landing_benchmark"], a[href*="landing_usporedba"], a[href*="#pricing"], a[href*="#faq"]')).toHaveCount(0);
  await expect(zaglavlje.getByRole('link', { name: 'Provjeri rad' })).toHaveCount(0);

  // Bez dokumenta traka NE tvrdi nista: prazno ime uz znacku "Lokalno" bi izgledalo kao da je
  // nesto ucitano. Ovo je stanje korisnika koji dodje izravno na `/rad/`.
  await expect(page.locator('#radDocBar')).toBeHidden();

  await cekajApp(page);
  await page.locator('#fileInput').setInputFiles(FIXTURE);
  await expect(page.locator('#radDocBar')).toBeVisible();
  await expect(page.locator('#radDocName')).toHaveText(path.basename(FIXTURE));
  await expect(page.locator('.nav-rad .local-badge')).toBeVisible();

  // Traka ostaje kroz KORAKE, jer je zaglavlje, a ne dio jednog prikaza. Postojeci
  // `#stepFileName` i `#resultFileName` zive svaki u svom pogledu; da traka bila cetvrti takav
  // pisac, razisla bi se s njima cim se koji pogled preskoci.
  await cekajKorak(page, '2');
  await expect(page.locator('#radDocName')).toHaveText(path.basename(FIXTURE));
});

test('/rad/ zaglavlje: dugo ime datoteke se skracuje, a ne gura kontrole s ekrana', async ({ page }) => {
  /**
   * STVARAN RIZIK, IZMJEREN: `.rad-doc` je flex stavka, a flex stavka se po zadanome NE SMIJE
   * stisnuti ispod sirine svog sadrzaja (`min-width:auto`). Bez `min-width:0` dugo ime gurne
   * lampu i prijavu izvan zaslona umjesto da se skrati.
   *
   * SIRINA SE POSTAVLJA OVDJE, i to je popravak vlastite greske od danas. Prva verzija je mjerila
   * na zadanih 1280 px i imala `test.skip` za sve osim chromiuma. Ondje traka ima 890 px a ime
   * treba 516, dakle pritiska nema i `min-width:0` se nikad ne aktivira: obje mutacije (bez
   * roditeljskog, bez djetetovog, bez oba) PROSLE su zeleno. Isti razred kao gard nad
   * `scroll-margin` ranije danas: tvrdnja postavljena ondje gdje ne moze pasti.
   *
   * Izmjereno na 390 px, s istim dugim imenom:
   *     s `min-width:0`   ime 93 px (skraceno), desni rub lampe 378   <= 390  ispravno
   *     bez               ime 516 px,           desni rub lampe 801   >  390  kvar
   */
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/rad/');
  await cekajApp(page);
  await page.locator('#fileInput').setInputFiles({
    name: 'Diplomski rad - konacna verzija - nakon mentora - ispravljeno - za predaju.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    buffer: (await import('node:fs')).readFileSync(FIXTURE),
  });
  await expect(page.locator('#radDocBar')).toBeVisible();

  const lampa = await page.locator('#themeBtn').boundingBox();
  expect(lampa, 'lampa mora imati mjerljiv polozaj').toBeTruthy();
  expect(lampa!.x + lampa!.width, 'lampa je izgurana izvan zaslona dugim imenom').toBeLessThanOrEqual(390);

  // Ime se mora STVARNO skratiti, a ne samo stati slucajno: bez ove tvrdnje bi prosla i izvedba
  // koja ime prelomi u vise redaka ili ga sakrije, sto nije isto sto i skracivanje.
  const skraceno = await page.locator('#radDocName').evaluate((e) => e.scrollWidth > e.clientWidth + 1);
  expect(skraceno, 'ime mora biti skraceno s trotockom, a ne stati u cijelosti').toBe(true);
});

test('/rad/ zaglavlje: preziviljava obnovu sesije, jer se pretplacuje prije nje', async ({ page }) => {
  /**
   * OVO JE TVRDNJA KOJU KOMENTAR U `workspace/main.ts` DAJE, pa mora biti mjerena, ne vjerovana.
   *
   * `wireDocumentBar()` mora stajati prije nego `restoreDocument` pozove `loadAnalyzerDocument`.
   * `emitAnalyzerDocumentSettled` obavjescuje nad KOPIJOM skupa pretplatnika, izricito zato da
   * pretplatnik dodan TIJEKOM obavijesti ne dobije taj isti dogadjaj; posljedica u drugom smjeru
   * je da pretplatnik dodan POSLIJE propusta prijem obnovljenog dokumenta, pa zaglavlje ostaje
   * prazno iznad uredno ucitanog rada, sto je gore od nepostojece trake.
   *
   * Mutacijom izmjereno gdje je granica STVARNO, jer ju je prvi opis promasio: pomak tik prije
   * `openWorkspace` test NE obara (taj je poziv await-an, pa je ucitavanje i dalje iza njega),
   * a pomak iza `restoreDocument` ga obara. Tvrdnja bez te druge mutacije bila bi vakuumska.
   */
  await page.goto('/rad/');
  await cekajApp(page);
  await page.locator('#fileInput').setInputFiles(FIXTURE);
  await expect(page.locator('#radDocBar')).toBeVisible();
  // Sesija je zapisana tek kad se fragment pojavi u URL-u; bez tog cekanja bi ponovno ucitavanje
  // otislo na golu `/rad/` i test bi mjerio prvi dolazak, ne obnovu.
  await expect(page).toHaveURL(/#session=/, { timeout: 20_000 });

  await page.reload();
  await expect(page.locator('#radDocBar')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('#radDocName')).toHaveText(path.basename(FIXTURE));
});

test('/rad/ list profila: zamka fokusa, izlaz tipkovnicom i povratak fokusa', async ({ page }) => {
  /**
   * OVO JE UGOVOR KOJI PRIJE NIJE POSTOJAO. Do 2026-09-07 su se kontrole otkrivale na mjestu
   * (klasa `lek-izmjena`), pa nije bilo ni zamke fokusa ni izlaza tipkovnicom: Tab je iz zadnjeg
   * izbornika nastavljao u sadrzaj IZA panela, koji je vizualno izgledao kao pozadina.
   *
   * List je zato obican modal (`.modal-backdrop` + `trapModal`), a ne nov sustav. Zamka fokusa,
   * `inert` pozadina, Escape i povratak fokusa dolaze iz `modal-utils.ts`, isto kao za ostalih 12
   * dijaloga na ovoj stranici.
   *
   * ZASTO JE POLOZAJ U DOM-u DIO UGOVORA: `setBackgroundInert` postavlja `inert` na `header.topbar`,
   * `main` i `footer`. List ostavljen unutar `#wizardView` (koji je u `<main>`) postao bi inertan
   * ZAJEDNO s pozadinom, dakle nedostupan tipkovnicom. Svih 12 postojecih modala zato stoji izvan
   * `<main>`, i tvrdnja to mjeri izravno.
   */
  await page.goto('/rad/');
  await cekajApp(page);
  await page.locator('#fileInput').setInputFiles(FIXTURE);
  await expect(page.locator('#analyzeProfile .ap-kartica')).toBeVisible({ timeout: 20_000 });

  const izvanMaina = await page.locator('#profileSheet').evaluate((el) => !el.closest('main'));
  expect(izvanMaina, 'list unutar <main> bio bi inertan zajedno s pozadinom').toBe(true);

  await page.locator('[data-change-profile]').click();
  await expect(page.locator('#profileSheet')).toBeVisible();

  // Fokus je USAO u list. Ne tvrdi se KOJI je element, jer `trapModal` bira gumb zatvaranja, a to
  // je odluka dijeljenog helpera; ugovor je da fokus nije ostao iza panela.
  await expect(page.locator('#profileSheet')).toContainText('Profil fakulteta');
  const fokusUnutra = await page.evaluate(() =>
    !!document.activeElement?.closest('#profileSheet'));
  expect(fokusUnutra, 'fokus je ostao izvan lista, pa zamka ne drzi').toBe(true);

  // Pozadina je stvarno inertna, ne samo vizualno prekrivena.
  await expect(page.locator('main')).toHaveAttribute('inert', '');

  // Izlaz tipkovnicom. Ovo je ono cega prije nije bilo.
  await page.keyboard.press('Escape');
  await expect(page.locator('#profileSheet')).toBeHidden();
  await expect(page.locator('main')).not.toHaveAttribute('inert', '');

  // Fokus se vraca na okidac, inace korisnik nakon zatvaranja pada na vrh dokumenta.
  const vracen = await page.evaluate(() =>
    !!document.activeElement?.closest('[data-change-profile]'));
  expect(vracen, 'fokus se nije vratio na "Promijeni"').toBe(true);
});

test('/rad/ traka koraka: na mobitelu postoji, u jednom retku, s natpisom samo na aktivnom', async ({ page }) => {
  /**
   * Do 2026-09-07 je traka ispod 720 px bila `display:none`, i razlog je bio stvaran: cetiri
   * natpisa se na 390 px lome u TRI retka i uzimaju 108 px pregiba (izmjereno). Posljedica je
   * ipak bila da mobilni korisnik nema NIKAKAV pokazatelj polozaja u toku, dok ga desktop ima.
   *
   * Rjesenje nije bilo sakriti traku nego natpise. Brojevi nose redoslijed, natpis se cuva samo
   * na aktivnom koraku, i cijela informacija stane u jedan redak (40 px umjesto 108).
   *
   * MJERI SE ISCRTANO, NE `textContent`: prvo mjerenje je citalo tekst cvora i javilo sva cetiri
   * natpisa kao vidljiva, iako su tri bila `display:none`. Isti razred kao citanje popisa testova
   * umjesto rezultata: pogled tocan za ono sto mjeri, krivo procitan.
   */
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/rad/');
  const traka = page.locator('.wizard-rail');
  await expect(traka).toBeVisible();

  const m = await traka.evaluate((r) => {
    const koraci = [...r.querySelectorAll('.rail-step')].map((s) => {
      const lbl = s.querySelector('.rail-lbl');
      return {
        y: s.getBoundingClientRect().y,
        natpisVidljiv: !!lbl && getComputedStyle(lbl).display !== 'none',
      };
    });
    return {
      visina: r.getBoundingClientRect().height,
      raspony: Math.max(...koraci.map((k) => k.y)) - Math.min(...koraci.map((k) => k.y)),
      snatpisom: koraci.filter((k) => k.natpisVidljiv).length,
      ukupno: koraci.length,
      prelijeva: r.scrollWidth > r.clientWidth + 1,
    };
  });

  expect(m.ukupno, 'traka mora imati sva cetiri koraka').toBe(4);
  // Jedan redak: razlika u `y` je poravnanje osnovice, ne prelom. Prag od 8 px je iznad te
  // razlike (izmjereno 0,9 px) a daleko ispod visine retka (~22 px), pa razlikuje to dvoje.
  expect(m.raspony, 'koraci su se prelomili u vise redaka').toBeLessThan(8);
  expect(m.visina, 'traka je narasla preko jednog retka').toBeLessThan(56);
  expect(m.prelijeva, 'traka se vodoravno prelijeva').toBe(false);
  // Tocno JEDAN natpis: nula bi znacila da se ne zna gdje si, vise od jednog da se opet lome.
  expect(m.snatpisom, 'natpis mora nositi tocno aktivni korak').toBe(1);
});

test('/rad/ faza carobnjaka: kroz cijeli tok je vidljiv TOCNO jedan prikaz', async ({ page }) => {
  /**
   * `wizard-view.ts` se predstavlja kao JEDINI PISAC PRIKAZA, ali do 2026-09-07 su ga dva mjesta
   * zaobilazila: `setWizardStep` je upisivao `dataset.step` izravno (bez jamstva da je carobnjak
   * uopce vidljiv), a `backToWizardFromResult` je rucno gasio `#resultView` i palio `#wizardView`.
   * Ta dva `classList` poziva bila su tocno ona "disciplina pozivatelja" koju uvod tog modula
   * navodi kao razlog svog postojanja.
   *
   * Invarijanta se mjeri NA SVAKOM KORAKU toka, ne jednom na kraju: kvar dva istovremeno vidljiva
   * prikaza je prolazan i tek ga hod kroz stanja moze uhvatiti.
   */
  const jedan = async (gdje: string) => {
    const vidljivi = await page.evaluate(() =>
      ['wizardView', 'progressView', 'resultView']
        .filter((id) => { const el = document.getElementById(id); return el && !el.classList.contains('hidden'); }));
    expect(vidljivi, `${gdje}: vidljivo ${vidljivi.length} prikaza umjesto jednog (${vidljivi.join(',')})`)
      .toHaveLength(1);
    return vidljivi[0];
  };

  await page.goto('/rad/');
  expect(await jedan('na dolasku')).toBe('wizardView');

  await cekajApp(page);
  await page.locator('#fileInput').setInputFiles(FIXTURE);
  await cekajKorak(page, '2');
  expect(await jedan('poslije uploada')).toBe('wizardView');

  // Pokretanje: analiza pa nalaz. Potvrda je primarna akcija od spajanja koraka 2 i 3.
  await expect(page.locator('#analyzeProfile .ap-kartica')).toBeVisible({ timeout: 20_000 });
  await jedan('s karticom potvrde');
  await potvrdiProfil(page);
  await expect(page.locator('#resultView')).toBeVisible({ timeout: 90_000 });
  expect(await jedan('na nalazu')).toBe('resultView');

  // POVRATAK JE ONO STO JE PUKLO: stari put je rucno gasio jedan prikaz i palio drugi, pa je
  // propust jednog poziva ostavljao dva vidljiva. Sada ide kroz `renderView`.
  const natrag = page.locator('#resultBackProfile');
  if (await natrag.count()) {
    await natrag.click();
    await expect(page.locator('#wizardView')).toBeVisible();
    expect(await jedan('poslije povratka s nalaza')).toBe('wizardView');
  }
});

test('/rad/ ekran provjere: faze i ime dokumenta, bez postotka i bez spinnera', async ({ page }) => {
  /**
   * Brif vlasnika: manje osjecaja loading screena, vise osjecaja stvarnog pregleda rada. Do
   * 2026-09-07 su ovdje bili spinner, "Analiziram dokument...", traka napretka, "0%" i snop od
   * 12 listova s ravninom skena.
   *
   * POSTOTAK JE ONO STO SE NE SMIJE VRATITI. Motor ga daje kao PRAG faze, ne kao mjeru preostalog
   * vremena; ispisan broj bi tvrdio preciznost koju nema. Tvrdnja gleda cijeli vidljivi tekst
   * prikaza, ne pojedini element, jer bi provjera po ID-u prosla cim se broj preseli drugamo.
   */
  await page.goto('/rad/');
  await cekajApp(page);
  await page.locator('#fileInput').setInputFiles(FIXTURE);
  await expect(page.locator('#analyzeProfile .ap-kartica')).toBeVisible({ timeout: 20_000 });
  await potvrdiProfil(page);

  const pv = page.locator('#progressView');
  await expect(pv).toBeVisible({ timeout: 15_000 });

  await expect(pv.locator('.pv-file')).toHaveText(path.basename(FIXTURE));
  await expect(pv.locator('h3')).toHaveText('Provjeravam rad');
  await expect(pv.locator('.pv-local')).toContainText('ne napušta uređaj');
  await expect(pv.locator('#cancelAnalysisBtn')).toHaveText('Prekini provjeru');

  const stanje = await pv.evaluate((v) => {
    const faze = [...v.querySelectorAll('.pscan__phase')];
    return {
      ukupno: faze.length,
      aktivnih: faze.filter((li) => (li as HTMLElement).dataset.state === 'active').length,
      // Gotova faza mora pokazivati PROSLO vrijeme, dakle drugi tekst od onoga koji motor salje.
      gotoviProslo: faze
        .filter((li) => (li as HTMLElement).dataset.state === 'done')
        .every((li) => {
          const sad = li.querySelector('.pscan__sad') as HTMLElement | null;
          const bilo = li.querySelector('.pscan__bilo') as HTMLElement | null;
          return !!sad && !!bilo && getComputedStyle(sad).display === 'none'
            && getComputedStyle(bilo).display !== 'none';
        }),
      tekst: (v as HTMLElement).innerText,
      spinnera: v.querySelectorAll('.spinner, .progress-track, #progressBar, #progressPercent').length,
    };
  });

  expect(stanje.ukupno, 'popis mora nositi sve faze motora').toBe(7);
  expect(stanje.aktivnih, 'najvise jedna faza smije biti aktivna').toBeLessThanOrEqual(1);
  expect(stanje.gotoviProslo, 'gotova faza mora biti u proslom vremenu').toBe(true);
  expect(stanje.spinnera, 'spinner, traka ili postotak su se vratili').toBe(0);
  expect(stanje.tekst, `postotak je ponovno na ekranu: ${stanje.tekst}`).not.toMatch(/\d+\s*%/);
});

test('/rad/ nalaz: sazetak nadjacava ocjenu, i to se mjeri omjerom a ne dojmom', async ({ page }) => {
  /**
   * Brif vlasnika: "Lekta nije Grammarly score dashboard. Najveca vrijednost nije 'Tvoj rad ima
   * 71/100' nego 'Nasao sam sest stvari. Tri mogu popraviti automatski.'" Do 2026-09-07 je ocjena
   * bila tamni uredaj 321x353 px s halo prstenom, a nalazi su pocinjali na y=690, ispod pregiba.
   *
   * MJERI SE OMJER VELICINE FONTA, i to je nauceno na ovoj izmjeni. Prva izvedba je IZGLEDALA
   * ispravno: sazetak lijevo velik, ocjena desno mala. Mjerenje je pokazalo obrnuto, 30,4 naspram
   * 38,4 px, jer je naslov dug redak a ocjena jedna brojka. Oko je vidjelo hijerarhiju koje nije
   * bilo. Tvrdnja o "izgleda sporedno" bez brojke ne vrijedi nista.
   */
  await page.goto('/rad/');
  await cekajApp(page);
  await page.locator('#fileInput').setInputFiles(FIXTURE);
  await expect(page.locator('#analyzeProfile .ap-kartica')).toBeVisible({ timeout: 20_000 });
  await potvrdiProfil(page);
  await expect(page.locator('#resultView')).toBeVisible({ timeout: 90_000 });

  const sazetak = page.locator('[data-finding-summary]');
  await expect(sazetak).toBeVisible();

  const m = await page.evaluate(() => {
    const px = (s: string) => {
      const e = document.querySelector(s);
      return e ? parseFloat(getComputedStyle(e).fontSize) : 0;
    };
    const razine = [...document.querySelectorAll('.fsum-razina b')].map((b) => Number(b.textContent));
    const naslov = document.querySelector('.fsum-naslov')?.textContent ?? '';
    return {
      naslovPx: px('.fsum-naslov'),
      ocjenaPx: px('.fsum-ocjena b'),
      zbrojRazina: razine.reduce((a, b) => a + b, 0),
      naslovBroj: Number(naslov.match(/^\d+/)?.[0] ?? NaN),
      // Tamni uredaj s halom je ono sto je zamijenjeno; njegov povratak je regresija.
      halo: document.querySelectorAll('#resultView [class*="halo"]').length,
    };
  });

  expect(m.naslovPx, 'sazetak mora biti VECI od ocjene').toBeGreaterThan(m.ocjenaPx);
  expect(m.naslovPx / m.ocjenaPx, 'ocjena je opet preuzela autoritet').toBeGreaterThanOrEqual(1.25);

  // OMJER SE MJERI NA VISE SIRINA, i to je nauceno kad je CI (mobile-chromium) oborio prvu
  // izvedbu ovog testa: naslov je bio `clamp`, ocjena FIKSNA, pa je ispod 828 px ocjena opet
  // bila veca (izmjereno 390 px: 23,2 naspram 27,2). Test koji mjeri samo zatecenu sirinu
  // projekta ne vidi raspon u kojem se odnos obrce, a bas ondje je zivio kvar.
  for (const w of [390, 700, 1024]) {
    await page.setViewportSize({ width: w, height: 900 });
    const omjer = await page.evaluate(() => {
      const px = (s: string) => {
        const e = document.querySelector(s);
        return e ? parseFloat(getComputedStyle(e).fontSize) : 0;
      };
      return px('.fsum-naslov') / px('.fsum-ocjena b');
    });
    expect(omjer, `na ${w} px ocjena nadjacava sazetak (omjer ${omjer.toFixed(2)})`)
      .toBeGreaterThanOrEqual(1.25);
  }
  expect(m.halo, 'tamni mjerac s halom se vratio').toBe(0);
  // Razine su particija po ozbiljnosti: moraju se zbrojiti u broj iz naslova. Ako se ikad u taj
  // stupac uvuce redak s druge osi (npr. automatski popravci), ova tvrdnja pada.
  expect(m.zbrojRazina, 'razine se ne zbrajaju u naslov, pa je u stupac usla druga os').toBe(m.naslovBroj);
});

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/ux',
  timeout: 120_000,
  fullyParallel: true,
  // Lokalno JEDAN radnik. Paralelno dizanje preglednika na razvojnom stroju iscrpi memoriju
  // ("Zone Allocation failed - process out of memory", pa "browserType.launch: spawn UNKNOWN")
  // i suite pada bez ijednog stvarnog kvara: u tri uzastopna prolaza pala je svaki put DRUGA
  // trojka testova, a svaki od njih izoliran prolazi.
  // Mjereno na ovom stroju: 1 radnik = 41/41 u 4,9 min; 2 radnika = 38/41 u 10,4 min.
  // Paralelizam ovdje dakle ne ubrzava nego mlati memoriju. CI ima vlastiti stroj i ostaje
  // na zadanoj vrijednosti (uz retries: 1).
  workers: process.env.CI ? undefined : 1,
  retries: process.env.CI ? 1 : 0,
  // TEST-10: retry je do sada PRETVARAO stvaran pad u zeleno. Zadrzavamo ga (drugi pokusaj daje
  // trace i screenshot, sto je za dijagnostiku vrijedno), ali run vise ne smije zavrsiti zeleno
  // ako je test uspio TEK iz drugog pokusaja. Upravo je taj scenarij audit prijavio: glavni repair
  // tok pao je prvi put, a workflow je bio zelen.
  failOnFlakyTests: !!process.env.CI,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    /**
     * Mobilni kriticni put se NE vrti na desktopu: ondje upload odmah skace na korak 2, pa bi test
     * mjerio tok koji na sirokom ekranu ne postoji. Izuzece je strukturno (po projektu), ne
     * `test.skip()` u tijelu: runtime skip je audit P1-17 prijavio kao nacin da suite bude zelena
     * a da nista ne vrti.
     */
    { name: 'chromium', use: { ...devices['Desktop Chrome'] }, testIgnore: [/mobile-critical-path\.spec\.ts/] },
    /**
     * MOBILNI PROJEKT (audit TEST-09, TEST-12). Dosad se sve vrtjelo samo na Desktop Chromeu, a
     * mobilni audit je bio uglavnom provjera vidljivosti: nije dokazivao da se sucelje da koristiti
     * prstom na uskom zaslonu.
     *
     * Namjerno emulacija u Chromiumu, ne novi preglednik: ne trazi dodatno preuzimanje, vrti se na
     * istom stroju, a hvata ono sto je za ovaj proizvod stvarno rizicno (uzak viewport, touch,
     * dodirne mete). Firefox i WebKit su zaseban posao i ostaju otvoreni, jer ih nema smisla
     * ukljuciti dok se ne moze dokazati da prolaze.
     */
    {
      name: 'mobile-chromium',
      use: { ...devices['Pixel 5'] },
      /**
       * ZATVOREN 2026-08-31. Ovdje je stajalo da klik na "Nastavi na profil" pod `isMobile` +
       * `hasTouch` ne prolazi ni u 120 s, pa je `roadmap-v2.spec.ts` bio izuzet. Vise nije ni
       * izuzet ni crven.
       *
       * Kvar NIJE bio dodirna meta nego OKOMITI PRORACUN na niskom zaslonu: `#browseBtn`
       * zavrsava tocno na 667, pa je dropzone prelazio prvi ekran za svojih 14 px donjeg
       * paddinga i 1 px ruba (448..682). Uz to stavka `.wizard-grid` ima zadani `min-width:auto`,
       * pa stupac nije mogao ispod svoje min-content sirine: dropzone 378 px na zaslonu od 375,
       * a `body` ima `overflow-x:clip` pa se visak tiho REZAO. Oboje popravljeno u `index.html`
       * (commit `e86da45e`), pod `(max-width:720px) and (max-height:720px)`.
       *
       * Zasto se dugo cinilo kao kradja dodira: Pixel 5 je visok 851 px, pa se na njemu nista od
       * toga ne vidi. Pada samo slucaj 375x667 unutar tog istog projekta.
       */
      /**
       * `repair-panel.spec.ts` tvrdo postavlja viewport 1440x1000, pa pod mobilnim projektom
       * izvodi ISTI desktop scenarij drugi put: nula mobilne pokrivenosti, dvostruk trosak. A
       * trosak nije zanemariv, jer svaki njegov test pokrece punu analizu stvarnog `.docx`-a.
       */
      testIgnore: [/repair-panel\.spec\.ts/, /desktop-flow\.spec\.ts/],
    },
    /**
     * FIREFOX I WEBKIT (audit P1-18). Do sada je release matrica bila samo Chromium (desktop +
     * mobilna emulacija), pa su upload .docx-a, Web Worker, blob download i modal/focus na
     * Safariju i Firefoxu bili potpuno nepokriveni.
     *
     * Vrte SAMO kriticni put (`roadmap-v2`), ne cijelu suite: cilj je dokazati da se do rezultata
     * moze doci u svakom pregledniku, ne udvostruciti sve provjere u tri preglednika.
     *
     * NISU u `npm run test:ux` niti u `check.yml` gateu. Razlog je posten: ovi preglednici jos
     * nijednom nisu odvrtjeli ovu suite, pa bi ih odmah proglasiti blokirajucima znacilo pustiti
     * u gate nesto sto nitko nije vidio kako se ponasa. Vrte se u zasebnom `browser-matrix`
     * workflowu, vidljivo; u obavezne provjere se PROMICU tek nakon prvog zelenog prolaza.
     */
    { name: 'firefox', use: { ...devices['Desktop Firefox'] }, testMatch: /(roadmap-v2|desktop-flow)\.spec\.ts/ },
    { name: 'webkit', use: { ...devices['Desktop Safari'] }, testMatch: /(roadmap-v2|desktop-flow)\.spec\.ts/ },
    { name: 'mobile-webkit', use: { ...devices['iPhone 13'] },
      testMatch: /(roadmap-v2|mobile-critical-path)\.spec\.ts/ },
  ],
  /**
   * Dizanje posluzitelja traje MNOGO duze na hladno nego na toplo, pa je 120 s bila granica koja
   * povremeno pada bez ijednog stvarnog kvara.
   *
   * Izmjereno 2026-08-30 na ovom stroju:
   *  - toplo (Viteov predmemorijski cache ovisnosti vec postoji): prvi HTTP 200 nakon 6 s;
   *  - hladno: `vite` javi "ready" tek nakon 41,5 s, a optimizacija ovisnosti se nastavlja i
   *    POSLIJE toga, pa prvi zahtjev jos ceka prevodjenje ulaza. Uz opterecen stroj (paralelni
   *    vitest ili drugi build) probe je presao 120 s i cijeli run je pao s
   *    "Timed out waiting from config.webServer", iako je posluzitelj bio ispravan.
   *
   * CI je UVIJEK hladan (`reuseExistingServer` je ondje false), dakle najgori slucaj je ondje
   * pravilo, ne iznimka. Granica se zato dize na 300 s. To NE skriva kvar: ako se posluzitelj
   * doista ne digne, run i dalje pada, samo nakon mjere koja odgovara stvarnom hladnom startu.
   *
   * Zaseban, jos nerijesen nalaz (`docs/audit/FREE_TOOLS_VISUAL_UX_AUDIT_2026-08-06.md:22`):
   * ovdje stoji `npm run dev`, a taj isti audit biljezi da je suite zapravo vrtjen protiv
   * `vite preview`. Prelazak na preview trazi build prije UX gatea (`ux-gate` u `check.yml` je
   * zaseban job bez `dist/`), pa je to promjena CI-ja i ostaje odvojena odluka.
   */
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
  },
});

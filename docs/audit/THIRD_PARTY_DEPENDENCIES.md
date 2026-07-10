# Audit trecih ovisnosti (Third Party Dependencies)

Dimenzija: `dependencies`
Repozitorij: Lekta (Vite + TypeScript, klijentska analiza .docx/.pdf; "backend" su Supabase Edge funkcije + Netlify)
Datum: 2026-07-10
Nacin rada: READ ONLY (nije pokretan build, test ni npm audit; verzije i velicine ocitane iz `package-lock.json` i `node_modules`)

---

## Mapa podrucja

### Runtime ovisnosti (`package.json` -> `dependencies`, 7 paketa)

Sve su STVARNO koristene (nema mrtve runtime ovisnosti, sto je pozitivan nalaz).

| Paket | Verzija (lock) | Licenca | Gdje se koristi | Ucitavanje | node_modules |
|---|---|---|---|---|---|
| `@xmldom/xmldom` | 0.9.10 | MIT | `src/docx/xml-dom-install.ts:11`, `src/analysis/analyze-docx.worker.ts`, `scripts/docx-smoke.mts` | Sinkrono, ali u Web Workeru (off main thread) i u Node/CI | 437K |
| `canvas-confetti` | 1.9.4 | ISC | `src/ui/app.ts:520` (celebrateReady) | Lijeno, `import('canvas-confetti')`, tek na rezultatu >= 90 | 112K |
| `lucide` | 1.23.0 | ISC | `src/shared/ui-boot.ts:10` (14 imenovanih ikona) | Sinkrono na boot (prvi paint), ali tree shaken | 26M (samo koristene ikone idu u bundle) |
| `motion` | 12.42.2 | MIT | `src/shared/ui-boot.ts:26` (`m.animate`, `m.stagger`) | Lijeno, `import('motion')`, tek na animaciji | 719K (+ framer-motion tranzitivno) |
| `open-props` | 1.7.23 | MIT | `src/shared/ui-boot.ts:8` (`open-props/easings`) | Sinkrono, samo CSS easing tokeni | 1.8M (koristi se sicusni podskup) |
| `@fontsource-variable/inter` | 5.2.8 | OFL | `src/shared/ui-boot.ts:7` (body sans) | Sinkrono CSS (self host, `font-display:swap`) | 4.2M zajedno |
| `@fontsource-variable/source-serif-4` | 5.2.9 | OFL | `src/shared/ui-boot.ts:6`; koristen kao `--ink-serif` (npr. `index.html:30`) | Sinkrono CSS (self host, `font-display:swap`) | (isto) |

Kljucne cinjenice o teretu na kriticnom putu:
- Jedine sinkrone ovisnosti koje diraju prvi paint su `lucide` (tree shaken na 14 ikona; `ui-boot` chunk u `dist` je samo 13 KB) i CSS/fontovi. Nijedna teska biblioteka nije sinkrona na main threadu.
- `@xmldom/xmldom` je jedina teska parserska biblioteka, ali radi u Web Workeru (`dist/assets/analyze-docx.worker-*.js` ~168 KB s parserom), pa ne blokira UI.
- `canvas-confetti` i `motion` su lijeno ucitani (zasebni chunkovi), oba su cisto progresivno poboljsanje i gejtani na `prefers-reduced-motion`.
- Nema vanjskih CDN skripti ni fontova u HTML ulazima (self host potvrdjen; vidi nize).

### Vanjski servisi

| Servis | Uloga | Gdje | Kljucevi / rizik |
|---|---|---|---|
| Supabase | GoTrue auth (OTP), PostgREST, Edge funkcije (Deno), pg_cron | Klijent: cisti `fetch` (BEZ `supabase-js` u bundleu, `src/auth/session.ts:7`, `src/catalog/products-catalog.ts:7`); Edge: `esm.sh/@supabase/supabase-js@2` | service_role kljuc u Edge okruzenju; vidi nalaz 01 |
| Netlify | Hosting, redirecti, headeri | `netlify.toml` | - |
| Lemon Squeezy (Merchant of Record) | Naplata / checkout | `supabase/functions/create-checkout/index.ts:115`, `supabase/functions/webhook-mor/index.ts` | `LEMONSQUEEZY_API_KEY` (server) |
| Resend | Transakcijski mail (podsjetnici) | `supabase/functions/send-reminders/index.ts:28` | `RESEND_API_KEY` (server) |
| Fontovi | Self host (bez Google Fonts) | fontovi bundlani lokalno preko `@fontsource-variable/*` | Nema mreznog trapa |

### Dev ovisnosti (`devDependencies`, 6 paketa, ne isporucuju se u bundle)

`happy-dom` 15.11.7, `netlify-cli` 26.2.0, `supabase` 2.109.1, `typescript` 5.9.3, `vite` 5.4.21, `vitest` 2.1.9.
`netlify-cli` i `supabase` CLI dominiraju stablom (lockfile ima 1314 zapisa paketa); vidi nalaz 03.

---

## Tablica nalaza po prioritetu

| ID | Prioritet | Naslov | Lokacija |
|---|---|---|---|
| dependencies-01 | P1 | Edge funkcije uvoze `@supabase/supabase-js` s `esm.sh` bez pina verzije i bez integriteta | `supabase/functions/*/index.ts` |
| dependencies-02 | P2 | `motion` se uvozi preko barrela pa lijeni chunk vuce `framer-motion` (React), a koriste se samo `animate`/`stagger` | `src/shared/ui-boot.ts:26` |
| dependencies-03 | P2 | Teski dev CLI-jevi (`netlify-cli`, `supabase`) u `devDependencies` napuhuju instalaciju i npm audit povrsinu | `package.json:31-32` |
| dependencies-04 | P3 | `@fontsource-variable/*` uvozi cijelu obitelj pa svi Unicode podskupovi (13 woff2, ~400 KB) idu u `dist`, iako se runtime dohvaca samo latin/latin-ext | `src/shared/ui-boot.ts:6-7` |
| dependencies-05 | P3 | `canvas-confetti` bez tipova (`declare module` = implicitni `any` na granici) | `src/types/ambient.d.ts:2` |
| dependencies-06 | P3 | Nema automatizirane provjere ranjivosti ni svjezine ovisnosti (nema `npm audit` gejta, Dependabota ni Renovatea) | `package.json:27`, `.github/workflows/` |

---

## Nalazi

### dependencies-01 (P1): Edge funkcije uvoze `@supabase/supabase-js` s `esm.sh` bez pina verzije i bez integriteta

- Problem: Svih 8 Supabase Edge funkcija (ukljucujuci one koje rukuju placanjem i service_role kljucem) uvoze klijent iz `https://esm.sh/@supabase/supabase-js@2`. Pin je samo na major (`@2`), bez tocne verzije, bez `deno.lock`/import map integriteta (SRI/hash). Kod se dohvaca s trece strane (esm.sh CDN) pri deployu/izvrsavanju.
- Lokacija:
  - `supabase/functions/create-checkout/index.ts:10`
  - `supabase/functions/webhook-mor/index.ts:12`
  - `supabase/functions/generate-report/index.ts:11`
  - `supabase/functions/file-guarantee-claim/index.ts:7`
  - `supabase/functions/faculty-request/index.ts:14`
  - `supabase/functions/send-reminders/index.ts:15`
  - `supabase/functions/unsubscribe-reminder/index.ts:11`
  - `supabase/functions/redeem-referral-signup/index.ts:10`
  - plus tip-only importi u `supabase/functions/_shared/grant-referrer-reward.ts:18` i `grant-friend-referral-reward.ts:16`
- Dokaz: `create-checkout` uz `import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'` cita `SUPABASE_SERVICE_ROLE_KEY` (`index.ts:15`) i gradi checkout na `https://api.lemonsqueezy.com` (`index.ts:115`). `webhook-mor` verificira potpis i izdaje entitlemente s istim CDN uvozom.
- Posljedica: Supply chain rizik na najosjetljivijem mjestu (placanje, webhook, service_role). Kompromitiran ili nedostupan esm.sh moze ubaciti ili srusiti kod u funkcijama koje potpisuju kupnje i drze admin kljuc. Uz `@2` (float) build nije reproducibilan: nova minor/patch verzija moze tiho promijeniti ponasanje izmedju dva deploya.
- Preporuceno rjesenje: Pinaj tocnu verziju (npr. `https://esm.sh/@supabase/supabase-js@2.x.y`) ILI centraliziraj u `supabase/functions/import_map.json` uz `deno.lock` s integritetom, pa je verzija zabiljezena i provjerljiva. Zakljucaj i tranzitivne (`?pin`/lock). Isto primijeni na tip-only importe.
- Acceptance kriteriji: Nijedan Edge import ne koristi goli `@2`; svaki je pinat na tocnu verziju ili razrijesen kroz import map + `deno.lock`; deploy dvaput za redom daje bajt-identican razrijeseni graf; funkcionalni smoke (checkout create, webhook potpis) prolazi.
- Rizik regresije: Nizak do srednji. Pin na trenutno instaliranu 2.x je semanticki no-op; rizik je samo krivi odabir verzije, ublazuje ga `deno.lock` i staging test webhooka prije produkcije.

---

### dependencies-02 (P2): `motion` barrel vuce `framer-motion` u lijeni animacijski chunk

- Problem: `ui-boot.ts` radi `import('motion')` (barrel ulaz `.`) i cita samo `m.animate` i `m.stagger`. Barrel ulaz paketa `motion` deklarira `framer-motion` kao ovisnost (React runtime), a namespace uvoz (`(m) => m.animate`) je losije tree-shakeable od ciljanog subpath uvoza. Paket nudi lagani `motion/mini` ulaz koji izvozi `animate`/`stagger` bez React sloja.
- Lokacija: `src/shared/ui-boot.ts:26` (`import('motion').then((m) => ...)`), potrosaci `ui-boot.ts:86`, `src/ui/app.ts:536-538`.
- Dokaz: `node -e` nad `node_modules/motion/package.json` -> `dependencies: {"framer-motion":"^12.42.2","tslib":"^2.4.0"}`; `exports` sadrze `./mini`. Lockfile ima instaliran `framer-motion` 12.42.2, `motion-dom` 12.42.2, `motion-utils` 12.39.0. Koriste se iskljucivo `animate` i `stagger` (grep u `src/`).
- Posljedica: Lijeni chunk je veci nego sto treba (potencijalno povlaci React-orijentirane putanje iz framer-motiona). Nije na kriticnom putu (lijeno, gejtano na `prefers-reduced-motion`), pa je utjecaj ogranicen na velicinu tog chunka i vrijeme skidanja animacija. Napomena: u trenutnom `dist/` nema emitiranog motion chunka (moguce zastario `dist`), ali izvor koristi barrel.
- Preporuceno rjesenje: Zamijeni `import('motion')` s `import('motion/mini')` (ili `import('motion-dom')`) i uvozi imenovano `{ animate, stagger }`. Zadrzi lijeni oblik i `.catch(() => null)` fallback.
- Acceptance kriteriji: `ui-boot` koristi mini ulaz; animacije hero/score/bar rade isto uz `prefers-reduced-motion` fallback; produkcijski build ne sadrzi `framer-motion` string u emitiranim chunkovima; velicina animacijskog chunka manja ili jednaka.
- Rizik regresije: Nizak. `animate`/`stagger` API je isti u mini ulazu; jedini rizik je razlika u opcijama (ease/keyframes), pokriva ga vizualni smoke hero animacije.

---

### dependencies-03 (P2): Teski dev CLI-jevi u `devDependencies` napuhuju instalaciju i npm audit povrsinu

- Problem: `netlify-cli` (26.2.0) i `supabase` (2.109.1) su u `devDependencies`. Oba su velika CLI stabla i zajedno dominiraju lockfileom (1314 zapisa paketa), iako se NISTA od njih ne isporucuje u klijentski bundle. To povecava vrijeme `npm ci`, velicinu `node_modules` i broj tranzitivnih paketa koje bi `npm audit` prijavio (supply chain povrsina razvoja i CI-a).
- Lokacija: `package.json:31` (`netlify-cli`), `package.json:32` (`supabase`).
- Dokaz: `node -e` nad `package-lock.json` -> 1314 `packages` zapisa; runtime `dependencies` su samo 7. `du -sh` pokazuje samo runtime pakete male, dok teret dolazi iz dev CLI-jeva. Memorija projekta biljezi da su `login/link/publish` ionako interaktivni korisnikovi koraci.
- Posljedica: Sporiji i tezi instalacijski/CI korak, veca audit buka i veca povrsina za tranzitivne CVE-ove u alatima koji nikad ne dodju u produkciju. Nije sigurnosni P0 jer ne ide u bundle, ali je operativni teret i lazni signal u audit izvjestajima.
- Preporuceno rjesenje: Razmotri micanje `netlify-cli` i `supabase` iz `devDependencies` u korist globalne/CI instalacije po potrebi (npr. `npx`/service step), ili ih izdvoji u zaseban `optionalDependencies`/tooling manifest. Ako ostaju, dokumentiraj razlog i ogranici `npm audit` na produkcijske ovisnosti (`npm audit --omit=dev`) da signal ostane koristan.
- Acceptance kriteriji: `npm ci` u CI-u ne treba pune CLI-jeve za `npm run check`; ili je dokumentirano zasto ostaju; produkcijski audit (`--omit=dev`) je cist i koristen kao gejt.
- Rizik regresije: Nizak. Micanje iz `devDependencies` ne dira runtime ni build (`vite build` ne treba te CLI-jeve); rizik je samo lokalni tijek deploya, ublazuje ga dokumentirani `npx` korak.

---

### dependencies-04 (P3): `@fontsource-variable/*` uvozi cijelu obitelj pa svi podskupovi idu u `dist`

- Problem: `ui-boot.ts` uvozi `@fontsource-variable/inter` i `@fontsource-variable/source-serif-4` preko default `index.css`, koji deklarira SVE Unicode podskupove (cyrillic, cyrillic-ext, greek, greek-ext, vietnamese, latin, latin-ext). Rezultat je 13 woff2 datoteka (~400 KB) u `dist/assets`, iako se za hrvatski runtime dohvaca samo latin i latin-ext (ostali su gejtani `unicode-range`, ne skidaju se, ali fizicki se deployaju).
- Lokacija: `src/shared/ui-boot.ts:6-7`; potvrda podskupova u `node_modules/@fontsource-variable/inter/index.css` (7 `@font-face` blokova s `unicode-range`).
- Dokaz: `ls dist/assets/*.woff2 | wc -l` = 13; ukupno ~399.584 bajta. `index.css` sadrzi cyrillic/greek/vietnamese `@font-face` blokove uz latin. Komentar u kodu tvrdi "unicode-range skida samo latin i latin-ext", sto je tocno za runtime dohvat, ali cijeli set svejedno ide u `dist`.
- Posljedica: Blaga napuhanost deploya (nepotrebne woff2 u `dist`). Runtime performansa je vec u redu (`font-display:swap`, browser dohvaca samo latin/latin-ext), pa je ovo higijena artefakta, ne UX blokator.
- Preporuceno rjesenje: Uvezi ciljane subset ulaze ako fontsource verzija to nudi (npr. samo latin i latin-ext varijante), ili prihvati trenutni stan uz belesku (dodatnih ~200 KB u `dist` se ne skida klijentu). Ne mijenjaj `font-display`.
- Acceptance kriteriji: `dist` sadrzi samo latin/latin-ext woff2 ILI je zadrzavanje svih podskupova svjesno dokumentirano; vizualni ispis hrvatskih dijakritika (c, c, s, z, d) nepromijenjen.
- Rizik regresije: Nizak, ali stvaran ako se subset odsijece pogresno: nedostajuci glif za dijakritiku srusio bi citljivost. Obavezan vizualni pregled hrvatskog teksta nakon promjene.

---

### dependencies-05 (P3): `canvas-confetti` bez tipova (implicitni `any` na granici)

- Problem: `canvas-confetti` nema ugradjene TypeScript deklaracije; projekt ga premoscuje ambientnim `declare module 'canvas-confetti'`, sto cijeli modul cini `any`. Poziv u `app.ts` (`mod.default||mod`, pa `confetti({...})`) nije tipski provjeren.
- Lokacija: `src/types/ambient.d.ts:2`; potrosac `src/ui/app.ts:520-524`.
- Dokaz: `ambient.d.ts` sadrzi golim `declare module 'canvas-confetti';` (bez tijela). `canvas-confetti` package.json ne izvozi `types`.
- Posljedica: Gubi se tipska sigurnost na kozmetickom, ali javnom pozivu (krivi kljuc opcije prosao bi tsc). Utjecaj minoran jer je funkcija izolirana i u `try/catch`, ali odstupanje od "strict, izbjegavaj any u novom logickom kodu" iz CLAUDE.md.
- Preporuceno rjesenje: Dodaj `@types/canvas-confetti` u `devDependencies` (postoji, DefinitelyTyped) i ukloni goli ambientni `declare module`, ili napisi minimalni tipizirani shim za koristene opcije.
- Acceptance kriteriji: `import('canvas-confetti')` je tipiziran; tsc strict prolazi; `declare module 'canvas-confetti'` bez tijela uklonjen.
- Rizik regresije: Zanemariv (dev-only tipovi; runtime kod nepromijenjen).

---

### dependencies-06 (P3): Nema automatizirane provjere ranjivosti ni svjezine ovisnosti

- Problem: `check` skripta je `tsc --noEmit && vitest run && vite build`, bez ijednog supply chain gejta. Nema `npm audit` koraka, nema Dependabot/Renovate konfiguracije, nema `overrides`/`resolutions` za brzu zakrpu tranzitivnih CVE-ova. Jedini CI je `docx-smoke.yml`.
- Lokacija: `package.json:27` (`check`), `.github/workflows/` (samo `docx-smoke.yml`); nepostojanje `.github/dependabot.yml`, `renovate.json`, `overrides` u `package.json` potvrdjeno.
- Dokaz: `ls .github/dependabot.yml renovate.json` -> none; `grep -rn "npm audit|dependabot|renovate"` -> bez pogodaka; `grep "overrides|resolutions" package.json` -> none.
- Posljedica: Ranjivosti u runtime ili tranzitivnim ovisnostima (npr. u lancu preko `motion`/`framer-motion` ili dev CLI-jeva) ne bi bile primijecene automatski; azuriranja se rade rucno, pa lako zaostanu. Za projekt s naplatom i osobnim podacima to je propust u procesu, ne u kodu.
- Preporuceno rjesenje: Dodaj lagani `npm audit --omit=dev --audit-level=high` korak u CI (ne blokirajuci na pocetku, samo signal), plus Dependabot ili Renovate za `dependencies` i GitHub Actions. Za hitne tranzitivne zakrpe drzi mogucnost `overrides`.
- Acceptance kriteriji: CI prijavljuje produkcijske ranjivosti high+; postoji konfiguracija za automatske PR-ove nadogradnje; dokumentiran prag koji lomi build.
- Rizik regresije: Zanemariv za sam kod; jedino operativno (bucni PR-ovi/false-positive audit), ublazava se `--omit=dev` i pragom severity.

---

## Pozitivni nalazi (bez akcije, za kontekst)

- Nema nekoristene runtime ovisnosti: svih 7 `dependencies` je referencirano u izvoru.
- Teske biblioteke su van kriticnog puta: `canvas-confetti` i `motion` su lijeno ucitani; `@xmldom/xmldom` radi u Web Workeru; jedini sinkroni teret na prvom paintu su tree-shaken `lucide` (14 ikona, ~13 KB chunk) i self-host CSS/fontovi (`font-display:swap`).
- Self host potvrdjen: u HTML ulazima nema vanjskih `<script src>` ni font/CDN linkova (grep vraca samo placeholdere `https://xxxx.supabase.co`, `https://doi.org` u primjerima). Nema Google Fonts mreznog trapa.
- Klijentski bundle NE ukljucuje `supabase-js`: auth, katalog i podsjetnici idu cistim `fetch`-om (`src/auth/session.ts`, `src/catalog/products-catalog.ts`, `src/submission/deadline-client.ts`), sto drzi bundle i supply chain povrsinu klijenta malom.
- Licence runtime paketa su permisivne i kompatibilne: MIT (`motion`, `open-props`, `@xmldom/xmldom`), ISC (`canvas-confetti`, `lucide`), OFL (fontovi). Nema copyleft rizika za distribuciju.

# ROUTE_INVENTORY.md — Audit ruta i poveznica

Datum: 2026-07-10
Opseg: statičke rute (HTML ulazi, generirane SEO stranice, pravne stranice), interne poveznice
(navigacija, footer, CTA, checkout tokovi), Netlify redirecti i zaglavlja, te izloženost interne
QA/admin konzole. Metoda: čitanje izvora i buildovanog `dist/` (read only). Domena u produkciji:
`https://lektahr.netlify.app` (netlify.toml linija 22).

---

## 1. Mapa područja (inventar ruta)

### 1.1 Korijenske HTML rute (Vite entryji, `vite.config.ts` 38 do 48)

| Ruta | Datoteka | U javnom (DEPLOY) buildu | Napomena |
|---|---|---|---|
| `/` i `/index.html` | `index.html` | da | Glavni app (analizator, paketi, modali) |
| `/landing_usporedba.html` | `landing_usporedba.html` | da | Landing usporedbe pristupa |
| `/alati.html` | `alati.html` | da | Hub besplatnih alata |
| `/citat.html` | `citat.html` | da | Citat generator |
| `/kartice.html` | `kartice.html` | da | Brojač kartica |
| `/naslovnica.html` | `naslovnica.html` | da | Generator naslovnice |
| `/literatura.html` | `literatura.html` | da | Sređivanje literature |
| `/izjava.html` | `izjava.html` | da | Izjava o izvornosti |
| `/verification.html` | `verification.html` | NE (gejtano) | Interna QA/verifikacijska konzola |

`verification.html` ulazi u graf samo kad `DEPLOY !== '1'` (`vite.config.ts:48`), a
`scripts/verify-deploy-dist.mjs:54` obara build ako `dist/verification.html` postoji. netlify.toml
postavlja `DEPLOY = "1"` (linija 19) i uvrštava `verify-deploy-dist.mjs` u command lanac (linija 14).

### 1.2 Build time generirane pravne stranice (`scripts/generate-legal-pages.mjs`)

Sedam statičkih datoteka u korijenu `dist/`, slug iz `src/legal/legal-content.ts`:
`privatnost.html`, `uvjeti-koristenja.html`, `odricanje-od-odgovornosti.html`, `pravila-povrata.html`,
`obrada-dokumenata.html`, `kolacici.html`, `garancija.html`. Svaka ima footer nav koji linka svih 7.

### 1.3 Build time generirane SEO stranice (`scripts/generate-citation-tools.mjs`, `scripts/generate-title-page-tools.mjs`)

- `dist/alati/citati/index.html` + po (fakultet x stil) stranice (npr. `ffzg-apa7.html`, `fpzg.html`).
- `dist/alati/brojac-kartica.html`.
- `dist/alati/naslovnica/index.html` + 184 stranica po predlošku (npr. `ffzg-diplomski.html`).
- Sitemapovi: `dist/alati/sitemap-alati.xml`, `dist/alati/sitemap-naslovnica.xml`.

### 1.4 Statika i konfiguracija (`public/` -> `dist/`)

`public/_headers` (CSP i sigurnosna zaglavlja), `public/robots.txt`, `public/sitemap.xml`,
`public/favicon.svg`. `netlify.toml` NEMA `[[redirects]]`, a u repou nema `_redirects` ni `404.html`
(glob prazan). Aplikacija je MPA bez SPA fallbacka i bez clean URL rewrites.

### 1.5 Sažetak zdravlja

Sve interne `<a href>` poveznice u navigaciji, footeru, hero i CTA blokovima svih korijenskih
stranica razriješene su na postojeće datoteke; nije nađen nijedan tvrdi 404 na primarnoj
(Netlify) putanji. Interna admin konzola nije izložena u javnom buildu. Nalazi ispod su
uglavnom rizici ovisni o konfiguraciji hostinga i SEO/higijenske praznine, ne aktivni 404.

---

## 2. Tablica nalaza

| ID | Prioritet | Nalaz |
|---|---|---|
| routes-01 | P2 | Zadani `SITE_ORIGIN` u SEO generatorima je pogrešna domena `lekta.hr` (kanonik/CTA cross domain ako env nije postavljen) |
| routes-02 | P2 | Izlučenje `verification.html` (admin) ovisi samo o `DEPLOY=1`; na drugom hostu (Cloudflare Pages) bez tog env-a konzola se objavljuje |
| routes-03 | P2 | Nedostaje `canonical`/`og:url` na 5 alatnih stranica; `landing_usporedba.html` bez ikakvih OG/canonical meta |
| routes-04 | P2 | Stranica pravila kupnje i povrata (`pravila-povrata.html`) nije u footeru glavne stranice; footer alata linka samo 3 od 7 pravnih dokumenata |
| routes-05 | P3 | 180+ generiranih SEO stranica (`/alati/citati/**`, `/alati/naslovnica/**`) siroče je, bez ijedne interne poveznice iz app navigacije |
| routes-06 | P3 | Nema custom `404.html` ni redirecta; typane clean rute (`/garancija` bez `.html`) padaju na generički Netlify 404 |
| routes-07 | P3 | Footer glavne stranice pravne dokumente otvara JS gumbima (`legal-open`), ne `<a href>`; bez JS-a homepage ne nudi poveznicu na pravne stranice |
| routes-08 | P3 | `favicon` link samo na `index.html`; ostale stranice bez favicona i bez `/favicon.ico` (404 u mrežnom logu preglednika) |

---

## 3. Detaljni nalazi

### routes-01 (P2) — Zadani `SITE_ORIGIN` je pogrešna domena `lekta.hr`

- Problem: Oba SEO generatora imaju fallback domenu koja NIJE živa domena projekta. Ako se build
  pokrene bez `LEKTA_SITE_ORIGIN`, sve generirane SEO stranice pišu apsolutne kanonike, CTA i
  natrag poveznice na `https://lekta.hr`, dok memorija projekta izričito potvrđuje da je živa
  domena `https://lektahr.netlify.app`, ne `lekta.hr`.
- Lokacija:
  - `scripts/generate-citation-tools.mjs:37` -> `const SITE_ORIGIN = process.env.LEKTA_SITE_ORIGIN || 'https://lekta.hr';`
  - `scripts/generate-title-page-tools.mjs:33` -> isti fallback `'https://lekta.hr'`.
  - Za usporedbu, `scripts/generate-legal-pages.mjs:24` ima ISPRAVAN fallback `'https://lektahr.netlify.app'` (nekonzistentno).
  - Potrošači: CTA `generate-citation-tools.mjs:365` (`<a href="${SITE_ORIGIN}/?utm_source=alat_citati">`), kanonik `:516` i `:543`.
- Dokaz/repro: `LEKTA_SITE_ORIGIN` je postavljen samo u `netlify.toml:22`. Build na drugom hostu ili
  lokalno bez tog env-a proizvede `dist/alati/citati/*.html` i `dist/alati/naslovnica/*.html` s
  `rel=canonical` i CTA na `https://lekta.hr`. netlify.toml eksplicitno navodi Cloudflare Pages kao
  alternativni cilj gdje se command i varijable postavljaju u dashboardu (linije 8 do 9), pa je
  ispuštanje env-a realan scenarij.
- Posljedica: cross domain kanonik (SEO gubitak, indeksiranje krive domene) i CTA koji vodi na
  domenu koja može biti neregistrirana ili tuđa (efektivni 404 ili preusmjeravanje korisnika izvan
  proizvoda) na svakoj od 180+ SEO stranica.
- Preporuka: uskladi fallback na `'https://lektahr.netlify.app'` u oba generatora (kao u
  legal generatoru), ili još bolje, obori build ako `LEKTA_SITE_ORIGIN` nije postavljen
  (`process.exit(1)`), da se pogrešna domena nikad ne zapeče.
- Acceptance: grep po `dist/alati/**` ne nalazi `lekta.hr` bez `netlify.app`; sva tri generatora
  dijele isti izvor domene ili isti fallback; build bez env-a pada ili koristi točnu domenu.
- Rizik regresije: nizak. Promjena string konstante; ne dira runtime app ni golden put.

### routes-02 (P2) — Izloženost admin konzole ovisi samo o `DEPLOY=1`

- Problem: `verification.html` (interna QA/verifikacijska konzola) izuzima se iz builda isključivo
  kad je `DEPLOY=1`. Guard `verify-deploy-dist.mjs` koji bi uhvatio propust i sam se poziva samo iz
  netlify.toml command lanca. Na hostu gdje `DEPLOY` nije postavljen (ili je command lanac skraćen),
  `vite build` ubacuje `verification.html` u `dist/`, a guard se ne izvrši.
- Lokacija: `vite.config.ts:48` (`if (!isDeploy) input.verification = ...`), `netlify.toml:14,19`,
  `scripts/verify-deploy-dist.mjs:54`.
- Dokaz/repro: pokretanje `vite build` bez `DEPLOY=1` (default) generira `dist/verification.html`
  i njen JS bundle (interna konzola, prema komentaru u `vite.config.ts:33` do 36 uključuje i uvoz
  svih source PDF-ova). Na Cloudflare Pages (naveden kao cilj u netlify.toml) ta zaštita nije
  automatska osim ako se u dashboardu doslovno preslika DEPLOY env i cijeli command lanac.
- Posljedica: javno dostupna interna admin/QA konzola i potencijalno teški privatni artefakti;
  povećanje bundlea i izloženost internih alata.
- Preporuka: napravi izuzeće hosting neovisnim (npr. build koji NIKAD ne uvrštava
  `verification.html` u produkcijski entry set osim uz eksplicitni interni flag, obrnuta logika od
  današnje), ili u dokumentaciji hostinga tvrdo zahtijevaj `DEPLOY=1` + `verify-deploy-dist` na
  SVAKOM hostu i to potvrdi u CI-u.
- Acceptance: build na bilo kojem hostu bez posebnog internog flaga ne proizvodi
  `dist/verification.html`; guard je dio zajedničkog build koraka, ne samo netlify command lanca.
- Rizik regresije: srednji. Dira build konfiguraciju; treba provjeriti da lokalni QA (`npm run check`,
  ne DEPLOY) i dalje ima pristup konzoli lokalno.

### routes-03 (P2) — Nedostaje `canonical` i `og:url` na alatnim stranicama; landing bez OG-a

- Problem: kanonikalizacija je nekonzistentna. `index.html` i `kartice.html` imaju
  `<link rel="canonical">` i `og:url`, ali `citat.html`, `izjava.html`, `naslovnica.html`,
  `literatura.html` i `alati.html` nemaju ni kanonik ni `og:url`. `landing_usporedba.html` nema
  nijedan OG/twitter/canonical tag.
- Lokacija:
  - Ima: `index.html:11` (canonical), `:15` (og:url); `kartice.html:15,16`.
  - Nema: `citat.html` (head 1 do 18, samo og:title/description/twitter + JSON-LD), analogno
    `izjava.html`, `naslovnica.html`, `literatura.html`, `alati.html`.
  - `landing_usporedba.html:1` do 20: nema nijedan `og:`/`twitter:`/`canonical`.
- Dokaz/repro: grep `rel="canonical"|og:url` po korijenskim HTML-ovima vraća samo `index.html` i
  `kartice.html`.
- Posljedica: rizik dvostrukog sadržaja i pogrešnog kanonika (npr. parametrizirani ili
  http/https/apex duplikati), slabiji social preview za landing i alate.
- Preporuka: dodaj `canonical` i `og:url` (apsolutni URL žive domene) na svih 6 stranica; landingu
  dodaj i osnovni OG set kao na ostalim alatima.
- Acceptance: svaka korijenska javna stranica ima točno jedan `canonical` na svoj apsolutni URL i
  odgovarajući `og:url`; grep pokriva sve.
- Rizik regresije: nizak. Samo meta tagovi u `<head>`.

### routes-04 (P2) — Pravila kupnje i povrata nisu u footeru; alati linkaju samo 3 od 7 pravnih dokumenata

- Problem: iako se generira 7 pravnih stranica, glavni footer izostavlja
  `pravila-povrata.html` (Pravila kupnje, isporuke i povrata), a footeri alatnih stranica linkaju
  samo `privatnost.html`, `uvjeti-koristenja.html` i `garancija.html`. Za uslugu s naplatom, uvjeti
  povrata trebaju biti trajno i lako dostupni.
- Lokacija:
  - `index.html:344` footer gumbi: privacy, terms, disclaimer, processing, cookies, guarantee
    (nema purchase/pravila-povrata).
  - Footeri alata linkaju 3 dokumenta, npr. `citat.html:327` do 329, `alati.html:183` do 185,
    isto na `naslovnica/literatura/kartice/izjava/landing_usporedba`.
  - `pravila-povrata.html` dostupan je samo iz checkout consent modala (`index.html:350`) i footer
    nava samih pravnih stranica (`generate-legal-pages.mjs:69` do 72), te iz `sitemap.xml:13`.
- Dokaz/repro: grep pravnih hrefova po alatima nalazi samo tri sluga; footer indexa nema
  `data-legal="purchase"`.
- Posljedica: potrošačke informacije o povratu teško dostupne prije checkouta; moguć compliance i
  UX prigovor; slabija interna poveznica na pravno bitnu stranicu.
- Preporuka: dodaj poveznicu na Pravila kupnje i povrata u footer glavne stranice i u footer alata;
  po mogućnosti ujednači footer da nudi cijeli pravni set (ili poveznicu na jedan pravni indeks).
- Acceptance: `pravila-povrata.html` dostupan iz footera svake javne stranice; svih 7 pravnih
  dokumenata dohvatljivo u najviše dva klika s bilo koje stranice.
- Rizik regresije: nizak. Dodavanje poveznica; index footer koristi `legal-open` gumbe pa treba
  paziti da nova stavka ima ispravan `data-legal="purchase"` ili href fallback.

### routes-05 (P3) — Siroče SEO stranice bez interne poveznice

- Problem: `dist/alati/citati/**` (index + po fakultetu) i `dist/alati/naslovnica/**` (184 stranice)
  nisu linkane ni iz jednog dijela app navigacije. Hub `alati.html` upućuje samo na 5 klijentskih
  alata (`citat/literatura/naslovnica/izjava/kartice`), ne i na generirane SEO stranice.
- Lokacija: `alati.html:159` do 163 (tools-grid); grep `brojac-kartica|alati/citati|/alati/` po
  svim korijenskim HTML-ovima vraća 0 pogodaka. SEO stranice postoje samo u `dist/` i u
  `sitemap-alati.xml`/`sitemap-naslovnica.xml`.
- Dokaz/repro: `Glob dist/alati/naslovnica/*.html` -> 184 datoteke; nijedna nije ciljana internom
  poveznicom.
- Posljedica: nulti interni link equity prema SEO stranicama (lošije indeksiranje i rangiranje),
  slaba otkrivljivost za korisnike; sadržaj postoji samo za direktan ulaz i sitemap.
- Preporuka: na `alati.html` (ili `citat.html`/`naslovnica.html`) dodaj poveznicu na
  `/alati/citati/index.html` i `/alati/naslovnica/index.html`; razmisli o hub stranici koja nabraja
  fakultetske SEO stranice.
- Acceptance: barem jedna interna `<a href>` poveznica vodi na svaki SEO index; crawler može doći
  do SEO stabala bez sitemapa.
- Rizik regresije: nizak. Dodavanje poveznica u statične HTML-ove.

### routes-06 (P3) — Nema custom 404 ni redirecta za clean URL-ove

- Problem: `netlify.toml` nema `[[redirects]]`, nema `public/_redirects` ni `404.html`. Sve interne
  poveznice koriste `.html` sufiks pa rade, ali svaki typani clean URL (`/garancija`, `/privatnost`,
  `/citat`) ili tuđa pogrešna poveznica padne na generički Netlify 404 bez brenda i navigacije.
- Lokacija: `netlify.toml` (23 linije, bez redirect bloka); glob `404.html`/`_redirects` prazan.
- Dokaz/repro: zahtjev za `https://lektahr.netlify.app/garancija` (bez `.html`) ne mapira se ni na
  jednu datoteku.
- Posljedica: lošiji UX na krivom URL-u, izgubljen posjetitelj, nema puta natrag na app.
- Preporuka: dodaj `public/404.html` s brendom i poveznicom na `/`, i po želji redirect pravila za
  clean URL varijante pravnih i alatnih stranica (`/garancija -> /garancija.html` itd.).
- Acceptance: nepostojeća ruta vraća brandiranu 404 s navigacijom; clean URL varijante ključnih
  stranica preusmjeravaju na kanonsku `.html`.
- Rizik regresije: nizak. Aditivna datoteka i redirect pravila; ne dira postojeće rute.

### routes-07 (P3) — Homepage pravne poveznice su JS gumbi, ne `<a href>`

- Problem: footer `index.html` pravne dokumente otvara `<button class="legal-open" data-legal=...>`
  koji renderiraju modal iz `legal-content.ts`. Bez JS-a (ili ako CSP/skripta zakaže) homepage ne
  nudi nijednu poveznicu na statične pravne stranice, iako one postoje. Crawleri ih s homepagea ne
  vide kao poveznicu.
- Lokacija: `index.html:344` (gumbi `legal-open`); usporedno, alatne stranice koriste prave
  `<a href="/privatnost.html">` (npr. `citat.html:327`).
- Dokaz/repro: u `index.html` footeru nema `<a href>` na pravne stranice; sve su `button`.
- Posljedica: slabija dostupnost bez JS-a i nulti link equity s najjače stranice prema pravnim
  dokumentima; nekonzistentno s ostatkom sajta.
- Preporuka: pravne stavke u footeru indexa učini `<a href="/privatnost.html">` (i ostale), uz
  zadržavanje `legal-open` ponašanja preko `preventDefault` kad JS radi (progressive enhancement).
- Acceptance: homepage footer sadrži prave poveznice na sve pravne stranice; modal i dalje radi uz JS.
- Rizik regresije: nizak do srednji. Treba paziti da `legal-open` handler ne pukne kad element
  postane `<a>` (spriječiti default navigaciju kad se otvara modal).

### routes-08 (P3) — Favicon samo na indexu, nema `/favicon.ico`

- Problem: `<link rel="icon">` postoji samo na `index.html`. Alatne, pravne i SEO stranice nemaju
  favicon poveznicu, a u korijenu nema `favicon.ico` (samo `favicon.svg`). Preglednici tada traže
  `/favicon.ico` i dobiju 404 na svakoj ne-index stranici.
- Lokacija: `index.html:10` (`<link rel="icon" href="/favicon.svg">`); `public/` sadrži samo
  `favicon.svg`; ostale HTML datoteke i legal/SEO shells bez `rel="icon"`.
- Dokaz/repro: grep `rel="icon"` po korijenskim HTML-ovima vraća samo `index.html`.
- Posljedica: kozmetički 404-i u mrežnom logu; nedosljedan favicon u karticama preglednika za
  alate, pravne i SEO stranice.
- Preporuka: dodaj `<link rel="icon" type="image/svg+xml" href="/favicon.svg">` u zajednički
  `<head>` svih stranica (uključujući legal i SEO shell u generatorima), ili posluži `favicon.ico`.
- Acceptance: svaka stranica referencira favicon; nema `/favicon.ico` 404 u mreži.
- Rizik regresije: vrlo nizak. Samo `<head>` meta.

---

## 4. Što je provjereno i ISPRAVNO (nema nalaza)

- Sve nav/footer/CTA `<a href>` poveznice korijenskih stranica razrješuju se na postojeće datoteke
  (unakrsne poveznice alata, `index.html#...` sidra, `landing_usporedba.html`).
- Pravne poveznice `/privatnost.html`, `/uvjeti-koristenja.html`, `/garancija.html` (footeri alata)
  i modalni `/garancija.html`, `/privatnost.html` (checkout/guarantee tekst) svi imaju generirane
  ciljne datoteke.
- `/sigurnost` i `/metodologija` (spomenute u zadatku) NE postoje kao rute, ali ih ni jedna app
  poveznica ne referencira, pa nema mrtvog linka; pojavljuju se samo u harvestanim izvorima pod
  `data/sources/**` i `reference/**` (nisu deploy rute).
- `verification.html` nije linkana ni iz jedne javne stranice (grep) i izuzeta je iz javnog builda
  na primarnoj Netlify putanji (dvostruki guard: `vite.config.ts:48` + `verify-deploy-dist.mjs:54`).
- `robots.txt` referencira tri sitemapa (`/sitemap.xml`, `/alati/sitemap-alati.xml`,
  `/alati/sitemap-naslovnica.xml`) i sva tri postoje u `dist/`.
- `sitemap.xml` nabraja korijenske i svih 7 pravnih stranica; svi URL-ovi imaju generirane datoteke.
- Generirane SEO stranice interno koriste ispravne relativne/apsolutne poveznice
  (`./index.html`, `${SITE_ORIGIN}/...`); jedini rizik je zadana domena iz routes-01.

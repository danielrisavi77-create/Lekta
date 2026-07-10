# SEO audit: Lekta

Datum: 2026-07-10. Uloga: SEO auditor. Opseg: READ-ONLY pregled produkcijskog koda.
Ziva domena: https://lektahr.netlify.app (potvrdjeno u kodu, ne lekta.hr).

## Mapa podrucja

Lekta je multi-page aplikacija (MPA, ne SPA). Ulazne HTML stranice zive u korijenu
repozitorija i buildaju se preko Vite (`vite.config.ts`, rollup `input` mapa):

- `index.html` (glavna app), `alati.html` (hub alata), `citat.html`, `izjava.html`,
  `kartice.html`, `literatura.html`, `naslovnica.html`, `landing_usporedba.html`,
  `verification.html` (interna QA konzola, iskljucena iz deploya kad je `DEPLOY=1`).
- Pravni tekstovi (`privatnost.html`, `uvjeti-koristenja.html`, `pravila-povrata.html`,
  `odricanje-od-odgovornosti.html`, `obrada-dokumenata.html`, `kolacici.html`,
  `garancija.html`) generiraju se u build-koraku (`scripts/generate-legal-pages.mjs`).
- Staticke SEO stranice po fakultetu generiraju se POSLIJE `vite build`
  (`netlify.toml` build command): `scripts/generate-citation-tools.mjs` proizvodi
  `dist/alati/citati/*.html` (91 stranica + index), a `scripts/generate-title-page-tools.mjs`
  proizvodi `dist/alati/naslovnica/*.html` (184 stranice + index).
- SEO infrastruktura: `public/robots.txt`, `public/sitemap.xml`, `public/favicon.svg`,
  `public/_headers` (sigurnosna zaglavlja, CSP). Generatori pisu i `dist/alati/sitemap-alati.xml`
  te `dist/alati/sitemap-naslovnica.xml`.

Origin za kanonske URL-ove i sitemap dolazi iz env varijable `LEKTA_SITE_ORIGIN`
(`netlify.toml:22` postavlja `https://lektahr.netlify.app`). Generatori imaju ZADANU
vrijednost (fallback) koja se koristi kad varijabla nije postavljena.

Opca ocjena: osnovni on-page SEO je prisutan (jedinstveni title/description po stranici,
hr `lang`, JSON-LD na glavnim stranicama, `noindex` na internoj konzoli, robots+sitemap).
Glavne slabosti su: nekonzistentan i pogresan zadani origin (lekta.hr) koji je vec
utisnut u commitani `dist/`, tanke near-duplicate staticke stranice citata, te
nedosljedno postavljeni canonical/og:url/favicon/og:image kroz stranice.

## Tablica nalaza

| ID | Prioritet | Naslov | Lokacija |
|----|-----------|--------|----------|
| seo-01 | P1 | Nekonzistentan i pogresan zadani origin (lekta.hr) u generatorima; commitani dist ima kanonske i sitemap URL-ove na nepostojecu domenu | scripts/generate-citation-tools.mjs:37 |
| seo-02 | P2 | Staticke stranice citata su tanki near-duplikati bez stvarnog sadrzaja (vrsta rada, godina, status, ogranicenja); caveat je JS-only; bez OG i JSON-LD | scripts/generate-citation-tools.mjs:311 |
| seo-03 | P2 | Tool stranice (alati, citat, izjava, literatura, naslovnica) nemaju canonical ni og:url (samo kartice.html ima) | citat.html:1 |
| seo-04 | P2 | landing_usporedba.html nema canonical, Open Graph, Twitter ni JSON-LD, a nalazi se u sitemapu | landing_usporedba.html:1 |
| seo-05 | P2 | Nijedna stranica nema og:image ni bilo koji social share asset; twitter:card=summary bez slike | index.html:18 |
| seo-06 | P3 | Favicon: samo /favicon.svg (bez .ico/apple-touch/webmanifest); rel=icon postoji samo na index.html i pravnim stranicama | citat.html:1 |
| seo-07 | P3 | Nema prilagodjene 404 stranice ni Netlify fallback redirecta | netlify.toml:1 |
| seo-08 | P3 | sitemap.xml nije sitemap index, ne ukljucuje /alati/ URL-ove; nema lastmod; nedosljedan oblik kanonskog URL-a | public/sitemap.xml:1 |

---

## seo-01 (P1): Nekonzistentan i pogresan zadani origin lomi kanonske URL-ove i sitemape

Problem: dva od tri generatora imaju zadani origin `https://lekta.hr`, dok treci
(pravne stranice) ima `https://lektahr.netlify.app`. Ziva domena je
`lektahr.netlify.app`; `lekta.hr` NIJE zivo (potvrdjeno u projektnoj memoriji i
`netlify.toml:20-22`). Kad `LEKTA_SITE_ORIGIN` nije postavljen (svaki lokalni build),
citatne i naslovnicke stranice dobiju canonical, og:url i sitemap unose na nepostojecu
domenu. To je vec utisnuto u commitani `dist/`.

Lokacija:
- `scripts/generate-citation-tools.mjs:37` -> `process.env.LEKTA_SITE_ORIGIN || 'https://lekta.hr'`
- `scripts/generate-title-page-tools.mjs:33` -> isti fallback `'https://lekta.hr'`
- `scripts/generate-legal-pages.mjs:24` -> `'https://lektahr.netlify.app'` (drugaciji default)

Dokaz (commitani dist):
- `dist/alati/citati/fpzg.html`: `<link rel="canonical" href="https://lekta.hr/alati/citati/fpzg.html">`
- `dist/alati/naslovnica/agr-diplomski.html`: `<link rel="canonical" href="https://lekta.hr/alati/naslovnica/agr-diplomski.html">`
- `dist/alati/sitemap-alati.xml` i `dist/alati/sitemap-naslovnica.xml` svi `<loc>` na `https://lekta.hr/...`
- Za usporedbu, `dist/privatnost.html` ima ispravan `https://lektahr.netlify.app/privatnost.html`
- `scripts/verify-deploy-dist.mjs` provjerava samo pravne markere, NE provjerava origin
  kanonskih URL-ova, pa ne bi uhvatio ovaj lom.

Reprodukcija: `node scripts/generate-citation-tools.mjs` bez postavljenog `LEKTA_SITE_ORIGIN`
proizvodi kanonske URL-ove na `lekta.hr`. Netlify deploy je zasticen jer `netlify.toml:22`
postavlja varijablu, ali svaki drugi put (lokalni build, rucni deploy dist artefakta,
druga CI okolina, greska u env konfiguraciji) tiho objavljuje krive kanone.

Posljedica: ako se ikad objavi build bez env varijable, ~275 stranica (citati + naslovnice)
dobije `rel=canonical` i sitemap unose na domenu koja nije u vlasnistvu/nije ziva. Google
tada te stranice deindeksira ili im pripisuje kanonsku vrijednost domeni koju vlasnik ne
kontrolira, sto je gubitak rangiranja za cijeli `/alati/` segment. Nedosljedni defaulti
takodjer znace da isti build daje dvije razlicite domene po tipu stranice.

Preporuceno rjesenje:
1. Ujednaci zadani origin na `https://lektahr.netlify.app` u sva tri generatora
   (izjednaci s `generate-legal-pages.mjs`).
2. U `scripts/verify-deploy-dist.mjs` dodaj tvrdi provjeru: svi `rel=canonical`, `og:url`
   i sitemap `<loc>` u `dist/` moraju poceti s `LEKTA_SITE_ORIGIN` (ili barem ne smiju
   sadrzavati `lekta.hr`); u suprotnom `process.exit(1)`.
3. Regeneriraj commitani `dist/` ili ga izbaci iz repozitorija ako je artefakt.

Acceptance kriteriji:
- Nijedna datoteka u `dist/**` ne sadrzi `lekta.hr` (osim ako to postane stvarna domena).
- `verify-deploy-dist.mjs` pada ako neki kanonski URL ili sitemap loc ne odgovara origin-u.
- Build bez env varijable proizvodi ispravnu (zivu) domenu ili eksplicitno pada.

Rizik regresije: nizak. Promjena zadane konstante i dodavanje verifikacije ne dira motor
analize ni parser. Jedini rizik je da nova verifikacija otkrije jos mjesta s krivom
domenom, sto je zeljeno ponasanje.

---

## seo-02 (P2): Staticke stranice citata su tanki near-duplikati bez stvarnog sadrzaja

Problem: 91 staticka stranica u `dist/alati/citati/*.html` dijeli identicno tijelo
(widget generatora citata + bulk sekcija + CTA). Jedini jedinstveni sadrzaj po stranici
je `<h1>` (naziv fakulteta) i jedna meta linija. Za fakultete BEZ verificiranog speca
(family-style) meta linija je samo "Stil: X. Prema profilu {naziv} u Lekti." bez izvora,
datuma ni ogranicenja. Osim toga, jedini kvalifikator ("opci oblik, provjeri upute
mentora") renderira se tek JS-om u prazan `<div id="style-info">`, pa ga crawler ne vidi
u statickom HTML-u.

Lokacija:
- `scripts/generate-citation-tools.mjs:311` (`pageShell`, emitira samo title/description/canonical)
- `scripts/generate-citation-tools.mjs:523` (`buildFacultyStylePage`, tijelo = H1 + metaLine + widget + CTA)
- `scripts/generate-citation-tools.mjs:340` (`<div id="style-info"></div>` prazan; puni ga TOOL_JS na klijentu, linija 252-264)

Dokaz:
- `dist/alati/citati/agr.html` tijelo: `<h1>Generator citata za Agronomski fakultet</h1>`
  + `<p class="lekta-tool-meta">Stil: Harvard / autor-godina. Prema profilu Agronomski
  fakultet u Lekti.</p>` + identican widget kao sve druge stranice.
- `dist/alati/citati/fpzg.html` (verificiran spec) ima nesto vise: izvor
  ("Pravila navodenja...") i datum provjere, ali i dalje bez vrste rada, akademske godine,
  statusa profila i poznatih ogranicenja.
- `pageShell` NE emitira Open Graph, Twitter ni JSON-LD (za razliku od naslovnickih
  stranica koje imaju FAQPage i OG).

Reprodukcija: usporedi bilo koje dvije citatne stranice; razlikuju se samo u nazivu
fakulteta i jednoj recenici. `curl` bez izvrsavanja JS-a pokazuje prazan `#style-info`.

Posljedica: Google moze tretirati skup od 91 near-identicne stranice kao thin/doorway
sadrzaj, sto vodi do neindeksiranja ("Crawled, currently not indexed") ili slabog
rangiranja. Kvalifikacija o pouzdanosti stila (kljucna za EEAT i za postenu poruku prema
korisniku) nije u crawlanom HTML-u.

Preporuceno rjesenje:
1. U staticki (server-side) HTML upisi diferencirajuci sadrzaj po fakultetu: status
   profila (verified / family / generic), vrste rada koje profil pokriva, akademsku godinu
   provjere, naziv izvora i datum provjere (za verificirane), poznata ogranicenja (za
   family-style eksplicitno "opci oblik, tocnu interpunkciju provjeri u uputama"), te
   vidljiv link na provjeru cijelog rada (CTA vec postoji).
2. Renderiraj `#style-info` caveat i u HTML-u (ne samo JS-om) da ga crawler vidi.
3. Dodaj JSON-LD (`SoftwareApplication` ili `HowTo`) i Open Graph, kao sto naslovnicke
   stranice vec imaju.

Acceptance kriteriji:
- Svaka citatna stranica ima najmanje jedan blok jedinstvenog, crawlanog teksta izvan H1
  (status, vrste rada, izvor/datum ili ogranicenja).
- `#style-info` caveat je prisutan u statickom HTML-u.
- Stranice imaju OG i JSON-LD.

Rizik regresije: srednji. Mijenja se generator koji pece ~91 stranicu; treba paziti da
`escapeHtml` pokriva novi sadrzaj i da se ne razbije CSP (sve inline). Ne dira analizu
ni parser.

---

## seo-03 (P2): Tool stranice nemaju canonical ni og:url (osim kartice.html)

Problem: od sest ulaznih tool stranica samo `kartice.html` ima `rel=canonical` i `og:url`.
`alati.html`, `citat.html`, `izjava.html`, `literatura.html` i `naslovnica.html` nemaju
niti jedno. Nedostatak canonicala ostavlja prostor za duplikate (npr. varijante s
parametrima, `index`/bez, http/https, trailing slash), a nedostatak `og:url` slabi
social preview.

Lokacija (head zavrsava, a canonical/og:url izostaju):
- `citat.html:1-109` (0 canonical, 0 og:url; OG blok pocinje na liniji 10)
- `alati.html:1-109` (0 canonical, 0 og:url)
- `izjava.html` (0 canonical, 0 og:url)
- `literatura.html` (0 canonical, 0 og:url)
- `naslovnica.html:1-142` (0 canonical, 0 og:url; ima ostale OG tagove)
- Kontraprimjer: `kartice.html` ima `<link rel="canonical">` i `<meta property="og:url">`.

Dokaz: `grep -c 'rel="canonical"'` vraca 0 za pet navedenih, 1 za `kartice.html` i
`index.html`.

Posljedica: rizik od duplikatnih URL-ova bez jasne kanonske varijante; nekonzistentno
ponasanje pri dijeljenju (og:url pomaze scraperima odrediti kanonsku metu).

Preporuceno rjesenje: dodaj `<link rel="canonical">` i `<meta property="og:url">` s
apsolutnom zivom domenom na svih pet stranica (kopiraj obrazac iz `kartice.html` ili
`index.html`).

Acceptance kriteriji: svih sest tool stranica i `index.html` imaju canonical + og:url s
`https://lektahr.netlify.app/...` apsolutnim URL-om koji odgovara stvarnoj ruti.

Rizik regresije: vrlo nizak. Samo dodavanje meta tagova u head, bez utjecaja na logiku.

---

## seo-04 (P2): landing_usporedba.html nema canonical, Open Graph, Twitter ni JSON-LD

Problem: usporedna landing stranica ima samo `<title>` i `<meta name="description">`.
Nema canonical, nijedan Open Graph tag, Twitter card ni JSON-LD, iako je uvrstena u
`sitemap.xml` (dakle namijenjena indeksiranju i dijeljenju).

Lokacija: `landing_usporedba.html:1-132` (description na liniji 6, title na liniji 8,
`</head>` na liniji 132; nula canonical/og/twitter/ld unosa). Uvrstena u
`public/sitemap.xml:10`.

Dokaz: `grep -cE "canonical|og:|twitter:|application/ld" landing_usporedba.html` vraca 0.

Posljedica: stranica namijenjena konverziji i dijeljenju nema social preview ni jasnu
kanonsku varijantu; slabija izvedba pri dijeljenju linka i potencijalni duplikat.

Preporuceno rjesenje: dodaj canonical, kompletan Open Graph blok (type, site_name, locale,
url, title, description), Twitter card, i po potrebi `WebPage`/`FAQPage` JSON-LD, prema
obrascu iz `index.html`.

Acceptance kriteriji: stranica ima canonical + puni OG + Twitter card; social debugger
(npr. rich results test) prikazuje ispravan naslov i opis.

Rizik regresije: vrlo nizak. Dodavanje meta tagova.

---

## seo-05 (P2): Nijedna stranica nema og:image ni social share sliku

Problem: nijedna stranica (glavne, tool, generirane, pravne) ne definira `og:image`, a
`twitter:card` je `summary` bez slike. U repozitoriju ne postoji nijedan social/og image
asset. Dijeljenje linka na drustvenim mrezama i u messaging aplikacijama daje pregled bez
vizuala.

Lokacija:
- `index.html:18` (`twitter:card` = `summary`, bez `og:image`); `og:image` grep = 0 na
  svim stranicama.
- Nema `og*.png/jpg`, `social*.png` ni `*share*.png` u `public/` ni u repozitoriju.

Dokaz: `grep -c og:image` vraca 0 za sve HTML datoteke; `find` za social asset vraca prazno.

Posljedica: nizi CTR i slabija prepoznatljivost pri dijeljenju; link preview bez brenda.

Preporuceno rjesenje: dodaj barem jednu default OG sliku (1200x630) u `public/`, referenciraj
je apsolutnim URL-om kao `og:image` (i `twitter:image`) na glavnim i tool stranicama, te je
propagiraj kroz generatore. CSP dopusta `img-src 'self'`, pa lokalno hostana slika prolazi.

Acceptance kriteriji: glavne stranice imaju `og:image` s apsolutnim URL-om koji vraca 200;
`twitter:card` po zelji `summary_large_image`.

Rizik regresije: nizak. Dodavanje asseta i meta tagova; paziti na apsolutni URL i CSP
(lokalna slika je unutar `img-src 'self'`).

---

## seo-06 (P3): Nepotpuna favicon i ikona pokrivenost

Problem: postoji samo `public/favicon.svg`. Nema `.ico` fallbacka, `apple-touch-icon`, PNG
ikona ni `webmanifest`. Uz to, `<link rel="icon">` postoji samo na `index.html` i pravnim
stranicama; tool stranice (`alati/citat/izjava/kartice/literatura/naslovnica`),
`landing_usporedba.html` i sve generirane stranice (`citati/*`, `naslovnica/*`) NE linkaju
favicon. Preglednici koji ne auto-otkrivaju SVG traze `/favicon.ico`, koji ne postoji.

Lokacija:
- `index.html:10` (jedini `rel=icon` u tool skupu); `grep -c 'rel="icon"'` = 0 za sve tool
  stranice i landing.
- `scripts/generate-citation-tools.mjs:311` (`pageShell` ne emitira favicon link).
- `scripts/generate-title-page-tools.mjs` (generirane naslovnice bez favicon linka).
- Samo `public/favicon.svg` postoji; nema `.ico`/`apple-touch`/`webmanifest`.

Dokaz: `grep -c 'rel="icon"'` = 0 na `alati/citat/izjava/kartice/literatura/naslovnica/landing`;
`find public dist -iname 'favicon*'` vraca samo `favicon.svg`.

Posljedica: vecina stranica prikazuje se bez favicona (prazna ili default ikona) u tabu i
oznakama; slabija prepoznatljivost brenda, moguci 404 zahtjevi na `/favicon.ico`.

Preporuceno rjesenje: dodaj `<link rel="icon" href="/favicon.svg">` (i po mogucnosti
`.ico` fallback te `apple-touch-icon`) u sve ulazne stranice i u `pageShell` oba generatora;
opcionalno dodaj minimalni `site.webmanifest`.

Acceptance kriteriji: svaka objavljena stranica u `dist/**` sadrzi favicon link; `/favicon.ico`
zahtjev ne vraca 404 (ili je pokriven SVG linkom na svakoj stranici).

Rizik regresije: vrlo nizak. Dodavanje linkova/asseta.

---

## seo-07 (P3): Nema prilagodjene 404 stranice

Problem: ne postoji `404.html` (ni u `public/`, ni u korijenu, ni u `dist/`), a `netlify.toml`
nema `[[redirects]]` fallback. Netlify tada servira genericki 404, sto je losa UX i propustena
prilika za zadrzavanje korisnika i internih linkova.

Lokacija: `netlify.toml:1-23` (nema `[[redirects]]` ni 404 handlinga); `find` za `404*.html`
vraca prazno.

Dokaz: `ls dist/404.html public/404.html 404.html` -> nema; `grep '\[\[redirects\]\]' netlify.toml`
-> nema.

Posljedica: neispravni ili zastarjeli linkovi vode na genericku 404 bez navigacije natrag u
app; blago negativan UX i SEO signal (bounce).

Preporuceno rjesenje: dodaj `public/404.html` s brendiranom porukom i linkovima na glavne
sekcije (pocetna, alati). Netlify automatski koristi `404.html` iz publish direktorija za
nepostojece rute.

Acceptance kriteriji: nepostojeca ruta vraca HTTP 404 s prilagodjenom stranicom koja nudi
navigaciju natrag.

Rizik regresije: vrlo nizak. Nova staticka datoteka.

---

## seo-08 (P3): Sitemap poboljsanja (nije index, bez lastmod, /alati izostaje, nedosljedan kanonski oblik)

Problem: `public/sitemap.xml` je jednostavan urlset s glavnim i pravnim stranicama. Ne
ukljucuje `/alati/**` stranice (one su u zasebnim sitemapima otkrivenim samo preko
`robots.txt`), nije sitemap index, i nijedan sitemap nema `lastmod`. Uz to, kanonski oblik
je nedosljedan: `citati/index.html` koristi eksplicitni `index.html` u kanonu, dok
`naslovnica/` koristi oblik direktorija.

Lokacija:
- `public/sitemap.xml:1-18` (glavni sitemap, bez `/alati/`, bez `lastmod`).
- `public/robots.txt:4-6` (tri odvojena sitemapa; alati sitemapi samo ovdje otkriveni).
- `scripts/generate-citation-tools.mjs:516` (`canonical: .../alati/citati/index.html`,
  eksplicitni index.html) naspram naslovnickog hub kanonala `/alati/naslovnica/`.
- Generirani `dist/alati/sitemap-*.xml` koriste `lekta.hr` (vidi seo-01).

Dokaz: `dist/alati/citati/index.html` canonical = `https://lekta.hr/alati/citati/index.html`;
`dist/alati/naslovnica/index.html` canonical = `https://lekta.hr/alati/naslovnica/`.

Posljedica: sitemap otkrivanje ovisi iskljucivo o robots.txt; bez `lastmod` crawler tezih
signala o svjezini; nedosljedan kanonski oblik moze stvoriti par duplikata (`/x/` vs
`/x/index.html`).

Preporuceno rjesenje: uvedi sitemap index koji referencira sve pod-sitemape; dodaj `lastmod`
u generatore; ujednaci kanonski oblik (preporuceno oblik direktorija `/alati/citati/` bez
`index.html`). Rijesi domenu kroz seo-01.

Acceptance kriteriji: postoji sitemap index; svi loc/canonical koriste isti oblik i istu
zivu domenu; barem generirani sitemapi imaju `lastmod`.

Rizik regresije: nizak. Mijenjaju se generatori i staticki sitemap; paziti da robots.txt i
dalje pokazuje na ispravne datoteke.

---

## Dodatne pozitivne napomene (bez akcije)

- `verification.html` ima `<meta name="robots" content="noindex, nofollow">` i iskljucena je
  iz deploy builda (`vite.config.ts:48`), pa interna konzola ne curi u indeks.
- Pravne stranice imaju jedinstvene naslove, ispravan canonical na zivoj domeni i
  `robots=index,follow` (`dist/privatnost.html` itd.).
- `index.html` ima kompletan OG, Twitter, canonical, WebApplication i FAQPage JSON-LD.
- Naslovnicke staticke stranice imaju stvaran, diferencirajuci sadrzaj (badge official/derived,
  FAQ sekcija, vrsta rada, FAQPage JSON-LD, OG) i nisu tanki duplikati (za razliku od citatnih).
- Svi HTML dokumenti imaju `lang="hr"` i jedinstvene `<title>`/`<meta description>` parove.
</content>
</invoke>

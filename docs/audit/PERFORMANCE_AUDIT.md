# Performance audit: Lekta

Datum: 2026-07-10. Opseg: statička procjena (bez pokretanja Lighthousea, bez builda). Metoda:
čitanje izvora plus mjerenje već postojećeg `dist/` artefakta (build od 2026-07-10 22:03),
grep markera po chunkovima i mjerenje veličina JSON izvora. Sve brojke su iz stvarnog builda
i izvornih datoteka, ne procjene napamet.

Live domena: https://lektahr.netlify.app. Aplikacija je klijentska (Vite plus TypeScript),
multi-page, bez frameworka. Teška analiza radi u Web Workeru; repair i analiza su lokalni.

## Mapa područja

- Ulaz javne aplikacije: `index.html` (statični hero plus markup), bootstrap `src/main.ts`
  koji učitava `src/shared/ui-boot.ts` (ikone, font, animacije) i `src/ui/app.ts` (orkestrator).
- Analiza: `src/analysis/analyze-docx.ts` (jezgra), `analyze-docx.worker.ts` (Web Worker),
  `analyze-docx-client.ts` (most prema workeru plus inline fallback).
- Podaci: `data/profiles/*` (profili plus draftovi), `data/sources`, `data/verification`,
  `data/catalog`, hidrirani kroz `src/*/*-loader.ts` i `src/profiles/profile-registry.ts`.
- Build i hosting: `vite.config.ts`, `netlify.toml`, `public/_headers`.

### Mjereno stanje builda (dist)

| Artefakt | Raw | Gzip |
| --- | --- | --- |
| `dist/assets/index-*.js` (glavni entry, kritični put index.html) | 2.478.762 B | 369.013 B |
| `dist/assets/analyze-docx.worker-*.js` | 168.827 B | 59.190 B |
| `dist/assets/naslovnica-*.js` (zaseban tool entry) | 334.493 B | 46.264 B |

Glavni entry chunk (`index-*.js`) je jedini `type=module` script u `dist/index.html` i nosi
oko 369 KB gzip JS-a na kritičnom putu početne stranice. Dominira ga autorski podatkovni sloj,
ne kod (dokazi u nalazima ispod).

### Što je već dobro (potvrđeno, nije nalaz)

- Teška analiza radi u Web Workeru (`analyze-docx.worker.ts`), pa golem dokument ne zamrzava
  UI; postoji inline fallback ako worker infrastruktura padne (`analyze-docx-client.ts:68-79`).
- `motion` biblioteka se lijeno učitava dinamičkim importom (`ui-boot.ts:22-29`); `canvas-confetti`
  se lijeno učitava tek na visok rezultat (`app.ts:520`). Nisu na kritičnom putu.
- `lucide` je uvezen kao tree-shakean podskup od 14 ikona, ne cijela biblioteka (`ui-boot.ts:10`).
- QA i setup kod je isključen iz javnog builda: u glavnom chunku nema markera `qaMode`, `setupMode`,
  `lekta.admin` (0 pojava), a `verification.html` (admin konzola) i njen import ~163 MB PDF-ova
  su izostavljeni preko `DEPLOY=1` (`vite.config.ts:37-48`).
- Verifikacijski ledger (`data/verification/ledger.json`, 1.72 MB) je uspješno tree-shakean iz
  glavnog chunka: marker `"ruleId"` ima 0 pojava u chunku naspram 3119 u izvoru. Import u
  `verification-registry.ts:6` ne dolazi u javni bundle jer app koristi samo `SOURCE_REGISTRY`.
- `URL.revokeObjectURL` se poziva nakon preuzimanja (`app.ts:572`); povijest analiza je ograničena
  na 8 laganih metapodatkovnih zapisa bez teksta rada (`app.ts:262`), pa nema curenja u localStorage.

## Tablica nalaza

| ID | Prioritet | Naslov | Lokacija |
| --- | --- | --- | --- |
| performance-01 | P1 | Glavni entry chunk 2,4 MB / 369 KB gzip na kritičnom putu, dominira ga autorski podatkovni sloj | dist/assets/index-*.js; src/profiles/profile-registry.ts:49 |
| performance-02 | P2 | Draftovi (1,3 MB) plus source-registry (152 KB) šalju se samo da bi se izračunala deterministička advisory lista | src/ui/app.ts:327; src/profiles/advisory-demotion.ts |
| performance-03 | P2 | DOCX i PDF motor učitava se eagerno na početnoj stranici (inline fallback plus statični import), iako treba tek nakon uploada | src/analysis/analyze-docx-client.ts:12; src/ui/app.ts:16,34 |
| performance-04 | P2 | Nema prekida (cancel) tekuće analize; worker se gasi tek pri novom pokretanju | src/ui/app.ts:449; index.html:329; analyze-docx-client.ts:35 |
| performance-05 | P2 | `build.json.stringify` nije uključen, veliki JSON se emitira kao JS objektni literali (sporiji parse) | vite.config.ts:67-70 |
| performance-06 | P2 | Nema immutable Cache-Control zaglavlja za hashirane `/assets/*`, ponovni posjet revalidira 369 KB | public/_headers:18-22 |
| performance-07 | P3 | Dvije varijabilne fontske obitelji plus svi podskupovi (ćirilica, grčki, vijetnamski) emitirani na svakoj stranici | src/shared/ui-boot.ts:6-7 |
| performance-08 | P3 | Cijela datoteka se čita u memoriju (`arrayBuffer`), grubi progress, mogući OOM na slabom mobitelu | src/analysis/analyze-docx.ts:43; src/ui/app.ts:534 |

---

## performance-01 (P1): Glavni entry chunk je 2,4 MB / 369 KB gzip, dominira ga autorski podatkovni sloj

Problem: jedini script na kritičnom putu `index.html` je `dist/assets/index-*.js` (2.478.762 B raw,
369.013 B gzip). Nije to prvenstveno kod aplikacije nego autorski podatkovni sloj upečen u bundle:
`data/profiles/verified-profiles.json` (1.453.295 B, potreban za selektore i pravila) plus svih 169
draft datoteka `data/profiles/*/drafts/*.json` (ukupno 1.318.192 B) plus `source-registry.json`
(152.793 B). Draftovi ulaze eagerno preko `import.meta.glob('../../data/profiles/*/drafts/*.json',
{ eager: true })` (`src/profiles/profile-registry.ts:49-51`).

Lokacija: `src/profiles/profile-registry.ts:49-51` (eager glob), `:7` (verified-profiles),
`src/ui/app.ts:21` (SOURCE_REGISTRY), build izlaz `dist/assets/index-*.js`.

Dokaz (grep markera nad glavnim chunkom `index-*.js`, svaki je polje iz draft ruleEntry provenijencije):
- `Risavi` x2380, `verifiedBy` x1392, `sourcePage` x1467, `machineCheckable` x1491.
- Isti markeri u izvoru: `cat data/profiles/*/drafts/*.json | grep -o verifiedBy | wc -l` = 1392,
  `Risavi` = 2380. Poklapanje 1:1 dokazuje da su draftovi (s punom provenijencijom: citati, biljeske,
  autor verifikacije, datumi) u cijelosti u kritičnom chunku.
- Reprodukcija: `wc -c < dist/assets/index-*.js` = 2478762; `gzip -c dist/assets/index-*.js | wc -c`
  = 369013.

Posljedica: na slabijem mobitelu skidanje i, važnije, parse plus compile 2,4 MB JS-a (uglavnom velikih
objektnih literala, vidi performance-05) troši sekunde glavne niti prije nego je alat interaktivan.
Time-to-Interactive alata (wizard, pokretanje analize) je vezan na taj trošak, iako je hero statični
HTML pa prvi paint ostaje brz. Ovo je najveća pojedinačna poluga za performanse na mobitelu.

Preporuka: skini autorski podatkovni sloj s kritičnog puta. Konkretno: (a) draftove i source-registry
makni iz runtime bundlea (vidi performance-02, pecenje advisory liste u buildu), (b) razdvoji
`verified-profiles.json` na lagani indeks za selektore (institucija, jedinica, program, status) koji
se učita odmah i puni skup pravila po profilu koji se dinamički učita tek pri odabiru ili analizi,
(c) uključi `build.json.stringify` (performance-05). Ciljaj glavni chunk ispod ~150 KB gzip.

Acceptance: glavni entry chunk (gzip) padne barem 40 posto naspram trenutnih 369 KB; draft provenijencija
(`verifiedBy`, `sourcePage`, `Risavi`) ima 0 pojava u glavnom chunku; funkcionalnost selektora, analize
i advisory democije nepromijenjena (golden i UI smoke zeleni); `npm run check` zelen.

Rizik regresije: srednji. Dinamičko učitavanje pravila po profilu mijenja redoslijed dostupnosti
podataka pa `currentProfile()` i `applyScoredAdvisory` treba prilagoditi asinkrono; postoji rizik
utrke između odabira profila i pristiglih pravila. Golden korpus štiti jezgru analize; UI grana treba
regresijski smoke za "odaberi profil pa odmah pokreni analizu".

## performance-02 (P2): Draftovi i source-registry putuju samo radi determinističke advisory liste

Problem: jedina runtime uporaba draftova plus `SOURCE_REGISTRY` u javnoj aplikaciji je
`applyScoredAdvisory(base, definition, draftRuleEntriesFor(definition.id), SOURCE_REGISTRY)`
(`src/ui/app.ts:327`). Ta funkcija (`src/profiles/advisory-demotion.ts:36-54`) preko
`computePublishedRules` (`src/verification/published-rules.ts:36-46`) samo izračuna koji su checkId-jevi
"scored" pa demotira ostatak u informativne, i upiše `base.advisoryDimensions` (lista kratkih stringova).
Rezultat je deterministička funkcija podataka: za dane draftove i registry uvijek daje istu listu.
Puni tekst provenijencije (`quote`, `note`, `verifiedBy`, `timestamp`) čini najveći dio 1,3 MB draftova,
a runtime ga koristi samo za provjeru prisutnosti (`isRuleScored` gleda ima li `sourcePage` i `quote`),
ne za sadržaj.

Lokacija: `src/ui/app.ts:327`, `src/profiles/advisory-demotion.ts:36-54`, `src/verification/published-rules.ts:29-46`.

Dokaz: `advisoryDimensions` je jedini izlaz koji app konzumira iz cijelog lanca (grep pokazuje da app
ne čita `quote`/`note`/`verifiedBy` draft polja nigdje osim kroz ovaj lanac). `computePublishedRules`
vraća `scored`/`advisory`/`effectiveScored`, a demotion koristi samo `scored.map(e => e.checkId)`.

Posljedica: oko 1,45 MB raw JSON-a (draftovi plus registry) postoji u javnom bundleu isključivo da bi se
u pregledniku, na svakom uređaju, iznova izračunala mala lista koju je moguće ispeći jednom u buildu.

Preporuka: u build koraku (postojeći `scripts/*` ili novi) predizračunaj po profilu
`advisoryDimensions` i eventualni scored skup, i emitiraj kompaktan `data/profiles/advisory-map.json`
(profileId pa lista checkId-jeva). Runtime učita samo tu mapu; draftovi i `source-registry.json` ispadaju
iz javnog grafa. Postojeći `computePublishedRules` ostaje kao build-time i verification-console alat.

Acceptance: `draftRuleEntriesFor` i `SOURCE_REGISTRY` više nisu u grafu `index.html` (0 pojava draft
markera u glavnom chunku); `applyScoredAdvisory` daje identičan `advisoryDimensions` kao prije za sve
profile (snapshot test nad postojećim rezultatom); `npm run check` zelen.

Rizik regresije: nizak do srednji. Logika ostaje ista, samo se pomiče u build. Rizik je da se pečena
mapa raziđe od izvora; pokrij testom koji u CI-ju usporedi pečenu mapu s izračunom iz izvora.

## performance-03 (P2): DOCX i PDF motor učitava se eagerno na početnoj stranici

Problem: iako analiza radi u workeru (zaseban chunk 168 KB), jezgra `analyzeDocx` ipak dolazi i u
glavni chunk jer je `analyze-docx-client.ts` statički uvozi za inline fallback
(`import { analyzeDocx } from './analyze-docx'`, `src/analysis/analyze-docx-client.ts:12`), a app
statički uvozi klijenta (`src/ui/app.ts:34`). Uz to, `pdfPreflight` je statički uvezen
(`src/ui/app.ts:16`). Tako parser, auditi i pravni citation engine sjede na kritičnom putu početne
stranice iako trebaju tek nakon što korisnik učita dokument, i motor je duplo isporučen (glavni chunk
plus worker chunk).

Lokacija: `src/analysis/analyze-docx-client.ts:12`, `src/ui/app.ts:16` (pdf), `src/ui/app.ts:34` (klijent).

Dokaz: markeri jezgre analize prisutni su i u glavnom i u worker chunku:
`"Otvaram Word strukturu"` (chunk 1, worker 1), `"Provjeravam font"` (chunk 1, worker 1),
`"dekompresijska bomba"` (chunk 3, worker 2). PDF: `"PDF/A"` prisutan u glavnom chunku.

Posljedica: nepotreban kod na kritičnom putu (parser, regex-teški citation engine, PDF preflight) povećava
parse plus compile trošak prije nego korisnik uopće nešto učita; jezgra se preuzima dvaput.

Preporuka: pretvori inline fallback u dinamički import unutar `analyzeDocxOffThread`
(`const { analyzeDocx } = await import('./analyze-docx')`) tako da fallback grana ne vuče motor u glavni
chunk. Još bolje, dinamički učitaj cijeli analizator (klijent plus pdf-preflight) na prvu interakciju
(drop ili odabir datoteke), pa je početna stranica bez motora. Worker chunk ostaje kako jest.

Acceptance: markeri jezgre analize imaju 0 pojava u glavnom `index-*.js` chunku (samo u worker i lijenom
analyzer chunku); prva analiza i dalje radi, uključujući fallback kad worker padne; golden zelen.

Rizik regresije: nizak do srednji. Fallback grana je rijetka pa je treba eksplicitno testirati
(simulirati `Worker` iznimku). Prvi upload dobiva kratki dodatni fetch analizatora; pokrij "pokreni odmah
nakon odabira" da nema utrke prije nego se motor učita.

## performance-04 (P2): Nema prekida (cancel) tekuće analize

Problem: ekran napretka (`#progressView`) ima spinner, poruku i traku, ali nema gumb za prekid
(`index.html:329`). Worker se gasi tek kad korisnik pokrene NOVU analizu (`activeWorker.terminate()`,
`analyze-docx-client.ts:35`). Za vrijeme analize velikog dokumenta korisnik nema način zaustaviti obradu
osim ponovnog učitavanja stranice; ne postoji ni event listener za tipku Escape na tom ekranu.

Lokacija: `src/ui/app.ts:449-457` (`runAnalysis`, nema abort handlera), `index.html:329` (markup bez
cancel gumba), `src/analysis/analyze-docx-client.ts:35` (terminate samo pri novom runu).

Dokaz: grep `cancel|prekid|odustani|abort` u `index.html` nalazi samo gumbe u modalima narudžbe i
plaćanja, ne u `#progressView`. `runAnalysis` postavlja token i onemogući gumb, ali ne izlaže poziv
`terminate()` korisniku.

Posljedica: na slabom uređaju ili neočekivano teškom dokumentu (unutar capova) korisnik je zaglavljen do
kraja obrade ili do reloada, uz utrošen CPU i bateriju. Loš dojam pouzdanosti.

Preporuka: dodaj gumb "Prekini" u `#progressView`; klik poziva `terminate()` aktivnog workera, poništi
token (`_analyzeToken`) i vrati na wizard. Izloži funkciju za prekid iz `analyze-docx-client.ts`
(npr. `cancelActiveAnalysis()` koja gasi `activeWorker`). Veži i Escape.

Acceptance: tijekom analize klik na "Prekini" (ili Escape) unutar ~100 ms vrati wizard, worker prestane
trošiti CPU (potvrda: `activeWorker` je null nakon prekida), a naknadni kasni postMessage se odbacuje
tokenom; `npm run check` zelen.

Rizik regresije: nizak. Token guard već postoji pa kasni rezultat ne može pregaziti stanje; treba samo
paziti da prekid ne ostavi `analyzeBtn` onemogućen (resetirati u finally grani).

## performance-05 (P2): JSON se emitira kao objektni literali, ne kao JSON.parse string

Problem: `vite.config.ts` (`build` blok, `:67-70`) ne postavlja `build.json.stringify`, a veliki profilni
i draft JSON u glavnom chunku je emitiran kao JS objektni literali. V8 parsira velike objektne literale
znatno sporije nego `JSON.parse` ekvivalentnog stringa (JSON.parse ima namjenski, brži put).

Lokacija: `vite.config.ts:67-70` (build konfiguracija bez `json` opcija).

Dokaz: u glavnom chunku `JSON.parse` ima samo 2 pojave, dok chunk sadrži cijeli
`verified-profiles.json` (1,45 MB) i 1,3 MB draftova. Da je stringify aktivan za te module, vidjeli bismo
`JSON.parse("...")` omote oko velikih blokova; nema ih, pa se podaci parsiraju kao kod.

Posljedica: nepotrebno spor startup parse na glavnoj niti, najizraženije na mobilnim CPU-ovima.

Preporuka: dodaj `build: { json: { stringify: true } }` u `vite.config.ts` (uz postojeće opcije), pa se
veliki JSON pretvara u `JSON.parse('...')`. Ovo je najjeftiniji dobitak i komplementaran je s
performance-01 i 02 (koji smanjuju količinu podataka).

Acceptance: nakon rebuilda glavni chunk sadrži `JSON.parse` omote za profilne podatke; ukupno vrijeme
"script evaluation" (mjereno u DevTools Performance na throttlanom CPU-u) mjerljivo padne; ponašanje
nepromijenjeno; `npm run check` zelen.

Rizik regresije: nizak. Semantika podataka je identična; jedini rizik su rubni tipovi (npr. `undefined`
vs izostanak ključa) koje JSON ionako ne nosi. Golden i registar testovi to hvataju.

## performance-06 (P2): Nema immutable cache zaglavlja za hashirane assete

Problem: `public/_headers` sadrži samo sigurnosna zaglavlja (CSP, X-Content-Type-Options, Referrer-Policy,
X-Frame-Options) za `/*` (`public/_headers:18-22`). Nema `Cache-Control` pravila za content-hashirane
datoteke u `/assets/*` (npr. `index-CzOlIHYC.js`, woff2 fontovi), koje su nepromjenjive po imenu i smiju
se keširati godinu dana. Bez eksplicitnog pravila ponovni posjeti nepotrebno revalidiraju velike assete.

Lokacija: `public/_headers:18-22`, `netlify.toml` (nema `[[headers]]` blokova za cache).

Dokaz: pregled cijelog `public/_headers` pokazuje jedan blok `/*` bez `Cache-Control`. Fingerprintirana
imena (`index-CzOlIHYC.js`) generira Vite i idealni su kandidati za `immutable`.

Posljedica: povratni korisnik na svaki posjet radi uvjetne zahtjeve (i po potrebi ponovno skida) 369 KB
glavni chunk plus ~228 KB fontova umjesto da ih posluži iz predmemorije bez mrežnog kruga.

Preporuka: u `public/_headers` dodaj blok za asete:
`/assets/*` pa `Cache-Control: public, max-age=31536000, immutable`. HTML ostavi kratko keširan
(`/*.html` pa `Cache-Control: public, max-age=0, must-revalidate`) da se novi build odmah vidi.

Acceptance: odgovori za `/assets/*` u produkciji nose `immutable` godinu dana; HTML nema dugi cache;
ponovni posjet ne radi mrežni krug za nepromijenjene asete (potvrda u DevTools Network: "from disk cache").

Rizik regresije: vrlo nizak. Hashirana imena jamče da promjena sadržaja mijenja URL, pa je dugi cache
siguran; jedini rizik je predugo keširanje HTML-a, što se izbjegava zasebnim kratkim pravilom.

## performance-07 (P3): Fontovi i emitirani nekorišteni podskupovi

Problem: `ui-boot.ts:6-7` uvozi pune obitelji `@fontsource-variable/inter` i
`@fontsource-variable/source-serif-4` (obje varijabilne), na svakoj stranici. Build emitira sve podskupove
(latin, latin-ext, ćirilica, ćirilica-ext, grčki, vijetnamski), vidljivo u `dist/assets/*.woff2`, iako
hrvatski sadržaj treba samo latin i latin-ext. Preglednik zbog `unicode-range` skida samo latin plus
latin-ext u praksi, pa mrežni trošak nije velik, ali CSS referira sve podskupove i emitiraju se nepotrebne
datoteke.

Lokacija: `src/shared/ui-boot.ts:6-7`.

Dokaz: `dist/assets/` sadrži `inter-cyrillic-*`, `inter-greek-*`, `source-serif-4-vietnamese-*` i slično,
premda je sadržaj isključivo hrvatski. Stvarno preuzeti podskupovi (latin plus latin-ext) su oko 132 KB
Inter plus oko 96 KB Source Serif.

Posljedica: minorno. Nešto veći build artefakt i dvije varijabilne obitelji na svakoj stranici; nema
preload hinta za primarni tekstualni font pa font može stići nakon prvog painta (FOUT/swap).

Preporuka: uvezi samo potrebne podskupove (fontsource ima ciljane importe latin plus latin-ext) i dodaj
`<link rel="preload" as="font" ... crossorigin>` za primarni Inter latin-ext. Nije blokator.

Acceptance: build ne emitira ćirilične, grčke i vijetnamske woff2; primarni font je preloadan; vizualni
izgled nepromijenjen.

Rizik regresije: nizak. Paziti da latin-ext ostane (nosi č, ć, ž, š, đ); bez njega bi hrvatski
dijakritici pali na fallback.

## performance-08 (P3): Cijela datoteka u memoriji, grubi progress, mogući OOM na mobitelu

Problem: analiza čita cijelu datoteku u memoriju odjednom (`await file.arrayBuffer()`,
`src/analysis/analyze-docx.ts:43`), zatim gradi polje svih odlomaka i runova. Progress je grubi, s fiksnim
postocima (8, 18, 35, 52, ...), bez inkrementalnog javljanja. Cap uploada je 20 MB na mobitelu i 50 MB na
desktopu (`src/ui/app.ts:534`, `effectiveUploadCap`), a `document.xml` se pod dekompresijskim capom smije
raširiti do ~200 MB po zapisu. Worker sprječava zamrzavanje UI-a, ali sam tab i dalje može premašiti
memoriju na slabom mobitelu prije nego auditi završe.

Lokacija: `src/analysis/analyze-docx.ts:43` (arrayBuffer plus izgradnja `paragraphs`), `:41`
(`MAX_ANALYZE_PARAGRAPHS=300000`), `src/ui/app.ts:534` (cap).

Dokaz: `analyzeDocx` sinkrono materijalizira `_bodyParas` i za svaki odlomak niz `runs`; nema streaminga
ni odbacivanja međurezultata. Progress se poziva na fiksnim točkama, ne po udjelu obrađenih odlomaka.

Posljedica: na graničnom dokumentu (npr. 20 MB s ekstremnom kompresijom) memorijski vrh u workeru može
srušiti obradu na jeftinom mobitelu; grubi progress ne daje korisniku pouzdan osjećaj napretka na dugom
dokumentu.

Preporuka: (a) sniziti mobilni cap prema stvarnom dekompresijskom vrhu ili gejtati po `deviceMemory`,
(b) inkrementalni progress po udjelu obrađenih odlomaka (npr. svakih N tisuća), (c) razmotriti oslobađanje
velikih međupolja čim se izračunaju agregati (fontMap i sličeno). Spojiti s performance-04 (prekid) da
korisnik ima izlaz.

Acceptance: na throttlanom mobilnom profilu granični dokument ili prođe ili padne s jasnom porukom (ne
tihi crash taba); progresna traka napreduje glatko na dugom dokumentu.

Rizik regresije: srednji. Promjena praga i točaka progressa je bezopasna, ali svako diranje jezgre
`analyzeDocx` mora prvo proći golden harness (CLAUDE.md pravilo: parser i auditi se ne diraju bez golden
testa).

# Usporedna analiza: gdje je Lekta u odnosu na postojece provjeritelje akademskog DOCX-a

Datum: 2026-08-09. Povod: vanjska analiza trzista determinististickih provjeritelja akademskih
Word dokumenata (LNU Thesis Format Tool, Lun51, UP Thesis Formatting Tool, FreeFormat, Docheck,
Litera DocXtools, DocStyle, PerfectIt, dva kineska patenta, DocFormFlow/DocFormBench). Ovaj
dokument tu analizu usporeduje s KODOM, ne s namjerama.

Kratko: ideja nije nova, ali vanjska analiza podcjenjuje sto Lekta vec ima i precjenjuje
vrijednost onoga sto predlaze kao obranu. Tri rupe koje je tocno pogodila su stvarne i sve tri
su zatvorene istog dana (vidi poglavlje 6).

---

## 1. Sto Lekta vec ima, a analiza to vodi kao nedostajuce

| Tvrdnja iz vanjske analize | Stanje u kodu |
| --- | --- |
| "reachable maximum score" je nov koncept | `repairCeiling()`, `src/ui/result-readiness.ts:95-106`. Racuna se iz TRENUTNOG stanja provjera, ne kao profilno svojstvo. Zivo od ranije. |
| "re-analysis after repair" je nov korak | Postoji dvaput: lokalni panel (`src/ui/repair-panel.ts`, `renderRecheck`) i serverski put (`src/ui/app.ts`, blok "Provjeravam popravljeni dokument"). |
| "regression detection" je nov korak | Logika je postojala, ali SAMO kao test-assert (`tests/helpers/closed-loop-runner.ts`, `tests/real-corpus/harness.ts`). U aplikaciji je nije bilo. |
| "safe / confirm / manual" klasifikacija | Tri neovisna sloja: `classifyFixability` (`src/analysis/check-fixer-map.ts:109`), `REPAIR_SURFACE` (`src/repair/repair-surface.ts`), `requiresConfirmation` plus `params.confirmed` (serverski sanitizer odbacuje nepotvrdene operacije). |
| "render verify" preko izvezenog PDF-a (LNU) | Lekta ima jaci oracle: `scripts/word-verify/check-worst-case.ps1` otvara rezultat pravim Wordom uz `OpenAndRepair=false` i MJERI stvarne vrijednosti, uz provjeru da tablice, slike, fusnote i tekst nisu pokvareni. Razlika je da je to razvojni alat, ne produkcijski korak. |
| "deterministicki motor bez modela" | Vec je arhitektonska cinjenica: popravak nema ni model ni prompt, recept je niz `{fixerId, ruleId, params}` (`docs/REPAIR_RECIPE.md`, generiran iz koda). |

Brojke iz generiranih artefakata (`docs/generated/`, dakle iz zivih podataka, ne iz sjecanja):

- 407 profila, 1751 ponudenih opcija popravka (`repair-coverage.json`).
- 31 registriran fixer: 5 profilnih, 25 UI-asistiranih, 1 dispatch-only.
- Realni korpus: 12 dokumenata, `failCount: 0`, `passRegressionCount: 0`
  (`repair-real-corpus.json`).

Usporedbe radi, LNU Thesis Format Tool po vlastitom opisu ima oko 75 pravila za JEDNO
sveuciliste.

## 2. Sto je analiza tocno pogodila

Tri rupe. Sve tri su bile stvarne.

### 2.1 Integritet paketa se nije provjeravao u produkciji

`src/repair/package-integrity.ts` je napisan bez ijedne ovisnosti bas zato da moze raditi u Deno
Edgeu i posluziti kao zadnji gate pred korisnikom. Do 2026-08-09 nije ga uvozio nijedan
produkcijski modul: samo testovi. Edge funkcija (`supabase/functions/repair-docx/index.ts`) je
uvozila samo `applyFixers` i slala bajtove koje nitko nije provjerio.

To je neugodnije nego sto zvuci, jer je razlog postojanja tog modula upravo to da
`@xmldom/xmldom` NE baca i ne stvara `parsererror` na neispravnom XML-u, pa provjera oslonjena
na `parseXml` daje lazno zeleno tocno na klasi greske koju regex-patch motor moze proizvesti
(RE-47).

### 2.2 Regresija se nije detektirala u produkciji

Popravak koji obori prethodno prolaznu provjeru se isporucivao. Oba re-check bloka prikazivala
su samo UKUPNI score, u kojem pad pojedine provjere nestane u zbroju: plus 6 na marginama i
minus 3 na fusnotama izgleda kao cistih plus 3.

### 2.3 Placeni put nije prikazivao strop

`repairCeiling` se nije uvozio u `src/ui/app.ts`, pa je objasnjenje "zasto 97 nije nedovrsen
posao" postojalo samo na besplatnom, lokalnom putu.

## 3. Gdje vanjska analiza grijesi

**OpenXmlValidator nije izvediv.** Prijedlog "svaki fixer prolazi kroz OpenXmlValidator" ne moze
se implementirati: to je .NET/C# API, a Lekta vrti popravak u pregledniku i u Deno Edgeu.
Ekvivalent koji Lekta ima je vlastiti skener (`package-integrity.ts`) u produkciji, python-docx i
lxml u CI-ju (Tier 1) te Word COM rucno (Tier 2). Ispravno citanje te preporuke je "ukljuci ono
sto vec imas", a ne "dodaj Microsoftov validator".

**Trzisne tvrdnje su neprovjerene.** Navodi o vise od 200 kineskih sveucilista, o patentima i o
verzijama pojedinih proizvoda nisu provjereni iz ovog okruzenja i u ovom dokumentu se vode kao
tvrdnje, ne kao cinjenice. Za kineske patente vrijedi i da je relevantnost za hrvatsko i EU
trziste niska sve dok se proizvod ne nudi izvan EU; ozbiljan prior-art pregled ima smisla tek uz
konkretan plan medunarodnog sirenja i uz patentnog strucnjaka.

**Moat nije petlja.** Analiza zakljucuje da je obrana deterministicki optimizator koji vrti
popravak do zasicenja. Tu petlju bi DocXtools ili DocStyle dodali u jednom kvartalu: to je
inzenjerski posao poznatog oblika. Ono sto se ne kopira je verificirani korpus pravila po
fakultetu s provenijencijom: `ruleEntries` s identitetom, autoritetom, izvorom, `sourcePage`,
`machineCheckable` i datumom verifikacije, plus hijerarhija autoriteta (odluka za godinu i vrstu
rada, pa sluzbena stranica studija, pa opce upute, pa uputa mentora). To je godinama prikupljan,
rucno potvrdivan podatak i to je stvarna obrana. Petlja je posljedica, ne uzrok.

## 4. Granica koju optimizacija ocjene ne smije prijeci

"Petlja dok se ocjena vise ne moze podici" stvara tihi poticaj da se provjere prekvalificiraju iz
`manual` u `assisted` ili `auto`, jer svaka takva prekvalifikacija podize strop. To je izravan
pritisak na tvrdo pravilo (Lekta nikad ne pise i ne prepravlja sadrzaj rada).

Pravilo za svaku buducu izvedbu optimizatora: `classifyFixability`
(`src/analysis/check-fixer-map.ts`) je ULAZNA vrijednost optimizatora, nikad prepreka koju smije
zaobici. Strop iz `repairCeiling` postoji upravo zato da ta granica bude vidljiva korisniku
umjesto da izgleda kao nedovrsen posao. Prekvalifikacija provjere smije se dogoditi samo kad
fixer iza nje stvarno postoji i stvarno je ozicen, i to se dokazuje testom, ne procjenom
(presedan i zabiljezen prijasnji promasaj: `check-fixer-map.ts:91-96`).

## 5. Mjerenja

Cijena strogog skenera (`scanXmlWellFormed`), izmjerena nad `word/document.xml` svih 15 golden
fixtura, 5 prolaza po dokumentu:

- propusnost oko 30 do 45 MB/s (manje datoteke su nize zbog fiksnog troska),
- najveci fixture (0,15 MB) skenira se za oko 4 ms,
- ekstrapolirano, `document.xml` od 5 MB kosta oko 140 ms po prolazu.

Zakljucak: jedan zavrsni prolaz (trenutna izvedba) je zanemariv. Skeniranje PO FIXERU nije
zanemarivo: do 31 fixera puta 140 ms daje oko 4 sekunde u najgorem slucaju, pa rollback po fixeru
(P1 nize) treba skenirati samo dijelove koje je taj fixer stvarno promijenio, ili koristiti
jeftini `hasAttributeAfterSlash` po koraku uz puni skener na kraju.

## 6. Promijenjeno 2026-08-09

1. **Vrata integriteta u produkciji.** `applyFixers` sada, prije `writeZip`, skenira svaki dio
   koji je sam promijenio ili dodao i provjerava da nijedan dio nije nestao bez izricitog zahtjeva
   fixera. Na kvar se popravak NE isporucuje: vracaju se ulazni bajtovi bit-identicni,
   `changelog: []` i novo polje `integrityFailure`. Time server ne trosi ni slot ni besplatnu
   kvotu (ista grana kao RE-32). Netaknuti dijelovi se ne skeniraju: oni izlaze s istim bajtovima
   s kojima su usli.
2. **Poruka koja ne laze.** `changelog: []` je do sada znacilo "nema se sto popraviti". Da se ta
   poruka ne bi posudila za kvar, `integrityFailure` se provlaci kroz Edge funkciju
   (`error: 'integrity_failed'`), `repair-client` (`kind: 'integrity_failed'`) i oba UI puta.
   Poruka razlikuje kvar koji je nas od kvara koji je dosao s ucitanom datotekom (`preexisting`),
   jer se ta dva ne smiju izgovarati istom recenicom.
3. **Regresijska vrata.** Nov modul `src/analysis/repair-regression.ts` s `detectPassRegressions`.
   Isti kod sada vrti i aplikacija i testovi (`tests/helpers/closed-loop-runner.ts` je presao na
   njega), pa postojeci closed-loop testovi ujedno dokazuju produkcijsko ponasanje. Oba re-check
   bloka prikazuju popis oborenih provjera i nude preuzimanje izvornog dokumenta.
4. **Strop i na placenom putu.** `repairCeiling` se sada racuna i u serverskoj re-check grani, uz
   iste uvjete prikaza kao na lokalnom putu.

Redoslijed isporuke NIJE mijenjan: preuzimanje se i dalje dogada prije ponovne analize
(dokumentirani ugovor: ponovna analiza nikad ne smije sprijeciti ni ponistiti preuzimanje).
Regresija se prikazuje uz izlaz natrag na izvornik, umjesto da blokira isporuku.

### Nusnalaz

Vrata integriteta su odmah uhvatila stvaran kvar u testnom fixtureu: scenarij
`final-document-inspector-fixer` u `tests/repair-dispatch-matrix.test.ts` imao je NEZATVOREN
`<w:r>`, dakle XML koji Word ne bi prihvatio, a matrica ga je vrtjela kao ispravan ulaz.
Ispravljeno. To je tocno klasa laznog zelenog zbog koje `package-integrity.ts` postoji.

## 7. Backlog (izvan opsega 2026-08-09)

Poredano po omjeru vrijednosti i rizika.

**P1, rollback po fixeru.** Arhitektonski je jeftin: `parts` se ne mutira, svaki fixer vraca nove
`parts`, pa je snapshot po koraku trivijalan. Danas jedan neispravan fixer obara cijelu bateriju
(abort-to-original). Uvjet je cijena skeniranja iz poglavlja 5. Ovisnost: nijedna.

**P1, "provjeri pa isporuci".** Preslagivanje redoslijeda tako da ponovna analiza tece PRIJE
predaje datoteke. Trazi svjesnu izmjenu dokumentiranog ugovora o neblokirajucoj analizi i placa se
nekoliko sekundi cekanja na naplatnom trenutku. Odluka je poslovna, ne tehnicka.

**P2, identitet nalaza.** `Check` nema id ni strukturno sidro (`src/scoring/checks.ts:18-27`).
Identitet je hrvatski naslov, lokacija se vadi regexom nad hrvatskom prozom
(`src/preview/preview-anchors.ts`), a "stabilan id" se izvodi iz naslova na tri mjesta s tri
razlicite `slug()` izvedbe (`triage.ts`, `finding-view-model.ts`, `finding-identity.ts`).
Preimenovanje naslova tiho lomi korelaciju s popravkom, klasifikaciju i strop. Ovo je isti nalaz
do kojeg dolazi i DocFormBench ("sto formatirati" je odvojen problem od "kako formatirati").
Najveca dugorocna vrijednost, ali dira analizu, triage, repair-items i golden snapshote, pa trazi
vlastiti golden baseline prije pocetka.

**P2, kanonski model dokumenta.** Danas je `paragraphs[]` ravan i bez uloge, a zakljucivanje uloge
(naslovnica, sazetak, sadrzaj, tijelo, natpis, literatura) ponavlja se ad hoc na vise mjesta,
dijelom regexom nad tekstom. `typography-structure.ts` uz to neovisno re-parsira sirovi XML. Ovo
je pretpostavka za DocStyleov obrazac "klasificiraj odlomak pa dodijeli stil".

**P3, stvarni prijelom stranica.** Analiza je iskljucivo XML-ska; broj stranica dolazi iz
`docProps/app.xml` i vec nosi iskren caveat. Bez rendera se dio zahtjeva ne moze provjeriti i to
je vec priznato u samoj analizi (provjera `Zahtjevi za rucnu zavrsnu provjeru`).

## 8. Kako je ovo provjereno

- `npm run check`: 306 test datoteka, 3770 testova, tsc strict i vite build, zeleno.
- Realni korpus i puna golden matrica fixera: bez laznih pozitiva novih vrata.
- `npm run verify:strict-open` (Tier 1, python-docx i lxml): 15/15 paketa.
- Tier 2 (Word COM, `verify:word`, `verify:word:worst`) ostaje rucni korak prije deploya repair
  motora, na Windowsu.

### Stanje deploya (2026-08-09)

- Tier 2 rucni gate iz `docs/GO_LIVE_REPAIR.md` (A0) odraden: `verify:word` i `verify:word:worst`
  oba izlazni kod 0. Pravi Word otvorio je popravljene dokumente uz `OpenAndRepair=false`, sva
  ciljana pravila su primijenjena, a tablice, slike, fusnote, sekcije, dijakritika i tekst tijela
  su ostali netaknuti.
- `repair-docx` deployan na produkciju: verzija 24 -> **25**, status ACTIVE. Povratna tocka je
  verzija 24. Boot potvrden: poziv s anon JWT-om vraca `{"error":"unauthorized"}` iz SAME funkcije
  (dakle modul se ucitao i izvrsio), a ne 401 s gatewaya.
- `source-check` nije mijenjan pa se nije ni redeployao.
- **Klijent jos NIJE deployan.** Dok traje to razdoblje vrijedi kombinacija "novi server, stari
  klijent": ako vrata integriteta opale, stari klijent ne poznaje `integrity_failed` pa padne na
  genericnu granu i ispise "nedostaje docxBase64". Nijedan pokvaren dokument se pritom ne isporucuje
  i nista se ne naplacuje, ali je poruka korisniku besmislena. Vrijedi samo za rijedak put; uklanja
  se prvim objavljivanjem klijenta (korak E runbooka, Netlify objava je rucna).

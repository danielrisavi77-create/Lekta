# Nalaz: deset kvarova u popravku, otkrivenih sirenjem generatora krsenja

Datum: 2026-08-29 (dopunjeno 2026-08-30). Status: svih deset izmjereno i uzrok utvrden.

- POPRAVLJENA su PET: `empty-paragraph-fixer` (cetvrti), `link-doi-fixer` (peti), sidro
  `heading-style-fixera` (sesti) preklapanje poveznica u istom runu (sedmi)
  i predodabir obveznih dijelova (osmi). Svih pet su bili stvarni kvarovi, i svih pet je imalo test
  koji je prolazio nad ulazom kakav produkcija ne proizvodi.
- LANAC JE VAZAN: cetvrti popravak je izlozio sesti i sedmi. Fixer koji nikad ne radi ne moze
  ni pokazati svoje kvarove, pa je mrtav kod skrivao dva daljnja.
- OD "TRI KOJA CEKAJU PRESUDU" jedan je presudjen i POPRAVLJEN: `required-section-fixer` (osmi)
  nije imao problem praga nego NEISPUNJIV uvjet predodabira. Preostala dva
  (`consistency`, `citation-bibliography-sync`) doista cekaju covjeka: prazan zadani parametar
  im je branjiva odluka, jer Lekta ne smije pogadjati koji je oblik tocan.
- Kvar mjerenja koji ih je brojao kao primijenjene rijesen je razredom `awaitingConfirmation`
  u `summarizeRepairOutcome`.

Zapisano u zasebnoj datoteci, a ne u `docs/REAL_CORPUS_TESTING.md`, jer je taj dokument u trenutku
nalaza imao nekomitirane izmjene druge sesije.

## Mjerenje

Preko OBA korpusa (`docs/generated/repair-real-corpus.json`, 14 dokumenata, i lokalni
`repair-real-corpus.local.json`, 102 dokumenta):

| fixer | ponudjen | promijenio dokument |
|---|---:|---:|
| `consistency-fixer` | 110 | **0** |
| `citation-bibliography-sync-fixer` | 62 | **0** |
| `required-section-fixer` | 49 | **0** |

Nijednom, ni na jednom od 116 dokumenata. Na samom FPZG-u to je 177 ponuda bez ijedne promjene.

## Uzrok: prazni parametri po konstrukciji

Sva tri su `requiresConfirmation` stavke s formom. `params` se racuna JEDNOM, pri gradnji stavke
(`params: form.buildParams(form)` u `src/ui/repair-items.ts`), dakle PRIJE nego je covjek ista
odabrao. Sto `buildParams` tada vidi, odlucuje hoce li fixer imati ikakav posao.

**Varijanta A, tvrdo `false`.** `consistency-fixer`
([repair-items.ts:288](../../../src/ui/repair-items.ts#L288)) gradi svaku grupu s
`selected: false, zoneConsent: false`, a `buildParams` propusta samo
`group.selected && group.zoneConsent && group.selectedCanonical`. Presjek je uvijek prazan, pa su
`params` uvijek `{ version: 1, groups: [], replacements: [] }`. Isto vrijedi za
`citation-bibliography-sync-fixer` (sve `selected: false`).

**Varijanta B, prag koji se ne dosize.** `required-section-fixer` predodabire kandidata uz
`confidence === 'high' && !!insertionAnchor`. Proba nad tri FPZG fixture (5 nedostajucih dijelova
ukupno) daje **svih 5 s `confidence: medium`**, nijedan `high`, iako svih 5 IMA `insertionAnchor`:

```
fpzg-novinarstvo-bibliografija.docx  keywords-en: medium, anchor DA  -> params.sections = 0
typografija-i-literatura.docx        abstract, keywords-en: medium   -> params.sections = 0
word-veliki-neuredan.docx            abstract, keywords-en: medium   -> params.sections = 0
```

Za usporedbu, `croatian-typography-fixer` predodabire uz `confidence === 'high'` i taj prag SE
dosize, pa je promijenio 57 FPZG dokumenata. Mehanizam je dakle ispravan; problem je gdje je prag.

## Zasto to nije (samo) kvar proizvoda, nego kvar MJERENJA

U sucelju covjek odabere kanonsku varijantu i potvrdi, pa se `buildParams` pozove ponovno sa
stvarnim odabirom. Prazni zadani parametri su zato branjiva odluka: Lekta ne smije pogadjati koji
je pravopis "tocan", jer bi to bio sadrzaj, ne forma.

Kvar je u tome sto harness te stavke broji kao da ih je primijenio. `RealCorpusResult` doslovno
tvrdi:

> `assistedUnresolvedCount`: Ciljano asistiranom stavkom (u sucelju trazi potvrdu) i dalje pada.
> Harness ju je PRIMIJENIO, pa je ovo stvaran jaz asistiranog fixera, ne "alat ceka korisnika".

Za ova tri fixera ta je tvrdnja NETOCNA: harness ih je poslao s praznim parametrima, pa nisu imali
sto primijeniti. Njihove `matchKeys` svejedno ulaze u ciljani nazivnik. FPZG-ovih 175
`assistedUnresolvedCount` je time napuhano, i to je isti obrazac koji je vec jednom izmjeren
("nazivnik napuhan", `targetedCheckCount` prije ispravka brojao `matchKeys` SVIH ponudjenih stavki).

Potvrda iz drugog smjera: `consistency-fixer` nosi `matchKeys: ['Dosljednost', 'Consistency
Engine']`, a mjerenje ih prijavljuje u `unmappedMatchKeys` na svih 74 FPZG rada, dakle ne pogadjaju
nijednu provjeru koju analiza emitira. To su MRTVI kljucevi, isti razred kao dva mrtva pravila
zatecena pri portu na `checkId` (vidi `src/analysis/check-fixer-map.ts`).

## Sto iz ovoga slijedi

1. **Harness mora razlikovati dva stanja**, inace ista brojka mijesa jaz motora i cekanje na
   covjeka: stavka primijenjena s NEPRAZNIM parametrima koja i dalje pada (stvaran jaz) i stavka
   koja nije imala sto primijeniti (`awaitingConfirmation`). Prijedlog: `assistedUnresolvedCount`
   broji samo prvo, a drugo dobiva vlastito polje.
2. **`required-section-fixer` treba presudu o pragu.** Ako je `medium` uz postojeci
   `insertionAnchor` dovoljno pouzdan, predodabir se spusta; ako nije, fixer se posteno vodi kao
   "ceka covjeka" i prestaje se brojati kao jaz.
3. **Mrtve `matchKeys`** (`Dosljednost`, `Consistency Engine`, uz vec zabiljezene `Cross-reference`,
   `Metapodaci`, `Komentari`, `Numeriranje stranica`) treba ili mapirati na stvarne provjere ili
   ukloniti. Mrtav kljuc sugerira pokrivenost koje nema.
4. **Za generator krsenja (F2)** ovo mijenja prioritet: nema smisla generirati dokument koji krsi
   dosljednost ili obvezne dijelove dok se ne rijesi 1 i 2, jer bi closed-loop takav slucaj
   prijavio kao neuspjeh popravka, a rijec je o stavci koja po ugovoru ceka potvrdu.

---

## Cetvrti slucaj, drugog uzroka i teza: `empty-paragraph-fixer` NIJE NIKAD NI PONUDJEN

Gornja tri se bar ponude i cekaju covjeka. Ovaj se ne ponudi nikad.

**Mjerenje.** `empty-paragraph-fixer`: **0 ponuda** na svih 116 dokumenata oba korpusa. Ukljucujuci
`fer-diplomski-prazni-odlomci.docx`, fixture koja se po tom kvaru i zove. U matrici pokrivenosti je
nepokriven na svih 407 profila.

**Uzrok.** `makeCheck` ([src/scoring/checks.ts:98](../../../src/scoring/checks.ts#L98)) pri
`max === 0` PREPISUJE naslov nalaza:

```ts
} else if (max === 0) {
  status = 'informational';
  if (issue) issue = { ...issue, severity: 'info', title: `Informativno: ${issue.title}` };
}
```

Provjera "Prazni odlomci" je nebodovana (`makeCheck('elements','Prazni odlomci','pass',0,0,...)`),
pa nalaz koji stigne do sucelja nosi naslov `Informativno: Dokument sadrži mnogo praznih odlomaka`.
`universalRepairableItems` je usporedjivao s GOLIM naslovom, pa `violated` nije bio `true` nikad;
`buildAllRepairableItems` stavku tada odbaci (`only()` filtrira `violated !== false`) i fixer
nestane iz ponude. Korisnik vidi nalaz o praznim odlomcima i ne dobije popravak koji u alatu
postoji.

Izmjereno na generiranom dokumentu: 2 prazna odlomka od 8 (25%, prag je 18%), nalaz se emitira,
provjera glasi `Informativno: ne ulazi u službenu ocjenu. 2 praznih odlomaka (25%)`.

**Zasto to nijedan test nije uhvatio.** `src/ui/repair-items.test.ts` je gradio svoj ulazni nalaz
RUCNO, s golim naslovom, dakle s oblikom koji produkcijski tok ne proizvodi. Test je prolazio, kod
je bio mrtav. Isti razred kao `tests/rule-compiler.test.ts` koji godinu dana usporedjuje
`clone(rules)` s `rules` nad registrom bez ijednog `ruleEntry`.

**Popravak (izveden 2026-08-29).** `baseIssueTitle()` skida ZATVOREN popis prefiksa koje dodaje
`makeCheck` (`Informativno: `, `Nije moguće utvrditi: `), a `matchKeys` sada nosi sva tri oblika
(naslov provjere, goli naslov nalaza, isporuceni prefiksirani). Testovi: novi slucaj za isporuceni
oblik, negativna kontrola da izmisljen prefiks (`Napomena: `) NE prolazi, i
`tests/violating-docx-structural.test.ts` koji zatvara petlju kroz stvarnu analizu i popravak.
Negativna kontrola nad samim popravkom izvedena: vracanjem usporedbe na goli naslov test pada.

**Otvoreno.** Pecena mjerenja (`repair-real-corpus.json`, `faculty-matrix.json`,
`coverage-cells.json`, `closed-loop.json`) jos ne odrazavaju ovaj popravak; regeneracija ceka cisto
radno stablo, jer u trenutku popravka drugu sesiju ima nekomitirane izmjene u `fixers.ts`,
`heading-structure.ts` i profilima, pa bi artefakt upekao tudje nedovrseno stanje.

---

## Peti slucaj: `link-doi-fixer` radi samo na runu BEZ ijednog svojstva

Otkriven sirenjem generatora krsenja (Faza 2), tocno onim putem zbog kojeg generator i postoji.

**Mjerenje.** Isti DOI (`doi:10.1234/lekta.2026.001`), isti nalaz
(`confidence: high`, `requiresConfirmation: false`, `safeOperations: ["normalize-doi"]`), tri
oblika runa:

| oblik runa | ishod |
|---|---|
| `<w:r><w:rPr><w:rFonts .../><w:sz .../></w:rPr><w:t>` (Wordov uobicajen zapis) | `unsupported-structure` |
| `<w:r><w:rPr><w:sz .../></w:rPr><w:t>` | `unsupported-structure` |
| `<w:r><w:t>` (bez ijednog svojstva) | popravak prolazi |

**Uzrok.** `enclosingRun` ([link-doi-fixer.ts](../../../src/repair/link-doi-fixer.ts)) je pocetak
runa trazio ovako:

```ts
const start = xml.lastIndexOf('<w:r', node.start);
```

Niz `<w:r` doslovno zapocinje i `<w:rPr>` i `<w:rFonts>`. Trazenjem unatrag od `<w:t>` cvora
pogodak je zato bio svojstvo runa, ne run. Kandidat tada ne prolazi vlastitu provjeru
`/^<w:r(?:\s|>)/` i fixer posteno odustaje, ali s krivom dijagnozom: struktura nije nepodrzana,
nego je nije uspio pronaci.

Ovo objasnjava zasto je `link-doi-fixer` na stvarnim FPZG radovima promijenio samo 14 od 74: prosli
su iskljucivo DOI-jevi koji su zavrsili u runu bez svojstava.

**Zasto to nijedan test nije uhvatio.** Oba postojeca testa u `src/repair/link-doi-fixer.test.ts`
koriste `<w:p><w:r><w:t>doi:...</w:t></w:r></w:p>`, dakle bas onaj jedini oblik koji je radio.
Treci put isti obrazac: test gradi ulaz rucno, u obliku koji produkcija ne proizvodi.

**Popravak (izveden 2026-08-29).** Skeniranje unatrag regexom `/<w:r(?=[\s>])/gi` umjesto
`lastIndexOf`. Granica rijeci ne bi pomogla kao zamjena za lookahead jer izmedju `r` i `P` u
`<w:rPr>` nema granice (oba su znakovi rijeci), a `lastIndexOf` ionako ne prima uzorak.
Tri nova slucaja pokrivaju sva tri oblika runa i tvrde da svojstva runa PREZIVE zahvat (popravak
DOI-ja ne smije usput promijeniti font ni velicinu). Negativna kontrola izvedena: vracanjem
`lastIndexOf` padaju tocno ta tri, a gol run i dalje prolazi.

**Provjereno da je pojava usamljena.** `lastIndexOf('<w:tc')` u `bibliography-repair-fixer` i
`citation-bibliography-sync-fixer` gadja i `<w:tcPr>`, ali ondje je rijec o booleovskoj provjeri
"jesmo li unutar celije", a `<w:tcPr>` postoji samo unutar `<w:tc>`, pa zakljucak ostaje tocan.
`lastIndexOf('<w:hyperlink')` nema srodni prefiks.

---

## Sesti slucaj: `heading-style-fixer` gadja bez sidra, pa ponovna primjena nije no-op

Otkriven posljedicom cetvrtog popravka, sto je i bio smisao sirenja generatora.

**Mjerenje.** Nakon ozivljavanja `empty-paragraph-fixera`, 9 od 54 stvarna rada dobilo je ishod
`fail`. Uzrok nije bio pokvaren paket (`integrityFailure: null`, paket citljiv, nula regresija) nego
`secondPassNoOp: false`: ponovna primjena ISTIH zahtjeva na vec popravljen dokument opet mijenja
dokument, i to preko `heading-style-fixera`. Izuzimanjem samo `empty-paragraph-fixera` iz skupa
zahtjeva drugi prolaz postaje cist no-op, cime je okidac potvrdjen.

**Uzrok.** `heading-style-fixer` mete gadja iskljucivo po `paragraphIndex`, BEZ ikakvog sidra, za
razliku od `link-doi`, `croatian-typography` i `required-section`, koji nose `anchorFingerprint`.
`empty-paragraph-fixer` je `INDEX_SHIFTING`, pa uklanjanjem odlomaka pomakne sve kasnije indekse.

Prvi prolaz time NIJE ugrozen, i to je zasluga postojece arhitekture: `INDEX_SHIFTING_FIXERS` po
ugovoru idu ZADNJI, pa svi anchor-osjetljivi rade nad jos nepomaknutim indeksima. Ugrozena je samo
ponovna primjena istog skupa zahtjeva.

**Ozjbiljnost, izmjerena a ne procijenjena.** Ocjena 90 -> 90 -> 90, nula regresija prolaza, a
vidljivi tekst izmedju prvog i drugog prolaza IDENTICAN. Druga primjena dira XML oblikovanja, ne
sadrzaj. Stvarni korisnicki tok je uz to cist, jer sucelje prije svakog popravka ponovno analizira.

**Popravak.** Mete nose `anchorText` (tekst naslova kakav je analiza vidjela), a `apply-fixers.ts`
prije poziva fixera odbaci metu ciji se tekst vise ne poklapa; kad su sve mete bile usidrene i
nijedna ne stoji, vraca se `stale-anchor`. Provjera stoji u `apply-fixers.ts`, a ne u
`headingStyleFixer`, iz dva razloga: ondje su bajtovi vec dostupni, i `HeadingStyleRepairTarget`
(u `src/repair/fixers.ts`, datoteci koju je u tom trenutku mijenjala druga sesija) ostaje netaknut.
Zahtjev BEZ sidra se ponasa kao prije, pa stari klijenti i pecene projekcije rade nepromijenjeno.

## ZAMKA: deklaracija funkcije izmedju `case` grana tiho gasi fixer

Prva izvedba gornjeg popravka stavila je dvije pomocne funkcije IZMEDJU `case` grana unutar
`switch` bloka. TypeScript to prihvaca i `tsc --noEmit` prolazi, ali u izvodjenju su takve
deklaracije u temporalnoj mrtvoj zoni, pa poziv iz ranije grane baca:

```
Cannot access 'paragraphTextsForAnchors' before initialization
```

`applyFixers` iznimku fixera guta u `catch` i prijavi ga kao preskocen, ali **bez razloga**:
`skipped: ["heading-structure-universal"]`, `skippedReasons: {}`. Fixer time izgleda kao da je
uredno odlucio ne raditi nista. Izgubljeno je oko sat vremena na pogresnog osumnjicenika, jer je u
istom prozoru druga sesija commitala izmjene bas oko naslova, pa je nestanak popravka izgledao kao
tudja regresija.

Dva pravila iz ovoga:

1. Pomocne funkcije za `switch` idu na MODULSKU razinu, nikad izmedju grana.
2. `skippedReasons` bez zapisa za `ruleId` znaci "fixer je bacio", ne "nije imao sto raditi". Ta se
   dva stanja u dijagnostici moraju citati razlicito.

---

## Sedmi slucaj: dvije poveznice u ISTOM runu kvarile su cijeli paket

Najgori po posljedici, i takodjer otkriven tek kad je `link-doi-fixer` pocelo raditi.

**Mjerenje.** Na `local-34-diplomski` jedan bibliografski zapis nosi dvije URL adrese u istom runu.
Svaka operacija SAMA prolazi uredno; obje zajedno daju
`word/document.xml: ocekivan </w:p>, a nadjen </w:hyperlink>`.

| poslano | changelog | integritet |
|---|---:|---|
| samo prva operacija | 1 | uredno |
| samo druga operacija | 1 | uredno |
| obje | 0 | **paket odbijen** |

**Uzrok.** Svaka operacija racuna `beforeText`/`afterText` nad CIJELIM tekstom svojega runa i gura
zamjenu preko cijelog raspona tog runa. Dvije operacije nad istim runom time upisu dva zapisa s
identicnim `start`/`end`; zamjene se primjenjuju silazno po `start`, pa druga rezuje po vec
izmijenjenom nizu.

**Zasto je posljedica bila veca od same poveznice.** Vrata integriteta odbijaju CIJELI paket, a
`applyFixers` tada vraca ULAZNE bajtove uz prazan changelog. Korisnik je zbog jedne poveznice gubio
i svih ostalih sest zahvata na tom dokumentu, i to bez ijedne poruke o tome sto je zapravo palo.

**Popravak.** `claimedRanges`: raspon runa se u jednom pozivu smije preurediti samo jednom, a
sljedeca operacija nad istim runom se posteno preskace. Spajanje dviju poveznica u jedan run trazi
trodijelnu podjelu runa i NIJE ovdje rijeseno; kad nijedna operacija ne prodje, vraca se
`unsupported-structure` umjesto tihog uspjeha. Test tvrdi uravnotezenost `<w:hyperlink>` i `<w:p>`
oznaka i da autorov tekst prezivi zahvat; negativna kontrola izvedena.

**Ishod na korpusu** (54 stvarna rada, prije i poslije sestog i sedmog popravka):

| | prije | poslije |
|---|---:|---:|
| `fail` | 9 | **0** |
| pad integriteta | 1 | **0** |
| `secondPassNoOp: false` | 9 | **0** |
| regresija prolaza | 0 | 0 |

---

## Osmi slucaj: `required-section-fixer` je imao NEISPUNJIV uvjet predodabira

Ovo je bio treci od "tri koja cekaju presudu". Presuda je: **nije bila stvar praga nego logike.**

**Nalaz.** `requiredSectionsRepairableItem` gleda iskljucivo NEDOSTAJUCE dijelove
(`candidates.filter((c) => !c.present)`), a predodabirao je uz `confidence === 'high'`. U
`src/analysis/required-sections-structure.ts` stoji:

```ts
let confidence: RequiredSectionConfidence = present ? 'high' : 'medium';
```

Nedostajuci dio dakle NIKAD nije `high`. Uvjet je bio neispunjiv po konstrukciji, pa su
`params.sections` uvijek bili prazni: 49 ponuda na 116 dokumenata, 0 promjena.

**Sto `confidence` zapravo znaci za nedostajuci dio.** Samo dvije vrijednosti su dostizne:

| vrijednost | znacenje |
|---|---|
| `medium` | pronadjeno je sigurno body-level sidro za umetanje |
| `low` | sidra nema, ili ih je vise; analiza tada sidro i BRISE |

Razlika koja nosi odluku je dakle `medium` prema `low`, a ne `high` prema ostalima.

**Popravak.** Uvjet glasi `confidence !== 'low' && !!insertionAnchor`. Oba dijela stoje namjerno: i
ako se pravila pouzdanosti kasnije prosire, predodabir ostaje vezan uz postojanje sidra.

**Sto se NIJE promijenilo.** Stavka i dalje nosi `requiresConfirmation: true`, pa se nijedan naslov
ne umece bez izricite korisnikove potvrde. Stavka i dalje trazi verificiran `required-section-rules`
zapis s izvorom, stranicom i citatom, pa se ne umece nista sto fakultet nije propisao. Umece se
samo NASLOV i oznaka za unos; akademski sadrzaj se ne generira.

**Gardovi.** Invariant "nedostajuci dio nikad nije `high`" je PRIBIJEN u
`src/analysis/required-sections-structure.test.ts`, uz tvrdnju da sidro postoji tocno kad
pouzdanost nije `low`. Predodabir je pokriven u `src/ui/repair-items.test.ts`, s negativnom
kontrolom za `low` i za izostanak sidra, i s tvrdnjom da bez verificiranog pravila stavke uopce
nema. Negativna kontrola nad samim popravkom izvedena: vracanjem uvjeta na `high` pada tocno taj
test.

**Obrazac koji se ponavlja.** Ovo je cetvrti put u istoj sesiji da uvjet ili usporedba nikad ne
pogodi svoju populaciju: prazni odlomci (prefiks naslova), `link-doi` (`lastIndexOf` gadja
`<w:rPr>`), sidro naslova (bez sidra) i sada `high` koji za nedostajuci dio ne postoji. Zajednicko
im je da NIJEDAN nije bio vidljiv iz testa, jer je svaki test gradio svoj ulaz rucno, u obliku koji
produkcija ne proizvodi.

---

## Deveti slucaj: fixer koji je ISTOVREMENO pomicatelj indeksa i ovisnik o sidru

Osmi popravak (predodabir) bio je nuzan, ali ne i dovoljan. Cim je `required-section-fixer` dobio
neprazne parametre, pokazalo se da ga lanac odbija.

**Mjerenje.**

| kako je pokrenut | ishod |
|---|---|
| SAM | primijenjen 5 od 7 |
| u punom lancu | **0 od 7**, svih 7 `stale-anchor` |

Uklanjanje bilo kojeg POJEDINOG fixera nije pomoglo, pa je test radjen u parovima. Krivci su tocno
dva: `heading-style-fixer` (dodaje `pStyle`) i `final-document-inspector-fixer` (brise `w:rsid*`
kroz cijeli paket, i vec je u kodu imenovan kao `GLOBAL_REWRITE_FIXERS`).

**Uzrok je arhitektonski, i vrijedi ga izgovoriti tocno.** Postojeca zastita glasi: anchor-osjetljivi
fixeri rade nad NEPOMAKNUTIM indeksima, jer `INDEX_SHIFTING_FIXERS` idu ZADNJI. Ali
`required-section-fixer` je OBOJE: i pomice indekse (umece sekcije) i ovisi o sidru. Kao pomicatelj
mora ici zadnji, a kao ovisnik o sidru bi morao ici rano. Redoslijed tu proturjecnost ne moze
rijesiti.

**Popravak.** Sidro sada vrijedi ako se poklapa OTISAK **ili** TEKST odlomka. Ni `pStyle` ni brisanje
`rsid`-ova ne mijenjaju tekst, pa je odbijanje bilo lazno.

Ovo NIJE re-anchoring, koji je u projektu izricito odbacen ("Rjesenje je redoslijed, ne
re-anchoring"): odlomak se NE trazi drugdje u dokumentu, nego se na ISTOM indeksu dopusta druga, uza
potvrda identiteta. Prazan tekst se ne priznaje, inace bi svaki prazan odlomak bio sidro za bilo sto.

**Ishod:** u punom lancu 0 od 7 -> **4 od 7 primijenjeno**, bez ijednog pada integriteta.

**Gardovi.** `src/repair/required-section-fixer.test.ts` nosi BASELINE tvrdnju da se otisak doista
razlikuje nakon promjene oblikovanja (bez nje bi test prolazio vakuumski), pa tri negativne
kontrole: bez tekstualnog sidra ostaje `stale-anchor`, promijenjen tekst ostaje `stale-anchor`, i
prazno sidro se ne priznaje. Negativna kontrola nad samim popravkom izvedena.

---

## Odluka vlasnika: peto izuzece od pravila o vidljivom tekstu (2026-08-30)

Kad je `required-section-fixer` konacno proradio, harness ga je oznacio kao `unexpectedTextChange`,
jer umetanje naslova mijenja vidljivi tekst, a `TEXT_CHANGING_BY_DESIGN` je imao pet fixera i on
nije bio medju njima. To NIJE bio kvar nego pitanje tvrdog pravila, pa je odluka trazena od
vlasnika, a ne donesena usput.

**Sto se tocno umece.** Izmjereno na `local-36-diplomski`: JEDAN naslov,
`"kljucne rijeci / keywords"`, razlika 25 znakova. Bez rezerviranog teksta, bez komentara, bez
izjave. Rezervirani tekst i komentar umecu se samo kad ih profil izricito trazi.

**Obrazlozenje odluke (prihvaceno).** Umece se iskljucivo natpis koji propisuje VERIFICIRANO
pravilo profila (`required-section-rules` sa `sourceId`, `sourcePage` i doslovnim citatom), dakle
ono sto je fakultet sam propisao, i to samo uz izricitu korisnikovu potvrdu
(`requiresConfirmation: true`). Granica prema tvrdom pravilu ostaje netaknuta: umece se natpis, nikad
recenica rada.

Zapisano u PARU u `CLAUDE.md` i `AGENTS.md`, po uzoru na `toc-field-fixer`.

**Ishod na 54 stvarna rada, kroz cijeli niz od osmog do devetog popravka:**

| | prije osmog | poslije devetog |
|---|---:|---:|
| `required-section-fixer` promijenio dokumenata | 0 | **12** |
| ciljanih provjera | 127 | 141 |
| rijesenih | 41 | 42 |
| `awaitingConfirmation` | 30 | 16 |
| `fail` | 0 | **0** |
| pad integriteta | 0 | 0 |
| regresija prolaza | 0 | 0 |

Porast ciljanih provjera sa 127 na 141 NIJE pogorsanje nego istinitije mjerenje: te su provjere
prije bile skrivene u razredu "ceka covjeka", jer ih fixer nikad nije ni pokusao popraviti.

---

## Deseti nalaz: mrtvi `matchKeys` (i dva koja sam sam unio)

**Sto su `matchKeys`.** Koreliraju nalaz na kartici rezultata s TOCNO onom stavkom popravka koja ga
rjesava (`pickTargetItem`, RESULT-03). Nalaz nosi `[issue.title, check.title]`, pa kljuc koji nije
naslov PROVJERE ne moze pogoditi nista. `summarizeRepairOutcome` takav kljuc prijavi u
`unmappedMatchKeys`, dakle sutnja se imenuje, ali se dotad nije uklanjala.

**Mjerenje.** Na 54 stvarna rada bilo je **15 razlicitih** nemapiranih kljuceva, a ne sest koliko je
plan pretpostavljao. `stableCheckId` ne prepoznaje nijedan, i nijedna emitirana provjera ne nosi
takav naslov: to su `where` oznake LOKACIJE, isti razred kao dva mrtva pravila zatecena pri portu na
`checkId`.

**Dva su bila moja.** Uz `Prazni odlomci` (ispravan naslov provjere) dodao sam i dva naslova NALAZA,
u uvjerenju da trebaju za korelaciju. Ne trebaju: nalaz vec nosi oba naslova, pa naslov provjere sam
zatvara korelaciju. Ta dva kljuca su bila cisti sum, 14 pojava na 54 rada.

| fixer | ZIV kljuc | uklonjeno mrtvih |
|---|---|---:|
| `croatian-typography` | `Tehnicko-tipografska dosljednost` | 2 |
| `field-integrity` | `Brojevi stranica` | 3 |
| `section-surgery` | `Margine dokumenta` | 2 |
| `empty-paragraph` | `Prazni odlomci` | 2 |

Sva cetiri zadrzavaju ziv kljuc, pa je korelacija netaknuta; pokriveno testom da nalaz i dalje
pogadja stavku preko naslova provjere.

**Dva fixera NISU dirana, i to je odluka.** `final-document-inspector-fixer` (5 kljuceva) i
`consistency-fixer` (2) nemaju NIJEDAN ziv kljuc. Brisanje bi sakrilo da ni s jednom provjerom nisu
korelirani, a to znaci da se njihov rad nikad ne moze pripisati nijednoj rijesenoj provjeri, iako
mijenjaju gotovo svaki dokument. Ta se sutnja imenuje, ne brise.

**Ishod:** nemapiranih kljuceva **15 -> 7**, i svih 7 pripada tocno tim dvama fixerima. Nista drugo
vise ne sumi.

**Gard.** `tests/violating-docx-structural.test.ts` trazi da svaka stavka ima barem jedan kljuc koji
pogadja stvarnu provjeru, uz izricit popis te dvije iznimke i tvrdnju da se popis NE SMIJE siriti u
tisini. Negativna kontrola izvedena: vracanjem mrtvih kljuceva gard pada i imenuje krivca.

---

## Otvoreno: `required-section` pada na rucnom sadrzaju (nasla Wordova fixtura)

Nije popravljeno. Zapisano ovdje jer je sesija koja je fixturu napravila u medjuvremenu
restartala, pa poruka nije mogla biti dostavljena.

**Nalaz.** `tests/fixtures/docx-word/manual-toc.docx` (rucni sadrzaj, pravi Word) obara
`required-section-fixer` uz `stale-anchor`. Stabilno u tri prolaza.

| kako je pokrenut | ishod |
|---|---|
| sam | PRIMIJENJEN |
| bilo kojih 7 od 8 fixera | PRIMIJENJEN |
| svih 8 | `stale-anchor`, changelog 11 |

**Sto se vidi u izlazu.** Sidro je `paragraphIndex 2`, `anchorText "1 uvod 1"`. Nakon punog lanca
odlomci su:

```
0  "Sadrzaj"
1  "Sadrzaj se azurira u Wordu: kartica Reference > Azuriraj tablicu..."   <- UMETNUTO
2  "1. Uvod 1"
```

`toc-field-fixer` umece uputu i time sve pomice za jedan, pa sidro s indeksa 2 gadja umetnuti
odlomak. Po `INDEX_SHIFTING_ORDER` bi `required-section` (3) trebao ici PRIJE `toc-fielda` (5), pa
je red prvo mjesto koje treba provjeriti.

**Sto NIJE objasnjeno.** Zasto uklanjanje BILO KOJEG fixera popravlja ishod. Da je uzrok samo
umetanje iz `toc-fielda`, uklanjanje npr. `font-fixera` ne bi smjelo pomoci. Dok se to ne razumije,
svaka hipoteza o uzroku je nepotpuna.

**Zasto je vazno.** Rucni sadrzaj je cest oblik u stvarnim radovima, a ovo je treci put da isti
razred (sidro protiv pomaka indeksa) proizvede kvar. Prva dva su popravljena; ovaj je nadjen tek
kad je u korpus usao dokument koji je napisao pravi Word.


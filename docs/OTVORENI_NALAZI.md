# Otvoreni nalazi

Popis mjesta na kojima je kvar IZMJEREN ili osnovano posumnjan, a nitko ga ne drzi. Nije plan rada
nego zaliha: tko ima prostora, uzima s vrha i javi da je uzeo.

Sastavljeno 2026-09-03. Svaka stavka nosi kako je utvrdjena, da se ne mora ponavljati mjerenje.

---

## A. Blokira granu prema masteru

Grana je 60+ commita ispred zelenog mastera i CI joj je CRVEN. Merge bi upravo sada porusio master.

### A1. `globSync` trazi Node 22, a `engines` deklarira `>=20`  (ZATVORENO `1d818838`)

    scripts/gen-profile-rules-server.mts:18   import { globSync } from 'node:fs'
    tests/profile-rules-server.test.ts:15     isto

`node:fs.globSync` postoji od Node 22. `package.json` kaze `{"node":">=20"}`, a CI vrti matricu 20 i
24, pa grana 20 pada. Lokalno se ne vidi jer je stroj na Node 24: klasicno "radi kod mene".

RIJESENO zamjenom za zajednicki obilazak (`scripts/draft-files.mts`), ne podizanjem `engines`:
podizanje bi suzilo podrzane verzije, sto je proizvodna odluka a ne cistka. Popis staza je
usporedjen izravno s `globSync` (338 datoteka, isti redoslijed, identican), pecena projekcija je
nakon regeneracije BAJT-IDENTICNA, test 8/8. Gard nad obilaskom je `tests/draft-files.test.ts`
(`7061c480`); zadnja tvrdnja prebrojava draftove NEOVISNIM putem, jer dijeljeni obilazak drift
test po konstrukciji ne moze provjeriti. Pretrazeni su i ostali Node 22+ API-ji: nijedan.

### A2. Dvije pass-regresije `structure.heading.hierarchy`  (IZMJERENO)

    local-13-zavrsni, local-27-zavrsni

Preostatak nakon `6fa30bfc` (neidempotentnost 7 -> 0) i `fef95ad1` (oba `-diplomski` slucaja).
Luk je provjeren nad ISTOM populacijom (45 dokumenata, 7 dopustenih commitanih + 38 lokalnih):

    cist HEAD    11 padova   7 neidempotentnih   4 regresije
    6fa30bfc      4 pada     0                   4
    fef95ad1      2 pada     0                   2

Polaziste za sljedeceg: zbirna polja izvjestaja NE razlikuju regresirajuce od cistih dokumenata
unutar istog profila (broj unosa se preklapa, `droppedEntryCount` nula svugdje, `secondPassNoOp`
isti). Uvjet je u strukturi naslova samog dokumenta. Usporedi par unutar `fpzg-politologija-zavrsni`,
jedan koji regresira i jedan koji ne; sve zajednicko time otpada bez dodatnog prolaza.

Mjeri se s `LEKTA_LOCAL_CORPUS=1`, izoliran worktree, junction na `node_modules` I na
`tests/fixtures/docx-local` (gitignoriran; bez njega mjeris drugu populaciju a nista ne pukne).
Prvo provjeri `documentCount == 45`.

### A3. Ustajali testovi nakon izdvajanja stila  (mjerila druga sesija)

`29828b46` je izdvojio inline `<style>` iz `index.html` u `src/shared/page.css` (288 KB -> 85 KB), a
tri testa jos greppaju `index.html`: `scoring-change-note`, `contrast-tinted-surfaces`,
`a11y-batch-2026-07-18`. Provjereno je da novi CSS sadrzi sve sto testovi traze, dakle testovi gledaju
krivu datoteku; nije kvar proizvoda.

### A4. `tests/deploy-manifest.test.ts:43` deep-equal raskorak (24 stavke)  (ZATVORENO)

Test PROLAZI na `7061c480`. Zatvoreno tudjim zahvatom: `deployedProduction` za `profile-rules`
povucen na `null` uz obrazlozenje "izvjestaj ovu funkciju ne poznaje", sto NIJE isto sto i
"nije deployano" i bas bi se ta razlika poslije citala krivo.

### A5. UX gate: tri pada kontrasta  (NE REPRODUCIRA SE na `7061c480`)

Prijavljeni omjeri 1.23 (`#e1e5e7` na `#fdfcf5`), 1.5 i 2.25 na naslovnici, iz CI anotacija na
starijem stanju grane. Na vrhu origina ne padaju:

    tests/ux/a11y-states.spec.ts        chromium          1 prosao
    tests/ux/free-tools-audit.spec.ts   chromium         76 prosao
    oba spec-a                          mobile-chromium  56 proslo, 21 preskoceno, 0 palo

To su JEDINA dva mjesta gdje se `color-contrast` mjeri; naslovnicu pokriva `free-tools-audit`.
Preskoceni pod mobilnim odgovaraju dokumentiranom namjernom izostavljanju axea.

NE zatvaram kao popravljeno, jer nije utvrdjeno je li kvar uklonjen ili ga na ovom stanju nikad
nije ni bilo. Boje iz nalaza NE postoje kao literali nigdje u repou, ni prije ni poslije
`29828b46`, i nisu tokeni; gotovo sigurno su rezultat alfa-mijesanja koje axe racuna tek u
pregledniku, pa se pripis krivcu staticki ne moze izvesti. Ako se ponovi, treba prolaz PRIJE i
POSLIJE `29828b46` nad istim spec-om.

---

## B. Tiha steta, ne blokira

### B1. `.gitattributes` nema pravilo za `.snap`  (POTVRDJENO)

Tri golden snimke (`docx-golden`, `repair-golden`, `synthetic-golden`) NAKON svakog prolaza izgledaju
izmijenjene u `git status`, a sadrzaj im je bajt-identican; razlika je samo CRLF. Danas je na to
naletjelo najmanje tri sesije, a jedna je zamalo commitala "osvjezene" golden snimke.

Popravak je jedan redak u `.gitattributes`. Presedan postoji (`-text` za hunspell affix).

### B2. Commitani korpus ne mjeri ucinkovitost popravka  (POTVRDJENO)

`docs/generated/repair-real-corpus.json`: 7 dopustenih fixtura, **0 ciljanih provjera**. Njegove
tvrdnje `failCount 0` i `passRegressionCount 0` su vakuumski istinite. Isti kod nad stvarnim radovima
daje 94 ciljane provjere, 4 pada, 4 regresije.

Vidljivost je rijesena (`5c0afa13`: `scope.measuresRepairEffectiveness`), ali POKRIVENOST nije. Dok
je tako, jedina mjera koju CI vrti ne moze vidjeti regresiju popravka. Stvarni radovi ne mogu u git,
pa je rjesenje anonimizirana fixtura koju profil stvarno cilja.

### B3. `pilot-set.json` je RUCNO odrzavano zrcalo generiranog artefakta

Nijedna skripta ga ne pise, a `tests/pilot-set.test.ts` trazi da se slaze s `profile-claims.json`.
Kad se generirana strana pomakne, pilot se raziđe i gate padne, a osvjeziti ga moze samo covjek koji
se sjeti. Danas se to dogodilo jednom.

### B4. Pet projekcija bez screeninga (ratchet u `tests/projection-registry-coverage.test.ts`)

`citation-dossiers`, `reconcile-programs`, `repair-gap`, `scored-value-drift`, `worklist`. Svaka ima
drift test, nijedna nije u `PROJECTIONS`, pa joj se ustajalost vidi tek na punom prolazu. Registracija
trazi da se za svaku utvrde IZVORI; kriv popis izvora daje laznu sigurnost, pa se radi jedna po jedna.

### B5. Drift test upucuje na nepostojecu naredbu  (POTVRDJENO)

Poruka trazi `npm run repair-real-corpus-backlog`; ta skripta ne postoji. Citatelja salje u prazno.
Drzi ga ratchet od jednog u istom testu.

### B6. Popravak literature tiho izostane na stvarnim radovima  (PRVA KLASA ZATVORENA, druga otvorena)

`bibliography-repair-fixer` vrati `stale-anchor` i popravak literature se NE dogodi, dok sucelje
javlja uspjeh jer su ostali fixeri prosli. To je doslovno posljedica koju
`tests/repair-anchor-collision.test.ts` u svom zaglavlju opisuje kao RIJESENU.

    lokalni korpus (38 stvarnih radova)   13 ima barem jedan stale-anchor u PRVOM krugu
        12x  bibliography-repair-assisted
         1x  heading-structure-universal      (local-01-diplomski)
         1x  link-doi-repair-assisted         (local-15-rad)
    commitani korpus (7 sintetickih)       0

Od tih 12, bisekcijom po fixeru:

    4   sudar s `link-doi-fixer`   local-06-diplomski, local-07-diplomski, local-17-rad, local-35-zavrsni
    8   sidro nevaljano i kad fixer radi SAM, bez ijednog drugog zahtjeva
        local-15-rad, local-27-zavrsni, local-28-rad, local-31-zavrsni,
        local-32-diplomski, local-33-diplomski, local-34-diplomski, local-36-diplomski

**Zasto zastita ne grize (prva klasa).** `withoutOverlappingLinkDoiOperations`
(`src/repair/apply-fixers.ts:263`) izbacuje link-doi operacije nad odlomcima koje literatura
posjeduje, usporedbom SIROVIH indeksa. Ali dvije strane broje odlomke po razlicitim osnovama, pa
usporedba nikad nista ne izbaci. Izmjereno na `local-06-diplomski`:

    link-doi operacije, indeksi iz zahtjeva   204, 205, 207, ... 240
    odlomci koje link-doi STVARNO promijeni   519, 520, 522, ... 555     (konstantan pomak 315)
    literatura posjeduje                      519..559
    filtar prijavi preklapanje                0        <- a stvarno preklapanje je 22 od 22

Osnove su najmanje tri: `link-doi-structure.ts:109` indeksira preko `extractBodyParagraphs`,
literatura preko parserovih odlomaka, a `paragraphTextsForAnchors` preko trece enumeracije
(1199 odlomaka naspram 1198 kod brojanja parova `<w:p>...</w:p>`).

**PRVA KLASA JE ZATVORENA.** Usporedba je premjestena s indeksa na TEKST: bibliografski zapis sada
nosi normaliziran `anchorText` (`src/ui/repair-items.ts`), a filtar usporedjuje tekst s tekstom uz
ZADRZANU indeksnu provjeru, pa stariji klijenti rade nepromijenjeno. Ne salje se nista sto server
vec nema (popravak ionako prima cijeli dokument, a `link-doi` isti podatak salje odavno).

    stale-anchor na stvarnim radovima   13 -> 9 radova
    od toga bibliography-repair         12 -> 8
    link-doi-repair                      1 -> 0
    korpus                              pad 0, regresija 0, neidempotentnih 0, bodovi 29 -> 30 radova bolje

Gard je UNIT test nad samim filtrom (`tests/repair-anchor-collision.test.ts`), s dokazom da grize:
uz vracanje na usporedbu samo po indeksu pada tocno tvrdnja "GRIZE", uz baseline i negativnu
kontrolu koje ostaju zelene. Pokusaj da se razmak podmetne POMICANJEM indeksa kroz `applyFixers` je
odbacen jer ne reproducira kvar: tada ni link-doi ne nadje metu, pa test prolazi i na neispravnom
kodu.

**DRUGA KLASA (8 radova) JE ZATVORENA 2026-09-05.** Sidro nije valjalo ni nad netaknutim dokumentom
jer `extractReferences` lijepi svaki odlomak koji ne izgleda kao nov zapis na prethodni (rucno
oblikovane podnaslove popisa, "[n]" zapise, cijele zavrsne dijelove rada), a indeks ostaje prvi:
sidro je hashirano nad tekstom koji NE pripada odlomku na koji indeks pokazuje. Sonda zapis po zapis:
17 od 397 zapisa, u svih 17 fixerov tekst je prefiks analizinog; tabulator 0 od 17 (ta hipoteza je
oborena).

    raskorak sidra na 8 radova      17 -> 0
    stale-anchor u prvom krugu       9 -> 1   (ostaje heading-structure-universal na local-01)
    bibliography-repair              8 -> 0

Popravak u tri sloja (`author-year.ts` ne lijepi podnaslove i zavrsne dijelove, `bibliography-structure.ts`
nosi sve obuhvacene odlomke, `repair-items.ts` ne nudi visodlomacne zapise), gard s mutacijom u
`src/analysis/bibliography-structure.test.ts`.

Cim je literatura opet radila, otkrio se i CETVRTI kvar istog korijena, dotad nedostizan: na
`local-36-diplomski` je `reference.alphabetical` pao iz pass u warn NAKON popravka, jer je fixer
sortirao po cijelom nizu (`fields.authors || rawText`, gdje `hr` kolacija zanemaruje zarez) a provjera
sudi po PRVOM autoru iz `extractReferences`: "United Nations General Assembly, ..." je otisao ispred
"United Nations, ...". Tri mjesta su imala tri kljuca (provjera, fixer, `alphabetical.expected` u
analizi). Svedeno na jedan: `sortKey` na zapisu = kljuc provjere; popravak i analiza sortiraju po
njemu. Dokaz: sa starim kljucem fixera provjera nakon popravka pada (inverzija na #21), s novim prolazi.

ZADNJI stale-anchor na korpusu (`heading-structure-universal`, `local-01-diplomski`) ZATVOREN
2026-09-05, isti korijen peti put: `paragraphTextsForAnchors` u `apply-fixers.ts` citao je SAMO
`<w:t>`, pa je naslov s rucnim prijelomom retka (`<w:br/>` izmedju "Tipovi testova" i "Za potrebe")
davao "testovaZa" dok analiza daje "testova za"; sidro se ne nalazi nigdje, meta je `zastarjelo`, i
1 od 18 meta gasi popravak svih 18 naslova, i kad fixer radi SAM. Zajednicki izvlakac
`anchorTextOfXml` (tab/br/cr -> razmak) vec je sluzio drugim sidrima; ovo je bila zaboravljena kopija.
Sada ga koristi i ovo mjesto. Gard: `tests/heading-style-anchor.test.ts` (naslov s `<w:br/>` mora se
stilizirati; pada na `<w:t>`-only citanju). `stale-anchor` u prvom krugu na 38 stvarnih radova: 1 -> 0.

Popravak sidra je odmah otkrio sto je sidro skrivalo: medju 18 predodabranih kandidata na local-01 bila
su dva fragmenta specifikacije ("4 vCPU,", "16 GB RAM,"; numerirani prefiks + kratkoca = score 7 i 8)
i naslov zalijepljen s tijelom preko `<w:br/>` (p634). Upisani, dizali su "moguca preskakanja" 4 -> 5 i
pretvarali tijelo rada u Heading3. Zato `heading-structure.ts` sada kaznjava kandidata koji zavrsava
zarezom/tocka-zarezom (-6) i iskljucuje odlomak s 40+ znakova iza prijeloma retka. Na local-01:
9 pravih naslova upisano, skokova 4 (kao prije). Gard s mutacijom u `heading-structure.test.ts`.

NAZIVNIK: gornje brojke (38 radova, 17/397 zapisa, 9 -> 1 -> 0) vrijede za populaciju `docx-local` do
2026-09-05 14:30. Tada je narasla na 88 (58 novih `corpus-*`, 8 starih zamijenjeno novijim verzijama,
30 ostaje; popis u `Desktop/Lekta-korpus/dedupe-2026-09-05.json`). Na NOVOJ populaciji dokaz je A/B
na istom commitu s kontrolom bez izmjena: 94 od 95 dokumenata identicni po ishodu, delti i skupu
fixera; jedini razlicit je local-01 (+heading-style-fixer, isti dobitak); stale-anchor istom sondom
kontrola 4 -> 3.

### B7. Tri stale-anchora na NOVOJ populaciji (IMENOVANO, nitko ne drzi)

Zateceni na 88 radova i neovisni o B6 (kontrola bez B6 ih ima jednako):

    corpus-0052-91298a   heading-structure-universal   sidro "FINAL THESIS" je jedinstveno ali stoji na p100,
                                                       a zahtjev kaze p65: 70 od prvih 100 <w:p su u tablicama
                                                       ili okvirima, analiza ih preskace, fixer broji sve.
                                                       Isti razred kao B6 prva klasa (dvije osnove indeksa);
                                                       re-anchoring je izricito odbacen, pa se resenje mora
                                                       traziti u zajednickoj enumeraciji, ne u praceenju teksta.
    corpus-0008-dd3c34   link-doi-repair-assisted      sam daje `unsupported-structure`, stale-anchor tek u
                                                       bateriji: neki fixer prije njega prepise sidreni odlomak.
    corpus-0011-19124f   link-doi-repair-assisted      sam prolazi (sidra nadjena, ali na indeksu +2), stale
                                                       tek u bateriji; isti obrazac kao 0008.

Uz njih: 15 `fail` s `droppedEntryCount: 1` na novim radovima nije regresija (final-document-inspector
uredno uklanja prazan `word/comments.xml`); popravak harnessa je `ea15e9ce` na grani druge sesije.

---

## C. Komercijalno, izvan koda

### C1. `data/legal/provider.json`: `oib` i `phone` su prazni  (POTVRDJENO)

Bez njih naplata ne moze ici. Podatak je vlasnikov, ne moze ga izvesti nijedna sesija.

### C2. Proizvodi bez `mor_product_id`

Prijavljeno u handoffu: svih 20 proizvoda ima `null`, pa `create-checkout` vraca
`409 product_not_mapped`. Nisam nasao datoteku na ocekivanim stazama, dakle NEPOTVRDJENO; treba
locirati izvor prije nego se planira.

### C3. Cjenik je dominiran

Prijavljeno: `slot_zavrsni` 9,99 / 120 dana je strogo losiji od `pass_zavrsni` 9,99 / 180 dana.
Nepotvrdjeno mojim mjerenjem.

---

## D. Poznato i svjesno odgodjeno

### D1. Backlog 7: `scripts/` i `tests/` nisu u `tsconfig.json`

Odgodjeno odlukom vlasnika 2026-08-30, uz izmjerene brojke (126 gresaka, nula u `src/`). Vrijedi
napomenuti da bi to uhvatilo A1: `globSync` uvoz je u `scripts/` i `tests/`, dakle upravo u
direktorijima koje `tsc` ne gleda.

### D2. `docs/generated/DEPLOY_DRIFT.md` je necommitan od jutros

Nitko ga nije pogledao. Ne znam je li nalaz ili artefakt prolaza.

# Handoff: regresija popravka na stvarnim radovima

> STANJE: neidempotentnost je ZATVORENA (`6fa30bfc`, izmjereno na `46d6fa63`). SVAKI preostali
> pad je sada regresija: 4 komada, razred
> `structure.heading.hierarchy`. Detalji odmah ispod; sve nize od odjeljka "Sto padovi NISU"
> opisuje stanje PRIJE tog popravka.

Stanje na dan 2026-09-03. Mjereno, ne procijenjeno. Sve brojke se reproduciraju naredbom nize.

## STATUS 2026-09-03 (kasnije isti dan): NEIDEMPOTENTNOST JE ZATVORENA

Razred zbog kojeg ovaj dokument postoji je RIJESEN. Prijavila druga sesija, commit `6fa30bfc`
"duboko ciscenje velicine nije bilo fiksna tocka, pa je prvi klik ostavljao 57 posto posla".

    neidempotentnih   7  ->  0
    fail             11  ->  4
    pass-regresija    4  ->  4   (NEPROMIJENJENO)

Uzrok je bio `dominantDirectRunSize`: preskakao je runove bez `w:sz`, pa je vlastiti ucinak uklanjao
iz vlastitog ulaza; drugi prolaz je zato nalazio novu dominantu i opet pisao.

IZMJERENO NAKON POPRAVKA (druga sesija, izoliran worktree na pushanom `46d6fa63`, junctioni na
`node_modules` i `tests/fixtures/docx-local`, `documentCount` potvrdjen prije svega ostalog):

    dokumenata        45
    padova             4      (bilo 11)
    neidempotentnih    0      (bilo 7)
    pass-regresija     4      nepromijenjeno
    integritet         0
    razrjesenje       20/94 = 21,3 %

    sve cetiri regresije su `structure.heading.hierarchy`:
    local-13-zavrsni, local-27-zavrsni, local-33-diplomski, local-36-diplomski

**NAJVAZNIJA POSLJEDICA: poslije `6fa30bfc` je SVAKI preostali pad regresija.** Razred
neidempotentnosti vise ne postoji, pa odjeljak "Sto padovi NISU" nize opisuje stanje koje se vise ne
moze reproducirati.

O RAZRJESENJU 21,3 %: ne usporedjuj ga izravno s ranijih 39,8 %. Nazivnici su razliciti (94 naspram
133 ciljanih provjera) jer je i skup dopustenih dokumenata razlicit (45 naspram 54). Hipoteza koju
NITKO NIJE PROVJERIO, pa je ne uzimaj kao nalaz: devet sintetickih fixtura koje su ispale iz skupa
mogle su biti lakse za popravak od stvarnih radova i time dizati raniji postotak. Tko to zeli
utvrditi, mora izmjeriti oba skupa nad ISTIM kodom.

**OSTAJE OTVORENO: pass-regresije, 4 komada, razred `structure.heading.hierarchy`.** Taj zahvat ih
nije dirao. Njih polovi necommitani rad na `normalizeProposedLevels` u
`src/analysis/heading-structure.ts` (4 -> 2), opisan nize; dok je necommitan, ne postoji ni za koga
osim za svog autora.

Sve ispod ovog odjeljka opisuje stanje PRIJE `6fa30bfc` i ostaje kao zapis puta, ne kao tekuci
nalaz.

## Sazetak u jednoj recenici

Popravak je od 2026-08-30 postao BOLJI po razrjesenju (29,8 % -> 39,8 %) i po
`autoUnresolved` (14 -> 2), ali je istovremeno dobio **9 padova i 2 pass-regresije**, kojih je
prije bilo NULA, i te dvije nule su u ovom repozitoriju tvrda granica.

## OGRANICENJE MOG MJERENJA (procitaj prije nego brojkama pripises uzrok)

Brojke nize su izmjerene u DIJELJENOM radnom stablu, koje je u tom trenutku imalo 9 necommitanih
datoteka, medju njima `src/analysis/heading-structure.ts` i njezin test. To je produkcijski kod na
putanji koju popravak koristi (struktura obveznih dijelova).

Posljedica: **9 padova i 2 pass-regresije SU stvarni, ali NISU pripisivi nijednom commitu.** Mjerenje
opisuje stablo, ne HEAD. Usporedba "0 padova 30.8. -> 9 danas" zato pokazuje SMJER, ali ne dokazuje
da je uzrok u commitanom kodu; dio razlike moze doci iz tudjeg necommitanog rada.

Ovo je ista zamka pred kojom ovaj vodic drugdje upozorava, i upao sam u nju sam. Prvi korak zato NIJE
"vjeruj ovim brojkama" nego: **ponovi mjerenje na CISTOM, fiksnom commitu u izoliranom worktreeu.**
Ako se brojke razlikuju, ta je razlika sama po sebi nalaz.

### RAZRIJESENO 2026-09-03: necommitani rad je POMAGAO, commitani kod je GORI

Druga sesija je izmjerila oba stanja nad istim korpusom (45 dokumenata, 38 lokalnih + 7 commitanih),
uz HEAD prikovan na `29828b46` i izoliran worktree:

    CIST HEAD (bez necommitane zastite)   fail 11   pass-regresija 4
    STABLO (s necommitanom zastitom)      fail  9   pass-regresija 2

Dakle necommitani rad na `normalizeProposedLevels` u `src/analysis/heading-structure.ts` UKLANJA dva
pada i dvije regresije; sve cetiri su ista provjera, `structure.heading.hierarchy`.

**Posljedica za ovaj handoff: regresija u COMMITANOM kodu je VECA nego sto sam prijavio, ne manja.**
Moje brojke (9 i 2) izmjerene su sa ukljucenim tudjim popravkom. Bez njega je 11 i 4. Pretpostavio
sam da necommitani rad brojke kvari; kvario ih je u suprotnom smjeru.

Sto se tocno dogodilo po dokumentu:

    rijeseno   local-33-diplomski   fpzg-politologija-diplomski   77->78
               local-36-diplomski   fpzg-politologija-diplomski   82->84
    ostaje     local-13-zavrsni     fpzg-politologija-zavrsni     81->82
               local-27-zavrsni     fpzg-politologija-zavrsni     82->87

SMIJE SE TVRDITI SAMO OVO: zastita uklanja obje `-diplomski` regresije i nijednu `-zavrsni`.

NE SMIJE SE TVRDITI da je profil uzrok, iako obrazac na to vuce. Treca sesija je to oborila
mjerenjem: ista dva profila imaju 16 dokumenata koji uopce ne regresiraju, pa profil ne moze biti
uvjet. Prva verzija ovog odjeljka je pisala da podjela "pokazuje gdje gledati, u razliku medju
profilima"; to je bilo prejako i ovdje je ublazeno, jer bi inace sljedeca sesija trazila razliku
koja nije uzrok.

Korelacija je odbacena mjerenjem: `heading-style-fixer` je promijenio 27 dokumenata, a regresirala
su 4.

### NAZIVNIK NIJE STABILAN IZMEDJU SESIJA (razjasnjeno mjerenjem)

Moj prolaz je prijavio 54 dokumenta, njihov 45. Uzrok NIJE u harnessu: `discoverRealCorpus` uzima
SVAKI `.docx` koji ima pratitelja i prodje `sidecarAdmitted`, bez uzorkovanja i bez granice.

NIJE NESTAO NIJEDAN RAD. Prva verzija ovog odjeljka tvrdila je da je iz gitignoriranog direktorija
uklonjeno devet radova. To je bilo netocno i opasno, jer bi poslalo sljedecu sesiju u potragu za
devet izgubljenih studentskih radova. Aritmetika (provjerena neovisno):

    commitanih fixtura              19
    oznaceno `synthetic` SADA       12   ->  dopusteno  7    7 + 38 = 45
    oznaceno `synthetic` PRIJE       3   ->  dopusteno 16   16 + 38 = 54
    lokalnih `.docx`                38   u OBA prolaza

Promijenila se dakle populacija DOPUSTENIH commitanih fixtura, jer su im pratitelji u meduvremenu
oznaceni kao sinteticki (`da442a8e`, `c9491a8b`). To je bilo ispravno: ti dokumenti NISU studentski
radovi. Posljedica za moje brojke je da je moj skup od 54 ukljucivao devet sintetickih dokumenata
koji ne bi smjeli brojati kao stvarni radovi; njihov skup od 45 je cisci.

PRAKTICNA POSLJEDICA, sada s tocnim razlogom: nazivnik nije konstanta i moze se promijeniti BEZ
IJEDNE promjene dokumenata, jer pripadnost skupu odredjuju SIDECARI, a njih ureduju druge sesije.
Dva stanja koda usporediva su samo ako su mjerena nad istim skupom DOPUSTENIH dokumenata, ne samo
nad istim direktorijem. Prije svakog zakljucka procitaj `documentCount` iz artefakta koji drzis u
ruci, ne iz ovog dokumenta.

## Kako reproducirati (obavezno prije bilo kakvog zahvata)

    LEKTA_LOCAL_CORPUS=1 npx vite-node scripts/repair-real-corpus.mts

Pise u `docs/generated/repair-real-corpus.local.json` (gitignoriran, 54 stvarna rada).

ZAMKA KOJU SAM SAM UPAO: zastavica je `--local` / `LEKTA_LOCAL_CORPUS=1`. Ako je izostavis,
skripta uredno prodje ali mjeri 16 COMMITANIH fixtura i pise u `repair-real-corpus.json`. Taj
skup NE pokriva ove putanje i daje 84,6 % razrjesenja, sto izgleda kao dobra vijest a mjeri drugu
populaciju. **Prvo provjeri `documentCount`: mora biti 54, ne 12 ni 16.**

## Brojke

| mjera | 30.8. | 3.9. |
|---|---|---|
| razrijeseno | 29,8 % (42/141) | **39,8 % (53/133)** |
| autoUnresolved | 14 | **2** |
| assistedUnresolved | 85 | 78 |
| **fail** | **0** | **9** |
| **passRegression** | **0** | **2** |
| integrityFailure | 0 | 0 |

## Sto padovi NISU

Provjereno na svih 9: `outputReadable: true`, `packageWellFormed: true`, `malformedParts: []`,
`droppedEntryCount: 0`, `integrityFailure: null`. Dakle **paketi su ispravni i citljivi**; ovo nije
korupcija dokumenta i ne treba tražiti kvar u zipu ni u XML-u.

## Sto padovi JESU

**7 od 9: NE-IDEMPOTENTNOST.** `tests/real-corpus/harness.ts:295`:

    const secondPassNoOp = second.changelog.length === 0 && second.docxBytes === applied.docxBytes;

a `harness.ts:339` od `!secondPassNoOp` radi tvrdi `fail`. Dakle drugi prolaz popravka NAD VEC
POPRAVLJENIM dokumentom jos uvijek nesto mijenja: popravak ne konvergira.

Dokumenti: `local-04-zavrsni`, `local-05-zavrsni`, `local-17-rad`, `local-18-diplomski`,
`local-19-diplomski`, `local-20-diplomski`, `local-30-rad`.

Fixeri koji su ih mijenjali (broj od 7 dokumenata):

    field-integrity-fixer            7/7
    font-fixer                       7/7
    final-document-inspector-fixer   7/7
    croatian-typography-fixer        6/7
    section-surgery-fixer            5/7
    heading-style-fixer              4/7

**2 od 9: PASS-REGRESIJA.** `local-13-zavrsni` i `local-27-zavrsni`, svaki
`passRegressionCount: 1`. To je provjera koja je PRIJE popravka prolazila, a POSLIJE pada.

Napomena o dosegu stete: `detectPassRegressions` se izvodi PRIJE nego sucelje ponudi preuzimanje
(vidi CLAUDE.md, "Popravak"), pa korisnik ne dobiva losiji dokument bez upozorenja. Motor ih ipak
proizvodi i to je ono sto treba popraviti.

## Najvazniji trag: krivac NIJE u tim fixerima

Provjereno `git log --since=2026-08-30`:

    field-integrity-fixer.ts            0 commita
    font-fixer.ts                       0 commita
    final-document-inspector-fixer.ts   0 commita
    croatian-typography-fixer.ts        0 commita

Nijedan od cetiri fixera koji se pojavljuju u SVAKOM padu nije diran. Dakle uzrok je u necemu o
cemu oni OVISE. Ono sto se u istom razdoblju mijenjalo (19 commita nad `src/repair/`):

    9x  apply-fixers.ts        <- najjaci kandidat: dijeljena jezgra, redoslijed i sidra
    6x  required-section-fixer.ts
    6x  link-doi-fixer.ts
    4x  fixers.ts
    4x  default-selection.ts
    2x  xml-patch.ts
    2x  anchor-text.ts
    2x  run-level.ts

Hipoteza koju NISAM provjerio, pa je ne uzimaj kao nalaz: vise commita iz tog razdoblja radilo je
na SIDRIMA (`d9749026` "sidra obveznih dijelova imala su DVA indeksna prostora", `6ee596a5`
"tabulator je razmak", `cf5d64c9` "moj rad na sidrima lomio je popravak"). Ako se sidro nakon prvog
prolaza re-derivira drukcije, drugi prolaz moze naci novu metu i opet pisati, sto je tocno potpis
ne-idempotentnosti. `apply-fixers.ts:184-188` vec imenuje pravi lijek: vlasnistvo nad odlomkom ili
ponovni izracun sidara izmedju faza.

## Preporuceni redoslijed rada

1. **Reproduciraj** naredbom gore i potvrdi 9/2. Ne kreni prije toga.
2. **Suzi na jedan dokument.** Uzmi `local-04-zavrsni` i vrti popravak dvaput, pa usporedi
   `changelog` drugog prolaza. Ono sto drugi prolaz jos mijenja JEST kvar.
3. **Bisect po ponasanju, ne po datumu.** Raspon je od stanja u kojem je bilo 0 padova
   (artefakt od 30.8.) do danas. Kandidati su gore, `apply-fixers.ts` prvi.
4. **Golden PRIJE zahvata.** CLAUDE.md: parser i repair se ne diraju bez golden testa koji prvo
   dokazuje zateceno ponasanje.
5. **Tier 0 nije dokaz.** `npm run check` ne otvara dokument nijednim stvarnim uredivacem. Prije
   zakljucka pusti `npm run verify:strict-open:repaired` (Tier 1) i, na Windowsu, `verify:word`.
6. Nakon popravka **ponovi mjerenje** i trazi `fail: 0`, `passRegression: 0` UZ zadrzano
   razrjesenje od barem 39,8 %. Pad razrjesenja uz nulu padova nije uspjeh nego druga steta.

## Cega se NE hvatati (izmjereno, ne pretpostavljeno)

**`consistency-fixer` (50 ponuda, 0 promjena) i `citation-bibliography-sync-fixer` (32/0) NISU
kvar.** To izgleda kao najveci jaz u izvjestaju i lako je krenuti onamo; ja sam i krenuo, i bio sam
u krivu. `src/repair/default-selection.ts` to izricito objasnjava: Lekta ne smije pogadjati koji je
oblik tocan, jer bi to bio SADRZAJ, a ne forma. Te stavke po konstrukciji cekaju ljudsku potvrdu.
Mehanika koja ih posteno klasificira vec postoji (`hasActionableParams`, `repair-outcome.ts:139`),
pa nema sto popravljati.

## Otvoreno, nevezano uz ovo

- **Mobilna a11y (375x667):** zateceni nalazi `label` na `#fileInput`, `nested-interactive` na
  `#dropzone`, `heading-order`, kontrast u demo prikazu. Axe test se NAMJERNO preskace pod mobilnim
  projektom da ne bi lazno tvrdio pokrivenost; to je biljeska, ne popravak.
- **Komercijalno NO-GO:** `oib` i `phone` prazni u `data/legal/provider.json`; svih 20 proizvoda
  ima `mor_product_id: null` pa `create-checkout` vraca `409 product_not_mapped`; cjenik je
  dominiran (`slot_zavrsni` 9,99/120 dana je strogo losiji od `pass_zavrsni` 9,99/180).
- **`fpzg-raspored` je PAUZIRAN** (Supabase `dcxbkpyasrwquqxsqoby`) da bi staging drzao slot za
  `extraction` razinu dokaza. Dokaz je gotov, pa se moze vratiti; besplatni plan dopusta 2 aktivna
  projekta, dakle vracanje uspavljuje staging.

## Stanje koje je gotovo (da se ne radi dvaput)

- Deploy je ODBLOKIRAN: `RELEASE_PROOF.json` je `complete: true` za `13003a88`, master je
  `e0279a9a`, a puni netlify lanac s `LEKTA_REQUIRE_RELEASE_PROOF=1` izlazi 0.
- Dokaz vrijedi za TOCAN commit; svaki sljedeci commit ga cini ustajalim. Pece se NEPOSREDNO prije
  deploya, ne unaprijed.
- `projections` pada u dokazu ali NIJE `required`: mjeri redoslijed commita, ne sadrzaj.
  Provjereno `npm run projection-verify` 2026-09-03: obje prijavljene projekcije sadrzajno
  IDENTICNE (razlika samo u zavrsecima redaka). Ne regeneriraj ih.
- `LEKTA_UX_PORT` (zadano 4173) postoji od `4d8f58ae`: vise sesija moze paralelno vrtjeti
  `test:ux` bez sudara i bez mjerenja tudjeg stabla.

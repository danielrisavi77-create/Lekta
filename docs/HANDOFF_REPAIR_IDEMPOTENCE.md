# Handoff: popravak je regresirao na stvarnim radovima (9 padova, 2 pass-regresije)

Stanje na dan 2026-09-03. Mjereno, ne procijenjeno. Sve brojke se reproduciraju naredbom nize.

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

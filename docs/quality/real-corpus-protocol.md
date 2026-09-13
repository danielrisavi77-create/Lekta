# Protokol mjerenja stvarnog ucinka popravka na realnom korpusu (T06)

Plan "pouzdana provjera, popravak i revizije rada", zadatak T06. Ovaj dokument ne uvodi novi harness: mapira
ugovor iz plana na postojece polje po polje (`tests/real-corpus/harness.ts`, `scripts/repair-real-corpus.mts`,
`src/repair/repair-outcome.ts`, `data/verification/real-corpus-attestation.json`) i imenuje sto jos nedostaje.
Sve sto je ovdje oznaceno kao POSTOJI ima test; sto je oznaceno kao PRIJEDLOG ceka vlasnikovu odluku ili
mjerenje na mirnom stroju.

## 1. Sto vec postoji (ne graditi ponovno)

| zahtjev iz plana | gdje zivi | dokaz |
| --- | --- | --- |
| dopusten izvor po slucaju | sidecar `.json` uz svaki `.docx` (`synthetic`, privola, izvor); `sidecarAdmitted` | `tests/real-corpus-vacuity.test.ts`, CLAUDE.md "nazivnik korpusa" |
| profil i verzija pravila | `manifest[]` u izvjestaju (`profileId`, `workType`, otisak pravila kroz `measuredFromCommit`) | `attest-real-corpus.mjs` biljezi `measuredFromCommit` |
| unaprijed oznaceni problemi | `expected` u sidecaru; harness ih usporedjuje s `targeted` | `repair-real-corpus.json` -> `results[].targetedCheckCount` |
| razlikovanje primijenjen / rijesen / nerijesen / preskocen / regresija | `summarizeRepairOutcome` (isti izracun kao sucelje): `resolved`, `unresolved`, `manualOnly`, `awaitingConfirmation`; `passRegressionChecks`; `noOp`; `skippedReasons` iz `applyFixers` | `tests/real-corpus.test.ts`, `tests/repair-delivery-order.test.ts` |
| regresijska zastita odvojena od ciljane djelotvornosti | `results` (dopusteni) naspram `syntheticResults` (regresija); `scope.measuresRepairEffectiveness`, `scope.detectsRepairRegression` | `tests/real-corpus-vacuity.test.ts` (prazan izvjestaj to glasno priznaje) |
| kontrola "ciljna metrika nije valjana bez ciljanih provjera" | `measuresRepairEffectiveness === targetedCheckCount > 0` | ista datoteka, negativna kontrola ukljucena |
| integritet paketa kao zaseban status | `integrityFailure` po dokumentu (tvrdi `fail`, nikad `no-op`) | CLAUDE.md "Repair hardening": bez tvrdnje `integrityFailure === null` sve prolazi vakuumski |
| Word/LibreOffice okruzenje | Tier 1 `verify:strict-open:repaired` (lxml), Tier 2 `verify:word` (Word 14.0, COM); `RELEASE_PROOF.json` nosi ishod po razini | `docs/REAL_CORPUS_TESTING.md`, `scripts/word-verify/` |

Primjer ugovora iz plana je vec zadovoljiv nad postojecim sazetkom:

```ts
expect(summary.targetedCheckCount).toBeGreaterThan(0);          // samo za skup koji TVRDI djelotvornost
expect(summary.targetedResolvedCount).toBeLessThanOrEqual(summary.targetedCheckCount);
expect(summary.integrityFailureCount).toBe(0);
expect(summary.passRegressionCount).toBe(0);
```

Prva tvrdnja NE vrijedi za commitani korpus (7 dopustenih fixtura, 0 ciljanih provjera od 2026-09-03): ondje je
`measuresRepairEffectiveness: false` i to je istina, ne kvar. Vrijedi za lokalni korpus (`LEKTA_LOCAL_CORPUS=1`).

## 2. Sto nedostaje (PRIJEDLOG)

### 2.1 Prioritetni profili za mjerenje djelotvornosti

Kriterij iz plana: koristenje, kvaliteta izvora, dostupni dokumenti. Iz ovjere (`real-corpus-attestation.json`) i
ledgera, profili koji vec imaju STVARNE radove i izravno izmjeren dokaz (A direct, 12 profila):

| profil | zasto |
| --- | --- |
| `fpzg-politologija-zavrsni` | najvise stvarnih radova u korpusu (26 u pilot popisu plana) |
| `fpzg-politologija-diplomski` | 24 rada; isti fakultet, druga vrsta rada |
| `fpzg-opci-akademski-rad` | 22 rada; krovni profil, hvata radove bez prepoznatog studija |
| `efzg-seminarski`, `efzg-zavrsni` | 8 i 5 radova; druga ustanova, drugi citatni stil |
| `ffzg-filozofija-diplomski` | izvor dokaza za 19 naslijedjenih FFZG profila (`inheritedFrom`, T05) |
| `fer-diplomski` | tehnicki profil, ali autoritet izvora je `general` (osobna stranica ZEMRIS-a): mjeriti, ne promovirati |
| `pravo-opci-pravni-akademski-rad` | 3 rada; pravne fusnote, jedini pravni s dokumentima |

Osam profila, unutar raspona 5 do 10. Odluka o konacnom popisu je vlasnikova (nije mehanika).

### 2.2 Izdvojeni skup za zavrsnu provjeru

IMPLEMENTIRANO 2026-09-10 (`tests/real-corpus/corpus-track.ts`, `isHoldout`). Oko 20 posto dokumenata je izdvojeno
DETERMINISTICKI iz imena datoteke (FNV-1a 32 modulo 5; modul nema uvoza pa nije sha256), a sidecar smije presuditi
izricitim `holdout: true|false`. Harness ih mjeri i oznacava u `results[].holdout`; `attest-real-corpus.mjs` ih NE
broji u dokaz dok se ne pozove s `--holdout-confirmed`, nakon zavrsne provjere. Ovjera nosi
`protocol.holdoutExcluded` i `protocol.holdoutDocumentCount`. Time se ocekivanja ne "dotjeruju" na istim
dokumentima na kojima se tvrdi uspjeh. Gard: `tests/real-corpus-holdout.test.ts`.

### 2.3 Neovisna potvrda ocekivanja

IMPLEMENTIRANO 2026-09-10 kao PROVENIJENCIJA, ne kao promjena ishoda: sidecar smije nositi `expectedBy` i `expectedAt`
(ISO datum); harness ih prevodi u `results[].expectationProvenance` (`independent` | `derived`) i broji u
`summary.independentlyConfirmedCount`, a ovjera u `protocol.independentlyConfirmedCount`. Strojni `pass` se time NE
mijenja (ocekivanja i dalje izvodi analiza prije popravka); mijenja se koliko je dokaza netko neovisno potvrdio, i
to je brojka koju ljestvica moze citati kad vlasnik odluci. Danas: 0 od 321, jer nijedan sidecar jos nema ta polja.

### 2.4 Word okruzenje uz svaki izvjestaj

IMPLEMENTIRANO 2026-09-10: `attest-real-corpus.mjs --word-version 14.0` upisuje `environment.wordVersion`; bez
zastavice ostaje `null`, sto znaci "izlaz nije otvoren u Wordu", ne "nepoznata verzija". Vrijednost se ne izmislja iz
`RELEASE_PROOF.json`, jer Tier 2 ondje otvara commitane fixture, ne ovaj korpus.

### 2.5 Vrste dokumenata koje treba pokriti po profilu

ispravan rad bez laznih pozitiva; jedna pogreska; kombinacija pogresaka; mnogo sekcija; tablice, slike i natpisi;
fusnote; komentari i Track Changes; izvoz iz Worda, LibreOfficea, Google Docsa; neazuriran sadrzaj i polja.
Danasnji korpus (izmjereno 2026-09-03: 38 lokalnih + 7 dopustenih commitanih) ne pokriva endnote ni Google Docs
izvoz; to se biljezi kao praznina, ne kao prolaz.

## 3. Kako se mjerenje izvodi

```bash
LEKTA_LOCAL_CORPUS=1 npx vite-node scripts/repair-real-corpus.mts   # lokalni korpus, izvan repozitorija
npm run conformance
npm run test:slow                                                    # kad su dirani popravci
npm run verify:strict-open:repaired                                  # Tier 1, lxml nad POPRAVLJENIM paketima
npm run verify:word                                                  # Tier 2, Windows + Word
```

Prije usporedbe dvaju stanja koda usporedi `documentCount` i `scope.localDocumentCount`: sidecari mijenjaju nazivnik
bez promjene direktorija (CLAUDE.md). Snimku izvjestaja sacuvaj izvan repozitorija; svaki prolaz ga prepise.

Uvjet iz plana za izdanje: poznato ostecenje (`integrityFailureCount > 0`) ili neobjasnjena regresija
(`passRegressionCount > 0` bez presude) BLOKIRA izdavanje pogodjenog zahvata. Nula pogresaka u ovom skupu nije
univerzalno jamstvo; brojcani pragovi tocnosti se postavljaju tek nakon prvog neovisnog mjerenja po pravilu i
ozbiljnosti (2.3).

## 4. Mjerenje 2026-09-10 (master `59adbc8c`, lokalni korpus + `Lekta-korpus/03-ingest`)

Prvi puni prolaz po ovom protokolu. Harness je pritom dobio ograniceni paralelizam (`mapLimited`, zadano 4):
`Promise.all` nad 315 dokumenata rusio je Node s "heap out of memory", a 54 su prolazila.

| mjera | vrijednost |
| --- | --- |
| dokumenata (dopustenih) | 321, od toga 314 lokalnih (128 `docx-local` + 187 `03-ingest`) i 7 commitanih |
| ishod | pass 15, review 304, fail 0, no-op 2 |
| ostecenja i regresije | integrityFailure 0, passRegression 0 |
| ciljane provjere | 645, razrijeseno 116 (18 posto) |
| jaz motora, automatski | 9 (imenovane: `footnote.format`, `format.justify.body`, `format.spacing.body`) |
| jaz motora, asistirano | 520 (primijenjeno, i dalje pada) |
| ceka ljudski odabir | 73 |
| izvan granice popravka | 964 (rucno) |
| izdvojeni skup | 63 (19,6 posto), NE ulazi u ovjeru bez `--holdout-confirmed` |
| neovisno potvrdjena ocekivanja | 0 od 321 |
| profili s najvise radova | fpzg-opci-akademski-rad 98, fpzg-politologija-diplomski 90, fpzg-politologija-zavrsni 34, efzg-zavrsni 32, hks-diplomski 17, efzg-seminarski 16 |

Sto iz toga slijedi, po redu vaznosti:

1. U release skupu NEMA poznatog ostecenja ni neobjasnjene regresije (0 i 0), pa uvjet iz plana za izdavanje
   zahvata vrijedi za sve zahvate koji su u ovom skupu bili primijenjeni.
2. Stopa razrjesenja ciljanog (18 posto) NIJE mjera kvalitete motora nego GRANICE: 520 od 645 ciljanih provjera
   ostaje crveno nakon ASISTIRANOG zahvata (naslovnica, literatura, fusnote, sekcije), gdje harness primjenjuje zadani
   odabir bez covjeka. To je popis za sljedeci ciklus rada nad motorom, imenovan po provjeri u
   `summary.assistedUnresolvedChecks` lokalnog artefakta.
3. Ovjera nad ovim mjerenjem je PREPISANA I POTPISANA 2026-09-12 (`data/verification/real-corpus-attestation.json`),
   po izricitoj uputi vlasnika ("dajem ti dopustenje"), kroz Claude Code; `signatureNote` to i kaze, jer potpis po
   uputi nije isto sto i potpis vlastitom rukom. Otisak korpusa `8e5bd529...`, 19 skupina jedinica x vrsta rada, sve
   19 s cistim dokazom; izdvojeni skup (63 dokumenta) NIJE u dokazu (bez `--holdout-confirmed`), `wordVersion` je
   `null` jer izlaz korpusa nije otvoren u Wordu. Ledger i tvrdnje profila regenerirani u cistom worktreeu u istom
   commitu. Ponavljanje ili prosirenje (holdout, Word):

   ```bash
   LEKTA_LOCAL_CORPUS=1 LEKTA_CORPUS_SOURCE="<put do 03-ingest>" NODE_OPTIONS=--max-old-space-size=3072 npx vite-node scripts/repair-real-corpus.mts
   npm run verify:word:corpus                 # Word, pa verziju iz COM-a upisati dolje
   node scripts/attest-real-corpus.mjs --sign "Ime" --word-version 14.0 [--holdout-confirmed]
   npm run completion-ledger && npm run gen-profile-claims                # u cistom worktreeu, artefakti u istom commitu
   ```

Sto ostaje otvoreno: 2.1 (konacni popis profila je vlasnikova odluka; mjerenje pokriva svih 8 predlozenih), 2.5
(endnote i Google Docs izvoz i dalje nema u korpusu), te sidecar polja `expectedBy`/`expectedAt` koja nitko jos nije
popunio.

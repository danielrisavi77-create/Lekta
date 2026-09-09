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

Sidecar dobiva polje `holdout: true` za oko 20 posto dokumenata po profilu, odabranih PRIJE prvog mjerenja
(deterministicki: sha256(fileName) modulo 5 == 0). Harness ih ukljucuje u `results`, ali ih `attest-real-corpus`
NE broji u dokaz razine A dok vlasnik ne potvrdi zavrsnu provjeru. Time se ocekivanja ne "dotjeruju" na istim
dokumentima na kojima se tvrdi uspjeh. NIJE implementirano.

### 2.3 Neovisna potvrda ocekivanja

`expected` u sidecaru pise osoba koja NIJE pokrenula popravak, prije pokretanja; harness vec odbija dokument bez
sidecara. Dodati polje `expectedBy` i `expectedAt`; bez njih dokument je `review`, ne `pass`. NIJE implementirano.

### 2.4 Word okruzenje uz svaki izvjestaj

`RELEASE_PROOF.json` nosi ishod Tier 2 razine, ali ne verziju Worda. Dodati `oracles.word.version` (COM
`Application.Version`, danas 14.0) u ovjeru; `attest-real-corpus.mjs` vec ima `oracles` objekt. NIJE implementirano.

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

## 4. Stanje 2026-09-09

Mjerenje po ovom protokolu NIJE izvedeno u ovoj sesiji: trazi mirni stroj (lokalni korpus, Word), a stroj je
istodobno pekao dokaz izdanja. Ovaj dokument zatvara dio T06 koji ne ovisi o mjerenju; 2.2 do 2.4 su konkretni,
mali zahvati u sidecar shemu i ovjeru koji idu u zaseban PR kad vlasnik potvrdi popis profila iz 2.1.

# Mjerenje toka proizvoda (T14)

Sto se mjeri, pod kojim uvjetima i sto se iz brojki SMIJE zakljuciti. Izvor istine za imena je
`PRODUCT_JOURNEY_EVENTS` u `src/ui/telemetry.ts`; `tests/product-journey-telemetry.test.ts` tvrdi da se svako ime
stvarno emitira u `src/`.

## Uvjeti pod kojima dogadjaj uopce nastaje

- Privola za analitiku je `granted` (`STORAGE_KEYS.analyticsConsent`), procitana PRI SVAKOM pozivu; promjena privole
  djeluje odmah, bez ponovnog ucitavanja.
- `analyticsEndpoint` je konfiguriran.
- Greska analitike nikad ne prekida proizvod: `trackEvent` guta gresku i vraca `false`.

Posljedica koju izvjestaj mora reci svaki put: uzorak su KORISNICI S PRIVOLOM. On ne predstavlja automatski sve
korisnike, ni po ponasanju ni po udjelu; stopa privole se ne mjeri (nema dogadjaja bez privole, po konstrukciji).

## Dogadjaji toka

| korak | dogadjaj | kad nastaje | atributi |
| --- | --- | --- | --- |
| dokument prihvacen | `file_selected` | intake prihvatio `.docx` | `sizeBucket` |
| profil potvrdjen | `profile_completed` | korisnik presao na analizu s potvrdjenim profilom | `profileStatus` |
| analiza zavrsila | `analysis_completed` | rezultat prikazan | `profileStatus`, `workType`, `issueCount` |
| plan otvoren | `repair_plan_opened` | korisnik otvorio plan ispravaka na korektorskom stolu | `profileId` |
| popravak dovrsen | `repair_completed` | popravak IZVRSEN I PROVJEREN ponovnom analizom (ne klik) | `count` rijeseno, `total` ciljano, `changes` zahvata, `kind` recommended/demoted |
| preuzimanje poceto | `repair_download_started` | korisnik kliknuo preuzimanje popravljene kopije | `kind` |
| verzije usporedjene | `revision_compared` | usporedba dviju verzija istog rada prikazana | `count` rijeseno, `total` uvedeno, `kind` comparable/not-comparable |

### Opportunity signal

`opportunity_summary` nije dodatni korak lijevka nego dijagnosticki dogadjaj nakon uspjesne analize.
Nosi samo interne dimenzije i brojace: `profileId`, `profileStatus`, `workType`, `auto`,
`assisted`, `manual`, `unknown`, `structureGaps`, `total` i `kind`. `unknown` je broj provjera sa statusom
`unmeasurable`. Ne nosi naslov, autora, naziv datoteke, tekst nalaza ni isjecak rada.

Control Center sekcija **Prilike** kombinira taj signal s postojecim `profile_completed`,
`repair_completed`, `paywall_viewed`, `checkout_started` i `purchase_completed` dogadjajima.
Rangiranje nije kompozitni score: prvo idu signali s najmanje 20 opažanja, zatim veci udio
zahvacenih i veci volumen. Paywall/checkout razlika je samo **event-count proxy** jer tablica nema
session/user identifikator; ne smije se zvati cohort abandonmentom.

V2 dodatno salje `analysis_structure_gap` samo za postojeci `skipped[]` iz poznatih strukturiranih
analizatora. Izvorni `reason` nikad se ne salje: svodi se na `unsupported-structure`, `stale-anchor`,
`no-target` ili `other`, uz `category` i `count`. To NIJE potpuni OOXML inspection coverage.

`repair_noop_reason` grupira postojeci `skippedReasons` iz repair enginea po sigurnom enumu
(`already-ok`, `no-target`, `invalid-params`, `unsupported-structure`, `stale-anchor`, `unclassified`)
i salje samo `kind` + `count`, bez `ruleId`-a. `inspection_coverage_global` ostaje u `missingSignals`
dok T64 ne uvede zasebni dokaz sto cijeli analizator nije pregledao; odsutnost mjerenja nikad se
ne prikazuje kao nula.

Postojeci dogadjaji (`file_selected`, `profile_completed`, `analysis_completed`) su zadrzani pod svojim imenima:
drugo ime za isti korak mjerilo bi ga dvaput.

## Sto se NE salje

Sve izvan bijele liste `DOPUSTENI_KLJUCEVI` ispada u `sanitizeEventData`: naslov, autor, naziv datoteke, komentar,
isjecak rada, tekst nalaza. Vrijednosti smiju biti samo skalari (string, broj, boolean). Gard:
`tests/product-journey-telemetry.test.ts` (sanitizacija, privola, emitiranje).

## Sto brojke znace, a sto ne

- `repair_completed` je vezan uz zavrsenu provjeru, pa "broj popravaka" znaci "broj popravaka s ponovnom analizom";
  popravak kojem ponovna analiza nije uspjela NE ulazi (ishod je tada nepoznat, ne uspjesan).
- `repair_download_started` je pocetak preuzimanja. Preglednik ne potvrdjuje ni otvaranje ni spremanje na disk, pa se
  taj dogadjaj ne smije citati kao "korisnik ima datoteku".
- Prolaz kroz tok se racuna po redoslijedu koraka u tablici; korisnik bez privole nije vidljiv ni u jednom koraku, pa
  omjeri medju koracima vrijede samo unutar uzorka s privolom.
- `count`/`total` u `repair_completed` su PROVJERE, `changes` su ZAHVATI; nisu ista velicina i ne zbrajaju se.

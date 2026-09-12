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

# Dosje za go/no-go beta izdanja 16. listopada 2026.

Ovaj dosje priprema vlasnikovu odluku za beta opseg A. Ne predstavlja odobrenje objave. Spajanje, završni dokaz izdanja, produkcijska objava i ručni prolaz glavnog toka ostaju vlasnikove radnje.

## Trenutačni presjek

Kandidat koji je pregledan 13. listopada jest origin/master na SHA-u f758ba2bde00c7f2d37daa789a39ed1e4168db99. Postojeći RELEASE_PROOF.json ima complete=true i prazan popis missingRequired; njegov treeDigest odgovara stablu tog kandidata. Provjera verify-release-proof --proof-only završila je uspješno, ali nije ponovno mjerila cijeli gate. Dokaz bilježi projections kao fail i extraction kao unavailable zbog nepostavljenog LEKTA_STAGING_ORIGIN. To su vidljiva neprolazna/neizmjerena stanja, a ne prolazi.

Workflow objave 13. listopada objavio je upravo SHA f758ba2bde00c7f2d37daa789a39ed1e4168db99. Stroga provjera build-info potvrdila je taj identitet. Produkcijski smoke pao je na 1 od 30 provjera: jedini nalaz bio je nedohvatljiv asset indexeddb-document-session-store-CRUogcaK.js s porukom fetch failed. Ostalih 29 provjera prošlo je, uključujući pravne stranice, health i identitet commita. Korak povrata Edge funkcija bio je preskočen. Pojedinosti su u izvještaju incidenta i [GitHub workflow runu](https://github.com/danielrisavi77-create/Lekta/actions/runs/38430199081).

Javni build-info.json pregledan 13. listopada navodi captchaSiteKey=false. Turnstile se zato ne smije uključiti na Supabase Authu dok vlasnik ne objavi build s ključem i javni build-info ne potvrdi captchaSiteKey=true.

Spajanje bilo kojeg paketa mijenja stablo za koje vrijedi postojeći RELEASE_PROOF. Nakon odabranih spajanja 16. listopada vlasnik radi jedan novi dokaz nad točnim čistim kandidatom, a zatim najviše jednu produkcijsku objavu. Svaka naknadna izmjena traži novi dokaz prije objave.

## Devet kriterija

| Kriterij | Stanje 13. listopada | Vlasnikov završni dokaz |
| --- | --- | --- |
| T26, poznati nalazi analize | Done prema dosjeu T26_ZATVARANJE.md. | Nema dodatne radnje za ovu betu osim ako kandidat promijeni relevantan kod. |
| T72, dokaz izdanja | Postojeći dokaz odgovara trenutnom origin/master; ne vrijedi nakon spajanja. | Jedan novi puni dokaz na konačnom kandidatu. |
| Word oracle na Windowsu | Povijesni prolazi nisu dokaz novog kandidata. | Ponovno pokrenuti četiri obvezne Word razine na završnom kandidatu i zadržati stvarne izlaze. |
| Sigurnosni podskup živih endpointa | T84 je in_progress; postoji izvještaj iz 4. listopada, ali nije završna provjera trenutne produkcije. | Dovršiti T84 i potvrditi da nema otvorenog P0 prije objave. |
| Popravak i troškovne granice | T85 sadrži staging dokaz od 27. rujna i staro produkcijsko očitanje od 28. rujna. Ono nije svježe očitanje. | Ponovno pročitati produkcijske vrijednosti REPAIR_DISABLED i REPAIR_FREE_MODE, dnevne limite i alarme troška. Ne slati njihove vrijednosti u support ili javne zapise. |
| Pravne stranice | Produkcijski smoke 13. listopada pronašao je svih sedam očekivanih stranica. T86 je in_review; HTTP dostupnost ne potvrđuje sadržaj ni vlasnikovo odobrenje. | Vlasnik pregleda i potvrđuje aktualne uvjete, privatnost i besplatnu beta formulaciju. |
| Domena i support | T49 je in_progress. | Potvrditi domenu, support sandučić te SPF, DKIM i DMARC prema DOMENA_T49.md. |
| Glavni tok i go/no-go | Još nema vlasnikova završnog prolaza na kandidatu. | Vlasnik prolazi glavni tok s dva do tri vlastita rada, provjerava limite i troškovne alarme te odlučuje GO ili NO-GO. Nepoznato stanje znači NO-GO. |
| Slijepe ulice | Uzorak od 20 javnih ruta odgovorio je HTTP 200; detalji i ograničenja uzorka su u BETA_REPORTS_C_2026-10-15.md. | Pregledati nalaze uzorka i potvrditi da nijedna isključena beta funkcija ne navodi korisnika na nedostupan tok. Dinamički katalog svih profila nije iscrpno pregledan. |

## Redoslijed 16. listopada

1. Odabrati samo pakete spremne za betu; zakašnjeli PR A ili B izostaviti.
2. Zaustaviti daljnje promjene na konačnom kandidatu i potvrditi čisto stablo.
3. Pokrenuti jedan završni dokaz izdanja i pregledati sve razine, uključujući označene neprolaze ili nedostupne provjere.
4. Objaviti jednom kroz odobreni workflow te potvrditi objavljeni SHA i strogi smoke.
5. Vlasnik prolazi glavni tok i donosi go/no-go odluku. Ovaj dosje ne donosi odluku umjesto vlasnika.

## Referentni dokazi

- Incident nakon produkcijske objave 13. listopada: PRODUCTION_SMOKE_2026-10-13.md.
- Izvještaji o živim rutama, captcha spremnosti i issueu #318: BETA_REPORTS_C_2026-10-15.md.
- Dokaz izdanja: docs/generated/RELEASE_PROOF.json.
- Povijesni staging dokaz prekidača: T85_PREKIDACI_PRODUKCIJA.md.
- Postupak uključivanja captche: docs/deploy/AUTH_CAPTCHA.md.
- Postupak hitnog gašenja popravka: docs/deploy/REPAIR_DISABLED.md.

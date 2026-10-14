# Dosje za go/no-go beta izdanja — 16. listopada 2026.

Ovaj dosje priprema vlasnikovu odluku za beta opseg A. Ne predstavlja odobrenje objave. Spajanje, završni dokaz izdanja, produkcijska objava i ručni prolaz glavnog toka ostaju vlasnikove radnje.

Raspored nije potpuno usklađen: vlasnikova operativna uputa planira odabir i spajanje najviše tri paketa u petak 16. listopada, dok mjerodavni Linear DAN-11/T81 ima status Backlog, rok i milestone 19. listopada. Ovaj dosje čuva 16. listopada kao plan paketa, ali ga ne prikazuje kao promjenu Linearova roka; vlasnik treba razriješiti razliku prije konačne go/no-go odluke.

## Trenutačni presjek — 14. listopada

Trenutačni origin/master i baza triju otvorenih beta PR-ova su SHA `f758ba2bde00c7f2d37daa789a39ed1e4168db99`. Postojeći `RELEASE_PROOF.json` bilježi `complete=true`, prazan `missingRequired` i treeDigest `1f07eda828383c1b108e186eb353d3e2a8ae04438721a5b36da68da35b798a3d`; zabilježena provjera `verify-release-proof --proof-only` prošla je, ali ne mjeri cijeli gate. Dokaz bilježi `projections=fail` i `extraction=unavailable` zbog nedostajućeg `LEKTA_STAGING_ORIGIN`; to nisu prolazi. Svako spajanje mijenja dokazani kandidat.

Workflow objave 13. listopada objavio je taj SHA. Javni `build-info.json` ponovno je pregledan 14. listopada i još navodi isti commit te `captchaSiteKey=false`. Produkcijski smoke pao je na 1 od 30 provjera: nedohvatljiv asset `indexeddb-document-session-store-CRUogcaK.js` vratio je `fetch failed`. Ostalih 29 provjera prošlo je, uključujući pravne stranice, health i identitet commita. Korak povrata Edge funkcija bio je preskočen. Pojedinosti su u izvještaju incidenta i [GitHub workflow runu](https://github.com/danielrisavi77-create/Lekta/actions/runs/38430199081).

Netlify Deploy Preview presjek provjeren je 14. listopada, prije ove korekcije dosjea. Najnoviji zapisi tada su vezali PR #367 uz head `7fb39d95` i deploy `6acecf0ae574c3373114259f`, PR #368 uz head `ecde4e34` i deploy `6aceda4e027abc7a7b4023ca`, a PR #369 uz head `6351bc92` i deploy `6ace6a3c186b7c2b0fcbe418`. Netlifyjevi read-only metapodaci za sva tri navode `context=deploy-preview` i `state=error`; sami metapodaci ne potvrđuju fazu ni uzrok greške. [Trenutačni zapis #367](https://app.netlify.com/projects/lektahr/deploys/6acecf0ae574c3373114259f), [#368](https://app.netlify.com/projects/lektahr/deploys/6aceda4e027abc7a7b4023ca) i [#369](https://app.netlify.com/projects/lektahr/deploys/6ace6a3c186b7c2b0fcbe418).

Ranije detaljno pregledani logovi za prethodne headove PR-ova #367 (`c6bd24d76b87`) i #368 (`0342a027d765`) pokazuju da je `verify-deploy-dist` odbio `RELEASE_PROOF.json` pečen na `9eaefcf46648`; ta potvrđena dijagnoza odnosi se na te starije pokušaje. Najnoviji pokušaji za #367 i #368 imaju druge headove, pa njihov točan korak i uzrok ostaju neprovjereni u ovom presjeku. Zapis #369 i dalje odgovara njegovu navedenom headu. Ovi preview statusi ne dokazuju je li Netlify Git auto-publish postavka zaključana niti potvrđuju produkcijsku objavu.

Turnstile se ne smije uključiti na Supabase Authu dok vlasnik ne postavi production site key, objavi build i javni `build-info.json` ne potvrdi `captchaSiteKey=true`.

Nakon vlasnikova odabira i spajanja paketa — prema operativnom planu 16. listopada, uz nerazriješen Linearov rok 19. listopada — vlasnik radi jedan novi puni dokaz nad točnim čistim kandidatom, zatim najviše jednu produkcijsku objavu. Svaka naknadna izmjena traži novi dokaz prije objave.

## Kriteriji za odluku

| Kriterij | Stanje 14. listopada | Vlasnikov završni dokaz |
| --- | --- | --- |
| T26, poznati nalazi analize | `tasks.json` bilježi Done; dosje T26_ZATVARANJE.md datiran je 27. rujna. | Postojeći dokaz ne zamjenjuje završni dokaz kandidata; ponoviti relevantne razine ako se promijeni analiza. |
| T72, dokaz izdanja | Linear DAN-9 bilježi Done od 9. listopada. Postojeći dokaz odgovara trenutačnom origin/masteru; ne vrijedi nakon spajanja. | Jedan novi puni dokaz na konačnom kandidatu. |
| Word oracle na Windowsu | Povijesni prolazi nisu dokaz novog kandidata. | Ponovno pokrenuti četiri obvezne Word razine na završnom kandidatu i zadržati stvarne izlaze. |
| Sigurnosni podskup živih endpointa, T84 | Linear DAN-12 bilježi Done od 10. listopada; PR #346 je priloženi dokaz. | Koristiti zabilježeni dokaz i provjeriti ima li novog otvorenog P0 prije objave. |
| Captcha, T89 | Linear DAN-14 je In Progress. Javni build-info 14. listopada ima `captchaSiteKey=false`; produkcijska zaštita nije uključena. | Vlasnik postavlja ključ, objavljuje build, potvrđuje `captchaSiteKey=true`, zatim postavlja secret i uključuje Turnstile u Supabase Authu. |
| Popravak i troškovne granice, T85 | `tasks.json` bilježi Done na temelju staging dokaza i produkcijskog očitanja od 28. rujna; to očitanje nije svježe. | Vlasnik ponovno očitava `REPAIR_DISABLED`, `REPAIR_FREE_MODE`, dnevne limite i alarme troška. Ne zapisivati njihove vrijednosti u support ili javne zapise. |
| Pravne stranice, T86 | Linear DAN-13 je In Review. Produkcijski smoke 13. listopada pronašao je sedam očekivanih stranica; HTTP dostupnost ne potvrđuje sadržaj ni vlasnikovo odobrenje. | Vlasnik pregledava aktualne uvjete, privatnost i besplatnu beta formulaciju. |
| Domena i support, T49 | Linear DAN-8 bilježi Done od 8. listopada za domenu, DNS i support. | Odvojena vlasnikova beta radnja ostaje podići Supabase Auth limit za e-mail i potvrditi aktualnu vrijednost; ovo očitanje ni promjena nisu obavljeni ovdje. |
| Glavni tok i go/no-go | Još nema vlasnikova završnog prolaza na kandidatu. | Vlasnik prolazi glavni tok s dva do tri vlastita rada, provjerava limite i troškovne alarme te odlučuje GO ili NO-GO. Nepoznato stanje znači NO-GO. |
| Slijepe ulice, T87 | `tasks.json` bilježi Done; 14. listopada svih 20 uzorkovanih ruta i 281 jedinstvena interna poveznica prošli su bez HTTP/mrežne pogreške. Ograničenja uzorka su u BETA_REPORTS_C_2026-10-15.md. | Pregledati nalaze i potvrditi da nijedna isključena beta funkcija ne navodi korisnika na nedostupan tok. Dinamički katalog svih profila nije iscrpno pregledan. |

## Redoslijed prema operativnom planu za 16. listopada

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

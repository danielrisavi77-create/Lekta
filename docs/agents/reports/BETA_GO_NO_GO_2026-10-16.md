# Dosje za go/no-go beta izdanja — 16. listopada 2026.

Ovaj dosje priprema vlasnikovu odluku za beta opseg A. Ne predstavlja odobrenje objave. Spajanje, završni dokaz izdanja, produkcijska objava i ručni prolaz glavnog toka ostaju vlasnikove radnje.

Raspored nije potpuno usklađen: vlasnikova operativna uputa planira odabir i spajanje najviše tri paketa u petak 16. listopada, dok mjerodavni Linear DAN-11/T81 ima status Backlog, rok i milestone 19. listopada. Ovaj dosje čuva 16. listopada kao plan paketa, ali ga ne prikazuje kao promjenu Linearova roka; vlasnik treba razriješiti razliku prije konačne go/no-go odluke.

## Sadržaj pripremljenih paketa

| Paket | Sadržaj | Trenutačna granica |
| --- | --- | --- |
| [PR #367 — dokumentacija](https://github.com/danielrisavi77-create/Lekta/pull/367) | Ispravak tvrdnje o Netlify auto-publishu, zapis incidenta od 13. listopada, dosje go/no-go, pripremljeni odgovori za podršku, postupak `REPAIR_DISABLED` te izvještaji C o živim poveznicama, captcha spremnosti i issueu #318. | Samo dokumentacija; ne mijenja aplikacijski kod. |
| [PR #368 — smoke, limiti i redizajn](https://github.com/danielrisavi77-create/Lekta/pull/368) | Jedan ponovni pokušaj smoke testa samo nakon mrežne pogreške, statički pregled zadanih limita besplatnog popravka i redizajn beta ulaza/zajedničke navigacije. Birač fakulteta traži izričit odabir; pregled nije očitanje živih Supabase limita. Nema novih ovisnosti. | Na SHA-u `3fb474dd6564`, ciljani UX testovi prošli su 4/4 na desktopu i mobilnom Chromiumu; `orphan-scan`, oxlint i TypeScript također su prošli. GitHub `db-smoke` pao je prije testova zbog ECR kvote, a tri druga CI posla još su u tijeku u presjeku niže. Preview blokira zastarjeli dokaz. |
| [PR #369 — zadaci](https://github.com/danielrisavi77-create/Lekta/pull/369) | Samo izolirani snimak `docs/agents/tasks.json`; Linear ostaje mjerodavan status zadataka. | Dokumentacijska promjena; ne mijenja aplikacijski kod. |

Sva tri PR-a ostaju draftovi prema `master`; ništa nije spojeno ni objavljeno. PR #367 sadrži i izvještaje C kako bi vlasnik dobio jedan pregledni dosje, dok je ažuriranje snimka zadataka zaseban PR #369. Ako PR #367 ili #368 nije spreman nakon četvrtka 15. listopada, izostaviti ga iz bete prema vlasnikovoj uputi. Redizajn je dio PR-a #368, ne zaseban četvrti paket.

## Trenutačni presjek — 14. listopada

Trenutačni origin/master i baza triju otvorenih beta PR-ova su SHA `f758ba2bde00c7f2d37daa789a39ed1e4168db99`. Postojeći `RELEASE_PROOF.json` bilježi `complete=true`, prazan `missingRequired` i treeDigest `1f07eda828383c1b108e186eb353d3e2a8ae04438721a5b36da68da35b798a3d`; zabilježena provjera `verify-release-proof --proof-only` prošla je, ali ne mjeri cijeli gate. Dokaz bilježi `projections=fail` i `extraction=unavailable` zbog nedostajućeg `LEKTA_STAGING_ORIGIN`; to nisu prolazi. Svako spajanje mijenja dokazani kandidat.

Workflow objave 13. listopada objavio je taj SHA. Javni `build-info.json` ponovno je pregledan 14. listopada i još navodi isti commit te `captchaSiteKey=false`. Produkcijski smoke pao je na 1 od 30 provjera: nedohvatljiv asset `indexeddb-document-session-store-CRUogcaK.js` vratio je `fetch failed`. Ostalih 29 provjera prošlo je, uključujući pravne stranice, health i identitet commita. Korak povrata Edge funkcija bio je preskočen. Pojedinosti su u izvještaju incidenta i [GitHub workflow runu](https://github.com/danielrisavi77-create/Lekta/actions/runs/38430199081).

Netlify Deploy Preview i GitHub status presjek provjereni su 14. listopada oko 05:59 CEST na ovim točnim glavama:

| PR | SHA | Netlify zapis | GitHub provjere u presjeku |
| --- | --- | --- | --- |
| #367 | `0f96605352fca36ba3d2d811ecdc99941ec8c10e` | [Deploy](https://app.netlify.com/projects/lektahr/deploys/6acef99da0de4689ece9a58d) | 30 uspješnih, 4 neuspješne, 2 preskočene, 0 u tijeku. `build-gate` za Node 20/24, `vitest-gate`, `browser-matrix` i `ux-gate` prošli su. |
| #368 | `3fb474dd6564deeb44142ed06d65b9621a0627c4` | [Deploy](https://app.netlify.com/projects/lektahr/deploys/6acefc8edec66c97ef6b5820) | 26 uspješnih, 5 neuspješnih, 2 preskočene, 3 u tijeku (`check`, `browser-matrix`, `ux-gate`). Četiri neuspjeha su Netlify statusi; `db-smoke` nije uspio povući `postgres:16` s javnog ECR-a zbog `toomanyrequests: Data limit exceeded`, prije pokretanja testova. |
| #369 | `6351bc928c5772ee7f1fe5c8d43b2dfe0146510f` | [Deploy](https://app.netlify.com/projects/lektahr/deploys/6ace6a3c186b7c2b0fcbe418) | 30 uspješnih, 4 neuspješne, 2 preskočene, 0 u tijeku. |

U sva tri detaljna Netlify loga `vite build` i generiranje artefakata završavaju, a `dist/build-info.json` odgovara SHA-u koji se gradi. Zatim `node scripts/verify-deploy-dist.mjs` odbija zastarjeli `RELEASE_PROOF.json`, pečen na `9eaefcf46648`, jer se stablo razlikuje od kandidata. Logovi prikazuju `projections: fail` i `extraction: unavailable (missing-env:LEKTA_STAGING_ORIGIN)` kao neizmjerene razine, ne kao prolaze; korak `Deploying` je preskočen, pa nijedan preview nije objavljen. Četiri Netlify statusa na PR-ovima #367 i #369, odnosno četiri od pet na #368, vode na taj isti neuspjeli deploy i nisu četiri zasebna kvara aplikacije. Ovo je odvojeno od produkcijskog smoke incidenta 13. listopada, kada je uspješna objava bila pogrešno označena zbog prolazne mrežne pogreške.

Brojevi provjera pripadaju navedenim SHA-ovima i vremenu presjeka; nova izmjena PR-a pokreće nove provjere. `db-smoke` na #368 ostaje neriješena crvena provjera premda log upućuje na ograničenje image registryja, a tri navedena posla tada još su trajala. Preview statusi ne dokazuju je li Netlify Git auto-publish postavka zaključana niti potvrđuju produkcijsku objavu.

## Dopunski presjek — 14. listopada, 06:56 CEST

Ovaj presjek zamjenjuje ranije stanje za odluku o trenutačnim glavama; prethodna tablica ostaje povijesna snimka u 05:59 CEST.

| PR | Trenutačni SHA | Netlify Deploy Preview | GitHub provjere |
| --- | --- | --- | --- |
| #367 | `d38639a504896cd9035750cc506abf24e3f2e0f1` | [Deploy](https://app.netlify.com/projects/lektahr/deploys/6acefeeec4232518b5fb8467) — `error` | 30 uspješnih, 4 neuspješne, 2 preskočene, 0 u tijeku. |
| #368 | `f6a3acc875e9aa91f49f0f714ce44950de1e5e39` | [Deploy](https://app.netlify.com/projects/lektahr/deploys/6acf06b20a72e93282763c33) — `error` | 30 uspješnih, 4 neuspješne, 2 preskočene, 0 u tijeku. |
| #369 | `6351bc928c5772ee7f1fe5c8d43b2dfe0146510f` | [Deploy](https://app.netlify.com/projects/lektahr/deploys/6ace6a3c186b7c2b0fcbe418) — `error` | 30 uspješnih, 4 neuspješne, 2 preskočene, 0 u tijeku. |

Četiri crvene provjere na svakom PR-u jesu Netlify Deploy Preview, Header rules, Pages changed i Redirect rules; svaka skupina pokazuje na odgovarajući neuspjeli deploy. Netlifyjev zapis za sva tri deploya kaže `Failed during stage 'building site': Build script returned non-zero exit code: 2`, s `published_at=null`; nijedan preview nije objavljen. `netlify.toml` globalno postavlja `LEKTA_REQUIRE_RELEASE_PROOF=1`, a `scripts/build-production.mjs` zadnje pokreće `verify-deploy-dist`. Trenutačni zapisi ne otkrivaju pojedinačni korak koji je vratio kod 2. To je u skladu s ranijim detaljnim logovima, gdje je ista provjera odbila dokaz vezan uz drugo stablo, ali se taj točan uzrok ne tvrdi za ove nove deploy ID-jeve bez njihovih punih logova.

Na trenutačnom SHA-u PR-a #368 lokalno prolaze ciljani test Kazala na desktopu i mobitelu (2/2), `npm run orphan-scan`, `npm run lint` i `npx tsc --noEmit`; svi GitHub gateovi osim četiri Netlify provjere prolaze. `pr-intake` potvrđuje bazu `master` na `f758ba2b` i nema zaštićenih staza, ali označava da se opis PR-a ne slaže s diffom: 39 datoteka, `+1328/-435` prema PR opisu `+239/-13`. Nezavisni pregled drugog providera još nije zabilježen. PR #368 ostaje draft; opis i neovisni pregled moraju se riješiti prije nego vlasnik odluči o spajanju.

Svi PR-ovi su draftovi. Netlify preview pad nije dokaz produkcijskog pada niti potvrda da je automatska objava zaključana. Vlasnikova granica bez spajanja i objave ostaje nepromijenjena.

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

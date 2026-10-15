# Dosje za go/no-go beta izdanja — 16. listopada 2026.

Ovaj dosje priprema vlasnikovu odluku za beta opseg A. Ne predstavlja odobrenje objave. Spajanje, završni dokaz izdanja, produkcijska objava i ručni prolaz glavnog toka ostaju vlasnikove radnje.

Raspored nije potpuno usklađen: vlasnikova operativna uputa planira odabir i spajanje najviše tri paketa u petak 16. listopada, dok mjerodavni Linear DAN-11/T81 ima status Backlog, rok i milestone 19. listopada. Ovaj dosje čuva 16. listopada kao plan paketa, ali ga ne prikazuje kao promjenu Linearova roka; vlasnik treba razriješiti razliku prije konačne go/no-go odluke.

## Sadržaj pripremljenih paketa

| Paket | Sadržaj | Trenutačna granica |
| --- | --- | --- |
| [PR #367 — beta dosje i pravni podaci](https://github.com/danielrisavi77-create/Lekta/pull/367) | Incident, go/no-go dosje, podrška, `REPAIR_DISABLED` i izvještaji C; dodaje potvrđene javne pravne podatke, besplatnu beta formulaciju i eksplicitan registracijski status. Deploy gate blokira trgovinu dok pružatelj nije registriran. | Dokumentacija te pravni prikaz/gate u kodu; ne uključuje naplatu i ne mijenja produkciju. |
| [PR #368 — smoke, limiti i redizajn](https://github.com/danielrisavi77-create/Lekta/pull/368) | Jedan ponovni pokušaj smoke testa samo nakon mrežne pogreške, statički pregled zadanih limita besplatnog popravka i redizajn beta ulaza/zajedničke navigacije. Birač fakulteta traži izričit odabir; pregled nije očitanje živih Supabase limita. Nema novih ovisnosti. | Na HEAD-u `9cdb5f191eb06bc9af80c363ed0ebb52e61b7c2e` svih šest obveznih master provjera, `browser-matrix` i Netlify Deploy Preview prolaze; `postgres-smoke`, Supabase Preview te Netlify Pages/Redirect pravila su preskočeni. Neovisan pregled drugog providera još nije zabilježen. |
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

Četiri crvene provjere na svakom PR-u jesu Netlify Deploy Preview, Header rules, Pages changed i Redirect rules; svaka skupina pokazuje na odgovarajući neuspjeli deploy. Netlifyjev zapis za sva tri deploya kaže `Failed during stage 'building site': Build script returned non-zero exit code: 2`, s `published_at=null`; nijedan preview nije objavljen. `netlify.toml` globalno postavlja `LEKTA_REQUIRE_RELEASE_PROOF=1`, a `scripts/build-production.mjs` zadnje pokreće `verify-deploy-dist`.

Na aktualnom SHA-u #368 (`f6a3acc875e9aa91f49f0f714ce44950de1e5e39`) isti je produkcijski lanac lokalno ponovljen s `LEKTA_SITE_ORIGIN=https://lekta.hr`, `DEPLOY=1` i `LEKTA_REQUIRE_RELEASE_PROOF=1`. `vite build` i svi generatori prošli su; završni `verify-deploy-dist` pao je jer je `RELEASE_PROOF.json` pečen na `9eaefcf46648`, a dokazani digest stabla ne odgovara stablu #368. `dist/build-info.json` ispravno je identificirao `f6a3acc875e9`. Time je uzrok Netlify pada za #368 reproduciran bez objave. Netlifyjev API za nove deploy ID-jeve #367 i #369 izlaže samo zbirni kod 2; raniji detaljni logovi tih paketa zabilježili su isti stale-proof pad, ali se ovaj put zasebno nije pokrenuo lokalni build na njihovim trenutačnim SHA-ovima.

Na trenutačnom SHA-u PR-a #368 lokalno prolaze ciljani test Kazala na desktopu i mobitelu (2/2), `npm run orphan-scan`, `npm run lint` i `npx tsc --noEmit`; svi GitHub gateovi osim četiri Netlify provjere prolaze. `pr-intake` potvrđuje bazu `master` na `f758ba2b` i nema zaštićenih staza, ali označava da se opis PR-a ne slaže s diffom: 39 datoteka, `+1328/-435` prema PR opisu `+239/-13`. Nezavisni pregled drugog providera još nije zabilježen. PR #368 ostaje draft; opis i neovisni pregled moraju se riješiti prije nego vlasnik odluči o spajanju.

Svi PR-ovi su draftovi. Netlify preview pad nije dokaz produkcijskog pada niti potvrda da je automatska objava zaključana. Vlasnikova granica bez spajanja i objave ostaje nepromijenjena.

Turnstile se ne smije uključiti na Supabase Authu dok vlasnik ne postavi production site key, objavi build i javni `build-info.json` ne potvrdi `captchaSiteKey=true`.

Nakon vlasnikova odabira i spajanja paketa — prema operativnom planu 16. listopada, uz nerazriješen Linearov rok 19. listopada — vlasnik radi jedan novi puni dokaz nad točnim čistim kandidatom, zatim najviše jednu produkcijsku objavu. Svaka naknadna izmjena traži novi dokaz prije objave.

## Najnoviji presjek — 14. listopada 2026., 05:32 UTC

Ovaj presjek zamjenjuje ranije tablice za trenutačne glave, opseg, provjere, preglede i produkcijski build-info. `origin/master` i baza sva tri PR-a ostaju `f758ba2bde00c7f2d37daa789a39ed1e4168db99`; svaki PR je na toj bazi bez zaostatka. Metrike PR-a #367 u tablici odnose se na pre-dopunski HEAD; nakon dokumentacijskih dopuna `node scripts/agents/pr-lines.mjs --izracunaj` i dalje daje +1842/-39, a poslije slanja ove glave treba potvrditi i udaljenim `pr-intake`.

| PR | Trenutačni HEAD | Stvarni diff prema bazi | Neto promjena navedena u PR opisu | GitHub provjere |
| --- | --- | --- | --- | --- |
| #367 | `b80eb3832b6f87919ab0cd41087deb9222fbab9e` | 13 datoteka, +1822/-39 | +223/-39 — ne podudara se | 30 prolaznih, 4 neuspješne, 2 preskočene |
| #368 | `f6a3acc875e9aa91f49f0f714ce44950de1e5e39` | 39 datoteka, +1328/-435 | +239/-13 — ne podudara se | 30 prolaznih, 4 neuspješne, 2 preskočene |
| #369 | `6351bc928c5772ee7f1fe5c8d43b2dfe0146510f` | 1 datoteka, +2/-2 | +2/-2 — podudara se | 30 prolaznih, 4 neuspješne, 2 preskočene |

Svježi `pr-intake` i GitHub pregledi potvrđuju da su sva tri PR-a i dalje draftovi, ciljaju `master`, nemaju zaštićenih staza, nemaju zabilježen review i vraćaju `mergeStateStatus=UNSTABLE`. Svih šest statusa iz klasične zaštite grane prolazi (`conformance-matrix`, `check`, `ux-gate`, `build-gate` za Node 20 i 24 te `unittest (3.12)`). Pravilo `master` dodatno zahtijeva `vitest-gate`, `dist-gate` i `pr-opis` te ponavlja `ux-gate` i oba `build-gate`; i ti statusi prolaze u ovom presjeku. Netlify Deploy Preview i njegova tri pravila nisu obavezni statusi ni u klasičnoj zaštiti ni u rulesetu; upravo ta četiri statusa ne prolaze. Dva preskočena statusa su Supabase Preview i `postgres-smoke`. Na aktualnom SHA-u #368 `db-smoke` prolazi, pa je raniji ECR limit iz tablice 05:59 samo povijesna snimka.

U trenutku presjeka odstupanje opisa od stvarnog diff-a postojalo je za #367 i #368; tadašnji zeleni `pr-opis` provjeravao je format obaveznih redaka, ne točnost njihovih brojki. Nakon presjeka opis #367 usklađen je na `Neto redaka: +1842/-39`, a obavezni `pr-opis` check prošao je na SHA-u `4cb605b211912ac94df769cb4d0e09f19ad77bd9`. PR #367 uključuje 1552 retka izvještaja JSON-a među dokumentacijskim datotekama. Na #368 neslaganje ostaje: stvarni diff je +1328/-435, opis navodi +239/-13. #368 uključuje redizajn ulaza i zajedničke navigacije uz smoke popravak i pregled zadanih limita. Nijedan PR nema odobrenje drugog providera; #368 ostaje draft i nije spreman za spajanje.

Za PR #368 je na točnom SHA-u lokalno izvršen `npm run test:ux -- tests/ux/intake-entry.spec.ts tests/ux/visual-audit-surfaces.spec.ts`: 50 prolaza i 2 očekivana preskakanja za desktop-only testove u mobilnom projektu, u 7,5 minuta. Pokriveni su pristupačnost i fokus ulaza, širine zaslona, odabir profila, tokovi učitavanja, teme kartoteke, mobilni izbornik i Kazalo te ponašanje Turnstilea bez site keyja. Razvojna konzola potvrđuje lokalni Supabase emulator; ovo nije dokaz produkcijske autentikacije. Testni izlaz vrijedi za `f6a3acc875e9aa91f49f0f714ce44950de1e5e39`.

Ponovljeni javni `build-info.json` u 05:32 UTC potvrđuje produkcijski commit `f758ba2bde00c7f2d37daa789a39ed1e4168db99` i `captchaSiteKey=false`. Issue #318 je i dalje otvoren (GitHub ga je zadnji put ažurirao 6. listopada); priloženi dokazi ne zatvaraju ga i ne potvrđuju neovisni review PR-a #319.

**Odluka za objavu: HOLD.** Paketi i lokalni UX prolaz pripremljeni su, ali još nema vlasnikovog odabira i spajanja, novog dokaza izdanja, captcha konfiguracije, svježeg očitanja živih limita i troškovnih alarma ni vlasnikova prolaza glavnog toka s 2–3 rada. Netlify preview i dalje ne nastaje jer završna provjera odbija dokaz izdanja vezan uz drugo stablo; taj zaštitni uvjet se ne zaobilazi.

## Kriteriji za odluku

| Kriterij | Stanje 14. listopada | Vlasnikov završni dokaz |
| --- | --- | --- |
| T26, poznati nalazi analize | `tasks.json` bilježi Done; dosje T26_ZATVARANJE.md datiran je 27. rujna. | Postojeći dokaz ne zamjenjuje završni dokaz kandidata; ponoviti relevantne razine ako se promijeni analiza. |
| T72, dokaz izdanja | Linear DAN-9 bilježi Done od 9. listopada. Postojeći dokaz odgovara trenutačnom origin/masteru; ne vrijedi nakon spajanja. | Jedan novi puni dokaz na konačnom kandidatu. |
| Word oracle na Windowsu | Povijesni prolazi nisu dokaz novog kandidata. | Ponovno pokrenuti četiri obvezne Word razine na završnom kandidatu i zadržati stvarne izlaze. |
| Sigurnosni podskup živih endpointa, T84 | Linear DAN-12 bilježi Done od 10. listopada; PR #346 je priloženi dokaz. | Koristiti zabilježeni dokaz i provjeriti ima li novog otvorenog P0 prije objave. |
| Captcha, T89 | Linear DAN-14 je In Progress. Javni build-info 14. listopada ima `captchaSiteKey=false`; produkcijska zaštita nije uključena. | Vlasnik postavlja ključ, objavljuje build, potvrđuje `captchaSiteKey=true`, zatim postavlja secret i uključuje Turnstile u Supabase Authu. |
| Popravak i troškovne granice, T85 | `tasks.json` bilježi Done na temelju staging dokaza i produkcijskog očitanja od 28. rujna; to očitanje nije svježe. | Za besplatnu betu vlasnik potvrđuje da `REPAIR_DISABLED` nije `true` i postavlja/potvrđuje `REPAIR_FREE_MODE=true` prema `docs/GO_LIVE_REPAIR.md`, odjeljku B. Zatim svježe očitava dnevne limite i alarme troška; njihove vrijednosti ne zapisivati u support ili javne zapise. |
| Pravne stranice, T86 | Linear DAN-13 je In Review. Produkcijski smoke 13. listopada pronašao je sedam očekivanih stranica; HTTP dostupnost ne potvrđuje sadržaj ni vlasnikovo odobrenje. | Vlasnik pregledava aktualne uvjete, privatnost i besplatnu beta formulaciju. |
| Domena i support, T49 | Linear DAN-8 bilježi Done od 8. listopada za domenu, DNS i support. `tasks.json` bilježi Resend SMTP od 4.10. i limit 2/h, ali to nije živo očitanje. | Vlasnik u produkcijskom projektu otvara Supabase Dashboard > Authentication > Rate Limits, potvrđuje aktivni provider i `rate_limit_email_sent`, pa tek onda povisuje limit po svojoj procjeni. Ugrađeni provider je 2 e-maila/h; promjena zahtijeva Custom SMTP ili Send Email hook. Probni OTP i prijavu potvrditi te vrijeme i rezultat zabilježiti privatno; ovaj limit nije ovdje očitan ni promijenjen. [Supabase Auth rate limits](https://supabase.com/docs/guides/auth/rate-limits). |
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

## Dopunski presjek — 15. listopada, 13:15 CEST

Javni `GET https://lekta.hr/build-info.json` vraća HTTP 200 i još pokazuje commit `f758ba2bde00c7f2d37daa789a39ed1e4168db99`, vrijeme izgradnje `2026-10-13T16:37:42.888Z` i `captchaSiteKey=false`. Nije bilo nove produkcijske objave. Vlasnik je 15. listopada potvrdio pravne podatke pružatelja, status da subjekt nije registriran i besplatne popravke tijekom bete; izmjene su u nacrtu PR-a #367, ne na produkciji. Potvrdio je i da mu odgovara objavljena formulacija privatnosti koja spominje Turnstile i Cloudflare.

Trenutačni GitHub presjek za nacrte, svi prema bazi `f758ba2bde00c7f2d37daa789a39ed1e4168db99`:

| PR | SHA | Status provjera |
| --- | --- | --- |
| #367 | `16901890fcaf72d9ffd4168c77da9397a0df99bf` | Nacrt. Najnoviji intake presjek ima 32 uspješne provjere, 3 neuspješne Netlify pravila (Header/Pages/Redirect) i nema provjera u tijeku; preview status upućuje na isti deploy `6ad0abd6f8ca5991c9290115`. `pr-opis` je prošao u 10:44 UTC nakon uređivanja opisa u 10:43 UTC. |
| #368 | `541c3bd76024f3ea9d6108fb7f12ff4538f5fbd9` | Nacrt. 33 uspješne, 2 neutralne i 2 preskočene provjere; nema neuspjelih ni aktivnih provjera. Lokalni pregled izvornog koda za limite popravka i ciljani proof-only prolaz ranije su završili, ali taj prolaz bilježi `projections: fail` i `extraction: unavailable` zbog nedostajućeg `LEKTA_STAGING_ORIGIN`. To su neriješene razine dokaza, ne prolazi. |
| #369 | `6351bc928c5772ee7f1fe5c8d43b2dfe0146510f` | Nacrt. Netlify Deploy Preview, Header/Pages/Redirect pravila i status `netlify/lektahr/deploy-preview` upućuju na isti neuspjeli deploy `6ace6a3c186b7c2b0fcbe418`. |

Issue #318 ostaje otvoren. PR #319 jest spojen, a dosje C sadrži dokaze, no ti dokazi ne zatvaraju issue niti potvrđuju neovisni review.

## Završni presjek — 15. listopada 2026., 14:12 CEST

Presjek je za trenutačne glave; svi beta PR-ovi su i dalje draftovi prema `master`, bez spajanja.

| PR | HEAD | Trenutačni dokaz |
| --- | --- | --- |
| #367 | `a2c1d45c785b886a0198588ade4cf69488bea3bb` | Šest obveznih master provjera i `browser-matrix` prolaze. Netlify Deploy Preview i tri Netlify pravila padaju; to nisu obvezne master provjere. Lokalni ciljani pravni testovi prošli su 33/33, a `npm run orphan-scan` prolazi. |
| #368 | `9cdb5f191eb06bc9af80c363ed0ebb52e61b7c2e` | Šest obveznih master provjera, `browser-matrix` i Netlify Deploy Preview prolaze. `postgres-smoke`, Supabase Preview te Netlify Pages/Redirect pravila su preskočeni. PR opis je osvježen, a `pr-opis` prolazi. |
| #369 | `6351bc928c5772ee7f1fe5c8d43b2dfe0146510f` | Šest obveznih master provjera prolazi. Netlify Deploy Preview i tri Netlify pravila padaju; nisu obvezni master statusi. |

GitHub ne bilježi neovisan pregled drugog providera ni na jednom beta PR-u. PR #368 ima `mergeStateStatus=CLEAN`, ali ostaje draft; #367 i #369 su `UNSTABLE` zbog neobveznih Netlify statusa. Nitko nije spojio PR-ove.

Javni `GET https://lekta.hr/build-info.json` i dalje vraća commit `f758ba2bde00c7f2d37daa789a39ed1e4168db99`, vrijeme izgradnje `2026-10-13T16:37:42.888Z` i `captchaSiteKey=false`. Pravne izmjene iz PR-a #367 nisu na produkciji. Živi Supabase repair limiti, `REPAIR_DISABLED`, `REPAIR_FREE_MODE`, troškovni alarmi, Auth pružatelj i `rate_limit_email_sent` nisu svježe očitani. Konačni kombinirani kandidat još nema novi puni Windows `release:check`, release proof ni vlasnikov ručni prolaz s 2–3 rada.

**Odluka ostaje HOLD.** Sljedeći rad ide stavku po stavku uz ciljanu provjeru; puni dokaz radi se jednom nakon odabira i zamrzavanja kandidata. Produkcijska objava i GO/NO-GO ostaju vlasnikove radnje.

**Radni redoslijed:** rješavati preostale stavke jednu po jednu i odmah nakon svake pokrenuti samo njene ciljane provjere. Nakon odabira beta-paketa zamrznuti točan kandidat, napraviti jedan završni dokaz izdanja, pregledati svaki neprolaz ili nedostupnu razinu i objaviti jednom. Do tada odluka ostaje HOLD: nema spajanja u `master` ni produkcijske objave.

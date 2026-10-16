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

## Dopuna — svježi presjek Captche, 15. listopada 2026.

Javni `GET https://lekta-staging.netlify.app/build-info.json` vraća HTTP 200, commit `f758ba2bde00c7f2d37daa789a39ed1e4168db99`, `builtAt=2026-10-13T16:25:40.268Z` i `captchaSiteKey=true`. To dokazuje samo da taj staging build sadrži javni site key. U dostupnim dokazima nisu potvrđeni token u pregledniku, Supabase Auth secret/uključivanje CAPTCHA ni negativni i pozitivni Auth testovi; te korake treba tretirati kao neprovjerene dok vlasnik ne zabilježi staging rezultate.

Svježi javni `GET https://lekta.hr/build-info.json` vraća HTTP 200, isti commit `f758ba2bde00c7f2d37daa789a39ed1e4168db99`, `builtAt=2026-10-13T16:37:42.888Z` i `captchaSiteKey=false`. Produkcijski secret se ne postavlja i Turnstile se ne uključuje prije staging dokaza; za konačni kandidat vlasnik postavlja production site key prije jedine planirane objave, potvrđuje `captchaSiteKey=true`, pa tek onda dovršava Auth aktivaciju prema `docs/deploy/TURNSTILE_T89.md`.

## Svježi presjek — 15. listopada 2026., 20:50 UTC

Ovo je presjek prije ove dopune dosjea. Javni `GET https://lekta.hr/build-info.json` vratio je HTTP 200, commit `f758ba2bde00c7f2d37daa789a39ed1e4168db99`, `builtAt=2026-10-15T13:18:38.258Z` i `captchaSiteKey=false`. Produkcija i dalje služi postojeći master; ovaj presjek ne predstavlja novu objavu.

Svježi `pr-intake` za sva tri beta PR-a potvrđuje bazu `master` na `f758ba2b`, nula commita ispred/iza, draft status i ispravan broj/redaka u opisu:

| PR | HEAD u trenutku presjeka | `pr-intake` i dodatne provjere |
| --- | --- | --- |
| #367 | `b87f46c6b0e680e5deee5d940e911e3c78724443` | 32 zelena, 3 crvena Netlify pravila (Header/Pages/Redirect), 0 u tijeku; devet obveznih statusa, `browser-matrix`, te ponovljeni `db-smoke` i `npm-audit` prolaze. |
| #368 | `d502a6bb70c15e2d412c06bdecacb1b0d9b9700c` | 32 zelena, 3 crvena Netlify pravila, 0 u tijeku; devet obveznih statusa, `browser-matrix` (175 prošlo, 4 preskočeno), `db-smoke` i `npm-audit` prolaze. |
| #369 | `79e5e15647e5de32a804ad12955b476f24393025` | 32 zelena, 3 crvena Netlify pravila, 0 u tijeku; devet obveznih statusa i `browser-matrix` prolaze. |

`netlify/lektahr/deploy-preview` je i dalje neuspješan, a preview nije objavljen (`published_at=null`); to ne mijenja produkciju. `pr-intake` ne bilježi neovisan pregled drugog providera ni za jedan PR. Svi ostaju draftovi. Na PR-ovima #367 i #368 proof-only provjera još ne prihvaća `RELEASE_PROOF` jer je vezan uz stariji SHA; nema kombiniranog kandidata ni novog završnog dokaza. Staging `build-info.json` ima `captchaSiteKey=true`, ali produkcijski ga nema. Supabase Auth captcha/token provjere te živi limiti popravaka, zastavice i alarmi troškova i dalje su neprovjereni; u ovom presjeku nijedna produkcijska/Supabase postavka nije promijenjena.

**Odluka ostaje HOLD.** Ovo stanje podupire redoslijed korak-po-korak s ciljanom provjerom nakon svake promjene. Završni dokaz i produkcijska objava ostaju jednom, nakon što se odabere i zamrzne kandidat i vlasnik dovrši potrebne konfiguracije i ručni prolaz.

## Dopuna nakon svježih provjera — 16. listopada 2026.

Javni `GET` za produkcijski i staging `build-info.json` vraća HTTP 200 i isti commit
`f758ba2bde00c7f2d37daa789a39ed1e4168db99`. Produkcija ima `captchaSiteKey=false`
(`builtAt=2026-10-15T13:18:38.258Z`), a staging `captchaSiteKey=true`
(`builtAt=2026-10-13T16:25:40.268Z`). Staging strogi post-deploy smoke za taj očekivani SHA prošao
je **29/29**; to potvrđuje samo trenutačno objavljeni staging build, ne PR grane ni Supabase Auth
captcha.

PR-ovi su i dalje draftovi prema `master` na `f758ba2b`. Svježe GitHub provjere pokazuju da su
repozitorijski CI, build i browser-matrix statusi zeleni za beta PR-ove. `netlify/lektahr/deploy-preview`
i pripadajuća Netlify Header/Pages/Redirect pravila padaju na previewima; to nije produkcijska
objava ni dokaz produkcijskog kvara. GitHub ne bilježi pregled drugog providera.

| PR | HEAD | Dodatna provjera i status |
| --- | --- | --- |
| #367 | `a52613c3e67c191fe51af0838ebe0b0f2cb2e8ef` | Ciljani lokalni pravni testovi 36/36 i `npm run orphan-scan` prolaze. Nema neovisnog pregleda. |
| #368 | `d502a6bb70c15e2d412c06bdecacb1b0d9b9700c` | Ciljani lokalni testovi 7/7 datoteka, 1.151/1.151 testova (uključujući 845 mutacijskih); `npm run orphan-scan` prolazi. Nema neovisnog pregleda. |
| #369 | `79e5e15647e5de32a804ad12955b476f24393025` | Izvještaj/snimka zadataka; repo CI i browser-matrix prolaze. Issue #318 još je otvoren. Nema neovisnog pregleda. |

Otvoren je i zaseban SEO draft PR #370 (`d41214a85a09d5fb433a86a6cbda9586e18b8393`), koji nije
među tri imenovana beta paketa #367–#369. Njegovi repo CI/build/browser statusi prolaze, dok su
Netlify preview statusi neuspješni; GitHub About već ima `https://lekta.hr` kao homepage. Odluka o
uključivanju #370 u beta kandidata još nije zabilježena.

Auth Turnstile token, Supabase Auth uključivanje i pozitivni/negativni staging testovi ostaju
nepotvrđeni. Produkcijski limiti popravaka i alarma troškova također nemaju svježe očitanje u ovom
presjeku. Nije promijenjena nijedna produkcijska ni Supabase postavka; kandidat nije zamrznut i nema
novog punog `release:check` ni novog `RELEASE_PROOF`.

**Odluka ostaje HOLD.** Nastaviti ciljane provjere stavku po stavku. Puni dokaz, spajanje odabranih
beta paketa i produkcijska objava ostaju tek nakon vlasnikovih staging/operativnih dokaza i odabira
paketa.

## Presjek nakon WebKit ponovne provjere — 16. listopada 2026., 01:35 CEST

Sva tri PR-a i dalje su draftovi prema `master` na bazi
`f758ba2bde00c7f2d37daa789a39ed1e4168db99`; nijedan nije spojen. Svježe stanje PR-ova:

| PR | HEAD | Repo CI i browser-matrix | Netlify preview |
| --- | --- | --- | --- |
| #367 | `00a55c8ff8fc2ee5527f1fbcac3c3e7b381f07e5` | Obvezni repo statusi prolaze. Prvi browser-matrix pokušaj pao je u WebKitu u Z34 scenariju; isti test lokalno je prošao 1/1 za 2,5 min. Ponovljeni GitHub job na istom SHA-u prošao je: 169 prošlo, 4 preskočena, za 12m48s. | Deploy Preview i pravila Header/Pages/Redirect ne prolaze. |
| #368 | `d502a6bb70c15e2d412c06bdecacb1b0d9b9700c` | Repo CI i browser-matrix prolaze. Ciljani lokalni skup prošao je 7/7 datoteka i 1.151/1.151 testova; `orphan-scan` prolazi. | Deploy Preview i pravila Header/Pages/Redirect ne prolaze. |
| #369 | `79e5e15647e5de32a804ad12955b476f24393025` | Repo CI i browser-matrix prolaze. | Deploy Preview i pravila Header/Pages/Redirect ne prolaze. |

Netlify API za sva tri aktualna previewa javlja stanje `error`,
`published_at=null` i samo opću poruku `Build script returned non-zero exit code: 2`; API ne otkriva
koji je korak izgradnje pao. Lokalna stroga provjera na HEAD-u PR-a #367 (PowerShell:
`$env:LEKTA_REQUIRE_RELEASE_PROOF='1'; node scripts/verify-release-proof.mjs`) pada jer `RELEASE_PROOF.json` pripada commitu
`9eaefcf466486ad4a0daa9297d5e4bd59161dea7`, a ne ovom stablu. `netlify.toml` traži taj strogi dokaz.
To je potvrđen lokalni razlog za odbijanje zastarjelog dokaza i vjerojatno objašnjenje Netlify pada;
točan korak Netlify gradnje nije potvrđen u njihovim nedostupnim detaljnim logovima. Ne isključivati
gate i ne izrađivati dokaz za pojedini PR. Novi dokaz pripada tek odabranom, zamrznutom kandidatu.

GitHub i dalje ne bilježi neovisni pregled drugog providera. Produkcijski build-info još pripada
SHA-u `f758ba2bde00c7f2d37daa789a39ed1e4168db99` i nema Captcha site key. Živi limiti i alarmi,
Auth Captcha dokaz, vlasnikov ručni prolaz glavnog toka te novi završni dokaz i dalje nedostaju.
**Odluka ostaje HOLD; nema spajanja ni produkcijske objave.** Nastaviti ciljanim korakom po korak,
ali završni `release:check`, novi dokaz i produkcijsku objavu napraviti jedanput nakon konačnog
odabira i zamrzavanja kandidata.

## Svježi presjek — 16. listopada 2026., 02:47 CEST

Produkcijski `build-info.json` vraća HTTP 200, commit `f758ba2bde00c7f2d37daa789a39ed1e4168db99` i `captchaSiteKey=false`. Živa `/privatnost.html` vraća HTTP 200, sadrži Turnstile, ali još ne sadrži vlasnički potvrđeni OIB ni telefon iz PR-a #367. Točan javni tekst i nova verzija pravnih obavijesti zasad su samo u nacrtu.

| PR | HEAD | `pr-intake` presjek | Napomena |
| --- | --- | --- | --- |
| #367 | `6cb58947b6b3e9de62898c6cc298a694df952fad` | 29 zelenih, 3 crvene Netlify rule provjere, 3 u tijeku | 115/115 ciljanih lokalnih testova, lint, orphan-scan, tsc i statički build/verifier prolaze. Lokalni verifier prijavljuje zastarjeli proof `9eaefcf46648`, `projections=fail`, `extraction=unavailable` i `captchaSiteKey=false`; to nisu prolazi ni release proof. |
| #368 | `d502a6bb70c15e2d412c06bdecacb1b0d9b9700c` | 32 zelene, 3 crvene Netlify rule provjere, 0 u tijeku | Kodne provjere prolaze; pregled limita prikazuje samo zadane vrijednosti iz izvora, ne živo Supabase stanje. |
| #369 | `b35dd432845296270802022c030a707dcce54365` | 25 zelenih, 3 crvene Netlify rule provjere, 6 u tijeku | T48 bilješka više ne tvrdi da OIB nedostaje; mijenja se samo `docs/agents/tasks.json`. |
| #370 | `8c61339454e791e9bc6c0d715006c3cd257c88df` | 32 zelene, 3 crvene Netlify rule provjere, 0 u tijeku | SEO paket je zaseban draft i nije jedan od tri imenovana beta paketa. Odluka hoće li ući u beta kandidata nije zabilježena. |

Sva četiri PR-a ostaju draftovi prema `master` na bazi `f758ba2bde00c7f2d37daa789a39ed1e4168db99`. Netlify Deploy Preview zasebno pada na svakom; tri prikazana crvena rule statusa pripadaju istim neuspjelim previewima. Za #367 i #369 dio GitHub provjera još se izvršava. Supabase Preview i `postgres-smoke` preskočeni su gdje su prikazani. Nijedan PR nema neovisan pregled drugog providera.

U #367 je `TERMS_VERSION` podignut na `2026-10-16`, uz očuvani kanonski checkout tekst. Statičke pravne stranice i Supabase `repair-docx` moraju se objaviti zajedno. U #367 i #369 lokalni opisi sada odgovaraju točnom diffu; za #367 i #369 dio provjera se zato ponovno izvršava.

Vlasnik još treba odabrati koji se paketi uključuju, razriješiti planirani datum prema Linearovu roku, potvrditi staging Turnstile token i Supabase Auth testove, provjeriti žive limite popravaka i troškovne alarme, očitati Supabase email limit, zatim proći glavni tok s 2–3 rada. Nepoznato stanje ostaje NO-GO. Tek nakon odabira i zamrzavanja točnog kandidata slijede jedan puni Windows `release:check`, obvezne Word provjere, jedan novi release proof, jedna produkcijska objava i strogi smoke.

**Odluka ostaje HOLD.** Nije bilo spajanja, Supabase izmjena ni produkcijske objave.

## Svježa staging provjera — 16. listopada 2026., 00:56 UTC

Na čistom PR #367 worktreeju, HEAD `296b26a91d49bdd7f1598c6e10a08f8a868936bb`, pokrenut je samo
`node scripts/extraction-probe.mjs` s `LEKTA_STAGING_ORIGIN=https://bnyemcnsphlitjradrst.supabase.co`.
Supabase konektor potvrđuje da je projekt `Lekta staging` (`bnyemcnsphlitjradrst`)
`ACTIVE_HEALTHY`. Probe je poslao 40 GET zahtjeva, dobio 7 različitih HTTP 200 profila, nije dosegao
rate-limit u tom uzorku i nije našao evidence markere. Skripta je završila kodom 0: njezin prag je
manje od 25 različitih profila unutar tvrdog capa od 40 zahtjeva. Ovo je svježa, usko ograničena
staging provjera; ne mijenja `RELEASE_PROOF.json` i nije puni `release:check`.

Javni `https://lekta-staging.netlify.app/build-info.json` vraća HTTP 200, SHA
`f758ba2bde00c7f2d37daa789a39ed1e4168db99` i `captchaSiteKey=true`. Popis naziva GitHub Actions
varijabli pokazuje `TURNSTILE_SITE_KEY` u `staging`, ali ne i u `production`. Produkcijski
`https://lekta.hr/build-info.json` i dalje vraća isti SHA s `captchaSiteKey=false`. To ne dokazuje
Supabase Auth CAPTCHA postavku: staging token u pregledniku, uključivanje Auth zaštite, negativni
signup/OTP testovi bez tokena i pozitivni tokovi ostaju neprovjereni. Nije čitan ni mijenjan secret.

Produkcijska `/privatnost.html` vraća HTTP 200, sadrži Turnstile, a ne sadrži potvrđeni OIB ni telefon
iz PR-a #367; pravni sadržaj zato još nije objavljen. GitHub issue #318 ostaje otvoren. PR #319 je
spojen u `4911855f066b85fe555cc0a2b239726fec06852a`, no nema zabilježenog neovisnog pregleda; issue
se ne zatvara samo na temelju ovog izvještaja.

Upravo osvježene GitHub provjere: #367 ima 23 uspješne, 6 u tijeku, 2 preskočene i 4 neuspješne
(sva četiri vode na isti Netlify Deploy Preview); #368 ima 30 uspješnih, 2 preskočene i 4
neuspješne; #369 ima 29 uspješnih, 1 u tijeku, 2 preskočene i 4 neuspješne; #370 ima 30
uspješnih, 2 preskočene i 4 neuspješne. Četiri neuspjeha na svakom su `netlify/lektahr/deploy-preview`
i povezani Header/Pages/Redirect statusi; detaljni log za #367 potvrđuje da strogi preview odbija
zastarjeli proof prije objave previewja. To nisu produkcijska objava ni kvar živog mastera.

Linear DAN-11/T81 je i dalje `Backlog` s rokom 19.10.2026.; DAN-14/T89 je `In Progress`, a DAN-9/T72
je `Done` za raniji dokaz, ne za budući kombinirani kandidat. **Odluka ostaje HOLD.** Staging probe
je sada potvrđen; CAPTCHA Auth testovi, živi limiti i alarmi, e-mail limit, vlasnikov odabir paketa
i ručni prolaz 2–3 rada i dalje su otvoreni. Nema spajanja, Supabase izmjena ni produkcijske objave.

## Svježa produkcijska provjera — 16. listopada 2026., 02:08 UTC

Javni `GET https://lekta.hr/build-info.json` vraća HTTP 200, commit
`f758ba2bde00c7f2d37daa789a39ed1e4168db99` i `captchaSiteKey=false`.

Preflight `OPTIONS` na produkcijskom `faculty-request` vraća
`Access-Control-Allow-Origin: *` i za `Origin: https://lekta.hr` i za
`Origin: https://evil.example`. To ne zadovoljava očekivani allowlist za betu.

Supabaseov katalog navodi svih 10 ciljanih IP-zaštićenih funkcija kao aktivne na stagingu:
`analytics-event`, `client-error`, `faculty-request`, `generate-report`, `integrity-check`,
`preflight-start`, `profile-rules`, `redeem-referral-signup`, `repair-docx` i `source-check`.
U produkcijskom katalogu nedostaju `client-error`, `integrity-check` i `preflight-start`.
Katalog potvrđuje prisutnost i status, ne ponašanje koda za svaku funkciju.

Linear DAN-8/T49 i DAN-12/T84 su `In Progress`; nijedna produkcijska Supabase postavka nije
mijenjana. T49 ostaje otvoren dok se ne provjere slanje i odgovor support e-pošte te živi Auth
limit. T84 ostaje otvoren zbog produkcijskog CORS-a i triju nedostajućih funkcija. **Odluka ostaje
HOLD; nema spajanja ni produkcijske objave.**

## Usklađenje ovisnosti — 16. listopada 2026., 02:12 UTC

Ponovna provjera Linearove veze pokazala je da DAN-12/T84 ovisi o DAN-5/T18, koji je `In Review`,
ali nije `Done`. Zato je DAN-12 vraćen na `Backlog` s oznakom `Blocked`, a red zadataka sada
zapisuje T18 kao T84 preduvjet. T49/DAN-8 ostaje `In Progress`. Ovo je promjena statusa i reda
zadataka, ne produkcijska promjena. **Odluka ostaje HOLD.**

## Svježa CORS usporedba — 16. listopada 2026., 02:23 UTC

Read-only `OPTIONS` na `faculty-request` uz `Access-Control-Request-Method: POST`:

| Okruženje | `Origin` | Rezultat |
| --- | --- | --- |
| Staging | `https://lekta-staging.netlify.app` | HTTP 200; `Access-Control-Allow-Origin` točno odgovara originu |
| Staging | `https://lekta.hr` | HTTP 200; `Access-Control-Allow-Origin` izostaje |
| Staging | `https://evil.example` | HTTP 200; `Access-Control-Allow-Origin` izostaje |
| Produkcija | `https://lekta.hr` | HTTP 200; `Access-Control-Allow-Origin: *` |
| Produkcija | `https://lektahr.netlify.app` | HTTP 200; `Access-Control-Allow-Origin: *` |
| Produkcija | `https://evil.example` | HTTP 200; `Access-Control-Allow-Origin: *` |

Ovo potvrđuje da staging dopušta samo svoj testni origin, dok produkcijska funkcija još vraća wildcard.
Provjera mjeri samo preflight/CORS zaglavlja; ne potvrđuje autorizaciju, ponašanje POST rukovatelja ni
potpunu sigurnost endpointa. Nije bilo promjena Supabase postavki niti produkcijske objave; T84 ostaje
otvoren i beta odluka ostaje **HOLD**.

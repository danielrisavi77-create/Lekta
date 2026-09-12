# LEKTA - Implementation Plan: pouzdana provjera, popravak i revizije rada

> **For agentic workers:** Use `superpowers:executing-plans` to implement this plan task-by-task. Koristi potvrdne kućice za praćenje. Prvo pročitaj ugovorenu specifikaciju u ovom dokumentu i aktualne `AGENTS.md` / `CLAUDE.md`. Ovaj dokument nije potvrda da su zadaci izvedeni.

**Goal:** Omogućiti da korisnik odabere rad i odgovarajuća pravila, razumije nalaze, dobije provjerenu popravljenu kopiju te kroz nove verzije pouzdano prati što je riješeno i što još zahtijeva rad.

**Architecture:** Zadržati postojeći analizator, DOCX mehanizme, prikaz dokumenta i serverske zaštite. Dovršiti njihovo povezivanje kroz jedinstveno stanje korisničkog toka; izdvajati odgovornosti postupno, uz postojeće regresijske provjere. Praćenje nalaza kroz verzije i rad s mentorovim komentarima isporučiti kao odvojene nadogradnje nakon stabilizacije osnovnog toka.

**Tech Stack:** Postojeći Vite, TypeScript, Vitest, Playwright, DOCX/OOXML obrada, lokalna pohrana/IndexedDB, Supabase Edge Functions i PostgreSQL. `package.json` pregledane verzije zahtijeva Node >=20; postojeći CI provjerava Node 20 i 24. Ne mijenjati tehnološki skup radi ovog plana.

**Spec:** Odjeljak „1. Ugovorena specifikacija” u ovom dokumentu; samodostatan opis cilja i ograničenja. Plan uključuje pet podplanova koji se mogu zasebno pregledati i isporučiti.

**Polazište:** audit od 8. rujna 2026., repo [danielrisavi77-create/Lekta](https://github.com/danielrisavi77-create/Lekta), commit `3c1af21b0808f8cc1ec68b5f4ec813f4d40d65db`. Putanje označene kao postojeće provjerene su na tom snapshotu. Prije izvedbe usporediti aktualno stanje; već ispravljene nalaze zatvoriti dokazom, bez ponovne implementacije.

**Status:** plan pripremljen; razvojni zadaci nisu izvršeni. Brojke iz audita nisu rezultati buduće implementacije.

## Global Constraints

- Besplatna lokalna analiza zadržava postojeću granicu privatnosti. Sadržaj dokumenta ne slati u analitiku.
- Izvornik ostaje dostupan. Svaki popravak stvara zasebnu kopiju.
- Korisnički odabir zahvata ne smije zaobići serversku validaciju parametara i prava pristupa.
- Ručna potvrda ili zanemarivanje nalaza ne povećava automatsku ocjenu.
- Ne obećavati spremnost za predaju na temelju same ocjene. Prikazati opseg i neprovjerene stavke.
- Ne izmišljati lokaciju nalaza, izvor pravila, dokaz testiranja ili potvrdu mentorove sadržajne primjedbe.
- Ne brisati zaštitne testove, ne ublažavati kriterije i ne regenerirati golden očekivanja samo radi zelenog statusa.
- Sačuvati postojeću zaštitu sadržaja, DOCX integriteta, ponavljanja zahtjeva, prava pristupa i privola.
- Ne uvoditi novu UI biblioteku, novi sustav naplate ili paralelni analizator.
- Za svaki zahvat pokrenuti relevantne provjere; širi skup koristiti kada promjena zahvaća zajednički ugovor ili kada ga traže pravila repozitorija.
- Testovi Worda i Deno provjere zahtijevaju odgovarajuće okruženje. Nedostupna provjera bilježi se kao neizvedena, nikad kao prolaz.
- Podatke realnog korpusa držati u odobrenom privatnom spremištu. U javni repozitorij stavljati samo dopuštene sintetičke primjere i rezultate bez osjetljivog sadržaja.
- Komentari i tekst sučelja trebaju biti jasni, na hrvatskom i usklađeni s postojećim vizualnim smjerom.

## 1. Ugovorena specifikacija

### 1.1 Korisnički tok

| Korak | Obvezan rezultat |
| --- | --- |
| Dokument | Korisnik vidi naziv i stanje učitanog dokumenta; ne mora ponovno otvarati učitavanje. |
| Profil | Potvrđuje ustanovu, studij, vrstu rada i razumije razinu dokaza iza pravila. |
| Nalazi | Vidi prioritet, izmjereno stanje, očekivanje, izvor i primjenjivu radnju. |
| Plan | Može stvarno odabrati podržane zahvate; uvjetni zahvati zahtijevaju jasnu odluku. |
| Izvršenje | Razumije obradu i privolu; prekid ili ponavljanje ne stvara dvosmislen status. |
| Provjera izlaza | Razlikuje riješeno, neriješeno, neprimijenjeno i novo pogoršanje. |
| Preuzimanje | Dobiva valjanu kopiju i popis preostalih zadataka; izvornik je dostupan. |

### 1.2 Što zadržati i što nadograditi

| Postojeći dio | Odluka |
| --- | --- |
| Lokalna analiza i Worker | Zadržati; nove događaje i tokove vezati uz postojeći rezultat. |
| DOCX popravci, autoritet parametara i integritet | Zadržati i proširivati provjeru stvarnog učinka. |
| Korektorski stol i plan popravka | Dovršiti interakcije i vezu s izvršenjem. |
| Usporedba prije/poslije popravka | Koristiti postojeću implementaciju; ne graditi novu tekstualnu usporedbu. |
| Povijest provjera i grupiranje dokumenata | Nadograditi usporedbom konkretnih nalaza između verzija. |
| Prepoznavanje Word komentara | Nadograditi korisničkim popisom mentorovih zadataka. |
| PDF i predajni paket | Sačuvati; nova završna poruka mora razlikovati DOCX provjeru od provjere cijelog paketa. |

### 1.3 Potvrđeni nalazi koji određuju prioritet

1. Provjera release dokaza prihvaćala je nepoznatu Git usporedbu kao da relevantnih promjena nema. Reproducirano s nedostupnim objektom starog commita.
2. Radnja popravka otkrivala je unutarnje detalje, ali ostavljala nadređeni prikaz skrivenim. Opaženo u javnoj aplikaciji i povezano s kodom.
3. Javni ulazak u radni prostor razlikovao se od pregledanog mastera. Uzrok na hostingu nije dokazan.
4. Dokazi profila imaju različitu snagu. U indeksu 407 profila: A31, B293, C8, D34, E41. Od A31, 12 je izravno navedeno u attestaciji, 19 nasljeđuje dokaz po ustanovi i vrsti rada.
5. Puni dependency audit imao je 23 high/critical nalaza, dok je produkcijski audit imao 0. Puni audit nije blokirao CI.
6. `repair-docx` parsira multipart prije konačne provjere veličine datoteke; ukupan broj bajtova treba ograničiti prije parsiranja.

Ovo su nalazi polaznog audita. Zadatak T00 provjerava vrijede li još.

### 1.4 Mjerila kvalitete

- **Točnost nalaza:** udio prijavljenih problema koje neovisni pregled potvrđuje.
- **Propušteni problemi:** poznati problemi realnog korpusa koje provjera nije prepoznala.
- **Učinak popravka:** odabrani, podržani i potvrđeni problemi koji su stvarno riješeni.
- **Regresije:** ranije ispravne provjere koje su nakon zahvata postale neispravne.
- **Očuvanje:** valjanost paketa i neovlaštene promjene zaštićenog sadržaja.
- **Uspjeh toka:** korisnik završi posao i može objasniti što je popravljeno i što je ostalo.

Poznato oštećenje dokumenta ili neobjašnjena regresija blokira izdavanje pogođenog zahvata. Nula pogrešaka u testnom skupu ne predstavlja univerzalno jamstvo. Brojčane pragove točnosti postaviti nakon početnog neovisnog mjerenja po pravilu i ozbiljnosti.

## 2. Podplanovi, ovisnosti i redoslijed

| Podplan | Zadaci | Ovisnosti | Isporuka |
| --- | --- | --- | --- |
| A - pouzdana objava i ulazak | T00-T04 | Početak | Dokaziva objava i prolazan produkcijski tok do plana. |
| B - kvaliteta pravila i sigurnost obrade | T05-T07 | T00 | Jasna razina dokaza, realni ciljevi popravka, ograničen ulaz. |
| C - jedinstven plan i završetak popravka | T08-T10 | T01-T03, T05-T07 | Dosljedan odabir, izvršenje, provjera i preuzimanje. |
| D - praćenje nalaza kroz verzije | T11-T12 | T05, T08-T10 | Usporedba stvarno riješenih, postojećih i novih problema. |
| E - mentorovi zadaci i korisnička provjera | T13-T15 | T09-T12 | Pilot komentara, mjerenje toka i završna procjena spremnosti. |

T04 i T07 mogu imati zasebne PR-ove; nisu razlog za miješanje sigurnosnih nadogradnji s vizualnim promjenama. Podplanovi A-C čine prvi ciklus stabilizacije. D i E su zasebne funkcionalne isporuke. Osnovne korisničke zadatke 1-3 iz T15 provesti već nakon T10; zadatke 4-5 dodati tek kada pripadajuće funkcije postoje.

## 3. Mapa datoteka

### Postojeće datoteke i odgovornosti

| Putanja | Uloga |
| --- | --- |
| `scripts/verify-deploy-dist.mjs` | Provjera distribucije i release dokaza. |
| `scripts/release-check.mjs` | Generiranje i koordinacija dokaza provjera. |
| `scripts/generate-deploy-manifest.mjs` | Postojeći identitet objave; prvo provjeriti što već pokriva. |
| `netlify.toml` | Stvarni produkcijski lanac izgradnje. |
| `playwright.config.ts` | Trenutno pokretanje UX testova na razvojnom poslužitelju. |
| `scripts/post-deploy-smoke.mjs` | Postojeće provjere javne objave. |
| `src/ui/app.ts` | Orkestracija prikaza, nalaza i prijelaza prema popravku. |
| `src/ui/repair-panel.ts` | Odabir i postojeći tok izvršenja popravka. |
| `src/routes/workspace/main.ts` | Ulazak u radni prostor. |
| `src/routes/workspace/workspace-state.ts` | Postojeći model stanja radnog prostora. |
| `src/session/local-document-session.ts` | Ugovor lokalne sesije dokumenta. |
| `src/session/indexeddb-document-session-store.ts` | Postojeća lokalna pohrana dokumenta. |
| `src/ui/results/desk-mount.ts` | Povezivanje interakcija korektorskog stola. |
| `src/ui/results/repair-plan.ts` | Model plana popravka. |
| `src/ui/results/repair-plan-view.ts` | Prikaz plana i oznaka odabira. |
| `src/ui/finding-view-model.ts` | Korisnički model nalaza. |
| `src/ui/repair-diff-model.ts` | Postojeće poravnanje odlomaka i tekstualna razlika. |
| `src/history/progress.ts` | Grupiranje revizija i napredak ocjene. |
| `src/fingerprint/fingerprint.ts` | Postojeće povezivanje identiteta dokumenta. |
| `src/analysis/final-document-inspector.ts` | Pregled komentara, revizija i metapodataka. |
| `src/ui/telemetry.ts` | Događaji uz privolu i ograničene atribute. |
| `src/verification/real-corpus-attestation.ts` | Primjena dokaza realnog korpusa. |
| `tests/real-corpus/harness.ts` | Provjera učinka i regresija na korpusu. |
| `supabase/functions/repair-docx/index.ts` | Serverski ulaz u popravak. |
| `supabase/functions/_shared/read-body.ts` | Postojeći pomoćni kod ograničenog čitanja. |

### Predložene nove datoteke

Nove putanje u zadacima predstavljaju prijedlog granice odgovornosti. Ako aktualni kod već ima ekvivalentan modul, koristiti njega i zabilježiti mapiranje u završnom izvještaju. Ne ostavljati dvije implementacije istog posla.

## 4. Zajednički način izvođenja zadataka

Za svaki kodni zadatak:

- [ ] Potvrditi postojeći tok, relevantne zaštite i reprodukciju na aktualnoj grani.
- [ ] Dodati najmanji smisleni regresijski test za korisnički ishod ili javni ugovor.
- [ ] Pokrenuti ga prije promjene i potvrditi očekivani razlog pada.
- [ ] Napraviti minimalnu promjenu; ne popravljati nepovezane module u istom zahvatu.
- [ ] Pokrenuti ciljane testove i propisane zaštite zahvaćenog područja.
- [ ] Pregledati diff, ažurirati povezanu dokumentaciju i napraviti zaseban commit kada razvojni način rada to predviđa.
- [ ] Zapisati dokaz, ograničenja i status kriterija prihvaćanja.

Kod u zadacima definira predložene testne ugovore i primjere očekivanog ponašanja. Nije tvrdnja da predloženi novi API-ji već postoje. Njihova implementacija pripada označenom zadatku.

## Podplan A - pouzdana objava i ulazak

### T00 - Potvrdi polazište i napravi kartu već riješenih nalaza

**Prioritet:** P1. **Datoteke:** pročitati `AGENTS.md`, `CLAUDE.md`, `package.json`, `netlify.toml` i datoteke iz T01-T03. **Novi zapis:** `docs/quality/lekta-plan-status.md`.

- [ ] Zabilježiti HEAD, granu, čistoću radnog stabla i postojeće izmjene drugih autora.
- [ ] Usporediti T01-T03 s aktualnim kodom i objavljenom verzijom. Razlikovati kvar koda od starije objave.
- [ ] Za svaki zadatak otvoriti zapis: ID, status, odgovarajući commit/PR, izvedene provjere, preostala prepreka.
- [ ] Potvrditi dostupnost Nodea, Dena, Playwright preglednika i Word/LibreOffice okruženja. Zabilježiti gdje se izvršava svaka obvezna provjera.

```bash
git status --short
git rev-parse HEAD
git log -5 --oneline
node --version
npm --version
```

**Kriterij prihvaćanja:** svaki polazni nalaz označen kao potvrđen, već riješen ili neprovjeren s razlogom. Već riješen nalaz mora imati dokaz ponašanja, ne samo komentar u kodu.

### T01 - Zatvori prihvaćanje nepoznate Git usporedbe

**Datoteke:** izmijeniti `scripts/verify-deploy-dist.mjs`; dodati `scripts/release-proof-status.mjs` i `tests/release-proof-status.test.ts`; po potrebi prilagoditi `scripts/release-check.mjs`.

**Predloženi ugovor:** `classifyProofChanges(changedFiles: string[] | null): 'unchanged' | 'stale' | 'unknown'`. `null` znači da usporedba nije izvedena. Postojeća provjera potpunosti, datuma i nečistog stabla ostaje zasebna.

```ts
expect(classifyProofChanges(null)).toBe('unknown');
expect(classifyProofChanges([])).toBe('unchanged');
expect(classifyProofChanges(['docs/generated/RELEASE_PROOF.json']))
  .toBe('unchanged');
expect(classifyProofChanges(['src/ui/app.ts'])).toBe('stale');
```

- [ ] Testirati plitki klon bez objekta dokaznog commita i puni klon s istom relevantnom promjenom. Oba moraju odbiti nevaljanu objavu.
- [ ] Izdvojiti klasifikaciju; grešku Git poziva pretvoriti u `unknown`.
- [ ] U obveznom načinu blokirati `unknown` i `stale`; blokirati nedostajuće ili nevaljane identifikatore.
- [ ] Za Git naredbu koristiti argumente procesa umjesto interpolacije vrijednosti iz JSON-a u shell string.
- [ ] Sačuvati dopuštenu promjenu samo datoteke dokaza; ne rješavati problem zahtjevom da proof commit uvijek mora biti identičan HEAD-u.
- [ ] Provjeriti cijelu CLI putanju i izlazne kodove, uz postojeće provjere starosti i potpunosti.

**Provjera:** `npx vitest run tests/release-proof-status.test.ts tests/release-tiers.test.ts` i CLI test distribucije s obveznim dokazom.

**Kriterij prihvaćanja:** dubina klona ne može pretvoriti neprovjerenu objavu u valjanu; nepoznat rezultat ima razumljivu poruku i ne-nulti izlazni kod.

### T02 - Otvori sve slojeve prikaza pri pozivu popravka

**Datoteke:** `src/ui/app.ts`, `src/ui/results/desk-mount.ts`; dodati `tests/ux/repair-entry-visible.spec.ts`.

**Ugovor:** sve postojeće akcije koje vode na popravak otvaraju nadređeni prikaz, unutarnje detalje i odgovarajući panel te fokusiraju vidljivu kontrolu. Ne izvršavaju serverski popravak bez postojećih uvjeta.

- [ ] Reproducirati klik iz novog rezultata sa zatvorenim detaljima.
- [ ] U zajedničkoj funkciji prijelaza pozvati postojeći mehanizam otvaranja nadređenog prikaza prije pomicanja i fokusiranja.
- [ ] Pokriti opću akciju, akciju konkretnog nalaza i akciju iz novog plana.
- [ ] Za nalaz bez ponuđenog zahvata prikazati objašnjenje; ne fokusirati nepovezani zahvat.

Uvesti stabilne testne oznake `repair-entry` i `repair-workflow` na stvarne vidljive elemente. Test nakon analize mora izvesti korisnički klik:

```ts
await page.getByTestId('repair-entry').click();
await expect(page.getByTestId('repair-workflow')).toBeVisible();
await expect(page.getByTestId('repair-workflow')).toContainText('poprav');
```

Ne otvarati detalje unaprijed u testnom setupu: time bi se zaobišao upravo testirani kvar. Pripremu analize preuzeti iz postojećih UX testova.

**Provjera:** `npx playwright test tests/ux/repair-entry-visible.spec.ts --project=chromium --project=mobile-chromium`.

**Kriterij prihvaćanja:** sve tri ulazne akcije otkrivaju nastavak i čuvaju ispravan odabir; prolaze miš, tipkovnica i mobilni prikaz.

### T03 - Testiraj stvarni produkcijski artefakt od početne stranice

**Datoteke:** `playwright.config.ts`, `netlify.toml`, `scripts/generate-deploy-manifest.mjs`, `scripts/post-deploy-smoke.mjs`, `src/routes/workspace/main.ts`; novi `scripts/build-production.mjs` i `tests/ux/production-journey.spec.ts`; `.github/workflows/check.yml` ako je to aktualni vlasnik build/UX jobova, inače odgovarajući postojeći workflow.

**Ugovor:** jedna naredba izgradnje proizvodi isti sadržaj za CI i hosting. Predloženi novi način `LEKTA_UX_MODE=production` koristi taj build i `vite preview`; zadani razvojni način ostaje dostupan.

- [ ] Provjeriti stvarni lanac u `netlify.toml` i prenijeti ga bez gubitka postojećih generatora.
- [ ] U zajednički build uključiti Vite i postojeće generatore citatnih, pravnih, pokrivenosti, fakultetskih, naslovničkih i usporednih stranica.
- [ ] Pozvati postojeću provjeru distribucije. U release kontekstu zadržati obvezni dokaz; ne isključivati ga da bi UX test prošao.
- [ ] Nadograditi postojeći manifest identitetom artefakta i pravila samo ondje gdje ti podaci već nisu prisutni.
- [ ] Početi E2E na `/`, odabrati sintetički DOCX, potvrditi profil, analizirati i otvoriti plan. Ne počinjati izravno na `/rad/`.
- [ ] Provjeriti da radni prostor odmah pokazuje učitani dokument bez ponovnog marketinškog uvoda.
- [ ] Dodati javnu provjeru identiteta objave i lokalni sintetički tok nakon deploya. Serversku mutaciju testirati u kontroliranom okruženju.

Predložene testne oznake: `document-profile`, `analysis-results`, `repair-entry`, `repair-workflow`. Primjer završnih očekivanja:

```ts
await expect(page.getByTestId('document-profile')).toBeVisible();
// Nakon korisnikove potvrde profila i završetka postojeće analize:
await expect(page.getByTestId('analysis-results')).toBeVisible();
await page.getByTestId('repair-entry').click();
await expect(page.getByTestId('repair-workflow')).toBeVisible();
```

**Nova naredba nakon implementacije:** `LEKTA_UX_MODE=production npx playwright test tests/ux/production-journey.spec.ts --project=chromium`.

**Kriterij prihvaćanja:** CI i hosting koriste isti build lanac; provjera može navesti koji je artefakt testiran i koji je objavljen; korisnički tok prolazi na produkcijskom artefaktu.

### T04 - Saniraj visokorizične ovisnosti alata

**Datoteke:** `package.json`, `package-lock.json`, `.github/workflows/security-audit.yml`; novi zapis `docs/quality/dependency-decisions.md`.

- [ ] Pokrenuti aktualni audit i razlikovati izravne/transitivne nalaze, runtime i alate. Ne koristiti stare brojke iz komentara.
- [ ] Za svaki high/critical nalaz navesti roditeljsku ovisnost, izvršava li se u CI-ju i postoji li kompatibilna nadogradnja.
- [ ] Nadograđivati po jednoj povezanoj skupini. Izbjegavati slijepi `npm audit fix --force`.
- [ ] Alate koji nisu potrebni za build razdvojiti samo ako se time ne prekidaju postojeći deploy postupci.
- [ ] Svaka privremena iznimka mora imati identifikator nalaza, razlog, vlasnika i datum isteka; neprihvaćeni nalaz blokira CI.

```bash
npm audit --omit=dev --audit-level=high
npm audit --audit-level=high
npm run check
```

**Kriterij prihvaćanja:** nema neprihvaćenih high/critical nalaza; postojeći testovi i build rade na podržanim verzijama Nodea. Ne prikazivati prihvaćenu iznimku kao uklonjenu ranjivost.

## Podplan B - kvaliteta pravila i sigurnost obrade

### T05 - Učini podrijetlo dokaza profila eksplicitnim

**Datoteke:** `src/verification/real-corpus-attestation.ts`, `src/profiles/evidence-projection.ts`, `tests/real-corpus-attestation.test.ts`; pregledati `data/profiles/profile-claims.json` i generator `scripts/gen-profile-claims.mts`.

**Novi ugovor projekcije:** `evidenceBasis: 'direct' | 'inherited' | 'synthetic' | 'not-demonstrated'`, uz ID dokaza, verziju i izravno testirane profile. Razina A-E ostaje odvojena dimenzija; ne mijenjati postojeću politiku automatski bez evidencije posljedica.

- [ ] Za izravni dokaz zahtijevati prisutnost točnog profila u attestaciji.
- [ ] Naslijeđeni dokaz prikazati s osnovom prenošenja i profilima na kojima je mjeren.
- [ ] Za B prikazati generirani dokument; za C/D/E objasniti stvarne granice provjere i popravka.
- [ ] Ažurirati projekcije preko postojećeg generatora, bez ručnog uređivanja generiranih brojki.
- [ ] Na kartici profila i u rezultatu prikazati istu projekciju.

Primjer ugovornog očekivanja nad fixtureom s jednim izravnim i jednim povezanim profilom:

```ts
expect(directProjection.evidenceBasis).toBe('direct');
expect(inheritedProjection.evidenceBasis).toBe('inherited');
expect(inheritedProjection.testedProfileIds).not.toContain(inheritedProfileId);
```

Varijable u testu sastaviti iz postojećih fixturea attestacije; `testedProfileIds` je novo eksplicitno polje projekcije.

**Provjera:** `npx vitest run tests/real-corpus-attestation.test.ts` i provjere generatora tvrdnji.

**Kriterij prihvaćanja:** dva profila s različitom osnovom dokaza ne prikazuju se kao da su oba izravno testirana.

### T06 - Izmjeri stvarni učinak popravka na realnom korpusu

**Datoteke:** `tests/real-corpus/harness.ts`, `tests/real-corpus/corpus-track.ts`, `scripts/repair-real-corpus.mts`, `tests/real-corpus-vacuity.test.ts`; novi `docs/quality/real-corpus-protocol.md`.

**Ugovor:** svaki uključeni slučaj ima dopušten izvor, profil/verziju pravila, unaprijed označene probleme, odabrane zahvate, očekivane rezultate i zaštićene elemente. Sažetak razlikuje regresijsku zaštitu od ciljane djelotvornosti.

- [ ] Odabrati 5-10 prioritetnih profila prema korištenju, kvaliteti izvora i dostupnim dokumentima; zabilježiti obrazloženje izbora.
- [ ] Uključiti ispravne kontrole, pojedinačne pogreške, kombinacije i složene dokumente različitog podrijetla.
- [ ] Neovisno potvrditi očekivanja prije izvođenja popravka. Dio dokumenata izdvojiti za završnu provjeru.
- [ ] Za svaki zahvat razlikovati: primijenjen, riješen, neriješen, preskočen zbog nepodržane strukture i regresija.
- [ ] Uvesti kontrolu da ciljna metrika nije valjana kada nema ciljanih provjera.
- [ ] Provjeriti izlaz u odgovarajućem Word/LibreOffice okruženju i sačuvati verziju tog okruženja.

Primjer uvjeta nad sažetkom postojećeg harnessa:

```ts
expect(summary.targetedCheckCount).toBeGreaterThan(0);
expect(summary.targetedResolvedCount).toBeLessThanOrEqual(summary.targetedCheckCount);
expect(summary.integrityFailureCount).toBe(0);
expect(summary.passRegressionCount).toBe(0);
```

Očekivanje `targetedCheckCount > 0` pripada skupu koji tvrdi da mjeri djelotvornost; ne nametati ga odvojenom, legitimnom skupu za očuvanje integriteta.

**Provjere:** `npm run repair-real-corpus`, `npm run conformance`, `npm run test:slow` kada su zahvaćeni popravci, te relevantne `verify:word` / `verify:strict-open:repaired` provjere.

**Kriterij prihvaćanja:** izvještaj omogućuje povezivanje zaključka s konkretnim profilom, pravilom, dokumentom i verzijom koda; nema poznatih neobjašnjenih regresija ili oštećenja u release skupu.

### T07 - Ograniči cijelo tijelo zahtjeva prije multipart parsiranja

**Datoteke:** `supabase/functions/repair-docx/index.ts`, `supabase/functions/_shared/read-body.ts`; predloženi novi `supabase/functions/_shared/read-limited-bytes.ts` i `supabase/functions/_shared/read-limited-bytes.test.ts`.

**Novi ugovor:** `readLimitedBytes(request: Request, maxBytes: number): Promise<Uint8Array>`. Funkcija broji stvarno primljene bajtove, prekida čitanje preko limita i baca prepoznatljivu grešku za HTTP 413. `Content-Length` je rana optimizacija, ne jedina kontrola.

- [ ] Iz postojećeg DOCX limita izvesti dokumentirani ukupni limit; posebno ograničiti `meta` i broj multipart dijelova.
- [ ] Primijeniti ograničeno čitanje prije parsiranja. Izbjegavati nepotrebne kopije velikog buffera.
- [ ] Zadržati provjeru veličine same datoteke, ZIP zaštite, autentifikaciju i ograničenje istodobnosti.
- [ ] Osigurati oslobađanje zauzetih resursa i slotova na svim izlazima.
- [ ] Testirati nedostajući `Content-Length`, pogrešan deklarirani broj, tijelo na granici, tijelo preko granice, dodatne dijelove i velik `meta`.

Primjer Deno provjere:

```ts
const request = new Request('https://example.invalid/repair', {
  method: 'POST', body: new Uint8Array(1025),
});
await assertRejects(() => readLimitedBytes(request, 1024));
```

Dodati i stream fixture koji bilježi otkazivanje čitanja; sama provjera da funkcija baca nakon potpunog čitanja nije dovoljna.

**Provjera:** `deno test supabase/functions/_shared/read-limited-bytes.test.ts`, `npm run check:edge` i kontrolirani test odgovora endpointa na prevelik zahtjev.

**Kriterij prihvaćanja:** limit vrijedi i bez zaglavlja; preveliko tijelo prekida se tijekom čitanja; nema zauzetog slota nakon odbijanja.

## Podplan C - jedinstven plan i završetak popravka

### T08 - Izdvoji upravljanje tokom uz očuvanje postojećih ugovora

**Datoteke:** `src/ui/app.ts`, `src/ui/repair-panel.ts`, `src/routes/workspace/workspace-state.ts`; novi `src/repair/workflow-controller.ts` i `tests/repair-workflow-controller.test.ts`.

**Granica:** kontroler upravlja odabirom, statusom i prijelazima. Postojeći servis i server i dalje provode stvarni popravak, validaciju i naplatu. Koristiti postojeće tipove zahtjeva i rezultata kroz adapter; ne stvarati drugi serverski protokol.

Predloženi minimalni javni statusi:

```ts
type RepairPhase = 'idle' | 'planning' | 'ready' | 'running'
  | 'verifying' | 'complete' | 'failed';
type RepairSelection = ReadonlySet<string>; // postojeći identifikatori zahvata
```

- [ ] Popisati tko danas mijenja odabir, tko pokreće servis i tko proglašava završetak.
- [ ] Izdvojiti kontroler bez izmjene redoslijeda postojeće obrade.
- [ ] Dopuštati `running` samo iz `ready`; u tijeku izvršenja onemogućiti novo pokretanje istog zahtjeva.
- [ ] Nakon promjene dokumenta ili profila poništiti nevažeći plan i vezati novi uz aktualnu sesiju.
- [ ] Odbaciti zakašnjeli rezultat stare sesije. Povratak na plan ne smije izgubiti valjan odabir.

Primjeri obveznih regresija:

```ts
expect(controller.getState().phase).toBe('ready');
await controller.start();
expect(controller.getState().phase).toBe('complete');
expect(repairServiceCallCount).toBe(1);
```

`getState()` i `start()` su novi API kontrolera; `start()` mora interno sačuvati postojeće provjere privole i prava pristupa. Testni adapter kontrolira završetak i broj poziva.

**Provjera:** novi test kontrolera, postojeći `tests/repair-delivery-order.test.ts`, `tests/repair-param-authority.test.ts` i `tests/workspace-state.test.ts`.

**Kriterij prihvaćanja:** postoji jedan vlasnik odabira i životnog ciklusa; izdvajanje ne mijenja poslovna pravila ili serverski autoritet.

### T09 - Pretvori plan u stvarno upravljiv prikaz

**Datoteke:** `src/ui/results/repair-plan.ts`, `src/ui/results/repair-plan-view.ts`, `src/ui/results/desk-mount.ts`; `tests/repair-plan.test.ts`; novi `tests/ux/repair-plan-selection.spec.ts`.

**Ugovor:** plan koristi odabir kontrolera T08. Informativne oznake zamijeniti stvarnim pristupačnim kontrolama ondje gdje korisnik može odlučivati. Nepodržana radnja nema privid interaktivnosti.

- [ ] Odvojiti sigurne, uvjetne i ručne zadatke.
- [ ] Povezati checkbox s jednim postojećim identifikatorom zahvata i stanjem kontrolera.
- [ ] Skupine poput „Uskladi osnovni tekst” smiju grupirati prikaz, ali zadržavaju odvojena očekivanja i rezultate pojedinih provjera.
- [ ] Uz grupu prikazati uključene zahvate; isključivanje neovisnog zahvata ne smije tiho uključiti drugi.
- [ ] Ovisne zahvate objasniti prije potvrde. Zaključani uvjet mora imati razlog.
- [ ] Prikazati izmjereno/očekivano samo kada te vrijednosti postoje; bez izmišljenih strelica i lokacija.

```ts
await page.getByRole('checkbox', { name: 'Uskladi prored osnovnog teksta' }).uncheck();
await page.getByTestId('repair-plan-continue').click();
await expect(page.getByTestId('repair-selected-summary')).not.toContainText('Uskladi prored');
```

`repair-plan-continue` i `repair-selected-summary` su nove testne oznake; stvarni naziv kontrole vezati uz postojeću hrvatsku oznaku zahvata. Test treba koristiti fixture u kojem je taj zahvat stvarno ponuđen.

**Kriterij prihvaćanja:** odabir je isti u planu i prije slanja; tipkovnica radi; ručno potvrđivanje ne mijenja automatski rezultat; na mobilnom je glavna radnja dostupna bez otvaranja skrivenih detalja.

### T10 - Poveži završni prikaz s provjerenim ishodom i oporavkom

**Datoteke:** `src/ui/repair-panel.ts`, `src/ui/repair-diff.ts`, `src/ui/repair-diff-model.ts`, `src/report/repair-history.ts`; novi `src/repair/repair-outcome.ts`, `tests/repair-outcome.test.ts` i `tests/ux/repair-recovery.spec.ts`.

**Novi ugovor:** `buildRepairOutcome(input)` vraća brojeve i identifikatore riješenih, neriješenih, preskočenih i regresiranih odabranih provjera, uz zaseban status integriteta. Ulaz je postojeći rezultat prije/poslije i stvarni zapis izvršenja. Ne izvoditi uspjeh samo iz povećanja ocjene.

```ts
type VerifiedCheck = { id: string; status: 'pass' | 'fail' | 'unmeasurable' };
type RepairOutcomeInput = {
  selectedCheckIds: string[];
  before: VerifiedCheck[];
  after: VerifiedCheck[];
  skippedCheckIds: string[];
  integrity: 'passed' | 'failed' | 'not-verified';
};
type RepairOutcome = {
  resolvedIds: string[];
  unresolvedIds: string[];
  skippedIds: string[];
  regressedIds: string[];
  integrity: RepairOutcomeInput['integrity'];
};
// Novi API ovog zadatka:
// buildRepairOutcome(input: RepairOutcomeInput): RepairOutcome
```

Adapter povezuje stvarne odabrane zahvate s provjerama koje trebaju riješiti. Nedostajuća ili neizmjerena provjera ostaje neriješena. Regresije obuhvaćaju sve ranije prolazne provjere, uključujući one izvan odabranog skupa. Broj prikazanih zahvata i broj provjera ne smiju se predstavljati kao ista veličina.

- [ ] Razdvojiti „zahvat izvršen” od „problem riješen”.
- [ ] Sačuvati postojeću usporedbu dokumenta prije i poslije; završni sažetak i diff koriste isti rezultat.
- [ ] Prikazati preostale ručne obveze i opseg provjere predajnog paketa.
- [ ] Pri regresiji slijediti postojeću politiku isporuke; ne preporučivati lošiju kopiju kao uspješnu.
- [ ] Provjeriti prekid mreže prije slanja, nepoznat ishod nakon slanja, odbijena prava pristupa, isteklu poveznicu i ponovni pokušaj.
- [ ] Kod nepoznatog ishoda prvo provjeriti postojeći posao kroz postojeći mehanizam; ne pokretati slijepo drugi naplativi posao.

```ts
expect(outcome.resolvedIds).toContain('target-spacing');
expect(outcome.unresolvedIds).toContain('target-heading');
expect(outcome.regressedIds).toEqual([]);
expect(outcome.integrity).toBe('passed');
```

`target-spacing` i `target-heading` su lokalni testni identifikatori, ne novi produkcijski ID-jevi pravila.

**Kriterij prihvaćanja:** korisnik dobiva točan ishod, izvornik i valjan nastavak nakon greške; kontrolirani test potvrđuje da ponavljanje ne stvara dvostruku potrošnju prava.

## Podplan D - nalazi kroz verzije rada

### T11 - Dodaj usporedbu nalaza dviju revizija

**Datoteke:** `src/history/progress.ts`, `src/fingerprint/fingerprint.ts`, `src/ui/finding-view-model.ts`; novi `src/history/finding-revisions.ts` i `tests/finding-revisions.test.ts`.

**Ugovor:** usporediti dvije analize istog rada i istog ugovora pravila. Postojeće grupiranje i tekstualni diff koristiti kao pomoć; naslov datoteke nije dovoljan dokaz identiteta, a indeks odlomka nije stabilno sidro.

```ts
type RevisionFinding = {
  ruleId: string;
  scopeKey: string | null;
  outcome: 'pass' | 'fail' | 'unmeasurable';
};
type RevisionSnapshot = {
  id: string;
  documentGroupId: string;
  profileId: string;
  rulesFingerprint: string;
  analysisContractVersion: string;
  findings: RevisionFinding[];
};
type RevisionDelta = {
  comparable: boolean;
  resolved: string[];
  persisting: string[];
  introduced: string[];
  uncertain: string[];
};
// Novi API ovog zadatka:
// compareFindingRevisions(before: RevisionSnapshot, after: RevisionSnapshot): RevisionDelta
```

- [ ] Za globalno pravilo koristiti stabilni ključ opsega dokumenta; za lokalne nalaze koristiti pouzdano povezano sidro.
- [ ] Nejednoznačne lokalne nalaze ostaviti u `uncertain`; ne sparivati ih naslijepo po poziciji.
- [ ] Nestanak nalaza smatrati rješenjem samo kada nova provjera potvrđuje odgovarajući prolaz; neizmjereno ili neprimjenjivo nije riješeno.
- [ ] Različit profil, pravila ili ugovor analize vraćaju `comparable: false`; UI objašnjava razlog.
- [ ] Ponavljajući isti naslovi, umetnuti odlomci i premještene sekcije imaju zasebne testne slučajeve.

```ts
expect(compareFindingRevisions(before, after).resolved).toContain('spacing@document');
expect(compareFindingRevisions(before, changedRules).comparable).toBe(false);
expect(compareFindingRevisions(before, unmeasurableAfter).resolved).toEqual([]);
```

Fixturei trebaju potpuno definirati dva snapshot objekta; `spacing@document` je izvedeni testni ključ `ruleId@scopeKey`.

**Kriterij prihvaćanja:** riješeno, ostalo, novo i neizvjesno razdvojeni su bez lažnog napretka pri promjeni pravila ili gubitku mjerenja.

### T12 - Omogući učitavanje nove verzije i prikaz napretka

**Datoteke:** `src/session/local-document-session.ts`, `src/session/indexeddb-document-session-store.ts`, `src/routes/workspace/main.ts`, `src/history/progress.ts`; novi `src/ui/results/revision-summary.ts` i `tests/ux/document-revisions.spec.ts`.

**Ugovor:** pohraniti verzionirane rezultate u postojećoj lokalnoj pohrani; usporedba prve isporuke obuhvaća dvije odabrane verzije. Ne uvoditi novi cloud sinkronizacijski sustav.

- [ ] Dodati radnju „Učitaj novu verziju ovog rada” i pokazati s kojom se analizom uspoređuje.
- [ ] Kod slabog identitetskog podudaranja tražiti potvrdu povezivanja; automatski ne spajati različite radove.
- [ ] Prikazati odvojene skupine riješenih, postojećih, novih i neizvjesnih nalaza.
- [ ] Kod promjene profila/pravila prikazati ograničenje usporedbe; ne prikazivati deltu ocjene kao učinak uređivanja bez objašnjenja.
- [ ] Sačuvati staru pohranu migracijom; slučaj bez potrebnih starih podataka nudi novu početnu točku.
- [ ] Obrisati povezane snapshotove kada korisnik briše lokalni rad; pri popunjenoj kvoti nastaviti analizu uz jasnu poruku da revizija nije spremljena.

```ts
await expect(page.getByTestId('revision-summary')).toContainText('Riješeno');
await expect(page.getByTestId('revision-summary')).toContainText('Novi problemi');
await expect(page.getByTestId('revision-summary')).not.toContainText('Spremno za predaju');
```

Posljednje očekivanje odnosi se na fixture s preostalim blokatorom, ne na univerzalnu zabranu te poruke u drugim kontekstima.

**Provjera:** novi E2E, testovi T11 te postojeći testovi lokalne sesije i fingerprinta.

**Kriterij prihvaćanja:** korisnik može objasniti što se između dviju verzija promijenilo; stara sesija ostaje čitljiva; dokument ne napušta uređaj zbog ove funkcije.

## Podplan E - mentorovi zadaci i korisnička provjera

### T13 - Pretvori postojeće Word komentare u lokalne zadatke

**Datoteke:** `src/analysis/final-document-inspector.ts`; novi `src/mentor/comment-tasks.ts`, `src/ui/results/mentor-tasks.ts`, `tests/comment-tasks.test.ts` i `tests/ux/mentor-tasks.spec.ts`.

**Opseg prve isporuke:** klasični Word komentari s dostupnim tekstom i sidrima. Nepodržane threaded/extended strukture jasno označiti. Bez LLM-a, slanja komentara vanjskim servisima ili automatskog pisanja sadržajnih odgovora.

```ts
type CommentTask = {
  id: string;
  commentId: string;
  text: string;
  authorLabel: string | null;
  anchorKey: string | null;
  linkedFindingIds: string[];
  userStatus: 'open' | 'addressed';
  verification: 'not-verified' | 'formal-check-passed';
};
```

- [ ] Koristiti postojeći OOXML parser i sigurno sastaviti puni tekst komentara; ne koristiti skraćeni XML isječak inspektora kao cijeli komentar.
- [ ] Sačuvati vezu s izvornim komentarom i mjestom. Bez pouzdanog sidra prikazati komentar bez izmišljenog označavanja.
- [ ] Prvu verziju povezivanja s formalnim nalazom dati korisniku na potvrdu.
- [ ] Sadržajni komentar može biti označen obrađenim, ali nema automatsku potvrdu kvalitete sadržaja.
- [ ] Samo povezana formalna provjera koja stvarno prolazi može dati `formal-check-passed`.
- [ ] Sačuvati izvorne komentare u radnoj kopiji; izrada čiste predajne kopije ostaje zasebna postojeća odluka.

```ts
expect(addressedContentTask.userStatus).toBe('addressed');
expect(addressedContentTask.verification).toBe('not-verified');
expect(taskWithMissingAnchor.anchorKey).toBeNull();
```

**Kriterij prihvaćanja:** student vidi izvorni komentar i svoj status rada; sučelje ne tvrdi da je mentorova sadržajna primjedba automatski riješena.

### T14 - Izmjeri tok uz postojeću privolu i ograničene podatke

**Datoteke:** `src/ui/telemetry.ts`, mjesta stvarnih prijelaza iz T08-T13; novi `tests/product-journey-telemetry.test.ts` i `docs/quality/product-metrics.md`.

**Ugovor:** događaji nastaju na stvarnim promjenama stanja. Predložena imena: `document_ready`, `profile_confirmed`, `analysis_completed`, `repair_plan_opened`, `repair_completed`, `repair_download_started`, `revision_compared`. Uskladiti s postojećim događajima da ne nastanu duplikati.

- [ ] Zabilježiti postojeće odgovarajuće događaje i popuniti samo praznine.
- [ ] Koristiti postojeće dopuštene atribute poput profila, vrste rada, kategorije, broja i trajanja. Ne dodavati naslov, autora, naziv datoteke, komentar ili isječak rada.
- [ ] Događaj `repair_completed` vezati uz završenu provjeru, ne uz klik gumba.
- [ ] Događaj početka preuzimanja nazvati početkom; ne tvrditi da browser potvrđuje otvaranje ili uspješno spremanje na disk.
- [ ] Promjena privole mora odmah djelovati; greška analitike ne prekida proizvod.

```ts
expect(sanitizeEventData({ category: 'formatting', documentText: 'privatno' }))
  .toEqual({ category: 'formatting' });
expect(await trackEventWithoutConsent('analysis_completed')).toBe(false);
```

U testu `sanitizeEventData` dobiti iz postojećeg `createTelemetry`; `trackEventWithoutConsent` je lokalni testni adapter tog istog objekta s privolom koja nije `granted`.

**Kriterij prihvaćanja:** moguće je mjeriti prolaz kroz tok za korisnike s privolom bez sadržaja dokumenta. U izvještaju navesti da taj uzorak ne predstavlja automatski sve korisnike.

### T15 - Provedi korisnički pilot i završnu procjenu spremnosti

**Novi dokumenti u razvojnom repozitoriju:** `docs/quality/usability-protocol.md` i `docs/quality/release-readiness.md`. Bez testnog koda koji samo potvrđuje prisutnost teksta u dokumentaciji.

- [ ] Provesti početni pilot s približno 5-8 korisnika različite razine iskustva. To je kvalitativno istraživanje prepreka, ne statistički dokaz tržišnog uspjeha.
- [ ] Zadatak 1: učitaj dokument, odaberi odgovarajući profil i objasni prvi važan nalaz.
- [ ] Zadatak 2: odaberi ponuđene zahvate i objasni što će se poslati i izmijeniti.
- [ ] Zadatak 3: nakon popravka pronađi kopiju i navedi preostale obveze.
- [ ] Zadatak 4 za podplan D: učitaj uređenu verziju i pronađi riješen i nov problem.
- [ ] Zadatak 5 za podplan E: pronađi mentorov komentar i razlikuj vlastitu potvrdu od strojne provjere.
- [ ] Tijekom osnovnog pokušaja ne pomagati. Zapisati trenutak zastoja, pogrešnu pretpostavku, potrebu za pomoći i eventualni gubitak stanja.
- [ ] Svaku uočenu prepreku povezati s konkretnom promjenom i ponovno provjeriti pogođeni korak.
- [ ] Završno pregledati obvezne provjere na točnom kandidatu objave i povezati ih s manifestom.

**Kriterij prihvaćanja:** nema otvorene prepreke koja onemogućuje osnovni tok; za preostale probleme postoji izričita odluka o opsegu isporuke. Korisnici mogu objasniti rezultat bez zaključka da tehnička ocjena jamči prihvaćanje rada.

## 5. Provjere i okruženja

| Promjena | Najmanji smisleni skup | Dodatno kada je pogođeno |
| --- | --- | --- |
| Release dokaz | T01 testovi i CLI izlazi | Cijeli produkcijski lanac |
| Prijelazi prikaza | Relevantni Playwright scenariji | Desktop i mobilni projekt |
| Pravila i popravci | Ciljane regresije, autoritet parametara | Conformance, slow, korpus, Word/strict-open |
| Server body limit | Deno stream i endpoint testovi | Provjera oslobađanja slotova |
| Kontroler i odabir | Testovi životnog ciklusa i odabira | Kontrolirani auth/repair/download tok |
| Revizije | Usporedba nalaza, fingerprint, migracija | E2E dvije verzije i promjena profila |
| Mentorovi komentari | Tekst, sidra, statusi | DOCX očuvanje komentara i UX |
| Telemetrija | Privola, sanitizacija, broj događaja | Provjera da kvar ne prekida tok |

Postojeće naredbe provjerene u `package.json` polaznog commita:

```bash
npm run check
npm run conformance
npm run test:slow
npm run test:ux
npm run repair-real-corpus
npm run verify:strict-open:repaired
npm run verify:word
npm run release:check
npm run post-deploy-smoke:self-test
```

Ne pokretati sve nakon svake male izmjene. `npm run check` uključuje Edge provjere i zahtijeva Deno. `verify:word` zahtijeva odgovarajuće Windows/Word okruženje. Upute i ograničenja repozitorija imaju prednost pred generičkom listom iz ovog plana.

## 6. Kriteriji isporuke po ciklusu

### Ciklus 1 - podplanovi A-C

- [ ] T01 ne dopušta objavu bez provjerljive veze dokaza i sadržaja.
- [ ] T02/T03 prolaze na stvarnom produkcijskom artefaktu.
- [ ] T04 nema neprihvaćenih visokih/kritičnih nalaza.
- [ ] T05 jasno razlikuje izravne i prenesene dokaze.
- [ ] T06 daje ciljanu metriku i neovisno provjeren izlaz za deklarirani opseg.
- [ ] T07 prekida prevelik zahtjev tijekom čitanja.
- [ ] T08-T10 čuvaju odabir i daju provjeren ishod uz oporavak.
- [ ] Poznate prepreke iz korisničke provjere osnovnog toka su zatvorene.

### Ciklus 2 - podplan D

- [ ] Dvije verzije pouzdano su povezane ili povezivanje potvrđuje korisnik.
- [ ] Promjena pravila i nedostupno mjerenje ne stvaraju lažni napredak.
- [ ] Migracija i brisanje lokalnih podataka rade.
- [ ] Korisnik razumije razliku između riješenih i novih problema.

### Ciklus 3 - podplan E

- [ ] Mentorovi komentari ostaju povezani s izvornim dokumentom.
- [ ] Sadržajne odluke nisu prikazane kao strojno potvrđene.
- [ ] Telemetrija slijedi postojeću privolu i ne sadrži rad.
- [ ] Pilot potvrđuje korisnost i identificirane prepreke su riješene prije šireg puštanja.

## 7. Oblik izvještaja nakon svakog zadatka

Koristiti sljedeća polja, s konkretnim vrijednostima iz izvedbe:

| Polje | Sadržaj |
| --- | --- |
| Zadatak i status | T-ID; dovršeno / djelomično / blokirano / već riješeno |
| Problem prije promjene | Reprodukcija ili dokaz potrebe |
| Izmjena | Datoteke i promijenjeno ponašanje |
| Provjere | Točne naredbe, ishod, testirani commit |
| Neizvedeno | Koja provjera, razlog i utjecaj na zaključak |
| Rizik i povratak | Kako isključiti zahvaćenu novu funkciju ili vratiti izdanje bez gubitka izvornika |
| Sljedeći zadatak | Prvi nezatvoreni zadatak čije su ovisnosti zadovoljene |

Za svaki novi feature koristiti postojeći mehanizam kontrole dostupnosti ako postoji. Isključivanje nove funkcije ne smije preskočiti sigurnosni gate, provjeru dokaza ili čuvanje podataka.

## 8. Uputa za predaju u razvojnu sesiju

> Pročitaj ovaj plan i aktualne upute repozitorija. Kreni od T00 i provjeri koji nalazi još vrijede. Izvodi zadatke redom prema ovisnostima, u zasebno provjerljivim promjenama. Nadograđuj postojeće module i sačuvaj zaštite DOCX-a, lokalne analize, privola i serverskog autoriteta. Novi API-ji i datoteke označeni su kao prijedlozi; postojeće ekvivalente koristi umjesto dupliciranja. Za svaki kodni zadatak prvo dokaži kvar ili očekivani novi ugovor testom, zatim implementiraj i provjeri. Ne proglašavaj završetak samo na temelju zelenog builda ili broja testova. Nakon svake cjeline dostavi izvještaj iz odjeljka 7. Prva isporuka obuhvaća stabilizaciju A-C; revizije i mentorove zadatke isporučuj kao odvojene funkcionalne cjeline.

## 9. Izvori polaznog stanja

- [Repo i pregledani commit](https://github.com/danielrisavi77-create/Lekta/commit/3c1af21b0808f8cc1ec68b5f4ec813f4d40d65db)
- [Provjera release dokaza](https://github.com/danielrisavi77-create/Lekta/blob/3c1af21b0808f8cc1ec68b5f4ec813f4d40d65db/scripts/verify-deploy-dist.mjs)
- [Povezivanje novog plana s postojećim popravkom](https://github.com/danielrisavi77-create/Lekta/blob/3c1af21b0808f8cc1ec68b5f4ec813f4d40d65db/src/ui/results/desk-mount.ts)
- [Prikaz plana](https://github.com/danielrisavi77-create/Lekta/blob/3c1af21b0808f8cc1ec68b5f4ec813f4d40d65db/src/ui/results/repair-plan-view.ts)
- [Povijest revizija](https://github.com/danielrisavi77-create/Lekta/blob/3c1af21b0808f8cc1ec68b5f4ec813f4d40d65db/src/history/progress.ts)
- [Usporedba prije i poslije](https://github.com/danielrisavi77-create/Lekta/blob/3c1af21b0808f8cc1ec68b5f4ec813f4d40d65db/src/ui/repair-diff-model.ts)
- [Attestacija realnog korpusa](https://github.com/danielrisavi77-create/Lekta/blob/3c1af21b0808f8cc1ec68b5f4ec813f4d40d65db/data/verification/real-corpus-attestation.json)
- [Inspekcija komentara i revizija](https://github.com/danielrisavi77-create/Lekta/blob/3c1af21b0808f8cc1ec68b5f4ec813f4d40d65db/src/analysis/final-document-inspector.ts)

**Završni cilj plana:** pouzdan osnovni tok, mjerena kvaliteta popravka i jasne granice dokaza; zatim korisna usporedba nalaza kroz verzije i zaseban pilot mentorovih zadataka.

## Podplan F - program do javnog lansiranja (T16-T47)

Ovaj podplan je dodan 2026-09-12 iz vlasnikova plana. Pune checkliste, obrazloženja i vanjske izvore
NE prepisujemo ovamo: kanonski tekst je `docs/agents/plan-do-live-2026-09-12.md` (odjeljci 6 i 11), a
ovdje je indeks po zadatku. Kanonski status i red ostaju u `docs/agents/tasks.json`; treći sustav statusa
se ne uvodi.

Plan je pisan nad masterom `7e52bc66551d7d920ab83810f87f0c52a10f8c16`. Polazište unosa je
`afccbdd78af4d09f7ff9097adc45e05e3fc41287`, koji se od njega razlikuje samo za PR #74 i #75 (workflow
bez Fablea), bez izmjene aplikacijskog koda.

**P0** znači sigurnost, podatke, naplatu ili pouzdanost izdanja zbog kojih se objava zaustavlja. **P1**
znači dovršenost i kvalitetu potrebnu za cijeli dogovoreni proizvod; nije sinonim za "ostaviti za
poslije". Ovisnost znači da završni dokaz paketa mora koristiti dovršene prethodnike; istraživanje i
priprema mogu početi ranije.

### Valovi i kritični put

| Val | Fokus i redoslijed | Izlazni dokaz | Okvir napora |
| --- | --- | --- | --- |
| A | T16, početak T17, T18, T19 | Jedinstven plan, operativni staging, pouzdana gradnja i identitet kandidata | 3-5 dana |
| B | T20-T25, T36, početak T41 | Usklađen backend, račun, katalog, testna kupnja, oporavak bez dvostrukog izvršenja | 7-12 dana |
| C | T26-T29 | Dokazana analiza, učinak popravaka, pokrivenost svih profila i citata | 10-20+ dana |
| D | T30-T35, T37-T40 | Cijelo sučelje i pomoćne/integracijske funkcije dovršene | 8-15 dana |
| E | Završetak T41, T42-T46 | Stvarni E2E, performanse, sigurnost, operacije i kandidat za pilot | 4-7 dana |
| F | T15, T47 | Pilot, sanacije, javna objava i 7 dana početnog nadzora | 3-6 radnih dana, uz protek vremena za promatranje |

**Kritični put objave:** T18 -> T20 -> T22/T24 -> T25/T27 -> T30 -> T44 -> T46 -> T15 -> T47.

T28, T34/T35 i T45 mogu postati dodatni kritični put ako se pokažu praznine u izvorima, vanjskoj
infrastrukturi ili oporavku podataka. Rasponi se dijelom preklapaju i ne zbrajaju se kao ponuda; za
jednog aktivnog implementatora uz neovisni review plan računa okvirno 35-65 radnih dana. Koordinator
bira sljedeći spreman zadatak prema kritičnom putu, ne prema najnižem broju.

### T16 - Aktualno polazište i jedinstven plan do live

**Prioritet:** P0. **Ovisi o:** T00. **Mjesta rada:** `docs/agents/development-plan.md`, `docs/agents/tasks.json`, `docs/AUDIT_MASTER.md`, `docs/agents/autonomy-baseline.md`, `docs/quality/lekta-plan-status.md`.

**Gotovo kada:** validator reda prolazi, nema ciklusa ni dva kanonska statusa, svaki potvrđeni nalaz ima vlasnika i povezani T-zadatak, a stari nalazi nose datum i status; nema blanket tvrdnje "aplikacija X% gotova".

### T17 - Dokazati postojeći workflow agenata bez dodatne naplate

**Prioritet:** P1. **Ovisi o:** T16. **Mjesta rada:** `scripts/agents/core.mjs`, `scripts/agents/cli.mjs`, `scripts/autonomy/`, `config/autonomy.example.json`, `docs/agents/README.md`, `docs/agents/autonomy-runbook.md`.

**Gotovo kada:** mali zadatak prolazi plan, implementaciju, neovisni review, dokaz i integraciju; ponovno pokretanje ne stvara dupli posao, greška ili limit ne uzrokuju naplatu, a kontroler ne proglašava sam `done`. Dokaz su stvarni izlazi `doctor`, `tick` i `status`.

### T18 - Obnoviti staging i uskladiti migracijsku disciplinu

**Prioritet:** P0. **Ovisi o:** T16. **Mjesta rada:** `supabase/config.toml`, `supabase/migrations/`, `scripts/migration-identity.mjs`, DB smoke skripte, postojeći deploy runbookovi.

**Gotovo kada:** novi testni korisnik u stagingu prolazi auth, pravila, testni popravak i privatno preuzimanje, DB provjere prolaze, a manifest razlikuje okruženja; nema neplanirane promjene produkcijskih podataka. Ograničenje računa ili plana ostaje zapisan blokator, ne prolaz.

### T19 - Pouzdana produkcijska gradnja i dokaz izdanja

**Prioritet:** P0. **Ovisi o:** T16. **Mjesta rada:** `scripts/build-production.mjs`, `scripts/write-build-info.mjs`, `scripts/release-check.mjs`, `scripts/release-proof-core.mjs`, `scripts/verify-deploy-dist.mjs`, `scripts/post-deploy-smoke.mjs`, `netlify.toml`, `.github/workflows/`, `playwright.dist.config.ts`.

**Gotovo kada:** proizvedeni artefakt ima točan identitet, strogi smoke odbija pogrešnu verziju, a negativni slučajevi (nedostajući build-info, pogrešan SHA, stale ili unknown dokaz, izmijenjen izvor poslije ovjere) zaustavljaju objavu. Svjež završni Word dokaz nastaje u T46.

### T20 - Uskladiti Edge kod, pravila i konfiguraciju

**Prioritet:** P0. **Ovisi o:** T18, T19. **Mjesta rada:** `supabase/deploy-manifest.json`, `supabase/functions/`, `scripts/deploy-drift.mjs`, `scripts/generate-deploy-manifest.mjs`, `src/config/production-config.ts`, `src/config/deployment.ts`, `data/generated/profile-rules-server.json`.

**Gotovo kada:** potvrđena odstupanja osnovnog backenda nestanu na stagingu, server i klijent koriste isti kompatibilni skup pravila, a svaka preostala aktivacija ima konkretan zadatak. Završna produkcijska jednakost provjerava se ponovno u T47.

### T21 - Zatvoriti sigurnosne i autorizacijske rizike

**Prioritet:** P0. **Ovisi o:** T18, T20. **Mjesta rada:** `supabase/migrations/`, `supabase/functions/_shared/`, svi javni Edge ulazi, auth/RLS/RPC testovi i postojeće security provjere.

**Gotovo kada:** nema potvrđenog čitanja ili mutacije tuđih podataka, zaobilaska prava ni neograničene obrade; relevantni negativni testovi padaju pri namjerno uklonjenoj zaštiti, a advisor iznimke imaju objašnjenje i vlasnika.

### T22 - Dovršiti račun, prijavu i e-poštu

**Prioritet:** P0. **Ovisi o:** T18, T20, T21. **Mjesta rada:** `src/auth/session.ts`, račun u `src/routes/my-work/`, pripadajući UI, Supabase Auth postavke i email predlošci.

**Gotovo kada:** stvarne testne poruke stižu na namjenske adrese, sve sesijske grane daju očekivani rezultat, a anonimni korisnik nakon registracije zadržava vlastiti rad i pripadajuća prava.

### T23 - Urediti katalog, cijene i prava proizvoda

**Prioritet:** P0. **Ovisi o:** T16. **Mjesta rada:** `src/catalog/products-catalog.ts`, `src/report/pricing.ts`, `src/report/slot-logic.ts`, tablica `products`, postojeći RPC za promjenu cijene i povijest cijena.

**Gotovo kada:** svaki ponuđeni SKU ima jednoznačno objašnjenje i mapiranje, test potvrđuje stvarnu cijenu i prava, a stara kupnja ostaje ispravno prepoznata nakon promjene kataloga. Nove cijene se ne izmišljaju kao dio tehničke sanacije.

### T24 - Završiti checkout, webhook i životni ciklus prava

**Prioritet:** P0. **Ovisi o:** T20, T22, T23. **Mjesta rada:** `supabase/functions/create-checkout/`, `supabase/functions/webhook-mor/`, `src/report/checkout.ts`, `src/report/webhook.ts`, slot/RPC migracije i testovi.

**Gotovo kada:** svaka namjenska testna kupnja završava točno jednim odgovarajućim pravom, ponovljeni događaj ne daje dodatno pravo, a greške imaju oporavak i operativni trag. Nema stvarnih troškova samo radi automatiziranog testa.

### T25 - Pouzdan popravak i oporavak nepoznatog ishoda

**Prioritet:** P0. **Ovisi o:** T20, T21, T24. **Mjesta rada:** `src/repair/workflow-controller.ts`, `src/repair/recovery-policy.ts`, `src/report/repair-client.ts`, repair history, `supabase/functions/repair-docx/`, `supabase/functions/delete-repair-job/`, pripadajuće DB/RPC promjene.

**Gotovo kada:** dvostruki klik, refresh, paralelni poziv i izgubljeni odgovor daju jedan definiran posao i očekivanu potrošnju prava, a isti posao je ponovno dohvatljiv. Korisnik nikad ne dobiva savjet da slijepo pokrene novu naplativu obradu.

### T26 - Potvrditi točnost lokalne DOCX analize

**Prioritet:** P1. **Ovisi o:** T16. **Mjesta rada:** `src/analysis/`, `src/docx/parser.ts`, `src/scoring/evaluate/`, `src/preview/`, parser/conformance fixture i testovi.

**Gotovo kada:** reprezentativna matrica mjerenja i conformance prolaze, nema sustavnog lažno pozitivnog nalaza na poznato ispravnim dokumentima, a nemjerljive stavke su označene kao `unknown` ili ručna provjera. Veličina i vrijeme obrade imaju izmjerene granice.

### T27 - Dokazati i poboljšati svih 31 fixera

**Prioritet:** P0. **Ovisi o:** T25, T26. **Mjesta rada:** `src/repair/`, `scripts/corpus-gen/repair-net.mts`, `scripts/repair-real-corpus.mts`, `docs/quality/real-corpus-protocol.md`, `data/verification/`, pripadajući testovi.

**Gotovo kada:** svaki fixer ima pozitivan i negativan dokaz, sva neočekivana oštećenja i lažno prikazani uspjesi su nula, a izvještaj odvojeno pokazuje razriješene, neriješene, preskočene, neprimjenjive i ručne stavke s točnim nazivnicima. Jedan agregatni postotak nije release kriterij.

### T28 - Završiti pravila, programe i dokaze za 407 profila

**Prioritet:** P1. **Ovisi o:** T16, T26. **Mjesta rada:** `data/profiles/`, registri izvora i programa, `src/profiles/`, `src/programs/`, `src/ui/profile-claim.ts`, generator completion-ledgera i faculty-matrice.

**Gotovo kada:** nema zapisa bez razriješenog statusa, nevažećeg mapiranja ni prikrivenog nasljeđivanja; tvrdnja u izboru profila, rezultatima i na javnoj stranici je ista i dokaziva. Ako ustanova ne objavljuje pravilo, dovršetak je točno dokumentirano ograničenje, ne fabricirana norma.

### T29 - Dovršiti citate, literaturu i provjeru izvora

**Prioritet:** P1. **Ovisi o:** T26, T28. **Mjesta rada:** `src/citations/`, citatni fixeri u `src/repair/`, `supabase/functions/source-check/`, pripadajući alati i citation dossier skripte.

**Gotovo kada:** poznato ispravni i pogrešni primjeri imaju točan rezultat, servisi u kvaru daju `unknown` uz oporavak, a korisniku se ne mijenja sadržaj reference na temelju nepouzdanog podudaranja.

### T30 - Dovršiti glavni korisnički tok i izvještaj

**Prioritet:** P1. **Ovisi o:** T22, T25, T27, T28. **Mjesta rada:** `src/routes/intake/`, `src/routes/workspace/`, `src/ui/repair-panel.ts`, `src/ui/repair-workflow-binding.ts`, `src/ui/results/`, `src/repair/workflow-controller.ts`, `src/report/report.ts`, `supabase/functions/generate-report/`.

**Gotovo kada:** novi korisnik bez objašnjenja autora razumije sljedeću radnju i može završiti tok, a svi prikazani ishodi odgovaraju backend i verifikacijskom stanju. Dokaz su stvarni korisnički scenariji i snimke relevantnih stanja.

### T31 - Završiti Moje radove, revizije i mentorske zadaće

**Prioritet:** P1. **Ovisi o:** T25, T30. **Mjesta rada:** `src/routes/my-work/`, `src/routes/workspace/revisions.ts`, `src/session/`, `src/history/`, `src/mentor/`, `src/ui/results/`.

**Gotovo kada:** revizije i zadaće ne prelaze na krivi rad, lokalni životni ciklus ne gubi podatke bez upozorenja, a korisnik može pronaći i obrisati sve što aplikacija tvrdi da je spremila.

### T32 - Dovršiti sve besplatne alate

**Prioritet:** P1. **Ovisi o:** T28, T29. **Mjesta rada:** `src/tools/`, `src/title-pages/`, `src/declarations/`, `scripts/generate-citation-tools.mjs`, `scripts/generate-title-page-tools.mjs`, HTML ulazi alata.

**Gotovo kada:** svaki javno naveden alat ima funkcionalan izlaz, radi na mobitelu i s tipkovnicom, ne gubi unesene podatke pri očekivanoj radnji i ne tvrdi da je generički izlaz službeno odobren.

### T33 - Dovršiti PDF tok i njegove granice

**Prioritet:** P1. **Ovisi o:** T26, T30. **Mjesta rada:** `src/pdf/pdf-preflight.ts`, intake/workspace integracija i PDF testovi.

**Gotovo kada:** tekstualni PDF daje reproducibilan ograničen rezultat, nepodržani ulazi ne dobivaju lažno preciznu ocjenu, a PDF tok ne obećava automatski DOCX popravak niti nepostojeći OCR.

### T34 - Završiti preflight i integrity sa stvarnim servisom

**Prioritet:** P1. **Ovisi o:** T20, T21, T22, T29, T36. **Mjesta rada:** `src/preflight/`, `src/integrity/`, `supabase/functions/preflight-start/`, `preflight-result/`, `integrity-check/`, `docs/deploy/PREFLIGHT_DEPLOY.md`, vanjski Python servis.

**Gotovo kada:** stvaran testni dokument prolazi cijeli put do ispravno filtriranog rezultata, pogrešne ovlasti i tokeni se odbijaju, a dokument i privremeni sadržaj brišu se prema ugovoru. Nedostupan izvor ili host ostaje vidljiv blokator, ne lažni `done`.

### T35 - Dovršiti field-render i završni Word dokument

**Prioritet:** P1. **Ovisi o:** T20, T27. **Mjesta rada:** `workers/field-renderer/`, `supabase/functions/field-render/`, klijentski poziv rendereru, `scripts/word-verify/`, `scripts/verify-docx/`.

**Gotovo kada:** korisnik dobiva provjeren konačni dokument i razumljiv status polja, worker se oporavlja od lošeg ulaza, a dokaz uključuje stvarno otvaranje popravljenog izlaza u Wordu prije i nakon ažuriranja polja.

### T36 - Završiti privatnost, brisanje i životni ciklus podataka

**Prioritet:** P0. **Ovisi o:** T21, T22, T25. **Mjesta rada:** `src/legal/`, `src/session/`, `src/corpus/`, `supabase/functions/delete-repair-job/`, `cleanup-orphan-repairs/`, `withdraw-corpus-contribution/`, purge migracije i pripadajuća UI dokumentacija.

**Gotovo kada:** svaki obećani rok i brisanje imaju dokaz na objektu i metapodacima, korisnik ima funkcionalnu kontrolu svojih podataka, a e-pošta, nazivi dokumenata i tekst rada ne završavaju u nepotrebnim logovima.

### T37 - Dovršiti garanciju, raskid, povrat i podršku

**Prioritet:** P1. **Ovisi o:** T22, T24, T36. **Mjesta rada:** `src/report/guarantee.ts`, `src/legal/`, `supabase/functions/file-guarantee-claim/`, javne stranice uvjeta i garancije, odgovarajući admin tok; pregledati PR #29.

**Gotovo kada:** testni zahtjev prolazi podnošenje, potvrdu, admin obradu, razrješenje i obavijest korisniku, uz autorizaciju i trag promjena.

### T38 - Dovršiti preporuke, bonuse, podsjetnike i usluge

**Prioritet:** P1. **Ovisi o:** T22, T24, T36. **Mjesta rada:** `src/referral/`, `src/waitlist/`, `src/submission/`, `src/report/referral.ts`, `src/report/partner.ts`, `supabase/functions/redeem-referral-signup/`, `process-bonus-outbox/`, `faculty-request/`, `send-reminders/`, `unsubscribe-reminder/`.

**Gotovo kada:** svaka ponuđena pogodnost ili usluga ima cijeli isporučivi tok, obračun i podršku; bonus se dodijeli jednom, odjava zaustavlja buduće podsjetnike, a korisnik vidi odgovara li paket njegovu slučaju.

### T39 - Dovršiti administraciju i operativni pregled

**Prioritet:** P1. **Ovisi o:** T20, T24, T25, T37, T38. **Mjesta rada:** `src/admin/`, `supabase/functions/admin-stats/`, povezani admin RPC-ovi.

**Gotovo kada:** admin brojke se podudaraju s pripremljenim DB i payment scenarijima, neovlašteni pristup je odbijen, a svaki kritični korisnički problem može se pronaći i razriješiti bez ručnog mijenjanja baze naslijepo.

### T40 - Dovršiti postojeću integraciju s Katedrom

**Prioritet:** P1. **Ovisi o:** T21, T22, T24, T36. **Mjesta rada:** `src/integration/`, `src/integrations/`, `supabase/functions/record-completion-check/`, `katedra-agent-worker/`, povezani ugovori i PR-ovi #57 i #71.

**Gotovo kada:** postojeći cross-app tok prolazi na kompatibilnim stvarnim testnim servisima, vlasništvo i privola su očuvani, a kvar druge aplikacije ne uništava lokalni rad. To ne podrazumijeva dovršavanje svih nepovezanih mogućnosti Katedre.

### T41 - Sanirati ovisnosti i dovršiti održivu provjeru koda

**Prioritet:** P1. **Ovisi o:** T16. **Mjesta rada:** `package.json`, `package-lock.json`, Deno lock i Edge konfiguracija, `scripts/npm-audit-ratchet.mjs`, `docs/quality/dependency-decisions.md`, TypeScript i CI konfiguracija.

**Gotovo kada:** nema novog neobjašnjenog sigurnosnog duga, ratchet i glavne provjere prolaze na ponovljivoj instalaciji, a iznimke nisu bez roka. Stari dokumentirani broj type grešaka ne navodi se kao aktualan bez ponovnog izvođenja.

### T42 - Završiti pristupačnost, mobitel i performanse

**Prioritet:** P1. **Ovisi o:** T30, T31, T32, T33, T34, T35. **Mjesta rada:** sve javne rute i UI stilovi, `tests/ux/`, browser matrica i produkcijski bundle.

**Gotovo kada:** nema blokirajuće pristupačne ili mobilne prepreke, nema nekontroliranog zamrzavanja ni rasta memorije, a mjerene granice i upozorenja odgovaraju stvarnom ponašanju. Cilj je WCAG 2.2 AA za javne tokove, uz popis provjerenih kriterija.

### T43 - Završiti javne stranice, tvrdnje i SEO

**Prioritet:** P1. **Ovisi o:** T23, T28, T30, T32, T37. **Mjesta rada:** `src/routes/shared/public-route-directory.json`, `src/routes/learn-more/`, svi generatori javnih, legal, faculty i competitor stranica, sitemap i robots konfiguracija.

**Gotovo kada:** nema slomljenog javnog puta, pogrešne ponude ni kontradiktornih tvrdnji; crawl popis odgovara manifestu ruta i objavljenom artefaktu, a sadržaj se može ažurirati iz kanonskih podataka bez ručnog razilaženja kopija.

### T44 - Dokazati cijele tokove sa stvarnim backendom

**Prioritet:** P0. **Ovisi o:** T19 do T43 za njihove korisnički dostupne rezultate; eksplicitni popis je u redu zadataka. **Mjesta rada:** `tests/ux-dist/`, `playwright.dist.config.ts`, namjenski staging seed i cleanup, CI i release dokaz.

**Gotovo kada:** sve obavezne grane matrice scenarija E01 do E36 imaju stvarni prolaz i evidenciju; nema prešućenog mocka u dokazu integracije, a nedostupan servis je označen `blocked` ili `unavailable`, nikad `pass`.

### T45 - Dovršiti monitoring, oporavak i troškovne granice

**Prioritet:** P0. **Ovisi o:** T18, T19, T20, T21, T36, T39, T41. **Mjesta rada:** `src/ui/telemetry.ts`, `supabase/functions/client-error/`, `analytics-event/`, `health/`, cleanup i cron funkcije, admin operacije i deploy runbookovi.

**Gotovo kada:** kontrolirani kvar proizvede vidljiv signal, rollback i restore su izvedeni na testu, a svaka operativna obveza ima vlasnika i kratku naredbu. Uspješan cron zapis zamijenjen je dokazom stvarnog učinka gdje je to bitno.

### T46 - Ovjeriti konačni kandidat i pripremiti pilot

**Prioritet:** P0. **Ovisi o:** T17, T44, T45. **Mjesta rada:** postojeći release, Word i quality artefakti, `docs/generated/RELEASE_PROOF.json`, pilot dokumentacija T15.

**Gotovo kada:** sve release kontrolne točke iz odjeljka 8 vendoranog plana imaju svjež dokaz i postoji konkretan testni kandidat dostupan pilotu. Plan pilota ili generirani potpis nisu zamjena za stvarne rezultate.

### T15 - pilot (postojeći zadatak, povezan s ovim programom)

**Prioritet:** P0 za javno lansiranje. **Ovisi o:** T14 i T46 (spremnost ovjerenog kandidata je novi preduvjet, pa je status vraćen na `blocked`). **Mjesta rada:** postojeći T15 iznad, pilot protokol, audit registar i dokazi bez osobnih podataka.

**Gotovo kada:** najmanje pet korisnika završilo je glavni tok, nema neriješenog P0 ni blokirajućeg P1, a ponovljene primjedbe o razumijevanju i rezultatu obrađene su. Opis zadataka pilota ostaje u odjeljku T15 Podplana E.

### T47 - Objaviti cijelo izdanje i predati operacije

**Prioritet:** P0. **Ovisi o:** T15, T46. **Mjesta rada:** Netlify, Supabase i worker deploy postupci, release dokaz, post-deploy smoke, monitoring i runbookovi.

**Gotovo kada:** javni artefakt odgovara dokazanoj verziji, svi uključeni tokovi rade, operativni nadzor nema nerazriješen kritični signal i početni tjedan je obrađen. Nakon toga razvoj prelazi na održavanje uz isti standard dokaza.

### Što ovaj podplan ne mijenja

Podplanovi A-E i njihovi zadaci T00-T15 ostaju iznad nepromijenjeni. Granice iz odjeljka 4 vendoranog
plana vrijede za svaki paket: jedan implementator u jednom izoliranom worktreeu, klijent nije autoritet
za cijenu ni prava, migracije idu kroz `supabase db push`, produkcijske tajne ne ulaze u frontend ni u
dokaze, a regresija ili integritetski kvar nikad se ne prikazuju kao uspješna isporuka. Izlaz runnera
`needs_verification` nije kanonski status i ne upisuje se u red.

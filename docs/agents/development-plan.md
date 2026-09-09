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

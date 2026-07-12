# LEKTA_90_DAY_PLAN.md

Devedesetodnevni plan (13 tjedana) uz [LEKTA_PRODUCT_ROADMAP.md](LEKTA_PRODUCT_ROADMAP.md)
i [LEKTA_IMPLEMENTATION_BACKLOG.md](LEKTA_IMPLEMENTATION_BACKLOG.md). Datum: 2026-07-13.

Kontekst kalendara: jesenski predajni val (rujan, listopad) pocinje oko tjedna 8 ovog plana.
Cilj plana: docekati val s istinitim AutoFix pozicioniranjem, dokazivim prije/poslije
popravkom i zivom naplatom.

Napomena o ovisnostima: sve stavke oznacene (owner) su vlasnicki koraci izvan koda
(Supabase, Lemon Squeezy, pravni subjekt, DPA); kodne stavke ne cekaju na njih osim gdje je
izricito navedeno. Svaki tjedan zavrsava zelenim `npm run check`; repair tjedni dodatno
zelenim golden repair testovima.

---

## Mjesec 1: istina o proizvodu + dokaziv AutoFix

### Tjedan 1
- Gradi se: Paket A (BL-01 FAQ/JSON-LD istina o AutoFixu, BL-02 plagijat ograda u prvi
  ekran, BL-03 meta/nav higijena). Odluka o merge strategiji redesign grane (CI je nikad
  nije vidio: prije svega push + zeleni CI).
- Testira se: postojeci seo/head regresijski testovi prosireni; rucni pregled dev servera.
- Objavljuje se: azurirani landing na produkciju (prvi deploy s istinitom pricom).
- Mjeri se: baseline tjednih brojki PRIJE promjena (posjete, upload rate, repair download
  rate) iz postojece consent-gejtane analitike; bez baselinea se ucinak faze 0 ne moze
  dokazati.
- (owner) Pokrenuti GO_LIVE_NAPLATA korake 1-3 (Supabase projekt, migracije, products seed).

### Tjedan 2
- Gradi se: BL-08 golden repair harness (preduvjet svih repair zahvata) + 2 nove fixture sa
  sekcijama.
- Testira se: snapshot baseline svih 5 postojecih fixera + deep varijanti nad 8 fixtura.
- Objavljuje se: nista javno (interni gate).
- Mjeri se: efekt tjedna 1 na upload konverziju (cilj: vidljiv rast prema baselineu).

### Tjedan 3
- Gradi se: BL-04 repair re-check petlja (score prije -> poslije u repair panelu).
- Testira se: unit + panel testovi; rub slucajevi (analiza popravljenog pada, slabi uredjaj).
- Objavljuje se: re-check petlja na produkciju; kratki video "68 -> 84 u deset sekundi" kao
  materijal za landing i drustvene mreze.
- Mjeri se: postotak analiza koje pokrenu popravak; postotak popravaka s preuzimanjem.

### Tjedan 4
- Gradi se: BL-06 pgNumType fixer (numeriranje: rimsko/arapsko nad postojecim sekcijama).
- Testira se: golden repair + docx-smoke + rucna matrica Word/LibreOffice.
- Objavljuje se: fixer na produkciju (u soft-launchu jos besplatan = testiranje na stvarnim
  dokumentima prije naplate).
- Mjeri se: koliko dokumenata ima sekcije (telemetrija scoreBand razine, bez sadrzaja);
  stopa no-op backstopa.
- (owner) GO_LIVE koraci 4-6 (Lemon Squeezy MoR, webhook, sandbox checkout).

## Mjesec 2: numeriranje end-to-end + aktivacija naplate

### Tjedan 5
- Gradi se: BL-07b footer PAGE polje (prosirenje engine politike na footere/rels; najveci
  tehnicki zahvat plana).
- Testira se: nove maske i backstop; golden na svih 8+ fixtura; Word/LibreOffice matrica.
- Objavljuje se: nista dok tjedan 6 ne zavrsi (b i c idu zajedno u produkciju).

### Tjedan 6
- Gradi se: BL-07c umetanje sekcije prije Uvoda s korisnikovom potvrdom; BL-12 konsolidacija
  cijena (products tablica jedini izvor).
- Testira se: end-to-end "dokument bez sekcija -> numeriran od Uvoda" na realnim radovima;
  paywall smoke lokalno.
- Objavljuje se: kompletno "numeriranje od Uvoda" na produkciju; landing sekcija i FAQ
  azurirani (sada je istina).
- Mjeri se: udio popravaka koji koriste numeraciju; stopa potvrde lokacije vs odustajanja.

### Tjedan 7
- Gradi se: BL-13 (uklanjanje starog narudzbenog toka), BL-14 paywall e2e smoke na stagingu
  (checkout sandbox -> webhook -> entitlement -> unlock -> re-check).
- Testira se: cijeli placeni lijevak na stagingu; refund proces (runbook).
- (owner) Zadnji GO_LIVE koraci (endpointi u produkcijski config, rebuild, deploy).
- Objavljuje se: nista javno; go/no-go odluka za naplatu.

### Tjedan 8: UVODJENJE NAPLATE
- Objavljuje se: naplata ZIVA (teaser/full granica aktivna, AutoFix iza gatea, Thesis Pass
  kao flagship, besplatni check uokviren kao provjera kompatibilnosti). Tocno na pocetak
  jesenskog vala.
- Mjeri se (od prvog dana): konverzija free -> paid, prosjecna vrijednost narudzbe, refund
  rate, prihod po danu; alarmi na webhook greske.
- Gradi se: hitni popravci iz prvih placenih korisnika (rezerviran kapacitet).

## Mjesec 3: submission paket + dokazivanje vrijednosti u sezoni

### Tjedan 9
- Gradi se: BL-15 ZIP submission paket (builder + gumb + README s rucnim koracima).
- Testira se: unit builder + zip round-trip; rucna provjera paketa za 3 pilot fakulteta.
- Objavljuje se: Submission Ready SKU postaje isporuciv (paket + checklista + re-check).

### Tjedan 10
- Gradi se: BL-16 (PDF/A polje profila + preflight retrigger), BL-11 imenovanje datoteka
  gdje pravila postoje.
- Testira se: checklist tocnost po profilima.
- Mjeri se: udio kupaca Submission Ready vs Fix; potvrda cjenovne ljestvice.

### Tjedan 11
- Gradi se: BL-17 Playwright e2e temelj (3 scenarija + CI job).
- Testira se: flaky rate; CI na granama ukljucen.
- Objavljuje se: nista javno (kvaliteta isporuke).

### Tjedan 12
- Gradi se: BL-18 SEO alati val 2 (numeriranje stranica alat + Word cistac teaser), s
  konverzijskim obrascem "popravljeno X, nadjeno jos Y".
- Objavljuje se: nove alatne stranice u sitemap; interno linkanje s alati.html.
- Mjeri se: organski dolasci na nove stranice; alat -> analizator klik rate.

### Tjedan 13
- Gradi se: BL-20 dokumentacijska higijena; BL-19 lekta-pipeline odluka (sastanak sa sobom:
  pozicija, pravni okvir, uskladjivanje roadmapa).
- Objavljuje se: prije/poslije galerija + testimoniali iz prvih tjedana sezone.
- Mjeri se: kvartalni pregled svih metrika; odluka o Fazi 4 cloud integriteta (tek nakon
  validacije naplate).

## Kada se uvodi naplata i kada se validira trziste

- Naplata: tjedan 8 (nakon stagng e2e i konsolidacije cijena; pocetak predajnog vala).
  Uvjet: BL-12, BL-13, BL-14 zeleni + owner koraci gotovi. Ako owner koraci kasne, naplata
  se pomice, kodni plan se NE mijenja (sve ostalo je neovisno).
- Validacija trzista: tjedni 8-13 su validacijski prozor (sezona). Odluka o Fazi 4 (cloud
  integritet) i regionalnom sirenju donosi se TEK s brojkama iz sezone (kraj mjeseca 3).

## Minimalne metrike uspjeha (pragovi za "plan radi")

Lijevak (mjereno consent-gejtanom analitikom + server podacima nakon naplate):
- Dovrsenost uploada (odabir datoteke -> rezultat): >= 85% (worker fallback + prekid vec
  postoje; ispod praga = tehnicki problem).
- Vrijeme do prvog rezultata: p50 <= 15 s, p95 <= 60 s na mobitelu.
- Uspjesnost DOCX obrade (bez greske analize): >= 97%.
- Popravak bez ostecenja: 0 potvrdjenih slucajeva ostecenog dokumenta (backstop no-op se NE
  racuna kao neuspjeh; mjeri se stopa backstopa < 15%).
- Analiza -> pokrenut popravak: >= 25% nakon tjedna 3.
- Popravak -> preuzimanje datoteke: >= 60%.
- Free -> paid konverzija (od tjedna 8): >= 3% na analizama s score < 90; cilj 5% do
  tjedna 13.
- Prosjecna vrijednost narudzbe: >= 8 EUR (mix Fix/Submission/Pass).
- Refund rate: <= 5% (garancija vezana na tocnost pravila).
- Ponovna provjera istog dokumenta (re-check petlja): >= 40% kupaca unutar slota.
- Prijave netocnih pravila: < 1 na 200 analiza; svaka rijesena u 7 dana (moat higijena).
- Organski promet: nove SEO stranice indeksirane u 2 tjedna; alat -> analizator klik >= 8%.
- Broj profila sa spremnoscu 100: raste s 174 (podatkovni rad se nastavlja u pozadini).

Stop-loss pravila: ako je refund rate > 10% u prva dva tjedna naplate, pauzirati oglasavanje
cijena i analizirati uzroke (očekivanja vs isporuka); ako je stopa backstop no-opa > 30% na
nekom fixeru, fixer se vraca u "samo prijedlog" nacin dok se uzrok ne rijesi.

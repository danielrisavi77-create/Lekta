# CO_PILOT_STRATEGY.md · Lekta

Kako uklopiti "compliant thesis co-pilot" strategiju u postojeću aplikaciju. Ovaj dokument
je most između `lekta-strateski-plan.md` (strateški narativ) i stvarnog stanja koda. Nadovezuje
se na [VISION.md](../VISION.md) (sjeverna zvijezda) i [COMPETITORS.md](../COMPETITORS.md)
(pozicioniranje). Pravilo pisanja: hrvatski, bez em i en crtica.

Datum: 2026-07-11. Vlasnik odluka: founder.

## 0. Sažetak u tri rečenice

Strategija pomiče Lektu iz "provjere prije predaje" u "co-pilota kroz cijeli proces pisanja",
uz isti moat: strojno čitljiva baza pravilnika po fakultetu. Velik dio MVP opsega iz plana
(sekcija 8) je već izgrađen: ruleset engine, compliance score, repair engine, citation
formatter, rokovi, i cijeli server-autoritativni paywall s katalogom proizvoda. Stvarno novo
za graditi su tri stvari: opt-in cloud integritetski modul (plagijat, cross-lingual, AI),
ne-generativna provjera registra, i i18n za regionalno širenje.

## 1. Tri fiksirane strateške odluke

Donesene 2026-07-11 (strukturirani izbor foundera).

### A. Privatnost naspram cloud provjera: LOKALNO + CLOUD OPT-IN

Analiza formata, strukture i citata ostaje 100% lokalna i besplatna (dokument ne napušta
preglednik). Plagijat, cross-lingual i AI-detekcija su eksplicitno opt-in cloud korak iza
zasebne privole, i ujedno plaćeni gate. Posljedica: privacy copy se mora precizirati na
"lokalna analiza formata" naspram "opcionalna cloud provjera uz privolu". Detaljan dizajn:
[PHASE4_CLOUD_INTEGRITY.md](PHASE4_CLOUD_INTEGRITY.md).

### B. Provjera registra i jasnoće: DA, SAMO NE-GENERATIVNE ZASTAVICE

Uvodimo read-only oznake (duga rečenica, pasiv, kolokvijalizam, zabranjeno prvo lice ako
profil to traži), nikad prepisivanje ni generiranje teksta. Ovo je jedina iznimka od pravila
iz [VISION.md](../VISION.md) "nikada ne ocjenjuje kvalitetu sadržaja": registar i jasnoća su
FORMA izraza, ne argument. VISION.md je dopunjen odgovarajućim carve-outom. Teški AI writing
assistant ostaje deferiran (kao i u planu, sekcija 8).

### C. Model naplate: THESIS PASS I PO DOKUMENTU (oba)

Zadržavamo jednokratnu naplatu po dokumentu (panic-buyer prije roka) i dodajemo Thesis Pass
kao flagship (jedno plaćanje, provjeravaj isti rad do obrane). Nema mjesečne pretplate za
retail (plan je argumentira kao churn-mašinu za studenta koji piše nekoliko mjeseci pa otkaže).

## 2. Mapa: plan naspram koda (što već postoji)

| Plan (MVP sekcija 8) | Stanje | Ključne datoteke |
|---|---|---|
| Ruleset engine (moat) | GOTOVO, 100+ profila, više institucija | [profile-loader.ts](../../src/profiles/profile-loader.ts), [rule-compiler.ts](../../src/profiles/rule-compiler.ts), [data/](../../data/) |
| Compliance score + auto-fix | GOTOVO, analiza u Web Workeru + repair engine | [analyze-docx.ts](../../src/analysis/analyze-docx.ts), [src/repair/](../../src/repair/) |
| Citation formatter | GOTOVO, autor-godina + pravni engine + free-tools | [src/citations/](../../src/citations/) |
| Rokovi i podsjetnici | GOTOVO, inertno (čeka vlasnikove tajne) | [src/submission/](../../src/submission/) |
| Paywall (teaser vs puni izvještaj) | GOTOVO kao kod, INERTNO (endpointi prazni) | [report.ts](../../src/report/report.ts), [slot-logic.ts](../../src/report/slot-logic.ts) |
| Katalog proizvoda (po dok. + pass + bundle) | GOTOVO u shemi i seedu | [0002_products_catalog.sql](../../supabase/migrations/0002_products_catalog.sql) |
| Plagijat + cross-lingual + AI | NE POSTOJI | Faza 4 |
| Registar / clarity | NE POSTOJI | Faza 3 |
| i18n / regionalno | NE POSTOJI (profili su data-driven pa spremni) | Faza 5 |

Zaključak: reframe je ~20% novog koda i ~80% aktivacije i preslagivanja postojećeg.

## 3. Paywall: što je stvarno već tu (važno za Fazu 1)

Monetizacijski sloj je server-autoritativan i zreo:

- Teaser je lokalan i besplatan (score, score po kategorijama, brojači, 1 do 2 problema u
  potpunosti); puni izvještaj generira i potpisuje Edge Function uz vazeci entitlement.
  Vidi [report.ts:50-93](../../src/report/report.ts#L50-L93).
- Odluka o pristupu je čista funkcija: rate limit, pa aktivan slot (re-check besplatno), pa
  potrošnja entitlementa (novi slot), pa 402 paywall. Vidi [slot-logic.ts:80-131](../../src/report/slot-logic.ts#L80-L131).
- Katalog je jedina istina o cijenama (Supabase `products`, RLS anon SELECT). Klijent nikad
  ne šalje cijenu, samo `productId`. Vidi [products-catalog.ts](../../src/catalog/products-catalog.ts)
  i [checkout.ts](../../src/report/checkout.ts).
- `Product.kind` već uključuje `'pass'`. Postoje slotovi po vrsti rada, "do obrane" slotovi
  (120 dana), semestralni pass za seminarske, bundlovi i premium-human.

Mehanika Thesis Passa: budući da je re-check istog otiska unutar prozora slota BESPLATAN,
jedan slot s dugim prozorom (npr. 150 do 180 dana) daje neograničene besplatne re-provjere
istog rada do obrane. To je točno "jedno plaćanje za cijeli diplomski". Zato Thesis Pass ne
traži novu engine logiku, samo SKU i framing.

Pravi jaz ("free tier daje sve"): endpointi (`supabaseUrl`, checkout i report endpoint) su
prazni pa je paywall inertan i sav sadržaj je besplatan. Aktivacija je owner-gated (Supabase
projekt + Lemon Squeezy tajne), ne kod.

## 4. Fazni roadmap

Definicija gotovog za svaki korak: `npm run check` zelen (tsc, vitest, vite build).

### Faza 0: pomirba strategije i copyja (nizak kod)
- Ovaj dokument + dopuna [VISION.md](../VISION.md) (odluke A/B/C). GOTOVO.
- Precizni privacy copy: razdvoji "lokalna analiza formata" od "opcionalni cloud uz privolu".
  Nužno neovisno o Fazi 4 (produkcijski audit je uhvatio drift u copyju).

### Faza 1: aktiviraj naplatu (najviši ROI)
- Thesis Pass SKU: [0017_thesis_pass.sql](../../supabase/migrations/0017_thesis_pass.sql)
  dodaje `pass_zavrsni` i `pass_diplomski` (kind `pass`, dugi prozor, predložena cijena).
  Predloženo, mijenja se preko `set_product_price` bez deploya. GOTOVO kao artefakt.
- Owner-gated: postavi Supabase projekt + Lemon Squeezy, popuni `mor_product_id`, ožiči
  `supabaseUrl`/checkout/report endpointe u konfiguraciji. Tek to gasi "free daje sve".
- Copy: uokviri besplatni check kao "provjera kompatibilnosti prije naplate" (uzorak od
  PaperChecka, [COMPETITORS.md](../COMPETITORS.md)) i istakni Thesis Pass kao primarni izbor.

### Faza 2: co-pilot putovanje (retencija) — GOTOVO (jezgra)
Ispravak naspram prvotnog nacrta: perzistencija je LOKALNA (localStorage), ne Supabase sloj.
Time se cuva isto obecanje kao Faza 1 i 4 (dokument ne napusta preglednik), a retencijska kuka
"score raste" i dalje radi.
- Re-check petlja s rastucim scoreom: GOTOVO. Cista logika u [src/history/progress.ts](../../src/history/progress.ts)
  (grupiranje po dokumentu labavim otiskom + putanja score-a), pokrivena testovima
  [tests/analysis-progress.test.ts](../../tests/analysis-progress.test.ts). Zica u
  [app.ts](../../src/ui/app.ts): `docFingerprint` na svakom zapisu povijesti, inline banner
  napretka odmah uz score (ukljucuje trenutnu analizu) i sazetak u modalu povijesti.
- Mentor-shareable: lokalni HTML izvoz vec postoji ("Preuzmi izvjestaj", za sebe ili mentora) i
  sada nosi liniju napretka. Hosted dijeljivi LINK ostaje deferiran: on salje sadrzaj izvjestaja
  na server pa trazi privolu i backend (Faza 4 teritorij).
- Descoped za sada: "nastavi bez ponovnog uploada" (resume). Trazi tesku lokalnu perzistenciju
  dokumenta (IndexedDB); re-upload petlja vec isporucuje vrijednost. Guided onboarding refinement
  (dijelom u [work-selection.ts](../../src/ui/work-selection.ts)) ostaje kao poliranje.

### Faza 3: registar i clarity (odluka B) — GOTOVO (deterministicka jezgra)
- Nova audit dimenzija [src/audits/register.ts](../../src/audits/register.ts): deterministicka,
  READ-ONLY i NE-GENERATIVNA. Zastavice: duge recenice (jasnoca), "od strane" (birokratski pasiv),
  kolokvijalizmi (s prijedlogom formalnije zamjene), prvo lice jednine (agregatni nudge "provjeri
  uputu kolegija", jer bezlicnost ovisi o profilu). Pokriveno [tests/register.test.ts](../../tests/register.test.ts).
- INFORMATIVNO: rezultat zivi u `details.registerLint` (kao typoLint), NE ulazi u bodovnu ocjenu,
  ne salje se na mrezu (sanitize whitelist), i nikad ne prepisuje tekst. Prikaz u
  [app.ts](../../src/ui/app.ts) `renderRegisterLint` s izричitim caveatom "forma, ne sadrzaj".
- Granice rijeci bez lookbehind i bez ASCII `\b` (hrvatska dijakritika); golden nepromijenjen jer
  normalizeResult ne serijalizira `details`.
- Sljedeci korak (opcionalno): LLM-potpomognut registar iza cloud privole (Faza 4), i vezanje
  prvog lica uz profilnu zastavicu kad je uputa poznata.

### Faza 4: cloud integritetski modul (odluka A, najveći lift)
- Vidi [PHASE4_CLOUD_INTEGRITY.md](PHASE4_CLOUD_INTEGRITY.md). Supabase Edge + pgvector,
  cross-lingual embeddings, plagijat, AI-detekcija. Opt-in, uz privolu, iza plaćenog gatea.

### Faza 5: regionalno (Srbija, BiH) + i18n
- i18n sloj za UI copy; profili su data-driven pa su nove institucije unos podataka, ne kod.
  Prije ulaska provjeri detekcijski setup ciljne zemlje (plan, sekcija 7).

## 5. Otvorena pitanja i rizici integracije

1. Privacy/GDPR regresija je rizik broj 1. Nijedan cloud feature ne smije tiho slomiti lokalno
   obećanje. Privola po koraku je obavezna (Faza 4).
2. Integritetski backlash: registar i AI-detekcija moraju ostati ne-generativni i uokvireni kao
   mjerenje, ne optužba. Inače AI-detektor rizik iz plana (sekcija 4) ugrize korisnika.
3. Faza 4 je stvarni backend i trošak (hostani embeddingsi, API pozivi), ne klijentski feature.
   Zato je namjerno zadnja.
4. maturiraj.hr kanal: plan ga računa kao distribucijsku prednost, ali [CLAUDE.md](../../CLAUDE.md)
   kaže da ovaj kod "nema veze s maturiraj.hr". Potvrdi postoji li stvarni poslovni kanal prije
   nego launch plan ovisi o njemu.
5. Kozmetika: stariji docs (VISION.md) nose mojibake u dijakritici; vrijedi ih jednom re-encodati
   u čisti UTF-8.

# LEKTA — Monetizacijska arhitektura V1

**Status:** prijedlog za implementaciju  
**Datum:** 2026-09-27  
**Cilj:** pretvoriti postojeći Lekta sustav naplate (`slot`, `pass`, `bundle`, `premium_human`) u jasnu ponudu koja naplaćuje konkretan ishod korisniku, a ne samo trajanje pristupa.

---

## 1. Glavno načelo

Lekta ne treba naplaćivati svaku novu tehničku funkciju zasebno. Korisnik ne kupuje AI, Laya model, hashiranje, Word gate, source provenance ili pojedinačni fixer.

Korisnik kupuje rezultat:

> **„Mogu li ovaj rad sigurno dovesti do verzije spremne za predaju?”**

Monetizacijski model zato ima četiri jasna sloja:

1. **Free** — otkriva stvarno stanje rada.
2. **Repair** — popravlja jednu fazu/verziju rada.
3. **Final Pass** — prati isti rad kroz cijeli proces do predaje/obrane.
4. **Expert** — ljudski pregled samo onoga što automatika nije mogla pouzdano riješiti.

Seminarski rad zadržava zaseban **Semester Pass**, jer se kod njega češće plaća više različitih radova kroz semestar, a ne višemjesečni životni ciklus jednog rada.

---

# 2. Vrste rada i redoslijed

Lekta mora imati pet glavnih naplatnih vrsta rada:

```text
seminarski
završni
diplomski
specijalistički
doktorski
```

**Specijalistički je obavezno zaseban tier između diplomskog i doktorskog.**

Ne smije se mapirati na diplomski niti na doktorski jer:

- često ima vlastita fakultetska pravila;
- po opsegu i složenosti je tipično iznad diplomskog;
- ne opravdava uvijek cijenu doktorskog rada;
- mora imati zaseban profil, entitlement, cijenu i analytics segment.

---

# 3. Preporučeni javni cjenik

| Paket | Seminarski | Završni | Diplomski | Specijalistički | Doktorski |
|---|---:|---:|---:|---:|---:|
| **Free** | 0 € | 0 € | 0 € | 0 € | 0 € |
| **Repair** | **3,99 €** | **5,99 €** | **9,99 €** | **16,99 €** | **24,99 €** |
| **Final Pass** | — | **12,99 €** | **19,99 €** | **29,99 €** | **39,99 €** |
| **Expert** | — | od **29,99 €** | od **39,99 €** | od **49,99 €** | individualno / od **69,99 €** |

Dodatno:

- **Semester Pass (seminarski): 14,99 €** — više seminarskih radova u jednom semestru.
- Bundleovi za partnere/tutore mogu ostati izvan glavnog studentskog cjenika.

### Zašto 16,99 € za specijalistički Repair?

Cijena ga jasno smješta između diplomskog (9,99 €) i doktorskog (24,99 €), uz dovoljno prostora da Final Pass od 29,99 € ima smislen premium.

### Zašto 29,99 € za specijalistički Final Pass?

Specijalistički rad tipično ima dulji životni ciklus, više institucionalnih pravila i više revizija od standardnog diplomskog rada, ali je i dalje racionalno jeftiniji od doktorskog Final Passa.

---

# 4. FREE — 0 €

Free mora biti dovoljno dobar da korisnik vjeruje Lekti i razumije zašto bi platio.

## Korisnik dobiva

- lokalni upload i analizu bez prijave;
- odabir fakulteta, programa i vrste rada;
- ukupni rezultat;
- rezultate po kategorijama;
- sve pronađene nalaze;
- lokaciju problema kad je pouzdano poznata;
- oznaku za svaki nalaz:
  - automatski popravljivo,
  - traži potvrdu korisnika,
  - mora se riješiti ručno;
- informaciju koje je pravilo korišteno;
- osnovni inspection coverage — što Lekta nije mogla provjeriti.

## Free ne dobiva

- popravljeni `.docx`;
- puni repair recipe;
- detaljni before/after;
- završnu Word provjeru popravljenog dokumenta;
- Citation Audit Pro;
- Submission Ready;
- povijest verzija kao premium funkciju;
- Verification Passport;
- ljudski Expert pregled.

## Paywall poruka

Ne koristiti generičko:

> Otključaj premium.

Koristiti stvarni rezultat dokumenta, npr.:

> **Lekta može automatski riješiti 14 od 22 nalaza.**  
> 4 nalaza trebaju tvoju potvrdu.  
> 4 moraš riješiti ručno.

Cijena se prikazuje tek nakon stvarne analize i poznate vrste rada.

---

# 5. REPAIR — postojeći `slot_*` proizvod

Repair je proizvod za korisnika koji ima gotovu ili gotovo gotovu verziju rada i želi je sada popraviti.

## Preporučene cijene

```text
slot_seminarski       3.99
slot_zavrsni          5.99
slot_diplomski        9.99
slot_specijalisticki 16.99
slot_doktorski       24.99
```

## Preporučeni prozori

```text
seminarski        7 dana
završni           7 dana
diplomski        14 dana
specijalistički  21 dan
doktorski        30 dana
```

Specijalistički dobiva dulji Repair prozor od diplomskog jer su revizije i formalni zahtjevi često složeniji, ali Repair i dalje nije puni višemjesečni proizvod.

## Repair uključuje

Sve iz Free, plus:

- sve sigurne automatske popravke;
- assisted zahvate koje korisnik potvrdi;
- popravljeni `.docx`;
- puni izvještaj;
- prikaz prije/poslije;
- changelog svake promjene;
- automatsku ponovnu analizu;
- rezultat prije → poslije;
- Word/DOCX integrity provjeru;
- ponovne provjere istog rada unutar prozora Repair proizvoda.

## Repair positioning

> **Rad ti je praktički gotov? Popravi ga sada i preuzmi novu provjerenu verziju.**

---

# 6. FINAL PASS — flagship proizvod

Final Pass nije samo dulji Repair slot.

Final Pass znači:

> **Lekta prati isti rad od sada do finalne predaje/obrane.**

## Cijene

```text
pass_zavrsni          12.99
pass_diplomski        19.99
pass_specijalisticki  29.99
pass_doktorski        39.99
```

## Trajanje

Preporučeno:

```text
završni          180 dana
diplomski        180 dana
specijalistički  240 dana
doktorski        365 dana
```

Alternativno se može krenuti konzervativnije sa 180 dana za sve osim doktorskog, ali specijalistički treba ostati skuplji i dulji od diplomskog.

## Final Pass uključuje

### A. Sve iz Repaira

- automatske popravke;
- assisted repair;
- novi `.docx`;
- before/after;
- re-check;
- Word truth/integrity dokaz.

### B. Neograničene verzije istog rada

```text
V1 mentor
  ↓
V2
  ↓
V3
  ↓
final
  ↓
predaja / obrana
```

Identitet rada ostaje vezan uz postojeći document fingerprint, ne uz hash pojedine datoteke.

### C. Version Intelligence

Za novu verziju Lekta prikazuje primjerice:

```text
+ 8 problema riješeno
+ 2 nova problema
= 1 problem se vratio
= 3 izmijenjena područja traže novu provjeru
```

To treba graditi na postojećem revision/history sustavu.

### D. Citation Audit Pro

Final Pass uključuje punu citation/reference provjeru:

- citat → literatura;
- literatura → citat;
- nepotpuni zapisi;
- duplikati;
- autor;
- godina;
- naslov;
- izdavač / časopis;
- volumen/broj;
- stranice;
- DOI;
- URL;
- datum pristupa gdje ga profil zahtijeva;
- fakultetski citation style;
- sekundarna Laya semantička provjera samo gdje je dokazano korisna.

**Laya nije zasebno naplativa stavka.** Ona samo poboljšava kvalitetu Final Passa / Citation Audita.

### E. Submission Ready

Poseban završni korak:

> **Pripremi paket za predaju**

Lekta sastavlja samo ono što konkretni profil zahtijeva.

Primjer:

```text
Ime_Prezime_Diplomski_rad.docx
Ime_Prezime_Diplomski_rad.pdf
Izjava_o_izvornosti.pdf
Metapodaci.docx
LEKTA_PROVJERA.html
UPUTE_ZA_PREDAJU.txt
```

Za specijalistički i doktorski paket ista logika, ali s njihovim pravilima i administrativnim dokumentima.

### F. Final Submission Gate

Poseban završni gumb:

> **Pokreni završnu provjeru za predaju**

Provjera uključuje:

- DOCX integrity;
- Word gate;
- sva primjenjiva pravila fakulteta;
- citate i literaturu;
- naziv datoteke;
- PDF/PDF-A zahtjev;
- administrativnu checklistu;
- obvezne izjave/metapodatke;
- preostale manual nalaze;
- inspection coverage / što nije bilo moguće provjeriti.

Ishod ne smije biti lažna tvrdnja „fakultet odobrava rad”.

Dopušteni UX:

```text
SPREMNO ZA PREDAJU
```

ili

```text
JOŠ 3 STVARI ZA PROVJERITI
```

uz jasno objašnjenje granica Lekte.

### G. Verification Passport

Final Pass korisnik dobiva provjerljivi paket dokaza.

Primjer:

```text
LEKTA VERIFICATION PASSPORT

Document SHA-256
Repaired document SHA-256
Profile ID
Profile revision
Academic year
Rule source hashes
Lekta version
Date/time
Checked: 48
Passed: 45
Manual: 2
Unknown: 1
Automatically repaired: 17
Word verification: PASS
```

Format:

- HTML za korisnika;
- JSON kao strojno čitljivi dokaz;
- opcionalni PDF kasnije.

Passport ne tvrdi da je fakultet odobrio rad. Dokazuje samo što je Lekta provjerila nad konkretnom datotekom i konkretnom verzijom pravila.

---

# 7. SEMESTER PASS — seminarski

Seminarski rad ne treba isti Final Pass model kao završni/diplomski/specijalistički/doktorski.

## Preporuka

```text
pass_semestralni = 14.99 €
```

Primjer prava:

- do 6 seminarskih radova;
- jedan semestar / 180 dana;
- svaki rad ima vlastiti slot;
- svaki slot ima repair + re-check;
- nema miješanja različitih radova pod isti fingerprint.

Semester Pass nije „jedan rad do obrane”, nego bundle za studenta koji tijekom semestra piše više radova.

---

# 8. EXPERT — ljudska eskalacija

Expert nije četvrti software tier nego ljudska eskalacija nakon automatike.

Lekta prvo odradi sve što može pouzdano.

Primjer:

```text
Automatski riješeno: 21
Assisted: 6
Manual: 4
Unknown: 1
```

Tek tada ponuditi:

> **Želiš da stručna osoba pregleda preostalih 5 stavki?**

## Preporučene cijene

### Završni

```text
do 5 manual/unknown nalaza: 29.99 €
6–15:                     39.99 €
više:                     na upit
```

### Diplomski

```text
do 5:   39.99 €
6–15:   49.99 €
više:   na upit
```

### Specijalistički

```text
do 5:   49.99 €
6–15:   69.99 €
više:   na upit
```

### Doktorski

```text
individualna ponuda
početna referentna cijena: 69.99 €+
```

## Expert ne radi

- pisanje diplomskog/specijalističkog/doktorskog sadržaja;
- generiranje argumenata;
- „humanizing” AI teksta;
- prikrivanje akademske nečestitosti.

Expert radi:

- formalne i tehničke manual nalaze;
- nejasne citatne/bibliografske slučajeve;
- provjeru outputa koji je Lekta označila kao `manual` ili `unknown`;
- eventualne tehničke Word intervencije ako su u dogovorenom opsegu.

---

# 9. Postojeći `premium_human`

Današnji generički:

```text
premium_human = 49.00 €
```

nije dovoljno precizan.

Treba ga zamijeniti ili proširiti s jasnijim SKU-ovima, npr.:

```text
expert_zavrsni_small
expert_zavrsni_standard
expert_diplomski_small
expert_diplomski_standard
expert_specijalisticki_small
expert_specijalisticki_standard
expert_doktorski_custom
```

Ili zadržati jedan backend `premium_human` proizvod, ali cijenu i scope generirati serverski iz broja i vrste manual nalaza.

Za V1 je jednostavnije imati nekoliko eksplicitnih SKU-ova.

---

# 10. Ukloniti kanibalizirajuće `*_do_obrane` SKU-ove

Trenutačno postoje:

```text
slot_zavrsni_do_obrane
slot_diplomski_do_obrane
```

ali ih postojeći `pass_*` proizvodi cjenovno i vremenski dominiraju.

Primjer sadašnjeg problema:

```text
slot_zavrsni_do_obrane  9.99 € / 120 dana
pass_zavrsni            9.99 € / 180 dana
```

te:

```text
slot_diplomski_do_obrane 16.99 € / 120 dana
pass_diplomski           14.99 € / 180 dana
```

## Odluka V1

Deaktivirati:

```text
slot_zavrsni_do_obrane
slot_diplomski_do_obrane
```

Ne uvoditi `slot_specijalisticki_do_obrane` niti `slot_doktorski_do_obrane`.

Koncept „do obrane” pripada **Final Passu**, ne trećem međuproizvodu.

---

# 11. Novi preporučeni retail katalog

```text
slot_seminarski             3.99
slot_zavrsni                5.99
slot_diplomski              9.99
slot_specijalisticki       16.99
slot_doktorski             24.99

pass_zavrsni               12.99
pass_diplomski             19.99
pass_specijalisticki       29.99
pass_doktorski             39.99

pass_semestralni           14.99

expert_zavrsni_small       29.99
expert_zavrsni_standard    39.99
expert_diplomski_small     39.99
expert_diplomski_standard  49.99
expert_spec_small          49.99
expert_spec_standard       69.99
expert_doktorski_custom    on_request
```

Bundleove i partner proizvode zadržati izvan glavnog studentskog cjenika.

---

# 12. Potrebna promjena tipova rada u kodu

Današnji `ReportWorkType` mora se proširiti:

```ts
export type ReportWorkType =
  | 'seminarski'
  | 'zavrsni'
  | 'diplomski'
  | 'specijalisticki'
  | 'doktorski';
```

Preporučeni `WORK_TYPE_TIERS`:

```ts
export const WORK_TYPE_TIERS = {
  seminarski: {
    workType: 'seminarski',
    label: 'Seminarski rad',
    priceEur: 3.99,
    windowDays: 7,
  },
  zavrsni: {
    workType: 'zavrsni',
    label: 'Završni rad',
    priceEur: 5.99,
    windowDays: 7,
  },
  diplomski: {
    workType: 'diplomski',
    label: 'Diplomski rad',
    priceEur: 9.99,
    windowDays: 14,
  },
  specijalisticki: {
    workType: 'specijalisticki',
    label: 'Specijalistički rad',
    priceEur: 16.99,
    windowDays: 21,
  },
  doktorski: {
    workType: 'doktorski',
    label: 'Doktorski rad',
    priceEur: 24.99,
    windowDays: 30,
  },
};
```

Redoslijed:

```ts
export const WORK_TYPE_ORDER = [
  'seminarski',
  'zavrsni',
  'diplomski',
  'specijalisticki',
  'doktorski',
] as const;
```

Treba provjeriti sve DB `CHECK` constraintove koji danas dopuštaju samo:

```text
seminarski / zavrsni / diplomski / doktorski
```

te ih migracijom proširiti na `specijalisticki`.

---

# 13. Feature-set / offer-code arhitektura

Ne vezati funkcije izravno uz `product.kind`.

Zabranjeni obrazac:

```ts
if (product.kind === 'pass') {
  unlockEverything();
}
```

Umjesto toga svaki proizvod treba imati verzionirani `offer_code`.

Primjeri:

```text
repair_v1
final_pass_v1
semester_pass_v1
expert_v1
```

## `repair_v1`

```text
full_report
repair
repair_diff
recheck
```

## `final_pass_v1`

```text
full_report
repair
repair_diff
recheck
revision_history
revision_compare
citation_audit
submission_ready
verification_passport
final_submission_gate
```

## `semester_pass_v1`

```text
multi_document_slots
full_report
repair
repair_diff
recheck
```

## `expert_v1`

```text
human_review
```

## Snapshot prava

`offer_code` ili izvedeni capability snapshot mora se zapisati uz entitlement pri kupnji.

Time buduća promjena proizvoda ne oduzima korisniku ono što je kupio.

---

# 14. Upgrade Repair → Final Pass

Ovo je obavezno.

Ako korisnik prvo kupi Repair, ne smije biti kažnjen jer nije odmah odabrao skuplji paket.

Primjer za diplomski:

```text
Repair      9.99 €
Final Pass 19.99 €

Upgrade nakon Repaira = 10.00 €
```

Za specijalistički:

```text
Repair      16.99 €
Final Pass 29.99 €

Upgrade = 13.00 €
```

Za završni:

```text
Repair      5.99 €
Final Pass 12.99 €

Upgrade = 7.00 €
```

Za doktorski:

```text
Repair      24.99 €
Final Pass 39.99 €

Upgrade = 15.00 €
```

## Pravilo

```text
upgrade_price = target_final_pass_price - already_paid_eligible_amount
```

Nikad ne naplatiti puni Final Pass ponovno ako korisnik nadograđuje isti dokument/work type.

---

# 15. Kontekstualni upsell

Ne prikazivati četiri velika paketa prije nego Lekta zna išta o radu.

Proces:

```text
UPLOAD
  ↓
FREE ANALYSIS
  ↓
STVARNO STANJE RADA
  ↓
PERSONALIZIRANA PONUDA
```

Primjer:

> Pronašli smo **18 nalaza**.  
> 13 možemo automatski popraviti.  
> 3 traže tvoju potvrdu.  
> 2 moraš provjeriti sam.

CTA:

> **Popravi sada — 9,99 €**

Ispod:

> Mentor još može tražiti izmjene?

> **Final Pass — 19,99 €**  
> Sve verzije ovog diplomskog rada do predaje.

Za specijalistički ista logika s 16,99 / 29,99 €.

---

# 16. Upsell nakon uspješnog Repaira

Najbolji trenutak za Final Pass upsell je nakon stvarnog dokaza vrijednosti.

Primjer:

```text
Rezultat prije: 71
Rezultat poslije: 91

Automatski riješeno: 13
Preostalo manual: 3
```

Tada:

> **Nadogradi na Final Pass za još 10,00 €**  
> Sve buduće verzije, Citation Audit i Submission Ready do predaje.

Za specijalistički:

> **Nadogradi na Final Pass za još 13,00 €**

---

# 17. Kako prikazati Repair vs Final Pass

Primjer za diplomski:

## Repair — 9,99 €

- jedna faza rada;
- 14 dana re-checka;
- popravak;
- before/after;
- puni izvještaj.

## Final Pass — 19,99 €

**Preporučeno ako mentor još može tražiti izmjene.**

- 180 dana;
- sve verzije istog rada;
- repair svaki put;
- revision intelligence;
- Citation Audit Pro;
- Submission Ready;
- Verification Passport;
- Final Submission Gate.

Ne koristiti `Najpopularnije` dok stvarni podaci to ne potvrde.

---

# 18. Specijalistički UX

Specijalistički se mora prikazivati kao zasebna vrsta rada u:

- profile pickeru;
- pricing selectoru;
- checkoutu;
- entitlementu;
- product katalogu;
- analytics događajima;
- reportu;
- revision identitetu;
- Submission Ready logici;
- Verification Passportu;
- Final Submission Gateu;
- Expert narudžbi.

Ne koristiti fallback:

```text
specijalistički → diplomski
```

ili:

```text
specijalistički → doktorski
```

Ako profil nije dovoljno verificiran, treba prikazati `unknown/limited coverage`, ne mapirati ga na drugu vrstu rada.

---

# 19. Citation Audit kao zaseban SKU

U V1 **ne uvoditi** zaseban Citation Audit proizvod.

Razlog:

- previše izbora na paywallu;
- Citation Audit je odličan razlog za Final Pass;
- prvo treba izmjeriti stvarnu potražnju.

Kasnije, ako podaci pokažu jaku skupinu korisnika koja želi samo bibliografiju/citate:

```text
citation_audit_standalone = 6.99 €
```

može postati zaseban proizvod.

---

# 20. Laya se ne prodaje kao AI add-on

Ne uvoditi:

```text
AI Review +2,99 €
Laya Pro +3,99 €
```

Korisnik plaća rezultat, ne model.

Laya se koristi samo ako dokazano poboljšava:

- Citation Audit;
- semantic finding adjudication;
- smanjenje false-positive manual nalaza.

---

# 21. Referral / Pass bonus

Današnji `pass_bonus` od -20% korisnije je pretvoriti u društveni referral nego u popust na „drugi diplomski”.

Preporuka:

> **Pokloni prijatelju 20% popusta.**

Ako prijatelj kupi:

- kupac također dobiva kredit/popust za sljedeći Lekta proizvod;
- reward mora biti refund-safe;
- pending referral nagrada mora biti otkazana kod punog povrata izvornog paymenta.

Ovo je obavezno uskladiti s postojećim F21 payment nalazom prije produkcije.

---

# 22. Partner/tutor bundleovi

Postojeći bundleovi mogu ostati, ali ih ne prikazivati studentima kao glavni cjenik.

Namjena:

- lektori;
- konzultanti;
- studentske udruge;
- kopirnice;
- edukacijski partneri.

Kasnije mogu dobiti zaseban Partner portal.

---

# 23. Institucionalni plan

Nije dio retail launch V1, ali arhitektura ne smije zatvoriti put prema B2B modelu.

Mogući budući paket:

```text
LEKTA INSTITUTION
```

Uključuje:

- institution rule publisher;
- verificirane profile;
- versioned rules;
- institution dashboard;
- API/SDK;
- usage analytics bez sadržaja studentskih radova;
- custom deployment / DPA;
- SLA.

Cijena: individualna, godišnja licenca.

---

# 24. Minimalne promjene baze

Potrebno je barem:

1. dodati `specijalisticki` u `products.work_type` CHECK constraint;
2. dodati novi `slot_specijalisticki`;
3. dodati novi `pass_specijalisticki`;
4. dodati `pass_doktorski` ako ne postoji;
5. deaktivirati `slot_zavrsni_do_obrane`;
6. deaktivirati `slot_diplomski_do_obrane`;
7. uvesti `offer_code` ili ekvivalentni versioned capability identifier;
8. snapshotirati capability/offer uz entitlement;
9. omogućiti upgrade payment koji priznaje prethodno plaćeni iznos;
10. proširiti sve work_type validatore i testove na `specijalisticki`.

Sve migracije moraju biti idempotentne i slijediti postojeću Lekta migracijsku disciplinu.

---

# 25. Preporučeni novi proizvodi u bazi

Pseudo-SQL / ciljno stanje:

```text
slot_seminarski
  kind=slot
  work_type=seminarski
  price=3.99
  window=7
  offer_code=repair_v1

slot_zavrsni
  kind=slot
  work_type=zavrsni
  price=5.99
  window=7
  offer_code=repair_v1

slot_diplomski
  kind=slot
  work_type=diplomski
  price=9.99
  window=14
  offer_code=repair_v1

slot_specijalisticki
  kind=slot
  work_type=specijalisticki
  price=16.99
  window=21
  offer_code=repair_v1

slot_doktorski
  kind=slot
  work_type=doktorski
  price=24.99
  window=30
  offer_code=repair_v1

pass_zavrsni
  kind=pass
  work_type=zavrsni
  price=12.99
  window=180
  offer_code=final_pass_v1

pass_diplomski
  kind=pass
  work_type=diplomski
  price=19.99
  window=180
  offer_code=final_pass_v1

pass_specijalisticki
  kind=pass
  work_type=specijalisticki
  price=29.99
  window=240
  offer_code=final_pass_v1

pass_doktorski
  kind=pass
  work_type=doktorski
  price=39.99
  window=365
  offer_code=final_pass_v1

pass_semestralni
  kind=pass
  work_type=seminarski
  price=14.99
  slots_total=6
  offer_code=semester_pass_v1
```

---

# 26. Što ne naplaćivati zasebno

Ne raditi zaseban SKU za:

- Laya;
- AI evidence;
- source provenance;
- Word truth gate;
- hashove;
- brži analyzer;
- pojedinačne sitne fixere;
- inspection coverage;
- sigurnosne zaštite.

Sve to povećava vrijednost glavnih proizvoda i kvalitetu Lekte.

---

# 27. Funnel

```text
                 ┌──────────────┐
                 │     FREE     │
                 │ analiza 0 €  │
                 └──────┬───────┘
                        │
               stvarni repair potential
                        │
            ┌───────────┴────────────┐
            ▼                        ▼
        REPAIR                    FINAL PASS
     3,99–24,99 €              12,99–39,99 €
      jedna faza                  do predaje
          │                           │
          │                  revisions + citations
          │                   + submission + proof
          │                           │
          └───────────┬───────────────┘
                      ▼
               manual / unknown?
                 /          \
               ne            da
               │              │
               ▼              ▼
            GOTOVO          EXPERT
                          29,99–69,99+
```

Specijalistički se u funnelu ponaša kao zasebna puna premium kategorija između diplomskog i doktorskog.

---

# 28. Redoslijed implementacije

## Monetization V1

1. Dodati `specijalisticki` kao punopravni work type kroz kod i bazu.
2. Dodati `slot_specijalisticki`.
3. Dodati `pass_specijalisticki`.
4. Dodati/urediti `pass_doktorski`.
5. Deaktivirati oba `*_do_obrane` proizvoda.
6. Uvesti `offer_code` / versioned feature-set.
7. Snapshotirati prava pri kupnji.
8. Implementirati Repair → Final Pass upgrade s priznavanjem već plaćenog iznosa.
9. Final Pass spojiti na postojeće revision/history funkcije.
10. Dodati Submission Ready.
11. Dodati Citation Audit Pro.
12. Dodati Verification Passport.
13. Dodati Final Submission Gate.
14. Tek nakon stvarnih podataka uvesti granularni Expert katalog.

---

# 29. Acceptance kriteriji za V1 launch

Monetizacijski V1 nije spreman dok nije dokazano:

- Free analiza radi bez naplate;
- `specijalisticki` prolazi kroz cijeli pricing/catalog/checkout/entitlement tok;
- svaki Repair SKU daje točno jedan slot odgovarajuće vrste rada;
- Final Pass ne može se primijeniti na drugi rad;
- Final Pass prihvaća novu verziju istog rada;
- upgrade ne naplaćuje ponovno već plaćeni Repair iznos;
- `offer_code` se snapshotira pri kupnji;
- promjena budućeg kataloga ne oduzima staro pravo;
- deaktivirani `*_do_obrane` proizvodi više se ne nude;
- Stripe iznos dolazi samo iz serverskog `products.price_eur`;
- refund zatvara entitlement i sve vezane referral/bonus posljedice;
- `specijalisticki` ima zaseban analytics segment;
- niti jedan proizvod ne tvrdi da je fakultet službeno odobrio rad;
- Expert pregled ne obećava akademsko pisanje ili izmjenu sadržaja.

---

# 30. Konačna preporuka

Glavni studentski cjenik treba ostati jednostavan:

```text
FREE
REPAIR
FINAL PASS
EXPERT
```

Vrste rada:

```text
Seminarski
Završni
Diplomski
Specijalistički
Doktorski
```

Najvažniji proizvod treba biti **Final Pass**, a ne pojedinačni fixer ili AI dodatak.

Za specijalistički preporuka je:

```text
Repair:     16,99 €
Final Pass: 29,99 €
Expert:     od 49,99 €
```

Time je jasno i dosljedno pozicioniran između diplomskog i doktorskog rada, bez potrebe da ga se umjetno mapira na neku drugu kategoriju.

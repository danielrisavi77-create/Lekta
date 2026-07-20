# Plan: provjera postojanja domaćih izvora kroz M4 korpus (plaćeno, uz repair)

Status: **nacrt za odobrenje**, ništa nije implementirano. Vlasnikova odluka (2026-07-20):
značajka je **plaćena** i ulazi u **isti go-live** kao automatski popravak, ne kao v1.1.

Prateći dokument: [GO_LIVE_REPAIR.md](GO_LIVE_REPAIR.md) (runbook), koji ovaj plan dopunjuje.

---

## 1. Cilj

Platiša uz popravljeni dokument dobiva i odgovor na pitanje **postoje li izvori koje je naveo**,
i to za hrvatske reference koje CrossRef ne indeksira. Danas za njih vraćamo `not-indexed`
(„provjeri ručno"), što je pošteno ali šuti točno ondje gdje hrvatski student ima najviše
literature.

### Što ovo NIJE

- **Nije provjera plagijata** ni sličnost punog teksta. Odgovara samo „postoji li ovaj rad".
- **Nije ocjena točnosti navoda** (stranice, izdanje, format citata).
- **Nije besplatna značajka.** Besplatni sloj ostaje nepromijenjen i 100% lokalan.

---

## 2. Zatečeno stanje (izmjereno, ne pretpostavljeno)

Korpus `lekta-pipeline/korpus.db`:

| Dio | Veličina / broj | Treba li nam |
|---|---|---|
| `works` (metapodaci) | 526.370 redaka, **122 MB** | **DA**, ovo je sve što treba |
| najuži skup (naslov+autori+godina+URL) | **73 MB** | alternativa ako se štedi |
| `fingerprints` | 4.565.465 redaka | NE (sličnost punog teksta) |
| `corpus_fts` + ostalo | ~1,2 GB | NE |
| **ukupno datoteka** | **1354 MB** | zavarava, vidi gore |

Bitno: raniji strah od „1,4 GB na kritičnom putu" **ne vrijedi za ovu značajku**. Treba
~122 MB, što stane u postojeći Supabase bez novog poslužitelja.

Usput utvrđeno: `has_fulltext = 0` za **svih 526.370** zapisa, tj. backfill punog teksta je
napisan ali nikad izvršen. Za ovu značajku nebitno, ali forenzički modul nije napunjen.

### Što već postoji i ponovno se koristi

- `src/citations/verify-existence.ts`: `titleSimilarity` (bigram-Dice), `looksCroatian`,
  tipovi `ExistenceVerdict`/`ExistenceResult`, `verdictFromCandidates`. **Bodovanje je već u
  TypeScriptu**, pa server ne treba Python.
- `details.references` iz analize: `{ raw, p, author, year }` po jedinici (već golden-safe).
- `src/citations/verify-badges.ts`: dijeljene značke za 5 verdikta (alat i analizator).
- `supabase/functions/repair-docx/index.ts` (246 redaka): prima `multipart/form-data`
  (`file` + `meta` JSON), radi popravak, po potrebi pohranjuje job.
- Referentna semantika u `lekta-pipeline/lekta_pipeline/modules/m2_references.py`:
  kandidati `title_hits(min_ratio=0.55, top=5)`, zatim `>= 0.80` VERIFIED, `>= 0.60` LIKELY,
  inače **fall-through** (nikad lažni NOT_FOUND). Ovaj plan to preslikava 1:1.

---

## 3. Arhitektura

Podatkovni put, bez ijednog novog klijentskog mrežnog puta:

```
klijent (analiza je već izračunala details.references)
   -> uz postojeći repair job posalje reference u `meta` (sitan JSON, bez teksta rada)
      -> repair-docx (Edge): popravi dokument, pa pretrazi corpus_works u Postgresu
         -> bodovanje istim titleSimilarity iz verify-existence.ts
            -> presude se vracaju u odgovoru joba (polje `sourceCheck`)
               -> UI: sekcija "Provjera izvora" u placenom rezultatu
```

Zašto tako:

- **Privatnost ne trpi novi ustupak.** Plaćeni repair **već** uploada cijeli `.docx`, pa je
  slanje metapodataka referenci strogo manje otkrivanje od već pristanog. Besplatni sloj se ne
  dira, tvrdnja „ništa se ne šalje" ostaje istinita.
- **Nema novog endpointa ni CSP izmjene**, jer se sve vozi na postojećem repair pozivu.

Razmotreno i odbačeno: **ekstrakcija referenci na serveru** iz uploadanog docx-a. Klijent ih
već ima, pa bi to bio dvostruki posao i dodatna Edge cijena bez dobiti.

---

## 4. Radni tokovi

Svaki je samostalan, s vlastitim „gotovo". Sve se gradi **inertno**: dok tablica ne postoji,
značajka je tiho isključena i ponašanje je današnje.

### K1. Shema i uvoz korpusa

- Migracija `0030_corpus_works.sql` po uzoru na `0026`: tablica `corpus_works`
  (`doc_id`, `source_id` UNIQUE, `title`, `authors`, `year`, `institution`, `url`, `repo`, `kind`).
- Indeks za dohvat kandidata: `pg_trgm` GIN na `title` (ili `tsvector`), ekvivalent današnjem
  FTS5 `MATCH` + bm25.
- RLS: **bez ikakve klijentske politike**. Čita samo service role iz Edge funkcije, jer je
  značajka plaćena i klijent nikad ne pretražuje korpus izravno.
- Skripta `scripts/import-corpus.mjs`: čita `works` iz `korpus.db`, puni Postgres u serijama.

**Gotovo kad:** 526.370 redaka u Postgresu, upit po naslovu ispod ~200 ms, migracija
verificirana po obrascu `0026`.

### K2. Čista jezgra pretrage i presude (dokaziva lokalno, bez deploya)

- Novi `src/citations/corpus-verify.ts`: prima referencu i **injektiran dohvat kandidata**
  (da se testira bez baze), boduje `titleSimilarity` iz `verify-existence.ts`, vraća postojeći
  `ExistenceResult` uz `source: 'korpus'`.
- Pragovi **1:1 s pipelineom**: kandidati `min_ratio 0.55`, `top 5`; `>= 0.80` = pronađeno,
  `>= 0.60` = vjerojatno, inače **fall-through** na postojeći ishod.

**Gotovo kad:** unit testovi zeleni, uključujući zamke da promašaj **ne** proizvodi „ne postoji",
`npm run check` zelen.

**Provjereno nad pravim korpusom (526k), 2026-07-20:**

| Slučaj | Ishod |
|---|---|
| točan naslov iz korpusa (6 uzoraka) | `found` 1,00 svih 6 |
| kraćeno/neuredno citirano (kao student) | `found` 0,83 do 1,00, jedan `weak` 0,75, nijedan promašen |
| izmišljeni naslovi (3) | **bez presude** sva 3, nijedan lažni pogodak |

Pragovi 0,60 i 0,80 dakle rade na stvarnim hrvatskim naslovima, u oba smjera.

### K3. Ožičenje u `repair-docx`

- `meta` dobiva neobavezno polje `references` (ograničenje broja i veličine, po uzoru na
  postojeći `rawReqs.length > 64` gard).
- Nakon popravka: dohvat kandidata, presude, u odgovor kao `sourceCheck`.
- **Fail-open**: greška ili nepostojeća tablica ne ruše popravak (isto kao `storeRepairJob`
  koji vraća `null`).

**Gotovo kad:** `deno check` bez novih grešaka; bez tablice se ponaša kao danas.

### K4. UI u plaćenom rezultatu

- Sekcija „Provjera izvora" sa značkama iz `verify-badges.ts`.
- Vidljiv i iskren caveat o dosegu korpusa (vidi 5).

**Gotovo kad:** DOM test, `npm run check` zelen.

### K5. Pravno, copy i runbook

- Redak u privatnosti/uvjetima: metapodaci referenci provjeravaju se u našem korpusu
  (dokument se ionako već uploada).
- Dopuna `GO_LIVE_REPAIR.md`: novi korak (uvoz korpusa) u Fazu 1.

**Gotovo kad:** pravne stranice generirane u `dist/`, runbook ažuriran.

---

## 5. Semantika presuda (tvrdo pravilo)

Korpus je **Hrčak + Dabar, 526k radova**. Knjige, strani izvori, stariji radovi i zbornici
uglavnom nisu unutra. Zato:

| Situacija | Ishod | Poruka |
|---|---|---|
| sličnost >= 0,80 | pronađeno | „Pronađeno u hrvatskom korpusu (ustanova)" + poveznica |
| 0,60 do 0,80 | vjerojatno | traži potvrdu, prikaži nađeni naslov |
| promašaj | **ostaje današnji ishod** | `not-indexed` / `not-found`, **nikad „izmišljeno"** |
| greška ili nedostupnost | `unchecked` | fall-through, bez lažne sigurnosti |

**Promašaj u korpusu nije dokaz da izvor ne postoji.** Ista disciplina koju već primjenjujemo
kod CrossRefa.

**Gard integriteta:** besplatni `not-indexed` ishod danas je pošten i točan. Ne smije se
pogoršati ni dramatizirati da bi nadogradnja izgledala potrebnijom. Dodajemo mogućnost i
pošteno je najavimo.

---

## 6. Otvorena pitanja za vlasnika

1. **Supabase plan.** 122 MB plus indeksi je vjerojatno oko 250 MB. Besplatni tier ima 500 MB,
   ali projekt već koristi pg_cron i Storage. Potvrditi tier prije uvoza.
2. **Svježina korpusa.** Ovo je snimka. v1 = ručno osvježavanje harvestom; automatski
   periodični uvoz je kasniji posao.
3. **Besplatna beta.** Uz `REPAIR_FREE_MODE=true` korpus vozi besplatno zajedno s repairom
   (prihvaćeno). Volumen je tad malen, ali neka bude namjerno.
4. **Očekivanja u copyju.** Pokrivenost je hrvatski repozitoriji, ne sve na svijetu. To mora
   biti jasno napisano da ne obećamo previše.
5. **Brzina dohvata kandidata NIJE dokazana.** U probe-u nad SQLiteom (FTS5, `OR` po svim
   tokenima naslova) upit je trajao **oko 3 sekunde**, ne ispod 200 ms. To ne ruši dizajn, jer
   Postgres `pg_trgm` GIN radi drugim mehanizmom, ali znači da se brzina **mora izmjeriti nakon
   uvoza** i po potrebi popraviti (npr. `similarity` prag na razini upita, ograničenje kandidata,
   ili predfiltar po godini). Ako ispadne spora, K3 mora imati kratak timeout i fail-open, da
   provjera izvora nikad ne produži popravak preko Edge limita.

---

## 7. Redoslijed

K1 i K2 su neovisni i idu paralelno. K2 se cijeli dokazuje lokalno, bez ijednog deploya, pa je
najbolji prvi korak. Zatim K3, K4, K5.

Ništa se ne pali dok se u go-liveu ne flipne zastavica, isto kao WS-1 do WS-7.

**Definicija gotovosti cijelog paketa:** `npm run check` zelen, golden bez churna, značajka
inertna do flipa, runbook dopunjen.

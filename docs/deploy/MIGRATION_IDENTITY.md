# Migracijski identitet: dijagnoza i odluka

Datum: 17. kolovoza 2026. Grana: `fix/audit-remediation-2026-08`.
Nalaz iz audita: A26-04, A26-05 (vidi `docs/AUDIT_MASTER.md`, poglavlje 4A).

Dokazi u ovom dokumentu generirani su s `npm run migration-identity`; strojni ispis je
`docs/generated/MIGRATION_IDENTITY.md` i on je mjerodavan kad se razidju.

## 1. Sto je audit tvrdio

> "Repo sadrzi 85 numeriranih migracija, dok je stvarna produkcijska migracijska povijest
> zavrsavala priblizno na sadrzaju migracije 0061. To znaci da promjene 0062-0085 nisu
> dokazano primijenjene na produkciju."

Zakljucak je bio preuranjen, a polazna opservacija tocna: produkcija doista pamti verzije
poput `20260805223216`, a repo koristi `0001`..`0085`.

## 2. Sto je stvarno

**Verzija nije identitet migracije u ovom projektu.** Stupac `name` u
`supabase_migrations.schema_migrations` cuva ime migracije, a verzija ovisi iskljucivo o
tome KOJIM je putem migracija primijenjena:

| Put primjene | Verzija | Ime |
|---|---|---|
| `supabase db push` (CLI) | redni broj iz imena datoteke (`0001`) | `monetization` |
| MCP `apply_migration` | timestamp (`20260719004453`) | `0001_monetization` |

Kad se usporedjuje po IMENU (uz normalizaciju: makni vodeci broj, prefiks `Lekta:`,
razmake i velika slova), slika je posve drugacija od zatecene:

| Okruzenje | Zapisa u bazi | Poklopljeno | Nedostaje | Samo u bazi | Dvaput primijenjeno |
|---|---|---|---|---|---|
| produkcija | 67 | 67 | 23 | 0 | 0 |
| staging | 105 | 67 | 23 | 0 | **38** |

### 2.1 Nije "0062-0085 nije primijenjeno"

Od 23 migracije koje produkcija nema, **nijedna nije slucajno izostavljena**:

- `0018_integrity.sql`, `0023_integrity_ip_hash.sql` (2): pripadaju integrity stupu.
  Funkcija `integrity-check` je oznacena INERTNO i nije deployana, pa je izostanak dosljedan.
- `0067`..`0085` (19): Katedra agentski ugovor i naplata. `katedra-agent-worker` takodjer nije
  deployan, dakle isto dosljedno stanje, a ne propust.
- `0011_faculty_requests.sql` i `0062_analytics_conversion_stat.sql` (2): **sadrzajno JESU u
  produkciji**, samo zavedene pod drugim imenom. Provjereno izravno nad bazom:
  `to_regclass('public.faculty_requests')` nije null, a funkcije `submit_faculty_request` i
  `admin_beta_stats` postoje.

### 2.2 Sto JEST bio stvaran problem

1. **Pet migracija postojalo je samo u produkciji.** `academic_audit_insert_grants`,
   `academic_audit_insert_policies`, `academic_demo_usage`, `academic_demo_usage_hardening`,
   `academic_project_commercial_stages` primijenjene su izravno na zivu bazu (MCP, 5.8.2026.) i
   nikad nisu zapisane u repozitorij. Repozitorij zato nije mogao reproducirati produkcijsku
   shemu, pa ni jedan schema-diff ni test to nije mogao vidjeti kao ocekivano stanje.
   **Rijeseno**: vracene u repo kao `0086`..`0090`, doslovno iz
   `schema_migrations.statements`, sa zaglavljem koje objasnjava porijeklo.

2. **Staging je 38 migracija primijenio DVA PUTA**, jednom kroz `db push` (verzija `0001`, ime
   `monetization`) i opet 14.8.2026. kroz MCP (verzija `20260814020805`, ime
   `0001_monetization`). Proslo je samo zato sto su ti zahvati idempotentni. Migracijski
   dnevnik staginga od tada nije pouzdan izvor onoga sto je primijenjeno.

3. **`supabase db push` je neupotrebljiv na oba okruzenja**, jer usporedjuje po verziji i vidi
   85 nepoznatih datoteka nad bazom koja ih vecinu vec ima.

## 3. Odluka

Odabrana je opcija "popravi povijest", jer dijagnoza pokazuje da je shema uskladjena, a
pokvaren je samo dnevnik. Squash baseline bi bacio granularnu povijest zbog problema koji nije
u shemi, a prelazak na timestamp imena prepisao bi svih 90 datoteka i sve reference u
dokumentaciji, opet bez dobitka za samu shemu.

**Koraci (redoslijed je obavezan):**

1. (GOTOVO) Vrati u repo 5 migracija koje su postojale samo u produkciji: `0086`..`0090`.
2. (GOTOVO) Uvedi `npm run migration-identity` kao trajni dokaz stanja, da se drift vise ne
   moze akumulirati neopazeno.
3. **(RADNJA VLASNIKA, nije izvedena)** Uskladi dnevnik produkcije tako da verzija ponovno bude
   jednaka rednom broju iz imena datoteke. Zahvat dira ISKLJUCIVO dnevnik, ne shemu: nijedna
   tablica, funkcija ni politika se ne mijenja.

   **NE koristi `supabase migration repair --status applied`.** Ta naredba UMECE novi redak, pa
   bi uz svaku migraciju ostala i stara timestamp verzija i nova cetveroznamenkasta. Tocno to je
   stagingu proizvelo 38 dvostruko zavedenih migracija. Potreban je UPDATE postojeceg retka, koji
   cuva jedan redak po migraciji:

   ```sql
   update supabase_migrations.schema_migrations set version = '0001' where version = '20260719004453';
   -- ... i tako za svih 66 redaka
   ```

   Tocnu listu parova (66 redaka, plus `0053` koji je vec ispravan) ispisuje
   `npm run migration-identity`, u odjeljku "Poklopljeno po imenu, ali pod drugom verzijom".
   Provedi je u jednoj transakciji kroz Supabase SQL editor. Prije toga snimi zatecen dnevnik
   (`select version, name from supabase_migrations.schema_migrations`), jer je povrat samo
   obrnuti UPDATE.

   Napomena: izvorne i ciljne verzije se ne preklapaju (izvorne su 14-znamenkasti timestampi,
   ciljne cetveroznamenkasti brojevi), pa redoslijed UPDATE-a nije bitan i nema prijelaznih
   kolizija. Provjereno je i da nema dvije migracije koje bi ciljale na isti broj.
4. Za 23 neprimijenjene odluci svjesno, ne mehanicki: integrity (2) i Katedra (19) ostaju
   neprimijenjene dok se pripadne Edge funkcije ne deployaju; `0011` i `0062` oznaci kao
   `applied`, jer njihov sadrzaj u bazi vec postoji.
5. Staging izgradi IZNOVA iz produkcije umjesto da mu se dnevnik krpa: 38 dvostrukih zapisa
   nije moguce pouzdano razmrsiti, a staging nema podataka koje bi trebalo cuvati. Nakon toga
   na njega deployaj svih 21 Edge funkciju (danas ih ima 3).
6. Tek kad `npm run migration-identity` za oba okruzenja prijavi 0 nepodudaranja izvan svjesno
   prihvacenih (integrity + Katedra), `db push` se smije koristiti u redovnom radu.

## 4. Pravilo od sada

**Migracije se primjenjuju iskljucivo kroz `supabase db push`.** MCP `apply_migration` se ne
koristi nad Lektinim bazama: on stvara drugi identitet za isti zahvat i upravo je on
proizveo oba kvara opisana gore. Iznimka je istrazivanje nad bazom koja se smije baciti.

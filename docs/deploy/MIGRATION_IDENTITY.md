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

   **Gotov zahvat ispisuje alat**, pa se ne prepisuje rucno:

   ```
   LEKTA_PROD_REF=<ref> npm run migration-identity -- --emit-sql
   ```

   Ispisuje 66 `update` izjava u jednoj transakciji, svaku s imenom migracije u komentaru. Parovi
   dolaze iz ISTOG izracuna kao tablica u izvjestaju, pa se ispis i zahvat ne mogu razici. Alat
   zahvat NAMJERNO samo ispisuje, ne izvodi: odluka kad se dira zivi dnevnik pripada covjeku pred
   SQL editorom, ne skripti koja se moze pokrenuti slucajno.

   Zalijepi ispis u Supabase SQL editor i izvedi ga. Prije toga snimi zatecen dnevnik
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

## 3.1 Sto ceka na ovaj korak

Migracija `0094_repair_global_concurrency.sql` (globalna brana istodobnih popravaka, audit
DOCX-06) je NAPISANA i ceka isto usklađivanje. Bez njega bi `db push` uz tu jednu migraciju
povukao i 92 druge preko RLS-a, grantova i constraintova; sve su idempotentne, ali "vjerojatno
prezivi" nad 92 migracije nije nesto sto se otkriva na produkciji.

Kod je zato pisan tako da NE ovisi o redoslijedu isporuke: dok RPC ne postoji, `repair-docx` pada
natrag na per-instance gate uz glasan log, dakle na ponasanje kakvo je i danas. Cim `0094`
prodje, globalna brana se ukljucuje sama, bez ijedne izmjene koda.

## 4. Pravilo od sada

**Migracije se primjenjuju iskljucivo kroz `supabase db push`.** MCP `apply_migration` se ne
koristi nad Lektinim bazama: on stvara drugi identitet za isti zahvat i upravo je on
proizveo oba kvara opisana gore. Iznimka je istrazivanje nad bazom koja se smije baciti.

## `db push` uz verzije koje postoje samo u bazi (2026-09-06)

CLI odbija push dok baza ima verzije bez lokalne datoteke i nudi `migration repair --status reverted`, sto brise
retke iz dnevnika. Umjesto toga se podmetnu privremene NETRACKANE prazne datoteke s tim verzijama
(`<verzija>_privremeno_samo_u_bazi.sql`), push ide s `--include-all`, pa se datoteke izbrisu. Dnevnik ostaje
cijel, `migration-identity` i dalje broji te verzije pod "samo u bazi". Detalji i izmjereno stanje:
`docs/deploy/KANAL_A_UKLJUCIVANJE.md`.

## Raspon verzija: Lekta od 0200, Katedra 0104 do 0199 (2026-09-19)

Lektine migracije od 2026-09-19 nose prefiks od `0200` navise. Raspon `0104` do `0199` je
rezerviran za Katedru, koja na stagingu `bnyemcnsphlitjradrst` dijeli istu tablicu
`supabase_migrations.schema_migrations`. Razlog je isti kao u pravilu iznad: `db push`
odlucuje po VERZIJI, dakle po vodecem broju prije prvog `_`, pa Lektina datoteka s vec
zauzetom verzijom ne bi pala nego bi bila TIHO preskocena, a njezini objekti u bazi ne bi
nastali.

Izmjereno 2026-09-19: repozitorij je imao `0104_repair_local_claims`,
`0105_repair_local_lifecycle` i `0106_repair_local_claim_recovery`, a staging verzije `0104`
do `0114` (`agent_snapshot_privacy_and_cleanup` ... `agent_provider_execution_recovery`),
dakle sudar na sve tri. Produkcija `zrrjttizjyfcxmcpgzml` nema nijednu od tih sest, pa je
prenumeriranje u `0200`, `0201` i `0202` provedeno kao cisti rename u repozitoriju, bez
ijedne promjene SQL sadrzaja i bez diranja zive baze.

Gard je `tests/migration-numbering.test.ts` (`migrationRangeViolations`): svaka `.sql`
migracija s cetveroznamenkastim prefiksom ispod `0200` mora biti na popisu naslijedjenih
(103 datoteke, ratchet koji smije samo padati), inace test pada. Mutacija u istom testu
dokazuje da gard grize: privremena `0150_x.sql` pada, `0203_x.sql` prolazi.

## Stanje staginga izmjereno 2026-09-13 (Supabase MCP, samo citanje)

Staging projekt `bnyemcnsphlitjradrst` je vracen iz INACTIVE u ACTIVE_HEALTHY 2026-09-13,
nakon sto je vlasnik pauzirao projekt Matura app (free plan dopusta samo 2 aktivna projekta
odjednom). Produkcija `zrrjttizjyfcxmcpgzml` je pritom ostala netaknuta.

Migracijski identitet je izmjeren PO VERZIJI (repozitorij ima verzije 0001 do 0103, ukupno
103 datoteke). Staging ima primijenjenih 93 od tih verzija; nedostaju mu 0058, 0059, 0060 i
raspon 0086 do 0103, sto je ukupno 21 verzija. Staging uz to ima 11 verzija kojih u ovom
repozitoriju uopce nema: 0104 do 0114, sto su migracije Katedra agent i billing sustava iz
drugog repozitorija. Produkcija ima svih 103 verzije iz ovog repozitorija, plus jos 4 s
timestamp identitetom (20260830005406, 20260830195311, 20260830195452, 20260830195905), sto
je takodjer Katedra sprint.

Napomena o imenu: produkcija nosi verzije 0058 do 0060, 0063 i 0066 pod imenima koja pocinju s
"Lekta: ...", jer su povijesno primijenjene kroz `apply_migration`. Zbog toga usporedba po
IMENU iz `npm run migration-identity` to prijavljuje kao odstupanje, dok je stanje po VERZIJI
cisto.

Edge funkcije na stagingu pokrivaju 6 od 25 funkcija iz repozitorija: `repair-docx`,
`source-check`, `delete-repair-job` (verzija 3, deployana 2026-08-04), `cleanup-agent-payloads`,
`profile-rules` i `katedra-agent-worker`. Nedostaje njih 19, medju kojima `create-checkout`,
`webhook-mor`, `send-reminders` i `health`.

Blokator za sljedeci korak (`npx supabase db push --project-ref bnyemcnsphlitjradrst
--include-all`, jer remote nosi verzije 0104 i novije koje su novije od lokalnog stanja, pa
gard trazi i `npm run deploy-drift` i `npm run migration-identity` uz `LEKTA_STAGING_REF`):
`SUPABASE_ACCESS_TOKEN` u okolini ovog stroja vraca HTTP 401 na Management API, a Supabase CLI
nije instaliran na ovom stroju. Treba vazeci osobni pristupni token prije nego se push moze
pokrenuti. MCP `apply_migration` se za ovaj zahvat ne koristi, u skladu s tvrdim pravilom o
identitetu verzije iznad.

## Blokator 0059 na stagingu: nezasticen `cron.unschedule` i tvrd produkcijski kljuc (2026-09-20)

`npx supabase db push --linked --include-all` prema stagingu `bnyemcnsphlitjradrst` (24 migracije u
redu) prosao je 0058 i pao na 0059, na PRVOJ naredbi:

    ERROR: could not find valid entry for job send-deadline-reminders (SQLSTATE XX000)

Uzrok: `0059_secure_reminder_cron.sql` je bio jedan redak koji BEZUVJETNO zove
`cron.unschedule('send-deadline-reminders')`. Taj posao na stagingu nikad nije postojao, jer ga
nijedna migracija ne stvara: 0012 ga samo opisuje u komentiranom runbooku kao rucni korak. Migracija
time nije bila idempotentna, sto krsi tvrdo pravilo ovog repozitorija. Svih ostalih deset poziva
`cron.unschedule` u migracijama (0009, 0011, 0016 dva puta, 0018, 0019 dva puta, 0022, 0034, 0054)
vec je bilo zasticeno idiomom `begin ... exception when others then null; end;`; samo 0059 nije.

Drugi nalaz je tezi od blokatora. Ista je migracija u repozitoriju drzala PRODUKCIJSKI URL
(`https://<prod-ref>.supabase.co/functions/v1/send-reminders`) i PRODUKCIJSKI Bearer kljuc,
tvrdo upisane u tijelo cron naredbe. Da je push prosao, staging baza bi svaki dan u 8 h zvala
PRODUKCIJSKU funkciju za slanje podsjetnika i slala poruke stvarnim korisnicima.

### Popravak u repozitoriju

0059 je prepisana kao jedan `do $$` blok koji:

1. preskace sve uz `raise notice` ako pg_cron nije dostupan,
2. cita `lekta_functions_base_url` i `lekta_cron_bearer` iz `vault.decrypted_secrets` (i samo to
   citanje je zasticeno, jer vault ne mora postojati na lokalnom Postgresu),
3. ako ijedna tajna fali, javi `notice` i izade NE DIRNUVSI zatecen posao,
4. tek kad obje tajne postoje, gasi zatecen posao unutar
   `begin ... exception when others then null; end;`, pa nepostojanje posla vise nije greska,
   i zatim ga zakazuje ispocetka,
5. naredbu za cron slaze kroz `format(... %L ...)`. To nije kozmetika: `cron.schedule` prima
   naredbu kao TEKST koji se kasnije izvodi, pa je navodnjavanje jedina obrana od injekcije i od
   pucanja na apostrofu u vrijednosti tajne.

REDOSLIJED KORAKA 2 i 4 JE UGOVOR, ne stil. U prvoj izvedbi popravka unschedule je stajao PRIJE
citanja tajni, pa bi ponovno pokretanje 0059 na produkciji (gdje posao radi, a vault tajne jos
nisu postavljene) UGASILO posao i ne bi ga zamijenilo nicim: podsjetnici bi tiho prestali ici, a
migracija bi prijavila uspjeh. Nasao je adversarijalni pregled drugim alatom (codex), kako
`supabase/CLAUDE.md` i trazi za promjenu sigurnosne granice. Isti je pregled uocio i da je
pretraga `cron.unschedule` u gardu bila osjetljiva na velicinu slova, pa bi je `CRON.UNSCHEDULE(`
zaobislo. Oboje je popravljeno i pokriveno testom. Treci nalaz istog pregleda (slaganje niza
zaobilazi tekstualni gard) nije popravljiv tekstualnom provjerom i zato je izricito zapisan kao
granica garda u zaglavlju `tests/helpers/migration-hygiene.ts`, a ne presucen.

Migracija je namjerno FAIL-QUIET, za razliku od susjednih cron migracija (0009, 0011, 0016, 0018,
0019, 0022, 0034) koje su FAIL-CLOSED kad nema pg_crona. Ondje je rijec o retenciji osobnih
podataka, pa je izostanak posla tiha povreda politike minimizacije. Ovdje je izostanak tajni
ocekivano stanje na stagingu i u razvoju, a posljedica je samo da podsjetnici ne idu. Ta razlika je
zapisana i u komentaru same migracije, da je sljedeca sesija ne "popravi" natrag u fail-closed i
time vrati blokator.

Gard protiv povratka: `tests/migration-secrets-hygiene.test.ts` (logika u
`tests/helpers/migration-hygiene.ts`) nad SVIM migracijama tvrdi da nijedna ne nosi tvrdo upisan
endpoint projekta ni token-oblik Bearer kljuca izvan SQL komentara, i da je svaki
`cron.unschedule` zasticen. Mutacija koja dokazuje da gard grize je
`migracija/tvrd-kljuc-i-nezasticen-unschedule` u `tests/gate-mutations.test.ts`.

DRUGI KRUG PREGLEDA (isti dan) nasao je da je i sam gard imao rupu, i to bas u obliku kvara koji
lovi. Zastita je priznavala dva oblika, `begin ... exception when others` i
`if exists (select 1 from cron.job ...)`. Prvi je bio omedjen (prozor unaprijed staje na prvom
`begin`, pa se rukovatelj iz kasnijeg nepovezanog bloka ne moze posuditi), drugi nije bio omedjen
nikako: gledao je cijeli prefiks tijela `do` bloka. Posljedica je izmjerena nad gardom kakav je
bio commitan: migracija koja vodi DVA posla, prvi zastiti `if exists` provjerom pa je zatvori s
`end if`, a drugi zaboravi, prolazila je kao CISTA. To je doslovno blokator zbog kojeg ovaj
odjeljak postoji, a oblik nije izmisljen: 0016 i 0019 vec vode dva posla u jednom bloku.
Popravljeno tako da se sada trazi oboje, da je `if` blok te provjere na mjestu poziva jos OTVOREN
(balans `if` naspram `end if`, pa ugnijezdene provjere i dalje prolaze) i da provjera imenuje BAS
taj posao kad su oba imena doslovna. Pokriveno s tri nova testa u
`tests/migration-secrets-hygiene.test.ts` (dva hvataju, jedan je negativna kontrola nad
ugnijezdenim ispravnim oblikom) i prosirenom mutacijom u `tests/gate-mutations.test.ts`.

Uz to je istom prilikom zatvorena i treca strana iste rupe, nadjena samoprovjerom a ne pregledom:
poziv u ELSE grani provjere stoji IZA nje, pa bi ga balans priznao kao zasticen, a izvodi se
tocno kad posla NEMA, dakle pada uvijek. `else` na dubini nula zato zatvara zasticenu granu
jednako kao `end if`; `elsif` i `elseif` granica namjerno ne hvata.

### Sto mora napraviti vlasnik, RUCNO, na produkciji

Produkcija `zrrjttizjyfcxmcpgzml` ima 0059 VEC primijenjenu (verzija je zapisana u dnevniku).
Izmjena datoteke u repozitoriju zato ne mijenja nista na zivoj produkcijskoj bazi: postojeci cron
posao `send-deadline-reminders` i dalje radi s URL-om i kljucem koji su u njega upisani u trenutku
prve primjene. To je namjerno i ne dira se.

Prije sljedeceg reschedulea tog posla na produkciji (svako ponovno pokretanje 0059 ili njoj
ekvivalentne logike) vlasnik mora rucno postaviti dvije vault tajne, u SQL editoru ili kroz
Dashboard (Project Settings -> Vault):

    select vault.create_secret('https://<PROJECT_REF>.supabase.co', 'lekta_functions_base_url');
    select vault.create_secret('<REMINDER_CRON_SECRET>',            'lekta_cron_bearer');

Mapiranje imena je vazno i lako ga je promasiti: `lekta_cron_bearer` mora sadrzavati ISTU vrijednost
kao Edge tajna `REMINDER_CRON_SECRET`. `supabase/functions/_shared/cron-auth.ts` je fail-closed i
usporedjuje konstantno-vremenski, pa svaka druga vrijednost daje tihi 401, a cron nema kome
prijaviti gresku. Bez postavljenih tajni migracija se i dalje primijeni uredno, ali posao NE zakaze
i o tome javi `notice`.

Neovisno o tome: kljuc koji je bio tvrdo upisan u 0059 ostaje u povijesti repozitorija i treba ga
smatrati kompromitiranim. Rotacija `REMINDER_CRON_SECRET` (Edge tajna + vault tajna u istom potezu)
je posao vlasnika i nije dio ove izmjene.

# Go-live: plaćeni server-side repair (WS-7)

Runbook za puštanje plaćenog automatskog popravka u produkciju. Do zadnjeg koraka (E) sve
je **inertno**: aplikacija radi kao i sada (besplatna lokalna provjera + lokalni popravak,
ništa se ne uploada, prodaja ugašena). Tek korak E pali upload+pohranu i prodaju.

Projekt: **Lekta** `zrrjttizjyfcxmcpgzml` (eu-central-1).
Endpointi (nakon deploya funkcija):

- repair: `https://zrrjttizjyfcxmcpgzml.supabase.co/functions/v1/repair-docx`
- checkout: `https://zrrjttizjyfcxmcpgzml.supabase.co/functions/v1/create-checkout`

---

## Dvije faze: besplatna beta pa naplata

Preporuceni put: prvo pusti **besplatnu javnu betu** (svaki prijavljeni korisnik uploada+popravi
besplatno, uz dnevni cap), pa kasnije upali naplatu. Prijelaz je jedna Edge tajna, bez ijedne
klijentske izmjene.

- **Faza 1 (besplatna beta):** koraci A, B (s `REPAIR_FREE_MODE=true`), C, E (samo `repairEndpoint`),
  F, G. Korak D (Lemon Squeezy) se PRESKACE. Server preskace naplatu ali sve ostalo (auth, consent,
  upload, pohrana, "Moji popravci", brisanje, rate-limit) radi normalno. **Provjera izvora u
  korpusu ide u istu fazu** (odluka vlasnika): u beti vozi besplatno zajedno s popravkom.
- **Faza 2 (naplata):** odradi korak D, pa u Edge tajnama makni `REPAIR_FREE_MODE` (ili `false`) i
  postavi `checkoutEndpoint` (korak E). Klijent i pravne stranice se NE mijenjaju. Repair-panel
  ionako ne prikazuje cijenu, pa beta ne zavarava.

VAZNO: i besplatna beta je privatnosni zaokret (dokument se uploada i pohranjuje). Zato i za betu
moraju biti zive pravne stranice + consent (korak E: Netlify redeploy) i cleanup cron (korak C).

---

## 0. Već napravljeno (INERTNO, na produkciji)

- [x] Migracije `0026_repair_jobs` (bucket `repair` + tablica `repair_jobs` + RLS) i
  `0027_repair_orphan_sweep` + `0028_lock_orphan_sweep_fn` primijenjene i verificirane.
- [x] Edge funkcije `cleanup-orphan-repairs` (verify_jwt=false) i `delete-repair-job`
  (verify_jwt=true) deployane (ACTIVE).
- [x] Sav kod commitan (WS-1..WS-6 + sweep). `npm run check` zelen.
- [x] **Provjera izvora u korpusu (K1..K5,** plan `PLAN_KORPUS_PROVJERA_IZVORA.md`**):** migracije
  `0030_corpus_works` (pg_trgm + deny-all RLS) i `0032_corpus_search` (RPC `corpus_search_many`)
  primijenjene; korpus **uvezen: 525.817 radova** iz Dabra i Hrčka (`scripts/load-corpus-supabase.mjs`,
  847 s). Klijent šalje naslove literature uz popravak, sučelje prikazuje nalaz.

Ostaje niže.

> **Pazi na prostor u bazi.** Korpus zauzima **354 MB, to je 70,7% od 500 MB free stropa.** Prije
> bilo kakvog većeg rasta podataka (ili prije dodavanja FTS indeksa, vidi plan) treba **Pro plan**.
> Free tier k tome nema backupe i **auto-pauza se nakon 7 dana neaktivnosti**, što bi na produkciji
> značilo hladan start. To je otvorena odluka vlasnika, nije blokada za betu.

---

## A0. Ručni gate prije svakog deploya repair motora

`npm run check` (Tier 0) dokazuje da je izlazni paket valjan XML i da nijedan dio nije nestao,
ali **ne otvara dokument nijednim stvarnim uredivačem**. Prije nego što izmjena Repair Enginea ode
na produkciju, na Windows stroju s Wordom pokreni i:

```bash
npm run verify:strict-open   # Tier 1: python-docx + lxml nad ulaznim fixturima
npm run verify:word          # Tier 2: Word otvara s OpenAndRepair=false i mjeri stvarne vrijednosti
npm run verify:word:worst    # Tier 2: dokument najgoreg slučaja (naslovnica, tablica, slika, fusnote)
```

Sva tri moraju vratiti izlazni kod 0. Puni Tier model i razlog zašto Tier 0 sam po sebi nije
dovoljan su u `docs/REAL_CORPUS_TESTING.md`.

---

## A. Deploy Edge funkcija (`source-check` PA `repair-docx`)

Bundle je prevelik za MCP inline, pa preko Supabase CLI-ja (bundla iz izvora sam):

```bash
# jednom: login (interaktivno) ILI postavi SUPABASE_ACCESS_TOKEN
npx supabase login
# REDOSLIJED JE BITAN (vidi ispod): prvo source-check, pa repair-docx, pa tek onda klijent (korak E)
npx supabase functions deploy source-check --project-ref zrrjttizjyfcxmcpgzml
npx supabase functions deploy repair-docx  --project-ref zrrjttizjyfcxmcpgzml
```

Alternativa: daj Claudeu personal access token pa deploya preko Management API/MCP-a.

- [ ] `source-check` deployan, status ACTIVE.
- [ ] `repair-docx` deployan, status ACTIVE.

### Zasto ovaj redoslijed (2026-07-27)

Provjera postojanja izvora vise ne putuje u odgovoru popravka: klijent ju zove **usporedno** s
uploadom (`source-check`), pa dokument stize u svom vremenu umjesto da ceka do 45 s korpusnog
budzeta. Klijent to javlja zastavicom `meta.sourceCheckSeparate`, a `repair-docx` tada korpus
preskace (da se isti posao ne odradi dvaput).

Deploy nije atomaran, pa oba smjera moraju biti sigurna:

- **Novi server + stari klijent** (izmedju koraka A i E): stari klijent ne salje zastavicu, pa
  `repair-docx` radi po starom i vraca `sourceCheck` u odgovoru. Nitko nista ne gubi.
- **Novi klijent + stari server** (kad bi se E odradio prije A): klijent bi zvao `source-check`
  koji jos ne postoji, pa bi provjera izvora tiho izostala. Zato **klijent ide zadnji**.

Kad svi klijenti budu novi, korpusna grana u `repair-docx` moze nestati.

> Napomena: `create-checkout` je već deployan ali STAR (prije WS-5 tier_mismatch enforcementa).
> Prije prodaje ga redeployaj isto komandom `npx supabase functions deploy create-checkout ...`.

---

## B. Edge tajne (Supabase Dashboard: Edge Functions -> Secrets)

Nove za repair:

- [ ] **Besplatna beta:** `REPAIR_FREE_MODE=true` (preskace naplatu; sve ostalo radi). Za Fazu 2
  (naplata) ukloni je ili postavi na bilo sto osim `true`. Opcijski `REPAIR_FREE_DAILY_CAP` (default 10).
- [ ] `REPAIR_CLEANUP_CRON_SECRET` = nasumična tajna (`openssl rand -hex 32`). Koristi je
  i pg_cron u koraku C. Bez nje `cleanup-orphan-repairs` fail-closed vraća 401.
- [ ] (opcijski) `REPAIR_MAX_DOCX_BYTES` (default 20MB), `REPAIR_CLEANUP_GRACE_MINUTES` (default 60).
- [ ] (opcijski, AUDIT_MASTER.md poglavlje 9) `REPAIR_DISABLED=true` = kill switch (503 na sve
  zahtjeve, isti obrazac kao `PREFLIGHT_DISABLED`). `REPAIR_MAX_CONCURRENT` (default 4) = best-effort
  concurrency limit PO IZOLATU (nije globalno atomican, vidi `src/report/repair-limits.ts`); 503
  `{error:'busy'}` kad je premasen. `REPAIR_STORAGE_DAILY_CAP` (default 500) = globalni dnevni strop
  broja NOVIH `repair_jobs` redaka prije nego se pohrana preskoci (popravak i dalje uspijeva, samo
  bez "Moji popravci" za taj zahtjev); 0 ili negativno iskljucuje ogranicenje.

Provjera izvora u korpusu (sve **opcijske**, defaulti su već razumni; postavi samo ako mijenjaš).
Iste vrijednosti čita i `repair-docx` (naslijeđeni put) i `source-check` (usporedni put), jer dijele
`_shared/corpus-check.ts`:

- `CORPUS_SOURCE_CHECK` (default `true`). Postavi na `false` kao **trenutačan kill switch**: popravak
  radi dalje, samo bez sekcije o izvorima (`source-check` tada vraća 503, klijent to čita kao
  "provjera nije dostupna", nikad kao "izvor ne postoji").
- `CORPUS_BUDGET_MS` (default 45000), `CORPUS_MAX_REFS` (default 60), `CORPUS_CHUNK` (default 8).
  Dohvat košta oko **2,8 ms po znaku naslova**, pa je 40 referenci 6 do 10 s. Budžet je gornji strop,
  ne fiksno trajanje. Otkad provjera ide zasebnim pozivom, njezino trajanje **više ne odgađa
  popravak**; spuštanje budžeta samo smanjuje koliko referenci stigne na red (sučelje to pošteno
  prikazuje kao `checked`/`total`).

Dnevni limiti zasebne provjere (opcijski; brani da endpoint bez dokumenta ne postane besplatan javni
pretraživač nad korpusom):

- `SOURCE_CHECK_USER_DAILY_CAP` (default 40), `SOURCE_CHECK_IP_DAILY_CAP` (default 120). Atomski su
  (`claim_ip_rate_slot`, migracija 0022), pa paralelni pozivi ne mogu proći kroz stale COUNT.
  Ne troše ni slot ni kvotu popravaka.

Potvrdi da postoje (koriste ih repair-docx / delete-repair-job):

- [ ] `IP_HASH_SALT`, `ALLOWED_ORIGIN` (npr. `https://lektahr.netlify.app`).
- [ ] `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (Supabase postavlja automatski).

Za prodaju (korak D), potvrdi LS tajne:

- [ ] `LEMONSQUEEZY_API_KEY`, `LEMONSQUEEZY_STORE_ID`, `MOR_WEBHOOK_SECRET`, `CHECKOUT_REDIRECT_URL`.

---

## C. pg_cron za orphan-BLOB sweep (Supabase SQL editor)

Popuni `<REPAIR_CLEANUP_CRON_SECRET>` istom vrijednošću iz koraka B:

```sql
select cron.schedule(
  'cleanup-orphan-repairs',
  '20 4 * * *',
  $$
  select net.http_post(
    url := 'https://zrrjttizjyfcxmcpgzml.supabase.co/functions/v1/cleanup-orphan-repairs',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <REPAIR_CLEANUP_CRON_SECRET>'
    ),
    body := '{}'::jsonb
  );
  $$
);
```

- [ ] Cron zakazan. Provjera: `select * from cron.job where jobname='cleanup-orphan-repairs';`

> Ovo je GDPR right-to-erasure na razini brisanja RAČUNA (briše siroče Storage BLOB-ove
> bez `repair_jobs` retka). Za brisanje POJEDINOG popravka služi `delete-repair-job` (već radi).

---

## D. Naplata (Lemon Squeezy) - VELIKI odgođeni dio (PRESKOCI u Fazi 1 / besplatnoj beti)

Trenutno **nijedan** proizvod u `products` nema `mor_product_id` (LS variant). Bez toga
`create-checkout` vraća `409 product_not_mapped`.

1. [ ] U Lemon Squeezyju kreiraj variante po vrsti rada (cijene iz `src/report/pricing.ts`
   `WORK_TYPE_TIERS`: seminarski 3,99 / završni 5,99 / diplomski 9,99 / doktorski 24,99 EUR).
2. [ ] Mapiraj `products.mor_product_id` na LS variant id (za SKU-ove koje prodaješ). Popis
   SKU-ova: `select id, work_type, audience from products where audience='retail';`
   Primjer: `update products set mor_product_id='<LS_VARIANT_ID>' where id='slot_diplomski';`
3. [ ] LS webhook -> `.../functions/v1/webhook-mor` (potpis `MOR_WEBHOOK_SECRET`).
4. [ ] Redeploy `create-checkout` (WS-5 tier_mismatch enforcement).

> Repair CTA po vrsti rada je već ožičen (WS-5); treba samo mapirani proizvod + tajne.

---

## E. GO-LIVE flip (klijentski config) + deploy

Ovo pali upload+pohranu i prodaju. U [src/ui/app.ts:90](../src/ui/app.ts#L90),
`DEFAULT_PRODUCTION_CONFIG`, postavi:

```
repairEndpoint:'https://zrrjttizjyfcxmcpgzml.supabase.co/functions/v1/repair-docx',
checkoutEndpoint:'https://zrrjttizjyfcxmcpgzml.supabase.co/functions/v1/create-checkout',
```

**Faza 1 (besplatna beta):** postavi SAMO `repairEndpoint` (ostavi `checkoutEndpoint:''`). Uz
`REPAIR_FREE_MODE=true` (korak B) server ne traži naplatu pa nema 402. **Faza 2 (naplata):** dodaj
`checkoutEndpoint` i makni `REPAIR_FREE_MODE` (+ korak D). Bez `REPAIR_FREE_MODE`, a bez entitlementa,
server vraća 402 (paywall) pa repair ne radi dok checkout+LS nisu živi.

- [ ] Config postavljen.
- [ ] `npm run check` zelen.
- [ ] Commit + push.
- [ ] Netlify deploy prošao (regenerira pravne stranice s novom "pohrana do brisanja" copy;
  `verify-deploy-dist.mjs` mora naći `privatnost.html` itd. u `dist/`).

> **`TERMS_VERSION` je bumpan na `2026-07-20`** (K5: opis provjere izvora u privatnosti, obradi
> dokumenata i odricanju). Server prihvaća SAMO tekuću verziju, pa kartica otvorena prije deploya
> na upload dobije `400 consent_required` i poruku da osvježi stranicu. To je očekivano, ne kvar,
> ali znači da deploy pravnih stranica i deploy `repair-docx` idu **zajedno**.

---

## F. Provjera nakon go-livea

- [ ] `repair-docx` bez prijave -> 401; s prijavom bez entitlementa -> 402 (paywall).
- [ ] Pravne stranice žive: `/privatnost.html` i `/obrada-dokumenata.html` sadrže
  "automatski popravak" + "Moji popravci" + "dok ih ne obrišeš".
- [ ] Landing FAQ "Šalje li se moj rad" spominje plaćeni popravak s pohranom.
- [ ] E2E (LS test mode): kupi -> upload -> preuzmi popravljeni docx -> pojavi se u
  "Moji popravci" -> obriši -> nestane iz liste I iz Storagea.
- [ ] Provjera izvora: popravi rad s hrvatskom literaturom pa potvrdi da se sekcija
  "Provjera izvora u hrvatskom korpusu" pojavi, da značka prikazuje **oba broja** (`x od y`) i da
  se pri velikom popisu literature javi "Rezultat je djelomičan". Zatim `CORPUS_SOURCE_CHECK=false`
  pa ponovi: sekcije nema, popravak i dalje stiže (fail-open).
- [ ] **Brzina (zbog čega je tok razdvojen).** Otvori Network panel i popravi rad s 40+ referenci:
  - `repair-docx` odgovor traje otprilike koliko sam popravak (sekunde), **ne** 10-20 s;
  - `source-check` je zaseban, **usporedan** zahtjev koji smije trajati dulje, a sekcija o izvorima
    se dopuni sama kad stigne (dotad piše "Provjeravam navedene izvore…");
  - u Edge logovima `[repair-docx] timings repair=… store=… corpus=… total=…` ima `store=0` i
    `corpus=0` (pohrana je u pozadini, korpus na zasebnom pozivu).
- [ ] **Pozadinska pohrana stvarno završi.** Potvrdi da `EdgeRuntime.waitUntil` postoji u runtimeu:
  log `[repair-docx] store job=<uuid> ok=1 ms=…` mora se pojaviti **nakon** odgovora. Ako ga nema,
  funkcija je pala na `await` fallback (sporije, ali ispravno) - tada `store` u `timings` nije 0.
  Zatim otvori "Moji popravci": posao se mora pojaviti za koji trenutak.
- [ ] **Poštenje copyja:** dok je pohrana u tijeku, sučelje smije reći samo "Kopija **se sprema**",
  nikad "spremljeno je". Provjeri i suprotan slučaj (privremeno srušen bucket): korisnik mora dobiti
  dokument i jasnu poruku, ne tihi gubitak.
- [ ] `source-check` bez prijave -> 401; preko dnevnog capa -> 429 s razlogom, a **popravak i dalje
  radi** (provjera izvora je dodatak, ne uvjet).
- [ ] `corpus_works` je i dalje nedostupan klijentu: `select` s anon ključem mora vratiti 0 redaka
  (deny-all RLS iz 0030), a RPC `corpus_search_many` smije zvati samo `service_role`.
- [ ] Supabase `get_advisors` (security) bez novih upozorenja.
- [ ] Nakon 1 dana: provjeri da je `cleanup-orphan-repairs` cron odradio bez greške
  (Edge logovi) i da nije obrisao ništa validno (nema `repair_jobs` bez BLOB-a).

---

## G. Rollback (trenutačan)

Vrati `repairEndpoint:''` (i `checkoutEndpoint:''`) u `DEFAULT_PRODUCTION_CONFIG`,
`npm run check`, commit, Netlify deploy. Repair se odmah vraća na lokalni/besplatni put;
funkcije i tablice ostaju (inertne). Postojeći pohranjeni popravci ostaju dostupni vlasnicima.

Za gašenje SAMO provjere izvora, bez diranja popravka: Edge tajna `CORPUS_SOURCE_CHECK=false`.
Djeluje odmah, bez deploya i bez klijentske izmjene; sekcija naprosto izostane.

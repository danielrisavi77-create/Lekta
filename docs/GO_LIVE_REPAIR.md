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
  upload, pohrana, "Moji popravci", brisanje, rate-limit) radi normalno.
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

Ostaje niže.

---

## A. Deploy `repair-docx` (jedina preostala funkcija)

Bundle je prevelik za MCP inline, pa preko Supabase CLI-ja (bundla iz izvora sam):

```bash
# jednom: login (interaktivno) ILI postavi SUPABASE_ACCESS_TOKEN
npx supabase login
# deploy (config.toml vec ima verify_jwt=true za repair-docx)
npx supabase functions deploy repair-docx --project-ref zrrjttizjyfcxmcpgzml
```

Alternativa: daj Claudeu personal access token pa deploya preko Management API/MCP-a.

- [ ] `repair-docx` deployan, status ACTIVE.

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

---

## F. Provjera nakon go-livea

- [ ] `repair-docx` bez prijave -> 401; s prijavom bez entitlementa -> 402 (paywall).
- [ ] Pravne stranice žive: `/privatnost.html` i `/obrada-dokumenata.html` sadrže
  "automatski popravak" + "Moji popravci" + "dok ih ne obrišeš".
- [ ] Landing FAQ "Šalje li se moj rad" spominje plaćeni popravak s pohranom.
- [ ] E2E (LS test mode): kupi -> upload -> preuzmi popravljeni docx -> pojavi se u
  "Moji popravci" -> obriši -> nestane iz liste I iz Storagea.
- [ ] Supabase `get_advisors` (security) bez novih upozorenja.
- [ ] Nakon 1 dana: provjeri da je `cleanup-orphan-repairs` cron odradio bez greške
  (Edge logovi) i da nije obrisao ništa validno (nema `repair_jobs` bez BLOB-a).

---

## G. Rollback (trenutačan)

Vrati `repairEndpoint:''` (i `checkoutEndpoint:''`) u `DEFAULT_PRODUCTION_CONFIG`,
`npm run check`, commit, Netlify deploy. Repair se odmah vraća na lokalni/besplatni put;
funkcije i tablice ostaju (inertne). Postojeći pohranjeni popravci ostaju dostupni vlasnicima.

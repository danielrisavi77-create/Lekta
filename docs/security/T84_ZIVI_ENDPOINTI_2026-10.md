# T84: sigurnosni podskup T21 za zive endpointe (2026-10-04)

Kriterij 4 iz `docs/decisions/T50_OPSEG_LANSIRANJA_ODLUKA.md`: za zive Edge endpointe
(repair-docx, source-check, faculty-request, preporuke) i RLS nema otvorenog P0.

**Presuda:** otvoren P0 nije pronaden. Postoji sest razlicitih P1: RF-1, XFF (FR-1 i RF-2 su njegove
posljedice), SC-1, RD-2, RD-3 i DB-1. RF-1 i SC-1 imaju PR u ovom krugu, DB-1 je u Katedrinim
tablicama i eskaliran je. RF-1 postaje P0 cim se ukljuci naplata, pa njegov popravak ide prvi.

## Metoda i granice dokaza

- Pregledan je kod na `origin/master` 324e792f: Edge funkcije, `_shared` pomocnici, sve migracije
  (zadnja definicija svakog objekta) i `supabase/config.toml`. Pet neovisnih prolaza (po endpointu i
  jedan za RLS i grantove), svaki nalaz potom rucno provjeren u kodu.
- Staging `bnyemcnsphlitjradrst` (dopustenje vlasnika 2026-10-04): samo citanje kataloga kroz SQL
  (`pg_proc`, `pg_policies`, `has_table_privilege`, `has_function_privilege`). Nijedan zapis.
- Produkcija nije pozivana. HTTP prema stagingu iz cloud okoline blokira mrezna politika
  (`connect_rejected` za `bnyemcnsphlitjradrst.supabase.co`), pa runtime ponasanje gatewaya za
  `x-forwarded-for` nije izmjereno.
- Repozitorij je javan. Za nalaze koji su jos otvoreni navedeni su mjesto i mehanizam, ali ne i
  zahtjev spreman za kopiranje; puni dokaz je predan koordinatoru. Za zatvorene nalaze i nalaze s
  PR-om dokaz je konkretan.

## Tablica nalaza

| ID | Ozbiljnost | Endpoint ili objekt | Dokaz | Popravak | Status |
|---|---|---|---|---|---|
| RF-1 | P1 (P0 uz naplatu) | preporuke: `generate-report` + `_shared/grant-friend-referral-reward.ts` | Nagrada prijatelju upisuje interni entitlement (placeni slot `slot_<workType>`, 90 dana) svakom racunu sa signupom; nema provjere `is_anonymous`, a nagrada preporucitelju je ima (`grant-referrer-reward.ts:67`). Anonimne prijave su ukljucene u produkciji, captcha nije (T89). Svaki novi anonimni racun s istim kodom dobiva slot vrste rada koju bira klijent. | Rani izlaz za anonimni racun; `generate-report` prosljeduje `user.is_anonymous` iz `auth.getUser`. Test nad laznom bazom, gard izvora i dvije mutacije. Signup ostaje `signed_up`, pa nagrada stize nakon nadogradnje na pravi racun. | PR #289 (`wf/t84-rf1-anon-friend`) |
| XFF | P1, NEPROVJERENO na gatewayu | `_shared/hash-ip.ts:16-17` (repair-docx, source-check, redeem-referral-signup, generate-report, analytics-event, client-error), `faculty-request/index.ts:97` | IP kljuc za limite i anti-fraud racuna se iz PRVOG unosa `x-forwarded-for` (faculty-request hashira cijeli header). Ako gateway cuva klijentsku vrijednost, svaki izmisljen unos daje nov brojac: pada IP cap besplatnog popravka (RD-1), IP slot source-checka (SC-3), limit waitlista (FR-1) i IP usporedba u nagradi preporucitelju (RF-2). Poznato i u `docs/PRE_LAUNCH.md:108-110`. | Najprije runtime mjerenje: dva poziva s razlicitim izmisljenim `x-forwarded-for` pa usporedba upisanih hasheva. Tek tada izbor pouzdanog izvora (zadnji hop gatewaya ili header koji klijent ne moze postaviti). | Otvoreno, blokirano mrezom prema stagingu |
| SC-1 | P1 | source-check i repair-docx: `_shared/corpus-check.ts:64-67` | Duljina naslova nije ogranicena; `corpus_search_many` (0032:54-56) trazi samo `length >= 8`. Trosak je ~2,8 ms po znaku (`corpus-check.ts:16`), a budzet od 45 s provjerava se tek izmedju serija. 60 naslova od ~4 000 znakova (tijelo ispod 256 KB) drzi dijeljenu bazu desetke sekundi po seriji. | Naslov se reze na `CORPUS_TITLE_MAX = 400` prije RPC-a. Test: 60 naslova od 4 200 znakova salje bazi kljuceve <= 400; normalan naslov nepromijenjen; gard izvora i mutacija. | PR #291 (`wf/t84-sc1-naslov`) |
| SC-2 | P2 (NEPROVJERENO) | `corpus_search_many` (0032:33) | `set statement_timeout = '8s'` u zaglavlju funkcije ne pokrece mjerac za naredbu koja vec traje, pa stvarnu granicu daje postavka uloge. SC-1 uklanja glavni nacin da se upit produlji. | Izmjeriti na stagingu; po potrebi timeout na razini uloge ili `AbortSignal` u Edge pozivu. | Otvoreno |
| RD-2 | P1 | repair-docx `index.ts:589-607` | U FREE_MODE se broje samo `free` i `repair_failed` (`index.ts:493`). Ishod bez izmjena i `integrity_failed` ne upisuju nista, pa jedan racun moze beskonacno slati vec uskladjen dokument (do 20 MB, puni `readZip` i `applyFixers`) bez rasta brojaca. | Zaseban, visi brojac pokusaja koji ne trose kvotu (npr. `no_change` u `report_generations`), uz ocuvanje pravila da korisnik ne placa za nista. Dira zasticeni repair tok: trazi adversarijalni pregled. | Otvoreno, sljedeci PR |
| RD-3 | P1 | repair-docx, `try_acquire_repair_slot` (0094:38-65) | Globalna brana od 4 istodobna popravka nema podjelu po korisniku; jedan racun s 4 paralelna teska zahtjeva drzi sve ostale na 503 `busy`, a lease traje do 300 s. | Limit istodobnosti po korisniku (npr. 1 do 2) u istoj RPC funkciji; migracija od 0200 navise. | Otvoreno, uz RD-2 |
| RD-4 | P2 | repair-docx `index.ts:494-611` | Provjera capa i upis potrosnje nisu atomski; omedjeno globalnim slotom (4). | Atomski claim kao u `claim_two_rate_slots` (0096). | Otvoreno |
| RD-5 | P2 | repair-docx `index.ts:542-543` | `coverage_tier` i `profile_ref` u placenom slotu dolaze iz klijentskog `meta`; `file-guarantee-claim` iz njih cita pravo na garanciju. Zahtjev ostaje `pending` (rucni pregled). | Izvesti tier na serveru iz slozenog profila. | Otvoreno |
| RD-6 | P2 | repair-docx `index.ts:594` | Odgovor `integrity_failed` vraca naziv dijela paketa i opis problema. Bez tajni. | Vracati samo kod greske. | Otvoreno |
| FR-1 | P1 (dio XFF) | faculty-request | Limit 5 upisa u 10 minuta po `ip_hash` (0054:71-90) kljucan je na cijelom `x-forwarded-for`; count pa insert nije atomski. E-mail se upisuje bez potvrde vlasnistva, a `discovery/notify-covered.mjs --send` salje mail na svaku adresu. | XFF popravak, atomski `claim_ip_rate_slot`, globalni dnevni strop, potvrda e-maila (FR-2). | Otvoreno |
| FR-2 | P2 | faculty-request | Nema double opt-in potvrde e-maila. | Potvrdni link prije prve obavijesti. | Otvoreno |
| FR-3 | P2 | faculty-request `index.ts:57-60` | Bez `content-length` tijelo se cita cijelo prije provjere 8 KB. | `readTextBounded` iz `_shared/read-body.ts` kao u source-checku. | Otvoreno |
| RF-2 | P1 (dio XFF) | preporuke: `grant-referrer-reward.ts:91-110` | IP anti-fraud usporeduje `referred_ip_hash` (prvi XFF unos) samo s IP-ovima preporucitelja iz `report_generations`. Nagrada preporucitelju ipak trazi placenu kupnju ne-anonimnog racuna i ima strop 10 mjesecno po racunu. | XFF popravak; strop po kodu ili preporucitelju za nagradu prijatelju. | Otvoreno |
| RF-3 | P2 | `redeem-referral-signup/index.ts:66, 96` | Odgovor razlikuje `invalid_code` od uspjeha i nema limita; prostor kodova 31^6 iz `random()`. | Limit po korisniku i IP-u, jednak odgovor. | Otvoreno |
| RF-4 | P2 | `redeem-referral-signup/index.ts:73-80` | Stari racun bez preporuke moze naknadno iskoristiti tudji kod. | Dopustiti redeem samo u prozoru nakon nastanka racuna. | Otvoreno |
| RF-5 | P2 | `process-bonus-outbox/index.ts:116` | `last_error` (poruke iznimki) vlasnik retka cita preko select-own politike (0100:64-65). | Spremati kod greske, detalj samo u log. | Otvoreno |
| DB-1 | P1, izvan Lektinog toka | `academic_demo_usage` (0088:42-45), `release_academic_demo_quota` (0088:89, 126) | Staging: politika `academic_demo_usage_update_owner` (UPDATE, `user_id = auth.uid()`), `authenticated` ima UPDATE na tablici i EXECUTE na `release_academic_demo_quota`. Korisnik sam vraca svoj brojac demo kvote na nulu. | Ukloniti update i insert politike i grantove, `release` samo za service_role. Pozivatelj kvote nije u ovom repou: koordinator dodjeljuje vlasniku Katedrinog toka. | Eskalirano |
| DB-2 | P2 | `academic_projects` (0035:62-65) | Update own bez ogranicenja stupaca: korisnik postavlja `stage`, ponistava `deleted_at` i `purge_after`. U Lekti nista ne autorizira prema `stage`. Ako Katedra autorizira prema `stage`, nalaz postaje P0. | Ograniciti stupce (column grant) ili RPC. | Eskalirano uz DB-1 |
| DB-3 | P2 | `katedra_projects`, `katedra_project_state`, `academic_audit_*`, `deadline_subscriptions_insert_own` (0063:18) | Krivotvorivi podaci samo za sebe; `consent_at` u podsjetnicima dolazi od klijenta. | Serverske vrijednosti kroz default ili trigger. | Otvoreno |
| DB-4 | P2 | `academic_demo_usage_insert_owner` (0088:37) | Insert s tudjim `project_id` blokira tudju demo kvotu (trazi procurjeli UUID). | Provjera vlasnistva projekta u politici. | Eskalirano uz DB-1 |
| DB-5 | P2 | storage `guarantee-evidence` (0097:69-74) | Svaki authenticated, i anonimni, smije uploadati u vlastiti prefiks bez claima i kvote. | Upload samo uz otvoren claim. | Otvoreno |
| DB-6 | P2 | `purge_*`, `expire_stale_preflight_jobs`, `generate_referral_code` | Staging: `anon` i `authenticated` imaju EXECUTE. Funkcije su SECURITY INVOKER, a ciljne tablice nemaju write politike, pa poziv mijenja 0 redaka. | Izricit `revoke ... from anon, authenticated`. | Otvoreno |
| DB-9 | P2 | testovi | Nema garda koji rusi build za tablicu bez RLS-a ili SECURITY DEFINER funkciju bez revokea od `anon`. | Gard nad parsiranim migracijama. | Otvoreno |

## Provjereno i zatvoreno

- **Citanje ili izmjena tudjih podataka kroz PostgREST:** staging `pg_policies` za `entitlements`,
  `document_slots`, `repair_jobs`, `report_generations`, `referral_codes`, `referral_signups`,
  `bonus_outbox`, `corpus_contributions` i `integrity_checks` ima samo SELECT politike s
  `auth.uid()`. Tablicni grantovi su siroki, ali bez write politike RLS odbija svaki upis ili brisanje.
  `faculty_requests`, `ip_rate_limits` i `corpus_works` nemaju ni politike ni grantove.
- **SECURITY DEFINER funkcije:** sve imaju `set search_path`. Staging: od definer funkcija koje
  `authenticated` smije izvrsiti, Lektina je samo `unsubscribe_own_deadline_subscription` i filtrira
  `user_id = auth.uid()`; ostale su Katedrine i provjeravaju `auth.uid()` i vlasnistvo. Novac i
  entitlementi (`consume_slot_and_bind`, `apply_entitlement_upgrade`, `grant_rulebook_reward`,
  `katedra_grant`, ...) nemaju EXECUTE za klijentske uloge.
- **repair-docx:** `verify_jwt = true` uz `auth.getUser`; `jobId` je serverski UUID, putanja
  `${userId}/${jobId}`; bucket `repair` privatan sa select-own politikom; zip bomba omedjena na
  64 MB i 512 unosa tijekom inflatea; tijelo se broji streamom; `REPAIR_DISABLED` se provjerava prije
  autha; odluka o placanju pada prije popravka, a slot se trosi atomski (0007).
- **source-check:** `verify_jwt = true`; nema izlaznog `fetch` prema adresi korisnika (nema SSRF-a);
  tijelo ograniceno na 256 KB streamom, 60 referenci, 200 upita u SQL-u; dva rate slota se uzimaju
  atomski (0096); funkcija ne pise korisnicke podatke.
- **faculty-request:** `requestId` je `gen_random_uuid()` i vraca se samo posiljatelju; vezanje e-maila
  samo kad je `email is null` i red mladji od sat vremena; `submit`, `attach` i `claim` nemaju EXECUTE
  za klijentske uloge; e-mail regex iskljucuje CR i LF.
- **preporuke:** `user_id` iz `auth.getUser`, preporucitelj iz retka koda; samopreporuka istim racunom
  odbijena; jedinstveni signup po racunu (0013:41-43); nagrade idempotentne preko
  `unique(provider, order_id)` i uvjetnog claima; `process-bonus-outbox` je fail-closed bez cron
  tajne i usporeduje u konstantnom vremenu.
- **CORS:** u repou allowlista bez `*` (`_shared/cors.ts:43-70`). Deployani `faculty-request` v13 s
  `Access-Control-Allow-Origin: *` je drift i vodi se kao T101.

## Sto ostaje NEPROVJERENO

- Ponasanje Supabase gatewaya za klijentski `x-forwarded-for` (presuduje XFF, FR-1, RD-1, SC-3, RF-2).
  Za mjerenje treba dopustiti `bnyemcnsphlitjradrst.supabase.co` u mreznoj politici cloud okoline ili
  ga izvesti s vlasnikova racunala.
- Stvarne vrijednosti `REPAIR_FREE_MODE`, `REPAIR_FREE_DAILY_CAP`, `REPAIR_MAX_CONCURRENT` i
  `ALLOWED_ORIGIN` u produkciji (kriterij 5 T81).
- Katedrine migracije 0104 do 0199 nisu u ovom repou; staging katalog ih ukljucuje, rekonstrukcija iz
  repoa ne.
- `check:edge` (Deno) se u cloudu ne moze izvrsiti jer je esm.sh blokiran.

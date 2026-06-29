# Lekta Â· Monetizacija i zaÅ¡tita od zloupotrebe (spec)

Spec za implementaciju u Claude Codeu. Opisuje Å TO i ZAÅ TO. Za pravila rada u repou vrijedi CLAUDE.md (build gate, mali commitovi, testovi).

Cilj ovog dokumenta: sprijeÄiti da netko kupi jedan slot za 3 EUR i kroz njega obradi 10 tuÄih radova, a da pritom NE pokvarimo poÅ¡tenog korisnika koji svoj rad provjerava viÅ¡e puta.

## 1. Prijetnja i Å¡to branimo

Realno: na proizvodu od 3 EUR savrÅ¡ena zaÅ¡tita se ne isplati. Cilj nije nemoguÄe, nego uÄiniti zloupotrebu napornijom od plaÄanja.

Branimo (mora biti zatvoreno):
- Sistematska preprodaja: jedan kupac vrti mnogo razliÄitih radova kao mini servis.
- Dijeljenje raÄuna kroz mnogo razliÄitih radova.

PrihvaÄamo (ne lovimo):
- Rijetko casual dijeljenje teasera (besplatan je, dobar za lijevak).
- ViÅ¡e ljudi koji gledaju jedan isti rad (to je jedan dokument, nije zloupotreba vrijedna blokade).

NaÄelo: troÅ¡ak sprjeÄavanja blizu nule, UX poÅ¡tenog korisnika bez trenja.

## 2. Temeljni model: naplata po dokumentu

Jedna kupnja = jedan slot za jedan rad = neograniÄene provjere TOG rada unutar prozora. Drugi, drugaÄiji rad = novi slot = nova naplata.

- Limit je na DOKUMENTIMA, ne na korisnicima i ne na broju provjera.
- Cijenu slota postavlja vrsta rada (work_type), i to kontrolira server.
- Prozor je po slotu, poÄinje kad se slot prvi put veÅ¾e na dokument.

Cjenovni tierovi (entitlement tierovi, server-side):

| work_type | cijena | prozor slota | dubina provjere (profil) |
|---|---|---|---|
| seminarski | 3 EUR | 7 dana | format, osnovna struktura, citati |
| zavrsni | 5 EUR | 7 dana | + TOC, brojevi stranica, obvezni dijelovi |
| diplomski | 10 EUR | 7 dana | + udjeli sekcija, dublji citatni i pravni, metapodaci |
| doktorski | 19 do 25 EUR (ili na upit) | 14 dana ili semestar | premium, Äesto individualna pravila |

Bundle: ista mehanika, kupiÅ¡ viÅ¡e slotova istog work_type odjednom (npr. 3 diplomska slota uz popust). Cilja tutore i power korisnike, pretvara "dijeli login" u "kupi bundle".

## 3. Granica klijent / server (zaÅ¡to je ovo srÅ¾ obrane)

Analiza je klijentska, pa sve izraÄunato u pregledniku motivirani korisnik moÅ¾e pokuÅ¡ati otkljuÄati. Zato:

- Teaser je 100% klijentski i besplatan: ukupni score, score po kategorijama, brojaÄi problema po ozbiljnosti, 1 do 2 problema u potpunosti, izvoz s watermarkom. Ovo namjerno ostaje lokalno i smije se dijeliti.
- Puni anotirani izvjeÅ¡taj i Äist izvoz generira i potpisuje server (Supabase Edge Function), samo uz vaÅ¾eÄi entitlement.

KRITIÄNO pravilo protiv spoofanja otiska:
Otisak dokumenta server raÄuna iz ISTOG payloada iz kojeg generira izvjeÅ¡taj. Klijent za plaÄeni izvjeÅ¡taj Å¡alje parsiranu strukturu i rezultat. Server iz tog payloada (a) izraÄuna otisak i (b) generira izvjeÅ¡taj. Posljedica: ako napadaÄ laÅ¾ira otisak da odgovara tuÄem slotu, izvjeÅ¡taj koji dobije odnosi se na laÅ¾irani payload, dakle beskoristan je za njegov stvarni rad. Ne moÅ¾e istovremeno dobiti koristan izvjeÅ¡taj za rad B i da se on otiskom prikaÅ¾e kao rad A.

JaÄa varijanta (ako se zloupotreba pokaÅ¾e stvarnom): plaÄeni put Å¡alje sirovi dokument serveru koji ga parsira i generira izvjeÅ¡taj. Robusnije za povjerenje, ali mijenja priÄu o privatnosti za plaÄeni korak. Teaser i tada ostaje lokalan. Implementiraj primarnu varijantu, ostavi ovu kao dokumentiranu opciju.

## 4. Otisak dokumenta (srce anti-abusea)

Otisak mora razlikovati "ista teza, druga verzija" (legitimno, neograniÄeno) od "drugi rad" (novi slot).

Gradi se IZ signala koji preÅ¾ive ureÄivanje, NE iz hasha datoteke:
- Naslov: iz metapodataka dokumenta, fallback prvi Heading 1. Normaliziran (lowercase, trim, makni dijakritiku i viÅ¡estruke razmake).
- Autor: iz metapodataka. Normaliziran.
- Sekvenca naslova: niz normaliziranih tekstova Heading 1 i 2, redoslijedom.
- Opcionalno pomoÄno: broj sekcija, gruba duljina (bucket), ne kao tvrdi kriterij.

ZABRANJENO: hash datoteke kao identitet. Spremanje pod drugim imenom, .docx vs .pdf izvoz, sitne izmjene sve mijenjaju hash, pa bi re-check poÅ¡tenog korisnika brojao kao novi rad i naplatio ga. Ovo je glavna zamka koju izbjegavamo.

Podudaranje (slot match) drÅ¾i LABAVO:
- Match ako: jaki match naslova, ILI (sliÄnost sekvence naslova >= ~0.6 I match autora).
- SliÄnost sekvence: omjer slaganja nizova (npr. SequenceMatcher ratio ili Jaccard nad setom naslova). Prag je konfigurabilan, default labav.
- Balans: laÅ¾ni "kupi opet" plaÄenom korisniku koÅ¡ta puno viÅ¡e nego rijetka prevara od 3 EUR. Radije propusti malo zloupotrebe nego da blokiraÅ¡ poÅ¡tenog usred predaje. Optimiziraj za false-allow, ne za false-block.

work_type je dio identiteta slota: slot je vezan na (otisak, work_type). Re-check mora odgovarati oboje. Ista teza pod drugim work_type je drugi profil i druga cijena, dakle novi slot. To je poÅ¡teno (diplomski profil je dublji i skuplji).

## 5. Logika servera (Edge Function: generate-report)

Pseudo-tijek (agent implementira u Deno Edge Function), redom:

```
ulaz: { parsedStructure, analysisResult, workType }  (klijent, za plaÄeni izvjeÅ¡taj)
1. auth: zahtijevaj prijavljenog korisnika (Supabase JWT). Bez prijave -> 401.
2. rate limit: broj report_generations za usera u zadnjih 24h.
   ako > DAILY_CAP -> 429 (+ flag anomalije). 
3. fingerprint = computeFingerprint(parsedStructure)   // server-side, iz payloada
4. traÅ¾i aktivan document_slot za usera gdje:
      work_type == workType
      slot_expires_at > now()
      fingerprintMatch(slot.fingerprint, fingerprint) == true
   ako postoji -> RE-CHECK: dopusti, logiraj generaciju, vrati izvjeÅ¡taj.
5. inaÄe treba novi slot:
   naÄi entitlement za usera gdje:
      work_type == workType
      status == 'active'  i  purchase_expires_at > now()
      slots_used < slots_total
   ako postoji:
      transakcijski: slots_used += 1 (uz provjeru protiv race conditiona),
      kreiraj document_slot { entitlement_id, user_id, work_type, fingerprint,
                              label (default po naslovu), bound_at=now(),
                              slot_expires_at=now()+window(workType) }
      dopusti, logiraj generaciju, vrati izvjeÅ¡taj.
   inaÄe -> 402 PAYMENT_REQUIRED (klijent prikazuje paywall za taj workType).
6. izvjeÅ¡taj: generiraj iz payloada, ubaci diskretan per-purchase token (traceability).
```

window(workType): 7 dana za seminarski, zavrsni, diplomski; 14 dana (ili semestar) za doktorski. DrÅ¾i u jednoj konfiguraciji.

Sve provjere entitlementa i slotova rade SERVERSKI. Klijent nikad nije izvor istine o pravu pristupa.

## 6. Referentna shema (Supabase Postgres, agent prilagodi konvencijama repoa)

```sql
-- kupnja: daje N slotova jednog work_type
create table entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  work_type text not null check (work_type in ('seminarski','zavrsni','diplomski','doktorski')),
  slots_total int not null check (slots_total >= 1),
  slots_used int not null default 0 check (slots_used >= 0),
  status text not null default 'active' check (status in ('active','refunded','void')),
  order_id text not null,                 -- id iz Merchant of Record providera
  provider text not null,                 -- 'paddle' | 'lemonsqueezy'
  created_at timestamptz not null default now(),
  purchase_expires_at timestamptz not null,  -- rok za POTROÅ ITI slotove (npr. +90 dana)
  constraint slots_used_le_total check (slots_used <= slots_total),
  unique (provider, order_id)             -- idempotencija webhooka
);

-- slot vezan na konkretan rad (otisak)
create table document_slots (
  id uuid primary key default gen_random_uuid(),
  entitlement_id uuid not null references entitlements(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  work_type text not null,
  fingerprint jsonb not null,             -- { titleNorm, authorNorm, headings[], sectionCount }
  label text,                             -- npr. "Moj diplomski"
  bound_at timestamptz not null default now(),
  slot_expires_at timestamptz not null
);
create index on document_slots (user_id, work_type, slot_expires_at);

-- log generacija: rate limit + detekcija anomalija
create table report_generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  slot_id uuid references document_slots(id) on delete set null,
  doc_fingerprint jsonb not null,
  ip_hash text,                           -- HASHIRAN, ne sirovi IP (GDPR)
  status text not null,                   -- 'recheck' | 'new_slot' | 'denied' | 'rate_limited'
  created_at timestamptz not null default now()
);
create index on report_generations (user_id, created_at);
```

RLS (obavezno):
- UkljuÄi RLS na sve tri tablice.
- Korisnik smije ÄITATI samo svoje retke (user_id = auth.uid()).
- Pisanje u entitlements, slots_used, document_slots i report_generations radi ISKLJUÄIVO server (Edge Function preko service role ili security definer funkcija). Klijent nikad ne piÅ¡e entitlemente niti dodjeljuje slotove.
- Korisnik A ne smije vidjeti ni koristiti entitlement ni slot korisnika B.

## 7. Webhook (Merchant of Record)

- Koristi Merchant of Record (Paddle ili Lemon Squeezy), ne goli Stripe, jer MoR rjeÅ¡ava EU PDV za prodaju po EU. Goli Stripe znaÄi da PDV compliance pada na tebe.
- Na uspjeÅ¡no plaÄanje: kreiraj entitlement { user_id, work_type, slots_total, order_id, provider, purchase_expires_at }.
- Idempotentno preko unique (provider, order_id). Ponovljeni webhook ne smije udvostruÄiti slotove.
- Na refund: postavi status 'refunded' i blokiraj daljnje vezivanje slotova iz tog entitlementa.
- Mapiranje proizvod -> work_type i slots_total drÅ¾i u jednoj tablici ili konfiguraciji.

## 8. Rate limit i anomalije

- DAILY_CAP generacija po korisniku u 24h (npr. 30). Iznad -> 429.
- Anomalija flag: npr. > 50 uploada u sat ili mnogo razliÄitih otisaka u kratko vrijeme s istog raÄuna. Flag, ne tvrda blokada osim u oÄitim sluÄajevima.
- Ovo ubija skriptanu zloupotrebu, ne smeta normalnom korisniku.
- NE radi hard device binding ni concurrent-session policiju. Na 3 EUR to je gubitak vremena i kvari UX (mobitel plus laptop, legitimno).

## 9. Anti-gaming, scenariji

| Scenarij | Ishod | ZaÅ¡to |
|---|---|---|
| Dijele login, 10 ljudi, isti rad | dopuÅ¡teno | limit je po dokumentu, to je jedan rad |
| Dijele login, 10 razliÄitih radova | blokirano | svaki rad traÅ¾i slot, dakle 10 naplata |
| Jedan kupac, 10 razliÄitih radova | blokirano | isto, 10 slotova |
| Sekvencijalni overwrite (A kupi, B uploada svoj rad) | blokirano | B-ov otisak ne odgovara slotu |
| LaÅ¾ira otisak da odgovara slotu | poraÅ¾en | izvjeÅ¡taj se generira iz laÅ¾iranog payloada, beskoristan za stvarni rad |
| Editira svoj rad 20 puta, mijenja ime i format | dopuÅ¡teno | otisak preÅ¾ivi ureÄivanje, isti slot |
| Skriptani masovni uploadi | rate limit + flag | cap po korisniku u 24h |

## 10. Failure modes koje NE smijeÅ¡ uvesti

1. Vezivanje na hash datoteke. Lomi re-check poÅ¡tenog korisnika pri svakom spremanju. Koristi otisak.
2. Strog prag podudaranja otiska. Blokira legitimno velike izmjene izmeÄu draftova. DrÅ¾i labavo.
3. Naplata po provjeri umjesto po dokumentu. Ubija re-check petlju, koja je srce proizvoda.
4. Gateanje teasera. Ubija lijevak. Teaser ostaje besplatan i lokalan.
5. Klijentska provjera prava pristupa. Probojna u 5 minuta. Sve odluke o pravu su serverske.
6. Hard device ili IP binding. Lomi legitimno koriÅ¡tenje na viÅ¡e ureÄaja.

## 11. Kriteriji prihvaÄanja (testabilno, Definition of Done)

1. Kupnja 1 diplomski slota, upload rada X, generacija izvjeÅ¡taja prolazi.
2. TeÅ¡ko ureÄen X (preimenovan, promijenjen redoslijed nekih sekcija, izvezen kao drugi format) ponovno generiran unutar 7 dana -> prolazi na ISTOM slotu, bez nove naplate.
3. Upload oÄito drugog rada Y bez slobodnog slota -> 402, paywall za taj work_type.
4. LaÅ¾irani otisak (struktura payloada razliÄita od slota) -> ne matcha -> blokirano (i izvjeÅ¡taj bi ionako bio za poslanu strukturu).
5. Nakon isteka prozora slot za X istekao -> re-check traÅ¾i novu kupnju.
6. Rate limit: > DAILY_CAP generacija u 24h -> 429 i log.
7. Krivi work_type: platiÅ¡ seminarski, uploadaÅ¡ diplomski -> dobijeÅ¡ profil seminarskog (plitku provjeru), self-punishing, nije potrebna posebna policija.
8. RLS: korisnik A ne moÅ¾e proÄitati ni iskoristiti entitlement ni slot korisnika B.
9. Teaser radi potpuno klijentski, bez entitlementa i bez mreÅ¾e.
10. Webhook idempotentan: dvostruka dostava ne udvostruÄuje slotove.

## 12. Redoslijed implementacije (svaki task: build gate zelen, migracije prolaze)

1. Migracije: tablice entitlements, document_slots, report_generations + RLS politike.
2. Modul za otisak (klijent, Äista funkcija) + testovi nad fixturama: dokaÅ¾i stabilnost otiska kroz ureÄivanja i razliku izmeÄu razliÄitih radova.
3. Edge Function generate-report: tijek iz sekcije 5, server raÄuna otisak iz payloada.
4. Webhook handler za MoR: kreira entitlement, idempotentno.
5. Klijent: teaser lokalno; "otkljuÄaj puni izvjeÅ¡taj" zove Edge Function; 402 -> paywall; imenovani slotovi u UI ("Moj diplomski"), novi upload se po defaultu tretira kao nova verzija slota.
6. Rate limit i anomalije.
7. Testovi za svaki kriterij iz sekcije 11.

## 13. Privatnost i GDPR

- Otisak je minimalan i normaliziran. Naslov i autor mogu biti osobni podatak, drÅ¾i samo Å¡to je nuÅ¾no i ne izlaÅ¾u se drugim korisnicima (RLS).
- report_generations sprema HASHIRAN IP, ne sirovi, i ima retencijski rok (npr. 90 dana), zatim brisanje.
- PlaÄeni izvjeÅ¡taj se generira on demand i ne pohranjuje se trajnije nego Å¡to treba.
- Sve usklaÄeno s VISION.md naÄelom privatnosti: za samu analizu (teaser) dokument ostaje lokalno.

## 14. Guardrails (uz CLAUDE.md)

- Pravo pristupa je uvijek serverska odluka.
- Identitet rada je otisak, nikad hash datoteke.
- Prag podudaranja labav, optimiziran za false-allow.
- Server raÄuna otisak iz istog payloada iz kojeg generira izvjeÅ¡taj.
- Bez over-engineeringa DRM-a. Cilj je zloupotrebu uÄiniti skupljom od plaÄanja, ne je eliminirati.
- Hrvatski je default jezik, bez em i en crtica. Produkcijski kod, mali commitovi, npr. ne commitaj crveno.

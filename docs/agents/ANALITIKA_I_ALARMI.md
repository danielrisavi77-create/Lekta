# Analitika i alarmi: odluka za T53 i T54

Status: prijedlog odluke za vlasnika (26. 9. 2026). Dokument ne mijenja kod, CSP ni bazu; svaki
korak plana je zaseban zadatak s vlastitim dokazom.

Oznaka **[neprovjereno]** znaci da podatak dolazi od dobavljaca i nije potvrdjen u ovoj sesiji
(mreza sesije blokira umami.is i developers.cloudflare.com). Takav podatak se provjerava na
sluzbenoj stranici prije ugradnje; ako se razlikuje, vrijedi sluzbena stranica i ovaj dokument
se ispravlja.

## T53: web analitika bez kolacica

### Polazno stanje u repozitoriju

- CSP zivi u `public/_headers` (ne u `index.html` ni `netlify.toml`; `netlify.toml` samo upucuje
  na `_headers`). Trenutno vrijedi:
  - `script-src 'self'` plus dva `sha256-` hasha inline skripti, bez ijedne vanjske domene;
  - `connect-src 'self' __CSP_SUPABASE__ https://api.crossref.org https://doi.org`;
  - `img-src 'self' data:`.
  Placeholder `__CSP_SUPABASE__` i `__CSP_LS__` zamjenjuje `vite.config.ts` pri buildu, a
  `scripts/verify-deploy-dist.mjs` provjerava da nijedan nije ostao u `dist/`. Komentar u
  `_headers` izricito trazi da se svaka nova analitika doda tu, inace je preglednik blokira
  (fail-closed, namjerno).
- Stranica je na Netlifyju, NIJE iza Cloudflare proxyja, pa Cloudflare Web Analytics radi samo
  kroz JS beacon, ne automatski na rubu mreze.
- Postojeca produktna telemetrija (`trackEvent`, vidi odjeljak Privatnost) salje na vlastiti
  Supabase endpoint `analytics-event` i radi SAMO uz privolu. T53 je odvojen sloj: anonimne
  posjete bez kolacica, bez privole, bez produktnih dogadjaja.
- URL-ovi nose osjetljive dijelove koje analitika NE smije zabiljeziti:
  - `?ref=<kod>` (preporuka, `src/ui/referral-share-section.ts`);
  - `#session=...` (lokalna sesija dokumenta, `src/session/local-document-session.ts`);
  - `#...refresh_token=...` (admin prijava, `src/admin/admin-auth.ts`).

### Usporedba: Cloudflare Web Analytics i Umami

| Kriterij | Cloudflare Web Analytics | Umami Cloud (besplatni sloj) | Umami self-host |
|---|---|---|---|
| Cijena | Besplatno, bez limita posjeta [neprovjereno] | Besplatno do limita (Hobby: oko 100 000 dogadjaja mjesecno, do 3 weba, ogranicena retencija) [neprovjereno] | Softver besplatan (MIT); placa se hosting Node servera i PostgreSQL baze |
| Kolacici i privola | Bez kolacica i bez localStorage identifikatora; nije potrebna privola za kolacice. Podaci idu Cloudflareu (SAD, EU-US DPF) [neprovjereno] | Bez kolacica; posjetitelj se broji hashom sa dnevnom soli, bez trajnog ID-a [neprovjereno]. Lokacija podataka provjeriti (EU ili SAD) | Isto kao Cloud, ali podaci ostaju na nasem serveru; najcisci GDPR polozaj |
| Sto mjeri | Posjete, prikazi stranica, putanje, refereri, zemlje, uredjaji i preglednici, Core Web Vitals | Posjete, prikazi, putanje, refereri, zemlje, uredjaji, UTM parametri, prilagodjeni dogadjaji | Isto kao Cloud |
| UTM | Nema zasebnog UTM izvjestaja [neprovjereno] | Ima UTM izvjestaj (utm_source, utm_medium, utm_campaign...) | Ima |
| CSP domene | `script-src https://static.cloudflareinsights.com`; `connect-src https://cloudflareinsights.com` [neprovjereno] | `script-src https://cloud.umami.is`; `connect-src https://cloud.umami.is` (noviji skript moze slati na `https://api-gateway.umami.is`) [neprovjereno] | Samo nasa domena analitike; uz Netlify rewrite na istu domenu dovoljan je `'self'` |
| Performanse | Jedan async skript (nekoliko KB), jedan beacon po prikazu | Jedan `defer` skript (oko 2 KB), jedan POST po prikazu | Isto kao Cloud; latencija ovisi o nasem hostingu |
| Iskljucenje | Ukloniti `<script>` i dvije CSP domene; u Cloudflare dashboardu obrisati site | Ukloniti `<script>` i CSP domene; `data-do-not-track="true"` postuje DNT preglednika; site obrisati u dashboardu | Isto, plus ugasiti server |
| Zastita URL-a | Biljezi putanju; ponasanje s query stringom provjeriti [neprovjereno] | `data-exclude-search` i `data-exclude-hash` atributi; `data-before-send` hook za filtriranje [neprovjereno] | Isto kao Cloud |
| Odrzavanje | Nula | Nula | Nadogradnje, backup, uptime: stalni trosak vlasnikova vremena |

### Preporuka

**Preporuka: Umami Cloud (besplatni sloj), skript posluzen kroz Netlify rewrite s nase domene.**

Obrazlozenje:

1. UTM je razlog. T55 (lijevak) vec trazi `utm_source`, a PR #117 nosi `utm_*` do `/rad/` bez
   ikoga tko ih cita. Cloudflare WA ne daje UTM izvjestaj, pa bi za kampanje trebao drugi alat.
2. Nula odrzavanja uz vlasnikovo ograniceno vrijeme; self-host se odbacuje dok promet ne
   prijedje besplatni limit ili dok pravna procjena ne trazi podatke na vlastitom serveru.
   Umami podatke se moze izvesti, pa je prelazak na self-host kasnije moguc bez gubitka povijesti
   [neprovjereno: provjeriti izvoz na sluzbenoj stranici].
3. Rewrite s nase domene (npr. `/s/u.js` i `/s/api/send` kao Netlify 200 proxy na Umami) drzi CSP
   na `'self'` i ne otvara novu vanjsku domenu, sto je u duhu postojeceg fail-closed CSP-a.
   Ako rewrite ne radi pouzdano, dodaju se tocno dvije domene iz tablice, nista siroko.
4. Cloudflare WA ostaje rezervna opcija ako se pokaze da Umami Cloud podatke drzi izvan EU bez
   odgovarajuceg ugovora ili ako limit postane problem prije nego sto self-host ima smisla.

Uvjet preporuke: prije ugradnje vlasnik na umami.is potvrdi (a) limite besplatnog sloja,
(b) lokaciju podataka i DPA, (c) atribute za iskljucivanje query stringa i hasha. Ako (b) ne
prolazi, preporuka prelazi na Cloudflare WA bez UTM-a, a UTM ide kroz `trackEvent` uz privolu (T55).

### Plan ugradnje u 5 koraka

1. **Provjera dobavljaca**: potvrditi tri uvjeta iz preporuke i zapisati izvor (URL i datum) u ovaj
   dokument; bez toga se ne ide dalje.
2. **Racun i site**: otvoriti Umami Cloud racun na poslovni mail, dodati jedan site za produkcijsku
   domenu, dobiti `website-id`. Nikakav kljuc ne ide u repozitorij osim javnog `website-id`.
3. **Rewrite i CSP**: dodati Netlify 200 rewrite za skript i endpoint na nasu domenu; ako rewrite
   nije moguc, dodati tocno dvije Umami domene u `script-src` i `connect-src` u `public/_headers`
   s komentarom, te gard u `tests/` koji tvrdi da nema zamjenskih znakova u tim domenama.
4. **Skript sa zastitom URL-a**: jedan `<script defer>` s `data-website-id`, `data-exclude-hash`,
   `data-do-not-track` i filtrom query stringa koji propusta samo `utm_*` (nikad `ref`, `session`,
   tokene). Test: gard nad `index.html` i ruciran pregled mreznog zahtjeva u pregledniku da payload
   ne nosi `ref=` ni `#`.
5. **Pravni tekst i gasenje**: azurirati izjavu o privatnosti (sto se mjeri, dobavljac, bez kolacica,
   kako se iskljucuje) i u ovaj dokument upisati postupak gasenja (ukloniti skript, rewrite, CSP).
   Tek tada objava.

## T54: operativni alarmi

### Izvori signala u repozitoriju

- **Naplata**: tablica `public.webhook_events` (migracija 0092) biljezi svaki dogadjaj PRIJE
  obrade, sa stupcima `provider`, `event_name`, `order_id`, `outcome` (`processed`, `refused`,
  `unknown_product`, `failed`, `needs_manual_link`, `ignored`, ili `null` dok traje) i
  `received_at`. Djelomicni indeks `webhook_events_unresolved` pokriva samo `null`, `failed` i
  `unknown_product`; `needs_manual_link` i `ignored` se traze upitom po `outcome`
  (`supabase/README.md`, `docs/GO_LIVE_NAPLATA.md` sekcija 5.1).
- **Stripe**: prema vlasnikovoj odluci od 23. 9. Lekta naplata ide na Stripe. Kod u repozitoriju
  (`supabase/functions/webhook-mor`) je jos Lemon Squeezy tok. Stupac `provider` omogucuje da
  Stripe dogadjaji idu u istu tablicu, pa alarmi nize vrijede za oba providera.
- **Podsjetnici**: pg_cron posao `send-deadline-reminders` (`0 8 * * *`, migracija 0059) poziva Edge
  funkciju `send-reminders` preko pg_net s `REMINDER_CRON_SECRET`.
- **Smoke**: `.github/workflows/post-deploy-smoke.yml` vrti `scripts/post-deploy-smoke.mjs` nad
  produkcijom svakih 6 sati (`17 */6 * * *`).
- **Edge funkcije**: logovi su u Supabase Log Exploreru; klijentske greske idu kroz Edge funkciju
  `client-error`; zivost pokriva funkcija `health` i smoke.
- **Mail**: Resend je vec konfiguriran za podsjetnike (`RESEND_API_KEY`, `REMINDER_FROM_EMAIL`).

### Alarmi

| Alarm | Izvor signala | Prag | Zasto bas taj prag |
|---|---|---|---|
| Pali webhook naplate | pg_cron svakih 15 min: upit nad `webhook_events` gdje je `outcome in ('failed','unknown_product')` ili `signature_valid = false`, ili `outcome is null` stariji od 10 min | Svaki novi redak | Svaki takav redak je placena ili pokusana narudzba bez prava; nema prihvatljive razine sumova. Stripe i sam salje mail kad endpoint uporno pada, sto je besplatna druga linija |
| Redovi `needs_manual_link` | Isti pg_cron posao, upit po `outcome = 'needs_manual_link'` | Svaki novi redak odmah; podsjetnik ako je nerazrijesen dulje od 24 h | Novac je naplacen, korisnik nema pravo; rucno vezivanje po `GO_LIVE_NAPLATA.md` 5.1 |
| Greske Edge funkcija | GitHub Actions posao po satu cita broj 5xx po funkciji iz Supabase logova (Management API, token u GitHub secretu) [neprovjereno: dostupnost API-ja na planu projekta] | Bilo koji 5xx na `webhook-mor`, `create-checkout`, `repair-docx`; za ostale 5 ili vise 5xx u satu | Naplatne i placene funkcije nemaju toleranciju; ostale imaju mali prag da jedan los zahtjev ne budi vlasnika |
| Pad post-deploy smokea | Postojeci workflow, novi korak `if: failure()` | Jedan pad | Vrti se svakih 6 h, pa je jedan pad vec 6 h neispravne produkcije; flake nije uzrok (pravilo repozitorija) |
| Pad pg_cron podsjetnika | pg_cron provjera u 08:30: `cron.job_run_details` za `send-deadline-reminders` i HTTP status iz `net._http_response` | Posao nije uspio, HTTP nije 2xx, ili zadnji uspjeh stariji od 26 h | pg_net je asinkron: uspjesan cron posao ne znaci da je funkcija vratila 2xx, pa se mjeri oboje |

Arhitektura: jedan pg_cron posao `ops-alarms` (svakih 15 min) izvodi SQL provjere i za nove nalaze
zove jednu malu Edge funkciju `ops-alert` preko pg_net, zasticenu dediciranom cron tajnom po uzoru
na `_shared/cron-auth.ts`. Tablica stanja alarma (kljuc alarma, zadnje slanje) sprjecava da isti
nalaz stize svakih 15 minuta. GitHub Actions poslovi (smoke, Edge logovi) salju izravno na isto
odrediste. Nova migracija dobiva prefiks od `0200` navise (CLAUDE.md, `tests/migration-numbering.test.ts`).

### Odrediste: mail i Telegram

| Kriterij | Mail (Resend) | Telegram bot |
|---|---|---|
| Cijena | Besplatni sloj Resenda (oko 3 000 mailova mjesecno, 100 dnevno) [neprovjereno]; vec se koristi | Besplatno (Bot API) |
| Postavljanje | Vec postoji kljuc; ali isporucivost s nase domene ovisi o T49 (SPF, DKIM, DMARC), koji nije gotov | Bot preko BotFathera, dvije tajne (token, chat id), jedan HTTPS POST |
| Brzina i vidljivost | Moze zavrsiti u spamu ili se procitati satima kasnije | Push na mobitel u sekundama |
| Rizik | Mijesa se s korisnickim mailovima i kvotom podsjetnika | Jos jedan vanjski servis; poruka ne smije nositi osobne podatke |
| CSP | Nema utjecaja (salje posluzitelj) | Nema utjecaja (salje posluzitelj) |

**Preporuka: Telegram kao jedino odrediste alarma dok T49 nije gotov; nakon T49 dnevni sazetak
mailom kao druga linija.** Telegram je besplatan, najjednostavniji za postavljanje i jedini daje
trenutni push. Mail ostaje za sazetak jer ne smije trositi kvotu korisnickih podsjetnika ni ovisiti
o DNS-u koji jos nije postavljen.

### Sto NE raditi

- Nema AI akcija: alarm javlja, covjek odlucuje. Nikakav model ne cita, sazima ni rjesava alarme.
- Nema n8n ni drugog orkestratora; samo pg_cron, pg_net, jedna Edge funkcija i GitHub Actions.
- Nema automatskog povrata novca, automatskog vezivanja narudzbe ni ponovnog slanja webhooka iz
  alarma; to ostaje rucni postupak iz `GO_LIVE_NAPLATA.md`.
- Poruka alarma nosi samo vrstu alarma, broj nalaza, `order_id` ili ime funkcije i vrijeme;
  nikad e-mail, ime, IP, sadrzaj rada ni ime datoteke.
- Nema alarma na svaki pojedinacni 4xx ni na metrike rasta; alarmi su za kvarove koji trose novac
  ili povjerenje, ne za dashboard.

### Plan u 5 koraka

1. **Telegram bot i tajne**: vlasnik napravi bota i privatni chat; `TELEGRAM_BOT_TOKEN` i
   `TELEGRAM_CHAT_ID` idu u Supabase Edge secrets i GitHub secrets, nikad u repozitorij.
2. **Edge funkcija `ops-alert`**: prima vrstu alarma i sazetak, provjerava cron tajnu, salje jednu
   poruku; test da bez tajne vraca 401 i ne zove Telegram (fail-closed), po uzoru na `send-reminders`.
3. **Migracija `ops-alarms` (0200+)**: tablica stanja alarma i pg_cron posao s upitima za naplatu,
   `needs_manual_link` i podsjetnike; smoke SQL koji podmece `failed` i `needs_manual_link` redak i
   dokazuje da alarm nastaje tocno jednom (drugi prolaz je no-op). Primjena iskljucivo `supabase db push`.
4. **GitHub Actions**: korak `if: failure()` u `post-deploy-smoke.yml` i novi satni posao za 5xx
   Edge funkcija; mutacija u `tests/gate-mutations.test.ts` koja dokazuje da uklonjen korak obara gard.
5. **Probni alarm i runbook**: na stagingu izazvati svaki od pet alarma jednom, zapisati dokaz
   (vrijeme, poruka) i dodati kratki runbook "sto napraviti kad stigne alarm X" uz poveznicu na
   `GO_LIVE_NAPLATA.md`.

## Privatnost

Sto se smije mjeriti:

- **T53 (bez privole)**: samo agregatne posjete: putanja stranice bez query stringa i bez hasha,
  referer domena, zemlja, vrsta uredjaja i preglednika, `utm_*` parametri. Nikad `ref`, `session`,
  tokeni ni bilo koji drugi dio URL-a.
- **Produktni dogadjaji (uz privolu)**: samo kroz postojeci `trackEvent`.
- **Nikad, ni u jednom sloju**: sadrzaj radova, naslov, autor, ime datoteke, komentari, isjecci
  teksta, e-mail ili IP u cistom obliku. Studentski rad nikad ne napusta preglednik radi analitike;
  analiza je lokalna i analitika to ne mijenja.

Veza s `trackEvent` u `src/ui/telemetry.ts`:

- `trackEvent` ne salje nista ako `analyticsEndpoint` nije postavljen ili privola nije `granted`;
  privola se cita pri svakom pozivu, pa povlacenje djeluje odmah.
- Uz naziv dogadjaja uvijek salje samo `version`, `path` (`location.pathname`, bez query stringa i
  hasha) i `timestamp`; sve ostalo prolazi kroz `sanitizeEventData`.
- `DOPUSTENI_KLJUCEVI` je bijela lista: kljuc izvan nje ispada, a i dopusteni kljuc prolazi samo
  ako je vrijednost string, broj ili boolean (objekti i nizovi ispadaju). Kljucevi po skupinama:
  - identitet dogadjaja i ponude: `event`, `package`, `product`, `provider`, `source`, `method`,
    `kind`, `category`, `pick`, `demo`, `manual`;
  - profil i vrsta rada: `profileId`, `profileStatus`, `workType`, `ruleId`;
  - brojevi i ishodi provjere: `total`, `found`, `missing`, `flagged`, `checked`, `issueCount`,
    `count`, `changes`, `stored`, `score`, `scoreBand`;
  - velicina i trajanje: `sizeBucket` (razred velicine, ne tocna velicina), `ms`.
- Opportunity Report dodatno koristi brojcane kljuceve `auto`, `assisted`, `unknown` i `structureGaps`; structure/no-op detalji koriste samo postojece dopustene `category`, `kind` i `count`. Svi ostaju anonimni agregati bez teksta rada, izvornog skip razloga ili `ruleId`-a.\n- Nijedan kljuc ne nosi tekst rada ni ime datoteke; `tests/product-journey-telemetry.test.ts` tvrdi
  da sanitizacija odbacuje sve izvan bijele liste. T53 skript ne zove `trackEvent` i ne salje
  produktne dogadjaje, pa sloj bez privole ne moze procuriti u sloj s privolom ni obrnuto.

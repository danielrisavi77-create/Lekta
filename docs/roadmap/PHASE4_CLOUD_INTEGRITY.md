# PHASE4_CLOUD_INTEGRITY.md · Lekta

Tehnički dizajn opcionalnog cloud integritetskog modula: plagijat, cross-lingual (prijevodni)
plagijat i AI-detekcija. Provodi stratešku odluku A iz [CO_PILOT_STRATEGY.md](CO_PILOT_STRATEGY.md):
lokalno plus cloud opt-in. Pravilo pisanja: hrvatski, bez em i en crtica.

Status: dizajn, nije implementirano. Ovo je najveći i najrizičniji dio plana i namjerno dolazi
zadnji, nakon što je naplata (Faza 1) živa.

## 1. Cilj i granice

Ciljano pokrivamo dvije rupe koje Turnitin ne rješava (plan, sekcija 1):
1. Prijevodni plagijat: rad preveden s drugog jezika. Leksička podudarnost ga ne hvata;
   rješava se multilingual embeddingsima i semantičkom sličnošću preko jezika.
2. AI-generiran tekst: informativni signal, uokviren kao mjerenje, nikad kao optužba.

Granica (kritična): ovo je jedini dio Lekte koji šalje tekst rada izvan preglednika. Sve ostalo
(format, struktura, citati, registar) ostaje lokalno. Zato cijeli modul stoji iza:
- eksplicitne, zasebne privole (odvojene od checkout privole),
- plaćenog entitlementa (Thesis Pass ili slot),
- jasnog, dokumentiranog retention pravila.

## 2. Arhitektonski sukob i kako ga rješavamo

Današnja obrana je "sve je lokalno, dokument ne napušta preglednik". Plagijat i cross-lingual su
nemogući čisto klijentski (trebaju korpus, indeks i hostane modele). Zato:

- Ne diramo lokalnu jezgru. `analyzeDocx` i repair ostaju u pregledniku i besplatni.
- Cloud provjera je zaseban, imenovan korak s vlastitim ekranom privole ("ovaj korak šalje tekst
  tvog rada našem posluzitelju radi provjere; evo što se šalje, koliko se čuva, i kako obrisati").
- Privacy copy se prije toga precizira (Faza 0): "lokalna analiza formata" naspram "opcionalna
  cloud provjera uz privolu". Bez toga modul je GDPR regresija.

## 3. Komponente

### 3.1 Klijent: privola i priprema payloada
- Novi tip `IntegrityConsent` po uzoru na `CheckoutConsent` ([checkout.ts:77-88](../../src/report/checkout.ts#L77-L88)):
  bilježi točan tekst, timestamp, verziju uvjeta.
- Klijent šalje čisti tekst rada (ili, za cross-lingual, samo embeddinge ako se računaju
  lokalnim modelom u v2) tek nakon privole i uz vazeci JWT. Isti injektabilni `fetch` uzorak kao
  [report-client.ts](../../src/report/report-client.ts).

### 3.2 Backend: Supabase Edge (Deno) + pgvector
- Nova Edge Function `integrity-check` uz postojeće (`generate-report`, `webhook-mor`). Tanki
  Deno omotač: auth, entitlement gate (isti `decideReportAccess` obrazac), I/O nad bazom.
- `pgvector` ekstenzija za pohranu i pretragu embeddinga (Supabase je podržava nativno).
- Migracija: tablica `integrity_corpus` (id, source_ref, lang, embedding vector) i
  `integrity_checks` (user_id, entitlement_id, created_at, retention_expires_at, rezultat sažetak).

### 3.3 Cross-lingual (prijevodni plagijat)
- Multilingual embedding model (hostani provider ili self-host u v2) pretvara odlomke rada u
  vektore u zajedničkom prostoru preko jezika.
- Sličnost se traži pgvector `<=>` operatorom nad korpusom (izvori na više jezika).
- Napomena: dodatak plana opisuje ovaj modul kao Next.js endpoint (pgvector + multilingual
  embeddings). Ovaj repo je Vite bez backenda, pa se modul NE uvozi, nego reimplementira kao
  Supabase Edge Function, u skladu s postojećom arhitekturom (waitlist, rokovi već tako rade).

### 3.4 Plagijat (isti jezik)
- Kratkoročno: vanjski plagijat API (manje koda, jasan trošak po provjeri).
- Dugoročno: vlastiti pgvector indeks nad kuriranim korpusom. Pravni i troškovni teret; odgoditi
  dok volumen ne opravda.

### 3.5 AI-detekcija
- Vanjski AI-detektor API ili model. Rezultat je informativni raspon vjerojatnosti, NIKAD binarna
  optužba. Copy: "ovaj signal nije dokaz; institucije koriste vlastite alate". Ovo štiti brand od
  rizika lažnog pozitiva koji bi srušio korisnika (plan, sekcija 4).

## 4. Tok podataka i privatnost

- Šalje se: tekst rada (ili embeddingsi) samo nakon privole. Ostaje pravilo iz
  [report.ts sanitizeAnalysisResult](../../src/report/report.ts#L214) da format-analiza NE nosi
  doslovni tekst; integritetski modul je zaseban kanal s vlastitom privolom baš zato što tekst
  treba.
- Retencija: definiran prozor (npr. obradi i obriši nakon N dana), zapisan u `integrity_checks.retention_expires_at`
  i u pravnim tekstovima. Purge pg_cron job po uzoru na postojeće retention jobove.
- Nikad za treniranje (uzorak od PaperChecka; napisati u copy i uvjete).

## 5. Naplata i gating

- Cloud provjera je iza entitlementa. Thesis Pass (0017) ju uključuje kao dio "cijelog puta do
  obrane"; jednokratni slot ju može nuditi kao dodatak. Iskoristi postojeći `decideReportAccess`
  obrazac ([slot-logic.ts:80](../../src/report/slot-logic.ts#L80)) da odluka ostane serverska.
- Free hook (plan: cross-lingual kao SEO mamac u Free sloju): dopušten SAMO uz privolu i s tvrdim
  limitom (npr. jedan kratki ulomak ili sažeti rezultat bez detalja), pun rezultat iza gatea. Bez
  privole nema slanja ni u free varijanti.

## 6. Pod-koraci Faze 4

1. Precizni privacy copy i `IntegrityConsent` (bez mreže još).
2. `integrity-check` Edge skeleton + entitlement gate + migracije (pgvector, tablice).
3. Cross-lingual MVP nad malim kuriranim korpusom; mjeri kvalitetu prije šire objave.
4. Plagijat preko vanjskog API-ja; AI-detekcija kao informativni signal.
5. Retention purge job + pravni tekstovi + uvjeti ("ne treniramo", retencija).
6. Free hook s limitom, ožičen u paywall lijevak.

## 7. Otvorene odluke za foundera

- Provider embeddinga (hostani naspram self-host u v2; privatnost naspram troška).
- Izvor korpusa za plagijat i cross-lingual (vlastiti naspram vanjski API).
- AI-detektor provider i točan copy caveata.
- Retention prozor (dani) i tekst privole.

## 8. Rizici

- Hostani embeddingsi su privatnosni rizik (plan, tablica rizika): dokumentiraj retenciju, planiraj
  self-hosted multilingual model za v2.
- Trošak po provjeri je stvaran; drži ga iza gatea, ne u besplatnom neograničenom obliku.
- Lažni pozitiv AI-detekcije: uokviri kao signal, ne presuda; nikad ne generiramo tekst da ga ne
  bi detektor označio (odluka B i plan, sekcija 4).

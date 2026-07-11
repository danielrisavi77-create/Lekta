# AUDIT_BRIEF.md, Lekta

Reusable brief za produkcijski hardening, UX restrukturiranje i pripremu za javno
lansiranje aplikacije Lekta (https://lektahr.netlify.app/). Ovo je ciscena, ispravljena
verzija izvornog dokumenta `LEKTA_PRODUCTION_AUDIT_AND_HARDENING.md` (izvorni je stigao s
poremecenim kodiranjem hrvatskih znakova). Sadrzaj je vjeran izvorniku; dodani su samo
meta odjeljci koji ga vezu uz vec proizvedene auditne izlaze i opisuju kako ga ponovno
pokrenuti.

Konvencija ovog repozitorija: bez em i en crtica u tekstu (koristi zarez, dvotocku,
zagrade). Hrvatski je default jezik. Nista u ovom dokumentu ne mijenja produkcijsku logiku;
on je checklist, ne kod.

---

## 0. Kako koristiti ovaj brief (dodano)

Ovaj brief je izvor istine za SVAKI buduci audit Lekte. Ne prepisuj ga pri svakom prolazu;
umjesto toga:

1. Procitaj brief (odjeljci 1 do 21) da bi znao STO se provjerava i po kojim acceptance
   kriterijima.
2. Pogledaj vec proizvedene auditne izlaze i njihov trenutni status (tablica ispod).
3. Napravi verifikacijski prolaz: dokazi da su stavke oznacene kao gotove STVARNO gotove u
   kodu (ne vjeruj backlogu na rijec), pa osvjezi status. Recept je u odjeljku 23.
4. Nikad ne oznacavaj stavku gotovom bez file:line dokaza i zelenog `npm run check`.

### Mapa: odjeljak briefa -> proizvedeni izlaz

| Tema briefa | Proizvedeni dokument |
| --- | --- |
| Arhitektura (odjeljak 20.3) | `docs/audit/CURRENT_ARCHITECTURE.md` |
| Sigurnost (odjeljak 5, 15) | `docs/audit/SECURITY_AUDIT.md` |
| UX (odjeljak 6) | `docs/audit/UX_AUDIT.md` |
| Pristupacnost (odjeljak 9) | `docs/audit/ACCESSIBILITY_AUDIT.md` |
| SEO (odjeljak 11) | `docs/audit/SEO_AUDIT.md` |
| Performanse (odjeljak 10) | `docs/audit/PERFORMANCE_AUDIT.md` |
| Tok podataka (odjeljak 6.3, 16) | `docs/audit/DATA_FLOW.md` |
| Rute i poveznice (odjeljak 6.1) | `docs/audit/ROUTE_INVENTORY.md` |
| Vanjske biblioteke (odjeljak 20.4) | `docs/audit/THIRD_PARTY_DEPENDENCIES.md` |
| Launch blokatori (odjeljak 17) | `docs/audit/LAUNCH_BLOCKERS.md` |
| Prioritizirani backlog (odjeljak 19) | `docs/roadmap/PRODUCTION_BACKLOG.md` |
| Verifikacija napretka | `docs/audit/AUDIT_STATUS_<datum>.md` |

---

# 1. Glavni cilj

Aplikacija mora omoguciti sljedeci pouzdani tok:

1. Korisnik ucita DOCX ili PDF dokument.
2. Odabere fakultet i vrstu akademskog rada.
3. Dokument se sigurno analizira.
4. Sustav primjenjuje tocno odredenu verziju fakultetskog profila.
5. Svaki nalaz prikazuje: pronadeni problem; primijenjeno pravilo; izvor pravila; stranicu
   izvora kada postoji; razinu sigurnosti nalaza; konkretan prijedlog ispravka.
6. Korisnik jasno razumije: sto Lekta provjerava; sto Lekta ne provjerava; ostaje li
   dokument lokalno; kada se dokument salje na server; koliko dugo se cuva; koja su
   ogranicenja rezultata.
7. Administracija, produkcijska konfiguracija i tajni podaci nisu dostupni obicnom korisniku.
8. Aplikacija je spremna za sigurnu naplatu tek nakon zadovoljavanja definiranih kriterija.

---

# 2. Pravila rada

Prije izmjena: pregledaj cijeli repozitorij; napravi mapu arhitekture; pronadi sve ulazne
tocke; pronadi sve HTML stranice, rute, JS/TS datoteke, API pozive, Supabase konfiguracije,
Netlify/Edge funkcije, environment varijable, tokene, feature flagove, admin kontrole,
forme, sustave naplate i autentifikacije, parsere za DOCX i PDF, generatore izvjestaja,
lokalnu pohranu, analitiku i vanjske biblioteke.

Provjeri razliku izmedu produkcijskog koda, testnog koda, demo funkcija, nedovrsenih
funkcija i funkcija koje samo vizualno izgledaju aktivno.

Nemoj uklanjati funkcionalnosti bez dokumentiranja razloga. Nemoj mijenjati arhitekturu
naslijepo. Nakon svake faze pokreni testove i provjeri glavne korisnicke tokove. Sve
promjene radi u malim, logicnim commitovima. Ne izmisljaj da je nesto testirano ako test
nije stvarno pokrenut.

Ako su dostupni paralelni agenti, koristi ih za neovisne audite, ali objedini rezultate
prije izmjena. Preporuceni paralelni auditi: sigurnost; frontend arhitektura; backend i
Supabase; obrada DOCX/PDF; UX i pristupacnost; SEO; pravne i privatnosne povrsine;
performanse; testiranje; naplata i autentifikacija.

---

# 3. Obavezni pocetni izlazi

Prije pisanja produkcijskog koda proizvedi: CURRENT_ARCHITECTURE, SECURITY_AUDIT, UX_AUDIT,
ACCESSIBILITY_AUDIT, SEO_AUDIT, PERFORMANCE_AUDIT, DATA_FLOW, ROUTE_INVENTORY,
THIRD_PARTY_DEPENDENCIES, LAUNCH_BLOCKERS (sve u `/docs/audit/`) i PRODUCTION_BACKLOG (u
`/docs/roadmap/`).

Svaki nalaz mora sadrzavati: oznaku prioriteta; opis problema; lokaciju u kodu; dokaz ili
nacin reprodukcije; mogucu posljedicu; preporuceno rjesenje; acceptance kriterije; procjenu
rizika regresije.

Prioriteti: `P0` sigurnost, gubitak podataka, pravni rizik ili blokator lansiranja; `P1`
vazan problem funkcionalnosti, UX-a ili pouzdanosti; `P2` vazno poboljsanje koje nije
blokator; `P3` optimizacija i dodatna kvaliteta.

---

# 4. FAZA 0, zastita postojeceg stanja

Utvrdi stanje Git repozitorija; ne brisi korisnicke promjene; izradi popis postojecih ruta
i funkcija; dodaj osnovni smoke-test glavnih stranica; dodaj barem jedan test za ucitavanje
pocetne, otvaranje alata, odabir datoteke, pokretanje analize, prikaz rezultata i navigaciju
bez JS pogresaka; zabiljezi trenutne poznate pogreske prije popravljanja; napravi sigurnosnu
kopiju konfiguracijskih obrazaca u dokumentaciji, ali ne kopiraj tajne vrijednosti.

Acceptance: proizvod se moze pokrenuti lokalno; dokumentirana je naredba za dev i build;
popisane su sve javne rute; postoje osnovni smoke-testovi; nijedna postojeca korisnicka
funkcija nije nenamjerno uklonjena.

---

# 5. FAZA 1, P0 sigurnosni i produkcijski blokatori

## P0.1 Ukloniti produkcijsku konfiguraciju iz javnog UI-a

Pronadi sve javno dostupne elemente povezane s produkcijskom konfiguracijom, Supabase
URL-ovima i kljucevima, tokenima, endpointima, feature flagovima, pruzateljima naplate,
retention postavkama, admin akcijama, statickim tokenom izvjestaja.

Zahtjevi: konfiguracijska administracija nije dio javnog bundlea; obican korisnik ne moze
mijenjati produkcijske postavke; sigurnosno vazne odluke ne ovise o `localStorageu`;
serverske autorizacijske odluke ne ovise o vrijednosti koju klijent moze promijeniti; tajni
kljucevi su samo u server-side env varijablama; ako se koriste javni Supabase kljucevi,
provjeri i dokumentiraj sva RLS pravila; provjeri postoji li service_role ili druga tajna u
Git povijesti.

Acceptance: admin kod nije isporucen obicnom korisniku; u bundleu nema tajnih kljuceva;
korisnik promjenom DOM-a/localStoragea ne moze aktivirati admin mogucnosti; tablice imaju
eksplicitna RLS pravila; test potvrduje da neautorizirani korisnik ne moze citati ili
mijenjati tude podatke.

## P0.2 Odvojiti administracijsku aplikaciju

Administracija mora biti fizicki i autorizacijski odvojena. Zahtijeva stvarnu
autentifikaciju, provjeru uloge na serveru, zastitu svih admin API ruta, audit log
osjetljivih promjena i zabranu oslanjanja samo na skriveni gumb ili frontend provjeru.

Acceptance: admin ruta nije dostupna neautoriziranom korisniku; direktan API poziv bez uloge
zavrsava s 401/403; izmjene profila se logiraju; admin funkcije nisu u javnom bundleu ili
nisu izvrsive bez server-side autorizacije.

## P0.3 Popraviti pravne i nepostojece stranice

Provjeri interne poveznice: /garancija, /uvjeti-koristenja, /privatnost, /kolacici,
/sigurnost, /metodologija. Ako pravni tekstovi nisu finalizirani, napravi profesionalne
placeholder stranice koje jasno navode da naplata ili garancija jos nije aktivna. Nemoj
izmisljati pravne tvrdnje.

Acceptance: nema 404 poveznica u navigaciji/footeru/checkoutu; link checker prolazi; korisnik
prije placanja moze otvoriti uvjete; verzija uvjeta koristena pri kupnji moze se pohraniti uz
transakciju; stranice imaju jasan status i datum zadnje izmjene.

## P0.4 Privremeno onemoguciti nedovrsenu naplatu

Utvrdi: postoji li stvarna integracija; testni ili produkcijski nacin; moze li korisnik
platiti bez proizvoda; postoji li webhook verifikacija; idempotency; moze li klijent lazirati
status; kako se povezuje uplata i izvjestaj; kako se rjesavaju neuspjele/ponovljene/vracene
transakcije. Ako tok nije potpuno siguran: deaktiviraj kupnju; prikazi "Uskoro"/listu cekanja;
ne prikazuj aktivnu garanciju.

Acceptance za kasniju aktivaciju: status uplate potvrduje iskljucivo backend; webhook ima
provjeru potpisa; ponovljeni webhook ne stvara duplikate; izvjestaj se ne otkljucava frontend
zastavicom; korisnik ne moze URL-om do tudeg izvjestaja; postoje testovi uspjesne, neuspjesne
i ponovljene transakcije.

## P0.5 Zastita pristupa izvjestajima

Ukloni staticke tokene. Koristi jedan siguran model: autentificirani pristup vlasnika;
kratkotrajni signed URL; jednokratni token visoke entropije; posluziteljski autoriziran
download.

Acceptance: pogadanje/mijenjanje ID-a ne daje tudi izvjestaj; tokeni istjecu; token nije u
izvornom kodu; izvjestaj se ne indeksira; osjetljivi izvjestaji koriste `Cache-Control:
private, no-store`; pristup se moze opozvati.

## P0.6 Sigurna obrada datoteka

Implementiraj: dopustene ekstenzije; provjeru stvarnog tipa; ogranicenje velicine; ogranicenje
broja ZIP elemenata i ukupne nekomprimirane velicine; zastitu od ZIP bombi; timeout analize;
mogucnost prekida; sanitizaciju izvadenog sadrzaja; siguran prikaz; obradu u Web Workeru gdje
je izvedivo; jasne poruke pogreske; ciscenje memorije nakon obrade. Za server-side upload:
nasumicni interni nazivi; ne vjeruj izvornom nazivu; privatni bucket; ograniceni pristup;
automatsko brisanje; evidencija brisanja; ne posluzivati korisnicku datoteku kao izvrsivi
sadrzaj.

Acceptance: kriva ekstenzija/tip se odbija; prevelika datoteka se odbija prije iscrpljivanja
memorije; ZIP bomba ne zamrzava aplikaciju; analiza se moze prekinuti; zlonamjerni tekst ne
izvrsava HTML/JS; testovi pokrivaju ostecen DOCX, ostecen PDF, veliku datoteku i lazni MIME.

---

# 6. FAZA 2, nova arhitektura korisnickog iskustva

## P1.1 Razdvojiti marketinsku stranicu i aplikaciju

Pocetna mora biti jednostavna, s jednim dominantnim CTA-om "Provjeri dokument". Ne prikazuj
cijelu aplikaciju, konfiguraciju, admin, checkout i sve alate odjednom.

Acceptance: korisnik u 5 s razumije sto Lekta radi; jedan dominantan CTA; marketing bez
konfiguracijskih/admin elemenata; analiza u zasebnom toku; stare rute imaju preusmjeravanja.

## P1.2 Brza i napredna provjera

Brza provjera: dokument, fakultet, vrsta rada (ostalo automatski predlozeno). Napredna:
studij, smjer, akademska godina, jezik, stil citiranja, nacin predaje, dodatne provjere.

Acceptance: osnovni korisnik ne mora razumjeti sve profile; napredne opcije ne ometaju osnovni
tok; promjena profila jasno prikazuje koja se pravila primjenjuju; nemoguce je nenamjerno
analizirati prema krivom profilu bez upozorenja.

## P1.3 Razdvojiti lokalnu i serversku obradu

Prije uploada mora biti jasno: lokalna provjera (dokument ostaje na uredaju, ne salje se,
navesti ogranicenja) i rucna/napredna serverska provjera (salje se, navesti razlog, rok
cuvanja, tko pristupa, trazi jasnu radnju).

Acceptance: network test potvrduje da lokalna analiza ne salje sadrzaj; prelazak na serversku
obradu trazi jasan pristanak; UI uvijek pokazuje aktivni nacin; politika privatnosti odgovara
stvarnom ponasanju.

## P1.4 Jasno definirati sto Lekta ne radi

Vidljivo navedi: Lekta nije sustav za provjeru plagijata; ne dokazuje autorstvo; ne jamci
ocjenu; ne jamci prihvacanje rada; ne zamjenjuje mentora; ne provjerava nuzno znanstvenu
istinitost; rezultat ovisi o odabranom profilu i verziji pravila. Ne koristi "potvrduje
uskladenost" osim ako je pravno i tehnicki opravdano. Preferiraj: procjenjuje tehnicku
uskladenost; pronalazi moguca odstupanja; provjerava prema evidentiranim pravilima; izraduje
izvjestaj o potencijalnim problemima.

---

# 7. FAZA 3, sustav fakultetskih profila

Fakultetski profili su temelj proizvoda. Predlozeni modeli (za smjer, ne nuzno doslovna
implementacija): `FacultyProfile` (id, institutionId, studyId?, programmeId?, workType,
academicYear, version, status draft|internally_verified|pilot|active|expiring|outdated|
archived, validFrom?, validUntil?, lastVerifiedAt, sourceDocuments, rules, knownLimitations,
createdAt, updatedAt), `FacultyRule` (id, code, category, title, description, severity
info|warning|error, automationLevel fully|partially|manual_only, detectorId?, sourceDocumentId,
sourcePage?, sourceExcerpt?, confidencePolicy high|medium|low, validFrom?, validUntil?,
enabled), `AuditFinding` (id, ruleId, status passed|failed|uncertain|not_checked, severity,
confidence, evidence?, location{page?,paragraph?,section?}, explanation, remediation,
profileVersion).

Acceptance: svaki izvjestaj biljezi tocan profil i verziju; svaki nalaz upucuje na pravilo;
svako pravilo upucuje na sluzbeni izvor; zastarjeli profil se ne moze neprimjetno koristiti;
korisnik vidi datum posljednje provjere; adminitratori mogu usporediti verzije; izmjene
pravila ne mijenjaju povijesne izvjestaje.

Napomena repozitorija: hijerarhija autoriteta je aktualna odluka/pravilnik > sluzbena stranica
studija > opce FPZG upute i citiranje > pisana uputa mentora. Studentski radovi iz repozitorija
sluze ISKLJUCIVO regresijskom testiranju parsera, nikad kao izvor pravila. `sourcePage` koji
nije potvrden ostaje `null`, ne nagadaj ga. Vidi CLAUDE.md (Option A: ruleEntries su izvor
istine).

---

# 8. FAZA 4, izvjestaj i objasnjivost

Rezultat nije samo popis crvenih i zelenih oznaka. Struktura: sazetak; odabrani fakultet i
vrsta rada; verzija profila; datum analize; broj uspjesnih provjera / problema / upozorenja /
neprovjerenih / nalaza niske sigurnosti; nalazi po kategorijama; za svaki nalaz problem, dokaz,
pravilo, sluzbeni izvor, stranica, pouzdanost, koraci za ispravak; poznata ogranicenja;
informacija o lokalnoj ili serverskoj obradi.

Acceptance: korisnik razumije zasto je nalaz prikazan; razlikuju se failed/uncertain/
not_checked; sustav ne prikazuje "prolaz" za nesto sto nije stvarno provjereno; PDF izvoz i
prikaz u pregledniku imaju isti sadrzaj; izvjestaj ne ukljucuje tude podatke; stari izvjestaj
ostaje vezan uz staru verziju profila.

---

# 9. FAZA 5, pristupacnost

Cilj WCAG 2.2 AA gdje je razumno izvedivo. Provjeri: semanticku HTML strukturu; jedan smislen
h1; hijerarhiju naslova; label za svako polje; tekstualne poruke pogreske; fokus nakon
pogreske; aria-live za napredak; potpunu navigaciju tipkovnicom; vidljiv fokus; modalni fokus
trap; zatvaranje modala Escapeom; povrat fokusa; inert pozadinu; kontrast; velicinu
interaktivnih elemenata; status nalaza koji nije samo boja; prefers-reduced-motion; skip link;
podrsku za povecanje; citljivost na mobilnom.

Automatizacija: axe testovi; a11y provjera u CI; barem jedan e2e test iskljucivo tipkovnicom.

Acceptance: nema kriticnih axe pogresaka; glavni tok se moze dovrsiti tipkovnicom; citac dobiva
obavijest kad analiza pocne i zavrsi; poruke pogreske su povezane s poljima.

---

# 10. FAZA 6, performanse

Izmjeri pocetni bundle; pronadi velike biblioteke; lazy-load DOCX i PDF parser; premjesti tesku
analizu u Web Worker; sprijeci blokiranje UI-a; uvedi progress; omoguci cancel; smanji kod na
pocetnoj; ne ucitavaj admin kod u javnoj aplikaciji; optimiziraj fontove i slike; postavi cache
pravila; provjeri memory leakove; testiraj veliki dokument i slabiji mobilni uredaj.

Budzeti (pocetni cilj): nema dugog zamrzavanja UI-a tijekom analize; marketinska stranica ne
ucitava parser dok nije potreban; analiza se moze prekinuti; neuspjeh parsera ne rusi aplikaciju.

---

# 11. FAZA 7, SEO

Tehnicki: jedinstveni title; meta description; canonical; Open Graph; favicon i app ikone; XML
sitemap; robots.txt; prilagodena 404; trajna preusmjeravanja; structured data gdje je opravdano;
noindex za admin, privatne izvjestaje, testne stranice, nedovrsene tokove, konfiguracijske
stranice.

Sadrzajna struktura: /provjera-diplomskog-rada, /provjera-zavrsnog-rada,
/formatiranje-akademskog-rada, /fakulteti/<fakultet>, /fakulteti/<fakultet>/<vrsta>,
/alati/generator-citata, /alati/brojac-kartica, /alati/generator-naslovnice, /vodici. Ne
generiraj stotine tankih stranica samo zamjenom naziva fakulteta. Svaka fakultetska stranica:
podrzane vrste rada, akademska godina, status profila, datum provjere, stvarni izvori, poznata
ogranicenja, poveznica na provjeru.

---

# 12. FAZA 8, besplatni alati

Generator citata: eksplicitni stilovi (ne univerzalni "autor,godina"); verzioniraj pravila;
preview; kopiranje; validacija obaveznih polja; ne tvrdi univerzalno da svaki mrezni izvor treba
datum pristupa. Prioritet: APA 7; Chicago Notes and Bibliography; Chicago Author-Date; konkretni
fakultetski profili.

Brojac kartica: standard 1.800 znakova; broj sa i bez razmaka; procjena stranica oznacena kao
procjena; podesiv font/velicina/prored/margine; ne tvrdi univerzalni odnos kartice i A4.

Generator naslovnice: prioritet sluzbeni fakultetski predlosci; genericki je rezerva; svaki
predlozak ima verziju i izvor; DOCX i PDF tek kad su oba izvoza stabilna; testiraj dijakritiku.

Literatura: razlikuj popis literature i bibliografiju; nikad ne brisi duplikat bez potvrde;
omoguci undo; prepoznaj institucionalne autore; testiraj hrvatsku abecedu; povezi provjeru sa
stilom.

Izjava o izvornosti: najprije sluzbeni fakultetski obrazac; genericku jasno oznaci kao
nesluzbenu; ne tvrdi da zadovoljava sve fakultete.

---

# 13. FAZA 9, testiranje

Unit: parsiranje profila; odabir verzije; detektori pravila; rangiranje sigurnosti; generiranje
nalaza; izvoz izvjestaja; sanitizacija; validacija datoteka. Integracijski: ucitavanje;
lokalna/serverska analiza; Supabase RLS; spremanje/pristup izvjestaju; autentifikacija; admin
autorizacija; payment webhook prije aktivacije. E2E: besplatna provjera; ispravan DOCX;
neispravan DOCX; krivi tip datoteke; prekid analize; pregled nalaza; otvaranje izvora pravila;
izvoz; neautorizirani pokusaj tudeg izvjestaja; neadmin pokusaj admin API-ja.

Testni korpus (`/tests/fixtures/documents/{valid,invalid,security,edge-cases}`): ispravan
dokument; krive margine/font/prored; kriva naslovnica; nedostaje sazetak; kriva numeracija;
nedostaje literatura; tablica bez naslova; slika bez izvora; ostecen DOCX/PDF; lazni MIME; ZIP
bomba (ili sigurna simulacija); vrlo velik dokument; dokument s HTML/JS payloadom.

---

# 14. FAZA 10, CI/CD i deployment

CI pokrece: lint; typecheck; unit; integracijske; e2e smoke; a11y; link checker; dependency
audit; secret scan; build; Lighthouse ili odgovarajucu provjeru; provjeru sigurnosnih zaglavlja.
Deploy ne prolazi ako: build pada; postoje kriticni a11y problemi; otkrivena je tajna; kljucne
rute vracaju 404; osnovni tok analize ne radi; autorizacijski testovi padaju. Razdvoji
development / preview / staging / production. Testni payment podaci se ne koriste u produkciji i
obratno.

---

# 15. Sigurnosna zaglavlja

Konfiguriraj i testiraj: Content-Security-Policy; Strict-Transport-Security;
X-Content-Type-Options; Referrer-Policy; Permissions-Policy; Cross-Origin-Opener-Policy;
Cross-Origin-Resource-Policy. Koristi CSP `frame-ancestors` protiv clickjackinga. Izbjegavaj
`script-src *`, `unsafe-eval`, nepotreban `unsafe-inline`, `connect-src *`. Ako trenutni kod
zahtijeva nesigurna pravila, dokumentiraj uzrok i postupno ih ukloni.

---

# 16. Observability

Uvedi privatnosti prilagodeno pracenje: JS pogresaka; rusenja analize; trajanja analize;
neuspjelih uploadova; neuspjelih izvjestaja; neuspjelih payment webhookova; isteka profila;
admin izmjena. Ne salji sadrzaj akademskog rada u error monitoring. Redaktiraj: sadrzaj
dokumenta; osobne podatke; tokene; signed URL-ove; e-mail adrese kad nisu nuzne.

---

# 17. Launch gate

Naplata i javna garancija ne aktiviraju se dok nisu ispunjeni svi kriteriji:

- Sigurnost: nema javnih tajnih kljuceva; RLS testiran; admin server-side zasticen; privatni
  izvjestaji nisu javno dostupni; upload zasticen; sigurnosna zaglavlja aktivna.
- Pouzdanost: automatizirani testni korpus; glavni profil ima poznatu stopu pogresaka; nema
  kriticnih rusenja na podrzanim dokumentima; stari izvjestaji ostaju reproducibilni.
- Pravo i privatnost: uvjeti; privatnost; jasna garancija; retention odgovara implementaciji;
  pravna osoba i kontakt navedeni.
- UX: korisnik razumije sto se provjerava; razlikuje lokalnu i serversku obradu; razumije
  ogranicenja; tok radi na mobilnom; tok radi tipkovnicom.
- Naplata: backend potvrduje uplatu; webhook verificiran; idempotency; neuspjela naplata ne
  otkljucava proizvod; povrat i reklamacija imaju definirani tok.

---

# 18. Nacin izvrsavanja

Radi fazno. Za svaku fazu: analiziraj stanje; navedi datoteke koje ces mijenjati; napravi
najmanju sigurnu izmjenu; pokreni relevantne testove; popravi regresije; azuriraj dokumentaciju;
napravi logican commit; napisi sazetak (sto je promijenjeno, zasto, koji su testovi pokrenuti,
sto jos nije rijeseno, postoje li novi rizici). Ne preskaci P0 zadatke radi vizualnog redizajna.

---

# 19. Redoslijed prioriteta

```
P0-01 Uklanjanje javne produkcijske konfiguracije
P0-02 Provjera tajni i Supabase RLS-a
P0-03 Odvajanje i zastita administracije
P0-04 Zastita privatnih izvjestaja
P0-05 Sigurna obrada DOCX/PDF datoteka
P0-06 Popravak pravnih i 404 stranica
P0-07 Deaktivacija nedovrsene naplate
P1-01 Razdvajanje marketinga i aplikacije
P1-02 Brzi i napredni tok provjere
P1-03 Razdvajanje lokalne i serverske obrade
P1-04 Verzije fakultetskih profila
P1-05 Sljedivi i objasnjivi nalazi
P1-06 Automatizirani testni korpus
P1-07 Pristupacnost osnovnog toka
P1-08 CI/CD zastite
P2-01 Performanse i Web Worker
P2-02 SEO arhitektura
P2-03 Poboljsanje besplatnih alata
P2-04 Observability
P3-01 Dodatne optimizacije
P3-02 Eksperimenti konverzije
P3-03 Sirenje na nove fakultete
```

---

# 20. Prvi konkretni zadatak (za pocetni prolaz)

Pregledaj cijeli repozitorij; ne mijenjaj jos produkcijsku logiku; napravi arhitekturnu mapu;
pronadi sve P0 rizike, sve javno izlozene konfiguracije i tajne, sve rute i neispravne
poveznice, sve tokove obrade datoteka, sve admin mogucnosti, sve tokove autentifikacije i
naplate; napravi `LAUNCH_BLOCKERS.md` i `PRODUCTION_BACKLOG.md`; ispisi 10 najvecih rizika,
preporuceni redoslijed popravaka, tocne datoteke za prvi P0 zadatak i testove koje treba dodati
prije prve izmjene. Nemoj zapoceti veliki redizajn prije zavrsetka pocetnog audita.

---

# 21. Naredba nakon pocetnog audita

Kreni s prvim P0 zadatkom iz PRODUCTION_BACKLOG.md. Prije izmjene: pokazi problem i dokaz;
navedi sve datoteke koje ces mijenjati; objasni ciljanu arhitekturu; dodaj test koji reproducira
problem. Zatim implementiraj, pokreni relevantne testove i azuriraj backlog. Ne prelazi na
sljedeci zadatak dok acceptance kriteriji trenutnog nisu zadovoljeni.

---

# 22. Nacin pokretanja

```bash
cd putanja/do/lekta-repozitorija
claude
```

Zatim: "Procitaj docs/audit/AUDIT_BRIEF.md i izvrsi iskljucivo poglavlje Prvi konkretni zadatak.
Nemoj jos mijenjati produkcijsku logiku."

---

# 23. Recept za ponovni verifikacijski prolaz (dodano)

Za svaki sljedeci audit napretka (ne pocetni), umjesto ponovnog pisanja svega:

1. `npm run check` mora biti zelen prije i poslije. Ako pada, audit se zaustavlja na tome.
2. Za svaku stavku u PRODUCTION_BACKLOG.md oznacenu GOTOVO/RIJESENO: dokazi file:line da je
   stvarno u kodu. Ne vjeruj statusu na rijec (drift se dogada; backlog zaostaje za commitima).
3. Za svaku otvorenu stavku: potvrdi da je STVARNO jos otvorena (moguce je da je paralelna
   sesija vec rijesila; provjeri i necommitane promjene `git status`).
4. Oprez na git-race: `src/ui/app.ts`, `index.html` i ostale stranice cesto dira paralelna
   sesija. Ne diraj dijeljene datoteke bez koordinacije; radi u novim datotekama gdje mozes.
5. Rezultat zapisi u `docs/audit/AUDIT_STATUS_<datum>.md` s verdiktima CONFIRMED_DONE / DRIFT /
   STILL_OPEN / PARTIAL i file:line dokazom. Ne prepisuj backlog naslijepo.
6. Zabiljezi vanjske (owner) preduvjete koji nisu kod (Supabase tajne, Resend DPA, deno.lock,
   pravna osoba, MoR) jer oni ostaju blokatori naplate bez obzira na stanje koda.

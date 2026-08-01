# Lekta · Pre-launch checklist

Lista za provjeru prije launcha, po prioritetu. Svaka stavka ima acceptance kriterij koji je testabilan ili provjerljiv. Radi se redom unutar prioriteta.

- P0 = blokira launch. Bez svih P0 zelenih, ne ide live.
- P1 = odmah nakon launcha, jako preporučeno.
- P2 = rast, nije blocker.

Pravila rada vrijede iz CLAUDE.md (build gate, mali commitovi). Kontekst proizvoda iz VISION.md. Naplata i zaštita iz MONETIZATION_AND_ANTI_ABUSE.md.

> Odnos prema drugim launch dokumentima (jedan izvor istine): ovo je tematska pred-launch lista
> spremnosti (po podrucjima 1 do 10, s vlastitim P0 po sekcijama). Konsolidirani audit i status
> (svi nalazi, sve auditne runde, tekuci status) je mjerodavan i zivi u
> [docs/AUDIT_MASTER.md](AUDIT_MASTER.md); co-pilot luk pokriva
> [docs/roadmap/LAUNCH_CHECKLIST.md](roadmap/LAUNCH_CHECKLIST.md). P0 oznake ovdje (po sekciji) i
> P0-0x sheme u AUDIT_MASTER.md su zasebne i ne preslikavaju se 1:1.

## Launch gate (sve mora biti zeleno)

- [ ] Svi P0 iz sekcija 1 do 7 označeni i provjereni.
- [ ] End-to-end plaćanje radi na produkciji (kupnja -> entitlement -> puni izvještaj).
- [ ] `npm run check` zelen, golden testovi parsera zeleni.
- [ ] RLS testiran, webhook potpis verificiran, izvezeni izvještaj bez XSS-a.

---

## 1. Pravno i naplata

- [ ] (P0) **Pravo na odustanak plus odricanje.** Pri kupnji digitalnog passa uzmi izričit pristanak na trenutnu isporuku i odricanje od 14-dnevnog prava na odustanak (EU consumer law).
  - Acceptance: kupnja se ne može dovršiti bez kvačice pristanka; pristanak (tekst plus timestamp) zabilježen uz narudžbu.
- [ ] (P0) **Bez jamstva ishoda.** Sav copy uokviren kao tehnička provjera, ne jamstvo prihvaćanja rada ni roka.
  - Acceptance: ToS izričito isključuje odgovornost za odbijenu predaju i propušteni rok; nigdje u UI-u ne stoji obećanje da rad "prolazi".
- [ ] (P0) **Pravni subjekt i knjiženje.** Postoji pravni subjekt (obrt ili d.o.o.) i knjiženje isplata koje stižu od Merchant of Record providera.
  - Acceptance: subjekt registriran; isplate MoR-a se evidentiraju u poslovnim knjigama.
- [ ] (P1) **ToS i Pravila kupnje objavljeni i povezani.** Uvjeti, pravila kupnje i kontakt dostupni iz aplikacije i checkouta.
  - Acceptance: linkovi vidljivi prije plaćanja; verzija i datum na dokumentima.
- [ ] (P1) **MoR PDV postavke.** Provider (Paddle ili Lemon Squeezy) konfiguriran kao prodavač koji obračunava EU PDV.
  - Acceptance: testna kupnja iz EU prikazuje ispravan PDV na računu.

## 2. GDPR i podaci

- [ ] (P0) **Pravna osnova za plaćeni izvještaj.** Slanje parsirane strukture na Edge Function ima jasnu pravnu osnovu (izvršenje ugovora) i opisano je u obavijesti o privatnosti.
  - Acceptance: obavijest o privatnosti navodi koje podatke plaćeni put obrađuje i zašto.
- [ ] (P0) **EU regija plus DPA sa Supabaseom.** Supabase projekt u EU regiji, potpisan Data Processing Addendum.
  - Acceptance: regija potvrđena u postavkama; DPA prihvaćen.
- [ ] (P0) **Obavijest o privatnosti popunjena.** Maknuti placeholdere (voditelj obrade, kontakt, retencija) i staviti stvarne podatke.
  - Acceptance: nema riječi "placeholder" ni praznog voditelja obrade u generiranim pravnim tekstovima.
- [ ] (P1) **Stvarni consent za neesencijalnu analitiku.** `analyticsConsent` pretvoren iz zastavice u stvarni opt-in ako se koristi bilo kakva neesencijalna analitika.
  - Acceptance: bez pristanka se neesencijalna analitika ne pokreće.
- [ ] (P1) **Zahtjev za brisanjem.** Postoji put da korisnik zatraži brisanje podataka i da se izvrši.
  - Acceptance: dokumentiran postupak; testno brisanje ukloni entitlemente, slotove i logove tog korisnika.
- [ ] (P1) **Retencija logova.** `report_generations` ima retencijski rok (npr. 90 dana) i automatsko brisanje, IP hashiran.
  - Acceptance: stari zapisi se brišu; u bazi nema sirovog IP-a.

## 3. Točnost i povjerenje (egzistencijalno)

- [ ] (P0) **Shipani profili verificirani.** Svi profili koji idu live imaju potvrđena pravila i `sourcePage` gdje je primjenjivo (nepotvrđeno ostaje null, ne nagađa se).
  - Acceptance: validator bez grešaka; svaki shipani profil ima izvor i datum verifikacije.
- [ ] (P0) **Bez kritičnih lažnih pozitiva na shipanim profilima.** Golden fixture skup realnih dokumenata ne okida kritične lažne greške.
  - Acceptance: golden testovi zeleni; pregledan uzorak realnih radova bez kritičnog false-positive.
- [ ] (P0) **Kanal "ova provjera je kriva".** Korisnik može prijaviti pogrešnu provjeru iz rezultata.
  - Acceptance: prijava stiže do tebe s dovoljno konteksta (profil, check, otisak verzije pravila).
- [ ] (P0) **Verzija i datum pravila vidljivi.** Rezultat pokazuje po kojoj verziji i datumu pravila je rad ocijenjen (otisak to već nosi).
  - Acceptance: na rezultatu i izvještaju stoji otisak pravila i datum.
- [ ] (P1) **PDF naspram docx iskreno označen.** UI jasno kaže da docx daje punu strukturnu provjeru, PDF ograničenu.
  - Acceptance: pri uploadu PDF-a prikazano upozorenje o ograničenju, bez lažne sigurnosti.
- [ ] (P1) **Komunikacija promjene pravila.** Kad se profil ažurira usred sezone, postoji način da se korisniku objasni promjena rezultata.
  - Acceptance: changelog pravila ili obavijest pri promjeni statusa profila.

## 4. Parser i robusnost ulaza

- [ ] (P0) **Graciozan pad na lošem ulazu.** Korumpirana, zaštićena, prazna ili nepodržana datoteka daje jasnu poruku, ne crash.
  - Acceptance: za svaki rubni ulaz aplikacija ostaje funkcionalna i pokaže razumljivu grešku.
- [ ] (P0) **Limit veličine datoteke.** Postoji gornja granica veličine s jasnom porukom.
  - Acceptance: prevelika datoteka se odbija prije parsiranja, bez rušenja memorije na mobitelu.
- [ ] (P1) **Raznolikost izvora u golden skupu.** Fixturi uključuju LibreOffice, Google Docs export, Pages, stari .doc, tracked changes, komentare i neažurirana polja.
  - Acceptance: golden testovi pokrivaju te slučajeve; ponašanje stabilno ili svjesno re-snapshotano.

## 5. Sigurnost

- [ ] (P0) **XSS u izvezenom izvještaju.** Svaki korisnički izveden string (naslovi, imena, citati iz dokumenta) je escapan u standalone HTML izvještaju.
  - Acceptance: test s dokumentom čiji naslov sadrži `<script>` i `"` daje sigurno escapan izvještaj.
- [ ] (P0) **Verifikacija webhook potpisa.** MoR webhook prihvaća samo zahtjeve s valjanim potpisom providera.
  - Acceptance: lažni webhook bez ispravnog potpisa je odbijen i ne kreira entitlement.
- [ ] (P0) **RLS testiran.** Korisnik A ne može čitati ni koristiti entitlemente, slotove ni logove korisnika B.
  - Acceptance: test pokušaja pristupa tuđim retcima vraća prazno ili odbija.
- [ ] (P0) **Validacija ulaza u Edge Function.** Netrusted payload (struktura, rezultat, workType) se validira i limitira po veličini.
  - Acceptance: maliciozan ili predimenzioniran payload je odbijen, ne ruši funkciju.
- [ ] (P1) **Tajne i ključevi.** Service role ključ i tajne nisu u klijentu; samo anon ključ na klijentu.
  - Acceptance: bundle klijenta ne sadrži service role ključ ni MoR tajne.

## 6. Preglednik i mobitel (mobitel je primaran)

- [ ] (P0) **Feature detection ključnih API-ja.** DecompressionStream, DOMParser i File API provjereni; bez njih jasna poruka umjesto tihog kvara.
  - Acceptance: na pregledniku bez podrške korisnik dobije razumljivu poruku, ne bijeli ekran.
- [ ] (P0) **Mobilni smoke test.** Pun tijek (upload, rezultat, kupnja, izvještaj) radi na mobilnom Safariju i Chromeu.
  - Acceptance: prošao ručni test na stvarnom mobilnom uređaju.
- [ ] (P1) **Memorija na velikim dokumentima.** Veliki docx na telefonu ne ruši tab.
  - Acceptance: dokument blizu limita obrađen ili uredno odbijen na mobitelu.

## 7. Onboarding footguns

- [ ] (P0) **Upozorenje na nesklad profila i dokumenta.** Kad dokument očito ne odgovara odabranom profilu (npr. broj riječi divlje odstupa za odabranu vrstu rada), prikaži upozorenje.
  - Acceptance: očiti nesklad pokrene jasno upozorenje prije nego korisnik plati.
- [ ] (P1) **Pametni defaulti i auto-detekcija.** Vrsta rada se pokušava detektirati iz dokumenta; zadnji odabir se pamti.
  - Acceptance: ponovni upload predlaže prethodni kontekst; detekcija smanjuje krivi odabir.

## 8. Operativno i otpornost (sezona je usko grlo)

- [ ] (P0) **Error tracking.** Postavljen alat za praćenje grešaka na klijentu i Edge Functionu (npr. Sentry).
  - Acceptance: testna greška se pojavi u alatu s dovoljno konteksta.
- [ ] (P0) **Backup kupnji.** Point-in-time recovery na Supabaseu uključen; entitlementi i narudžbe oporavljivi.
  - Acceptance: potvrđen PITR; poznat postupak oporavka.
- [ ] (P1) **Uptime i status.** Uptime provjera glavnih putova i plan komunikacije statusa u špici.
  - Acceptance: alert kad glavni put padne; pripremljen kanal za obavijest korisnicima.
- [ ] (P1) **Unit ekonomija s infrastrukturom.** Trošak Edge Function poziva i generiranja izvještaja uračunat po izvještaju.
  - Acceptance: poznat netto po passu nakon MoR naknada i compute troška.

## 9. Rast i SEO (P2, nije blocker)

- [ ] (P2) **Statične landing stranice po fakultetu i vrsti rada.** Coverage matrica kao indeksabilan sadržaj ("kako formatirati diplomski", "citiranje FPZG").
  - Acceptance: barem nekoliko statičkih stranica indeksabilno, ne samo klijentski SPA.
- [ ] (P2) **Osnovni meta i OG podaci.** Naslovi, opisi i OG slike po ključnim stranicama.
  - Acceptance: dijeljenje linka daje uredan pregled; stranice imaju jedinstvene meta podatke.

## 10. Go / No-go

Ne ide live dok nije istina sve sljedeće:
- [ ] Svi P0 zeleni i provjereni.
- [ ] Testna kupnja iz EU od kupnje do punog izvještaja prošla na produkciji, s računom i ispravnim PDV-om.
- [ ] Pravni tekstovi popunjeni i povezani, pristanak na trenutnu isporuku uzima se pri kupnji.
- [ ] Točnost: shipani profili verificirani, golden zeleno, kanal za prijavu pogreške radi.
- [ ] Sigurnost: RLS, webhook potpis i XSS escaping potvrđeni.

Ako moraš birati gdje uložiti zadnji sat prije launcha: točnost pravila i pošteno uokvirivanje (tehnička provjera, ne jamstvo). To je egzistencijalno, sve ostalo je popravljivo poslije.

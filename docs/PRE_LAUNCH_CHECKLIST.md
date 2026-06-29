# Lekta Â· Pre-launch checklist

Lista za provjeru prije launcha, po prioritetu. Svaka stavka ima acceptance kriterij koji je testabilan ili provjerljiv. Radi se redom unutar prioriteta.

- P0 = blokira launch. Bez svih P0 zelenih, ne ide live.
- P1 = odmah nakon launcha, jako preporuÄeno.
- P2 = rast, nije blocker.

Pravila rada vrijede iz CLAUDE.md (build gate, mali commitovi). Kontekst proizvoda iz VISION.md. Naplata i zaÅ¡tita iz MONETIZATION_AND_ANTI_ABUSE.md.

## Launch gate (sve mora biti zeleno)

- [ ] Svi P0 iz sekcija 1 do 7 oznaÄeni i provjereni.
- [ ] End-to-end plaÄanje radi na produkciji (kupnja â entitlement â puni izvjeÅ¡taj).
- [ ] `npm run check` zelen, golden testovi parsera zeleni.
- [ ] RLS testiran, webhook potpis verificiran, izvezeni izvjeÅ¡taj bez XSS-a.

---

## 1. Pravno i naplata

- [ ] (P0) **Pravo na odustanak plus odricanje.** Pri kupnji digitalnog passa uzmi izriÄit pristanak na trenutnu isporuku i odricanje od 14-dnevnog prava na odustanak (EU consumer law).
  - Acceptance: kupnja se ne moÅ¾e dovrÅ¡iti bez kvaÄice pristanka; pristanak (tekst plus timestamp) zabiljeÅ¾en uz narudÅ¾bu.
- [ ] (P0) **Bez jamstva ishoda.** Sav copy uokviren kao tehniÄka provjera, ne jamstvo prihvaÄanja rada ni roka.
  - Acceptance: ToS izriÄito iskljuÄuje odgovornost za odbijenu predaju i propuÅ¡teni rok; nigdje u UI-u ne stoji obeÄanje da rad "prolazi".
- [ ] (P0) **Pravni subjekt i knjiÅ¾enje.** Postoji pravni subjekt (obrt ili d.o.o.) i knjiÅ¾enje isplata koje stiÅ¾u od Merchant of Record providera.
  - Acceptance: subjekt registriran; isplate MoR-a se evidentiraju u poslovnim knjigama.
- [ ] (P1) **ToS i Pravila kupnje objavljeni i povezani.** Uvjeti, pravila kupnje i kontakt dostupni iz aplikacije i checkouta.
  - Acceptance: linkovi vidljivi prije plaÄanja; verzija i datum na dokumentima.
- [ ] (P1) **MoR PDV postavke.** Provider (Paddle ili Lemon Squeezy) konfiguriran kao prodavaÄ koji obraÄunava EU PDV.
  - Acceptance: testna kupnja iz EU prikazuje ispravan PDV na raÄunu.

## 2. GDPR i podaci

- [ ] (P0) **Pravna osnova za plaÄeni izvjeÅ¡taj.** Slanje parsirane strukture na Edge Function ima jasnu pravnu osnovu (izvrÅ¡enje ugovora) i opisano je u obavijesti o privatnosti.
  - Acceptance: obavijest o privatnosti navodi koje podatke plaÄeni put obraÄuje i zaÅ¡to.
- [ ] (P0) **EU regija plus DPA sa Supabaseom.** Supabase projekt u EU regiji, potpisan Data Processing Addendum.
  - Acceptance: regija potvrÄena u postavkama; DPA prihvaÄen.
- [ ] (P0) **Obavijest o privatnosti popunjena.** Maknuti placeholdere (voditelj obrade, kontakt, retencija) i staviti stvarne podatke.
  - Acceptance: nema rijeÄi "placeholder" ni praznog voditelja obrade u generiranim pravnim tekstovima.
- [ ] (P1) **Stvarni consent za neesencijalnu analitiku.** `analyticsConsent` pretvoren iz zastavice u stvarni opt-in ako se koristi bilo kakva neesencijalna analitika.
  - Acceptance: bez pristanka se neesencijalna analitika ne pokreÄe.
- [ ] (P1) **Zahtjev za brisanjem.** Postoji put da korisnik zatraÅ¾i brisanje podataka i da se izvrÅ¡i.
  - Acceptance: dokumentiran postupak; testno brisanje ukloni entitlemente, slotove i logove tog korisnika.
- [ ] (P1) **Retencija logova.** `report_generations` ima retencijski rok (npr. 90 dana) i automatsko brisanje, IP hashiran.
  - Acceptance: stari zapisi se briÅ¡u; u bazi nema sirovog IP-a.

## 3. ToÄnost i povjerenje (egzistencijalno)

- [ ] (P0) **Shipani profili verificirani.** Svi profili koji idu live imaju potvrÄena pravila i `sourcePage` gdje je primjenjivo (nepotvrÄeno ostaje null, ne nagaÄa se).
  - Acceptance: validator bez greÅ¡aka; svaki shipani profil ima izvor i datum verifikacije.
- [ ] (P0) **Bez kritiÄnih laÅ¾nih pozitiva na shipanim profilima.** Golden fixture skup realnih dokumenata ne okida kritiÄne laÅ¾ne greÅ¡ke.
  - Acceptance: golden testovi zeleni; pregledan uzorak realnih radova bez kritiÄnog false-positive.
- [ ] (P0) **Kanal "ova provjera je kriva".** Korisnik moÅ¾e prijaviti pogreÅ¡nu provjeru iz rezultata.
  - Acceptance: prijava stiÅ¾e do tebe s dovoljno konteksta (profil, check, otisak verzije pravila).
- [ ] (P0) **Verzija i datum pravila vidljivi.** Rezultat pokazuje po kojoj verziji i datumu pravila je rad ocijenjen (otisak to veÄ nosi).
  - Acceptance: na rezultatu i izvjeÅ¡taju stoji otisak pravila i datum.
- [ ] (P1) **PDF naspram docx iskreno oznaÄen.** UI jasno kaÅ¾e da docx daje punu strukturnu provjeru, PDF ograniÄenu.
  - Acceptance: pri uploadu PDF-a prikazano upozorenje o ograniÄenju, bez laÅ¾ne sigurnosti.
- [ ] (P1) **Komunikacija promjene pravila.** Kad se profil aÅ¾urira usred sezone, postoji naÄin da se korisniku objasni promjena rezultata.
  - Acceptance: changelog pravila ili obavijest pri promjeni statusa profila.

## 4. Parser i robusnost ulaza

- [ ] (P0) **Graciozan pad na loÅ¡em ulazu.** Korumpirana, zaÅ¡tiÄena, prazna ili nepodrÅ¾ana datoteka daje jasnu poruku, ne crash.
  - Acceptance: za svaki rubni ulaz aplikacija ostaje funkcionalna i pokaÅ¾e razumljivu greÅ¡ku.
- [ ] (P0) **Limit veliÄine datoteke.** Postoji gornja granica veliÄine s jasnom porukom.
  - Acceptance: prevelika datoteka se odbija prije parsiranja, bez ruÅ¡enja memorije na mobitelu.
- [ ] (P1) **Raznolikost izvora u golden skupu.** Fixturi ukljuÄuju LibreOffice, Google Docs export, Pages, stari .doc, tracked changes, komentare i neaÅ¾urirana polja.
  - Acceptance: golden testovi pokrivaju te sluÄajeve; ponaÅ¡anje stabilno ili svjesno re-snapshotano.

## 5. Sigurnost

- [ ] (P0) **XSS u izvezenom izvjeÅ¡taju.** Svaki korisniÄki izveden string (naslovi, imena, citati iz dokumenta) je escapan u standalone HTML izvjeÅ¡taju.
  - Acceptance: test s dokumentom Äiji naslov sadrÅ¾i `<script>` i `"` daje sigurno escapan izvjeÅ¡taj.
- [ ] (P0) **Verifikacija webhook potpisa.** MoR webhook prihvaÄa samo zahtjeve s valjanim potpisom providera.
  - Acceptance: laÅ¾ni webhook bez ispravnog potpisa je odbijen i ne kreira entitlement.
- [ ] (P0) **RLS testiran.** Korisnik A ne moÅ¾e Äitati ni koristiti entitlemente, slotove ni logove korisnika B.
  - Acceptance: test pokuÅ¡aja pristupa tuÄim retcima vraÄa prazno ili odbija.
- [ ] (P0) **Validacija ulaza u Edge Function.** Netrusted payload (struktura, rezultat, workType) se validira i limitira po veliÄini.
  - Acceptance: maliciozan ili predimenzioniran payload je odbijen, ne ruÅ¡i funkciju.
- [ ] (P1) **Tajne i kljuÄevi.** Service role kljuÄ i tajne nisu u klijentu; samo anon kljuÄ na klijentu.
  - Acceptance: bundle klijenta ne sadrÅ¾i service role kljuÄ ni MoR tajne.

## 6. Preglednik i mobitel (mobitel je primaran)

- [ ] (P0) **Feature detection kljuÄnih API-ja.** DecompressionStream, DOMParser i File API provjereni; bez njih jasna poruka umjesto tihog kvara.
  - Acceptance: na pregledniku bez podrÅ¡ke korisnik dobije razumljivu poruku, ne bijeli ekran.
- [ ] (P0) **Mobilni smoke test.** Pun tijek (upload, rezultat, kupnja, izvjeÅ¡taj) radi na mobilnom Safariju i Chromeu.
  - Acceptance: proÅ¡ao ruÄni test na stvarnom mobilnom ureÄaju.
- [ ] (P1) **Memorija na velikim dokumentima.** Veliki docx na telefonu ne ruÅ¡i tab.
  - Acceptance: dokument blizu limita obraÄen ili uredno odbijen na mobitelu.

## 7. Onboarding footguns

- [ ] (P0) **Upozorenje na nesklad profila i dokumenta.** Kad dokument oÄito ne odgovara odabranom profilu (npr. broj rijeÄi divlje odstupa za odabranu vrstu rada), prikaÅ¾i upozorenje.
  - Acceptance: oÄiti nesklad pokrene jasno upozorenje prije nego korisnik plati.
- [ ] (P1) **Pametni defaulti i auto-detekcija.** Vrsta rada se pokuÅ¡ava detektirati iz dokumenta; zadnji odabir se pamti.
  - Acceptance: ponovni upload predlaÅ¾e prethodni kontekst; detekcija smanjuje krivi odabir.

## 8. Operativno i otpornost (sezona je usko grlo)

- [ ] (P0) **Error tracking.** Postavljen alat za praÄenje greÅ¡aka na klijentu i Edge Functionu (npr. Sentry).
  - Acceptance: testna greÅ¡ka se pojavi u alatu s dovoljno konteksta.
- [ ] (P0) **Backup kupnji.** Point-in-time recovery na Supabaseu ukljuÄen; entitlementi i narudÅ¾be oporavljivi.
  - Acceptance: potvrÄen PITR; poznat postupak oporavka.
- [ ] (P1) **Uptime i status.** Uptime provjera glavnih putova i plan komunikacije statusa u Å¡pici.
  - Acceptance: alert kad glavni put padne; pripremljen kanal za obavijest korisnicima.
- [ ] (P1) **Unit ekonomija s infrastrukturom.** TroÅ¡ak Edge Function poziva i generiranja izvjeÅ¡taja uraÄunat po izvjeÅ¡taju.
  - Acceptance: poznat netto po passu nakon MoR naknada i compute troÅ¡ka.

## 9. Rast i SEO (P2, nije blocker)

- [ ] (P2) **StatiÄne landing stranice po fakultetu i vrsti rada.** Coverage matrica kao indeksabilan sadrÅ¾aj ("kako formatirati diplomski", "citiranje FPZG").
  - Acceptance: barem nekoliko statiÄkih stranica indeksabilno, ne samo klijentski SPA.
- [ ] (P2) **Osnovni meta i OG podaci.** Naslovi, opisi i OG slike po kljuÄnim stranicama.
  - Acceptance: dijeljenje linka daje uredan pregled; stranice imaju jedinstvene meta podatke.

## 10. Go / No-go

Ne ide live dok nije istina sve sljedeÄe:
- [ ] Svi P0 zeleni i provjereni.
- [ ] Testna kupnja iz EU od kupnje do punog izvjeÅ¡taja proÅ¡la na produkciji, s raÄunom i ispravnim PDV-om.
- [ ] Pravni tekstovi popunjeni i povezani, pristanak na trenutnu isporuku uzima se pri kupnji.
- [ ] ToÄnost: shipani profili verificirani, golden zeleno, kanal za prijavu pogreÅ¡ke radi.
- [ ] Sigurnost: RLS, webhook potpis i XSS escaping potvrÄeni.

Ako moraÅ¡ birati gdje uloÅ¾iti zadnji sat prije launcha: toÄnost pravila i poÅ¡teno uokvirivanje (tehniÄka provjera, ne jamstvo). To je egzistencijalno, sve ostalo je popravljivo poslije.

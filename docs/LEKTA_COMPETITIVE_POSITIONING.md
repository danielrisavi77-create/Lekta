# LEKTA_COMPETITIVE_POSITIONING.md

Konkurentska provjera i pozicioniranje prema zadatku iz `LEKTA_STRATESKI_AUDIT_I_PLAN.md`.

Datum istrazivanja: 2026-07-13 (web + repo). Ovaj dokument NADOPUNJUJE
[COMPETITORS.md](COMPETITORS.md) (2026-07-02): tamo su PaperCheck, Scribbr, Paperpal, Trinka
i tripwire tablica; ovdje je novo dubinska analiza Plag.hr (koju COMPETITORS.md uopce ne
spominje), kategorijski pregled po zadatku i kvantificirano HR trziste. Tvrdnje o
konkurentima imaju izvor ili oznaku procjene; neprovjereno je izdvojeno na kraju.

---

## 1. Glavni nalaz

Nitko, ni u Hrvatskoj ni globalno, ne radi ono sto Lekta vec ima izgradjeno: automatsku
provjeru gotovog .docx rada prema VERIFICIRANIM sluzbenim pravilima konkretnog hrvatskog
fakulteta, lokalno u pregledniku, s automatskim popravkom. Najblizi globalni analozi
(CheckMyManuscript, SciSpace) ciljaju casopise s generickim pravilima; najblizi domaci
"konkurenti" su rucne usluge koje tehnicki dio posla eksplicitno odbijaju ili naplacuju
30-150 EUR s rokovima u danima.

Plagijat i AI detekcija su za studente javnih visokih ucilista u RH vec BESPLATNI (Turnitin
preko Srca od 2023./2024., AI plugin od 2024./2025.), pa je fiksirana odluka "ne gradimo
istojezicni plagijat checker" trzisno ispravna: to nije praznina nego zauzet, besplatan teren.

## 2. Plag.hr: dubinska analiza (novo u odnosu na COMPETITORS.md)

Kljucna cinjenica: Plag.hr NIJE hrvatska tvrtka nego hrvatska lokalizacija medjunarodnog
servisa Plagramme (operator Lingua Intellegens UAB, Vilnius, Litva; 120+ zemalja, bez
hrvatskog ureda, podrska preko chatbota). Izvor: plag.hr / plagramme.com stranice.

Sto nude:
- Server-side provjera plagijata: upload DOC/DOCX/ODT/PAGES/RTF do 75 MB na my.plag.hr;
  baze: javni web, 80M+ znanstvenih clanaka (Oxford, Springer, Wiley), CORE ~98M radova;
  129 jezika.
- AI detektor (50+ jezika, marketinska tvrdnja 99% tocnosti).
- Rucne urednicke usluge: uklanjanje plagijata po stranici od 250 rijeci (od 10,95 EUR za
  14 dana do 19,45 EUR za 48 h; ljudski urednici vracaju ISPRAVLJENI dokument); lektura i
  oblikovanje teksta (sadrzaj, numeriranje, margine, uvlake) s cijenom "ovisi o duljini".
- Model naplate: freemium s kreditnim pretplatama (1 kredit = 1 rijec; Basic 14,95 EUR/mj za
  10.000, Student 29,95 EUR/mj za 30.000, PRO Unlimited 299,95 EUR/mj; godisnje -40%).
  Besplatna ocjena slicnosti je udica, detaljno izvjesce se placa.
- Reputacija polarizirana: Trustpilot oko 4,1-4,5 na ~6.300 recenzija, ali s ozbiljnim
  prituzbama (napuhane besplatne ocjene kao pritisak na kupnju, slucaj "80% pa placeno
  izvjesce 4%", lazni red cekanja, naplata nakon otkaza) i Trustpilotovom napomenom o
  zavaravajucem prikazivanju recenzija.

Gdje je Plag.hr jaci od Lekte: baza za usporedbu slicnosti i AI detekcija (Lekta to namjerno
nema), brend kategorije "provjera plagijata" koju studenti vec pretrazuju, rucna usluga koja
vraca ispravljeni dokument danas.

Gdje je strukturno slabiji (Lektin teren):
- Privatnost: obavezan upload rada na server litavske tvrtke; politika privatnosti dopusta
  dijeljenje s "obrazovnim institucijama i drugima koji su narucili usluge". Lekta: analiza
  lokalno, rad ne napusta uredjaj.
- Pravila fakulteta: oblikovanje rade rucno po generickim standardima, bez ikakve baze
  hrvatskih fakultetskih pravila, bez izvora i datuma verifikacije.
- Brzina i cijena tehnickog dijela: dani i deseci eura po stranici naspram sekundi i
  jednokratnih par eura.
- Transparentnost cijena: krediti koji istjecu i cijene iza logina naspram jasne jednokratne
  cijene.
- Povjerenje: njihov lijevak (napuhana besplatna ocjena pa placanje) generira prituzbe;
  Lektin "besplatna kompatibilnost pa jasna cijena" okvir je izravna protuteza.

Sto Lekta NE smije kopirati od Plag.hr: kreditne pretplate, skrivene cijene, strah kao
konverzijsku polugu, server-side obradu kao default, AI detekciju kao marketinsku tvrdnju
("99% tocnost" je nebranjivo).

Pozicijska recenica: "Plag provjerava je li tekst tvoj. Lekta provjerava hoce li ti ga
referada primiti. Prvo ti fakultet vec daje besplatno kroz Turnitin; drugo ne daje nitko."

## 3. Kategorijski pregled

### 3.1. Plagiarism checkeri
- Turnitin preko Srca: besplatno za javna visoka ucilista, od 2023./2024., AI plugin od
  2024./2025. NE provjerava nista od oblikovanja. Za Lektu: komplementaran, imenovati ga u
  copyju kao ono sto Lekta NIJE.
- iThenticate (individualno): oko 100 USD po dokumentu; irelevantno za HR studente.
- SmallSEOTools i slicni besplatni: 1.000 rijeci po provjeri, samo web baza; nekvalitetno.
- Zakljucak: kategorija zauzeta i besplatna; ne ulaziti (potvrdjuje postojecu odluku).

### 3.2. AI detektori
- GPTZero (besplatno 10k rijeci/mj; Essential 14,99 USD/mj), ZeroGPT (realna tocnost 67-85%
  po nezavisnim testovima), Turnitin AI (institucionalno; dokumentirani lazni pozitivi 4-9%,
  Stanford: 4-6x cesci kod ne-izvornih govornika engleskog).
- Zakljucak: nepouzdano na hrvatskom, pravno i etikci osjetljivo; ne graditi detektor.
  Eventualni cloud "AI signal" iz Faze 4 ostaje strogo informativan, opt-in, iza privole
  (fiksirana odluka A), i nikad ne izrice presudu (nacelo lekta-pipelinea).

### 3.3. Alati za citiranje
- Zotero (besplatan), Mendeley (freemium), Citation Machine/Scribbr generator: svi rade
  UZVODNO (stvaranje citata pri pisanju). Nitko ne validira NIZVODNO: jesu li citati u
  gotovom dokumentu uskladjeni sa stilom koji fakultet propisuje, ukljucujuci hrvatske
  pravne forme. Lektin citation engine (autor-godina + pravni fusnotni) + 160 SEO stranica
  citata po fakultetu je jedinstven; braniti ga sadrzajem i pokrivenoscu.

### 3.4. Word i akademski formatatori
- Overleaf: LaTeX nisa (STEM), compliance by construction; ne dira .docx vecinu.
- Fakultetski Word predlosci i PDF upute (FOI, FER, IEEE.hr...): besplatni, staticni, nista
  ne provjeravaju; studenti razbiju stilove tijekom pisanja. Predlozak je POLAZNA tocka,
  Lekta je ZAVRSNA provjera: komplementarno, iskoristiti u copyju i SEO-u.
- Njemacko trziste rucnog formatiranja (formatierung.net, Mentorium...): oko 640 EUR za 40
  stranica, 5 radnih dana; dokaz da je problem stvaran i placa se, i referentna tocka za
  Lektin cjenovni argument.

### 3.5. Ljudske usluge lekture i oblikovanja u HR
- Lektura: 1,50-3 EUR po kartici (lektoriranje.hr 2 EUR diplomski; lektoriranjediplomskih.hr
  1,50-3,00 EUR po hitnosti; lekto-fon 2-3 EUR + 1 EUR/kartici stilsko oblikovanje).
  Diplomski od 60 kartica: okvirno 90-180 EUR.
- KLJUCNI CITAT (lektoriranjediplomskih.hr): lektura "ne ukljucuje formatiranje teksta i
  opcenito tehnicki dio (numeriranje, fusnote, literaturu)". Lektori eksplicitno odbijaju
  Lektin teritorij.
- Rucno tehnicko uredjivanje: Urednik d.o.o. 50-150 EUR po radu u Wordu; graficko
  oblikovanje kod lektora "od 30 EUR"; kopirnice (fingerPRINT itd.) rade "sredjivanje" po
  netransparentnim cijenama uz uvez.
- Zakljucak: ovo NIJE konkurencija nego cjenovni benchmark i partnerski kanal (lektor jezik,
  Lekta tehniku; kopirnice kao B2B2C tocka jer je uvez obavezan zavrsni korak).

### 3.6. Submission i compliance alati (najbliza kategorija)
- CheckMyManuscript: 80+ provjera rukopisa, besplatan pregled + 5 USD puni izvjestaj; cilja
  CASOPISE i desk-rejection, upload na server, nista o hrvatskim fakultetima. Potvrdjuje
  cjenovnu tocku jednokratnog izvjestaja.
- SciSpace thesis checklist, GenText: LLM nagadja pravila; neverificirano naspram Lektine
  rucno verificirane baze s sourcePage provenijencijom.
- Sveucilisni interni format checkeri (npr. ASU Format Wizard): postoje samo gdje ih je
  sveuciliste samo izgradilo; u RH NIJEDNO sveuciliste nema takav alat. To je i B2B prilika
  (institucionalni pristup po uzoru na Srce-Turnitin model) i dokaz praznine.
- PaperCheck i Scribbr: obradjeni u COMPETITORS.md (PaperCheck VISOKA prijetnja: "upload
  svoje upute" model bez kurirane baze; Scribbr SREDNJA: ljudski servis, softverizacija je
  rizik). Nalazi ovog istrazivanja ih ne mijenjaju.

## 4. Hrvatsko trziste (kvantificirano)

Potvrdjene brojke (DZS, 2024.): studij zavrsilo 31.237 studenata (~16 tisuca
zavrsnih/prijediplomskih + ~15 tisuca diplomskih/integriranih radova); upisano 147.454
studenata (2024./2025., seminarski volumen).

Procjene (jasno oznacene kao procjene, ne sluzbena istrazivanja):
- TAM (zavrsni + diplomski): ~31 tisuca radova godisnje x 6-30 EUR = okvirno 190-940 tisuca
  EUR godisnje; seminarski segment to prosiruje na nizoj cijeni.
- SAM: uz pretpostavku da 20-35% zavrsenih placa neku pomoc (lektura 75-180 EUR, rucno
  formatiranje 50-150 EUR, sivo trziste 33-265 EUR po radu), ~6-11 tisuca radova, okvirno
  80-250 tisuca EUR godisnje.
- Spremnost na placanje dokazana postojecim cjenicima; Lektina cijena 3,99-29,99 EUR je
  2-10x ispod svih placenih alternativa i jedina trenutna (minute umjesto dana).

Posljedica za strategiju: ovo je nisa, ne unicorn trziste. Model mora biti nizak CAC
(SEO alati + partneri), visoka marza (automatika), jednokratne cijene, i sirenje kroz
profile (regija, jezici) kad HR predlozak proradi: tocno kako VISION.md vec kaze.

## 5. Trzisna praznina i diferencijacija (sinteza)

Praznine koje Lekta zauzima (nitko ih ne pokriva):
1. Automatska provjera .docx prema verificiranim pravilima KONKRETNOG HR fakulteta.
2. Automatski ISPRAVLJENI .docx u sekundama (repair engine vec radi; njemacki benchmark za
   rucni ekvivalent je stotine eura).
3. Lokalna obrada kao privatnosna garancija (svi ostali traze upload).
4. Validacija citata NIZVODNO, ukljucujuci hrvatske pravne forme.
5. Administrativni sloj (rokovi, obrasci, koraci predaje): nula konkurencije.
6. Cjenovni prostor 4-30 EUR izmedju besplatnih generickih alata i ljudskih usluga.
7. B2B: HR sveucilista nemaju interni format checker.
8. Trenutak "potvrde o lekturi" kao formalizirani checkpoint: partnerski kanal s lektorima.

Tri stupa diferencijacije ostaju kako ih COMPETITORS.md definira (verificirana baza,
deterministicki DOCX sloj, hrvatski + admin sloj), s jednom DOPUNOM iz ovog audita:
**cetvrti stup je AutoFix**: verificirana pravila koja se ne samo mjere nego i automatski
primjenjuju na dokument. PaperCheck nema bazu, Scribbr nema softver, Plag nema ni jedno ni
drugo; nitko nema sva tri plus popravak.

Preporucena glavna poruka (uskladjeno s preporukom specifikacije i stvarnim stanjem koda):

> Ucitaj rad. Preuzmi verziju spremnu za predaju.
> Lekta provjeri rad prema sluzbenim pravilima tvog fakulteta, automatski popravi sto je
> sigurno popraviti, i tocno ti kaze sto jos moras sam. Dokument ne napusta tvoj uredjaj.

Uz obveznu jasnu ogradu u prvom ekranu: "Lekta nije provjera plagijata; izvornost provjerava
fakultet kroz Turnitin."

## 6. Sto se namjerno NE gradi (potvrda i prosirenje postojecih odluka)

- Istojezicni plagijat checker (Turnitin/Srce besplatan; kategorija zauzeta).
- AI detektor kao presuda (nepouzdan na hrvatskom, pravno radioaktivan; samo opt-in
  informativni signal u Fazi 4, nikad tvrdnja).
- Generativni AI writer / humanizer (rusi lane i povjerenje).
- Finalni PDF i PDF/A konverzija u pregledniku (tehnicki laze o izgledu; uputa + validator).
- Kreditne pretplate i skrivene cijene (Plagov model generira nepovjerenje).
- Globalno sirenje prije HR validacije; stotine povrsnih profila (dubina > sirina).

## 7. Tripwire dopuna

Uz postojecu tablicu u COMPETITORS.md dodati: (1) Plagramme/Plag.hr doda automatsku provjeru
oblikovanja ili HR fakultetska pravila (kvartalna provjera cjenika i feature liste; reakcija:
ubrzati javnu coverage matricu i AutoFix copy); (2) CheckMyManuscript ili SciSpace dodaju
podrsku za sveucilisne teze s upload-uputa modelom (reakcija: naglasiti verificiranost i
hrvatski admin sloj, PaperCheck playbook).

## 8. Neprovjereno / ograde

- Plag.hr: cijena detaljnog izvjesca "od 5 USD" i pay-as-you-go paketi dolaze iz sekundarnih
  izvora, nisu potvrdjeni na zivom cjeniku; konkretne cijene lekture/oblikovanja skrivene iza
  logina; tvrdnja "datoteke se ne dodaju u usporednu bazu" nije potvrdjena u politici
  privatnosti; tocan Trustpilot score nedostupan (403).
- Turnitin AI score: nije potvrdjeno vide li ga studenti pri samoprovjeri kroz Srce.
- TAM/SAM: vlastite procjene iz DZS podataka i cjenika; nema javne statistike koliko
  zavrsenih stvarno pise pisani rad (dio strucnih studija ima zavrsni ispit).
- Cijene sivog trzista iz clanaka 2019.-2022. (u kunama), danas vjerojatno vise.
- Alat "StudentFormat" iz specifikacije nije pronadjen; ili ne postoji ili je marginalan.

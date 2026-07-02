# Lekta - Konkurentski krajolik (interni brief)

Živi dokument. Review kadenca: prvi tjedan kolovoza, siječnja i svibnja (prije svakog predajnog vala). Vlasnik: founder. Datum zadnje provjere izvora: 2.7.2026.

Svrha: jedno mjesto istine o konkurenciji za pozicioniranje, landing copy, pricing odluke i tripwire reakcije. Javna landing usporedba živi u `landing_usporedba.html` i NE imenuje konkurente poimence (generičke kategorije); ovaj dokument ih imenuje.

## TL;DR

U Hrvatskoj ne postoji direktan konkurent. Globalno postoji jedan blizak model (PaperCheck, "upload svoje upute") i jedan dominantan ljudski servis (Scribbr). Nitko nema kuriranu, verificiranu, verzioniranu bazu pravila po instituciji s izvorom i datumom. To je pozicija koju branimo.

Pozicioniranje u jednoj rečenici: oni traže da im doneseš pravila i nadaju se da će ih AI dobro pročitati; Lekta ih već zna, verificirana, s izvorom, stranicom i datumom.

## 1. Hrvatska: stanje terena

Nema proizvoda. Postojeći "sustav" provjere:

- Fakultetske PDF upute, svaka ustanova svoje, do bizarnih detalja (VVG propisuje platnene plave korice sa zlatnim Arial 14 bold ispisom; MEFST vlastiti format referenci i uvlake). Fragmentacija je dokaz potrebe za profile modelom.
  - https://vvg.hr/app/uploads/2020/02/Upute-za-izradu-i-obranu-zavrs%CC%8Cnog-i-diplomskog-rada-2013.pdf
  - https://neuron.mefst.hr/docs/katedre/diplomski_ispit/Uputa%20za%20oblikovanje%20diplomskoga%20rada.pdf
- Referada kao ručni format checker; mentor kao spori content checker.
- Turnitin kroz Srce: od ak. god. 2023./2024. sva javna visoka učilišta, od 2024./2025. s AI dodatkom. Pokriva SAMO plagijat/autentičnost, ne format.
  - https://www.srce.unizg.hr/en/spa
- Administrativni sloj je potpuno ručan (EFZG: papirnata prijavnica iz skriptarnice, potpisi, Turnitin potvrda, ovjera u referadi). Naš admin sloj (rokovi, obrasci, koraci) nema nikakvu konkurenciju.
  - https://www.efzg.unizg.hr/diplomski-rad-43724/43724
- Lektori: 1,50 do 2,50 EUR po kartici; diplomski od 60 str oko 135 do 275 EUR, rok 2 do 5 dana. Komplement i partner kanal, ne konkurent.
  - https://www.lektoriranje.org/ | https://idium-sadrzaj.com/ | https://lektoriranjediplomskih.hr/ | https://lekto-fon.hr/cjenik-usluga/
- Sivi ghostwriting market: postoji, ne diramo ga, pravno i etički radioaktivan.

## 2. Globalni igrači

### PaperCheck (papercheck.ai) - PRIJETNJA: VISOKA

- Model: upload rada + upload uputa sveučilišta ili časopisa, AI automatski generira zahtjeve i provjerava usklađenost. Uz to plagijat, AI detekcija, priprema za obranu, oko 5 min obrada, money-back garancija, besplatna provjera kompatibilnosti prije plaćanja, podaci se ne koriste za treniranje.
- Zašto je blizak: to je naš Guidelines Ingestion kao user-facing feature, bez kurirane baze.
- Strukturna slabost: teret i rizik ekstrakcije pravila je na studentu pri SVAKOM uploadu; kriva AI ekstrakcija se otkrije tek u referadi; nema hrvatski kontekst, nema admin sloj, nema verzioniranje pravila po akademskoj godini.
- Što učiti: besplatni compatibility check prije naplate (reže refund), money-back framing, defense prep kao živi plaćeni proizvod (potvrda našeg DEFER umjesto KILL).
- https://papercheck.ai/en

### Scribbr - PRIJETNJA: SREDNJA

- Najveći EU igrač za studentske radove, ljudski servis: lektura s tracked changes u .docx, Structure Check, Clarity Check; Paper Formatting 1,95 USD po stranici po stavci; Citation Editing 2,75 USD po izvoru; najbrži rok 12 h; "100% happiness guarantee". Disertacija od 60.000 riječi oko 2.005 USD.
- Rizik: softverizacija formatting servisa + brend + budžet. Ako lansiraju automatiziranu format provjeru, imaju distribuciju.
- Naša obrana: cijena (red veličine niža), brzina (sekunde vs 12 h), baza pravila po instituciji koju oni nemaju, hrvatski jezik.
- Što učiti: free-tools SEO lijevak (citation generator, proofreader itd. su njihov traffic stroj), happiness guarantee framing, tracked changes kao standard isporuke (relevantno za budući repair engine).
- https://www.scribbr.com/proofreading-editing/rates/ | https://www.scribbr.com/proofreading-editing/paper-formatting/
- Tržišni cjenovni kontekst: https://www.editorworld.com/article/best-dissertation-editing-services

### Paperpal (Cactus) - PRIJETNJA: NISKA DO SREDNJA

- Suite: grammar, plagijat, Reference Checker, Submission Readiness Checker, popravak haluciniranih AI referenci. Fokus: časopisi i istraživači, engleski.
- Relevantno: "submission readiness" jezik normalizira našu kategoriju; reference checker preklapa dio našeg citatnog sloja.
- https://paperpal.com/

### Trinka - PRIJETNJA: NISKA

- Thesis checker fokusiran na akademski jezik i stil, partnerstva sa sveučilišnim knjižnicama. Nema pravila institucija.
- https://www.trinka.ai/thesis-checker

### GPT wrapperi i ChatGPT - PRIJETNJA: NISKA (ali sveprisutna)

- Deseci GPT-ova za "thesis formatting" (citatni stilovi, LaTeX, konzistentnost). Savjetodavni sloj je komoditiziran; nemaju deterministički DOCX sloj, verificirana pravila ni odgovornost.
- Implikacija za copy: nikad se ne natječemo na "savjetu", uvijek na "mjerenju + verificiranosti + odgovornosti".

### Ostalo (kontekst, ne prijetnja)

- Overleaf sveučilišni LaTeX predlošci: compliance by construction, STEM niša.
- Američke grad schools: ručni "format review" prije ETD depozita; dokaz da problem postoji i institucionalno.
- Kina: najzrelije tržište automatskih format provjera uz CNKI plagijat sustav (procjena iz općeg znanja, konkretni alati neverificirani).

## 3. Naša tri stupa diferencijacije (za sav copy)

1. Verificirana baza: svako pravilo ima izvor, stranicu, datum i akademsku godinu. Nitko ovo nema.
2. Deterministički DOCX sloj: mjerimo stvarni dokument (margine, stilovi, numeracija), ne dajemo savjet o njemu.
3. Hrvatski + admin sloj: FPZG fusnote, pravno citiranje, rokovi, obrasci, koraci predaje. Preskupo za globalne igrače na tržištu od oko 31k radova godišnje.

Gotove pozicijske rečenice:
- vs ChatGPT: "ChatGPT ti kaže kako bi rad trebao izgledati. Lekta izmjeri kako tvoj rad stvarno izgleda."
- vs upload-alati: "Oni se nadaju da će AI dobro pročitati tvoja pravila. Mi smo ih pročitali, provjerili i potpisali izvor."
- vs lektor: "Lektor sređuje jezik. Lekta sređuje sve zbog čega te referada vraća. Zajedno, ne umjesto."

## 4. Tripwire okidači i reakcije

| Signal | Kako pratimo | Reakcija |
|---|---|---|
| PaperCheck doda hrvatski ili HR fakultete | kvartalna provjera languages/FAQ stranice | ubrzati T2 pokrivenost top 15 faksova; copy pojačati na verificiranost + garanciju + admin sloj |
| Scribbr lansira automatiziranu format provjeru | kvartalna provjera product stranica | partner kanal s HR lektorima postaje prioritet br. 1; cijena ostaje red veličine niže |
| Pojavi se HR klon | Google Alert: "provjera diplomskog rada", "provjera formatiranja rada" | javna coverage matrica + SEO već zauzet; brzina dodavanja profila je utrka koju dobivamo Factoryjem |
| Srce/Turnitin doda format provjeru (B2G rizik) | Srce novosti, 2x godišnje | mala vjerojatnost, fatalan doseg; obrana: student-side vrijednost (re-check petlja prije predaje) koju institucionalni alat po prirodi nema |
| MoR ili AI trošak poremeti unit ekonomiju konkurenata prema dolje | pricing stranice pri svakom reviewu | ne pratiti cijenu prema dolje ispod poda; braniti se garancijom i bazom, ne cijenom |

## 5. Uzorci koje preuzimamo (validirani tuđim novcem)

1. Free-tools SEO lijevak (Scribbr): hrvatski citat generator, brojač kartica, generator naslovnice po fakultetu. Svaki alat = landing + ulaz u teaser. Backlog P2, prvi kandidat citat generator.
2. Besplatni compatibility check prije naplate (PaperCheck): naš teaser to već jest; eksplicitno ga tako uokviriti u copyju.
3. Money-back / happiness framing (PaperCheck, Scribbr): naša garancija na T2/T3 je jača jer je vezana na TOČNOST PRAVILA, ne na osjećaj zadovoljstva. To je copy poanta.
4. Defense prep kao upsell (PaperCheck): potvrda roadmap odluke DEFER (mjesec 3+), ne KILL.
5. Tracked changes kao format isporuke (Scribbr): standard za budući repair engine UX.

## 6. Akcije prije launcha

- [ ] Provuci jedan stvarni FPZG rad kroz PaperCheck besplatni compatibility check; dokumentirati gapove OVDJE (screenshotovi u /docs/competitors/). Procjena: 1 h.
- [ ] `landing_usporedba.html` live na landingu, cijene sinkronizirane s products tablicom kad backend bude živ.
- [ ] Google Alerts postavljeni (upiti iz sekcije 4).
- [ ] U pricing narativ ugraditi Scribbr benchmark: "ljudsko formatiranje košta 100+ EUR i traje danima".

## 7. Izvori (datum pristupa 2.7.2026)

- Srce, softveri za provjeru autentičnosti: https://www.srce.unizg.hr/en/spa
- PaperCheck: https://papercheck.ai/en
- Paperpal: https://paperpal.com/ | https://paperpal.com/paperpal-for-students
- Trinka: https://www.trinka.ai/thesis-checker
- Scribbr cjenik: https://www.scribbr.com/proofreading-editing/rates/ | formatting: https://www.scribbr.com/proofreading-editing/paper-formatting/ | thesis: https://www.scribbr.com/proofreading-editing/thesis/
- Tržišne cijene editinga: https://www.editorworld.com/article/best-dissertation-editing-services
- HR lektura cijene: https://www.lektoriranje.org/ | https://idium-sadrzaj.com/ | https://lektoriranjediplomskih.hr/ | https://lekto-fon.hr/cjenik-usluga/
- EFZG postupak predaje: https://www.efzg.unizg.hr/diplomski-rad-43724/43724
- VVG upute: https://vvg.hr/app/uploads/2020/02/Upute-za-izradu-i-obranu-zavrs%CC%8Cnog-i-diplomskog-rada-2013.pdf
- MEFST upute: https://neuron.mefst.hr/docs/katedre/diplomski_ispit/Uputa%20za%20oblikovanje%20diplomskoga%20rada.pdf

Pravilo dokumenta: hrvatski jezik, bez em i en crtica. Svaka tvrdnja o konkurentu ima link ili oznaku procjene.

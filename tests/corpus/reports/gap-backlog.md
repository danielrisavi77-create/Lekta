# Lekta Error Corpus - gap-backlog (auto-generirano)

> Sto korpus JOS ne pokriva, po prioritetu. P0 = parser crash/sigurnost; P1 = jezgra predaje bez regresije; P2 = ostalo/korektnost; P3 = informativno.

Ukupno: P0 0, P1 19, P2 1, P3 10.

## P1 (19)

- **citation.punctuation** — Dosljednost interpunkcije citatnica
  - Detektor oddCitationPunctuation je uzak; treba precizan neispravan uzorak.
  - Potreban test: Kalibriraj citatnicu s neispravnom interpunkcijom koja pouzdano okida detektor.
- **citation.style-automation** — Automatizacija citatnog stila
  - Savjetodavna, uvijek-warn provjera (nema pass stanja).
  - Potreban test: Nije atomski testabilna kao fail; eventualno valid-control da ostaje info.
- **footnote.format** — Oblikovanje fusnota
  - Builder ne kontrolira oblik fusnota (rPr/pPr na fusnotnim odlomcima).
  - Potreban test: Prosiri docx-builder footnotes na {text,font,sizePt,spacing}; cleanBuild prolazan pa mutacija fonta/velicine ruši.
- **footnote.marker** — Položaj i stil oznaka fusnota
  - Builder ne emitira <w:footnoteReference> markere u tijelu.
  - Potreban test: Dodaj footnoteReference markere; mutiraj u ukošene / iza interpunkcije.
- **footnote.spacing** — Razmak prije i poslije fusnota
  - Builder ne podrzava before/after razmak na fusnotnim odlomcima.
  - Potreban test: Dodaj pPr spacing na fusnote; eksplicitni razmak != 0 ruši provjeru.
- **format.spacing.paragraph** — Razmak prije i poslije odlomka
  - Builder podrzava samo prored (line), ne before/after razmak odlomka.
  - Potreban test: Dodaj before/after u ParaSpec; eksplicitni razmak > 0.6 pt ruši provjeru.
- **manual.checks** — Zahtjevi za ručnu završnu provjeru
  - Savjetodavni podsjetnik, uvijek-warn (nema pass stanja).
  - Potreban test: Nije atomski testabilna kao fail.
- **page.numbers.scheme** — Shema numeriranja stranica
  - Treba eksplicitni format numeriranja (pgNumType); builder ga ne emitira.
  - Potreban test: Dodaj pgNumType; postavi krivi format (rimski u tijelu).
- **page.size.project** — Format stranice (A3/A0)
  - Provjera se okida samo za profil s paperSizes (A3/A0).
  - Potreban test: Koristi arhitektonski/projektni profil; postavi krivi format stranice.
- **reference.min-count** — Minimalan broj izvora profila
  - Provjera se okida samo za profil s minReferences.
  - Potreban test: Koristi profil s minReferences; smanji broj izvora ispod minimuma.
- **structure.abstract** — Sažeci u samom radu
  - Bodovanje sazetka gated (maxPoints); profil ga ne boduje.
  - Potreban test: Koristi profil koji boduje sazetak; ukloni Sažetak.
- **structure.heading.align** — Poravnanje naslova slijeva
  - auditHeadingRules se ne okida za ovaj profil (nema rules.levels).
  - Potreban test: Profil s heading pravilima; centriraj naslov umjesto lijevo.
- **structure.heading.format** — Oblikovanje naslova po razinama
  - auditHeadingRules se ne okida za ovaj profil (nema rules.levels).
  - Potreban test: Koristi profil s heading pravilima ili dodaj rules.levels; mutiraj velicinu/bold naslova.
- **structure.heading.hierarchy** — Hijerarhija naslova
  - Skok razine (H1->H3) treba Heading3; builder ima samo Heading1/2.
  - Potreban test: Dodaj Heading3/4 stil (ili outlineLvl); H1 pa H3 bez H2 = jump.
- **structure.heading.numbering** — Numeriranje naslova
  - auditHeadingRules se ne okida za ovaj profil (nema rules.levels).
  - Potreban test: Profil s numberRequired; ukloni oznaku razine naslova.
- **structure.keywords** — Ključne riječi u samom radu
  - Bodovanje kljucnih rijeci gated; profil ih ne boduje kao scored.
  - Potreban test: Profil koji boduje kljucne rijeci; ukloni redak Ključne riječi.
- **toc.coverage** — Naslovi dokumenta ↔ sadržaj
  - Treba stvarno TOC polje i spremljene stavke; builder emitira samo PAGE.
  - Potreban test: Dodaj fldSimple/instrText TOC s stavkama; izostavi jedan naslov iz TOC-a.
- **toc.format** — Font i veličina sadržaja
  - Treba TOC1/TOC2 stilovi u sadrzaju; builder ih ne emitira.
  - Potreban test: Dodaj TOC stilove; mutiraj font/velicinu stavki sadrzaja.
- **toc.page-numbers** — Brojevi stranica u sadržaju
  - Treba TOC stavke s brojevima stranica; builder emitira samo PAGE.
  - Potreban test: Dodaj TOC stavke; ukloni brojeve stranica dijelu stavki.

## P2 (1)

- **citation.direct-quote-locator** — Lokator uz izravne citate
  - Poznati bug: missingLocator regex `,\s*\d` tretira godinu (", 2019") kao broj stranice, pa citat s uobicajenom citatnicom (Prezime, 2019) NE moze pasti. Atomski slucaj to zaobilazi izostavljanjem zareza.
  - Potreban test: Popraviti detekciju lokatora (iskljuciti godinu iz kandidata za stranicu) + atomic bez zaobilaznice.

## P3 (10)

- **element.empty-paragraphs** — Prazni odlomci
  - Informativna provjera bez valid-controla (nizak rizik, ali nepokrivena).
  - Potreban test: valid.element.empty-paragraphs: valjana varijanta ostaje informativna/pass.
- **legal.case-law** — Sudska praksa
  - Informativna provjera bez valid-controla (nizak rizik, ali nepokrivena).
  - Potreban test: valid.legal.case-law: valjana varijanta ostaje informativna/pass.
- **legal.id-abbrev** — Kratica id. u istoj bilješci
  - Informativna provjera bez valid-controla (nizak rizik, ali nepokrivena).
  - Potreban test: valid.legal.id-abbrev: valjana varijanta ostaje informativna/pass.
- **page.numbers.position** — Položaj broja stranice
  - Informativna provjera bez valid-controla (nizak rizik, ali nepokrivena).
  - Potreban test: valid.page.numbers.position: valjana varijanta ostaje informativna/pass.
- **page.numbers.start** — Numeriranje od prve stranice Uvoda
  - Informativna provjera bez valid-controla (nizak rizik, ali nepokrivena).
  - Potreban test: valid.page.numbers.start: valjana varijanta ostaje informativna/pass.
- **page.numbers.title-suppressed** — Naslovnica bez broja stranice
  - Informativna provjera bez valid-controla (nizak rizik, ali nepokrivena).
  - Potreban test: valid.page.numbers.title-suppressed: valjana varijanta ostaje informativna/pass.
- **scope.pages** — Opseg u stranicama
  - Informativna provjera bez valid-controla (nizak rizik, ali nepokrivena).
  - Potreban test: valid.scope.pages: valjana varijanta ostaje informativna/pass.
- **title.layout** — Raspored naslovne stranice
  - Informativna provjera bez valid-controla (nizak rizik, ali nepokrivena).
  - Potreban test: valid.title.layout: valjana varijanta ostaje informativna/pass.
- **title.order** — Redoslijed elemenata naslovnice
  - Informativna provjera bez valid-controla (nizak rizik, ali nepokrivena).
  - Potreban test: valid.title.order: valjana varijanta ostaje informativna/pass.
- **title.typography** — Tipografija korica i naslovnice
  - Informativna provjera bez valid-controla (nizak rizik, ali nepokrivena).
  - Potreban test: valid.title.typography: valjana varijanta ostaje informativna/pass.

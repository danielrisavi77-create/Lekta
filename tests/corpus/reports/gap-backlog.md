# Lekta Error Corpus - gap-backlog (auto-generirano)

> Sto korpus JOS ne pokriva, po prioritetu. P0 = parser crash/sigurnost; P1 = jezgra predaje bez regresije; P2 = ostalo/korektnost; P3 = informativno.

Ukupno: P0 0, P1 8, P2 1, P3 10.

## P1 (8)

- **citation.punctuation** — Dosljednost interpunkcije citatnica
  - Detektor oddCitationPunctuation je uzak; treba precizan neispravan uzorak.
  - Potreban test: Kalibriraj citatnicu s neispravnom interpunkcijom koja pouzdano okida detektor.
- **citation.style-automation** — Automatizacija citatnog stila
  - Savjetodavna, uvijek-warn provjera (nema pass stanja).
  - Potreban test: Nije atomski testabilna kao fail; eventualno valid-control da ostaje info.
- **manual.checks** — Zahtjevi za ručnu završnu provjeru
  - Savjetodavni podsjetnik, uvijek-warn (nema pass stanja).
  - Potreban test: Nije atomski testabilna kao fail.
- **page.numbers.scheme** — Shema numeriranja stranica
  - Treba eksplicitni format numeriranja (pgNumType); builder ga ne emitira.
  - Potreban test: Dodaj pgNumType; postavi krivi format (rimski u tijelu).
- **structure.heading.hierarchy** — Hijerarhija naslova
  - Skok razine (H1->H3) treba Heading3; builder ima samo Heading1/2.
  - Potreban test: Dodaj Heading3/4 stil (ili outlineLvl); H1 pa H3 bez H2 = jump.
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

# Lekta Error Corpus - gap-backlog (auto-generirano)

> Sto korpus JOS ne pokriva, po prioritetu. P0 = parser crash/sigurnost; P1 = jezgra predaje bez regresije; P2 = ostalo/korektnost; P3 = informativno.

Ukupno: P0 0, P1 2, P2 0, P3 3.

## P1 (2)

- **citation.style-automation** — Automatizacija citatnog stila
  - Savjetodavna, uvijek-warn provjera (nema pass stanja).
  - Potreban test: Nije atomski testabilna kao fail; eventualno valid-control da ostaje info.
- **manual.checks** — Zahtjevi za ručnu završnu provjeru
  - Savjetodavni podsjetnik, uvijek-warn (nema pass stanja).
  - Potreban test: Nije atomski testabilna kao fail.

## P3 (3)

- **page.numbers.position** — Položaj broja stranice
  - Poravnanje se cita iz stvarnih footer/header dijelova (w:footerReference); builder ih ne emitira pa bodovani pass nije konstruktibilan.
  - Potreban test: Trebalo bi prosiriti builder footer dijelovima s PAGE poljem i poravnanjem; tek tada valid-control (desno poravnat broj) ostaje pass.
- **page.numbers.start** — Numeriranje od prve stranice Uvoda
  - startOk trazi after.hasAnyPageField iz stvarnog footera; nedostupno builderu pa bodovani pass nije dosezljiv.
  - Potreban test: Trebalo bi builder footer dijelove po sekciji; tek tada sekcija s numeriranjem od 1 na Uvodu daje pass.
- **scope.pages** — Opseg u stranicama
  - Hardkodiran status pass (max 0) neovisno o ulazu; nema dosezljivog warn stanja pa valid-control ne cuva nista.
  - Potreban test: Nije atomski/valid pokrivljiv: savjetodavna, uvijek informativna (kao style-automation/manual.checks).

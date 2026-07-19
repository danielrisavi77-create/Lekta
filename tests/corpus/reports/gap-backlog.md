# Lekta Error Corpus - gap-backlog (auto-generirano)

> Sto korpus JOS ne pokriva, po prioritetu. P0 = parser crash/sigurnost; P1 = jezgra predaje bez regresije; P2 = ostalo/korektnost; P3 = informativno.

Ukupno: P0 0, P1 2, P2 0, P3 1.

## P1 (2)

- **citation.style-automation** — Automatizacija citatnog stila
  - Savjetodavna, uvijek-warn provjera (nema pass stanja).
  - Potreban test: Nije atomski testabilna kao fail; eventualno valid-control da ostaje info.
- **manual.checks** — Zahtjevi za ručnu završnu provjeru
  - Savjetodavni podsjetnik, uvijek-warn (nema pass stanja).
  - Potreban test: Nije atomski testabilna kao fail.

## P3 (1)

- **scope.pages** — Opseg u stranicama
  - Hardkodiran status pass (max 0) neovisno o ulazu; nema dosezljivog warn stanja pa valid-control ne cuva nista.
  - Potreban test: Nije atomski/valid pokrivljiv: savjetodavna, uvijek informativna (kao style-automation/manual.checks).

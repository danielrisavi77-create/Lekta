# Lekta Error Corpus - gap-backlog (auto-generirano)

> Sto korpus JOS ne pokriva, po prioritetu. P0 = parser crash/sigurnost; P1 = jezgra predaje bez regresije; P2 = ostalo/korektnost; P3 = informativno.

Ukupno: P0 0, P1 3, P2 0, P3 4.

## P1 (3)

- **citation.style-automation** — Automatizacija citatnog stila
  - Savjetodavna, uvijek-warn provjera (nema pass stanja).
  - Potreban test: Nije atomski testabilna kao fail; eventualno valid-control da ostaje info.
- **manual.checks** — Zahtjevi za ručnu završnu provjeru
  - Savjetodavni podsjetnik, uvijek-warn (nema pass stanja).
  - Potreban test: Nije atomski testabilna kao fail.
- **page.size.a4-list** — Format stranice (A4)
  - Bodovana provjera bez fail-slucaja (moze pasti, nije regresijski pokrivena).
  - Potreban test: atomic.page.size.a4-list: cista varijanta prolazi, jedna mutacija ruši "Format stranice (A4)".

## P3 (4)

- **format.typography.consistency** — Tehničko-tipografska dosljednost
  - Informativna provjera bez valid-controla (nizak rizik, ali nepokrivena).
  - Potreban test: valid.format.typography.consistency: valjana varijanta dosize bodovani pass (max>0), ne informativni max-0.
- **page.numbers.scheme** — Shema numeriranja stranica
  - Informativna provjera bez valid-controla (nizak rizik, ali nepokrivena).
  - Potreban test: valid.page.numbers.scheme: valjana varijanta dosize bodovani pass (max>0), ne informativni max-0.
- **scope.intro-conclusion-ratio** — Omjer Uvoda i Zaključka
  - Informativna provjera bez valid-controla (nizak rizik, ali nepokrivena).
  - Potreban test: valid.scope.intro-conclusion-ratio: valjana varijanta dosize bodovani pass (max>0), ne informativni max-0.
- **scope.pages** — Opseg u stranicama
  - Hardkodiran status pass (max 0) neovisno o ulazu; nema dosezljivog warn stanja pa valid-control ne cuva nista.
  - Potreban test: Nije atomski/valid pokrivljiv: savjetodavna, uvijek informativna (kao style-automation/manual.checks).

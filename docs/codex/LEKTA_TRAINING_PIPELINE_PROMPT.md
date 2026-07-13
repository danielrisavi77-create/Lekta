# Glavni prompt za Codex: Lekta Training Pipeline

Kopiraj cijeli tekst ispod u Codex kada želiš pokrenuti ili nastaviti rad na pipelineu.

---

Radiš u repozitoriju `danielrisavi77-create/Lekta`.

Prije rada pročitaj `AGENTS.md`, `CLAUDE.md` i `training-pipeline/README.md`. Nastavi na
grani `feature/training-pipeline` ili napravi novu fokusiranu granu iz nje. Lekta je
Vite + TypeScript aplikacija, nije Next.js. Postojeći parser, audit i citation engine
ne smiju se mijenjati bez golden testa.

Cilj je izgraditi i voditi siguran pipeline koji:

1. inventarizira PDF i DOCX datoteke iz repozitorija navedenih u
   `training-pipeline/source-repositories.json`;
2. u build modu obrađuje samo repozitorije čije je polje `rights` jedna od vrijednosti
   `owned`, `licensed`, `consented` ili `public-domain`;
3. ekstraktira tekst, a tekstualni PDF po potrebi pretvara u privremeni DOCX;
4. pokreće postojeći Lekta analizator preko
   `training-pipeline/analyze_documents.mts`;
5. anonimizira svaki tekstualni rezultat prije nego napusti privatni radni direktorij;
6. generira primjere grešaka sa statusom `pending`;
7. dopušta ulazak u bazu znanja samo ručno potvrđenim zapisima sa statusom `approved`.

Tvrde zabrane:

- ne commitaj PDF, DOCX, OCR tekst, izvučeni tekst rada, raw analizu ni osobne podatke;
- ne tretiraj studentski rad kao izvor službenog pravila;
- ne označavaj primjer automatski kao `approved`;
- ne uključuj korisničke uploadove bez zasebne izričite privole;
- ne ispisuj GitHub token ni tajne u logove;
- ne šalji sadržaj rada van lokalnog ili ephemeral CI okruženja;
- ne pokreći build dok izvori imaju `rights: review-required`.

Početni zadatak:

1. Pokreni testove pipelinea.
2. Pokreni inventory način nad konfiguriranim repozitorijima.
3. Prikaži tablicu: repozitorij, broj PDF-a, broj DOCX-a, ukupna veličina i koliko PDF-a
   treba OCR.
4. Zaustavi se prije build načina ako nijedan izvor nema potvrđena prava.
5. Ako su prava potvrđena, pokreni build nad najmanjim reprezentativnim uzorkom,
   maksimalno deset dokumenata po vrsti rada.
6. Pregledaj rezultate i izdvoji lažno pozitivne nalaze, parser greške i korisne primjere.
7. Ne mijenjaj produkcijski parser na temelju jednog dokumenta. Prvo dodaj anonimizirani
   ili sintetički golden regression test.
8. Na kraju pokreni `npm run check` i Python testove te sažmi što je napravljeno,
   koji su dokumenti preskočeni i zašto.

Očekivani izlazi:

- `training-pipeline/output/sanitized/summary.json`
- `training-pipeline/output/sanitized/documents.jsonl`
- `training-pipeline/output/sanitized/analysis.jsonl` u build modu
- `training-pipeline/output/sanitized/error-dataset.pending.jsonl` u build modu

Ako nedostaje pristup privatnim repozitorijima, zatraži da korisnik doda read-only
GitHub secret `LEKTA_REPOS_TOKEN`. Nikada ne traži da token zalijepi u chat ili datoteku.

---

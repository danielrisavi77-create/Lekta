---
name: alat-evaluacija
description: Okida se kad treba procijeniti vanjski alat, biblioteku, GitHub repozitorij, MCP server ili ekstenziju za Lektu prije uvodjenja. Postupak mjerenja nad Lektom, dokaza da alat grize i odluke koja se upisuje u plan.
---

# Evaluacija vanjskog alata

Plan i dosadasnje odluke su u `docs/roadmap/INTEGRACIJA_ALATA.md`. Svaka nova procjena tamo
zavrsava redom u tablici "Odluke po alatu", a odobren posao kao zadatak u `docs/agents/tasks.json`.

## 1. Prije mjerenja

- Postoji li vec odluka u `INTEGRACIJA_ALATA.md` ili alat u `package.json`? Ne predlazi isto dvaput.
- Granica proizvoda: alat koji pise, ocjenjuje ili mijenja sadrzaj rada ne ulazi (CLAUDE.md).
- Licenca iz registra, ne iz sjecanja: `npm view <paket> license version time.modified` ili
  PyPI JSON (`https://pypi.org/pypi/<paket>/json`). AGPL i CPAL nikad u bundle.
- Velicina i nacin dobave binarnog dijela (optionalDependencies, postinstall preuzimanje, pip wheel).
  Teski alat ne ide u `dependencies` ni `devDependencies` (`docs/agents/RADNE_STANICE.md`, pravilo 1):
  pinani `npx <paket>@<verzija>` ili pip pin samo u CI-ju, ili radna stanica uz NEPOKRIVEN bez alata.

## 2. Mjerenje nad Lektom

- Izolirani klon ili worktree izvan repozitorija, nikad dijeljeno stablo. Alat se instalira u
  zasebnu mapu, ne u klon.
- Ulaz su stvarni Lektini izlazi: fixture iz `tests/fixtures/docx` provucene kroz popravak (isti put
  kao `tests/repair-closed-loop.test.ts`) i tamni uzorci iz `scripts/emit-repair-samples.mjs`.
- Zabiljezi zateceno stanje: koliko ulaza alat vec oznacava kao lose. To je nalaz za ratchet,
  ne razlog da se alat odbaci ili oslabi.

## 3. Dokaz da alat grize

Bez ovoga procjena ne vrijedi (`lekta-protokol`, stavka 2: vakuumski gard).

- Ista kontrola bez izmjene mora proci.
- Barem tri podmetnute greske iz stvarne klase kvarova moraju pasti. Primjer za OOXML: krivi
  redoslijed elemenata u `w:pPr`, nepoznat element, kriva enum vrijednost.
- Isti podmetnuti ulazi kroz postojecu razinu (npr. Tier 1 python-docx) pokazuju je li alat stvarno
  nov dokaz ili duplikat.
- Mutant pisi kopiranjem imena dijelova paketa, ne `ZipInfo` objekata: Python `writestr(zinfo, ...)`
  mijenja metapodatke izvora i daje lazni CRC pad.

## 4. Odluka i zapis

- Red u tablici `INTEGRACIJA_ALATA.md`: alat, licenca, odluka, razlog, zadatak.
- Rezultati mjerenja s commitom nad kojim su izmjereni i datumom.
- Zadatak u `tasks.json` s kriterijem prihvacanja koji ukljucuje mutaciju u `tests/gate-mutations.test.ts`.
- Izvjestaj vlasniku: sto je izmjereno, sto nije, i sto je njegova odluka (analitika, nova funkcija,
  serverski put, troskovi).

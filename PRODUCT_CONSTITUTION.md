# PRODUCT CONSTITUTION — Katedra × Lekta

> Commitaj ovaj file **doslovno, nepromijenjen, u root oba repoa**.
> Svaka buduća funkcionalnost mora proći test: "Krši li ovo ustav?" Ako da — ne gradi se.

## Uloge

| | KATEDRA (coach) | LEKTA (checker) |
|---|---|---|
| priroda | AI copilot, generativna | deterministički engine, mjerna |
| domena | proces izrade rada | stvarni .docx dokument |
| radi | vodi, planira, istražuje, strukturira, recenzira sadržaj, priprema obranu, vodi AI ledger | čita OOXML, uspoređuje s verificiranim pravilima, boduje, detektira, popravlja formu (AutoFix) |
| izlaz | prijedlozi, planovi, pitanja, recenzije | nalazi, score, popravljeni dokument |

## Zabrane (tvrde, bez iznimke)

1. **Katedra nikada ne proglašava dokument formalno usklađenim.** Njezina recenzija je mišljenje o sadržaju; usklađenost mjeri isključivo Lekta.
2. **Lekta nikada ne piše niti ocjenjuje argumentaciju, tezu ili sadržaj rada.** AutoFix smije dirati formu (margine, stilove, razmake, polja) — nikada rečenice.
3. **Katedra nema vlastitu bazu fakultetskih pravila.** Sva pravila dolaze iz Lektine baze (katedra-pack / Academic Core). Ako pravilo ne postoji u Lekti, Katedra kaže "provjeri službene upute" — ne izmišlja ga.
4. **Smjer istine: Lekta → Katedra.** Nikad obrnuto. Kriterij istine je Lektin verification gate (status `verified` + službeni authority + sourceId + sourcePage + quote + snapshot hash).
5. **Samo Lekta smije issue označiti `VERIFIED_FIXED`** — i to isključivo rezultatom ponovnog re-checka, nikad tvrdnjom korisnika ili Katedre.
6. **Rad (.docx) ne napušta uređaj korisnika** u automatskim provjerama. Između aplikacija putuju samo: metadata projekta, ID-jevi nalaza, severity, score. Nikad sadržaj rada.
7. **Student je autor.** Obje aplikacije strukturirane su tako da odluke (tema, teza, plan, prihvaćanje izmjena) donosi student; AI doprinos se transparentno bilježi (AI Usage Ledger) i deklarira po pravilima fakulteta.
8. **B2B ponuda ne sadrži generativno pisanje.** Fakultetima se nudi Lekta Campus (provjera, compliance, statistika) i eventualno Katedra Learn (planiranje, sokratski mod, ledger) — nikada "piši sa mnom".

## Dva signala, nikad jedan

Napredak se korisniku uvijek prikazuje kao **dva odvojena broja**:
- **Katedra — proces izrade** (npr. 68 % · faze: tema → obrana),
- **Lekta — tehnička usklađenost** (npr. 84/100 po kategorijama).

Zabranjeno ih je zbrajati u jedan "rad je X % spreman".

*Verzija 1.0 · 2. kolovoza 2026.*

---
name: DOCX regresija
about: Popravljeni dokument se ne otvara, izgleda drugacije, ili je izgubio sadrzaj
labels: docx, regresija
---

<!--
Audit 2026-08-17 (CODE-21). DOCX kvarovi se ne mogu dijagnosticirati iz opisa "ne radi", jer se
dio njih u XML-u uopce ne vidi (RE-57, RE-58 su nadjeni tek usporedbom SPOJENOG teksta odlomka).
Ovaj predlozak trazi minimum s kojim se kvar moze reproducirati.

NE PRILAZI TUDJI STUDENTSKI RAD. Ako je kvar vezan uz konkretan dokument, opisi ga strukturno
(broj sekcija, ima li naslovnicu, tablice, fusnote) ili napravi anonimiziranu minimalnu repliku.
-->

## Sto se dogodilo

<!-- Word javlja gresku pri otvaranju? Otvara se ali izgleda drugacije? Nedostaje sadrzaj? -->

## Razina na kojoj je kvar uocen

- [ ] Tier 0: `npm run check` / package-integrity skener
- [ ] Tier 1: `npm run verify:strict-open` (python-docx)
- [ ] Tier 2: pravi Microsoft Word (`npm run verify:word`) — navedi verziju Worda
- [ ] Tier 3: korisnik na svom stroju

Podsjetnik: python-docx i lxml prihvacaju dokumente koje Word poslije otvara uz upozorenje.
"Strict open prolazi" NIJE dokaz da je paket ispravan.

## Dokument

- Fakultet / profil:
- Vrsta rada:
- Priblizna velicina i broj stranica:
- Sadrzi: <!-- naslovnica / tablice / slike / fusnote / polje sadrzaja / vise sekcija / prilozi -->

## Koji su popravci bili odabrani

<!-- Popis stavki, ili "sve predodabrano (Popravi)". Ako znas fixerId, navedi ga. -->

## Je li tekst ostao isti

- [ ] Tekst je nepromijenjen
- [ ] Tekst se promijenio PRIJE osvjezavanja polja
- [ ] Tekst se promijenio TEK nakon `Fields.Update()` u Wordu
- [ ] Nisam provjerio

Ovo je kljucno pitanje: cetiri popravka SMIJU mijenjati vidljivi tekst (velika slova naslova,
hrvatska tipografija, kanonizacija DOI-ja, polje sadrzaja). Sve ostalo ne smije.

## Sto je vraceno korisniku

- [ ] Popravljeni dokument
- [ ] Izvorni dokument uz napomenu o regresiji (`detectPassRegressions`)
- [ ] Greska

## Dodatno

<!-- integrityFailure iz odgovora, changelog, skipped stavke, ispis iz konzole. -->

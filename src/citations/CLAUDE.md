# Citations

Ove upute vrijede za `src/citations/**`. Globalna pravila iz root `CLAUDE.md` i dalje vrijede.

## Granica

Citation engine provjerava postojanje, strukturu i formalnu uskladenost citata.
Ne pise, ne prepravlja i ne ocjenjuje akademski sadrzaj. Promasaj u lokalnom ili
vanjskom korpusu nikad nije dokaz da izvor ne postoji.

## Izvori i tvrdnje

- Bodovano pravilo smije doci samo iz sluzbenog izvora.
- Hijerarhija je: aktualna odluka ili pravilnik za godinu i vrstu rada, aktualna
  sluzbena stranica studija, opce upute ustanove, zatim pisana uputa mentora ili kolegija.
- Studentski radovi sluze samo regresijskom testiranju parsera, nikad kao izvor pravila.
- Nepotvrden `sourcePage` ostaje `null`; ne pogadaj stranicu.
- `ruleEntry` nosi vrijednost, `modality`, `scope` i `modalitySource`.
- Stroj smije predloziti modalitet, ali ne smije sam upisati ublazeni modalitet.
  Svako tumacenje ublazavanja ide covjeku.
- Dopuseni modaliteti su `obligation`, `directive`, `prohibition`,
  `recommendation`, `permission` i `condition`.

`ruleEntries` su autorski izvor istine. Motor boduje samo vrijednost koja je vezana
uz verificiranu tvrdnju. Usporedba se radi po osi koju motor cita, ne samo po kljucu
u `rules`. Raskorak se rjesava presudom vlasnika; nije automatski tocna ni tvrdnja
ni naslijedena vrijednost.

## Parser i golden

Legal Citation Engine je osjetljiv regexni parser hrvatskih pravnih i akademskih
formi. Ne mijenjaj parser, audit ni citation engine bez golden-file testa koji
prvo dokazuje zateceno ponasanje.

Koristi `tests/docx-golden.test.ts`, `tests/fixtures/docx/` i ciljane citatne
fixture. Vise prolaza istim alatom nije neovisna provjera. Netrivijalna promjena
trazi adversarijalni pregled drugog alata prije commita.

## Verifikacijski mehanizmi

- Svaki novi mehanizam mora imati vlastiti brojac u artefaktu i dokaz da je veci od nule.
- Generator ulaza mora dokazati da zaista proizvodi oblik koji test tvrdi pokrivati.
- Gard mora imati baseline i mutaciju u `tests/gate-mutations.test.ts`.
- Usporeduj imenovane nalaze, ne samo ukupan broj; isti zbroj moze skrivati zamjenu identiteta.
- Prije regeneracije drift artefakta usporedi broj provjerenih jedinica. Manja
  pokrivenost uz manje nalaza upucuje na kvar citaca, ne na poboljsanje.
- Nedostajuci citac izvora ne smije se pretvoriti u prazan tekst i lazno zelen rezultat.

## Korisne naredbe

```bash
npm run extract-citation-sections
npm run citation-dossiers
npm run audit:scored-quotes
npm run verify:claims
npm run scored-value-drift
npm run drift-dossiers
```

Skripte koje predlazu ili generiraju nalaze ne donose presudu umjesto covjeka.

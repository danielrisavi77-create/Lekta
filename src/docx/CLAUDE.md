# DOCX i OOXML

Ove upute vrijede za `src/docx/**`. Globalna pravila iz root `CLAUDE.md` i dalje vrijede.

## Parser

OOXML parser je osjetljiva jezgra. Ne mijenjaj ga bez golden-file testa koji prvo
dokazuje zateceno ponasanje:

```bash
npm test -- tests/docx-golden.test.ts
```

Fixture i snapshoti su u `tests/fixtures/docx/`. Suite ne smije biti vakuumski:
provjeri da su stvarne fixture ucitane i da generator proizvodi tocno oblik koji
test tvrdi pokrivati.

## Vidljivi tekst je mjerilo

Lekta popravlja formu. Usporedba prije i poslije mora citati spojeni vidljivi tekst
odlomka i, gdje je relevantno, rezultat nakon Word `Fields.Update()`. Sirovi XML
nije dovoljan dokaz jer run granice i polja mogu sakriti promjenu koju korisnik vidi.

Iznimke koje namjerno smiju promijeniti vidljivi tekst opisane su u
`src/repair/CLAUDE.md`; ne prosiruj ih iz ovog modula.

## Integritet paketa

- Ne oslanjaj se na `@xmldom/xmldom` kao strogi XML validator.
- Provjeri relacije, content types, obvezne dijelove i svaki izmijenjeni XML dio.
- Binarne fixture usporeduj sirovim bajtovima; CR normalizacija vrijedi samo za tekst.
- Test idempotencije mora primijeniti zahvat dvaput i dokazati da je drugi prolaz no-op.
- Mjera nad populacijom koju prvi prolaz sam mijenja nije stabilan nazivnik.

## Oracle razine

`npm run check` ne otvara dokument stvarnim uredivacem. Za promjene koje utjecu na
izlazni paket koristi postojece oracle:

```bash
npm run verify:strict-open:repaired
npm run verify:word
npm run verify:word:worst
```

Za TOC promjene obvezan je `npm run verify:word:toc`. `OpenAndRepair=false` je dio
ugovora. Preskocena Word provjera nije prolaz.

Netrivijalna promjena trazi adversarijalni pregled drugog alata prije commita.

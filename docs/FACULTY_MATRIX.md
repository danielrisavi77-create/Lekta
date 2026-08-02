# Fakultetska matrica Repair Enginea

Izvještaj `docs/generated/faculty-matrix.json` povezuje profilni registar,
repair coverage matricu i stvarne DOCX regresijske uzorke.

Generiranje:

```bash
npm run repair-faculty-matrix
```

Za svaki fakultet izvještaj prikazuje:

- naziv i `unitId` iz `data/catalog/zagreb-catalog.json`,
- broj profila i njihove programe i vrste rada,
- sva ponuđena pravila, fixere i DOCX predloške,
- broj stvarnih DOCX uzoraka i profile bez takvog uzorka,
- rezultate profilne coverage provjere i real-corpus testa,
- razloge zbog kojih je potreban ručni pregled.

Status `pass` u profilnoj coverage provjeri znači da je svaka ponuđena opcija
profila mapirana na poznati fixer i capability predložak. To nije dokaz da je
svaki fixer vizualno potvrđen na stvarnom radu.

Status `review` za stvarni DOCX znači da je dokument čitljiv i da nema regresije
ili gubitka ZIP dijelova, ali promijenjeni dokument treba otvoriti u Wordu ili
LibreOfficeu. `no-op` znači da popravak nije imao promjenu i da je drugi prolaz
bio stabilan.

Per-profile sintetički closed-loop test u ovoj matrici je namjerno označen kao
`not-run` dok se ne završi spori per-profile runner. Time izvještaj ne prikazuje
neizvršenu provjeru kao uspjeh.

# Program profilne pokrivenosti Lekta

## Cilj

Svi registrirani fakultetski profili trebaju dosegnuti najmanje razinu B kada za njih postoji službeni, provjerljiv izvor i siguran deterministički popravak. Razina A dodjeljuje se samo profilima za koje postoji dokaz na stvarnom studentskom radu.

Početni nazivnik je 407 profila u registru i 131 fakultetska jedinica. Tri katedarska profila vode se zasebno u javnom ledgeru i ne smiju se tiho pribrajati registriranom nazivniku.

## Dokazni ugovor

- A znači službena pravila, fakultetski specifičan deterministički popravak i prolaz na stvarnom radu.
- B znači službena pravila, fakultetski specifičan deterministički popravak i prolaz na generiranom dokumentu.
- C znači da pravila i popravak postoje, ali ljudska verifikacija nije završena.
- D znači da nema fakultetski specifičnog popravka.
- E znači da nema bodovanih pravila iz službenog izvora.
- Studentski radovi služe kao regresijski i dokazni materijal, nikada kao izvor fakultetskog pravila.
- Ne postoje automatske promocije iz B u A bez ovjerenog stvarnog rada.

## Phase 0, interna matrica

Dodaje se generirani privatni artefakt `docs/generated/profile-coverage-backlog.json`. Za svaki profil sadrži identitet, fakultet, vrste rada, trenutnu razinu, ciljanu sljedeću razinu, klasifikaciju blokatora, sve redove completion ledgera i rule evidence sa `sourceId`, `sourcePage`, `quote`, `status`, `scored`, `autoFixable` i `fixerId`.

Artefakt smije sadržavati citate i potpise jer je pod `docs/**`, koji je PRIVATE-IP i nije dio javnog bundlea. Generator smije čitati drafts runtime samo iz skripte i testova. Javna projekcija `data/profiles/profile-claims.json` ostaje ograničena na slovo razine i label.

Matrica ima i agregat po fakultetu, ali samo za 407 registriranih profila. Katedarski profili imaju vlastiti odjeljak. Programski redci bez profila ne ulaze u profilni nazivnik, nego ostaju u completion ledgeru kao nacionalni blokatori.

## Backlog klasifikacija

- `complete`: razina A
- `real-corpus`: razina B, sljedeći cilj A
- `human-audit`: razina C, sljedeći cilj B
- `repair`: razina D, sljedeći cilj B
- `source`: razina E, sljedeći cilj B samo ako se pronađe službeni izvor
- `unreachable-source`: E bez dostupnog službenog izvora, ne tretira se kao programski kvar

## Invarijante

- Svaki registrirani profil mora imati točno jedan agregirani profilni zapis.
- Profilni claim mora odgovarati svim njegovim ledger redovima; konflikt razina je greška generatora.
- Svaki bodovani rule entry mora imati službeni izvor, stranicu, citat, status `verified` i dokazivu verifikaciju prema postojećim validatorima.
- C, D i E ne smiju biti preimenovani u B samo promjenom labele.
- Promjena parsera ili repair mehanike traži golden test, test prve primjene i test idempotencije.
- Generirani artefakti moraju imati drift test.

## Sljedeće faze

1. C profili, ljudska verifikacija vrijednosti, modaliteta i opsega.
2. D profili, fakultetski specifični repair recepti uz službeni dokaz.
3. E profili, rights-gated pronalazak i verifikacija službenih izvora, uz imenovanje nedostižnih profila.
4. A dokazi, stvarni radovi organizirani po jedinici i vrsti rada, uz dopuštenje, pseudonimizaciju i provjeru nepromijenjenog vidljivog teksta.


# Autonomy i verifikacijske skripte

Ove upute vrijede za `scripts/autonomy/**`. Globalna pravila iz root `CLAUDE.md` i dalje vrijede.

## Dokaz mehanizma

Nizvodna mjera nije dokaz da novi mehanizam radi. Svaki mehanizam mora imati
vlastiti brojac, zapisati ga u artefakt i imati test koji dokazuje da brojac nije nula.

Generator ulaza mora imati zaseban dokaz da stvarno proizvodi ciljanu klasu oblika.
Idempotencija zahtijeva dva prolaza i tvrdnju da je drugi no-op. Svaki novi gard
treba baseline i mutaciju u `tests/gate-mutations.test.ts`.

Usporeduj identitete nalaza, ne samo zbrojeve. Broj moze ostati isti dok jedan
blokator nestane, a drugi se pojavi.

## Projekcije i artefakti

- `npm run projection-freshness` je screening: pita je li se projekcija mogla pokvariti.
- `npm run projection-verify` je presuda: regenerira izolirano i usporeduje sadrzaj.
- `git status` nije dokaz sadrzajne razlike; generator moze promijeniti samo EOL.
- Novu projekciju registriraj u `PROJECTIONS` u `scripts/projection-freshness-core.mjs`.
- Regeneriraj samo u cistom izoliranom stablu. Izvor, artefakt i ratchet idu u isti commit.

## Pouzdana mjerenja

- Tekstualne datoteke normaliziraj za CR prije usporedbe s Git blobom.
- Binarne fixture usporeduj sirovim bajtovima.
- JSON parsiraj s `JSON.parse`; razmaci, redoslijed kljuceva i EOL nisu ugovor.
- Ako korak pipelinea padne, mora pasti cijelo mjerenje. Djelomican broj nije rezultat.
- Ne tumaci `git status`, `git log origin..HEAD` ili izlazni kod kao odgovor na drugo pitanje.
- Za korpus usporedi `documentCount` i `scope.localDocumentCount`; sidecari mijenjaju nazivnik.
- Gitignorirani artefakt sacuvaj izvan repozitorija prije novog prolaza ako ga trebas usporediti.

## Resursi i izlaz

Prije velikog Vitest prolaza provjeri slobodan RAM. Ispod priblizno 1 GB slobodnog
RAM-a ne pokreci puni suite. Nula FAIL redaka bez zavrsnog `Test Files` sazetka nije
zeleno; moze biti prekid zbog resursa. Kad lokalni stroj nije miran, dokaz prebaci na CI.

Log zapisuj u vlastitu datoteku kad omotac prikazuje samo rep. Ishod Vitesta cita se
iz `Test Files` sazetka, ne samo iz izlaznog koda procesa.

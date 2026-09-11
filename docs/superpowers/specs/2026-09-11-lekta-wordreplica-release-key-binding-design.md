# Lekta i WordReplica: fail-closed vezanje kljuceva i automatski release dizajn

**Datum:** 2026-09-11

**Status:** Dizajn odobren u razgovoru 2026-09-11. Ovaj dokument mora dobiti
zavrsnu korisnicku potvrdu prije izrade implementacijskog plana.

**Repozitoriji i grane:**

- Lekta: `feature/repair-contract-v1-current-v2`
- WordReplica: `automation-dev`
- `master` i `main` nisu odredisne grane ovog rada.

## Problem

Postojeci tok vec povezuje placeni Lekta popravak s jednokratnim WordReplica
runnerom: Lekta pohrani izvorni i serverski popravljeni DOCX, izda potpisani
Repair Contract, runner ga jednom preuzme, rekonstruira novi lokalni DOCX,
salje potpisane statuse i uklanja vlastiti EXE nakon uspjeha. Serverska kopija
ostaje dostupna korisniku.

Preostala produkcijska rupa nalazi se u release granici:

1. WordReplica manifest identificira Repair Contract kljuc samo preko
   `contractKeyId`, koji je naziv, a ne kriptografski dokaz stvarnog kljuca.
2. Lekta release ne dokazuje da privatni kljuc kojim `repair-docx` potpisuje
   ugovor odgovara javnom kljucu ugradenom u runner.
3. Release ne postavlja automatski Supabase tajne potrebne za lokalni popravak.
4. Postojeci deployment zato moze izgledati uspjesno, a `repair-docx` ipak ne
   ponuditi lokalni tok ili izdati ugovor koji runner odbija.

## Cilj

Release mora fail-closed dokazati jedan neprekinuti lanac identiteta:

`pregledani WordReplica source commit -> potpisani EXE -> runner manifest ->`
`ugradeni javni contract kljuc -> odgovarajuci privatni kljuc na Supabaseu ->`
`jednokratni ugovor koji runner prihvaca`.

Nakon svih lokalnih i produkcijskih preduvjeta, jedan automatizirani release
postavlja tajne, objavljuje migracije, Edge funkcije, web i runner te uklanja
kill switch tek kao posljednji korak. Nijedna tajna ne smije zavrsiti u Git
stablu, argumentima procesa, planu, standardnom izlazu ili poruci pogreske.

## Odluka

Odabire se automatski release s kriptografskim vezanjem stvarnog para kljuceva
i sigurnim privremenim `env` datotekama. Rucno postavljanje tajni u dashboardu
se odbacuje jer ostavlja ljudsku pogresku izvan release gatea. Vanjski KMS ili
HSM ostaje moguca kasnija zamjena za nacin cuvanja privatnog kljuca, ali nije
potreban za ovaj korak i ne mijenja opisani javni ugovor.

## Kanonski otisak javnog kljuca

Repair Contract koristi P-256 kljuc. Otisak se racuna ovako:

1. ucitati javni kljuc koji se prosljeduje WordReplica release buildu;
2. kanonizirati ga kao DER `SubjectPublicKeyInfo`;
3. izracunati SHA-256 nad tim DER bajtovima;
4. zapisati 64 znaka malog heksadecimalnog zapisa.

Hash PEM teksta nije dopusten jer razmaci i prijelomi redaka nisu identitet
kljuceva. Lekta iz PKCS#8 privatnog kljuca izvodi njegov javni kljuc, izvozi isti
DER SPKI oblik i racuna isti otisak.

## WordReplica release manifest v2

`BUILD_LEKTA_REPAIR_RUNNER.ps1` mora racunati otisak iz tocnog javnog kljuca od
kojeg je neposredno prije builda pripremljen runner trust store. Manifest prelazi
na `schemaVersion: 2` i dobiva obvezno polje:

```json
{
  "schemaVersion": 2,
  "contractKeyId": "lekta-prod-2026-01",
  "contractPublicKeySha256": "64 lowercase hex characters"
}
```

Sva postojeca polja identiteta artefakta ostaju obvezna: hash i velicina EXE-a,
Authenticode thumbprint, timestamp server, engine verzija, source commit,
`automation-dev` grana i cisto source stablo. Lekta odbija manifest v1 kako stari
artefakt bez vezanja kljuca ne bi mogao u novi release.

## Lekta trust policy i provjera para kljuceva

Postojeca neovisna release politika prosiruje se varijablom:

- `LEKTA_REPAIR_EXPECTED_CONTRACT_PUBLIC_KEY_SHA256`

To je pregledani, ne-tajni otisak i ne prepisuje se iz manifesta. Release ulaz
za stvarni privatni kljuc je:

- `LEKTA_REPAIR_CONTRACT_PRIVATE_KEY_PKCS8_B64URL`

Postojeci `LEKTA_REPAIR_EXPECTED_CONTRACT_KEY_ID` ostaje neovisno pregledani
identifikator. Release mora prije prve promjene udaljenog stanja:

1. base64url-dekodirati privatni kljuc;
2. ucitati ga kao EC PKCS#8 P-256 kljuc;
3. izvesti javni DER SPKI i njegov SHA-256;
4. zahtijevati jednakost privatnog kljuca, ocekivanog otiska i otiska iz
   WordReplica manifesta;
5. zahtijevati jednakost ocekivanog key ID-a i `contractKeyId` iz manifesta.

Nedostajuci, neispravan ili nepodudaran kljuc prekida release prije Supabase
linka, migracije, postavljanja tajni ili Netlify deploymenta.

Privatni release ulaz uklanja se iz okoline svih child procesa. Prima ga samo
release proces koji ga provjerava i privremeno predaje naredbi za Supabase tajne.

## Sigurno postavljanje Supabase tajni

Novi fokusirani helper prima mapu naziva i vrijednosti tajni te callback koji
izvrsava tocno jednu Supabase naredbu. Helper:

- stvara nasumicni direktorij u korisnickom privremenom direktoriju;
- zapisuje `env` datoteku bez ispisa vrijednosti;
- na Windowsu ogranicava ACL na trenutnog korisnika, SYSTEM i Administrators;
- na platformama s POSIX dozvolama zahtijeva mode `0600`;
- poziva `supabase secrets set --env-file <path> --project-ref
  zrrjttizjyfcxmcpgzml`;
- u `finally` bloku brise datoteku i direktorij;
- prekida release ako ogranicavanje pristupa ili brisanje ne uspije;
- redigira privatni kljuc iz svake uhvacene poruke pogreske.

Vrijednosti se nikad ne prosljeduju kao `NAME=VALUE` argumenti. Dry-run i
deployment plan prikazuju samo nazive tajni i fazu, nikad njihove vrijednosti ni
put privremene datoteke.

Supabase runtime dobiva postojece nazive:

- `REPAIR_CONTRACT_PRIVATE_KEY_PKCS8_B64URL`
- `REPAIR_CONTRACT_KEY_ID`
- `REPAIR_LOCAL_ENABLED`
- `REPAIR_LOCAL_DISABLED`

## Fail-safe release redoslijed

Release zadrzava provjere Authenticode potpisa, pregledanog source commita,
pregledanog artifact hasha, produkcijskog `repair-docx` baselinea, migracija,
builda i `dist` artefakta. Redoslijed udaljenih promjena je:

1. izvrsiti sve lokalne provjere artefakta, manifesta i para kljuceva;
2. povezati tocno Supabase projekt `zrrjttizjyfcxmcpgzml`;
3. pokrenuti Lekta integration gate, produkcijski build i `dist` provjeru;
4. postaviti privatni kljuc, key ID, `REPAIR_LOCAL_ENABLED=false` i
   `REPAIR_LOCAL_DISABLED=true`;
5. primijeniti odobrene migracije;
6. objaviti `repair-local-claim`, `repair-local-status` i `repair-docx`;
7. objaviti Netlify web i tocno provjereni runner artefakt;
8. postaviti `REPAIR_LOCAL_ENABLED=true`, dok kill switch ostaje `true`;
9. kao zadnju udaljenu promjenu postaviti `REPAIR_LOCAL_DISABLED=false`.

Ako korak 4 do 8 padne, lokalni popravak ostaje iskljucen. Ako zadnji korak
padne, `REPAIR_LOCAL_DISABLED=true` i dalje blokira izdavanje i claim. Release ne
pokusava prikriti parcijalni deployment automatskim rollbackom nepoznatog
stanja, nego prijavljuje posljednju dokazano dovrsenu fazu i potvrdu da kill
switch nije uklonjen.

Produkcijski deployment nije dio same implementacije ovog dizajna. Smije se
izvrsiti tek kada postoji stvarni trusted Authenticode certifikat i kada svi
postojeci promotion gateovi budu zadovoljeni.

## Lokalni korisnicki tok i nelicencirani Word

Ova promjena ne mijenja dogovoreni model rekonstrukcije:

- runner koristi Pure-DOCX motor kako aktivna Microsoft Word licenca ne bi bila
  uvjet popravka;
- izvorni korisnikov dokument ostaje nepromijenjen;
- rezultat je novi DOCX, vezan uz jedan placeni job i jedan claim;
- Word se smije koristiti za zavrsno otvaranje rezultata i fidelity oracle;
- runner ne smije globalno zatvarati Word niti dirati nepovezane dokumente;
- EXE se uklanja samo nakon potvrdenog uspjeha, a retry stanje ostaje dostupno
  kod oporavljive pogreske.

## Granice komponenti

### WordReplica

- Postojeci `src/word_replica/runner/trust_store.py` iz istih validiranih DER
  SPKI bajtova izravno izvlaci kanonski otisak, bez drugog parsera kljuceva i
  zasebne implementacije iste validacije.
- Build skripta koristi tu funkciju za trust store i manifest, bez paralelnog
  ponavljanja kriptografske logike u PowerShellu.
- Runner runtime i Repair Contract format ostaju nepromijenjeni.

### Lekta release gate

- Manifest parser poznaje iskljucivo v2 za ovaj release.
- Provjera privatnog kljuca vraca samo key ID i javni otisak, nikad privatne
  bajtove.
- Trust policy zahtijeva tri neovisna sidra: publisher thumbprint, pregledani
  WordReplica commit i javni contract key fingerprint. Pregledani artifact hash
  ostaje cetvrto sidro konkretnog EXE-a.

### Lekta release orchestrator

- Orchestrator upravlja fazama i kill switchem.
- Helper za tajne upravlja iskljucivo privremenom datotekom, dozvolama,
  redakcijom i cleanupom.
- Postojeci helper za staging runnera i postojeci izolirani migration workspace
  ostaju izvori istine za svoje odgovornosti.

## Obrada pogresaka

Release je fail-closed za ove slucajeve:

- manifest v1 ili manifest bez javnog otiska;
- otisak pogresnog formata;
- neispravan base64url ili PKCS#8 privatni kljuc;
- kljuc nije EC P-256;
- izvedeni javni otisak ne odgovara neovisnom ocekivanju ili manifestu;
- key ID se ne podudara;
- tajna se pojavljuje u planu ili uhvacenom izlazu;
- privremena datoteka nema zahtijevane dozvole;
- privremena datoteka ostane nakon uspjeha ili pogreske;
- funkcije ili web se pokusaju objaviti prije sigurnog disabled stanja;
- kill switch se pokusa ukloniti prije svih prethodnih faza.

Poruke pogreske navode fazu i javne identifikatore, ali ne sadrze privatni kljuc,
njegove bajtove ni privremenu putanju.

## TDD i verifikacija

Implementacija mora slijediti RED, najmanji fix, GREEN za svaki repozitorij.

### WordReplica RED testovi

- build manifest bez `contractPublicKeySha256` mora pasti;
- otisak mora biti hash DER SPKI oblika, ne PEM teksta;
- dva razlicita PEM zapisa istog kljuca moraju dati isti otisak;
- drugi javni kljuc mora dati drugi otisak;
- manifest mora imati `schemaVersion: 2`.

### Lekta RED testovi

- v1 manifest mora biti odbijen;
- nedostajuci ili neispravan ocekivani fingerprint mora biti odbijen;
- privatni kljuc koji ne odgovara manifestu mora biti odbijen prije udaljene
  naredbe;
- deployment plan mora dokazati disabled-first i kill-switch-last redoslijed;
- vrijednost privatnog kljuca ne smije se pojaviti u argumentima, planu, izlazu
  ni pogresci;
- privremena datoteka mora nestati nakon uspjeha i nakon simuliranog pada;
- pad bilo koje faze prije kraja ne smije pozvati uklanjanje kill switcha;
- tocno upareni P-256 kljuc i v2 manifest moraju proci.

### Zeleni gateovi

Nakon ciljanih testova moraju proci:

- WordReplica puni `pytest` suite;
- Lekta `npm run check`;
- Lekta `npm run orphan-scan`;
- produkcijski release preflight mora i dalje fail-closed pasti iskljucivo na
  nedostajucem trusted Authenticode certifikatu kada su svi testni identiteti
  ispravni;
- dva uzastopna stvarna Microsoft Word E2E FULL PASS prolaza na istim Lekta i
  WordReplica commitima;
- neovisni adversarijalni pregled sigurnosne granice prije commita produkcijskog
  koda.

Stvarni Golden izvorni DOCX ne smije se mijenjati. Word procesi koji nisu
dokazano vlasnistvo testa ne smiju se zatvarati.

## Ocekivane datoteke implementacije

WordReplica:

- `src/word_replica/runner/trust_store.py`;
- `BUILD_LEKTA_REPAIR_RUNNER.ps1`;
- `tests/unit/test_lekta_runner_trust_store.py`;
- `tests/unit/test_lekta_runner_release_build.py`.

Lekta:

- `scripts/local-repair-release-gate.mts`;
- `scripts/run-local-repair-release.mts`;
- novi `scripts/local-repair-secret-staging.mts`;
- `tests/repair-local-release-gate.test.ts`;
- `tests/repair-local-release-cli.test.ts`;
- novi `tests/repair-local-secret-staging.test.ts`;
- `docs/LOCAL_REPAIR_RELEASE.md` i povezani release env dokumentacijski testovi.

Nepovezani parser, citation, audit i UI moduli nisu u opsegu. Ako TDD otkrije
da jos jedna postojeca release test datoteka neposredno cuva izmijenjeni ugovor,
plan je smije ukljuciti, ali ne smije prosiriti produkcijski opseg izvan ovih
release i trust-store granica.

## Kriteriji prihvacanja

Promjena je gotova tek kada vrijedi sve sljedece:

1. runner manifest v2 kriptografski identificira ugradeni javni contract kljuc;
2. Lekta prije bilo koje udaljene promjene dokazuje da privatni kljuc, neovisni
   fingerprint i manifest opisuju isti P-256 par;
3. release automatski postavlja sve cetiri runtime vrijednosti bez otkrivanja
   tajni;
4. lokalni repair ostaje onemogucen do zadnjeg uspjesnog release koraka;
5. svaki parcijalni pad ostavlja kill switch ukljucen;
6. stari manifest, pogresan kljuc, pogresan commit, pogresan artefakt ili
   nepotpisani EXE prekidaju release;
7. Pure-DOCX i nelicencirani Word model ostaju netaknuti;
8. svi ciljani i puni gateovi prolaze;
9. dva stvarna Word E2E prolaza daju FULL PASS na istom paru commitova;
10. checkpointi su commitani i pushani samo na `automation-dev` i
    `feature/repair-contract-v1-current-v2`;
11. nema produkcijskog deploymenta ni promocije na `main` ili `master` bez
    zasebno zadovoljenog promotion gatea.

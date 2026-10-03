# Laya zlatni skup D1: priprema i označavanje

Zlatni skup je ono na čemu se mjeri prag i odlučuje GO ili NO-GO (`EVALUATION_PROTOCOL.md`). Bez njega
Laya nikad ne presuđuje: registar nema prag, pa je svaka presuda `calibration_missing`.

Alat je `npm run laya:zlatni` (`scripts/laya-zlatni-skup.mts`, logika u `scripts/laya/zlatni-skup.ts`).
Radi na radnoj stanici, bez modela. Sve datoteke ostaju u `.artifacts/laya/` (gitignored), jer
sadrže tekst zapisa. Na konzolu idu samo brojevi i imena datoteka.

## Koji radovi smiju ući

- `owned_synthetic`: radovi koje si sam napisao ili složio za testiranje.
- `explicitly_permitted`: radovi za koje imaš izričito dopuštenje za lokalnu obradu. `--permission-ref`
  je tvoja oznaka tog dopuštenja (npr. `narucitelj-2026-10-privola`), bez razmaka.
- Studentski radovi iz regresijskog korpusa ne ulaze automatski. Klijentski rad ulazi samo uz
  dopuštenje klijenta.

Svaki case nosi `trainingAllowed: false` i `externalInferenceAllowed: false`: skup služi samo lokalnoj
evaluaciji.

## 1. Kandidati

Stavi `.docx` radove u jednu mapu izvan klona, npr. `D:\laya\d1\radovi`. Uz rad može stajati
istoimeni `.json`:

```json
{ "profileId": "fpzg-politologija-zavrsni", "jezik": "hr", "izvor": "narucitelj-a", "predlozak": "fpzg-2025" }
```

- `profileId` je profil fakulteta; bez sidecara vrijedi `--profile`.
- `izvor` i `predlozak` nisu obvezni, ali su važni za pošten split. Radovi istog naručitelja ili
  istog Word predloška trebaju istu oznaku, jer tada nikad ne završe u oba splita. Bez oznake
  je rad sam svoja grupa.

```powershell
npm run laya:zlatni -- kandidati --dir D:\laya\d1\radovi --origin explicitly_permitted --permission-ref <ref> --profile <profileId>
```

Korak pada ako analiza ijednog rada ne uspije, ako `src/` ili `data/` imaju necommitane promjene
(engine revizija mora biti istinita) ili ako nijedan rad nema nepotpun zapis. Postojeći `oznake.csv`
ne prepisuje bez `--prepisi`.

## 2. Označavanje

Otvori `.artifacts\laya\oznake.csv` u Excelu. U stupac `oznaka` upiši jedno slovo:

| Oznaka | Značenje | Primjer |
|---|---|---|
| `S` | nalaz je stvaran: zapisu stvarno nedostaje autor, godina ili drugi obvezni element | `Kovač, B. Članak o medijima.` bez godine |
| `L` | nalaz je lažan: zapis je potpun za svoju vrstu izvora | zakon, presuda, institucija kao autor, `b.g.` |
| `E` | loše izvučeno: tekst nije jedan cijeli zapis | dva zapisa spojena u jedan, prekinut zapis, naslov popisa |
| `N` | iz samog teksta se ne može odlučiti | |
| prazno | nije označeno; ne ulazi u skup | |

Označavaj prema pravilu profila, ne prema tome što bi model rekao. Kad dvojiš između `S` i `L`,
upiši `N`: pravi nalaz proglašen lažnim je najskuplja pogreška i ne smije ući kao sigurna oznaka.
Stupac `napomena` je samo za tebe.

Ne mijenjaj stupce `br` i `kontrola`. Redove smiješ sortirati i filtrirati. Spremi kao
**CSV UTF-8**; zarez ili točka-zarez su oba u redu.

Cilj za prvi krug: 100 do 200 označenih zapisa iz što više različitih radova i predložaka, s
barem nekoliko desetaka `L` i `E`. Ako gotovo sve bude `S`, skup ne može pokazati koristi li Laya.

## 3. Sastavljanje

```powershell
npm run laya:zlatni -- sastavi --dataset-id d1-2026-10 --test-udio 0.3
```

Nastaju `d1-2026-10-calibration.json` i `d1-2026-10-test.json`. Split je po povezanim grupama
dokumenta, izvora i predloška: nijedna grupa nije u oba. Isti ulaz uvijek daje isti split. Korak
odbija nepoznatu oznaku, ponovljen `br`, kontrolu koja ne odgovara (pomaknuti redovi ili tuđi list)
i skup koji se ne može razdvojiti.

Ispis su samo brojevi po oznaci i splitu. Te brojeve smiješ poslati; datoteke ne.

## 4. Dalje

Kalibracija i test idu prema `EVALUATION_PROTOCOL.md`, odjeljak "Tijek":

```powershell
npm run laya:eval -- --gold .artifacts\laya\d1-2026-10-calibration.json --endpoint http://127.0.0.1:8765 --model-key <kljuc> --calibrate --min-accuracy 0.9 --out .artifacts\laya\cal-izvjestaj.json
```

# Integracija vanjskih alata (plan, 2026-09-27)

Plan kako vanjski open source alati mogu ojacati Lektine dokaze. Vecina ne ulazi u
aplikaciju nego u testove i release razine, jer Lekta za ZIP, pregled dokumenta i
sinteticki korpus vec ima vlastita, namjerno odabrana rjesenja.

Granica proizvoda vrijedi bez iznimke: nijedan alat ne pise ni ne mijenja sadrzaj rada,
samo pomaze provjeriti formu. Teski alati zive samo na radnoj stanici
(`docs/agents/RADNE_STANICE.md`).

## Zateceno stanje

| Podrucje | Danas | Izvor |
|---|---|---|
| ZIP citanje i pisanje | vlastiti kodek, bez ovisnosti; nepromijenjene dijelove prepisuje bajt po bajt; ZIP64 i sifrirani unosi odbijeni | `src/repair/zip-codec.ts` |
| Sinteticki `.docx` | rucno pisan XML kroz `writeZip`, radi stabilnih bajtova i citljivih diffova | `tests/helpers/synthetic-docx.ts` |
| Stvarni korpus | generira ga pravi Word i LibreOffice | `scripts/corpus-gen/` |
| Valjanost paketa | Tier 0 vlastiti skener; Tier 1 `strict-open.py` (dobro oblikovan XML i OPC graf); Tier 2 Word | `src/repair/package-integrity.ts`, `scripts/verify-docx/strict-open.py`, `scripts/word-verify/` |
| OOXML shema | ne provjerava se | nema |
| Idempotencija i vidljivi tekst | primjeri po fixeru, bez nasumicnih ulaza | `src/repair/idempotence-gaps.test.ts`, `src/repair/anchor-text.ts` |
| Citati | stilovi rucno kodirani; CSL samo kao ulazni format | `src/citations/`, `src/citations/import-references.ts` |
| Pregled prije i poslije | vlastiti faksimil i usporedba | `src/preview/`, `src/ui/repair-diff.ts` |
| Field renderer | Python worker, `soffice` po zahtjevu | `workers/field-renderer/app.py` |

## Odluke po alatu

| Alat | Licenca | Odluka | Razlog |
|---|---|---|---|
| [xarsh/ooxml-validator](https://github.com/xarsh/ooxml-validator) (Open XML SDK) | MIT | nova release razina, samo radna stanica | jedina rupa izmedju Tier 1 i Worda je shema |
| [dubzzz/fast-check](https://github.com/dubzzz/fast-check) | MIT | devDependency | kljucne invarijante danas nemaju nasumicne ulaze |
| [gildas-lormeau/zip.js](https://github.com/gildas-lormeau/zip.js) | BSD-3 | devDependency, samo neovisni kontrolor u testovima | vlastiti citac ne smije sam sebi biti jedini svjedok |
| [citation-js](https://github.com/citation-js/citation-js) | MIT | devDependency, samo skripta za zlatne ispise | neovisan izvor ocekivanih APA, Harvard i Chicago zapisa |
| [CSL styles](https://github.com/citation-style-language/styles) | CC BY-SA 3.0 | referenca, ne kopira se u repo | pravila se provjeravaju prema njima; `.csl` ne ide u bundle |
| [unoconv/unoserver](https://github.com/unoconv/unoserver) | MIT | kasnije, uz Docker | uklanja hladni start `soffice` po zahtjevu |
| fflate | MIT | ne uvoditi | zamjena kodeka ugrozila bi bajtnu vjernost; preglednik vec ima `CompressionStream` |
| docx-preview | Apache-2.0 | ne uvoditi | Lekta vec ima vlastiti pregled |
| docx (dolanmiu) | MIT | ne sada | korpus je namjerno rucni XML ili pravi Word i LibreOffice |
| Hyphenopoly | MIT | na cekanju | provjera razmaka u poravnatom tekstu trazi raspored redaka koji Lekta nema |
| citeproc-js, CERMINE | AGPL | nikad u bundle | licenca |

## Faze

Jedna faza je jedan PR. Svaki prolazi `npm run check` i `npm run orphan-scan`, s retcima
`Neto redaka` i `Nove ovisnosti`. Faze 2 i 3 diraju repair i docx testove, pa traze
adversarijalni pregled drugog alata prije commita.

### Faza 1: OOXML shema kao release razina

- Nova razina `ooxml-schema` u `scripts/release-tiers.mjs`, izmedju `strict-open` i Word razina.
- Pokrece validator nad popravljenim stvarnim korpusom. Validator dolazi s radne stanice, ne iz
  `package.json`, jer nosi .NET binarni program; bez njega razina javlja NEPOKRIVEN.
- Prije ukljucivanja se biljezi zateceno stanje: koliko fixtura danas prolazi i koliko pada.
  Postojeci pad je nalaz, ne razlog za slabljenje razine.
- Mutacija u `tests/gate-mutations.test.ts`: namjerno pokvaren `document.xml` mora oboriti razinu.
- Repair i docx kod se ne mijenjaju.

### Faza 2: svojstva s nasumicnim ulazima

- `fast-check` u devDependencies.
- Generator slaze nasumicne dokumente iz `tests/helpers/synthetic-docx.ts`: runove, stilove,
  naslove, tablice i fusnote. Prvo se dokazuje da generator doista proizvodi ciljane klase ulaza.
- Svojstva:
  1. vidljivi tekst je isti prije i poslije popravka;
  2. drugi prolaz popravka je no-op;
  3. nepromijenjeni dijelovi ZIP paketa ostaju bajtno identicni.
- CI koristi fiksno sjeme; radna stanica povremeno vrti dulji prolaz s nasumicnim sjemenom i
  svaki nadjeni kontraprimjer pretvara u trajni fixture.

### Faza 3: neovisni ZIP kontrolor

- `@zip.js/zip.js` u devDependencies, nikad u `src/`.
- Svaki paket koji `writeZip` napise test otvara zip.js-om i usporedjuje popis dijelova, CRC i
  sadrzaj.

### Faza 4: zlatni ispisi citata

- Skripta `scripts/citations/golden-csl.mts` iz CSL-JSON-a generira ocekivane zapise za APA 7,
  Harvard i Chicago; rezultat se commita kao fixture zajedno sa skriptom.
- citation-js ostaje samo u skripti, nikad u `src/`.
- Prvo golden koji biljezi zateceno ponasanje, kako trazi `src/citations/CLAUDE.md`.
- Izvor istine za pravila ostaju verificirani fakultetski profili; CSL ih samo potvrdjuje.

### Faza 5: field renderer na unoserveru (nakon Dockera)

- `soffice` po zahtjevu zamjenjuje trajni unoserver u istoj slici.
- Usporedba vremena i rezultata na istom skupu dokumenata; ishod mora biti bajtno ili
  semanticki jednak, inace se ne mijenja.

## Redoslijed

Faza 1 je najmanja i odmah daje novi dokaz, pa ide prva. Faze 2 i 3 slijede, jer stite
glavni ugovor o vidljivom tekstu. Faza 4 ovisi o kapacitetu za citate, a faza 5 o Dockeru
na radnoj stanici.

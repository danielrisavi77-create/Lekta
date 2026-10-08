# Integracija vanjskih alata (plan, 2026-09-27, dopunjeno 2026-10-08)

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
| [xarsh/ooxml-validator](https://github.com/xarsh/ooxml-validator) (Open XML SDK) | MIT | CI razina u `docx-strict-open.yml` kroz pinani `npx`; lokalno samo radna stanica (T106) | jedina rupa izmedju Tier 1 i Worda je shema; izmjereno 2026-10-08, vidi nize |
| [JSv4/Python-Redlines](https://github.com/JSv4/Python-Redlines) (Docxodus) | MIT | samo CI, pip pin (T107) | neovisni svjedok vidljivog teksta uz vlastitu usporedbu |
| [veraPDF](https://github.com/veraPDF) | GPL-3.0 ili MPL-2.0 | samo radna stanica, etalon (T109) | `src/pdf/pdf-preflight.ts` PDF/A provjerava heuristicki |
| basejump supabase_test_helpers | nije potvrdjeno | ne uvoditi | 0.0.6, oko 2 godine bez izdanja; globalni RLS gard je jedan upit (T108) |
| pa11y-ci | LGPL-3.0 | ne uvoditi | isto pokriva vec uvedeni axe |
| Unlighthouse | MIT | povremeno rucno, ne gate | Lighthouse nad svim javnim stranicama; sitemap vec postoji |
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

### Faza 1: OOXML shema kao CI i release razina (T106)

- Nova razina `ooxml-schema` u `scripts/release-tiers.mjs`, izmedju `strict-open` i Word razina.
- Pokrece validator nad popravljenim stvarnim korpusom. Validator ne ide u `package.json`, jer
  nosi samostalni binarni program od 79 MB po platformi (bez potrebe za .NET-om). U CI-ju ga
  `docx-strict-open.yml` poziva kroz pinani `npx @xarsh/ooxml-validator@0.4.0` nad izlazom
  `repair-real-corpus:review`; lokalno dolazi s radne stanice, a bez njega razina javlja NEPOKRIVEN.
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

### Faza 6: neovisni svjedok vidljivog teksta (T107)

- Python-Redlines s Docxodus enginom u `docx-strict-open.yml`, nakon Faze 1 jer dira isti workflow.
- Za svaki par original i popravak tvrdnja je 0 umetanja i 0 brisanja teksta; promjene
  oblikovanja su dopustene i ne broje se.
- Mutacije: promijenjena rijec i obican razmak zamijenjen neprelomivim moraju oboriti korak.
- Samo CI uz pip pin, nikad `package.json` ni `src/`. Isporuka redline dokumenta kupcu bila bi
  nova funkcija i zasebna odluka vlasnika.

### Faza 7: globalni RLS gard (T108)

- Nakon svih migracija svaka tablica u shemi `public` mora imati ukljucen RLS, a tablica bez
  ijedne politike mora biti na izricitom popisu namjerno zatvorenih tablica.
- Jedan upit nad `pg_class` u `db-smoke.yml` ili PGlite testu; basejump helperi nisu potrebni.
- Mutacija: migracija s tablicom bez RLS-a mora oboriti test. Nema `supabase db push`.

### Faza 8: veraPDF etalon (T109)

- Na radnoj stanici mjeri slaganje heuristike iz `src/pdf/pdf-preflight.ts` s veraPDF-om nad
  korpusom PDF-ova; nesuglasja postaju fixture.
- veraPDF nikad ne ulazi u proizvod ni `package.json`; bez njega skripta javlja NEPOKRIVEN.

## Mjerenje 2026-10-08

Izolirani klon na `986ff14`, bez izmjene koda. Ulaz: 26 fixtura iz `tests/fixtures/docx`
provucenih kroz popravak s fixerima koje Lekta sama odabire, plus 29 uzoraka tamnih
strukturnih fixera iz `scripts/emit-repair-samples.mjs` (K5, K6, K7).

| Provjera | Rezultat |
|---|---|
| ooxml-validator 0.4.0: nove greske sheme koje uvodi popravak | 0 od 26 popravaka, 0 od 29 tamnih uzoraka |
| ooxml-validator: zatecene greske u ulaznim fixturama | 8 gresaka u 5 fixtura: redoslijed u `sectPr` i `settings.xml`, reference na fusnote |
| ooxml-validator: podmetnut krivi redoslijed, nepoznat element, kriva enum vrijednost | sve tri uhvacene, kontrola prolazi; 29 s za 52 dokumenta |
| python-docx (Tier 1) nad istim podmetnutim greskama | sve tri prolaze neopazeno |
| Python-Redlines 1.0.0: umetnut ili obrisan tekst u 26 popravaka | 0 |
| Python-Redlines: podmetnuta promijenjena rijec, neprelomivi razmak, dodana crtica | sve tri uhvacene, kontrola prolazi; 0,3 do 2 s po dokumentu |

Zatecene greske fixtura su nalaz za ratchet Faze 1, ne razlog za slabljenje razine.
Mjerenje nad stvarnim korpusom iz CI-ja je prvi korak T106.

## Redoslijed

Faza 1 je najmanja i odmah daje novi dokaz, pa ide prva; Faza 6 slijedi odmah iza nje jer dijeli
workflow. Faze 2 i 3 stite glavni ugovor o vidljivom tekstu (Faza 2 je T96). Faza 7 je neovisna i
moze ici paralelno. Faza 4 ovisi o kapacitetu za citate, Faza 5 o Dockeru na radnoj stanici, a
Faza 8 o korpusu PDF-ova na radnoj stanici.

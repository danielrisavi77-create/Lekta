# Lekta Training Pipeline

Siguran batch pipeline za inventarizaciju PDF/DOCX radova, ekstrakciju, privremenu
PDF u DOCX konverziju, postojeću Lekta analizu, anonimizaciju i izradu preglednog
skupa primjera grešaka.

## Što pipeline stvarno radi

1. klonira samo repozitorije navedene u `source-repositories.json`;
2. u inventory modu zapisuje samo metapodatke i hash datoteka;
3. u build modu prihvaća samo izvore s pravima `owned`, `licensed`, `consented`
   ili `public-domain`;
4. izvlači tekst iz PDF/DOCX datoteka;
5. po želji izrađuje privremenu DOCX radnu kopiju tekstualnog PDF-a;
6. pokreće postojeći Lekta DOCX analizator;
7. rekurzivno anonimizira tekstualne rezultate;
8. stvara `error-dataset.pending.jsonl` za ljudsku provjeru;
9. gradi lokalnu FTS bazu samo iz zapisa označenih s `reviewStatus: approved`.

Pipeline ne proglašava studentske radove izvorom fakultetskih pravila i ne trenira
model automatski na neprovjerenim primjerima.

## Prvo lokalno pokretanje

```bash
python -m pip install -r training-pipeline/requirements.txt
npm ci
python -m unittest discover -s training-pipeline/tests -p 'test_*.py'
python training-pipeline/run_pipeline.py \
  --roots ../repozitorij-1 ../repozitorij-2 \
  --mode inventory
```

Rezultat inventara je `training-pipeline/output/sanitized/summary.json` i
`documents.jsonl`. Lokalni putovi i sirove datoteke nisu dio sanitiziranog izlaza.

## Prijelaz u build način

Nakon pregleda inventara u `source-repositories.json` promijeni `rights` samo za
repozitorije za koje postoji stvarna osnova korištenja. Dopuštene vrijednosti su:

- `owned`
- `licensed`
- `consented`
- `public-domain`
- `lawful-access-tdm` (zakonit javni pristup bez pronađenog pridržaja prava za TDM)

Za `lawful-access-tdm` konfiguracija mora sadržavati `rightsBasis` s potvrdom javnog
pristupa, rezultatom provjere pridržaja TDM prava, potvrditeljem i datumom. Taj status
ne tvrdi da je djelo licencirano niti prenosi autorsko pravo.

Ako je radna kopija u privatnom repozitoriju, a izvorni dokumenti su zakonito javno
dostupni, postavi `rightsBasis.accessScope` na `source-documents`. Vidljivost radne
kopije tada nije dokaz ni javnog pristupa izvorniku ni vlasništva nad dokumentom.

Zatim pokreni:

```bash
python training-pipeline/run_pipeline.py \
  --roots ../odobreni-repozitorij \
  --mode build \
  --profile fpzg-politologija-diplomski \
  --max-documents 10 \
  --convert-pdf
```

Build ima tvrdi limit od najviše 10 dokumenata po pokretanju. Inventory uvijek
obuhvaća sve pronađene dokumente, ali ne izvlači njihov sadržaj prije potvrde prava.

PDF u DOCX konverzija služi kao radni ulaz parseru. Izvorni PDF ostaje mjerodavan za
vizualni raspored jer konverzija može promijeniti prijelome, fusnote i tablice.

## Ljudski pregled i baza znanja

Pregledaj `error-dataset.pending.jsonl`. Ispravi kategoriju, objašnjenje i korekciju,
pa potvrđene zapise označi s `reviewStatus: approved`. Nakon toga:

```bash
python training-pipeline/scripts/build_knowledge_base.py \
  --input training-pipeline/output/sanitized/error-dataset.reviewed.jsonl \
  --output training-pipeline/output/private/lekta-errors.sqlite
```

## GitHub Actions

Workflow `Lekta training pipeline` pokreće se ručno iz kartice Actions. Za privatne
repozitorije dodaj repository secret `LEKTA_REPOS_TOKEN` s read-only pristupom samo
odabranim repozitorijima. Prvo koristi `inventory`. Upload sanitiziranog artefakta je
isključen po zadanim postavkama i retencija je sedam dana kada ga uključiš.

## Sigurnosne granice

- `training-pipeline/output/` i klonirani izvori nikad se ne commitaju;
- raw analiza postoji samo u `.private/` tijekom lokalnog ili ephemeral CI rada;
- anonimizacija je prvi filtar, ne jamstvo;
- prije modela je obvezna ljudska provjera;
- službena pravila dolaze isključivo iz verificiranih izvora u `data/**`;
- korisnički uploadovi se ne uključuju bez zasebne, izričite privole.

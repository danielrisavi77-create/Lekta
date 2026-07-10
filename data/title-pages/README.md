# Predlosci naslovnice (generator-content sloj)

Ovaj direktorij je AUTORSKI sadrzaj generatora naslovnice (alat naslovnica.html),
po uzoru na data/tools/citation-configs.json. NIJE izvor bodovanih pravila:
audit polja profila (titlePageRequirements, titlePageSequence, titlePageTypography)
ostaju odvojena i ureduju se svojim tokom (Option A, ruleEntries).

## Datoteke

- `templates.json` - niz TitlePageTemplate zapisa (vidi src/title-pages/template-schema.ts).
  Puni se ISKLJUCIVO stvarnim sadrzajem: sluzbeni izvori (pravilnici, upute, sluzbeni
  predlosci) ili konsenzus prvih stranica javnih radova. Prazan niz znaci da svi
  fakulteti koriste genericki raspored iz koda.
- `evidence/<unitId>.json` - redigirani dokazi iz prvih stranica javnih teza
  (redoslijed elemenata, tipografija, poravnanje). Identitet uzorka je PID.

## Hijerarhija autoriteta

1. `official-template` - fakultet objavljuje vlastiti predlozak naslovnice (prilog uputa).
2. `official-rules` - pravilnik ili upute tekstualno propisuju elemente/tipografiju.
3. `thesis-consensus` - konsenzus prvih stranica javnih radova; smije POPUNITI rupe,
   nikad ne postavlja `required: true` niti pregazuje sluzbeni izvor.

`provenance.status` na razini predloska: `official` (bar jedan sluzbeni izvor) ili
`derived` (samo konsenzus teza). Genericki raspored NE postoji u podacima: odsutnost
predloska znaci postojecu genericku granu koda (regresijska sigurnost je strukturalna).

## GDPR pravilo za evidence

`redactedText` smije biti ne-null SAMO za uloge university, faculty, study, worktype,
placeyear (genericki institucijski tekst). Za author, mentor, comentor, title i unknown
uvijek je null (naslov je neizravno identificirajuci). JMBAG i e-mail se scrubaju prije
zapisa. Sirovi PDF-ovi i PNG renderi zive u gitignoriranom artifacts/title-harvest/ i
ne commitaju se. Test tests/title-page-loader.test.ts provodi ova pravila.

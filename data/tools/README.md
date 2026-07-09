# data/tools/citation-configs.json

## Namjerna odluka, odstupanje od SEO_FREE_TOOLS.md

Spec (sekcija 3) predlaze citanje direktno iz `data/profiles/verified-profiles.json`.
Ovaj generator umjesto toga cita iz ZASEBNE datoteke, `citation-configs.json`.

Razlog: `verified-profiles.json` je interni format za analizator (ruleEntries,
effectiveRules, checkId mapiranja), oblikovan za strojnu provjeru dokumenta, ne
za renderiranje formulara i predlozaka javnog alata. Prisiljavanje javnog
generatora da parsira interni engine format stvara krhku spregu: promjena u
analizatoru bi mogla tiho pokvariti javnu stranicu. Ova datoteka je namjerno
odvojen, jednostavniji "content" sloj, autoriran RUCNO za svaki fakultet tek
NAKON sto je citatno pravilo vec verificirano u glavnom sustavu (`sourceId` dolje
referencira isti izvor kao u glavnom sustavu, ali sama datoteka ne uvozi
`verified-profiles.json` programski).

Ako se kasnije pokaze vrijednim automatski izvoditi ovu datoteku iz glavnog
registra pravila, to je buduci korak (mapping skripta), ne danasnja
pretpostavka.

## Prazan pocetak, namjerno

Datoteka pocinje kao `[]`. NE popunjavaj je primjerima ili pretpostavljenim
formatima. Isto nacelo kao `VERIFICATION_PIPELINE.md`: dok stil citiranja nije
STVARNO potvrden protiv sluzbenog izvora tog fakulteta, unos ne postoji.

## Shema po unosu

```json
{
  "facultyId": "fpzg",
  "facultyName": "Fakultet politickih znanosti (FPZG)",
  "citationStyleName": "FPZG autor-godina stil",
  "status": "verified",
  "sourceId": "fpzg-upute-2024",
  "sourceLabel": "Upute za izradu zavrsnog/diplomskog rada FPZG",
  "verifiedAt": "2026-07-01",
  "sourceTypes": [
    {
      "type": "book",
      "label": "Knjiga",
      "fields": [
        { "key": "author", "label": "Autor (Prezime, Ime)", "required": true },
        { "key": "year", "label": "Godina", "required": true },
        { "key": "title", "label": "Naslov", "required": true },
        { "key": "publisher", "label": "Izdavac", "required": false },
        { "key": "place", "label": "Mjesto izdanja", "required": false }
      ],
      "template": "{author} ({year}). {title}. {place}: {publisher}."
    },
    {
      "type": "article",
      "label": "Clanak",
      "fields": [
        { "key": "author", "label": "Autor", "required": true },
        { "key": "year", "label": "Godina", "required": true },
        { "key": "title", "label": "Naslov clanka", "required": true },
        { "key": "journal", "label": "Casopis", "required": true },
        { "key": "volume", "label": "Broj/svezak", "required": false },
        { "key": "pages", "label": "Stranice", "required": false }
      ],
      "template": "{author} ({year}). {title}. {journal}, {volume}, {pages}."
    },
    {
      "type": "web",
      "label": "Web stranica",
      "fields": [
        { "key": "author", "label": "Autor ili institucija", "required": true },
        { "key": "year", "label": "Godina", "required": false },
        { "key": "title", "label": "Naslov stranice", "required": true },
        { "key": "url", "label": "URL", "required": true },
        { "key": "accessedDate", "label": "Datum pristupa", "required": true }
      ],
      "template": "{author} ({year}). {title}. Dostupno na: {url} (pristupljeno {accessedDate})."
    }
  ]
}
```

- `status`: MORA biti `"verified"` da bi generator uopce razmotrio unos. Bilo koja
  druga vrijednost (ili nedostatak polja) se PRESKACE uz upozorenje, ne koristi se.
- `template`: `{polje}` placeholderi se zamjenjuju vrijednostima iz forme.
  Prazna polja se cisto uklone (vidi `src/tools/format-citation.js`), ne ostavljaju
  prazne zagrade ni dvostruke tocke.
- Vrste izvora (`book`, `article`, `web`, `law`) su primjer, ne fiksni popis;
  dodaj sto je stvarno potrebno za taj fakultet.

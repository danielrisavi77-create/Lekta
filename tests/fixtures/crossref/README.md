# Crossref works snimke (T98 korak 0, issue #219)

Stvarni odgovori Crossref REST API-ja, snimljeni na radnoj stanici
**2026-10-04T16:05:24Z** (`capture.capturedAt` u svakoj datoteci). Sluze kao ulaz za
korake 1 i dalje (golden zatecenog ponasanja, `retractionFromWork`); ovaj commit ne dira
`src/citations`.

## Oblik datoteke

```json
{ "capture": { "url", "capturedAt", "status", "contentType", "removedFields", "note" },
  "response": <tijelo odgovora> }
```

Jedina izmjena tijela: iz `message` (ili iz svake stavke `message.items`) uklonjena su polja
`author`, `editor` i `reference` (osobna imena i veliki popisi literature); popis uklonjenih
polja je u `capture.removedFields`. Sve ostalo je doslovno kako je API vratio. Zahtjev je slan
bez `mailto` i bez kljuca (javni bazen).

## Slucajevi

| datoteka | DOI | URL upita | status | sto pokazuje |
|---|---|---|---|---|
| `retracted-rw-and-publisher.json` | 10.1177/1758835919874651 | https://api.crossref.org/works/10.1177%2F1758835919874651 | 200 | povucen rad; `updated-by` ima dvije stavke `retraction`: `source: retraction-watch` (s `record-id`) i `source: publisher` |
| `retracted-rw-only.json` | 10.1538/expanim.54.1 | https://api.crossref.org/works/10.1538%2Fexpanim.54.1 | 200 | povucen rad; `updated-by` samo `retraction-watch` |
| `retracted-self-notice.json` | 10.1007/s12652-021-02990-8 | https://api.crossref.org/works/10.1007%2Fs12652-021-02990-8 | 200 | "RETRACTED ARTICLE": isti zapis nosi i `update-to` i `updated-by`, oba pokazuju na vlastiti DOI |
| `retraction-notice.json` | 10.1177/17588359211061903 | https://api.crossref.org/works/10.1177%2F17588359211061903 | 200 | obavijest o povlacenju: ima `update-to`, nema `updated-by` |
| `corrected.json` | 10.1088/1361-6595/aaebdb | https://api.crossref.org/works/10.1088%2F1361-6595%2Faaebdb | 200 | rad s ispravkom: `updated-by` tip `correction` (nije povlacenje) |
| `correction-notice.json` | 10.1088/1361-6595/ab245f | https://api.crossref.org/works/10.1088%2F1361-6595%2Fab245f | 200 | obavijest o ispravku: `update-to` tip `correction` |
| `plain.json` | 10.1038/nature14539 | https://api.crossref.org/works/10.1038%2Fnature14539 | 200 | obican rad, nema ni `update-to` ni `updated-by` |
| `not-found.json` | 10.9999/lekta-t98-ne-postoji | https://api.crossref.org/works/10.9999%2Flekta-t98-ne-postoji | 404 | nepostojeci DOI; tijelo je `text/plain` "Resource not found." (nije JSON) |
| `select-updated-by.json` | (bibliografski upit) | URL je u `capture.url` | 200 | `select=title,author,issued,DOI,updated-by` je prihvacen; od 2 stavke 1 nosi `updated-by` |

## Opazanja za korak 1 i dalje

- `updated-by` stize na zapisu povucenog rada; obavijest nosi samo `update-to`. Citati
  iskljucivo `updated-by` (issue #219, korak 2) razlikuje rad od obavijesti.
- Zapis "RETRACTED ARTICLE" moze nositi oba polja koja pokazuju sam na sebe; i to je povucen rad.
- Isto povlacenje moze doci dvaput (`retraction-watch` i `publisher`) s istim DOI-jem obavijesti.
- 404 tijelo nije JSON; parser ne smije pretpostaviti `JSON.parse` na ne-200 odgovoru.

## Uvjeti koristenja

Crossref dokumentacija (https://www.crossref.org/documentation/retrieve-metadata/retraction-watch/)
i README skupa podataka (https://gitlab.com/crossref/retraction-watch-data) kazu da je baza
"publicly available"; na tim dvjema stranicama izricita licenca nije navedena (provjereno
2026-10-04). Ovdje se ne tvrdi vise od toga.

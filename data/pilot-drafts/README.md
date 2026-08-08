# Nacrti pravila iz pilota (izvor za port, NISU sami po sebi zivi)

Ovdje je nusprodukt pilota od 2026-08-04: 116 nacrta asistiranih pravila za pet ustanova
(unizd, ffzg, ffri, efzg, pmf), izvedenih iz vec snapshotiranih sluzbenih uputa u
`data/sources/<unitId>/`.

## Zasto NISU u `data/profiles/<unit>/drafts/`

Ondje ih `src/profiles/drafts-runtime.ts` ucitava preko `import.meta.glob`, pa bi odmah usli u
sustav i pomaknuli coverage (drift guard u `tests/coverage-report.test.ts` to je i uhvatio).
Nacrt smije preci u profile SAMO kroz `scripts/port-verified-drafts.py`, koji propusta jedino ono
sto prodje obje strojne provjere (vidi nize).

## Izmjerena kvaliteta (2026-08-08)

Prva procjena je bila agentska, nad uzorkom od 10 nacrta (uvijek prva dva po ustanovi), i dala je
"svih 10 odbaceno". Ta brojka je bila POGRESNA jer je uzorak bio premalen i pristran. Puna strojna
provjera nad svih 106 nacrta s citatom daje bitno drukciju sliku:

| provjera | alat | ishod |
|---|---|---|
| stoji li citat doslovno u izvoru | `scripts/verify-draft-quotes.py` | 57 doslovno, 12 uz drugu interpunkciju, 30 ne stoji, 7 bez izvora/necitljivo |
| slijedi li vrijednost iz citata | `scripts/verify-draft-values.py` | 60 od tih 69 ima uporiste, 9 nema |

Dakle **doslovno 54%**, **vjerno izvoru 65%**, a od toga **60 nacrta ima i uporistenu vrijednost**.
Da smo vjerovali uzorku, bacili bismo 69 upotrebljivih nacrta.

Provjeri vrijednosti se smije vjerovati zato sto joj je osjetljivost izmjerena negativnom kontrolom
(svaka uporistena tvrdnja se izokrene u suprotnu): odbija **98%** pokvarenih vrijednosti.

## Sto je preneseno, a sto nije

`scripts/port-verified-drafts.py` je prenio **47 pravila u 17 profila** (unizd, ffzg, ffri), svako sa
`status: 'advisory'` i `scored: false`. Pet citata je pritom prepisano DOSLOVNO iz izvora, jer su
upute nabrajale natuknicama a nacrt je to prepisao zarezima.

Nije preneseno i zasto:

- 30 nacrta: citat ne stoji u izvoru,
- 9 nacrta: vrijednost ne slijedi iz citata (npr. njemacke upute traze KRONOLOSKI redoslijed radova
  istog autora, a nacrt je iz toga izveo slovcane sufikse a, b, c; dvije ustanove traze popise
  tablica i slika kojih u izvoru nema; tri nacrta uvode engleske natpise Abstract/Keywords/Summary
  iako izvor propisuje samo "sazetak na engleskom jeziku"),
- 7 nacrta: izvor nedostupan ili necitljiv,
- 6 nacrta: ustanova (efzg, dio ffzg) nema odredisnu datoteku profila,
- 5 nacrta: citat vjeran izvoru, ali se ne da strojno prepisati doslovno (trazi rucni prepis),
- ostatak: profil vec ima pravilo za taj checkId.

**pmf je ispao u cijelosti**: nijedan nacrt nije prosao provjeru citata.

## Zasto `advisory`, a ne `verified`

Sve pet ustanova ima izricitu ogradu u vlastitim uputama, npr. "Predstavljaju samo jednu od vise
mogucnosti" (unizd), "Ova je brosura koncipirana kao podsjetnik i prirucni savjetnik" (ffri),
"Preporucuje se ... harvardskim stilom" (efzg). Takvo pravilo se smije NUDITI, ali se ne smije
bodovati: bodovanje po izvoru koji sam sebe zove preporukom bilo bi izmisljanje pravila.

`advisory` + `scored: false` je zato konacan status za ovaj materijal, ne privremen. Prijelaz na
`verified` + `scored: true` trazi ljudski pass I sluzben izvor koji obvezuje; strojne provjere ga ne
mogu zamijeniti jer ne znaju je li formulacija obvezujuca ni odnosi li se na pravu vrstu rada.

Sto je jos otvoreno: `bibliography-rules.sort` ne moze izraziti "grupiraj po vrsti izvora (knjige,
clanci, propisi, mrezni izvori) pa tek onda abecedno", sto vise uputa trazi.

Vidi i `docs/REAL_CORPUS_TESTING.md` i granicu u `CLAUDE.md` ("Dopusteno bez fakultetskog
pravila (preporuke)").

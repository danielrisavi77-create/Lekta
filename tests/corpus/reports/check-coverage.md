# Lekta Error Corpus - coverage (auto-generirano)

> Krizanje inventara provjera (faza 1) s korpusnim slucajevima. Ne lazira 100%: sve nepokriveno je u gap-backlogu.

## Sazetak

- Provjere ukupno: **71** (bodovane 54)
- Bodovane s fail-slucajem (atomic ili boundary): **42/54 (78%)**
- Bodovane s atomskim fail-slucajem: **41/54 (76%)**
- Provjere s valid-controlom: **6**
- Provjere s boundary testom: **4**
- Korpusni slucajevi: atomic **43**, valid **7**, boundary **14**
- Intake kodovi (svi runtime-dokazani u fazi 1): **6**

## Pokrivenost po provjeri

| checkId | Naslov | Kat. | Bod. | Atomic | Valid | Boundary |
|---|---|---|---|:---:|:---:|:---:|
| reference.alphabetical | Abecedni poredak literature | citations | da | ✓ | · | · |
| citation.style-automation | Automatizacija citatnog stila | citations | da | · | · | · |
| citation.author-year.missing-reference | Citirano → literatura | citations | da | ✓ | ✓ | · |
| reference.access-date | Datumi pristupa mrežnim izvorima | citations | da | ✓ | · | · |
| citation.punctuation | Dosljednost interpunkcije citatnica | citations | da | · | · | · |
| legal.footnote-bibliography | Fusnote ↔ bibliografija | citations | da | ✓ | · | · |
| citation.author-year.suffix | Isti autor i godina (a/b/c) | citations | da | ✓ | · | · |
| legal.source-classification | Klasifikacija pravnih izvora | citations | da | ✓ | · | · |
| legal.id-abbrev | Kratica id. u istoj bilješci | citations | info | · | · | · |
| reference.uncited | Literatura → citirano | citations | da | ✓ | · | · |
| citation.direct-quote-locator | Lokator uz izravne citate | citations | da | ✓ | · | · |
| reference.min-count | Minimalan broj izvora profila | citations | da | ✓ | · | · |
| legal.opcit | op. cit. → prvo navođenje | citations | da | ✓ | · | · |
| reference.completeness | Potpunost bibliografskih zapisa | citations | da | ✓ | · | · |
| legal.first-citation-completeness | Potpunost prvog navođenja | citations | da | ✓ | · | · |
| legal.footnotes-present | Pravne fusnote | citations | da | ✓ | · | · |
| citation.recognized | Prepoznate citatnice | citations | da | ✓ | · | · |
| legal.act-abbrev | Propisi i uvedene kratice | citations | info | ✓ | ✓ | · |
| legal.ibid | Slijed Ibid. | citations | da | ✓ | ✓ | · |
| legal.case-law | Sudska praksa | citations | info | ✓ | · | · |
| element.source | Izvori ispod slika i tablica | elements | da | ✓ | · | · |
| element.figure.caption | Naslovi slika i grafikona | elements | da | ✓ | · | · |
| element.table.caption | Naslovi tablica | elements | da | ✓ | · | · |
| element.link-form | Oblik poveznica | elements | da | ✓ | ✓ | · |
| element.lists | Popisi slika i tablica | elements | da | ✓ | · | · |
| element.empty-paragraphs | Prazni odlomci | elements | info | · | · | · |
| footnote.present | Automatske fusnote | formatting | da | ✓ | · | · |
| format.font.dominant | Dominantni font | formatting | da | ✓ | ✓ | · |
| page.size.project | Format stranice (A3/A0) | formatting | da | ✓ | · | · |
| page.size.a4 | Format stranice A4 | formatting | da | ✓ | · | · |
| page.margins | Margine dokumenta | formatting | da | · | · | ✓ |
| footnote.format | Oblikovanje fusnota | formatting | da | · | · | · |
| footnote.marker | Položaj i stil oznaka fusnota | formatting | da | · | · | · |
| format.justify.body | Poravnanje osnovnog teksta | formatting | da | ✓ | · | · |
| format.spacing.body | Prored osnovnog teksta | formatting | da | ✓ | · | ✓ |
| footnote.spacing | Razmak prije i poslije fusnota | formatting | da | · | · | · |
| format.spacing.paragraph | Razmak prije i poslije odlomka | formatting | da | · | · | · |
| format.size.body | Veličina osnovnog teksta | formatting | da | ✓ | ✓ | ✓ |
| structure.chapters.count | Broj glavnih poglavlja | structure | din | · | · | · |
| page.numbers.present | Brojevi stranica | structure | da | ✓ | · | · |
| toc.page-numbers | Brojevi stranica u sadržaju | structure | da | · | · | · |
| toc.field | Detalji automatskog sadržaja | structure | din | · | · | · |
| structure.sections.profile | Dijelovi verificiranog profila | structure | da | ✓ | · | · |
| structure.heading.depth | Dubina decimalnog numeriranja | structure | da | ✓ | · | · |
| title.elements | Elementi naslovne stranice | structure | da | ✓ | · | · |
| method.ethics | Etički aspekti empirijskog istraživanja | structure | din | · | · | · |
| toc.format | Font i veličina sadržaja | structure | da | · | · | · |
| structure.heading.hierarchy | Hijerarhija naslova | structure | da | · | · | · |
| structure.keywords | Ključne riječi u samom radu | structure | da | ✓ | · | · |
| method.variant | Metodološka varijanta rada | structure | din | · | · | · |
| toc.coverage | Naslovi dokumenta ↔ sadržaj | structure | da | · | · | · |
| page.numbers.title-suppressed | Naslovnica bez broja stranice | structure | info | · | · | · |
| structure.heading.numbering | Numeriranje naslova | structure | da | ✓ | · | · |
| page.numbers.start | Numeriranje od prve stranice Uvoda | structure | info | · | · | · |
| structure.heading.format | Oblikovanje naslova po razinama | structure | da | ✓ | · | · |
| scope.intro-conclusion-ratio | Omjer Uvoda i Zaključka | structure | da | ✓ | · | · |
| scope.cards | Opseg u autorskim karticama | structure | din | · | · | · |
| scope.pages | Opseg u stranicama | structure | info | · | · | · |
| structure.sections.basic | Osnovni dijelovi rada | structure | da | ✓ | · | · |
| page.numbers.position | Položaj broja stranice | structure | info | · | · | · |
| structure.heading.align | Poravnanje naslova slijeva | structure | da | ✓ | · | · |
| scope.words | Profilni opseg riječi | structure | da | ✓ | · | ✓ |
| title.layout | Raspored naslovne stranice | structure | info | · | · | · |
| title.order | Redoslijed elemenata naslovnice | structure | info | · | · | · |
| toc.present | Sadržaj dokumenta | structure | da | ✓ | · | · |
| structure.abstract | Sažeci u samom radu | structure | da | ✓ | · | · |
| page.numbers.scheme | Shema numeriranja stranica | structure | da | · | · | · |
| method.structure | Struktura metodološkog profila | structure | din | · | · | · |
| title.typography | Tipografija korica i naslovnice | structure | info | · | · | · |
| structure.heading.word-styles | Uporaba Word stilova naslova | structure | da | ✓ | · | · |
| manual.checks | Zahtjevi za ručnu završnu provjeru | structure | da | · | · | · |

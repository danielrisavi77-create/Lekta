# Granica podatkovnog adaptera (PR #102)

Ovaj popravak zatvara dva reproducirana nalaza nad `3189609`: sparse `records`
niz mogao je dati `[null]`, a getter na polju zapisa izvrsavao se prije validacije.
Opseg ostaje Paket 1. Nema modela, treniranja, mreze, izmjene ocjene ili popravka.

## Ulaz prije projekcije

`buildDecisionCases` prima podatkovni snapshot od pouzdanog in-process pozivatelja.
Prije citanja svakog potrebnog polja provjerava vlastiti descriptor: polje mora
biti enumerable data-property, ne getter, setter ili naslijedjena vrijednost.
Kontejneri moraju biti obicni objekti s Object.prototype ili null prototipom.
To vrijedi za snapshot, profil, result, pojedinu provjeru i pojedini zapis.
Postojeci validator nastavlja provjeravati vrijednosti, dokaz pravila i dozvole.

Provjere i zapisi dolaze u obicnim gustim nizovima. Svaki indeks mora postojati
kao vlastiti enumerable data-property. Sparse niz, accessor na indeksu, custom
prototype ili dodatna svojstva niza odbijaju se s DecisionContractError.
Prazni dopusteni nizovi ostaju valjani, a limit records ostaje 1000. Broj vlastitih
kljuceva provjerava se prije prolaska kroz indekse da ogromna sparse duljina ne
pokrene ogromnu petlju. Ne pozivaju se ulazne map/filter metode ni iterator.

Adapter ne prolazi kroz score, issues, details.triage, recipe ili originalne
bajtove. Getteri na tim nekonzumiranim svojstvima ne izvrsavaju se. Podaci se ne
serijaliziraju niti kopiraju u cijelosti prije dopustenja i validacije.
Izlaz ostaje odvojena kopija pod postojecim strogim DecisionCase ugovorom.

Ovo nije sandbox za proizvoljan JavaScript. Izvrsivi Proxy objekti i izmijenjeni
ugradjeni JS primitivi nisu podrzani ulazi pouzdanog pozivatelja. Deskriptorska
provjera sama ne dokazuje istinitost pravila ni dozvole. Studentski tekst ne
pretvaramo u JavaScript i ne uvodimo nove produkcijske ovlasti.

## Regresijski dokaz

`tests/helpers/laya-boundary-cases.ts` dodaje 40 provjera. Oba postojeca runnera
(Vitest adapter suite i Node standalone) izvrsavaju iste nove provjere uz starih
54. Pokriveni su svaki citani nivo, oba niza, pocetna/zavrsna rupa, naslijedjeni
indeks, accessor metode, setter-only polje, ne-enumerable polja, null zapis,
null-prototype objekti, nekonzumirani rezultat i granica 1000/1001 zapisa.

Nad izvornim adapterom: 94 ukupno, 61 prolazi, 33 padaju. Nad popravkom: 94/94.
Uklanjanje descriptor provjere zasebno uzrokuje 22 pada; uklanjanje dense-niza
provjere zasebno uzrokuje 13 padova. To su testovi softverskog ugovora, ne ML
mjerenja ni zamjena za puni repo gate.

```bash
npm run check:laya
npm run test:laya
npm run check
npm run orphan-scan
# Uska offline dijagnostika (Node >=22.6):
node --experimental-strip-types --test tests/laya-standalone.mts
```

Za odluku o spajanju vrijede CI dokazi NOVOG commita i zaseban pregled. Zeleni CI
starog heada ne dokazuje popravak. Povremeni WebKit nalaz #103 nije dio ove izmjene
niti ga uspjesno ponavljanje testa automatski zatvara.

## Dopuna nakon neovisnog pregleda 2026-09-26

`informational` se sada uvijek suzdrzava. Case i result nose obvezni `inputDigest` (SHA-256 identiteta, audita i modelInputa), pa se stari odgovor odbija nakon promjene teksta, pravila ili revizije motora. Metapodaci se validiraju i za prazan batch; policy-abstain mora zadrzati isti razlog, `model=null` i `inputTokens=0`. Ocito predug UTF-16 tekst odbija se prije Unicode iteriranja. Dodatne regresije pokrivaju mutante iz Claude pregleda, a `check:laya` typechecka i `tests/helpers/laya-*.ts`.

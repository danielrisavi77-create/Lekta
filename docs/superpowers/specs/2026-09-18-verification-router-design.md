# Verification Router

Datum: 2026-09-18

Status: odobren dizajn

## Problem

Lekta ima velik broj kvalitetnih provjera, ali izbor potrebnih provjera danas
ovisi o tome zna li agent ili autor promjene sva domenska pravila. To proizvodi
dva rizika: preskakanje potrebnog gatea i lazno zelen rezultat za promjenu koju
sustav nije znao klasificirati.

Verification Router uvodi jedan lokalni ulaz koji cita stvarne Git promjene,
odreduje pogodene domene, sastavlja skup obveznih gateova, izvrsava ih i ostavlja
strojno citljiv dokaz.

Glavna naredba bit ce:

```bash
npm run verify:change
npm run verify:change -- --base origin/master
```

## Ciljevi

- Automatski odabrati gateove iz promijenjenih putanja.
- Sacuvati postojeci tvrdi minimum `check` i `orphan-scan` za svaku promjenu.
- Spojiti gateove kada jedna promjena pogada vise domena.
- Razlikovati automatski prolaz, automatski pad i potrebu za ljudskom radnjom.
- Za nepoznatu putanju uvijek zatvoriti prolaz i zahtijevati covjeka.
- Ostaviti JSON izvjestaj vezan uz konkretan base, HEAD i radno stablo.
- Omoguciti testiranje izbora i izvrsavanja bez pokretanja skupih vanjskih alata.

## Nije cilj

- Zamijeniti same domenske provjere.
- Automatski izvrsavati deploy ili mijenjati Supabase stanje.
- Pretvarati `projection-freshness` screening u presudu o sadrzaju.
- Proglasiti nedostupan Word, bazu ili okolinu prolaznim stanjem.
- Automatski potvrditi vizualni ili adversarijalni pregled.

## Odabrani pristup

Koristi se podatkovno vodena konfiguracija. `config/verification-map.json`
sadrzi registry gateova, njihove naredbe i pravila putanja. Skripte ostaju
genericke i ne sadrze domensku politiku osim fail-closed invarijanti.

Ovaj pristup je odabran umjesto tvrdog kodiranja svih pravila u JavaScriptu jer
je mapa pregledna u code reviewu i moze se mijenjati bez zahvata u Git detekciju
ili runner. Odabrano je i lokalno izvrsavanje, ne samo CI matrica, jer se dokaz
trazi prije commita i mora ukljuciti necommitane promjene.

## Datoteke

```text
config/verification-map.json
scripts/verification/detect-change.mjs
scripts/verification/select-gates.mjs
scripts/verification/run-gates.mjs
scripts/verification/report.mjs
tests/verification-router.test.ts
```

`package.json` dobiva skriptu:

```json
"verify:change": "node scripts/verification/run-gates.mjs"
```

## Konfiguracijski model

Konfiguracija ima cetiri cjeline:

1. `version`, broj verzije ugovora.
2. `defaults`, gateovi za svaku nepraznu promjenu.
3. `gates`, registry poznatih automatskih i rucnih gateova.
4. `routes`, uredeni popis glob pravila s rizikom i dodatnim gateovima.

Pocetni default je:

```json
{
  "gates": ["check", "orphan-scan"]
}
```

Svaki gate ima stabilan `id`, vrstu `command` ili `manual`, prikazni naziv i,
za automatske gateove, argv polje. Naredbe se ne izvrsavaju kroz interpolirani
shell string. Opcionalno `covers` polje opisuje da jedan gate vec izvrsava
drugi. Primjerice `check` pokriva `check-edge`, ali izvjestaj i dalje pokazuje
da je Edge provjera bila zahtijevana i cime je pokrivena.

Konfiguracija se prije uporabe strogo validira:

- podrzana verzija
- jedinstveni gate ID-jevi i route ID-jevi
- samo rizici `low`, `medium`, `high` i `unknown`
- svaki route navodi barem jedan podrzani glob
- svaki referencirani gate postoji
- svaki command gate ima neprazan argv
- manual gate nema naredbu
- nema ciklusa u `covers` odnosima

Neispravna konfiguracija daje izlazni kod 1 i nikad ne pokrece djelomican plan.

## Pocetne rute

Pocetna mapa obuhvaca najmanje sljedece domene:

| Putanja | Rizik | Dodatni gateovi |
| --- | --- | --- |
| `src/repair/**` | high | focused-repair-tests, strict-open, slow, word, adversarial-review |
| `src/docx/**`, `src/audits/**`, `src/analysis/**` | high | docx-golden-tests, strict-open, word, adversarial-review |
| `src/citations/**` | high | citation-tests, verify-claims, adversarial-review |
| `src/ui/**`, `src/styles/**`, `index.html` | medium | ux, visual |
| `supabase/**` | high | check-edge, migration-identity, db-smoke, security-checks, adversarial-review |
| `data/profiles/**` | high | verify-claims, scored-value-drift, projection-freshness, conformance, adversarial-review |
| routerove vlastite datoteke | high | verification-router-tests, adversarial-review |
| ostale poznate testne i dokumentacijske putanje | low ili medium | samo jasno definirani dodaci uz default gateove |

Precizne focused-test naredbe moraju pokazivati na postojece testove. Router ne
smije uvesti wildcard naredbu koja na Windowsu ovisi o shell ekspanziji.

Promjena moze pogoditi vise ruta. Rezultat je unija svih gateova, bez duplikata,
a ukupni rizik je najveci pogodeni rizik.

## Detekcija promjena

`detect-change.mjs` cita tri izvora:

1. commitane promjene izmedu merge-basea zadanog base refa i `HEAD`
2. staged i unstaged promjene u odnosu na `HEAD`
3. netrackane datoteke koje nisu ignorirane

Zadani base je `origin/master`. Skripta ne radi automatski `fetch`; koristi
lokalno dostupnu referencu i u izvjestaj zapisuje njezin SHA. Nepostojeci ili
nerazrjesiv base daje fail-closed ishod `needs_human`.

Git izlaz se cita u NUL odvojenom obliku. Kod renamea ili copyja klasificiraju se
i stara i nova putanja, kako premjestanje osjetljive datoteke ne bi uklonilo
potrebne gateove. Putanje se normaliziraju na `/`. Apsolutne putanje, `..`, prazne
ili malformirane putanje tretiraju se kao nepoznate.

Duplikati iz vise Git izvora se uklanjaju, ali izvjestaj cuva porijeklo svake
putanje: `committed`, `staged_or_unstaged`, `untracked`, `rename_from` ili
`rename_to`.

Ako stvarno nema promjena, rezultat je `needs_human`, ne zeleni dokaz. Time se
sprjecava da prazno izvrsavanje bude predstavljeno kao provjera neke promjene.

## Odabir gateova

`select-gates.mjs` je cista, testabilna jezgra. Za svaku putanju:

1. pronalazi sve routeove ciji glob odgovara putanji
2. biljezi route ID-jeve i rizik
3. dodaje default gateove i dodatne gateove svih pogođenih ruta
4. stabilno uklanja duplikate
5. racuna pokrivenost gateova preko `covers`

Glob implementacija podrzava samo ugovor potreban konfiguraciji, prvenstveno
`*` unutar segmenta i `**` kroz segmente. Ne oslanja se na tranzitivnu npm
ovisnost. Nepodrzan glob odbija konfiguraciju.

Putanja koja ne pogodi nijednu rutu dobiva:

```text
risk: unknown
gates: check, orphan-scan, needs-human
```

Ako je barem jedna putanja nepoznata, cijela promjena je `unknown`. Poznate rute
i njihovi gateovi ipak ostaju u planu, tako da izvjestaj ne skriva ostatak
promjene.

## Rucni gateovi

`visual` i `adversarial-review` su poznati manual gateovi. Bez eksplicitne
potvrde zavrsavaju kao `manual_required`, a cijeli router vraca izlazni kod 2.

Potvrda se daje ponovljivim argumentom:

```bash
npm run verify:change -- --ack adversarial-review --ack visual
```

Potvrda se biljezi u izvjestaj, ali nije automatski dokaz da je pregled bio
kvalitetan. Nepoznat ack ili ack gatea koji nije odabran je konfiguracijska
greska, kako tipfeler ne bi tiho prosao.

`needs-human` nastao zbog nepoznate putanje, pogresnog basea, prazne promjene ili
nedostupnog obveznog alata nema korisnicki ack koji ga pretvara u prolaz.

## Izvrsavanje

`run-gates.mjs` je CLI i orkestrator. Redoslijed je stabilan i definiran registryjem,
od jeftinijih prema skupljima. Command gate se pokrece s eksplicitnim executableom
i argv poljem, uz naslijedeni stdio, bez shell interpolacije.

Router nastavlja s neovisnim gateovima nakon pada kako bi izvjestaj pokazao sve
izmjerene ishode, kao postojeci release check. Detekcijska ili konfiguracijska
greska zaustavlja izvrsavanje jer plan tada nije pouzdan.

Gate moze zavrsiti kao:

- `passed`
- `failed`
- `covered`, uz ID gatea koji ga je stvarno izvrsio
- `manual_required`
- `acknowledged`
- `unavailable`
- `not_run`

Nedostupan Word, `psql`, Deno, potrebna varijabla okoline ili drugi obvezni alat
nikad se ne biljezi kao prolaz. Takvo stanje daje `needs_human` i izlazni kod 2,
osim kada je sama naredba pokrenuta i pala, sto ostaje automatski pad s kodom 1.

`--dry-run` ispisuje plan bez izvrsavanja. Za neprazan plan vraca 2 jer plan nije
dokaz izvrsenih gateova. Neispravna konfiguracija i dalje vraca 1.

## Izvjestaj

`report.mjs` proizvodi citljiv terminalski sazetak i JSON zapis:

```text
.artifacts/verification-router/latest.json
```

Zapis sadrzi:

- verziju sheme i vrijeme
- base ref i razrijeseni base SHA
- HEAD SHA
- oznaku prljavog radnog stabla
- sve promijenjene putanje i njihovo porijeklo
- pogodene i nepoznate rute
- ukupni rizik
- odabrane gateove, naredbe bez vrijednosti varijabli okoline i pokrivenost
- trajanje i ishod svakog gatea
- rucne potvrde
- konacni status i izlazni kod

Izvjestaj ne zapisuje vrijednosti varijabli okoline, lozinke ni izlaz naredbi koji
moze sadrzavati privatne podatke. `.artifacts/` ostaje lokalni, ignorirani dokaz.

## Zavrsni status i izlazni kodovi

| Kod | Status | Znacenje |
| --- | --- | --- |
| 0 | `passed` | Svi odabrani automatski gateovi prosli i svi poznati manual gateovi potvrdeni |
| 1 | `failed` | Automatski gate ili konfiguracija pali |
| 2 | `needs_human` | Nepoznata putanja, manual gate, nedostupna provjera, prazan diff ili nerazrjesiv base |

Automatski pad ima prednost pred `needs_human` u izlaznom kodu, ali izvjestaj cuva
oba stanja. `unknown` se nikad ne moze pretvoriti u `passed` argumentom CLI-ja.

## Testna strategija

`tests/verification-router.test.ts` uvozi ciste funkcije i koristi sinteticke Git
zapise ili privremeni repozitorij samo gdje je potrebno dokazati parser. Testovi
ne pokrecu Word, bazu, puni `check` ni mrezu.

Minimalna pokrivenost:

- svaka glavna ruta bira tocne gateove i rizik
- vise ruta daje uniju bez duplikata i najveci rizik
- default gateovi vrijede za svaku nepraznu promjenu
- nepoznata putanja uvijek dodaje `needs-human`
- `--ack` ne moze potvrditi unknown stanje
- poznati manual gate bez potvrde vraca 2
- poznati manual gate s potvrdom moze proci ako su automatski gateovi zeleni
- rename klasificira staru i novu putanju
- committed, radno stablo i untracked ulazi se spajaju
- nerazrjesiv base i prazan diff zatvaraju prolaz
- neispravna mapa i nepodrzani glob padaju prije izvrsavanja
- `covers` ne skriva zahtijevani gate i ne izvrsava ga dvaput
- nedostupan obvezni alat nije prolaz
- report ne sadrzi vrijednosti varijabli okoline
- routerove vlastite datoteke aktiviraju njegov high-risk route

Novi gard dobiva baseline i negativnu kontrolu u
`tests/gate-mutations.test.ts`. Mutacija mora dokazati da poznatu putanju koja je
izbacena iz mape router prijavljuje kao `unknown` i ne dopusta prolaz.

TDD redoslijed je obvezan: svaki novi ugovor prvo dobiva test koji pada iz
ocekivanog razloga, zatim minimalnu implementaciju i ponovni zeleni prolaz.

## Prihvatni kriteriji

- Sve trazene datoteke postoje i `verify:change` je dostupan kroz npm.
- Router ukljucuje committed, staged, unstaged i untracked promjene.
- Repair, citations, UI, Supabase i profile-data rute biraju ugovorene gateove.
- Svaka promjena dobiva `check` i `orphan-scan`.
- Nepoznata putanja izvrsava tvrdi minimum i zavrsava `needs_human`.
- Nijedan CLI argument ne moze unknown rezultat pretvoriti u prolaz.
- Rucni gateovi zahtijevaju eksplicitni ack i ostaju vidljivi u izvjestaju.
- Nedostupna obvezna provjera nije prikazana kao zelena.
- JSON izvjestaj reproducibilno opisuje odabir i rezultate bez tajni.
- Router ima vlastiti route, testove i mutaciju koja dokazuje da fail-closed gard
  stvarno reagira.
- Fokusirani testovi, `npm run check` i `npm run orphan-scan` prolaze u cistom
  izoliranom stablu prije commita implementacije.

# Sto ceka VLASNIKA: popis odluka

GENERIRANO. Ovdje je samo ono na cemu mehanika ne smije dalje: svaka stavka ukljucuje
bodovanje ili pripisuje ublazavanje.

## ZATVORENO: raskoraci izmedju tvrdnje i bodovane vrijednosti (37 odluka)

Otvorenih raskoraka: **0**. Svih 37 je presudjeno i potpisano
(`data/verification/drift-decisions.json`), od cega
35 u korist TVRDNJE i 2 protiv nje (pravilo ide na reverifikaciju).

Ratchet u `tests/scored-value-drift.test.ts` spusten je na 0: svaki nov raskorak od sada
pada odmah, bez zalihe.

---

## ZATVORENO: ublazen modalitet (66 jedinica, 146 pravila)

Procitano jedno po jedno, potpisano. Od 66 jedinica samo 12 stvarno ublazava VLASTITU OS; ostalo su
bili kvarovi u predlagacu:

| razred | jedinica | sto je zapravo bilo |
|---|---|---|
| negacija citana kao dopustenje | 7 | "rad NE MOZE sadrzavati manje od 15 stranica" -> to je ZABRANA |
| naziv sekcije kao modalitet | 1 | okidac je bio naslov poglavlja "Prikaz preporuka" |
| `npr.` kao preporuka | 4 | uvodi PRIMJER formata, ne ublazava obvezu |
| ublazavanje veze DRUGU odredbu | 43 | "(preporuca se MS Word)" veze program, ne prored |
| ublazavanje stvarno veze os | 12 | npr. "vrsta slova (font) moze biti TNR, Arial ili Arial Narrow" |

Predlagac je popravljen (`ne moz\w*` u zabranama, `(?<!ne )` u dopustenjima), uz deset negativnih
kontrola u CI-ju. `modality-worklist.md` ima NULA jedinica; zaostatak je 0 od 2204 bodovana pravila.

---

## B. ZATVORENO: cetiri bodovana pravila s praznom vrijednoscu

Popunjeno iz vlastitih citata, kljucevi preslikani iz `pravo-integrirani-diplomski`. "Prilog" je
namjerno izostavljen: rad bez priloga uredno postoji, pa bi obavezan prilog obarao valjane radove.
Ratchet praznih vrijednosti spusten na 0.

---

## C. ZATVORENO: 82 osi koje je motor bodovao bez ijedne tvrdnje

Potraga za izvorima provedena je po odsjeku. Ishod:

**Rijeseno iz postojeceg izvora (2 profila).** `ffos-povijest-{zavrsni,diplomski}`: fakultetski akt
FFOS-a (`ffos-pravilnik-radovi`, donijelo Fakultetsko vijece; `ffos-upute-diplomski`, koje izricito
govore o "odsjeka ili samostalne katedre") vrijedi za odsjek bez vlastitih uputa. Prikvacen je isti
izvor, ista stranica, isti citat i ista vrijednost kao na fakultetskim profilima.

**Izvora nema (12 profila) - bodovanje zaustavljeno tvojom odlukom.** Po odsjeku:

| odsjek | sto je potraga nasla |
|---|---|
| kroatistika, anglistika | stranice upucuju na Sveucilisnu knjiznicu; ondje su SAMO obrasci naslovnice |
| ekonomija | pravila postoje, ali izricito za SEMINARSKI rad |
| lingvistika | samo "objedinjeni obrazac" (naslovnica) i APA standardi |
| rusistika | nijedan takav dokument nije nadjen |
| sociologija (zavrsni) | uputa je izricito za DIPLOMSKI rad i o zavrsnom ne govori nista |
| pravst | samo proceduralni akti (pohrana i objava, prijava teme) |

Vrijednosti su maknute iz `rules`, pa provjere postaju informativne (0 bodova). Razlog je u
`data/profiles/no-rules-reasons.json` sa stanjem `source-not-found`, dokazom potrage po odsjeku i
opisom stete: isti genericki skup bodovao se na svih dvanaest profila, pa je rad koji slijedi
drukciju, jednako valjanu praksu svoga odsjeka gubio bodove na standardu koji mu nitko nije
propisao. Reverzibilno cim se izvor nadje.

---

## D. ZATVORENO: 24 verificirane tvrdnje koje motor nije citao

Nalaz `unapplied`: tvrdnja je verificirana i oznacena kao bodovana, a provjera se ne izvodi.

MJERENJE JE PROMIJENILO NARAV NALAZA. Ocekivalo se prazno zrcalo; svih 24 osi imalo je VRIJEDNOST,
a uz nju izricit `checkX: false`. Presudno: nijedna od tih 24 nije bila u `advisory-map.json`, dakle
to nije demotija nego gasenje bez ijednog zapisanog razloga, koje proturjeci verificiranoj tvrdnji.
Prvi pokusaj upisa bio je zato no-op na 8 od 12 profila i to je uhvaceno usporedbom prije commita.

Sada se provjerava, po tvojoj odluci: `pravo-specijalisticki-pravni-opci` i
`pravo-doktorski-pravne-znanosti` po pet osi (font TNR, 12 pt, prored 1,5, obostrano poravnanje,
numeracija), `alu-konzerviranje` pet, `alu-{kiparstvo,slikarstvo}` po jednu, `fpzpu-*` prored,
te margine odnosno numeracija na cetiri opca profila. Zapis: `data/verification/unapplied-decisions.json`.

---

## Stanje lanca

| mjera | prije | sada |
|---|---|---|
| raskoraka izmedju tvrdnje i zrcala | 37 | **0** |
| osi koje motor boduje bez tvrdnje | 82 | **0** |
| bodovanih pravila bez modaliteta | 2207 | **0** |
| verificiranih tvrdnji koje motor ne cita | 24 | **0** |

Artefakt `scored-value-drift.json` nema vise NIJEDAN strukturni nalaz.

## Jedino sto ostaje: citatni tokeni (32)

Dvadeset sest tvrdnji nosi ljudski opis stila umjesto kanonskog tokena, a sest ih motor ne
primjenjuje. Razdioba: 18 x `"apa"`, 2 x `"autor-godina"`, 2 x `"fusnote ili uglate zagrade s
brojem"`, po jedan `"chicago"`, `"prema uputama mentora"`, `null` i jedan popis triju stilova.

Ovo NIJE mehanicki prijepis i zato ceka tebe: prijelaz s `"apa"` na kanonski `apa7` je tvrdnja o
IZDANJU standarda. Ako izvor kaze samo "APA", upis `apa7` dodaje ono sto izvor ne kaze - isti razred
greske koji je ovaj lanac cijelo vrijeme lovio.

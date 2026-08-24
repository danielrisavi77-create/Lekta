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

## C. OTVORENO: 82 osi koje motor boduje BEZ IJEDNE TVRDNJE

Ovo je najveca preostala rupa u lancu i trazi tvoju odluku, jer se u oba smjera mijenja bodovanje.

Cetrnaest profila nema **nijedan** unos u draftu, a motor im boduje sest formatnih osi (font,
velicina, prored, margine, format papira, poravnanje) iz naslijedjenog `rules` objekta:

| jedinica | profili |
|---|---|
| unizd | kroatistika, ekonomija, anglistika, sociologija, lingvistika, rusistika (12 profila) |
| pravst | zavrsni, diplomski |
| ffos | povijest zavrsni, povijest diplomski |

To je izravno protivno pravilu iz CLAUDE.md ("bodovana pravila smiju doci samo iz navedenih
sluzbenih izvora"): tih 82 para (profil, os) boduje se bez ijednog izvora.

Dvije mogucnosti, i obje su tvoje:

1. **Nadji izvor i napisi tvrdnje.** Za `unizd` (33 srodna profila vec ima tvrdnje) i `ffos` (8)
   izgledi su dobri: vjerojatno vrijedi isti fakultetski pravilnik. `pravst` nema NIJEDAN profil s
   tvrdnjom, pa je ondje potrebno krenuti od nule.
2. **Demotiraj tih sest osi na informativne** dok se izvor ne nadje. Fail-safe je i tehnicki je
   trivijalno, ali tim profilima nestaje gotovo cijela provjera oblikovanja.

Preporuka: (1) za unizd i ffos, (2) privremeno za pravst. Ne diram bez tvoje rijeci jer prva
mogucnost dodaje bodovana pravila, a druga ih oduzima.


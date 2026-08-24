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

## B. Cetiri bodovana pravila s PRAZNOM vrijednoscu

`pravo-opci-pravni-akademski-rad`, `pravo-socijalni-opci-akademski-rad`,
`pravo-specijalisticki-pravni-opci`, `pravo-doktorski-pravne-znanosti` - svako nosi
`required-sections` s `value: []` uz citat koji sekcije NABRAJA. Broje se kao bodovana, a ne
provode nista. Popunjavanje znaci da motor pocinje bodovati strukturu ondje gdje dosad nije,
dakle promocija, dakle tvoj potpis. Gard: ratchet u `tests/claim-fields.test.ts` (cap 4).

## C. Sto NE ceka tebe

NISTA osim tocke B. Sve ostalo je zatvoreno.

Usput je pri citanju ispao nalaz koji nije bio na popisu, i on je vec rijesen: `unisb` je bodovao
FORMAT PAPIRA bez ijednog uporista. Citirani Clanak 3. govori o jednostranom ispisu, broju redaka,
velicini slova i marginama; format papira ne spominje. Jedini A4 u dokumentu je Clanak 18. i odnosi
se na SLIKE I DIJAGRAME. Osam pravila kroz osam profila skinuto je s bodovanja do reverifikacije.

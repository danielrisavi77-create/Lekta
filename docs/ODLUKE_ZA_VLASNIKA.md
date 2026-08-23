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

## A. Ublazen modalitet u citatu (66 jedinica, 146 pravila)

Mehanika ovo NIKAD ne upisuje, i to nije opreznost nego izmjereno: FER pilot je oborio 4 od 5
tvrdnji i nijedna nije pala na krivom prijepisu nego na TUMACENJU. Pripisivanje ublazavanja
pravoj osi je citanje: `ferit` citat glasi *"Rad se pise na racunalu (preporuca se MS Word) uz
prored od 1,5"*, gdje ublazavanje veze PROGRAM, ne prored.

Popis s citatima: `data/verification/modality-worklist.md`, skupina "ublazavanje u citatu".
Upis: `npm run claim-scope -- --from <odluke.json> --human --by "TVOJE IME" --write`.

**Ovo NE mijenja bodovanje.** Modalitet i opseg su opis citata, ne presuda o tome boduje li se
pravilo. Zato je najmanje hitna stavka na popisu.

Razvrstano po vrsti ublazavanja (mjereno):

| vrsta | jedinica |
|---|---|
| stvarna preporuka (`preporuca se`, `pozeljno`, `u pravilu`) | 34 |
| dopustenje (`moze`, `smije`, `dopusteno je`) | 24 |
| uvjet (`ukoliko`, `ako se`, `u slucaju`) | 3 |
| samo PRIMJER (`npr.`, `primjerice`) - vjerojatno nije ublazavanje | 4 |
| vise vrsta u istoj recenici | 1 |

## B. Cetiri bodovana pravila s PRAZNOM vrijednoscu

`pravo-opci-pravni-akademski-rad`, `pravo-socijalni-opci-akademski-rad`,
`pravo-specijalisticki-pravni-opci`, `pravo-doktorski-pravne-znanosti` - svako nosi
`required-sections` s `value: []` uz citat koji sekcije NABRAJA. Broje se kao bodovana, a ne
provode nista. Popunjavanje znaci da motor pocinje bodovati strukturu ondje gdje dosad nije,
dakle promocija, dakle tvoj potpis. Gard: ratchet u `tests/claim-fields.test.ts` (cap 4).

## C. Sto NE ceka tebe (za orijentaciju)

Preostale 54 jedinice u `modality-worklist.md` (vise modalnih biljega, nema biljega, predlosci)
su citanje, ne odluka o bodovanju, pa ih mogu odraditi bez tebe.


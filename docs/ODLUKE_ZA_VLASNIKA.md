# Sto ceka VLASNIKA: popis odluka

GENERIRANO. Ovo je jedini popis na kojem mehanika ne smije dalje: svaka stavka ukljucuje
bodovanje ili pripisuje ublazavanje, a oboje trazi ljudski potpis. Gasenje bodovanja je
fail-safe i vec je odradjeno strojno, pa nista od ovoga nije hitno u smislu stete: dok stoji,
te se osi NE boduju. Cijena cekanja je da se ne boduje ni ono sto bi trebalo.

## A. Raskoraci gdje IZVOR PODUPIRE TVRDNJU (23) - najbrze, jedna naredba po stavci

Presuda je izvedena iz samog izvora: citat nosi vrijednost TVRDNJE, a motor boduje drugu.
Otvori dosje, potvrdi da citas isto, pa pokreni naredbu (bez `--write` je suho).

- **ffri-germanistika-diplomski** / `margins`
  - izvor kaze: `{"top": 2, "right": 3, "bottom": 2, "left": 3, "minimum": false}` | motor boduje: `{"top": 2.5, "right": 2.5, "bottom": 2.5, "left": 2.5, "minimum": false}`
  - dosje: `data/verification/drift-dossiers/ffri-germanistika-diplomski.md`  (pokrivanje citata 0.68)
  - `npm run drift-apply -- --rule ffri-germanistika-diplomski--margins --decision claim --by "TVOJE IME" --write`

- **ffri-germanistika-zavrsni** / `margins`
  - izvor kaze: `{"top": 2, "right": 3, "bottom": 2, "left": 3, "minimum": false}` | motor boduje: `{"top": 2.5, "right": 2.5, "bottom": 2.5, "left": 2.5, "minimum": false}`
  - dosje: `data/verification/drift-dossiers/ffri-germanistika-zavrsni.md`  (pokrivanje citata 0.68)
  - `npm run drift-apply -- --rule ffri-germanistika-zavrsni--margins --decision claim --by "TVOJE IME" --write`

- **ffst-diplomski** / `font`
  - izvor kaze: `["Times New Roman"]` | motor boduje: `["Times New Roman", "Arial", "Calibri"]`
  - dosje: `data/verification/drift-dossiers/ffst-diplomski.md`  (pokrivanje citata 0.08)
  - `npm run drift-apply -- --rule ffst-diplomski--font --decision claim --by "TVOJE IME" --write`

- **ffst-diplomski** / `font-size`
  - izvor kaze: `[12]` | motor boduje: `[12, 11]`
  - dosje: `data/verification/drift-dossiers/ffst-diplomski.md`  (pokrivanje citata 0.08)
  - `npm run drift-apply -- --rule ffst-diplomski--font-size --decision claim --by "TVOJE IME" --write`

- **ffst-zavrsni** / `font`
  - izvor kaze: `["Times New Roman"]` | motor boduje: `["Times New Roman", "Arial", "Calibri"]`
  - dosje: `data/verification/drift-dossiers/ffst-zavrsni.md`  (pokrivanje citata 0.08)
  - `npm run drift-apply -- --rule ffst-zavrsni--font --decision claim --by "TVOJE IME" --write`

- **ffst-zavrsni** / `font-size`
  - izvor kaze: `[12]` | motor boduje: `[12, 11]`
  - dosje: `data/verification/drift-dossiers/ffst-zavrsni.md`  (pokrivanje citata 0.08)
  - `npm run drift-apply -- --rule ffst-zavrsni--font-size --decision claim --by "TVOJE IME" --write`

- **fpzpu-diplomski** / `font`
  - izvor kaze: `["Arial"]` | motor boduje: `["Times New Roman"]`
  - dosje: `data/verification/drift-dossiers/fpzpu-diplomski.md`  (pokrivanje citata 0.9)
  - `npm run drift-apply -- --rule fpzpu-diplomski--font --decision claim --by "TVOJE IME" --write`

- **fpzpu-diplomski** / `margins`
  - izvor kaze: `{"top": 2.5, "right": 2.5, "bottom": 2.5, "left": 2.5, "minimum": false}` | motor boduje: `{"top": 3.5, "right": 2.5, "bottom": 3, "left": 3, "minimum": false}`
  - dosje: `data/verification/drift-dossiers/fpzpu-diplomski.md`  (pokrivanje citata 0.9)
  - `npm run drift-apply -- --rule fpzpu-diplomski--margins --decision claim --by "TVOJE IME" --write`

- **fpzpu-zavrsni** / `font`
  - izvor kaze: `["Arial"]` | motor boduje: `["Times New Roman"]`
  - dosje: `data/verification/drift-dossiers/fpzpu-zavrsni.md`  (pokrivanje citata 0.9)
  - `npm run drift-apply -- --rule fpzpu-zavrsni--font --decision claim --by "TVOJE IME" --write`

- **fpzpu-zavrsni** / `margins`
  - izvor kaze: `{"top": 2.5, "right": 2.5, "bottom": 2.5, "left": 2.5, "minimum": false}` | motor boduje: `{"top": 3.5, "right": 2.5, "bottom": 3, "left": 3, "minimum": false}`
  - dosje: `data/verification/drift-dossiers/fpzpu-zavrsni.md`  (pokrivanje citata 0.9)
  - `npm run drift-apply -- --rule fpzpu-zavrsni--margins --decision claim --by "TVOJE IME" --write`

- **mev-zavrsni** / `margins`
  - izvor kaze: `{"top": 3, "right": 3, "bottom": 3, "left": 3, "minimum": false}` | motor boduje: `{"top": 2.5, "right": 2.5, "bottom": 2.5, "left": 2.5, "minimum": false}`
  - dosje: `data/verification/drift-dossiers/mev-zavrsni.md`  (pokrivanje citata 0.91)
  - `npm run drift-apply -- --rule mev-zavrsni--margins --decision claim --by "TVOJE IME" --write`

- **unizd-ekologija-zavrsni** / `font`
  - izvor kaze: `["Times New Roman"]` | motor boduje: `["Times New Roman", "Arial", "Calibri"]`
  - dosje: `data/verification/drift-dossiers/unizd-ekologija-zavrsni.md`  (pokrivanje citata 0.97)
  - `npm run drift-apply -- --rule unizd-ekologija-zavrsni--font --decision claim --by "TVOJE IME" --write`

- **unizd-ekologija-zavrsni** / `font-size`
  - izvor kaze: `[12]` | motor boduje: `[12, 11]`
  - dosje: `data/verification/drift-dossiers/unizd-ekologija-zavrsni.md`  (pokrivanje citata 0.97)
  - `npm run drift-apply -- --rule unizd-ekologija-zavrsni--font-size --decision claim --by "TVOJE IME" --write`

- **unizd-germanistika-zavrsni** / `font`
  - izvor kaze: `["Times New Roman"]` | motor boduje: `["Times New Roman", "Arial", "Calibri"]`
  - dosje: `data/verification/drift-dossiers/unizd-germanistika-zavrsni.md`  (pokrivanje citata 0.62)
  - `npm run drift-apply -- --rule unizd-germanistika-zavrsni--font --decision claim --by "TVOJE IME" --write`

- **unizd-germanistika-zavrsni** / `margins`
  - izvor kaze: `{"top": 3, "right": 3, "bottom": 3, "left": 3, "minimum": false}` | motor boduje: `{"top": 2.5, "right": 2.5, "bottom": 2.5, "left": 2.5, "minimum": false}`
  - dosje: `data/verification/drift-dossiers/unizd-germanistika-zavrsni.md`  (pokrivanje citata 0.62)
  - `npm run drift-apply -- --rule unizd-germanistika-zavrsni--margins --decision claim --by "TVOJE IME" --write`

- **unizd-pomorski-diplomski** / `font`
  - izvor kaze: `["Merriweather"]` | motor boduje: `["Times New Roman", "Arial", "Calibri"]`
  - dosje: `data/verification/drift-dossiers/unizd-pomorski-diplomski.md`  (pokrivanje citata 0.87)
  - `npm run drift-apply -- --rule unizd-pomorski-diplomski--font --decision claim --by "TVOJE IME" --write`

- **unizd-sociologija-diplomski** / `font`
  - izvor kaze: `["Times New Roman"]` | motor boduje: `["Times New Roman", "Arial", "Calibri"]`
  - dosje: `data/verification/drift-dossiers/unizd-sociologija-diplomski.md`  (pokrivanje citata 0.91)
  - `npm run drift-apply -- --rule unizd-sociologija-diplomski--font --decision claim --by "TVOJE IME" --write`

- **unizd-ucitelji-diplomski** / `font`
  - izvor kaze: `["Times New Roman"]` | motor boduje: `["Times New Roman", "Arial", "Calibri"]`
  - dosje: `data/verification/drift-dossiers/unizd-ucitelji-diplomski.md`  (pokrivanje citata 0.89)
  - `npm run drift-apply -- --rule unizd-ucitelji-diplomski--font --decision claim --by "TVOJE IME" --write`

- **unizd-ucitelji-diplomski** / `font-size`
  - izvor kaze: `[12]` | motor boduje: `[12, 11]`
  - dosje: `data/verification/drift-dossiers/unizd-ucitelji-diplomski.md`  (pokrivanje citata 0.89)
  - `npm run drift-apply -- --rule unizd-ucitelji-diplomski--font-size --decision claim --by "TVOJE IME" --write`

- **vss-diplomski** / `font`
  - izvor kaze: `["Times New Roman"]` | motor boduje: `["Times New Roman", "Arial", "Calibri"]`
  - dosje: `data/verification/drift-dossiers/vss-diplomski.md`  (pokrivanje citata 0.96)
  - `npm run drift-apply -- --rule vss-diplomski--font --decision claim --by "TVOJE IME" --write`

- **vss-diplomski** / `font-size`
  - izvor kaze: `[12]` | motor boduje: `[12, 11]`
  - dosje: `data/verification/drift-dossiers/vss-diplomski.md`  (pokrivanje citata 0.96)
  - `npm run drift-apply -- --rule vss-diplomski--font-size --decision claim --by "TVOJE IME" --write`

- **vss-zavrsni** / `font`
  - izvor kaze: `["Times New Roman"]` | motor boduje: `["Times New Roman", "Arial", "Calibri"]`
  - dosje: `data/verification/drift-dossiers/vss-zavrsni.md`  (pokrivanje citata 0.96)
  - `npm run drift-apply -- --rule vss-zavrsni--font --decision claim --by "TVOJE IME" --write`

- **vss-zavrsni** / `font-size`
  - izvor kaze: `[12]` | motor boduje: `[12, 11]`
  - dosje: `data/verification/drift-dossiers/vss-zavrsni.md`  (pokrivanje citata 0.96)
  - `npm run drift-apply -- --rule vss-zavrsni--font-size --decision claim --by "TVOJE IME" --write`

## B. Raskoraci gdje IZVOR NOSI OBJE vrijednosti (8) - pitanje hijerarhije, trazi citanje

Nije greska ni s jedne strane: dokument nosi obje. Odluka je koja odredba vrijedi za koji
dio rada ili koji je izvor jaci. Zato nema gotove naredbe: prvo procitaj dosje.

- **ffos-germanistika-diplomski** / `font`: tvrdnja `["Times New Roman", "Calibri", "Arial"]` vs motor `["Times New Roman"]`
- **ffos-germanistika-zavrsni** / `font`: tvrdnja `["Times New Roman", "Calibri", "Arial"]` vs motor `["Times New Roman"]`
- **unizd-arheologija-diplomski** / `margins`: tvrdnja `{"top": 2.5, "right": 2.5, "bottom": 2.5, "left": 3, "minimum": false}` vs motor `{"top": 2.5, "right": 2.5, "bottom": 2.5, "left": 2.5, "minimum": false}`
- **unizd-pomorski-diplomski** / `font-size`: tvrdnja `[10]` vs motor `[12, 11]`
- **unizd-pomorski-zavrsni** / `font-size`: tvrdnja `[10]` vs motor `[12, 11]`
- **unizd-povijest-zavrsni** / `margins`: tvrdnja `{"top": 2.5, "right": 2.5, "bottom": 2.5, "left": 3.5, "minimum": false}` vs motor `{"top": 2.5, "right": 2.5, "bottom": 2.5, "left": 2.5, "minimum": false}`
- **vss-diplomski** / `margins`: tvrdnja `{"top": 2.5, "right": 2.5, "bottom": 2.5, "left": 3, "minimum": false}` vs motor `{"top": 2.5, "right": 2.5, "bottom": 2.5, "left": 2.5, "minimum": false}`
- **vss-zavrsni** / `margins`: tvrdnja `{"top": 2.5, "right": 2.5, "bottom": 2.5, "left": 3, "minimum": false}` vs motor `{"top": 2.5, "right": 2.5, "bottom": 2.5, "left": 2.5, "minimum": false}`

## C. Raskoraci gdje IZVOR NE NOSI NIJEDNU vrijednost (6) - pravilo ide na reverifikaciju

Ni tvrdnja ni motor se ne nalaze u navedenom izvoru. Najvjerojatnije je lokator kriv ili je
izvor zamijenjen novijim. Trazi ponovno citanje izvora, ne odluku o vrijednosti.

- **ffos-psihologija-diplomski** / `margins`: `ffos-psihologija-diplomski-2015` / cijeli dokument
- **ffst-diplomski** / `margins`: `ffst-predlozak-zavrsnoga-diplomskoga` / Predlozak, stil Normal + footer2.xml (obvezujuc preko Pravilnik Clanak 9 -> Upute)
- **ffst-zavrsni** / `margins`: `ffst-predlozak-zavrsnoga-diplomskoga` / Predlozak, stil Normal + footer2.xml (obvezujuc preko Pravilnik Clanak 9 -> Upute)
- **unizd-germanistika-zavrsni** / `font-size`: `unizd-germanistika-pravilnik-zavrsni-2020` / Prilog 2, "Izgled zavrsnog rada"
- **unizd-pomorski-zavrsni** / `font`: `unizd-pomorski-pravilnik-upute-zavrsni` / Upute zavrsni
- **unizd-sociologija-diplomski** / `font-size`: `unizd-sociologija-upute-dipr-2014` / Odjeljak 5, "Upute za pisanje diplomskoga rada"

## D. Ublazen modalitet u citatu (66 jedinica, 146 pravila)

Mehanika ovo NIKAD ne upisuje, i to nije opreznost nego izmjereno: FER pilot je oborio 4 od 5
tvrdnji i nijedna nije pala na krivom prijepisu nego na TUMACENJU. Pripisivanje ublazavanja
pravoj osi je citanje: `ferit` citat glasi *"Rad se pise na racunalu (preporuca se MS Word) uz
prored od 1,5"*, gdje ublazavanje veze PROGRAM, ne prored.

Popis s citatima: `data/verification/modality-worklist.md`, skupina "ublazavanje u citatu".
Upis: `npm run claim-scope -- --from <odluke.json> --human --by "TVOJE IME" --write`.

NAPOMENA: ovo NE mijenja bodovanje. Modalitet i opseg su opis citata, ne presuda o tome boduje
li se pravilo. Zato je ovo najmanje hitna stavka na popisu.

## E. Cetiri bodovana pravila s PRAZNOM vrijednoscu

`pravo-opci-pravni-akademski-rad`, `pravo-socijalni-opci-akademski-rad`,
`pravo-specijalisticki-pravni-opci`, `pravo-doktorski-pravne-znanosti` - svako nosi
`required-sections` s `value: []` uz citat koji sekcije NABRAJA. Broje se kao bodovana, a ne
provode nista. Popunjavanje znaci da motor pocinje bodovati strukturu ondje gdje dosad nije,
dakle promocija, dakle tvoj potpis. Gard: ratchet u `tests/claim-fields.test.ts` (cap 4).


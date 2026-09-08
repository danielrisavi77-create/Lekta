# Replikacija i statistički prilozi

Sam postupak replikacije **nije stvar kućnog stila** i ne živi u ovom skillu. Za
njega postoji zaseban skill, `replikacija-pspp`: on gradi sintaksu, pokreće
PSPP, čita vrijednosti iz ispisa, uspoređuje ih s onima u radu i snima prozore
sučelja.

Ovdje stoji samo ono što je FPZG-ovo: gdje prilozi idu i kako izgledaju.

## Zašto PSPP, a ne jamovi

Prethodna inačica ovog skilla vodila je studenta kroz jamovi, korak po korak.
To je i dalje valjano, ali ima dvije slabosti. jamovi se u zatvorenim
okruženjima ne može instalirati (dolazi iz flatpaka ili s vlastite stranice),
pa se postupak ne može ni pripremiti ni provjeriti unaprijed. I drugo, tablica
usporedbe ostajala je prazna dok je student ne popuni rukom, pa je prilog do
zadnjeg trena bio obećanje, a ne dokaz.

PSPP dolazi iz `apt`, prihvaća SPSS-ovu sintaksu i ima sučelje koje se snima.
Cijeli prilog može biti gotov i provjeren prije nego što student išta klikne, a
on ga onda ponovi na svom računalu ako želi vlastite snimke. Povjerenstvu je
SPSS-ov oblik ispisa ionako poznatiji.

## Gdje prilozi idu

Redoslijed je onaj iz obranjenog rada: prilozi dolaze **iza literature, a
ispred sažetka**. Zato je sidro `Sažetak`.

| Prilog | Sadržaj |
|---|---|
| Prilog 1 | anketni upitnik |
| Prilog 2 | tablica usporedbe: što piše u radu, što ispisuje PSPP, poklapa li se |
| Prilog 3 | snimke prozora programa, jedna po analizi |

Uz rad se predaju i datoteke: `baza.csv`, `sifrarnik.csv`, `provjera.sps` i
`izlaz.pdf`. Sintaksa i baza su ono što prilog čini provjerljivim; snimke su
ilustracija.

## FPZG postavke

U `replikacija.json`, blok `prilog`:

```json
{
  "sidro": "Sažetak",
  "sirina_teksta_cm": 15.92,
  "dpi_min": 200,
  "pt_natpis": 11,
  "pt_izvor": 10,
  "pt_tablica": 10,
  "izvor_slike": "Izvor: snimka prozora programa PSPP.",
  "izvor_tablice": "Izvor: izradio autor.",
  "sirine_cm": [1.7, 1.8, 4.2, 1.7, 3.1, 1.9, 1.5]
}
```

Širina teksta od 15,92 cm slijedi iz A4 formata i margina od 2,54 cm. Zadane
širine stupaca su nužne: bez njih Word razvuče stupac s nazivom naredbe i svaki
redak rastegne na dva reda.

## Pravila koja vrijede i ovdje

- natpis iznad tablice, ispod slike; izvor **običnim slogom**, nikad kurzivom
- prikaz se ne smije lomiti preko stranice: `cantSplit` na svakom retku,
  `tblHeader` na zaglavlju, natpis vezan uz prikaz
- prikazi u prilozima **ne ulaze** u popis ilustracija, jednako kao Tablica P2.1
- nakon umetanja priloga brojevi stranica su se pomaknuli: u Wordu `Ctrl + A`
  pa `F9`

## Postupak

```bash
python3 <REPLIKACIJA_SKILL>/scripts/pspp_replikacija.py sve --conf replikacija.json
python3 <REPLIKACIJA_SKILL>/scripts/prilog_replikacija.py --conf replikacija.json \
        --dokument rad.docx
```

Drugi korak ništa ne mijenja, samo dodaje, i odbija zahvat koji bi pregazio
sidro fusnote. Nakon njega provjeri razliku prije i poslije: uklonjenih odlomaka
mora biti nula.

# Dosje raskoraka: ffst-zavrsni

Presudjuje COVJEK. Otvori snapshot na lokatoru, procitaj citat u kontekstu i odluci je li tocna
tvrdnja ili vrijednost koju motor boduje. Pazi na tri obrasca koja su se vec ponavljala:
odsjecki dokument predstavljen kao fakultetski, citat odsjecen prije iznimke u istoj recenici,
i naslovnica kao tiha druga vrijednost.

## RASKORAK: tvrdnja i motor kazu razlicito (demotirano dok se ne presudi) (3)

### font - Font
- Tvrdnja (izvor): `["Times New Roman"]`
- Motor boduje: `["Times New Roman","Arial","Calibri"]`
- ruleId: `ffst-zavrsni--font`
- Izvor: ffst-predlozak-zavrsnoga-diplomskoga - Predlozak zavrsnoga/diplomskoga rada, final (Filozofski fakultet u Splitu)
- Lokator: Predlozak, stil Normal + footer2.xml (obvezujuc preko Pravilnik Clanak 9 -> Upute)
- Snapshot: `data/sources/ffst/ffst-predlozak-zavrsnoga-diplomskoga-final.docx`
- Citat: "Normal stil: font Times New Roman, velicina 12pt (w:sz=24), prored 1,5 (w:line=360 auto), obostrano poravnanje (w:jc=both). Stranica A4 (21x29,7cm), margine 2,54cm sve strane. Footer: PAGE polje, desno poravnano, dno stranice."
- Autoritet: binding
- Zadnja provjera: 2026-07-28 (Daniel Risavi)

**Sto kaze sam izvor:** IZVOR NOSI VRIJEDNOST TVRDNJE, ne onu koju motor boduje -> zrcalo je krivo
- Citat OPISUJE POSTAVKE PAKETA (OOXML), ne recenicu. Pokrivanje nad vidljivim tekstom
  (0.08) ovdje NIJE mjera istinitosti: postavke zive u styles.xml i
  `<w:sectPr><w:pgMar>`, pa ih citanje teksta ne vidi. Provjerava se otvaranjem paketa.
  Zasebno pitanje, i ono je za covjeka: predlozak OPISUJE, ne propisuje.
- U izvoru NEMA vrijednosti motora: Arial; Calibri
- Iz izvora: "..., citate, slike i tablice. u ovom predlosku stil normal definiran je na sljedeci nacin: tekst je pisan fontom times new roman, velicine 12 pt, proredom 1,5 pt. odlomci su obostrano poravnani, bez razm..."
- Iz izvora: "..., citate, slike i tablice. u ovom predlosku stil normal definiran je na sljedeci nacin: tekst je pisan fontom times new roman, velicine 12 pt, proredom 1,5 pt. odlomci su obostrano poravnani, bez razm..."

### font-size - Velicina slova
- Tvrdnja (izvor): `[12]`
- Motor boduje: `[12,11]`
- ruleId: `ffst-zavrsni--font-size`
- Izvor: ffst-predlozak-zavrsnoga-diplomskoga - Predlozak zavrsnoga/diplomskoga rada, final (Filozofski fakultet u Splitu)
- Lokator: Predlozak, stil Normal + footer2.xml (obvezujuc preko Pravilnik Clanak 9 -> Upute)
- Snapshot: `data/sources/ffst/ffst-predlozak-zavrsnoga-diplomskoga-final.docx`
- Citat: "Normal stil: font Times New Roman, velicina 12pt (w:sz=24), prored 1,5 (w:line=360 auto), obostrano poravnanje (w:jc=both). Stranica A4 (21x29,7cm), margine 2,54cm sve strane. Footer: PAGE polje, desno poravnano, dno stranice."
- Autoritet: binding
- Zadnja provjera: 2026-07-28 (Daniel Risavi)

**Sto kaze sam izvor:** IZVOR NOSI VRIJEDNOST TVRDNJE, ne onu koju motor boduje -> zrcalo je krivo
- Citat OPISUJE POSTAVKE PAKETA (OOXML), ne recenicu. Pokrivanje nad vidljivim tekstom
  (0.08) ovdje NIJE mjera istinitosti: postavke zive u styles.xml i
  `<w:sectPr><w:pgMar>`, pa ih citanje teksta ne vidi. Provjerava se otvaranjem paketa.
  Zasebno pitanje, i ono je za covjeka: predlozak OPISUJE, ne propisuje.
- U izvoru NEMA vrijednosti motora: 11 / 11,0 / 11.0
- Iz izvora: "...u ovom predlosku stil normal definiran je na sljedeci nacin: tekst je pisan fontom times new roman, velicine 12 pt, proredom 1,5 pt. odlomci su obostrano poravnani, bez razmaka prije i poslije odlomka..."
- Iz izvora: "...u ovom predlosku stil normal definiran je na sljedeci nacin: tekst je pisan fontom times new roman, velicine 12 pt, proredom 1,5 pt. odlomci su obostrano poravnani, bez razmaka prije i poslije odlomka..."

### margins - Margine
- Tvrdnja (izvor): `{"top":2.54,"right":2.54,"bottom":2.54,"left":2.54,"minimum":false}`
- Motor boduje: `{"top":2.5,"right":2.5,"bottom":2.5,"left":2.5,"minimum":false}`
- ruleId: `ffst-zavrsni--margins`
- Izvor: ffst-predlozak-zavrsnoga-diplomskoga - Predlozak zavrsnoga/diplomskoga rada, final (Filozofski fakultet u Splitu)
- Lokator: Predlozak, stil Normal + footer2.xml (obvezujuc preko Pravilnik Clanak 9 -> Upute)
- Snapshot: `data/sources/ffst/ffst-predlozak-zavrsnoga-diplomskoga-final.docx`
- Citat: "Normal stil: font Times New Roman, velicina 12pt (w:sz=24), prored 1,5 (w:line=360 auto), obostrano poravnanje (w:jc=both). Stranica A4 (21x29,7cm), margine 2,54cm sve strane. Footer: PAGE polje, desno poravnano, dno stranice."
- Autoritet: binding
- Zadnja provjera: 2026-07-28 (Daniel Risavi)

**Sto kaze sam izvor:** izvor ne nosi NIJEDNU -> pravilo ide na reverifikaciju
- Citat OPISUJE POSTAVKE PAKETA (OOXML), ne recenicu. Pokrivanje nad vidljivim tekstom
  (0.08) ovdje NIJE mjera istinitosti: postavke zive u styles.xml i
  `<w:sectPr><w:pgMar>`, pa ih citanje teksta ne vidi. Provjerava se otvaranjem paketa.
  Zasebno pitanje, i ono je za covjeka: predlozak OPISUJE, ne propisuje.
- U izvoru NEMA vrijednosti motora: 2,5 / 2.5
- U izvoru NEMA vrijednosti tvrdnje: 2,54 / 2.54


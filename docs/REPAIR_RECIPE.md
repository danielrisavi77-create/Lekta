# Recept popravka po profilu

> GENERIRANO. Ne uredjuj rucno: `npm run repair-recipe` (izvor su profili i
> `src/ui/repair-items.ts`). Drift hvata `tests/repair-recipe.test.ts`.

## Kako popravak radi

U popravku NEMA jezicnog modela ni prompta. Popravak je deterministicki XML patch nad
OOXML-om: 31 fixera (`src/repair/apply-fixers.ts`) mijenja `word/document.xml`, `styles.xml`,
`footnotes.xml` i podnozja, a svi ostali dijelovi dokumenta (slike, tema, veze) prolaze
bajt-identicno (`src/repair/apply-fixers.ts`).

Ulogu "prompta" ima recept: niz `{fixerId, ruleId, params}`. Klijent ga slozi iz PROFILA,
ali od 2026-08-16 CILJANU VRIJEDNOST izvodi SERVER: za poznat par (profil, pravilo) uzima
svoju, pecenu vrijednost iz ovog istog recepta (`data/generated/repair-params-by-profile.json`,
vidi `src/repair/param-authority.ts`) i klijentovu ignorira. Klijentov `params` vrijedi jos
samo tamo gdje fakultetskog pravila nema (univerzalna higijena), i to se biljezi u odgovoru
(`paramSources`). Zato je recept po fakultetu izrazen kao PODACI, ne kao tekst:
jedna masina, `407` skupova vrijednosti.

Vrijednosti dolaze iz onoga sto zivi engine stvarno cita (`rules` profila; ciljane
vrijednosti racuna `paramsForCheck` u `src/ui/repair-items.ts`), a provenijencija
(izvor, stranica, autoritet, datum) iz `ruleEntries`. Prazna provenijencija znaci da
pravilo nije vezano uz potvrdjen izvor - ne nagadja se.

## Opseg

- profila: **407**
- s popravkom po UPUTI FAKULTETA: **373**
- samo univerzalna higijena (prazni odlomci), bez potvrdjenih tehnickih pravila: **34**
- ukupno stavki recepta: **2736**

Sto se NE popravlja automatski: sadrzaj, argument, citati i literatura (osim provjere
postojanja izvora), numeriranje naslova i svaka odluka koja je autorska.

## Profili

### adu

#### Akademija dramske umjetnosti, Odsjek montaže, diplomski rad

`adu-montaza-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format papira A4 | `paper-size-fixer` | 21 x 29,7 cm | [Pravilnik o diplomskim radovima i diplomskom ispitu diplomskog studija Montaze (ADU, 2018)](https://web.archive.org/web/20240501130942/http://masterwww.adu.hr/wp-content/uploads/2014/07/Pravilnik-o-diplomskim-radovima-i-diplomskom-ispitu-diplomskog-studija-Monta%C5%BEe-_-2018.pdf) | str. 5 |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 4 cm (gore/desno/dolje/lijevo) | [Pravilnik o diplomskim radovima i diplomskom ispitu diplomskog studija Montaze (ADU, 2018)](https://web.archive.org/web/20240501130942/http://masterwww.adu.hr/wp-content/uploads/2014/07/Pravilnik-o-diplomskim-radovima-i-diplomskom-ispitu-diplomskog-studija-Monta%C5%BEe-_-2018.pdf) | str. 5 |
| Font | `font-fixer` | Times New Roman | [Pravilnik o diplomskim radovima i diplomskom ispitu diplomskog studija Montaze (ADU, 2018)](https://web.archive.org/web/20240501130942/http://masterwww.adu.hr/wp-content/uploads/2014/07/Pravilnik-o-diplomskim-radovima-i-diplomskom-ispitu-diplomskog-studija-Monta%C5%BEe-_-2018.pdf) | str. 5 |
| Velicina slova | `font-fixer` | 12 pt | [Pravilnik o diplomskim radovima i diplomskom ispitu diplomskog studija Montaze (ADU, 2018)](https://web.archive.org/web/20240501130942/http://masterwww.adu.hr/wp-content/uploads/2014/07/Pravilnik-o-diplomskim-radovima-i-diplomskom-ispitu-diplomskog-studija-Monta%C5%BEe-_-2018.pdf) | str. 5 |
| Prored | `line-spacing-fixer` | prored 1,5 | [Pravilnik o diplomskim radovima i diplomskom ispitu diplomskog studija Montaze (ADU, 2018)](https://web.archive.org/web/20240501130942/http://masterwww.adu.hr/wp-content/uploads/2014/07/Pravilnik-o-diplomskim-radovima-i-diplomskom-ispitu-diplomskog-studija-Monta%C5%BEe-_-2018.pdf) | str. 5 |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### agr

#### Agronomski fakultet, diplomski rad

`agr-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Velicina slova | `font-fixer` | 12 pt | [Upute za izradu diplomskog rada (Agronomski fakultet, 2019)](https://www.agr.unizg.hr/upload/nastava/ms_dipl_rad_upute_20190410.pdf) | odjeljak 6. Tehnicko oblikovanje rada |
| Prored | `line-spacing-fixer` | prored 1,15 | [Upute za izradu diplomskog rada (Agronomski fakultet, 2019)](https://www.agr.unizg.hr/upload/nastava/ms_dipl_rad_upute_20190410.pdf) | odjeljak 6. Tehnicko oblikovanje rada |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Upute za izradu diplomskog rada (Agronomski fakultet, 2019)](https://www.agr.unizg.hr/upload/nastava/ms_dipl_rad_upute_20190410.pdf) | odjeljak 6. Tehnicko oblikovanje rada |
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Upute za izradu diplomskog rada (Agronomski fakultet, 2019)](https://www.agr.unizg.hr/upload/nastava/ms_dipl_rad_upute_20190410.pdf) | odjeljak 1. Diplomski rad |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Sadrzaj kao zivo TOC polje | `toc-field-fixer` | Word sam azurira sadrzaj<br><sub>Dokument ima naslov Sadrzaj, a jos nema zivo TOC polje. Nedestruktivno: rucne stavke se ne brisu.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Agronomski fakultet, doktorski rad

`agr-doktorski` · status: partial · vrste rada: doctoral

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Velicina slova | `font-fixer` | 12 pt | [Upute za oblikovanje doktorskoga rada (DR.08, Agronomski fakultet, 2026)](https://www.agr.unizg.hr/upload/nastava/dr_08_upute_za_oblikovanje_doktorskog_rada_20260512.pdf) | odjeljak Postavke stranice |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za oblikovanje doktorskoga rada (DR.08, Agronomski fakultet, 2026)](https://www.agr.unizg.hr/upload/nastava/dr_08_upute_za_oblikovanje_doktorskog_rada_20260512.pdf) | odjeljak Postavke stranice |
| Margine (tijelo) | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Upute za oblikovanje doktorskoga rada (DR.08, Agronomski fakultet, 2026)](https://www.agr.unizg.hr/upload/nastava/dr_08_upute_za_oblikovanje_doktorskog_rada_20260512.pdf) | odjeljak Postavke stranice |
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Upute za oblikovanje doktorskoga rada (DR.08, Agronomski fakultet, 2026)](https://www.agr.unizg.hr/upload/nastava/dr_08_upute_za_oblikovanje_doktorskog_rada_20260512.pdf) | odjeljak Opce upute |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Sadrzaj kao zivo TOC polje | `toc-field-fixer` | Word sam azurira sadrzaj<br><sub>Dokument ima naslov Sadrzaj, a jos nema zivo TOC polje. Nedestruktivno: rucne stavke se ne brisu.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Agronomski fakultet, završni (prijediplomski) rad

`agr-zavrsni` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Velicina slova | `font-fixer` | 12 pt | [Upute za izradu zavrsnog rada (Agronomski fakultet, prijediplomski, 2017)](https://www.agr.unizg.hr/upload/nastava/bs_zavrsni_rad_uputa_20170612.pdf) | 5. Tehnicko oblikovanje rada (Preporuke) |
| Prored | `line-spacing-fixer` | prored 1,15 | [Upute za izradu zavrsnog rada (Agronomski fakultet, prijediplomski, 2017)](https://www.agr.unizg.hr/upload/nastava/bs_zavrsni_rad_uputa_20170612.pdf) | 5. Tehnicko oblikovanje rada (Preporuke) |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Upute za izradu zavrsnog rada (Agronomski fakultet, prijediplomski, 2017)](https://www.agr.unizg.hr/upload/nastava/bs_zavrsni_rad_uputa_20170612.pdf) | 5. Tehnicko oblikovanje rada (Preporuke) |
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Upute za izradu zavrsnog rada (Agronomski fakultet, prijediplomski, 2017)](https://www.agr.unizg.hr/upload/nastava/bs_zavrsni_rad_uputa_20170612.pdf) | 1. Uvodne odrednice |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Sadrzaj kao zivo TOC polje | `toc-field-fixer` | Word sam azurira sadrzaj<br><sub>Dokument ima naslov Sadrzaj, a jos nema zivo TOC polje. Nedestruktivno: rucne stavke se ne brisu.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### algebra

#### Sveuciliste Algebra Bernays, diplomski rad (engleski)

`algebra-diplomski` · status: verified · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font (predlozak, currency-rizik) | `font-fixer` | Times New Roman | [Predlozak diplomskog rada (Visoko uciliste Algebra, 2017, arhivirano preko Wayback Machine)](https://web.archive.org/web/20211210005533/https://www.algebra.hr/visoko-uciliste/wp-content/uploads/sites/2/2017/11/Diplomski-rad_predlozak.docx) | Prilog "Izrazi ili formule" + sectPr (Wayback 2021 snimka 2017 predloska) |
| Velicina slova (predlozak, currency-rizik) | `font-fixer` | 12 pt | [Predlozak diplomskog rada (Visoko uciliste Algebra, 2017, arhivirano preko Wayback Machine)](https://web.archive.org/web/20211210005533/https://www.algebra.hr/visoko-uciliste/wp-content/uploads/sites/2/2017/11/Diplomski-rad_predlozak.docx) | Prilog "Izrazi ili formule" + sectPr (Wayback 2021 snimka 2017 predloska) |
| Prored (predlozak, currency-rizik) | `line-spacing-fixer` | prored 1,5 | [Predlozak diplomskog rada (Visoko uciliste Algebra, 2017, arhivirano preko Wayback Machine)](https://web.archive.org/web/20211210005533/https://www.algebra.hr/visoko-uciliste/wp-content/uploads/sites/2/2017/11/Diplomski-rad_predlozak.docx) | Prilog "Izrazi ili formule" + sectPr (Wayback 2021 snimka 2017 predloska) |
| Poravnanje (predlozak, currency-rizik) | `alignment-fixer` | obostrano | [Predlozak diplomskog rada (Visoko uciliste Algebra, 2017, arhivirano preko Wayback Machine)](https://web.archive.org/web/20211210005533/https://www.algebra.hr/visoko-uciliste/wp-content/uploads/sites/2/2017/11/Diplomski-rad_predlozak.docx) | Prilog "Izrazi ili formule" + sectPr (Wayback 2021 snimka 2017 predloska) |
| Format papira A4 (predlozak, currency-rizik) | `paper-size-fixer` | 21 x 29,7 cm | [Predlozak diplomskog rada (Visoko uciliste Algebra, 2017, arhivirano preko Wayback Machine)](https://web.archive.org/web/20211210005533/https://www.algebra.hr/visoko-uciliste/wp-content/uploads/sites/2/2017/11/Diplomski-rad_predlozak.docx) | Prilog "Izrazi ili formule" + sectPr (Wayback 2021 snimka 2017 predloska) |
| Margine (predlozak, currency-rizik) | `margins-fixer` | 2,5 / 2,5 / 2,5 / 3 cm (gore/desno/dolje/lijevo) | [Predlozak diplomskog rada (Visoko uciliste Algebra, 2017, arhivirano preko Wayback Machine)](https://web.archive.org/web/20211210005533/https://www.algebra.hr/visoko-uciliste/wp-content/uploads/sites/2/2017/11/Diplomski-rad_predlozak.docx) | Prilog "Izrazi ili formule" + sectPr (Wayback 2021 snimka 2017 predloska) |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Sveuciliste Algebra Bernays, Odnosi s javnoscu, diplomski rad (hrvatski)

`algebra-diplomski-odnosi-s-javnoscu` · status: verified · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font (predlozak, currency-rizik) | `font-fixer` | Times New Roman | [Predlozak diplomskog rada (Visoko uciliste Algebra, 2017, arhivirano preko Wayback Machine)](https://web.archive.org/web/20211210005533/https://www.algebra.hr/visoko-uciliste/wp-content/uploads/sites/2/2017/11/Diplomski-rad_predlozak.docx) | Prilog "Izrazi ili formule" + sectPr (Wayback 2021 snimka 2017 predloska) |
| Velicina slova (predlozak, currency-rizik) | `font-fixer` | 12 pt | [Predlozak diplomskog rada (Visoko uciliste Algebra, 2017, arhivirano preko Wayback Machine)](https://web.archive.org/web/20211210005533/https://www.algebra.hr/visoko-uciliste/wp-content/uploads/sites/2/2017/11/Diplomski-rad_predlozak.docx) | Prilog "Izrazi ili formule" + sectPr (Wayback 2021 snimka 2017 predloska) |
| Prored (predlozak, currency-rizik) | `line-spacing-fixer` | prored 1,5 | [Predlozak diplomskog rada (Visoko uciliste Algebra, 2017, arhivirano preko Wayback Machine)](https://web.archive.org/web/20211210005533/https://www.algebra.hr/visoko-uciliste/wp-content/uploads/sites/2/2017/11/Diplomski-rad_predlozak.docx) | Prilog "Izrazi ili formule" + sectPr (Wayback 2021 snimka 2017 predloska) |
| Poravnanje (predlozak, currency-rizik) | `alignment-fixer` | obostrano | [Predlozak diplomskog rada (Visoko uciliste Algebra, 2017, arhivirano preko Wayback Machine)](https://web.archive.org/web/20211210005533/https://www.algebra.hr/visoko-uciliste/wp-content/uploads/sites/2/2017/11/Diplomski-rad_predlozak.docx) | Prilog "Izrazi ili formule" + sectPr (Wayback 2021 snimka 2017 predloska) |
| Format papira A4 (predlozak, currency-rizik) | `paper-size-fixer` | 21 x 29,7 cm | [Predlozak diplomskog rada (Visoko uciliste Algebra, 2017, arhivirano preko Wayback Machine)](https://web.archive.org/web/20211210005533/https://www.algebra.hr/visoko-uciliste/wp-content/uploads/sites/2/2017/11/Diplomski-rad_predlozak.docx) | Prilog "Izrazi ili formule" + sectPr (Wayback 2021 snimka 2017 predloska) |
| Margine (predlozak, currency-rizik) | `margins-fixer` | 2,5 / 2,5 / 2,5 / 3 cm (gore/desno/dolje/lijevo) | [Predlozak diplomskog rada (Visoko uciliste Algebra, 2017, arhivirano preko Wayback Machine)](https://web.archive.org/web/20211210005533/https://www.algebra.hr/visoko-uciliste/wp-content/uploads/sites/2/2017/11/Diplomski-rad_predlozak.docx) | Prilog "Izrazi ili formule" + sectPr (Wayback 2021 snimka 2017 predloska) |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Sveuciliste Algebra Bernays, specijalisticki rad

`algebra-specijalisticki` · status: verified · vrste rada: specialist

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font (predlozak, currency-rizik) | `font-fixer` | Times New Roman | [Predlozak diplomskog rada (Visoko uciliste Algebra, 2017, arhivirano preko Wayback Machine)](https://web.archive.org/web/20211210005533/https://www.algebra.hr/visoko-uciliste/wp-content/uploads/sites/2/2017/11/Diplomski-rad_predlozak.docx) | Prilog "Izrazi ili formule" + sectPr (Wayback 2021 snimka 2017 predloska) |
| Velicina slova (predlozak, currency-rizik) | `font-fixer` | 12 pt | [Predlozak diplomskog rada (Visoko uciliste Algebra, 2017, arhivirano preko Wayback Machine)](https://web.archive.org/web/20211210005533/https://www.algebra.hr/visoko-uciliste/wp-content/uploads/sites/2/2017/11/Diplomski-rad_predlozak.docx) | Prilog "Izrazi ili formule" + sectPr (Wayback 2021 snimka 2017 predloska) |
| Prored (predlozak, currency-rizik) | `line-spacing-fixer` | prored 1,5 | [Predlozak diplomskog rada (Visoko uciliste Algebra, 2017, arhivirano preko Wayback Machine)](https://web.archive.org/web/20211210005533/https://www.algebra.hr/visoko-uciliste/wp-content/uploads/sites/2/2017/11/Diplomski-rad_predlozak.docx) | Prilog "Izrazi ili formule" + sectPr (Wayback 2021 snimka 2017 predloska) |
| Poravnanje (predlozak, currency-rizik) | `alignment-fixer` | obostrano | [Predlozak diplomskog rada (Visoko uciliste Algebra, 2017, arhivirano preko Wayback Machine)](https://web.archive.org/web/20211210005533/https://www.algebra.hr/visoko-uciliste/wp-content/uploads/sites/2/2017/11/Diplomski-rad_predlozak.docx) | Prilog "Izrazi ili formule" + sectPr (Wayback 2021 snimka 2017 predloska) |
| Format papira A4 (predlozak, currency-rizik) | `paper-size-fixer` | 21 x 29,7 cm | [Predlozak diplomskog rada (Visoko uciliste Algebra, 2017, arhivirano preko Wayback Machine)](https://web.archive.org/web/20211210005533/https://www.algebra.hr/visoko-uciliste/wp-content/uploads/sites/2/2017/11/Diplomski-rad_predlozak.docx) | Prilog "Izrazi ili formule" + sectPr (Wayback 2021 snimka 2017 predloska) |
| Margine (predlozak, currency-rizik) | `margins-fixer` | 2,5 / 2,5 / 2,5 / 3 cm (gore/desno/dolje/lijevo) | [Predlozak diplomskog rada (Visoko uciliste Algebra, 2017, arhivirano preko Wayback Machine)](https://web.archive.org/web/20211210005533/https://www.algebra.hr/visoko-uciliste/wp-content/uploads/sites/2/2017/11/Diplomski-rad_predlozak.docx) | Prilog "Izrazi ili formule" + sectPr (Wayback 2021 snimka 2017 predloska) |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Sveuciliste Algebra Bernays, zavrsni rad

`algebra-zavrsni` · status: verified · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font (predlozak, currency-rizik) | `font-fixer` | Times New Roman | [Predlozak diplomskog rada (Visoko uciliste Algebra, 2017, arhivirano preko Wayback Machine)](https://web.archive.org/web/20211210005533/https://www.algebra.hr/visoko-uciliste/wp-content/uploads/sites/2/2017/11/Diplomski-rad_predlozak.docx) | Prilog "Izrazi ili formule" + sectPr (Wayback 2021 snimka 2017 predloska) |
| Velicina slova (predlozak, currency-rizik) | `font-fixer` | 12 pt | [Predlozak diplomskog rada (Visoko uciliste Algebra, 2017, arhivirano preko Wayback Machine)](https://web.archive.org/web/20211210005533/https://www.algebra.hr/visoko-uciliste/wp-content/uploads/sites/2/2017/11/Diplomski-rad_predlozak.docx) | Prilog "Izrazi ili formule" + sectPr (Wayback 2021 snimka 2017 predloska) |
| Prored (predlozak, currency-rizik) | `line-spacing-fixer` | prored 1,5 | [Predlozak diplomskog rada (Visoko uciliste Algebra, 2017, arhivirano preko Wayback Machine)](https://web.archive.org/web/20211210005533/https://www.algebra.hr/visoko-uciliste/wp-content/uploads/sites/2/2017/11/Diplomski-rad_predlozak.docx) | Prilog "Izrazi ili formule" + sectPr (Wayback 2021 snimka 2017 predloska) |
| Poravnanje (predlozak, currency-rizik) | `alignment-fixer` | obostrano | [Predlozak diplomskog rada (Visoko uciliste Algebra, 2017, arhivirano preko Wayback Machine)](https://web.archive.org/web/20211210005533/https://www.algebra.hr/visoko-uciliste/wp-content/uploads/sites/2/2017/11/Diplomski-rad_predlozak.docx) | Prilog "Izrazi ili formule" + sectPr (Wayback 2021 snimka 2017 predloska) |
| Format papira A4 (predlozak, currency-rizik) | `paper-size-fixer` | 21 x 29,7 cm | [Predlozak diplomskog rada (Visoko uciliste Algebra, 2017, arhivirano preko Wayback Machine)](https://web.archive.org/web/20211210005533/https://www.algebra.hr/visoko-uciliste/wp-content/uploads/sites/2/2017/11/Diplomski-rad_predlozak.docx) | Prilog "Izrazi ili formule" + sectPr (Wayback 2021 snimka 2017 predloska) |
| Margine (predlozak, currency-rizik) | `margins-fixer` | 2,5 / 2,5 / 2,5 / 3 cm (gore/desno/dolje/lijevo) | [Predlozak diplomskog rada (Visoko uciliste Algebra, 2017, arhivirano preko Wayback Machine)](https://web.archive.org/web/20211210005533/https://www.algebra.hr/visoko-uciliste/wp-content/uploads/sites/2/2017/11/Diplomski-rad_predlozak.docx) | Prilog "Izrazi ili formule" + sectPr (Wayback 2021 snimka 2017 predloska) |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### alu

#### Akademija likovnih umjetnosti, diplomski rad

`alu-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Velicina slova (pisano obrazlozenje) | `font-fixer` | 12 pt | [Pravilnik o diplomskom radu i diplomskom ispitu (Akademija likovnih umjetnosti, 2014)](https://www.alu.unizg.hr//alu/cms/upload/dokumenti/PRAVILNIK_O_DIPLOMSKOM_RADU_I_DIPLOMSKOM_ISPITU_lipanj_2014.pdf) | Clanak 32. (Slikarski odsjek) |
| Format papira (pisano obrazlozenje) | `paper-size-fixer` | 21 x 29,7 cm | [Pravilnik o diplomskom radu i diplomskom ispitu (Akademija likovnih umjetnosti, 2014)](https://www.alu.unizg.hr//alu/cms/upload/dokumenti/PRAVILNIK_O_DIPLOMSKOM_RADU_I_DIPLOMSKOM_ISPITU_lipanj_2014.pdf) | Clanak 39. (Kiparski odsjek) |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Akademija likovnih umjetnosti, Kiparski odsjek, diplomski rad

`alu-kiparstvo-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Velicina slova | `font-fixer` | 12 pt | [Pravilnik o diplomskom radu i diplomskom ispitu (Akademija likovnih umjetnosti, 2014)](https://www.alu.unizg.hr//alu/cms/upload/dokumenti/PRAVILNIK_O_DIPLOMSKOM_RADU_I_DIPLOMSKOM_ISPITU_lipanj_2014.pdf) | Clanak 39, 48 (Kiparski odsjek) |
| Format papira A4 (polozeni/landscape - provjera je orijentacijski neutralna) | `paper-size-fixer` | 21 x 29,7 cm | [Pravilnik o diplomskom radu i diplomskom ispitu (Akademija likovnih umjetnosti, 2014)](https://www.alu.unizg.hr//alu/cms/upload/dokumenti/PRAVILNIK_O_DIPLOMSKOM_RADU_I_DIPLOMSKOM_ISPITU_lipanj_2014.pdf) | Clanak 39, 48 (Kiparski odsjek) |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Akademija likovnih umjetnosti, Odsjek za konzerviranje i restauriranje umjetnina, diplomski rad

`alu-konzerviranje-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Times New Roman | [Upute za izradu pisanog dijela diplomskog rada (Odsjek za konzerviranje i restauriranje umjetnina, ALU Zagreb, svibanj 2015)](https://www.alu.unizg.hr/alu/cms/upload/orku/dipl/Upute_za_izradu_pisanog_dijela_diplomskog_rada_OKIRU_2015.pdf) | Clanak 92. Pravilnika o diplomskom radu i diplomskom ispitu ALU (implementirano ovom Uputom) |
| Velicina slova | `font-fixer` | 12 pt | [Upute za izradu pisanog dijela diplomskog rada (Odsjek za konzerviranje i restauriranje umjetnina, ALU Zagreb, svibanj 2015)](https://www.alu.unizg.hr/alu/cms/upload/orku/dipl/Upute_za_izradu_pisanog_dijela_diplomskog_rada_OKIRU_2015.pdf) | Clanak 92. Pravilnika o diplomskom radu i diplomskom ispitu ALU (implementirano ovom Uputom) |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za izradu pisanog dijela diplomskog rada (Odsjek za konzerviranje i restauriranje umjetnina, ALU Zagreb, svibanj 2015)](https://www.alu.unizg.hr/alu/cms/upload/orku/dipl/Upute_za_izradu_pisanog_dijela_diplomskog_rada_OKIRU_2015.pdf) | Clanak 92. Pravilnika o diplomskom radu i diplomskom ispitu ALU (implementirano ovom Uputom) |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Upute za izradu pisanog dijela diplomskog rada (Odsjek za konzerviranje i restauriranje umjetnina, ALU Zagreb, svibanj 2015)](https://www.alu.unizg.hr/alu/cms/upload/orku/dipl/Upute_za_izradu_pisanog_dijela_diplomskog_rada_OKIRU_2015.pdf) | Clanak 92. Pravilnika o diplomskom radu i diplomskom ispitu ALU (implementirano ovom Uputom) |
| Format papira A4 | `paper-size-fixer` | 21 x 29,7 cm | [Upute za izradu pisanog dijela diplomskog rada (Odsjek za konzerviranje i restauriranje umjetnina, ALU Zagreb, svibanj 2015)](https://www.alu.unizg.hr/alu/cms/upload/orku/dipl/Upute_za_izradu_pisanog_dijela_diplomskog_rada_OKIRU_2015.pdf) | Clanak 92. Pravilnika o diplomskom radu i diplomskom ispitu ALU (implementirano ovom Uputom) |
| Poravnanje | `alignment-fixer` | obostrano | [Upute za izradu pisanog dijela diplomskog rada (Odsjek za konzerviranje i restauriranje umjetnina, ALU Zagreb, svibanj 2015)](https://www.alu.unizg.hr/alu/cms/upload/orku/dipl/Upute_za_izradu_pisanog_dijela_diplomskog_rada_OKIRU_2015.pdf) | Clanak 92. Pravilnika o diplomskom radu i diplomskom ispitu ALU (implementirano ovom Uputom) |
| Font i veličina fusnota | `footnote-typography-fixer` | 10 pt |  |  |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Akademija likovnih umjetnosti, Slikarski odsjek, diplomski rad

`alu-slikarstvo-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Velicina slova | `font-fixer` | 12 pt | [Pravilnik o diplomskom radu i diplomskom ispitu (Akademija likovnih umjetnosti, 2014)](https://www.alu.unizg.hr//alu/cms/upload/dokumenti/PRAVILNIK_O_DIPLOMSKOM_RADU_I_DIPLOMSKOM_ISPITU_lipanj_2014.pdf) | Clanak 32 (Slikarski odsjek) |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### apuri

#### Akademija primijenjenih umjetnosti u Rijeci, diplomski rad

`apuri-diplomski` · status: verified · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Vrsta slova | `font-fixer` | Times New Roman | [Pravilnik o diplomskom radu i diplomskom ispitu (APURI, veljaca 2025.) s prilogom Upute za izradu diplomskog rada](https://apuri.uniri.hr/wp-content/uploads/2025/02/Pravilnik-o-diplomskom-radu-i-diplomskom-ispitu-veljaca-2025.pdf) | Upute za pisanje diplomskog rada (sastavni dio Pravilnika, čl. 8), odjeljak "Oblikovanje teksta" |
| Veličina slova | `font-fixer` | 12 pt | [Pravilnik o diplomskom radu i diplomskom ispitu (APURI, veljaca 2025.) s prilogom Upute za izradu diplomskog rada](https://apuri.uniri.hr/wp-content/uploads/2025/02/Pravilnik-o-diplomskom-radu-i-diplomskom-ispitu-veljaca-2025.pdf) | Upute za pisanje diplomskog rada (sastavni dio Pravilnika, čl. 8), odjeljak "Oblikovanje teksta" |
| Prored | `line-spacing-fixer` | prored 1,5 | [Pravilnik o diplomskom radu i diplomskom ispitu (APURI, veljaca 2025.) s prilogom Upute za izradu diplomskog rada](https://apuri.uniri.hr/wp-content/uploads/2025/02/Pravilnik-o-diplomskom-radu-i-diplomskom-ispitu-veljaca-2025.pdf) | Upute za pisanje diplomskog rada (sastavni dio Pravilnika, čl. 8), odjeljak "Oblikovanje teksta" |
| Poravnanje | `alignment-fixer` | obostrano | [Pravilnik o diplomskom radu i diplomskom ispitu (APURI, veljaca 2025.) s prilogom Upute za izradu diplomskog rada](https://apuri.uniri.hr/wp-content/uploads/2025/02/Pravilnik-o-diplomskom-radu-i-diplomskom-ispitu-veljaca-2025.pdf) | Upute za pisanje diplomskog rada (sastavni dio Pravilnika, čl. 8), odjeljak "Oblikovanje teksta" |
| Font i veličina fusnota | `footnote-typography-fixer` | 10 pt |  |  |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Sadrzaj kao zivo TOC polje | `toc-field-fixer` | Word sam azurira sadrzaj<br><sub>Dokument ima naslov Sadrzaj, a jos nema zivo TOC polje. Nedestruktivno: rucne stavke se ne brisu.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Akademija primijenjenih umjetnosti u Rijeci, zavrsni rad

`apuri-zavrsni` · status: verified · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Pravilnik o zavrsnom radu na sveucilisnim prijediplomskim studijima (APURI, 27.03.2025.)](https://apuri.uniri.hr/wp-content/uploads/2025/04/Pravilnik-o-zavrsnom-radu-na-sveucilisnim-prijediplomskim-studijima.pdf) | Članak 7. (glava III. Oblikovanje završnog rada) |
| Vrsta slova | `font-fixer` | Times New Roman | [Pravilnik o zavrsnom radu na sveucilisnim prijediplomskim studijima (APURI, 27.03.2025.)](https://apuri.uniri.hr/wp-content/uploads/2025/04/Pravilnik-o-zavrsnom-radu-na-sveucilisnim-prijediplomskim-studijima.pdf) | Članak 7. (glava III. Oblikovanje završnog rada) |
| Veličina slova | `font-fixer` | 12 pt | [Pravilnik o zavrsnom radu na sveucilisnim prijediplomskim studijima (APURI, 27.03.2025.)](https://apuri.uniri.hr/wp-content/uploads/2025/04/Pravilnik-o-zavrsnom-radu-na-sveucilisnim-prijediplomskim-studijima.pdf) | Članak 7. (glava III. Oblikovanje završnog rada) |
| Prored | `line-spacing-fixer` | prored 1,5 | [Pravilnik o zavrsnom radu na sveucilisnim prijediplomskim studijima (APURI, 27.03.2025.)](https://apuri.uniri.hr/wp-content/uploads/2025/04/Pravilnik-o-zavrsnom-radu-na-sveucilisnim-prijediplomskim-studijima.pdf) | Članak 7. (glava III. Oblikovanje završnog rada) |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Pravilnik o zavrsnom radu na sveucilisnim prijediplomskim studijima (APURI, 27.03.2025.)](https://apuri.uniri.hr/wp-content/uploads/2025/04/Pravilnik-o-zavrsnom-radu-na-sveucilisnim-prijediplomskim-studijima.pdf) | Članak 7. (glava III. Oblikovanje završnog rada) |
| Poravnanje | `alignment-fixer` | obostrano | [Pravilnik o zavrsnom radu na sveucilisnim prijediplomskim studijima (APURI, 27.03.2025.)](https://apuri.uniri.hr/wp-content/uploads/2025/04/Pravilnik-o-zavrsnom-radu-na-sveucilisnim-prijediplomskim-studijima.pdf) | Članak 7. (glava III. Oblikovanje završnog rada) |
| Font i veličina fusnota | `footnote-typography-fixer` | 10 pt |  |  |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### arca

#### Veleuciliste Arca (Split), zavrsni rad

`arca-zavrsni` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Pravilnik o završnom radu Veleučilišta Arca (17.04.2023.)](https://api.velarca.hr/dokument/pravilnik-o-zavrsnom-radu-veleuciliste-arca-2/pravilnik-o-zavrsnom-radu-veleuciliste-arca-2/) | Prilog 3 (naslovnica), str. 9 PDF-a |
| Vrsta slova | `font-fixer` | Times New Roman | [Pravilnik o završnom radu Veleučilišta Arca (17.04.2023.)](https://api.velarca.hr/dokument/pravilnik-o-zavrsnom-radu-veleuciliste-arca-2/pravilnik-o-zavrsnom-radu-veleuciliste-arca-2/) | Prilog 3 (naslovnica), str. 9-10 PDF-a |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### arh

#### Arhitektonski fakultet, diplomski rad

`arh-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format knjizice (A3) i izlozbenog postera (A0) | `paper-size-fixer` | 29,7 x 42 cm | [Pravilnik o diplomskom radu Arhitektonskog fakulteta Sveucilista u Zagrebu na diplomskom studiju arhitekture i urbanizma (ak.god. 2012./2013.)](https://www.arhitekt.hr/files/file/javni-dokumenti/Pravilnik%20o%20diplomskom%20radu.pdf) | clanak 16. |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Sadrzaj kao zivo TOC polje | `toc-field-fixer` | Word sam azurira sadrzaj<br><sub>Dokument ima naslov Sadrzaj, a jos nema zivo TOC polje. Nedestruktivno: rucne stavke se ne brisu.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Arhitektonski fakultet, doktorski rad

`arh-doktorski` · status: partial · vrste rada: doctoral

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Times New Roman | [Upute za oblikovanje doktorskog rada (Obrazac DR.SC.-08)](https://www.unizg.hr/nc/vijest/article/obrasci-za-doktorski-studij/) | odjeljak 'Postavke stranice' (DR.SC.-08, Upute za oblikovanje doktorskog rada) |
| Velicina slova | `font-fixer` | 12 pt | [Upute za oblikovanje doktorskog rada (Obrazac DR.SC.-08)](https://www.unizg.hr/nc/vijest/article/obrasci-za-doktorski-studij/) | odjeljak 'Postavke stranice' (DR.SC.-08, Upute za oblikovanje doktorskog rada) |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za oblikovanje doktorskog rada (Obrazac DR.SC.-08)](https://www.unizg.hr/nc/vijest/article/obrasci-za-doktorski-studij/) | odjeljak 'Postavke stranice' (DR.SC.-08, Upute za oblikovanje doktorskog rada) |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Upute za oblikovanje doktorskog rada (Obrazac DR.SC.-08)](https://www.unizg.hr/nc/vijest/article/obrasci-za-doktorski-studij/) | odjeljak 'Postavke stranice' (DR.SC.-08, Upute za oblikovanje doktorskog rada) |
| Format papira A4 | `paper-size-fixer` | 21 x 29,7 cm | [Upute za oblikovanje doktorskog rada (Obrazac DR.SC.-08)](https://www.unizg.hr/nc/vijest/article/obrasci-za-doktorski-studij/) | odjeljak 'Postavke stranice' (DR.SC.-08, Upute za oblikovanje doktorskog rada) |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### aspira

#### Veleučilište Aspira, diplomski rad

`aspira-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Times New Roman | [Pravilnik o izgledu zavrsnog i diplomskog rada (ASP-P/033 v.6, 14.07.2023.)](https://www.aspira.hr/wp-content/uploads/2023/10/Pravilnik-o-izgledu-zavrsnog-i-diplomskog-rada.pdf) | Clanak 6., stavci 4-9 (str. 2 od 5) |
| Velicina slova | `font-fixer` | 12 pt | [Pravilnik o izgledu zavrsnog i diplomskog rada (ASP-P/033 v.6, 14.07.2023.)](https://www.aspira.hr/wp-content/uploads/2023/10/Pravilnik-o-izgledu-zavrsnog-i-diplomskog-rada.pdf) | Clanak 6., stavci 4-9 (str. 2 od 5) |
| Prored | `line-spacing-fixer` | prored 1,5 | [Pravilnik o izgledu zavrsnog i diplomskog rada (ASP-P/033 v.6, 14.07.2023.)](https://www.aspira.hr/wp-content/uploads/2023/10/Pravilnik-o-izgledu-zavrsnog-i-diplomskog-rada.pdf) | Clanak 6., stavci 4-9 (str. 2 od 5) |
| Format papira A4 | `paper-size-fixer` | 21 x 29,7 cm | [Pravilnik o izgledu zavrsnog i diplomskog rada (ASP-P/033 v.6, 14.07.2023.)](https://www.aspira.hr/wp-content/uploads/2023/10/Pravilnik-o-izgledu-zavrsnog-i-diplomskog-rada.pdf) | Clanak 6., stavci 4-9 (str. 2 od 5) |
| Poravnanje | `alignment-fixer` | obostrano | [Pravilnik o izgledu zavrsnog i diplomskog rada (ASP-P/033 v.6, 14.07.2023.)](https://www.aspira.hr/wp-content/uploads/2023/10/Pravilnik-o-izgledu-zavrsnog-i-diplomskog-rada.pdf) | Clanak 6., stavci 4-9 (str. 2 od 5) |
| Font i veličina fusnota | `footnote-typography-fixer` | 10 pt |  |  |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Veleučilište Aspira, diplomski rad (engleski)

`aspira-diplomski-en` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Times New Roman | [Pravilnik o izgledu zavrsnog i diplomskog rada (ASP-P/033 v.6, 14.07.2023.)](https://www.aspira.hr/wp-content/uploads/2023/10/Pravilnik-o-izgledu-zavrsnog-i-diplomskog-rada.pdf) | Clanak 6., stavci 4-9 (str. 2 od 5) |
| Velicina slova | `font-fixer` | 12 pt | [Pravilnik o izgledu zavrsnog i diplomskog rada (ASP-P/033 v.6, 14.07.2023.)](https://www.aspira.hr/wp-content/uploads/2023/10/Pravilnik-o-izgledu-zavrsnog-i-diplomskog-rada.pdf) | Clanak 6., stavci 4-9 (str. 2 od 5) |
| Prored | `line-spacing-fixer` | prored 1,5 | [Pravilnik o izgledu zavrsnog i diplomskog rada (ASP-P/033 v.6, 14.07.2023.)](https://www.aspira.hr/wp-content/uploads/2023/10/Pravilnik-o-izgledu-zavrsnog-i-diplomskog-rada.pdf) | Clanak 6., stavci 4-9 (str. 2 od 5) |
| Format papira A4 | `paper-size-fixer` | 21 x 29,7 cm | [Pravilnik o izgledu zavrsnog i diplomskog rada (ASP-P/033 v.6, 14.07.2023.)](https://www.aspira.hr/wp-content/uploads/2023/10/Pravilnik-o-izgledu-zavrsnog-i-diplomskog-rada.pdf) | Clanak 6., stavci 4-9 (str. 2 od 5) |
| Poravnanje | `alignment-fixer` | obostrano | [Pravilnik o izgledu zavrsnog i diplomskog rada (ASP-P/033 v.6, 14.07.2023.)](https://www.aspira.hr/wp-content/uploads/2023/10/Pravilnik-o-izgledu-zavrsnog-i-diplomskog-rada.pdf) | Clanak 6., stavci 4-9 (str. 2 od 5) |
| Font i veličina fusnota | `footnote-typography-fixer` | 10 pt |  |  |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Veleučilište Aspira, završni rad

`aspira-zavrsni` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Times New Roman | [Pravilnik o izgledu zavrsnog i diplomskog rada (ASP-P/033 v.6, 14.07.2023.)](https://www.aspira.hr/wp-content/uploads/2023/10/Pravilnik-o-izgledu-zavrsnog-i-diplomskog-rada.pdf) | Clanak 6., stavci 4-9 (str. 2 od 5) |
| Velicina slova | `font-fixer` | 12 pt | [Pravilnik o izgledu zavrsnog i diplomskog rada (ASP-P/033 v.6, 14.07.2023.)](https://www.aspira.hr/wp-content/uploads/2023/10/Pravilnik-o-izgledu-zavrsnog-i-diplomskog-rada.pdf) | Clanak 6., stavci 4-9 (str. 2 od 5) |
| Prored | `line-spacing-fixer` | prored 1,5 | [Pravilnik o izgledu zavrsnog i diplomskog rada (ASP-P/033 v.6, 14.07.2023.)](https://www.aspira.hr/wp-content/uploads/2023/10/Pravilnik-o-izgledu-zavrsnog-i-diplomskog-rada.pdf) | Clanak 6., stavci 4-9 (str. 2 od 5) |
| Format papira A4 | `paper-size-fixer` | 21 x 29,7 cm | [Pravilnik o izgledu zavrsnog i diplomskog rada (ASP-P/033 v.6, 14.07.2023.)](https://www.aspira.hr/wp-content/uploads/2023/10/Pravilnik-o-izgledu-zavrsnog-i-diplomskog-rada.pdf) | Clanak 6., stavci 4-9 (str. 2 od 5) |
| Poravnanje | `alignment-fixer` | obostrano | [Pravilnik o izgledu zavrsnog i diplomskog rada (ASP-P/033 v.6, 14.07.2023.)](https://www.aspira.hr/wp-content/uploads/2023/10/Pravilnik-o-izgledu-zavrsnog-i-diplomskog-rada.pdf) | Clanak 6., stavci 4-9 (str. 2 od 5) |
| Font i veličina fusnota | `footnote-typography-fixer` | 10 pt |  |  |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Veleučilište Aspira, završni rad (engleski)

`aspira-zavrsni-en` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Times New Roman | [Pravilnik o izgledu zavrsnog i diplomskog rada (ASP-P/033 v.6, 14.07.2023.)](https://www.aspira.hr/wp-content/uploads/2023/10/Pravilnik-o-izgledu-zavrsnog-i-diplomskog-rada.pdf) | Clanak 6., stavci 4-9 (str. 2 od 5) |
| Velicina slova | `font-fixer` | 12 pt | [Pravilnik o izgledu zavrsnog i diplomskog rada (ASP-P/033 v.6, 14.07.2023.)](https://www.aspira.hr/wp-content/uploads/2023/10/Pravilnik-o-izgledu-zavrsnog-i-diplomskog-rada.pdf) | Clanak 6., stavci 4-9 (str. 2 od 5) |
| Prored | `line-spacing-fixer` | prored 1,5 | [Pravilnik o izgledu zavrsnog i diplomskog rada (ASP-P/033 v.6, 14.07.2023.)](https://www.aspira.hr/wp-content/uploads/2023/10/Pravilnik-o-izgledu-zavrsnog-i-diplomskog-rada.pdf) | Clanak 6., stavci 4-9 (str. 2 od 5) |
| Format papira A4 | `paper-size-fixer` | 21 x 29,7 cm | [Pravilnik o izgledu zavrsnog i diplomskog rada (ASP-P/033 v.6, 14.07.2023.)](https://www.aspira.hr/wp-content/uploads/2023/10/Pravilnik-o-izgledu-zavrsnog-i-diplomskog-rada.pdf) | Clanak 6., stavci 4-9 (str. 2 od 5) |
| Poravnanje | `alignment-fixer` | obostrano | [Pravilnik o izgledu zavrsnog i diplomskog rada (ASP-P/033 v.6, 14.07.2023.)](https://www.aspira.hr/wp-content/uploads/2023/10/Pravilnik-o-izgledu-zavrsnog-i-diplomskog-rada.pdf) | Clanak 6., stavci 4-9 (str. 2 od 5) |
| Font i veličina fusnota | `footnote-typography-fixer` | 10 pt |  |  |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### bak

#### Veleučilište Baltazar Zapresic, diplomski rad

`bak-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Times New Roman | [Uputa za izradu zavrsnih i diplomskih radova (Veleuciliste Baltazar Zapresic, 2025)](https://www.bak.hr/wp-content/uploads/2025/02/Uputa-za-izradu-zavrsnih-i-diplomskih-radova-2025.pdf) | Odjeljak "Tehnicko oblikovanje rada", str. 6-7 |
| Velicina slova | `font-fixer` | 12 pt | [Uputa za izradu zavrsnih i diplomskih radova (Veleuciliste Baltazar Zapresic, 2025)](https://www.bak.hr/wp-content/uploads/2025/02/Uputa-za-izradu-zavrsnih-i-diplomskih-radova-2025.pdf) | Odjeljak "Tehnicko oblikovanje rada", str. 6-7 |
| Prored | `line-spacing-fixer` | prored 1,5 | [Uputa za izradu zavrsnih i diplomskih radova (Veleuciliste Baltazar Zapresic, 2025)](https://www.bak.hr/wp-content/uploads/2025/02/Uputa-za-izradu-zavrsnih-i-diplomskih-radova-2025.pdf) | Odjeljak "Tehnicko oblikovanje rada", str. 6-7 |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Uputa za izradu zavrsnih i diplomskih radova (Veleuciliste Baltazar Zapresic, 2025)](https://www.bak.hr/wp-content/uploads/2025/02/Uputa-za-izradu-zavrsnih-i-diplomskih-radova-2025.pdf) | Odjeljak "Tehnicko oblikovanje rada", str. 6-7 |
| Format papira A4 | `paper-size-fixer` | 21 x 29,7 cm | [Uputa za izradu zavrsnih i diplomskih radova (Veleuciliste Baltazar Zapresic, 2025)](https://www.bak.hr/wp-content/uploads/2025/02/Uputa-za-izradu-zavrsnih-i-diplomskih-radova-2025.pdf) | Odjeljak "Tehnicko oblikovanje rada", str. 6-7 |
| Poravnanje | `alignment-fixer` | obostrano | [Uputa za izradu zavrsnih i diplomskih radova (Veleuciliste Baltazar Zapresic, 2025)](https://www.bak.hr/wp-content/uploads/2025/02/Uputa-za-izradu-zavrsnih-i-diplomskih-radova-2025.pdf) | Odjeljak "Tehnicko oblikovanje rada", str. 6-7 |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Veleučilište Baltazar Zapresic, završni rad

`bak-zavrsni` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Times New Roman | [Uputa za izradu zavrsnih i diplomskih radova (Veleuciliste Baltazar Zapresic, 2025)](https://www.bak.hr/wp-content/uploads/2025/02/Uputa-za-izradu-zavrsnih-i-diplomskih-radova-2025.pdf) | Odjeljak "Tehnicko oblikovanje rada", str. 6-7 |
| Velicina slova | `font-fixer` | 12 pt | [Uputa za izradu zavrsnih i diplomskih radova (Veleuciliste Baltazar Zapresic, 2025)](https://www.bak.hr/wp-content/uploads/2025/02/Uputa-za-izradu-zavrsnih-i-diplomskih-radova-2025.pdf) | Odjeljak "Tehnicko oblikovanje rada", str. 6-7 |
| Prored | `line-spacing-fixer` | prored 1,5 | [Uputa za izradu zavrsnih i diplomskih radova (Veleuciliste Baltazar Zapresic, 2025)](https://www.bak.hr/wp-content/uploads/2025/02/Uputa-za-izradu-zavrsnih-i-diplomskih-radova-2025.pdf) | Odjeljak "Tehnicko oblikovanje rada", str. 6-7 |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Uputa za izradu zavrsnih i diplomskih radova (Veleuciliste Baltazar Zapresic, 2025)](https://www.bak.hr/wp-content/uploads/2025/02/Uputa-za-izradu-zavrsnih-i-diplomskih-radova-2025.pdf) | Odjeljak "Tehnicko oblikovanje rada", str. 6-7 |
| Format papira A4 | `paper-size-fixer` | 21 x 29,7 cm | [Uputa za izradu zavrsnih i diplomskih radova (Veleuciliste Baltazar Zapresic, 2025)](https://www.bak.hr/wp-content/uploads/2025/02/Uputa-za-izradu-zavrsnih-i-diplomskih-radova-2025.pdf) | Odjeljak "Tehnicko oblikovanje rada", str. 6-7 |
| Poravnanje | `alignment-fixer` | obostrano | [Uputa za izradu zavrsnih i diplomskih radova (Veleuciliste Baltazar Zapresic, 2025)](https://www.bak.hr/wp-content/uploads/2025/02/Uputa-za-izradu-zavrsnih-i-diplomskih-radova-2025.pdf) | Odjeljak "Tehnicko oblikovanje rada", str. 6-7 |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### biolos

#### Odjel za biologiju Osijek, diplomski rad

`biolos-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Times New Roman | [Pravilnik o diplomskom radu i diplomskim ispitima (Odjel za biologiju, Osijek, listopad 2023)](https://www.biologija.unios.hr/wp-content/uploads/2023/10/pravilnik-o-dipl-radu-i-dipl-ispitima102023.pdf) | Prilog "Upute za izradu diplomskog rada", str. 5 |
| Velicina slova | `font-fixer` | 12 pt | [Pravilnik o diplomskom radu i diplomskim ispitima (Odjel za biologiju, Osijek, listopad 2023)](https://www.biologija.unios.hr/wp-content/uploads/2023/10/pravilnik-o-dipl-radu-i-dipl-ispitima102023.pdf) | Prilog "Upute za izradu diplomskog rada", str. 5 |
| Prored | `line-spacing-fixer` | prored 1,5 | [Pravilnik o diplomskom radu i diplomskim ispitima (Odjel za biologiju, Osijek, listopad 2023)](https://www.biologija.unios.hr/wp-content/uploads/2023/10/pravilnik-o-dipl-radu-i-dipl-ispitima102023.pdf) | Prilog "Upute za izradu diplomskog rada", str. 5 |
| Margine (lijeva 3cm) | `margins-fixer` | 2,5 / 2,5 / 2,5 / 3 cm (gore/desno/dolje/lijevo) | [Pravilnik o diplomskom radu i diplomskim ispitima (Odjel za biologiju, Osijek, listopad 2023)](https://www.biologija.unios.hr/wp-content/uploads/2023/10/pravilnik-o-dipl-radu-i-dipl-ispitima102023.pdf) | Prilog "Upute za izradu diplomskog rada", str. 5 |
| Format papira A4 | `paper-size-fixer` | 21 x 29,7 cm | [Pravilnik o diplomskom radu i diplomskim ispitima (Odjel za biologiju, Osijek, listopad 2023)](https://www.biologija.unios.hr/wp-content/uploads/2023/10/pravilnik-o-dipl-radu-i-dipl-ispitima102023.pdf) | Prilog "Upute za izradu diplomskog rada", str. 5 |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Odjel za biologiju Osijek, završni rad

`biolos-zavrsni` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Times New Roman | [Pravilnik o zavrsnom radu (Odjel za biologiju, Osijek, rujan 2023)](https://www.biologija.unios.hr/wp-content/uploads/2023/09/pravilnik-o-zavrsnom-radu-08092023.pdf) | Prilog "Upute za izradu zavrsnog rada", str. 4 |
| Velicina slova | `font-fixer` | 12 pt | [Pravilnik o zavrsnom radu (Odjel za biologiju, Osijek, rujan 2023)](https://www.biologija.unios.hr/wp-content/uploads/2023/09/pravilnik-o-zavrsnom-radu-08092023.pdf) | Prilog "Upute za izradu zavrsnog rada", str. 4 |
| Prored | `line-spacing-fixer` | prored 1,5 | [Pravilnik o zavrsnom radu (Odjel za biologiju, Osijek, rujan 2023)](https://www.biologija.unios.hr/wp-content/uploads/2023/09/pravilnik-o-zavrsnom-radu-08092023.pdf) | Prilog "Upute za izradu zavrsnog rada", str. 4 |
| Margine (lijeva 3cm) | `margins-fixer` | 2,5 / 2,5 / 2,5 / 3 cm (gore/desno/dolje/lijevo) | [Pravilnik o zavrsnom radu (Odjel za biologiju, Osijek, rujan 2023)](https://www.biologija.unios.hr/wp-content/uploads/2023/09/pravilnik-o-zavrsnom-radu-08092023.pdf) | Prilog "Upute za izradu zavrsnog rada", str. 4 |
| Format papira A4 | `paper-size-fixer` | 21 x 29,7 cm | [Pravilnik o zavrsnom radu (Odjel za biologiju, Osijek, rujan 2023)](https://www.biologija.unios.hr/wp-content/uploads/2023/09/pravilnik-o-zavrsnom-radu-08092023.pdf) | Prilog "Upute za izradu zavrsnog rada", str. 4 |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### biotech

#### Rijeka - Biotehnologija, diplomski rad

`biotech-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Vrsta slova | `font-fixer` | Verdana | [Postupak za prijavu, oblikovanje i obranu završnog i diplomskog rada (Biotehnologija, Rijeka)](https://biotech.uniri.hr/files/Studenti/Upute_Zavrsni_Diplomski_10_04.pdf) | Postupak, 3.4 Jezik i graficki elementi |
| Velicina slova | `font-fixer` | 12 pt | [Postupak za prijavu, oblikovanje i obranu završnog i diplomskog rada (Biotehnologija, Rijeka)](https://biotech.uniri.hr/files/Studenti/Upute_Zavrsni_Diplomski_10_04.pdf) | Postupak, 3.4 Jezik i graficki elementi |
| Prored | `line-spacing-fixer` | prored 1,5 | [Postupak za prijavu, oblikovanje i obranu završnog i diplomskog rada (Biotehnologija, Rijeka)](https://biotech.uniri.hr/files/Studenti/Upute_Zavrsni_Diplomski_10_04.pdf) | Postupak, 3.4 Jezik i graficki elementi |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Rijeka - Biotehnologija, završni rad

`biotech-zavrsni` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Vrsta slova | `font-fixer` | Verdana | [Postupak za prijavu, oblikovanje i obranu završnog i diplomskog rada (Biotehnologija, Rijeka)](https://biotech.uniri.hr/files/Studenti/Upute_Zavrsni_Diplomski_10_04.pdf) | Postupak, 3.4 Jezik i graficki elementi |
| Velicina slova | `font-fixer` | 12 pt | [Postupak za prijavu, oblikovanje i obranu završnog i diplomskog rada (Biotehnologija, Rijeka)](https://biotech.uniri.hr/files/Studenti/Upute_Zavrsni_Diplomski_10_04.pdf) | Postupak, 3.4 Jezik i graficki elementi |
| Prored | `line-spacing-fixer` | prored 1,5 | [Postupak za prijavu, oblikovanje i obranu završnog i diplomskog rada (Biotehnologija, Rijeka)](https://biotech.uniri.hr/files/Studenti/Upute_Zavrsni_Diplomski_10_04.pdf) | Postupak, 3.4 Jezik i graficki elementi |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### btho

#### Slavonski Brod - Biotehnicki odjel, diplomski rad

`unisb-btho-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Times New Roman | [Upute za izradu Zavrsnog rada/Diplomskog rada na Sveucilistu u Slavonskom Brodu (Senat, 28.6.2024)](https://unisbhr.sharepoint.com/:b:/s/WebRepozitorij/EUi-Gv2SQ39ErLqIGqAKn-sBKzD3H-jXP_XPsrcpZms7YQ) | Clanak 3. (Oblik i sadrzaj rada) |
| Velicina slova | `font-fixer` | 12 pt | [Upute za izradu Zavrsnog rada/Diplomskog rada na Sveucilistu u Slavonskom Brodu (Senat, 28.6.2024)](https://unisbhr.sharepoint.com/:b:/s/WebRepozitorij/EUi-Gv2SQ39ErLqIGqAKn-sBKzD3H-jXP_XPsrcpZms7YQ) | Clanak 3. (Oblik i sadrzaj rada) |
| Prored (jednostruki) | `line-spacing-fixer` | prored 1 | [Upute za izradu Zavrsnog rada/Diplomskog rada na Sveucilistu u Slavonskom Brodu (Senat, 28.6.2024)](https://unisbhr.sharepoint.com/:b:/s/WebRepozitorij/EUi-Gv2SQ39ErLqIGqAKn-sBKzD3H-jXP_XPsrcpZms7YQ) | Clanak 3. (Oblik i sadrzaj rada) |
| Margine (uvezni rub lijevo 2,5 cm) | `margins-fixer` | 2 / 2 / 2 / 2,5 cm (gore/desno/dolje/lijevo) | [Upute za izradu Zavrsnog rada/Diplomskog rada na Sveucilistu u Slavonskom Brodu (Senat, 28.6.2024)](https://unisbhr.sharepoint.com/:b:/s/WebRepozitorij/EUi-Gv2SQ39ErLqIGqAKn-sBKzD3H-jXP_XPsrcpZms7YQ) | Clanak 3. (Oblik i sadrzaj rada) |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Slavonski Brod - Biotehnicki odjel, završni rad

`unisb-btho-zavrsni` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Times New Roman | [Upute za izradu Zavrsnog rada/Diplomskog rada na Sveucilistu u Slavonskom Brodu (Senat, 28.6.2024)](https://unisbhr.sharepoint.com/:b:/s/WebRepozitorij/EUi-Gv2SQ39ErLqIGqAKn-sBKzD3H-jXP_XPsrcpZms7YQ) | Clanak 3. (Oblik i sadrzaj rada) |
| Velicina slova | `font-fixer` | 12 pt | [Upute za izradu Zavrsnog rada/Diplomskog rada na Sveucilistu u Slavonskom Brodu (Senat, 28.6.2024)](https://unisbhr.sharepoint.com/:b:/s/WebRepozitorij/EUi-Gv2SQ39ErLqIGqAKn-sBKzD3H-jXP_XPsrcpZms7YQ) | Clanak 3. (Oblik i sadrzaj rada) |
| Prored (jednostruki) | `line-spacing-fixer` | prored 1 | [Upute za izradu Zavrsnog rada/Diplomskog rada na Sveucilistu u Slavonskom Brodu (Senat, 28.6.2024)](https://unisbhr.sharepoint.com/:b:/s/WebRepozitorij/EUi-Gv2SQ39ErLqIGqAKn-sBKzD3H-jXP_XPsrcpZms7YQ) | Clanak 3. (Oblik i sadrzaj rada) |
| Margine (uvezni rub lijevo 2,5 cm) | `margins-fixer` | 2 / 2 / 2 / 2,5 cm (gore/desno/dolje/lijevo) | [Upute za izradu Zavrsnog rada/Diplomskog rada na Sveucilistu u Slavonskom Brodu (Senat, 28.6.2024)](https://unisbhr.sharepoint.com/:b:/s/WebRepozitorij/EUi-Gv2SQ39ErLqIGqAKn-sBKzD3H-jXP_XPsrcpZms7YQ) | Clanak 3. (Oblik i sadrzaj rada) |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### effectus

#### Effectus, diplomski rad

`effectus-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Pravilnik o izradi i obrani zavrsnog i diplomskog rada s Uputama (Effectus, 2023)](https://effectus.com.hr/wp-content/uploads/2023/03/Pravilnik-o-izradi-i-obrani-zavrsnog-i-diplomskog-rada_2023.pdf) | Upute (Prilog 1), tč. 3 Tehnicki detalji (str. 4) |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Pravilnik o izradi i obrani zavrsnog i diplomskog rada s Uputama (Effectus, 2023)](https://effectus.com.hr/wp-content/uploads/2023/03/Pravilnik-o-izradi-i-obrani-zavrsnog-i-diplomskog-rada_2023.pdf) | Upute (Prilog 1), tč. 3 Tehnicki detalji (str. 4) |
| Vrsta slova | `font-fixer` | Times New Roman | [Pravilnik o izradi i obrani zavrsnog i diplomskog rada s Uputama (Effectus, 2023)](https://effectus.com.hr/wp-content/uploads/2023/03/Pravilnik-o-izradi-i-obrani-zavrsnog-i-diplomskog-rada_2023.pdf) | Upute (Prilog 1), tč. 3 Tehnicki detalji (str. 4) |
| Velicina slova | `font-fixer` | 12 pt | [Pravilnik o izradi i obrani zavrsnog i diplomskog rada s Uputama (Effectus, 2023)](https://effectus.com.hr/wp-content/uploads/2023/03/Pravilnik-o-izradi-i-obrani-zavrsnog-i-diplomskog-rada_2023.pdf) | Upute (Prilog 1), tč. 3 Tehnicki detalji (str. 4) |
| Obostrano poravnanje | `alignment-fixer` | obostrano | [Pravilnik o izradi i obrani zavrsnog i diplomskog rada s Uputama (Effectus, 2023)](https://effectus.com.hr/wp-content/uploads/2023/03/Pravilnik-o-izradi-i-obrani-zavrsnog-i-diplomskog-rada_2023.pdf) | Upute (Prilog 1), tč. 3 Tehnicki detalji (str. 4) |
| Prored | `line-spacing-fixer` | prored 1,15 | [Pravilnik o izradi i obrani zavrsnog i diplomskog rada s Uputama (Effectus, 2023)](https://effectus.com.hr/wp-content/uploads/2023/03/Pravilnik-o-izradi-i-obrani-zavrsnog-i-diplomskog-rada_2023.pdf) | Upute (Prilog 1), tč. 3 Tehnicki detalji (str. 4) |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Effectus, seminarski rad

`effectus-seminarski` · status: partial · vrste rada: seminar

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Pravilnik o izradi i obrani zavrsnog i diplomskog rada s Uputama (Effectus, 2023)](https://effectus.com.hr/wp-content/uploads/2023/03/Pravilnik-o-izradi-i-obrani-zavrsnog-i-diplomskog-rada_2023.pdf) | Upute (Prilog 1), tč. 3 Tehnicki detalji (str. 4) |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Pravilnik o izradi i obrani zavrsnog i diplomskog rada s Uputama (Effectus, 2023)](https://effectus.com.hr/wp-content/uploads/2023/03/Pravilnik-o-izradi-i-obrani-zavrsnog-i-diplomskog-rada_2023.pdf) | Upute (Prilog 1), tč. 3 Tehnicki detalji (str. 4) |
| Vrsta slova | `font-fixer` | Times New Roman | [Pravilnik o izradi i obrani zavrsnog i diplomskog rada s Uputama (Effectus, 2023)](https://effectus.com.hr/wp-content/uploads/2023/03/Pravilnik-o-izradi-i-obrani-zavrsnog-i-diplomskog-rada_2023.pdf) | Upute (Prilog 1), tč. 3 Tehnicki detalji (str. 4) |
| Velicina slova | `font-fixer` | 12 pt | [Pravilnik o izradi i obrani zavrsnog i diplomskog rada s Uputama (Effectus, 2023)](https://effectus.com.hr/wp-content/uploads/2023/03/Pravilnik-o-izradi-i-obrani-zavrsnog-i-diplomskog-rada_2023.pdf) | Upute (Prilog 1), tč. 3 Tehnicki detalji (str. 4) |
| Obostrano poravnanje | `alignment-fixer` | obostrano | [Pravilnik o izradi i obrani zavrsnog i diplomskog rada s Uputama (Effectus, 2023)](https://effectus.com.hr/wp-content/uploads/2023/03/Pravilnik-o-izradi-i-obrani-zavrsnog-i-diplomskog-rada_2023.pdf) | Upute (Prilog 1), tč. 3 Tehnicki detalji (str. 4) |
| Prored | `line-spacing-fixer` | prored 1,15 | [Pravilnik o izradi i obrani zavrsnog i diplomskog rada s Uputama (Effectus, 2023)](https://effectus.com.hr/wp-content/uploads/2023/03/Pravilnik-o-izradi-i-obrani-zavrsnog-i-diplomskog-rada_2023.pdf) | Upute (Prilog 1), tč. 3 Tehnicki detalji (str. 4) |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Effectus, završni rad

`effectus-zavrsni` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Pravilnik o izradi i obrani zavrsnog i diplomskog rada s Uputama (Effectus, 2023)](https://effectus.com.hr/wp-content/uploads/2023/03/Pravilnik-o-izradi-i-obrani-zavrsnog-i-diplomskog-rada_2023.pdf) | Upute (Prilog 1), tč. 3 Tehnicki detalji (str. 4) |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Pravilnik o izradi i obrani zavrsnog i diplomskog rada s Uputama (Effectus, 2023)](https://effectus.com.hr/wp-content/uploads/2023/03/Pravilnik-o-izradi-i-obrani-zavrsnog-i-diplomskog-rada_2023.pdf) | Upute (Prilog 1), tč. 3 Tehnicki detalji (str. 4) |
| Vrsta slova | `font-fixer` | Times New Roman | [Pravilnik o izradi i obrani zavrsnog i diplomskog rada s Uputama (Effectus, 2023)](https://effectus.com.hr/wp-content/uploads/2023/03/Pravilnik-o-izradi-i-obrani-zavrsnog-i-diplomskog-rada_2023.pdf) | Upute (Prilog 1), tč. 3 Tehnicki detalji (str. 4) |
| Velicina slova | `font-fixer` | 12 pt | [Pravilnik o izradi i obrani zavrsnog i diplomskog rada s Uputama (Effectus, 2023)](https://effectus.com.hr/wp-content/uploads/2023/03/Pravilnik-o-izradi-i-obrani-zavrsnog-i-diplomskog-rada_2023.pdf) | Upute (Prilog 1), tč. 3 Tehnicki detalji (str. 4) |
| Obostrano poravnanje | `alignment-fixer` | obostrano | [Pravilnik o izradi i obrani zavrsnog i diplomskog rada s Uputama (Effectus, 2023)](https://effectus.com.hr/wp-content/uploads/2023/03/Pravilnik-o-izradi-i-obrani-zavrsnog-i-diplomskog-rada_2023.pdf) | Upute (Prilog 1), tč. 3 Tehnicki detalji (str. 4) |
| Prored | `line-spacing-fixer` | prored 1,15 | [Pravilnik o izradi i obrani zavrsnog i diplomskog rada s Uputama (Effectus, 2023)](https://effectus.com.hr/wp-content/uploads/2023/03/Pravilnik-o-izradi-i-obrani-zavrsnog-i-diplomskog-rada_2023.pdf) | Upute (Prilog 1), tč. 3 Tehnicki detalji (str. 4) |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### efos

#### EFOS, diplomski rad

`efos-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Upute za pisanje studentskih radova (EFOS, 2023)](https://www.efos.unios.hr/wp-content/uploads/2024/01/Upute_za_pisanje_studentskih_radova_travanj-2023_lekt.docx) | Opce upute za oblikovanje rada |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Upute za pisanje studentskih radova (EFOS, 2023)](https://www.efos.unios.hr/wp-content/uploads/2024/01/Upute_za_pisanje_studentskih_radova_travanj-2023_lekt.docx) | Opce upute za oblikovanje rada |
| Vrsta slova | `font-fixer` | Times New Roman | [Upute za pisanje studentskih radova (EFOS, 2023)](https://www.efos.unios.hr/wp-content/uploads/2024/01/Upute_za_pisanje_studentskih_radova_travanj-2023_lekt.docx) | Opce upute za oblikovanje rada |
| Velicina slova | `font-fixer` | 12 pt | [Upute za pisanje studentskih radova (EFOS, 2023)](https://www.efos.unios.hr/wp-content/uploads/2024/01/Upute_za_pisanje_studentskih_radova_travanj-2023_lekt.docx) | Opce upute za oblikovanje rada |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za pisanje studentskih radova (EFOS, 2023)](https://www.efos.unios.hr/wp-content/uploads/2024/01/Upute_za_pisanje_studentskih_radova_travanj-2023_lekt.docx) | Opce upute za oblikovanje rada |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### EFOS, doktorski rad

`efos-doktorski` · status: partial · vrste rada: doctoral

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Upute za pisanje studentskih radova (EFOS, 2023)](https://www.efos.unios.hr/wp-content/uploads/2024/01/Upute_za_pisanje_studentskih_radova_travanj-2023_lekt.docx) | Opce upute za oblikovanje rada |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Upute za pisanje studentskih radova (EFOS, 2023)](https://www.efos.unios.hr/wp-content/uploads/2024/01/Upute_za_pisanje_studentskih_radova_travanj-2023_lekt.docx) | Opce upute za oblikovanje rada |
| Vrsta slova | `font-fixer` | Times New Roman | [Upute za pisanje studentskih radova (EFOS, 2023)](https://www.efos.unios.hr/wp-content/uploads/2024/01/Upute_za_pisanje_studentskih_radova_travanj-2023_lekt.docx) | Opce upute za oblikovanje rada |
| Velicina slova | `font-fixer` | 12 pt | [Upute za pisanje studentskih radova (EFOS, 2023)](https://www.efos.unios.hr/wp-content/uploads/2024/01/Upute_za_pisanje_studentskih_radova_travanj-2023_lekt.docx) | Opce upute za oblikovanje rada |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za pisanje studentskih radova (EFOS, 2023)](https://www.efos.unios.hr/wp-content/uploads/2024/01/Upute_za_pisanje_studentskih_radova_travanj-2023_lekt.docx) | Opce upute za oblikovanje rada |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### EFOS · opći akademski rad (seminar/projekt)

`efos-opci-akademski-rad` · status: partial · vrste rada: seminar, project, article

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Times New Roman | [Upute za pisanje studentskih radova (EFOS, 2023)](https://www.efos.unios.hr/wp-content/uploads/2024/01/Upute_za_pisanje_studentskih_radova_travanj-2023_lekt.docx) | Upute, travanj 2023 |
| Velicina slova | `font-fixer` | 12 pt | [Upute za pisanje studentskih radova (EFOS, 2023)](https://www.efos.unios.hr/wp-content/uploads/2024/01/Upute_za_pisanje_studentskih_radova_travanj-2023_lekt.docx) | Upute, travanj 2023 |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za pisanje studentskih radova (EFOS, 2023)](https://www.efos.unios.hr/wp-content/uploads/2024/01/Upute_za_pisanje_studentskih_radova_travanj-2023_lekt.docx) | Upute, travanj 2023 |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Upute za pisanje studentskih radova (EFOS, 2023)](https://www.efos.unios.hr/wp-content/uploads/2024/01/Upute_za_pisanje_studentskih_radova_travanj-2023_lekt.docx) | Upute, travanj 2023 |
| Format papira A4 | `paper-size-fixer` | 21 x 29,7 cm | [Upute za pisanje studentskih radova (EFOS, 2023)](https://www.efos.unios.hr/wp-content/uploads/2024/01/Upute_za_pisanje_studentskih_radova_travanj-2023_lekt.docx) | Upute, travanj 2023 |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### EFOS, specijalistički rad

`efos-specijalisticki` · status: partial · vrste rada: specialist

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Upute za pisanje studentskih radova (EFOS, 2023)](https://www.efos.unios.hr/wp-content/uploads/2024/01/Upute_za_pisanje_studentskih_radova_travanj-2023_lekt.docx) | Opce upute za oblikovanje rada |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Upute za pisanje studentskih radova (EFOS, 2023)](https://www.efos.unios.hr/wp-content/uploads/2024/01/Upute_za_pisanje_studentskih_radova_travanj-2023_lekt.docx) | Opce upute za oblikovanje rada |
| Vrsta slova | `font-fixer` | Times New Roman | [Upute za pisanje studentskih radova (EFOS, 2023)](https://www.efos.unios.hr/wp-content/uploads/2024/01/Upute_za_pisanje_studentskih_radova_travanj-2023_lekt.docx) | Opce upute za oblikovanje rada |
| Velicina slova | `font-fixer` | 12 pt | [Upute za pisanje studentskih radova (EFOS, 2023)](https://www.efos.unios.hr/wp-content/uploads/2024/01/Upute_za_pisanje_studentskih_radova_travanj-2023_lekt.docx) | Opce upute za oblikovanje rada |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za pisanje studentskih radova (EFOS, 2023)](https://www.efos.unios.hr/wp-content/uploads/2024/01/Upute_za_pisanje_studentskih_radova_travanj-2023_lekt.docx) | Opce upute za oblikovanje rada |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### EFOS, završni rad

`efos-zavrsni` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Upute za pisanje studentskih radova (EFOS, 2023)](https://www.efos.unios.hr/wp-content/uploads/2024/01/Upute_za_pisanje_studentskih_radova_travanj-2023_lekt.docx) | Opce upute za oblikovanje rada |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Upute za pisanje studentskih radova (EFOS, 2023)](https://www.efos.unios.hr/wp-content/uploads/2024/01/Upute_za_pisanje_studentskih_radova_travanj-2023_lekt.docx) | Opce upute za oblikovanje rada |
| Vrsta slova | `font-fixer` | Times New Roman | [Upute za pisanje studentskih radova (EFOS, 2023)](https://www.efos.unios.hr/wp-content/uploads/2024/01/Upute_za_pisanje_studentskih_radova_travanj-2023_lekt.docx) | Opce upute za oblikovanje rada |
| Velicina slova | `font-fixer` | 12 pt | [Upute za pisanje studentskih radova (EFOS, 2023)](https://www.efos.unios.hr/wp-content/uploads/2024/01/Upute_za_pisanje_studentskih_radova_travanj-2023_lekt.docx) | Opce upute za oblikovanje rada |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za pisanje studentskih radova (EFOS, 2023)](https://www.efos.unios.hr/wp-content/uploads/2024/01/Upute_za_pisanje_studentskih_radova_travanj-2023_lekt.docx) | Opce upute za oblikovanje rada |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### efri

#### EFRI, diplomski rad

`efri-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Pravilnik o diplomskom radu na sveucilisnom diplomskom i integriranom studiju (EFRI)](https://arhiva.efri.uniri.hr/upload/Pravilnik_o_diplomskom_radu_na_sveucili%C5%A1nom_diplomskom_i_integriranom_studiju_Ekonomskog_fakulteta_Sveucili%C5%A1ta_u_Rijeci.pdf) | Članak 6. st. 1 |
| Vrsta slova | `font-fixer` | Times New Roman | [Pravilnik o diplomskom radu na sveucilisnom diplomskom i integriranom studiju (EFRI)](https://arhiva.efri.uniri.hr/upload/Pravilnik_o_diplomskom_radu_na_sveucili%C5%A1nom_diplomskom_i_integriranom_studiju_Ekonomskog_fakulteta_Sveucili%C5%A1ta_u_Rijeci.pdf) | Članak 6. st. 1 |
| Velicina slova | `font-fixer` | 12 pt | [Pravilnik o diplomskom radu na sveucilisnom diplomskom i integriranom studiju (EFRI)](https://arhiva.efri.uniri.hr/upload/Pravilnik_o_diplomskom_radu_na_sveucili%C5%A1nom_diplomskom_i_integriranom_studiju_Ekonomskog_fakulteta_Sveucili%C5%A1ta_u_Rijeci.pdf) | Članak 6. st. 1 |
| Prored | `line-spacing-fixer` | prored 1,5 | [Pravilnik o diplomskom radu na sveucilisnom diplomskom i integriranom studiju (EFRI)](https://arhiva.efri.uniri.hr/upload/Pravilnik_o_diplomskom_radu_na_sveucili%C5%A1nom_diplomskom_i_integriranom_studiju_Ekonomskog_fakulteta_Sveucili%C5%A1ta_u_Rijeci.pdf) | Članak 6. st. 1 |
| Obostrano poravnanje | `alignment-fixer` | obostrano | [Pravilnik o diplomskom radu na sveucilisnom diplomskom i integriranom studiju (EFRI)](https://arhiva.efri.uniri.hr/upload/Pravilnik_o_diplomskom_radu_na_sveucili%C5%A1nom_diplomskom_i_integriranom_studiju_Ekonomskog_fakulteta_Sveucili%C5%A1ta_u_Rijeci.pdf) | Članak 6. st. 1 |
| Margine | `margins-fixer` | 3 / 3 / 3 / 3 cm (gore/desno/dolje/lijevo) | [Pravilnik o diplomskom radu na sveucilisnom diplomskom i integriranom studiju (EFRI)](https://arhiva.efri.uniri.hr/upload/Pravilnik_o_diplomskom_radu_na_sveucili%C5%A1nom_diplomskom_i_integriranom_studiju_Ekonomskog_fakulteta_Sveucili%C5%A1ta_u_Rijeci.pdf) | Članak 6. st. 1 |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### EFRI, završni rad

`efri-zavrsni` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Pravilnik o zavrsnom radu na sveucilisnom prijediplomskom studiju (EFRI)](https://arhiva.efri.uniri.hr/upload/Pravilnik_o_zavr%C5%A1nom_radu_na_sveucili%C5%A1nom_prjediplomskom_studiju_Ekonomskog_fakulteta_Sveucili%C5%A1ta_u_Rijeci.pdf) | Članak 6. st. 1 |
| Vrsta slova | `font-fixer` | Times New Roman | [Pravilnik o zavrsnom radu na sveucilisnom prijediplomskom studiju (EFRI)](https://arhiva.efri.uniri.hr/upload/Pravilnik_o_zavr%C5%A1nom_radu_na_sveucili%C5%A1nom_prjediplomskom_studiju_Ekonomskog_fakulteta_Sveucili%C5%A1ta_u_Rijeci.pdf) | Članak 6. st. 1 |
| Velicina slova | `font-fixer` | 12 pt | [Pravilnik o zavrsnom radu na sveucilisnom prijediplomskom studiju (EFRI)](https://arhiva.efri.uniri.hr/upload/Pravilnik_o_zavr%C5%A1nom_radu_na_sveucili%C5%A1nom_prjediplomskom_studiju_Ekonomskog_fakulteta_Sveucili%C5%A1ta_u_Rijeci.pdf) | Članak 6. st. 1 |
| Prored | `line-spacing-fixer` | prored 1,5 | [Pravilnik o zavrsnom radu na sveucilisnom prijediplomskom studiju (EFRI)](https://arhiva.efri.uniri.hr/upload/Pravilnik_o_zavr%C5%A1nom_radu_na_sveucili%C5%A1nom_prjediplomskom_studiju_Ekonomskog_fakulteta_Sveucili%C5%A1ta_u_Rijeci.pdf) | Članak 6. st. 1 |
| Obostrano poravnanje | `alignment-fixer` | obostrano | [Pravilnik o zavrsnom radu na sveucilisnom prijediplomskom studiju (EFRI)](https://arhiva.efri.uniri.hr/upload/Pravilnik_o_zavr%C5%A1nom_radu_na_sveucili%C5%A1nom_prjediplomskom_studiju_Ekonomskog_fakulteta_Sveucili%C5%A1ta_u_Rijeci.pdf) | Članak 6. st. 1 |
| Margine | `margins-fixer` | 3 / 3 / 3 / 3 cm (gore/desno/dolje/lijevo) | [Pravilnik o zavrsnom radu na sveucilisnom prijediplomskom studiju (EFRI)](https://arhiva.efri.uniri.hr/upload/Pravilnik_o_zavr%C5%A1nom_radu_na_sveucili%C5%A1nom_prjediplomskom_studiju_Ekonomskog_fakulteta_Sveucili%C5%A1ta_u_Rijeci.pdf) | Članak 6. st. 1 |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### efst

#### EFST, diplomski rad

`efst-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Vrsta slova | `font-fixer` | Times New Roman | [Uputa za izradu studentskih radova (EFST, 2013)](http://www.efst.unist.hr/portals/0/upute_za_izradu_studentskih_radova.pdf) | poglavlje 4. Oblikovanje teksta (str. 7-8) |
| Velicina slova | `font-fixer` | 12 pt | [Uputa za izradu studentskih radova (EFST, 2013)](http://www.efst.unist.hr/portals/0/upute_za_izradu_studentskih_radova.pdf) | poglavlje 4. Oblikovanje teksta (str. 7-8) |
| Prored | `line-spacing-fixer` | prored 1,5 | [Uputa za izradu studentskih radova (EFST, 2013)](http://www.efst.unist.hr/portals/0/upute_za_izradu_studentskih_radova.pdf) | poglavlje 4. Oblikovanje teksta (str. 7-8) |
| Obostrano poravnanje | `alignment-fixer` | obostrano | [Uputa za izradu studentskih radova (EFST, 2013)](http://www.efst.unist.hr/portals/0/upute_za_izradu_studentskih_radova.pdf) | poglavlje 4. Oblikovanje teksta (str. 7-8) |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Uputa za izradu studentskih radova (EFST, 2013)](http://www.efst.unist.hr/portals/0/upute_za_izradu_studentskih_radova.pdf) | poglavlje 4. Oblikovanje teksta (str. 7-8) |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### EFST · opći akademski rad (seminar/projekt)

`efst-opci-akademski-rad` · status: partial · vrste rada: seminar, project, article

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Times New Roman | [Uputa za izradu studentskih radova (EFST, 2013)](http://www.efst.unist.hr/portals/0/upute_za_izradu_studentskih_radova.pdf) | Odjeljak 4, "Oblikovanje teksta" |
| Velicina slova | `font-fixer` | 12 pt | [Uputa za izradu studentskih radova (EFST, 2013)](http://www.efst.unist.hr/portals/0/upute_za_izradu_studentskih_radova.pdf) | Odjeljak 4, "Oblikovanje teksta" |
| Prored | `line-spacing-fixer` | prored 1,5 | [Uputa za izradu studentskih radova (EFST, 2013)](http://www.efst.unist.hr/portals/0/upute_za_izradu_studentskih_radova.pdf) | Odjeljak 4, "Oblikovanje teksta" |
| Poravnanje | `alignment-fixer` | obostrano | [Uputa za izradu studentskih radova (EFST, 2013)](http://www.efst.unist.hr/portals/0/upute_za_izradu_studentskih_radova.pdf) | Odjeljak 4, "Oblikovanje teksta" |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Uputa za izradu studentskih radova (EFST, 2013)](http://www.efst.unist.hr/portals/0/upute_za_izradu_studentskih_radova.pdf) | Odjeljak 4, "Oblikovanje teksta" |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### EFST, završni rad

`efst-zavrsni` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Vrsta slova | `font-fixer` | Times New Roman | [Uputa za izradu studentskih radova (EFST, 2013)](http://www.efst.unist.hr/portals/0/upute_za_izradu_studentskih_radova.pdf) | poglavlje 4. Oblikovanje teksta (str. 7-8) |
| Velicina slova | `font-fixer` | 12 pt | [Uputa za izradu studentskih radova (EFST, 2013)](http://www.efst.unist.hr/portals/0/upute_za_izradu_studentskih_radova.pdf) | poglavlje 4. Oblikovanje teksta (str. 7-8) |
| Prored | `line-spacing-fixer` | prored 1,5 | [Uputa za izradu studentskih radova (EFST, 2013)](http://www.efst.unist.hr/portals/0/upute_za_izradu_studentskih_radova.pdf) | poglavlje 4. Oblikovanje teksta (str. 7-8) |
| Obostrano poravnanje | `alignment-fixer` | obostrano | [Uputa za izradu studentskih radova (EFST, 2013)](http://www.efst.unist.hr/portals/0/upute_za_izradu_studentskih_radova.pdf) | poglavlje 4. Oblikovanje teksta (str. 7-8) |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Uputa za izradu studentskih radova (EFST, 2013)](http://www.efst.unist.hr/portals/0/upute_za_izradu_studentskih_radova.pdf) | poglavlje 4. Oblikovanje teksta (str. 7-8) |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### efzg

#### Ekonomski fakultet, diplomski rad

`efzg-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Pravilnik o izradi pisanih radova na diplomskim studijima (Ekonomski fakultet u Zagrebu, 2012, procisceni tekst)](https://www.efzg.unizg.hr/UserDocsImages//pravni_okvir/pravlinki_diplomski2012.pdf) | tehnicke upute za oblikovanje (margine, prored, tipografija, velicina) |
| Font | `font-fixer` | Times New Roman | [Pravilnik o izradi pisanih radova na diplomskim studijima (Ekonomski fakultet u Zagrebu, 2012, procisceni tekst)](https://www.efzg.unizg.hr/UserDocsImages//pravni_okvir/pravlinki_diplomski2012.pdf) | tehnicke upute za oblikovanje (margine, prored, tipografija, velicina) |
| Velicina slova | `font-fixer` | 12 pt | [Pravilnik o izradi pisanih radova na diplomskim studijima (Ekonomski fakultet u Zagrebu, 2012, procisceni tekst)](https://www.efzg.unizg.hr/UserDocsImages//pravni_okvir/pravlinki_diplomski2012.pdf) | tehnicke upute za oblikovanje (margine, prored, tipografija, velicina) |
| Prored | `line-spacing-fixer` | prored 1,5 | [Pravilnik o izradi pisanih radova na diplomskim studijima (Ekonomski fakultet u Zagrebu, 2012, procisceni tekst)](https://www.efzg.unizg.hr/UserDocsImages//pravni_okvir/pravlinki_diplomski2012.pdf) | tehnicke upute za oblikovanje (margine, prored, tipografija, velicina) |
| Obostrano poravnanje | `alignment-fixer` | obostrano | [Pravilnik o izradi pisanih radova na diplomskim studijima (Ekonomski fakultet u Zagrebu, 2012, procisceni tekst)](https://www.efzg.unizg.hr/UserDocsImages//pravni_okvir/pravlinki_diplomski2012.pdf) | tehnicke upute za oblikovanje (margine, prored, tipografija, velicina) |
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Pravilnik o izradi pisanih radova na diplomskim studijima (Ekonomski fakultet u Zagrebu, 2012, procisceni tekst)](https://www.efzg.unizg.hr/UserDocsImages//pravni_okvir/pravlinki_diplomski2012.pdf) | odjeljak 1.2. Struktura diplomskog rada |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Sadrzaj kao zivo TOC polje | `toc-field-fixer` | Word sam azurira sadrzaj<br><sub>Dokument ima naslov Sadrzaj, a jos nema zivo TOC polje. Nedestruktivno: rucne stavke se ne brisu.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Ekonomski fakultet, doktorski rad

`efzg-doktorski` · status: partial · vrste rada: doctoral

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Times New Roman | [Upute za oblikovanje doktorskog rada (Obrazac DR.SC.-08)](https://www.unizg.hr/nc/vijest/article/obrasci-za-doktorski-studij/) | odjeljak 'Postavke stranice' (DR.SC.-08, Upute za oblikovanje doktorskog rada) |
| Velicina slova | `font-fixer` | 12 pt | [Upute za oblikovanje doktorskog rada (Obrazac DR.SC.-08)](https://www.unizg.hr/nc/vijest/article/obrasci-za-doktorski-studij/) | odjeljak 'Postavke stranice' (DR.SC.-08, Upute za oblikovanje doktorskog rada) |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za oblikovanje doktorskog rada (Obrazac DR.SC.-08)](https://www.unizg.hr/nc/vijest/article/obrasci-za-doktorski-studij/) | odjeljak 'Postavke stranice' (DR.SC.-08, Upute za oblikovanje doktorskog rada) |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Upute za oblikovanje doktorskog rada (Obrazac DR.SC.-08)](https://www.unizg.hr/nc/vijest/article/obrasci-za-doktorski-studij/) | odjeljak 'Postavke stranice' (DR.SC.-08, Upute za oblikovanje doktorskog rada) |
| Format papira A4 | `paper-size-fixer` | 21 x 29,7 cm | [Upute za oblikovanje doktorskog rada (Obrazac DR.SC.-08)](https://www.unizg.hr/nc/vijest/article/obrasci-za-doktorski-studij/) | odjeljak 'Postavke stranice' (DR.SC.-08, Upute za oblikovanje doktorskog rada) |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Ekonomski fakultet u Zagrebu, seminarski rad

`efzg-seminarski` · status: partial · vrste rada: seminar

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Prored (preporuka) | `line-spacing-fixer` | prored 1,5 | [Upute za pisanje seminarskoga i diplomskoga rada (Ekonomski fakultet u Zagrebu, 2003)](https://www.efzg.unizg.hr/UserDocsImages/dokumenti/efzg_diplomski_seminarski_upute.pdf?vel=216027) | Metodologija izrade rada, Izgled rada |
| Margine (preporuka) | `margins-fixer` | 2,54 / 2,54 / 2,54 / 2,54 cm (gore/desno/dolje/lijevo) | [Upute za pisanje seminarskoga i diplomskoga rada (Ekonomski fakultet u Zagrebu, 2003)](https://www.efzg.unizg.hr/UserDocsImages/dokumenti/efzg_diplomski_seminarski_upute.pdf?vel=216027) | Metodologija izrade rada, Izgled rada |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Ekonomski fakultet, sveučilišni specijalistički rad

`efzg-specijalisticki` · status: partial · vrste rada: specialist

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Upute za izradu pisanih radova na sveucilisnom specijalistickom studiju (Ekonomski fakultet u Zagrebu, 2021)](https://www.efzg.unizg.hr/userdocsimages/PDS/Upute_za_izradu_pisanih_radova_na_SS%20studiju.pdf) | odjeljak o tehnickom oblikovanju (format, font, margine, prored) |
| Font | `font-fixer` | Times New Roman | [Upute za izradu pisanih radova na sveucilisnom specijalistickom studiju (Ekonomski fakultet u Zagrebu, 2021)](https://www.efzg.unizg.hr/userdocsimages/PDS/Upute_za_izradu_pisanih_radova_na_SS%20studiju.pdf) | odjeljak o tehnickom oblikovanju (format, font, margine, prored) |
| Velicina slova | `font-fixer` | 12 pt | [Upute za izradu pisanih radova na sveucilisnom specijalistickom studiju (Ekonomski fakultet u Zagrebu, 2021)](https://www.efzg.unizg.hr/userdocsimages/PDS/Upute_za_izradu_pisanih_radova_na_SS%20studiju.pdf) | odjeljak o tehnickom oblikovanju (format, font, margine, prored) |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za izradu pisanih radova na sveucilisnom specijalistickom studiju (Ekonomski fakultet u Zagrebu, 2021)](https://www.efzg.unizg.hr/userdocsimages/PDS/Upute_za_izradu_pisanih_radova_na_SS%20studiju.pdf) | odjeljak o tehnickom oblikovanju (format, font, margine, prored) |
| Obostrano poravnanje | `alignment-fixer` | obostrano | [Upute za izradu pisanih radova na sveucilisnom specijalistickom studiju (Ekonomski fakultet u Zagrebu, 2021)](https://www.efzg.unizg.hr/userdocsimages/PDS/Upute_za_izradu_pisanih_radova_na_SS%20studiju.pdf) | odjeljak o tehnickom oblikovanju (format, font, margine, prored) |
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Upute za izradu pisanih radova na sveucilisnom specijalistickom studiju (Ekonomski fakultet u Zagrebu, 2021)](https://www.efzg.unizg.hr/userdocsimages/PDS/Upute_za_izradu_pisanih_radova_na_SS%20studiju.pdf) | str. 13 (poglavlje "3. PRAVILA I UPUTE ZA PISANJE RADOVA") |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Sadrzaj kao zivo TOC polje | `toc-field-fixer` | Word sam azurira sadrzaj<br><sub>Dokument ima naslov Sadrzaj, a jos nema zivo TOC polje. Nedestruktivno: rucne stavke se ne brisu.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Ekonomski fakultet, stručni diplomski rad (Računovodstvo)

`efzg-strucni-racunovodstvo` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Upute za izradu diplomskog rada na strucnom diplomskom studiju Racunovodstvo, financijsko izvjestavanje i revizija (Ekonomski fakultet u Zagrebu)](https://www.efzg.unizg.hr/userdocsimages/RAC/Stru%C4%8Dni%20diplomski%20studij/Upute%20za%20izradu%20diplomskog%20rada%20na%20stru%C4%8Dnom%20diplomskom%20studiju%20Ra%C4%8Dunovodstvo,%20financijsko%20izvje%C5%A1tavanje%20i%20revizija.pdf) | odjeljak o tehnickom oblikovanju (opseg, format, font, margine, prored) |
| Font | `font-fixer` | Calibri | [Upute za izradu diplomskog rada na strucnom diplomskom studiju Racunovodstvo, financijsko izvjestavanje i revizija (Ekonomski fakultet u Zagrebu)](https://www.efzg.unizg.hr/userdocsimages/RAC/Stru%C4%8Dni%20diplomski%20studij/Upute%20za%20izradu%20diplomskog%20rada%20na%20stru%C4%8Dnom%20diplomskom%20studiju%20Ra%C4%8Dunovodstvo,%20financijsko%20izvje%C5%A1tavanje%20i%20revizija.pdf) | odjeljak o tehnickom oblikovanju (opseg, format, font, margine, prored) |
| Velicina slova | `font-fixer` | 11 pt | [Upute za izradu diplomskog rada na strucnom diplomskom studiju Racunovodstvo, financijsko izvjestavanje i revizija (Ekonomski fakultet u Zagrebu)](https://www.efzg.unizg.hr/userdocsimages/RAC/Stru%C4%8Dni%20diplomski%20studij/Upute%20za%20izradu%20diplomskog%20rada%20na%20stru%C4%8Dnom%20diplomskom%20studiju%20Ra%C4%8Dunovodstvo,%20financijsko%20izvje%C5%A1tavanje%20i%20revizija.pdf) | odjeljak o tehnickom oblikovanju (opseg, format, font, margine, prored) |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za izradu diplomskog rada na strucnom diplomskom studiju Racunovodstvo, financijsko izvjestavanje i revizija (Ekonomski fakultet u Zagrebu)](https://www.efzg.unizg.hr/userdocsimages/RAC/Stru%C4%8Dni%20diplomski%20studij/Upute%20za%20izradu%20diplomskog%20rada%20na%20stru%C4%8Dnom%20diplomskom%20studiju%20Ra%C4%8Dunovodstvo,%20financijsko%20izvje%C5%A1tavanje%20i%20revizija.pdf) | odjeljak o tehnickom oblikovanju (opseg, format, font, margine, prored) |
| Obostrano poravnanje | `alignment-fixer` | obostrano | [Upute za izradu diplomskog rada na strucnom diplomskom studiju Racunovodstvo, financijsko izvjestavanje i revizija (Ekonomski fakultet u Zagrebu)](https://www.efzg.unizg.hr/userdocsimages/RAC/Stru%C4%8Dni%20diplomski%20studij/Upute%20za%20izradu%20diplomskog%20rada%20na%20stru%C4%8Dnom%20diplomskom%20studiju%20Ra%C4%8Dunovodstvo,%20financijsko%20izvje%C5%A1tavanje%20i%20revizija.pdf) | odjeljak o tehnickom oblikovanju (opseg, format, font, margine, prored) |
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Upute za izradu diplomskog rada na strucnom diplomskom studiju Racunovodstvo, financijsko izvjestavanje i revizija (Ekonomski fakultet u Zagrebu)](https://www.efzg.unizg.hr/userdocsimages/RAC/Stru%C4%8Dni%20diplomski%20studij/Upute%20za%20izradu%20diplomskog%20rada%20na%20stru%C4%8Dnom%20diplomskom%20studiju%20Ra%C4%8Dunovodstvo,%20financijsko%20izvje%C5%A1tavanje%20i%20revizija.pdf) | odjeljak o tehnickom oblikovanju (opseg, format, font, margine, prored) |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Ekonomski fakultet, završni rad

`efzg-zavrsni` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Postupak prijave, izrade i obrane zavrsnog rada na preddiplomskom sveucilisnom studiju (Ekonomski fakultet u Zagrebu)](https://www.efzg.unizg.hr/userdocsimages/trg/izupanic/POSTUPAK%20PRIJAVE,%20IZRADE%20I%20OBRANE%20ZAVR%C5%A0NOG%20RADA.pdf) | odjeljak POSTUPAK IZRADE ZAVRSNOG RADA |
| Font | `font-fixer` | Times New Roman | [Postupak prijave, izrade i obrane zavrsnog rada na preddiplomskom sveucilisnom studiju (Ekonomski fakultet u Zagrebu)](https://www.efzg.unizg.hr/userdocsimages/trg/izupanic/POSTUPAK%20PRIJAVE,%20IZRADE%20I%20OBRANE%20ZAVR%C5%A0NOG%20RADA.pdf) | odjeljak POSTUPAK IZRADE ZAVRSNOG RADA |
| Velicina slova | `font-fixer` | 12 pt | [Postupak prijave, izrade i obrane zavrsnog rada na preddiplomskom sveucilisnom studiju (Ekonomski fakultet u Zagrebu)](https://www.efzg.unizg.hr/userdocsimages/trg/izupanic/POSTUPAK%20PRIJAVE,%20IZRADE%20I%20OBRANE%20ZAVR%C5%A0NOG%20RADA.pdf) | odjeljak POSTUPAK IZRADE ZAVRSNOG RADA |
| Prored | `line-spacing-fixer` | prored 1,5 | [Postupak prijave, izrade i obrane zavrsnog rada na preddiplomskom sveucilisnom studiju (Ekonomski fakultet u Zagrebu)](https://www.efzg.unizg.hr/userdocsimages/trg/izupanic/POSTUPAK%20PRIJAVE,%20IZRADE%20I%20OBRANE%20ZAVR%C5%A0NOG%20RADA.pdf) | odjeljak POSTUPAK IZRADE ZAVRSNOG RADA |
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Postupak prijave, izrade i obrane zavrsnog rada na preddiplomskom sveucilisnom studiju (Ekonomski fakultet u Zagrebu)](https://www.efzg.unizg.hr/userdocsimages/trg/izupanic/POSTUPAK%20PRIJAVE,%20IZRADE%20I%20OBRANE%20ZAVR%C5%A0NOG%20RADA.pdf) | odjeljak POSTUPAK IZRADE ZAVRSNOG RADA |
| Obostrano poravnanje | `alignment-fixer` | obostrano | [Postupak prijave, izrade i obrane zavrsnog rada na preddiplomskom sveucilisnom studiju (Ekonomski fakultet u Zagrebu)](https://www.efzg.unizg.hr/userdocsimages/trg/izupanic/POSTUPAK%20PRIJAVE,%20IZRADE%20I%20OBRANE%20ZAVR%C5%A0NOG%20RADA.pdf) | odjeljak POSTUPAK IZRADE ZAVRSNOG RADA |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Sadrzaj kao zivo TOC polje | `toc-field-fixer` | Word sam azurira sadrzaj<br><sub>Dokument ima naslov Sadrzaj, a jos nema zivo TOC polje. Nedestruktivno: rucne stavke se ne brisu.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### erf

#### Edukacijsko-rehabilitacijski fakultet, diplomski rad

`erf-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Times New Roman | [Upute za pisanje diplomskog rada (Edukacijsko-rehabilitacijski fakultet)](https://www.erf.unizg.hr/_download/repository/erfunizg_upute_za_pisanje_diplomskog_rada.pdf) | str. 3, redak 'Font: 12 pt, Times New Roman, prored 1.5' |
| Velicina slova | `font-fixer` | 12 pt | [Upute za pisanje diplomskog rada (Edukacijsko-rehabilitacijski fakultet)](https://www.erf.unizg.hr/_download/repository/erfunizg_upute_za_pisanje_diplomskog_rada.pdf) | str. 3, redak 'Font: 12 pt, Times New Roman, prored 1.5' |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za pisanje diplomskog rada (Edukacijsko-rehabilitacijski fakultet)](https://www.erf.unizg.hr/_download/repository/erfunizg_upute_za_pisanje_diplomskog_rada.pdf) | str. 3, redak 'Font: 12 pt, Times New Roman, prored 1.5' |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Sadrzaj kao zivo TOC polje | `toc-field-fixer` | Word sam azurira sadrzaj<br><sub>Dokument ima naslov Sadrzaj, a jos nema zivo TOC polje. Nedestruktivno: rucne stavke se ne brisu.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Edukacijsko-rehabilitacijski fakultet, doktorski rad

`erf-doktorski` · status: partial · vrste rada: doctoral

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Times New Roman | [Upute za oblikovanje doktorskog rada (Obrazac DR.SC.-08)](https://www.unizg.hr/nc/vijest/article/obrasci-za-doktorski-studij/) | odjeljak 'Postavke stranice' (DR.SC.-08, Upute za oblikovanje doktorskog rada) |
| Velicina slova | `font-fixer` | 12 pt | [Upute za oblikovanje doktorskog rada (Obrazac DR.SC.-08)](https://www.unizg.hr/nc/vijest/article/obrasci-za-doktorski-studij/) | odjeljak 'Postavke stranice' (DR.SC.-08, Upute za oblikovanje doktorskog rada) |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za oblikovanje doktorskog rada (Obrazac DR.SC.-08)](https://www.unizg.hr/nc/vijest/article/obrasci-za-doktorski-studij/) | odjeljak 'Postavke stranice' (DR.SC.-08, Upute za oblikovanje doktorskog rada) |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Upute za oblikovanje doktorskog rada (Obrazac DR.SC.-08)](https://www.unizg.hr/nc/vijest/article/obrasci-za-doktorski-studij/) | odjeljak 'Postavke stranice' (DR.SC.-08, Upute za oblikovanje doktorskog rada) |
| Format papira A4 | `paper-size-fixer` | 21 x 29,7 cm | [Upute za oblikovanje doktorskog rada (Obrazac DR.SC.-08)](https://www.unizg.hr/nc/vijest/article/obrasci-za-doktorski-studij/) | odjeljak 'Postavke stranice' (DR.SC.-08, Upute za oblikovanje doktorskog rada) |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### evtos

#### Evandjeosko teolosko veleuciliste (Osijek), diplomski rad

`evtos-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Vrsta slova | `font-fixer` | Times New Roman | [Pravilnik o završnim i diplomskim radovima (uključuje Upute za pisanje i opremanje završnih i diplomskih radova)](https://www.etvos.hr/wp-content/uploads/2024/02/Pravilnik-o-zavrsnim-i-diplomskim-radovima.pdf) | Upute za pisanje i opremanje završnih i diplomskih radova, II. Izgled završnog rada (str. 7) |
| Velicina slova | `font-fixer` | 12 pt | [Pravilnik o završnim i diplomskim radovima (uključuje Upute za pisanje i opremanje završnih i diplomskih radova)](https://www.etvos.hr/wp-content/uploads/2024/02/Pravilnik-o-zavrsnim-i-diplomskim-radovima.pdf) | Upute za pisanje i opremanje završnih i diplomskih radova, II. Izgled završnog rada (str. 7) |
| Prored | `line-spacing-fixer` | prored 1,5 | [Pravilnik o završnim i diplomskim radovima (uključuje Upute za pisanje i opremanje završnih i diplomskih radova)](https://www.etvos.hr/wp-content/uploads/2024/02/Pravilnik-o-zavrsnim-i-diplomskim-radovima.pdf) | Upute za pisanje i opremanje završnih i diplomskih radova, II. Izgled završnog rada (str. 7) |
| Margine | `margins-fixer` | 2,5 / 2 / 2,5 / 3 cm (gore/desno/dolje/lijevo) | [Pravilnik o završnim i diplomskim radovima (uključuje Upute za pisanje i opremanje završnih i diplomskih radova)](https://www.etvos.hr/wp-content/uploads/2024/02/Pravilnik-o-zavrsnim-i-diplomskim-radovima.pdf) | Upute za pisanje i opremanje završnih i diplomskih radova, II. Izgled završnog rada (str. 7) |
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Pravilnik o završnim i diplomskim radovima (uključuje Upute za pisanje i opremanje završnih i diplomskih radova)](https://www.etvos.hr/wp-content/uploads/2024/02/Pravilnik-o-zavrsnim-i-diplomskim-radovima.pdf) | Upute za pisanje i opremanje završnih i diplomskih radova, II. Izgled završnog rada (str. 7) |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Evandjeosko teolosko veleuciliste (Osijek), zavrsni rad

`evtos-zavrsni` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Vrsta slova | `font-fixer` | Times New Roman | [Pravilnik o završnim i diplomskim radovima (uključuje Upute za pisanje i opremanje završnih i diplomskih radova)](https://www.etvos.hr/wp-content/uploads/2024/02/Pravilnik-o-zavrsnim-i-diplomskim-radovima.pdf) | Upute za pisanje i opremanje završnih i diplomskih radova, II. Izgled završnog rada (str. 7) |
| Velicina slova | `font-fixer` | 12 pt | [Pravilnik o završnim i diplomskim radovima (uključuje Upute za pisanje i opremanje završnih i diplomskih radova)](https://www.etvos.hr/wp-content/uploads/2024/02/Pravilnik-o-zavrsnim-i-diplomskim-radovima.pdf) | Upute za pisanje i opremanje završnih i diplomskih radova, II. Izgled završnog rada (str. 7) |
| Prored | `line-spacing-fixer` | prored 1,5 | [Pravilnik o završnim i diplomskim radovima (uključuje Upute za pisanje i opremanje završnih i diplomskih radova)](https://www.etvos.hr/wp-content/uploads/2024/02/Pravilnik-o-zavrsnim-i-diplomskim-radovima.pdf) | Upute za pisanje i opremanje završnih i diplomskih radova, II. Izgled završnog rada (str. 7) |
| Margine | `margins-fixer` | 2,5 / 2 / 2,5 / 3 cm (gore/desno/dolje/lijevo) | [Pravilnik o završnim i diplomskim radovima (uključuje Upute za pisanje i opremanje završnih i diplomskih radova)](https://www.etvos.hr/wp-content/uploads/2024/02/Pravilnik-o-zavrsnim-i-diplomskim-radovima.pdf) | Upute za pisanje i opremanje završnih i diplomskih radova, II. Izgled završnog rada (str. 7) |
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Pravilnik o završnim i diplomskim radovima (uključuje Upute za pisanje i opremanje završnih i diplomskih radova)](https://www.etvos.hr/wp-content/uploads/2024/02/Pravilnik-o-zavrsnim-i-diplomskim-radovima.pdf) | Upute za pisanje i opremanje završnih i diplomskih radova, II. Izgled završnog rada (str. 7) |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### fazos

#### FAZOS, diplomski rad

`fazos-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Upute za izradu diplomskog rada (FAZOS, 2024)](https://www.fazos.unios.hr/storage/Dokumenti/upute/Upute%20za%20izradu%20diplomskog%20rada_4.8.2024.pdf) | pogl. 3 Izgled rada i obrada teksta |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 3 cm (gore/desno/dolje/lijevo) | [Upute za izradu diplomskog rada (FAZOS, 2024)](https://www.fazos.unios.hr/storage/Dokumenti/upute/Upute%20za%20izradu%20diplomskog%20rada_4.8.2024.pdf) | pogl. 3 Izgled rada i obrada teksta |
| Obostrano poravnanje | `alignment-fixer` | obostrano | [Upute za izradu diplomskog rada (FAZOS, 2024)](https://www.fazos.unios.hr/storage/Dokumenti/upute/Upute%20za%20izradu%20diplomskog%20rada_4.8.2024.pdf) | pogl. 3 Izgled rada i obrada teksta |
| Vrsta slova | `font-fixer` | Times New Roman | [Upute za izradu diplomskog rada (FAZOS, 2024)](https://www.fazos.unios.hr/storage/Dokumenti/upute/Upute%20za%20izradu%20diplomskog%20rada_4.8.2024.pdf) | pogl. 3 Izgled rada i obrada teksta |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za izradu diplomskog rada (FAZOS, 2024)](https://www.fazos.unios.hr/storage/Dokumenti/upute/Upute%20za%20izradu%20diplomskog%20rada_4.8.2024.pdf) | pogl. 3 Izgled rada i obrada teksta |
| Velicina slova | `font-fixer` | 12 pt | [Upute za izradu diplomskog rada (FAZOS, 2024)](https://www.fazos.unios.hr/storage/Dokumenti/upute/Upute%20za%20izradu%20diplomskog%20rada_4.8.2024.pdf) | pogl. 3 Izgled rada i obrada teksta |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### FAZOS, završni rad

`fazos-zavrsni` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Upute za izradu zavrsnog rada (FAZOS, 2024)](https://www.fazos.unios.hr/storage/Dokumenti/upute/Upute%20za%20izradu%20zavr%C5%A1nog%20rada_4.8.2024.pdf) | pogl. 3 Izgled rada i obrada teksta |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 3 cm (gore/desno/dolje/lijevo) | [Upute za izradu zavrsnog rada (FAZOS, 2024)](https://www.fazos.unios.hr/storage/Dokumenti/upute/Upute%20za%20izradu%20zavr%C5%A1nog%20rada_4.8.2024.pdf) | pogl. 3 Izgled rada i obrada teksta |
| Obostrano poravnanje | `alignment-fixer` | obostrano | [Upute za izradu zavrsnog rada (FAZOS, 2024)](https://www.fazos.unios.hr/storage/Dokumenti/upute/Upute%20za%20izradu%20zavr%C5%A1nog%20rada_4.8.2024.pdf) | pogl. 3 Izgled rada i obrada teksta |
| Vrsta slova | `font-fixer` | Times New Roman | [Upute za izradu zavrsnog rada (FAZOS, 2024)](https://www.fazos.unios.hr/storage/Dokumenti/upute/Upute%20za%20izradu%20zavr%C5%A1nog%20rada_4.8.2024.pdf) | pogl. 3 Izgled rada i obrada teksta |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za izradu zavrsnog rada (FAZOS, 2024)](https://www.fazos.unios.hr/storage/Dokumenti/upute/Upute%20za%20izradu%20zavr%C5%A1nog%20rada_4.8.2024.pdf) | pogl. 3 Izgled rada i obrada teksta |
| Velicina slova | `font-fixer` | 12 pt | [Upute za izradu zavrsnog rada (FAZOS, 2024)](https://www.fazos.unios.hr/storage/Dokumenti/upute/Upute%20za%20izradu%20zavr%C5%A1nog%20rada_4.8.2024.pdf) | pogl. 3 Izgled rada i obrada teksta |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### fbf

#### Farmaceutsko-biokemijski fakultet, doktorski rad

`fbf-doktorski` · status: partial · vrste rada: doctoral

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Times New Roman | [Upute za oblikovanje doktorskog rada (Obrazac DR.SC.-08)](https://www.unizg.hr/nc/vijest/article/obrasci-za-doktorski-studij/) | odjeljak 'Postavke stranice' (DR.SC.-08, Upute za oblikovanje doktorskog rada) |
| Velicina slova | `font-fixer` | 12 pt | [Upute za oblikovanje doktorskog rada (Obrazac DR.SC.-08)](https://www.unizg.hr/nc/vijest/article/obrasci-za-doktorski-studij/) | odjeljak 'Postavke stranice' (DR.SC.-08, Upute za oblikovanje doktorskog rada) |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za oblikovanje doktorskog rada (Obrazac DR.SC.-08)](https://www.unizg.hr/nc/vijest/article/obrasci-za-doktorski-studij/) | odjeljak 'Postavke stranice' (DR.SC.-08, Upute za oblikovanje doktorskog rada) |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Upute za oblikovanje doktorskog rada (Obrazac DR.SC.-08)](https://www.unizg.hr/nc/vijest/article/obrasci-za-doktorski-studij/) | odjeljak 'Postavke stranice' (DR.SC.-08, Upute za oblikovanje doktorskog rada) |
| Format papira A4 | `paper-size-fixer` | 21 x 29,7 cm | [Upute za oblikovanje doktorskog rada (Obrazac DR.SC.-08)](https://www.unizg.hr/nc/vijest/article/obrasci-za-doktorski-studij/) | odjeljak 'Postavke stranice' (DR.SC.-08, Upute za oblikovanje doktorskog rada) |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Farmaceutsko-biokemijski fakultet, završni specijalistički rad

`fbf-specijalisticki` · status: partial · vrste rada: specialist

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Uputa za prijavu teme i oblikovanje zavrsnog specijalistickog rada (Farmaceutsko-biokemijski fakultet, 2014)](https://fbf.pharma.hr/UserDocsImages/Dokumenti/Studiji/PSS/Dokumenti-i-upute/Upute-spec_2014_v20140219.pdf) | odjeljak B. Oblikovanje zavrsnog specijalistickog rada |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Uputa za prijavu teme i oblikovanje zavrsnog specijalistickog rada (Farmaceutsko-biokemijski fakultet, 2014)](https://fbf.pharma.hr/UserDocsImages/Dokumenti/Studiji/PSS/Dokumenti-i-upute/Upute-spec_2014_v20140219.pdf) | odjeljak B. Oblikovanje zavrsnog specijalistickog rada |
| Prored | `line-spacing-fixer` | prored 2 | [Uputa za prijavu teme i oblikovanje zavrsnog specijalistickog rada (Farmaceutsko-biokemijski fakultet, 2014)](https://fbf.pharma.hr/UserDocsImages/Dokumenti/Studiji/PSS/Dokumenti-i-upute/Upute-spec_2014_v20140219.pdf) | odjeljak B. Oblikovanje zavrsnog specijalistickog rada |
| Velicina slova | `font-fixer` | 10 pt | [Uputa za prijavu teme i oblikovanje zavrsnog specijalistickog rada (Farmaceutsko-biokemijski fakultet, 2014)](https://fbf.pharma.hr/UserDocsImages/Dokumenti/Studiji/PSS/Dokumenti-i-upute/Upute-spec_2014_v20140219.pdf) | odjeljak B. Oblikovanje zavrsnog specijalistickog rada |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### fdmri

#### Fakultet dentalne medicine Rijeka, diplomski rad

`fdmri-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Vrsta slova | `font-fixer` | Times New Roman | [Naputak o izradi i oblikovanju diplomskog rada (Fakultet dentalne medicine Rijeka)](https://fdmri.uniri.hr/) | Naputak o oblikovanju diplomskog rada (tehnicki dio) |
| Velicina slova | `font-fixer` | 12 pt | [Naputak o izradi i oblikovanju diplomskog rada (Fakultet dentalne medicine Rijeka)](https://fdmri.uniri.hr/) | Naputak o oblikovanju diplomskog rada |
| Prored | `line-spacing-fixer` | prored 2 | [Naputak o izradi i oblikovanju diplomskog rada (Fakultet dentalne medicine Rijeka)](https://fdmri.uniri.hr/) | Naputak o oblikovanju diplomskog rada |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Naputak o izradi i oblikovanju diplomskog rada (Fakultet dentalne medicine Rijeka)](https://fdmri.uniri.hr/) | Naputak o oblikovanju diplomskog rada |
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Naputak o izradi i oblikovanju diplomskog rada (Fakultet dentalne medicine Rijeka)](https://fdmri.uniri.hr/) | Naputak o oblikovanju diplomskog rada |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Fakultet dentalne medicine Rijeka, zavrsni rad

`fdmri-zavrsni` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Vrsta slova | `font-fixer` | Times New Roman | [Naputak o izradi i oblikovanju zavrsnog rada (Fakultet dentalne medicine Rijeka)](https://fdmri.uniri.hr/) | Naputak o oblikovanju zavrsnog rada (tehnicki dio) |
| Velicina slova | `font-fixer` | 12 pt | [Naputak o izradi i oblikovanju zavrsnog rada (Fakultet dentalne medicine Rijeka)](https://fdmri.uniri.hr/) | Naputak o oblikovanju zavrsnog rada |
| Prored | `line-spacing-fixer` | prored 2 | [Naputak o izradi i oblikovanju zavrsnog rada (Fakultet dentalne medicine Rijeka)](https://fdmri.uniri.hr/) | Naputak o oblikovanju zavrsnog rada |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Naputak o izradi i oblikovanju zavrsnog rada (Fakultet dentalne medicine Rijeka)](https://fdmri.uniri.hr/) | Naputak o oblikovanju zavrsnog rada |
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Naputak o izradi i oblikovanju zavrsnog rada (Fakultet dentalne medicine Rijeka)](https://fdmri.uniri.hr/) | Naputak o oblikovanju zavrsnog rada |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### fdmz

#### Fakultet za dentalnu medicinu i zdravstvo Osijek, diplomski rad

`fdmz-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Times New Roman | [Upute za izradu i oblikovanje diplomskoga rada (Fakultet za dentalnu medicinu i zdravstvo Osijek, rujan 2025)](https://www.fdmz.hr/images/studenti/zavrsni_i_diplomski_radovi/2025/upute_za_izradu_i_oblikovanje_2025.pdf) | Odjeljak 3 "Tehnicko oblikovanje rada", str. 12 |
| Velicina slova | `font-fixer` | 12 pt | [Upute za izradu i oblikovanje diplomskoga rada (Fakultet za dentalnu medicinu i zdravstvo Osijek, rujan 2025)](https://www.fdmz.hr/images/studenti/zavrsni_i_diplomski_radovi/2025/upute_za_izradu_i_oblikovanje_2025.pdf) | Odjeljak 3 "Tehnicko oblikovanje rada", str. 12 |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za izradu i oblikovanje diplomskoga rada (Fakultet za dentalnu medicinu i zdravstvo Osijek, rujan 2025)](https://www.fdmz.hr/images/studenti/zavrsni_i_diplomski_radovi/2025/upute_za_izradu_i_oblikovanje_2025.pdf) | Odjeljak 3 "Tehnicko oblikovanje rada", str. 12 |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Upute za izradu i oblikovanje diplomskoga rada (Fakultet za dentalnu medicinu i zdravstvo Osijek, rujan 2025)](https://www.fdmz.hr/images/studenti/zavrsni_i_diplomski_radovi/2025/upute_za_izradu_i_oblikovanje_2025.pdf) | Odjeljak 3 "Tehnicko oblikovanje rada", str. 12 |
| Format papira A4 | `paper-size-fixer` | 21 x 29,7 cm | [Upute za izradu i oblikovanje diplomskoga rada (Fakultet za dentalnu medicinu i zdravstvo Osijek, rujan 2025)](https://www.fdmz.hr/images/studenti/zavrsni_i_diplomski_radovi/2025/upute_za_izradu_i_oblikovanje_2025.pdf) | Odjeljak 3 "Tehnicko oblikovanje rada", str. 12 |
| Poravnanje | `alignment-fixer` | obostrano | [Upute za izradu i oblikovanje diplomskoga rada (Fakultet za dentalnu medicinu i zdravstvo Osijek, rujan 2025)](https://www.fdmz.hr/images/studenti/zavrsni_i_diplomski_radovi/2025/upute_za_izradu_i_oblikovanje_2025.pdf) | Odjeljak 3 "Tehnicko oblikovanje rada", str. 12 |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### fer

#### Fakultet elektrotehnike i racunarstva, diplomski rad

`fer-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Upute za izradu diplomskog rada (FER, ZEMRIS, Leonardo Jelenkovic, 2013)](https://www.zemris.fer.hr/~leonardo/studenti/Upute_za_izradu_rada.pdf) | odjeljak 3.1. Format stranice |
| Font | `font-fixer` | Times New Roman | [Upute za izradu diplomskog rada (FER, ZEMRIS, Leonardo Jelenkovic, 2013)](https://www.zemris.fer.hr/~leonardo/studenti/Upute_za_izradu_rada.pdf) | odjeljak 3.3. Tekst poglavlja |
| Velicina slova | `font-fixer` | 12 pt | [Upute za izradu diplomskog rada (FER, ZEMRIS, Leonardo Jelenkovic, 2013)](https://www.zemris.fer.hr/~leonardo/studenti/Upute_za_izradu_rada.pdf) | odjeljak 3.3. Tekst poglavlja |
| Prored | `line-spacing-fixer` | prored 1,2 | [Upute za izradu diplomskog rada (FER, ZEMRIS, Leonardo Jelenkovic, 2013)](https://www.zemris.fer.hr/~leonardo/studenti/Upute_za_izradu_rada.pdf) | odjeljak 3.3. Tekst poglavlja |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 3 cm (gore/desno/dolje/lijevo) | [Upute za izradu diplomskog rada (FER, ZEMRIS, Leonardo Jelenkovic, 2013)](https://www.zemris.fer.hr/~leonardo/studenti/Upute_za_izradu_rada.pdf) | odjeljak 3.1. Format stranice |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Fakultet elektrotehnike i racunarstva, doktorski rad / disertacija

`fer-doktorski` · status: partial · vrste rada: doctoral

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Velicina slova | `font-fixer` | 12 pt | [Upute za oblikovanje doktorskoga rada (FER, predlozak brosure doktora znanosti)](https://www.fer.unizg.hr/_download/repository/Formalno_oblikovanje_doktorskog_rada_-_FER_-_2012.doc) | odjeljak Postavke stranice |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za oblikovanje doktorskoga rada (FER, predlozak brosure doktora znanosti)](https://www.fer.unizg.hr/_download/repository/Formalno_oblikovanje_doktorskog_rada_-_FER_-_2012.doc) | odjeljak Postavke stranice |
| Margine (tijelo rada) | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Upute za oblikovanje doktorskoga rada (FER, predlozak brosure doktora znanosti)](https://www.fer.unizg.hr/_download/repository/Formalno_oblikovanje_doktorskog_rada_-_FER_-_2012.doc) | odjeljak Postavke stranice |
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Upute za oblikovanje doktorskoga rada (FER, predlozak brosure doktora znanosti)](https://www.fer.unizg.hr/_download/repository/Formalno_oblikovanje_doktorskog_rada_-_FER_-_2012.doc) | odjeljak Upute za oblikovanje doktorskoga rada |
| Font (samo primjer, fiksna je potpora hrvatskih znakova) | `font-fixer` | Times New Roman | [Upute za oblikovanje doktorskoga rada (FER, predlozak brosure doktora znanosti)](https://www.fer.unizg.hr/_download/repository/Formalno_oblikovanje_doktorskog_rada_-_FER_-_2012.doc) | odjeljak Postavke stranice |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Sadrzaj kao zivo TOC polje | `toc-field-fixer` | Word sam azurira sadrzaj<br><sub>Dokument ima naslov Sadrzaj, a jos nema zivo TOC polje. Nedestruktivno: rucne stavke se ne brisu.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Fakultet elektrotehnike i racunarstva, završni rad

`fer-zavrsni` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Upute za izradu diplomskog rada (FER, ZEMRIS, Leonardo Jelenkovic, 2013)](https://www.zemris.fer.hr/~leonardo/studenti/Upute_za_izradu_rada.pdf) | odjeljak 3.1. Format stranice |
| Font | `font-fixer` | Times New Roman | [Upute za izradu diplomskog rada (FER, ZEMRIS, Leonardo Jelenkovic, 2013)](https://www.zemris.fer.hr/~leonardo/studenti/Upute_za_izradu_rada.pdf) | odjeljak 3.3. Tekst poglavlja |
| Velicina slova | `font-fixer` | 12 pt | [Upute za izradu diplomskog rada (FER, ZEMRIS, Leonardo Jelenkovic, 2013)](https://www.zemris.fer.hr/~leonardo/studenti/Upute_za_izradu_rada.pdf) | odjeljak 3.3. Tekst poglavlja |
| Prored | `line-spacing-fixer` | prored 1,2 | [Upute za izradu diplomskog rada (FER, ZEMRIS, Leonardo Jelenkovic, 2013)](https://www.zemris.fer.hr/~leonardo/studenti/Upute_za_izradu_rada.pdf) | odjeljak 3.3. Tekst poglavlja |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 3 cm (gore/desno/dolje/lijevo) | [Upute za izradu diplomskog rada (FER, ZEMRIS, Leonardo Jelenkovic, 2013)](https://www.zemris.fer.hr/~leonardo/studenti/Upute_za_izradu_rada.pdf) | odjeljak 3.1. Format stranice |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### ferit

#### FERIT, diplomski rad

`ferit-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Upute za izradu diplomskog rada (FERIT)](https://www.ferit.unios.hr/dokumenti/dodiplomski/upute_za_izradu_diplomskog_rada.pdf) | t. 2.1 |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za izradu diplomskog rada (FERIT)](https://www.ferit.unios.hr/dokumenti/dodiplomski/upute_za_izradu_diplomskog_rada.pdf) | t. 2.4 |
| Vrsta slova | `font-fixer` | Times New Roman | [Upute za izradu diplomskog rada (FERIT)](https://www.ferit.unios.hr/dokumenti/dodiplomski/upute_za_izradu_diplomskog_rada.pdf) | t. 2.4 |
| Velicina slova | `font-fixer` | 12 pt | [Upute za izradu diplomskog rada (FERIT)](https://www.ferit.unios.hr/dokumenti/dodiplomski/upute_za_izradu_diplomskog_rada.pdf) | t. 2.4 |
| Margine | `margins-fixer` | 2,5 / 2 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Upute za izradu diplomskog rada (FERIT)](https://www.ferit.unios.hr/dokumenti/dodiplomski/upute_za_izradu_diplomskog_rada.pdf) | t. 2.4 |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### FERIT, završni rad

`ferit-zavrsni` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Upute za izradu zavrsnog rada (FERIT)](https://www.ferit.unios.hr/preuzmi/1350/upute_za_izradu_zavr%C5%A1nog_rada_26-01-2010.pdf) | t. 2.1 |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za izradu zavrsnog rada (FERIT)](https://www.ferit.unios.hr/preuzmi/1350/upute_za_izradu_zavr%C5%A1nog_rada_26-01-2010.pdf) | t. 2.4 |
| Vrsta slova | `font-fixer` | Times New Roman | [Upute za izradu zavrsnog rada (FERIT)](https://www.ferit.unios.hr/preuzmi/1350/upute_za_izradu_zavr%C5%A1nog_rada_26-01-2010.pdf) | t. 2.4 |
| Velicina slova | `font-fixer` | 12 pt | [Upute za izradu zavrsnog rada (FERIT)](https://www.ferit.unios.hr/preuzmi/1350/upute_za_izradu_zavr%C5%A1nog_rada_26-01-2010.pdf) | t. 2.4 |
| Margine | `margins-fixer` | 2,5 / 2 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Upute za izradu zavrsnog rada (FERIT)](https://www.ferit.unios.hr/preuzmi/1350/upute_za_izradu_zavr%C5%A1nog_rada_26-01-2010.pdf) | t. 2.4 |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### fesb

#### FESB, diplomski rad

`fesb-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font (preporuka) | `font-fixer` | Times New Roman | [Upute za pisanje diplomskog rada (FESB, u sklopu Dokumentacije za izradu diplomskih radova)](https://data.fesb.unist.hr/public/documents/merlin/Dokumentacija_za_izradu_diplomskih_radova.zip (Upute za pisanje diplomskog rada.doc)) | Tehnicke upute za izradu pisanog dijela rada |
| Velicina slova (preporuka) | `font-fixer` | 12 pt | [Upute za pisanje diplomskog rada (FESB, u sklopu Dokumentacije za izradu diplomskih radova)](https://data.fesb.unist.hr/public/documents/merlin/Dokumentacija_za_izradu_diplomskih_radova.zip (Upute za pisanje diplomskog rada.doc)) | Tehnicke upute za izradu pisanog dijela rada |
| Prored (preporuka) | `line-spacing-fixer` | prored 1,5 | [Upute za pisanje diplomskog rada (FESB, u sklopu Dokumentacije za izradu diplomskih radova)](https://data.fesb.unist.hr/public/documents/merlin/Dokumentacija_za_izradu_diplomskih_radova.zip (Upute za pisanje diplomskog rada.doc)) | Tehnicke upute za izradu pisanog dijela rada |
| Margine (preporuka) | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Upute za pisanje diplomskog rada (FESB, u sklopu Dokumentacije za izradu diplomskih radova)](https://data.fesb.unist.hr/public/documents/merlin/Dokumentacija_za_izradu_diplomskih_radova.zip (Upute za pisanje diplomskog rada.doc)) | Tehnicke upute za izradu pisanog dijela rada |
| Poravnanje (preporuka) | `alignment-fixer` | obostrano | [Upute za pisanje diplomskog rada (FESB, u sklopu Dokumentacije za izradu diplomskih radova)](https://data.fesb.unist.hr/public/documents/merlin/Dokumentacija_za_izradu_diplomskih_radova.zip (Upute za pisanje diplomskog rada.doc)) | Tehnicke upute za izradu pisanog dijela rada |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### FESB, završni rad

`fesb-zavrsni` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font (preporuka) | `font-fixer` | Times New Roman | [Upute za pisanje zavrsnog rada (FESB, u sklopu Dokumentacije za izradu zavrsnih radova)](https://data.fesb.unist.hr/public/documents/merlin/Dokumentacija_za_izradu_zavrsnih_radova.zip (Upute za pisanje zavrsnog rada.doc)) | Tehnicke upute za izradu pisanog dijela rada |
| Velicina slova (preporuka) | `font-fixer` | 12 pt | [Upute za pisanje zavrsnog rada (FESB, u sklopu Dokumentacije za izradu zavrsnih radova)](https://data.fesb.unist.hr/public/documents/merlin/Dokumentacija_za_izradu_zavrsnih_radova.zip (Upute za pisanje zavrsnog rada.doc)) | Tehnicke upute za izradu pisanog dijela rada |
| Prored (preporuka) | `line-spacing-fixer` | prored 1,5 | [Upute za pisanje zavrsnog rada (FESB, u sklopu Dokumentacije za izradu zavrsnih radova)](https://data.fesb.unist.hr/public/documents/merlin/Dokumentacija_za_izradu_zavrsnih_radova.zip (Upute za pisanje zavrsnog rada.doc)) | Tehnicke upute za izradu pisanog dijela rada |
| Margine (preporuka) | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Upute za pisanje zavrsnog rada (FESB, u sklopu Dokumentacije za izradu zavrsnih radova)](https://data.fesb.unist.hr/public/documents/merlin/Dokumentacija_za_izradu_zavrsnih_radova.zip (Upute za pisanje zavrsnog rada.doc)) | Tehnicke upute za izradu pisanog dijela rada |
| Poravnanje (preporuka) | `alignment-fixer` | obostrano | [Upute za pisanje zavrsnog rada (FESB, u sklopu Dokumentacije za izradu zavrsnih radova)](https://data.fesb.unist.hr/public/documents/merlin/Dokumentacija_za_izradu_zavrsnih_radova.zip (Upute za pisanje zavrsnog rada.doc)) | Tehnicke upute za izradu pisanog dijela rada |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### fetpu

#### FET Pula, diplomski rad

`fetpu-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Naputak o zavrsnom i diplomskom radu (FET, Pula)](https://fet.unipu.hr/_download/repository/Naputak_o_zavrsnom_i_diplomskom_radu.pdf) | Naputak, tehnicko uredenje |
| Vrsta slova | `font-fixer` | Arial | [Naputak o zavrsnom i diplomskom radu (FET, Pula)](https://fet.unipu.hr/_download/repository/Naputak_o_zavrsnom_i_diplomskom_radu.pdf) | Naputak, tehnicko uredenje |
| Velicina slova | `font-fixer` | 12 pt | [Naputak o zavrsnom i diplomskom radu (FET, Pula)](https://fet.unipu.hr/_download/repository/Naputak_o_zavrsnom_i_diplomskom_radu.pdf) | Naputak, tehnicko uredenje |
| Prored | `line-spacing-fixer` | prored 1,5 | [Naputak o zavrsnom i diplomskom radu (FET, Pula)](https://fet.unipu.hr/_download/repository/Naputak_o_zavrsnom_i_diplomskom_radu.pdf) | Naputak, tehnicko uredenje |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Naputak o zavrsnom i diplomskom radu (FET, Pula)](https://fet.unipu.hr/_download/repository/Naputak_o_zavrsnom_i_diplomskom_radu.pdf) | Naputak, tehnicko uredenje |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### FET Pula, završni rad

`fetpu-zavrsni` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Naputak o zavrsnom i diplomskom radu (FET, Pula)](https://fet.unipu.hr/_download/repository/Naputak_o_zavrsnom_i_diplomskom_radu.pdf) | Naputak, tehnicko uredenje |
| Vrsta slova | `font-fixer` | Arial | [Naputak o zavrsnom i diplomskom radu (FET, Pula)](https://fet.unipu.hr/_download/repository/Naputak_o_zavrsnom_i_diplomskom_radu.pdf) | Naputak, tehnicko uredenje |
| Velicina slova | `font-fixer` | 12 pt | [Naputak o zavrsnom i diplomskom radu (FET, Pula)](https://fet.unipu.hr/_download/repository/Naputak_o_zavrsnom_i_diplomskom_radu.pdf) | Naputak, tehnicko uredenje |
| Prored | `line-spacing-fixer` | prored 1,5 | [Naputak o zavrsnom i diplomskom radu (FET, Pula)](https://fet.unipu.hr/_download/repository/Naputak_o_zavrsnom_i_diplomskom_radu.pdf) | Naputak, tehnicko uredenje |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Naputak o zavrsnom i diplomskom radu (FET, Pula)](https://fet.unipu.hr/_download/repository/Naputak_o_zavrsnom_i_diplomskom_radu.pdf) | Naputak, tehnicko uredenje |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### ffos

#### FFOS, diplomski rad

`ffos-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Upute za izradu diplomskoga rada (FFOS)](https://www.ffos.unios.hr/download/upute-za-izradu-diplomskoga-rada.docx) | dio II Izgled diplomskoga rada |
| Margine | `margins-fixer` | 2,5 / 2 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Upute za izradu diplomskoga rada (FFOS)](https://www.ffos.unios.hr/download/upute-za-izradu-diplomskoga-rada.docx) | dio II Izgled diplomskoga rada |
| Vrsta slova | `font-fixer` | Times New Roman | [Upute za izradu diplomskoga rada (FFOS)](https://www.ffos.unios.hr/download/upute-za-izradu-diplomskoga-rada.docx) | dio II Izgled diplomskoga rada |
| Velicina slova | `font-fixer` | 12 pt | [Upute za izradu diplomskoga rada (FFOS)](https://www.ffos.unios.hr/download/upute-za-izradu-diplomskoga-rada.docx) | dio II Izgled diplomskoga rada |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za izradu diplomskoga rada (FFOS)](https://www.ffos.unios.hr/download/upute-za-izradu-diplomskoga-rada.docx) | dio II Izgled diplomskoga rada |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### FFOS Germanistika, diplomski rad

`ffos-germanistika-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font (tri opcije) | `font-fixer` | Times New Roman | [Upute za izradu zavrsnih/diplomskih radova, srpanj 2025 (Odsjek za njemacki jezik i knjizevnost, FFOS)](https://www.ffos.unios.hr/wp-content/uploads/2025/07/upute-za-izradu-zavrsnih-radova-germanistika_srpanj-2025.pdf (zavrsni) / .../upute-za-izradu-diplomskih-radova-germanistika_srpanj-2025.pdf (diplomski)) | S2.2 "Allgemeine Textformatierung" |
| Velicina slova | `font-fixer` | 12 pt | [Upute za izradu zavrsnih/diplomskih radova, srpanj 2025 (Odsjek za njemacki jezik i knjizevnost, FFOS)](https://www.ffos.unios.hr/wp-content/uploads/2025/07/upute-za-izradu-zavrsnih-radova-germanistika_srpanj-2025.pdf (zavrsni) / .../upute-za-izradu-diplomskih-radova-germanistika_srpanj-2025.pdf (diplomski)) | S2.2 "Allgemeine Textformatierung" |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za izradu zavrsnih/diplomskih radova, srpanj 2025 (Odsjek za njemacki jezik i knjizevnost, FFOS)](https://www.ffos.unios.hr/wp-content/uploads/2025/07/upute-za-izradu-zavrsnih-radova-germanistika_srpanj-2025.pdf (zavrsni) / .../upute-za-izradu-diplomskih-radova-germanistika_srpanj-2025.pdf (diplomski)) | S2.2 "Allgemeine Textformatierung" |
| Margine (desna 2cm, ostale 2,5cm) | `margins-fixer` | 2,5 / 2 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Upute za izradu zavrsnih/diplomskih radova, srpanj 2025 (Odsjek za njemacki jezik i knjizevnost, FFOS)](https://www.ffos.unios.hr/wp-content/uploads/2025/07/upute-za-izradu-zavrsnih-radova-germanistika_srpanj-2025.pdf (zavrsni) / .../upute-za-izradu-diplomskih-radova-germanistika_srpanj-2025.pdf (diplomski)) | S2.2 "Allgemeine Textformatierung" |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### FFOS Germanistika, završni rad

`ffos-germanistika-zavrsni` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font (tri opcije) | `font-fixer` | Times New Roman | [Upute za izradu zavrsnih/diplomskih radova, srpanj 2025 (Odsjek za njemacki jezik i knjizevnost, FFOS)](https://www.ffos.unios.hr/wp-content/uploads/2025/07/upute-za-izradu-zavrsnih-radova-germanistika_srpanj-2025.pdf (zavrsni) / .../upute-za-izradu-diplomskih-radova-germanistika_srpanj-2025.pdf (diplomski)) | S2.2 "Allgemeine Textformatierung" |
| Velicina slova | `font-fixer` | 12 pt | [Upute za izradu zavrsnih/diplomskih radova, srpanj 2025 (Odsjek za njemacki jezik i knjizevnost, FFOS)](https://www.ffos.unios.hr/wp-content/uploads/2025/07/upute-za-izradu-zavrsnih-radova-germanistika_srpanj-2025.pdf (zavrsni) / .../upute-za-izradu-diplomskih-radova-germanistika_srpanj-2025.pdf (diplomski)) | S2.2 "Allgemeine Textformatierung" |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za izradu zavrsnih/diplomskih radova, srpanj 2025 (Odsjek za njemacki jezik i knjizevnost, FFOS)](https://www.ffos.unios.hr/wp-content/uploads/2025/07/upute-za-izradu-zavrsnih-radova-germanistika_srpanj-2025.pdf (zavrsni) / .../upute-za-izradu-diplomskih-radova-germanistika_srpanj-2025.pdf (diplomski)) | S2.2 "Allgemeine Textformatierung" |
| Margine (desna 2cm, ostale 2,5cm) | `margins-fixer` | 2,5 / 2 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Upute za izradu zavrsnih/diplomskih radova, srpanj 2025 (Odsjek za njemacki jezik i knjizevnost, FFOS)](https://www.ffos.unios.hr/wp-content/uploads/2025/07/upute-za-izradu-zavrsnih-radova-germanistika_srpanj-2025.pdf (zavrsni) / .../upute-za-izradu-diplomskih-radova-germanistika_srpanj-2025.pdf (diplomski)) | S2.2 "Allgemeine Textformatierung" |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### FFOS Informatologija, diplomski rad

`ffos-informatologija-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font (preporuka) | `font-fixer` | Times New Roman | [Upute za pisanje seminarskih radova (Odsjek za informacijske znanosti, FFOS)](https://www.ffos.unios.hr/odsjek-za-informacijske-znanosti/studenti/upute-za-pisanje-seminarskih-radova/) | Odjeljak "Oblikovanje teksta" |
| Velicina slova (preporuka) | `font-fixer` | 12 pt | [Upute za pisanje seminarskih radova (Odsjek za informacijske znanosti, FFOS)](https://www.ffos.unios.hr/odsjek-za-informacijske-znanosti/studenti/upute-za-pisanje-seminarskih-radova/) | Odjeljak "Oblikovanje teksta" |
| Prored (preporuka) | `line-spacing-fixer` | prored 1,5 | [Upute za pisanje seminarskih radova (Odsjek za informacijske znanosti, FFOS)](https://www.ffos.unios.hr/odsjek-za-informacijske-znanosti/studenti/upute-za-pisanje-seminarskih-radova/) | Odjeljak "Oblikovanje teksta" |
| Poravnanje (preporuka) | `alignment-fixer` | obostrano | [Upute za pisanje seminarskih radova (Odsjek za informacijske znanosti, FFOS)](https://www.ffos.unios.hr/odsjek-za-informacijske-znanosti/studenti/upute-za-pisanje-seminarskih-radova/) | Odjeljak "Oblikovanje teksta" |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### FFOS Informatologija, završni rad

`ffos-informatologija-zavrsni` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font (preporuka) | `font-fixer` | Times New Roman | [Upute za pisanje seminarskih radova (Odsjek za informacijske znanosti, FFOS)](https://www.ffos.unios.hr/odsjek-za-informacijske-znanosti/studenti/upute-za-pisanje-seminarskih-radova/) | Odjeljak "Oblikovanje teksta" |
| Velicina slova (preporuka) | `font-fixer` | 12 pt | [Upute za pisanje seminarskih radova (Odsjek za informacijske znanosti, FFOS)](https://www.ffos.unios.hr/odsjek-za-informacijske-znanosti/studenti/upute-za-pisanje-seminarskih-radova/) | Odjeljak "Oblikovanje teksta" |
| Prored (preporuka) | `line-spacing-fixer` | prored 1,5 | [Upute za pisanje seminarskih radova (Odsjek za informacijske znanosti, FFOS)](https://www.ffos.unios.hr/odsjek-za-informacijske-znanosti/studenti/upute-za-pisanje-seminarskih-radova/) | Odjeljak "Oblikovanje teksta" |
| Poravnanje (preporuka) | `alignment-fixer` | obostrano | [Upute za pisanje seminarskih radova (Odsjek za informacijske znanosti, FFOS)](https://www.ffos.unios.hr/odsjek-za-informacijske-znanosti/studenti/upute-za-pisanje-seminarskih-radova/) | Odjeljak "Oblikovanje teksta" |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### FFOS Povijest, diplomski rad

`ffos-povijest-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Upute za izradu diplomskoga rada (FFOS)](https://www.ffos.unios.hr/download/upute-za-izradu-diplomskoga-rada.docx) | dio II Izgled diplomskoga rada |
| Margine | `margins-fixer` | 2,5 / 2 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Upute za izradu diplomskoga rada (FFOS)](https://www.ffos.unios.hr/download/upute-za-izradu-diplomskoga-rada.docx) | dio II Izgled diplomskoga rada |
| Vrsta slova | `font-fixer` | Times New Roman | [Upute za izradu diplomskoga rada (FFOS)](https://www.ffos.unios.hr/download/upute-za-izradu-diplomskoga-rada.docx) | dio II Izgled diplomskoga rada |
| Velicina slova | `font-fixer` | 12 pt | [Upute za izradu diplomskoga rada (FFOS)](https://www.ffos.unios.hr/download/upute-za-izradu-diplomskoga-rada.docx) | dio II Izgled diplomskoga rada |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za izradu diplomskoga rada (FFOS)](https://www.ffos.unios.hr/download/upute-za-izradu-diplomskoga-rada.docx) | dio II Izgled diplomskoga rada |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### FFOS Povijest, završni rad

`ffos-povijest-zavrsni` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Pravilnik o zavrsnim i diplomskim radovima i ispitu (FFOS)](https://www.ffos.unios.hr/wp-content/uploads/2022/03/Pravilnik-o-zavrsnim-i-diplomskim-radovima-i-ispitu.pdf) | Upute za zavrsni rad (dio II) |
| Margine | `margins-fixer` | 2,5 / 2 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Pravilnik o zavrsnim i diplomskim radovima i ispitu (FFOS)](https://www.ffos.unios.hr/wp-content/uploads/2022/03/Pravilnik-o-zavrsnim-i-diplomskim-radovima-i-ispitu.pdf) | Upute za zavrsni rad (dio II) |
| Vrsta slova | `font-fixer` | Times New Roman | [Pravilnik o zavrsnim i diplomskim radovima i ispitu (FFOS)](https://www.ffos.unios.hr/wp-content/uploads/2022/03/Pravilnik-o-zavrsnim-i-diplomskim-radovima-i-ispitu.pdf) | Upute za zavrsni rad (dio II) |
| Velicina slova | `font-fixer` | 12 pt | [Pravilnik o zavrsnim i diplomskim radovima i ispitu (FFOS)](https://www.ffos.unios.hr/wp-content/uploads/2022/03/Pravilnik-o-zavrsnim-i-diplomskim-radovima-i-ispitu.pdf) | Upute za zavrsni rad (dio II) |
| Prored | `line-spacing-fixer` | prored 1,5 | [Pravilnik o zavrsnim i diplomskim radovima i ispitu (FFOS)](https://www.ffos.unios.hr/wp-content/uploads/2022/03/Pravilnik-o-zavrsnim-i-diplomskim-radovima-i-ispitu.pdf) | Upute za zavrsni rad (dio II) |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### FFOS Psihologija, diplomski rad

`ffos-psihologija-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Times New Roman | [Upute za oblikovanje diplomskog rada, 2015 (Odsjek za psihologiju, FFOS)](https://www.ffos.unios.hr/wp-content/uploads/2021/03/Psihologija_upute-za-oblikovanje-diplomskog-rada-2015.pdf) | cijeli dokument |
| Velicina slova | `font-fixer` | 12 pt | [Upute za oblikovanje diplomskog rada, 2015 (Odsjek za psihologiju, FFOS)](https://www.ffos.unios.hr/wp-content/uploads/2021/03/Psihologija_upute-za-oblikovanje-diplomskog-rada-2015.pdf) | cijeli dokument |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za oblikovanje diplomskog rada, 2015 (Odsjek za psihologiju, FFOS)](https://www.ffos.unios.hr/wp-content/uploads/2021/03/Psihologija_upute-za-oblikovanje-diplomskog-rada-2015.pdf) | cijeli dokument |
| Margine (uniformno 2,5cm) | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Upute za oblikovanje diplomskog rada, 2015 (Odsjek za psihologiju, FFOS)](https://www.ffos.unios.hr/wp-content/uploads/2021/03/Psihologija_upute-za-oblikovanje-diplomskog-rada-2015.pdf) | cijeli dokument |
| Format papira A4 | `paper-size-fixer` | 21 x 29,7 cm | [Upute za oblikovanje diplomskog rada, 2015 (Odsjek za psihologiju, FFOS)](https://www.ffos.unios.hr/wp-content/uploads/2021/03/Psihologija_upute-za-oblikovanje-diplomskog-rada-2015.pdf) | cijeli dokument |
| Poravnanje | `alignment-fixer` | obostrano | [Upute za oblikovanje diplomskog rada, 2015 (Odsjek za psihologiju, FFOS)](https://www.ffos.unios.hr/wp-content/uploads/2021/03/Psihologija_upute-za-oblikovanje-diplomskog-rada-2015.pdf) | cijeli dokument |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### FFOS Psihologija, završni rad

`ffos-psihologija-zavrsni` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Times New Roman | [Upute za izradu zavrsnog rada, 2014 (Odsjek za psihologiju, FFOS)](https://www.ffos.unios.hr/wp-content/uploads/2021/03/Psihologija_upute-za-izradu-zavrsnog-rada-2014.pdf) | cijeli dokument |
| Velicina slova | `font-fixer` | 12 pt | [Upute za izradu zavrsnog rada, 2014 (Odsjek za psihologiju, FFOS)](https://www.ffos.unios.hr/wp-content/uploads/2021/03/Psihologija_upute-za-izradu-zavrsnog-rada-2014.pdf) | cijeli dokument |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za izradu zavrsnog rada, 2014 (Odsjek za psihologiju, FFOS)](https://www.ffos.unios.hr/wp-content/uploads/2021/03/Psihologija_upute-za-izradu-zavrsnog-rada-2014.pdf) | cijeli dokument |
| Margine (desna 2cm, ostale 2,5cm) | `margins-fixer` | 2,5 / 2 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Upute za izradu zavrsnog rada, 2014 (Odsjek za psihologiju, FFOS)](https://www.ffos.unios.hr/wp-content/uploads/2021/03/Psihologija_upute-za-izradu-zavrsnog-rada-2014.pdf) | cijeli dokument |
| Format papira A4 | `paper-size-fixer` | 21 x 29,7 cm | [Upute za izradu zavrsnog rada, 2014 (Odsjek za psihologiju, FFOS)](https://www.ffos.unios.hr/wp-content/uploads/2021/03/Psihologija_upute-za-izradu-zavrsnog-rada-2014.pdf) | cijeli dokument |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### FFOS, završni rad

`ffos-zavrsni` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Pravilnik o zavrsnim i diplomskim radovima i ispitu (FFOS)](https://www.ffos.unios.hr/wp-content/uploads/2022/03/Pravilnik-o-zavrsnim-i-diplomskim-radovima-i-ispitu.pdf) | Upute za zavrsni rad (dio II) |
| Margine | `margins-fixer` | 2,5 / 2 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Pravilnik o zavrsnim i diplomskim radovima i ispitu (FFOS)](https://www.ffos.unios.hr/wp-content/uploads/2022/03/Pravilnik-o-zavrsnim-i-diplomskim-radovima-i-ispitu.pdf) | Upute za zavrsni rad (dio II) |
| Vrsta slova | `font-fixer` | Times New Roman | [Pravilnik o zavrsnim i diplomskim radovima i ispitu (FFOS)](https://www.ffos.unios.hr/wp-content/uploads/2022/03/Pravilnik-o-zavrsnim-i-diplomskim-radovima-i-ispitu.pdf) | Upute za zavrsni rad (dio II) |
| Velicina slova | `font-fixer` | 12 pt | [Pravilnik o zavrsnim i diplomskim radovima i ispitu (FFOS)](https://www.ffos.unios.hr/wp-content/uploads/2022/03/Pravilnik-o-zavrsnim-i-diplomskim-radovima-i-ispitu.pdf) | Upute za zavrsni rad (dio II) |
| Prored | `line-spacing-fixer` | prored 1,5 | [Pravilnik o zavrsnim i diplomskim radovima i ispitu (FFOS)](https://www.ffos.unios.hr/wp-content/uploads/2022/03/Pravilnik-o-zavrsnim-i-diplomskim-radovima-i-ispitu.pdf) | Upute za zavrsni rad (dio II) |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### ffpu

#### Filozofski fakultet u Puli, diplomski rad

`ffpu-diplomski` · status: verified · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Pravilnik o izmjenama i dopunama Pravilnika o diplomskom radu i diplomskom koncertu na sveucilisnim diplomskim studijima i integriranome preddiplomskom i diplomskom studiju (23.07.2021.)](https://www.unipu.hr/_download/repository/2021-07-23-Pravilnik_o_izmjenama_i_dopunama_Pravilnika_o_dipl._radu_i_dipl._koncertu_na_sveucilisnim_dipl._studijima_i_integriranome_preddipl._i_dipl._studiju.pdf) | Članak 5. stavak 1. (izmjene 23.07.2021., točka II.), str. 1 PDF-a |
| Vrsta slova | `font-fixer` | Arial | [Pravilnik o izmjenama i dopunama Pravilnika o diplomskom radu i diplomskom koncertu na sveucilisnim diplomskim studijima i integriranome preddiplomskom i diplomskom studiju (23.07.2021.)](https://www.unipu.hr/_download/repository/2021-07-23-Pravilnik_o_izmjenama_i_dopunama_Pravilnika_o_dipl._radu_i_dipl._koncertu_na_sveucilisnim_dipl._studijima_i_integriranome_preddipl._i_dipl._studiju.pdf) | Članak 5. stavak 1. (izmjene 23.07.2021., točka II.), str. 1 PDF-a |
| Veličina slova | `font-fixer` | 12 pt | [Pravilnik o izmjenama i dopunama Pravilnika o diplomskom radu i diplomskom koncertu na sveucilisnim diplomskim studijima i integriranome preddiplomskom i diplomskom studiju (23.07.2021.)](https://www.unipu.hr/_download/repository/2021-07-23-Pravilnik_o_izmjenama_i_dopunama_Pravilnika_o_dipl._radu_i_dipl._koncertu_na_sveucilisnim_dipl._studijima_i_integriranome_preddipl._i_dipl._studiju.pdf) | Članak 5. stavak 1. (izmjene 23.07.2021., točka II.), str. 1 PDF-a |
| Prored | `line-spacing-fixer` | prored 1,5 | [Pravilnik o izmjenama i dopunama Pravilnika o diplomskom radu i diplomskom koncertu na sveucilisnim diplomskim studijima i integriranome preddiplomskom i diplomskom studiju (23.07.2021.)](https://www.unipu.hr/_download/repository/2021-07-23-Pravilnik_o_izmjenama_i_dopunama_Pravilnika_o_dipl._radu_i_dipl._koncertu_na_sveucilisnim_dipl._studijima_i_integriranome_preddipl._i_dipl._studiju.pdf) | Članak 5. stavak 1. (izmjene 23.07.2021., točka II.), str. 1 PDF-a |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Pravilnik o izmjenama i dopunama Pravilnika o diplomskom radu i diplomskom koncertu na sveucilisnim diplomskim studijima i integriranome preddiplomskom i diplomskom studiju (23.07.2021.)](https://www.unipu.hr/_download/repository/2021-07-23-Pravilnik_o_izmjenama_i_dopunama_Pravilnika_o_dipl._radu_i_dipl._koncertu_na_sveucilisnim_dipl._studijima_i_integriranome_preddipl._i_dipl._studiju.pdf) | Članak 5. stavak 1. (izmjene 23.07.2021., točka II.), str. 1 PDF-a |
| Font i veličina fusnota | `footnote-typography-fixer` | 10 pt |  |  |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Sadrzaj kao zivo TOC polje | `toc-field-fixer` | Word sam azurira sadrzaj<br><sub>Dokument ima naslov Sadrzaj, a jos nema zivo TOC polje. Nedestruktivno: rucne stavke se ne brisu.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Filozofski fakultet u Puli, zavrsni rad

`ffpu-zavrsni` · status: verified · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Pravilnik o izmjenama i dopunama Pravilnika o zavrsnom radu i zavrsnom koncertu na preddiplomskim sveucilisnim i strucnim studijima (23.07.2021.)](https://www.unipu.hr/_download/repository/2021-07-23-Pravilnik_o_izmjenama_i_dopunama__Pravilnika_o_zavrsnom_radu_i_zavrsnom_koncertu_na_preddiplomskim_sveucilisnim_i_strucnim_studijima.pdf) | Članak 5. stavak 1. (izmjene 23.07.2021., točka II.), str. 1 PDF-a |
| Vrsta slova | `font-fixer` | Arial | [Pravilnik o izmjenama i dopunama Pravilnika o zavrsnom radu i zavrsnom koncertu na preddiplomskim sveucilisnim i strucnim studijima (23.07.2021.)](https://www.unipu.hr/_download/repository/2021-07-23-Pravilnik_o_izmjenama_i_dopunama__Pravilnika_o_zavrsnom_radu_i_zavrsnom_koncertu_na_preddiplomskim_sveucilisnim_i_strucnim_studijima.pdf) | Članak 5. stavak 1. (izmjene 23.07.2021., točka II.), str. 1 PDF-a |
| Veličina slova | `font-fixer` | 12 pt | [Pravilnik o izmjenama i dopunama Pravilnika o zavrsnom radu i zavrsnom koncertu na preddiplomskim sveucilisnim i strucnim studijima (23.07.2021.)](https://www.unipu.hr/_download/repository/2021-07-23-Pravilnik_o_izmjenama_i_dopunama__Pravilnika_o_zavrsnom_radu_i_zavrsnom_koncertu_na_preddiplomskim_sveucilisnim_i_strucnim_studijima.pdf) | Članak 5. stavak 1. (izmjene 23.07.2021., točka II.), str. 1 PDF-a |
| Prored | `line-spacing-fixer` | prored 1,5 | [Pravilnik o izmjenama i dopunama Pravilnika o zavrsnom radu i zavrsnom koncertu na preddiplomskim sveucilisnim i strucnim studijima (23.07.2021.)](https://www.unipu.hr/_download/repository/2021-07-23-Pravilnik_o_izmjenama_i_dopunama__Pravilnika_o_zavrsnom_radu_i_zavrsnom_koncertu_na_preddiplomskim_sveucilisnim_i_strucnim_studijima.pdf) | Članak 5. stavak 1. (izmjene 23.07.2021., točka II.), str. 1 PDF-a |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Pravilnik o izmjenama i dopunama Pravilnika o zavrsnom radu i zavrsnom koncertu na preddiplomskim sveucilisnim i strucnim studijima (23.07.2021.)](https://www.unipu.hr/_download/repository/2021-07-23-Pravilnik_o_izmjenama_i_dopunama__Pravilnika_o_zavrsnom_radu_i_zavrsnom_koncertu_na_preddiplomskim_sveucilisnim_i_strucnim_studijima.pdf) | Članak 5. stavak 1. (izmjene 23.07.2021., točka II.), str. 1 PDF-a |
| Font i veličina fusnota | `footnote-typography-fixer` | 10 pt |  |  |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Sadrzaj kao zivo TOC polje | `toc-field-fixer` | Word sam azurira sadrzaj<br><sub>Dokument ima naslov Sadrzaj, a jos nema zivo TOC polje. Nedestruktivno: rucne stavke se ne brisu.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### ffri

#### FFRI, diplomski rad

`ffri-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Pravilnik o diplomskom radu (FFRI, 2023)](https://ffri.uniri.hr/wp-content/uploads/Pravilnik_o_diplomskom_radu-2023.pdf) | Članak 11. (oblikovanje diplomskoga rada) |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Pravilnik o diplomskom radu (FFRI, 2023)](https://ffri.uniri.hr/wp-content/uploads/Pravilnik_o_diplomskom_radu-2023.pdf) | Članak 11. (oblikovanje diplomskoga rada) |
| Vrsta slova | `font-fixer` | Times New Roman | [Pravilnik o diplomskom radu (FFRI, 2023)](https://ffri.uniri.hr/wp-content/uploads/Pravilnik_o_diplomskom_radu-2023.pdf) | Članak 11. (oblikovanje diplomskoga rada) |
| Velicina slova | `font-fixer` | 12 pt | [Pravilnik o diplomskom radu (FFRI, 2023)](https://ffri.uniri.hr/wp-content/uploads/Pravilnik_o_diplomskom_radu-2023.pdf) | Članak 11. (oblikovanje diplomskoga rada) |
| Prored | `line-spacing-fixer` | prored 1,5 | [Pravilnik o diplomskom radu (FFRI, 2023)](https://ffri.uniri.hr/wp-content/uploads/Pravilnik_o_diplomskom_radu-2023.pdf) | Članak 11. (oblikovanje diplomskoga rada) |
| Obostrano poravnanje | `alignment-fixer` | obostrano | [Pravilnik o diplomskom radu (FFRI, 2023)](https://ffri.uniri.hr/wp-content/uploads/Pravilnik_o_diplomskom_radu-2023.pdf) | Članak 11. (oblikovanje diplomskoga rada) |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### FFRI Germanistika, diplomski rad

`ffri-germanistika-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Times New Roman | [Leitfaden: Standards des wissenschaftlichen Arbeitens, 5. Version (Odsjek za germanistiku, FFRI)](https://www.ffri.uniri.hr/files/dokumentiodsjeka/GER/Leitfaden-November_2018.pdf) | S3.7, str. 20 (uz obvezujucu deklaraciju na str. 5) |
| Velicina slova | `font-fixer` | 12 pt | [Leitfaden: Standards des wissenschaftlichen Arbeitens, 5. Version (Odsjek za germanistiku, FFRI)](https://www.ffri.uniri.hr/files/dokumentiodsjeka/GER/Leitfaden-November_2018.pdf) | S3.7, str. 20 (uz obvezujucu deklaraciju na str. 5) |
| Prored | `line-spacing-fixer` | prored 1,5 | [Leitfaden: Standards des wissenschaftlichen Arbeitens, 5. Version (Odsjek za germanistiku, FFRI)](https://www.ffri.uniri.hr/files/dokumentiodsjeka/GER/Leitfaden-November_2018.pdf) | S3.7, str. 20 (uz obvezujucu deklaraciju na str. 5) |
| Margine (lijevo/desno 3cm, gore/dolje 2cm) | `margins-fixer` | 2 / 3 / 2 / 3 cm (gore/desno/dolje/lijevo) | [Leitfaden: Standards des wissenschaftlichen Arbeitens, 5. Version (Odsjek za germanistiku, FFRI)](https://www.ffri.uniri.hr/files/dokumentiodsjeka/GER/Leitfaden-November_2018.pdf) | S3.7, str. 20 (uz obvezujucu deklaraciju na str. 5) |
| Format papira A4 | `paper-size-fixer` | 21 x 29,7 cm | [Leitfaden: Standards des wissenschaftlichen Arbeitens, 5. Version (Odsjek za germanistiku, FFRI)](https://www.ffri.uniri.hr/files/dokumentiodsjeka/GER/Leitfaden-November_2018.pdf) | S3.7, str. 20 (uz obvezujucu deklaraciju na str. 5) |
| Poravnanje | `alignment-fixer` | obostrano | [Leitfaden: Standards des wissenschaftlichen Arbeitens, 5. Version (Odsjek za germanistiku, FFRI)](https://www.ffri.uniri.hr/files/dokumentiodsjeka/GER/Leitfaden-November_2018.pdf) | S3.7, str. 20 (uz obvezujucu deklaraciju na str. 5) |
| Font i veličina fusnota | `footnote-typography-fixer` | 10 pt |  |  |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### FFRI Germanistika, završni rad

`ffri-germanistika-zavrsni` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Times New Roman | [Leitfaden: Standards des wissenschaftlichen Arbeitens, 5. Version (Odsjek za germanistiku, FFRI)](https://www.ffri.uniri.hr/files/dokumentiodsjeka/GER/Leitfaden-November_2018.pdf) | S3.7, str. 20 (uz obvezujucu deklaraciju na str. 5) |
| Velicina slova | `font-fixer` | 12 pt | [Leitfaden: Standards des wissenschaftlichen Arbeitens, 5. Version (Odsjek za germanistiku, FFRI)](https://www.ffri.uniri.hr/files/dokumentiodsjeka/GER/Leitfaden-November_2018.pdf) | S3.7, str. 20 (uz obvezujucu deklaraciju na str. 5) |
| Prored | `line-spacing-fixer` | prored 1,5 | [Leitfaden: Standards des wissenschaftlichen Arbeitens, 5. Version (Odsjek za germanistiku, FFRI)](https://www.ffri.uniri.hr/files/dokumentiodsjeka/GER/Leitfaden-November_2018.pdf) | S3.7, str. 20 (uz obvezujucu deklaraciju na str. 5) |
| Margine (lijevo/desno 3cm, gore/dolje 2cm) | `margins-fixer` | 2 / 3 / 2 / 3 cm (gore/desno/dolje/lijevo) | [Leitfaden: Standards des wissenschaftlichen Arbeitens, 5. Version (Odsjek za germanistiku, FFRI)](https://www.ffri.uniri.hr/files/dokumentiodsjeka/GER/Leitfaden-November_2018.pdf) | S3.7, str. 20 (uz obvezujucu deklaraciju na str. 5) |
| Format papira A4 | `paper-size-fixer` | 21 x 29,7 cm | [Leitfaden: Standards des wissenschaftlichen Arbeitens, 5. Version (Odsjek za germanistiku, FFRI)](https://www.ffri.uniri.hr/files/dokumentiodsjeka/GER/Leitfaden-November_2018.pdf) | S3.7, str. 20 (uz obvezujucu deklaraciju na str. 5) |
| Poravnanje | `alignment-fixer` | obostrano | [Leitfaden: Standards des wissenschaftlichen Arbeitens, 5. Version (Odsjek za germanistiku, FFRI)](https://www.ffri.uniri.hr/files/dokumentiodsjeka/GER/Leitfaden-November_2018.pdf) | S3.7, str. 20 (uz obvezujucu deklaraciju na str. 5) |
| Font i veličina fusnota | `footnote-typography-fixer` | 10 pt |  |  |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### FFRI, Hrvatski jezik i knjizevnost (Kroatistika), zavrsni rad

`ffri-kroatistika-zavrsni` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Times New Roman | [Upute za izradu zavrsnoga rada (Odsjek za kroatistiku, FFRI)](https://ffri.uniri.hr/wp-content/uploads/2022/09/HJK-Upute_za_izradu_zavrsnoga_rada.doc) | Postava stranice |
| Velicina slova (tijelo, 14pt - odstupa od opce FFRI vrijednosti) | `font-fixer` | 14 pt | [Upute za izradu zavrsnoga rada (Odsjek za kroatistiku, FFRI)](https://ffri.uniri.hr/wp-content/uploads/2022/09/HJK-Upute_za_izradu_zavrsnoga_rada.doc) | Postava stranice |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za izradu zavrsnoga rada (Odsjek za kroatistiku, FFRI)](https://ffri.uniri.hr/wp-content/uploads/2022/09/HJK-Upute_za_izradu_zavrsnoga_rada.doc) | Postava stranice |
| Poravnanje | `alignment-fixer` | obostrano | [Upute za izradu zavrsnoga rada (Odsjek za kroatistiku, FFRI)](https://ffri.uniri.hr/wp-content/uploads/2022/09/HJK-Upute_za_izradu_zavrsnoga_rada.doc) | Postava stranice |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Upute za izradu zavrsnoga rada (Odsjek za kroatistiku, FFRI)](https://ffri.uniri.hr/wp-content/uploads/2022/09/HJK-Upute_za_izradu_zavrsnoga_rada.doc) | Postava stranice |
| Format papira A4 | `paper-size-fixer` | 21 x 29,7 cm | [Pravilnik o zavrsnom radu (FFRI, izmjena, na snazi od 6.2.2026)](https://ffri.uniri.hr/wp-content/uploads/Pravilnik_o_zavrsnom_radu-2026.pdf) | Clanak 8(2) |
| Font i veličina fusnota | `footnote-typography-fixer` | 10 pt |  |  |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### FFRI Kulturalni studiji, diplomski rad

`ffri-kulturalni-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Times New Roman | [Upute za izradu diplomskog rada, 9.11.2021 (Odsjek za kulturalne studije, FFRI)](https://www.ffri.uniri.hr/files/dokumentiodsjeka/KULT/Upute_za_izradu_dipl_rada.pdf) | cijeli dokument, uskladjeno s Pravilnikom 2021 |
| Velicina slova | `font-fixer` | 12 pt | [Upute za izradu diplomskog rada, 9.11.2021 (Odsjek za kulturalne studije, FFRI)](https://www.ffri.uniri.hr/files/dokumentiodsjeka/KULT/Upute_za_izradu_dipl_rada.pdf) | cijeli dokument, uskladjeno s Pravilnikom 2021 |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za izradu diplomskog rada, 9.11.2021 (Odsjek za kulturalne studije, FFRI)](https://www.ffri.uniri.hr/files/dokumentiodsjeka/KULT/Upute_za_izradu_dipl_rada.pdf) | cijeli dokument, uskladjeno s Pravilnikom 2021 |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Upute za izradu diplomskog rada, 9.11.2021 (Odsjek za kulturalne studije, FFRI)](https://www.ffri.uniri.hr/files/dokumentiodsjeka/KULT/Upute_za_izradu_dipl_rada.pdf) | cijeli dokument, uskladjeno s Pravilnikom 2021 |
| Format papira A4 | `paper-size-fixer` | 21 x 29,7 cm | [Upute za izradu diplomskog rada, 9.11.2021 (Odsjek za kulturalne studije, FFRI)](https://www.ffri.uniri.hr/files/dokumentiodsjeka/KULT/Upute_za_izradu_dipl_rada.pdf) | cijeli dokument, uskladjeno s Pravilnikom 2021 |
| Poravnanje | `alignment-fixer` | obostrano | [Upute za izradu diplomskog rada, 9.11.2021 (Odsjek za kulturalne studije, FFRI)](https://www.ffri.uniri.hr/files/dokumentiodsjeka/KULT/Upute_za_izradu_dipl_rada.pdf) | cijeli dokument, uskladjeno s Pravilnikom 2021 |
| Font i veličina fusnota | `footnote-typography-fixer` | 10 pt |  |  |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### FFRI Povijest umjetnosti, diplomski rad

`ffri-povum-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Times New Roman | [Upute za izradu zavrsnog/diplomskog rada (Odsjek za povijest umjetnosti, FFRI)](https://ffri.uniri.hr/files/dokumentiodsjeka/PU/Upute-zavrsni.pdf (zavrsni) / Upute-diplomski.pdf (diplomski)) | Clanak 9 Pravilnika + odsjecki dodatak |
| Velicina slova | `font-fixer` | 12 pt | [Upute za izradu zavrsnog/diplomskog rada (Odsjek za povijest umjetnosti, FFRI)](https://ffri.uniri.hr/files/dokumentiodsjeka/PU/Upute-zavrsni.pdf (zavrsni) / Upute-diplomski.pdf (diplomski)) | Clanak 9 Pravilnika + odsjecki dodatak |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za izradu zavrsnog/diplomskog rada (Odsjek za povijest umjetnosti, FFRI)](https://ffri.uniri.hr/files/dokumentiodsjeka/PU/Upute-zavrsni.pdf (zavrsni) / Upute-diplomski.pdf (diplomski)) | Clanak 9 Pravilnika + odsjecki dodatak |
| Format papira A4 | `paper-size-fixer` | 21 x 29,7 cm | [Pravilnik o diplomskom radu (FFRI, 2023)](https://ffri.uniri.hr/wp-content/uploads/Pravilnik_o_diplomskom_radu-2023.pdf) | Članak 11. |
| Poravnanje | `alignment-fixer` | obostrano | [Upute za izradu zavrsnog/diplomskog rada (Odsjek za povijest umjetnosti, FFRI)](https://ffri.uniri.hr/files/dokumentiodsjeka/PU/Upute-zavrsni.pdf (zavrsni) / Upute-diplomski.pdf (diplomski)) | Clanak 9 Pravilnika + odsjecki dodatak |
| Font i veličina fusnota | `footnote-typography-fixer` | 10 pt |  |  |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### FFRI Povijest umjetnosti, završni rad

`ffri-povum-zavrsni` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Times New Roman | [Upute za izradu zavrsnog/diplomskog rada (Odsjek za povijest umjetnosti, FFRI)](https://ffri.uniri.hr/files/dokumentiodsjeka/PU/Upute-zavrsni.pdf (zavrsni) / Upute-diplomski.pdf (diplomski)) | Clanak 9 Pravilnika + odsjecki dodatak |
| Velicina slova | `font-fixer` | 12 pt | [Upute za izradu zavrsnog/diplomskog rada (Odsjek za povijest umjetnosti, FFRI)](https://ffri.uniri.hr/files/dokumentiodsjeka/PU/Upute-zavrsni.pdf (zavrsni) / Upute-diplomski.pdf (diplomski)) | Clanak 9 Pravilnika + odsjecki dodatak |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za izradu zavrsnog/diplomskog rada (Odsjek za povijest umjetnosti, FFRI)](https://ffri.uniri.hr/files/dokumentiodsjeka/PU/Upute-zavrsni.pdf (zavrsni) / Upute-diplomski.pdf (diplomski)) | Clanak 9 Pravilnika + odsjecki dodatak |
| Format papira A4 | `paper-size-fixer` | 21 x 29,7 cm | [Pravilnik o zavrsnom radu (FFRI, izmjena, na snazi od 6.2.2026)](https://ffri.uniri.hr/wp-content/uploads/Pravilnik_o_zavrsnom_radu-2026.pdf) | Članak 8. (oblikovanje završnoga rada) |
| Poravnanje | `alignment-fixer` | obostrano | [Upute za izradu zavrsnog/diplomskog rada (Odsjek za povijest umjetnosti, FFRI)](https://ffri.uniri.hr/files/dokumentiodsjeka/PU/Upute-zavrsni.pdf (zavrsni) / Upute-diplomski.pdf (diplomski)) | Clanak 9 Pravilnika + odsjecki dodatak |
| Font i veličina fusnota | `footnote-typography-fixer` | 10 pt |  |  |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### FFRI Psihologija, diplomski rad

`ffri-psihologija-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Times New Roman | [Brosura o izradi i obrani diplomskoga rada, prosinac 2022 (Odsjek za psihologiju, FFRI)](https://ffri.uniri.hr/wp-content/uploads/Brosura-diplomski_rad-PSIH-2022.pdf) | str. 9 (temeljem Clanka 11 Pravilnika) |
| Velicina slova | `font-fixer` | 12 pt | [Brosura o izradi i obrani diplomskoga rada, prosinac 2022 (Odsjek za psihologiju, FFRI)](https://ffri.uniri.hr/wp-content/uploads/Brosura-diplomski_rad-PSIH-2022.pdf) | str. 9 (temeljem Clanka 11 Pravilnika) |
| Prored | `line-spacing-fixer` | prored 1,5 | [Brosura o izradi i obrani diplomskoga rada, prosinac 2022 (Odsjek za psihologiju, FFRI)](https://ffri.uniri.hr/wp-content/uploads/Brosura-diplomski_rad-PSIH-2022.pdf) | str. 9 (temeljem Clanka 11 Pravilnika) |
| Format papira A4 | `paper-size-fixer` | 21 x 29,7 cm | [Brosura o izradi i obrani diplomskoga rada, prosinac 2022 (Odsjek za psihologiju, FFRI)](https://ffri.uniri.hr/wp-content/uploads/Brosura-diplomski_rad-PSIH-2022.pdf) | str. 9 (temeljem Clanka 11 Pravilnika) |
| Poravnanje | `alignment-fixer` | obostrano | [Brosura o izradi i obrani diplomskoga rada, prosinac 2022 (Odsjek za psihologiju, FFRI)](https://ffri.uniri.hr/wp-content/uploads/Brosura-diplomski_rad-PSIH-2022.pdf) | str. 9 (temeljem Clanka 11 Pravilnika) |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### FFRI, završni rad

`ffri-zavrsni` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Pravilnik o zavrsnom radu (FFRI, izmjena, na snazi od 6.2.2026)](https://ffri.uniri.hr/wp-content/uploads/Pravilnik_o_zavrsnom_radu-2026.pdf) | Članak 8. (oblikovanje završnoga rada) |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Pravilnik o zavrsnom radu (FFRI, izmjena, na snazi od 6.2.2026)](https://ffri.uniri.hr/wp-content/uploads/Pravilnik_o_zavrsnom_radu-2026.pdf) | Članak 8. (oblikovanje završnoga rada) |
| Vrsta slova | `font-fixer` | Times New Roman | [Pravilnik o zavrsnom radu (FFRI, izmjena, na snazi od 6.2.2026)](https://ffri.uniri.hr/wp-content/uploads/Pravilnik_o_zavrsnom_radu-2026.pdf) | Članak 8. (oblikovanje završnoga rada) |
| Velicina slova | `font-fixer` | 12 pt | [Pravilnik o zavrsnom radu (FFRI, izmjena, na snazi od 6.2.2026)](https://ffri.uniri.hr/wp-content/uploads/Pravilnik_o_zavrsnom_radu-2026.pdf) | Članak 8. (oblikovanje završnoga rada) |
| Prored | `line-spacing-fixer` | prored 1,5 | [Pravilnik o zavrsnom radu (FFRI, izmjena, na snazi od 6.2.2026)](https://ffri.uniri.hr/wp-content/uploads/Pravilnik_o_zavrsnom_radu-2026.pdf) | Članak 8. (oblikovanje završnoga rada) |
| Obostrano poravnanje | `alignment-fixer` | obostrano | [Pravilnik o zavrsnom radu (FFRI, izmjena, na snazi od 6.2.2026)](https://ffri.uniri.hr/wp-content/uploads/Pravilnik_o_zavrsnom_radu-2026.pdf) | Članak 8. (oblikovanje završnoga rada) |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### ffrz

#### Fakultet filozofije i religijskih znanosti, bakalaureatski (završni) rad

`ffrz-bakalaureatski` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Times New Roman | [Upute za formalno oblikovanje bakalaureatskog rada (zavrsnog rada preddiplomskog studija) (Fakultet filozofije i religijskih znanosti, 2021)](https://www.ffrz.unizg.hr/wp-content/uploads/2021/12/Upute-za-formalno-oblikovanje-bakalaureatskog-rada.pdf) | odjeljak Postavke stranice |
| Velicina slova | `font-fixer` | 12 pt | [Upute za formalno oblikovanje bakalaureatskog rada (zavrsnog rada preddiplomskog studija) (Fakultet filozofije i religijskih znanosti, 2021)](https://www.ffrz.unizg.hr/wp-content/uploads/2021/12/Upute-za-formalno-oblikovanje-bakalaureatskog-rada.pdf) | odjeljak Postavke stranice |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za formalno oblikovanje bakalaureatskog rada (zavrsnog rada preddiplomskog studija) (Fakultet filozofije i religijskih znanosti, 2021)](https://www.ffrz.unizg.hr/wp-content/uploads/2021/12/Upute-za-formalno-oblikovanje-bakalaureatskog-rada.pdf) | odjeljak Postavke stranice |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Upute za formalno oblikovanje bakalaureatskog rada (zavrsnog rada preddiplomskog studija) (Fakultet filozofije i religijskih znanosti, 2021)](https://www.ffrz.unizg.hr/wp-content/uploads/2021/12/Upute-za-formalno-oblikovanje-bakalaureatskog-rada.pdf) | odjeljak Postavke stranice |
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Upute za formalno oblikovanje bakalaureatskog rada (zavrsnog rada preddiplomskog studija) (Fakultet filozofije i religijskih znanosti, 2021)](https://www.ffrz.unizg.hr/wp-content/uploads/2021/12/Upute-za-formalno-oblikovanje-bakalaureatskog-rada.pdf) | uvodni odlomak: papir A4 i opseg |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Sadrzaj kao zivo TOC polje | `toc-field-fixer` | Word sam azurira sadrzaj<br><sub>Dokument ima naslov Sadrzaj, a jos nema zivo TOC polje. Nedestruktivno: rucne stavke se ne brisu.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Fakultet filozofije i religijskih znanosti, diplomski rad

`ffrz-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Times New Roman | [Upute za formalno oblikovanje diplomskoga rada (Fakultet filozofije i religijskih znanosti, 2021)](https://www.ffrz.unizg.hr/wp-content/uploads/2021/12/Upute-za-formalno-oblikovanje-diplomskog-rada.pdf) | odjeljak Postavke stranice |
| Velicina slova | `font-fixer` | 12 pt | [Upute za formalno oblikovanje diplomskoga rada (Fakultet filozofije i religijskih znanosti, 2021)](https://www.ffrz.unizg.hr/wp-content/uploads/2021/12/Upute-za-formalno-oblikovanje-diplomskog-rada.pdf) | odjeljak Postavke stranice |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za formalno oblikovanje diplomskoga rada (Fakultet filozofije i religijskih znanosti, 2021)](https://www.ffrz.unizg.hr/wp-content/uploads/2021/12/Upute-za-formalno-oblikovanje-diplomskog-rada.pdf) | odjeljak Postavke stranice |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Upute za formalno oblikovanje diplomskoga rada (Fakultet filozofije i religijskih znanosti, 2021)](https://www.ffrz.unizg.hr/wp-content/uploads/2021/12/Upute-za-formalno-oblikovanje-diplomskog-rada.pdf) | odjeljak Postavke stranice |
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Upute za formalno oblikovanje diplomskoga rada (Fakultet filozofije i religijskih znanosti, 2021)](https://www.ffrz.unizg.hr/wp-content/uploads/2021/12/Upute-za-formalno-oblikovanje-diplomskog-rada.pdf) | uvodni odlomak: papir A4 i opseg |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Sadrzaj kao zivo TOC polje | `toc-field-fixer` | Word sam azurira sadrzaj<br><sub>Dokument ima naslov Sadrzaj, a jos nema zivo TOC polje. Nedestruktivno: rucne stavke se ne brisu.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Fakultet filozofije i religijskih znanosti, doktorski rad

`ffrz-doktorski` · status: partial · vrste rada: doctoral

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Times New Roman | [Upute za oblikovanje doktorskog rada (Obrazac DR.SC.-08)](https://www.unizg.hr/nc/vijest/article/obrasci-za-doktorski-studij/) | odjeljak 'Postavke stranice' (DR.SC.-08, Upute za oblikovanje doktorskog rada) |
| Velicina slova | `font-fixer` | 12 pt | [Upute za oblikovanje doktorskog rada (Obrazac DR.SC.-08)](https://www.unizg.hr/nc/vijest/article/obrasci-za-doktorski-studij/) | odjeljak 'Postavke stranice' (DR.SC.-08, Upute za oblikovanje doktorskog rada) |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za oblikovanje doktorskog rada (Obrazac DR.SC.-08)](https://www.unizg.hr/nc/vijest/article/obrasci-za-doktorski-studij/) | odjeljak 'Postavke stranice' (DR.SC.-08, Upute za oblikovanje doktorskog rada) |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Upute za oblikovanje doktorskog rada (Obrazac DR.SC.-08)](https://www.unizg.hr/nc/vijest/article/obrasci-za-doktorski-studij/) | odjeljak 'Postavke stranice' (DR.SC.-08, Upute za oblikovanje doktorskog rada) |
| Format papira A4 | `paper-size-fixer` | 21 x 29,7 cm | [Upute za oblikovanje doktorskog rada (Obrazac DR.SC.-08)](https://www.unizg.hr/nc/vijest/article/obrasci-za-doktorski-studij/) | odjeljak 'Postavke stranice' (DR.SC.-08, Upute za oblikovanje doktorskog rada) |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### ffst

#### FFST, diplomski rad

`ffst-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Times New Roman | [Predlozak zavrsnoga/diplomskoga rada, final (Filozofski fakultet u Splitu)](https://www.ffst.unist.hr/_download/repository/PREDLOZAK%20ZAVRSNOGA-DIPLOMSKOGA%20RADA%20-%20final.docx) | Predlozak, stil Normal + footer2.xml (obvezujuc preko Pravilnik Clanak 9 -> Upute) |
| Velicina slova | `font-fixer` | 12 pt | [Predlozak zavrsnoga/diplomskoga rada, final (Filozofski fakultet u Splitu)](https://www.ffst.unist.hr/_download/repository/PREDLOZAK%20ZAVRSNOGA-DIPLOMSKOGA%20RADA%20-%20final.docx) | Predlozak, stil Normal + footer2.xml (obvezujuc preko Pravilnik Clanak 9 -> Upute) |
| Prored | `line-spacing-fixer` | prored 1,5 | [Predlozak zavrsnoga/diplomskoga rada, final (Filozofski fakultet u Splitu)](https://www.ffst.unist.hr/_download/repository/PREDLOZAK%20ZAVRSNOGA-DIPLOMSKOGA%20RADA%20-%20final.docx) | Predlozak, stil Normal + footer2.xml (obvezujuc preko Pravilnik Clanak 9 -> Upute) |
| Format papira A4 | `paper-size-fixer` | 21 x 29,7 cm | [Predlozak zavrsnoga/diplomskoga rada, final (Filozofski fakultet u Splitu)](https://www.ffst.unist.hr/_download/repository/PREDLOZAK%20ZAVRSNOGA-DIPLOMSKOGA%20RADA%20-%20final.docx) | Predlozak, stil Normal + footer2.xml (obvezujuc preko Pravilnik Clanak 9 -> Upute) |
| Poravnanje | `alignment-fixer` | obostrano | [Predlozak zavrsnoga/diplomskoga rada, final (Filozofski fakultet u Splitu)](https://www.ffst.unist.hr/_download/repository/PREDLOZAK%20ZAVRSNOGA-DIPLOMSKOGA%20RADA%20-%20final.docx) | Predlozak, stil Normal + footer2.xml (obvezujuc preko Pravilnik Clanak 9 -> Upute) |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### FFST, završni rad

`ffst-zavrsni` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Times New Roman | [Predlozak zavrsnoga/diplomskoga rada, final (Filozofski fakultet u Splitu)](https://www.ffst.unist.hr/_download/repository/PREDLOZAK%20ZAVRSNOGA-DIPLOMSKOGA%20RADA%20-%20final.docx) | Predlozak, stil Normal + footer2.xml (obvezujuc preko Pravilnik Clanak 9 -> Upute) |
| Velicina slova | `font-fixer` | 12 pt | [Predlozak zavrsnoga/diplomskoga rada, final (Filozofski fakultet u Splitu)](https://www.ffst.unist.hr/_download/repository/PREDLOZAK%20ZAVRSNOGA-DIPLOMSKOGA%20RADA%20-%20final.docx) | Predlozak, stil Normal + footer2.xml (obvezujuc preko Pravilnik Clanak 9 -> Upute) |
| Prored | `line-spacing-fixer` | prored 1,5 | [Predlozak zavrsnoga/diplomskoga rada, final (Filozofski fakultet u Splitu)](https://www.ffst.unist.hr/_download/repository/PREDLOZAK%20ZAVRSNOGA-DIPLOMSKOGA%20RADA%20-%20final.docx) | Predlozak, stil Normal + footer2.xml (obvezujuc preko Pravilnik Clanak 9 -> Upute) |
| Format papira A4 | `paper-size-fixer` | 21 x 29,7 cm | [Predlozak zavrsnoga/diplomskoga rada, final (Filozofski fakultet u Splitu)](https://www.ffst.unist.hr/_download/repository/PREDLOZAK%20ZAVRSNOGA-DIPLOMSKOGA%20RADA%20-%20final.docx) | Predlozak, stil Normal + footer2.xml (obvezujuc preko Pravilnik Clanak 9 -> Upute) |
| Poravnanje | `alignment-fixer` | obostrano | [Predlozak zavrsnoga/diplomskoga rada, final (Filozofski fakultet u Splitu)](https://www.ffst.unist.hr/_download/repository/PREDLOZAK%20ZAVRSNOGA-DIPLOMSKOGA%20RADA%20-%20final.docx) | Predlozak, stil Normal + footer2.xml (obvezujuc preko Pravilnik Clanak 9 -> Upute) |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### ffzg

#### Filozofski fakultet (Odsjek za arheologiju), diplomski (magistarski) rad

`ffzg-arheologija-graduate` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Times New Roman | [Upute za izradu pisanih radova (Filozofski fakultet, Odsjek za arheologiju, Katedra za anticku provincijalnu i ranokrsansku arheologiju)](https://arheo.ffzg.unizg.hr/provincijalna/wp-content/uploads/2014/04/Upute-za-izradu-pisanih-radova.pdf) | odjeljak 1. Izgled sloga |
| Velicina slova | `font-fixer` | 12 pt | [Upute za izradu pisanih radova (Filozofski fakultet, Odsjek za arheologiju, Katedra za anticku provincijalnu i ranokrsansku arheologiju)](https://arheo.ffzg.unizg.hr/provincijalna/wp-content/uploads/2014/04/Upute-za-izradu-pisanih-radova.pdf) | odjeljak 1. Izgled sloga |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za izradu pisanih radova (Filozofski fakultet, Odsjek za arheologiju, Katedra za anticku provincijalnu i ranokrsansku arheologiju)](https://arheo.ffzg.unizg.hr/provincijalna/wp-content/uploads/2014/04/Upute-za-izradu-pisanih-radova.pdf) | odjeljak 1. Izgled sloga |
| Margine | `margins-fixer` | 3 / 3 / 3 / 3 cm (gore/desno/dolje/lijevo) | [Upute za izradu pisanih radova (Filozofski fakultet, Odsjek za arheologiju, Katedra za anticku provincijalnu i ranokrsansku arheologiju)](https://arheo.ffzg.unizg.hr/provincijalna/wp-content/uploads/2014/04/Upute-za-izradu-pisanih-radova.pdf) | odjeljak 1. Izgled sloga |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Sadrzaj kao zivo TOC polje | `toc-field-fixer` | Word sam azurira sadrzaj<br><sub>Dokument ima naslov Sadrzaj, a jos nema zivo TOC polje. Nedestruktivno: rucne stavke se ne brisu.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Filozofski fakultet (Odsjek za etnologiju i kulturnu antropologiju), diplomski rad

`ffzg-etnologija-graduate` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Times New Roman | [Upute za prijavu, izradu i obranu diplomskog rada (Filozofski fakultet, Odsjek za etnologiju i kulturnu antropologiju)](https://etno.ffzg.unizg.hr/wp-content/uploads/2019/08/UPUTE-DIPLOMSKI-RAD-EKA.pdf) | odjeljak Graficko oblikovanje teksta |
| Velicina slova | `font-fixer` | 12 pt | [Upute za prijavu, izradu i obranu diplomskog rada (Filozofski fakultet, Odsjek za etnologiju i kulturnu antropologiju)](https://etno.ffzg.unizg.hr/wp-content/uploads/2019/08/UPUTE-DIPLOMSKI-RAD-EKA.pdf) | odjeljak Graficko oblikovanje teksta |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za prijavu, izradu i obranu diplomskog rada (Filozofski fakultet, Odsjek za etnologiju i kulturnu antropologiju)](https://etno.ffzg.unizg.hr/wp-content/uploads/2019/08/UPUTE-DIPLOMSKI-RAD-EKA.pdf) | odjeljak Graficko oblikovanje teksta |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Upute za prijavu, izradu i obranu diplomskog rada (Filozofski fakultet, Odsjek za etnologiju i kulturnu antropologiju)](https://etno.ffzg.unizg.hr/wp-content/uploads/2019/08/UPUTE-DIPLOMSKI-RAD-EKA.pdf) | odjeljak Graficko oblikovanje teksta |
| Obostrano poravnanje | `alignment-fixer` | obostrano | [Upute za prijavu, izradu i obranu diplomskog rada (Filozofski fakultet, Odsjek za etnologiju i kulturnu antropologiju)](https://etno.ffzg.unizg.hr/wp-content/uploads/2019/08/UPUTE-DIPLOMSKI-RAD-EKA.pdf) | odjeljak Graficko oblikovanje teksta |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Filozofski fakultet (Odsjek za filozofiju), diplomski rad

`ffzg-filozofija-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Times New Roman | [Upute za oblikovanje diplomskoga rada na studiju filozofije (Filozofski fakultet, Odsjek za filozofiju, 2019)](https://filoz.ffzg.unizg.hr/wp-content/uploads/2019/06/Upute-za-oblikovanje-diplomskoga-rada.pdf) | odjeljak Tekst treba oblikovati na sljedei nacin |
| Velicina slova | `font-fixer` | 12 pt | [Upute za oblikovanje diplomskoga rada na studiju filozofije (Filozofski fakultet, Odsjek za filozofiju, 2019)](https://filoz.ffzg.unizg.hr/wp-content/uploads/2019/06/Upute-za-oblikovanje-diplomskoga-rada.pdf) | odjeljak Tekst treba oblikovati na sljedei nacin |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za oblikovanje diplomskoga rada na studiju filozofije (Filozofski fakultet, Odsjek za filozofiju, 2019)](https://filoz.ffzg.unizg.hr/wp-content/uploads/2019/06/Upute-za-oblikovanje-diplomskoga-rada.pdf) | odjeljak Tekst treba oblikovati na sljedei nacin |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Upute za oblikovanje diplomskoga rada na studiju filozofije (Filozofski fakultet, Odsjek za filozofiju, 2019)](https://filoz.ffzg.unizg.hr/wp-content/uploads/2019/06/Upute-za-oblikovanje-diplomskoga-rada.pdf) | odjeljak Tekst treba oblikovati na sljedei nacin |
| Obostrano poravnanje | `alignment-fixer` | obostrano | [Upute za oblikovanje diplomskoga rada na studiju filozofije (Filozofski fakultet, Odsjek za filozofiju, 2019)](https://filoz.ffzg.unizg.hr/wp-content/uploads/2019/06/Upute-za-oblikovanje-diplomskoga-rada.pdf) | odjeljak Tekst treba oblikovati na sljedei nacin |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Sadrzaj kao zivo TOC polje | `toc-field-fixer` | Word sam azurira sadrzaj<br><sub>Dokument ima naslov Sadrzaj, a jos nema zivo TOC polje. Nedestruktivno: rucne stavke se ne brisu.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Filozofski fakultet (Odsjek za informacijske i komunikacijske znanosti), završni rad

`ffzg-informacijske-zavrsni` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Arial | [Upute i pravila za prijavu, pisanje i obranu rada na redovitom studiju (Filozofski fakultet, Odsjek za informacijske i komunikacijske znanosti, 2024)](https://inf.ffzg.unizg.hr/images/korisno/upute2018/Upute_i_pravila_za_prijavu_pisanje_i_obranu_rada_-_v8.pdf) | odjeljak 3.8. Izgled i stilovi |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Sadrzaj kao zivo TOC polje | `toc-field-fixer` | Word sam azurira sadrzaj<br><sub>Dokument ima naslov Sadrzaj, a jos nema zivo TOC polje. Nedestruktivno: rucne stavke se ne brisu.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Filozofski fakultet (Odsjek za kroatistiku), diplomski rad

`ffzg-kroatistika-graduate` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Times New Roman | [Opce upute za sastavljanje diplomskoga rada (Filozofski fakultet, Odsjek za kroatistiku)](https://kroat.ffzg.unizg.hr/index.php/studij/diplomski-rad/153-opce-upute-za-sastavljanje-diplomskoga-rada) | odjeljak 6. Oblikovanje teksta |
| Velicina slova | `font-fixer` | 12 pt | [Opce upute za sastavljanje diplomskoga rada (Filozofski fakultet, Odsjek za kroatistiku)](https://kroat.ffzg.unizg.hr/index.php/studij/diplomski-rad/153-opce-upute-za-sastavljanje-diplomskoga-rada) | odjeljak 6. Oblikovanje teksta |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Opce upute za sastavljanje diplomskoga rada (Filozofski fakultet, Odsjek za kroatistiku)](https://kroat.ffzg.unizg.hr/index.php/studij/diplomski-rad/153-opce-upute-za-sastavljanje-diplomskoga-rada) | odjeljak 6. Oblikovanje teksta |
| Prored | `line-spacing-fixer` | prored 1,5 | [Opce upute za sastavljanje diplomskoga rada (Filozofski fakultet, Odsjek za kroatistiku)](https://kroat.ffzg.unizg.hr/index.php/studij/diplomski-rad/153-opce-upute-za-sastavljanje-diplomskoga-rada) | odjeljak 6. Oblikovanje teksta |
| Obostrano poravnanje | `alignment-fixer` | obostrano | [Opce upute za sastavljanje diplomskoga rada (Filozofski fakultet, Odsjek za kroatistiku)](https://kroat.ffzg.unizg.hr/index.php/studij/diplomski-rad/153-opce-upute-za-sastavljanje-diplomskoga-rada) | odjeljak 6. Oblikovanje teksta |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Sadrzaj kao zivo TOC polje | `toc-field-fixer` | Word sam azurira sadrzaj<br><sub>Dokument ima naslov Sadrzaj, a jos nema zivo TOC polje. Nedestruktivno: rucne stavke se ne brisu.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Filozofski fakultet (Odsjek za lingvistiku), diplomski rad

`ffzg-lingvistika-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Times New Roman | [Smjernice za izradu i obranu diplomskog rada (Filozofski fakultet, Odsjek za lingvistiku, 2024)](https://www.ffzg.unizg.hr/oling/wp-content/uploads/2024/04/Smjernice-za-izradu-diplomskoga-rada-Lingvistika-1.pdf) | odjeljak Oblikovanje teksta, tocka 1 |
| Velicina slova | `font-fixer` | 12 pt | [Smjernice za izradu i obranu diplomskog rada (Filozofski fakultet, Odsjek za lingvistiku, 2024)](https://www.ffzg.unizg.hr/oling/wp-content/uploads/2024/04/Smjernice-za-izradu-diplomskoga-rada-Lingvistika-1.pdf) | odjeljak Oblikovanje teksta, tocka 1 |
| Prored | `line-spacing-fixer` | prored 1,5 | [Smjernice za izradu i obranu diplomskog rada (Filozofski fakultet, Odsjek za lingvistiku, 2024)](https://www.ffzg.unizg.hr/oling/wp-content/uploads/2024/04/Smjernice-za-izradu-diplomskoga-rada-Lingvistika-1.pdf) | odjeljak Oblikovanje teksta, tocka 1 |
| Obostrano poravnanje | `alignment-fixer` | obostrano | [Smjernice za izradu i obranu diplomskog rada (Filozofski fakultet, Odsjek za lingvistiku, 2024)](https://www.ffzg.unizg.hr/oling/wp-content/uploads/2024/04/Smjernice-za-izradu-diplomskoga-rada-Lingvistika-1.pdf) | odjeljak Oblikovanje teksta, tocka 1 |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Smjernice za izradu i obranu diplomskog rada (Filozofski fakultet, Odsjek za lingvistiku, 2024)](https://www.ffzg.unizg.hr/oling/wp-content/uploads/2024/04/Smjernice-za-izradu-diplomskoga-rada-Lingvistika-1.pdf) | odjeljak Oblikovanje teksta, tocka 2 |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Filozofski fakultet (Odsjek za pedagogiju), diplomski rad

`ffzg-pedagogija-graduate` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Margine | `margins-fixer` | 3 / 3 / 3 / 3 cm (gore/desno/dolje/lijevo) | [Upute za oblikovanje diplomskoga rada Odsjeka za pedagogiju (Filozofski fakultet, Odsjek za pedagogiju, 2024)](https://pedagogija.ffzg.unizg.hr/wp-content/uploads/2024/03/Upute-za-oblikovanje-diplomskoga-rada-Odsjeka-za-pedagogiju_2024.pdf) | odjeljak Tekst diplomskoga rada valja oblikovati na sljedei nacin |
| Obostrano poravnanje | `alignment-fixer` | obostrano | [Upute za oblikovanje diplomskoga rada Odsjeka za pedagogiju (Filozofski fakultet, Odsjek za pedagogiju, 2024)](https://pedagogija.ffzg.unizg.hr/wp-content/uploads/2024/03/Upute-za-oblikovanje-diplomskoga-rada-Odsjeka-za-pedagogiju_2024.pdf) | odjeljak Tekst diplomskoga rada valja oblikovati na sljedei nacin |
| Font | `font-fixer` | Times New Roman | [Upute za oblikovanje diplomskoga rada Odsjeka za pedagogiju (Filozofski fakultet, Odsjek za pedagogiju, 2024)](https://pedagogija.ffzg.unizg.hr/wp-content/uploads/2024/03/Upute-za-oblikovanje-diplomskoga-rada-Odsjeka-za-pedagogiju_2024.pdf) | odjeljak Tekst diplomskoga rada valja oblikovati na sljedei nacin |
| Velicina slova | `font-fixer` | 12 pt | [Upute za oblikovanje diplomskoga rada Odsjeka za pedagogiju (Filozofski fakultet, Odsjek za pedagogiju, 2024)](https://pedagogija.ffzg.unizg.hr/wp-content/uploads/2024/03/Upute-za-oblikovanje-diplomskoga-rada-Odsjeka-za-pedagogiju_2024.pdf) | odjeljak Tekst diplomskoga rada valja oblikovati na sljedei nacin |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za oblikovanje diplomskoga rada Odsjeka za pedagogiju (Filozofski fakultet, Odsjek za pedagogiju, 2024)](https://pedagogija.ffzg.unizg.hr/wp-content/uploads/2024/03/Upute-za-oblikovanje-diplomskoga-rada-Odsjeka-za-pedagogiju_2024.pdf) | odjeljak Tekst diplomskoga rada valja oblikovati na sljedei nacin |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Sadrzaj kao zivo TOC polje | `toc-field-fixer` | Word sam azurira sadrzaj<br><sub>Dokument ima naslov Sadrzaj, a jos nema zivo TOC polje. Nedestruktivno: rucne stavke se ne brisu.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Filozofski fakultet (Odsjek za povijest umjetnosti), diplomski rad

`ffzg-povijest-umjetnosti-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Times New Roman | [Upute za prijavu, izradu i obranu diplomskog rada na Odsjeku za povijest umjetnosti (Filozofski fakultet Sveucilista u Zagrebu, 2016)](https://povum.ffzg.unizg.hr/wp-content/uploads/2011/02/PUM-Upute_za_izradu_diplomskog_rada2016.pdf) | odjeljak 7.2. Opseg i graficko oblikovanje |
| Velicina slova | `font-fixer` | 12 pt | [Upute za prijavu, izradu i obranu diplomskog rada na Odsjeku za povijest umjetnosti (Filozofski fakultet Sveucilista u Zagrebu, 2016)](https://povum.ffzg.unizg.hr/wp-content/uploads/2011/02/PUM-Upute_za_izradu_diplomskog_rada2016.pdf) | odjeljak 7.2. Opseg i graficko oblikovanje |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za prijavu, izradu i obranu diplomskog rada na Odsjeku za povijest umjetnosti (Filozofski fakultet Sveucilista u Zagrebu, 2016)](https://povum.ffzg.unizg.hr/wp-content/uploads/2011/02/PUM-Upute_za_izradu_diplomskog_rada2016.pdf) | odjeljak 7.2. Opseg i graficko oblikovanje |
| Margine (2,5 cm gore, dolje, lijevo; 2 cm desno) | `margins-fixer` | 2,5 / 2 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Upute za prijavu, izradu i obranu diplomskog rada na Odsjeku za povijest umjetnosti (Filozofski fakultet Sveucilista u Zagrebu, 2016)](https://povum.ffzg.unizg.hr/wp-content/uploads/2011/02/PUM-Upute_za_izradu_diplomskog_rada2016.pdf) | odjeljak 7.2. Opseg i graficko oblikovanje |
| Obostrano poravnanje | `alignment-fixer` | obostrano | [Upute za prijavu, izradu i obranu diplomskog rada na Odsjeku za povijest umjetnosti (Filozofski fakultet Sveucilista u Zagrebu, 2016)](https://povum.ffzg.unizg.hr/wp-content/uploads/2011/02/PUM-Upute_za_izradu_diplomskog_rada2016.pdf) | odjeljak 7.2. Opseg i graficko oblikovanje |
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Upute za prijavu, izradu i obranu diplomskog rada na Odsjeku za povijest umjetnosti (Filozofski fakultet Sveucilista u Zagrebu, 2016)](https://povum.ffzg.unizg.hr/wp-content/uploads/2011/02/PUM-Upute_za_izradu_diplomskog_rada2016.pdf) | odjeljak 7.2. Opseg i graficko oblikovanje |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Filozofski fakultet (Odsjek za psihologiju), diplomski rad

`ffzg-psihologija-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Times New Roman | [Upute za pisanje i oblikovanje diplomskog rada na Odsjeku za psihologiju Filozofskog fakulteta Sveucilista u Zagrebu (2024)](https://psihologija.ffzg.unizg.hr/wp-content/uploads/2024/10/Diplomski-rad_upute_2024.docx) | odjeljak Formatiranje stranice teksta |
| Velicina slova | `font-fixer` | 12 pt | [Upute za pisanje i oblikovanje diplomskog rada na Odsjeku za psihologiju Filozofskog fakulteta Sveucilista u Zagrebu (2024)](https://psihologija.ffzg.unizg.hr/wp-content/uploads/2024/10/Diplomski-rad_upute_2024.docx) | odjeljak Formatiranje stranice teksta |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za pisanje i oblikovanje diplomskog rada na Odsjeku za psihologiju Filozofskog fakulteta Sveucilista u Zagrebu (2024)](https://psihologija.ffzg.unizg.hr/wp-content/uploads/2024/10/Diplomski-rad_upute_2024.docx) | odjeljak Formatiranje stranice teksta |
| Margine | `margins-fixer` | 2,54 / 2,54 / 2,54 / 2,54 cm (gore/desno/dolje/lijevo) | [Upute za pisanje i oblikovanje diplomskog rada na Odsjeku za psihologiju Filozofskog fakulteta Sveucilista u Zagrebu (2024)](https://psihologija.ffzg.unizg.hr/wp-content/uploads/2024/10/Diplomski-rad_upute_2024.docx) | odjeljak Formatiranje stranice teksta |
| Poravnanje teksta (lijevo poravnato) | `alignment-fixer` | lijevo | [Upute za pisanje i oblikovanje diplomskog rada na Odsjeku za psihologiju Filozofskog fakulteta Sveucilista u Zagrebu (2024)](https://psihologija.ffzg.unizg.hr/wp-content/uploads/2024/10/Diplomski-rad_upute_2024.docx) | odjeljak Formatiranje stranice teksta |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Sadrzaj kao zivo TOC polje | `toc-field-fixer` | Word sam azurira sadrzaj<br><sub>Dokument ima naslov Sadrzaj, a jos nema zivo TOC polje. Nedestruktivno: rucne stavke se ne brisu.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Filozofski fakultet (Odsjek za sociologiju), diplomski rad

`ffzg-sociologija-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Times New Roman | [Upute za prijavu, izradu i obranu diplomskog rada (Filozofski fakultet, Odsjek za sociologiju)](https://www.ffzg.unizg.hr/socio/wp-content/uploads/2014/02/Upute-za-diplomski.pdf) | odjeljak GRAFICKO FORMATIRANJE RADA |
| Velicina slova | `font-fixer` | 12 pt | [Upute za prijavu, izradu i obranu diplomskog rada (Filozofski fakultet, Odsjek za sociologiju)](https://www.ffzg.unizg.hr/socio/wp-content/uploads/2014/02/Upute-za-diplomski.pdf) | odjeljak GRAFICKO FORMATIRANJE RADA |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za prijavu, izradu i obranu diplomskog rada (Filozofski fakultet, Odsjek za sociologiju)](https://www.ffzg.unizg.hr/socio/wp-content/uploads/2014/02/Upute-za-diplomski.pdf) | odjeljak GRAFICKO FORMATIRANJE RADA |
| Margine | `margins-fixer` | 2,5 / 3,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Upute za prijavu, izradu i obranu diplomskog rada (Filozofski fakultet, Odsjek za sociologiju)](https://www.ffzg.unizg.hr/socio/wp-content/uploads/2014/02/Upute-za-diplomski.pdf) | odjeljak GRAFICKO FORMATIRANJE RADA |
| Obostrano poravnanje | `alignment-fixer` | obostrano | [Upute za prijavu, izradu i obranu diplomskog rada (Filozofski fakultet, Odsjek za sociologiju)](https://www.ffzg.unizg.hr/socio/wp-content/uploads/2014/02/Upute-za-diplomski.pdf) | odjeljak GRAFICKO FORMATIRANJE RADA |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### fgag

#### FGAG, diplomski rad

`fgag-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Obostrano poravnanje | `alignment-fixer` | obostrano | [Predlozak diplomskog rada (FGAG, 2026)](https://gradst.unist.hr/Portals/9/docs/Referada/Obavijesti/Predlozak%20diplomskog%20rada%20NOVO%20SP%202026.docx) | tijelo predloska (stil Normal) |
| Vrsta slova | `font-fixer` | Times New Roman | [Predlozak diplomskog rada (FGAG, 2026)](https://gradst.unist.hr/Portals/9/docs/Referada/Obavijesti/Predlozak%20diplomskog%20rada%20NOVO%20SP%202026.docx) | tijelo predloska (stil Normal) |
| Velicina slova | `font-fixer` | 12 pt | [Predlozak diplomskog rada (FGAG, 2026)](https://gradst.unist.hr/Portals/9/docs/Referada/Obavijesti/Predlozak%20diplomskog%20rada%20NOVO%20SP%202026.docx) | tijelo predloska (stil Normal) |
| Prored | `line-spacing-fixer` | prored 1,5 | [Predlozak diplomskog rada (FGAG, 2026)](https://gradst.unist.hr/Portals/9/docs/Referada/Obavijesti/Predlozak%20diplomskog%20rada%20NOVO%20SP%202026.docx) | tijelo predloska (stil Normal) |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### FGAG, završni rad

`fgag-zavrsni` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Obostrano poravnanje | `alignment-fixer` | obostrano | [Predlozak zavrsnog rada (FGAG, 2026)](https://gradst.unist.hr/Portals/9/docs/Referada/Obavijesti/Predlozak%20zavrsnog%20rada%20NOVO%202026.docx) | tijelo predloska (stil Normal) |
| Vrsta slova | `font-fixer` | Times New Roman | [Predlozak zavrsnog rada (FGAG, 2026)](https://gradst.unist.hr/Portals/9/docs/Referada/Obavijesti/Predlozak%20zavrsnog%20rada%20NOVO%202026.docx) | tijelo predloska (stil Normal) |
| Velicina slova | `font-fixer` | 12 pt | [Predlozak zavrsnog rada (FGAG, 2026)](https://gradst.unist.hr/Portals/9/docs/Referada/Obavijesti/Predlozak%20zavrsnog%20rada%20NOVO%202026.docx) | tijelo predloska (stil Normal) |
| Prored | `line-spacing-fixer` | prored 1,5 | [Predlozak zavrsnog rada (FGAG, 2026)](https://gradst.unist.hr/Portals/9/docs/Referada/Obavijesti/Predlozak%20zavrsnog%20rada%20NOVO%202026.docx) | tijelo predloska (stil Normal) |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### fhs

#### Fakultet hrvatskih studija, diplomski rad

`fhs-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font (pismo) | `font-fixer` | Times New Roman | [Upute za izradu i obranu diplomskoga rada i za zavrsetak diplomskoga studija (Fakultet hrvatskih studija, ak. god. 2025./2026.)](https://www.fhs.hr/images/50014269/Upute%20za%20izradu%20i%20obranu%20diplomskoga%20rada%202025-2026%20(3).pdf) | odjeljak OPE TEHNICKE UPUTE |
| Velicina pisma | `font-fixer` | 12 pt | [Upute za izradu i obranu diplomskoga rada i za zavrsetak diplomskoga studija (Fakultet hrvatskih studija, ak. god. 2025./2026.)](https://www.fhs.hr/images/50014269/Upute%20za%20izradu%20i%20obranu%20diplomskoga%20rada%202025-2026%20(3).pdf) | odjeljak OPE TEHNICKE UPUTE |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za izradu i obranu diplomskoga rada i za zavrsetak diplomskoga studija (Fakultet hrvatskih studija, ak. god. 2025./2026.)](https://www.fhs.hr/images/50014269/Upute%20za%20izradu%20i%20obranu%20diplomskoga%20rada%202025-2026%20(3).pdf) | odjeljak OPE TEHNICKE UPUTE |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Upute za izradu i obranu diplomskoga rada i za zavrsetak diplomskoga studija (Fakultet hrvatskih studija, ak. god. 2025./2026.)](https://www.fhs.hr/images/50014269/Upute%20za%20izradu%20i%20obranu%20diplomskoga%20rada%202025-2026%20(3).pdf) | odjeljak OPE TEHNICKE UPUTE |
| Obostrano poravnanje | `alignment-fixer` | obostrano | [Upute za izradu i obranu diplomskoga rada i za zavrsetak diplomskoga studija (Fakultet hrvatskih studija, ak. god. 2025./2026.)](https://www.fhs.hr/images/50014269/Upute%20za%20izradu%20i%20obranu%20diplomskoga%20rada%202025-2026%20(3).pdf) | odjeljak OPE TEHNICKE UPUTE |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Sadrzaj kao zivo TOC polje | `toc-field-fixer` | Word sam azurira sadrzaj<br><sub>Dokument ima naslov Sadrzaj, a jos nema zivo TOC polje. Nedestruktivno: rucne stavke se ne brisu.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Fakultet hrvatskih studija, doktorski rad

`fhs-doktorski` · status: partial · vrste rada: doctoral

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Times New Roman | [Upute za oblikovanje doktorskog rada (Obrazac DR.SC.-08)](https://www.unizg.hr/nc/vijest/article/obrasci-za-doktorski-studij/) | odjeljak 'Postavke stranice' (DR.SC.-08, Upute za oblikovanje doktorskog rada) |
| Velicina slova | `font-fixer` | 12 pt | [Upute za oblikovanje doktorskog rada (Obrazac DR.SC.-08)](https://www.unizg.hr/nc/vijest/article/obrasci-za-doktorski-studij/) | odjeljak 'Postavke stranice' (DR.SC.-08, Upute za oblikovanje doktorskog rada) |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za oblikovanje doktorskog rada (Obrazac DR.SC.-08)](https://www.unizg.hr/nc/vijest/article/obrasci-za-doktorski-studij/) | odjeljak 'Postavke stranice' (DR.SC.-08, Upute za oblikovanje doktorskog rada) |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Upute za oblikovanje doktorskog rada (Obrazac DR.SC.-08)](https://www.unizg.hr/nc/vijest/article/obrasci-za-doktorski-studij/) | odjeljak 'Postavke stranice' (DR.SC.-08, Upute za oblikovanje doktorskog rada) |
| Format papira A4 | `paper-size-fixer` | 21 x 29,7 cm | [Upute za oblikovanje doktorskog rada (Obrazac DR.SC.-08)](https://www.unizg.hr/nc/vijest/article/obrasci-za-doktorski-studij/) | odjeljak 'Postavke stranice' (DR.SC.-08, Upute za oblikovanje doktorskog rada) |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Fakultet hrvatskih studija, završni rad

`fhs-zavrsni` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font (pismo) | `font-fixer` | Times New Roman | [Upute za pisanje zavrsnoga i diplomskoga rada (Fakultet hrvatskih studija)](https://www.fhs.hr/_download/repository/2021_2023__Nove_upute_za_prijavu_i_pisanje_zavrsnoga_i_diplomskoga_rada.doc.pdf) | odjeljak OPE TEHNICKE UPUTE |
| Velicina pisma | `font-fixer` | 12 pt | [Upute za pisanje zavrsnoga i diplomskoga rada (Fakultet hrvatskih studija)](https://www.fhs.hr/_download/repository/2021_2023__Nove_upute_za_prijavu_i_pisanje_zavrsnoga_i_diplomskoga_rada.doc.pdf) | odjeljak OPE TEHNICKE UPUTE |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za pisanje zavrsnoga i diplomskoga rada (Fakultet hrvatskih studija)](https://www.fhs.hr/_download/repository/2021_2023__Nove_upute_za_prijavu_i_pisanje_zavrsnoga_i_diplomskoga_rada.doc.pdf) | odjeljak OPE TEHNICKE UPUTE |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Upute za pisanje zavrsnoga i diplomskoga rada (Fakultet hrvatskih studija)](https://www.fhs.hr/_download/repository/2021_2023__Nove_upute_za_prijavu_i_pisanje_zavrsnoga_i_diplomskoga_rada.doc.pdf) | odjeljak OPE TEHNICKE UPUTE |
| Obostrano poravnanje | `alignment-fixer` | obostrano | [Upute za pisanje zavrsnoga i diplomskoga rada (Fakultet hrvatskih studija)](https://www.fhs.hr/_download/repository/2021_2023__Nove_upute_za_prijavu_i_pisanje_zavrsnoga_i_diplomskoga_rada.doc.pdf) | odjeljak OPE TEHNICKE UPUTE |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Sadrzaj kao zivo TOC polje | `toc-field-fixer` | Word sam azurira sadrzaj<br><sub>Dokument ima naslov Sadrzaj, a jos nema zivo TOC polje. Nedestruktivno: rucne stavke se ne brisu.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### fipu

#### Fakultet informatike u Puli, diplomski rad

`fipu-diplomski` · status: verified · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Pravilnik o izmjenama i dopunama Pravilnika o diplomskom radu i diplomskom koncertu na sveucilisnim diplomskim studijima i integriranome preddiplomskom i diplomskom studiju (23.07.2021.)](https://www.unipu.hr/_download/repository/2021-07-23-Pravilnik_o_izmjenama_i_dopunama_Pravilnika_o_dipl._radu_i_dipl._koncertu_na_sveucilisnim_dipl._studijima_i_integriranome_preddipl._i_dipl._studiju.pdf) | Članak 5. stavak 1. (izmjene 23.07.2021., točka II.), str. 1 PDF-a |
| Vrsta slova | `font-fixer` | Arial | [Pravilnik o izmjenama i dopunama Pravilnika o diplomskom radu i diplomskom koncertu na sveucilisnim diplomskim studijima i integriranome preddiplomskom i diplomskom studiju (23.07.2021.)](https://www.unipu.hr/_download/repository/2021-07-23-Pravilnik_o_izmjenama_i_dopunama_Pravilnika_o_dipl._radu_i_dipl._koncertu_na_sveucilisnim_dipl._studijima_i_integriranome_preddipl._i_dipl._studiju.pdf) | Članak 5. stavak 1. (izmjene 23.07.2021., točka II.), str. 1 PDF-a |
| Veličina slova | `font-fixer` | 12 pt | [Pravilnik o izmjenama i dopunama Pravilnika o diplomskom radu i diplomskom koncertu na sveucilisnim diplomskim studijima i integriranome preddiplomskom i diplomskom studiju (23.07.2021.)](https://www.unipu.hr/_download/repository/2021-07-23-Pravilnik_o_izmjenama_i_dopunama_Pravilnika_o_dipl._radu_i_dipl._koncertu_na_sveucilisnim_dipl._studijima_i_integriranome_preddipl._i_dipl._studiju.pdf) | Članak 5. stavak 1. (izmjene 23.07.2021., točka II.), str. 1 PDF-a |
| Prored | `line-spacing-fixer` | prored 1,5 | [Pravilnik o izmjenama i dopunama Pravilnika o diplomskom radu i diplomskom koncertu na sveucilisnim diplomskim studijima i integriranome preddiplomskom i diplomskom studiju (23.07.2021.)](https://www.unipu.hr/_download/repository/2021-07-23-Pravilnik_o_izmjenama_i_dopunama_Pravilnika_o_dipl._radu_i_dipl._koncertu_na_sveucilisnim_dipl._studijima_i_integriranome_preddipl._i_dipl._studiju.pdf) | Članak 5. stavak 1. (izmjene 23.07.2021., točka II.), str. 1 PDF-a |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Pravilnik o izmjenama i dopunama Pravilnika o diplomskom radu i diplomskom koncertu na sveucilisnim diplomskim studijima i integriranome preddiplomskom i diplomskom studiju (23.07.2021.)](https://www.unipu.hr/_download/repository/2021-07-23-Pravilnik_o_izmjenama_i_dopunama_Pravilnika_o_dipl._radu_i_dipl._koncertu_na_sveucilisnim_dipl._studijima_i_integriranome_preddipl._i_dipl._studiju.pdf) | Članak 5. stavak 1. (izmjene 23.07.2021., točka II.), str. 1 PDF-a |
| Font i veličina fusnota | `footnote-typography-fixer` | 10 pt |  |  |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Sadrzaj kao zivo TOC polje | `toc-field-fixer` | Word sam azurira sadrzaj<br><sub>Dokument ima naslov Sadrzaj, a jos nema zivo TOC polje. Nedestruktivno: rucne stavke se ne brisu.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Fakultet informatike u Puli, zavrsni rad

`fipu-zavrsni` · status: verified · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Pravilnik o izmjenama i dopunama Pravilnika o zavrsnom radu i zavrsnom koncertu na preddiplomskim sveucilisnim i strucnim studijima (23.07.2021.)](https://www.unipu.hr/_download/repository/2021-07-23-Pravilnik_o_izmjenama_i_dopunama__Pravilnika_o_zavrsnom_radu_i_zavrsnom_koncertu_na_preddiplomskim_sveucilisnim_i_strucnim_studijima.pdf) | Članak 5. stavak 1. (izmjene 23.07.2021., točka II.), str. 1 PDF-a |
| Vrsta slova | `font-fixer` | Arial | [Pravilnik o izmjenama i dopunama Pravilnika o zavrsnom radu i zavrsnom koncertu na preddiplomskim sveucilisnim i strucnim studijima (23.07.2021.)](https://www.unipu.hr/_download/repository/2021-07-23-Pravilnik_o_izmjenama_i_dopunama__Pravilnika_o_zavrsnom_radu_i_zavrsnom_koncertu_na_preddiplomskim_sveucilisnim_i_strucnim_studijima.pdf) | Članak 5. stavak 1. (izmjene 23.07.2021., točka II.), str. 1 PDF-a |
| Veličina slova | `font-fixer` | 12 pt | [Pravilnik o izmjenama i dopunama Pravilnika o zavrsnom radu i zavrsnom koncertu na preddiplomskim sveucilisnim i strucnim studijima (23.07.2021.)](https://www.unipu.hr/_download/repository/2021-07-23-Pravilnik_o_izmjenama_i_dopunama__Pravilnika_o_zavrsnom_radu_i_zavrsnom_koncertu_na_preddiplomskim_sveucilisnim_i_strucnim_studijima.pdf) | Članak 5. stavak 1. (izmjene 23.07.2021., točka II.), str. 1 PDF-a |
| Prored | `line-spacing-fixer` | prored 1,5 | [Pravilnik o izmjenama i dopunama Pravilnika o zavrsnom radu i zavrsnom koncertu na preddiplomskim sveucilisnim i strucnim studijima (23.07.2021.)](https://www.unipu.hr/_download/repository/2021-07-23-Pravilnik_o_izmjenama_i_dopunama__Pravilnika_o_zavrsnom_radu_i_zavrsnom_koncertu_na_preddiplomskim_sveucilisnim_i_strucnim_studijima.pdf) | Članak 5. stavak 1. (izmjene 23.07.2021., točka II.), str. 1 PDF-a |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Pravilnik o izmjenama i dopunama Pravilnika o zavrsnom radu i zavrsnom koncertu na preddiplomskim sveucilisnim i strucnim studijima (23.07.2021.)](https://www.unipu.hr/_download/repository/2021-07-23-Pravilnik_o_izmjenama_i_dopunama__Pravilnika_o_zavrsnom_radu_i_zavrsnom_koncertu_na_preddiplomskim_sveucilisnim_i_strucnim_studijima.pdf) | Članak 5. stavak 1. (izmjene 23.07.2021., točka II.), str. 1 PDF-a |
| Font i veličina fusnota | `footnote-typography-fixer` | 10 pt |  |  |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Sadrzaj kao zivo TOC polje | `toc-field-fixer` | Word sam azurira sadrzaj<br><sub>Dokument ima naslov Sadrzaj, a jos nema zivo TOC polje. Nedestruktivno: rucne stavke se ne brisu.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### fizos

#### Odjel za fiziku Osijek, diplomski rad

`fizos-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Times New Roman | [Opce upute za pisanje diplomskog rada (Odjel za fiziku, Osijek)](https://www.fizika.unios.hr/wp-content/uploads/2023/06/Opce_Upute_za_pisanje_diplomskog_rada.pdf) | str. 1 |
| Velicina slova | `font-fixer` | 12 pt | [Opce upute za pisanje diplomskog rada (Odjel za fiziku, Osijek)](https://www.fizika.unios.hr/wp-content/uploads/2023/06/Opce_Upute_za_pisanje_diplomskog_rada.pdf) | str. 1 |
| Prored | `line-spacing-fixer` | prored 1,5 | [Opce upute za pisanje diplomskog rada (Odjel za fiziku, Osijek)](https://www.fizika.unios.hr/wp-content/uploads/2023/06/Opce_Upute_za_pisanje_diplomskog_rada.pdf) | str. 1 |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Opce upute za pisanje diplomskog rada (Odjel za fiziku, Osijek)](https://www.fizika.unios.hr/wp-content/uploads/2023/06/Opce_Upute_za_pisanje_diplomskog_rada.pdf) | str. 1 |
| Format papira A4 | `paper-size-fixer` | 21 x 29,7 cm | [Opce upute za pisanje diplomskog rada (Odjel za fiziku, Osijek)](https://www.fizika.unios.hr/wp-content/uploads/2023/06/Opce_Upute_za_pisanje_diplomskog_rada.pdf) | str. 1 |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### fizri

#### Rijeka - Fizika, diplomski rad

`fizri-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Pravilnik o diplomskom i završnom radu (Fakultet za fiziku, Rijeka, procisceni tekst 2023)](https://phy.uniri.hr/files/nastava/zavrsni_i_diplomski_radovi/Pravilnik_o_diplomskom_i_zavrsnom_radu_FIZRI_procisceni_tekst_2023.pdf) | Pravilnik, cl. 8 |
| Velicina slova | `font-fixer` | 12 pt | [Pravilnik o diplomskom i završnom radu (Fakultet za fiziku, Rijeka, procisceni tekst 2023)](https://phy.uniri.hr/files/nastava/zavrsni_i_diplomski_radovi/Pravilnik_o_diplomskom_i_zavrsnom_radu_FIZRI_procisceni_tekst_2023.pdf) | Pravilnik, cl. 8 |
| Prored | `line-spacing-fixer` | prored 1,5 | [Pravilnik o diplomskom i završnom radu (Fakultet za fiziku, Rijeka, procisceni tekst 2023)](https://phy.uniri.hr/files/nastava/zavrsni_i_diplomski_radovi/Pravilnik_o_diplomskom_i_zavrsnom_radu_FIZRI_procisceni_tekst_2023.pdf) | Pravilnik, cl. 8 |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Rijeka - Fizika, završni rad

`fizri-zavrsni` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Pravilnik o diplomskom i završnom radu (Fakultet za fiziku, Rijeka, procisceni tekst 2023)](https://phy.uniri.hr/files/nastava/zavrsni_i_diplomski_radovi/Pravilnik_o_diplomskom_i_zavrsnom_radu_FIZRI_procisceni_tekst_2023.pdf) | Pravilnik, cl. 12 |
| Velicina slova | `font-fixer` | 12 pt | [Pravilnik o diplomskom i završnom radu (Fakultet za fiziku, Rijeka, procisceni tekst 2023)](https://phy.uniri.hr/files/nastava/zavrsni_i_diplomski_radovi/Pravilnik_o_diplomskom_i_zavrsnom_radu_FIZRI_procisceni_tekst_2023.pdf) | Pravilnik, cl. 12 |
| Prored | `line-spacing-fixer` | prored 1,5 | [Pravilnik o diplomskom i završnom radu (Fakultet za fiziku, Rijeka, procisceni tekst 2023)](https://phy.uniri.hr/files/nastava/zavrsni_i_diplomski_radovi/Pravilnik_o_diplomskom_i_zavrsnom_radu_FIZRI_procisceni_tekst_2023.pdf) | Pravilnik, cl. 12 |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### fkit

#### Fakultet kemijskog inženjerstva i tehnologije, diplomski rad

`fkit-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Pravilnik o izradi zavrsnog/diplomskog rada i polaganju zavrsnog/diplomskog ispita na sveucilisnim prijediplomskim i diplomskim studijima (FKIT, 2023)](https://www.fkit.unizg.hr/_download/repository/Pravilnik_o_izradi_zavrsnog-diplomskog_rada_i_polaganju_zavrsnog-diplomskog_ispita.pdf) | Članak 9. (str. 3) |
| Velicina slova | `font-fixer` | 12 pt | [Pravilnik o izradi zavrsnog/diplomskog rada i polaganju zavrsnog/diplomskog ispita na sveucilisnim prijediplomskim i diplomskim studijima (FKIT, 2023)](https://www.fkit.unizg.hr/_download/repository/Pravilnik_o_izradi_zavrsnog-diplomskog_rada_i_polaganju_zavrsnog-diplomskog_ispita.pdf) | Članak 9. (str. 3) |
| Prored | `line-spacing-fixer` | prored 1,5 | [Pravilnik o izradi zavrsnog/diplomskog rada i polaganju zavrsnog/diplomskog ispita na sveucilisnim prijediplomskim i diplomskim studijima (FKIT, 2023)](https://www.fkit.unizg.hr/_download/repository/Pravilnik_o_izradi_zavrsnog-diplomskog_rada_i_polaganju_zavrsnog-diplomskog_ispita.pdf) | Članak 9. (str. 3) |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Fakultet kemijskog inženjerstva i tehnologije, doktorski rad

`fkit-doktorski` · status: partial · vrste rada: doctoral

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Times New Roman | [Upute za oblikovanje doktorskog rada (Obrazac DR.SC.-08)](https://www.unizg.hr/nc/vijest/article/obrasci-za-doktorski-studij/) | odjeljak 'Postavke stranice' (DR.SC.-08, Upute za oblikovanje doktorskog rada) |
| Velicina slova | `font-fixer` | 12 pt | [Upute za oblikovanje doktorskog rada (Obrazac DR.SC.-08)](https://www.unizg.hr/nc/vijest/article/obrasci-za-doktorski-studij/) | odjeljak 'Postavke stranice' (DR.SC.-08, Upute za oblikovanje doktorskog rada) |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za oblikovanje doktorskog rada (Obrazac DR.SC.-08)](https://www.unizg.hr/nc/vijest/article/obrasci-za-doktorski-studij/) | odjeljak 'Postavke stranice' (DR.SC.-08, Upute za oblikovanje doktorskog rada) |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Upute za oblikovanje doktorskog rada (Obrazac DR.SC.-08)](https://www.unizg.hr/nc/vijest/article/obrasci-za-doktorski-studij/) | odjeljak 'Postavke stranice' (DR.SC.-08, Upute za oblikovanje doktorskog rada) |
| Format papira A4 | `paper-size-fixer` | 21 x 29,7 cm | [Upute za oblikovanje doktorskog rada (Obrazac DR.SC.-08)](https://www.unizg.hr/nc/vijest/article/obrasci-za-doktorski-studij/) | odjeljak 'Postavke stranice' (DR.SC.-08, Upute za oblikovanje doktorskog rada) |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Fakultet kemijskog inženjerstva i tehnologije, završni rad

`fkit-zavrsni` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Pravilnik o izradi zavrsnog/diplomskog rada i polaganju zavrsnog/diplomskog ispita na sveucilisnim prijediplomskim i diplomskim studijima (FKIT, 2023)](https://www.fkit.unizg.hr/_download/repository/Pravilnik_o_izradi_zavrsnog-diplomskog_rada_i_polaganju_zavrsnog-diplomskog_ispita.pdf) | Članak 9. (str. 3) |
| Velicina slova | `font-fixer` | 12 pt | [Pravilnik o izradi zavrsnog/diplomskog rada i polaganju zavrsnog/diplomskog ispita na sveucilisnim prijediplomskim i diplomskim studijima (FKIT, 2023)](https://www.fkit.unizg.hr/_download/repository/Pravilnik_o_izradi_zavrsnog-diplomskog_rada_i_polaganju_zavrsnog-diplomskog_ispita.pdf) | Članak 9. (str. 3) |
| Prored | `line-spacing-fixer` | prored 1,5 | [Pravilnik o izradi zavrsnog/diplomskog rada i polaganju zavrsnog/diplomskog ispita na sveucilisnim prijediplomskim i diplomskim studijima (FKIT, 2023)](https://www.fkit.unizg.hr/_download/repository/Pravilnik_o_izradi_zavrsnog-diplomskog_rada_i_polaganju_zavrsnog-diplomskog_ispita.pdf) | Članak 9. (str. 3) |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### fmtu

#### FMTU, diplomski rad

`fmtu-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Upute za izradu diplomskog rada (FMTU, 2025)](https://fthm.uniri.hr/wp-content/uploads/2025/11/5-Upute-za-diplomski-rad-2025-1.pdf) | odjeljak 7.1 Format, tekst, naslovi |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Upute za izradu diplomskog rada (FMTU, 2025)](https://fthm.uniri.hr/wp-content/uploads/2025/11/5-Upute-za-diplomski-rad-2025-1.pdf) | odjeljak 7.1 Format, tekst, naslovi |
| Vrsta slova | `font-fixer` | Times New Roman | [Upute za izradu diplomskog rada (FMTU, 2025)](https://fthm.uniri.hr/wp-content/uploads/2025/11/5-Upute-za-diplomski-rad-2025-1.pdf) | odjeljak 7.1 Format, tekst, naslovi |
| Velicina slova | `font-fixer` | 12 pt | [Upute za izradu diplomskog rada (FMTU, 2025)](https://fthm.uniri.hr/wp-content/uploads/2025/11/5-Upute-za-diplomski-rad-2025-1.pdf) | odjeljak 7.1 Format, tekst, naslovi |
| Obostrano poravnanje | `alignment-fixer` | obostrano | [Upute za izradu diplomskog rada (FMTU, 2025)](https://fthm.uniri.hr/wp-content/uploads/2025/11/5-Upute-za-diplomski-rad-2025-1.pdf) | odjeljak 7.1 Format, tekst, naslovi |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za izradu diplomskog rada (FMTU, 2025)](https://fthm.uniri.hr/wp-content/uploads/2025/11/5-Upute-za-diplomski-rad-2025-1.pdf) | odjeljak 7.1 Format, tekst, naslovi |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### FMTU, završni rad

`fmtu-zavrsni` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Upute za izradu zavrsnog rada (FMTU, 2025)](https://fthm.uniri.hr/wp-content/uploads/2025/11/3-Upute-za-zavrsni-rad-2025-2.pdf) | odjeljak 7.1 Format, tekst, naslovi |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Upute za izradu zavrsnog rada (FMTU, 2025)](https://fthm.uniri.hr/wp-content/uploads/2025/11/3-Upute-za-zavrsni-rad-2025-2.pdf) | odjeljak 7.1 Format, tekst, naslovi |
| Vrsta slova | `font-fixer` | Times New Roman | [Upute za izradu zavrsnog rada (FMTU, 2025)](https://fthm.uniri.hr/wp-content/uploads/2025/11/3-Upute-za-zavrsni-rad-2025-2.pdf) | odjeljak 7.1 Format, tekst, naslovi |
| Velicina slova | `font-fixer` | 12 pt | [Upute za izradu zavrsnog rada (FMTU, 2025)](https://fthm.uniri.hr/wp-content/uploads/2025/11/3-Upute-za-zavrsni-rad-2025-2.pdf) | odjeljak 7.1 Format, tekst, naslovi |
| Obostrano poravnanje | `alignment-fixer` | obostrano | [Upute za izradu zavrsnog rada (FMTU, 2025)](https://fthm.uniri.hr/wp-content/uploads/2025/11/3-Upute-za-zavrsni-rad-2025-2.pdf) | odjeljak 7.1 Format, tekst, naslovi |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za izradu zavrsnog rada (FMTU, 2025)](https://fthm.uniri.hr/wp-content/uploads/2025/11/3-Upute-za-zavrsni-rad-2025-2.pdf) | odjeljak 7.1 Format, tekst, naslovi |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### foi

#### FOI, diplomski rad

`foi-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Vrsta slova | `font-fixer` | Times New Roman | [Predlozak za pisanje zavrsnog/diplomskog rada (DOCX)](https://radovi.foi.hr/build/files/Predlozak_za_pisanje_zavsnog-diplomskog_rada.docx) | word/styles.xml, stil Normal |
| Velicina slova | `font-fixer` | 12 pt | [Predlozak za pisanje zavrsnog/diplomskog rada (DOCX)](https://radovi.foi.hr/build/files/Predlozak_za_pisanje_zavsnog-diplomskog_rada.docx) | word/styles.xml, stil Normal |
| A4 format | `paper-size-fixer` | 21 x 29,7 cm | [Predlozak za pisanje zavrsnog/diplomskog rada (DOCX)](https://radovi.foi.hr/build/files/Predlozak_za_pisanje_zavsnog-diplomskog_rada.docx) | word/document.xml, sectPr |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Predlozak za pisanje zavrsnog/diplomskog rada (DOCX)](https://radovi.foi.hr/build/files/Predlozak_za_pisanje_zavsnog-diplomskog_rada.docx) | word/document.xml, sectPr (tijelo) |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### FOI, zavrsni rad

`foi-zavrsni` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Vrsta slova | `font-fixer` | Times New Roman | [Predlozak za pisanje zavrsnog/diplomskog rada (DOCX)](https://radovi.foi.hr/build/files/Predlozak_za_pisanje_zavsnog-diplomskog_rada.docx) | word/styles.xml, stil Normal |
| Velicina slova | `font-fixer` | 12 pt | [Predlozak za pisanje zavrsnog/diplomskog rada (DOCX)](https://radovi.foi.hr/build/files/Predlozak_za_pisanje_zavsnog-diplomskog_rada.docx) | word/styles.xml, stil Normal |
| A4 format | `paper-size-fixer` | 21 x 29,7 cm | [Predlozak za pisanje zavrsnog/diplomskog rada (DOCX)](https://radovi.foi.hr/build/files/Predlozak_za_pisanje_zavsnog-diplomskog_rada.docx) | word/document.xml, sectPr |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Predlozak za pisanje zavrsnog/diplomskog rada (DOCX)](https://radovi.foi.hr/build/files/Predlozak_za_pisanje_zavsnog-diplomskog_rada.docx) | word/document.xml, sectPr (tijelo) |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### foozos

#### Fakultet za odgojne i obrazovne znanosti Osijek, diplomski rad

`foozos-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font (preporuka, vidi napomenu o tenziji) | `font-fixer` | Times New Roman |  | Smjernice, odjeljak "Tehnicka obrada teksta" |
| Velicina slova (preporuka) | `font-fixer` | 12 pt |  | Smjernice, odjeljak "Tehnicka obrada teksta" |
| Prored (preporuka) | `line-spacing-fixer` | prored 1,5 |  | Smjernice, odjeljak "Tehnicka obrada teksta" |
| Poravnanje (preporuka) | `alignment-fixer` | obostrano |  | Smjernice, odjeljak "Tehnicka obrada teksta" |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### foozpu

#### FOOZ Pula, diplomski rad

`foozpu-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Upute za pisanje zavrsnih i diplomskih radova (FOOZ, Pula)](https://fooz.unipu.hr/_download/repository/Upute_za_pisanje_zavrsnih_i_diplomskih_radova_FOOZ.doc) | Naputak, tehnicko uredenje |
| Vrsta slova | `font-fixer` | Arial | [Upute za pisanje zavrsnih i diplomskih radova (FOOZ, Pula)](https://fooz.unipu.hr/_download/repository/Upute_za_pisanje_zavrsnih_i_diplomskih_radova_FOOZ.doc) | Naputak, tehnicko uredenje |
| Velicina slova | `font-fixer` | 12 pt | [Upute za pisanje zavrsnih i diplomskih radova (FOOZ, Pula)](https://fooz.unipu.hr/_download/repository/Upute_za_pisanje_zavrsnih_i_diplomskih_radova_FOOZ.doc) | Naputak, tehnicko uredenje |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za pisanje zavrsnih i diplomskih radova (FOOZ, Pula)](https://fooz.unipu.hr/_download/repository/Upute_za_pisanje_zavrsnih_i_diplomskih_radova_FOOZ.doc) | Naputak, tehnicko uredenje |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Upute za pisanje zavrsnih i diplomskih radova (FOOZ, Pula)](https://fooz.unipu.hr/_download/repository/Upute_za_pisanje_zavrsnih_i_diplomskih_radova_FOOZ.doc) | Naputak, tehnicko uredenje |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### FOOZ Pula, završni rad

`foozpu-zavrsni` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Upute za pisanje zavrsnih i diplomskih radova (FOOZ, Pula)](https://fooz.unipu.hr/_download/repository/Upute_za_pisanje_zavrsnih_i_diplomskih_radova_FOOZ.doc) | Naputak, tehnicko uredenje |
| Vrsta slova | `font-fixer` | Arial | [Upute za pisanje zavrsnih i diplomskih radova (FOOZ, Pula)](https://fooz.unipu.hr/_download/repository/Upute_za_pisanje_zavrsnih_i_diplomskih_radova_FOOZ.doc) | Naputak, tehnicko uredenje |
| Velicina slova | `font-fixer` | 12 pt | [Upute za pisanje zavrsnih i diplomskih radova (FOOZ, Pula)](https://fooz.unipu.hr/_download/repository/Upute_za_pisanje_zavrsnih_i_diplomskih_radova_FOOZ.doc) | Naputak, tehnicko uredenje |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za pisanje zavrsnih i diplomskih radova (FOOZ, Pula)](https://fooz.unipu.hr/_download/repository/Upute_za_pisanje_zavrsnih_i_diplomskih_radova_FOOZ.doc) | Naputak, tehnicko uredenje |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Upute za pisanje zavrsnih i diplomskih radova (FOOZ, Pula)](https://fooz.unipu.hr/_download/repository/Upute_za_pisanje_zavrsnih_i_diplomskih_radova_FOOZ.doc) | Naputak, tehnicko uredenje |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### forenzika

#### Fakultet za forenzicke znanosti, diplomski rad

`forenzika-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Pravilnik o diplomskom radu i ispitu (Fakultet za forenzičke znanosti, Sveučilište u Splitu, 10. rujna 2025.)](https://forenzika.unist.hr/wp-content/uploads/2026/03/Pravilnik-o-diplomskom-ispitu.pdf) | Članak 9., st. 1 (str. 5) |
| Vrsta slova | `font-fixer` | Times New Roman | [Pravilnik o diplomskom radu i ispitu (Fakultet za forenzičke znanosti, Sveučilište u Splitu, 10. rujna 2025.)](https://forenzika.unist.hr/wp-content/uploads/2026/03/Pravilnik-o-diplomskom-ispitu.pdf) | Članak 9., st. 3 (str. 5) |
| Velicina slova | `font-fixer` | 12 pt | [Pravilnik o diplomskom radu i ispitu (Fakultet za forenzičke znanosti, Sveučilište u Splitu, 10. rujna 2025.)](https://forenzika.unist.hr/wp-content/uploads/2026/03/Pravilnik-o-diplomskom-ispitu.pdf) | Članak 9., st. 3 (str. 5) |
| Prored | `line-spacing-fixer` | prored 1,5 | [Pravilnik o diplomskom radu i ispitu (Fakultet za forenzičke znanosti, Sveučilište u Splitu, 10. rujna 2025.)](https://forenzika.unist.hr/wp-content/uploads/2026/03/Pravilnik-o-diplomskom-ispitu.pdf) | Članak 9., st. 3 (str. 5) |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Pravilnik o diplomskom radu i ispitu (Fakultet za forenzičke znanosti, Sveučilište u Splitu, 10. rujna 2025.)](https://forenzika.unist.hr/wp-content/uploads/2026/03/Pravilnik-o-diplomskom-ispitu.pdf) | Članak 9., st. 3 (str. 5) |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### fpz

#### Fakultet prometnih znanosti, diplomski rad

`fpz-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Velicina slova | `font-fixer` | 12 pt | [Upute za prijavu, izradu i obranu zavrsnog i diplomskog rada (Fakultet prometnih znanosti, 2026, azurirano 5.3.2026)](https://www.fpz.unizg.hr/file/688510c810f19a8a9eead0c69e01a3c7.pdf) | Odjeljak 7 "Tehnicke upute za izradu zavrsnog i diplomskog rada", str. 13 |
| Prored | `line-spacing-fixer` | prored 1,15 | [Upute za prijavu, izradu i obranu zavrsnog i diplomskog rada (Fakultet prometnih znanosti, 2026, azurirano 5.3.2026)](https://www.fpz.unizg.hr/file/688510c810f19a8a9eead0c69e01a3c7.pdf) | Odjeljak 7 "Tehnicke upute za izradu zavrsnog i diplomskog rada", str. 13 |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Upute za prijavu, izradu i obranu zavrsnog i diplomskog rada (Fakultet prometnih znanosti, 2026, azurirano 5.3.2026)](https://www.fpz.unizg.hr/file/688510c810f19a8a9eead0c69e01a3c7.pdf) | Odjeljak 7 "Tehnicke upute za izradu zavrsnog i diplomskog rada", str. 13 |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Sadrzaj kao zivo TOC polje | `toc-field-fixer` | Word sam azurira sadrzaj<br><sub>Dokument ima naslov Sadrzaj, a jos nema zivo TOC polje. Nedestruktivno: rucne stavke se ne brisu.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Fakultet prometnih znanosti, završni rad

`fpz-zavrsni` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Velicina slova | `font-fixer` | 12 pt | [Upute za prijavu, izradu i obranu zavrsnog i diplomskog rada (Fakultet prometnih znanosti, 2026, azurirano 5.3.2026)](https://www.fpz.unizg.hr/file/688510c810f19a8a9eead0c69e01a3c7.pdf) | Odjeljak 7 "Tehnicke upute za izradu zavrsnog i diplomskog rada", str. 13 |
| Prored | `line-spacing-fixer` | prored 1,15 | [Upute za prijavu, izradu i obranu zavrsnog i diplomskog rada (Fakultet prometnih znanosti, 2026, azurirano 5.3.2026)](https://www.fpz.unizg.hr/file/688510c810f19a8a9eead0c69e01a3c7.pdf) | Odjeljak 7 "Tehnicke upute za izradu zavrsnog i diplomskog rada", str. 13 |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Upute za prijavu, izradu i obranu zavrsnog i diplomskog rada (Fakultet prometnih znanosti, 2026, azurirano 5.3.2026)](https://www.fpz.unizg.hr/file/688510c810f19a8a9eead0c69e01a3c7.pdf) | Odjeljak 7 "Tehnicke upute za izradu zavrsnog i diplomskog rada", str. 13 |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Sadrzaj kao zivo TOC polje | `toc-field-fixer` | Word sam azurira sadrzaj<br><sub>Dokument ima naslov Sadrzaj, a jos nema zivo TOC polje. Nedestruktivno: rucne stavke se ne brisu.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### fpzg

#### FPZG · doktorski studij Politologija · doktorski rad

`fpzg-doktorski-politologija` · status: verified · vrste rada: doctoral

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Times New Roman | [DR.SC.-08 Upute za oblikovanje doktorskog rada (Fakultet politickih znanosti)](https://www.fpzg.unizg.hr/_download/repository/DR.SC.-08_formalno_oblikovanje_rada__%282%29%5B1%5D%5B1%5D.doc) | odjeljak 'Postavke stranice' (DR.SC.-08, Upute za oblikovanje doktorskog rada) |
| Velicina slova | `font-fixer` | 12 pt | [DR.SC.-08 Upute za oblikovanje doktorskog rada (Fakultet politickih znanosti)](https://www.fpzg.unizg.hr/_download/repository/DR.SC.-08_formalno_oblikovanje_rada__%282%29%5B1%5D%5B1%5D.doc) | odjeljak 'Postavke stranice' (DR.SC.-08, Upute za oblikovanje doktorskog rada) |
| Prored | `line-spacing-fixer` | prored 1,5 | [DR.SC.-08 Upute za oblikovanje doktorskog rada (Fakultet politickih znanosti)](https://www.fpzg.unizg.hr/_download/repository/DR.SC.-08_formalno_oblikovanje_rada__%282%29%5B1%5D%5B1%5D.doc) | odjeljak 'Postavke stranice' (DR.SC.-08, Upute za oblikovanje doktorskog rada) |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [DR.SC.-08 Upute za oblikovanje doktorskog rada (Fakultet politickih znanosti)](https://www.fpzg.unizg.hr/_download/repository/DR.SC.-08_formalno_oblikovanje_rada__%282%29%5B1%5D%5B1%5D.doc) | odjeljak 'Postavke stranice' (DR.SC.-08, Upute za oblikovanje doktorskog rada) |
| Format papira A4 | `paper-size-fixer` | 21 x 29,7 cm | [DR.SC.-08 Upute za oblikovanje doktorskog rada (Fakultet politickih znanosti)](https://www.fpzg.unizg.hr/_download/repository/DR.SC.-08_formalno_oblikovanje_rada__%282%29%5B1%5D%5B1%5D.doc) | odjeljak 'Postavke stranice' (DR.SC.-08, Upute za oblikovanje doktorskog rada) |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Sadrzaj kao zivo TOC polje | `toc-field-fixer` | Word sam azurira sadrzaj<br><sub>Dokument ima naslov Sadrzaj, a jos nema zivo TOC polje. Nedestruktivno: rucne stavke se ne brisu.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### FPZG · Master of European Studies · Master's Thesis

`fpzg-mes-master-thesis` · status: verified · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Times New Roman | [Upute za pisanje akademskih radova na Fakultetu politickih znanosti](https://www.fpzg.unizg.hr/images/50442907/Upute_za_pisanje_akademskih_radova_na_Fakultetu_politickih_znanosti.pdf) | str. 14, odjeljak 'FORMAT I OPREMA RADA' (Format rada) |
| Velicina slova | `font-fixer` | 12 pt | [Upute za pisanje akademskih radova na Fakultetu politickih znanosti](https://www.fpzg.unizg.hr/images/50442907/Upute_za_pisanje_akademskih_radova_na_Fakultetu_politickih_znanosti.pdf) | str. 14, odjeljak 'FORMAT I OPREMA RADA' (Format rada) |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za pisanje akademskih radova na Fakultetu politickih znanosti](https://www.fpzg.unizg.hr/images/50442907/Upute_za_pisanje_akademskih_radova_na_Fakultetu_politickih_znanosti.pdf) | str. 14, odjeljak 'FORMAT I OPREMA RADA' (Format rada) |
| Format papira A4 | `paper-size-fixer` | 21 x 29,7 cm | [Upute za pisanje akademskih radova na Fakultetu politickih znanosti](https://www.fpzg.unizg.hr/images/50442907/Upute_za_pisanje_akademskih_radova_na_Fakultetu_politickih_znanosti.pdf) | str. 14, odjeljak 'FORMAT I OPREMA RADA' (Format rada) |
| Poravnanje | `alignment-fixer` | obostrano | [Upute za pisanje akademskih radova na Fakultetu politickih znanosti](https://www.fpzg.unizg.hr/images/50442907/Upute_za_pisanje_akademskih_radova_na_Fakultetu_politickih_znanosti.pdf) | str. 14, odjeljak 'FORMAT I OPREMA RADA' (Format rada) |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Sadrzaj kao zivo TOC polje | `toc-field-fixer` | Word sam azurira sadrzaj<br><sub>Dokument ima naslov Sadrzaj, a jos nema zivo TOC polje. Nedestruktivno: rucne stavke se ne brisu.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### FPZG · Politologija – Nacionalna sigurnost · diplomski rad

`fpzg-nacionalna-sigurnost-diplomski` · status: verified · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Times New Roman | [Upute za pisanje akademskih radova na Fakultetu politickih znanosti](https://www.fpzg.unizg.hr/images/50442907/Upute_za_pisanje_akademskih_radova_na_Fakultetu_politickih_znanosti.pdf) | str. 14, odjeljak 'FORMAT I OPREMA RADA' (Format rada) |
| Velicina slova | `font-fixer` | 12 pt | [Upute za pisanje akademskih radova na Fakultetu politickih znanosti](https://www.fpzg.unizg.hr/images/50442907/Upute_za_pisanje_akademskih_radova_na_Fakultetu_politickih_znanosti.pdf) | str. 14, odjeljak 'FORMAT I OPREMA RADA' (Format rada) |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za pisanje akademskih radova na Fakultetu politickih znanosti](https://www.fpzg.unizg.hr/images/50442907/Upute_za_pisanje_akademskih_radova_na_Fakultetu_politickih_znanosti.pdf) | str. 14, odjeljak 'FORMAT I OPREMA RADA' (Format rada) |
| Format papira A4 | `paper-size-fixer` | 21 x 29,7 cm | [Upute za pisanje akademskih radova na Fakultetu politickih znanosti](https://www.fpzg.unizg.hr/images/50442907/Upute_za_pisanje_akademskih_radova_na_Fakultetu_politickih_znanosti.pdf) | str. 14, odjeljak 'FORMAT I OPREMA RADA' (Format rada) |
| Poravnanje | `alignment-fixer` | obostrano | [Upute za pisanje akademskih radova na Fakultetu politickih znanosti](https://www.fpzg.unizg.hr/images/50442907/Upute_za_pisanje_akademskih_radova_na_Fakultetu_politickih_znanosti.pdf) | str. 14, odjeljak 'FORMAT I OPREMA RADA' (Format rada) |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Sadrzaj kao zivo TOC polje | `toc-field-fixer` | Word sam azurira sadrzaj<br><sub>Dokument ima naslov Sadrzaj, a jos nema zivo TOC polje. Nedestruktivno: rucne stavke se ne brisu.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### FPZG · diplomsko Novinarstvo · diplomski rad

`fpzg-novinarstvo-diplomski` · status: verified · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Times New Roman | [Upute za pisanje akademskih radova na Fakultetu politickih znanosti](https://www.fpzg.unizg.hr/images/50442907/Upute_za_pisanje_akademskih_radova_na_Fakultetu_politickih_znanosti.pdf) | str. 14, odjeljak 'FORMAT I OPREMA RADA' (Format rada) |
| Velicina slova | `font-fixer` | 12 pt | [Upute za pisanje akademskih radova na Fakultetu politickih znanosti](https://www.fpzg.unizg.hr/images/50442907/Upute_za_pisanje_akademskih_radova_na_Fakultetu_politickih_znanosti.pdf) | str. 14, odjeljak 'FORMAT I OPREMA RADA' (Format rada) |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za pisanje akademskih radova na Fakultetu politickih znanosti](https://www.fpzg.unizg.hr/images/50442907/Upute_za_pisanje_akademskih_radova_na_Fakultetu_politickih_znanosti.pdf) | str. 14, odjeljak 'FORMAT I OPREMA RADA' (Format rada) |
| Format papira A4 | `paper-size-fixer` | 21 x 29,7 cm | [Upute za pisanje akademskih radova na Fakultetu politickih znanosti](https://www.fpzg.unizg.hr/images/50442907/Upute_za_pisanje_akademskih_radova_na_Fakultetu_politickih_znanosti.pdf) | str. 14, odjeljak 'FORMAT I OPREMA RADA' (Format rada) |
| Poravnanje | `alignment-fixer` | obostrano | [Upute za pisanje akademskih radova na Fakultetu politickih znanosti](https://www.fpzg.unizg.hr/images/50442907/Upute_za_pisanje_akademskih_radova_na_Fakultetu_politickih_znanosti.pdf) | str. 14, odjeljak 'FORMAT I OPREMA RADA' (Format rada) |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Sadrzaj kao zivo TOC polje | `toc-field-fixer` | Word sam azurira sadrzaj<br><sub>Dokument ima naslov Sadrzaj, a jos nema zivo TOC polje. Nedestruktivno: rucne stavke se ne brisu.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### FPZG · prijediplomsko Novinarstvo · završni rad · tekstualni

`fpzg-novinarstvo-zavrsni-tekst` · status: verified · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Times New Roman | [Upute za pisanje akademskih radova na Fakultetu politickih znanosti](https://www.fpzg.unizg.hr/images/50442907/Upute_za_pisanje_akademskih_radova_na_Fakultetu_politickih_znanosti.pdf) | str. 6 (opca klauzula: svih vrsta proze, sve razine studija) i str. 14 (FORMAT I OPREMA RADA) |
| Velicina slova | `font-fixer` | 12 pt | [Upute za pisanje akademskih radova na Fakultetu politickih znanosti](https://www.fpzg.unizg.hr/images/50442907/Upute_za_pisanje_akademskih_radova_na_Fakultetu_politickih_znanosti.pdf) | str. 6 (opca klauzula: svih vrsta proze, sve razine studija) i str. 14 (FORMAT I OPREMA RADA) |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za pisanje akademskih radova na Fakultetu politickih znanosti](https://www.fpzg.unizg.hr/images/50442907/Upute_za_pisanje_akademskih_radova_na_Fakultetu_politickih_znanosti.pdf) | str. 6 (opca klauzula: svih vrsta proze, sve razine studija) i str. 14 (FORMAT I OPREMA RADA) |
| Format papira A4 | `paper-size-fixer` | 21 x 29,7 cm | [Upute za pisanje akademskih radova na Fakultetu politickih znanosti](https://www.fpzg.unizg.hr/images/50442907/Upute_za_pisanje_akademskih_radova_na_Fakultetu_politickih_znanosti.pdf) | str. 6 (opca klauzula: svih vrsta proze, sve razine studija) i str. 14 (FORMAT I OPREMA RADA) |
| Poravnanje | `alignment-fixer` | obostrano | [Upute za pisanje akademskih radova na Fakultetu politickih znanosti](https://www.fpzg.unizg.hr/images/50442907/Upute_za_pisanje_akademskih_radova_na_Fakultetu_politickih_znanosti.pdf) | str. 14, odjeljak 'FORMAT I OPREMA RADA' (Format rada) |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Sadrzaj kao zivo TOC polje | `toc-field-fixer` | Word sam azurira sadrzaj<br><sub>Dokument ima naslov Sadrzaj, a jos nema zivo TOC polje. Nedestruktivno: rucne stavke se ne brisu.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### FPZG · opći akademski rad

`fpzg-opci-akademski-rad` · status: partial · vrste rada: seminar, project, article

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Times New Roman | [Upute za pisanje akademskih radova na Fakultetu politickih znanosti](https://www.fpzg.unizg.hr/images/50442907/Upute_za_pisanje_akademskih_radova_na_Fakultetu_politickih_znanosti.pdf) | str. 6 (opca klauzula: svih vrsta proze, sve razine studija) i str. 14 (FORMAT I OPREMA RADA) |
| Velicina slova | `font-fixer` | 12 pt | [Upute za pisanje akademskih radova na Fakultetu politickih znanosti](https://www.fpzg.unizg.hr/images/50442907/Upute_za_pisanje_akademskih_radova_na_Fakultetu_politickih_znanosti.pdf) | str. 6 (opca klauzula: svih vrsta proze, sve razine studija) i str. 14 (FORMAT I OPREMA RADA) |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za pisanje akademskih radova na Fakultetu politickih znanosti](https://www.fpzg.unizg.hr/images/50442907/Upute_za_pisanje_akademskih_radova_na_Fakultetu_politickih_znanosti.pdf) | str. 6 (opca klauzula: svih vrsta proze, sve razine studija) i str. 14 (FORMAT I OPREMA RADA) |
| Poravnanje | `alignment-fixer` | obostrano | [Upute za pisanje akademskih radova na Fakultetu politickih znanosti](https://www.fpzg.unizg.hr/images/50442907/Upute_za_pisanje_akademskih_radova_na_Fakultetu_politickih_znanosti.pdf) | str. 14, odjeljak 'FORMAT I OPREMA RADA' (Format rada) |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### FPZG · diplomska Politologija · diplomski rad

`fpzg-politologija-diplomski` · status: verified · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Times New Roman | [Upute za pisanje akademskih radova na Fakultetu politickih znanosti](https://www.fpzg.unizg.hr/images/50442907/Upute_za_pisanje_akademskih_radova_na_Fakultetu_politickih_znanosti.pdf) | str. 14, odjeljak 'FORMAT I OPREMA RADA' (Format rada) |
| Velicina slova | `font-fixer` | 12 pt | [Upute za pisanje akademskih radova na Fakultetu politickih znanosti](https://www.fpzg.unizg.hr/images/50442907/Upute_za_pisanje_akademskih_radova_na_Fakultetu_politickih_znanosti.pdf) | str. 14, odjeljak 'FORMAT I OPREMA RADA' (Format rada) |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za pisanje akademskih radova na Fakultetu politickih znanosti](https://www.fpzg.unizg.hr/images/50442907/Upute_za_pisanje_akademskih_radova_na_Fakultetu_politickih_znanosti.pdf) | str. 14, odjeljak 'FORMAT I OPREMA RADA' (Format rada) |
| Format papira A4 | `paper-size-fixer` | 21 x 29,7 cm | [Upute za pisanje akademskih radova na Fakultetu politickih znanosti](https://www.fpzg.unizg.hr/images/50442907/Upute_za_pisanje_akademskih_radova_na_Fakultetu_politickih_znanosti.pdf) | str. 14, odjeljak 'FORMAT I OPREMA RADA' (Format rada) |
| Poravnanje | `alignment-fixer` | obostrano | [Upute za pisanje akademskih radova na Fakultetu politickih znanosti](https://www.fpzg.unizg.hr/images/50442907/Upute_za_pisanje_akademskih_radova_na_Fakultetu_politickih_znanosti.pdf) | str. 14, odjeljak 'FORMAT I OPREMA RADA' (Format rada) |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Sadrzaj kao zivo TOC polje | `toc-field-fixer` | Word sam azurira sadrzaj<br><sub>Dokument ima naslov Sadrzaj, a jos nema zivo TOC polje. Nedestruktivno: rucne stavke se ne brisu.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### FPZG · prijediplomska Politologija · završni rad

`fpzg-politologija-zavrsni` · status: verified · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Times New Roman | [Upute za pisanje akademskih radova na Fakultetu politickih znanosti](https://www.fpzg.unizg.hr/images/50442907/Upute_za_pisanje_akademskih_radova_na_Fakultetu_politickih_znanosti.pdf) | str. 6 (opca klauzula: svih vrsta proze, sve razine studija) i str. 14 (FORMAT I OPREMA RADA) |
| Velicina slova | `font-fixer` | 12 pt | [Upute za pisanje akademskih radova na Fakultetu politickih znanosti](https://www.fpzg.unizg.hr/images/50442907/Upute_za_pisanje_akademskih_radova_na_Fakultetu_politickih_znanosti.pdf) | str. 6 (opca klauzula: svih vrsta proze, sve razine studija) i str. 14 (FORMAT I OPREMA RADA) |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za pisanje akademskih radova na Fakultetu politickih znanosti](https://www.fpzg.unizg.hr/images/50442907/Upute_za_pisanje_akademskih_radova_na_Fakultetu_politickih_znanosti.pdf) | str. 6 (opca klauzula: svih vrsta proze, sve razine studija) i str. 14 (FORMAT I OPREMA RADA) |
| Format papira A4 | `paper-size-fixer` | 21 x 29,7 cm | [Upute za pisanje akademskih radova na Fakultetu politickih znanosti](https://www.fpzg.unizg.hr/images/50442907/Upute_za_pisanje_akademskih_radova_na_Fakultetu_politickih_znanosti.pdf) | str. 6 (opca klauzula: svih vrsta proze, sve razine studija) i str. 14 (FORMAT I OPREMA RADA) |
| Poravnanje | `alignment-fixer` | obostrano | [Upute za pisanje akademskih radova na Fakultetu politickih znanosti](https://www.fpzg.unizg.hr/images/50442907/Upute_za_pisanje_akademskih_radova_na_Fakultetu_politickih_znanosti.pdf) | str. 14, odjeljak 'FORMAT I OPREMA RADA' (Format rada) |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Sadrzaj kao zivo TOC polje | `toc-field-fixer` | Word sam azurira sadrzaj<br><sub>Dokument ima naslov Sadrzaj, a jos nema zivo TOC polje. Nedestruktivno: rucne stavke se ne brisu.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### FPZG · Odnosi s javnošću · završni specijalistički rad

`fpzg-specijalisticki-odnosi-s-javnoscu` · status: verified · vrste rada: specialist

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Times New Roman | [Upute za pisanje akademskih radova na Fakultetu politickih znanosti](https://www.fpzg.unizg.hr/images/50442907/Upute_za_pisanje_akademskih_radova_na_Fakultetu_politickih_znanosti.pdf) | str. 14, odjeljak 'FORMAT I OPREMA RADA' (Format rada) |
| Velicina slova | `font-fixer` | 12 pt | [Upute za pisanje akademskih radova na Fakultetu politickih znanosti](https://www.fpzg.unizg.hr/images/50442907/Upute_za_pisanje_akademskih_radova_na_Fakultetu_politickih_znanosti.pdf) | str. 14, odjeljak 'FORMAT I OPREMA RADA' (Format rada) |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za pisanje akademskih radova na Fakultetu politickih znanosti](https://www.fpzg.unizg.hr/images/50442907/Upute_za_pisanje_akademskih_radova_na_Fakultetu_politickih_znanosti.pdf) | str. 14, odjeljak 'FORMAT I OPREMA RADA' (Format rada) |
| Format papira A4 | `paper-size-fixer` | 21 x 29,7 cm | [Upute za pisanje akademskih radova na Fakultetu politickih znanosti](https://www.fpzg.unizg.hr/images/50442907/Upute_za_pisanje_akademskih_radova_na_Fakultetu_politickih_znanosti.pdf) | str. 14, odjeljak 'FORMAT I OPREMA RADA' (Format rada) |
| Poravnanje | `alignment-fixer` | obostrano | [Upute za pisanje akademskih radova na Fakultetu politickih znanosti](https://www.fpzg.unizg.hr/images/50442907/Upute_za_pisanje_akademskih_radova_na_Fakultetu_politickih_znanosti.pdf) | str. 14, odjeljak 'FORMAT I OPREMA RADA' (Format rada) |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Sadrzaj kao zivo TOC polje | `toc-field-fixer` | Word sam azurira sadrzaj<br><sub>Dokument ima naslov Sadrzaj, a jos nema zivo TOC polje. Nedestruktivno: rucne stavke se ne brisu.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### FPZG · Prilagodba Europskoj uniji: upravljanje projektima i korištenje fondova i programa EU · završni specijalistički rad

`fpzg-specijalisticki-prilagodba-eu` · status: verified · vrste rada: specialist

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Times New Roman | [Upute za pisanje akademskih radova na Fakultetu politickih znanosti](https://www.fpzg.unizg.hr/images/50442907/Upute_za_pisanje_akademskih_radova_na_Fakultetu_politickih_znanosti.pdf) | str. 14, odjeljak 'FORMAT I OPREMA RADA' (Format rada) |
| Velicina slova | `font-fixer` | 12 pt | [Upute za pisanje akademskih radova na Fakultetu politickih znanosti](https://www.fpzg.unizg.hr/images/50442907/Upute_za_pisanje_akademskih_radova_na_Fakultetu_politickih_znanosti.pdf) | str. 14, odjeljak 'FORMAT I OPREMA RADA' (Format rada) |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za pisanje akademskih radova na Fakultetu politickih znanosti](https://www.fpzg.unizg.hr/images/50442907/Upute_za_pisanje_akademskih_radova_na_Fakultetu_politickih_znanosti.pdf) | str. 14, odjeljak 'FORMAT I OPREMA RADA' (Format rada) |
| Format papira A4 | `paper-size-fixer` | 21 x 29,7 cm | [Upute za pisanje akademskih radova na Fakultetu politickih znanosti](https://www.fpzg.unizg.hr/images/50442907/Upute_za_pisanje_akademskih_radova_na_Fakultetu_politickih_znanosti.pdf) | str. 14, odjeljak 'FORMAT I OPREMA RADA' (Format rada) |
| Poravnanje | `alignment-fixer` | obostrano | [Upute za pisanje akademskih radova na Fakultetu politickih znanosti](https://www.fpzg.unizg.hr/images/50442907/Upute_za_pisanje_akademskih_radova_na_Fakultetu_politickih_znanosti.pdf) | str. 14, odjeljak 'FORMAT I OPREMA RADA' (Format rada) |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Sadrzaj kao zivo TOC polje | `toc-field-fixer` | Word sam azurira sadrzaj<br><sub>Dokument ima naslov Sadrzaj, a jos nema zivo TOC polje. Nedestruktivno: rucne stavke se ne brisu.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### FPZG · Sigurnosna politika Republike Hrvatske · završni specijalistički rad

`fpzg-specijalisticki-sigurnosna-politika-rh` · status: verified · vrste rada: specialist

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Times New Roman | [Upute za pisanje akademskih radova na Fakultetu politickih znanosti](https://www.fpzg.unizg.hr/images/50442907/Upute_za_pisanje_akademskih_radova_na_Fakultetu_politickih_znanosti.pdf) | str. 14, odjeljak 'FORMAT I OPREMA RADA' (Format rada) |
| Velicina slova | `font-fixer` | 12 pt | [Upute za pisanje akademskih radova na Fakultetu politickih znanosti](https://www.fpzg.unizg.hr/images/50442907/Upute_za_pisanje_akademskih_radova_na_Fakultetu_politickih_znanosti.pdf) | str. 14, odjeljak 'FORMAT I OPREMA RADA' (Format rada) |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za pisanje akademskih radova na Fakultetu politickih znanosti](https://www.fpzg.unizg.hr/images/50442907/Upute_za_pisanje_akademskih_radova_na_Fakultetu_politickih_znanosti.pdf) | str. 14, odjeljak 'FORMAT I OPREMA RADA' (Format rada) |
| Format papira A4 | `paper-size-fixer` | 21 x 29,7 cm | [Upute za pisanje akademskih radova na Fakultetu politickih znanosti](https://www.fpzg.unizg.hr/images/50442907/Upute_za_pisanje_akademskih_radova_na_Fakultetu_politickih_znanosti.pdf) | str. 14, odjeljak 'FORMAT I OPREMA RADA' (Format rada) |
| Poravnanje | `alignment-fixer` | obostrano | [Upute za pisanje akademskih radova na Fakultetu politickih znanosti](https://www.fpzg.unizg.hr/images/50442907/Upute_za_pisanje_akademskih_radova_na_Fakultetu_politickih_znanosti.pdf) | str. 14, odjeljak 'FORMAT I OPREMA RADA' (Format rada) |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Sadrzaj kao zivo TOC polje | `toc-field-fixer` | Word sam azurira sadrzaj<br><sub>Dokument ima naslov Sadrzaj, a jos nema zivo TOC polje. Nedestruktivno: rucne stavke se ne brisu.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### FPZG · Vanjska politika i diplomacija · završni specijalistički rad

`fpzg-specijalisticki-vanjska-politika-diplomacija` · status: verified · vrste rada: specialist

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Times New Roman | [Upute za pisanje akademskih radova na Fakultetu politickih znanosti](https://www.fpzg.unizg.hr/images/50442907/Upute_za_pisanje_akademskih_radova_na_Fakultetu_politickih_znanosti.pdf) | str. 14, odjeljak 'FORMAT I OPREMA RADA' (Format rada) |
| Velicina slova | `font-fixer` | 12 pt | [Upute za pisanje akademskih radova na Fakultetu politickih znanosti](https://www.fpzg.unizg.hr/images/50442907/Upute_za_pisanje_akademskih_radova_na_Fakultetu_politickih_znanosti.pdf) | str. 14, odjeljak 'FORMAT I OPREMA RADA' (Format rada) |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za pisanje akademskih radova na Fakultetu politickih znanosti](https://www.fpzg.unizg.hr/images/50442907/Upute_za_pisanje_akademskih_radova_na_Fakultetu_politickih_znanosti.pdf) | str. 14, odjeljak 'FORMAT I OPREMA RADA' (Format rada) |
| Format papira A4 | `paper-size-fixer` | 21 x 29,7 cm | [Upute za pisanje akademskih radova na Fakultetu politickih znanosti](https://www.fpzg.unizg.hr/images/50442907/Upute_za_pisanje_akademskih_radova_na_Fakultetu_politickih_znanosti.pdf) | str. 14, odjeljak 'FORMAT I OPREMA RADA' (Format rada) |
| Poravnanje | `alignment-fixer` | obostrano | [Upute za pisanje akademskih radova na Fakultetu politickih znanosti](https://www.fpzg.unizg.hr/images/50442907/Upute_za_pisanje_akademskih_radova_na_Fakultetu_politickih_znanosti.pdf) | str. 14, odjeljak 'FORMAT I OPREMA RADA' (Format rada) |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Sadrzaj kao zivo TOC polje | `toc-field-fixer` | Word sam azurira sadrzaj<br><sub>Dokument ima naslov Sadrzaj, a jos nema zivo TOC polje. Nedestruktivno: rucne stavke se ne brisu.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### fpzpu

#### FPZ Pula - Znanost o moru, diplomski rad

`fpzpu-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Arial | [Pravilnik o zavrsnom radu i zavrsnom koncertu na (pred)diplomskim sveucilisnim i strucnim studijima, procisceni tekst 30.9.2019 (Sveuciliste Jurja Dobrile u Puli)](https://www.unipu.hr/_download/repository/2019-09-30-Pravilnik_o_zavrsnom_radu-zavrsnom_koncertu-procisceni_tekst.pdf) | Clanak 5, stavak 1 |
| Velicina slova | `font-fixer` | 12 pt | [Pravilnik o zavrsnom radu i zavrsnom koncertu na (pred)diplomskim sveucilisnim i strucnim studijima, procisceni tekst 30.9.2019 (Sveuciliste Jurja Dobrile u Puli)](https://www.unipu.hr/_download/repository/2019-09-30-Pravilnik_o_zavrsnom_radu-zavrsnom_koncertu-procisceni_tekst.pdf) | Clanak 5, stavak 1 |
| Prored | `line-spacing-fixer` | prored 1,5 | [Pravilnik o zavrsnom radu i zavrsnom koncertu na (pred)diplomskim sveucilisnim i strucnim studijima, procisceni tekst 30.9.2019 (Sveuciliste Jurja Dobrile u Puli)](https://www.unipu.hr/_download/repository/2019-09-30-Pravilnik_o_zavrsnom_radu-zavrsnom_koncertu-procisceni_tekst.pdf) | Clanak 5, stavak 1 |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Pravilnik o zavrsnom radu i zavrsnom koncertu na (pred)diplomskim sveucilisnim i strucnim studijima, procisceni tekst 30.9.2019 (Sveuciliste Jurja Dobrile u Puli)](https://www.unipu.hr/_download/repository/2019-09-30-Pravilnik_o_zavrsnom_radu-zavrsnom_koncertu-procisceni_tekst.pdf) | Clanak 5, stavak 1 |
| Format papira A4 | `paper-size-fixer` | 21 x 29,7 cm | [Pravilnik o zavrsnom radu i zavrsnom koncertu na (pred)diplomskim sveucilisnim i strucnim studijima, procisceni tekst 30.9.2019 (Sveuciliste Jurja Dobrile u Puli)](https://www.unipu.hr/_download/repository/2019-09-30-Pravilnik_o_zavrsnom_radu-zavrsnom_koncertu-procisceni_tekst.pdf) | Clanak 5, stavak 1 |
| Font i veličina fusnota | `footnote-typography-fixer` | 10 pt |  |  |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### FPZ Pula - Znanost o moru, završni rad

`fpzpu-zavrsni` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Arial | [Pravilnik o zavrsnom radu i zavrsnom koncertu na (pred)diplomskim sveucilisnim i strucnim studijima, procisceni tekst 30.9.2019 (Sveuciliste Jurja Dobrile u Puli)](https://www.unipu.hr/_download/repository/2019-09-30-Pravilnik_o_zavrsnom_radu-zavrsnom_koncertu-procisceni_tekst.pdf) | Clanak 5, stavak 1 |
| Velicina slova | `font-fixer` | 12 pt | [Pravilnik o zavrsnom radu i zavrsnom koncertu na (pred)diplomskim sveucilisnim i strucnim studijima, procisceni tekst 30.9.2019 (Sveuciliste Jurja Dobrile u Puli)](https://www.unipu.hr/_download/repository/2019-09-30-Pravilnik_o_zavrsnom_radu-zavrsnom_koncertu-procisceni_tekst.pdf) | Clanak 5, stavak 1 |
| Prored | `line-spacing-fixer` | prored 1,5 | [Pravilnik o zavrsnom radu i zavrsnom koncertu na (pred)diplomskim sveucilisnim i strucnim studijima, procisceni tekst 30.9.2019 (Sveuciliste Jurja Dobrile u Puli)](https://www.unipu.hr/_download/repository/2019-09-30-Pravilnik_o_zavrsnom_radu-zavrsnom_koncertu-procisceni_tekst.pdf) | Clanak 5, stavak 1 |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Pravilnik o zavrsnom radu i zavrsnom koncertu na (pred)diplomskim sveucilisnim i strucnim studijima, procisceni tekst 30.9.2019 (Sveuciliste Jurja Dobrile u Puli)](https://www.unipu.hr/_download/repository/2019-09-30-Pravilnik_o_zavrsnom_radu-zavrsnom_koncertu-procisceni_tekst.pdf) | Clanak 5, stavak 1 |
| Format papira A4 | `paper-size-fixer` | 21 x 29,7 cm | [Pravilnik o zavrsnom radu i zavrsnom koncertu na (pred)diplomskim sveucilisnim i strucnim studijima, procisceni tekst 30.9.2019 (Sveuciliste Jurja Dobrile u Puli)](https://www.unipu.hr/_download/repository/2019-09-30-Pravilnik_o_zavrsnom_radu-zavrsnom_koncertu-procisceni_tekst.pdf) | Clanak 5, stavak 1 |
| Font i veličina fusnota | `footnote-typography-fixer` | 10 pt |  |  |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### fsb

#### Fakultet strojarstva i brodogradnje, diplomski rad

`fsb-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Velicina slova | `font-fixer` | 12 pt | [Upute za pisanje seminarskog, zavrsnog i diplomskog rada (FSB, Katedra za preradu polimera, 2020)](https://www.fsb.unizg.hr/atlantis/upload/newsboard/15_07_2020__15271_Upute_za_pisanje_radova.doc) | odjeljak Fontovi |
| Vrsta slova | `font-fixer` | Times New Roman | [Upute za pisanje seminarskog, zavrsnog i diplomskog rada (FSB, Katedra za preradu polimera, 2020)](https://www.fsb.unizg.hr/atlantis/upload/newsboard/15_07_2020__15271_Upute_za_pisanje_radova.doc) | odjeljak Fontovi |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za pisanje seminarskog, zavrsnog i diplomskog rada (FSB, Katedra za preradu polimera, 2020)](https://www.fsb.unizg.hr/atlantis/upload/newsboard/15_07_2020__15271_Upute_za_pisanje_radova.doc) | odjeljak Fontovi |
| Margine | `margins-fixer` | 2 / 2 / 2 / 2,5 cm (gore/desno/dolje/lijevo) | [Upute za pisanje seminarskog, zavrsnog i diplomskog rada (FSB, Katedra za preradu polimera, 2020)](https://www.fsb.unizg.hr/atlantis/upload/newsboard/15_07_2020__15271_Upute_za_pisanje_radova.doc) | odjeljak Obrojcavanje stranica, margine |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Fakultet strojarstva i brodogradnje, doktorski rad

`fsb-doktorski` · status: partial · vrste rada: doctoral

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Times New Roman | [Upute za oblikovanje doktorskog rada (Obrazac DR.SC.-08)](https://www.unizg.hr/nc/vijest/article/obrasci-za-doktorski-studij/) | odjeljak 'Postavke stranice' (DR.SC.-08, Upute za oblikovanje doktorskog rada) |
| Velicina slova | `font-fixer` | 12 pt | [Upute za oblikovanje doktorskog rada (Obrazac DR.SC.-08)](https://www.unizg.hr/nc/vijest/article/obrasci-za-doktorski-studij/) | odjeljak 'Postavke stranice' (DR.SC.-08, Upute za oblikovanje doktorskog rada) |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za oblikovanje doktorskog rada (Obrazac DR.SC.-08)](https://www.unizg.hr/nc/vijest/article/obrasci-za-doktorski-studij/) | odjeljak 'Postavke stranice' (DR.SC.-08, Upute za oblikovanje doktorskog rada) |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Upute za oblikovanje doktorskog rada (Obrazac DR.SC.-08)](https://www.unizg.hr/nc/vijest/article/obrasci-za-doktorski-studij/) | odjeljak 'Postavke stranice' (DR.SC.-08, Upute za oblikovanje doktorskog rada) |
| Format papira A4 | `paper-size-fixer` | 21 x 29,7 cm | [Upute za oblikovanje doktorskog rada (Obrazac DR.SC.-08)](https://www.unizg.hr/nc/vijest/article/obrasci-za-doktorski-studij/) | odjeljak 'Postavke stranice' (DR.SC.-08, Upute za oblikovanje doktorskog rada) |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### FSB · opći akademski rad (seminar/projekt)

`fsb-opci-akademski-rad` · status: partial · vrste rada: seminar, project, article

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font (preporuka) | `font-fixer` | Times New Roman | [Upute za pisanje seminarskog, zavrsnog i diplomskog rada (FSB, Katedra za preradu polimera, 2020)](https://www.fsb.unizg.hr/atlantis/upload/newsboard/15_07_2020__15271_Upute_za_pisanje_radova.doc) | Upute, opci dio |
| Velicina slova (preporuka) | `font-fixer` | 12 pt | [Upute za pisanje seminarskog, zavrsnog i diplomskog rada (FSB, Katedra za preradu polimera, 2020)](https://www.fsb.unizg.hr/atlantis/upload/newsboard/15_07_2020__15271_Upute_za_pisanje_radova.doc) | Upute, opci dio |
| Prored (preporuka) | `line-spacing-fixer` | prored 1,5 | [Upute za pisanje seminarskog, zavrsnog i diplomskog rada (FSB, Katedra za preradu polimera, 2020)](https://www.fsb.unizg.hr/atlantis/upload/newsboard/15_07_2020__15271_Upute_za_pisanje_radova.doc) | Upute, opci dio |
| Poravnanje (preporuka) | `alignment-fixer` | obostrano | [Upute za pisanje seminarskog, zavrsnog i diplomskog rada (FSB, Katedra za preradu polimera, 2020)](https://www.fsb.unizg.hr/atlantis/upload/newsboard/15_07_2020__15271_Upute_za_pisanje_radova.doc) | Upute, opci dio |
| Margine (lijeva 2,5cm) (preporuka) | `margins-fixer` | 2 / 2 / 2 / 2,5 cm (gore/desno/dolje/lijevo) | [Upute za pisanje seminarskog, zavrsnog i diplomskog rada (FSB, Katedra za preradu polimera, 2020)](https://www.fsb.unizg.hr/atlantis/upload/newsboard/15_07_2020__15271_Upute_za_pisanje_radova.doc) | Upute, opci dio |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Fakultet strojarstva i brodogradnje, završni rad

`fsb-zavrsni` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Velicina slova | `font-fixer` | 12 pt | [Upute za pisanje seminarskog, zavrsnog i diplomskog rada (FSB, Katedra za preradu polimera, 2020)](https://www.fsb.unizg.hr/atlantis/upload/newsboard/15_07_2020__15271_Upute_za_pisanje_radova.doc) | odjeljak Fontovi |
| Vrsta slova | `font-fixer` | Times New Roman | [Upute za pisanje seminarskog, zavrsnog i diplomskog rada (FSB, Katedra za preradu polimera, 2020)](https://www.fsb.unizg.hr/atlantis/upload/newsboard/15_07_2020__15271_Upute_za_pisanje_radova.doc) | odjeljak Fontovi |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za pisanje seminarskog, zavrsnog i diplomskog rada (FSB, Katedra za preradu polimera, 2020)](https://www.fsb.unizg.hr/atlantis/upload/newsboard/15_07_2020__15271_Upute_za_pisanje_radova.doc) | odjeljak Fontovi |
| Margine | `margins-fixer` | 2 / 2 / 2 / 2,5 cm (gore/desno/dolje/lijevo) | [Upute za pisanje seminarskog, zavrsnog i diplomskog rada (FSB, Katedra za preradu polimera, 2020)](https://www.fsb.unizg.hr/atlantis/upload/newsboard/15_07_2020__15271_Upute_za_pisanje_radova.doc) | odjeljak Obrojcavanje stranica, margine |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### ftrr

#### FTRR Pozega, diplomski rad

`ftrr-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Times New Roman | [Pravilnik o zavrsnom i diplomskom radu, prociscen tekst 2024 (FTRR Pozega)](https://ftrr.hr/images/Dokumenti/propisi/2024/08-01/pravilnik-o-zavrnom-diplomskom-radu.pdf) | Clanak 29., stavak 2 |
| Velicina slova | `font-fixer` | 12 pt | [Pravilnik o zavrsnom i diplomskom radu, prociscen tekst 2024 (FTRR Pozega)](https://ftrr.hr/images/Dokumenti/propisi/2024/08-01/pravilnik-o-zavrnom-diplomskom-radu.pdf) | Clanak 29., stavak 2 |
| Prored | `line-spacing-fixer` | prored 1,5 | [Pravilnik o zavrsnom i diplomskom radu, prociscen tekst 2024 (FTRR Pozega)](https://ftrr.hr/images/Dokumenti/propisi/2024/08-01/pravilnik-o-zavrnom-diplomskom-radu.pdf) | Clanak 29., stavak 2 |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Pravilnik o zavrsnom i diplomskom radu, prociscen tekst 2024 (FTRR Pozega)](https://ftrr.hr/images/Dokumenti/propisi/2024/08-01/pravilnik-o-zavrnom-diplomskom-radu.pdf) | Clanak 29., stavak 2 |
| Format papira A4 | `paper-size-fixer` | 21 x 29,7 cm | [Pravilnik o zavrsnom i diplomskom radu, prociscen tekst 2024 (FTRR Pozega)](https://ftrr.hr/images/Dokumenti/propisi/2024/08-01/pravilnik-o-zavrnom-diplomskom-radu.pdf) | Clanak 12., stavak 1 |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### FTRR Pozega, završni rad

`ftrr-zavrsni` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Times New Roman | [Pravilnik o zavrsnom i diplomskom radu, prociscen tekst 2024 (FTRR Pozega)](https://ftrr.hr/images/Dokumenti/propisi/2024/08-01/pravilnik-o-zavrnom-diplomskom-radu.pdf) | Clanak 29., stavak 2 |
| Velicina slova | `font-fixer` | 12 pt | [Pravilnik o zavrsnom i diplomskom radu, prociscen tekst 2024 (FTRR Pozega)](https://ftrr.hr/images/Dokumenti/propisi/2024/08-01/pravilnik-o-zavrnom-diplomskom-radu.pdf) | Clanak 29., stavak 2 |
| Prored | `line-spacing-fixer` | prored 1,5 | [Pravilnik o zavrsnom i diplomskom radu, prociscen tekst 2024 (FTRR Pozega)](https://ftrr.hr/images/Dokumenti/propisi/2024/08-01/pravilnik-o-zavrnom-diplomskom-radu.pdf) | Clanak 29., stavak 2 |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Pravilnik o zavrsnom i diplomskom radu, prociscen tekst 2024 (FTRR Pozega)](https://ftrr.hr/images/Dokumenti/propisi/2024/08-01/pravilnik-o-zavrnom-diplomskom-radu.pdf) | Clanak 29., stavak 2 |
| Format papira A4 | `paper-size-fixer` | 21 x 29,7 cm | [Pravilnik o zavrsnom i diplomskom radu, prociscen tekst 2024 (FTRR Pozega)](https://ftrr.hr/images/Dokumenti/propisi/2024/08-01/pravilnik-o-zavrnom-diplomskom-radu.pdf) | Clanak 12., stavak 1 |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### fzsri

#### Rijeka - Zdravstveni studiji, diplomski rad

`fzsri-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Upute za izradu završnog ili diplomskog rada (FZSRI, 2022)](https://www.fzsri.uniri.hr/files/DOKUMENTI-I-OBRASCI/zavrsni_diplomski/Upute%20za%20izradu%20zavrsnog%20ili%20diplomskog%20rada.pdf) | Upute, tč. 3.1 Format teksta i oznacavanje unutar teksta (str. 10) |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Upute za izradu završnog ili diplomskog rada (FZSRI, 2022)](https://www.fzsri.uniri.hr/files/DOKUMENTI-I-OBRASCI/zavrsni_diplomski/Upute%20za%20izradu%20zavrsnog%20ili%20diplomskog%20rada.pdf) | Upute, tč. 3.1 Format teksta i oznacavanje unutar teksta (str. 10) |
| Obostrano poravnanje | `alignment-fixer` | obostrano | [Upute za izradu završnog ili diplomskog rada (FZSRI, 2022)](https://www.fzsri.uniri.hr/files/DOKUMENTI-I-OBRASCI/zavrsni_diplomski/Upute%20za%20izradu%20zavrsnog%20ili%20diplomskog%20rada.pdf) | Upute, tč. 3.1 Format teksta i oznacavanje unutar teksta (str. 10) |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za izradu završnog ili diplomskog rada (FZSRI, 2022)](https://www.fzsri.uniri.hr/files/DOKUMENTI-I-OBRASCI/zavrsni_diplomski/Upute%20za%20izradu%20zavrsnog%20ili%20diplomskog%20rada.pdf) | Upute, tč. 3.1 Format teksta i oznacavanje unutar teksta (str. 10) |
| Velicina slova | `font-fixer` | 12 pt | [Upute za izradu završnog ili diplomskog rada (FZSRI, 2022)](https://www.fzsri.uniri.hr/files/DOKUMENTI-I-OBRASCI/zavrsni_diplomski/Upute%20za%20izradu%20zavrsnog%20ili%20diplomskog%20rada.pdf) | Upute, tč. 3.1 Format teksta i oznacavanje unutar teksta (str. 10) |
| Vrsta slova (Calibri/TNR/Arial) | `font-fixer` | Calibri | [Upute za izradu završnog ili diplomskog rada (FZSRI, 2022)](https://www.fzsri.uniri.hr/files/DOKUMENTI-I-OBRASCI/zavrsni_diplomski/Upute%20za%20izradu%20zavrsnog%20ili%20diplomskog%20rada.pdf) | Upute, tč. 3.1 Format teksta i oznacavanje unutar teksta (str. 10) |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Rijeka - Zdravstveni studiji, završni rad

`fzsri-zavrsni` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Upute za izradu završnog ili diplomskog rada (FZSRI, 2022)](https://www.fzsri.uniri.hr/files/DOKUMENTI-I-OBRASCI/zavrsni_diplomski/Upute%20za%20izradu%20zavrsnog%20ili%20diplomskog%20rada.pdf) | Upute, tč. 3.1 Format teksta i oznacavanje unutar teksta (str. 10) |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Upute za izradu završnog ili diplomskog rada (FZSRI, 2022)](https://www.fzsri.uniri.hr/files/DOKUMENTI-I-OBRASCI/zavrsni_diplomski/Upute%20za%20izradu%20zavrsnog%20ili%20diplomskog%20rada.pdf) | Upute, tč. 3.1 Format teksta i oznacavanje unutar teksta (str. 10) |
| Obostrano poravnanje | `alignment-fixer` | obostrano | [Upute za izradu završnog ili diplomskog rada (FZSRI, 2022)](https://www.fzsri.uniri.hr/files/DOKUMENTI-I-OBRASCI/zavrsni_diplomski/Upute%20za%20izradu%20zavrsnog%20ili%20diplomskog%20rada.pdf) | Upute, tč. 3.1 Format teksta i oznacavanje unutar teksta (str. 10) |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za izradu završnog ili diplomskog rada (FZSRI, 2022)](https://www.fzsri.uniri.hr/files/DOKUMENTI-I-OBRASCI/zavrsni_diplomski/Upute%20za%20izradu%20zavrsnog%20ili%20diplomskog%20rada.pdf) | Upute, tč. 3.1 Format teksta i oznacavanje unutar teksta (str. 10) |
| Velicina slova | `font-fixer` | 12 pt | [Upute za izradu završnog ili diplomskog rada (FZSRI, 2022)](https://www.fzsri.uniri.hr/files/DOKUMENTI-I-OBRASCI/zavrsni_diplomski/Upute%20za%20izradu%20zavrsnog%20ili%20diplomskog%20rada.pdf) | Upute, tč. 3.1 Format teksta i oznacavanje unutar teksta (str. 10) |
| Vrsta slova (Calibri/TNR/Arial) | `font-fixer` | Calibri | [Upute za izradu završnog ili diplomskog rada (FZSRI, 2022)](https://www.fzsri.uniri.hr/files/DOKUMENTI-I-OBRASCI/zavrsni_diplomski/Upute%20za%20izradu%20zavrsnog%20ili%20diplomskog%20rada.pdf) | Upute, tč. 3.1 Format teksta i oznacavanje unutar teksta (str. 10) |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### geof

#### Geodetski fakultet, diplomski rad

`geof-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Sadrzaj kao zivo TOC polje | `toc-field-fixer` | Word sam azurira sadrzaj<br><sub>Dokument ima naslov Sadrzaj, a jos nema zivo TOC polje. Nedestruktivno: rucne stavke se ne brisu.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Geodetski fakultet, doktorski rad

`geof-doktorski` · status: partial · vrste rada: doctoral

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Sadrzaj kao zivo TOC polje | `toc-field-fixer` | Word sam azurira sadrzaj<br><sub>Dokument ima naslov Sadrzaj, a jos nema zivo TOC polje. Nedestruktivno: rucne stavke se ne brisu.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### grad

#### Građevinski fakultet, diplomski rad

`grad-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font (tip pisma) | `font-fixer` | Titillium | [Predlozak za formalno oblikovanje zavrsnog/diplomskog rada (Gradevinski fakultet, 2024)](https://www.grad.unizg.hr/_download/repository/Predlo%C5%BEak%20za%20formalno%20oblikovanje%20zavr%C5%A1nog%20-%20diplomskog%20rada%20na%20Sveu%C4%8Dili%C5%A1tu%20u%20Zagrebu%2C%20Gra%C4%91evinskom%20fakultetu_2024_05_22%5B3%5D.docx) | poglavlje 4.1. Upute za oblikovanje izgleda rada, Postavke stranice |
| Velicina pisma | `font-fixer` | 12 pt | [Predlozak za formalno oblikovanje zavrsnog/diplomskog rada (Gradevinski fakultet, 2024)](https://www.grad.unizg.hr/_download/repository/Predlo%C5%BEak%20za%20formalno%20oblikovanje%20zavr%C5%A1nog%20-%20diplomskog%20rada%20na%20Sveu%C4%8Dili%C5%A1tu%20u%20Zagrebu%2C%20Gra%C4%91evinskom%20fakultetu_2024_05_22%5B3%5D.docx) | poglavlje 4.1. Upute za oblikovanje izgleda rada |
| Prored | `line-spacing-fixer` | prored 1,15 | [Predlozak za formalno oblikovanje zavrsnog/diplomskog rada (Gradevinski fakultet, 2024)](https://www.grad.unizg.hr/_download/repository/Predlo%C5%BEak%20za%20formalno%20oblikovanje%20zavr%C5%A1nog%20-%20diplomskog%20rada%20na%20Sveu%C4%8Dili%C5%A1tu%20u%20Zagrebu%2C%20Gra%C4%91evinskom%20fakultetu_2024_05_22%5B3%5D.docx) | poglavlje 4.1. Upute za oblikovanje izgleda rada |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Predlozak za formalno oblikovanje zavrsnog/diplomskog rada (Gradevinski fakultet, 2024)](https://www.grad.unizg.hr/_download/repository/Predlo%C5%BEak%20za%20formalno%20oblikovanje%20zavr%C5%A1nog%20-%20diplomskog%20rada%20na%20Sveu%C4%8Dili%C5%A1tu%20u%20Zagrebu%2C%20Gra%C4%91evinskom%20fakultetu_2024_05_22%5B3%5D.docx) | poglavlje 4.1. Upute za oblikovanje izgleda rada, Postavke stranice |
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Predlozak za formalno oblikovanje zavrsnog/diplomskog rada (Gradevinski fakultet, 2024)](https://www.grad.unizg.hr/_download/repository/Predlo%C5%BEak%20za%20formalno%20oblikovanje%20zavr%C5%A1nog%20-%20diplomskog%20rada%20na%20Sveu%C4%8Dili%C5%A1tu%20u%20Zagrebu%2C%20Gra%C4%91evinskom%20fakultetu_2024_05_22%5B3%5D.docx) | poglavlje 4.1. Upute za oblikovanje izgleda rada, Postavke stranice |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Sadrzaj kao zivo TOC polje | `toc-field-fixer` | Word sam azurira sadrzaj<br><sub>Dokument ima naslov Sadrzaj, a jos nema zivo TOC polje. Nedestruktivno: rucne stavke se ne brisu.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Građevinski fakultet, doktorski rad

`grad-doktorski` · status: partial · vrste rada: doctoral

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Times New Roman | [Upute za oblikovanje doktorskog rada (Obrazac DR.SC.-08)](https://www.unizg.hr/nc/vijest/article/obrasci-za-doktorski-studij/) | odjeljak 'Postavke stranice' (DR.SC.-08, Upute za oblikovanje doktorskog rada) |
| Velicina slova | `font-fixer` | 12 pt | [Upute za oblikovanje doktorskog rada (Obrazac DR.SC.-08)](https://www.unizg.hr/nc/vijest/article/obrasci-za-doktorski-studij/) | odjeljak 'Postavke stranice' (DR.SC.-08, Upute za oblikovanje doktorskog rada) |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za oblikovanje doktorskog rada (Obrazac DR.SC.-08)](https://www.unizg.hr/nc/vijest/article/obrasci-za-doktorski-studij/) | odjeljak 'Postavke stranice' (DR.SC.-08, Upute za oblikovanje doktorskog rada) |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Upute za oblikovanje doktorskog rada (Obrazac DR.SC.-08)](https://www.unizg.hr/nc/vijest/article/obrasci-za-doktorski-studij/) | odjeljak 'Postavke stranice' (DR.SC.-08, Upute za oblikovanje doktorskog rada) |
| Format papira A4 | `paper-size-fixer` | 21 x 29,7 cm | [Upute za oblikovanje doktorskog rada (Obrazac DR.SC.-08)](https://www.unizg.hr/nc/vijest/article/obrasci-za-doktorski-studij/) | odjeljak 'Postavke stranice' (DR.SC.-08, Upute za oblikovanje doktorskog rada) |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Građevinski fakultet, završni rad

`grad-zavrsni` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font (tip pisma) | `font-fixer` | Titillium | [Predlozak za formalno oblikovanje zavrsnog/diplomskog rada (Gradevinski fakultet, 2024)](https://www.grad.unizg.hr/_download/repository/Predlo%C5%BEak%20za%20formalno%20oblikovanje%20zavr%C5%A1nog%20-%20diplomskog%20rada%20na%20Sveu%C4%8Dili%C5%A1tu%20u%20Zagrebu%2C%20Gra%C4%91evinskom%20fakultetu_2024_05_22%5B3%5D.docx) | poglavlje 4.1. Upute za oblikovanje izgleda rada, Postavke stranice |
| Velicina pisma | `font-fixer` | 12 pt | [Predlozak za formalno oblikovanje zavrsnog/diplomskog rada (Gradevinski fakultet, 2024)](https://www.grad.unizg.hr/_download/repository/Predlo%C5%BEak%20za%20formalno%20oblikovanje%20zavr%C5%A1nog%20-%20diplomskog%20rada%20na%20Sveu%C4%8Dili%C5%A1tu%20u%20Zagrebu%2C%20Gra%C4%91evinskom%20fakultetu_2024_05_22%5B3%5D.docx) | poglavlje 4.1. Upute za oblikovanje izgleda rada |
| Prored | `line-spacing-fixer` | prored 1,15 | [Predlozak za formalno oblikovanje zavrsnog/diplomskog rada (Gradevinski fakultet, 2024)](https://www.grad.unizg.hr/_download/repository/Predlo%C5%BEak%20za%20formalno%20oblikovanje%20zavr%C5%A1nog%20-%20diplomskog%20rada%20na%20Sveu%C4%8Dili%C5%A1tu%20u%20Zagrebu%2C%20Gra%C4%91evinskom%20fakultetu_2024_05_22%5B3%5D.docx) | poglavlje 4.1. Upute za oblikovanje izgleda rada |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Predlozak za formalno oblikovanje zavrsnog/diplomskog rada (Gradevinski fakultet, 2024)](https://www.grad.unizg.hr/_download/repository/Predlo%C5%BEak%20za%20formalno%20oblikovanje%20zavr%C5%A1nog%20-%20diplomskog%20rada%20na%20Sveu%C4%8Dili%C5%A1tu%20u%20Zagrebu%2C%20Gra%C4%91evinskom%20fakultetu_2024_05_22%5B3%5D.docx) | poglavlje 4.1. Upute za oblikovanje izgleda rada, Postavke stranice |
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Predlozak za formalno oblikovanje zavrsnog/diplomskog rada (Gradevinski fakultet, 2024)](https://www.grad.unizg.hr/_download/repository/Predlo%C5%BEak%20za%20formalno%20oblikovanje%20zavr%C5%A1nog%20-%20diplomskog%20rada%20na%20Sveu%C4%8Dili%C5%A1tu%20u%20Zagrebu%2C%20Gra%C4%91evinskom%20fakultetu_2024_05_22%5B3%5D.docx) | poglavlje 4.1. Upute za oblikovanje izgleda rada, Postavke stranice |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Sadrzaj kao zivo TOC polje | `toc-field-fixer` | Word sam azurira sadrzaj<br><sub>Dokument ima naslov Sadrzaj, a jos nema zivo TOC polje. Nedestruktivno: rucne stavke se ne brisu.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### gradri

#### Rijeka - Građevinski fakultet, diplomski rad

`gradri-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Oblikovanje naslova po razinama | `heading-format-fixer` | razina 1 podebljano; razina 2 podebljano; razina 3 podebljano kurziv |  |  |
| Velika slova naslova | `heading-case-fixer` | velika slova, razine 1<br><sub>Trazi izricitu privolu (mijenja autorov tekst ili strukturu).</sub> |  |  |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Rijeka - Građevinski fakultet, završni rad

`gradri-zavrsni` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Oblikovanje naslova po razinama | `heading-format-fixer` | razina 1 podebljano; razina 2 podebljano; razina 3 podebljano kurziv |  |  |
| Velika slova naslova | `heading-case-fixer` | velika slova, razine 1<br><sub>Trazi izricitu privolu (mijenja autorov tekst ili strukturu).</sub> |  |  |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### grafos

#### GFOS, diplomski rad

`grafos-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Smjernice za izradu i oblikovanje zavrsnih i diplomskih radova (GFOS, 2022)](https://www.gfos.unios.hr/download/smjernice-za-izradu-zavrsnih-i-diplomskih-radova-01-10-2022.docx) | t. 3.1 Oblikovanje teksta |
| Vrsta slova | `font-fixer` | Times New Roman | [Smjernice za izradu i oblikovanje zavrsnih i diplomskih radova (GFOS, 2022)](https://www.gfos.unios.hr/download/smjernice-za-izradu-zavrsnih-i-diplomskih-radova-01-10-2022.docx) | t. 3.1 |
| Velicina slova | `font-fixer` | 12 pt | [Smjernice za izradu i oblikovanje zavrsnih i diplomskih radova (GFOS, 2022)](https://www.gfos.unios.hr/download/smjernice-za-izradu-zavrsnih-i-diplomskih-radova-01-10-2022.docx) | t. 3.1 |
| Obostrano poravnanje | `alignment-fixer` | obostrano | [Smjernice za izradu i oblikovanje zavrsnih i diplomskih radova (GFOS, 2022)](https://www.gfos.unios.hr/download/smjernice-za-izradu-zavrsnih-i-diplomskih-radova-01-10-2022.docx) | t. 3.1 |
| Prored | `line-spacing-fixer` | prored 1,5 | [Smjernice za izradu i oblikovanje zavrsnih i diplomskih radova (GFOS, 2022)](https://www.gfos.unios.hr/download/smjernice-za-izradu-zavrsnih-i-diplomskih-radova-01-10-2022.docx) | t. 3.1 |
| Margine | `margins-fixer` | 2,5 / 2 / 2 / 2,5 cm (gore/desno/dolje/lijevo) | [Smjernice za izradu i oblikovanje zavrsnih i diplomskih radova (GFOS, 2022)](https://www.gfos.unios.hr/download/smjernice-za-izradu-zavrsnih-i-diplomskih-radova-01-10-2022.docx) | t. 3.1 |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### GFOS, završni rad

`grafos-zavrsni` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Smjernice za izradu i oblikovanje zavrsnih i diplomskih radova (GFOS, 2022)](https://www.gfos.unios.hr/download/smjernice-za-izradu-zavrsnih-i-diplomskih-radova-01-10-2022.docx) | t. 3.1 Oblikovanje teksta |
| Vrsta slova | `font-fixer` | Times New Roman | [Smjernice za izradu i oblikovanje zavrsnih i diplomskih radova (GFOS, 2022)](https://www.gfos.unios.hr/download/smjernice-za-izradu-zavrsnih-i-diplomskih-radova-01-10-2022.docx) | t. 3.1 |
| Velicina slova | `font-fixer` | 12 pt | [Smjernice za izradu i oblikovanje zavrsnih i diplomskih radova (GFOS, 2022)](https://www.gfos.unios.hr/download/smjernice-za-izradu-zavrsnih-i-diplomskih-radova-01-10-2022.docx) | t. 3.1 |
| Obostrano poravnanje | `alignment-fixer` | obostrano | [Smjernice za izradu i oblikovanje zavrsnih i diplomskih radova (GFOS, 2022)](https://www.gfos.unios.hr/download/smjernice-za-izradu-zavrsnih-i-diplomskih-radova-01-10-2022.docx) | t. 3.1 |
| Prored | `line-spacing-fixer` | prored 1,5 | [Smjernice za izradu i oblikovanje zavrsnih i diplomskih radova (GFOS, 2022)](https://www.gfos.unios.hr/download/smjernice-za-izradu-zavrsnih-i-diplomskih-radova-01-10-2022.docx) | t. 3.1 |
| Margine | `margins-fixer` | 2,5 / 2 / 2 / 2,5 cm (gore/desno/dolje/lijevo) | [Smjernice za izradu i oblikovanje zavrsnih i diplomskih radova (GFOS, 2022)](https://www.gfos.unios.hr/download/smjernice-za-izradu-zavrsnih-i-diplomskih-radova-01-10-2022.docx) | t. 3.1 |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### grf

#### Grafički fakultet, diplomski rad

`grf-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Pismo (font) | `font-fixer` | Times New Roman | [Uputa za izradu diplomskog rada (Prilog 3 Pravilnika o izradi i obrani diplomskog rada, Graficki fakultet Sveucilista u Zagrebu)](https://www.grf.unizg.hr/images/stories/SBG/Propisi/DIPLRAD-prilog3.doc) | odjeljak Postavke stranice |
| Velicina slova | `font-fixer` | 12 pt | [Uputa za izradu diplomskog rada (Prilog 3 Pravilnika o izradi i obrani diplomskog rada, Graficki fakultet Sveucilista u Zagrebu)](https://www.grf.unizg.hr/images/stories/SBG/Propisi/DIPLRAD-prilog3.doc) | odjeljak Postavke stranice |
| Prored | `line-spacing-fixer` | prored 1,5 | [Uputa za izradu diplomskog rada (Prilog 3 Pravilnika o izradi i obrani diplomskog rada, Graficki fakultet Sveucilista u Zagrebu)](https://www.grf.unizg.hr/images/stories/SBG/Propisi/DIPLRAD-prilog3.doc) | odjeljak Postavke stranice |
| Margine | `margins-fixer` | 2,5 / 2,5 / 3,5 / 3,5 cm (gore/desno/dolje/lijevo) | [Uputa za izradu diplomskog rada (Prilog 3 Pravilnika o izradi i obrani diplomskog rada, Graficki fakultet Sveucilista u Zagrebu)](https://www.grf.unizg.hr/images/stories/SBG/Propisi/DIPLRAD-prilog3.doc) | odjeljak Postavke stranice |
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Uputa za izradu diplomskog rada (Prilog 3 Pravilnika o izradi i obrani diplomskog rada, Graficki fakultet Sveucilista u Zagrebu)](https://www.grf.unizg.hr/images/stories/SBG/Propisi/DIPLRAD-prilog3.doc) | uvodni odjeljak Uputa |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Sadrzaj kao zivo TOC polje | `toc-field-fixer` | Word sam azurira sadrzaj<br><sub>Dokument ima naslov Sadrzaj, a jos nema zivo TOC polje. Nedestruktivno: rucne stavke se ne brisu.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Grafički fakultet, doktorski rad

`grf-doktorski` · status: partial · vrste rada: doctoral

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Times New Roman | [Upute za oblikovanje doktorskog rada (Obrazac DR.SC.-08)](https://www.unizg.hr/nc/vijest/article/obrasci-za-doktorski-studij/) | odjeljak 'Postavke stranice' (DR.SC.-08, Upute za oblikovanje doktorskog rada) |
| Velicina slova | `font-fixer` | 12 pt | [Upute za oblikovanje doktorskog rada (Obrazac DR.SC.-08)](https://www.unizg.hr/nc/vijest/article/obrasci-za-doktorski-studij/) | odjeljak 'Postavke stranice' (DR.SC.-08, Upute za oblikovanje doktorskog rada) |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za oblikovanje doktorskog rada (Obrazac DR.SC.-08)](https://www.unizg.hr/nc/vijest/article/obrasci-za-doktorski-studij/) | odjeljak 'Postavke stranice' (DR.SC.-08, Upute za oblikovanje doktorskog rada) |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Upute za oblikovanje doktorskog rada (Obrazac DR.SC.-08)](https://www.unizg.hr/nc/vijest/article/obrasci-za-doktorski-studij/) | odjeljak 'Postavke stranice' (DR.SC.-08, Upute za oblikovanje doktorskog rada) |
| Format papira A4 | `paper-size-fixer` | 21 x 29,7 cm | [Upute za oblikovanje doktorskog rada (Obrazac DR.SC.-08)](https://www.unizg.hr/nc/vijest/article/obrasci-za-doktorski-studij/) | odjeljak 'Postavke stranice' (DR.SC.-08, Upute za oblikovanje doktorskog rada) |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Grafički fakultet, završni rad

`grf-zavrsni` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Pismo (font) | `font-fixer` | Times New Roman | [Upute za izradu zavrsnog rada (Graficki fakultet Sveucilista u Zagrebu)](https://www.grf.unizg.hr/images/stories/SMP/upute-za-izradu-zavrsnog-rada.pdf) | odjeljak 1. Oblikovanje zavrsnog rada |
| Velicina slova | `font-fixer` | 12 pt | [Upute za izradu zavrsnog rada (Graficki fakultet Sveucilista u Zagrebu)](https://www.grf.unizg.hr/images/stories/SMP/upute-za-izradu-zavrsnog-rada.pdf) | odjeljak 2. Sastavljanje zavrsnog rada (prijelom teksta) |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za izradu zavrsnog rada (Graficki fakultet Sveucilista u Zagrebu)](https://www.grf.unizg.hr/images/stories/SMP/upute-za-izradu-zavrsnog-rada.pdf) | odjeljak 1. Oblikovanje zavrsnog rada |
| Margine | `margins-fixer` | 2 / 2,5 / 2 / 3,5 cm (gore/desno/dolje/lijevo) | [Upute za izradu zavrsnog rada (Graficki fakultet Sveucilista u Zagrebu)](https://www.grf.unizg.hr/images/stories/SMP/upute-za-izradu-zavrsnog-rada.pdf) | odjeljak 1. Oblikovanje zavrsnog rada |
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Upute za izradu zavrsnog rada (Graficki fakultet Sveucilista u Zagrebu)](https://www.grf.unizg.hr/images/stories/SMP/upute-za-izradu-zavrsnog-rada.pdf) | odjeljak 1. Oblikovanje zavrsnog rada |
| Obostrano poravnanje (puni format) | `alignment-fixer` | obostrano | [Upute za izradu zavrsnog rada (Graficki fakultet Sveucilista u Zagrebu)](https://www.grf.unizg.hr/images/stories/SMP/upute-za-izradu-zavrsnog-rada.pdf) | odjeljak 2. Sastavljanje zavrsnog rada (prijelom teksta) |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Sadrzaj kao zivo TOC polje | `toc-field-fixer` | Word sam azurira sadrzaj<br><sub>Dokument ima naslov Sadrzaj, a jos nema zivo TOC polje. Nedestruktivno: rucne stavke se ne brisu.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### hks

#### HKS, diplomski rad

`hks-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Opce upute za izradu diplomskog rada (HKS, izmjene prosinac 2023)](https://www.unicath.hr/sites/default/files/2024-10/Opc%CC%81e-upute-za-izradu-diplomskog-rada-izmjene-prosinac-2023.pdf) | Opce upute, dio I. (Diplomski rad pise se), str. 1 |
| Vrsta slova | `font-fixer` | Book Antiqua | [Opce upute za izradu diplomskog rada (HKS, izmjene prosinac 2023)](https://www.unicath.hr/sites/default/files/2024-10/Opc%CC%81e-upute-za-izradu-diplomskog-rada-izmjene-prosinac-2023.pdf) | Opce upute, dio I. (Diplomski rad pise se), str. 1 |
| Velicina slova | `font-fixer` | 11 pt | [Opce upute za izradu diplomskog rada (HKS, izmjene prosinac 2023)](https://www.unicath.hr/sites/default/files/2024-10/Opc%CC%81e-upute-za-izradu-diplomskog-rada-izmjene-prosinac-2023.pdf) | Opce upute, dio I. (Diplomski rad pise se), str. 1 |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Opce upute za izradu diplomskog rada (HKS, izmjene prosinac 2023)](https://www.unicath.hr/sites/default/files/2024-10/Opc%CC%81e-upute-za-izradu-diplomskog-rada-izmjene-prosinac-2023.pdf) | Opce upute, dio I. (Diplomski rad pise se), str. 1 |
| Prored | `line-spacing-fixer` | prored 1,5 | [Opce upute za izradu diplomskog rada (HKS, izmjene prosinac 2023)](https://www.unicath.hr/sites/default/files/2024-10/Opc%CC%81e-upute-za-izradu-diplomskog-rada-izmjene-prosinac-2023.pdf) | Opce upute, dio I. (Diplomski rad pise se), str. 1 |
| Obostrano poravnanje | `alignment-fixer` | obostrano | [Opce upute za izradu diplomskog rada (HKS, izmjene prosinac 2023)](https://www.unicath.hr/sites/default/files/2024-10/Opc%CC%81e-upute-za-izradu-diplomskog-rada-izmjene-prosinac-2023.pdf) | Opce upute, dio I. (Diplomski rad pise se), str. 1 |
| Font i veličina fusnota | `footnote-typography-fixer` | 10 pt |  |  |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### inf

#### INF, diplomski rad

`inf-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Pravilnik o diplomskom radu (INF, 2024)](https://www.inf.uniri.hr/images/dokumenti/pravilnici/Pravilnik_o_diplomskom_radu_INF_2024.pdf) | Članak 11. (izgled i opremanje diplomskog rada) |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### INF, završni rad

`inf-zavrsni` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Pravilnik o zavrsnom radu (INF, 2024)](https://www.inf.uniri.hr/images/dokumenti/pravilnici/Pravilnik_o_zavrsnom_radu_INF_2024.pdf) | Članak o izgledu i opremanju zavrsnog rada |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### iv

#### Istarsko veleuciliste (Universita Istriana), Pula, diplomski rad

`iv-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Vrsta slova | `font-fixer` | Arial | [Pravilnik o izradi završnih i diplomskih radova](https://www.iv.hr/wp-content/uploads/2025/12/Pravilnik-o-izradi-zavrsnih-i-diplomskih-radova-za-web.pdf) | t. 3 Tehnički zahtjevi (str. 2) |
| Velicina slova | `font-fixer` | 12 pt | [Pravilnik o izradi završnih i diplomskih radova](https://www.iv.hr/wp-content/uploads/2025/12/Pravilnik-o-izradi-zavrsnih-i-diplomskih-radova-za-web.pdf) | t. 3 Tehnički zahtjevi (str. 2) |
| Prored | `line-spacing-fixer` | prored 1,5 | [Pravilnik o izradi završnih i diplomskih radova](https://www.iv.hr/wp-content/uploads/2025/12/Pravilnik-o-izradi-zavrsnih-i-diplomskih-radova-za-web.pdf) | t. 3 Tehnički zahtjevi (str. 2) |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Pravilnik o izradi završnih i diplomskih radova](https://www.iv.hr/wp-content/uploads/2025/12/Pravilnik-o-izradi-zavrsnih-i-diplomskih-radova-za-web.pdf) | t. 3 Tehnički zahtjevi (str. 2) |
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Prva i druga naslovnica završnog / diplomskog rada (predložak, Prilog Pravilniku)](https://www.iv.hr/wp-content/uploads/2025/12/Prva-i-druga-naslovnica-zavrsnog-diplomskog-rada.docx) | word/document.xml → w:sectPr/w:pgSz w:w="11906" w:h="16838" (A4) |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Istarsko veleuciliste (Universita Istriana), Pula, zavrsni rad

`iv-zavrsni` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Vrsta slova | `font-fixer` | Arial | [Pravilnik o izradi završnih i diplomskih radova](https://www.iv.hr/wp-content/uploads/2025/12/Pravilnik-o-izradi-zavrsnih-i-diplomskih-radova-za-web.pdf) | t. 3 Tehnički zahtjevi (str. 2) |
| Velicina slova | `font-fixer` | 12 pt | [Pravilnik o izradi završnih i diplomskih radova](https://www.iv.hr/wp-content/uploads/2025/12/Pravilnik-o-izradi-zavrsnih-i-diplomskih-radova-za-web.pdf) | t. 3 Tehnički zahtjevi (str. 2) |
| Prored | `line-spacing-fixer` | prored 1,5 | [Pravilnik o izradi završnih i diplomskih radova](https://www.iv.hr/wp-content/uploads/2025/12/Pravilnik-o-izradi-zavrsnih-i-diplomskih-radova-za-web.pdf) | t. 3 Tehnički zahtjevi (str. 2) |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Pravilnik o izradi završnih i diplomskih radova](https://www.iv.hr/wp-content/uploads/2025/12/Pravilnik-o-izradi-zavrsnih-i-diplomskih-radova-za-web.pdf) | t. 3 Tehnički zahtjevi (str. 2) |
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Prva i druga naslovnica završnog / diplomskog rada (predložak, Prilog Pravilniku)](https://www.iv.hr/wp-content/uploads/2025/12/Prva-i-druga-naslovnica-zavrsnog-diplomskog-rada.docx) | word/document.xml → w:sectPr/w:pgSz w:w="11906" w:h="16838" (A4) |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### kbf

#### Katolički bogoslovni fakultet, diplomski rad

`kbf-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Times New Roman | [Prijedlog uputa za pisanje zavrsnoga i diplomskoga rada (Katolicki bogoslovni fakultet, 2017)](https://www.kbf.unizg.hr/wp-content/uploads/2017/06/Upute-za-pisanje-zavr%C5%A1noga-i-diplomskoga-rada-KONA%C4%8CNA-VERZIJA.pdf) | odjeljak 4.5. Tehnicke upute za oblikovanje teksta |
| Velicina slova | `font-fixer` | 12 pt | [Prijedlog uputa za pisanje zavrsnoga i diplomskoga rada (Katolicki bogoslovni fakultet, 2017)](https://www.kbf.unizg.hr/wp-content/uploads/2017/06/Upute-za-pisanje-zavr%C5%A1noga-i-diplomskoga-rada-KONA%C4%8CNA-VERZIJA.pdf) | odjeljak 4.5. Tehnicke upute za oblikovanje teksta |
| Prored | `line-spacing-fixer` | prored 1,5 | [Prijedlog uputa za pisanje zavrsnoga i diplomskoga rada (Katolicki bogoslovni fakultet, 2017)](https://www.kbf.unizg.hr/wp-content/uploads/2017/06/Upute-za-pisanje-zavr%C5%A1noga-i-diplomskoga-rada-KONA%C4%8CNA-VERZIJA.pdf) | odjeljak 4.5. Tehnicke upute za oblikovanje teksta |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 3,5 cm (gore/desno/dolje/lijevo) | [Prijedlog uputa za pisanje zavrsnoga i diplomskoga rada (Katolicki bogoslovni fakultet, 2017)](https://www.kbf.unizg.hr/wp-content/uploads/2017/06/Upute-za-pisanje-zavr%C5%A1noga-i-diplomskoga-rada-KONA%C4%8CNA-VERZIJA.pdf) | odjeljak 4.5. Tehnicke upute za oblikovanje teksta |
| Obostrano poravnanje | `alignment-fixer` | obostrano | [Prijedlog uputa za pisanje zavrsnoga i diplomskoga rada (Katolicki bogoslovni fakultet, 2017)](https://www.kbf.unizg.hr/wp-content/uploads/2017/06/Upute-za-pisanje-zavr%C5%A1noga-i-diplomskoga-rada-KONA%C4%8CNA-VERZIJA.pdf) | odjeljak 4.5. Tehnicke upute za oblikovanje teksta |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Sadrzaj kao zivo TOC polje | `toc-field-fixer` | Word sam azurira sadrzaj<br><sub>Dokument ima naslov Sadrzaj, a jos nema zivo TOC polje. Nedestruktivno: rucne stavke se ne brisu.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Katolički bogoslovni fakultet, doktorski rad

`kbf-doktorski` · status: partial · vrste rada: doctoral

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Times New Roman | [Upute za oblikovanje doktorskog rada (Obrazac DR.SC.-08)](https://www.unizg.hr/nc/vijest/article/obrasci-za-doktorski-studij/) | odjeljak 'Postavke stranice' (DR.SC.-08, Upute za oblikovanje doktorskog rada) |
| Velicina slova | `font-fixer` | 12 pt | [Upute za oblikovanje doktorskog rada (Obrazac DR.SC.-08)](https://www.unizg.hr/nc/vijest/article/obrasci-za-doktorski-studij/) | odjeljak 'Postavke stranice' (DR.SC.-08, Upute za oblikovanje doktorskog rada) |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za oblikovanje doktorskog rada (Obrazac DR.SC.-08)](https://www.unizg.hr/nc/vijest/article/obrasci-za-doktorski-studij/) | odjeljak 'Postavke stranice' (DR.SC.-08, Upute za oblikovanje doktorskog rada) |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Upute za oblikovanje doktorskog rada (Obrazac DR.SC.-08)](https://www.unizg.hr/nc/vijest/article/obrasci-za-doktorski-studij/) | odjeljak 'Postavke stranice' (DR.SC.-08, Upute za oblikovanje doktorskog rada) |
| Format papira A4 | `paper-size-fixer` | 21 x 29,7 cm | [Upute za oblikovanje doktorskog rada (Obrazac DR.SC.-08)](https://www.unizg.hr/nc/vijest/article/obrasci-za-doktorski-studij/) | odjeljak 'Postavke stranice' (DR.SC.-08, Upute za oblikovanje doktorskog rada) |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Katolički bogoslovni fakultet, završni rad

`kbf-zavrsni` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Times New Roman | [Prijedlog uputa za pisanje zavrsnoga i diplomskoga rada (Katolicki bogoslovni fakultet, 2017)](https://www.kbf.unizg.hr/wp-content/uploads/2017/06/Upute-za-pisanje-zavr%C5%A1noga-i-diplomskoga-rada-KONA%C4%8CNA-VERZIJA.pdf) | odjeljak 4.5. Tehnicke upute za oblikovanje teksta |
| Velicina slova | `font-fixer` | 12 pt | [Prijedlog uputa za pisanje zavrsnoga i diplomskoga rada (Katolicki bogoslovni fakultet, 2017)](https://www.kbf.unizg.hr/wp-content/uploads/2017/06/Upute-za-pisanje-zavr%C5%A1noga-i-diplomskoga-rada-KONA%C4%8CNA-VERZIJA.pdf) | odjeljak 4.5. Tehnicke upute za oblikovanje teksta |
| Prored | `line-spacing-fixer` | prored 1,5 | [Prijedlog uputa za pisanje zavrsnoga i diplomskoga rada (Katolicki bogoslovni fakultet, 2017)](https://www.kbf.unizg.hr/wp-content/uploads/2017/06/Upute-za-pisanje-zavr%C5%A1noga-i-diplomskoga-rada-KONA%C4%8CNA-VERZIJA.pdf) | odjeljak 4.5. Tehnicke upute za oblikovanje teksta |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 3,5 cm (gore/desno/dolje/lijevo) | [Prijedlog uputa za pisanje zavrsnoga i diplomskoga rada (Katolicki bogoslovni fakultet, 2017)](https://www.kbf.unizg.hr/wp-content/uploads/2017/06/Upute-za-pisanje-zavr%C5%A1noga-i-diplomskoga-rada-KONA%C4%8CNA-VERZIJA.pdf) | odjeljak 4.5. Tehnicke upute za oblikovanje teksta |
| Obostrano poravnanje | `alignment-fixer` | obostrano | [Prijedlog uputa za pisanje zavrsnoga i diplomskoga rada (Katolicki bogoslovni fakultet, 2017)](https://www.kbf.unizg.hr/wp-content/uploads/2017/06/Upute-za-pisanje-zavr%C5%A1noga-i-diplomskoga-rada-KONA%C4%8CNA-VERZIJA.pdf) | odjeljak 4.5. Tehnicke upute za oblikovanje teksta |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Sadrzaj kao zivo TOC polje | `toc-field-fixer` | Word sam azurira sadrzaj<br><sub>Dokument ima naslov Sadrzaj, a jos nema zivo TOC polje. Nedestruktivno: rucne stavke se ne brisu.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### kbfdj

#### Katolički bogoslovni fakultet u Djakovu, diplomski rad

`kbfdj-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Times New Roman | [Pravilnik o diplomskim ispitima (procisceni tekst, tezarij i obrasci), 2025 (Katolicki bogoslovni fakultet u Djakovu)](https://www.djkbf.unios.hr/wp-content/uploads/2025/07/Pravilnik_o_diplomskim_ispitima__tezarij_i_obrasci.pdf) | Prilog 2 "Upute za izradu diplomskoga rada", str. 18 |
| Velicina slova | `font-fixer` | 12 pt | [Pravilnik o diplomskim ispitima (procisceni tekst, tezarij i obrasci), 2025 (Katolicki bogoslovni fakultet u Djakovu)](https://www.djkbf.unios.hr/wp-content/uploads/2025/07/Pravilnik_o_diplomskim_ispitima__tezarij_i_obrasci.pdf) | Prilog 2 "Upute za izradu diplomskoga rada", str. 18 |
| Prored | `line-spacing-fixer` | prored 1,5 | [Pravilnik o diplomskim ispitima (procisceni tekst, tezarij i obrasci), 2025 (Katolicki bogoslovni fakultet u Djakovu)](https://www.djkbf.unios.hr/wp-content/uploads/2025/07/Pravilnik_o_diplomskim_ispitima__tezarij_i_obrasci.pdf) | Prilog 2 "Upute za izradu diplomskoga rada", str. 18 |
| Margine (lijeva 3,5cm) | `margins-fixer` | 2,5 / 2,5 / 2,5 / 3,5 cm (gore/desno/dolje/lijevo) | [Pravilnik o diplomskim ispitima (procisceni tekst, tezarij i obrasci), 2025 (Katolicki bogoslovni fakultet u Djakovu)](https://www.djkbf.unios.hr/wp-content/uploads/2025/07/Pravilnik_o_diplomskim_ispitima__tezarij_i_obrasci.pdf) | Prilog 2 "Upute za izradu diplomskoga rada", str. 18 |
| Format papira A4 | `paper-size-fixer` | 21 x 29,7 cm | [Pravilnik o diplomskim ispitima (procisceni tekst, tezarij i obrasci), 2025 (Katolicki bogoslovni fakultet u Djakovu)](https://www.djkbf.unios.hr/wp-content/uploads/2025/07/Pravilnik_o_diplomskim_ispitima__tezarij_i_obrasci.pdf) | Prilog 2 "Upute za izradu diplomskoga rada", str. 18 |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### kbfst

#### Split - Katolički bogoslovni fakultet, diplomski rad

`kbfst-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Vrsta slova | `font-fixer` | Times New Roman | [Pojedinosti o tehničkim postavkama diplomskoga rada (KBF Split)](https://www.kbf.unist.hr/images/dok/pravilnici/Izgled_diplomskog_rada_napomene.pdf) | Pojedinosti, tehnicke postavke |
| Velicina slova (12 ili 13) | `font-fixer` | 12 pt | [Pojedinosti o tehničkim postavkama diplomskoga rada (KBF Split)](https://www.kbf.unist.hr/images/dok/pravilnici/Izgled_diplomskog_rada_napomene.pdf) | Pojedinosti, tehnicke postavke |
| Prored | `line-spacing-fixer` | prored 1,5 | [Pojedinosti o tehničkim postavkama diplomskoga rada (KBF Split)](https://www.kbf.unist.hr/images/dok/pravilnici/Izgled_diplomskog_rada_napomene.pdf) | Pojedinosti, tehnicke postavke |
| Font i veličina fusnota | `footnote-typography-fixer` | Times New Roman, 10 pt |  |  |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### kemos

#### Odjel za kemiju Osijek, diplomski rad

`kemos-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Upute za pisanje zavrsnog/diplomskog rada (Odjel za kemiju Osijek, 2024)](https://www.kemija.unios.hr/wp-content/uploads/2025/01/PRILOG-4-UPUTE-ZA-PISANJE-ZAVRSNOG-DIPLOMSKOG-RADA.pdf) | Upute, oblikovanje teksta |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za pisanje zavrsnog/diplomskog rada (Odjel za kemiju Osijek, 2024)](https://www.kemija.unios.hr/wp-content/uploads/2025/01/PRILOG-4-UPUTE-ZA-PISANJE-ZAVRSNOG-DIPLOMSKOG-RADA.pdf) | Upute, oblikovanje teksta |
| Vrsta slova | `font-fixer` | Times New Roman | [Upute za pisanje zavrsnog/diplomskog rada (Odjel za kemiju Osijek, 2024)](https://www.kemija.unios.hr/wp-content/uploads/2025/01/PRILOG-4-UPUTE-ZA-PISANJE-ZAVRSNOG-DIPLOMSKOG-RADA.pdf) | Upute, oblikovanje teksta |
| Velicina slova | `font-fixer` | 12 pt | [Upute za pisanje zavrsnog/diplomskog rada (Odjel za kemiju Osijek, 2024)](https://www.kemija.unios.hr/wp-content/uploads/2025/01/PRILOG-4-UPUTE-ZA-PISANJE-ZAVRSNOG-DIPLOMSKOG-RADA.pdf) | Upute, oblikovanje teksta |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Upute za pisanje zavrsnog/diplomskog rada (Odjel za kemiju Osijek, 2024)](https://www.kemija.unios.hr/wp-content/uploads/2025/01/PRILOG-4-UPUTE-ZA-PISANJE-ZAVRSNOG-DIPLOMSKOG-RADA.pdf) | Upute, oblikovanje teksta |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Odjel za kemiju Osijek, završni rad

`kemos-zavrsni` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Upute za pisanje zavrsnog/diplomskog rada (Odjel za kemiju Osijek, 2024)](https://www.kemija.unios.hr/wp-content/uploads/2025/01/PRILOG-4-UPUTE-ZA-PISANJE-ZAVRSNOG-DIPLOMSKOG-RADA.pdf) | Upute, oblikovanje teksta |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za pisanje zavrsnog/diplomskog rada (Odjel za kemiju Osijek, 2024)](https://www.kemija.unios.hr/wp-content/uploads/2025/01/PRILOG-4-UPUTE-ZA-PISANJE-ZAVRSNOG-DIPLOMSKOG-RADA.pdf) | Upute, oblikovanje teksta |
| Vrsta slova | `font-fixer` | Times New Roman | [Upute za pisanje zavrsnog/diplomskog rada (Odjel za kemiju Osijek, 2024)](https://www.kemija.unios.hr/wp-content/uploads/2025/01/PRILOG-4-UPUTE-ZA-PISANJE-ZAVRSNOG-DIPLOMSKOG-RADA.pdf) | Upute, oblikovanje teksta |
| Velicina slova | `font-fixer` | 12 pt | [Upute za pisanje zavrsnog/diplomskog rada (Odjel za kemiju Osijek, 2024)](https://www.kemija.unios.hr/wp-content/uploads/2025/01/PRILOG-4-UPUTE-ZA-PISANJE-ZAVRSNOG-DIPLOMSKOG-RADA.pdf) | Upute, oblikovanje teksta |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Upute za pisanje zavrsnog/diplomskog rada (Odjel za kemiju Osijek, 2024)](https://www.kemija.unios.hr/wp-content/uploads/2025/01/PRILOG-4-UPUTE-ZA-PISANJE-ZAVRSNOG-DIPLOMSKOG-RADA.pdf) | Upute, oblikovanje teksta |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### kif

#### Kineziološki fakultet, diplomski rad

`kif-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Times New Roman | [Prilog 1. Upute za oblikovanje diplomskog rada (Kinezioloski fakultet Sveucilista u Zagrebu)](https://www.kif.unizg.hr/_download/repository/Upute_-_diplomski_rad%5B1%5D.pdf) | Prilog 1. Upute za oblikovanje diplomskog rada, Openito - oblikovanje |
| Velicina slova | `font-fixer` | 12 pt | [Upute za izradu diplomskog/specijalistickog diplomskog rada (Kinezioloski fakultet Sveucilista u Zagrebu, 2023)](https://www.kif.unizg.hr/_download/repository/Kinezioloski-upute-diplomskizavrsni-rad.pdf) | str. 14, Upute za izradu i opremanje rada, openito - oblikovanje |
| Prored | `line-spacing-fixer` | prored 1,5 | [Prilog 1. Upute za oblikovanje diplomskog rada (Kinezioloski fakultet Sveucilista u Zagrebu)](https://www.kif.unizg.hr/_download/repository/Upute_-_diplomski_rad%5B1%5D.pdf) | Prilog 1. Upute za oblikovanje diplomskog rada, Openito - oblikovanje |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Prilog 1. Upute za oblikovanje diplomskog rada (Kinezioloski fakultet Sveucilista u Zagrebu)](https://www.kif.unizg.hr/_download/repository/Upute_-_diplomski_rad%5B1%5D.pdf) | Prilog 1. Upute za oblikovanje diplomskog rada, Openito - oblikovanje |
| Obostrano poravnanje | `alignment-fixer` | obostrano | [Prilog 1. Upute za oblikovanje diplomskog rada (Kinezioloski fakultet Sveucilista u Zagrebu)](https://www.kif.unizg.hr/_download/repository/Upute_-_diplomski_rad%5B1%5D.pdf) | Prilog 1. Upute za oblikovanje diplomskog rada, Openito - oblikovanje |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Sadrzaj kao zivo TOC polje | `toc-field-fixer` | Word sam azurira sadrzaj<br><sub>Dokument ima naslov Sadrzaj, a jos nema zivo TOC polje. Nedestruktivno: rucne stavke se ne brisu.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Kineziološki fakultet, doktorski rad / disertacija

`kif-doktorski` · status: partial · vrste rada: doctoral

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Velicina slova | `font-fixer` | 12 pt | [Upute za oblikovanje doktorskoga rada (obrazac DR.SC.-08, Sveuciliste u Zagrebu)](https://www.kif.unizg.hr/_download/repository/DR.SC.-08_formalno_oblikovanje_rada%5B3%5D.doc) | odjeljak Postavke stranice |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za oblikovanje doktorskoga rada (obrazac DR.SC.-08, Sveuciliste u Zagrebu)](https://www.kif.unizg.hr/_download/repository/DR.SC.-08_formalno_oblikovanje_rada%5B3%5D.doc) | odjeljak Postavke stranice |
| Margine (tijelo rada) | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Upute za oblikovanje doktorskoga rada (obrazac DR.SC.-08, Sveuciliste u Zagrebu)](https://www.kif.unizg.hr/_download/repository/DR.SC.-08_formalno_oblikovanje_rada%5B3%5D.doc) | odjeljak Postavke stranice |
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Upute za oblikovanje doktorskoga rada (obrazac DR.SC.-08, Sveuciliste u Zagrebu)](https://www.kif.unizg.hr/_download/repository/DR.SC.-08_formalno_oblikovanje_rada%5B3%5D.doc) | odjeljak Upute za oblikovanje doktorskoga rada |
| Font (samo primjer, fiksna je potpora hrvatskih znakova) | `font-fixer` | Times New Roman | [Upute za oblikovanje doktorskoga rada (obrazac DR.SC.-08, Sveuciliste u Zagrebu)](https://www.kif.unizg.hr/_download/repository/DR.SC.-08_formalno_oblikovanje_rada%5B3%5D.doc) | odjeljak Postavke stranice |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Sadrzaj kao zivo TOC polje | `toc-field-fixer` | Word sam azurira sadrzaj<br><sub>Dokument ima naslov Sadrzaj, a jos nema zivo TOC polje. Nedestruktivno: rucne stavke se ne brisu.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Kineziološki fakultet, specijalistički diplomski rad

`kif-specijalisticki` · status: partial · vrste rada: specialist

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Times New Roman | [Upute za izradu diplomskog/specijalistickog diplomskog rada (Kinezioloski fakultet Sveucilista u Zagrebu, 2023)](https://www.kif.unizg.hr/_download/repository/Kinezioloski-upute-diplomskizavrsni-rad.pdf) | str. 8, opce - oblikovanje |
| Velicina slova | `font-fixer` | 12 pt | [Upute za izradu diplomskog/specijalistickog diplomskog rada (Kinezioloski fakultet Sveucilista u Zagrebu, 2023)](https://www.kif.unizg.hr/_download/repository/Kinezioloski-upute-diplomskizavrsni-rad.pdf) | str. 8, opce - oblikovanje |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za izradu diplomskog/specijalistickog diplomskog rada (Kinezioloski fakultet Sveucilista u Zagrebu, 2023)](https://www.kif.unizg.hr/_download/repository/Kinezioloski-upute-diplomskizavrsni-rad.pdf) | str. 8, opce - oblikovanje |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Upute za izradu diplomskog/specijalistickog diplomskog rada (Kinezioloski fakultet Sveucilista u Zagrebu, 2023)](https://www.kif.unizg.hr/_download/repository/Kinezioloski-upute-diplomskizavrsni-rad.pdf) | str. 8, opce - oblikovanje |
| Obostrano poravnanje | `alignment-fixer` | obostrano | [Upute za izradu diplomskog/specijalistickog diplomskog rada (Kinezioloski fakultet Sveucilista u Zagrebu, 2023)](https://www.kif.unizg.hr/_download/repository/Kinezioloski-upute-diplomskizavrsni-rad.pdf) | str. 8, opce - oblikovanje |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### kifos

#### Kinezioloski fakultet Osijek, diplomski rad

`kifos-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Vrsta slova | `font-fixer` | Times New Roman | [Upute za izradu i oblikovanje završnog i diplomskog rada](https://www.kifos.hr/wp-content/uploads/2024/01/Upute-za-pisanje-zavrsnog-i-diplomskog-rada_2024.pdf) | PDF str. 2 |
| Velicina slova | `font-fixer` | 12 pt | [Upute za izradu i oblikovanje završnog i diplomskog rada](https://www.kifos.hr/wp-content/uploads/2024/01/Upute-za-pisanje-zavrsnog-i-diplomskog-rada_2024.pdf) | PDF str. 2 |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za izradu i oblikovanje završnog i diplomskog rada](https://www.kifos.hr/wp-content/uploads/2024/01/Upute-za-pisanje-zavrsnog-i-diplomskog-rada_2024.pdf) | PDF str. 2 |
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Upute za izradu i oblikovanje završnog i diplomskog rada](https://www.kifos.hr/wp-content/uploads/2024/01/Upute-za-pisanje-zavrsnog-i-diplomskog-rada_2024.pdf) | PDF str. 2 |
| Margine | `margins-fixer` | 2,54 / 2,54 / 2,54 / 2,54 cm (gore/desno/dolje/lijevo) | [Upute za izradu i oblikovanje završnog i diplomskog rada](https://www.kifos.hr/wp-content/uploads/2024/01/Upute-za-pisanje-zavrsnog-i-diplomskog-rada_2024.pdf) | PDF str. 2 |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Kinezioloski fakultet Osijek, zavrsni rad

`kifos-zavrsni` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Vrsta slova | `font-fixer` | Times New Roman | [Upute za izradu i oblikovanje završnog i diplomskog rada](https://www.kifos.hr/wp-content/uploads/2024/01/Upute-za-pisanje-zavrsnog-i-diplomskog-rada_2024.pdf) | PDF str. 2 |
| Velicina slova | `font-fixer` | 12 pt | [Upute za izradu i oblikovanje završnog i diplomskog rada](https://www.kifos.hr/wp-content/uploads/2024/01/Upute-za-pisanje-zavrsnog-i-diplomskog-rada_2024.pdf) | PDF str. 2 |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za izradu i oblikovanje završnog i diplomskog rada](https://www.kifos.hr/wp-content/uploads/2024/01/Upute-za-pisanje-zavrsnog-i-diplomskog-rada_2024.pdf) | PDF str. 2 |
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Upute za izradu i oblikovanje završnog i diplomskog rada](https://www.kifos.hr/wp-content/uploads/2024/01/Upute-za-pisanje-zavrsnog-i-diplomskog-rada_2024.pdf) | PDF str. 2 |
| Margine | `margins-fixer` | 2,54 / 2,54 / 2,54 / 2,54 cm (gore/desno/dolje/lijevo) | [Upute za izradu i oblikovanje završnog i diplomskog rada](https://www.kifos.hr/wp-content/uploads/2024/01/Upute-za-pisanje-zavrsnog-i-diplomskog-rada_2024.pdf) | PDF str. 2 |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### kifst

#### Split - Kineziološki fakultet, diplomski rad

`kifst-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Vrsta slova | `font-fixer` | Times New Roman | [Upute za izradu diplomskog rada - strucna tema (KIFST, 2022)](https://web.kifst.unist.hr/wp-content/uploads/2022/02/UPUTE-ZA-IZRADU-DIPLOMSKOG-RADA-STRUCNA-TEMA.pdf) | Upute, oblikovanje teksta |
| Velicina slova | `font-fixer` | 12 pt | [Upute za izradu diplomskog rada - strucna tema (KIFST, 2022)](https://web.kifst.unist.hr/wp-content/uploads/2022/02/UPUTE-ZA-IZRADU-DIPLOMSKOG-RADA-STRUCNA-TEMA.pdf) | Upute, oblikovanje teksta |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za izradu diplomskog rada - strucna tema (KIFST, 2022)](https://web.kifst.unist.hr/wp-content/uploads/2022/02/UPUTE-ZA-IZRADU-DIPLOMSKOG-RADA-STRUCNA-TEMA.pdf) | Upute, oblikovanje teksta |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 3,5 cm (gore/desno/dolje/lijevo) | [Upute za izradu diplomskog rada - strucna tema (KIFST, 2022)](https://web.kifst.unist.hr/wp-content/uploads/2022/02/UPUTE-ZA-IZRADU-DIPLOMSKOG-RADA-STRUCNA-TEMA.pdf) | Upute, oblikovanje teksta |
| Obostrano poravnanje | `alignment-fixer` | obostrano | [Upute za izradu diplomskog rada - strucna tema (KIFST, 2022)](https://web.kifst.unist.hr/wp-content/uploads/2022/02/UPUTE-ZA-IZRADU-DIPLOMSKOG-RADA-STRUCNA-TEMA.pdf) | Upute, oblikovanje teksta |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### ktfst

#### KTF Split, diplomski rad

`ktfst-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Prilog 4 - Izgled obveznih stranica diplomskog rada (KTF Split)](https://www.ktf.unist.hr/images/stories/repozitorij/Dekanat/Prilog_4_Izgled_obveznih_stranica_diplomskog_rada.docx) | Prilog (format-blok: od Zadatka rada do Priloga) |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 3,5 cm (gore/desno/dolje/lijevo) | [Prilog 4 - Izgled obveznih stranica diplomskog rada (KTF Split)](https://www.ktf.unist.hr/images/stories/repozitorij/Dekanat/Prilog_4_Izgled_obveznih_stranica_diplomskog_rada.docx) | Prilog (format-blok: od Zadatka rada do Priloga) |
| Vrsta slova (TNR ili Arial) | `font-fixer` | Times New Roman | [Prilog 4 - Izgled obveznih stranica diplomskog rada (KTF Split)](https://www.ktf.unist.hr/images/stories/repozitorij/Dekanat/Prilog_4_Izgled_obveznih_stranica_diplomskog_rada.docx) | Prilog (format-blok: od Zadatka rada do Priloga) |
| Velicina slova | `font-fixer` | 12 pt | [Prilog 4 - Izgled obveznih stranica diplomskog rada (KTF Split)](https://www.ktf.unist.hr/images/stories/repozitorij/Dekanat/Prilog_4_Izgled_obveznih_stranica_diplomskog_rada.docx) | Prilog (format-blok: od Zadatka rada do Priloga) |
| Prored | `line-spacing-fixer` | prored 1,5 | [Prilog 4 - Izgled obveznih stranica diplomskog rada (KTF Split)](https://www.ktf.unist.hr/images/stories/repozitorij/Dekanat/Prilog_4_Izgled_obveznih_stranica_diplomskog_rada.docx) | Prilog (format-blok: od Zadatka rada do Priloga) |
| Obostrano poravnanje | `alignment-fixer` | obostrano | [Prilog 4 - Izgled obveznih stranica diplomskog rada (KTF Split)](https://www.ktf.unist.hr/images/stories/repozitorij/Dekanat/Prilog_4_Izgled_obveznih_stranica_diplomskog_rada.docx) | Prilog (format-blok: od Zadatka rada do Priloga) |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### KTF Split, završni rad

`ktfst-zavrsni` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Prilog 3 - Izgled obveznih stranica zavrsnog rada (KTF Split)](https://www.ktf.unist.hr/images/stories/repozitorij/Dekanat/Prilog_3_Izgled_obveznih_stranica_zavrsnog_rada.docx) | Prilog (format-blok: od Zadatka rada do Priloga) |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 3,5 cm (gore/desno/dolje/lijevo) | [Prilog 3 - Izgled obveznih stranica zavrsnog rada (KTF Split)](https://www.ktf.unist.hr/images/stories/repozitorij/Dekanat/Prilog_3_Izgled_obveznih_stranica_zavrsnog_rada.docx) | Prilog (format-blok: od Zadatka rada do Priloga) |
| Vrsta slova (TNR ili Arial) | `font-fixer` | Times New Roman | [Prilog 3 - Izgled obveznih stranica zavrsnog rada (KTF Split)](https://www.ktf.unist.hr/images/stories/repozitorij/Dekanat/Prilog_3_Izgled_obveznih_stranica_zavrsnog_rada.docx) | Prilog (format-blok: od Zadatka rada do Priloga) |
| Velicina slova | `font-fixer` | 12 pt | [Prilog 3 - Izgled obveznih stranica zavrsnog rada (KTF Split)](https://www.ktf.unist.hr/images/stories/repozitorij/Dekanat/Prilog_3_Izgled_obveznih_stranica_zavrsnog_rada.docx) | Prilog (format-blok: od Zadatka rada do Priloga) |
| Prored | `line-spacing-fixer` | prored 1,5 | [Prilog 3 - Izgled obveznih stranica zavrsnog rada (KTF Split)](https://www.ktf.unist.hr/images/stories/repozitorij/Dekanat/Prilog_3_Izgled_obveznih_stranica_zavrsnog_rada.docx) | Prilog (format-blok: od Zadatka rada do Priloga) |
| Obostrano poravnanje | `alignment-fixer` | obostrano | [Prilog 3 - Izgled obveznih stranica zavrsnog rada (KTF Split)](https://www.ktf.unist.hr/images/stories/repozitorij/Dekanat/Prilog_3_Izgled_obveznih_stranica_zavrsnog_rada.docx) | Prilog (format-blok: od Zadatka rada do Priloga) |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### libertas

#### Libertas, diplomski rad

`libertas-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Pravilnik o diplomskom radu (Libertas, srpanj 2024)](https://www.libertas.hr/wp-content/uploads/2025/01/Pravilnik-o-diplomskom-radu.pdf) | clanak o oblikovanju diplomskog rada |
| Vrsta slova | `font-fixer` | Times New Roman | [Pravilnik o diplomskom radu (Libertas, srpanj 2024)](https://www.libertas.hr/wp-content/uploads/2025/01/Pravilnik-o-diplomskom-radu.pdf) | clanak o oblikovanju diplomskog rada |
| Velicina slova | `font-fixer` | 12 pt | [Pravilnik o diplomskom radu (Libertas, srpanj 2024)](https://www.libertas.hr/wp-content/uploads/2025/01/Pravilnik-o-diplomskom-radu.pdf) | clanak o oblikovanju diplomskog rada |
| Prored | `line-spacing-fixer` | prored 1,5 | [Pravilnik o diplomskom radu (Libertas, srpanj 2024)](https://www.libertas.hr/wp-content/uploads/2025/01/Pravilnik-o-diplomskom-radu.pdf) | clanak o oblikovanju diplomskog rada |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Pravilnik o diplomskom radu (Libertas, srpanj 2024)](https://www.libertas.hr/wp-content/uploads/2025/01/Pravilnik-o-diplomskom-radu.pdf) | clanak o oblikovanju diplomskog rada |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Libertas, diplomski rad (engleski)

`libertas-diplomski-en` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Pravilnik o diplomskom radu (Libertas, srpanj 2024)](https://www.libertas.hr/wp-content/uploads/2025/01/Pravilnik-o-diplomskom-radu.pdf) | clanak o oblikovanju diplomskog rada |
| Vrsta slova | `font-fixer` | Times New Roman | [Pravilnik o diplomskom radu (Libertas, srpanj 2024)](https://www.libertas.hr/wp-content/uploads/2025/01/Pravilnik-o-diplomskom-radu.pdf) | clanak o oblikovanju diplomskog rada |
| Velicina slova | `font-fixer` | 12 pt | [Pravilnik o diplomskom radu (Libertas, srpanj 2024)](https://www.libertas.hr/wp-content/uploads/2025/01/Pravilnik-o-diplomskom-radu.pdf) | clanak o oblikovanju diplomskog rada |
| Prored | `line-spacing-fixer` | prored 1,5 | [Pravilnik o diplomskom radu (Libertas, srpanj 2024)](https://www.libertas.hr/wp-content/uploads/2025/01/Pravilnik-o-diplomskom-radu.pdf) | clanak o oblikovanju diplomskog rada |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Pravilnik o diplomskom radu (Libertas, srpanj 2024)](https://www.libertas.hr/wp-content/uploads/2025/01/Pravilnik-o-diplomskom-radu.pdf) | clanak o oblikovanju diplomskog rada |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Libertas, završni rad

`libertas-zavrsni` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Pravilnik o zavrsnom radu (Libertas, srpanj 2024)](https://www.libertas.hr/wp-content/uploads/2025/01/Pravilnik-o-zavrsnom-radu.pdf) | clanak o oblikovanju zavrsnog rada |
| Vrsta slova | `font-fixer` | Times New Roman | [Pravilnik o zavrsnom radu (Libertas, srpanj 2024)](https://www.libertas.hr/wp-content/uploads/2025/01/Pravilnik-o-zavrsnom-radu.pdf) | clanak o oblikovanju zavrsnog rada |
| Velicina slova | `font-fixer` | 12 pt | [Pravilnik o zavrsnom radu (Libertas, srpanj 2024)](https://www.libertas.hr/wp-content/uploads/2025/01/Pravilnik-o-zavrsnom-radu.pdf) | clanak o oblikovanju zavrsnog rada |
| Prored | `line-spacing-fixer` | prored 1,5 | [Pravilnik o zavrsnom radu (Libertas, srpanj 2024)](https://www.libertas.hr/wp-content/uploads/2025/01/Pravilnik-o-zavrsnom-radu.pdf) | clanak o oblikovanju zavrsnog rada |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Libertas, završni rad (engleski)

`libertas-zavrsni-en` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Pravilnik o zavrsnom radu (Libertas, srpanj 2024)](https://www.libertas.hr/wp-content/uploads/2025/01/Pravilnik-o-zavrsnom-radu.pdf) | clanak o oblikovanju zavrsnog rada |
| Vrsta slova | `font-fixer` | Times New Roman | [Pravilnik o zavrsnom radu (Libertas, srpanj 2024)](https://www.libertas.hr/wp-content/uploads/2025/01/Pravilnik-o-zavrsnom-radu.pdf) | clanak o oblikovanju zavrsnog rada |
| Velicina slova | `font-fixer` | 12 pt | [Pravilnik o zavrsnom radu (Libertas, srpanj 2024)](https://www.libertas.hr/wp-content/uploads/2025/01/Pravilnik-o-zavrsnom-radu.pdf) | clanak o oblikovanju zavrsnog rada |
| Prored | `line-spacing-fixer` | prored 1,5 | [Pravilnik o zavrsnom radu (Libertas, srpanj 2024)](https://www.libertas.hr/wp-content/uploads/2025/01/Pravilnik-o-zavrsnom-radu.pdf) | clanak o oblikovanju zavrsnog rada |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### logri

#### Fakultet za logopediju Rijeka, diplomski rad

`logri-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Vrsta slova | `font-fixer` | Arial | [Smjernice za pisanje i oblikovanje studentskih radova (Fakultet za logopediju Rijeka)](https://logri.uniri.hr/) | Smjernice za studentske radove, t.1 Format teksta |
| Velicina slova | `font-fixer` | 12 pt | [Smjernice za pisanje i oblikovanje studentskih radova (Fakultet za logopediju Rijeka)](https://logri.uniri.hr/) | Smjernice za studentske radove, t.1 Format teksta |
| Prored | `line-spacing-fixer` | prored 1,5 | [Smjernice za pisanje i oblikovanje studentskih radova (Fakultet za logopediju Rijeka)](https://logri.uniri.hr/) | Smjernice za studentske radove, t.1 Format teksta |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Smjernice za pisanje i oblikovanje studentskih radova (Fakultet za logopediju Rijeka)](https://logri.uniri.hr/) | Smjernice za studentske radove, t.1 Format teksta |
| Obostrano poravnanje | `alignment-fixer` | obostrano | [Smjernice za pisanje i oblikovanje studentskih radova (Fakultet za logopediju Rijeka)](https://logri.uniri.hr/) | Smjernice za studentske radove, t.1 Format teksta |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### mapu

#### Muzicka akademija u Puli, Glazbena pedagogija, diplomski rad

`mapu-glazbena-pedagogija-diplomski` · status: verified · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Pravilnik o izmjenama i dopunama Pravilnika o diplomskom radu i diplomskom koncertu na sveucilisnim diplomskim studijima i integriranome preddiplomskom i diplomskom studiju (23.07.2021.)](https://www.unipu.hr/_download/repository/2021-07-23-Pravilnik_o_izmjenama_i_dopunama_Pravilnika_o_dipl._radu_i_dipl._koncertu_na_sveucilisnim_dipl._studijima_i_integriranome_preddipl._i_dipl._studiju.pdf) | Članak 5. stavak 1. (izmjene 23.07.2021., točka II.), str. 1 PDF-a |
| Vrsta slova | `font-fixer` | Arial | [Pravilnik o izmjenama i dopunama Pravilnika o diplomskom radu i diplomskom koncertu na sveucilisnim diplomskim studijima i integriranome preddiplomskom i diplomskom studiju (23.07.2021.)](https://www.unipu.hr/_download/repository/2021-07-23-Pravilnik_o_izmjenama_i_dopunama_Pravilnika_o_dipl._radu_i_dipl._koncertu_na_sveucilisnim_dipl._studijima_i_integriranome_preddipl._i_dipl._studiju.pdf) | Članak 5. stavak 1. (izmjene 23.07.2021., točka II.), str. 1 PDF-a |
| Veličina slova | `font-fixer` | 12 pt | [Pravilnik o izmjenama i dopunama Pravilnika o diplomskom radu i diplomskom koncertu na sveucilisnim diplomskim studijima i integriranome preddiplomskom i diplomskom studiju (23.07.2021.)](https://www.unipu.hr/_download/repository/2021-07-23-Pravilnik_o_izmjenama_i_dopunama_Pravilnika_o_dipl._radu_i_dipl._koncertu_na_sveucilisnim_dipl._studijima_i_integriranome_preddipl._i_dipl._studiju.pdf) | Članak 5. stavak 1. (izmjene 23.07.2021., točka II.), str. 1 PDF-a |
| Prored | `line-spacing-fixer` | prored 1,5 | [Pravilnik o izmjenama i dopunama Pravilnika o diplomskom radu i diplomskom koncertu na sveucilisnim diplomskim studijima i integriranome preddiplomskom i diplomskom studiju (23.07.2021.)](https://www.unipu.hr/_download/repository/2021-07-23-Pravilnik_o_izmjenama_i_dopunama_Pravilnika_o_dipl._radu_i_dipl._koncertu_na_sveucilisnim_dipl._studijima_i_integriranome_preddipl._i_dipl._studiju.pdf) | Članak 5. stavak 1. (izmjene 23.07.2021., točka II.), str. 1 PDF-a |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Pravilnik o izmjenama i dopunama Pravilnika o diplomskom radu i diplomskom koncertu na sveucilisnim diplomskim studijima i integriranome preddiplomskom i diplomskom studiju (23.07.2021.)](https://www.unipu.hr/_download/repository/2021-07-23-Pravilnik_o_izmjenama_i_dopunama_Pravilnika_o_dipl._radu_i_dipl._koncertu_na_sveucilisnim_dipl._studijima_i_integriranome_preddipl._i_dipl._studiju.pdf) | Članak 5. stavak 1. (izmjene 23.07.2021., točka II.), str. 1 PDF-a |
| Font i veličina fusnota | `footnote-typography-fixer` | 10 pt |  |  |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Sadrzaj kao zivo TOC polje | `toc-field-fixer` | Word sam azurira sadrzaj<br><sub>Dokument ima naslov Sadrzaj, a jos nema zivo TOC polje. Nedestruktivno: rucne stavke se ne brisu.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Muzicka akademija u Puli, Glazbena pedagogija, zavrsni rad

`mapu-glazbena-pedagogija-zavrsni` · status: verified · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Pravilnik o izmjenama i dopunama Pravilnika o zavrsnom radu i zavrsnom koncertu na preddiplomskim sveucilisnim i strucnim studijima (23.07.2021.)](https://www.unipu.hr/_download/repository/2021-07-23-Pravilnik_o_izmjenama_i_dopunama__Pravilnika_o_zavrsnom_radu_i_zavrsnom_koncertu_na_preddiplomskim_sveucilisnim_i_strucnim_studijima.pdf) | Članak 5. stavak 1. (izmjene 23.07.2021., točka II.), str. 1 PDF-a |
| Vrsta slova | `font-fixer` | Arial | [Pravilnik o izmjenama i dopunama Pravilnika o zavrsnom radu i zavrsnom koncertu na preddiplomskim sveucilisnim i strucnim studijima (23.07.2021.)](https://www.unipu.hr/_download/repository/2021-07-23-Pravilnik_o_izmjenama_i_dopunama__Pravilnika_o_zavrsnom_radu_i_zavrsnom_koncertu_na_preddiplomskim_sveucilisnim_i_strucnim_studijima.pdf) | Članak 5. stavak 1. (izmjene 23.07.2021., točka II.), str. 1 PDF-a |
| Veličina slova | `font-fixer` | 12 pt | [Pravilnik o izmjenama i dopunama Pravilnika o zavrsnom radu i zavrsnom koncertu na preddiplomskim sveucilisnim i strucnim studijima (23.07.2021.)](https://www.unipu.hr/_download/repository/2021-07-23-Pravilnik_o_izmjenama_i_dopunama__Pravilnika_o_zavrsnom_radu_i_zavrsnom_koncertu_na_preddiplomskim_sveucilisnim_i_strucnim_studijima.pdf) | Članak 5. stavak 1. (izmjene 23.07.2021., točka II.), str. 1 PDF-a |
| Prored | `line-spacing-fixer` | prored 1,5 | [Pravilnik o izmjenama i dopunama Pravilnika o zavrsnom radu i zavrsnom koncertu na preddiplomskim sveucilisnim i strucnim studijima (23.07.2021.)](https://www.unipu.hr/_download/repository/2021-07-23-Pravilnik_o_izmjenama_i_dopunama__Pravilnika_o_zavrsnom_radu_i_zavrsnom_koncertu_na_preddiplomskim_sveucilisnim_i_strucnim_studijima.pdf) | Članak 5. stavak 1. (izmjene 23.07.2021., točka II.), str. 1 PDF-a |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Pravilnik o izmjenama i dopunama Pravilnika o zavrsnom radu i zavrsnom koncertu na preddiplomskim sveucilisnim i strucnim studijima (23.07.2021.)](https://www.unipu.hr/_download/repository/2021-07-23-Pravilnik_o_izmjenama_i_dopunama__Pravilnika_o_zavrsnom_radu_i_zavrsnom_koncertu_na_preddiplomskim_sveucilisnim_i_strucnim_studijima.pdf) | Članak 5. stavak 1. (izmjene 23.07.2021., točka II.), str. 1 PDF-a |
| Font i veličina fusnota | `footnote-typography-fixer` | 10 pt |  |  |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Sadrzaj kao zivo TOC polje | `toc-field-fixer` | Word sam azurira sadrzaj<br><sub>Dokument ima naslov Sadrzaj, a jos nema zivo TOC polje. Nedestruktivno: rucne stavke se ne brisu.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### matematika

#### Fakultet za matematiku u Rijeci, diplomski rad

`math-uniri-diplomski` · status: verified · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Pravilnik o diplomskom radu na sveucilisnim diplomskim studijima Fakulteta za matematiku (20.12.2023.)](https://math.uniri.hr/wp-content/uploads/2023/12/Pravilnik-o-diplomskom-radu-na-sveucilisnim-diplomskim-studijima-Fakulteta-za-matematiku.pdf) | Članak 8. stavak 1. |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Sadrzaj kao zivo TOC polje | `toc-field-fixer` | Word sam azurira sadrzaj<br><sub>Dokument ima naslov Sadrzaj, a jos nema zivo TOC polje. Nedestruktivno: rucne stavke se ne brisu.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Fakultet za matematiku u Rijeci, diplomski rad (engleski)

`math-uniri-diplomski-en` · status: verified · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Pravilnik o diplomskom radu na sveucilisnim diplomskim studijima Fakulteta za matematiku (20.12.2023.)](https://math.uniri.hr/wp-content/uploads/2023/12/Pravilnik-o-diplomskom-radu-na-sveucilisnim-diplomskim-studijima-Fakulteta-za-matematiku.pdf) | Članak 8. stavak 1. |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Sadrzaj kao zivo TOC polje | `toc-field-fixer` | Word sam azurira sadrzaj<br><sub>Dokument ima naslov Sadrzaj, a jos nema zivo TOC polje. Nedestruktivno: rucne stavke se ne brisu.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Fakultet za matematiku u Rijeci, zavrsni rad

`math-uniri-zavrsni` · status: verified · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Pravilnik o zavrsnom radu na sveucilisnim prijediplomskim studijima Fakulteta za matematiku (20.12.2023.)](https://math.uniri.hr/wp-content/uploads/2023/12/Pravilnik-o-zavrsnom-radu-na-sveucilisnim-prijediplomskim-studijima-Fakulteta-za-matematiku.pdf) | Članak 8. stavak 1. |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Sadrzaj kao zivo TOC polje | `toc-field-fixer` | Word sam azurira sadrzaj<br><sub>Dokument ima naslov Sadrzaj, a jos nema zivo TOC polje. Nedestruktivno: rucne stavke se ne brisu.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### mathos

#### FPMI Osijek, diplomski rad

`mathos-diplomski` · status: verified · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Velicina slova | `font-fixer` | 12 pt | [Predlozak diplomskog rada (LaTeX, Prilog 1 Pravilnika o diplomskim radovima, Odjel za matematiku Osijek, ozujak 2026)](https://www.mathos.unios.hr/wp-content/uploads/2026/03/Predlozak_diplomski_rad.rar) | mathos.cls (Prilog 1) |
| Margine | `margins-fixer` | 3 / 3 / 3 / 3 cm (gore/desno/dolje/lijevo) | [Predlozak diplomskog rada (LaTeX, Prilog 1 Pravilnika o diplomskim radovima, Odjel za matematiku Osijek, ozujak 2026)](https://www.mathos.unios.hr/wp-content/uploads/2026/03/Predlozak_diplomski_rad.rar) | mathos.cls (Prilog 1) |
| Format papira A4 | `paper-size-fixer` | 21 x 29,7 cm | [Predlozak diplomskog rada (LaTeX, Prilog 1 Pravilnika o diplomskim radovima, Odjel za matematiku Osijek, ozujak 2026)](https://www.mathos.unios.hr/wp-content/uploads/2026/03/Predlozak_diplomski_rad.rar) | mathos.cls (Prilog 1) |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Sadrzaj kao zivo TOC polje | `toc-field-fixer` | Word sam azurira sadrzaj<br><sub>Dokument ima naslov Sadrzaj, a jos nema zivo TOC polje. Nedestruktivno: rucne stavke se ne brisu.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### FPMI Osijek, zavrsni rad

`mathos-zavrsni` · status: verified · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Velicina slova | `font-fixer` | 12 pt | [Predlozak zavrsnog rada (LaTeX, Prilog 1 Pravilnika o zavrsnim radovima, Odjel za matematiku Osijek, ozujak 2026)](https://www.mathos.unios.hr/wp-content/uploads/2026/03/Predlozak_zavrsni_rad.rar) | mathos.cls (Prilog 1) |
| Margine | `margins-fixer` | 3 / 3 / 3 / 3 cm (gore/desno/dolje/lijevo) | [Predlozak zavrsnog rada (LaTeX, Prilog 1 Pravilnika o zavrsnim radovima, Odjel za matematiku Osijek, ozujak 2026)](https://www.mathos.unios.hr/wp-content/uploads/2026/03/Predlozak_zavrsni_rad.rar) | mathos.cls (Prilog 1) |
| Format papira A4 | `paper-size-fixer` | 21 x 29,7 cm | [Predlozak zavrsnog rada (LaTeX, Prilog 1 Pravilnika o zavrsnim radovima, Odjel za matematiku Osijek, ozujak 2026)](https://www.mathos.unios.hr/wp-content/uploads/2026/03/Predlozak_zavrsni_rad.rar) | mathos.cls (Prilog 1) |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Sadrzaj kao zivo TOC polje | `toc-field-fixer` | Word sam azurira sadrzaj<br><sub>Dokument ima naslov Sadrzaj, a jos nema zivo TOC polje. Nedestruktivno: rucne stavke se ne brisu.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### medri

#### MEDRI Farmacija, diplomski rad

`medri-farmacija-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Naputak za prijavu, oblikovanje i izradu diplomskog rada - Farmacija (MEDRI, 2025)](https://medri.uniri.hr/wp-content/uploads/2025/07/NAPUTAK-za-prijavu-i-izradu-diplomskog-rada_24.6.25-002.docx) | Tehnicke upute o izradi diplomskog rada |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Naputak za prijavu, oblikovanje i izradu diplomskog rada - Farmacija (MEDRI, 2025)](https://medri.uniri.hr/wp-content/uploads/2025/07/NAPUTAK-za-prijavu-i-izradu-diplomskog-rada_24.6.25-002.docx) | Tehnicke upute o izradi diplomskog rada |
| Prored (dvostruki) | `line-spacing-fixer` | prored 2 | [Naputak za prijavu, oblikovanje i izradu diplomskog rada - Farmacija (MEDRI, 2025)](https://medri.uniri.hr/wp-content/uploads/2025/07/NAPUTAK-za-prijavu-i-izradu-diplomskog-rada_24.6.25-002.docx) | Tehnicke upute o izradi diplomskog rada |
| Velicina slova | `font-fixer` | 12 pt | [Naputak za prijavu, oblikovanje i izradu diplomskog rada - Farmacija (MEDRI, 2025)](https://medri.uniri.hr/wp-content/uploads/2025/07/NAPUTAK-za-prijavu-i-izradu-diplomskog-rada_24.6.25-002.docx) | Tehnicke upute o izradi diplomskog rada |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Rijeka - Medicina (integrirani), diplomski rad

`medri-medicina-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Naputak za prijavu, oblikovanje i opremu diplomskog rada i polaganje diplomskog ispita 2025./2026. (integrirani studij Medicina, MEDRI)](https://medri.uniri.hr/wp-content/uploads/2026/01/NAPUTAK_ZA_PRIJAVU_OBLIKOVANJE_I_OPREMU_DIPLOMSKOG_RADA_I_POLAGANJE_DIPLOMSKOG_ISPITA_2025_2026.pdf) | Naputak, oprema rada |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Naputak za prijavu, oblikovanje i opremu diplomskog rada i polaganje diplomskog ispita 2025./2026. (integrirani studij Medicina, MEDRI)](https://medri.uniri.hr/wp-content/uploads/2026/01/NAPUTAK_ZA_PRIJAVU_OBLIKOVANJE_I_OPREMU_DIPLOMSKOG_RADA_I_POLAGANJE_DIPLOMSKOG_ISPITA_2025_2026.pdf) | Naputak, oprema rada |
| Prored (dvostruki) | `line-spacing-fixer` | prored 2 | [Naputak za prijavu, oblikovanje i opremu diplomskog rada i polaganje diplomskog ispita 2025./2026. (integrirani studij Medicina, MEDRI)](https://medri.uniri.hr/wp-content/uploads/2026/01/NAPUTAK_ZA_PRIJAVU_OBLIKOVANJE_I_OPREMU_DIPLOMSKOG_RADA_I_POLAGANJE_DIPLOMSKOG_ISPITA_2025_2026.pdf) | Naputak, oprema rada |
| Velicina slova | `font-fixer` | 12 pt | [Naputak za prijavu, oblikovanje i opremu diplomskog rada i polaganje diplomskog ispita 2025./2026. (integrirani studij Medicina, MEDRI)](https://medri.uniri.hr/wp-content/uploads/2026/01/NAPUTAK_ZA_PRIJAVU_OBLIKOVANJE_I_OPREMU_DIPLOMSKOG_RADA_I_POLAGANJE_DIPLOMSKOG_ISPITA_2025_2026.pdf) | Naputak, oprema rada |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### mef

#### Medicinski fakultet, diplomski rad

`mef-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Times New Roman | [Pravilnik o izradi diplomskog rada s prilogom Upute za pisanje i tehnicko opremanje diplomskog rada (Medicinski fakultet Sveucilista u Zagrebu)](https://mef.unizg.hr/app/uploads/2023/07/Pravilnik-o-izradi-diplomskog-rada.pdf) | Prilog: Upute za pisanje i tehnicko opremanje diplomskog rada, odjeljak Oblik neuvezanog primjerka rada |
| Velicina slova | `font-fixer` | 11 pt | [Pravilnik o izradi diplomskog rada s prilogom Upute za pisanje i tehnicko opremanje diplomskog rada (Medicinski fakultet Sveucilista u Zagrebu)](https://mef.unizg.hr/app/uploads/2023/07/Pravilnik-o-izradi-diplomskog-rada.pdf) | Prilog: Upute za pisanje i tehnicko opremanje diplomskog rada, odjeljak Oblik neuvezanog primjerka rada |
| Prored | `line-spacing-fixer` | prored 1,5 | [Pravilnik o izradi diplomskog rada s prilogom Upute za pisanje i tehnicko opremanje diplomskog rada (Medicinski fakultet Sveucilista u Zagrebu)](https://mef.unizg.hr/app/uploads/2023/07/Pravilnik-o-izradi-diplomskog-rada.pdf) | Prilog: Upute za pisanje i tehnicko opremanje diplomskog rada, odjeljak Oblik neuvezanog primjerka rada |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Pravilnik o izradi diplomskog rada s prilogom Upute za pisanje i tehnicko opremanje diplomskog rada (Medicinski fakultet Sveucilista u Zagrebu)](https://mef.unizg.hr/app/uploads/2023/07/Pravilnik-o-izradi-diplomskog-rada.pdf) | Prilog: Upute za pisanje i tehnicko opremanje diplomskog rada, odjeljak Oblik uvezanog rada |
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Pravilnik o izradi diplomskog rada s prilogom Upute za pisanje i tehnicko opremanje diplomskog rada (Medicinski fakultet Sveucilista u Zagrebu)](https://mef.unizg.hr/app/uploads/2023/07/Pravilnik-o-izradi-diplomskog-rada.pdf) | Prilog: Upute za pisanje i tehnicko opremanje diplomskog rada, odjeljak Oblik neuvezanog primjerka rada |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Sadrzaj kao zivo TOC polje | `toc-field-fixer` | Word sam azurira sadrzaj<br><sub>Dokument ima naslov Sadrzaj, a jos nema zivo TOC polje. Nedestruktivno: rucne stavke se ne brisu.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Medicinski fakultet, doktorski rad / disertacija

`mef-doktorski` · status: partial · vrste rada: doctoral

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Naputci za tehnicku obradu doktorskog rada (Medicinski fakultet Sveucilista u Zagrebu)](https://mef.unizg.hr/app/uploads/2022/06/NAPUTCI-ZA-TEHNICKU-OBRADU-DOKTORSKOG-RADA-3-6-2022-korekcije.docx) | tocka 1) Format radova |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Numeriranje stranica od Uvoda | `page-numbering-fixer / section-insert-fixer` | prednji listovi rimski, glavni tekst arapski od 1, broj right<br><sub>Uvod je prepoznat. Kad prijelom sekcije vec pada tocno na Uvod, postavlja se numeriranje nad postojecim sekcijama; kad prijeloma nema (jednosekcijski rad), umece se prijelom, uz izricitu potvrdu mjesta.</sub> |  |  |
| Sadrzaj kao zivo TOC polje | `toc-field-fixer` | Word sam azurira sadrzaj<br><sub>Dokument ima naslov Sadrzaj, a jos nema zivo TOC polje. Nedestruktivno: rucne stavke se ne brisu.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### mefos

#### MEFOS, diplomski rad

`mefos-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Upute za izradu i oblikovanje zavrsnog i diplomskog rada (MEFOS, 2025)](https://www.mefos.unios.hr/images/studenti/zavrsetak-studija/upute-ozzid-2025-nove_.pdf) | Upute, izgled stranice |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Upute za izradu i oblikovanje zavrsnog i diplomskog rada (MEFOS, 2025)](https://www.mefos.unios.hr/images/studenti/zavrsetak-studija/upute-ozzid-2025-nove_.pdf) | Upute, izgled stranice |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za izradu i oblikovanje zavrsnog i diplomskog rada (MEFOS, 2025)](https://www.mefos.unios.hr/images/studenti/zavrsetak-studija/upute-ozzid-2025-nove_.pdf) | Upute, izgled stranice |
| Vrsta slova | `font-fixer` | Times New Roman | [Upute za izradu i oblikovanje zavrsnog i diplomskog rada (MEFOS, 2025)](https://www.mefos.unios.hr/images/studenti/zavrsetak-studija/upute-ozzid-2025-nove_.pdf) | Upute, vrsta pisma |
| Velicina slova | `font-fixer` | 12 pt | [Upute za izradu i oblikovanje zavrsnog i diplomskog rada (MEFOS, 2025)](https://www.mefos.unios.hr/images/studenti/zavrsetak-studija/upute-ozzid-2025-nove_.pdf) | Upute, vrsta pisma |
| Obostrano poravnanje | `alignment-fixer` | obostrano | [Upute za izradu i oblikovanje zavrsnog i diplomskog rada (MEFOS, 2025)](https://www.mefos.unios.hr/images/studenti/zavrsetak-studija/upute-ozzid-2025-nove_.pdf) | Upute, vrsta pisma |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### MEFOS, završni rad

`mefos-zavrsni` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Upute za izradu i oblikovanje zavrsnog i diplomskog rada (MEFOS, 2025)](https://www.mefos.unios.hr/images/studenti/zavrsetak-studija/upute-ozzid-2025-nove_.pdf) | Upute, izgled stranice |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Upute za izradu i oblikovanje zavrsnog i diplomskog rada (MEFOS, 2025)](https://www.mefos.unios.hr/images/studenti/zavrsetak-studija/upute-ozzid-2025-nove_.pdf) | Upute, izgled stranice |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za izradu i oblikovanje zavrsnog i diplomskog rada (MEFOS, 2025)](https://www.mefos.unios.hr/images/studenti/zavrsetak-studija/upute-ozzid-2025-nove_.pdf) | Upute, izgled stranice |
| Vrsta slova | `font-fixer` | Times New Roman | [Upute za izradu i oblikovanje zavrsnog i diplomskog rada (MEFOS, 2025)](https://www.mefos.unios.hr/images/studenti/zavrsetak-studija/upute-ozzid-2025-nove_.pdf) | Upute, vrsta pisma |
| Velicina slova | `font-fixer` | 12 pt | [Upute za izradu i oblikovanje zavrsnog i diplomskog rada (MEFOS, 2025)](https://www.mefos.unios.hr/images/studenti/zavrsetak-studija/upute-ozzid-2025-nove_.pdf) | Upute, vrsta pisma |
| Obostrano poravnanje | `alignment-fixer` | obostrano | [Upute za izradu i oblikovanje zavrsnog i diplomskog rada (MEFOS, 2025)](https://www.mefos.unios.hr/images/studenti/zavrsetak-studija/upute-ozzid-2025-nove_.pdf) | Upute, vrsta pisma |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### mefst

#### MEFST, diplomski rad

`mefst-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Uputa za oblikovanje diplomskoga rada (MEFST, 2021)](https://neuron.mefst.hr/docs/katedre/diplomski_ispit/Uputa%20za%20oblikovanje%20diplomskoga%20rada.pdf) | odj. 1 Page layout |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Uputa za oblikovanje diplomskoga rada (MEFST, 2021)](https://neuron.mefst.hr/docs/katedre/diplomski_ispit/Uputa%20za%20oblikovanje%20diplomskoga%20rada.pdf) | odj. 1 Page layout |
| Vrsta slova | `font-fixer` | Times New Roman | [Uputa za oblikovanje diplomskoga rada (MEFST, 2021)](https://neuron.mefst.hr/docs/katedre/diplomski_ispit/Uputa%20za%20oblikovanje%20diplomskoga%20rada.pdf) | odj. 2 Font |
| Velicina slova | `font-fixer` | 12 pt | [Uputa za oblikovanje diplomskoga rada (MEFST, 2021)](https://neuron.mefst.hr/docs/katedre/diplomski_ispit/Uputa%20za%20oblikovanje%20diplomskoga%20rada.pdf) | odj. 2 Font |
| Prored | `line-spacing-fixer` | prored 1,5 | [Uputa za oblikovanje diplomskoga rada (MEFST, 2021)](https://neuron.mefst.hr/docs/katedre/diplomski_ispit/Uputa%20za%20oblikovanje%20diplomskoga%20rada.pdf) | odj. 2 Font |
| Obostrano poravnanje | `alignment-fixer` | obostrano | [Uputa za oblikovanje diplomskoga rada (MEFST, 2021)](https://neuron.mefst.hr/docs/katedre/diplomski_ispit/Uputa%20za%20oblikovanje%20diplomskoga%20rada.pdf) | odj. 2 Font |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### mev

#### MEV Menadžment turizma i sporta, diplomski rad

`mev-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format papira A4 | `paper-size-fixer` | 21 x 29,7 cm | [Prilog 2 - Predlozak za pisanje rada](https://www.mev.hr/wp-content/uploads/2023/10/Prilog-2-Predlozak-za-pisanje-rada.pdf) | Prilog 2, str. 3 |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Prilog 2 - Predlozak za pisanje rada](https://www.mev.hr/wp-content/uploads/2023/10/Prilog-2-Predlozak-za-pisanje-rada.pdf) | Prilog 2, str. 3 |
| Font | `font-fixer` | Times New Roman | [Prilog 2 - Predlozak za pisanje rada](https://www.mev.hr/wp-content/uploads/2023/10/Prilog-2-Predlozak-za-pisanje-rada.pdf) | Prilog 2, str. 3 |
| Velicina slova (tekst rada) | `font-fixer` | 12 pt | [Prilog 2 - Predlozak za pisanje rada](https://www.mev.hr/wp-content/uploads/2023/10/Prilog-2-Predlozak-za-pisanje-rada.pdf) | Prilog 2, str. 3 |
| Prored | `line-spacing-fixer` | prored 1,5 | [Prilog 2 - Predlozak za pisanje rada](https://www.mev.hr/wp-content/uploads/2023/10/Prilog-2-Predlozak-za-pisanje-rada.pdf) | Prilog 2, str. 3 |
| Poravnanje | `alignment-fixer` | obostrano | [Prilog 2 - Predlozak za pisanje rada](https://www.mev.hr/wp-content/uploads/2023/10/Prilog-2-Predlozak-za-pisanje-rada.pdf) | Prilog 2, str. 3 |
| Font i veličina fusnota | `footnote-typography-fixer` | 10 pt |  |  |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### MEV tehnički studiji, završni rad

`mev-zavrsni` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Upute za izradu završnog rada (Međimursko veleučilište u Čakovcu, Prilog 3)](https://www.mev.hr/wp-content/uploads/2013/12/Prilog-3-Upute-za-izradu-zavr%C5%A1nog-rada.pdf) | Upute, Dodatak tehnicko oblikovanje |
| Velicina slova | `font-fixer` | 12 pt | [Upute za izradu završnog rada (Međimursko veleučilište u Čakovcu, Prilog 3)](https://www.mev.hr/wp-content/uploads/2013/12/Prilog-3-Upute-za-izradu-zavr%C5%A1nog-rada.pdf) | Upute, Dodatak tehnicko oblikovanje |
| Obostrano poravnanje | `alignment-fixer` | obostrano | [Upute za izradu završnog rada (Međimursko veleučilište u Čakovcu, Prilog 3)](https://www.mev.hr/wp-content/uploads/2013/12/Prilog-3-Upute-za-izradu-zavr%C5%A1nog-rada.pdf) | Upute, Dodatak tehnicko oblikovanje |
| Margine | `margins-fixer` | 3 / 3 / 3 / 3 cm (gore/desno/dolje/lijevo) | [Upute za izradu završnog rada (Međimursko veleučilište u Čakovcu, Prilog 3)](https://www.mev.hr/wp-content/uploads/2013/12/Prilog-3-Upute-za-izradu-zavr%C5%A1nog-rada.pdf) | Upute, Dodatak tehnicko oblikovanje |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za izradu završnog rada (Međimursko veleučilište u Čakovcu, Prilog 3)](https://www.mev.hr/wp-content/uploads/2013/12/Prilog-3-Upute-za-izradu-zavr%C5%A1nog-rada.pdf) | Upute, Dodatak tehnicko oblikovanje |
| Font i veličina fusnota | `footnote-typography-fixer` | 10 pt |  |  |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### MEV Menadžment turizma i sporta, završni rad

`mev-zavrsni-drustveni` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format papira A4 | `paper-size-fixer` | 21 x 29,7 cm | [Prilog 2 - Predlozak za pisanje rada](https://www.mev.hr/wp-content/uploads/2023/10/Prilog-2-Predlozak-za-pisanje-rada.pdf) | Prilog 2, str. 3 |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Prilog 2 - Predlozak za pisanje rada](https://www.mev.hr/wp-content/uploads/2023/10/Prilog-2-Predlozak-za-pisanje-rada.pdf) | Prilog 2, str. 3 |
| Font | `font-fixer` | Times New Roman | [Prilog 2 - Predlozak za pisanje rada](https://www.mev.hr/wp-content/uploads/2023/10/Prilog-2-Predlozak-za-pisanje-rada.pdf) | Prilog 2, str. 3 |
| Velicina slova (tekst rada) | `font-fixer` | 12 pt | [Prilog 2 - Predlozak za pisanje rada](https://www.mev.hr/wp-content/uploads/2023/10/Prilog-2-Predlozak-za-pisanje-rada.pdf) | Prilog 2, str. 3 |
| Prored | `line-spacing-fixer` | prored 1,5 | [Prilog 2 - Predlozak za pisanje rada](https://www.mev.hr/wp-content/uploads/2023/10/Prilog-2-Predlozak-za-pisanje-rada.pdf) | Prilog 2, str. 3 |
| Poravnanje | `alignment-fixer` | obostrano | [Prilog 2 - Predlozak za pisanje rada](https://www.mev.hr/wp-content/uploads/2023/10/Prilog-2-Predlozak-za-pisanje-rada.pdf) | Prilog 2, str. 3 |
| Font i veličina fusnota | `footnote-typography-fixer` | 10 pt |  |  |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### mfpu

#### Medicinski fakultet u Puli, diplomski rad

`mfpu-diplomski` · status: verified · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Pravilnik o izmjenama i dopunama Pravilnika o diplomskom radu i diplomskom koncertu na sveucilisnim diplomskim studijima i integriranome preddiplomskom i diplomskom studiju (23.07.2021.)](https://www.unipu.hr/_download/repository/2021-07-23-Pravilnik_o_izmjenama_i_dopunama_Pravilnika_o_dipl._radu_i_dipl._koncertu_na_sveucilisnim_dipl._studijima_i_integriranome_preddipl._i_dipl._studiju.pdf) | Članak 5. stavak 1. (izmjene 23.07.2021., točka II.), str. 1 PDF-a |
| Vrsta slova | `font-fixer` | Arial | [Pravilnik o izmjenama i dopunama Pravilnika o diplomskom radu i diplomskom koncertu na sveucilisnim diplomskim studijima i integriranome preddiplomskom i diplomskom studiju (23.07.2021.)](https://www.unipu.hr/_download/repository/2021-07-23-Pravilnik_o_izmjenama_i_dopunama_Pravilnika_o_dipl._radu_i_dipl._koncertu_na_sveucilisnim_dipl._studijima_i_integriranome_preddipl._i_dipl._studiju.pdf) | Članak 5. stavak 1. (izmjene 23.07.2021., točka II.), str. 1 PDF-a |
| Veličina slova | `font-fixer` | 12 pt | [Pravilnik o izmjenama i dopunama Pravilnika o diplomskom radu i diplomskom koncertu na sveucilisnim diplomskim studijima i integriranome preddiplomskom i diplomskom studiju (23.07.2021.)](https://www.unipu.hr/_download/repository/2021-07-23-Pravilnik_o_izmjenama_i_dopunama_Pravilnika_o_dipl._radu_i_dipl._koncertu_na_sveucilisnim_dipl._studijima_i_integriranome_preddipl._i_dipl._studiju.pdf) | Članak 5. stavak 1. (izmjene 23.07.2021., točka II.), str. 1 PDF-a |
| Prored | `line-spacing-fixer` | prored 1,5 | [Pravilnik o izmjenama i dopunama Pravilnika o diplomskom radu i diplomskom koncertu na sveucilisnim diplomskim studijima i integriranome preddiplomskom i diplomskom studiju (23.07.2021.)](https://www.unipu.hr/_download/repository/2021-07-23-Pravilnik_o_izmjenama_i_dopunama_Pravilnika_o_dipl._radu_i_dipl._koncertu_na_sveucilisnim_dipl._studijima_i_integriranome_preddipl._i_dipl._studiju.pdf) | Članak 5. stavak 1. (izmjene 23.07.2021., točka II.), str. 1 PDF-a |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Pravilnik o izmjenama i dopunama Pravilnika o diplomskom radu i diplomskom koncertu na sveucilisnim diplomskim studijima i integriranome preddiplomskom i diplomskom studiju (23.07.2021.)](https://www.unipu.hr/_download/repository/2021-07-23-Pravilnik_o_izmjenama_i_dopunama_Pravilnika_o_dipl._radu_i_dipl._koncertu_na_sveucilisnim_dipl._studijima_i_integriranome_preddipl._i_dipl._studiju.pdf) | Članak 5. stavak 1. (izmjene 23.07.2021., točka II.), str. 1 PDF-a |
| Font i veličina fusnota | `footnote-typography-fixer` | 10 pt |  |  |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Sadrzaj kao zivo TOC polje | `toc-field-fixer` | Word sam azurira sadrzaj<br><sub>Dokument ima naslov Sadrzaj, a jos nema zivo TOC polje. Nedestruktivno: rucne stavke se ne brisu.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### more

#### Fakultet znanosti o moru, diplomski rad

`more-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Upute za izradu završnog/diplomskog rada](https://marjan.unist.hr/vp/Dokumenti%20za%20studente/Upute%20za%20izradu%20zavr%C5%A1nog%20%20diplomskog%20rada.doc?vel=51200) | Odjeljak 'Oblikovanje teksta završnog/diplomskog rada', blok formata (natuknica 'Format') |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Upute za izradu završnog/diplomskog rada](https://marjan.unist.hr/vp/Dokumenti%20za%20studente/Upute%20za%20izradu%20zavr%C5%A1nog%20%20diplomskog%20rada.doc?vel=51200) | Odjeljak 'Oblikovanje teksta završnog/diplomskog rada', blok formata (natuknica 'Margine') |
| Vrsta slova | `font-fixer` | Times New Roman | [Upute za izradu završnog/diplomskog rada](https://marjan.unist.hr/vp/Dokumenti%20za%20studente/Upute%20za%20izradu%20zavr%C5%A1nog%20%20diplomskog%20rada.doc?vel=51200) | Odjeljak 'Oblikovanje teksta završnog/diplomskog rada', blok formata (natuknica 'Font') |
| Velicina slova | `font-fixer` | 12 pt | [Upute za izradu završnog/diplomskog rada](https://marjan.unist.hr/vp/Dokumenti%20za%20studente/Upute%20za%20izradu%20zavr%C5%A1nog%20%20diplomskog%20rada.doc?vel=51200) | Odjeljak 'Oblikovanje teksta završnog/diplomskog rada', blok formata (natuknica 'Tekst') |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za izradu završnog/diplomskog rada](https://marjan.unist.hr/vp/Dokumenti%20za%20studente/Upute%20za%20izradu%20zavr%C5%A1nog%20%20diplomskog%20rada.doc?vel=51200) | Odjeljak 'Oblikovanje teksta završnog/diplomskog rada', blok formata (natuknica 'Prored') |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Fakultet znanosti o moru, zavrsni rad

`more-zavrsni` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Upute za izradu završnog/diplomskog rada](https://marjan.unist.hr/vp/Dokumenti%20za%20studente/Upute%20za%20izradu%20zavr%C5%A1nog%20%20diplomskog%20rada.doc?vel=51200) | Odjeljak 'Oblikovanje teksta završnog/diplomskog rada', blok formata (natuknica 'Format') |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Upute za izradu završnog/diplomskog rada](https://marjan.unist.hr/vp/Dokumenti%20za%20studente/Upute%20za%20izradu%20zavr%C5%A1nog%20%20diplomskog%20rada.doc?vel=51200) | Odjeljak 'Oblikovanje teksta završnog/diplomskog rada', blok formata (natuknica 'Margine') |
| Vrsta slova | `font-fixer` | Times New Roman | [Upute za izradu završnog/diplomskog rada](https://marjan.unist.hr/vp/Dokumenti%20za%20studente/Upute%20za%20izradu%20zavr%C5%A1nog%20%20diplomskog%20rada.doc?vel=51200) | Odjeljak 'Oblikovanje teksta završnog/diplomskog rada', blok formata (natuknica 'Font') |
| Velicina slova | `font-fixer` | 12 pt | [Upute za izradu završnog/diplomskog rada](https://marjan.unist.hr/vp/Dokumenti%20za%20studente/Upute%20za%20izradu%20zavr%C5%A1nog%20%20diplomskog%20rada.doc?vel=51200) | Odjeljak 'Oblikovanje teksta završnog/diplomskog rada', blok formata (natuknica 'Tekst') |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za izradu završnog/diplomskog rada](https://marjan.unist.hr/vp/Dokumenti%20za%20studente/Upute%20za%20izradu%20zavr%C5%A1nog%20%20diplomskog%20rada.doc?vel=51200) | Odjeljak 'Oblikovanje teksta završnog/diplomskog rada', blok formata (natuknica 'Prored') |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### muza

#### Muzička akademija, diplomski rad

`muza-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Pravilnik o zavrsetku sveucilisnih integriranih prijediplomskih i diplomskih studija na Sveucilistu u Zagrebu Muzickoj akademiji, s Prilogom 1: Upute za izradu diplomskog rada (2025)](http://www.muza.unizg.hr/wp-content/uploads/2020/07/Pravilnik-o-zavrsetku-studija-MUZA_2025-S-prilozima.pdf) | Prilog 1: Upute za izradu diplomskog rada (zajednicke za sve studije) |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Muzička akademija, doktorski rad

`muza-doktorski` · status: partial · vrste rada: doctoral

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Times New Roman | [Upute za oblikovanje doktorskog rada (Obrazac DR.SC.-08)](https://www.unizg.hr/nc/vijest/article/obrasci-za-doktorski-studij/) | odjeljak 'Postavke stranice' (DR.SC.-08, Upute za oblikovanje doktorskog rada) |
| Velicina slova | `font-fixer` | 12 pt | [Upute za oblikovanje doktorskog rada (Obrazac DR.SC.-08)](https://www.unizg.hr/nc/vijest/article/obrasci-za-doktorski-studij/) | odjeljak 'Postavke stranice' (DR.SC.-08, Upute za oblikovanje doktorskog rada) |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za oblikovanje doktorskog rada (Obrazac DR.SC.-08)](https://www.unizg.hr/nc/vijest/article/obrasci-za-doktorski-studij/) | odjeljak 'Postavke stranice' (DR.SC.-08, Upute za oblikovanje doktorskog rada) |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Upute za oblikovanje doktorskog rada (Obrazac DR.SC.-08)](https://www.unizg.hr/nc/vijest/article/obrasci-za-doktorski-studij/) | odjeljak 'Postavke stranice' (DR.SC.-08, Upute za oblikovanje doktorskog rada) |
| Format papira A4 | `paper-size-fixer` | 21 x 29,7 cm | [Upute za oblikovanje doktorskog rada (Obrazac DR.SC.-08)](https://www.unizg.hr/nc/vijest/article/obrasci-za-doktorski-studij/) | odjeljak 'Postavke stranice' (DR.SC.-08, Upute za oblikovanje doktorskog rada) |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### odhz

#### Slavonski Brod - Drustveno-humanisticke znanosti, diplomski rad

`unisb-odhz-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Times New Roman | [Upute za izradu Zavrsnog rada/Diplomskog rada na Sveucilistu u Slavonskom Brodu (Senat, 28.6.2024)](https://unisbhr.sharepoint.com/:b:/s/WebRepozitorij/EUi-Gv2SQ39ErLqIGqAKn-sBKzD3H-jXP_XPsrcpZms7YQ) | Clanak 3. (Oblik i sadrzaj rada) |
| Velicina slova | `font-fixer` | 12 pt | [Upute za izradu Zavrsnog rada/Diplomskog rada na Sveucilistu u Slavonskom Brodu (Senat, 28.6.2024)](https://unisbhr.sharepoint.com/:b:/s/WebRepozitorij/EUi-Gv2SQ39ErLqIGqAKn-sBKzD3H-jXP_XPsrcpZms7YQ) | Clanak 3. (Oblik i sadrzaj rada) |
| Prored (jednostruki) | `line-spacing-fixer` | prored 1 | [Upute za izradu Zavrsnog rada/Diplomskog rada na Sveucilistu u Slavonskom Brodu (Senat, 28.6.2024)](https://unisbhr.sharepoint.com/:b:/s/WebRepozitorij/EUi-Gv2SQ39ErLqIGqAKn-sBKzD3H-jXP_XPsrcpZms7YQ) | Clanak 3. (Oblik i sadrzaj rada) |
| Margine (uvezni rub lijevo 2,5 cm) | `margins-fixer` | 2 / 2 / 2 / 2,5 cm (gore/desno/dolje/lijevo) | [Upute za izradu Zavrsnog rada/Diplomskog rada na Sveucilistu u Slavonskom Brodu (Senat, 28.6.2024)](https://unisbhr.sharepoint.com/:b:/s/WebRepozitorij/EUi-Gv2SQ39ErLqIGqAKn-sBKzD3H-jXP_XPsrcpZms7YQ) | Clanak 3. (Oblik i sadrzaj rada) |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Slavonski Brod - Drustveno-humanisticke znanosti, završni rad

`unisb-odhz-zavrsni` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Times New Roman | [Upute za izradu Zavrsnog rada/Diplomskog rada na Sveucilistu u Slavonskom Brodu (Senat, 28.6.2024)](https://unisbhr.sharepoint.com/:b:/s/WebRepozitorij/EUi-Gv2SQ39ErLqIGqAKn-sBKzD3H-jXP_XPsrcpZms7YQ) | Clanak 3. (Oblik i sadrzaj rada) |
| Velicina slova | `font-fixer` | 12 pt | [Upute za izradu Zavrsnog rada/Diplomskog rada na Sveucilistu u Slavonskom Brodu (Senat, 28.6.2024)](https://unisbhr.sharepoint.com/:b:/s/WebRepozitorij/EUi-Gv2SQ39ErLqIGqAKn-sBKzD3H-jXP_XPsrcpZms7YQ) | Clanak 3. (Oblik i sadrzaj rada) |
| Prored (jednostruki) | `line-spacing-fixer` | prored 1 | [Upute za izradu Zavrsnog rada/Diplomskog rada na Sveucilistu u Slavonskom Brodu (Senat, 28.6.2024)](https://unisbhr.sharepoint.com/:b:/s/WebRepozitorij/EUi-Gv2SQ39ErLqIGqAKn-sBKzD3H-jXP_XPsrcpZms7YQ) | Clanak 3. (Oblik i sadrzaj rada) |
| Margine (uvezni rub lijevo 2,5 cm) | `margins-fixer` | 2 / 2 / 2 / 2,5 cm (gore/desno/dolje/lijevo) | [Upute za izradu Zavrsnog rada/Diplomskog rada na Sveucilistu u Slavonskom Brodu (Senat, 28.6.2024)](https://unisbhr.sharepoint.com/:b:/s/WebRepozitorij/EUi-Gv2SQ39ErLqIGqAKn-sBKzD3H-jXP_XPsrcpZms7YQ) | Clanak 3. (Oblik i sadrzaj rada) |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### oss

#### Sveucilisni odjel za strucne studije (Split), diplomski rad

`oss-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Upute za izradu završnog rada na društvenim studijima](https://www.oss.unist.hr/sites/default/files/dokumenti/o-odjelu/propisi-i-dokumenti/strucni_studiji/Upute_za_izradu_zavrsnog_rada_drustveni_studiji.pdf) | PDF str. 3 (tiskana str. 1), odjeljak '1. UVOD' |
| Vrsta slova | `font-fixer` | Times New Roman | [Upute za izradu završnog rada na društvenim studijima](https://www.oss.unist.hr/sites/default/files/dokumenti/o-odjelu/propisi-i-dokumenti/strucni_studiji/Upute_za_izradu_zavrsnog_rada_drustveni_studiji.pdf) | PDF str. 3 (tiskana str. 1), odjeljak '1. UVOD' |
| Velicina slova | `font-fixer` | 12 pt | [Upute za izradu završnog rada na društvenim studijima](https://www.oss.unist.hr/sites/default/files/dokumenti/o-odjelu/propisi-i-dokumenti/strucni_studiji/Upute_za_izradu_zavrsnog_rada_drustveni_studiji.pdf) | PDF str. 3 (tiskana str. 1), odjeljak '1. UVOD' |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za izradu završnog rada na društvenim studijima](https://www.oss.unist.hr/sites/default/files/dokumenti/o-odjelu/propisi-i-dokumenti/strucni_studiji/Upute_za_izradu_zavrsnog_rada_drustveni_studiji.pdf) | PDF str. 3 (tiskana str. 1), odjeljak '1. UVOD' |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Upute za izradu završnog rada na društvenim studijima](https://www.oss.unist.hr/sites/default/files/dokumenti/o-odjelu/propisi-i-dokumenti/strucni_studiji/Upute_za_izradu_zavrsnog_rada_drustveni_studiji.pdf) | PDF str. 3 (tiskana str. 1), odjeljak '1. UVOD' |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Sveucilisni odjel za strucne studije (Split), zavrsni rad

`oss-zavrsni` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Upute za izradu završnog rada na društvenim studijima](https://www.oss.unist.hr/sites/default/files/dokumenti/o-odjelu/propisi-i-dokumenti/strucni_studiji/Upute_za_izradu_zavrsnog_rada_drustveni_studiji.pdf) | PDF str. 3 (tiskana str. 1), odjeljak '1. UVOD' |
| Vrsta slova | `font-fixer` | Times New Roman | [Upute za izradu završnog rada na društvenim studijima](https://www.oss.unist.hr/sites/default/files/dokumenti/o-odjelu/propisi-i-dokumenti/strucni_studiji/Upute_za_izradu_zavrsnog_rada_drustveni_studiji.pdf) | PDF str. 3 (tiskana str. 1), odjeljak '1. UVOD' |
| Velicina slova | `font-fixer` | 12 pt | [Upute za izradu završnog rada na društvenim studijima](https://www.oss.unist.hr/sites/default/files/dokumenti/o-odjelu/propisi-i-dokumenti/strucni_studiji/Upute_za_izradu_zavrsnog_rada_drustveni_studiji.pdf) | PDF str. 3 (tiskana str. 1), odjeljak '1. UVOD' |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za izradu završnog rada na društvenim studijima](https://www.oss.unist.hr/sites/default/files/dokumenti/o-odjelu/propisi-i-dokumenti/strucni_studiji/Upute_za_izradu_zavrsnog_rada_drustveni_studiji.pdf) | PDF str. 3 (tiskana str. 1), odjeljak '1. UVOD' |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Upute za izradu završnog rada na društvenim studijima](https://www.oss.unist.hr/sites/default/files/dokumenti/o-odjelu/propisi-i-dokumenti/strucni_studiji/Upute_za_izradu_zavrsnog_rada_drustveni_studiji.pdf) | PDF str. 3 (tiskana str. 1), odjeljak '1. UVOD' |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### ozs

#### Fakultet zdravstvenih znanosti (Split), diplomski rad

`ozs-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Vrsta slova | `font-fixer` | Times New Roman | [Template za diplomski rad.docx (službeni predložak za diplomski rad)](https://fzz.unist.hr/Portals/0/adam/ContentBlocks/rYvKRceFM0mGBPeOYQXR7A/Body/Template%20za%20diplomski%20rad.docx) | word/styles.xml: w:style[w:styleId="Normal", w:default="1"] / w:rPr / w:rFonts |
| Velicina slova | `font-fixer` | 12 pt | [Template za diplomski rad.docx (službeni predložak za diplomski rad)](https://fzz.unist.hr/Portals/0/adam/ContentBlocks/rYvKRceFM0mGBPeOYQXR7A/Body/Template%20za%20diplomski%20rad.docx) | word/styles.xml: w:docDefaults / w:rPrDefault / w:rPr / w:sz (stil Normal nema vlastiti w:sz) |
| Prored | `line-spacing-fixer` | prored 1,5 | [Template za diplomski rad.docx (službeni predložak za diplomski rad)](https://fzz.unist.hr/Portals/0/adam/ContentBlocks/rYvKRceFM0mGBPeOYQXR7A/Body/Template%20za%20diplomski%20rad.docx) | word/styles.xml: w:style[w:styleId="Normal"] / w:pPr / w:spacing |
| Margine | `margins-fixer` | 3 / 3 / 3 / 3 cm (gore/desno/dolje/lijevo) | [Template za diplomski rad.docx (službeni predložak za diplomski rad)](https://fzz.unist.hr/Portals/0/adam/ContentBlocks/rYvKRceFM0mGBPeOYQXR7A/Body/Template%20za%20diplomski%20rad.docx) | word/document.xml: sectPr tijela / w:pgMar (uvodni dio ima drukčije margine) |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Fakultet zdravstvenih znanosti (Split), zavrsni rad

`ozs-zavrsni` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Vrsta slova | `font-fixer` | Times New Roman | [Template za završni rad_ISTRAŽIVAČKI.docx (službeni predložak za završni rad, istraživački tip)](https://fzz.unist.hr/Portals/0/adam/ContentBlocks/Q2c3cF-lcEq8Thd1fTgd4Q/Body/Template%20za%20zavr%C5%A1ni%20rad_ISTRA%C5%BDIVA%C4%8CKI.docx) | word/styles.xml: w:style[w:styleId="Normal", w:default="1"] / w:rPr / w:rFonts |
| Velicina slova | `font-fixer` | 12 pt | [Template za završni rad_ISTRAŽIVAČKI.docx (službeni predložak za završni rad, istraživački tip)](https://fzz.unist.hr/Portals/0/adam/ContentBlocks/Q2c3cF-lcEq8Thd1fTgd4Q/Body/Template%20za%20zavr%C5%A1ni%20rad_ISTRA%C5%BDIVA%C4%8CKI.docx) | word/styles.xml: w:docDefaults / w:rPrDefault / w:rPr / w:sz (stil Normal nema vlastiti w:sz) |
| Prored | `line-spacing-fixer` | prored 1,5 | [Template za završni rad_ISTRAŽIVAČKI.docx (službeni predložak za završni rad, istraživački tip)](https://fzz.unist.hr/Portals/0/adam/ContentBlocks/Q2c3cF-lcEq8Thd1fTgd4Q/Body/Template%20za%20zavr%C5%A1ni%20rad_ISTRA%C5%BDIVA%C4%8CKI.docx) | word/styles.xml: w:style[w:styleId="Normal"] / w:pPr / w:spacing |
| Margine | `margins-fixer` | 3 / 3 / 3 / 3 cm (gore/desno/dolje/lijevo) | [Template za završni rad_ISTRAŽIVAČKI.docx (službeni predložak za završni rad, istraživački tip)](https://fzz.unist.hr/Portals/0/adam/ContentBlocks/Q2c3cF-lcEq8Thd1fTgd4Q/Body/Template%20za%20zavr%C5%A1ni%20rad_ISTRA%C5%BDIVA%C4%8CKI.docx) | word/document.xml: sectPr tijela / w:pgMar (uvodni dio ima drukčije margine) |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### pbf

#### Prehrambeno-biotehnoloski fakultet, diplomski rad

`pbf-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font (pismo) | `font-fixer` | Times New Roman | [Upute za izradu diplomskog rada (Prehrambeno-biotehnoloski fakultet Sveucilista u Zagrebu)](http://www.pbf.unizg.hr/content/download/793/9738/file/Upute%20za%20izradu%20diplomskog%20rada.pdf) | odjeljak 5.1. Jezik i obrada teksta |
| Velicina slova | `font-fixer` | 12 pt | [Upute za izradu diplomskog rada (Prehrambeno-biotehnoloski fakultet Sveucilista u Zagrebu)](http://www.pbf.unizg.hr/content/download/793/9738/file/Upute%20za%20izradu%20diplomskog%20rada.pdf) | odjeljak 5.1. Jezik i obrada teksta |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za izradu diplomskog rada (Prehrambeno-biotehnoloski fakultet Sveucilista u Zagrebu)](http://www.pbf.unizg.hr/content/download/793/9738/file/Upute%20za%20izradu%20diplomskog%20rada.pdf) | odjeljak 5.1. Jezik i obrada teksta |
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Upute za izradu diplomskog rada (Prehrambeno-biotehnoloski fakultet Sveucilista u Zagrebu)](http://www.pbf.unizg.hr/content/download/793/9738/file/Upute%20za%20izradu%20diplomskog%20rada.pdf) | odjeljak 5.1. Jezik i obrada teksta |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Sadrzaj kao zivo TOC polje | `toc-field-fixer` | Word sam azurira sadrzaj<br><sub>Dokument ima naslov Sadrzaj, a jos nema zivo TOC polje. Nedestruktivno: rucne stavke se ne brisu.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Prehrambeno-biotehnoloski fakultet, doktorski rad

`pbf-doktorski` · status: partial · vrste rada: doctoral

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Times New Roman | [Upute za oblikovanje doktorskog rada (Obrazac DR.SC.-08)](https://www.unizg.hr/nc/vijest/article/obrasci-za-doktorski-studij/) | odjeljak 'Postavke stranice' (DR.SC.-08, Upute za oblikovanje doktorskog rada) |
| Velicina slova | `font-fixer` | 12 pt | [Upute za oblikovanje doktorskog rada (Obrazac DR.SC.-08)](https://www.unizg.hr/nc/vijest/article/obrasci-za-doktorski-studij/) | odjeljak 'Postavke stranice' (DR.SC.-08, Upute za oblikovanje doktorskog rada) |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za oblikovanje doktorskog rada (Obrazac DR.SC.-08)](https://www.unizg.hr/nc/vijest/article/obrasci-za-doktorski-studij/) | odjeljak 'Postavke stranice' (DR.SC.-08, Upute za oblikovanje doktorskog rada) |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Upute za oblikovanje doktorskog rada (Obrazac DR.SC.-08)](https://www.unizg.hr/nc/vijest/article/obrasci-za-doktorski-studij/) | odjeljak 'Postavke stranice' (DR.SC.-08, Upute za oblikovanje doktorskog rada) |
| Format papira A4 | `paper-size-fixer` | 21 x 29,7 cm | [Upute za oblikovanje doktorskog rada (Obrazac DR.SC.-08)](https://www.unizg.hr/nc/vijest/article/obrasci-za-doktorski-studij/) | odjeljak 'Postavke stranice' (DR.SC.-08, Upute za oblikovanje doktorskog rada) |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### pfri

#### PFRI, diplomski rad

`pfri-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Vrsta slova | `font-fixer` | Times New Roman | [Upute za izradu diplomskog rada (PFRI, 26.3.2025)](https://www.pfri.uniri.hr/web/hr/dokumenti/Upute.za.izradu.diplomskoga.rada.PFRI.26.3.2025.pdf) | poglavlje 3. Tehnicke upute (str. 3) |
| Velicina slova | `font-fixer` | 12 pt | [Upute za izradu diplomskog rada (PFRI, 26.3.2025)](https://www.pfri.uniri.hr/web/hr/dokumenti/Upute.za.izradu.diplomskoga.rada.PFRI.26.3.2025.pdf) | poglavlje 3. Tehnicke upute (str. 3) |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za izradu diplomskog rada (PFRI, 26.3.2025)](https://www.pfri.uniri.hr/web/hr/dokumenti/Upute.za.izradu.diplomskoga.rada.PFRI.26.3.2025.pdf) | poglavlje 3. Tehnicke upute (str. 3) |
| Obostrano poravnanje | `alignment-fixer` | obostrano | [Upute za izradu diplomskog rada (PFRI, 26.3.2025)](https://www.pfri.uniri.hr/web/hr/dokumenti/Upute.za.izradu.diplomskoga.rada.PFRI.26.3.2025.pdf) | poglavlje 3. Tehnicke upute (str. 3) |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 3 cm (gore/desno/dolje/lijevo) | [Upute za izradu diplomskog rada (PFRI, 26.3.2025)](https://www.pfri.uniri.hr/web/hr/dokumenti/Upute.za.izradu.diplomskoga.rada.PFRI.26.3.2025.pdf) | poglavlje 3. Tehnicke upute (str. 3) |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### PFRI, završni rad

`pfri-zavrsni` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Vrsta slova | `font-fixer` | Times New Roman | [Upute za izradu zavrsnog rada (PFRI, 26.3.2025)](https://www.pfri.uniri.hr/web/hr/dokumenti/Upute.za.izradu.zavrsnog.rada.PFRI.26.3.2025.pdf) | poglavlje 3. Tehnicke upute (str. 3) |
| Velicina slova | `font-fixer` | 12 pt | [Upute za izradu zavrsnog rada (PFRI, 26.3.2025)](https://www.pfri.uniri.hr/web/hr/dokumenti/Upute.za.izradu.zavrsnog.rada.PFRI.26.3.2025.pdf) | poglavlje 3. Tehnicke upute (str. 3) |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za izradu zavrsnog rada (PFRI, 26.3.2025)](https://www.pfri.uniri.hr/web/hr/dokumenti/Upute.za.izradu.zavrsnog.rada.PFRI.26.3.2025.pdf) | poglavlje 3. Tehnicke upute (str. 3) |
| Obostrano poravnanje | `alignment-fixer` | obostrano | [Upute za izradu zavrsnog rada (PFRI, 26.3.2025)](https://www.pfri.uniri.hr/web/hr/dokumenti/Upute.za.izradu.zavrsnog.rada.PFRI.26.3.2025.pdf) | poglavlje 3. Tehnicke upute (str. 3) |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 3 cm (gore/desno/dolje/lijevo) | [Upute za izradu zavrsnog rada (PFRI, 26.3.2025)](https://www.pfri.uniri.hr/web/hr/dokumenti/Upute.za.izradu.zavrsnog.rada.PFRI.26.3.2025.pdf) | poglavlje 3. Tehnicke upute (str. 3) |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### pfst

#### PFST, diplomski rad

`pfst-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Vrsta slova (TNR ili Arial) | `font-fixer` | Times New Roman | [Upute za izradu diplomskih i drugih ocjenskih radova (PFST, 2022)](https://www.pfst.unist.hr/dokumenti/zavrsetak/PFST%20-%20Upute%20za%20izradu%20diplomskih%20i%20drugih%20ocjenskih%20radova.pdf) | odj. 3.1 Postavke stranice (str. 10-11) |
| Velicina slova | `font-fixer` | 12 pt | [Upute za izradu diplomskih i drugih ocjenskih radova (PFST, 2022)](https://www.pfst.unist.hr/dokumenti/zavrsetak/PFST%20-%20Upute%20za%20izradu%20diplomskih%20i%20drugih%20ocjenskih%20radova.pdf) | odj. 3.1 Postavke stranice (str. 10-11) |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za izradu diplomskih i drugih ocjenskih radova (PFST, 2022)](https://www.pfst.unist.hr/dokumenti/zavrsetak/PFST%20-%20Upute%20za%20izradu%20diplomskih%20i%20drugih%20ocjenskih%20radova.pdf) | odj. 3.1 Postavke stranice (str. 10-11) |
| Obostrano poravnanje | `alignment-fixer` | obostrano | [Upute za izradu diplomskih i drugih ocjenskih radova (PFST, 2022)](https://www.pfst.unist.hr/dokumenti/zavrsetak/PFST%20-%20Upute%20za%20izradu%20diplomskih%20i%20drugih%20ocjenskih%20radova.pdf) | odj. 3.1 Postavke stranice (str. 10-11) |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### PFST, završni rad

`pfst-zavrsni` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Vrsta slova (TNR ili Arial) | `font-fixer` | Times New Roman | [Upute za izradu diplomskih i drugih ocjenskih radova (PFST, 2022)](https://www.pfst.unist.hr/dokumenti/zavrsetak/PFST%20-%20Upute%20za%20izradu%20diplomskih%20i%20drugih%20ocjenskih%20radova.pdf) | odj. 3.1 Postavke stranice (str. 10-11) |
| Velicina slova | `font-fixer` | 12 pt | [Upute za izradu diplomskih i drugih ocjenskih radova (PFST, 2022)](https://www.pfst.unist.hr/dokumenti/zavrsetak/PFST%20-%20Upute%20za%20izradu%20diplomskih%20i%20drugih%20ocjenskih%20radova.pdf) | odj. 3.1 Postavke stranice (str. 10-11) |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za izradu diplomskih i drugih ocjenskih radova (PFST, 2022)](https://www.pfst.unist.hr/dokumenti/zavrsetak/PFST%20-%20Upute%20za%20izradu%20diplomskih%20i%20drugih%20ocjenskih%20radova.pdf) | odj. 3.1 Postavke stranice (str. 10-11) |
| Obostrano poravnanje | `alignment-fixer` | obostrano | [Upute za izradu diplomskih i drugih ocjenskih radova (PFST, 2022)](https://www.pfst.unist.hr/dokumenti/zavrsetak/PFST%20-%20Upute%20za%20izradu%20diplomskih%20i%20drugih%20ocjenskih%20radova.pdf) | odj. 3.1 Postavke stranice (str. 10-11) |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### pmf

#### Prirodoslovno-matematicki fakultet (Bioloski odsjek), diplomski rad

`pmf-biologija-graduate` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Upute za prijavu i izradu diplomskog rada te diplomski ispit na Bioloskom odsjeku (2026)](https://www.pmf.unizg.hr/_download/repository/Upute%20za%20prijavu%20i%20izradu%20diplomskog%20rada%5B2%5D.pdf) | odjeljak Predaja i oblikovanje diplomskog rada |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za prijavu i izradu diplomskog rada te diplomski ispit na Bioloskom odsjeku (2026)](https://www.pmf.unizg.hr/_download/repository/Upute%20za%20prijavu%20i%20izradu%20diplomskog%20rada%5B2%5D.pdf) | odjeljak Predaja i oblikovanje diplomskog rada |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Upute za prijavu i izradu diplomskog rada te diplomski ispit na Bioloskom odsjeku (2026)](https://www.pmf.unizg.hr/_download/repository/Upute%20za%20prijavu%20i%20izradu%20diplomskog%20rada%5B2%5D.pdf) | odjeljak Predaja i oblikovanje diplomskog rada |
| Velicina slova | `font-fixer` | 11 pt | [Upute za prijavu i izradu diplomskog rada te diplomski ispit na Bioloskom odsjeku (2026)](https://www.pmf.unizg.hr/_download/repository/Upute%20za%20prijavu%20i%20izradu%20diplomskog%20rada%5B2%5D.pdf) | odjeljak Predaja i oblikovanje diplomskog rada |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Prirodoslovno-matematicki fakultet (Fizicki odsjek), diplomski rad

`pmf-fizika-graduate` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Times New Roman | [Upute za pisanje diplomskog rada (Prirodoslovno-matematicki fakultet, Fizicki odsjek)](https://www.pmf.unizg.hr/images/50005072/Fizicki%20odsjek-upute%20za%20pisanje%20diplomskog%20rada.doc) | odjeljak Formatiranje teksta |
| Velicina slova | `font-fixer` | 12 pt | [Upute za pisanje diplomskog rada (Prirodoslovno-matematicki fakultet, Fizicki odsjek)](https://www.pmf.unizg.hr/images/50005072/Fizicki%20odsjek-upute%20za%20pisanje%20diplomskog%20rada.doc) | odjeljak Formatiranje teksta |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za pisanje diplomskog rada (Prirodoslovno-matematicki fakultet, Fizicki odsjek)](https://www.pmf.unizg.hr/images/50005072/Fizicki%20odsjek-upute%20za%20pisanje%20diplomskog%20rada.doc) | odjeljak Formatiranje teksta |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 3 cm (gore/desno/dolje/lijevo) | [Upute za pisanje diplomskog rada (Prirodoslovno-matematicki fakultet, Fizicki odsjek)](https://www.pmf.unizg.hr/images/50005072/Fizicki%20odsjek-upute%20za%20pisanje%20diplomskog%20rada.doc) | odjeljak Formatiranje teksta |
| Poravnanje teksta (obostrano) | `alignment-fixer` | obostrano | [Upute za pisanje diplomskog rada (Prirodoslovno-matematicki fakultet, Fizicki odsjek)](https://www.pmf.unizg.hr/images/50005072/Fizicki%20odsjek-upute%20za%20pisanje%20diplomskog%20rada.doc) | odjeljak Formatiranje teksta |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Prirodoslovno-matematički fakultet, Geofizički odsjek, diplomski rad

`pmf-geofizika-graduate` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font (predlozak, preporuka) | `font-fixer` | Cambria | [Diplomski_template_Word_2020 (Geofizicki odsjek, PMF Zagreb)](https://www.pmf.unizg.hr/_download/repository/Diplomski_template_Word_2020%5B1%5D.docx) |  |
| Velicina slova (predlozak, preporuka) | `font-fixer` | 12 pt | [Diplomski_template_Word_2020 (Geofizicki odsjek, PMF Zagreb)](https://www.pmf.unizg.hr/_download/repository/Diplomski_template_Word_2020%5B1%5D.docx) |  |
| Prored (predlozak, preporuka) | `line-spacing-fixer` | prored 1,5 | [Diplomski_template_Word_2020 (Geofizicki odsjek, PMF Zagreb)](https://www.pmf.unizg.hr/_download/repository/Diplomski_template_Word_2020%5B1%5D.docx) |  |
| Margine (lijeva 3cm za uvez) (predlozak, preporuka) | `margins-fixer` | 2,5 / 2,5 / 2,5 / 3 cm (gore/desno/dolje/lijevo) | [Diplomski_template_Word_2020 (Geofizicki odsjek, PMF Zagreb)](https://www.pmf.unizg.hr/_download/repository/Diplomski_template_Word_2020%5B1%5D.docx) |  |
| Poravnanje (predlozak, preporuka) | `alignment-fixer` | obostrano | [Diplomski_template_Word_2020 (Geofizicki odsjek, PMF Zagreb)](https://www.pmf.unizg.hr/_download/repository/Diplomski_template_Word_2020%5B1%5D.docx) |  |
| Format papira A4 (predlozak, preporuka) | `paper-size-fixer` | 21 x 29,7 cm | [Diplomski_template_Word_2020 (Geofizicki odsjek, PMF Zagreb)](https://www.pmf.unizg.hr/_download/repository/Diplomski_template_Word_2020%5B1%5D.docx) |  |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Prirodoslovno-matematicki fakultet (Geografski odsjek), diplomski rad

`pmf-geografija-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Times New Roman | [Upute za izradu diplomskog rada na Sveucilistu u Zagrebu Prirodoslovno-matematickom fakultetu, Geografskom odsjeku (2026)](https://www.pmf.unizg.hr/_download/repository/Diplomski%20rad%20-%20upute%202026%5B1%5D.pdf) | odjeljak Opseg i forma rada |
| Velicina slova | `font-fixer` | 12 pt | [Upute za izradu diplomskog rada na Sveucilistu u Zagrebu Prirodoslovno-matematickom fakultetu, Geografskom odsjeku (2026)](https://www.pmf.unizg.hr/_download/repository/Diplomski%20rad%20-%20upute%202026%5B1%5D.pdf) | odjeljak Opseg i forma rada |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za izradu diplomskog rada na Sveucilistu u Zagrebu Prirodoslovno-matematickom fakultetu, Geografskom odsjeku (2026)](https://www.pmf.unizg.hr/_download/repository/Diplomski%20rad%20-%20upute%202026%5B1%5D.pdf) | odjeljak Opseg i forma rada |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Upute za izradu diplomskog rada na Sveucilistu u Zagrebu Prirodoslovno-matematickom fakultetu, Geografskom odsjeku (2026)](https://www.pmf.unizg.hr/_download/repository/Diplomski%20rad%20-%20upute%202026%5B1%5D.pdf) | odjeljak Opseg i forma rada |
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Upute za izradu diplomskog rada na Sveucilistu u Zagrebu Prirodoslovno-matematickom fakultetu, Geografskom odsjeku (2026)](https://www.pmf.unizg.hr/_download/repository/Diplomski%20rad%20-%20upute%202026%5B1%5D.pdf) | odjeljak Opseg i forma rada |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Prirodoslovno-matematicki fakultet (Geoloski odsjek), diplomski rad

`pmf-geologija-graduate` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Times New Roman | [Upute i predlozak za izradu diplomskog rada (PMF-GO2021) na Sveucilistu u Zagrebu Prirodoslovno-matematickom fakultetu, Geoloskom odsjeku (2024)](https://www.pmf.unizg.hr/_download/repository/PMF-GO2021_Upute_i_predlozak-Diplomski_rad.pdf) | odjeljak 1. Uvod |
| Velicina slova | `font-fixer` | 12 pt | [Upute i predlozak za izradu diplomskog rada (PMF-GO2021) na Sveucilistu u Zagrebu Prirodoslovno-matematickom fakultetu, Geoloskom odsjeku (2024)](https://www.pmf.unizg.hr/_download/repository/PMF-GO2021_Upute_i_predlozak-Diplomski_rad.pdf) | odjeljak 1. Uvod |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute i predlozak za izradu diplomskog rada (PMF-GO2021) na Sveucilistu u Zagrebu Prirodoslovno-matematickom fakultetu, Geoloskom odsjeku (2024)](https://www.pmf.unizg.hr/_download/repository/PMF-GO2021_Upute_i_predlozak-Diplomski_rad.pdf) | odjeljak 1. Uvod |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Sadrzaj kao zivo TOC polje | `toc-field-fixer` | Word sam azurira sadrzaj<br><sub>Dokument ima naslov Sadrzaj, a jos nema zivo TOC polje. Nedestruktivno: rucne stavke se ne brisu.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Prirodoslovno-matematicki fakultet (Matematicki odsjek), diplomski rad

`pmf-matematika-graduate` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Prilog 1: Upute za izradu diplomskog rada (Prilozi Pravilniku o diplomskom radu i diplomskom ispitu, Matematicki odsjek PMF-a, rujan 2024)](https://www.pmf.unizg.hr/images/50022555/pravilnik-diplomski-prilozi(1).pdf) | Prilog 1: Upute za izradu diplomskog rada, II. Izgled diplomskog rada |
| Velicina slova | `font-fixer` | 12 pt | [Prilog 1: Upute za izradu diplomskog rada (Prilozi Pravilniku o diplomskom radu i diplomskom ispitu, Matematicki odsjek PMF-a, rujan 2024)](https://www.pmf.unizg.hr/images/50022555/pravilnik-diplomski-prilozi(1).pdf) | Prilog 1: Upute za izradu diplomskog rada, II. Izgled diplomskog rada |
| Prored (15pt) | `line-spacing-fixer` | prored 15 | [Prilog 1: Upute za izradu diplomskog rada (Prilozi Pravilniku o diplomskom radu i diplomskom ispitu, Matematicki odsjek PMF-a, rujan 2024)](https://www.pmf.unizg.hr/images/50022555/pravilnik-diplomski-prilozi(1).pdf) | Prilog 1: Upute za izradu diplomskog rada, II. Izgled diplomskog rada |
| Margine (jednostrani tisak) | `margins-fixer` | 3,5 / 2,3 / 3,8 / 3,5 cm (gore/desno/dolje/lijevo) | [Prilog 1: Upute za izradu diplomskog rada (Prilozi Pravilniku o diplomskom radu i diplomskom ispitu, Matematicki odsjek PMF-a, rujan 2024)](https://www.pmf.unizg.hr/images/50022555/pravilnik-diplomski-prilozi(1).pdf) | Prilog 1: Upute za izradu diplomskog rada, II. Izgled diplomskog rada |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Sadrzaj kao zivo TOC polje | `toc-field-fixer` | Word sam azurira sadrzaj<br><sub>Dokument ima naslov Sadrzaj, a jos nema zivo TOC polje. Nedestruktivno: rucne stavke se ne brisu.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### pmfst

#### PMF Split (bio/kem), diplomski rad

`pmfst-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Upute za pisanje diplomskog rada (PMFST, odjel bio/kem)](https://www.pmfst.unist.hr/wp-content/uploads/2014/06/UPUTE-ZA-PISANJE-DIPLOMSKOG-RADA.pdf) | Upute, Format |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za pisanje diplomskog rada (PMFST, odjel bio/kem)](https://www.pmfst.unist.hr/wp-content/uploads/2014/06/UPUTE-ZA-PISANJE-DIPLOMSKOG-RADA.pdf) | Upute, Format |
| Velicina slova | `font-fixer` | 12 pt | [Upute za pisanje diplomskog rada (PMFST, odjel bio/kem)](https://www.pmfst.unist.hr/wp-content/uploads/2014/06/UPUTE-ZA-PISANJE-DIPLOMSKOG-RADA.pdf) | Upute, Format |
| Vrsta slova | `font-fixer` | Times New Roman | [Upute za pisanje diplomskog rada (PMFST, odjel bio/kem)](https://www.pmfst.unist.hr/wp-content/uploads/2014/06/UPUTE-ZA-PISANJE-DIPLOMSKOG-RADA.pdf) | Upute, Format |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Upute za pisanje diplomskog rada (PMFST, odjel bio/kem)](https://www.pmfst.unist.hr/wp-content/uploads/2014/06/UPUTE-ZA-PISANJE-DIPLOMSKOG-RADA.pdf) | Upute, Format |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### PMF Split (bio/kem), završni rad

`pmfst-zavrsni` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Upute za pisanje zavrsnog rada (PMFST, odjel bio/kem)](https://www.pmfst.unist.hr/wp-content/uploads/2014/06/UPUTE-ZA-PISANJE-ZAVRSNOG-RADA.pdf) | Upute, Format |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za pisanje zavrsnog rada (PMFST, odjel bio/kem)](https://www.pmfst.unist.hr/wp-content/uploads/2014/06/UPUTE-ZA-PISANJE-ZAVRSNOG-RADA.pdf) | Upute, Format |
| Velicina slova | `font-fixer` | 12 pt | [Upute za pisanje zavrsnog rada (PMFST, odjel bio/kem)](https://www.pmfst.unist.hr/wp-content/uploads/2014/06/UPUTE-ZA-PISANJE-ZAVRSNOG-RADA.pdf) | Upute, Format |
| Vrsta slova | `font-fixer` | Times New Roman | [Upute za pisanje zavrsnog rada (PMFST, odjel bio/kem)](https://www.pmfst.unist.hr/wp-content/uploads/2014/06/UPUTE-ZA-PISANJE-ZAVRSNOG-RADA.pdf) | Upute, Format |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Upute za pisanje zavrsnog rada (PMFST, odjel bio/kem)](https://www.pmfst.unist.hr/wp-content/uploads/2014/06/UPUTE-ZA-PISANJE-ZAVRSNOG-RADA.pdf) | Upute, Format |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### pravo

#### Pravni fakultet · doktorski studij Pravne znanosti · doktorski rad

`pravo-doktorski-pravne-znanosti` · status: partial · vrste rada: doctoral

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font glavnog teksta | `font-fixer` | Times New Roman | [Upute za oblikovanje i uredenje teksta i navodenje izvora u diplomskim i zavrsnim radovima na Pravnom fakultetu Sveucilista u Zagrebu](https://www.pravo.unizg.hr/wp-content/uploads/2024/05/Upute-za-oblikovanje-i-uredenje-teksta-i-navodenje-izvora_diplomski_zavrsni_rad.pdf) | odjeljak 4. Oblikovanje i uredenje teksta |
| Velicina fonta glavnog teksta | `font-fixer` | 12 pt | [Upute za oblikovanje i uredenje teksta i navodenje izvora u diplomskim i zavrsnim radovima na Pravnom fakultetu Sveucilista u Zagrebu](https://www.pravo.unizg.hr/wp-content/uploads/2024/05/Upute-za-oblikovanje-i-uredenje-teksta-i-navodenje-izvora_diplomski_zavrsni_rad.pdf) | odjeljak 4. Oblikovanje i uredenje teksta |
| Prored glavnog teksta | `line-spacing-fixer` | prored 1,5 | [Upute za oblikovanje i uredenje teksta i navodenje izvora u diplomskim i zavrsnim radovima na Pravnom fakultetu Sveucilista u Zagrebu](https://www.pravo.unizg.hr/wp-content/uploads/2024/05/Upute-za-oblikovanje-i-uredenje-teksta-i-navodenje-izvora_diplomski_zavrsni_rad.pdf) | odjeljak 4. Oblikovanje i uredenje teksta |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) |  |  |
| Poravnanje glavnog teksta | `alignment-fixer` | obostrano | [Upute za oblikovanje i uredenje teksta i navodenje izvora u diplomskim i zavrsnim radovima na Pravnom fakultetu Sveucilista u Zagrebu](https://www.pravo.unizg.hr/wp-content/uploads/2024/05/Upute-za-oblikovanje-i-uredenje-teksta-i-navodenje-izvora_diplomski_zavrsni_rad.pdf) | odjeljak 4. Oblikovanje i uredenje teksta |
| Font i veličina fusnota | `footnote-typography-fixer` | Times New Roman, 10 pt |  |  |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Pravni fakultet · integrirani studij Pravo · diplomski rad

`pravo-integrirani-diplomski` · status: verified · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font glavnog teksta | `font-fixer` | Times New Roman | [Upute za oblikovanje i uredenje teksta i navodenje izvora u diplomskim i zavrsnim radovima na Pravnom fakultetu Sveucilista u Zagrebu](https://www.pravo.unizg.hr/wp-content/uploads/2024/05/Upute-za-oblikovanje-i-uredenje-teksta-i-navodenje-izvora_diplomski_zavrsni_rad.pdf) | odjeljak 4. Oblikovanje i uredenje teksta |
| Velicina fonta glavnog teksta | `font-fixer` | 12 pt | [Upute za oblikovanje i uredenje teksta i navodenje izvora u diplomskim i zavrsnim radovima na Pravnom fakultetu Sveucilista u Zagrebu](https://www.pravo.unizg.hr/wp-content/uploads/2024/05/Upute-za-oblikovanje-i-uredenje-teksta-i-navodenje-izvora_diplomski_zavrsni_rad.pdf) | odjeljak 4. Oblikovanje i uredenje teksta |
| Prored glavnog teksta | `line-spacing-fixer` | prored 1,5 | [Upute za oblikovanje i uredenje teksta i navodenje izvora u diplomskim i zavrsnim radovima na Pravnom fakultetu Sveucilista u Zagrebu](https://www.pravo.unizg.hr/wp-content/uploads/2024/05/Upute-za-oblikovanje-i-uredenje-teksta-i-navodenje-izvora_diplomski_zavrsni_rad.pdf) | odjeljak 4. Oblikovanje i uredenje teksta |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) |  |  |
| Poravnanje glavnog teksta | `alignment-fixer` | obostrano | [Upute za oblikovanje i uredenje teksta i navodenje izvora u diplomskim i zavrsnim radovima na Pravnom fakultetu Sveucilista u Zagrebu](https://www.pravo.unizg.hr/wp-content/uploads/2024/05/Upute-za-oblikovanje-i-uredenje-teksta-i-navodenje-izvora_diplomski_zavrsni_rad.pdf) | odjeljak 4. Oblikovanje i uredenje teksta |
| Razmak prije i poslije odlomka | `paragraph-spacing-fixer` | bez parametara |  |  |
| Razmak prije i poslije fusnota | `footnote-spacing-fixer` | bez parametara |  |  |
| Oblikovanje naslova po razinama | `heading-format-fixer` | razina 1 12 pt lijevo; razina 2 12 pt podebljano lijevo; razina 3 12 pt podebljano kurziv lijevo |  |  |
| Font i veličina fusnota | `footnote-typography-fixer` | Times New Roman, 10 pt |  |  |
| Velika slova naslova | `heading-case-fixer` | velika slova, razine 1<br><sub>Trazi izricitu privolu (mijenja autorov tekst ili strukturu).</sub> |  |  |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Sadrzaj kao zivo TOC polje | `toc-field-fixer` | Word sam azurira sadrzaj<br><sub>Dokument ima naslov Sadrzaj, a jos nema zivo TOC polje. Nedestruktivno: rucne stavke se ne brisu.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Pravni fakultet · Stručni diplomski studij Javna uprava · diplomski rad

`pravo-javna-uprava-diplomski` · status: verified · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font glavnog teksta | `font-fixer` | Times New Roman | [Upute za oblikovanje i uredenje teksta i navodenje izvora u diplomskim i zavrsnim radovima na Pravnom fakultetu Sveucilista u Zagrebu](https://www.pravo.unizg.hr/wp-content/uploads/2024/05/Upute-za-oblikovanje-i-uredenje-teksta-i-navodenje-izvora_diplomski_zavrsni_rad.pdf) | odjeljak 4. Oblikovanje i uredenje teksta |
| Velicina fonta glavnog teksta | `font-fixer` | 12 pt | [Upute za oblikovanje i uredenje teksta i navodenje izvora u diplomskim i zavrsnim radovima na Pravnom fakultetu Sveucilista u Zagrebu](https://www.pravo.unizg.hr/wp-content/uploads/2024/05/Upute-za-oblikovanje-i-uredenje-teksta-i-navodenje-izvora_diplomski_zavrsni_rad.pdf) | odjeljak 4. Oblikovanje i uredenje teksta |
| Prored glavnog teksta | `line-spacing-fixer` | prored 1,5 | [Upute za oblikovanje i uredenje teksta i navodenje izvora u diplomskim i zavrsnim radovima na Pravnom fakultetu Sveucilista u Zagrebu](https://www.pravo.unizg.hr/wp-content/uploads/2024/05/Upute-za-oblikovanje-i-uredenje-teksta-i-navodenje-izvora_diplomski_zavrsni_rad.pdf) | odjeljak 4. Oblikovanje i uredenje teksta |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) |  |  |
| Poravnanje glavnog teksta | `alignment-fixer` | obostrano | [Upute za oblikovanje i uredenje teksta i navodenje izvora u diplomskim i zavrsnim radovima na Pravnom fakultetu Sveucilista u Zagrebu](https://www.pravo.unizg.hr/wp-content/uploads/2024/05/Upute-za-oblikovanje-i-uredenje-teksta-i-navodenje-izvora_diplomski_zavrsni_rad.pdf) | odjeljak 4. Oblikovanje i uredenje teksta |
| Razmak prije i poslije odlomka | `paragraph-spacing-fixer` | bez parametara |  |  |
| Razmak prije i poslije fusnota | `footnote-spacing-fixer` | bez parametara |  |  |
| Oblikovanje naslova po razinama | `heading-format-fixer` | razina 1 12 pt lijevo; razina 2 12 pt podebljano lijevo; razina 3 12 pt podebljano kurziv lijevo |  |  |
| Font i veličina fusnota | `footnote-typography-fixer` | Times New Roman, 10 pt |  |  |
| Velika slova naslova | `heading-case-fixer` | velika slova, razine 1<br><sub>Trazi izricitu privolu (mijenja autorov tekst ili strukturu).</sub> |  |  |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Sadrzaj kao zivo TOC polje | `toc-field-fixer` | Word sam azurira sadrzaj<br><sub>Dokument ima naslov Sadrzaj, a jos nema zivo TOC polje. Nedestruktivno: rucne stavke se ne brisu.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Pravni fakultet · Stručni prijediplomski studij Javna uprava · završni rad

`pravo-javna-uprava-prijediplomski` · status: verified · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font glavnog teksta | `font-fixer` | Times New Roman | [Upute za oblikovanje i uredenje teksta i navodenje izvora u diplomskim i zavrsnim radovima na Pravnom fakultetu Sveucilista u Zagrebu](https://www.pravo.unizg.hr/wp-content/uploads/2024/05/Upute-za-oblikovanje-i-uredenje-teksta-i-navodenje-izvora_diplomski_zavrsni_rad.pdf) | odjeljak 4. Oblikovanje i uredenje teksta |
| Velicina fonta glavnog teksta | `font-fixer` | 12 pt | [Upute za oblikovanje i uredenje teksta i navodenje izvora u diplomskim i zavrsnim radovima na Pravnom fakultetu Sveucilista u Zagrebu](https://www.pravo.unizg.hr/wp-content/uploads/2024/05/Upute-za-oblikovanje-i-uredenje-teksta-i-navodenje-izvora_diplomski_zavrsni_rad.pdf) | odjeljak 4. Oblikovanje i uredenje teksta |
| Prored glavnog teksta | `line-spacing-fixer` | prored 1,5 | [Upute za oblikovanje i uredenje teksta i navodenje izvora u diplomskim i zavrsnim radovima na Pravnom fakultetu Sveucilista u Zagrebu](https://www.pravo.unizg.hr/wp-content/uploads/2024/05/Upute-za-oblikovanje-i-uredenje-teksta-i-navodenje-izvora_diplomski_zavrsni_rad.pdf) | odjeljak 4. Oblikovanje i uredenje teksta |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) |  |  |
| Poravnanje glavnog teksta | `alignment-fixer` | obostrano | [Upute za oblikovanje i uredenje teksta i navodenje izvora u diplomskim i zavrsnim radovima na Pravnom fakultetu Sveucilista u Zagrebu](https://www.pravo.unizg.hr/wp-content/uploads/2024/05/Upute-za-oblikovanje-i-uredenje-teksta-i-navodenje-izvora_diplomski_zavrsni_rad.pdf) | odjeljak 4. Oblikovanje i uredenje teksta |
| Razmak prije i poslije odlomka | `paragraph-spacing-fixer` | bez parametara |  |  |
| Razmak prije i poslije fusnota | `footnote-spacing-fixer` | bez parametara |  |  |
| Oblikovanje naslova po razinama | `heading-format-fixer` | razina 1 12 pt lijevo; razina 2 12 pt podebljano lijevo; razina 3 12 pt podebljano kurziv lijevo |  |  |
| Font i veličina fusnota | `footnote-typography-fixer` | Times New Roman, 10 pt |  |  |
| Velika slova naslova | `heading-case-fixer` | velika slova, razine 1<br><sub>Trazi izricitu privolu (mijenja autorov tekst ili strukturu).</sub> |  |  |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Sadrzaj kao zivo TOC polje | `toc-field-fixer` | Word sam azurira sadrzaj<br><sub>Dokument ima naslov Sadrzaj, a jos nema zivo TOC polje. Nedestruktivno: rucne stavke se ne brisu.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Pravni fakultet · opći pravni akademski rad

`pravo-opci-pravni-akademski-rad` · status: partial · vrste rada: seminar, project, article

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font glavnog teksta | `font-fixer` | Times New Roman | [Upute za oblikovanje i uredenje teksta i navodenje izvora u diplomskim i zavrsnim radovima na Pravnom fakultetu Sveucilista u Zagrebu](https://www.pravo.unizg.hr/wp-content/uploads/2024/05/Upute-za-oblikovanje-i-uredenje-teksta-i-navodenje-izvora_diplomski_zavrsni_rad.pdf) | odjeljak 4. Oblikovanje i uredenje teksta |
| Velicina fonta glavnog teksta | `font-fixer` | 12 pt | [Upute za oblikovanje i uredenje teksta i navodenje izvora u diplomskim i zavrsnim radovima na Pravnom fakultetu Sveucilista u Zagrebu](https://www.pravo.unizg.hr/wp-content/uploads/2024/05/Upute-za-oblikovanje-i-uredenje-teksta-i-navodenje-izvora_diplomski_zavrsni_rad.pdf) | odjeljak 4. Oblikovanje i uredenje teksta |
| Prored glavnog teksta | `line-spacing-fixer` | prored 1,5 | [Upute za oblikovanje i uredenje teksta i navodenje izvora u diplomskim i zavrsnim radovima na Pravnom fakultetu Sveucilista u Zagrebu](https://www.pravo.unizg.hr/wp-content/uploads/2024/05/Upute-za-oblikovanje-i-uredenje-teksta-i-navodenje-izvora_diplomski_zavrsni_rad.pdf) | odjeljak 4. Oblikovanje i uredenje teksta |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) |  |  |
| Poravnanje glavnog teksta | `alignment-fixer` | obostrano | [Upute za oblikovanje i uredenje teksta i navodenje izvora u diplomskim i zavrsnim radovima na Pravnom fakultetu Sveucilista u Zagrebu](https://www.pravo.unizg.hr/wp-content/uploads/2024/05/Upute-za-oblikovanje-i-uredenje-teksta-i-navodenje-izvora_diplomski_zavrsni_rad.pdf) | odjeljak 4. Oblikovanje i uredenje teksta |
| Font i veličina fusnota | `footnote-typography-fixer` | Times New Roman, 10 pt |  |  |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Pravni fakultet · Stručni prijediplomski Porezni studij · završni rad

`pravo-porezni-prijediplomski` · status: verified · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font glavnog teksta | `font-fixer` | Times New Roman | [Upute za oblikovanje i uredenje teksta i navodenje izvora u diplomskim i zavrsnim radovima na Pravnom fakultetu Sveucilista u Zagrebu](https://www.pravo.unizg.hr/wp-content/uploads/2024/05/Upute-za-oblikovanje-i-uredenje-teksta-i-navodenje-izvora_diplomski_zavrsni_rad.pdf) | odjeljak 4. Oblikovanje i uredenje teksta |
| Velicina fonta glavnog teksta | `font-fixer` | 12 pt | [Upute za oblikovanje i uredenje teksta i navodenje izvora u diplomskim i zavrsnim radovima na Pravnom fakultetu Sveucilista u Zagrebu](https://www.pravo.unizg.hr/wp-content/uploads/2024/05/Upute-za-oblikovanje-i-uredenje-teksta-i-navodenje-izvora_diplomski_zavrsni_rad.pdf) | odjeljak 4. Oblikovanje i uredenje teksta |
| Prored glavnog teksta | `line-spacing-fixer` | prored 1,5 | [Upute za oblikovanje i uredenje teksta i navodenje izvora u diplomskim i zavrsnim radovima na Pravnom fakultetu Sveucilista u Zagrebu](https://www.pravo.unizg.hr/wp-content/uploads/2024/05/Upute-za-oblikovanje-i-uredenje-teksta-i-navodenje-izvora_diplomski_zavrsni_rad.pdf) | odjeljak 4. Oblikovanje i uredenje teksta |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) |  |  |
| Poravnanje glavnog teksta | `alignment-fixer` | obostrano | [Upute za oblikovanje i uredenje teksta i navodenje izvora u diplomskim i zavrsnim radovima na Pravnom fakultetu Sveucilista u Zagrebu](https://www.pravo.unizg.hr/wp-content/uploads/2024/05/Upute-za-oblikovanje-i-uredenje-teksta-i-navodenje-izvora_diplomski_zavrsni_rad.pdf) | odjeljak 4. Oblikovanje i uredenje teksta |
| Razmak prije i poslije odlomka | `paragraph-spacing-fixer` | bez parametara |  |  |
| Razmak prije i poslije fusnota | `footnote-spacing-fixer` | bez parametara |  |  |
| Oblikovanje naslova po razinama | `heading-format-fixer` | razina 1 12 pt lijevo; razina 2 12 pt podebljano lijevo; razina 3 12 pt podebljano kurziv lijevo |  |  |
| Font i veličina fusnota | `footnote-typography-fixer` | Times New Roman, 10 pt |  |  |
| Velika slova naslova | `heading-case-fixer` | velika slova, razine 1<br><sub>Trazi izricitu privolu (mijenja autorov tekst ili strukturu).</sub> |  |  |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Sadrzaj kao zivo TOC polje | `toc-field-fixer` | Word sam azurira sadrzaj<br><sub>Dokument ima naslov Sadrzaj, a jos nema zivo TOC polje. Nedestruktivno: rucne stavke se ne brisu.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Pravni fakultet · Sveučilišni diplomski studij Socijalna politika · diplomski rad

`pravo-socijalna-politika-diplomski` · status: verified · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font glavnog teksta | `font-fixer` | Times New Roman | [Upute za izradu diplomskog rada iz socijalnih djelatnosti - Socijalni rad i socijalna politika](https://www.pravo.unizg.hr/wp-content/uploads/2023/02/Upute_za_izradu_diplomskog_rada_2021-22_1.pdf) | str. 11, Upute za oblikovanje teksta rada, t.1 |
| Velicina fonta glavnog teksta | `font-fixer` | 12 pt | [Upute za izradu diplomskog rada iz socijalnih djelatnosti - Socijalni rad i socijalna politika](https://www.pravo.unizg.hr/wp-content/uploads/2023/02/Upute_za_izradu_diplomskog_rada_2021-22_1.pdf) | str. 11, Upute za oblikovanje teksta rada, t.1 |
| Prored glavnog teksta | `line-spacing-fixer` | prored 1,5 | [Upute za izradu diplomskog rada iz socijalnih djelatnosti - Socijalni rad i socijalna politika](https://www.pravo.unizg.hr/wp-content/uploads/2023/02/Upute_za_izradu_diplomskog_rada_2021-22_1.pdf) | str. 11, Upute za oblikovanje teksta rada, t.1 |
| Margine | `margins-fixer` | 3 / 3 / 3 / 3,5 cm (gore/desno/dolje/lijevo) | [Upute za izradu diplomskog rada iz socijalnih djelatnosti - Socijalni rad i socijalna politika](https://www.pravo.unizg.hr/wp-content/uploads/2023/02/Upute_za_izradu_diplomskog_rada_2021-22_1.pdf) | str. 11, odjeljak 'Upute za oblikovanje teksta rada' (1. Osnovne upute) |
| A4 format | `paper-size-fixer` | 21 x 29,7 cm |  |  |
| Poravnanje | `alignment-fixer` | obostrano | [Upute za izradu diplomskog rada iz socijalnih djelatnosti - Socijalni rad i socijalna politika](https://www.pravo.unizg.hr/wp-content/uploads/2023/02/Upute_za_izradu_diplomskog_rada_2021-22_1.pdf) | str. 11, odjeljak 'Upute za oblikovanje teksta rada' (1. Osnovne upute) |
| Položaj broja stranice | `page-number-alignment-fixer` | broj stranice right |  |  |
| Oblikovanje naslova po razinama | `heading-format-fixer` | razina 1 12 pt podebljano lijevo; razina 2 12 pt kurziv lijevo; razina 3 12 pt kurziv lijevo; razina 4 12 pt kurziv lijevo; razina 5 12 pt kurziv lijevo |  |  |
| Font i veličina fusnota | `footnote-typography-fixer` | 10 pt |  |  |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Numeriranje stranica od Uvoda | `page-numbering-fixer / section-insert-fixer` | prednji listovi rimski, glavni tekst arapski od 1, broj right<br><sub>Uvod je prepoznat. Kad prijelom sekcije vec pada tocno na Uvod, postavlja se numeriranje nad postojecim sekcijama; kad prijeloma nema (jednosekcijski rad), umece se prijelom, uz izricitu potvrdu mjesta.</sub> |  |  |
| Sadrzaj kao zivo TOC polje | `toc-field-fixer` | Word sam azurira sadrzaj<br><sub>Dokument ima naslov Sadrzaj, a jos nema zivo TOC polje. Nedestruktivno: rucne stavke se ne brisu.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Pravni fakultet · poslijediplomski studiji socijalnih djelatnosti · doktorska disertacija

`pravo-socijalne-djelatnosti-doktorski` · status: partial · vrste rada: doctoral

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font glavnog teksta | `font-fixer` | Times New Roman | [Upute za studente poslijediplomskih studija iz socijalnih djelatnosti (socijalni rad i socijalna politika)](https://www.pravo.unizg.hr/wp-content/uploads/2023/02/Upute1_poslijediplomski.pdf) | str. 7, Format teksta |
| Velicina fonta glavnog teksta | `font-fixer` | 12 pt | [Upute za studente poslijediplomskih studija iz socijalnih djelatnosti (socijalni rad i socijalna politika)](https://www.pravo.unizg.hr/wp-content/uploads/2023/02/Upute1_poslijediplomski.pdf) | str. 7, Format teksta |
| Prored glavnog teksta | `line-spacing-fixer` | prored 1,5 | [Upute za studente poslijediplomskih studija iz socijalnih djelatnosti (socijalni rad i socijalna politika)](https://www.pravo.unizg.hr/wp-content/uploads/2023/02/Upute1_poslijediplomski.pdf) | str. 7, Format teksta |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Upute za studente poslijediplomskih studija iz socijalnih djelatnosti (socijalni rad i socijalna politika)](https://www.pravo.unizg.hr/wp-content/uploads/2023/02/Upute1_poslijediplomski.pdf) | str. 7, Format teksta |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Sadrzaj kao zivo TOC polje | `toc-field-fixer` | Word sam azurira sadrzaj<br><sub>Dokument ima naslov Sadrzaj, a jos nema zivo TOC polje. Nedestruktivno: rucne stavke se ne brisu.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Pravni fakultet · poslijediplomski studiji socijalnih djelatnosti · specijalistički završni rad

`pravo-socijalne-djelatnosti-specijalisticki` · status: partial · vrste rada: specialist

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font glavnog teksta | `font-fixer` | Times New Roman | [Upute za studente poslijediplomskih studija iz socijalnih djelatnosti (socijalni rad i socijalna politika)](https://www.pravo.unizg.hr/wp-content/uploads/2023/02/Upute1_poslijediplomski.pdf) | str. 7, Format teksta |
| Velicina fonta glavnog teksta | `font-fixer` | 12 pt | [Upute za studente poslijediplomskih studija iz socijalnih djelatnosti (socijalni rad i socijalna politika)](https://www.pravo.unizg.hr/wp-content/uploads/2023/02/Upute1_poslijediplomski.pdf) | str. 7, Format teksta |
| Prored glavnog teksta | `line-spacing-fixer` | prored 1,5 | [Upute za studente poslijediplomskih studija iz socijalnih djelatnosti (socijalni rad i socijalna politika)](https://www.pravo.unizg.hr/wp-content/uploads/2023/02/Upute1_poslijediplomski.pdf) | str. 7, Format teksta |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Upute za studente poslijediplomskih studija iz socijalnih djelatnosti (socijalni rad i socijalna politika)](https://www.pravo.unizg.hr/wp-content/uploads/2023/02/Upute1_poslijediplomski.pdf) | str. 7, Format teksta |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Sadrzaj kao zivo TOC polje | `toc-field-fixer` | Word sam azurira sadrzaj<br><sub>Dokument ima naslov Sadrzaj, a jos nema zivo TOC polje. Nedestruktivno: rucne stavke se ne brisu.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Pravni fakultet · Socijalni rad/Socijalna politika · opći akademski rad

`pravo-socijalni-opci-akademski-rad` · status: partial · vrste rada: seminar, project, article

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font glavnog teksta | `font-fixer` | Times New Roman | [Upute za izradu zavrsnog rada - Sveucilisni prijediplomski studij Socijalni rad](https://www.pravo.unizg.hr/wp-content/uploads/2025/01/Upute-za-izradu-zavrsnog-rada-2024-25.pdf) | str. 8, Upute za oblikovanje teksta, t.1 Osnovne upute |
| Velicina fonta glavnog teksta | `font-fixer` | 12 pt | [Upute za izradu zavrsnog rada - Sveucilisni prijediplomski studij Socijalni rad](https://www.pravo.unizg.hr/wp-content/uploads/2025/01/Upute-za-izradu-zavrsnog-rada-2024-25.pdf) | str. 8, Upute za oblikovanje teksta, t.1 Osnovne upute |
| Prored glavnog teksta | `line-spacing-fixer` | prored 1,5 | [Upute za izradu zavrsnog rada - Sveucilisni prijediplomski studij Socijalni rad](https://www.pravo.unizg.hr/wp-content/uploads/2025/01/Upute-za-izradu-zavrsnog-rada-2024-25.pdf) | str. 8, Upute za oblikovanje teksta, t.1 |
| Margine | `margins-fixer` | 3 / 3 / 3 / 3,5 cm (gore/desno/dolje/lijevo) | [Upute za izradu zavrsnog rada - Sveucilisni prijediplomski studij Socijalni rad](https://www.pravo.unizg.hr/wp-content/uploads/2025/01/Upute-za-izradu-zavrsnog-rada-2024-25.pdf) | str. 8, Upute za oblikovanje teksta, t.1 |
| A4 format | `paper-size-fixer` | 21 x 29,7 cm |  |  |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Pravni fakultet · Sveučilišni diplomski studij Socijalni rad · diplomski rad

`pravo-socijalni-rad-diplomski` · status: verified · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font glavnog teksta | `font-fixer` | Times New Roman | [Upute za izradu diplomskog rada iz socijalnih djelatnosti - Socijalni rad i socijalna politika](https://www.pravo.unizg.hr/wp-content/uploads/2023/02/Upute_za_izradu_diplomskog_rada_2021-22_1.pdf) | str. 11, Upute za oblikovanje teksta rada, t.1 |
| Velicina fonta glavnog teksta | `font-fixer` | 12 pt | [Upute za izradu diplomskog rada iz socijalnih djelatnosti - Socijalni rad i socijalna politika](https://www.pravo.unizg.hr/wp-content/uploads/2023/02/Upute_za_izradu_diplomskog_rada_2021-22_1.pdf) | str. 11, Upute za oblikovanje teksta rada, t.1 |
| Prored glavnog teksta | `line-spacing-fixer` | prored 1,5 | [Upute za izradu diplomskog rada iz socijalnih djelatnosti - Socijalni rad i socijalna politika](https://www.pravo.unizg.hr/wp-content/uploads/2023/02/Upute_za_izradu_diplomskog_rada_2021-22_1.pdf) | str. 11, Upute za oblikovanje teksta rada, t.1 |
| Margine | `margins-fixer` | 3 / 3 / 3 / 3,5 cm (gore/desno/dolje/lijevo) | [Upute za izradu diplomskog rada iz socijalnih djelatnosti - Socijalni rad i socijalna politika](https://www.pravo.unizg.hr/wp-content/uploads/2023/02/Upute_za_izradu_diplomskog_rada_2021-22_1.pdf) | str. 11, odjeljak 'Upute za oblikovanje teksta rada' (1. Osnovne upute) |
| A4 format | `paper-size-fixer` | 21 x 29,7 cm |  |  |
| Poravnanje | `alignment-fixer` | obostrano | [Upute za izradu diplomskog rada iz socijalnih djelatnosti - Socijalni rad i socijalna politika](https://www.pravo.unizg.hr/wp-content/uploads/2023/02/Upute_za_izradu_diplomskog_rada_2021-22_1.pdf) | str. 11, odjeljak 'Upute za oblikovanje teksta rada' (1. Osnovne upute) |
| Položaj broja stranice | `page-number-alignment-fixer` | broj stranice right |  |  |
| Oblikovanje naslova po razinama | `heading-format-fixer` | razina 1 12 pt podebljano lijevo; razina 2 12 pt kurziv lijevo; razina 3 12 pt kurziv lijevo; razina 4 12 pt kurziv lijevo; razina 5 12 pt kurziv lijevo |  |  |
| Font i veličina fusnota | `footnote-typography-fixer` | 10 pt |  |  |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Numeriranje stranica od Uvoda | `page-numbering-fixer / section-insert-fixer` | prednji listovi rimski, glavni tekst arapski od 1, broj right<br><sub>Uvod je prepoznat. Kad prijelom sekcije vec pada tocno na Uvod, postavlja se numeriranje nad postojecim sekcijama; kad prijeloma nema (jednosekcijski rad), umece se prijelom, uz izricitu potvrdu mjesta.</sub> |  |  |
| Sadrzaj kao zivo TOC polje | `toc-field-fixer` | Word sam azurira sadrzaj<br><sub>Dokument ima naslov Sadrzaj, a jos nema zivo TOC polje. Nedestruktivno: rucne stavke se ne brisu.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Pravni fakultet · prijediplomski Socijalni rad · završni rad

`pravo-socijalni-rad-zavrsni` · status: verified · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font glavnog teksta | `font-fixer` | Times New Roman | [Upute za izradu zavrsnog rada - Sveucilisni prijediplomski studij Socijalni rad](https://www.pravo.unizg.hr/wp-content/uploads/2025/01/Upute-za-izradu-zavrsnog-rada-2024-25.pdf) | str. 8, Upute za oblikovanje teksta, t.1 Osnovne upute |
| Velicina fonta glavnog teksta | `font-fixer` | 12 pt | [Upute za izradu zavrsnog rada - Sveucilisni prijediplomski studij Socijalni rad](https://www.pravo.unizg.hr/wp-content/uploads/2025/01/Upute-za-izradu-zavrsnog-rada-2024-25.pdf) | str. 8, Upute za oblikovanje teksta, t.1 Osnovne upute |
| Prored glavnog teksta | `line-spacing-fixer` | prored 1,5 | [Upute za izradu zavrsnog rada - Sveucilisni prijediplomski studij Socijalni rad](https://www.pravo.unizg.hr/wp-content/uploads/2025/01/Upute-za-izradu-zavrsnog-rada-2024-25.pdf) | str. 8, Upute za oblikovanje teksta, t.1 |
| Margine | `margins-fixer` | 3 / 3 / 3 / 3,5 cm (gore/desno/dolje/lijevo) | [Upute za izradu zavrsnog rada - Sveucilisni prijediplomski studij Socijalni rad](https://www.pravo.unizg.hr/wp-content/uploads/2025/01/Upute-za-izradu-zavrsnog-rada-2024-25.pdf) | str. 8, Upute za oblikovanje teksta, t.1 |
| A4 format | `paper-size-fixer` | 21 x 29,7 cm |  |  |
| Položaj broja stranice | `page-number-alignment-fixer` | broj stranice right |  |  |
| Oblikovanje naslova po razinama | `heading-format-fixer` | razina 1 12 pt podebljano lijevo; razina 2 12 pt kurziv lijevo; razina 3 12 pt kurziv lijevo; razina 4 12 pt kurziv lijevo; razina 5 12 pt kurziv lijevo |  |  |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Numeriranje stranica od Uvoda | `page-numbering-fixer / section-insert-fixer` | prednji listovi rimski, glavni tekst arapski od 1, broj right<br><sub>Uvod je prepoznat. Kad prijelom sekcije vec pada tocno na Uvod, postavlja se numeriranje nad postojecim sekcijama; kad prijeloma nema (jednosekcijski rad), umece se prijelom, uz izricitu potvrdu mjesta.</sub> |  |  |
| Sadrzaj kao zivo TOC polje | `toc-field-fixer` | Word sam azurira sadrzaj<br><sub>Dokument ima naslov Sadrzaj, a jos nema zivo TOC polje. Nedestruktivno: rucne stavke se ne brisu.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Pravni fakultet · sveučilišni specijalistički studiji prava · završni specijalistički rad

`pravo-specijalisticki-pravni-opci` · status: partial · vrste rada: specialist

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font glavnog teksta | `font-fixer` | Times New Roman | [Upute za oblikovanje i uredenje teksta i navodenje izvora u diplomskim i zavrsnim radovima na Pravnom fakultetu Sveucilista u Zagrebu](https://www.pravo.unizg.hr/wp-content/uploads/2024/05/Upute-za-oblikovanje-i-uredenje-teksta-i-navodenje-izvora_diplomski_zavrsni_rad.pdf) | odjeljak 4. Oblikovanje i uredenje teksta |
| Velicina fonta glavnog teksta | `font-fixer` | 12 pt | [Upute za oblikovanje i uredenje teksta i navodenje izvora u diplomskim i zavrsnim radovima na Pravnom fakultetu Sveucilista u Zagrebu](https://www.pravo.unizg.hr/wp-content/uploads/2024/05/Upute-za-oblikovanje-i-uredenje-teksta-i-navodenje-izvora_diplomski_zavrsni_rad.pdf) | odjeljak 4. Oblikovanje i uredenje teksta |
| Prored glavnog teksta | `line-spacing-fixer` | prored 1,5 | [Upute za oblikovanje i uredenje teksta i navodenje izvora u diplomskim i zavrsnim radovima na Pravnom fakultetu Sveucilista u Zagrebu](https://www.pravo.unizg.hr/wp-content/uploads/2024/05/Upute-za-oblikovanje-i-uredenje-teksta-i-navodenje-izvora_diplomski_zavrsni_rad.pdf) | odjeljak 4. Oblikovanje i uredenje teksta |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) |  |  |
| Poravnanje glavnog teksta | `alignment-fixer` | obostrano | [Upute za oblikovanje i uredenje teksta i navodenje izvora u diplomskim i zavrsnim radovima na Pravnom fakultetu Sveucilista u Zagrebu](https://www.pravo.unizg.hr/wp-content/uploads/2024/05/Upute-za-oblikovanje-i-uredenje-teksta-i-navodenje-izvora_diplomski_zavrsni_rad.pdf) | odjeljak 4. Oblikovanje i uredenje teksta |
| Font i veličina fusnota | `footnote-typography-fixer` | Times New Roman, 10 pt |  |  |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### pravos

#### Pravni fakultet Osijek, diplomski rad

`pravos-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Upute za pisanje i predaju zavrsnog/diplomskog rada (Pravni fakultet Osijek)](https://www.pravos.unios.hr/pravo-arhiva/download/upute-za-izradu-zavsnih-radova.pdf) | dio II Tekst rada |
| Margine | `margins-fixer` | 2,5 / 2 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Upute za pisanje i predaju zavrsnog/diplomskog rada (Pravni fakultet Osijek)](https://www.pravos.unios.hr/pravo-arhiva/download/upute-za-izradu-zavsnih-radova.pdf) | dio II Tekst rada |
| Vrsta slova | `font-fixer` | Times New Roman | [Upute za pisanje i predaju zavrsnog/diplomskog rada (Pravni fakultet Osijek)](https://www.pravos.unios.hr/pravo-arhiva/download/upute-za-izradu-zavsnih-radova.pdf) | dio II Tekst rada |
| Velicina slova | `font-fixer` | 12 pt | [Upute za pisanje i predaju zavrsnog/diplomskog rada (Pravni fakultet Osijek)](https://www.pravos.unios.hr/pravo-arhiva/download/upute-za-izradu-zavsnih-radova.pdf) | dio II Tekst rada |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za pisanje i predaju zavrsnog/diplomskog rada (Pravni fakultet Osijek)](https://www.pravos.unios.hr/pravo-arhiva/download/upute-za-izradu-zavsnih-radova.pdf) | dio II Tekst rada |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Pravni fakultet Osijek, završni rad

`pravos-zavrsni` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Upute za pisanje i predaju zavrsnog/diplomskog rada (Pravni fakultet Osijek)](https://www.pravos.unios.hr/pravo-arhiva/download/upute-za-izradu-zavsnih-radova.pdf) | dio II Tekst rada |
| Margine | `margins-fixer` | 2,5 / 2 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Upute za pisanje i predaju zavrsnog/diplomskog rada (Pravni fakultet Osijek)](https://www.pravos.unios.hr/pravo-arhiva/download/upute-za-izradu-zavsnih-radova.pdf) | dio II Tekst rada |
| Vrsta slova | `font-fixer` | Times New Roman | [Upute za pisanje i predaju zavrsnog/diplomskog rada (Pravni fakultet Osijek)](https://www.pravos.unios.hr/pravo-arhiva/download/upute-za-izradu-zavsnih-radova.pdf) | dio II Tekst rada |
| Velicina slova | `font-fixer` | 12 pt | [Upute za pisanje i predaju zavrsnog/diplomskog rada (Pravni fakultet Osijek)](https://www.pravos.unios.hr/pravo-arhiva/download/upute-za-izradu-zavsnih-radova.pdf) | dio II Tekst rada |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za pisanje i predaju zavrsnog/diplomskog rada (Pravni fakultet Osijek)](https://www.pravos.unios.hr/pravo-arhiva/download/upute-za-izradu-zavsnih-radova.pdf) | dio II Tekst rada |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### pravri

#### PRAVRI, diplomski rad

`pravri-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Upute za izradu studentskih pisanih radova (PRAVRI, rev. 2023)](https://pravri.uniri.hr/files/Dokumenti/Pravilnici/uputeradovi.pdf) | poglavlje 2.1 Normativ stranice (str. 7) |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Upute za izradu studentskih pisanih radova (PRAVRI, rev. 2023)](https://pravri.uniri.hr/files/Dokumenti/Pravilnici/uputeradovi.pdf) | poglavlje 2.1 Normativ stranice (str. 7) |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za izradu studentskih pisanih radova (PRAVRI, rev. 2023)](https://pravri.uniri.hr/files/Dokumenti/Pravilnici/uputeradovi.pdf) | poglavlje 2.1 Normativ stranice (str. 7) |
| Vrsta slova | `font-fixer` | Times New Roman | [Upute za izradu studentskih pisanih radova (PRAVRI, rev. 2023)](https://pravri.uniri.hr/files/Dokumenti/Pravilnici/uputeradovi.pdf) | poglavlje 2.1 Normativ stranice (str. 7) |
| Velicina slova | `font-fixer` | 12 pt | [Upute za izradu studentskih pisanih radova (PRAVRI, rev. 2023)](https://pravri.uniri.hr/files/Dokumenti/Pravilnici/uputeradovi.pdf) | poglavlje 2.1 Normativ stranice (str. 7) |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### PRAVRI · opći akademski rad (seminar/projekt)

`pravri-opci-akademski-rad` · status: partial · vrste rada: seminar, project, article

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Times New Roman | [Upute za izradu studentskih pisanih radova (PRAVRI, rev. 2023)](https://pravri.uniri.hr/files/Dokumenti/Pravilnici/uputeradovi.pdf) | 2.1. Normativ stranice / Kartica teksta |
| Velicina slova | `font-fixer` | 12 pt | [Upute za izradu studentskih pisanih radova (PRAVRI, rev. 2023)](https://pravri.uniri.hr/files/Dokumenti/Pravilnici/uputeradovi.pdf) | 2.1. Normativ stranice / Kartica teksta |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za izradu studentskih pisanih radova (PRAVRI, rev. 2023)](https://pravri.uniri.hr/files/Dokumenti/Pravilnici/uputeradovi.pdf) | 2.1. Normativ stranice / Kartica teksta |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Upute za izradu studentskih pisanih radova (PRAVRI, rev. 2023)](https://pravri.uniri.hr/files/Dokumenti/Pravilnici/uputeradovi.pdf) | 2.1. Normativ stranice / Kartica teksta |
| Format papira A4 | `paper-size-fixer` | 21 x 29,7 cm | [Upute za izradu studentskih pisanih radova (PRAVRI, rev. 2023)](https://pravri.uniri.hr/files/Dokumenti/Pravilnici/uputeradovi.pdf) | 2.1. Normativ stranice / Kartica teksta |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Pravni fakultet u Rijeci, završni rad sveučilišnog specijalističkog studija

`pravri-specijalisticki` · status: partial · vrste rada: specialist

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Upute za izradu studentskih pisanih radova (PRAVRI, rev. 2023)](https://pravri.uniri.hr/files/Dokumenti/Pravilnici/uputeradovi.pdf) | poglavlje 2.1 Normativ stranice (str. 7) |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Upute za izradu studentskih pisanih radova (PRAVRI, rev. 2023)](https://pravri.uniri.hr/files/Dokumenti/Pravilnici/uputeradovi.pdf) | poglavlje 2.1 Normativ stranice (str. 7) |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za izradu studentskih pisanih radova (PRAVRI, rev. 2023)](https://pravri.uniri.hr/files/Dokumenti/Pravilnici/uputeradovi.pdf) | poglavlje 2.1 Normativ stranice (str. 7) |
| Vrsta slova | `font-fixer` | Times New Roman | [Upute za izradu studentskih pisanih radova (PRAVRI, rev. 2023)](https://pravri.uniri.hr/files/Dokumenti/Pravilnici/uputeradovi.pdf) | poglavlje 2.1 Normativ stranice (str. 7) |
| Velicina slova | `font-fixer` | 12 pt | [Upute za izradu studentskih pisanih radova (PRAVRI, rev. 2023)](https://pravri.uniri.hr/files/Dokumenti/Pravilnici/uputeradovi.pdf) | poglavlje 2.1 Normativ stranice (str. 7) |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### PRAVRI, završni rad

`pravri-zavrsni` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Upute za izradu studentskih pisanih radova (PRAVRI, rev. 2023)](https://pravri.uniri.hr/files/Dokumenti/Pravilnici/uputeradovi.pdf) | poglavlje 2.1 Normativ stranice (str. 7) |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Upute za izradu studentskih pisanih radova (PRAVRI, rev. 2023)](https://pravri.uniri.hr/files/Dokumenti/Pravilnici/uputeradovi.pdf) | poglavlje 2.1 Normativ stranice (str. 7) |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za izradu studentskih pisanih radova (PRAVRI, rev. 2023)](https://pravri.uniri.hr/files/Dokumenti/Pravilnici/uputeradovi.pdf) | poglavlje 2.1 Normativ stranice (str. 7) |
| Vrsta slova | `font-fixer` | Times New Roman | [Upute za izradu studentskih pisanih radova (PRAVRI, rev. 2023)](https://pravri.uniri.hr/files/Dokumenti/Pravilnici/uputeradovi.pdf) | poglavlje 2.1 Normativ stranice (str. 7) |
| Velicina slova | `font-fixer` | 12 pt | [Upute za izradu studentskih pisanih radova (PRAVRI, rev. 2023)](https://pravri.uniri.hr/files/Dokumenti/Pravilnici/uputeradovi.pdf) | poglavlje 2.1 Normativ stranice (str. 7) |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### ptfos

#### PTFOS, diplomski rad

`ptfos-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Upute za pisanje, ocjenu i obranu diplomskog rada (PTFOS, 2020)](https://www.ptfos.unios.hr/images/dokumenti/studenti/Odluke-pravilnici-upute/Upute/ptf_upute_za_diplomske_radove_07-2020.pdf) | pogl. Izgled rada |
| Margine | `margins-fixer` | 2,5 / 2 / 2,5 / 3 cm (gore/desno/dolje/lijevo) | [Upute za pisanje, ocjenu i obranu diplomskog rada (PTFOS, 2020)](https://www.ptfos.unios.hr/images/dokumenti/studenti/Odluke-pravilnici-upute/Upute/ptf_upute_za_diplomske_radove_07-2020.pdf) | pogl. Izgled rada |
| Vrsta slova (Arial ili Calibri) | `font-fixer` | Arial | [Upute za pisanje, ocjenu i obranu diplomskog rada (PTFOS, 2020)](https://www.ptfos.unios.hr/images/dokumenti/studenti/Odluke-pravilnici-upute/Upute/ptf_upute_za_diplomske_radove_07-2020.pdf) | pogl. Oblikovanje teksta |
| Velicina slova (Arial 11 / Calibri 12) | `font-fixer` | 11 pt | [Upute za pisanje, ocjenu i obranu diplomskog rada (PTFOS, 2020)](https://www.ptfos.unios.hr/images/dokumenti/studenti/Odluke-pravilnici-upute/Upute/ptf_upute_za_diplomske_radove_07-2020.pdf) | pogl. Oblikovanje teksta |
| Obostrano poravnanje | `alignment-fixer` | obostrano | [Upute za pisanje, ocjenu i obranu diplomskog rada (PTFOS, 2020)](https://www.ptfos.unios.hr/images/dokumenti/studenti/Odluke-pravilnici-upute/Upute/ptf_upute_za_diplomske_radove_07-2020.pdf) | pogl. Oblikovanje teksta |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za pisanje, ocjenu i obranu diplomskog rada (PTFOS, 2020)](https://www.ptfos.unios.hr/images/dokumenti/studenti/Odluke-pravilnici-upute/Upute/ptf_upute_za_diplomske_radove_07-2020.pdf) | pogl. Oblikovanje teksta |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### pvzg

#### PVZG, specijalistički diplomski rad

`pvzg-specijalisticki` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Pravilnik o zavrsnom radu na preddiplomskim strucnim i specijalistickim diplomskim strucnim studijima (PVZG, 2018)](https://pvzg.hr/wp-content/uploads/2022/09/Pravilnik-o-zavrsnom-radu-PVZG-2018-compressed.pdf) | Članak 18. (Tehnicko uredivanje teksta) |
| Vrsta slova | `font-fixer` | Times New Roman | [Pravilnik o zavrsnom radu na preddiplomskim strucnim i specijalistickim diplomskim strucnim studijima (PVZG, 2018)](https://pvzg.hr/wp-content/uploads/2022/09/Pravilnik-o-zavrsnom-radu-PVZG-2018-compressed.pdf) | Članak 18. (Tehnicko uredivanje teksta) |
| Velicina slova | `font-fixer` | 12 pt | [Pravilnik o zavrsnom radu na preddiplomskim strucnim i specijalistickim diplomskim strucnim studijima (PVZG, 2018)](https://pvzg.hr/wp-content/uploads/2022/09/Pravilnik-o-zavrsnom-radu-PVZG-2018-compressed.pdf) | Članak 18. (Tehnicko uredivanje teksta) |
| Prored | `line-spacing-fixer` | prored 1,5 | [Pravilnik o zavrsnom radu na preddiplomskim strucnim i specijalistickim diplomskim strucnim studijima (PVZG, 2018)](https://pvzg.hr/wp-content/uploads/2022/09/Pravilnik-o-zavrsnom-radu-PVZG-2018-compressed.pdf) | Članak 18. (Tehnicko uredivanje teksta) |
| Obostrano poravnanje | `alignment-fixer` | obostrano | [Pravilnik o zavrsnom radu na preddiplomskim strucnim i specijalistickim diplomskim strucnim studijima (PVZG, 2018)](https://pvzg.hr/wp-content/uploads/2022/09/Pravilnik-o-zavrsnom-radu-PVZG-2018-compressed.pdf) | Članak 18. (Tehnicko uredivanje teksta) |
| Margine | `margins-fixer` | 3 / 2 / 3 / 3 cm (gore/desno/dolje/lijevo) | [Pravilnik o zavrsnom radu na preddiplomskim strucnim i specijalistickim diplomskim strucnim studijima (PVZG, 2018)](https://pvzg.hr/wp-content/uploads/2022/09/Pravilnik-o-zavrsnom-radu-PVZG-2018-compressed.pdf) | Članak 18. (Tehnicko uredivanje teksta) |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### PVZG, završni rad

`pvzg-zavrsni` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Pravilnik o zavrsnom radu na preddiplomskim strucnim i specijalistickim diplomskim strucnim studijima (PVZG, 2018)](https://pvzg.hr/wp-content/uploads/2022/09/Pravilnik-o-zavrsnom-radu-PVZG-2018-compressed.pdf) | Članak 18. (Tehnicko uredivanje teksta) |
| Vrsta slova | `font-fixer` | Times New Roman | [Pravilnik o zavrsnom radu na preddiplomskim strucnim i specijalistickim diplomskim strucnim studijima (PVZG, 2018)](https://pvzg.hr/wp-content/uploads/2022/09/Pravilnik-o-zavrsnom-radu-PVZG-2018-compressed.pdf) | Članak 18. (Tehnicko uredivanje teksta) |
| Velicina slova | `font-fixer` | 12 pt | [Pravilnik o zavrsnom radu na preddiplomskim strucnim i specijalistickim diplomskim strucnim studijima (PVZG, 2018)](https://pvzg.hr/wp-content/uploads/2022/09/Pravilnik-o-zavrsnom-radu-PVZG-2018-compressed.pdf) | Članak 18. (Tehnicko uredivanje teksta) |
| Prored | `line-spacing-fixer` | prored 1,5 | [Pravilnik o zavrsnom radu na preddiplomskim strucnim i specijalistickim diplomskim strucnim studijima (PVZG, 2018)](https://pvzg.hr/wp-content/uploads/2022/09/Pravilnik-o-zavrsnom-radu-PVZG-2018-compressed.pdf) | Članak 18. (Tehnicko uredivanje teksta) |
| Obostrano poravnanje | `alignment-fixer` | obostrano | [Pravilnik o zavrsnom radu na preddiplomskim strucnim i specijalistickim diplomskim strucnim studijima (PVZG, 2018)](https://pvzg.hr/wp-content/uploads/2022/09/Pravilnik-o-zavrsnom-radu-PVZG-2018-compressed.pdf) | Članak 18. (Tehnicko uredivanje teksta) |
| Margine | `margins-fixer` | 3 / 2 / 3 / 3 cm (gore/desno/dolje/lijevo) | [Pravilnik o zavrsnom radu na preddiplomskim strucnim i specijalistickim diplomskim strucnim studijima (PVZG, 2018)](https://pvzg.hr/wp-content/uploads/2022/09/Pravilnik-o-zavrsnom-radu-PVZG-2018-compressed.pdf) | Članak 18. (Tehnicko uredivanje teksta) |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### rgnf

#### Rudarsko-geolosko-naftni fakultet, diplomski rad

`rgnf-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Vrsta slova | `font-fixer` | Times New Roman | [Predlozak zavrsnog ili diplomskog rada (RGNF)](https://www.rgn.unizg.hr/images/studentska_referada/2022/Predlo%C5%BEak_zavr%C5%A1nog_ili_diplomskog_rada.docx) | odjeljak 2.1 Tekst rada i postavke stranica (Predlozak) |
| Velicina slova | `font-fixer` | 12 pt | [Predlozak zavrsnog ili diplomskog rada (RGNF)](https://www.rgn.unizg.hr/images/studentska_referada/2022/Predlo%C5%BEak_zavr%C5%A1nog_ili_diplomskog_rada.docx) | odjeljak 2.1 Tekst rada i postavke stranica (Predlozak) |
| Prored | `line-spacing-fixer` | prored 1,5 | [Predlozak zavrsnog ili diplomskog rada (RGNF)](https://www.rgn.unizg.hr/images/studentska_referada/2022/Predlo%C5%BEak_zavr%C5%A1nog_ili_diplomskog_rada.docx) | odjeljak 2.1 Tekst rada i postavke stranica (Predlozak) |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 3 cm (gore/desno/dolje/lijevo) | [Predlozak zavrsnog ili diplomskog rada (RGNF)](https://www.rgn.unizg.hr/images/studentska_referada/2022/Predlo%C5%BEak_zavr%C5%A1nog_ili_diplomskog_rada.docx) | odjeljak 2.1 Tekst rada i postavke stranica (Predlozak) |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Sadrzaj kao zivo TOC polje | `toc-field-fixer` | Word sam azurira sadrzaj<br><sub>Dokument ima naslov Sadrzaj, a jos nema zivo TOC polje. Nedestruktivno: rucne stavke se ne brisu.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Rudarsko-geolosko-naftni fakultet, završni rad

`rgnf-zavrsni` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Vrsta slova | `font-fixer` | Times New Roman | [Predlozak zavrsnog ili diplomskog rada (RGNF)](https://www.rgn.unizg.hr/images/studentska_referada/2022/Predlo%C5%BEak_zavr%C5%A1nog_ili_diplomskog_rada.docx) | odjeljak 2.1 Tekst rada i postavke stranica (Predlozak) |
| Velicina slova | `font-fixer` | 12 pt | [Predlozak zavrsnog ili diplomskog rada (RGNF)](https://www.rgn.unizg.hr/images/studentska_referada/2022/Predlo%C5%BEak_zavr%C5%A1nog_ili_diplomskog_rada.docx) | odjeljak 2.1 Tekst rada i postavke stranica (Predlozak) |
| Prored | `line-spacing-fixer` | prored 1,5 | [Predlozak zavrsnog ili diplomskog rada (RGNF)](https://www.rgn.unizg.hr/images/studentska_referada/2022/Predlo%C5%BEak_zavr%C5%A1nog_ili_diplomskog_rada.docx) | odjeljak 2.1 Tekst rada i postavke stranica (Predlozak) |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 3 cm (gore/desno/dolje/lijevo) | [Predlozak zavrsnog ili diplomskog rada (RGNF)](https://www.rgn.unizg.hr/images/studentska_referada/2022/Predlo%C5%BEak_zavr%C5%A1nog_ili_diplomskog_rada.docx) | odjeljak 2.1 Tekst rada i postavke stranica (Predlozak) |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Sadrzaj kao zivo TOC polje | `toc-field-fixer` | Word sam azurira sadrzaj<br><sub>Dokument ima naslov Sadrzaj, a jos nema zivo TOC polje. Nedestruktivno: rucne stavke se ne brisu.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### riteh

#### Rijeka - Tehnički fakultet, diplomski rad

`riteh-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font (preporuka) | `font-fixer` | Times New Roman | [Upute za izradu i samoarhiviranje završnog / diplomskog rada (RITEH, 2025)](https://riteh.uniri.hr/wp-content/uploads/Upute_za_izradu-i-samoarhiviranje_zavrsnog-i-diplomskog-rada-2025.pdf) | Tehnicke upute za izradu pisanog dijela rada, str. 2 |
| Velicina slova (preporuka) | `font-fixer` | 12 pt | [Upute za izradu i samoarhiviranje završnog / diplomskog rada (RITEH, 2025)](https://riteh.uniri.hr/wp-content/uploads/Upute_za_izradu-i-samoarhiviranje_zavrsnog-i-diplomskog-rada-2025.pdf) | Tehnicke upute za izradu pisanog dijela rada, str. 2 |
| Prored (preporuka) | `line-spacing-fixer` | prored 1,5 | [Upute za izradu i samoarhiviranje završnog / diplomskog rada (RITEH, 2025)](https://riteh.uniri.hr/wp-content/uploads/Upute_za_izradu-i-samoarhiviranje_zavrsnog-i-diplomskog-rada-2025.pdf) | Tehnicke upute za izradu pisanog dijela rada, str. 2 |
| Margine (preporuka, lijeva asimetricna) | `margins-fixer` | 2 / 2 / 2 / 2,5 cm (gore/desno/dolje/lijevo) | [Upute za izradu i samoarhiviranje završnog / diplomskog rada (RITEH, 2025)](https://riteh.uniri.hr/wp-content/uploads/Upute_za_izradu-i-samoarhiviranje_zavrsnog-i-diplomskog-rada-2025.pdf) | Tehnicke upute za izradu pisanog dijela rada, str. 2 |
| Poravnanje (preporuka) | `alignment-fixer` | obostrano | [Upute za izradu i samoarhiviranje završnog / diplomskog rada (RITEH, 2025)](https://riteh.uniri.hr/wp-content/uploads/Upute_za_izradu-i-samoarhiviranje_zavrsnog-i-diplomskog-rada-2025.pdf) | Tehnicke upute za izradu pisanog dijela rada, str. 2 |
| Velika slova naslova | `heading-case-fixer` | velika slova, razine 1<br><sub>Trazi izricitu privolu (mijenja autorov tekst ili strukturu).</sub> |  |  |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Rijeka - Tehnički fakultet, završni rad

`riteh-zavrsni` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font (preporuka) | `font-fixer` | Times New Roman | [Upute za izradu i samoarhiviranje završnog / diplomskog rada (RITEH, 2025)](https://riteh.uniri.hr/wp-content/uploads/Upute_za_izradu-i-samoarhiviranje_zavrsnog-i-diplomskog-rada-2025.pdf) | Tehnicke upute za izradu pisanog dijela rada, str. 2 |
| Velicina slova (preporuka) | `font-fixer` | 12 pt | [Upute za izradu i samoarhiviranje završnog / diplomskog rada (RITEH, 2025)](https://riteh.uniri.hr/wp-content/uploads/Upute_za_izradu-i-samoarhiviranje_zavrsnog-i-diplomskog-rada-2025.pdf) | Tehnicke upute za izradu pisanog dijela rada, str. 2 |
| Prored (preporuka) | `line-spacing-fixer` | prored 1,5 | [Upute za izradu i samoarhiviranje završnog / diplomskog rada (RITEH, 2025)](https://riteh.uniri.hr/wp-content/uploads/Upute_za_izradu-i-samoarhiviranje_zavrsnog-i-diplomskog-rada-2025.pdf) | Tehnicke upute za izradu pisanog dijela rada, str. 2 |
| Margine (preporuka, lijeva asimetricna) | `margins-fixer` | 2 / 2 / 2 / 2,5 cm (gore/desno/dolje/lijevo) | [Upute za izradu i samoarhiviranje završnog / diplomskog rada (RITEH, 2025)](https://riteh.uniri.hr/wp-content/uploads/Upute_za_izradu-i-samoarhiviranje_zavrsnog-i-diplomskog-rada-2025.pdf) | Tehnicke upute za izradu pisanog dijela rada, str. 2 |
| Poravnanje (preporuka) | `alignment-fixer` | obostrano | [Upute za izradu i samoarhiviranje završnog / diplomskog rada (RITEH, 2025)](https://riteh.uniri.hr/wp-content/uploads/Upute_za_izradu-i-samoarhiviranje_zavrsnog-i-diplomskog-rada-2025.pdf) | Tehnicke upute za izradu pisanog dijela rada, str. 2 |
| Velika slova naslova | `heading-case-fixer` | velika slova, razine 1<br><sub>Trazi izricitu privolu (mijenja autorov tekst ili strukturu).</sub> |  |  |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### rrif

#### RRiF, završni rad

`rrif-zavrsni` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Upute za izradu zavrsnog rada (RRiF Visoka skola)](https://rvs.hr/content/uploads/2014/07/UPUTE-NOVE1.pdf) | tč. 3.4 Oblikovanje zavrsnog rada (str. 9) |
| Obostrano poravnanje | `alignment-fixer` | obostrano | [Upute za izradu zavrsnog rada (RRiF Visoka skola)](https://rvs.hr/content/uploads/2014/07/UPUTE-NOVE1.pdf) | tč. 3.4 Oblikovanje zavrsnog rada (str. 9) |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za izradu zavrsnog rada (RRiF Visoka skola)](https://rvs.hr/content/uploads/2014/07/UPUTE-NOVE1.pdf) | tč. 3.4 Oblikovanje zavrsnog rada (str. 9) |
| Vrsta slova | `font-fixer` | Times New Roman | [Upute za izradu zavrsnog rada (RRiF Visoka skola)](https://rvs.hr/content/uploads/2014/07/UPUTE-NOVE1.pdf) | tč. 3.4.3 Font teksta (str. 10) |
| Velicina slova | `font-fixer` | 12 pt | [Upute za izradu zavrsnog rada (RRiF Visoka skola)](https://rvs.hr/content/uploads/2014/07/UPUTE-NOVE1.pdf) | tč. 3.4.3 Font teksta (str. 10) |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 3 cm (gore/desno/dolje/lijevo) | [Upute za izradu zavrsnog rada (RRiF Visoka skola)](https://rvs.hr/content/uploads/2014/07/UPUTE-NOVE1.pdf) | tč. 3.4.4 Margine (str. 10) |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### securus

#### Veleuciliste menadzmenta i sigurnosti Securus (Pula), zavrsni rad

`securus-zavrsni` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Pravilnik o završnom radu Veleučilišta menadžmenta i sigurnosti Securus u Puli (travanj 2023.)](https://www.vs-securus.hr/wp-content/uploads/2023/05/Pravilnik-o-zavr%C5%A1nom-radu-Securus-2023.pdf) | Članak 11. stavak 3. |
| Margine | `margins-fixer` | 2,5 / 2 / 2,5 / 3 cm (gore/desno/dolje/lijevo) | [Pravilnik o završnom radu Veleučilišta menadžmenta i sigurnosti Securus u Puli (travanj 2023.)](https://www.vs-securus.hr/wp-content/uploads/2023/05/Pravilnik-o-zavr%C5%A1nom-radu-Securus-2023.pdf) | Članak 11. stavak 3. |
| Vrsta slova | `font-fixer` | Times New Roman | [Pravilnik o završnom radu Veleučilišta menadžmenta i sigurnosti Securus u Puli (travanj 2023.)](https://www.vs-securus.hr/wp-content/uploads/2023/05/Pravilnik-o-zavr%C5%A1nom-radu-Securus-2023.pdf) | Članak 11. stavak 3. |
| Velicina slova | `font-fixer` | 12 pt | [Pravilnik o završnom radu Veleučilišta menadžmenta i sigurnosti Securus u Puli (travanj 2023.)](https://www.vs-securus.hr/wp-content/uploads/2023/05/Pravilnik-o-zavr%C5%A1nom-radu-Securus-2023.pdf) | Članak 11. stavak 3. |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### sfsb

#### Slavonski Brod - Strojarski fakultet, diplomski rad

`unisb-sfsb-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Times New Roman | [Upute za izradu Zavrsnog rada/Diplomskog rada na Sveucilistu u Slavonskom Brodu (Senat, 28.6.2024)](https://unisbhr.sharepoint.com/:b:/s/WebRepozitorij/EUi-Gv2SQ39ErLqIGqAKn-sBKzD3H-jXP_XPsrcpZms7YQ) | Clanak 3. (Oblik i sadrzaj rada) |
| Velicina slova | `font-fixer` | 12 pt | [Upute za izradu Zavrsnog rada/Diplomskog rada na Sveucilistu u Slavonskom Brodu (Senat, 28.6.2024)](https://unisbhr.sharepoint.com/:b:/s/WebRepozitorij/EUi-Gv2SQ39ErLqIGqAKn-sBKzD3H-jXP_XPsrcpZms7YQ) | Clanak 3. (Oblik i sadrzaj rada) |
| Prored (jednostruki) | `line-spacing-fixer` | prored 1 | [Upute za izradu Zavrsnog rada/Diplomskog rada na Sveucilistu u Slavonskom Brodu (Senat, 28.6.2024)](https://unisbhr.sharepoint.com/:b:/s/WebRepozitorij/EUi-Gv2SQ39ErLqIGqAKn-sBKzD3H-jXP_XPsrcpZms7YQ) | Clanak 3. (Oblik i sadrzaj rada) |
| Margine (uvezni rub lijevo 2,5 cm) | `margins-fixer` | 2 / 2 / 2 / 2,5 cm (gore/desno/dolje/lijevo) | [Upute za izradu Zavrsnog rada/Diplomskog rada na Sveucilistu u Slavonskom Brodu (Senat, 28.6.2024)](https://unisbhr.sharepoint.com/:b:/s/WebRepozitorij/EUi-Gv2SQ39ErLqIGqAKn-sBKzD3H-jXP_XPsrcpZms7YQ) | Clanak 3. (Oblik i sadrzaj rada) |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Slavonski Brod - Strojarski fakultet, završni rad

`unisb-sfsb-zavrsni` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Times New Roman | [Upute za izradu Zavrsnog rada/Diplomskog rada na Sveucilistu u Slavonskom Brodu (Senat, 28.6.2024)](https://unisbhr.sharepoint.com/:b:/s/WebRepozitorij/EUi-Gv2SQ39ErLqIGqAKn-sBKzD3H-jXP_XPsrcpZms7YQ) | Clanak 3. (Oblik i sadrzaj rada) |
| Velicina slova | `font-fixer` | 12 pt | [Upute za izradu Zavrsnog rada/Diplomskog rada na Sveucilistu u Slavonskom Brodu (Senat, 28.6.2024)](https://unisbhr.sharepoint.com/:b:/s/WebRepozitorij/EUi-Gv2SQ39ErLqIGqAKn-sBKzD3H-jXP_XPsrcpZms7YQ) | Clanak 3. (Oblik i sadrzaj rada) |
| Prored (jednostruki) | `line-spacing-fixer` | prored 1 | [Upute za izradu Zavrsnog rada/Diplomskog rada na Sveucilistu u Slavonskom Brodu (Senat, 28.6.2024)](https://unisbhr.sharepoint.com/:b:/s/WebRepozitorij/EUi-Gv2SQ39ErLqIGqAKn-sBKzD3H-jXP_XPsrcpZms7YQ) | Clanak 3. (Oblik i sadrzaj rada) |
| Margine (uvezni rub lijevo 2,5 cm) | `margins-fixer` | 2 / 2 / 2 / 2,5 cm (gore/desno/dolje/lijevo) | [Upute za izradu Zavrsnog rada/Diplomskog rada na Sveucilistu u Slavonskom Brodu (Senat, 28.6.2024)](https://unisbhr.sharepoint.com/:b:/s/WebRepozitorij/EUi-Gv2SQ39ErLqIGqAKn-sBKzD3H-jXP_XPsrcpZms7YQ) | Clanak 3. (Oblik i sadrzaj rada) |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### sfzg

#### Stomatoloski fakultet, diplomski rad

`sfzg-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Tip pisma | `font-fixer` | Times New Roman | [Naputak za tehnicko oblikovanje i izradu diplomskog rada (Stomatoloski fakultet Sveucilista u Zagrebu, 2024)](https://www.sfzg.unizg.hr/_download/repository/Naputak%20za%20oblikovanje%20diplomskog%202024.pdf) | odjeljak Postavke stranice i pisma |
| Velicina slova | `font-fixer` | 12 pt | [Naputak za tehnicko oblikovanje i izradu diplomskog rada (Stomatoloski fakultet Sveucilista u Zagrebu, 2024)](https://www.sfzg.unizg.hr/_download/repository/Naputak%20za%20oblikovanje%20diplomskog%202024.pdf) | odjeljak Postavke stranice i pisma |
| Prored | `line-spacing-fixer` | prored 1,5 | [Naputak za tehnicko oblikovanje i izradu diplomskog rada (Stomatoloski fakultet Sveucilista u Zagrebu, 2024)](https://www.sfzg.unizg.hr/_download/repository/Naputak%20za%20oblikovanje%20diplomskog%202024.pdf) | odjeljak Postavke stranice i pisma |
| Obostrano poravnanje | `alignment-fixer` | obostrano | [Naputak za tehnicko oblikovanje i izradu diplomskog rada (Stomatoloski fakultet Sveucilista u Zagrebu, 2024)](https://www.sfzg.unizg.hr/_download/repository/Naputak%20za%20oblikovanje%20diplomskog%202024.pdf) | odjeljak Postavke stranice i pisma |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Naputak za tehnicko oblikovanje i izradu diplomskog rada (Stomatoloski fakultet Sveucilista u Zagrebu, 2024)](https://www.sfzg.unizg.hr/_download/repository/Naputak%20za%20oblikovanje%20diplomskog%202024.pdf) | odjeljak Postavke stranice i pisma |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Sadrzaj kao zivo TOC polje | `toc-field-fixer` | Word sam azurira sadrzaj<br><sub>Dokument ima naslov Sadrzaj, a jos nema zivo TOC polje. Nedestruktivno: rucne stavke se ne brisu.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Stomatoloski fakultet, doktorski rad

`sfzg-doktorski` · status: partial · vrste rada: doctoral

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Times New Roman | [Upute za oblikovanje doktorskog rada (Obrazac DR.SC.-08)](https://www.unizg.hr/nc/vijest/article/obrasci-za-doktorski-studij/) | odjeljak 'Postavke stranice' (DR.SC.-08, Upute za oblikovanje doktorskog rada) |
| Velicina slova | `font-fixer` | 12 pt | [Upute za oblikovanje doktorskog rada (Obrazac DR.SC.-08)](https://www.unizg.hr/nc/vijest/article/obrasci-za-doktorski-studij/) | odjeljak 'Postavke stranice' (DR.SC.-08, Upute za oblikovanje doktorskog rada) |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za oblikovanje doktorskog rada (Obrazac DR.SC.-08)](https://www.unizg.hr/nc/vijest/article/obrasci-za-doktorski-studij/) | odjeljak 'Postavke stranice' (DR.SC.-08, Upute za oblikovanje doktorskog rada) |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Upute za oblikovanje doktorskog rada (Obrazac DR.SC.-08)](https://www.unizg.hr/nc/vijest/article/obrasci-za-doktorski-studij/) | odjeljak 'Postavke stranice' (DR.SC.-08, Upute za oblikovanje doktorskog rada) |
| Format papira A4 | `paper-size-fixer` | 21 x 29,7 cm | [Upute za oblikovanje doktorskog rada (Obrazac DR.SC.-08)](https://www.unizg.hr/nc/vijest/article/obrasci-za-doktorski-studij/) | odjeljak 'Postavke stranice' (DR.SC.-08, Upute za oblikovanje doktorskog rada) |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### simet

#### Metalurski fakultet (Sisak), zavrsni rad

`simet-zavrsni` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Vrsta slova | `font-fixer` | Times New Roman | [Pravilnik o studiranju na preddiplomskim studijima i diplomskom studiju Metalurskog fakulteta (Prilog II: Naputak o zavrsnom radu)](https://arhiva.simet.hr/vidik.simet.hr/simet/hr/nastava/osnovna-pravila-studiranja/pravilnik-o-studiranju/Pravilnik%20o%20studiranju%20na%20preddiplomskim%20i%20diplomskom%20studiju%20Metalurskog%20fakulteta.pdf) | Prilog II, t.6 Izgled teksta (str. 45) |
| Velicina slova | `font-fixer` | 12 pt | [Pravilnik o studiranju na preddiplomskim studijima i diplomskom studiju Metalurskog fakulteta (Prilog II: Naputak o zavrsnom radu)](https://arhiva.simet.hr/vidik.simet.hr/simet/hr/nastava/osnovna-pravila-studiranja/pravilnik-o-studiranju/Pravilnik%20o%20studiranju%20na%20preddiplomskim%20i%20diplomskom%20studiju%20Metalurskog%20fakulteta.pdf) | Prilog II, t.6 Izgled teksta (str. 45) |
| Prored (jednostruki) | `line-spacing-fixer` | prored 1 | [Pravilnik o studiranju na preddiplomskim studijima i diplomskom studiju Metalurskog fakulteta (Prilog II: Naputak o zavrsnom radu)](https://arhiva.simet.hr/vidik.simet.hr/simet/hr/nastava/osnovna-pravila-studiranja/pravilnik-o-studiranju/Pravilnik%20o%20studiranju%20na%20preddiplomskim%20i%20diplomskom%20studiju%20Metalurskog%20fakulteta.pdf) | Prilog II, t.6 Izgled teksta (str. 45) |
| A4 format | `paper-size-fixer` | 21 x 29,7 cm | [Pravilnik o studiranju na preddiplomskim studijima i diplomskom studiju Metalurskog fakulteta (Prilog II: Naputak o zavrsnom radu)](https://arhiva.simet.hr/vidik.simet.hr/simet/hr/nastava/osnovna-pravila-studiranja/pravilnik-o-studiranju/Pravilnik%20o%20studiranju%20na%20preddiplomskim%20i%20diplomskom%20studiju%20Metalurskog%20fakulteta.pdf) | Prilog II, Shema izgleda zavrsnog rada, t.1 (str. 44) |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### sois-ft

#### SOIS-FT, Vojno inzenjerstvo, diplomski rad

`sois-ft-vojno-inzenjerstvo-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Times New Roman | [Upute za pisanje zavrsnih/diplomskih radova na SOIS FT](https://www.sois-ft.hr/_download/repository/6.%20Upute%20za%20pisanje%20zavrsnih_dipkomskih%20i%20pripremu%20ppt_SOIS%20FT.pdf) | Odjeljak 2.2 Tehnicke upute za pisanje zavrsnog/diplomskog rada, str. 5 |
| Velicina slova | `font-fixer` | 12 pt | [Upute za pisanje zavrsnih/diplomskih radova na SOIS FT](https://www.sois-ft.hr/_download/repository/6.%20Upute%20za%20pisanje%20zavrsnih_dipkomskih%20i%20pripremu%20ppt_SOIS%20FT.pdf) | Odjeljak 2.2 Tehnicke upute za pisanje zavrsnog/diplomskog rada, str. 5 |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za pisanje zavrsnih/diplomskih radova na SOIS FT](https://www.sois-ft.hr/_download/repository/6.%20Upute%20za%20pisanje%20zavrsnih_dipkomskih%20i%20pripremu%20ppt_SOIS%20FT.pdf) | Odjeljak 2.2 Tehnicke upute za pisanje zavrsnog/diplomskog rada, str. 5 |
| Poravnanje | `alignment-fixer` | obostrano | [Upute za pisanje zavrsnih/diplomskih radova na SOIS FT](https://www.sois-ft.hr/_download/repository/6.%20Upute%20za%20pisanje%20zavrsnih_dipkomskih%20i%20pripremu%20ppt_SOIS%20FT.pdf) | Odjeljak 2.2 Tehnicke upute za pisanje zavrsnog/diplomskog rada, str. 5 |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Upute za pisanje zavrsnih/diplomskih radova na SOIS FT](https://www.sois-ft.hr/_download/repository/6.%20Upute%20za%20pisanje%20zavrsnih_dipkomskih%20i%20pripremu%20ppt_SOIS%20FT.pdf) | Odjeljak 2.2 Tehnicke upute za pisanje zavrsnog/diplomskog rada, str. 5 |
| Format papira A4 | `paper-size-fixer` | 21 x 29,7 cm | [Upute za pisanje zavrsnih/diplomskih radova na SOIS FT](https://www.sois-ft.hr/_download/repository/6.%20Upute%20za%20pisanje%20zavrsnih_dipkomskih%20i%20pripremu%20ppt_SOIS%20FT.pdf) | Odjeljak 2.2 Tehnicke upute za pisanje zavrsnog/diplomskog rada, str. 5 |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### SOIS-FT, Vojno inzenjerstvo, zavrsni rad

`sois-ft-vojno-inzenjerstvo-zavrsni` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Times New Roman | [Upute za pisanje zavrsnih/diplomskih radova na SOIS FT](https://www.sois-ft.hr/_download/repository/6.%20Upute%20za%20pisanje%20zavrsnih_dipkomskih%20i%20pripremu%20ppt_SOIS%20FT.pdf) | Odjeljak 2.2 Tehnicke upute za pisanje zavrsnog/diplomskog rada, str. 5 |
| Velicina slova | `font-fixer` | 12 pt | [Upute za pisanje zavrsnih/diplomskih radova na SOIS FT](https://www.sois-ft.hr/_download/repository/6.%20Upute%20za%20pisanje%20zavrsnih_dipkomskih%20i%20pripremu%20ppt_SOIS%20FT.pdf) | Odjeljak 2.2 Tehnicke upute za pisanje zavrsnog/diplomskog rada, str. 5 |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za pisanje zavrsnih/diplomskih radova na SOIS FT](https://www.sois-ft.hr/_download/repository/6.%20Upute%20za%20pisanje%20zavrsnih_dipkomskih%20i%20pripremu%20ppt_SOIS%20FT.pdf) | Odjeljak 2.2 Tehnicke upute za pisanje zavrsnog/diplomskog rada, str. 5 |
| Poravnanje | `alignment-fixer` | obostrano | [Upute za pisanje zavrsnih/diplomskih radova na SOIS FT](https://www.sois-ft.hr/_download/repository/6.%20Upute%20za%20pisanje%20zavrsnih_dipkomskih%20i%20pripremu%20ppt_SOIS%20FT.pdf) | Odjeljak 2.2 Tehnicke upute za pisanje zavrsnog/diplomskog rada, str. 5 |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Upute za pisanje zavrsnih/diplomskih radova na SOIS FT](https://www.sois-ft.hr/_download/repository/6.%20Upute%20za%20pisanje%20zavrsnih_dipkomskih%20i%20pripremu%20ppt_SOIS%20FT.pdf) | Odjeljak 2.2 Tehnicke upute za pisanje zavrsnog/diplomskog rada, str. 5 |
| Format papira A4 | `paper-size-fixer` | 21 x 29,7 cm | [Upute za pisanje zavrsnih/diplomskih radova na SOIS FT](https://www.sois-ft.hr/_download/repository/6.%20Upute%20za%20pisanje%20zavrsnih_dipkomskih%20i%20pripremu%20ppt_SOIS%20FT.pdf) | Odjeljak 2.2 Tehnicke upute za pisanje zavrsnog/diplomskog rada, str. 5 |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### SOIS-FT, Vojno pomorstvo, integrirani diplomski rad

`sois-ft-vojno-pomorstvo-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Times New Roman | [Upute za pisanje zavrsnih/diplomskih radova na SOIS FT](https://www.sois-ft.hr/_download/repository/6.%20Upute%20za%20pisanje%20zavrsnih_dipkomskih%20i%20pripremu%20ppt_SOIS%20FT.pdf) | Odjeljak 2.2 Tehnicke upute za pisanje zavrsnog/diplomskog rada, str. 5 |
| Velicina slova | `font-fixer` | 12 pt | [Upute za pisanje zavrsnih/diplomskih radova na SOIS FT](https://www.sois-ft.hr/_download/repository/6.%20Upute%20za%20pisanje%20zavrsnih_dipkomskih%20i%20pripremu%20ppt_SOIS%20FT.pdf) | Odjeljak 2.2 Tehnicke upute za pisanje zavrsnog/diplomskog rada, str. 5 |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za pisanje zavrsnih/diplomskih radova na SOIS FT](https://www.sois-ft.hr/_download/repository/6.%20Upute%20za%20pisanje%20zavrsnih_dipkomskih%20i%20pripremu%20ppt_SOIS%20FT.pdf) | Odjeljak 2.2 Tehnicke upute za pisanje zavrsnog/diplomskog rada, str. 5 |
| Poravnanje | `alignment-fixer` | obostrano | [Upute za pisanje zavrsnih/diplomskih radova na SOIS FT](https://www.sois-ft.hr/_download/repository/6.%20Upute%20za%20pisanje%20zavrsnih_dipkomskih%20i%20pripremu%20ppt_SOIS%20FT.pdf) | Odjeljak 2.2 Tehnicke upute za pisanje zavrsnog/diplomskog rada, str. 5 |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Upute za pisanje zavrsnih/diplomskih radova na SOIS FT](https://www.sois-ft.hr/_download/repository/6.%20Upute%20za%20pisanje%20zavrsnih_dipkomskih%20i%20pripremu%20ppt_SOIS%20FT.pdf) | Odjeljak 2.2 Tehnicke upute za pisanje zavrsnog/diplomskog rada, str. 5 |
| Format papira A4 | `paper-size-fixer` | 21 x 29,7 cm | [Upute za pisanje zavrsnih/diplomskih radova na SOIS FT](https://www.sois-ft.hr/_download/repository/6.%20Upute%20za%20pisanje%20zavrsnih_dipkomskih%20i%20pripremu%20ppt_SOIS%20FT.pdf) | Odjeljak 2.2 Tehnicke upute za pisanje zavrsnog/diplomskog rada, str. 5 |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### SOIS-FT, Vojno vodjenje i upravljanje, diplomski rad

`sois-ft-vojno-vodjenje-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Times New Roman | [Upute za pisanje zavrsnih/diplomskih radova na SOIS FT](https://www.sois-ft.hr/_download/repository/6.%20Upute%20za%20pisanje%20zavrsnih_dipkomskih%20i%20pripremu%20ppt_SOIS%20FT.pdf) | Odjeljak 2.2 Tehnicke upute za pisanje zavrsnog/diplomskog rada, str. 5 |
| Velicina slova | `font-fixer` | 12 pt | [Upute za pisanje zavrsnih/diplomskih radova na SOIS FT](https://www.sois-ft.hr/_download/repository/6.%20Upute%20za%20pisanje%20zavrsnih_dipkomskih%20i%20pripremu%20ppt_SOIS%20FT.pdf) | Odjeljak 2.2 Tehnicke upute za pisanje zavrsnog/diplomskog rada, str. 5 |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za pisanje zavrsnih/diplomskih radova na SOIS FT](https://www.sois-ft.hr/_download/repository/6.%20Upute%20za%20pisanje%20zavrsnih_dipkomskih%20i%20pripremu%20ppt_SOIS%20FT.pdf) | Odjeljak 2.2 Tehnicke upute za pisanje zavrsnog/diplomskog rada, str. 5 |
| Poravnanje | `alignment-fixer` | obostrano | [Upute za pisanje zavrsnih/diplomskih radova na SOIS FT](https://www.sois-ft.hr/_download/repository/6.%20Upute%20za%20pisanje%20zavrsnih_dipkomskih%20i%20pripremu%20ppt_SOIS%20FT.pdf) | Odjeljak 2.2 Tehnicke upute za pisanje zavrsnog/diplomskog rada, str. 5 |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Upute za pisanje zavrsnih/diplomskih radova na SOIS FT](https://www.sois-ft.hr/_download/repository/6.%20Upute%20za%20pisanje%20zavrsnih_dipkomskih%20i%20pripremu%20ppt_SOIS%20FT.pdf) | Odjeljak 2.2 Tehnicke upute za pisanje zavrsnog/diplomskog rada, str. 5 |
| Format papira A4 | `paper-size-fixer` | 21 x 29,7 cm | [Upute za pisanje zavrsnih/diplomskih radova na SOIS FT](https://www.sois-ft.hr/_download/repository/6.%20Upute%20za%20pisanje%20zavrsnih_dipkomskih%20i%20pripremu%20ppt_SOIS%20FT.pdf) | Odjeljak 2.2 Tehnicke upute za pisanje zavrsnog/diplomskog rada, str. 5 |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### SOIS-FT, Vojno vodjenje i upravljanje, zavrsni rad

`sois-ft-vojno-vodjenje-zavrsni` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Times New Roman | [Upute za pisanje zavrsnih/diplomskih radova na SOIS FT](https://www.sois-ft.hr/_download/repository/6.%20Upute%20za%20pisanje%20zavrsnih_dipkomskih%20i%20pripremu%20ppt_SOIS%20FT.pdf) | Odjeljak 2.2 Tehnicke upute za pisanje zavrsnog/diplomskog rada, str. 5 |
| Velicina slova | `font-fixer` | 12 pt | [Upute za pisanje zavrsnih/diplomskih radova na SOIS FT](https://www.sois-ft.hr/_download/repository/6.%20Upute%20za%20pisanje%20zavrsnih_dipkomskih%20i%20pripremu%20ppt_SOIS%20FT.pdf) | Odjeljak 2.2 Tehnicke upute za pisanje zavrsnog/diplomskog rada, str. 5 |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za pisanje zavrsnih/diplomskih radova na SOIS FT](https://www.sois-ft.hr/_download/repository/6.%20Upute%20za%20pisanje%20zavrsnih_dipkomskih%20i%20pripremu%20ppt_SOIS%20FT.pdf) | Odjeljak 2.2 Tehnicke upute za pisanje zavrsnog/diplomskog rada, str. 5 |
| Poravnanje | `alignment-fixer` | obostrano | [Upute za pisanje zavrsnih/diplomskih radova na SOIS FT](https://www.sois-ft.hr/_download/repository/6.%20Upute%20za%20pisanje%20zavrsnih_dipkomskih%20i%20pripremu%20ppt_SOIS%20FT.pdf) | Odjeljak 2.2 Tehnicke upute za pisanje zavrsnog/diplomskog rada, str. 5 |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Upute za pisanje zavrsnih/diplomskih radova na SOIS FT](https://www.sois-ft.hr/_download/repository/6.%20Upute%20za%20pisanje%20zavrsnih_dipkomskih%20i%20pripremu%20ppt_SOIS%20FT.pdf) | Odjeljak 2.2 Tehnicke upute za pisanje zavrsnog/diplomskog rada, str. 5 |
| Format papira A4 | `paper-size-fixer` | 21 x 29,7 cm | [Upute za pisanje zavrsnih/diplomskih radova na SOIS FT](https://www.sois-ft.hr/_download/repository/6.%20Upute%20za%20pisanje%20zavrsnih_dipkomskih%20i%20pripremu%20ppt_SOIS%20FT.pdf) | Odjeljak 2.2 Tehnicke upute za pisanje zavrsnog/diplomskog rada, str. 5 |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### sumfak

#### Fakultet šumarstva i drvne tehnologije, diplomski rad

`sumfak-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Arial | [Upute za izradu zavrsnoga i diplomskoga rada (Fakultet sumarstva i drvne tehnologije, 2024)](https://www.sumfak.unizg.hr/site/assets/files/3498/upute_za_izradu_zavrsnoga_i_diplomskoga_rada.docx) | odjeljak Preporuke za tehnicko oblikovanje rada |
| Velicina slova | `font-fixer` | 12 pt | [Upute za izradu zavrsnoga i diplomskoga rada (Fakultet sumarstva i drvne tehnologije, 2024)](https://www.sumfak.unizg.hr/site/assets/files/3498/upute_za_izradu_zavrsnoga_i_diplomskoga_rada.docx) | odjeljak Preporuke za tehnicko oblikovanje rada |
| Prored | `line-spacing-fixer` | prored 1,15 | [Upute za izradu zavrsnoga i diplomskoga rada (Fakultet sumarstva i drvne tehnologije, 2024)](https://www.sumfak.unizg.hr/site/assets/files/3498/upute_za_izradu_zavrsnoga_i_diplomskoga_rada.docx) | odjeljak Preporuke za tehnicko oblikovanje rada |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Upute za izradu zavrsnoga i diplomskoga rada (Fakultet sumarstva i drvne tehnologije, 2024)](https://www.sumfak.unizg.hr/site/assets/files/3498/upute_za_izradu_zavrsnoga_i_diplomskoga_rada.docx) | odjeljak Preporuke za tehnicko oblikovanje rada |
| Obostrano poravnanje (justify) | `alignment-fixer` | obostrano | [Upute za izradu zavrsnoga i diplomskoga rada (Fakultet sumarstva i drvne tehnologije, 2024)](https://www.sumfak.unizg.hr/site/assets/files/3498/upute_za_izradu_zavrsnoga_i_diplomskoga_rada.docx) | odjeljak Preporuke za tehnicko oblikovanje rada |
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Upute za izradu zavrsnoga i diplomskoga rada (Fakultet sumarstva i drvne tehnologije, 2024)](https://www.sumfak.unizg.hr/site/assets/files/3498/upute_za_izradu_zavrsnoga_i_diplomskoga_rada.docx) | odjeljak Diplomski rad |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Sadrzaj kao zivo TOC polje | `toc-field-fixer` | Word sam azurira sadrzaj<br><sub>Dokument ima naslov Sadrzaj, a jos nema zivo TOC polje. Nedestruktivno: rucne stavke se ne brisu.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Fakultet šumarstva i drvne tehnologije, završni rad

`sumfak-zavrsni` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Arial | [Upute za izradu zavrsnoga i diplomskoga rada (Fakultet sumarstva i drvne tehnologije, 2024)](https://www.sumfak.unizg.hr/site/assets/files/3498/upute_za_izradu_zavrsnoga_i_diplomskoga_rada.docx) | odjeljak Preporuke za tehnicko oblikovanje rada |
| Velicina slova | `font-fixer` | 12 pt | [Upute za izradu zavrsnoga i diplomskoga rada (Fakultet sumarstva i drvne tehnologije, 2024)](https://www.sumfak.unizg.hr/site/assets/files/3498/upute_za_izradu_zavrsnoga_i_diplomskoga_rada.docx) | odjeljak Preporuke za tehnicko oblikovanje rada |
| Prored | `line-spacing-fixer` | prored 1,15 | [Upute za izradu zavrsnoga i diplomskoga rada (Fakultet sumarstva i drvne tehnologije, 2024)](https://www.sumfak.unizg.hr/site/assets/files/3498/upute_za_izradu_zavrsnoga_i_diplomskoga_rada.docx) | odjeljak Preporuke za tehnicko oblikovanje rada |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Upute za izradu zavrsnoga i diplomskoga rada (Fakultet sumarstva i drvne tehnologije, 2024)](https://www.sumfak.unizg.hr/site/assets/files/3498/upute_za_izradu_zavrsnoga_i_diplomskoga_rada.docx) | odjeljak Preporuke za tehnicko oblikovanje rada |
| Obostrano poravnanje (justify) | `alignment-fixer` | obostrano | [Upute za izradu zavrsnoga i diplomskoga rada (Fakultet sumarstva i drvne tehnologije, 2024)](https://www.sumfak.unizg.hr/site/assets/files/3498/upute_za_izradu_zavrsnoga_i_diplomskoga_rada.docx) | odjeljak Preporuke za tehnicko oblikovanje rada |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Sadrzaj kao zivo TOC polje | `toc-field-fixer` | Word sam azurira sadrzaj<br><sub>Dokument ima naslov Sadrzaj, a jos nema zivo TOC polje. Nedestruktivno: rucne stavke se ne brisu.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### teho

#### Slavonski Brod - Tehnički odjel, diplomski rad

`unisb-teho-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Times New Roman | [Upute za izradu Zavrsnog rada/Diplomskog rada na Sveucilistu u Slavonskom Brodu (Senat, 28.6.2024)](https://unisbhr.sharepoint.com/:b:/s/WebRepozitorij/EUi-Gv2SQ39ErLqIGqAKn-sBKzD3H-jXP_XPsrcpZms7YQ) | Clanak 3. (Oblik i sadrzaj rada) |
| Velicina slova | `font-fixer` | 12 pt | [Upute za izradu Zavrsnog rada/Diplomskog rada na Sveucilistu u Slavonskom Brodu (Senat, 28.6.2024)](https://unisbhr.sharepoint.com/:b:/s/WebRepozitorij/EUi-Gv2SQ39ErLqIGqAKn-sBKzD3H-jXP_XPsrcpZms7YQ) | Clanak 3. (Oblik i sadrzaj rada) |
| Prored (jednostruki) | `line-spacing-fixer` | prored 1 | [Upute za izradu Zavrsnog rada/Diplomskog rada na Sveucilistu u Slavonskom Brodu (Senat, 28.6.2024)](https://unisbhr.sharepoint.com/:b:/s/WebRepozitorij/EUi-Gv2SQ39ErLqIGqAKn-sBKzD3H-jXP_XPsrcpZms7YQ) | Clanak 3. (Oblik i sadrzaj rada) |
| Margine (uvezni rub lijevo 2,5 cm) | `margins-fixer` | 2 / 2 / 2 / 2,5 cm (gore/desno/dolje/lijevo) | [Upute za izradu Zavrsnog rada/Diplomskog rada na Sveucilistu u Slavonskom Brodu (Senat, 28.6.2024)](https://unisbhr.sharepoint.com/:b:/s/WebRepozitorij/EUi-Gv2SQ39ErLqIGqAKn-sBKzD3H-jXP_XPsrcpZms7YQ) | Clanak 3. (Oblik i sadrzaj rada) |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Slavonski Brod - Tehnički odjel, završni rad

`unisb-teho-zavrsni` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Times New Roman | [Upute za izradu Zavrsnog rada/Diplomskog rada na Sveucilistu u Slavonskom Brodu (Senat, 28.6.2024)](https://unisbhr.sharepoint.com/:b:/s/WebRepozitorij/EUi-Gv2SQ39ErLqIGqAKn-sBKzD3H-jXP_XPsrcpZms7YQ) | Clanak 3. (Oblik i sadrzaj rada) |
| Velicina slova | `font-fixer` | 12 pt | [Upute za izradu Zavrsnog rada/Diplomskog rada na Sveucilistu u Slavonskom Brodu (Senat, 28.6.2024)](https://unisbhr.sharepoint.com/:b:/s/WebRepozitorij/EUi-Gv2SQ39ErLqIGqAKn-sBKzD3H-jXP_XPsrcpZms7YQ) | Clanak 3. (Oblik i sadrzaj rada) |
| Prored (jednostruki) | `line-spacing-fixer` | prored 1 | [Upute za izradu Zavrsnog rada/Diplomskog rada na Sveucilistu u Slavonskom Brodu (Senat, 28.6.2024)](https://unisbhr.sharepoint.com/:b:/s/WebRepozitorij/EUi-Gv2SQ39ErLqIGqAKn-sBKzD3H-jXP_XPsrcpZms7YQ) | Clanak 3. (Oblik i sadrzaj rada) |
| Margine (uvezni rub lijevo 2,5 cm) | `margins-fixer` | 2 / 2 / 2 / 2,5 cm (gore/desno/dolje/lijevo) | [Upute za izradu Zavrsnog rada/Diplomskog rada na Sveucilistu u Slavonskom Brodu (Senat, 28.6.2024)](https://unisbhr.sharepoint.com/:b:/s/WebRepozitorij/EUi-Gv2SQ39ErLqIGqAKn-sBKzD3H-jXP_XPsrcpZms7YQ) | Clanak 3. (Oblik i sadrzaj rada) |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### tfpu

#### Tehnički fakultet Pula, diplomski rad

`tfpu-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Naputak o zavrsnom/diplomskom radu (Tehnicki fakultet Pula, 2025)](https://tfpu.unipu.hr/_download/repository/4_naputak_o_zavrsno_diplomskom_radu.pdf) | Naputak, tehnicko uredenje |
| Vrsta slova | `font-fixer` | Arial | [Naputak o zavrsnom/diplomskom radu (Tehnicki fakultet Pula, 2025)](https://tfpu.unipu.hr/_download/repository/4_naputak_o_zavrsno_diplomskom_radu.pdf) | Naputak, tehnicko uredenje |
| Velicina slova | `font-fixer` | 12 pt | [Naputak o zavrsnom/diplomskom radu (Tehnicki fakultet Pula, 2025)](https://tfpu.unipu.hr/_download/repository/4_naputak_o_zavrsno_diplomskom_radu.pdf) | Naputak, tehnicko uredenje |
| Prored | `line-spacing-fixer` | prored 1,5 | [Naputak o zavrsnom/diplomskom radu (Tehnicki fakultet Pula, 2025)](https://tfpu.unipu.hr/_download/repository/4_naputak_o_zavrsno_diplomskom_radu.pdf) | Naputak, tehnicko uredenje |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Naputak o zavrsnom/diplomskom radu (Tehnicki fakultet Pula, 2025)](https://tfpu.unipu.hr/_download/repository/4_naputak_o_zavrsno_diplomskom_radu.pdf) | Naputak, tehnicko uredenje |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Tehnički fakultet Pula, završni rad

`tfpu-zavrsni` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Naputak o zavrsnom/diplomskom radu (Tehnicki fakultet Pula, 2025)](https://tfpu.unipu.hr/_download/repository/4_naputak_o_zavrsno_diplomskom_radu.pdf) | Naputak, tehnicko uredenje |
| Vrsta slova | `font-fixer` | Arial | [Naputak o zavrsnom/diplomskom radu (Tehnicki fakultet Pula, 2025)](https://tfpu.unipu.hr/_download/repository/4_naputak_o_zavrsno_diplomskom_radu.pdf) | Naputak, tehnicko uredenje |
| Velicina slova | `font-fixer` | 12 pt | [Naputak o zavrsnom/diplomskom radu (Tehnicki fakultet Pula, 2025)](https://tfpu.unipu.hr/_download/repository/4_naputak_o_zavrsno_diplomskom_radu.pdf) | Naputak, tehnicko uredenje |
| Prored | `line-spacing-fixer` | prored 1,5 | [Naputak o zavrsnom/diplomskom radu (Tehnicki fakultet Pula, 2025)](https://tfpu.unipu.hr/_download/repository/4_naputak_o_zavrsno_diplomskom_radu.pdf) | Naputak, tehnicko uredenje |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Naputak o zavrsnom/diplomskom radu (Tehnicki fakultet Pula, 2025)](https://tfpu.unipu.hr/_download/repository/4_naputak_o_zavrsno_diplomskom_radu.pdf) | Naputak, tehnicko uredenje |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### ttf

#### Tekstilno-tehnološki fakultet, diplomski rad

`ttf-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Arial | [Upute za oblikovanje zavrsnog i diplomskog rada na Sveucilistu u Zagrebu Tekstilno-tehnoloskom fakultetu](https://api.ttf.hr/documents/2jkTqCAb3q90sHtmCP6YSBKg40rbo1mHCTrqdwwWKt9Y4aYZMqpiLuOVdsdi/upute-za-oblikovanje-zavrsnog-i-diplomskog-rada-ttf.pdf) | Postavke stranice |
| Velicina slova | `font-fixer` | 12 pt | [Upute za oblikovanje zavrsnog i diplomskog rada na Sveucilistu u Zagrebu Tekstilno-tehnoloskom fakultetu](https://api.ttf.hr/documents/2jkTqCAb3q90sHtmCP6YSBKg40rbo1mHCTrqdwwWKt9Y4aYZMqpiLuOVdsdi/upute-za-oblikovanje-zavrsnog-i-diplomskog-rada-ttf.pdf) | Postavke stranice |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za oblikovanje zavrsnog i diplomskog rada na Sveucilistu u Zagrebu Tekstilno-tehnoloskom fakultetu](https://api.ttf.hr/documents/2jkTqCAb3q90sHtmCP6YSBKg40rbo1mHCTrqdwwWKt9Y4aYZMqpiLuOVdsdi/upute-za-oblikovanje-zavrsnog-i-diplomskog-rada-ttf.pdf) | Postavke stranice |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Upute za oblikovanje zavrsnog i diplomskog rada na Sveucilistu u Zagrebu Tekstilno-tehnoloskom fakultetu](https://api.ttf.hr/documents/2jkTqCAb3q90sHtmCP6YSBKg40rbo1mHCTrqdwwWKt9Y4aYZMqpiLuOVdsdi/upute-za-oblikovanje-zavrsnog-i-diplomskog-rada-ttf.pdf) | Postavke stranice |
| Obostrano poravnanje | `alignment-fixer` | obostrano | [Upute za oblikovanje zavrsnog i diplomskog rada na Sveucilistu u Zagrebu Tekstilno-tehnoloskom fakultetu](https://api.ttf.hr/documents/2jkTqCAb3q90sHtmCP6YSBKg40rbo1mHCTrqdwwWKt9Y4aYZMqpiLuOVdsdi/upute-za-oblikovanje-zavrsnog-i-diplomskog-rada-ttf.pdf) | Postavke stranice |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Sadrzaj kao zivo TOC polje | `toc-field-fixer` | Word sam azurira sadrzaj<br><sub>Dokument ima naslov Sadrzaj, a jos nema zivo TOC polje. Nedestruktivno: rucne stavke se ne brisu.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Tekstilno-tehnološki fakultet, Tekstilni i modni dizajn, diplomski rad

`ttf-dizajn-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Arial | [Upute za oblikovanje zavrsnog i diplomskog rada na Sveucilistu u Zagrebu Tekstilno-tehnoloskom fakultetu](https://api.ttf.hr/documents/2jkTqCAb3q90sHtmCP6YSBKg40rbo1mHCTrqdwwWKt9Y4aYZMqpiLuOVdsdi/upute-za-oblikovanje-zavrsnog-i-diplomskog-rada-ttf.pdf) | str. 1, "Postavke stranice" |
| Velicina slova | `font-fixer` | 12 pt | [Upute za oblikovanje zavrsnog i diplomskog rada na Sveucilistu u Zagrebu Tekstilno-tehnoloskom fakultetu](https://api.ttf.hr/documents/2jkTqCAb3q90sHtmCP6YSBKg40rbo1mHCTrqdwwWKt9Y4aYZMqpiLuOVdsdi/upute-za-oblikovanje-zavrsnog-i-diplomskog-rada-ttf.pdf) | str. 1, "Postavke stranice" |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za oblikovanje zavrsnog i diplomskog rada na Sveucilistu u Zagrebu Tekstilno-tehnoloskom fakultetu](https://api.ttf.hr/documents/2jkTqCAb3q90sHtmCP6YSBKg40rbo1mHCTrqdwwWKt9Y4aYZMqpiLuOVdsdi/upute-za-oblikovanje-zavrsnog-i-diplomskog-rada-ttf.pdf) | str. 1, "Postavke stranice" |
| Poravnanje | `alignment-fixer` | obostrano | [Upute za oblikovanje zavrsnog i diplomskog rada na Sveucilistu u Zagrebu Tekstilno-tehnoloskom fakultetu](https://api.ttf.hr/documents/2jkTqCAb3q90sHtmCP6YSBKg40rbo1mHCTrqdwwWKt9Y4aYZMqpiLuOVdsdi/upute-za-oblikovanje-zavrsnog-i-diplomskog-rada-ttf.pdf) | str. 1, "Postavke stranice" |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Upute za oblikovanje zavrsnog i diplomskog rada na Sveucilistu u Zagrebu Tekstilno-tehnoloskom fakultetu](https://api.ttf.hr/documents/2jkTqCAb3q90sHtmCP6YSBKg40rbo1mHCTrqdwwWKt9Y4aYZMqpiLuOVdsdi/upute-za-oblikovanje-zavrsnog-i-diplomskog-rada-ttf.pdf) | str. 1, "Postavke stranice" |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Sadrzaj kao zivo TOC polje | `toc-field-fixer` | Word sam azurira sadrzaj<br><sub>Dokument ima naslov Sadrzaj, a jos nema zivo TOC polje. Nedestruktivno: rucne stavke se ne brisu.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Tekstilno-tehnološki fakultet, Tekstilni i modni dizajn, završni rad

`ttf-dizajn-zavrsni` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Arial | [Upute za oblikovanje zavrsnog i diplomskog rada na Sveucilistu u Zagrebu Tekstilno-tehnoloskom fakultetu](https://api.ttf.hr/documents/2jkTqCAb3q90sHtmCP6YSBKg40rbo1mHCTrqdwwWKt9Y4aYZMqpiLuOVdsdi/upute-za-oblikovanje-zavrsnog-i-diplomskog-rada-ttf.pdf) | str. 1, "Postavke stranice" |
| Velicina slova | `font-fixer` | 12 pt | [Upute za oblikovanje zavrsnog i diplomskog rada na Sveucilistu u Zagrebu Tekstilno-tehnoloskom fakultetu](https://api.ttf.hr/documents/2jkTqCAb3q90sHtmCP6YSBKg40rbo1mHCTrqdwwWKt9Y4aYZMqpiLuOVdsdi/upute-za-oblikovanje-zavrsnog-i-diplomskog-rada-ttf.pdf) | str. 1, "Postavke stranice" |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za oblikovanje zavrsnog i diplomskog rada na Sveucilistu u Zagrebu Tekstilno-tehnoloskom fakultetu](https://api.ttf.hr/documents/2jkTqCAb3q90sHtmCP6YSBKg40rbo1mHCTrqdwwWKt9Y4aYZMqpiLuOVdsdi/upute-za-oblikovanje-zavrsnog-i-diplomskog-rada-ttf.pdf) | str. 1, "Postavke stranice" |
| Poravnanje | `alignment-fixer` | obostrano | [Upute za oblikovanje zavrsnog i diplomskog rada na Sveucilistu u Zagrebu Tekstilno-tehnoloskom fakultetu](https://api.ttf.hr/documents/2jkTqCAb3q90sHtmCP6YSBKg40rbo1mHCTrqdwwWKt9Y4aYZMqpiLuOVdsdi/upute-za-oblikovanje-zavrsnog-i-diplomskog-rada-ttf.pdf) | str. 1, "Postavke stranice" |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Upute za oblikovanje zavrsnog i diplomskog rada na Sveucilistu u Zagrebu Tekstilno-tehnoloskom fakultetu](https://api.ttf.hr/documents/2jkTqCAb3q90sHtmCP6YSBKg40rbo1mHCTrqdwwWKt9Y4aYZMqpiLuOVdsdi/upute-za-oblikovanje-zavrsnog-i-diplomskog-rada-ttf.pdf) | str. 1, "Postavke stranice" |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Sadrzaj kao zivo TOC polje | `toc-field-fixer` | Word sam azurira sadrzaj<br><sub>Dokument ima naslov Sadrzaj, a jos nema zivo TOC polje. Nedestruktivno: rucne stavke se ne brisu.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Tekstilno-tehnološki fakultet, doktorski rad

`ttf-doktorski` · status: partial · vrste rada: doctoral

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Times New Roman | [Upute za oblikovanje doktorskog rada (Obrazac DR.SC.-08)](https://www.unizg.hr/nc/vijest/article/obrasci-za-doktorski-studij/) | odjeljak 'Postavke stranice' (DR.SC.-08, Upute za oblikovanje doktorskog rada) |
| Velicina slova | `font-fixer` | 12 pt | [Upute za oblikovanje doktorskog rada (Obrazac DR.SC.-08)](https://www.unizg.hr/nc/vijest/article/obrasci-za-doktorski-studij/) | odjeljak 'Postavke stranice' (DR.SC.-08, Upute za oblikovanje doktorskog rada) |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za oblikovanje doktorskog rada (Obrazac DR.SC.-08)](https://www.unizg.hr/nc/vijest/article/obrasci-za-doktorski-studij/) | odjeljak 'Postavke stranice' (DR.SC.-08, Upute za oblikovanje doktorskog rada) |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Upute za oblikovanje doktorskog rada (Obrazac DR.SC.-08)](https://www.unizg.hr/nc/vijest/article/obrasci-za-doktorski-studij/) | odjeljak 'Postavke stranice' (DR.SC.-08, Upute za oblikovanje doktorskog rada) |
| Format papira A4 | `paper-size-fixer` | 21 x 29,7 cm | [Upute za oblikovanje doktorskog rada (Obrazac DR.SC.-08)](https://www.unizg.hr/nc/vijest/article/obrasci-za-doktorski-studij/) | odjeljak 'Postavke stranice' (DR.SC.-08, Upute za oblikovanje doktorskog rada) |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Tekstilno-tehnološki fakultet, završni rad

`ttf-zavrsni` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Arial | [Upute za oblikovanje zavrsnog i diplomskog rada na Sveucilistu u Zagrebu Tekstilno-tehnoloskom fakultetu](https://api.ttf.hr/documents/2jkTqCAb3q90sHtmCP6YSBKg40rbo1mHCTrqdwwWKt9Y4aYZMqpiLuOVdsdi/upute-za-oblikovanje-zavrsnog-i-diplomskog-rada-ttf.pdf) | Postavke stranice |
| Velicina slova | `font-fixer` | 12 pt | [Upute za oblikovanje zavrsnog i diplomskog rada na Sveucilistu u Zagrebu Tekstilno-tehnoloskom fakultetu](https://api.ttf.hr/documents/2jkTqCAb3q90sHtmCP6YSBKg40rbo1mHCTrqdwwWKt9Y4aYZMqpiLuOVdsdi/upute-za-oblikovanje-zavrsnog-i-diplomskog-rada-ttf.pdf) | Postavke stranice |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za oblikovanje zavrsnog i diplomskog rada na Sveucilistu u Zagrebu Tekstilno-tehnoloskom fakultetu](https://api.ttf.hr/documents/2jkTqCAb3q90sHtmCP6YSBKg40rbo1mHCTrqdwwWKt9Y4aYZMqpiLuOVdsdi/upute-za-oblikovanje-zavrsnog-i-diplomskog-rada-ttf.pdf) | Postavke stranice |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Upute za oblikovanje zavrsnog i diplomskog rada na Sveucilistu u Zagrebu Tekstilno-tehnoloskom fakultetu](https://api.ttf.hr/documents/2jkTqCAb3q90sHtmCP6YSBKg40rbo1mHCTrqdwwWKt9Y4aYZMqpiLuOVdsdi/upute-za-oblikovanje-zavrsnog-i-diplomskog-rada-ttf.pdf) | Postavke stranice |
| Obostrano poravnanje | `alignment-fixer` | obostrano | [Upute za oblikovanje zavrsnog i diplomskog rada na Sveucilistu u Zagrebu Tekstilno-tehnoloskom fakultetu](https://api.ttf.hr/documents/2jkTqCAb3q90sHtmCP6YSBKg40rbo1mHCTrqdwwWKt9Y4aYZMqpiLuOVdsdi/upute-za-oblikovanje-zavrsnog-i-diplomskog-rada-ttf.pdf) | Postavke stranice |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Sadrzaj kao zivo TOC polje | `toc-field-fixer` | Word sam azurira sadrzaj<br><sub>Dokument ima naslov Sadrzaj, a jos nema zivo TOC polje. Nedestruktivno: rucne stavke se ne brisu.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### uaos

#### Akademija za umjetnost i kulturu Osijek, diplomski rad

`uaos-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Times New Roman | [Pravilnik o zavrsnim i diplomskim radovima i ispitima, procisceni tekst srpanj 2026 (Akademija za umjetnost i kulturu u Osijeku)](https://www.uaos.unios.hr/wp-content/uploads/2026/07/Pravilnik-o-zavrs%CC%8Cnim-i-diplomskim-radovima-i-ispitima-srpanj-26.pdf) | Dodatak, Odsjek za kulturu, medije i menadzment, "1.2. FORMAT", str. 65 |
| Velicina slova | `font-fixer` | 12 pt | [Pravilnik o zavrsnim i diplomskim radovima i ispitima, procisceni tekst srpanj 2026 (Akademija za umjetnost i kulturu u Osijeku)](https://www.uaos.unios.hr/wp-content/uploads/2026/07/Pravilnik-o-zavrs%CC%8Cnim-i-diplomskim-radovima-i-ispitima-srpanj-26.pdf) | Dodatak, Odsjek za kulturu, medije i menadzment, "1.2. FORMAT", str. 65 |
| Prored | `line-spacing-fixer` | prored 1,5 | [Pravilnik o zavrsnim i diplomskim radovima i ispitima, procisceni tekst srpanj 2026 (Akademija za umjetnost i kulturu u Osijeku)](https://www.uaos.unios.hr/wp-content/uploads/2026/07/Pravilnik-o-zavrs%CC%8Cnim-i-diplomskim-radovima-i-ispitima-srpanj-26.pdf) | Dodatak, Odsjek za kulturu, medije i menadzment, "1.2. FORMAT", str. 65 |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Pravilnik o zavrsnim i diplomskim radovima i ispitima, procisceni tekst srpanj 2026 (Akademija za umjetnost i kulturu u Osijeku)](https://www.uaos.unios.hr/wp-content/uploads/2026/07/Pravilnik-o-zavrs%CC%8Cnim-i-diplomskim-radovima-i-ispitima-srpanj-26.pdf) | Dodatak, Odsjek za kulturu, medije i menadzment, "1.2. FORMAT", str. 65 |
| Format papira A4 | `paper-size-fixer` | 21 x 29,7 cm | [Pravilnik o zavrsnim i diplomskim radovima i ispitima, procisceni tekst srpanj 2026 (Akademija za umjetnost i kulturu u Osijeku)](https://www.uaos.unios.hr/wp-content/uploads/2026/07/Pravilnik-o-zavrs%CC%8Cnim-i-diplomskim-radovima-i-ispitima-srpanj-26.pdf) | Dodatak, Odsjek za kulturu, medije i menadzment, "1.2. FORMAT", str. 65 |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Akademija za umjetnost i kulturu Osijek, završni rad

`uaos-zavrsni` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Times New Roman | [Pravilnik o zavrsnim i diplomskim radovima i ispitima, procisceni tekst srpanj 2026 (Akademija za umjetnost i kulturu u Osijeku)](https://www.uaos.unios.hr/wp-content/uploads/2026/07/Pravilnik-o-zavrs%CC%8Cnim-i-diplomskim-radovima-i-ispitima-srpanj-26.pdf) | Dodatak, Odsjek za kulturu, medije i menadzment, "1.2. FORMAT", str. 65 |
| Velicina slova | `font-fixer` | 12 pt | [Pravilnik o zavrsnim i diplomskim radovima i ispitima, procisceni tekst srpanj 2026 (Akademija za umjetnost i kulturu u Osijeku)](https://www.uaos.unios.hr/wp-content/uploads/2026/07/Pravilnik-o-zavrs%CC%8Cnim-i-diplomskim-radovima-i-ispitima-srpanj-26.pdf) | Dodatak, Odsjek za kulturu, medije i menadzment, "1.2. FORMAT", str. 65 |
| Prored | `line-spacing-fixer` | prored 1,5 | [Pravilnik o zavrsnim i diplomskim radovima i ispitima, procisceni tekst srpanj 2026 (Akademija za umjetnost i kulturu u Osijeku)](https://www.uaos.unios.hr/wp-content/uploads/2026/07/Pravilnik-o-zavrs%CC%8Cnim-i-diplomskim-radovima-i-ispitima-srpanj-26.pdf) | Dodatak, Odsjek za kulturu, medije i menadzment, "1.2. FORMAT", str. 65 |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Pravilnik o zavrsnim i diplomskim radovima i ispitima, procisceni tekst srpanj 2026 (Akademija za umjetnost i kulturu u Osijeku)](https://www.uaos.unios.hr/wp-content/uploads/2026/07/Pravilnik-o-zavrs%CC%8Cnim-i-diplomskim-radovima-i-ispitima-srpanj-26.pdf) | Dodatak, Odsjek za kulturu, medije i menadzment, "1.2. FORMAT", str. 65 |
| Format papira A4 | `paper-size-fixer` | 21 x 29,7 cm | [Pravilnik o zavrsnim i diplomskim radovima i ispitima, procisceni tekst srpanj 2026 (Akademija za umjetnost i kulturu u Osijeku)](https://www.uaos.unios.hr/wp-content/uploads/2026/07/Pravilnik-o-zavrs%CC%8Cnim-i-diplomskim-radovima-i-ispitima-srpanj-26.pdf) | Dodatak, Odsjek za kulturu, medije i menadzment, "1.2. FORMAT", str. 65 |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### ufri

#### Rijeka - Učiteljski fakultet, diplomski rad

`ufri-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Upute za izradu diplomskog rada (Učiteljski fakultet u Rijeci, 2024)](https://www.ufri.uniri.hr/files/nastava/Upute_za_izradu_rada/240417_Upute_za_izradu_dipl_rada.pdf) | Upute, oblikovanje rada |
| Vrsta slova | `font-fixer` | Times New Roman | [Upute za izradu diplomskog rada (Učiteljski fakultet u Rijeci, 2024)](https://www.ufri.uniri.hr/files/nastava/Upute_za_izradu_rada/240417_Upute_za_izradu_dipl_rada.pdf) | Upute, oblikovanje rada |
| Velicina slova | `font-fixer` | 12 pt | [Upute za izradu diplomskog rada (Učiteljski fakultet u Rijeci, 2024)](https://www.ufri.uniri.hr/files/nastava/Upute_za_izradu_rada/240417_Upute_za_izradu_dipl_rada.pdf) | Upute, oblikovanje rada |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za izradu diplomskog rada (Učiteljski fakultet u Rijeci, 2024)](https://www.ufri.uniri.hr/files/nastava/Upute_za_izradu_rada/240417_Upute_za_izradu_dipl_rada.pdf) | Upute, oblikovanje rada |
| Obostrano poravnanje | `alignment-fixer` | obostrano | [Upute za izradu diplomskog rada (Učiteljski fakultet u Rijeci, 2024)](https://www.ufri.uniri.hr/files/nastava/Upute_za_izradu_rada/240417_Upute_za_izradu_dipl_rada.pdf) | Upute, oblikovanje rada |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### ufzg

#### Učiteljski fakultet, diplomski rad

`ufzg-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Times New Roman | [Upute za izradu zavrsnog odnosno diplomskog rada (Uciteljski fakultet Sveucilista u Zagrebu)](https://www.ufzg.unizg.hr/wp-content/uploads/2026/05/Upute-za-izradu-zavrsnog-odnosno-diplomskog-rada.pdf) | odjeljak 2. Opseg i oblikovanje zavrsnog odnosno diplomskog rada |
| Velicina slova | `font-fixer` | 12 pt | [Upute za izradu zavrsnog odnosno diplomskog rada (Uciteljski fakultet Sveucilista u Zagrebu)](https://www.ufzg.unizg.hr/wp-content/uploads/2026/05/Upute-za-izradu-zavrsnog-odnosno-diplomskog-rada.pdf) | odjeljak 2. Opseg i oblikovanje zavrsnog odnosno diplomskog rada |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za izradu zavrsnog odnosno diplomskog rada (Uciteljski fakultet Sveucilista u Zagrebu)](https://www.ufzg.unizg.hr/wp-content/uploads/2026/05/Upute-za-izradu-zavrsnog-odnosno-diplomskog-rada.pdf) | odjeljak 2. Opseg i oblikovanje zavrsnog odnosno diplomskog rada |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Upute za izradu zavrsnog odnosno diplomskog rada (Uciteljski fakultet Sveucilista u Zagrebu)](https://www.ufzg.unizg.hr/wp-content/uploads/2026/05/Upute-za-izradu-zavrsnog-odnosno-diplomskog-rada.pdf) | odjeljak 2. Opseg i oblikovanje zavrsnog odnosno diplomskog rada |
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Upute za izradu zavrsnog odnosno diplomskog rada (Uciteljski fakultet Sveucilista u Zagrebu)](https://www.ufzg.unizg.hr/wp-content/uploads/2026/05/Upute-za-izradu-zavrsnog-odnosno-diplomskog-rada.pdf) | odjeljak 2. Opseg i oblikovanje zavrsnog odnosno diplomskog rada |
| Obostrano poravnanje | `alignment-fixer` | obostrano | [Upute za izradu zavrsnog odnosno diplomskog rada (Uciteljski fakultet Sveucilista u Zagrebu)](https://www.ufzg.unizg.hr/wp-content/uploads/2026/05/Upute-za-izradu-zavrsnog-odnosno-diplomskog-rada.pdf) | odjeljak 2. Opseg i oblikovanje zavrsnog odnosno diplomskog rada |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Sadrzaj kao zivo TOC polje | `toc-field-fixer` | Word sam azurira sadrzaj<br><sub>Dokument ima naslov Sadrzaj, a jos nema zivo TOC polje. Nedestruktivno: rucne stavke se ne brisu.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Učiteljski fakultet, doktorski rad

`ufzg-doktorski` · status: partial · vrste rada: doctoral

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Times New Roman | [Upute za oblikovanje doktorskog rada (Obrazac DR.SC.-08)](https://www.unizg.hr/nc/vijest/article/obrasci-za-doktorski-studij/) | odjeljak 'Postavke stranice' (DR.SC.-08, Upute za oblikovanje doktorskog rada) |
| Velicina slova | `font-fixer` | 12 pt | [Upute za oblikovanje doktorskog rada (Obrazac DR.SC.-08)](https://www.unizg.hr/nc/vijest/article/obrasci-za-doktorski-studij/) | odjeljak 'Postavke stranice' (DR.SC.-08, Upute za oblikovanje doktorskog rada) |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za oblikovanje doktorskog rada (Obrazac DR.SC.-08)](https://www.unizg.hr/nc/vijest/article/obrasci-za-doktorski-studij/) | odjeljak 'Postavke stranice' (DR.SC.-08, Upute za oblikovanje doktorskog rada) |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Upute za oblikovanje doktorskog rada (Obrazac DR.SC.-08)](https://www.unizg.hr/nc/vijest/article/obrasci-za-doktorski-studij/) | odjeljak 'Postavke stranice' (DR.SC.-08, Upute za oblikovanje doktorskog rada) |
| Format papira A4 | `paper-size-fixer` | 21 x 29,7 cm | [Upute za oblikovanje doktorskog rada (Obrazac DR.SC.-08)](https://www.unizg.hr/nc/vijest/article/obrasci-za-doktorski-studij/) | odjeljak 'Postavke stranice' (DR.SC.-08, Upute za oblikovanje doktorskog rada) |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Učiteljski fakultet, završni rad

`ufzg-zavrsni` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Times New Roman | [Upute za izradu zavrsnog odnosno diplomskog rada (Uciteljski fakultet Sveucilista u Zagrebu)](https://www.ufzg.unizg.hr/wp-content/uploads/2026/05/Upute-za-izradu-zavrsnog-odnosno-diplomskog-rada.pdf) | odjeljak 2. Opseg i oblikovanje zavrsnog odnosno diplomskog rada |
| Velicina slova | `font-fixer` | 12 pt | [Upute za izradu zavrsnog odnosno diplomskog rada (Uciteljski fakultet Sveucilista u Zagrebu)](https://www.ufzg.unizg.hr/wp-content/uploads/2026/05/Upute-za-izradu-zavrsnog-odnosno-diplomskog-rada.pdf) | odjeljak 2. Opseg i oblikovanje zavrsnog odnosno diplomskog rada |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za izradu zavrsnog odnosno diplomskog rada (Uciteljski fakultet Sveucilista u Zagrebu)](https://www.ufzg.unizg.hr/wp-content/uploads/2026/05/Upute-za-izradu-zavrsnog-odnosno-diplomskog-rada.pdf) | odjeljak 2. Opseg i oblikovanje zavrsnog odnosno diplomskog rada |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Upute za izradu zavrsnog odnosno diplomskog rada (Uciteljski fakultet Sveucilista u Zagrebu)](https://www.ufzg.unizg.hr/wp-content/uploads/2026/05/Upute-za-izradu-zavrsnog-odnosno-diplomskog-rada.pdf) | odjeljak 2. Opseg i oblikovanje zavrsnog odnosno diplomskog rada |
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Upute za izradu zavrsnog odnosno diplomskog rada (Uciteljski fakultet Sveucilista u Zagrebu)](https://www.ufzg.unizg.hr/wp-content/uploads/2026/05/Upute-za-izradu-zavrsnog-odnosno-diplomskog-rada.pdf) | odjeljak 2. Opseg i oblikovanje zavrsnog odnosno diplomskog rada |
| Obostrano poravnanje | `alignment-fixer` | obostrano | [Upute za izradu zavrsnog odnosno diplomskog rada (Uciteljski fakultet Sveucilista u Zagrebu)](https://www.ufzg.unizg.hr/wp-content/uploads/2026/05/Upute-za-izradu-zavrsnog-odnosno-diplomskog-rada.pdf) | odjeljak 2. Opseg i oblikovanje zavrsnog odnosno diplomskog rada |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Sadrzaj kao zivo TOC polje | `toc-field-fixer` | Word sam azurira sadrzaj<br><sub>Dokument ima naslov Sadrzaj, a jos nema zivo TOC polje. Nedestruktivno: rucne stavke se ne brisu.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### unidu

#### Dubrovnik - Ekonomija, diplomski rad

`unidu-ekonomija-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Prirucnik za izradu i obranu zavrsnog/diplomskog rada (Odjel za ekonomiju, Dubrovnik, 2024)](https://www.unidu.hr/wp-content/plugins/quarascope/download.php?file=26922) | Prirucnik, oblikovanje teksta (str. 13) |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Prirucnik za izradu i obranu zavrsnog/diplomskog rada (Odjel za ekonomiju, Dubrovnik, 2024)](https://www.unidu.hr/wp-content/plugins/quarascope/download.php?file=26922) | Prirucnik, oblikovanje teksta (str. 13) |
| Vrsta slova | `font-fixer` | Calibri | [Prirucnik za izradu i obranu zavrsnog/diplomskog rada (Odjel za ekonomiju, Dubrovnik, 2024)](https://www.unidu.hr/wp-content/plugins/quarascope/download.php?file=26922) | Prirucnik, oblikovanje teksta (str. 13) |
| Velicina slova | `font-fixer` | 12 pt | [Prirucnik za izradu i obranu zavrsnog/diplomskog rada (Odjel za ekonomiju, Dubrovnik, 2024)](https://www.unidu.hr/wp-content/plugins/quarascope/download.php?file=26922) | Prirucnik, oblikovanje teksta (str. 13) |
| Obostrano poravnanje | `alignment-fixer` | obostrano | [Prirucnik za izradu i obranu zavrsnog/diplomskog rada (Odjel za ekonomiju, Dubrovnik, 2024)](https://www.unidu.hr/wp-content/plugins/quarascope/download.php?file=26922) | Prirucnik, oblikovanje teksta (str. 13) |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Dubrovnik - Ekonomija, završni rad

`unidu-ekonomija-zavrsni` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Prirucnik za izradu i obranu zavrsnog/diplomskog rada (Odjel za ekonomiju, Dubrovnik, 2024)](https://www.unidu.hr/wp-content/plugins/quarascope/download.php?file=26922) | Prirucnik, oblikovanje teksta (str. 13) |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Prirucnik za izradu i obranu zavrsnog/diplomskog rada (Odjel za ekonomiju, Dubrovnik, 2024)](https://www.unidu.hr/wp-content/plugins/quarascope/download.php?file=26922) | Prirucnik, oblikovanje teksta (str. 13) |
| Vrsta slova | `font-fixer` | Calibri | [Prirucnik za izradu i obranu zavrsnog/diplomskog rada (Odjel za ekonomiju, Dubrovnik, 2024)](https://www.unidu.hr/wp-content/plugins/quarascope/download.php?file=26922) | Prirucnik, oblikovanje teksta (str. 13) |
| Velicina slova | `font-fixer` | 12 pt | [Prirucnik za izradu i obranu zavrsnog/diplomskog rada (Odjel za ekonomiju, Dubrovnik, 2024)](https://www.unidu.hr/wp-content/plugins/quarascope/download.php?file=26922) | Prirucnik, oblikovanje teksta (str. 13) |
| Obostrano poravnanje | `alignment-fixer` | obostrano | [Prirucnik za izradu i obranu zavrsnog/diplomskog rada (Odjel za ekonomiju, Dubrovnik, 2024)](https://www.unidu.hr/wp-content/plugins/quarascope/download.php?file=26922) | Prirucnik, oblikovanje teksta (str. 13) |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Dubrovnik - Komunikologija, diplomski rad

`unidu-komunikologija-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Upute za izradu diplomskog rada (Odjel za komunikologiju / mediji, Dubrovnik, 2025)](https://www.unidu.hr/wp-content/plugins/quarascope/download.php?file=45903) | Upute, §5 |
| Vrsta slova (TNR ili Arial) | `font-fixer` | Times New Roman | [Upute za izradu diplomskog rada (Odjel za komunikologiju / mediji, Dubrovnik, 2025)](https://www.unidu.hr/wp-content/plugins/quarascope/download.php?file=45903) | Upute, §5 |
| Velicina slova | `font-fixer` | 12 pt | [Upute za izradu diplomskog rada (Odjel za komunikologiju / mediji, Dubrovnik, 2025)](https://www.unidu.hr/wp-content/plugins/quarascope/download.php?file=45903) | Upute, §5 |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za izradu diplomskog rada (Odjel za komunikologiju / mediji, Dubrovnik, 2025)](https://www.unidu.hr/wp-content/plugins/quarascope/download.php?file=45903) | Upute, §5 |
| Obostrano poravnanje | `alignment-fixer` | obostrano | [Upute za izradu diplomskog rada (Odjel za komunikologiju / mediji, Dubrovnik, 2025)](https://www.unidu.hr/wp-content/plugins/quarascope/download.php?file=45903) | Upute, §5 |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Upute za izradu diplomskog rada (Odjel za komunikologiju / mediji, Dubrovnik, 2025)](https://www.unidu.hr/wp-content/plugins/quarascope/download.php?file=45903) | Upute, §5 |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Dubrovnik - Komunikologija (Mediji i kultura drustva), završni rad

`unidu-komunikologija-zavrsni` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Times New Roman | [Upute za izradu projekta prijediplomskog studija (Komunikologija)](https://www.unidu.hr (Fakultet za medije i odnose s javnoscu, veljaca 2025)) | str. 2-5 |
| Velicina slova | `font-fixer` | 12 pt | [Upute za izradu projekta prijediplomskog studija (Komunikologija)](https://www.unidu.hr (Fakultet za medije i odnose s javnoscu, veljaca 2025)) | str. 2-5 |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za izradu projekta prijediplomskog studija (Komunikologija)](https://www.unidu.hr (Fakultet za medije i odnose s javnoscu, veljaca 2025)) | str. 2-5 |
| Poravnanje | `alignment-fixer` | obostrano | [Upute za izradu projekta prijediplomskog studija (Komunikologija)](https://www.unidu.hr (Fakultet za medije i odnose s javnoscu, veljaca 2025)) | str. 2-5 |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Upute za izradu projekta prijediplomskog studija (Komunikologija)](https://www.unidu.hr (Fakultet za medije i odnose s javnoscu, veljaca 2025)) | str. 2-5 |
| Format papira A4 | `paper-size-fixer` | 21 x 29,7 cm | [Upute za izradu projekta prijediplomskog studija (Komunikologija)](https://www.unidu.hr (Fakultet za medije i odnose s javnoscu, veljaca 2025)) | str. 2-5 |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Dubrovnik - Marikultura, diplomski rad

`unidu-marikultura-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Times New Roman | [Upute za pisanje diplomskog rada na diplomskom studiju Marikultura](https://www.unidu.hr/index.php?p=download&id=2123) | Upute, str. 1 (uz Pravilnik Cl.4(1) file=2121) |
| Velicina slova | `font-fixer` | 12 pt | [Upute za pisanje diplomskog rada na diplomskom studiju Marikultura](https://www.unidu.hr/index.php?p=download&id=2123) | Upute, str. 1 (uz Pravilnik Cl.4(1) file=2121) |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za pisanje diplomskog rada na diplomskom studiju Marikultura](https://www.unidu.hr/index.php?p=download&id=2123) | Upute, str. 1 (uz Pravilnik Cl.4(1) file=2121) |
| Poravnanje | `alignment-fixer` | obostrano | [Upute za pisanje diplomskog rada na diplomskom studiju Marikultura](https://www.unidu.hr/index.php?p=download&id=2123) | Upute, str. 1 (uz Pravilnik Cl.4(1) file=2121) |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Dubrovnik - Povijest, završni rad

`unidu-povijest-zavrsni` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Vrsta slova | `font-fixer` | Times New Roman | [Upute za izradu zavrsnog rada - Povijest Jadrana i Mediterana (Odjel za humanisticke studije, Dubrovnik)](https://www.unidu.hr/wp-content/plugins/quarascope/download.php?file=7709) | Opce upute, t. 2 |
| Velicina slova | `font-fixer` | 12 pt | [Upute za izradu zavrsnog rada - Povijest Jadrana i Mediterana (Odjel za humanisticke studije, Dubrovnik)](https://www.unidu.hr/wp-content/plugins/quarascope/download.php?file=7709) | Opce upute, t. 2 |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za izradu zavrsnog rada - Povijest Jadrana i Mediterana (Odjel za humanisticke studije, Dubrovnik)](https://www.unidu.hr/wp-content/plugins/quarascope/download.php?file=7709) | Opce upute, t. 2 |
| Obostrano poravnanje | `alignment-fixer` | obostrano | [Upute za izradu zavrsnog rada - Povijest Jadrana i Mediterana (Odjel za humanisticke studije, Dubrovnik)](https://www.unidu.hr/wp-content/plugins/quarascope/download.php?file=7709) | Opce upute, t. 2 |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Upute za izradu zavrsnog rada - Povijest Jadrana i Mediterana (Odjel za humanisticke studije, Dubrovnik)](https://www.unidu.hr/wp-content/plugins/quarascope/download.php?file=7709) | Opce upute, t. 2 |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Dubrovnik - Sestrinstvo, završni rad

`unidu-sestrinstvo-zavrsni` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font (preporuka) | `font-fixer` | Times New Roman | [Upute za pisanje zavrsnog rada na strucnom prijediplomskom studiju Sestrinstvo](https://www.unidu.hr (Odjel za zdravstvene studije, dokument .docx)) | Tablica "Preporuke za tehnicko oblikovanje rada" |
| Velicina slova (preporuka) | `font-fixer` | 12 pt | [Upute za pisanje zavrsnog rada na strucnom prijediplomskom studiju Sestrinstvo](https://www.unidu.hr (Odjel za zdravstvene studije, dokument .docx)) | Tablica "Preporuke za tehnicko oblikovanje rada" |
| Prored (preporuka) | `line-spacing-fixer` | prored 1,5 | [Upute za pisanje zavrsnog rada na strucnom prijediplomskom studiju Sestrinstvo](https://www.unidu.hr (Odjel za zdravstvene studije, dokument .docx)) | Tablica "Preporuke za tehnicko oblikovanje rada" |
| Margine (preporuka) | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Upute za pisanje zavrsnog rada na strucnom prijediplomskom studiju Sestrinstvo](https://www.unidu.hr (Odjel za zdravstvene studije, dokument .docx)) | Tablica "Preporuke za tehnicko oblikovanje rada" |
| Poravnanje (preporuka) | `alignment-fixer` | obostrano | [Upute za pisanje zavrsnog rada na strucnom prijediplomskom studiju Sestrinstvo](https://www.unidu.hr (Odjel za zdravstvene studije, dokument .docx)) | Tablica "Preporuke za tehnicko oblikovanje rada" |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Dubrovnik - Umjetnost i restauracija, diplomski rad

`unidu-umjetnost-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Naputak za oblikovanje i opremu diplomskog rada (Odjel za umjetnost i restauraciju, Dubrovnik)](https://www.unidu.hr/wp-content/plugins/quarascope/download.php?file=2333) | Naputak, §II.II |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 3 cm (gore/desno/dolje/lijevo) | [Naputak za oblikovanje i opremu diplomskog rada (Odjel za umjetnost i restauraciju, Dubrovnik)](https://www.unidu.hr/wp-content/plugins/quarascope/download.php?file=2333) | Naputak, §II.II |
| Prored | `line-spacing-fixer` | prored 1,15 | [Naputak za oblikovanje i opremu diplomskog rada (Odjel za umjetnost i restauraciju, Dubrovnik)](https://www.unidu.hr/wp-content/plugins/quarascope/download.php?file=2333) | Naputak, §II.II |
| Vrsta slova (TNR ili Arial) | `font-fixer` | Times New Roman | [Naputak za oblikovanje i opremu diplomskog rada (Odjel za umjetnost i restauraciju, Dubrovnik)](https://www.unidu.hr/wp-content/plugins/quarascope/download.php?file=2333) | Naputak, §II.II |
| Velicina slova | `font-fixer` | 12 pt | [Naputak za oblikovanje i opremu diplomskog rada (Odjel za umjetnost i restauraciju, Dubrovnik)](https://www.unidu.hr/wp-content/plugins/quarascope/download.php?file=2333) | Naputak, §II.II |
| Obostrano poravnanje | `alignment-fixer` | obostrano | [Naputak za oblikovanje i opremu diplomskog rada (Odjel za umjetnost i restauraciju, Dubrovnik)](https://www.unidu.hr/wp-content/plugins/quarascope/download.php?file=2333) | Naputak, §II.II |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Dubrovnik - Konzervacija-restauracija, završni rad

`unidu-umjetnost-zavrsni` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format papira A4 | `paper-size-fixer` | 21 x 29,7 cm | [Naputak za oblikovanje i opremu zavrsnog rada (Odjel za umjetnost i restauraciju)](https://www.unidu.hr/index.php?p=download&id=55544) | II.II. Tehnicko uredjivanje, str. 5 |
| Margine (lijeva 3cm) | `margins-fixer` | 2,5 / 2,5 / 2,5 / 3 cm (gore/desno/dolje/lijevo) | [Naputak za oblikovanje i opremu zavrsnog rada (Odjel za umjetnost i restauraciju)](https://www.unidu.hr/index.php?p=download&id=55544) | II.II. Tehnicko uredjivanje, str. 5 |
| Prored | `line-spacing-fixer` | prored 1,15 | [Naputak za oblikovanje i opremu zavrsnog rada (Odjel za umjetnost i restauraciju)](https://www.unidu.hr/index.php?p=download&id=55544) | II.II. Tehnicko uredjivanje, str. 5 |
| Font | `font-fixer` | Times New Roman | [Naputak za oblikovanje i opremu zavrsnog rada (Odjel za umjetnost i restauraciju)](https://www.unidu.hr/index.php?p=download&id=55544) | II.II. Tehnicko uredjivanje, str. 5 |
| Velicina slova | `font-fixer` | 12 pt | [Naputak za oblikovanje i opremu zavrsnog rada (Odjel za umjetnost i restauraciju)](https://www.unidu.hr/index.php?p=download&id=55544) | II.II. Tehnicko uredjivanje, str. 5 |
| Poravnanje | `alignment-fixer` | obostrano | [Naputak za oblikovanje i opremu zavrsnog rada (Odjel za umjetnost i restauraciju)](https://www.unidu.hr/index.php?p=download&id=55544) | II.II. Tehnicko uredjivanje, str. 5 |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### unin

#### Sjever - Biomedicinske znanosti, diplomski rad

`unin-biomedicina-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Vrsta slova | `font-fixer` | Times New Roman | [Upute za oblikovanje završnog i diplomskog rada (Sveučilište Sjever, sijecanj 2026)](https://www.unin.hr/wp-content/uploads/Upute-za-oblikovanje-zavr%C5%A1nog-i-diplomskog-rada_22.1.1.docx) | Upute, tehnicko oblikovanje |
| Velicina slova | `font-fixer` | 12 pt | [Upute za oblikovanje završnog i diplomskog rada (Sveučilište Sjever, sijecanj 2026)](https://www.unin.hr/wp-content/uploads/Upute-za-oblikovanje-zavr%C5%A1nog-i-diplomskog-rada_22.1.1.docx) | Upute, tehnicko oblikovanje |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za oblikovanje završnog i diplomskog rada (Sveučilište Sjever, sijecanj 2026)](https://www.unin.hr/wp-content/uploads/Upute-za-oblikovanje-zavr%C5%A1nog-i-diplomskog-rada_22.1.1.docx) | Upute, tehnicko oblikovanje |
| Obostrano poravnanje | `alignment-fixer` | obostrano | [Upute za oblikovanje završnog i diplomskog rada (Sveučilište Sjever, sijecanj 2026)](https://www.unin.hr/wp-content/uploads/Upute-za-oblikovanje-zavr%C5%A1nog-i-diplomskog-rada_22.1.1.docx) | Upute, tehnicko oblikovanje |
| Margine | `margins-fixer` | 2 / 2,25 / 2 / 2,25 cm (gore/desno/dolje/lijevo) | [Upute za oblikovanje završnog i diplomskog rada (Sveučilište Sjever, sijecanj 2026)](https://www.unin.hr/wp-content/uploads/Upute-za-oblikovanje-zavr%C5%A1nog-i-diplomskog-rada_22.1.1.docx) | Upute, tehnicko oblikovanje |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Sjever - Biomedicinske znanosti, završni rad

`unin-biomedicina-zavrsni` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Vrsta slova | `font-fixer` | Times New Roman | [Upute za oblikovanje završnog i diplomskog rada (Sveučilište Sjever, sijecanj 2026)](https://www.unin.hr/wp-content/uploads/Upute-za-oblikovanje-zavr%C5%A1nog-i-diplomskog-rada_22.1.1.docx) | Upute, tehnicko oblikovanje |
| Velicina slova | `font-fixer` | 12 pt | [Upute za oblikovanje završnog i diplomskog rada (Sveučilište Sjever, sijecanj 2026)](https://www.unin.hr/wp-content/uploads/Upute-za-oblikovanje-zavr%C5%A1nog-i-diplomskog-rada_22.1.1.docx) | Upute, tehnicko oblikovanje |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za oblikovanje završnog i diplomskog rada (Sveučilište Sjever, sijecanj 2026)](https://www.unin.hr/wp-content/uploads/Upute-za-oblikovanje-zavr%C5%A1nog-i-diplomskog-rada_22.1.1.docx) | Upute, tehnicko oblikovanje |
| Obostrano poravnanje | `alignment-fixer` | obostrano | [Upute za oblikovanje završnog i diplomskog rada (Sveučilište Sjever, sijecanj 2026)](https://www.unin.hr/wp-content/uploads/Upute-za-oblikovanje-zavr%C5%A1nog-i-diplomskog-rada_22.1.1.docx) | Upute, tehnicko oblikovanje |
| Margine | `margins-fixer` | 2 / 2,25 / 2 / 2,25 cm (gore/desno/dolje/lijevo) | [Upute za oblikovanje završnog i diplomskog rada (Sveučilište Sjever, sijecanj 2026)](https://www.unin.hr/wp-content/uploads/Upute-za-oblikovanje-zavr%C5%A1nog-i-diplomskog-rada_22.1.1.docx) | Upute, tehnicko oblikovanje |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Sjever - Drustvene znanosti, diplomski rad

`unin-drustveni-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Vrsta slova | `font-fixer` | Times New Roman | [Upute za oblikovanje završnog i diplomskog rada (Sveučilište Sjever, sijecanj 2026)](https://www.unin.hr/wp-content/uploads/Upute-za-oblikovanje-zavr%C5%A1nog-i-diplomskog-rada_22.1.1.docx) | Upute, tehnicko oblikovanje |
| Velicina slova | `font-fixer` | 12 pt | [Upute za oblikovanje završnog i diplomskog rada (Sveučilište Sjever, sijecanj 2026)](https://www.unin.hr/wp-content/uploads/Upute-za-oblikovanje-zavr%C5%A1nog-i-diplomskog-rada_22.1.1.docx) | Upute, tehnicko oblikovanje |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za oblikovanje završnog i diplomskog rada (Sveučilište Sjever, sijecanj 2026)](https://www.unin.hr/wp-content/uploads/Upute-za-oblikovanje-zavr%C5%A1nog-i-diplomskog-rada_22.1.1.docx) | Upute, tehnicko oblikovanje |
| Obostrano poravnanje | `alignment-fixer` | obostrano | [Upute za oblikovanje završnog i diplomskog rada (Sveučilište Sjever, sijecanj 2026)](https://www.unin.hr/wp-content/uploads/Upute-za-oblikovanje-zavr%C5%A1nog-i-diplomskog-rada_22.1.1.docx) | Upute, tehnicko oblikovanje |
| Margine | `margins-fixer` | 2 / 2,25 / 2 / 2,25 cm (gore/desno/dolje/lijevo) | [Upute za oblikovanje završnog i diplomskog rada (Sveučilište Sjever, sijecanj 2026)](https://www.unin.hr/wp-content/uploads/Upute-za-oblikovanje-zavr%C5%A1nog-i-diplomskog-rada_22.1.1.docx) | Upute, tehnicko oblikovanje |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Sjever - Drustvene znanosti, završni rad

`unin-drustveni-zavrsni` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Vrsta slova | `font-fixer` | Times New Roman | [Upute za oblikovanje završnog i diplomskog rada (Sveučilište Sjever, sijecanj 2026)](https://www.unin.hr/wp-content/uploads/Upute-za-oblikovanje-zavr%C5%A1nog-i-diplomskog-rada_22.1.1.docx) | Upute, tehnicko oblikovanje |
| Velicina slova | `font-fixer` | 12 pt | [Upute za oblikovanje završnog i diplomskog rada (Sveučilište Sjever, sijecanj 2026)](https://www.unin.hr/wp-content/uploads/Upute-za-oblikovanje-zavr%C5%A1nog-i-diplomskog-rada_22.1.1.docx) | Upute, tehnicko oblikovanje |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za oblikovanje završnog i diplomskog rada (Sveučilište Sjever, sijecanj 2026)](https://www.unin.hr/wp-content/uploads/Upute-za-oblikovanje-zavr%C5%A1nog-i-diplomskog-rada_22.1.1.docx) | Upute, tehnicko oblikovanje |
| Obostrano poravnanje | `alignment-fixer` | obostrano | [Upute za oblikovanje završnog i diplomskog rada (Sveučilište Sjever, sijecanj 2026)](https://www.unin.hr/wp-content/uploads/Upute-za-oblikovanje-zavr%C5%A1nog-i-diplomskog-rada_22.1.1.docx) | Upute, tehnicko oblikovanje |
| Margine | `margins-fixer` | 2 / 2,25 / 2 / 2,25 cm (gore/desno/dolje/lijevo) | [Upute za oblikovanje završnog i diplomskog rada (Sveučilište Sjever, sijecanj 2026)](https://www.unin.hr/wp-content/uploads/Upute-za-oblikovanje-zavr%C5%A1nog-i-diplomskog-rada_22.1.1.docx) | Upute, tehnicko oblikovanje |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Sjever - Tehnički i gospodarski studiji, diplomski rad

`unin-tehnicki-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Vrsta slova | `font-fixer` | Times New Roman | [Upute za oblikovanje završnog i diplomskog rada (Sveučilište Sjever, sijecanj 2026)](https://www.unin.hr/wp-content/uploads/Upute-za-oblikovanje-zavr%C5%A1nog-i-diplomskog-rada_22.1.1.docx) | Upute, tehnicko oblikovanje |
| Velicina slova | `font-fixer` | 12 pt | [Upute za oblikovanje završnog i diplomskog rada (Sveučilište Sjever, sijecanj 2026)](https://www.unin.hr/wp-content/uploads/Upute-za-oblikovanje-zavr%C5%A1nog-i-diplomskog-rada_22.1.1.docx) | Upute, tehnicko oblikovanje |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za oblikovanje završnog i diplomskog rada (Sveučilište Sjever, sijecanj 2026)](https://www.unin.hr/wp-content/uploads/Upute-za-oblikovanje-zavr%C5%A1nog-i-diplomskog-rada_22.1.1.docx) | Upute, tehnicko oblikovanje |
| Obostrano poravnanje | `alignment-fixer` | obostrano | [Upute za oblikovanje završnog i diplomskog rada (Sveučilište Sjever, sijecanj 2026)](https://www.unin.hr/wp-content/uploads/Upute-za-oblikovanje-zavr%C5%A1nog-i-diplomskog-rada_22.1.1.docx) | Upute, tehnicko oblikovanje |
| Margine | `margins-fixer` | 2 / 2,25 / 2 / 2,25 cm (gore/desno/dolje/lijevo) | [Upute za oblikovanje završnog i diplomskog rada (Sveučilište Sjever, sijecanj 2026)](https://www.unin.hr/wp-content/uploads/Upute-za-oblikovanje-zavr%C5%A1nog-i-diplomskog-rada_22.1.1.docx) | Upute, tehnicko oblikovanje |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Sjever - Tehnički i gospodarski studiji, završni rad

`unin-tehnicki-zavrsni` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Vrsta slova | `font-fixer` | Times New Roman | [Upute za oblikovanje završnog i diplomskog rada (Sveučilište Sjever, sijecanj 2026)](https://www.unin.hr/wp-content/uploads/Upute-za-oblikovanje-zavr%C5%A1nog-i-diplomskog-rada_22.1.1.docx) | Upute, tehnicko oblikovanje |
| Velicina slova | `font-fixer` | 12 pt | [Upute za oblikovanje završnog i diplomskog rada (Sveučilište Sjever, sijecanj 2026)](https://www.unin.hr/wp-content/uploads/Upute-za-oblikovanje-zavr%C5%A1nog-i-diplomskog-rada_22.1.1.docx) | Upute, tehnicko oblikovanje |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za oblikovanje završnog i diplomskog rada (Sveučilište Sjever, sijecanj 2026)](https://www.unin.hr/wp-content/uploads/Upute-za-oblikovanje-zavr%C5%A1nog-i-diplomskog-rada_22.1.1.docx) | Upute, tehnicko oblikovanje |
| Obostrano poravnanje | `alignment-fixer` | obostrano | [Upute za oblikovanje završnog i diplomskog rada (Sveučilište Sjever, sijecanj 2026)](https://www.unin.hr/wp-content/uploads/Upute-za-oblikovanje-zavr%C5%A1nog-i-diplomskog-rada_22.1.1.docx) | Upute, tehnicko oblikovanje |
| Margine | `margins-fixer` | 2 / 2,25 / 2 / 2,25 cm (gore/desno/dolje/lijevo) | [Upute za oblikovanje završnog i diplomskog rada (Sveučilište Sjever, sijecanj 2026)](https://www.unin.hr/wp-content/uploads/Upute-za-oblikovanje-zavr%C5%A1nog-i-diplomskog-rada_22.1.1.docx) | Upute, tehnicko oblikovanje |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### unizd

#### Zadar - Arheologija, diplomski rad

`unizd-arheologija-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format papira A4 | `paper-size-fixer` | 21 x 29,7 cm | [Pravilnik o zavrsnom/diplomskom radu, listopad 2016 (Odjel za arheologiju, diplomski primjerak)](https://arheologija.unizd.hr/.../PRAVILNIK - dIPLOMSKI rad_1.pdf) | Clanak 7 (diplomski) |
| Margine (lijeva 3cm) | `margins-fixer` | 2,5 / 2,5 / 2,5 / 3 cm (gore/desno/dolje/lijevo) | [Pravilnik o zavrsnom/diplomskom radu, listopad 2016 (Odjel za arheologiju, diplomski primjerak)](https://arheologija.unizd.hr/.../PRAVILNIK - dIPLOMSKI rad_1.pdf) | Clanak 7 (diplomski) |
| Poravnanje | `alignment-fixer` | obostrano | [Pravilnik o zavrsnom/diplomskom radu, listopad 2016 (Odjel za arheologiju, diplomski primjerak)](https://arheologija.unizd.hr/.../PRAVILNIK - dIPLOMSKI rad_1.pdf) | Clanak 7 (diplomski) |
| Font (preporuka) | `font-fixer` | Times New Roman | [Pravilnik o zavrsnom/diplomskom radu, listopad 2016 (Odjel za arheologiju, diplomski primjerak)](https://arheologija.unizd.hr/.../PRAVILNIK - dIPLOMSKI rad_1.pdf) | Clanak 7 |
| Velicina slova (preporuka) | `font-fixer` | 12 pt | [Pravilnik o zavrsnom/diplomskom radu, listopad 2016 (Odjel za arheologiju, diplomski primjerak)](https://arheologija.unizd.hr/.../PRAVILNIK - dIPLOMSKI rad_1.pdf) | Clanak 7 |
| Prored (preporuka) | `line-spacing-fixer` | prored 1,5 | [Pravilnik o zavrsnom/diplomskom radu, listopad 2016 (Odjel za arheologiju, diplomski primjerak)](https://arheologija.unizd.hr/.../PRAVILNIK - dIPLOMSKI rad_1.pdf) | Clanak 7 |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Zadar - Arheologija, završni rad

`unizd-arheologija-zavrsni` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format papira A4 | `paper-size-fixer` | 21 x 29,7 cm | [Pravilnik o zavrsnom/diplomskom radu, listopad 2016 (Odjel za arheologiju, Sveuciliste u Zadru)](https://www.unizd.hr/Portals/2/doc/PRAVILNIK_O_ZAVRSNOM_RADU_Arheologija.pdf (zavrsni) / arheologija.unizd.hr .../PRAVILNIK - dIPLOMSKI rad_1.pdf (diplomski)) | Clanak 7 (zavrsni) |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Pravilnik o zavrsnom/diplomskom radu, listopad 2016 (Odjel za arheologiju, Sveuciliste u Zadru)](https://www.unizd.hr/Portals/2/doc/PRAVILNIK_O_ZAVRSNOM_RADU_Arheologija.pdf (zavrsni) / arheologija.unizd.hr .../PRAVILNIK - dIPLOMSKI rad_1.pdf (diplomski)) | Clanak 7 (zavrsni) |
| Poravnanje | `alignment-fixer` | obostrano | [Pravilnik o zavrsnom/diplomskom radu, listopad 2016 (Odjel za arheologiju, Sveuciliste u Zadru)](https://www.unizd.hr/Portals/2/doc/PRAVILNIK_O_ZAVRSNOM_RADU_Arheologija.pdf (zavrsni) / arheologija.unizd.hr .../PRAVILNIK - dIPLOMSKI rad_1.pdf (diplomski)) | Clanak 7 (zavrsni) |
| Font (preporuka) | `font-fixer` | Times New Roman | [Pravilnik o zavrsnom/diplomskom radu, listopad 2016 (Odjel za arheologiju, Sveuciliste u Zadru)](https://www.unizd.hr/Portals/2/doc/PRAVILNIK_O_ZAVRSNOM_RADU_Arheologija.pdf (zavrsni) / arheologija.unizd.hr .../PRAVILNIK - dIPLOMSKI rad_1.pdf (diplomski)) | Clanak 7 |
| Velicina slova (preporuka) | `font-fixer` | 12 pt | [Pravilnik o zavrsnom/diplomskom radu, listopad 2016 (Odjel za arheologiju, Sveuciliste u Zadru)](https://www.unizd.hr/Portals/2/doc/PRAVILNIK_O_ZAVRSNOM_RADU_Arheologija.pdf (zavrsni) / arheologija.unizd.hr .../PRAVILNIK - dIPLOMSKI rad_1.pdf (diplomski)) | Clanak 7 |
| Prored (preporuka) | `line-spacing-fixer` | prored 1,5 | [Pravilnik o zavrsnom/diplomskom radu, listopad 2016 (Odjel za arheologiju, Sveuciliste u Zadru)](https://www.unizd.hr/Portals/2/doc/PRAVILNIK_O_ZAVRSNOM_RADU_Arheologija.pdf (zavrsni) / arheologija.unizd.hr .../PRAVILNIK - dIPLOMSKI rad_1.pdf (diplomski)) | Clanak 7 |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Zadar - Ekologija, agronomija i akvakultura, diplomski rad

`unizd-ekologija-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Times New Roman | [Upute za pisanje zavrsnog/diplomskog rada (Odjel za ekologiju, agronomiju i akvakulturu, Sveuciliste u Zadru)](https://eaa.unizd.hr LinkClick (dva zasebna dokumenta: diplomski + zavrsni)) | cijeli dokument |
| Velicina slova | `font-fixer` | 12 pt | [Upute za pisanje zavrsnog/diplomskog rada (Odjel za ekologiju, agronomiju i akvakulturu, Sveuciliste u Zadru)](https://eaa.unizd.hr LinkClick (dva zasebna dokumenta: diplomski + zavrsni)) | cijeli dokument |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za pisanje zavrsnog/diplomskog rada (Odjel za ekologiju, agronomiju i akvakulturu, Sveuciliste u Zadru)](https://eaa.unizd.hr LinkClick (dva zasebna dokumenta: diplomski + zavrsni)) | cijeli dokument |
| Format papira A4 | `paper-size-fixer` | 21 x 29,7 cm | [Upute za pisanje zavrsnog/diplomskog rada (Odjel za ekologiju, agronomiju i akvakulturu, Sveuciliste u Zadru)](https://eaa.unizd.hr LinkClick (dva zasebna dokumenta: diplomski + zavrsni)) | cijeli dokument |
| Poravnanje | `alignment-fixer` | obostrano | [Upute za pisanje zavrsnog/diplomskog rada (Odjel za ekologiju, agronomiju i akvakulturu, Sveuciliste u Zadru)](https://eaa.unizd.hr LinkClick (dva zasebna dokumenta: diplomski + zavrsni)) | cijeli dokument |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Zadar - Ekologija, agronomija i akvakultura, završni rad

`unizd-ekologija-zavrsni` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Times New Roman | [Upute za pisanje zavrsnog/diplomskog rada (Odjel za ekologiju, agronomiju i akvakulturu, Sveuciliste u Zadru)](https://eaa.unizd.hr LinkClick (dva zasebna dokumenta: diplomski + zavrsni)) | cijeli dokument |
| Velicina slova | `font-fixer` | 12 pt | [Upute za pisanje zavrsnog/diplomskog rada (Odjel za ekologiju, agronomiju i akvakulturu, Sveuciliste u Zadru)](https://eaa.unizd.hr LinkClick (dva zasebna dokumenta: diplomski + zavrsni)) | cijeli dokument |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za pisanje zavrsnog/diplomskog rada (Odjel za ekologiju, agronomiju i akvakulturu, Sveuciliste u Zadru)](https://eaa.unizd.hr LinkClick (dva zasebna dokumenta: diplomski + zavrsni)) | cijeli dokument |
| Format papira A4 | `paper-size-fixer` | 21 x 29,7 cm | [Upute za pisanje zavrsnog/diplomskog rada (Odjel za ekologiju, agronomiju i akvakulturu, Sveuciliste u Zadru)](https://eaa.unizd.hr LinkClick (dva zasebna dokumenta: diplomski + zavrsni)) | cijeli dokument |
| Poravnanje | `alignment-fixer` | obostrano | [Upute za pisanje zavrsnog/diplomskog rada (Odjel za ekologiju, agronomiju i akvakulturu, Sveuciliste u Zadru)](https://eaa.unizd.hr LinkClick (dva zasebna dokumenta: diplomski + zavrsni)) | cijeli dokument |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Zadar - Etnologija i antropologija, diplomski rad

`unizd-etnologija-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Times New Roman | [Upute za pisanje diplomskoga rada, 2021 (Odjel za etnologiju i antropologiju, Sveuciliste u Zadru)](https://etnologijaiantropologija.unizd.hr/Portals/5/Upute%20za%20pisanje%20diplomskoga%20rada%202021.doc) | Odjeljak 4 "Tehnicka obradba i izgled diplomskog rada" |
| Velicina slova | `font-fixer` | 12 pt | [Upute za pisanje diplomskoga rada, 2021 (Odjel za etnologiju i antropologiju, Sveuciliste u Zadru)](https://etnologijaiantropologija.unizd.hr/Portals/5/Upute%20za%20pisanje%20diplomskoga%20rada%202021.doc) | Odjeljak 4 "Tehnicka obradba i izgled diplomskog rada" |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za pisanje diplomskoga rada, 2021 (Odjel za etnologiju i antropologiju, Sveuciliste u Zadru)](https://etnologijaiantropologija.unizd.hr/Portals/5/Upute%20za%20pisanje%20diplomskoga%20rada%202021.doc) | Odjeljak 4 "Tehnicka obradba i izgled diplomskog rada" |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Upute za pisanje diplomskoga rada, 2021 (Odjel za etnologiju i antropologiju, Sveuciliste u Zadru)](https://etnologijaiantropologija.unizd.hr/Portals/5/Upute%20za%20pisanje%20diplomskoga%20rada%202021.doc) | Odjeljak 4 "Tehnicka obradba i izgled diplomskog rada" |
| Format papira A4 | `paper-size-fixer` | 21 x 29,7 cm | [Upute za pisanje diplomskoga rada, 2021 (Odjel za etnologiju i antropologiju, Sveuciliste u Zadru)](https://etnologijaiantropologija.unizd.hr/Portals/5/Upute%20za%20pisanje%20diplomskoga%20rada%202021.doc) | Odjeljak 4 "Tehnicka obradba i izgled diplomskog rada" |
| Poravnanje | `alignment-fixer` | obostrano | [Upute za pisanje diplomskoga rada, 2021 (Odjel za etnologiju i antropologiju, Sveuciliste u Zadru)](https://etnologijaiantropologija.unizd.hr/Portals/5/Upute%20za%20pisanje%20diplomskoga%20rada%202021.doc) | Odjeljak 4 "Tehnicka obradba i izgled diplomskog rada" |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Zadar - Filozofija, diplomski rad

`unizd-filozofija-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font (preporuka) | `font-fixer` | Times New Roman | [Preporuke Strucnog vijeca Odjela za filozofiju o izgledu i opsegu diplomskog rada](https://filozofija.unizd.hr/novosti/upute-za-izradu-diplomskog-rada) | Preporuke Strucnog vijeca (diplomski) |
| Velicina slova (preporuka) | `font-fixer` | 12 pt | [Preporuke Strucnog vijeca Odjela za filozofiju o izgledu i opsegu diplomskog rada](https://filozofija.unizd.hr/novosti/upute-za-izradu-diplomskog-rada) | Preporuke Strucnog vijeca (diplomski) |
| Prored (preporuka) | `line-spacing-fixer` | prored 1,5 | [Preporuke Strucnog vijeca Odjela za filozofiju o izgledu i opsegu diplomskog rada](https://filozofija.unizd.hr/novosti/upute-za-izradu-diplomskog-rada) | Preporuke Strucnog vijeca (diplomski) |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Zadar - Filozofija, završni rad

`unizd-filozofija-zavrsni` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font (preporuka) | `font-fixer` | Times New Roman | [Preporuke Strucnog vijeca Odjela za filozofiju o izgledu i opsegu zavrsnog rada](https://filozofija.unizd.hr/novosti/upute-za-izradu-zavrsnog-rada) | Preporuke Strucnog vijeca (zavrsni) |
| Velicina slova (preporuka) | `font-fixer` | 12 pt | [Preporuke Strucnog vijeca Odjela za filozofiju o izgledu i opsegu zavrsnog rada](https://filozofija.unizd.hr/novosti/upute-za-izradu-zavrsnog-rada) | Preporuke Strucnog vijeca (zavrsni) |
| Prored (preporuka) | `line-spacing-fixer` | prored 1,5 | [Preporuke Strucnog vijeca Odjela za filozofiju o izgledu i opsegu zavrsnog rada](https://filozofija.unizd.hr/novosti/upute-za-izradu-zavrsnog-rada) | Preporuke Strucnog vijeca (zavrsni) |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Zadar - Francuski i frankofonski studiji, diplomski rad

`unizd-francuski-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font (preporuka) | `font-fixer` | Times New Roman | [Upute za prijavu, izradu, obranu i pohranu diplomskoga rada (nastavnicki smjer)](https://ffs.unizd.hr/Portals/16/francuski/Upute.diplomski%20rad.nastavnicki.pdf) | Odjeljak III |
| Velicina slova (preporuka) | `font-fixer` | 12 pt | [Upute za prijavu, izradu, obranu i pohranu diplomskoga rada (nastavnicki smjer)](https://ffs.unizd.hr/Portals/16/francuski/Upute.diplomski%20rad.nastavnicki.pdf) | Odjeljak III |
| Prored (preporuka) | `line-spacing-fixer` | prored 1,5 | [Upute za prijavu, izradu, obranu i pohranu diplomskoga rada (nastavnicki smjer)](https://ffs.unizd.hr/Portals/16/francuski/Upute.diplomski%20rad.nastavnicki.pdf) | Odjeljak III |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Zadar - Geografija, diplomski rad

`unizd-geografija-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Times New Roman | [Upute za pisanje diplomskih radova, 2015 (Odjel za geografiju, Sveuciliste u Zadru)](https://www.unizd.hr/Portals/6/Upute%20za%20pisanje%20diplomskih%20radova.pdf) | Odjeljak B, "Vaznije odrednice tehnickog uredjenja rada" |
| Velicina slova | `font-fixer` | 12 pt | [Upute za pisanje diplomskih radova, 2015 (Odjel za geografiju, Sveuciliste u Zadru)](https://www.unizd.hr/Portals/6/Upute%20za%20pisanje%20diplomskih%20radova.pdf) | Odjeljak B, "Vaznije odrednice tehnickog uredjenja rada" |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za pisanje diplomskih radova, 2015 (Odjel za geografiju, Sveuciliste u Zadru)](https://www.unizd.hr/Portals/6/Upute%20za%20pisanje%20diplomskih%20radova.pdf) | Odjeljak B, "Vaznije odrednice tehnickog uredjenja rada" |
| Format papira A4 | `paper-size-fixer` | 21 x 29,7 cm | [Upute za pisanje diplomskih radova, 2015 (Odjel za geografiju, Sveuciliste u Zadru)](https://www.unizd.hr/Portals/6/Upute%20za%20pisanje%20diplomskih%20radova.pdf) | Odjeljak B, "Vaznije odrednice tehnickog uredjenja rada" |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Zadar - Germanistika, diplomski rad

`unizd-germanistika-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Times New Roman | [Pravilnik o izradi diplomskog rada na dvopredmetnom diplomskom studiju njemackog jezika i knjizevnosti](https://germanistika.unizd.hr/Portals/9/zdoc/Diplomski%20rad%20Pravilnik-%202017.pdf) | Prilog 2, "Izgled diplomskog rada" |
| Velicina slova (tijelo) | `font-fixer` | 12 pt | [Pravilnik o izradi diplomskog rada na dvopredmetnom diplomskom studiju njemackog jezika i knjizevnosti](https://germanistika.unizd.hr/Portals/9/zdoc/Diplomski%20rad%20Pravilnik-%202017.pdf) | Prilog 2, "Izgled diplomskog rada" |
| Prored | `line-spacing-fixer` | prored 1,5 | [Pravilnik o izradi diplomskog rada na dvopredmetnom diplomskom studiju njemackog jezika i knjizevnosti](https://germanistika.unizd.hr/Portals/9/zdoc/Diplomski%20rad%20Pravilnik-%202017.pdf) | Prilog 2, "Izgled diplomskog rada" |
| Margine (sve 3cm) | `margins-fixer` | 3 / 3 / 3 / 3 cm (gore/desno/dolje/lijevo) | [Pravilnik o izradi diplomskog rada na dvopredmetnom diplomskom studiju njemackog jezika i knjizevnosti](https://germanistika.unizd.hr/Portals/9/zdoc/Diplomski%20rad%20Pravilnik-%202017.pdf) | Prilog 2, "Izgled diplomskog rada" |
| Format papira A4 | `paper-size-fixer` | 21 x 29,7 cm | [Pravilnik o izradi diplomskog rada na dvopredmetnom diplomskom studiju njemackog jezika i knjizevnosti](https://germanistika.unizd.hr/Portals/9/zdoc/Diplomski%20rad%20Pravilnik-%202017.pdf) | Prilog 2, "Izgled diplomskog rada" |
| Font i veličina fusnota | `footnote-typography-fixer` | 10 pt |  |  |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Zadar - Germanistika, završni rad

`unizd-germanistika-zavrsni` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Times New Roman | [Pravilnik o izradi zavrsnog rada na dvopredmetnom preddiplomskom studiju njemackog jezika i knjizevnosti](https://germanistika.unizd.hr/Portals/9/zdoc/Pravilnik_%20Zavrsni%20rad_2020.pdf) | Prilog 2, "Izgled zavrsnog rada" |
| Velicina slova (tijelo) | `font-fixer` | 12 pt | [Pravilnik o izradi zavrsnog rada na dvopredmetnom preddiplomskom studiju njemackog jezika i knjizevnosti](https://germanistika.unizd.hr/Portals/9/zdoc/Pravilnik_%20Zavrsni%20rad_2020.pdf) | Prilog 2, "Izgled zavrsnog rada" |
| Prored | `line-spacing-fixer` | prored 1,5 | [Pravilnik o izradi zavrsnog rada na dvopredmetnom preddiplomskom studiju njemackog jezika i knjizevnosti](https://germanistika.unizd.hr/Portals/9/zdoc/Pravilnik_%20Zavrsni%20rad_2020.pdf) | Prilog 2, "Izgled zavrsnog rada" |
| Margine (sve 3cm) | `margins-fixer` | 3 / 3 / 3 / 3 cm (gore/desno/dolje/lijevo) | [Pravilnik o izradi zavrsnog rada na dvopredmetnom preddiplomskom studiju njemackog jezika i knjizevnosti](https://germanistika.unizd.hr/Portals/9/zdoc/Pravilnik_%20Zavrsni%20rad_2020.pdf) | Prilog 2, "Izgled zavrsnog rada" |
| Format papira A4 | `paper-size-fixer` | 21 x 29,7 cm | [Pravilnik o izradi zavrsnog rada na dvopredmetnom preddiplomskom studiju njemackog jezika i knjizevnosti](https://germanistika.unizd.hr/Portals/9/zdoc/Pravilnik_%20Zavrsni%20rad_2020.pdf) | Prilog 2, "Izgled zavrsnog rada" |
| Font i veličina fusnota | `footnote-typography-fixer` | 10 pt |  |  |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Zadar - Hispanistika i iberski studiji, diplomski rad

`unizd-hispanistika-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Times New Roman | [Upute za izradu diplomskog rada (Hispanistika i iberski studiji)](https://his.unizd.hr/Portals/72/ZAVR%C5%A0NI%20I%20DIPLOMSKI/Upute%20za%20izradu%20diplomskog%20rada%202022-23-izmjena.pdf) | 2.1.1. Uredjenje teksta |
| Velicina slova | `font-fixer` | 12 pt | [Upute za izradu diplomskog rada (Hispanistika i iberski studiji)](https://his.unizd.hr/Portals/72/ZAVR%C5%A0NI%20I%20DIPLOMSKI/Upute%20za%20izradu%20diplomskog%20rada%202022-23-izmjena.pdf) | 2.1.1. Uredjenje teksta |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za izradu diplomskog rada (Hispanistika i iberski studiji)](https://his.unizd.hr/Portals/72/ZAVR%C5%A0NI%20I%20DIPLOMSKI/Upute%20za%20izradu%20diplomskog%20rada%202022-23-izmjena.pdf) | 2.1.1. Uredjenje teksta |
| Poravnanje | `alignment-fixer` | obostrano | [Upute za izradu diplomskog rada (Hispanistika i iberski studiji)](https://his.unizd.hr/Portals/72/ZAVR%C5%A0NI%20I%20DIPLOMSKI/Upute%20za%20izradu%20diplomskog%20rada%202022-23-izmjena.pdf) | 2.1.1. Uredjenje teksta |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Upute za izradu diplomskog rada (Hispanistika i iberski studiji)](https://his.unizd.hr/Portals/72/ZAVR%C5%A0NI%20I%20DIPLOMSKI/Upute%20za%20izradu%20diplomskog%20rada%202022-23-izmjena.pdf) | 2.1.1. Uredjenje teksta |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Zadar - Informacijske znanosti, diplomski rad

`unizd-informacijske-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Times New Roman | [Upute za pisanje i oblikovanje diplomskog/zavrsnog rada, 24.1.2020 (Odjel za informacijske znanosti i tehnologije, Sveuciliste u Zadru)](https://iz.unizd.hr/Portals/70/docs_novi_web_1/2_docs/upute%20za%20radove/ (dva zasebna dokumenta)) | S1.3.1 "Oblikovanje diplomskog rada" |
| Velicina slova | `font-fixer` | 12 pt | [Upute za pisanje i oblikovanje diplomskog/zavrsnog rada, 24.1.2020 (Odjel za informacijske znanosti i tehnologije, Sveuciliste u Zadru)](https://iz.unizd.hr/Portals/70/docs_novi_web_1/2_docs/upute%20za%20radove/ (dva zasebna dokumenta)) | S1.3.1 "Oblikovanje diplomskog rada" |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za pisanje i oblikovanje diplomskog/zavrsnog rada, 24.1.2020 (Odjel za informacijske znanosti i tehnologije, Sveuciliste u Zadru)](https://iz.unizd.hr/Portals/70/docs_novi_web_1/2_docs/upute%20za%20radove/ (dva zasebna dokumenta)) | S1.3.1 "Oblikovanje diplomskog rada" |
| Format papira A4 | `paper-size-fixer` | 21 x 29,7 cm | [Upute za pisanje i oblikovanje diplomskog/zavrsnog rada, 24.1.2020 (Odjel za informacijske znanosti i tehnologije, Sveuciliste u Zadru)](https://iz.unizd.hr/Portals/70/docs_novi_web_1/2_docs/upute%20za%20radove/ (dva zasebna dokumenta)) | S1.3.1 "Oblikovanje diplomskog rada" |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Zadar - Informacijske znanosti, završni rad

`unizd-informacijske-zavrsni` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Times New Roman | [Upute za pisanje i oblikovanje diplomskog/zavrsnog rada, 24.1.2020 (Odjel za informacijske znanosti i tehnologije, Sveuciliste u Zadru)](https://iz.unizd.hr/Portals/70/docs_novi_web_1/2_docs/upute%20za%20radove/ (dva zasebna dokumenta)) | S1.3.1 "Oblikovanje zavrsnog rada" |
| Velicina slova | `font-fixer` | 12 pt | [Upute za pisanje i oblikovanje diplomskog/zavrsnog rada, 24.1.2020 (Odjel za informacijske znanosti i tehnologije, Sveuciliste u Zadru)](https://iz.unizd.hr/Portals/70/docs_novi_web_1/2_docs/upute%20za%20radove/ (dva zasebna dokumenta)) | S1.3.1 "Oblikovanje zavrsnog rada" |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za pisanje i oblikovanje diplomskog/zavrsnog rada, 24.1.2020 (Odjel za informacijske znanosti i tehnologije, Sveuciliste u Zadru)](https://iz.unizd.hr/Portals/70/docs_novi_web_1/2_docs/upute%20za%20radove/ (dva zasebna dokumenta)) | S1.3.1 "Oblikovanje zavrsnog rada" |
| Format papira A4 | `paper-size-fixer` | 21 x 29,7 cm | [Upute za pisanje i oblikovanje diplomskog/zavrsnog rada, 24.1.2020 (Odjel za informacijske znanosti i tehnologije, Sveuciliste u Zadru)](https://iz.unizd.hr/Portals/70/docs_novi_web_1/2_docs/upute%20za%20radove/ (dva zasebna dokumenta)) | S1.3.1 "Oblikovanje zavrsnog rada" |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Zadar - Klasicna filologija, diplomski rad

`unizd-klasicna-filologija-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Times New Roman | [Upute za oblikovanje seminarskih, zavrsnih i diplomskih radova](https://klfil.unizd.hr/Portals/7/doc/Upute%20za%20oblikovanje%20seminarskih%2003-2021.pdf) | str. 2-3 "Postavke stranice" |
| Velicina slova | `font-fixer` | 12 pt | [Upute za oblikovanje seminarskih, zavrsnih i diplomskih radova](https://klfil.unizd.hr/Portals/7/doc/Upute%20za%20oblikovanje%20seminarskih%2003-2021.pdf) | str. 2-3 "Postavke stranice" |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za oblikovanje seminarskih, zavrsnih i diplomskih radova](https://klfil.unizd.hr/Portals/7/doc/Upute%20za%20oblikovanje%20seminarskih%2003-2021.pdf) | str. 2-3 "Postavke stranice" |
| Poravnanje | `alignment-fixer` | obostrano | [Upute za oblikovanje seminarskih, zavrsnih i diplomskih radova](https://klfil.unizd.hr/Portals/7/doc/Upute%20za%20oblikovanje%20seminarskih%2003-2021.pdf) | str. 2-3 "Postavke stranice" |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Upute za oblikovanje seminarskih, zavrsnih i diplomskih radova](https://klfil.unizd.hr/Portals/7/doc/Upute%20za%20oblikovanje%20seminarskih%2003-2021.pdf) | str. 2-3 "Postavke stranice" |
| Font i veličina fusnota | `footnote-typography-fixer` | 10 pt |  |  |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Zadar - Klasicna filologija, završni rad

`unizd-klasicna-filologija-zavrsni` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Times New Roman | [Upute za oblikovanje seminarskih, zavrsnih i diplomskih radova](https://klfil.unizd.hr/Portals/7/doc/Upute%20za%20oblikovanje%20seminarskih%2003-2021.pdf) | str. 2-3 "Postavke stranice" |
| Velicina slova | `font-fixer` | 12 pt | [Upute za oblikovanje seminarskih, zavrsnih i diplomskih radova](https://klfil.unizd.hr/Portals/7/doc/Upute%20za%20oblikovanje%20seminarskih%2003-2021.pdf) | str. 2-3 "Postavke stranice" |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za oblikovanje seminarskih, zavrsnih i diplomskih radova](https://klfil.unizd.hr/Portals/7/doc/Upute%20za%20oblikovanje%20seminarskih%2003-2021.pdf) | str. 2-3 "Postavke stranice" |
| Poravnanje | `alignment-fixer` | obostrano | [Upute za oblikovanje seminarskih, zavrsnih i diplomskih radova](https://klfil.unizd.hr/Portals/7/doc/Upute%20za%20oblikovanje%20seminarskih%2003-2021.pdf) | str. 2-3 "Postavke stranice" |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Upute za oblikovanje seminarskih, zavrsnih i diplomskih radova](https://klfil.unizd.hr/Portals/7/doc/Upute%20za%20oblikovanje%20seminarskih%2003-2021.pdf) | str. 2-3 "Postavke stranice" |
| Font i veličina fusnota | `footnote-typography-fixer` | 10 pt |  |  |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Zadar - Pedagogija, diplomski rad

`unizd-pedagogija-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Vrsta slova | `font-fixer` | Times New Roman | [Upute za pisanje diplomskog rada (Odjel za pedagogiju, Zadar, 2019)](https://www.unizd.hr/Portals/10/pdf/Upute%20za%20pisanje%20DIPLOMSKOG%20RADA_2019.pdf) | Upute, oblikovanje |
| Velicina slova | `font-fixer` | 12 pt | [Upute za pisanje diplomskog rada (Odjel za pedagogiju, Zadar, 2019)](https://www.unizd.hr/Portals/10/pdf/Upute%20za%20pisanje%20DIPLOMSKOG%20RADA_2019.pdf) | Upute, oblikovanje |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za pisanje diplomskog rada (Odjel za pedagogiju, Zadar, 2019)](https://www.unizd.hr/Portals/10/pdf/Upute%20za%20pisanje%20DIPLOMSKOG%20RADA_2019.pdf) | Upute, oblikovanje |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 3,5 cm (gore/desno/dolje/lijevo) | [Upute za pisanje diplomskog rada (Odjel za pedagogiju, Zadar, 2019)](https://www.unizd.hr/Portals/10/pdf/Upute%20za%20pisanje%20DIPLOMSKOG%20RADA_2019.pdf) | Upute, oblikovanje |
| Obostrano poravnanje | `alignment-fixer` | obostrano | [Upute za pisanje diplomskog rada (Odjel za pedagogiju, Zadar, 2019)](https://www.unizd.hr/Portals/10/pdf/Upute%20za%20pisanje%20DIPLOMSKOG%20RADA_2019.pdf) | Upute, oblikovanje |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Zadar - Pomorstvo, diplomski rad

`unizd-pomorski-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Merriweather | [Upute za pisanje zavrsnog/diplomskog rada (Pomorski odjel, Sveuciliste u Zadru)](https://pomorskiodjel.unizd.hr/Portals/1/upute%20diplomski_2.pdf (diplomski) / Upute%20zavrsni_1.pdf (zavrsni)) | Upute diplomski |
| Velicina slova | `font-fixer` | 10 pt | [Upute za pisanje zavrsnog/diplomskog rada (Pomorski odjel, Sveuciliste u Zadru)](https://pomorskiodjel.unizd.hr/Portals/1/upute%20diplomski_2.pdf (diplomski) / Upute%20zavrsni_1.pdf (zavrsni)) | Upute diplomski |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za pisanje zavrsnog/diplomskog rada (Pomorski odjel, Sveuciliste u Zadru)](https://pomorskiodjel.unizd.hr/Portals/1/upute%20diplomski_2.pdf (diplomski) / Upute%20zavrsni_1.pdf (zavrsni)) | Upute diplomski |
| Format papira A4 | `paper-size-fixer` | 21 x 29,7 cm | [Upute za pisanje zavrsnog/diplomskog rada (Pomorski odjel, Sveuciliste u Zadru)](https://pomorskiodjel.unizd.hr/Portals/1/upute%20diplomski_2.pdf (diplomski) / Upute%20zavrsni_1.pdf (zavrsni)) | Upute diplomski |
| Poravnanje | `alignment-fixer` | obostrano | [Upute za pisanje zavrsnog/diplomskog rada (Pomorski odjel, Sveuciliste u Zadru)](https://pomorskiodjel.unizd.hr/Portals/1/upute%20diplomski_2.pdf (diplomski) / Upute%20zavrsni_1.pdf (zavrsni)) | Upute diplomski |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Zadar - Pomorstvo, završni rad

`unizd-pomorski-zavrsni` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Merriweather | [Upute za pisanje zavrsnog rada (Pomorski odjel, Sveuciliste u Zadru)](https://pomorskiodjel.unizd.hr/Portals/1/Upute%20zavrsni_1.pdf) | Upute zavrsni |
| Velicina slova | `font-fixer` | 10 pt | [Upute za pisanje zavrsnog rada (Pomorski odjel, Sveuciliste u Zadru)](https://pomorskiodjel.unizd.hr/Portals/1/Upute%20zavrsni_1.pdf) | Upute zavrsni |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za pisanje zavrsnog rada (Pomorski odjel, Sveuciliste u Zadru)](https://pomorskiodjel.unizd.hr/Portals/1/Upute%20zavrsni_1.pdf) | Upute zavrsni |
| Format papira A4 | `paper-size-fixer` | 21 x 29,7 cm | [Upute za pisanje zavrsnog rada (Pomorski odjel, Sveuciliste u Zadru)](https://pomorskiodjel.unizd.hr/Portals/1/Upute%20zavrsni_1.pdf) | Upute zavrsni |
| Poravnanje | `alignment-fixer` | obostrano | [Upute za pisanje zavrsnog rada (Pomorski odjel, Sveuciliste u Zadru)](https://pomorskiodjel.unizd.hr/Portals/1/Upute%20zavrsni_1.pdf) | Upute zavrsni |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Zadar - Povijest, diplomski rad

`unizd-povijest-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format papira A4 | `paper-size-fixer` | 21 x 29,7 cm | [Upute za pisanje diplomskog rada](https://povijest.unizd.hr/Portals/3/Dokumenti/10_DIPLOMSKI_Diplomski%20rad_Upute_za_pisanje_2012%20(1).pdf) | Upute 2012 |
| Margine (lijeva 3,5cm) | `margins-fixer` | 2,5 / 2,5 / 2,5 / 3,5 cm (gore/desno/dolje/lijevo) | [Upute za pisanje diplomskog rada](https://povijest.unizd.hr/Portals/3/Dokumenti/10_DIPLOMSKI_Diplomski%20rad_Upute_za_pisanje_2012%20(1).pdf) | Upute 2012 |
| Velicina slova (preporuka) | `font-fixer` | 12 pt | [Upute za pisanje diplomskog rada](https://povijest.unizd.hr/Portals/3/Dokumenti/10_DIPLOMSKI_Diplomski%20rad_Upute_za_pisanje_2012%20(1).pdf) | Upute 2012 |
| Prored (dvostruki) (preporuka) | `line-spacing-fixer` | prored 2 | [Upute za pisanje diplomskog rada](https://povijest.unizd.hr/Portals/3/Dokumenti/10_DIPLOMSKI_Diplomski%20rad_Upute_za_pisanje_2012%20(1).pdf) | Upute 2012 |
| Font i veličina fusnota | `footnote-typography-fixer` | 10 pt |  |  |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Zadar - Povijest umjetnosti, diplomski rad

`unizd-povijest-umj-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Times New Roman | [Upute za prijavu i izradu diplomskoga rada, ozujak 2019 (Odjel za povijest umjetnosti, Sveuciliste u Zadru)](https://pum.unizd.hr/Portals/11/Odjel/Upute_za_prijavu_i_izradu_diplomskoga_rada.pdf) | Odjeljak 6 "Upute za pisanje diplomskoga rada" |
| Velicina slova | `font-fixer` | 12 pt | [Upute za prijavu i izradu diplomskoga rada, ozujak 2019 (Odjel za povijest umjetnosti, Sveuciliste u Zadru)](https://pum.unizd.hr/Portals/11/Odjel/Upute_za_prijavu_i_izradu_diplomskoga_rada.pdf) | Odjeljak 6 "Upute za pisanje diplomskoga rada" |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za prijavu i izradu diplomskoga rada, ozujak 2019 (Odjel za povijest umjetnosti, Sveuciliste u Zadru)](https://pum.unizd.hr/Portals/11/Odjel/Upute_za_prijavu_i_izradu_diplomskoga_rada.pdf) | Odjeljak 6 "Upute za pisanje diplomskoga rada" |
| Margine (lijeva 3,5cm) | `margins-fixer` | 2,5 / 2,5 / 2,5 / 3,5 cm (gore/desno/dolje/lijevo) | [Upute za prijavu i izradu diplomskoga rada, ozujak 2019 (Odjel za povijest umjetnosti, Sveuciliste u Zadru)](https://pum.unizd.hr/Portals/11/Odjel/Upute_za_prijavu_i_izradu_diplomskoga_rada.pdf) | Odjeljak 6 "Upute za pisanje diplomskoga rada" |
| Format papira A4 | `paper-size-fixer` | 21 x 29,7 cm | [Upute za prijavu i izradu diplomskoga rada, ozujak 2019 (Odjel za povijest umjetnosti, Sveuciliste u Zadru)](https://pum.unizd.hr/Portals/11/Odjel/Upute_za_prijavu_i_izradu_diplomskoga_rada.pdf) | Odjeljak 6 "Upute za pisanje diplomskoga rada" |
| Poravnanje | `alignment-fixer` | obostrano | [Upute za prijavu i izradu diplomskoga rada, ozujak 2019 (Odjel za povijest umjetnosti, Sveuciliste u Zadru)](https://pum.unizd.hr/Portals/11/Odjel/Upute_za_prijavu_i_izradu_diplomskoga_rada.pdf) | Odjeljak 6 "Upute za pisanje diplomskoga rada" |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Zadar - Povijest umjetnosti, završni rad

`unizd-povijest-umj-zavrsni` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Upute za prijavu i izradu zavrsnoga rada (Odjel za povijest umjetnosti, Zadar, 2019)](https://www.unizd.hr/Portals/11/Odjel/Upute_za_prijavu_i_izradu_zavrsnoga_rada.pdf) | Upute, oblikovanje |
| Vrsta slova | `font-fixer` | Times New Roman | [Upute za prijavu i izradu zavrsnoga rada (Odjel za povijest umjetnosti, Zadar, 2019)](https://www.unizd.hr/Portals/11/Odjel/Upute_za_prijavu_i_izradu_zavrsnoga_rada.pdf) | Upute, oblikovanje |
| Velicina slova | `font-fixer` | 12 pt | [Upute za prijavu i izradu zavrsnoga rada (Odjel za povijest umjetnosti, Zadar, 2019)](https://www.unizd.hr/Portals/11/Odjel/Upute_za_prijavu_i_izradu_zavrsnoga_rada.pdf) | Upute, oblikovanje |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 3,5 cm (gore/desno/dolje/lijevo) | [Upute za prijavu i izradu zavrsnoga rada (Odjel za povijest umjetnosti, Zadar, 2019)](https://www.unizd.hr/Portals/11/Odjel/Upute_za_prijavu_i_izradu_zavrsnoga_rada.pdf) | Upute, oblikovanje |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za prijavu i izradu zavrsnoga rada (Odjel za povijest umjetnosti, Zadar, 2019)](https://www.unizd.hr/Portals/11/Odjel/Upute_za_prijavu_i_izradu_zavrsnoga_rada.pdf) | Upute, oblikovanje |
| Obostrano poravnanje | `alignment-fixer` | obostrano | [Upute za prijavu i izradu zavrsnoga rada (Odjel za povijest umjetnosti, Zadar, 2019)](https://www.unizd.hr/Portals/11/Odjel/Upute_za_prijavu_i_izradu_zavrsnoga_rada.pdf) | Upute, oblikovanje |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Zadar - Povijest, završni rad

`unizd-povijest-zavrsni` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format papira A4 | `paper-size-fixer` | 21 x 29,7 cm | [Upute za pisanje zavrsnog/diplomskog rada](https://povijest.unizd.hr/Portals/3/Dokumenti/05_PREDDIPLOMSKI_Zavrsni%20rad_Upute_za_pisanje_2012%20(1).pdf (zavrsni) / 10_DIPLOMSKI_... (diplomski)) | Upute 2012 |
| Margine (lijeva 3,5cm) | `margins-fixer` | 2,5 / 2,5 / 2,5 / 3,5 cm (gore/desno/dolje/lijevo) | [Upute za pisanje zavrsnog/diplomskog rada](https://povijest.unizd.hr/Portals/3/Dokumenti/05_PREDDIPLOMSKI_Zavrsni%20rad_Upute_za_pisanje_2012%20(1).pdf (zavrsni) / 10_DIPLOMSKI_... (diplomski)) | Upute 2012 |
| Velicina slova (preporuka) | `font-fixer` | 12 pt | [Upute za pisanje zavrsnog/diplomskog rada](https://povijest.unizd.hr/Portals/3/Dokumenti/05_PREDDIPLOMSKI_Zavrsni%20rad_Upute_za_pisanje_2012%20(1).pdf (zavrsni) / 10_DIPLOMSKI_... (diplomski)) | Upute 2012 |
| Prored (dvostruki) (preporuka) | `line-spacing-fixer` | prored 2 | [Upute za pisanje zavrsnog/diplomskog rada](https://povijest.unizd.hr/Portals/3/Dokumenti/05_PREDDIPLOMSKI_Zavrsni%20rad_Upute_za_pisanje_2012%20(1).pdf (zavrsni) / 10_DIPLOMSKI_... (diplomski)) | Upute 2012 |
| Font i veličina fusnota | `footnote-typography-fixer` | 10 pt |  |  |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Zadar - Psihologija, diplomski rad

`unizd-psihologija-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Times New Roman | [Upute za izradu diplomskog rada (Odjel za psihologiju, Sveuciliste u Zadru)](https://psihologija.unizd.hr/Portals/12/Upute%20za%20izradu%20diplomskog%20rada.pdf) | Odjeljak 1 "Izgled diplomskog rada" |
| Velicina slova | `font-fixer` | 12 pt | [Upute za izradu diplomskog rada (Odjel za psihologiju, Sveuciliste u Zadru)](https://psihologija.unizd.hr/Portals/12/Upute%20za%20izradu%20diplomskog%20rada.pdf) | Odjeljak 1 "Izgled diplomskog rada" |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za izradu diplomskog rada (Odjel za psihologiju, Sveuciliste u Zadru)](https://psihologija.unizd.hr/Portals/12/Upute%20za%20izradu%20diplomskog%20rada.pdf) | Odjeljak 1 "Izgled diplomskog rada" |
| Margine (lijeva 3cm) | `margins-fixer` | 2,5 / 2,5 / 2,5 / 3 cm (gore/desno/dolje/lijevo) | [Upute za izradu diplomskog rada (Odjel za psihologiju, Sveuciliste u Zadru)](https://psihologija.unizd.hr/Portals/12/Upute%20za%20izradu%20diplomskog%20rada.pdf) | Odjeljak 1 "Izgled diplomskog rada" |
| Format papira A4 | `paper-size-fixer` | 21 x 29,7 cm | [Upute za izradu diplomskog rada (Odjel za psihologiju, Sveuciliste u Zadru)](https://psihologija.unizd.hr/Portals/12/Upute%20za%20izradu%20diplomskog%20rada.pdf) | Odjeljak 1 "Izgled diplomskog rada" |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Zadar - Psihologija, završni rad

`unizd-psihologija-zavrsni` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Upute za izradu zavrsnog rada (Odjel za psihologiju, Zadar)](https://www.unizd.hr/Portals/12/Studenti%20PDF/Upute%20za%20izradu%20zavr%C5%A1nog%20rada.pdf) | Upute, oblikovanje |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 3 cm (gore/desno/dolje/lijevo) | [Upute za izradu zavrsnog rada (Odjel za psihologiju, Zadar)](https://www.unizd.hr/Portals/12/Studenti%20PDF/Upute%20za%20izradu%20zavr%C5%A1nog%20rada.pdf) | Upute, oblikovanje |
| Vrsta slova | `font-fixer` | Times New Roman | [Upute za izradu zavrsnog rada (Odjel za psihologiju, Zadar)](https://www.unizd.hr/Portals/12/Studenti%20PDF/Upute%20za%20izradu%20zavr%C5%A1nog%20rada.pdf) | Upute, oblikovanje |
| Velicina slova | `font-fixer` | 12 pt | [Upute za izradu zavrsnog rada (Odjel za psihologiju, Zadar)](https://www.unizd.hr/Portals/12/Studenti%20PDF/Upute%20za%20izradu%20zavr%C5%A1nog%20rada.pdf) | Upute, oblikovanje |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za izradu zavrsnog rada (Odjel za psihologiju, Zadar)](https://www.unizd.hr/Portals/12/Studenti%20PDF/Upute%20za%20izradu%20zavr%C5%A1nog%20rada.pdf) | Upute, oblikovanje |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Zadar - Sociologija, diplomski rad

`unizd-sociologija-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Times New Roman | [Upute za prijavu i izradu diplomskoga rada](https://www.unizd.hr/Portals/13/NASTAVNI_MATERIJALI/Upute%20DipR%202014%20cultsoc.pdf) | Odjeljak 5, "Upute za pisanje diplomskoga rada" |
| Velicina slova | `font-fixer` | 12 pt | [Upute za prijavu i izradu diplomskoga rada](https://www.unizd.hr/Portals/13/NASTAVNI_MATERIJALI/Upute%20DipR%202014%20cultsoc.pdf) | Odjeljak 5, "Upute za pisanje diplomskoga rada" |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Upute za prijavu i izradu diplomskoga rada](https://www.unizd.hr/Portals/13/NASTAVNI_MATERIJALI/Upute%20DipR%202014%20cultsoc.pdf) | Odjeljak 5, "Upute za pisanje diplomskoga rada" |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za prijavu i izradu diplomskoga rada](https://www.unizd.hr/Portals/13/NASTAVNI_MATERIJALI/Upute%20DipR%202014%20cultsoc.pdf) | Odjeljak 5, "Upute za pisanje diplomskoga rada" |
| Poravnanje | `alignment-fixer` | obostrano | [Upute za prijavu i izradu diplomskoga rada](https://www.unizd.hr/Portals/13/NASTAVNI_MATERIJALI/Upute%20DipR%202014%20cultsoc.pdf) | Odjeljak 5, "Upute za pisanje diplomskoga rada" |
| Format papira A4 | `paper-size-fixer` | 21 x 29,7 cm | [Upute za prijavu i izradu diplomskoga rada](https://www.unizd.hr/Portals/13/NASTAVNI_MATERIJALI/Upute%20DipR%202014%20cultsoc.pdf) | Odjeljak 5, "Upute za pisanje diplomskoga rada" |
| Font i veličina fusnota | `footnote-typography-fixer` | 10 pt |  |  |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Zadar - Talijanistika, diplomski rad

`unizd-talijanistika-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font (preporuka) | `font-fixer` | Times New Roman | [Diplomski rad (stranica studija talijanistike)](https://talijanistika.unizd.hr/studij/diplomski-rad) | Stranica "diplomski-rad" |
| Velicina slova (preporuka) | `font-fixer` | 12 pt | [Diplomski rad (stranica studija talijanistike)](https://talijanistika.unizd.hr/studij/diplomski-rad) | Stranica "diplomski-rad" |
| Prored (preporuka) | `line-spacing-fixer` | prored 1,5 | [Diplomski rad (stranica studija talijanistike)](https://talijanistika.unizd.hr/studij/diplomski-rad) | Stranica "diplomski-rad" |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Zadar - Teolosko-katehetski odjel, diplomski rad

`unizd-tko-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Vrsta slova | `font-fixer` | Times New Roman | [Upute za izradu diplomskog rada — Teološko-katehetski odjel, Sveučilište u Zadru](https://tko.unizd.hr/Portals/65/Upute%20za%20izradu%20diplomskog%20rada_1.pdf) | str. 1, odjeljak 1.2. Izgled diplomskog rada |
| Velicina slova | `font-fixer` | 12 pt | [Upute za izradu diplomskog rada — Teološko-katehetski odjel, Sveučilište u Zadru](https://tko.unizd.hr/Portals/65/Upute%20za%20izradu%20diplomskog%20rada_1.pdf) | str. 1, odjeljak 1.2. Izgled diplomskog rada |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za izradu diplomskog rada — Teološko-katehetski odjel, Sveučilište u Zadru](https://tko.unizd.hr/Portals/65/Upute%20za%20izradu%20diplomskog%20rada_1.pdf) | str. 1, odjeljak 1.2. Izgled diplomskog rada |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Upute za izradu diplomskog rada — Teološko-katehetski odjel, Sveučilište u Zadru](https://tko.unizd.hr/Portals/65/Upute%20za%20izradu%20diplomskog%20rada_1.pdf) | str. 1, odjeljak 1.2. Izgled diplomskog rada |
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Upute za izradu diplomskog rada — Teološko-katehetski odjel, Sveučilište u Zadru](https://tko.unizd.hr/Portals/65/Upute%20za%20izradu%20diplomskog%20rada_1.pdf) | str. 1, odjeljak 1.2. Izgled diplomskog rada |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Zadar - Turizam i komunikacije, diplomski rad

`unizd-turizam-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Upute za izradu zavrsnoga i diplomskog rada (Odjel za turizam i komunikacijske znanosti, Zadar)](https://www.unizd.hr/Portals/46/DIPLOMSKI%2C%20ZAVRSNI%20I%20SEMINARSKI%20RADOVI/Zavrsni%20radovi/Upute%20za%20izradu%20zavrsnoga%20i%20diplomskog%20rada.pdf) | Upute, oblikovanje |
| Vrsta slova | `font-fixer` | Times New Roman | [Upute za izradu zavrsnoga i diplomskog rada (Odjel za turizam i komunikacijske znanosti, Zadar)](https://www.unizd.hr/Portals/46/DIPLOMSKI%2C%20ZAVRSNI%20I%20SEMINARSKI%20RADOVI/Zavrsni%20radovi/Upute%20za%20izradu%20zavrsnoga%20i%20diplomskog%20rada.pdf) | Upute, oblikovanje |
| Velicina slova | `font-fixer` | 12 pt | [Upute za izradu zavrsnoga i diplomskog rada (Odjel za turizam i komunikacijske znanosti, Zadar)](https://www.unizd.hr/Portals/46/DIPLOMSKI%2C%20ZAVRSNI%20I%20SEMINARSKI%20RADOVI/Zavrsni%20radovi/Upute%20za%20izradu%20zavrsnoga%20i%20diplomskog%20rada.pdf) | Upute, oblikovanje |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za izradu zavrsnoga i diplomskog rada (Odjel za turizam i komunikacijske znanosti, Zadar)](https://www.unizd.hr/Portals/46/DIPLOMSKI%2C%20ZAVRSNI%20I%20SEMINARSKI%20RADOVI/Zavrsni%20radovi/Upute%20za%20izradu%20zavrsnoga%20i%20diplomskog%20rada.pdf) | Upute, oblikovanje |
| Obostrano poravnanje | `alignment-fixer` | obostrano | [Upute za izradu zavrsnoga i diplomskog rada (Odjel za turizam i komunikacijske znanosti, Zadar)](https://www.unizd.hr/Portals/46/DIPLOMSKI%2C%20ZAVRSNI%20I%20SEMINARSKI%20RADOVI/Zavrsni%20radovi/Upute%20za%20izradu%20zavrsnoga%20i%20diplomskog%20rada.pdf) | Upute, oblikovanje |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Upute za izradu zavrsnoga i diplomskog rada (Odjel za turizam i komunikacijske znanosti, Zadar)](https://www.unizd.hr/Portals/46/DIPLOMSKI%2C%20ZAVRSNI%20I%20SEMINARSKI%20RADOVI/Zavrsni%20radovi/Upute%20za%20izradu%20zavrsnoga%20i%20diplomskog%20rada.pdf) | Upute, oblikovanje |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Zadar - Turizam i komunikacije, završni rad

`unizd-turizam-zavrsni` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Upute za izradu zavrsnoga i diplomskog rada (Odjel za turizam i komunikacijske znanosti, Zadar)](https://www.unizd.hr/Portals/46/DIPLOMSKI%2C%20ZAVRSNI%20I%20SEMINARSKI%20RADOVI/Zavrsni%20radovi/Upute%20za%20izradu%20zavrsnoga%20i%20diplomskog%20rada.pdf) | Upute, oblikovanje |
| Vrsta slova | `font-fixer` | Times New Roman | [Upute za izradu zavrsnoga i diplomskog rada (Odjel za turizam i komunikacijske znanosti, Zadar)](https://www.unizd.hr/Portals/46/DIPLOMSKI%2C%20ZAVRSNI%20I%20SEMINARSKI%20RADOVI/Zavrsni%20radovi/Upute%20za%20izradu%20zavrsnoga%20i%20diplomskog%20rada.pdf) | Upute, oblikovanje |
| Velicina slova | `font-fixer` | 12 pt | [Upute za izradu zavrsnoga i diplomskog rada (Odjel za turizam i komunikacijske znanosti, Zadar)](https://www.unizd.hr/Portals/46/DIPLOMSKI%2C%20ZAVRSNI%20I%20SEMINARSKI%20RADOVI/Zavrsni%20radovi/Upute%20za%20izradu%20zavrsnoga%20i%20diplomskog%20rada.pdf) | Upute, oblikovanje |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za izradu zavrsnoga i diplomskog rada (Odjel za turizam i komunikacijske znanosti, Zadar)](https://www.unizd.hr/Portals/46/DIPLOMSKI%2C%20ZAVRSNI%20I%20SEMINARSKI%20RADOVI/Zavrsni%20radovi/Upute%20za%20izradu%20zavrsnoga%20i%20diplomskog%20rada.pdf) | Upute, oblikovanje |
| Obostrano poravnanje | `alignment-fixer` | obostrano | [Upute za izradu zavrsnoga i diplomskog rada (Odjel za turizam i komunikacijske znanosti, Zadar)](https://www.unizd.hr/Portals/46/DIPLOMSKI%2C%20ZAVRSNI%20I%20SEMINARSKI%20RADOVI/Zavrsni%20radovi/Upute%20za%20izradu%20zavrsnoga%20i%20diplomskog%20rada.pdf) | Upute, oblikovanje |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Upute za izradu zavrsnoga i diplomskog rada (Odjel za turizam i komunikacijske znanosti, Zadar)](https://www.unizd.hr/Portals/46/DIPLOMSKI%2C%20ZAVRSNI%20I%20SEMINARSKI%20RADOVI/Zavrsni%20radovi/Upute%20za%20izradu%20zavrsnoga%20i%20diplomskog%20rada.pdf) | Upute, oblikovanje |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Zadar - Izobrazba ucitelja i odgojitelja, diplomski rad

`unizd-ucitelji-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Times New Roman | [Pravila i upute o izradi diplomskog rada, 2018 (Odjel za izobrazbu ucitelja i odgojitelja, Zadar)](https://iuo.unizd.hr/Portals/50/Pravila%20i%20upute%20o%20izradi%20diplomskog%20rada_1.docx) | Odjeljak "Izgled diplomskog rada" |
| Velicina slova | `font-fixer` | 12 pt | [Pravila i upute o izradi diplomskog rada, 2018 (Odjel za izobrazbu ucitelja i odgojitelja, Zadar)](https://iuo.unizd.hr/Portals/50/Pravila%20i%20upute%20o%20izradi%20diplomskog%20rada_1.docx) | Odjeljak "Izgled diplomskog rada" |
| Prored | `line-spacing-fixer` | prored 1,5 | [Pravila i upute o izradi diplomskog rada, 2018 (Odjel za izobrazbu ucitelja i odgojitelja, Zadar)](https://iuo.unizd.hr/Portals/50/Pravila%20i%20upute%20o%20izradi%20diplomskog%20rada_1.docx) | Odjeljak "Izgled diplomskog rada" |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Pravila i upute o izradi diplomskog rada, 2018 (Odjel za izobrazbu ucitelja i odgojitelja, Zadar)](https://iuo.unizd.hr/Portals/50/Pravila%20i%20upute%20o%20izradi%20diplomskog%20rada_1.docx) | Odjeljak "Izgled diplomskog rada" |
| Format papira A4 | `paper-size-fixer` | 21 x 29,7 cm | [Pravila i upute o izradi diplomskog rada, 2018 (Odjel za izobrazbu ucitelja i odgojitelja, Zadar)](https://iuo.unizd.hr/Portals/50/Pravila%20i%20upute%20o%20izradi%20diplomskog%20rada_1.docx) | Odjeljak "Izgled diplomskog rada" |
| Poravnanje | `alignment-fixer` | obostrano | [Pravila i upute o izradi diplomskog rada, 2018 (Odjel za izobrazbu ucitelja i odgojitelja, Zadar)](https://iuo.unizd.hr/Portals/50/Pravila%20i%20upute%20o%20izradi%20diplomskog%20rada_1.docx) | Odjeljak "Izgled diplomskog rada" |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Zadar - Zdravstveni studiji (Sestrinstvo), diplomski rad

`unizd-zdravstvo-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Times New Roman | [Pravilnik o izradi i obrani zavrsnog/diplomskog rada, 30.9.2022 (Odjel za zdravstvene studije, Sveuciliste u Zadru)](https://www.unizd.hr/Portals/23/doc/aaaa2022-23/ (zavrsni i diplomski, zasebni PDF-ovi)) | Clanak 7 + Prilog 4 |
| Velicina slova | `font-fixer` | 12 pt | [Pravilnik o izradi i obrani zavrsnog/diplomskog rada, 30.9.2022 (Odjel za zdravstvene studije, Sveuciliste u Zadru)](https://www.unizd.hr/Portals/23/doc/aaaa2022-23/ (zavrsni i diplomski, zasebni PDF-ovi)) | Clanak 7 + Prilog 4 |
| Format papira A4 | `paper-size-fixer` | 21 x 29,7 cm | [Pravilnik o izradi i obrani zavrsnog/diplomskog rada, 30.9.2022 (Odjel za zdravstvene studije, Sveuciliste u Zadru)](https://www.unizd.hr/Portals/23/doc/aaaa2022-23/ (zavrsni i diplomski, zasebni PDF-ovi)) | Clanak 7 + Prilog 4 |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Zadar - Zdravstveni studiji (Sestrinstvo), završni rad

`unizd-zdravstvo-zavrsni` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Times New Roman | [Pravilnik o izradi i obrani zavrsnog/diplomskog rada, 30.9.2022 (Odjel za zdravstvene studije, Sveuciliste u Zadru)](https://www.unizd.hr/Portals/23/doc/aaaa2022-23/ (zavrsni i diplomski, zasebni PDF-ovi)) | Clanak 8 + Prilog 4 |
| Velicina slova | `font-fixer` | 12 pt | [Pravilnik o izradi i obrani zavrsnog/diplomskog rada, 30.9.2022 (Odjel za zdravstvene studije, Sveuciliste u Zadru)](https://www.unizd.hr/Portals/23/doc/aaaa2022-23/ (zavrsni i diplomski, zasebni PDF-ovi)) | Clanak 8 + Prilog 4 |
| Format papira A4 | `paper-size-fixer` | 21 x 29,7 cm | [Pravilnik o izradi i obrani zavrsnog/diplomskog rada, 30.9.2022 (Odjel za zdravstvene studije, Sveuciliste u Zadru)](https://www.unizd.hr/Portals/23/doc/aaaa2022-23/ (zavrsni i diplomski, zasebni PDF-ovi)) | Clanak 8 + Prilog 4 |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### vef

#### Veterinarski fakultet, diplomski rad

`vef-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Times New Roman | [Naputak za prijavu, pisanje i oblikovanje diplomskog rada (Veterinarski fakultet, 2024)](https://www.vef.unizg.hr/wp-content/uploads/2024/01/N-A-P-U-T-A-K-za-prijavu-pisanje-i-oblikovanje-diplomskig-rada-odobren-Fakultetsko-vijece-24.1.2024.pdf) | odjeljak 4. Tehnicke upute za izradu diplomskog rada |
| Velicina slova | `font-fixer` | 12 pt | [Naputak za prijavu, pisanje i oblikovanje diplomskog rada (Veterinarski fakultet, 2024)](https://www.vef.unizg.hr/wp-content/uploads/2024/01/N-A-P-U-T-A-K-za-prijavu-pisanje-i-oblikovanje-diplomskig-rada-odobren-Fakultetsko-vijece-24.1.2024.pdf) | odjeljak 4. Tehnicke upute za izradu diplomskog rada |
| Prored | `line-spacing-fixer` | prored 1,5 | [Naputak za prijavu, pisanje i oblikovanje diplomskog rada (Veterinarski fakultet, 2024)](https://www.vef.unizg.hr/wp-content/uploads/2024/01/N-A-P-U-T-A-K-za-prijavu-pisanje-i-oblikovanje-diplomskig-rada-odobren-Fakultetsko-vijece-24.1.2024.pdf) | odjeljak 4. Tehnicke upute za izradu diplomskog rada |
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Naputak za prijavu, pisanje i oblikovanje diplomskog rada (Veterinarski fakultet, 2024)](https://www.vef.unizg.hr/wp-content/uploads/2024/01/N-A-P-U-T-A-K-za-prijavu-pisanje-i-oblikovanje-diplomskig-rada-odobren-Fakultetsko-vijece-24.1.2024.pdf) | odjeljak 4. Tehnicke upute za izradu diplomskog rada |
| Margine (lijevo i desno) | `margins-fixer` | ? / 2,5 / ? / 2,5 cm (gore/desno/dolje/lijevo) | [Naputak za prijavu, pisanje i oblikovanje diplomskog rada (Veterinarski fakultet, 2024)](https://www.vef.unizg.hr/wp-content/uploads/2024/01/N-A-P-U-T-A-K-za-prijavu-pisanje-i-oblikovanje-diplomskig-rada-odobren-Fakultetsko-vijece-24.1.2024.pdf) | odjeljak 4. Tehnicke upute za izradu diplomskog rada |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Sadrzaj kao zivo TOC polje | `toc-field-fixer` | Word sam azurira sadrzaj<br><sub>Dokument ima naslov Sadrzaj, a jos nema zivo TOC polje. Nedestruktivno: rucne stavke se ne brisu.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Veterinarski fakultet, doktorski rad

`vef-doktorski` · status: partial · vrste rada: doctoral

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Times New Roman | [Upute za oblikovanje doktorskog rada (Obrazac DR.SC.-08)](https://www.unizg.hr/nc/vijest/article/obrasci-za-doktorski-studij/) | odjeljak 'Postavke stranice' (DR.SC.-08, Upute za oblikovanje doktorskog rada) |
| Velicina slova | `font-fixer` | 12 pt | [Upute za oblikovanje doktorskog rada (Obrazac DR.SC.-08)](https://www.unizg.hr/nc/vijest/article/obrasci-za-doktorski-studij/) | odjeljak 'Postavke stranice' (DR.SC.-08, Upute za oblikovanje doktorskog rada) |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za oblikovanje doktorskog rada (Obrazac DR.SC.-08)](https://www.unizg.hr/nc/vijest/article/obrasci-za-doktorski-studij/) | odjeljak 'Postavke stranice' (DR.SC.-08, Upute za oblikovanje doktorskog rada) |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Upute za oblikovanje doktorskog rada (Obrazac DR.SC.-08)](https://www.unizg.hr/nc/vijest/article/obrasci-za-doktorski-studij/) | odjeljak 'Postavke stranice' (DR.SC.-08, Upute za oblikovanje doktorskog rada) |
| Format papira A4 | `paper-size-fixer` | 21 x 29,7 cm | [Upute za oblikovanje doktorskog rada (Obrazac DR.SC.-08)](https://www.unizg.hr/nc/vijest/article/obrasci-za-doktorski-studij/) | odjeljak 'Postavke stranice' (DR.SC.-08, Upute za oblikovanje doktorskog rada) |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### veleknin

#### Veleučilište Marko Marulić Knin, diplomski rad

`veleknin-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Times New Roman | [Upute za izradu zavrsnog/diplomskog rada](https://www.veleknin.hr (Veleuciliste "Marko Marulic" u Kninu, .doc)) | Upute, opci dio |
| Velicina slova | `font-fixer` | 12 pt | [Upute za izradu zavrsnog/diplomskog rada](https://www.veleknin.hr (Veleuciliste "Marko Marulic" u Kninu, .doc)) | Upute, opci dio |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za izradu zavrsnog/diplomskog rada](https://www.veleknin.hr (Veleuciliste "Marko Marulic" u Kninu, .doc)) | Upute, opci dio |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Upute za izradu zavrsnog/diplomskog rada](https://www.veleknin.hr (Veleuciliste "Marko Marulic" u Kninu, .doc)) | Upute, opci dio |
| Poravnanje | `alignment-fixer` | obostrano | [Upute za izradu zavrsnog/diplomskog rada](https://www.veleknin.hr (Veleuciliste "Marko Marulic" u Kninu, .doc)) | Upute, opci dio |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Veleučilište Knin, završni rad

`veleknin-zavrsni` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Upute za izradu i obranu završnog rada (Veleučilište Marko Marulić u Kninu, 2020)](https://www.veleknin.hr/wp-content/uploads/2023/12/uputezaizraduiobranuzavrnograda.pdf) | Upute, 3. Tehnicki izgled |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Upute za izradu i obranu završnog rada (Veleučilište Marko Marulić u Kninu, 2020)](https://www.veleknin.hr/wp-content/uploads/2023/12/uputezaizraduiobranuzavrnograda.pdf) | Upute, 3. Tehnicki izgled |
| Vrsta slova | `font-fixer` | Times New Roman | [Upute za izradu i obranu završnog rada (Veleučilište Marko Marulić u Kninu, 2020)](https://www.veleknin.hr/wp-content/uploads/2023/12/uputezaizraduiobranuzavrnograda.pdf) | Upute, 3. Tehnicki izgled |
| Velicina slova | `font-fixer` | 12 pt | [Upute za izradu i obranu završnog rada (Veleučilište Marko Marulić u Kninu, 2020)](https://www.veleknin.hr/wp-content/uploads/2023/12/uputezaizraduiobranuzavrnograda.pdf) | Upute, 3. Tehnicki izgled |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za izradu i obranu završnog rada (Veleučilište Marko Marulić u Kninu, 2020)](https://www.veleknin.hr/wp-content/uploads/2023/12/uputezaizraduiobranuzavrnograda.pdf) | Upute, 3. Tehnicki izgled |
| Obostrano poravnanje | `alignment-fixer` | obostrano | [Upute za izradu i obranu završnog rada (Veleučilište Marko Marulić u Kninu, 2020)](https://www.veleknin.hr/wp-content/uploads/2023/12/uputezaizraduiobranuzavrnograda.pdf) | Upute, 3. Tehnicki izgled |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### veleri

#### Veleučilište Rijeka, diplomski rad

`veleri-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Upute za formalni izgled završnog i diplomskog rada Veleučilišta u Rijeci](https://www.veleri.hr/sites/default/files/2023-01/upute-za-formalni-izgled-zavrsnog-i-diplomskog-rada-veleucilista-u-rijeci_0_0.pdf) | Upute, t. 3 Oblikovanje teksta |
| Vrsta slova | `font-fixer` | Times New Roman | [Upute za formalni izgled završnog i diplomskog rada Veleučilišta u Rijeci](https://www.veleri.hr/sites/default/files/2023-01/upute-za-formalni-izgled-zavrsnog-i-diplomskog-rada-veleucilista-u-rijeci_0_0.pdf) | Upute, t. 3 Oblikovanje teksta |
| Velicina slova | `font-fixer` | 12 pt | [Upute za formalni izgled završnog i diplomskog rada Veleučilišta u Rijeci](https://www.veleri.hr/sites/default/files/2023-01/upute-za-formalni-izgled-zavrsnog-i-diplomskog-rada-veleucilista-u-rijeci_0_0.pdf) | Upute, t. 3 Oblikovanje teksta |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za formalni izgled završnog i diplomskog rada Veleučilišta u Rijeci](https://www.veleri.hr/sites/default/files/2023-01/upute-za-formalni-izgled-zavrsnog-i-diplomskog-rada-veleucilista-u-rijeci_0_0.pdf) | Upute, t. 3 Oblikovanje teksta |
| Obostrano poravnanje | `alignment-fixer` | obostrano | [Upute za formalni izgled završnog i diplomskog rada Veleučilišta u Rijeci](https://www.veleri.hr/sites/default/files/2023-01/upute-za-formalni-izgled-zavrsnog-i-diplomskog-rada-veleucilista-u-rijeci_0_0.pdf) | Upute, t. 3 Oblikovanje teksta |
| Margine | `margins-fixer` | 3 / 2 / 3 / 3 cm (gore/desno/dolje/lijevo) | [Upute za formalni izgled završnog i diplomskog rada Veleučilišta u Rijeci](https://www.veleri.hr/sites/default/files/2023-01/upute-za-formalni-izgled-zavrsnog-i-diplomskog-rada-veleucilista-u-rijeci_0_0.pdf) | Upute, t. 3 Oblikovanje teksta |
| Font i veličina fusnota | `footnote-typography-fixer` | Times New Roman, 10 pt |  |  |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Veleučilište Rijeka, završni rad

`veleri-zavrsni` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Upute za formalni izgled završnog i diplomskog rada Veleučilišta u Rijeci](https://www.veleri.hr/sites/default/files/2023-01/upute-za-formalni-izgled-zavrsnog-i-diplomskog-rada-veleucilista-u-rijeci_0_0.pdf) | Upute, t. 3 Oblikovanje teksta |
| Vrsta slova | `font-fixer` | Times New Roman | [Upute za formalni izgled završnog i diplomskog rada Veleučilišta u Rijeci](https://www.veleri.hr/sites/default/files/2023-01/upute-za-formalni-izgled-zavrsnog-i-diplomskog-rada-veleucilista-u-rijeci_0_0.pdf) | Upute, t. 3 Oblikovanje teksta |
| Velicina slova | `font-fixer` | 12 pt | [Upute za formalni izgled završnog i diplomskog rada Veleučilišta u Rijeci](https://www.veleri.hr/sites/default/files/2023-01/upute-za-formalni-izgled-zavrsnog-i-diplomskog-rada-veleucilista-u-rijeci_0_0.pdf) | Upute, t. 3 Oblikovanje teksta |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za formalni izgled završnog i diplomskog rada Veleučilišta u Rijeci](https://www.veleri.hr/sites/default/files/2023-01/upute-za-formalni-izgled-zavrsnog-i-diplomskog-rada-veleucilista-u-rijeci_0_0.pdf) | Upute, t. 3 Oblikovanje teksta |
| Obostrano poravnanje | `alignment-fixer` | obostrano | [Upute za formalni izgled završnog i diplomskog rada Veleučilišta u Rijeci](https://www.veleri.hr/sites/default/files/2023-01/upute-za-formalni-izgled-zavrsnog-i-diplomskog-rada-veleucilista-u-rijeci_0_0.pdf) | Upute, t. 3 Oblikovanje teksta |
| Margine | `margins-fixer` | 3 / 2 / 3 / 3 cm (gore/desno/dolje/lijevo) | [Upute za formalni izgled završnog i diplomskog rada Veleučilišta u Rijeci](https://www.veleri.hr/sites/default/files/2023-01/upute-za-formalni-izgled-zavrsnog-i-diplomskog-rada-veleucilista-u-rijeci_0_0.pdf) | Upute, t. 3 Oblikovanje teksta |
| Font i veličina fusnota | `footnote-typography-fixer` | Times New Roman, 10 pt |  |  |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### vevu

#### VEVU, diplomski rad

`vevu-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format papira A4 | `paper-size-fixer` | 21 x 29,7 cm | [Prilog 4 - Upute za izradu diplomskog rada](https://www.vevu.hr (Veleuciliste "Lavoslav Ruzicka" u Vukovaru)) | Prilog 4, odjeljak "OBRADA TEKSTA" |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Prilog 4 - Upute za izradu diplomskog rada](https://www.vevu.hr (Veleuciliste "Lavoslav Ruzicka" u Vukovaru)) | Prilog 4, odjeljak "OBRADA TEKSTA" |
| Font | `font-fixer` | Times New Roman | [Prilog 4 - Upute za izradu diplomskog rada](https://www.vevu.hr (Veleuciliste "Lavoslav Ruzicka" u Vukovaru)) | Prilog 4, odjeljak "OBRADA TEKSTA" |
| Velicina slova | `font-fixer` | 12 pt | [Prilog 4 - Upute za izradu diplomskog rada](https://www.vevu.hr (Veleuciliste "Lavoslav Ruzicka" u Vukovaru)) | Prilog 4, odjeljak "OBRADA TEKSTA" |
| Prored | `line-spacing-fixer` | prored 1,5 | [Prilog 4 - Upute za izradu diplomskog rada](https://www.vevu.hr (Veleuciliste "Lavoslav Ruzicka" u Vukovaru)) | Prilog 4, odjeljak "OBRADA TEKSTA" |
| Poravnanje | `alignment-fixer` | obostrano | [Prilog 4 - Upute za izradu diplomskog rada](https://www.vevu.hr (Veleuciliste "Lavoslav Ruzicka" u Vukovaru)) | Prilog 4, odjeljak "OBRADA TEKSTA" |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Veleučilište Vukovar, završni rad

`vevu-zavrsni` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Prilog 4 - Upute za izradu završnog rada (Veleučilište Lavoslav Ružička u Vukovaru)](http://www.vevu.hr/uploads/50Prilog-4-Upute-za-izradu-zavrsnog-rada.pdf) | Upute, Obrada teksta |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Prilog 4 - Upute za izradu završnog rada (Veleučilište Lavoslav Ružička u Vukovaru)](http://www.vevu.hr/uploads/50Prilog-4-Upute-za-izradu-zavrsnog-rada.pdf) | Upute, Obrada teksta |
| Vrsta slova | `font-fixer` | Times New Roman | [Prilog 4 - Upute za izradu završnog rada (Veleučilište Lavoslav Ružička u Vukovaru)](http://www.vevu.hr/uploads/50Prilog-4-Upute-za-izradu-zavrsnog-rada.pdf) | Upute, Obrada teksta |
| Velicina slova | `font-fixer` | 12 pt | [Prilog 4 - Upute za izradu završnog rada (Veleučilište Lavoslav Ružička u Vukovaru)](http://www.vevu.hr/uploads/50Prilog-4-Upute-za-izradu-zavrsnog-rada.pdf) | Upute, Obrada teksta |
| Prored | `line-spacing-fixer` | prored 1,5 | [Prilog 4 - Upute za izradu završnog rada (Veleučilište Lavoslav Ružička u Vukovaru)](http://www.vevu.hr/uploads/50Prilog-4-Upute-za-izradu-zavrsnog-rada.pdf) | Upute, Obrada teksta |
| Obostrano poravnanje | `alignment-fixer` | obostrano | [Prilog 4 - Upute za izradu završnog rada (Veleučilište Lavoslav Ružička u Vukovaru)](http://www.vevu.hr/uploads/50Prilog-4-Upute-za-izradu-zavrsnog-rada.pdf) | Upute, Obrada teksta |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### vguk

#### Veleučilište Krizevci, diplomski rad

`vguk-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Times New Roman | [Smjernice za pisanje zavrsnog/diplomskog rada na Veleucilistu u Krizevcima](https://www.vguk.hr/upload/Hodogrami/Prijediplomski/Novi_obrasci_OK/2026_Smjernice_za_pisanje_Zavrsnog_Diplomskog_rada.pdf) | odjeljak 'TEHNICKE UPUTE ZA PISANJE ZAVRSNOG/DIPLOMSKOG RADA' (OSNOVNE UPUTE) |
| Velicina slova | `font-fixer` | 12 pt | [Smjernice za pisanje zavrsnog/diplomskog rada na Veleucilistu u Krizevcima](https://www.vguk.hr/upload/Hodogrami/Prijediplomski/Novi_obrasci_OK/2026_Smjernice_za_pisanje_Zavrsnog_Diplomskog_rada.pdf) | odjeljak 'TEHNICKE UPUTE ZA PISANJE ZAVRSNOG/DIPLOMSKOG RADA' (OSNOVNE UPUTE) |
| Prored | `line-spacing-fixer` | prored 1,5 | [Smjernice za pisanje zavrsnog/diplomskog rada na Veleucilistu u Krizevcima](https://www.vguk.hr/upload/Hodogrami/Prijediplomski/Novi_obrasci_OK/2026_Smjernice_za_pisanje_Zavrsnog_Diplomskog_rada.pdf) | odjeljak 'TEHNICKE UPUTE ZA PISANJE ZAVRSNOG/DIPLOMSKOG RADA' (OSNOVNE UPUTE) |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 3 cm (gore/desno/dolje/lijevo) | [Smjernice za pisanje zavrsnog/diplomskog rada na Veleucilistu u Krizevcima](https://www.vguk.hr/upload/Hodogrami/Prijediplomski/Novi_obrasci_OK/2026_Smjernice_za_pisanje_Zavrsnog_Diplomskog_rada.pdf) | odjeljak 'TEHNICKE UPUTE ZA PISANJE ZAVRSNOG/DIPLOMSKOG RADA' (OSNOVNE UPUTE) |
| Poravnanje | `alignment-fixer` | obostrano | [Smjernice za pisanje zavrsnog/diplomskog rada na Veleucilistu u Krizevcima](https://www.vguk.hr/upload/Hodogrami/Prijediplomski/Novi_obrasci_OK/2026_Smjernice_za_pisanje_Zavrsnog_Diplomskog_rada.pdf) | odjeljak 'TEHNICKE UPUTE ZA PISANJE ZAVRSNOG/DIPLOMSKOG RADA' (OSNOVNE UPUTE) |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Veleučilište Krizevci, završni rad

`vguk-zavrsni` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Times New Roman | [Smjernice za pisanje zavrsnog/diplomskog rada na Veleucilistu u Krizevcima](https://www.vguk.hr/upload/Hodogrami/Prijediplomski/Novi_obrasci_OK/2026_Smjernice_za_pisanje_Zavrsnog_Diplomskog_rada.pdf) | odjeljak 'TEHNICKE UPUTE ZA PISANJE ZAVRSNOG/DIPLOMSKOG RADA' (OSNOVNE UPUTE) |
| Velicina slova | `font-fixer` | 12 pt | [Smjernice za pisanje zavrsnog/diplomskog rada na Veleucilistu u Krizevcima](https://www.vguk.hr/upload/Hodogrami/Prijediplomski/Novi_obrasci_OK/2026_Smjernice_za_pisanje_Zavrsnog_Diplomskog_rada.pdf) | odjeljak 'TEHNICKE UPUTE ZA PISANJE ZAVRSNOG/DIPLOMSKOG RADA' (OSNOVNE UPUTE) |
| Prored | `line-spacing-fixer` | prored 1,5 | [Smjernice za pisanje zavrsnog/diplomskog rada na Veleucilistu u Krizevcima](https://www.vguk.hr/upload/Hodogrami/Prijediplomski/Novi_obrasci_OK/2026_Smjernice_za_pisanje_Zavrsnog_Diplomskog_rada.pdf) | odjeljak 'TEHNICKE UPUTE ZA PISANJE ZAVRSNOG/DIPLOMSKOG RADA' (OSNOVNE UPUTE) |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 3 cm (gore/desno/dolje/lijevo) | [Smjernice za pisanje zavrsnog/diplomskog rada na Veleucilistu u Krizevcima](https://www.vguk.hr/upload/Hodogrami/Prijediplomski/Novi_obrasci_OK/2026_Smjernice_za_pisanje_Zavrsnog_Diplomskog_rada.pdf) | odjeljak 'TEHNICKE UPUTE ZA PISANJE ZAVRSNOG/DIPLOMSKOG RADA' (OSNOVNE UPUTE) |
| Poravnanje | `alignment-fixer` | obostrano | [Smjernice za pisanje zavrsnog/diplomskog rada na Veleucilistu u Krizevcima](https://www.vguk.hr/upload/Hodogrami/Prijediplomski/Novi_obrasci_OK/2026_Smjernice_za_pisanje_Zavrsnog_Diplomskog_rada.pdf) | odjeljak 'TEHNICKE UPUTE ZA PISANJE ZAVRSNOG/DIPLOMSKOG RADA' (OSNOVNE UPUTE) |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### vhzk

#### Veleučilište Krapina, završni rad

`vhzk-zavrsni` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Velicina slova | `font-fixer` | 12 pt | [Privremeni pravilnik o završnom radu s Prilogom 7 (Veleučilište Hrvatsko zagorje Krapina, 2022)](https://www.vhzk.hr/Uploads/Documents/Privremeni%20pravilnik%20o%20zavr%C5%A1nom%20radu%202022%20web.pdf) | Prilog 7, tehnicko oblikovanje |
| Prored | `line-spacing-fixer` | prored 1,5 | [Privremeni pravilnik o završnom radu s Prilogom 7 (Veleučilište Hrvatsko zagorje Krapina, 2022)](https://www.vhzk.hr/Uploads/Documents/Privremeni%20pravilnik%20o%20zavr%C5%A1nom%20radu%202022%20web.pdf) | Prilog 7, tehnicko oblikovanje |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Privremeni pravilnik o završnom radu s Prilogom 7 (Veleučilište Hrvatsko zagorje Krapina, 2022)](https://www.vhzk.hr/Uploads/Documents/Privremeni%20pravilnik%20o%20zavr%C5%A1nom%20radu%202022%20web.pdf) | Prilog 7, tehnicko oblikovanje |
| Obostrano poravnanje | `alignment-fixer` | obostrano | [Privremeni pravilnik o završnom radu s Prilogom 7 (Veleučilište Hrvatsko zagorje Krapina, 2022)](https://www.vhzk.hr/Uploads/Documents/Privremeni%20pravilnik%20o%20zavr%C5%A1nom%20radu%202022%20web.pdf) | Prilog 7, tehnicko oblikovanje |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### vkjs

#### VKJS, diplomski rad

`vkjs-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Upute za izradu zavrsnog/diplomskog rada (VKJS, 2024)](https://kriminalistika.gov.hr/UserDocsImages/04_vps/2024/Upute%20za%20izradu%20zavr%C5%A1nog_diplomskog%20rada.pdf) | t. 1.2. |
| Margine | `margins-fixer` | 2,5 / 2 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Upute za izradu zavrsnog/diplomskog rada (VKJS, 2024)](https://kriminalistika.gov.hr/UserDocsImages/04_vps/2024/Upute%20za%20izradu%20zavr%C5%A1nog_diplomskog%20rada.pdf) | t. 1.3. |
| Vrsta slova | `font-fixer` | Times New Roman | [Upute za izradu zavrsnog/diplomskog rada (VKJS, 2024)](https://kriminalistika.gov.hr/UserDocsImages/04_vps/2024/Upute%20za%20izradu%20zavr%C5%A1nog_diplomskog%20rada.pdf) | t. 1.4. |
| Velicina slova | `font-fixer` | 12 pt | [Upute za izradu zavrsnog/diplomskog rada (VKJS, 2024)](https://kriminalistika.gov.hr/UserDocsImages/04_vps/2024/Upute%20za%20izradu%20zavr%C5%A1nog_diplomskog%20rada.pdf) | t. 1.4. |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za izradu zavrsnog/diplomskog rada (VKJS, 2024)](https://kriminalistika.gov.hr/UserDocsImages/04_vps/2024/Upute%20za%20izradu%20zavr%C5%A1nog_diplomskog%20rada.pdf) | t. 1.4. |
| Obostrano poravnanje | `alignment-fixer` | obostrano | [Upute za izradu zavrsnog/diplomskog rada (VKJS, 2024)](https://kriminalistika.gov.hr/UserDocsImages/04_vps/2024/Upute%20za%20izradu%20zavr%C5%A1nog_diplomskog%20rada.pdf) | t. 1.8. |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### VKJS, završni rad

`vkjs-zavrsni` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Upute za izradu zavrsnog/diplomskog rada (VKJS, 2024)](https://kriminalistika.gov.hr/UserDocsImages/04_vps/2024/Upute%20za%20izradu%20zavr%C5%A1nog_diplomskog%20rada.pdf) | t. 1.2. |
| Margine | `margins-fixer` | 2,5 / 2 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Upute za izradu zavrsnog/diplomskog rada (VKJS, 2024)](https://kriminalistika.gov.hr/UserDocsImages/04_vps/2024/Upute%20za%20izradu%20zavr%C5%A1nog_diplomskog%20rada.pdf) | t. 1.3. |
| Vrsta slova | `font-fixer` | Times New Roman | [Upute za izradu zavrsnog/diplomskog rada (VKJS, 2024)](https://kriminalistika.gov.hr/UserDocsImages/04_vps/2024/Upute%20za%20izradu%20zavr%C5%A1nog_diplomskog%20rada.pdf) | t. 1.4. |
| Velicina slova | `font-fixer` | 12 pt | [Upute za izradu zavrsnog/diplomskog rada (VKJS, 2024)](https://kriminalistika.gov.hr/UserDocsImages/04_vps/2024/Upute%20za%20izradu%20zavr%C5%A1nog_diplomskog%20rada.pdf) | t. 1.4. |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za izradu zavrsnog/diplomskog rada (VKJS, 2024)](https://kriminalistika.gov.hr/UserDocsImages/04_vps/2024/Upute%20za%20izradu%20zavr%C5%A1nog_diplomskog%20rada.pdf) | t. 1.4. |
| Obostrano poravnanje | `alignment-fixer` | obostrano | [Upute za izradu zavrsnog/diplomskog rada (VKJS, 2024)](https://kriminalistika.gov.hr/UserDocsImages/04_vps/2024/Upute%20za%20izradu%20zavr%C5%A1nog_diplomskog%20rada.pdf) | t. 1.8. |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### vnt

#### Veleuciliste Nikola Tesla u Gospicu, diplomski rad

`vnt-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Pravilnik o završnom radu i diplomskom radu (Veleučilište „Nikola Tesla” u Gospiću, veljača 2025.)](https://velegs-nikolatesla.hr/pravilnici/Pravilnik%20o%20zavrsnom%20radu%202025.pdf) | Članak 30. (PDF str. 8), odjeljak '4.1. Način pisanja završnog rada/diplomskog rada' |
| Vrsta slova | `font-fixer` | Times New Roman | [Pravilnik o završnom radu i diplomskom radu (Veleučilište „Nikola Tesla” u Gospiću, veljača 2025.)](https://velegs-nikolatesla.hr/pravilnici/Pravilnik%20o%20zavrsnom%20radu%202025.pdf) | Članak 30. (PDF str. 8), odjeljak '4.1. Način pisanja završnog rada/diplomskog rada' |
| Velicina slova | `font-fixer` | 12 pt | [Pravilnik o završnom radu i diplomskom radu (Veleučilište „Nikola Tesla” u Gospiću, veljača 2025.)](https://velegs-nikolatesla.hr/pravilnici/Pravilnik%20o%20zavrsnom%20radu%202025.pdf) | Članak 30. (PDF str. 8), odjeljak '4.1. Način pisanja završnog rada/diplomskog rada' |
| Prored | `line-spacing-fixer` | prored 1,5 | [Pravilnik o završnom radu i diplomskom radu (Veleučilište „Nikola Tesla” u Gospiću, veljača 2025.)](https://velegs-nikolatesla.hr/pravilnici/Pravilnik%20o%20zavrsnom%20radu%202025.pdf) | Članak 30. (PDF str. 8), odjeljak '4.1. Način pisanja završnog rada/diplomskog rada' |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 3 cm (gore/desno/dolje/lijevo) | [Pravilnik o završnom radu i diplomskom radu (Veleučilište „Nikola Tesla” u Gospiću, veljača 2025.)](https://velegs-nikolatesla.hr/pravilnici/Pravilnik%20o%20zavrsnom%20radu%202025.pdf) | Članak 30. (PDF str. 8), odjeljak '4.1. Način pisanja završnog rada/diplomskog rada' |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Veleuciliste Nikola Tesla u Gospicu, zavrsni rad

`vnt-zavrsni` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Pravilnik o završnom radu i diplomskom radu (Veleučilište „Nikola Tesla” u Gospiću, veljača 2025.)](https://velegs-nikolatesla.hr/pravilnici/Pravilnik%20o%20zavrsnom%20radu%202025.pdf) | Članak 30. (PDF str. 8), odjeljak '4.1. Način pisanja završnog rada/diplomskog rada' |
| Vrsta slova | `font-fixer` | Times New Roman | [Pravilnik o završnom radu i diplomskom radu (Veleučilište „Nikola Tesla” u Gospiću, veljača 2025.)](https://velegs-nikolatesla.hr/pravilnici/Pravilnik%20o%20zavrsnom%20radu%202025.pdf) | Članak 30. (PDF str. 8), odjeljak '4.1. Način pisanja završnog rada/diplomskog rada' |
| Velicina slova | `font-fixer` | 12 pt | [Pravilnik o završnom radu i diplomskom radu (Veleučilište „Nikola Tesla” u Gospiću, veljača 2025.)](https://velegs-nikolatesla.hr/pravilnici/Pravilnik%20o%20zavrsnom%20radu%202025.pdf) | Članak 30. (PDF str. 8), odjeljak '4.1. Način pisanja završnog rada/diplomskog rada' |
| Prored | `line-spacing-fixer` | prored 1,5 | [Pravilnik o završnom radu i diplomskom radu (Veleučilište „Nikola Tesla” u Gospiću, veljača 2025.)](https://velegs-nikolatesla.hr/pravilnici/Pravilnik%20o%20zavrsnom%20radu%202025.pdf) | Članak 30. (PDF str. 8), odjeljak '4.1. Način pisanja završnog rada/diplomskog rada' |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 3 cm (gore/desno/dolje/lijevo) | [Pravilnik o završnom radu i diplomskom radu (Veleučilište „Nikola Tesla” u Gospiću, veljača 2025.)](https://velegs-nikolatesla.hr/pravilnici/Pravilnik%20o%20zavrsnom%20radu%202025.pdf) | Članak 30. (PDF str. 8), odjeljak '4.1. Način pisanja završnog rada/diplomskog rada' |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### vsig

#### Veleuciliste Ivanic-Grad, diplomski rad

`vsig-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Vrsta slova | `font-fixer` | Times New Roman | [Pravilnik o završnom i diplomskom radu na Veleučilištu Ivanić-Grad (oznaka 022-PRA-07-04-2023, vrijedi od 06.04.2023.) s prilogom Upute za izradu Rada](https://vsig.hr/web/wp-content/uploads/2021/05/022-PRA-07-04-2023-Pravilnik-o-zavrsnom-i-diplomskom-radu-na-Veleucilistu-Ivanic-Grad-v_1_compressed-1.pdf) | Prilog Upute za izradu Rada, odjeljak 'Općenito — oblikovanje', str. 17/41 (PDF str. 17) |
| Velicina slova | `font-fixer` | 12 pt | [Pravilnik o završnom i diplomskom radu na Veleučilištu Ivanić-Grad (oznaka 022-PRA-07-04-2023, vrijedi od 06.04.2023.) s prilogom Upute za izradu Rada](https://vsig.hr/web/wp-content/uploads/2021/05/022-PRA-07-04-2023-Pravilnik-o-zavrsnom-i-diplomskom-radu-na-Veleucilistu-Ivanic-Grad-v_1_compressed-1.pdf) | Prilog Upute za izradu Rada, odjeljak 'Općenito — oblikovanje', str. 17/41 (PDF str. 17) |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Pravilnik o završnom i diplomskom radu na Veleučilištu Ivanić-Grad (oznaka 022-PRA-07-04-2023, vrijedi od 06.04.2023.) s prilogom Upute za izradu Rada](https://vsig.hr/web/wp-content/uploads/2021/05/022-PRA-07-04-2023-Pravilnik-o-zavrsnom-i-diplomskom-radu-na-Veleucilistu-Ivanic-Grad-v_1_compressed-1.pdf) | Prilog Upute za izradu Rada, odjeljak 'Općenito — oblikovanje', str. 17/41 (PDF str. 17) |
| Prored | `line-spacing-fixer` | prored 1,5 | [Pravilnik o završnom i diplomskom radu na Veleučilištu Ivanić-Grad (oznaka 022-PRA-07-04-2023, vrijedi od 06.04.2023.) s prilogom Upute za izradu Rada](https://vsig.hr/web/wp-content/uploads/2021/05/022-PRA-07-04-2023-Pravilnik-o-zavrsnom-i-diplomskom-radu-na-Veleucilistu-Ivanic-Grad-v_1_compressed-1.pdf) | Prilog Upute za izradu Rada, odjeljak 'Općenito — oblikovanje', str. 17/41 (PDF str. 17) |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Veleuciliste Ivanic-Grad, zavrsni rad

`vsig-zavrsni` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Vrsta slova | `font-fixer` | Times New Roman | [Pravilnik o završnom i diplomskom radu na Veleučilištu Ivanić-Grad (oznaka 022-PRA-07-04-2023, vrijedi od 06.04.2023.) s prilogom Upute za izradu Rada](https://vsig.hr/web/wp-content/uploads/2021/05/022-PRA-07-04-2023-Pravilnik-o-zavrsnom-i-diplomskom-radu-na-Veleucilistu-Ivanic-Grad-v_1_compressed-1.pdf) | Prilog Upute za izradu Rada, odjeljak 'Općenito — oblikovanje', str. 17/41 (PDF str. 17) |
| Velicina slova | `font-fixer` | 12 pt | [Pravilnik o završnom i diplomskom radu na Veleučilištu Ivanić-Grad (oznaka 022-PRA-07-04-2023, vrijedi od 06.04.2023.) s prilogom Upute za izradu Rada](https://vsig.hr/web/wp-content/uploads/2021/05/022-PRA-07-04-2023-Pravilnik-o-zavrsnom-i-diplomskom-radu-na-Veleucilistu-Ivanic-Grad-v_1_compressed-1.pdf) | Prilog Upute za izradu Rada, odjeljak 'Općenito — oblikovanje', str. 17/41 (PDF str. 17) |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Pravilnik o završnom i diplomskom radu na Veleučilištu Ivanić-Grad (oznaka 022-PRA-07-04-2023, vrijedi od 06.04.2023.) s prilogom Upute za izradu Rada](https://vsig.hr/web/wp-content/uploads/2021/05/022-PRA-07-04-2023-Pravilnik-o-zavrsnom-i-diplomskom-radu-na-Veleucilistu-Ivanic-Grad-v_1_compressed-1.pdf) | Prilog Upute za izradu Rada, odjeljak 'Općenito — oblikovanje', str. 17/41 (PDF str. 17) |
| Prored | `line-spacing-fixer` | prored 1,5 | [Pravilnik o završnom i diplomskom radu na Veleučilištu Ivanić-Grad (oznaka 022-PRA-07-04-2023, vrijedi od 06.04.2023.) s prilogom Upute za izradu Rada](https://vsig.hr/web/wp-content/uploads/2021/05/022-PRA-07-04-2023-Pravilnik-o-zavrsnom-i-diplomskom-radu-na-Veleucilistu-Ivanic-Grad-v_1_compressed-1.pdf) | Prilog Upute za izradu Rada, odjeljak 'Općenito — oblikovanje', str. 17/41 (PDF str. 17) |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### vsite

#### VSITE, diplomski rad

`vsite-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Sadrzaj kao zivo TOC polje | `toc-field-fixer` | Word sam azurira sadrzaj<br><sub>Dokument ima naslov Sadrzaj, a jos nema zivo TOC polje. Nedestruktivno: rucne stavke se ne brisu.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### VSITE, završni rad

`vsite-zavrsni` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Sadrzaj kao zivo TOC polje | `toc-field-fixer` | Word sam azurira sadrzaj<br><sub>Dokument ima naslov Sadrzaj, a jos nema zivo TOC polje. Nedestruktivno: rucne stavke se ne brisu.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### vss

#### Veleučilište studija sigurnosti, diplomski rad

`vss-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Times New Roman | [Upute za izradu zavrsnog rada (Veleuciliste studija sigurnosti, lipanj 2023)](https://www.ssbm.ch/dokument/Upute%20za%20izradu%20zavrsnog%20rada.pdf?_t=1699439120) | Odjeljak "1.1. IZGLED ZAVRSNOG RADA", str. 5 |
| Velicina slova | `font-fixer` | 12 pt | [Upute za izradu zavrsnog rada (Veleuciliste studija sigurnosti, lipanj 2023)](https://www.ssbm.ch/dokument/Upute%20za%20izradu%20zavrsnog%20rada.pdf?_t=1699439120) | Odjeljak "1.1. IZGLED ZAVRSNOG RADA", str. 5 |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za izradu zavrsnog rada (Veleuciliste studija sigurnosti, lipanj 2023)](https://www.ssbm.ch/dokument/Upute%20za%20izradu%20zavrsnog%20rada.pdf?_t=1699439120) | Odjeljak "1.1. IZGLED ZAVRSNOG RADA", str. 5 |
| Margine (lijeva 3cm zbog uveza) | `margins-fixer` | 2,5 / 2,5 / 2,5 / 3 cm (gore/desno/dolje/lijevo) | [Upute za izradu zavrsnog rada (Veleuciliste studija sigurnosti, lipanj 2023)](https://www.ssbm.ch/dokument/Upute%20za%20izradu%20zavrsnog%20rada.pdf?_t=1699439120) | Odjeljak "1.1. IZGLED ZAVRSNOG RADA", str. 5 |
| Format papira A4 | `paper-size-fixer` | 21 x 29,7 cm | [Upute za izradu zavrsnog rada (Veleuciliste studija sigurnosti, lipanj 2023)](https://www.ssbm.ch/dokument/Upute%20za%20izradu%20zavrsnog%20rada.pdf?_t=1699439120) | Odjeljak "1.1. IZGLED ZAVRSNOG RADA", str. 5 |
| Poravnanje | `alignment-fixer` | obostrano | [Upute za izradu zavrsnog rada (Veleuciliste studija sigurnosti, lipanj 2023)](https://www.ssbm.ch/dokument/Upute%20za%20izradu%20zavrsnog%20rada.pdf?_t=1699439120) | Odjeljak "1.1. IZGLED ZAVRSNOG RADA", str. 5 |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Veleučilište studija sigurnosti, završni rad

`vss-zavrsni` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Times New Roman | [Upute za izradu zavrsnog rada (Veleuciliste studija sigurnosti, lipanj 2023)](https://www.ssbm.ch/dokument/Upute%20za%20izradu%20zavrsnog%20rada.pdf?_t=1699439120) | Odjeljak "1.1. IZGLED ZAVRSNOG RADA", str. 5 |
| Velicina slova | `font-fixer` | 12 pt | [Upute za izradu zavrsnog rada (Veleuciliste studija sigurnosti, lipanj 2023)](https://www.ssbm.ch/dokument/Upute%20za%20izradu%20zavrsnog%20rada.pdf?_t=1699439120) | Odjeljak "1.1. IZGLED ZAVRSNOG RADA", str. 5 |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za izradu zavrsnog rada (Veleuciliste studija sigurnosti, lipanj 2023)](https://www.ssbm.ch/dokument/Upute%20za%20izradu%20zavrsnog%20rada.pdf?_t=1699439120) | Odjeljak "1.1. IZGLED ZAVRSNOG RADA", str. 5 |
| Margine (lijeva 3cm zbog uveza) | `margins-fixer` | 2,5 / 2,5 / 2,5 / 3 cm (gore/desno/dolje/lijevo) | [Upute za izradu zavrsnog rada (Veleuciliste studija sigurnosti, lipanj 2023)](https://www.ssbm.ch/dokument/Upute%20za%20izradu%20zavrsnog%20rada.pdf?_t=1699439120) | Odjeljak "1.1. IZGLED ZAVRSNOG RADA", str. 5 |
| Format papira A4 | `paper-size-fixer` | 21 x 29,7 cm | [Upute za izradu zavrsnog rada (Veleuciliste studija sigurnosti, lipanj 2023)](https://www.ssbm.ch/dokument/Upute%20za%20izradu%20zavrsnog%20rada.pdf?_t=1699439120) | Odjeljak "1.1. IZGLED ZAVRSNOG RADA", str. 5 |
| Poravnanje | `alignment-fixer` | obostrano | [Upute za izradu zavrsnog rada (Veleuciliste studija sigurnosti, lipanj 2023)](https://www.ssbm.ch/dokument/Upute%20za%20izradu%20zavrsnog%20rada.pdf?_t=1699439120) | Odjeljak "1.1. IZGLED ZAVRSNOG RADA", str. 5 |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### vub

#### Veleučilište Bjelovar, diplomski rad

`vub-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Upute za izradu i oblikovanje diplomskog rada (Veleučilište u Bjelovaru, 2025)](https://vub.hr/wp-content/uploads/2025/11/UPUTE-ZA-IZRADU-I-OBLIKOVANJE-DIPLOMSKOG-RADA-3.pdf) | Upute, Opce upute |
| Vrsta slova | `font-fixer` | Times New Roman | [Upute za izradu i oblikovanje diplomskog rada (Veleučilište u Bjelovaru, 2025)](https://vub.hr/wp-content/uploads/2025/11/UPUTE-ZA-IZRADU-I-OBLIKOVANJE-DIPLOMSKOG-RADA-3.pdf) | Upute, Opce upute |
| Velicina slova | `font-fixer` | 12 pt | [Upute za izradu i oblikovanje diplomskog rada (Veleučilište u Bjelovaru, 2025)](https://vub.hr/wp-content/uploads/2025/11/UPUTE-ZA-IZRADU-I-OBLIKOVANJE-DIPLOMSKOG-RADA-3.pdf) | Upute, Opce upute |
| Obostrano poravnanje | `alignment-fixer` | obostrano | [Upute za izradu i oblikovanje diplomskog rada (Veleučilište u Bjelovaru, 2025)](https://vub.hr/wp-content/uploads/2025/11/UPUTE-ZA-IZRADU-I-OBLIKOVANJE-DIPLOMSKOG-RADA-3.pdf) | Upute, Opce upute |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za izradu i oblikovanje diplomskog rada (Veleučilište u Bjelovaru, 2025)](https://vub.hr/wp-content/uploads/2025/11/UPUTE-ZA-IZRADU-I-OBLIKOVANJE-DIPLOMSKOG-RADA-3.pdf) | Upute, Opce upute |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 3 cm (gore/desno/dolje/lijevo) | [Upute za izradu i oblikovanje diplomskog rada (Veleučilište u Bjelovaru, 2025)](https://vub.hr/wp-content/uploads/2025/11/UPUTE-ZA-IZRADU-I-OBLIKOVANJE-DIPLOMSKOG-RADA-3.pdf) | Upute, Opce upute |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### VUB Sestrinstvo, završni rad

`vub-zavrsni-sestrinstvo` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format papira A4 | `paper-size-fixer` | 21 x 29,7 cm | [Upute za izradu zavrsnog rada (Sestrinstvo)](https://www.vub.hr (Veleuciliste u Bjelovaru, strucni prijediplomski studij, .doc)) | Upute, opce + Cl.11 |
| Font | `font-fixer` | Times New Roman | [Upute za izradu zavrsnog rada (Sestrinstvo)](https://www.vub.hr (Veleuciliste u Bjelovaru, strucni prijediplomski studij, .doc)) | Upute, opce + Cl.11 |
| Velicina slova | `font-fixer` | 12 pt | [Upute za izradu zavrsnog rada (Sestrinstvo)](https://www.vub.hr (Veleuciliste u Bjelovaru, strucni prijediplomski studij, .doc)) | Upute, opce + Cl.11 |
| Poravnanje | `alignment-fixer` | obostrano | [Upute za izradu zavrsnog rada (Sestrinstvo)](https://www.vub.hr (Veleuciliste u Bjelovaru, strucni prijediplomski studij, .doc)) | Upute, opce + Cl.11 |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za izradu zavrsnog rada (Sestrinstvo)](https://www.vub.hr (Veleuciliste u Bjelovaru, strucni prijediplomski studij, .doc)) | Upute, opce + Cl.11 |
| Margine (lijeva 3cm za uvez) | `margins-fixer` | 2,5 / 2,5 / 2,5 / 3 cm (gore/desno/dolje/lijevo) | [Upute za izradu zavrsnog rada (Sestrinstvo)](https://www.vub.hr (Veleuciliste u Bjelovaru, strucni prijediplomski studij, .doc)) | Upute, opce + Cl.11 |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### VUB Mehatronika/Racunarstvo, završni rad

`vub-zavrsni-tehnicki` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format papira A4 | `paper-size-fixer` | 21 x 29,7 cm | [Upute za izradu zavrsnog rada (Mehatronika / Racunarstvo)](https://www.vub.hr (Veleuciliste u Bjelovaru, strucni prijediplomski studij)) | 2.1. Opce upute |
| Font | `font-fixer` | Times New Roman | [Upute za izradu zavrsnog rada (Mehatronika / Racunarstvo)](https://www.vub.hr (Veleuciliste u Bjelovaru, strucni prijediplomski studij)) | 2.1. Opce upute |
| Velicina slova | `font-fixer` | 12 pt | [Upute za izradu zavrsnog rada (Mehatronika / Racunarstvo)](https://www.vub.hr (Veleuciliste u Bjelovaru, strucni prijediplomski studij)) | 2.1. Opce upute |
| Poravnanje | `alignment-fixer` | obostrano | [Upute za izradu zavrsnog rada (Mehatronika / Racunarstvo)](https://www.vub.hr (Veleuciliste u Bjelovaru, strucni prijediplomski studij)) | 2.1. Opce upute |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za izradu zavrsnog rada (Mehatronika / Racunarstvo)](https://www.vub.hr (Veleuciliste u Bjelovaru, strucni prijediplomski studij)) | 2.1. Opce upute |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Upute za izradu zavrsnog rada (Mehatronika / Racunarstvo)](https://www.vub.hr (Veleuciliste u Bjelovaru, strucni prijediplomski studij)) | 2.1. Opce upute |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### vuka

#### Veleučilište Karlovac - Lovstvo i zaštita prirode, završni rad

`vuka-lovstvo-zavrsni` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Velicina slova | `font-fixer` | 12 pt | [Upute za seminarski/zavrsni rad (Lovstvo i zastita prirode)](https://www.vuka.hr/_download/repository/UPUTE_seminarski_zavrsni_rad%282%29.docx) | "Nacin pisanja zavrsnog rada" |
| Format papira A4 | `paper-size-fixer` | 21 x 29,7 cm | [Upute za seminarski/zavrsni rad (Lovstvo i zastita prirode)](https://www.vuka.hr/_download/repository/UPUTE_seminarski_zavrsni_rad%282%29.docx) | "Nacin pisanja zavrsnog rada" |
| Font (preporuka) | `font-fixer` | Arial | [Upute za seminarski/zavrsni rad (Lovstvo i zastita prirode)](https://www.vuka.hr/_download/repository/UPUTE_seminarski_zavrsni_rad%282%29.docx) | "Nacin pisanja zavrsnog rada" |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Veleučilište Karlovac - Poslovni odjel, diplomski rad

`vuka-poslovni-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Velicina slova | `font-fixer` | 12 pt | [Upute za pisanje seminarskih i zavrsnih radova - Poslovni odjel (Veleuciliste u Karlovcu)](https://www.vuka.hr/_download/repository/Upute_za_pisanje_seminarskih_i_zavrsnih_radova_PO.pdf) | odjeljak o oblikovanju (seminarski/zavrsni radovi) |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za pisanje seminarskih i zavrsnih radova - Poslovni odjel (Veleuciliste u Karlovcu)](https://www.vuka.hr/_download/repository/Upute_za_pisanje_seminarskih_i_zavrsnih_radova_PO.pdf) | odjeljak o oblikovanju (seminarski/zavrsni radovi) |
| Oblikovanje naslova po razinama | `heading-format-fixer` | razina 1 16 pt podebljano; razina 2 14 pt podebljano; razina 3 12 pt podebljano |  |  |
| Font i veličina fusnota | `footnote-typography-fixer` | 10 pt |  |  |
| Velika slova naslova | `heading-case-fixer` | velika slova, razine 1<br><sub>Trazi izricitu privolu (mijenja autorov tekst ili strukturu).</sub> |  |  |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Veleučilište u Karlovcu · Poslovni odjel · opći akademski rad

`vuka-poslovni-opci-akademski-rad` · status: partial · vrste rada: seminar, project, article

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Velicina slova | `font-fixer` | 12 pt | [Upute za pisanje seminarskih i zavrsnih radova - Poslovni odjel (Veleuciliste u Karlovcu)](https://www.vuka.hr/_download/repository/Upute_za_pisanje_seminarskih_i_zavrsnih_radova_PO.pdf) | odjeljak o oblikovanju (seminarski/zavrsni radovi) |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za pisanje seminarskih i zavrsnih radova - Poslovni odjel (Veleuciliste u Karlovcu)](https://www.vuka.hr/_download/repository/Upute_za_pisanje_seminarskih_i_zavrsnih_radova_PO.pdf) | odjeljak o oblikovanju (seminarski/zavrsni radovi) |
| Oblikovanje naslova po razinama | `heading-format-fixer` | razina 1 16 pt podebljano; razina 2 14 pt podebljano; razina 3 12 pt podebljano |  |  |
| Font i veličina fusnota | `footnote-typography-fixer` | 10 pt |  |  |
| Velika slova naslova | `heading-case-fixer` | velika slova, razine 1<br><sub>Trazi izricitu privolu (mijenja autorov tekst ili strukturu).</sub> |  |  |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Veleučilište Karlovac - Poslovni odjel, završni rad

`vuka-poslovni-zavrsni` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Velicina slova | `font-fixer` | 12 pt | [Upute za pisanje seminarskih i zavrsnih radova - Poslovni odjel (Veleuciliste u Karlovcu)](https://www.vuka.hr/_download/repository/Upute_za_pisanje_seminarskih_i_zavrsnih_radova_PO.pdf) | odjeljak o oblikovanju (seminarski/zavrsni radovi) |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za pisanje seminarskih i zavrsnih radova - Poslovni odjel (Veleuciliste u Karlovcu)](https://www.vuka.hr/_download/repository/Upute_za_pisanje_seminarskih_i_zavrsnih_radova_PO.pdf) | odjeljak o oblikovanju (seminarski/zavrsni radovi) |
| Oblikovanje naslova po razinama | `heading-format-fixer` | razina 1 16 pt podebljano; razina 2 14 pt podebljano; razina 3 12 pt podebljano |  |  |
| Font i veličina fusnota | `footnote-typography-fixer` | 10 pt |  |  |
| Velika slova naslova | `heading-case-fixer` | velika slova, razine 1<br><sub>Trazi izricitu privolu (mijenja autorov tekst ili strukturu).</sub> |  |  |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Veleučilište Karlovac - Prehrambena tehnologija, završni rad

`vuka-prehrambena-zavrsni` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Velicina slova | `font-fixer` | 12 pt | [Upute za pisanje zavrsnog rada (Prehrambena tehnologija)](https://www.vuka.hr/_download/repository/2025_Upute_za_pisanje_zavrs%CC%8Cnog_rada.docx) | "Kod pisanja zavrsnog rada mora se udovoljiti slijedecim zahtjevima" |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za pisanje zavrsnog rada (Prehrambena tehnologija)](https://www.vuka.hr/_download/repository/2025_Upute_za_pisanje_zavrs%CC%8Cnog_rada.docx) | "Kod pisanja zavrsnog rada mora se udovoljiti slijedecim zahtjevima" |
| Font (preporuka) | `font-fixer` | Arial | [Upute za pisanje zavrsnog rada (Prehrambena tehnologija)](https://www.vuka.hr/_download/repository/2025_Upute_za_pisanje_zavrs%CC%8Cnog_rada.docx) | "Kod pisanja zavrsnog rada mora se udovoljiti slijedecim zahtjevima" |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Veleučilište Karlovac - Sigurnost i zaštita, diplomski rad

`vuka-sigurnost-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font (preporuka) | `font-fixer` | Arial | [Upute za pisanje zavrsnog/diplomskog rada (Sigurnosne i preventivne djelatnosti)](https://www.vuka.hr/_download/repository/Upute_zavrs%CC%8Cni_diplomski_rad_SIZ-2026.docx) | Upute SIZ 2026 |
| Velicina slova (preporuka) | `font-fixer` | 12 pt | [Upute za pisanje zavrsnog/diplomskog rada (Sigurnosne i preventivne djelatnosti)](https://www.vuka.hr/_download/repository/Upute_zavrs%CC%8Cni_diplomski_rad_SIZ-2026.docx) | Upute SIZ 2026 |
| Prored (preporuka) | `line-spacing-fixer` | prored 1,5 | [Upute za pisanje zavrsnog/diplomskog rada (Sigurnosne i preventivne djelatnosti)](https://www.vuka.hr/_download/repository/Upute_zavrs%CC%8Cni_diplomski_rad_SIZ-2026.docx) | Upute SIZ 2026 |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Veleučilište Karlovac - Sigurnost i zaštita, završni rad

`vuka-sigurnost-zavrsni` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font (preporuka) | `font-fixer` | Arial | [Upute za pisanje zavrsnog/diplomskog rada (Sigurnosne i preventivne djelatnosti)](https://www.vuka.hr/_download/repository/Upute_zavrs%CC%8Cni_diplomski_rad_SIZ-2026.docx) | Upute SIZ 2026 |
| Velicina slova (preporuka) | `font-fixer` | 12 pt | [Upute za pisanje zavrsnog/diplomskog rada (Sigurnosne i preventivne djelatnosti)](https://www.vuka.hr/_download/repository/Upute_zavrs%CC%8Cni_diplomski_rad_SIZ-2026.docx) | Upute SIZ 2026 |
| Prored (preporuka) | `line-spacing-fixer` | prored 1,5 | [Upute za pisanje zavrsnog/diplomskog rada (Sigurnosne i preventivne djelatnosti)](https://www.vuka.hr/_download/repository/Upute_zavrs%CC%8Cni_diplomski_rad_SIZ-2026.docx) | Upute SIZ 2026 |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### vus

#### Veleučilište Sibenik, diplomski rad

`vus-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Times New Roman | [Pravilnik o zavrsnom i diplomskom radu (Veleuciliste u Sibeniku, 2023)](https://www.vus.hr/_download/repository/Pravilnik%20o%20zavr%C5%A1nom%20i%20diplomskom%20radu%5B3%5D.pdf) | Prilog I. (Upute za izradu zavrsnog i diplomskog rada), odjeljak '1. UVOD' |
| Velicina slova | `font-fixer` | 12 pt | [Pravilnik o zavrsnom i diplomskom radu (Veleuciliste u Sibeniku, 2023)](https://www.vus.hr/_download/repository/Pravilnik%20o%20zavr%C5%A1nom%20i%20diplomskom%20radu%5B3%5D.pdf) | Prilog I. (Upute za izradu zavrsnog i diplomskog rada), odjeljak '1. UVOD' |
| Prored | `line-spacing-fixer` | prored 1,5 | [Pravilnik o zavrsnom i diplomskom radu (Veleuciliste u Sibeniku, 2023)](https://www.vus.hr/_download/repository/Pravilnik%20o%20zavr%C5%A1nom%20i%20diplomskom%20radu%5B3%5D.pdf) | Prilog I. (Upute za izradu zavrsnog i diplomskog rada), odjeljak '1. UVOD' |
| Poravnanje | `alignment-fixer` | obostrano | [Pravilnik o zavrsnom i diplomskom radu (Veleuciliste u Sibeniku, 2023)](https://www.vus.hr/_download/repository/Pravilnik%20o%20zavr%C5%A1nom%20i%20diplomskom%20radu%5B3%5D.pdf) | Prilog I. (Upute za izradu zavrsnog i diplomskog rada), odjeljak '1. UVOD' |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Veleučilište Sibenik, završni rad

`vus-zavrsni` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Font | `font-fixer` | Times New Roman | [Pravilnik o zavrsnom i diplomskom radu (Veleuciliste u Sibeniku, 2023)](https://www.vus.hr/_download/repository/Pravilnik%20o%20zavr%C5%A1nom%20i%20diplomskom%20radu%5B3%5D.pdf) | Prilog I. (Upute za izradu zavrsnog i diplomskog rada), odjeljak '1. UVOD' |
| Velicina slova | `font-fixer` | 12 pt | [Pravilnik o zavrsnom i diplomskom radu (Veleuciliste u Sibeniku, 2023)](https://www.vus.hr/_download/repository/Pravilnik%20o%20zavr%C5%A1nom%20i%20diplomskom%20radu%5B3%5D.pdf) | Prilog I. (Upute za izradu zavrsnog i diplomskog rada), odjeljak '1. UVOD' |
| Prored | `line-spacing-fixer` | prored 1,5 | [Pravilnik o zavrsnom i diplomskom radu (Veleuciliste u Sibeniku, 2023)](https://www.vus.hr/_download/repository/Pravilnik%20o%20zavr%C5%A1nom%20i%20diplomskom%20radu%5B3%5D.pdf) | Prilog I. (Upute za izradu zavrsnog i diplomskog rada), odjeljak '1. UVOD' |
| Poravnanje | `alignment-fixer` | obostrano | [Pravilnik o zavrsnom i diplomskom radu (Veleuciliste u Sibeniku, 2023)](https://www.vus.hr/_download/repository/Pravilnik%20o%20zavr%C5%A1nom%20i%20diplomskom%20radu%5B3%5D.pdf) | Prilog I. (Upute za izradu zavrsnog i diplomskog rada), odjeljak '1. UVOD' |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### vuv

#### Veleučilište Virovitica, diplomski rad

`vuv-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Upute za pripremu i pisanje završnog i diplomskog rada (Veleučilište u Virovitici, 2025)](https://vuv.hr/wp-content/uploads/2025/04/UPUTE-ZA-PRIPREMU-I-PISANJE-ZAVR%C5%A0NOG-RADA-2025-final-korekcija.pdf) | Upute, 2.1 Osnovni parametri |
| Margine | `margins-fixer` | 2,5 / 2 / 2,5 / 3 cm (gore/desno/dolje/lijevo) | [Upute za pripremu i pisanje završnog i diplomskog rada (Veleučilište u Virovitici, 2025)](https://vuv.hr/wp-content/uploads/2025/04/UPUTE-ZA-PRIPREMU-I-PISANJE-ZAVR%C5%A0NOG-RADA-2025-final-korekcija.pdf) | Upute, 2.1 Osnovni parametri |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za pripremu i pisanje završnog i diplomskog rada (Veleučilište u Virovitici, 2025)](https://vuv.hr/wp-content/uploads/2025/04/UPUTE-ZA-PRIPREMU-I-PISANJE-ZAVR%C5%A0NOG-RADA-2025-final-korekcija.pdf) | Upute, 2.1 Osnovni parametri |
| Vrsta slova | `font-fixer` | Times New Roman | [Upute za pripremu i pisanje završnog i diplomskog rada (Veleučilište u Virovitici, 2025)](https://vuv.hr/wp-content/uploads/2025/04/UPUTE-ZA-PRIPREMU-I-PISANJE-ZAVR%C5%A0NOG-RADA-2025-final-korekcija.pdf) | Upute, 2.1 Osnovni parametri |
| Velicina slova | `font-fixer` | 12 pt | [Upute za pripremu i pisanje završnog i diplomskog rada (Veleučilište u Virovitici, 2025)](https://vuv.hr/wp-content/uploads/2025/04/UPUTE-ZA-PRIPREMU-I-PISANJE-ZAVR%C5%A0NOG-RADA-2025-final-korekcija.pdf) | Upute, 2.1 Osnovni parametri |
| Obostrano poravnanje | `alignment-fixer` | obostrano | [Upute za pripremu i pisanje završnog i diplomskog rada (Veleučilište u Virovitici, 2025)](https://vuv.hr/wp-content/uploads/2025/04/UPUTE-ZA-PRIPREMU-I-PISANJE-ZAVR%C5%A0NOG-RADA-2025-final-korekcija.pdf) | Upute, 2.1 Osnovni parametri |
| Font i veličina fusnota | `footnote-typography-fixer` | 10 pt |  |  |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Veleučilište Virovitica, završni rad

`vuv-zavrsni` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Upute za pripremu i pisanje završnog i diplomskog rada (Veleučilište u Virovitici, 2025)](https://vuv.hr/wp-content/uploads/2025/04/UPUTE-ZA-PRIPREMU-I-PISANJE-ZAVR%C5%A0NOG-RADA-2025-final-korekcija.pdf) | Upute, 2.1 Osnovni parametri |
| Margine | `margins-fixer` | 2,5 / 2 / 2,5 / 3 cm (gore/desno/dolje/lijevo) | [Upute za pripremu i pisanje završnog i diplomskog rada (Veleučilište u Virovitici, 2025)](https://vuv.hr/wp-content/uploads/2025/04/UPUTE-ZA-PRIPREMU-I-PISANJE-ZAVR%C5%A0NOG-RADA-2025-final-korekcija.pdf) | Upute, 2.1 Osnovni parametri |
| Prored | `line-spacing-fixer` | prored 1,5 | [Upute za pripremu i pisanje završnog i diplomskog rada (Veleučilište u Virovitici, 2025)](https://vuv.hr/wp-content/uploads/2025/04/UPUTE-ZA-PRIPREMU-I-PISANJE-ZAVR%C5%A0NOG-RADA-2025-final-korekcija.pdf) | Upute, 2.1 Osnovni parametri |
| Vrsta slova | `font-fixer` | Times New Roman | [Upute za pripremu i pisanje završnog i diplomskog rada (Veleučilište u Virovitici, 2025)](https://vuv.hr/wp-content/uploads/2025/04/UPUTE-ZA-PRIPREMU-I-PISANJE-ZAVR%C5%A0NOG-RADA-2025-final-korekcija.pdf) | Upute, 2.1 Osnovni parametri |
| Velicina slova | `font-fixer` | 12 pt | [Upute za pripremu i pisanje završnog i diplomskog rada (Veleučilište u Virovitici, 2025)](https://vuv.hr/wp-content/uploads/2025/04/UPUTE-ZA-PRIPREMU-I-PISANJE-ZAVR%C5%A0NOG-RADA-2025-final-korekcija.pdf) | Upute, 2.1 Osnovni parametri |
| Obostrano poravnanje | `alignment-fixer` | obostrano | [Upute za pripremu i pisanje završnog i diplomskog rada (Veleučilište u Virovitici, 2025)](https://vuv.hr/wp-content/uploads/2025/04/UPUTE-ZA-PRIPREMU-I-PISANJE-ZAVR%C5%A0NOG-RADA-2025-final-korekcija.pdf) | Upute, 2.1 Osnovni parametri |
| Font i veličina fusnota | `footnote-typography-fixer` | 10 pt |  |  |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### vvg

#### Veleučilište Velika Gorica, diplomski rad

`vvg-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Upute za izradu i obranu završnog i diplomskog rada (Veleučilište Velika Gorica, 2013)](https://vvg.hr/app/uploads/2020/02/Upute-za-izradu-i-obranu-zavrs%CC%8Cnog-i-diplomskog-rada-2013.pdf) | Upute, oblikovanje rada |
| Margine | `margins-fixer` | 2,5 / 2 / 2,5 / 3 cm (gore/desno/dolje/lijevo) | [Upute za izradu i obranu završnog i diplomskog rada (Veleučilište Velika Gorica, 2013)](https://vvg.hr/app/uploads/2020/02/Upute-za-izradu-i-obranu-zavrs%CC%8Cnog-i-diplomskog-rada-2013.pdf) | Upute, oblikovanje rada |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### Veleučilište Velika Gorica, završni rad

`vvg-zavrsni` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Upute za izradu i obranu završnog i diplomskog rada (Veleučilište Velika Gorica, 2013)](https://vvg.hr/app/uploads/2020/02/Upute-za-izradu-i-obranu-zavrs%CC%8Cnog-i-diplomskog-rada-2013.pdf) | Upute, oblikovanje rada |
| Margine | `margins-fixer` | 2,5 / 2 / 2,5 / 3 cm (gore/desno/dolje/lijevo) | [Upute za izradu i obranu završnog i diplomskog rada (Veleučilište Velika Gorica, 2013)](https://vvg.hr/app/uploads/2020/02/Upute-za-izradu-i-obranu-zavrs%CC%8Cnog-i-diplomskog-rada-2013.pdf) | Upute, oblikovanje rada |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### zsem

#### ZSEM, diplomski rad

`zsem-diplomski` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Vrsta slova | `font-fixer` | Times New Roman | [Pravilnik o diplomskom radu (ZSEM, svibanj 2023)](https://zsem.hr/wp-content/uploads/2024/11/PRAVILNIK-O-DIPLOMSKOM-RADU-svibanj-2023-1.pdf) | Clanak 28. (Tehnicko uredenje rada) |
| Velicina slova | `font-fixer` | 12 pt | [Pravilnik o diplomskom radu (ZSEM, svibanj 2023)](https://zsem.hr/wp-content/uploads/2024/11/PRAVILNIK-O-DIPLOMSKOM-RADU-svibanj-2023-1.pdf) | Clanak 28. (Tehnicko uredenje rada) |
| Prored | `line-spacing-fixer` | prored 1,5 | [Pravilnik o diplomskom radu (ZSEM, svibanj 2023)](https://zsem.hr/wp-content/uploads/2024/11/PRAVILNIK-O-DIPLOMSKOM-RADU-svibanj-2023-1.pdf) | Clanak 28. (Tehnicko uredenje rada) |
| Obostrano poravnanje | `alignment-fixer` | obostrano | [Pravilnik o diplomskom radu (ZSEM, svibanj 2023)](https://zsem.hr/wp-content/uploads/2024/11/PRAVILNIK-O-DIPLOMSKOM-RADU-svibanj-2023-1.pdf) | Clanak 28. (Tehnicko uredenje rada) |
| Velika slova naslova | `heading-case-fixer` | velika slova, razine 1, 2<br><sub>Trazi izricitu privolu (mijenja autorov tekst ili strukturu).</sub> |  |  |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### ZSEM, završni rad

`zsem-zavrsni` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Pravilnik o izradi i obrani zavrsnog rada na prijediplomskim strucnim studijima (ZSEM, 2023)](https://zsem.hr/wp-content/uploads/2024/11/Pravilnik-o-izradi-i-obrani-zavrsnog-rada-na-prijediplomskim-strucnim-studijima-2023.docx.pdf) | poglavlje Tehnicko uredenje zavrsnog rada (str. 3) |
| Vrsta slova | `font-fixer` | Times New Roman | [Pravilnik o izradi i obrani zavrsnog rada na prijediplomskim strucnim studijima (ZSEM, 2023)](https://zsem.hr/wp-content/uploads/2024/11/Pravilnik-o-izradi-i-obrani-zavrsnog-rada-na-prijediplomskim-strucnim-studijima-2023.docx.pdf) | poglavlje Tehnicko uredenje zavrsnog rada (str. 3) |
| Velicina slova | `font-fixer` | 12 pt | [Pravilnik o izradi i obrani zavrsnog rada na prijediplomskim strucnim studijima (ZSEM, 2023)](https://zsem.hr/wp-content/uploads/2024/11/Pravilnik-o-izradi-i-obrani-zavrsnog-rada-na-prijediplomskim-strucnim-studijima-2023.docx.pdf) | poglavlje Tehnicko uredenje zavrsnog rada (str. 3) |
| Prored | `line-spacing-fixer` | prored 1,5 | [Pravilnik o izradi i obrani zavrsnog rada na prijediplomskim strucnim studijima (ZSEM, 2023)](https://zsem.hr/wp-content/uploads/2024/11/Pravilnik-o-izradi-i-obrani-zavrsnog-rada-na-prijediplomskim-strucnim-studijima-2023.docx.pdf) | poglavlje Tehnicko uredenje zavrsnog rada (str. 3) |
| Obostrano poravnanje | `alignment-fixer` | obostrano | [Pravilnik o izradi i obrani zavrsnog rada na prijediplomskim strucnim studijima (ZSEM, 2023)](https://zsem.hr/wp-content/uploads/2024/11/Pravilnik-o-izradi-i-obrani-zavrsnog-rada-na-prijediplomskim-strucnim-studijima-2023.docx.pdf) | poglavlje Tehnicko uredenje zavrsnog rada (str. 3) |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### ZSEM, završni rad (engleski)

`zsem-zavrsni-en` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Pravilnik o izradi i obrani zavrsnog rada na prijediplomskim strucnim studijima (ZSEM, 2023)](https://zsem.hr/wp-content/uploads/2024/11/Pravilnik-o-izradi-i-obrani-zavrsnog-rada-na-prijediplomskim-strucnim-studijima-2023.docx.pdf) | poglavlje Tehnicko uredenje zavrsnog rada (str. 3) |
| Vrsta slova | `font-fixer` | Times New Roman | [Pravilnik o izradi i obrani zavrsnog rada na prijediplomskim strucnim studijima (ZSEM, 2023)](https://zsem.hr/wp-content/uploads/2024/11/Pravilnik-o-izradi-i-obrani-zavrsnog-rada-na-prijediplomskim-strucnim-studijima-2023.docx.pdf) | poglavlje Tehnicko uredenje zavrsnog rada (str. 3) |
| Velicina slova | `font-fixer` | 12 pt | [Pravilnik o izradi i obrani zavrsnog rada na prijediplomskim strucnim studijima (ZSEM, 2023)](https://zsem.hr/wp-content/uploads/2024/11/Pravilnik-o-izradi-i-obrani-zavrsnog-rada-na-prijediplomskim-strucnim-studijima-2023.docx.pdf) | poglavlje Tehnicko uredenje zavrsnog rada (str. 3) |
| Prored | `line-spacing-fixer` | prored 1,5 | [Pravilnik o izradi i obrani zavrsnog rada na prijediplomskim strucnim studijima (ZSEM, 2023)](https://zsem.hr/wp-content/uploads/2024/11/Pravilnik-o-izradi-i-obrani-zavrsnog-rada-na-prijediplomskim-strucnim-studijima-2023.docx.pdf) | poglavlje Tehnicko uredenje zavrsnog rada (str. 3) |
| Obostrano poravnanje | `alignment-fixer` | obostrano | [Pravilnik o izradi i obrani zavrsnog rada na prijediplomskim strucnim studijima (ZSEM, 2023)](https://zsem.hr/wp-content/uploads/2024/11/Pravilnik-o-izradi-i-obrani-zavrsnog-rada-na-prijediplomskim-strucnim-studijima-2023.docx.pdf) | poglavlje Tehnicko uredenje zavrsnog rada (str. 3) |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

### zvu

#### ZVU, specijalistički diplomski rad

`zvu-specijalisticki` · status: partial · vrste rada: graduate

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Pravilnik o zavrsnim radovima na strucnim i specijalistickim diplomskim studijima (ZVU, 2015)](https://www.zvu.hr/wp-content/uploads/Pravilnik-o-zavrsnim-radovima1.pdf) | Članak 4. |
| Velicina slova | `font-fixer` | 12 pt | [Pravilnik o zavrsnim radovima na strucnim i specijalistickim diplomskim studijima (ZVU, 2015)](https://www.zvu.hr/wp-content/uploads/Pravilnik-o-zavrsnim-radovima1.pdf) | Članak 4. |
| Prored | `line-spacing-fixer` | prored 1,5 | [Pravilnik o zavrsnim radovima na strucnim i specijalistickim diplomskim studijima (ZVU, 2015)](https://www.zvu.hr/wp-content/uploads/Pravilnik-o-zavrsnim-radovima1.pdf) | Članak 4. |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Pravilnik o zavrsnim radovima na strucnim i specijalistickim diplomskim studijima (ZVU, 2015)](https://www.zvu.hr/wp-content/uploads/Pravilnik-o-zavrsnim-radovima1.pdf) | Članak 4. |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

#### ZVU, završni rad

`zvu-zavrsni` · status: partial · vrste rada: final

| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |
|---|---|---|---|---|
| Format papira | `paper-size-fixer` | 21 x 29,7 cm | [Pravilnik o zavrsnim radovima na strucnim i specijalistickim diplomskim studijima (ZVU, 2015)](https://www.zvu.hr/wp-content/uploads/Pravilnik-o-zavrsnim-radovima1.pdf) | Članak 4. |
| Velicina slova | `font-fixer` | 12 pt | [Pravilnik o zavrsnim radovima na strucnim i specijalistickim diplomskim studijima (ZVU, 2015)](https://www.zvu.hr/wp-content/uploads/Pravilnik-o-zavrsnim-radovima1.pdf) | Članak 4. |
| Prored | `line-spacing-fixer` | prored 1,5 | [Pravilnik o zavrsnim radovima na strucnim i specijalistickim diplomskim studijima (ZVU, 2015)](https://www.zvu.hr/wp-content/uploads/Pravilnik-o-zavrsnim-radovima1.pdf) | Članak 4. |
| Margine | `margins-fixer` | 2,5 / 2,5 / 2,5 / 2,5 cm (gore/desno/dolje/lijevo) | [Pravilnik o zavrsnim radovima na strucnim i specijalistickim diplomskim studijima (ZVU, 2015)](https://www.zvu.hr/wp-content/uploads/Pravilnik-o-zavrsnim-radovima1.pdf) | Članak 4. |
| Usklađivanje predajnog paketa | `submission-metadata-fixer` | potvrđene DOCX metapodatke između Worda, PDF-a i obrasca<br><sub>Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.</sub> |  |  |
| Prazni odlomci | `empty-paragraph-fixer` | uklanjanje viska praznih odlomaka<br><sub>Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.</sub> |  |  |

## Profili bez tehnickih pravila za popravak

Ovi profili nemaju nijedno pravilo koje je istodobno `autoFixable`, `verified` i ima
ciljanu vrijednost u profilu, pa dobivaju samo univerzalnu higijenu. To NIJE kvar:
bez potvrdjene vrijednosti iz sluzbenog izvora popravak se ne nudi, jer bismo inace
nametali vrijednost koju fakultet nije propisao.

- `adu-dramaturgija-diplomski` (Akademija dramske umjetnosti, Odsjek dramaturgije, diplomski rad)
- `adu-ftv-rezija-diplomski` (Akademija dramske umjetnosti, Odsjek filmske i TV režije, diplomski rad)
- `adu-gluma-diplomski` (Akademija dramske umjetnosti, Odsjek glume, diplomski rad)
- `adu-kazalisna-rezija-diplomski` (Akademija dramske umjetnosti, Odsjek kazališne režije i radiofonije, diplomski rad)
- `adu-opci-diplomski` (Akademija dramske umjetnosti, Opći profil ADU, diplomski rad)
- `adu-produkcija-diplomski` (Akademija dramske umjetnosti, Odsjek produkcije, diplomski rad)
- `adu-snimanje-diplomski` (Akademija dramske umjetnosti, Odsjek snimanja, diplomski rad)
- `alu-doktorski` (Akademija likovnih umjetnosti, doktorski rad / disertacija)
- `alu-grafika-diplomski` (Akademija likovnih umjetnosti, Grafički odsjek, diplomski rad)
- `alu-nastavnicki-diplomski` (Akademija likovnih umjetnosti, Nastavnički odsjek, diplomski rad)
- `alu-novi-mediji-diplomski` (Akademija likovnih umjetnosti, Odsjek za animirani film i nove medije, diplomski rad)
- `dizajn-diplomski` (Studij dizajna (Arhitektonski fakultet), diplomski rad)
- `fpzg-novinarstvo-zavrsni-av` (FPZG · prijediplomsko Novinarstvo · završni rad · audiovizualni)
- `geof-opci-akademski-rad` (GEOF · opći akademski rad (seminar/projekt))
- `par-diplomski` (Veleučilište PAR, diplomski rad)
- `par-zavrsni` (Veleučilište PAR, završni rad)
- `pravst-diplomski` (Pravni Split, diplomski rad)
- `pravst-zavrsni` (Pravni Split, završni rad)
- `umas-diplomski` (Umjetnicka akademija u Splitu, diplomski rad)
- `umas-zavrsni` (Umjetnicka akademija u Splitu, zavrsni rad)
- `unidu-elektro-diplomski` (Dubrovnik - Elektrotehnika i primijenjeno racunarstvo, diplomski rad)
- `unidu-elektro-zavrsni` (Dubrovnik - Elektrotehnika i primijenjeno racunarstvo, završni rad)
- `unizd-anglistika-diplomski` (Zadar - Anglistika, diplomski rad)
- `unizd-anglistika-zavrsni` (Zadar - Anglistika, završni rad)
- `unizd-ekonomija-diplomski` (Zadar - Ekonomija, diplomski rad)
- `unizd-ekonomija-zavrsni` (Zadar - Ekonomija, završni rad)
- `unizd-kroatistika-diplomski` (Zadar - Kroatistika, diplomski rad)
- `unizd-kroatistika-zavrsni` (Zadar - Kroatistika, završni rad)
- `unizd-lingvistika-diplomski` (Zadar - Lingvistika, diplomski rad)
- `unizd-lingvistika-zavrsni` (Zadar - Lingvistika, završni rad)
- `unizd-rusistika-diplomski` (Zadar - Rusistika, diplomski rad)
- `unizd-sociologija-zavrsni` (Zadar - Sociologija, završni rad)
- `vuka-strojarski-diplomski` (Veleučilište Karlovac - Strojarski odjel, diplomski rad)
- `vuka-strojarski-zavrsni` (Veleučilište Karlovac - Strojarski odjel, završni rad)


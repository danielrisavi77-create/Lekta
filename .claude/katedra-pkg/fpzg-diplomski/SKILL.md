---
name: fpzg-diplomski
description: "FPZG DIPLOMSKI — produkcijski lanac koji od rukopisa u markdownu radi predajni .docx po kućnom stilu Fakulteta političkih znanosti: unakrsne reference, numeracija stranica, popisi prikaza, prikazi koji se ne lome, fusnote i grafikoni. Aktiviraj kad korisnik piše diplomski ili završni rad na FPZG-u, kad traži 'sredi mi formatiranje po FPZG-u', 'napravi predajnu verziju', 'unakrsne reference', 'brojevi stranica', 'popis tablica', 'grafikoni za rad', ili kad Katedra uđe u mod 2 (pisanje) ili mod 6 (predaja) s profilom fpzg. Nadogradnja je na skill katedra, ne zamjena: katedra vodi plan, sadržaj i audit, ovaj skill radi izradu dokumenta. Ne aktiviraj za druge fakultete bez prilagodbe kućnog stila."
compatibility: "Python 3.11+, python-docx, pandas, numpy, matplotlib, scipy. Za render i provjeru prijeloma: pandoc, LibreOffice, Poppler (pdftotext, pdfinfo, pdftoppm). Font Liberation Serif (metrički istovjetan Times New Romanu)."
metadata:
  version: "1.2.0"
  language: "hr"
  nadskill: "katedra"
  temelj: "obranjeni diplomski rad, FPZG, diplomski studij politologije, 2026."
  suradni_skill: "replikacija-pspp"
  sposobnost: "stil.kucni"
  ovisi_o: "rad-docx (sposobnost izrada.docx) — prolaz po arhivi i sadržaj"
---

# FPZG DIPLOMSKI — od rukopisa do predajnog dokumenta

Katedra piše rad. Ovaj skill ga **proizvodi**: pretvara markdown u .docx koji izgleda
kao rad koji je na FPZG-u već obranjen, i to bez ručnog diranja u Wordu.

> **Odakle pravila.** Kućni stil ovdje nije izveden iz čitanja Uputa nego iz
> **obranjenog diplomskog rada** s istog studija. Kad se Upute i obranjeni rad
> razilaze, obranjeni rad ima prednost, a razlika se izrijekom bilježi. Upute su
> na nekim mjestima nepotpune (margine u njima uopće ne stoje), pa je rad koji je
> prošao jedini pouzdan dokaz o tome što se doista prihvaća.

## Kada NE koristiti

- Drugi fakultet — kućni stil se razlikuje, `references/kucni-stil.md` treba prepisati
- Rad tek treba isplanirati ili napisati → to je katedra, modovi 1 i 2
- Traži se samo provjera gotovog tuđeg rada → to je rad-audit

## Postupak

Redoslijed nije proizvoljan. Svaki korak pretpostavlja da je prethodni gotov.

### 1. Rukopis u markdownu, nikad izravno u Wordu

Poglavlja su zasebne datoteke (`pog1_uvod.md` … `pog6_zakljucak.md`), uz
`predtekst.md`, `literatura.md`, `prilog.md`, `zatekst.md`. Word je **izlaz**, ne
radna površina; svaka ručna izmjena u .docx-u gubi se pri sljedećoj izgradnji.

Markeri u tekstu:

| Marker | Značenje |
|---|---|
| `[[PB]]` | prijelom stranice (pandoc ignorira `\newpage` za docx) |
| `[[SEC]]` | prijelom sekcije — odavde kreće numeracija stranica |
| `[PROVJERI STR.]` | citat čeka broj stranice; ne smije ostati u predanom radu |
| `[TREBA IZVOR]` | tvrdnja bez potpore |

### 2. Sastavljanje

`scripts/sastavi.py` slaže poglavlja u `rad_predaja.md` **redoslijedom iz
obranjenog rada** (v. `references/struktura.md`). Sadržaj, popis tablica i popis
grafikona ne pišu se rukom — ubacuje ih izgradnja kao živa Wordova polja.

### 3. Izgradnja u dva prolaza

`scripts/gradi.sh` je ulazna točka. Prvi prolaz daje stranice na kojima završe
natpisi, drugi ih upisuje u popise prikaza kao `PAGEREF` polja.

```
pandoc → build_docx.py → rad-docx/arhiva.py → LibreOffice → PDF
   ↓ očitaj otisnute brojeve stranica iz podnožja
pandoc → build_docx.py (sada s kartom stranica) → … → PDF
```

Prolaz po arhivi (prijelom riječi, font teme, `docDefaults`) **više nije u ovom skillu**:
istu je stvar radio i motor izrade, pa su postojale dvije kopije istog koda. Sada je jedan
izvor, `rad-docx/scripts/arhiva.py`, i `gradi.sh` ga poziva. Bez instaliranog `rad-docx`
lanac izlazi kodom 3 i to kaže — ne improvizira, jer prijelom riječi mijenja lom redaka i
time paginaciju.

**Zašto dva prolaza.** Numeracija kreće od 1 tek na „1. Uvod", pa se otisnuti broj
ne poklapa s fizičkim. Karta se čita iz podnožja svake stranice, ne iz rednog
broja stranice u PDF-u — inače popis prikaza nosi krive brojeve.

### 3b. Kao graditelj unutar motora izrade (preporučeno)

Ovaj skill nosi **kućni stil**; petlju do fiksne točke, mjerenje paginacije i sadržaj s
provjerljivim brojevima nosi motor (`rad-docx`, sposobnost `izrada.docx`). Za predajnu
verziju je bolje pustiti motor, a ovaj skill mu dati kao graditelja:

```bash
python3 <RAD_DOCX>/scripts/gradi.py --rukopis rukopis/ \
    --profil .katedra/resolved_profile.json \
    --graditelj <FPZG_SKILL>/scripts/graditelj.sh --izlaz rad.docx
```

`scripts/graditelj.sh` je prilagodnik: prevodi stanje petlje u ovaj imenski prostor
(`tablica1` → `_Ref_tab1`) **prije** izgradnje, pa nakon `build_docx.py` pusti
`arhiva.py` i `sadrzaj.py`.

**Što se time dobiva, a `gradi.sh` sam ne može.** `build_docx.py` sadržaj ubacuje samo kao
živo polje `TOC`, a LibreOffice polje pri pretvorbi ne popunjava — pa u PDF-u sadržaj
zauzima jedan redak i **nijedan izmjereni broj stranice nije provjerljiv**. Motor gradi dvije
varijante iz istog izvora (statični sadržaj za mjerenje, živo polje sa spremljenim
rezultatom za predaju) i tvrdi da imaju isti broj stranica.

Prihvatni test (kolovoz 2026., diplomski rad od 58 stranica): oba lanca daju **58 stranica,
36 naslova s identičnim brojevima i identične brojeve u popisu prikaza**. Jedina razlika je
stranica sadržaja, koju `gradi.sh` ostavlja neispunjenu — što je stanje u kojemu je bio i
predani rad koji je poslužio kao ulaz.

### 4. Provjera

Nikad „izgleda dobro". Uvijek:

```
scripts/provjeri_prikaze.py      prikazi na jednoj stranici, polja, oznake
scripts/provjeri_stil.py         dvotočke, duge crtice, ponovljeni otvarači
scripts/provjera_predlozak.py    svaka brojka iz rada iznova iz sirovih podataka
replikacija-pspp/…/pspp_replikacija.py   svaka brojka iznova, u trećem programu
katedra/scripts/check_rules.py   pravila fakulteta
rad-audit/scripts/audit_all.py   citiranje, tipografija, ritam
```

## Što izgradnja radi, a Word ne bi sam

Ovo je jezgra skilla. Svaka stavka rješava kvar koji se inače primijeti tek na
obrani. Sve je u `scripts/build_docx.py`.

| Zahvat | Kvar koji sprječava |
|---|---|
| `SEQ` polje u natpisu + knjižna oznaka | brojevi tablica se ne prenumeriraju kad se jedna ubaci |
| `REF` polje **samo za broj** u tekstu | „prikazano na **Grafikon** 1" umjesto „na **Grafikonu** 1" — Word ubacuje nominativ i ruši padež |
| `PAGEREF` u popisima prikaza | popis bez brojeva stranica, ili s krivima |
| `cantSplit` + lanac `keepNext` kroz sve retke | tablica se lomi preko dvije stranice, jedan red visi sam |
| prijelom sekcije + `pgNumType start=1` | predtekst numeriran, ili tijelo počinje od 5 |
| `FootnoteText` stil eksplicitno postavljen | **pandoc ostavlja taj stil prazan**, pa fusnote naslijede Normal i ispadnu 12 pt s proredom 1,5, jednake tijelu teksta |
| theme + `docDefaults` na Times New Roman | sve što korisnik naknadno utipka pada na Cambriju |
| `updateFields` u settings.xml | polja stoje kao `[Update Field]` dok ih netko ručno ne osvježi |

## Pravila koja se ne pregovaraju

**Ništa se ne izmišlja.** Broj stranice koji nije viđen u izvoru ne upisuje se.
Postupak kad izvor nije dostupan je u `references/stranice-i-izvori.md` — ukratko:
traži otvoreno dostupan članak istog autora s istim argumentom, pa citiraj njega.

**Svaka brojka provjerava se drugim kodom, a nosivi nalazi i drugim programom.** Ne ponovnim čitanjem iste skripte
nego neovisnim izračunom iz sirovih podataka. Predložak: `scripts/provjera_predlozak.py`.
U ovom je radu taj postupak uhvatio izmišljen postotak i dvije krive brojke.

**Uvlaka ili razmak, nikad oboje i nikad nasumično.** FPZG dopušta oba načina
odvajanja odlomaka. Obranjeni rad nema uvlaku nigdje. Ako se uvlaka koristi, bez
nje je **samo prvi odlomak iza naslova** — ne i odlomci iza tablica i grafikona.

**Dvotočka samo za nabrajanje.** Kad iza nje slijedi cjelovita rečenica koja
prethodnu razrađuje, dolazi točka. Prag je 4 na 100 rečenica; `provjeri_stil.py`
mjeri i nabraja kandidate. Izvor ispod prikaza piše se **običnim pismom**, ne
kurzivom.

**Fusnote su objasnidbene.** U njima nema citata. Miješanje fusnota i citiranja u
tekstu Upute izrijekom zabranjuju.

## Reference

| Datoteka | Sadržaj |
|---|---|
| `references/kucni-stil.md` | tipografija, natpisi, tablice, fusnote — sve s dokazom iz obranjenog rada |
| `references/struktura.md` | redoslijed dijelova i što ide gdje |
| `references/stranice-i-izvori.md` | kako se dolazi do točnog broja stranice i što kad izvora nema |
| `references/grafikoni.md` | sustav prikaza: paleta, forma, provjera |
| `references/replikacija.md` | gdje statistički prilozi idu i kako izgledaju; sam postupak je u skillu `replikacija-pspp` |
| `references/zakrpe-katedra.md` | **kvarovi nađeni u katedri i rad-auditu, s točnim ispravcima** |

## Skripte

| Skripta | Posao |
|---|---|
| `scripts/gradi.sh` | dvoprolazna izgradnja, samostojna ulazna točka |
| `scripts/graditelj.sh` | prilagodnik: ovaj skill kao graditelj za motor `rad-docx` |
| `scripts/sastavi.py` | slaganje rukopisa po redoslijedu |
| `scripts/build_docx.py` | sva Wordova obrada |
| `scripts/stil_grafikona.py` | paleta i pomoćnici za prikaze |
| `scripts/provjeri_prikaze.py` | lome li se prikazi, jesu li polja uravnotežena |
| `scripts/provjeri_stil.py` | interpunkcijski tikovi: dvotočka, duga crtica, ponavljanja |
| `scripts/provjera_predlozak.py` | predložak neovisne provjere brojki |

## Ugradnja u katedru

0. **Skill `replikacija-pspp`** mora biti instaliran ako rad ima empirijski dio;
   ovaj skill statističke priloge ne radi sam, samo ih uklapa u kućni stil.
1. **Overlay** `assets/fpzg-diplomski.json` → `katedra/references/fakulteti/overlays/`.
   Nosi format i strukturu izvedene iz obranjenog rada. Overlay smije spustiti
   status, nikad ga podići — promocija profila ide kroz readiness gate.
2. **Zakrpe jezgre** iz `references/zakrpe-katedra.md` → ručno, uz test.
   Tri su prave greške, ne stvar ukusa.
3. Nakon overlaya pokreni `profile_rules.py::generate_registry` da se `index.json`
   regenerira.

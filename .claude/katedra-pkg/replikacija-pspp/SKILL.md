---
name: replikacija-pspp
description: "REPLIKACIJA — neovisna provjera svih brojki iz empirijskog rada u programu GNU PSPP, sa snimkama sučelja i gotovim prilozima za rad. Aktiviraj kad korisnik kaže 'provjeri jesu li brojke točne', 'replikacija', 'neovisna provjera izračuna', 'napravi prilog s ispisom', 'jamovi', 'SPSS', 'PSPP', 'statistički prilog', 'da mogu dokazati da su brojke točne', ili kad katedra u modu 4 (audit) treba empirijsku potvrdu rezultata, odnosno u modu 6 (predaja) prilog s ispisom. Radi neovisno o fakultetu i o kućnom stilu: daje sintaksu, ispis, tablicu usporedbe i snimke prozora. Ne aktiviraj za pisanje teksta ni za formatiranje dokumenta."
compatibility: "Python 3.11+, python-docx, Pillow. Za izračun: pspp. Za snimke sučelja: psppire, Xvfb, openbox, xdotool, wmctrl, ImageMagick. Sve je dostupno iz apt repozitorija; vidi references/okruzenje.md."
metadata:
  version: "1.0.0"
  language: "hr"
  nadskill: "katedra"
  temelj: "diplomski rad, FPZG, 2026; 46 vrijednosti provjereno, sve se poklapaju."
---

# REPLIKACIJA — brojke koje se mogu dokazati

Rad tvrdi da je F = 4,84. Ova skripta to provjerava u trećem programu i
proizvodi prilog kojim se to pokazuje.

**Zašto PSPP, a ne jamovi ili SPSS.** SPSS se plaća. jamovi ima grafičko
sučelje, ali se instalira samo iz flatpaka ili s vlastite stranice, pa u
zatvorenim okruženjima često ne prolazi. PSPP je slobodan, dolazi iz `apt`,
prihvaća SPSS-ovu sintaksu, ispisuje u SPSS-ovu obliku i ima sučelje koje se
može snimiti. Povjerenstvu je taj oblik ispisa poznatiji nego jamovijev.

> **Pravilo koje se ne pregovara.** Snimka koja u radu stoji kao ispis programa
> mora doista biti iz programa. Ako se brojka ne može dobiti, u tablicu ide
> „ne ispisuje se”, a ne procjena. Vidi `references/nacela.md`.

## Kada NE koristiti

- Rad nema empirijski dio → nema što replicirati
- Traži se oblikovanje dokumenta → to je `fpzg-diplomski`
- Traži se provjera izvora, citata i strukture → to je `rad-audit`
- Tematsko kodiranje otvorenih odgovora → nije statistička operacija i ne
  replicira se; to treba reći izrijekom, ne prešutjeti

## Postupak

### 1. Konfiguracija

Sve je u jednoj datoteci, `replikacija.json`: baza, oznake varijabli, popis
analiza i popis tvrdnji koje se provjeravaju. Shema i svi tipovi izvora su u
`references/konfiguracija.md`, a razrađen primjer u
`assets/primjer_replikacija.json`.

Bitno je da **svaka brojka iz rada ima svoj redak**. Ako je u radu, mora se
moći provjeriti; ako se ne može, to je nalaz.

### 2. Pokretanje

```bash
python3 scripts/pspp_replikacija.py sve --conf replikacija.json
```

Četiri koraka, mogu se i pojedinačno (`sintaksa`, `pokreni`, `izvuci`, `snimke`):

| Korak | Što radi |
|---|---|
| `sintaksa` | gradi `provjera.sps` iz konfiguracije |
| `pokreni` | pokreće PSPP, daje `izlaz.pdf` i `izlaz.csv` |
| `izvuci` | čita vrijednosti iz ispisa i uspoređuje ih s onima u radu |
| `snimke` | pokreće sučelje i snima prozor za svaku analizu |

Izvlačenje se **ne radi rukom**. PSPP ispisuje i u strojno čitljiv oblik, pa se
svaka vrijednost čita iz tablice u kojoj je nastala. Time otpada posljednji
izvor pogreške, a to je prepisivanje.

### 3. Prilozi u dokument

```bash
python3 scripts/prilog_replikacija.py --conf replikacija.json --dokument rad.docx
```

Prilog 2 je tablica usporedbe, Prilog 3 su snimke prozora. Oblikovanje se
preslikava iz samog dokumenta, pa kućni stil ne treba opisivati dvaput.
Skripta ništa ne mijenja, samo dodaje, i odbija zahvat koji bi pregazio sidro
fusnote.

### 4. Provjera prije predaje

- usporedba mora biti potpuna: svaki redak ima „da” ili obrazloženo „ne ispisuje se”
- razlika u zadnjoj ispisanoj decimali nije neslaganje; razlika u prvoj jest
- brojevi stranica su se pomaknuli → u Wordu `Ctrl + A` pa `F9`
- prikazi u prilozima ne ulaze u popis ilustracija

## Što ovaj postupak već uhvatio

Nije riječ o ceremoniji. Na radu na kojem je nastao, suhi prolaz je otkrio
**tri nedokumentirane odluke u metodologiji** (ANOVA je izostavljala skupinu s
tri ispitanika, t-test je bio Welchov, a „eksplorativna faktorska analiza” je
zapravo bila analiza glavnih komponenti) i **jednu pogrešnu brojku** — KR-20 je
u radu pisao 0,743, a ispravno je 0,740, jer je formula miješala dvije
konvencije za varijancu. Sve četvero je ušlo u rad kao ispravak.

## Veza s drugim skillovima

| Skill | Odnos |
|---|---|
| `katedra` | mod 4 (audit) poziva ovaj skill za empirijsku potvrdu; mod 6 (predaja) za prilog |
| `fpzg-diplomski` | preuzima gotove priloge i uklapa ih u kućni stil FPZG-a |
| `rad-audit` | provjerava izvore i strukturu, ne brojke; ovo dvoje se ne preklapa |

## Reference

| Datoteka | Kada je čitati |
|---|---|
| `references/nacela.md` | prije nego se išta pokrene; što se smije tvrditi |
| `references/konfiguracija.md` | pri pisanju `replikacija.json` |
| `references/okruzenje.md` | ako sučelje ne radi ili dijakritici izlaze kao upitnici |

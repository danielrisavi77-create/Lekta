---
name: rad-docx
description: "Motor izrade predajnog .docx-a iz markdown rukopisa: petlja do fiksne točke paginacije, živa polja (TOC/SEQ/REF), nedjeljivi prikazi, sekcije i numeracija, provjera prije predaje. Aktiviraj na 'izgradi docx iz rukopisa', 'gradi.py', 'provjeri_predaju', 'sadržaj nema brojeve stranica'. Kućni stil daje satelit (fpzg-diplomski); plan, pisanje i audit vodi katedra-lite. (Zadnje: katalog zamki 23→26.) Od v1.9.10 i: mrtvi medijski dijelovi, težina paketa i priprema_slanja.py, parity popisa prikaza, provjeri_povratak.py za rad vraćen iz Worda. v1.9.40."
---

# RAD-DOCX — od rukopisa do predajnog dokumenta

Katedra piše rad i vodi profil fakulteta. Ovaj skill ga **proizvodi**.

> **Zašto postoji.** Strojevi izrade su **isti za svaki fakultet**: petlja koja doznaje
> vlastitu paginaciju, živa Wordova polja, nedjeljivi blokovi prikaza, unakrsne
> reference, sekcije i numeracija. Varira samo kućni stil — font, margine, redoslijed
> dijelova, citatni dijalekt, položaj natpisa. Zato je motor jedan i neutralan, a stil
> dolazi iz profila. Satelit po fakultetu (`fpzg-diplomski`) nosi **samo** stil.
>
> Prije ovoga svaki je fakultet značio kopiranje motora, što je Katedrino željezno
> pravilo 10 izrijekom zabranjuje: *dvije kopije = dvije verzije istine unutar tjedna.*

## Kada NE koristiti

- Rad treba isplanirati ili napisati → `katedra-lite`, modovi 1 i 2 (`katedra` je meta-skill za učenje, ne kopilot)
- Provjera tuđeg gotovog rada → `rad-audit`
- Provjera brojki u trećem programu → `replikacija-pspp`
- Kućni stil fakulteta nije poznat → **prvo** riješi profil u Katedri; motor bez profila
  radi po zadanim vrijednostima i to izrijekom prijavljuje

## Ulazi i izlazi

| Ulaz | Obavezno | Odakle |
|---|---|---|
| `rukopis/*.md` — poglavlja u markdownu | ✅ | autor; Word je izlaz, ne radna površina |
| `.katedra/resolved_profile.json` | ✅ | Katedra: `scripts/profile_resolver.py` (nije u ovom skillu) |
| `model.json` | ako rad ima vlastiti izračun | `model.py` (v. `references/brojke.md`) |
| `naslovi.json` | ✅ | generira `gradi.py` iz naslova u rukopisu |
| referentni `.docx` s kućnim stilom | preporučeno | satelit stila, npr. `fpzg-diplomski/assets/` |

Izlazi: **predajni `.docx`** (živa polja), **`_pregled.pdf`** (statična polja, za oko i za
mjerenje), `toc.json`, `prelomi.json`, `blokovi.json`, `natpisi.json`, izvještaj provjere.

### Ugovor s graditeljem kućnog stila

Motor ne zna kućni stil; poziva `--graditelj`, naredbu koja iz `RAD_MD` pravi `RAD_DOCX`.
Preko okoline dobiva i **stanje petlje**, i o njemu mora ovisiti — inače petlja konvergira
na brojevima koje dokument ne nosi:

| Varijabla | Graditelj s njom radi |
|---|---|
| `RAD_MD`, `RAD_DOCX` | ulaz i izlaz |
| `RAD_PROFIL` | kućni stil |
| `RAD_SADRZAJ` | `staticni` (mjerenje) ili `zivi` (predaja) |
| `RAD_TOC` | `toc.json` iz prethodnog kruga — brojevi za sadržaj |
| `RAD_PRELOMI` | ključevi prikaza koje treba prisiliti na jednu stranicu |

Ako satelit neku od tih stvari ne poznaje, **prilagodnik** je nadopunjuje motorovim
alatima (`sadrzaj.py`, `arhiva.py`) — ne mijenja se satelit. Dvije stvari koje prilagodnik
gotovo uvijek mora riješiti, jer ih nijedan graditelj ne radi sam:

```bash
python3 <SKILL>/scripts/arhiva.py "$RAD_DOCX" --pismo "Times New Roman" --prijelom-rijeci
python3 <SKILL>/scripts/sadrzaj.py "$RAD_DOCX" --toc "$RAD_TOC" --oblik staticni|zivi
```

Prijevod imenskih prostora također je posao prilagodnika: motor ključ prikaza zove
`tablica1`, kućni graditelj svoje sidro može zvati `_Ref_tab1`. Zato je `natpisi.json`
**samoopisan** (`{kljuc, natpis, str}`), a ne mapa spremna za jednog graditelja.

## Postupak — redoslijed nije proizvoljan

**Strojevi formata → sadržaj → stil.** Stilski prolaz je zadnji, jer ga svaka promjena
prijeloma poništava. Ovo je naučeno na tvrd način: stilski prolaz napravljen prije
zaključanog formata trebalo je ponoviti u cijelosti.

### 1. Rukopis u markdownu

Poglavlja su zasebne datoteke. Markeri:

| Marker | Značenje |
|---|---|
| `[[PB]]` | prijelom stranice |
| `[[SEC]]` | prijelom sekcije — **odavde kreće numeracija stranica** |
| `{{model.kljuc}}` | brojka iz `model.json`; nikad se ne upisuje rukom |
| `[PROVJERI STR.]` | citat čeka lokator — ne smije ostati u predanom radu |
| `[TREBA IZVOR]` | tvrdnja bez potpore — isto |

### 2. Brojke iz jednog izvora

Ako rad ima vlastiti izračun, `model.py` je **jedini** izvor: piše `model.json`, a tekst,
tablice i grafikoni ga čitaju. Detalji i zamka sa zaokruživanjem: `references/brojke.md`.

```bash
python3 model.py                       # → model.json
```

Zasebna provjera pokrivenosti ne treba: `gradi.py` pri sastavljanju **pada** na svakom
`{{model.*}}` koji ne postoji u `model.json`, kao i na svakom preživjelom `{{`. Nerazrješen
ključ nikad ne dođe do dokumenta.

### 3. Izgradnja — petlja do fiksne točke, ne dva prolaza

```bash
python3 <SKILL>/scripts/gradi.py --profil .katedra/resolved_profile.json
```

Dva prolaza nisu dovoljna: **umetanje prijeloma mijenja paginaciju**, pa brojevi
izmjereni u prvom prolazu više ne vrijede. `gradi.py` vrti

```
sastavi → docx → pdf → izmjeri → zapiši (toc.json, prelomi.json, natpisi.json)
        └──────── ponovi dok se sva TRI mjerenja ne prestanu mijenjati ────────┘
```

najviše šest krugova, pa greška. U praksi konvergira u dva.

**Fiksna točka nije dokaz ispravnosti.** Petlja se uredno stabilizira i na pogrešnim
brojevima — dovoljno je da mjerenje griješi *dosljedno*. Zato `izmjeri.py` ima ogradu
razasutosti: ako naslovi zauzimaju manje od pola dokumenta, mjerenje pada s greškom
umjesto da se stabilizira. Vidi `references/zamke.md`, kvar 16.

### 4. Dvije varijante, jedan izvor

**LibreOffice ne popunjava polje `TOC` pri pretvorbi u PDF**, ni uz `updateFields`. Zato
svaka vizualna provjera dokumenta sa živim sadržajem gleda u prazno. Rješenje:

| Varijanta | Sadržaj | Namjena |
|---|---|---|
| predajna | živo polje `TOC \o "1-2" \h` + `updateFields` | ide mentoru; Word popuni sam |
| `_pregled.docx` | statičan popis s izmjerenim brojevima | mjerenje i PDF za oko |

**Obavezni assert: obje varijante imaju isti broj stranica.** Inače brojevi u sadržaju ne
bi valjali. `gradi.py` to provjerava i pada ako se razlikuju.

Ne pokušavaj LibreOffice Basic makro (`getDocumentIndexes().update()`) — **zabija se**.

### 5. Provjera prije predaje

```bash
python3 <SKILL>/scripts/provjeri_predaju.py rad.docx \
    --profil .katedra/resolved_profile.json \
    --model model.json --zadatak .katedra/zadatak.json
```

Izlazni kod 1 = **ne predaje se**. Provjerava, po redu težine:

1. brojke iz `model.json` stoje u dokumentu, i nijedna **zastarjela** nije ostala
2. sve komponente koje zadatak izrijekom traži postoje (v. `references/brojke.md`)
3. formalna pravila iz profila: format, margine, font, prored, natpis iznad, izvor ispod
4. Wordova polja: `TOC` postoji, `updateFields` postavljen, zabilješke i `REF` uravnoteženi
5. numeracija: prednji dio bez podnožja, tijelo počinje od zadane stranice
6. nijedan prikaz se ne lomi preko dvije stranice
7. slike umetnute u zadanoj širini
8. nema ostataka `[PROVJERI STR.]` i `[TREBA IZVOR]`

## Reference — čitaj po potrebi, ne unaprijed

| Datoteka | Odgovara na |
|---|---|
| `references/postupak.md` | redoslijed, uvjeti zaustavljanja, što kad ne konvergira |
| `references/polja.md` | `TOC`, `PAGEREF`, `REF`, zabilješke, dvije varijante |
| `references/prikazi.md` | natpis/izvor kao nedjeljiv blok, unakrsne reference i hrvatska deklinacija |
| `references/brojke.md` | `model.json`, osnovica zaokruživanja, crna lista, komponente zadatka |
| `references/zamke.md` | 26 stvarnih kvarova: `docx-js`, python-docx, LibreOffice, matplotlib, mjerenje, provenijencija stranica, autor-godina uparivanje |

## Paket i slanje

```bash
python3 scripts/inventar_paketa.py rad.docx     # što je u .docx paketu; mrtvi_mediji() i tezina()
python3 scripts/priprema_slanja.py rad.docx --izlaz rad-za-slanje.docx
```

`inventar_paketa.mrtvi_mediji()` nalazi PNG-ove koje `document.xml` više ne
referencira, a paket ih i dalje nosi: na stvarnom radu 749 kB, 49 % datoteke, i
uz težinu **stara verzija grafikona** dostupna svakome tko raspakira .docx.
`tezina()` daje redak koji `provjeri_predaju.py` ispisuje, jer rad koji se ne
može poslati nije predan.

`priprema_slanja.py` piše **zasebnu** datoteku: arhivska verzija ostaje netaknuta.
Uklanja mrtve dijelove i skalira slike na `--dpi` prema širini UMETANJA, ne
prema izvornoj veličini. Nikad nije tihi dio `gradi.py`.


## Željezna pravila

1. **Word je izlaz, ne radna površina.** Ručna izmjena u `.docx`-u gubi se pri sljedećoj
   izgradnji. Ako je nešto potrebno mijenjati, mijenja se rukopis, profil ili model.
2. **Nijedna brojka se ne upisuje na dva mjesta.** Jedan izvor, pa zamjena `{{}}`.
3. **Mjeri, ne pretpostavljaj.** Paginacija, lomljenje prikaza i širina slike provjeravaju
   se nad renderiranim PDF-om, ne procjenom.
4. **Renderiraj i pogledaj.** Validator provjerava strukturu, ne izgled. Najopakiji kvar
   ove vrste — obrezana slika zbog fiksnog proreda — prolazi svaku strojnu provjeru.
5. **Kućni stil nikad u kodu.** Sve što varira po fakultetu čita se iz profila. Ako profil
   nešto ne propisuje, koristi se zadana vrijednost i **deklarira se** kao pretpostavka.
6. **Statični sadržaj samo u pregledu.** Predajni dokument nosi živo polje. Nikad obrnuto.
7. **Graditelj kućnog stila je cijeli cjevovod, ne njegov Pythonov skript.** Oko `build`
   skripta satelita stoji shell koji dira i ostatak arhive — prijelom riječi, font teme,
   `docDefaults`. Motor koji pozove samo Python dobije dokument koji je u `document.xml`
   **identičan**, a prelomi se drukčije. Prilagodnik reproducira cjevovod u cijelosti.
8. **Stabilizirana petlja nije provjerena petlja.** Svako mjerenje mora imati ogradu koja
   pada kad je rezultat nemoguć. Bez toga tiha greška postaje fiksna točka.
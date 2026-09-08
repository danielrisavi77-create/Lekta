# RAZINA RADA — koliko čitatelj već zna

> Postavlja se u modu 1, čita prije prve rečenice u modu 2. Registar je
> `references/razina.json`, alat `scripts/razina.py`, stanje `.katedra/razina.json`.

## Načelo koje se ne smije izokrenuti

**Niža razina nije lošiji rad. Rad je koji više objašnjava i manje tvrdi.**

Rad prve godine koji uredno izloži, poveže i potkrijepi literaturu je odličan rad prve
godine. Isti tekst na diplomskom je prepričavanje. Obrnuto: diplomski koji definira pojam
koji komisija koristi dvadeset godina troši prostor i odaje da autor ne zna kome piše.

Zato ovaj registar **nigdje ne spušta zahtjeve** na točnost, izvore ni argument. Mijenja
tri stvari: dubinu objašnjavanja, očekivani doprinos i omjer teorije i analize. Tko ga
upotrijebi da napiše slabiji tekst, upotrijebio ga je krivo.

## Zašto je nastalo

Do v1.4 skill je skalirao samo po **tipu rada** — opseg, broj poglavlja, `izvori_min` — i
imao tri radna moda u `pisanje.md` §3.1. Nijedno polje nije nosilo ono što zapravo odlučuje
kako rečenica izgleda: koliko čitatelj već zna. Posljedica je bila da rad za kolegij prve
godine i rad za diplomsku komisiju izlaze s istom razradom pojma — jedan preplitko, drugi
snishodljivo, a nijedan zbog neznanja nego zbog toga što ga nitko nije pitao.

## Postavljanje (mod 1)

```bash
python3 <KATEDRA_SKILL>/scripts/razina.py --tip <tip>          # prijedlog, ne odluka
python3 <KATEDRA_SKILL>/scripts/razina.py --postavi <razina> \
    --citatelj <tko> --tema-poznata da|ne
python3 <KATEDRA_SKILL>/scripts/razina.py                      # ispiši što iz toga slijedi
```

| Razina | Kad |
|---|---|
| `preddiplomski-1-2` | seminarski i esej na 1.–2. godini |
| `preddiplomski-3` | završni rad; prijelomna razina — ovdje rad prvi put mora **tvrditi** |
| `diplomski` | diplomski rad; ocjenjuje se po tome što tvrdi, ne po tome što zna |
| `poslijediplomski` | izvoran doprinos koji se dade osporiti |

| Čitatelj | Što iz njega slijedi |
|---|---|
| `nositelj` | obvezna literatura kolegija mora biti **vidljivo upotrijebljena**, ne samo u popisu |
| `mentor` | ono što je rečeno u prošlom krugu se ne ponavlja; otvorene zamjerke su prvi kriterij |
| `komisija` | svaka kratica i vlastiti pojam razriješeni pri prvom pojavljivanju; teza nalaziva u uvodu bez traženja |
| `sira-publika` | uže pojmove definirati, ali bez udžbeničkog tona; kontekst prije tvrdnje |

**Prijedlog iz tipa rada je prijedlog, ne odluka.** Student diplomskog piše i seminarske, a
završni na stručnom studiju nije isto što i na sveučilišnom. Zato `--tip` samo ispisuje
prijedlog i ništa ne zapisuje.

`--tema-poznata ne` znači da je tema izvan uže specijalnosti čitatelja: kontekst tada ide
**prije** tvrdnje, a uži pojmovi se definiraju i na višoj razini.

## Što razina mijenja u pisanju (mod 2)

Ispis `razina.py` daje šest obveza koje ulaze u upute za pisanje poglavlja, jednako
obvezujuće kao kućni stil:

| | |
|---|---|
| **SMIJE SE PRETPOSTAVITI** | granica ispod koje se ne objašnjava |
| **DEFINIRAJ** | koji se pojmovi definiraju pri prvom pojavljivanju |
| **PRETPOSTAVI** | što se ne definira ni pod koju cijenu |
| **OMJER teorija : analiza** | okvirna raspodjela stranica; odstupanje se zapisuje kao odstupanje od plana |
| **OČEKIVAN DOPRINOS** | što rad mora dati da bi bio na razini, ne što smije izostaviti |
| **REČENICA** | kraća i izravnija na nižim razinama, gušća na višima |

Provjera na kraju potpoglavlja: **je li ijedan pojam definiran suprotno razini?** Definicija
poznatog pojma na diplomskom i nedefiniran pojam na prvoj godini su ista pogreška u dva
smjera, i obje se vide u prvom odlomku.

## Granice i sudari

1. **Upute fakulteta pobjeđuju.** Ako profil traži nešto što se s razinom sudara, radi po
   profilu i **javi sudar izrijekom** (željezno pravilo 17).
2. **Glas autora pobjeđuje nad razinom, ali ne nad Uputama** (`stil_autora.md`, pravilo 16).
3. **Razina se ne zaključuje iz teksta.** Rad koji mnogo objašnjava može biti prvi semestar
   ili loš diplomski; alat tu razliku ne vidi i ne pretvara se da vidi. Deklarira se, kao
   citatni stil (SKILL.md § 0.8).
4. **Razina nije izlika.** Ništa u registru ne dopušta manje izvora, slabiju provjeru ni
   izmišljen podatak. Željezna pravila 2, 3 i 4 vrijede na svakoj razini jednako.

## Kad se razina mijenja usred rada

Mijenja se rijetko, ali se dogodi — mentor kaže „ovo piši kao da ide na obranu, ne za
kolegij". Tada:

```bash
python3 <KATEDRA_SKILL>/scripts/razina.py --postavi diplomski --citatelj komisija
python3 <KATEDRA_SKILL>/scripts/plan_state.py odstupanje \
    --sto "razina podignuta na diplomski" --zasto "uputa mentora, 12. 9."
```

Već napisana poglavlja time postaju **nedosljedna s ostatkom** — to nije sitnica nego
odstupanje i zapisuje se. Poglavlja se ne prepisuju automatski; odluku donosi autor.

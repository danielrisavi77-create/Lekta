# MOD 7 — POVRATAK IZ WORDA

Aktivira se kad korisnik pošalje rad koji je **Katedra prije toga izradila**, a on ga je u
međuvremenu uređivao: „evo, malo sam izmijenio", „usporedi s onim što si mi dao", „provjeri
je li sve u redu nakon mojih izmjena".

Ne aktivira se za tuđi rad koji Katedra nije napravila — to je `rad-audit`.

## Zašto mod postoji

Modovi 1–6 vode rad do predaje i tu ga ispuštaju. Ono što se dogodi poslije nije bilo ničiji
posao, a upravo je tamo šteta:

> Na eseju iz kolovoza 2026. autorica je napravila pet ručnih zahvata. Nastale su tri
> tipografske regresije i jedna netočna referenca stranice. Cijeli je lanac nad tom
> datotekom proizveo **jednu jedinu poruku, i ta je bila lažna** — `provjeri_predaju.py`
> blokirao je predaju zbog zastavice `updateFields`, koju je Word potrošio jer je polja
> upravo bio uredno osvježio.

Razlog je strukturan: sve postojeće provjere gledaju dokument **sam za sebe**. Kad su
brojevi stranica međusobno dosljedni, a tipografija ujednačena unutar rečenice, nema se što
prijaviti. Regresija se vidi samo u **odnosu na verziju koja je izišla ispravna**.

## Postupak

### 1. Traži obje datoteke

```
Trebam dvije datoteke:
  · verziju koju sam ti isporučio (ako je nemaš, imam je u .katedra/isporuke/)
  · tvoju uređenu verziju
Ako imaš i PDF uređene verzije, pošalji ga — s njim provjeravam i brojeve stranica.
```

Isporučene verzije čuvati u `.katedra/isporuke/RRRR-MM-DD-naziv.docx` **pri svakoj
isporuci**. Bez izvorne verzije ovaj mod nema s čime usporediti.

### 2. Pokreni usporedbu

```bash
python3 rad-docx/scripts/provjeri_povratak.py IZVORNI.docx VRACENI.docx \
        --pdf VRACENI.pdf --json .katedra/povratak.json
```

Alat javlja pet vrsta nalaza:

| Nalaz | Značenje |
|---|---|
| nestali obvezni dijelovi | naslov ili izjava su nestali pri uređivanju |
| natpis ≠ stavka u popisu | natpis prikaza uređen, popis nije osvježen |
| tipografske regresije | en crtica → spojnica, dvotočka bez razmaka, ravni navodnici |
| promjene u citatima | dodan citat bez unosa u literaturi ili obrisan citat koji ostavlja siroče |
| glas autora | uklonjene ograde i slično — **nije pogreška** |

Uz `--pdf` pokreće se i `provjeri_reference.py`, koji svaku tvrdnju o stranici mjeri protiv
stvarnog otiska.

### 3. Podijeli nalaze na tri hrpe

**Vraćamo** — regresije koje krše citatni stil ili pravopis. Popravi ih u rukopisu, ne u
.docx-u, pa rad izgradi iznova. Autoru objasni **jednom** zašto (raspon stranica traži en
crticu), a objašnjenje zapiši u `stil_autora.json` da se ne ponavlja.

**Pamtimo** — glas. Ide u `.katedra/stil_autora.json` (vidi `stil_autora.md`) i od sljedećeg
rada te konstrukcije ne pišemo uopće.

**Pitamo** — sve ostalo. Obrisani redak s naslovnice može biti odluka („kolegij se ne piše")
ili previd. Jedno pitanje, pa u profil ili u odstupanja.

### 4. Zapiši odstupanja od profila

Ako je izmjena trajno odstupanje od kućnog stila (jedna naslovnica umjesto dvije, sažetak na
početku umjesto na kraju), ide u `.katedra/odstupanja.json`:

```json
[
  {"pravilo": "/struktura/obavezni_dijelovi", "odstupanje": "jedna naslovnica",
   "trazio": "korisnik", "datum": "2026-08-22",
   "razlog": "esej, ne diplomski; uzorak mentora ima jednu"}
]
```

Bez ovog zapisa gate svaki put javlja isto kršenje, a izrada svaki put vraća staro stanje.
**Na jednom je radu tako dvije naslovnice preživjelo nekoliko krugova nakon izričite upute
da bude jedna.**

### 5. Izgradi iznova i zatvori krug

Nikad ne krpaj vraćeni .docx. Popravci idu u rukopis, dokument se gradi iznova, pa se nad
konačnim PDF-om pokreće `provjeri_reference.py`. Isporuka se ponovno arhivira u
`.katedra/isporuke/`.

## Isporuka moda 7

1. Popis nalaza po tri hrpe (vraćamo / pamtimo / pitamo).
2. Nova verzija .docx + .pdf, izgrađena iz rukopisa.
3. Dopunjen `stil_autora.json` — s izrijekom navedenim što je zapamćeno.
4. Jedna rečenica po vraćenoj regresiji: zašto je vraćena.


---

## Tijek moda — sažeto

> Ovo je bilo u routeru (`SKILL.md` § 2) do v1.7.
> Tijek jednog moda ne treba biti u datoteci koja se učitava u svakoj poruci.

`povratak.md`. Aktivira se kad korisnik pošalje rad koji je
  Katedra izradila, a on ga je uređivao („malo sam izmijenio", „usporedi s onim što si mi
  dao"). Motor je `rad-docx/scripts/provjeri_povratak.py` (+ `provjeri_reference.py` uz
  PDF). Nalazi se dijele na tri hrpe: **vraćamo** (regresije citatnog stila i pravopisa),
  **pamtimo** (glas autora → `stil_autora.json`), **pitamo** (sve ostalo). Popravci idu u
  rukopis, dokument se gradi iznova — vraćeni .docx se nikad ne krpa. Za tuđi rad koji
  Katedra nije napravila i dalje vrijedi `rad-audit`.

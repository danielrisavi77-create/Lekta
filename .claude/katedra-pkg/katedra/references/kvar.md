# Format unosa u katalog kvarova

Katalog je `rad-docx/references/zamke.md`. Numeracija teče, unosi se ne brišu ni ne
preslaguju — broj kvara je referenca na koju se pozivaju komentari u kodu.

## Kuća piše prozom

Unos nije obrazac s četiri rubrike. Piše se kao kratak tekst, a **četiri stvari moraju se
iz njega dati pročitati**: što je korisnik vidio, zašto se to dogodilo, što je promijenjeno
i gdje popravak živi. Ako se odlomak ne da napisati bez rubrika, mehanizam još nije shvaćen.

```markdown
## 24. Sadržaj se mjeri iz PDF-a u kojem sadržaja još nema

Mjerenje stranica ide iz prvog PDF-a, a zatim se u dokument upiše sadržaj dug dvije-tri
stranice. Prijelom se pomakne, a upisani brojevi ostanu iz prijeloma koji više ne postoji.
Na jednom radu s 40 stavki bili su krivi **svi**, pa se to lako previdi: izgledaju uredno
i međusobno dosljedno.

```bash
<isječak koji pokazuje ispravan postupak>
```

Konvergira u tri mjerenja. Zadnji korak nije opcionalan: poslije se pokreće
`provjeri_reference.py` nad konačnim PDF-om, jer petlja jamči stabilnost, a ne točnost.
```

## Naslov imenuje mehanizam

| Loše | Dobro |
|---|---|
| Krivi brojevi stranica | Sadržaj se mjeri iz PDF-a u kojem sadržaja još nema |
| Problem sa sažetkom | Sažetak se ne provjerava protiv rada |
| python-docx bug | `p.runs[0]` nikad nije `p.runs[0]` |

Naslov koji imenuje simptom ne pomaže onome tko šest mjeseci poslije traži je li se to već
dogodilo. Naslov koji imenuje mehanizam odmah kaže vrijedi li i za njegov slučaj.

## Brojka i isječak

**Brojka** razlikuje kvar od slutnje. Jedna je dovoljna: „Popis tablica tvrdio je 5, tablica
je bila na 4." · „203 → 196 odlomaka, bez ijedne poruke." · „Na jednom radu bili su krivi
svi." Ako brojke nema, obično nedostaje i mjerenje — vrati se na dokument.

**Isječak** pokazuje kvar u tri retka koda ili izlaza. Opis bez isječka čita se kao tvrdnja;
s isječkom se čita kao dokaz. Kad kvar nije u kodu nego u postupku, isječak je naredba ili
ispis alata.

## Tihi kvarovi imaju prednost

Kvar koji sruši skriptu netko će naći. Kvar koji tiho proizvede krivi dokument neće nitko.
Ako je nalaz tih, to se kaže izrijekom, a popravak obavezno uključuje **ogradu koja bi ga
bila uhvatila** — provjeru poslije zahvata, a ne samo ispravak.

## Što alat provjerava, a što ne

```
python3 scripts/kvar.py <put>/zamke.md --provjeri
```

Tvrdo (kvari katalog): numeracija preskače, dva unosa isti naslov, naslov u obliku
koji registar ne čita.
Za oko: unos bez brojke, bez isječka, kraći od 400 znakova.

Imenuje li naslov mehanizam i valja li popravak — **ne procjenjuje alat**. Prva verzija je
pokušala tražiti četiri naslovljene rubrike i na katalogu od 31 unosa javila 37 nalaza; svi
su bili uredni unosi pisani prozom. Alat koji viče na uredan materijal uči korisnika da
ignorira crvenu boju, pa promašeni nalaz poslije prođe neopaženo.

## Naslov ima točno jedan oblik

```
## 58. naslov            ← jedan broj
## 61–63. naslov         ← raspon, kad jedan unos pokriva više kvarova
```

Ne `## Kvar 58 — naslov` ni `## Kvarovi 61–63 — naslov`. Taj oblik alat **ne vidi**, pa
katalog izgleda kraći nego što jest i „sljedeći slobodan” pokazuje na broj koji je već
potrošen — sljedeća zakrpa ga uzme i sudari se. Dogodilo se četiri puta zaredom
(v1.9.5, v1.9.6, v1.9.7, v1.9.10). Od kvara 116 to je tvrdi nalaz uz naredbu koja ga
popravlja:

```
python3 scripts/kvar.py <put>/zamke.md --popravi-naslove
```

## Broj se pita, ne pretpostavlja

```
python3 scripts/kvar.py <put>/zamke.md --sljedeci     → 116
```

Zakrpa koja piše novi unos numerira ga od **ovoga**, iz kataloga u koji unos ide, a ne od
zadnjeg broja u vlastitoj grani. Sudari 74, 105 i 106 nastali su upravo tako: dvije grane
brojile su od istog mjesta ne znajući jedna za drugu.

## Loš unos

```markdown
## 32. Problem s tablicama

Ponekad se tablica ne prikaže dobro. Treba paziti na to.
```

Nema brojke, nema mehanizma, nema popravka, nema mjesta. Ovo je ideja, ne kvar — ide u
`references/ideje.md` dok se ne pojavi dokument koji je dokazuje.

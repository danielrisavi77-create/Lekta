# Faza E2 — lektorski prolaz

Skripte faze E (`check_typography.py`, `check_repetition.py`, `provjeri_zamke_proze.py`)
mjere ono što se broji: navodnike, crtice, duljinu rečenice, ponovljene početke.
Ne vide sročnost, padež, kalk iz engleskog ni nedosljedno nazivlje. Na stvarnom radu
(HKS-FZS, rujan 2026.) lektorski je prolaz nad **novonapisanim** tekstom našao 31
nalaz koje nijedna skripta nije prijavila, uključujući jednu pogrešku iz izvorne
verzije rada koju nijedna faza audita ne gleda: Statistički postupci tvrdili su
zaokruživanje vrijednosti p na dvije decimale, a tablice nose p = 0,002 i p = 0,005.

Zato je prolaz **propisan korak**, ne improvizacija, i vodi ga zaseban agent.

## Kada se pokreće

- Uvijek nakon što je bilo koji dio teksta **napisan ili prepisan** u ovoj sesiji.
- Nikad nad cijelim naslijeđenim radom bez pitanja: lektura tuđeg teksta u cijelosti
  je zahvat u autorov glas, a ne audit. Opseg su odlomci koji su dirani.
- Nad tekstom, ne nad .docx-om: prolaz gleda rečenice, ne polja.

## Zašto zaseban agent, a ne isti koji je pisao

Autor teksta loš je lektor vlastitog teksta, i to vrijedi i za model. Prolaz mora
dobiti tekst bez obrazloženja zašto je napisan tako kako jest, inače potvrđuje
vlastite izbore. Agent dobiva samo tekst i popis kategorija.

## Prompt (drži se ovoga, kategorije su mjerene)

> Ti si strogi lektor hrvatskog standardnog jezika za akademske tekstove
> (\<područje\>). Pregledaj priloženi tekst i vrati SAMO konkretne pogreške, svaku s
> točnim citatom problematičnog dijela i predloženim ispravkom:
>
> 1. pravopis i gramatika: sročnost, padež, glagolski vid, ije/je, veliko i malo
>    slovo, zarezi po hrvatskim pravilima
> 2. nespretne ili dvosmislene rečenice, anglizmi, ponavljanje riječi u istoj rečenici
> 3. nedosljedno nazivlje i kratice (kratica upotrijebljena prije nego je uvedena),
>    nedosljedno pisanje brojeva i postotaka (hrvatski standard: „54,1 %" s razmakom,
>    „100 000")
> 4. duge crtice (— ili –) koje ne smiju postojati; ravni navodnici
> 5. sve što ne zvuči kao izvorni hrvatski akademski tekst
>
> Ne prepisuj odlomke i ne predlaži stilske promjene „radi ljepote". Ako je nešto
> ispravno, ne komentiraj. Vrati numerirani popis: citat → ispravak → razlog u pola
> rečenice. Ako u nekoj kategoriji nema nalaza, napiši „nema".

## Što se prihvaća, a što ne

Nalaz se prihvaća kad ispravlja **pogrešku**. Odbija se kad mijenja **autorov izbor**
koji ništa ne krši — to je granica iz Katedrina željeznog pravila 4 (regresija
naspram glasa), samo u drugom smjeru.

| prihvati | odbij |
|---|---|
| sročnost, padež, vid („djeluju 272 volontera") | nazivlje koje autor dosljedno koristi („ustroj istraživanja") |
| kalk iz engleskog („izložene edukaciji" → „prošle edukaciju") | zamjena termina koji je u struci uobičajen |
| kratica prije uvođenja (SZO u prvom odlomku) | preferencija lektora za drugu, jednako ispravnu konstrukciju |
| nedosljedno pisanje brojeva (trideset naspram 34) | „ljepše" preslagivanje rečenice bez pogreške |
| tvrdnja koja proturječi tablicama (decimale p) | skraćivanje jer je rečenica duga |

Mjereno na spomenutom radu: od 31 nalaza prihvaćeno 28, odbijena 3 (sva tri iz
desnog stupca). Odbijeni nalaz se **zapisuje** u `.katedra/stil_autora.json` kao
glas, da ga sljedeći prolaz ne predlaže ponovno.

## Poslije prolaza

Ispravci ulaze u tekst, pa se **ponovno** pokreću faze B i C: lektura dira rečenice
u kojima stoje citati i brojke, a mjesto citata u rečenici može promijeniti
redoslijed prvog pojavljivanja. To je ista petlja koju traži željezno pravilo
„nakon SVAKE izmjene ponovno provjeri citate/brojke/polja/validaciju".

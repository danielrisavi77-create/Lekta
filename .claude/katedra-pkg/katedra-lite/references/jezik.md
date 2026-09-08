# JEZIK RADA — deklarira se, alati se isključe

> Alat je `scripts/jezik.py`. Polje je `jezik` u `.katedra/stanje.json`
> (`stanje_init.py --set jezik=hr|en|de|it|fr`), rezerva je `format.jezik` u profilu.

## Zašto postoji

Do v1.8 **nijedan profil nije imao polje `jezik`**, a cijeli je lanac tiho pretpostavljao
hrvatski: `hr_text`, `provjeri_jezik`, `check_ai_style`, `provjeri_sazetak`, hrvatska
kolacija u popisu literature, citatni dijalekti.

Rad pisan **na engleskom** na hrvatskom fakultetu — a takvih programa ima — nije dobivao
poruku „ne mogu”. Dobivao je **nalaze**, i svi su bili krivi: svaka rečenica „pravopisna
pogreška”, nijedna kohezijska veza prepoznata, popis presložen po hrvatskoj abecedi.

To nije rupa nego **generator lažnih nalaza**, a lažni nalaz je kvar jednake težine kao
promašeni (željezno pravilo 18).

## Kako se ponaša

| Stanje | Ponašanje |
|---|---|
| `jezik=hr` | alati vezani uz hrvatski rade normalno |
| `jezik=en` (ili drugi) | alati se **isključe**, ispišu ograničenje, vrate izlazni kod **0** |
| nije deklariran | alati rade, ali **upozore** da je pretpostavljen hrvatski |

Zadano je `hr` jer je paket za to građen. Svaki drugi jezik mora biti **zadan**, da izostanak
polja bude vidljiv kao izostanak, a ne kao tiha pretpostavka.

Isključen alat vraća **0, ne 1**: nepokrivenost nije nalaz. Ograničenje se upisuje u projekt
(`stanje_init.py --ogranicenje "…"`), kao i kod izostanka satelita.

## Što ostaje pokriveno na svakom jeziku

Sve što ne ovisi o jeziku: os dijelova, formalna pravila (`check_rules`), prikazi, geometrija
odlomaka, izvori i pokrivenost citata, evidence gate, rubrika, tempo, pretraga.

Ono što se isključuje: `provjeri_jezik`, `check_ai_style`, `provjeri_sazetak`,
`provjeri_literaturu` (hrvatska kolacija), `provjeri_izracune` (hrvatski uzorci).

## Granica

Jezik se **ne zaključuje iz teksta**. Rad s engleskim sažetkom i hrvatskim tijelom i rad
obrnuto iz uzorka slova izgledaju slično, a posljedica pogrešnog zaključka je cijeli
izvještaj lažnih nalaza. Deklarira se, kao citatni stil i razina (SKILL.md § 0.8).

<!-- npm run skill-feedback -- --write | 2026-09-10T08:44:26.887Z | 6ba55be11f962f01865b53e98c53e15c6d98d8b1 -->
<!-- Fragment za <katedra-lite>/references/zamke.md. Provjera na drugoj strani: -->
<!-- python3 <katedra>/scripts/kvar.py <ovaj-fragment>.md --provjeri --nastavak-od 159 -->

nadovezuje se na unos 159

## 160. Slovni sufiks godine razbija citanje jedinice, pa isti rad izlazi na oba popisa

`GODINA_RE` iza cetveroznamenkaste godine trazi granicu rijeci, pa jedinica „Maric, L. (2023a). ..."
ne dobije NIJEDNU godinu. Kljuc jedinice postane („maric", ""), a kljuc citata („maric", "2023a"),
i isti rad izadje istovremeno kao citat bez izvora I kao necitirana jedinica, dakle kao dva
razlicita problema.

Zamka je u tome sto sufiks nije rub nego PROPIS: APA ga trazi kad isti autor ima dva rada iste
godine. Upravo radovi kojima je potreban jedini su koje alat ne moze spojiti, pa kvar pogadja
tocno one popise koji su najpazljivije napisani.

Kvar 157 je zatvorio sklonidbu i daje isti simptom, ali ovu granu ne dodiruje: `_korijen()` radi
nad prezimenom, a ovdje puca godina. Uz citanje treba i usporedba: sufiks se skidao samo s
citatne strane (`rstrip("abcdefg")`), pa je „2023" mjereno protiv „2023a".

Granica popravka je uska i vrijedi je zadrzati: sufiks se DOPUSTA, ali se NE uzima u godinu, pa
„20231" i „2023x9" i dalje nisu godina. Bez te ograde bi se pojam godine prosirio na svaki broj
kojemu slijedi slovo.

Izmjereno izravno na 2 dokumenta (fpzg--project--diplomski--uskladjen.docx, fpzg--project--diplomski--neuredan.docx).

```
$ python3 scripts/verify_sources.py fpzg--project--diplomski--uskladjen.docx --pokrivenost --offline --json out.json

   v1.9.40, prije popravka:
     bez_izvora:  ["maric 2023a", "maric 2023b"]     <- citirano, a tobože nema jedinice
     necitirani:  1                                   <- ISTA jedinica, druga rubrika

   Uzrok se vidi tek u strukturi koju `rastavi()` vraca:
     {"autor": "Maric", "godina": null}               <- godina nije procitana UOPCE

   poslije popravka: bez_izvora 0, necitirani 0
```

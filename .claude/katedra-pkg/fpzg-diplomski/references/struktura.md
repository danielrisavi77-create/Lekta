# Redoslijed dijelova rada

Preuzeto iz obranjenog rada. Odstupanja od ovog redoslijeda treba obrazložiti.

```
1.  Vanjska naslovnica                         bez broja stranice
2.  Unutarnja naslovnica                       bez broja
3.  Izjava o akademskoj čestitosti             bez broja
4.  Sadržaj                    TOC polje       bez broja
    ────────── prijelom sekcije, numeracija kreće od 1 ──────────
5.  1. Uvod
6.  2. …
    …
7.  n. Zaključak
8.  Literatura
9.  Popis tablica              TOC \c "Tablica"
10. Popis grafikona            TOC \c "Grafikon"
11. Prilog 1. Anketni upitnik
12. Sažetak + Ključne riječi   11 pt
13. Summary + Keywords         11 pt
```

## Što iznenađuje

**Sažetak ide na kraj, ne na početak.** U obranjenom radu Sažetak i Summary
posljednji su dijelovi, iza priloga. Oznake su podebljano-kurziv, tekst 11 pt.

**Summary na engleskom je obavezan u praksi.** Ne stoji izrijekom u obveznim
dijelovima, ali obranjeni rad ga ima, s ključnim riječima.

**Popis prikaza ide na kraj**, ne iza sadržaja. Kad rad ima i tablice i grafikone,
razdvajaju se u dva naslova prve razine, jer se `TOC \c` veže na identifikator
`SEQ` polja i ne može miješati vrste.

**Sadržaj obuhvaća razine 1 i 2** (`TOC \o "1-2"`). Sažetak, Summary i Izjava u
njemu se ne pojavljuju jer nisu naslovi u stilu Heading — to je namjerno.

## Popisi prikaza: zašto živa polja, a ne prepisan tekst

Obranjeni rad ima popis tablica kao dva retka **običnog teksta, bez brojeva
stranica**. To je slabost koju ne treba preslikati.

Ispravno je TOC polje s `PAGEREF` unosima:

- brojevi se osvježavaju sami kad se rad prelomi
- točkasti vodič i desni tabulator na 16,02 cm
- u polje se pri izgradnji upisuje i **stvarni popis** kao spremljeni rezultat,
  pa je ispravan i prije nego korisnik osvježi polja u Wordu

## Prilog: anketni upitnik

Upitnik se ne prepisuje po sjećanju nego **rekonstruira iz izvoza odgovora**:

- tekst pitanja = zaglavlja stupaca u CSV-u, doslovno
- ponuđeni odgovori = stvarne vrijednosti u podacima
- kod pitanja znanja točan odgovor podebljan i označen zvjezdicom, uz napomenu da
  ispitanicima ta oznaka nije bila vidljiva
- ključ točnih odgovora preuzima se **iz iste skripte** koja računa indeks, da se
  prilog i rezultati ne mogu razići
- kontrolna stavka pažljivosti ostaje na svom mjestu — bez nje čišćenje uzorka
  opisano u metodologiji nije provjerljivo

**Praznine u numeraciji se prijavljuju, ne skrivaju.** Ako u izvozu nedostaje
pitanje 42, u napomeni na kraju priloga piše da je riječ o praznini nastaloj pri
uređivanju obrasca. Mentor bi taj skok primijetio.

**Zamke pandoca u prilogu.** Stavka popisa koja počinje rimskim ili arapskim brojem
s točkom („III. mirovinski stup", „1.501 – 2.000 €") čita se kao ugniježđena
numerirana lista i razbija popis. Točka se mora zaštititi: `III\.`

Prilog ide zbijeno: odgovori jednostruki prored, razmak 1 pt, uvlaka 1 cm; tekst
pitanja 8 pt prije / 3 pt poslije. Bez toga upitnik od šest stranica naraste na deset.

Tablica u prilogu **nije numerirani prikaz** — ostaje bez natpisa i bez boje
zaglavlja, da se ne pomiješa s Tablicama 1–n.

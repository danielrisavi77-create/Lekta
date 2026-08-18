---
name: Sigurnost ili podaci
about: Neovlasten pristup, curenje podataka, zaobidjen gate, ili sumnja na to
labels: sigurnost
---

<!--
Audit 2026-08-17 (CODE-21).

AKO JE RIJEC O AKTIVNOJ ZLOUPORABI ILI CURENJU TUDJIH PODATAKA, ne otvaraj javni issue nego
javi na kontakt e-mail iz Obavijesti o privatnosti. Ovaj predlozak je za nalaze koji se smiju
raspravljati javno.

NIKAD NE PRILAZI STVARNE TAJNE, TOKENE NI TUDJE OSOBNE PODATKE. Ako je token procurio, prvo ga
rotiraj, pa opisi kako je procurio.
-->

## Sto je nadjeno

<!-- Konkretno ponasanje, ne pretpostavka. -->

## Tko to moze izvesti

- [ ] Bilo tko, bez racuna (`anon`)
- [ ] Bilo koji prijavljeni korisnik (ukljucujuci lako stvoren anonimni racun)
- [ ] Samo vlasnik podatka
- [ ] Samo administrator

Prag je nizak namjerno: anonimna prijava je ukljucena, pa "treba biti prijavljen" nije zapreka.

## Sto se time dobiva

- [ ] Citanje tudjih podataka
- [ ] Mijenjanje ili brisanje tudjih podataka
- [ ] Zaobilazenje kvote ili naplate
- [ ] Trosak na nas racun (LibreOffice worker, vanjski provideri, e-mail)
- [ ] Drugo:

## Gdje je granica koja je popustila

- [ ] RLS politika ili grant u bazi
- [ ] Provjera u Edge funkciji (auth, rate limit, porijeklo dogadjaja)
- [ ] CORS ili CSP
- [ ] Klijentska provjera koja se pogresno smatrala granicom

Podsjetnik: klijentska provjera nikad nije granica. Ako se pravo pristupa oslanja na nju, to je
sam po sebi nalaz.

## Reprodukcija

<!-- Koraci ili `curl` bez tajni. Ako je SQL, navedi ulogu (anon / authenticated / service role). -->

## Je li fail-open

- [ ] Gate odbija kad provjera padne (fail-closed)
- [ ] Gate propusta kad provjera padne (fail-open)

Ako je fail-open, je li to negdje zapisano kao svjesna odluka? Nekoliko nalaza ovog audita bili
su upravo fail-open putovi koje nitko nije birao, nego su nastali usput.

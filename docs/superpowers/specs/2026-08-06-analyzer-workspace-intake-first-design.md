# Analyzer workspace, upload-first demo

## Cilj

Napraviti novu iteraciju izoliranog analyzer demoa koja zadržava postojeću live logiku učitavanja dokumenta, ali koristi vizualni smjer workspace demoa: boje, tipografiju, naslov „Od dokumenta do jasnog plana” i dublji editorial sloj.

## Ponašanje

- Početno stanje prikazuje upload kao primarni i prvi korak. Korisnik ne mora prvo birati fakultet ili vrstu rada.
- Upload zona ostaje na glavnom mjestu radnog prostora i može se aktivirati klikom, tipkom Enter ili Space.
- Nakon učitavanja isti workspace prelazi u kompaktno stanje s odabranim dokumentom, kontekstom rada i jasnim gumbom za pokretanje provjere.
- Obrada se prikazuje u istom glavnom panelu, bez dodatne stranice i bez skoka na drugi dio proizvoda.
- Rezultat se prikazuje u istom panelu, uz mogućnost ponovnog pokretanja demoa.
- Nijedna vrijednost ili rezultat nije stvarna analiza. Demo koristi jasno označene unaprijed pripremljene podatke.

## Vizualni smjer

- Zadržati naslov i serifni editorial glas iz postojećeg workspace demoa.
- Upload u početnom stanju dobiva najveću vizualnu hijerarhiju, uz dokumentni papir, crveni akcent i suptilni scan/orbit motion.
- Profil i napredne opcije pojavljuju se tek nakon učitavanja i koriste kompaktnu mrežu kako bi se izbjeglo nepotrebno scrollanje.
- Rail ostaje kao orijentir, ali aktivira samo stvarne faze kroz koje demo prolazi.
- `prefers-reduced-motion` preskače prijelaze i odmah prikazuje stabilno stanje.

## Ograničenja

- Live `index.html` i `src/ui/app.ts` ne mijenjaju se u ovoj iteraciji.
- Ne diraju se parser, analiza, pravila, citation engine ni postojeći poslovni tok.
- Ne uvodi se Three.js, WebGL ni nova chart biblioteka.
- Demo mora zadržati tipkovničku navigaciju i proći axe provjeru bez novih critical ili serious problema.

## Provjera prihvaćanja

- Početno stanje ima vidljivu upload zonu i ne prikazuje profil prije učitavanja.
- Nakon aktiviranja uploada prikazuje se odabrani dokument i profil u istom workspaceu.
- Gumb pokretanja mijenja stanje u obradu, a zatim u rezultat bez promjene stranice.
- Na mobitelu nema horizontalnog overflowa i panel se slaže u jednu kolonu.
- Reduced-motion stanje ne čeka animaciju za prikaz rezultata.

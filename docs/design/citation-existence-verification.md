# Dizajn: provjera POSTOJANJA literature (opt-in, online)

Status: **prijedlog** (nije implementirano). Odnosi se na "izmišljenu literaturu".

## Problem

Studenti (i sve češće LLM-alati) znaju navesti **nepostojeću** referencu: uvjerljiv autor,
naslov, časopis, godina, čak i DOI/ISBN, ali izvor ne postoji. To je integritetski problem koji
raste s generativnim alatima.

## Što možemo LOKALNO (već implementirano u `src/audits/submission-lint.ts`)

Bez mreže, deterministički, uz privatnosnu premisu "ništa ne napušta preglednik":

- **Nesklad autor↔godina** — tekst kaže `(Horvat, 2020)`, literatura `Horvat (2019)`. Jak signal
  nemarnog ili izmišljenog navoda.
- **Nevaljan ISBN** (kontrolna znamenka ISBN-10/13) i **nevaljan DOI** (oblik `10.xxxx/…`).
  Izmišljeni identifikatori često padnu na checksumu/obliku.
- **Nemoguća godina** (u budućnosti), **duplikati**, **jedinica bez godine**.

Ograničenje: ovo hvata **nedosljednost i nevaljan oblik**, ali NE i "postoji li izvor stvarno".
Savršeno oblikovana izmišljena referenca prolazi lokalno.

## Što traži MREŽU (ovaj prijedlog)

Potvrda postojanja zahtijeva vanjski upit. To **ruši lokalnu premisu**, pa mora biti:

1. **Opt-in, eksplicitan** — zaseban gumb "Provjeri postoje li izvori (online)" uz jasno
   upozorenje: "Ovo šalje autore, naslove, DOI/ISBN tvojih referenci trećim servisima
   (CrossRef, doi.org). Naslov rada i tijelo teksta se NE šalju."
2. **Minimalan otisak** — šalje se samo strukturirana referenca (ili samo DOI/ISBN), nikad tekst rada.

### Izvori provjere (besplatni, bez ključa)

| Servis | Upit | Vraća |
|---|---|---|
| **CrossRef REST** (`api.crossref.org/works?query.bibliographic=…`) | naslov + autor + godina | najbolji pogodak + score; ako je slab → sumnjivo |
| **doi.org resolver** (`https://doi.org/<doi>`, HEAD/Accept: json) | DOI | 200 = postoji, 404 = ne postoji |
| **Open Library / Google Books** (ISBN) | ISBN | postoji li knjiga |

### Tijek

```
lokalni signali (uvijek)  ->  [gumb] online provjera (opt-in)
  za svaku referencu:
    ima DOI?    -> doi.org resolve (najjače: 404 = ne postoji)
    ima ISBN?   -> Open Library lookup
    inače       -> CrossRef bibliographic match; nizak score = "nije pronađeno"
  rezultat: ✓ pronađeno | ⚠ slab pogodak (provjeri) | ✗ nije pronađeno
```

### Rizici / oprez

- **Lažni negativi**: legitiman izvor kojeg nema u CrossRef-u (domaći zbornik, stara knjiga).
  Zato ishod je "nije pronađeno u X", nikad "izmišljeno".
- **Privatnost/rate-limit**: cache po sesiji, batch, throttling; jasan disclosure.
- **CSP**: `connect-src` bi trebao dopustiti te hostove; danas je `connect-src 'self' https:`
  (dovoljno široko), ali bolje bi bilo eksplicitno navesti hostove.

### Odluka

Lokalne signale zadržavamo **uvijek uključene** (advisory). Online provjera je **zaseban,
opt-in korak** — implementira se tek kad se potvrdi produktno (i pravno: disclosure u uvjetima).

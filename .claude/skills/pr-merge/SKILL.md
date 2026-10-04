---
name: pr-merge
description: Koordinatorska petlja spajanja PR-a. Okida se kad koordinator treba provjeriti CI, review i opis PR-a te spojiti PR u master tek kad je sve zeleno.
---

# Petlja spajanja PR-a (koordinator)

Spaja samo koordinator. Implementator PR otvara kao draft, prebacuje ga u ready i javlja broj
komentarom; spajanje ne radi sam.

## Pravila

- Nikad ne spajaj bez zelenog CI-ja na zadnjem commitu heada i bez zatvorenih uvjeta reviewa
  (nijedna otvorena nit s blokirajucim nalazom, nijedan zahtjev za izmjenama).
- Opis PR-a mora imati retke `Neto redaka: +x/-y` i `Nove ovisnosti: nema` (ili popis paketa).
  Provjerava ih CI job `pr-opis`; lokalno ih racuna `node scripts/agents/pr-lines.mjs --izracunaj`.
- Squash koristi kad medjucommiti sami ne prolaze gate; inace obican merge commit.
- Povijest tudje grane se ne prepravlja: bez rebasea i force-pusha. Grana iza mastera se
  azurira merge commitom.

## Provjera stanja

Check runovi zadnjeg commita:

```bash
gh api repos/<vlasnik>/<repo>/commits/<head-sha>/check-runs --jq '.check_runs[] | [.name, .status, .conclusion] | @tsv'
```

`skipped` i `neutral` nisu pad; `cancelled` run se gleda uz novi run istog imena (tipicno
`pr-opis` nakon izmjene opisa). Sve ostalo mora biti `success`.

## Skripta

```bash
node C:/Users/PC/.claude/scripts/lekta-pr-merge.mjs <PR> [--dry-run] [--squash]
```

Skripta zivi izvan repozitorija; ovdje je opisan samo njezin ugovor:

| Izlaz | Znacenje |
| --- | --- |
| 0 | spojeno (ili bi bilo spojeno uz `--dry-run`) |
| 1 | jos ne: CI radi ili je grana azurirana s masterom pa CI krece ispocetka |
| 2 | blokirano: crveni CI, otvoren review, los opis ili konflikt; treba covjek ili implementator |

Grana iza mastera se azurira (merge mastera u granu) i skripta vraca 1. Spaja iskljucivo kad je
sve zeleno.

## Petlja

0. Budi pretplacen na PR (`subscribe_pr_activity`) od trenutka kad doznas broj do spajanja;
   lokalni koordinator bez tog alata na svakom krugu pokrece svoj `pr-intake` (nije u repozitoriju).
   Na svakom krugu procitaj i nove komentare izvrsitelja na PR-u te zadnje dogadjaje njegove
   sesije (`get_session`, `list_events`); Routine sa zaglavljem `[<sesija> -> koordinator]` je
   izvjestaj izvrsitelja koji provjeravas prema PR-u (docs/agents/README.md).
1. Pokreni skriptu za PR svakih 5 minuta.
2. Izlaz 1: cekaj sljedeci krug.
3. Izlaz 2: javi implementatoru ili vlasniku tocno sto blokira; ne popravljaj sam tudju granu.
4. Izlaz 0 ili zatvoren PR: zaustavi petlju za taj PR.
5. Nakon spajanja (izlaz 0) pokreni `node scripts/worktree-gc.mjs --apply`: uklanja worktreeove
   koji su spojeni u master, cisti i bez gate locka; ostale ispisuje s razlogom i ne dira.

# Supabase backend

Ove upute vrijede za `supabase/**`. Globalna pravila iz root `CLAUDE.md` i dalje vrijede.

## Opseg

Analiza dokumenta ostaje u pregledniku. Backend se koristi za placeni popravak,
provjeru izvora, narudzbe, waitlist, rokove, podsjetnike i povezane produkcijske tokove.
Kod ovdje obraduje novac, tudje dokumente i pravo pristupa, pa su runtime dokaz i
least-privilege vazniji od pretpostavke iz samog koda.

## Migracije

Migracije se nad Lektinim bazama primjenjuju iskljucivo s `supabase db push`.
MCP `apply_migration` se ne koristi jer stvara drugi identitet migracije. Iznimka je
samo baza koja se smije baciti.

Svaka migracija mora biti idempotentna, primjerice `if not exists` ili
`drop ... if exists` prije `create`. Prije deploya provjeri:

```bash
npm run migration-identity
npm run deploy-drift
```

Stanje usporeduj po imenu migracije, ne samo po verziji. Upute za oporavak su u
`docs/deploy/MIGRATION_IDENTITY.md`.

## Edge Functions

- `npm run check` ukljucuje `npm run check:edge` i zahtijeva Deno.
- Deno provjera se ne preskace; TypeScript `tsconfig` pokriva samo `src/`.
- Ne iznosi service-role kljuceve ili interne podatke u klijent.
- CORS, retenciju, kvote i pravila pristupa potvrdi runtime dokazom, ne samo citanjem koda.
- Dokument ide na server samo za eksplicitno trazeni popravak. Provjera izvora je
  zaseban poziv, a status pozadinske pohrane mora ostati istinit.

## Deploy disciplina

Promjena migracije ili Edge funkcije nije gotova samo zato sto lokalni build prolazi.
Provjeri identitet migracija, deploy drift, relevantni DB smoke i produkcijski smoke.
Ne tvrdi da je dashboard postavka ukljucena bez izravnog dokaza iz ciljanog projekta.

Netrivijalna promjena sigurnosne granice trazi adversarijalni pregled drugog alata.

# Agent verification

Ovaj dokument cuva detaljno obrazlozenje globalne verifikacijske discipline.
Operativni minimum ostaje u root `CLAUDE.md`.

## Tri odvojena pitanja

1. `npm run orphan-scan`: moze li cisti checkout uopce izgraditi commitane ovisnike.
2. `npm run check`: prolazi li trenutno izolirano radno stablo.
3. `npm run master-ci`: je li udaljeni master zelen, crven ili nepoznat.

Jedan rezultat ne zamjenjuje drugi. Puni gate cita se iz stvarnog zavrsnog sazetka,
osobito Vitest retka `Test Files`.

## Minimalni ugovor novog garda

- Nemutirani baseline mora biti cist.
- Poznati kvar mora biti uhvacen mutacijom.
- Mehanizam mora imati vlastiti brojac ili drugi izravan signal.
- Generator mora dokazati da proizvodi ciljani oblik.
- Djelomican neuspjeh pipelinea mora oboriti cijelo mjerenje.
- Nalazi se usporeduju po identitetu, ne samo po zbroju.

## Okolina je dio dokaza

Prije regeneracije usporedi pokrivenost i dostupnost citaca. Tekstualne usporedbe
normaliziraju CR prema Git blobu. JSON se parsira. Korpusne metrike navode i ukupan
broj dokumenata i lokalni opseg. Kad je stroj pod pritiskom memorije, dokaz se
seli na CI umjesto da se prekid proglasi prolazom.

Povijesni primjeri zbog kojih ova pravila postoje sacuvani su u
`docs/incidents/CLAUDE_V1_FULL_CONTEXT_2026-09-18.md`.

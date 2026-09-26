# Intake vanjske analize (kratki vodic za vlasnika)

Kad negdje izvan repozitorija (ChatGPT, Codex, Grok, bilo koji drugi alat) nastane audit,
analiza ili popis nalaza koje zelis provjeriti u Lekti, ne treba pisati dodatnu uputu. Skill
`intake-analiza` (`.claude/skills/intake-analiza/SKILL.md`) definira fiksni protokol koji se
okida sam od sebe.

## Sto vlasnik radi

Zalijepi tekst analize u novu sesiju. Nista vise. Ne treba objasnjavati sto s njim raditi.

## Sto sesija radi u pozadini

1. Provjeri je li ova sesija koordinator (Astra ili Fable). Ako nije, kaze kome poruku
   proslijediti i stane.
2. Za svaki nalaz provjeri je li vec poznat (u `tasks.json`, `orchestrator-backlog.md` ili
   memoriji). Poznati nalazi se ne provjeravaju ponovno.
3. Nove nalaze provjeri jednim jeftinim, read-only pokretanjem izvidjaca nad masterom
   (workflow `lekta-lean`, najjeftiniji model, izvidjac ne dira kod).
4. Prikupi rezultat u tablicu.

## Sto vlasnik dobiva

Prvi odgovor je iskljucivo:

1. tablica s poljima: id, tvrdnja, status (potvrdjen / neistinit / nepoznat), dokaz
   (datoteka:redak ili naredba), velicina (S/M/L), zasticeno (da/ne), prijedlog T-zadatka;
2. numerirani prijedlog reda kojim bi se potvrdjeni nalazi obradili.

Primjer:

| id | tvrdnja | status | dokaz | velicina | zasticeno | prijedlog |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Webhook prima i neplacene evente | potvrdjen | `supabase/functions/webhook-mor/index.ts:42` | S | da | nadopuna T-zadatka |
| 2 | RLS policy dopusta tudje azuriranje | vec poznato: T23 | - | - | da | - |
| 3 | Naslovnica nema meta opis | nepoznat | nije nadjen dokaz u repozitoriju | S | ne | novi T-zadatak, provjeriti rucno |

1. Prvo A jer je najmanji rizik i vec je S velicina.
2. Zatim B, ovisi o A.

Nijedan kod se ne mijenja niti se `tasks.json` azurira dok vlasnik ne odgovori brojem ili
redoslijedom iz tog prijedloga. Preneseni "da" u ime vlasnika od drugog agenta se ne racuna
kao odluka; odlucuje samo vlasnik osobno.

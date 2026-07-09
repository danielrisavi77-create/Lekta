# data/tools/citation-configs.json

## Kako se stil citiranja odreduje (derivacija iz profila)

Generator citatnih alata (`scripts/generate-citation-tools.mjs`) NE autorira stil po
fakultetu rucno. Stil se DERIVIRA iz glavnog registra:

1. `data/profiles/verified-profiles.json` -> `rules.recommendedCitation` (token stila po
   profilu, npr. `harvard`, `apa7`, `ieee`, `vancouver`, `chicago-notes`, `pravo-fusnote`).
2. `src/citations/citation-meta.ts` -> token preslikan u oznaku i nacin (`mode`).
3. `src/citations/citation-web.ts` -> `engineStyleFor(token)` bira engine stil, a
   `src/tools/citation.ts` (isti testirani motor) stvarno sastavlja citat
   (autor-godina / fusnota / ieee / vancouver).

Fakultet u alatu ima onoliko stilova koliko ih njegovi profili stvarno koriste (veliki
fakulteti se razlikuju po odsjeku, npr. FFZG: Harvard + Chicago + APA7). Fakulteti s
tokenom `custom` ili bez tokena NE dobivaju izmisljen format, nego stranicu koja posteno
vodi na opci generator (`/citat.html`) i upute mentora.

Ovo je "mapping skripta iz glavnog registra" koju je ranija verzija ostavljala kao buduci
korak; sada je primarni izvor. Sprega je jednosmjerna i uska: generator cita samo
`recommendedCitation` token, ne cijeli engine format, pa promjena analizatora ne moze tiho
pokvariti javnu stranicu.

## Ova datoteka (`citation-configs.json`)

Rezervirana za BUDUCE RUCNE IZNIMKE (npr. custom fakultet kojem stil nije u profilima).
Pocinje i ostaje `[]` dok ne zatreba. Mora biti JSON niz; generator ju za sada samo
validira (ne primjenjuje override). NE popunjavaj je izmisljenim ni pretpostavljenim
stilom: isto nacelo kao `VERIFICATION_PIPELINE.md` i glavni registar, unos postoji tek kad
je stil STVARNO potvrden protiv sluzbenog izvora tog fakulteta.

Kad override zatreba, prvo ozici primjenu u generatoru (merge preko derivirane mape) pa tek
onda dodaj unos; do tada je namjerno inertna.

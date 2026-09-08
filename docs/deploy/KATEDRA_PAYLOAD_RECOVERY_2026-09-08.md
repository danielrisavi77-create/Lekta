# Katedra: izvor i autoritet brisanja privremenog sadrzaja

Opseg je canonical baza Academic Suitea. Nema promjene DOCX analize, popravka,
profila ili generiranja sadrzaja. Nema produkcijskog deploya ni aktivacije.

## Izmjerena razlika

Lekta staging `bnyemcnsphlitjradrst` ima migraciju verzije `20260822063559`, imena
`0086_agent_snapshot_privacy_and_cleanup`, koje nema u masteru `f1a67234`.
Masterova `0086` je `academic_audit_insert_grants`. Citanje izvornog SQL-a iz
staging dnevnika i stvarnih funkcija potvrdilo je dodatne consent/cleanup stupce
i deset funkcija. Broj prefiksa sam nije identitet.

`0104_agent_snapshot_privacy_and_cleanup.sql` vraca taj SQL iz dnevnika, bez
promjene tijela. Zaglavlje biljezi porijeklo. Datoteka je inicijalizirana CLI-jem
i numerirana prema obaveznom cetveroznamenkastom ugovoru repozitorija.
Postojeci test numeriranja odbio je timestamp imena; test nije oslabljen.

`0105_agent_payload_deletion_authority.sql` zatvara dvije rupe tog ugovora:

- autentificirani klijent mogao je sam upisati `content_deleted_at` preko
  finalizatora runa/racuna, bez izvrsenog brisanja objekta;
- stari tombstone (`deleted_at`, bez `deletion_requested_at`) nije ulazio u
  oporavak do isteka, pa neuspjelo brisanje nije bilo pravodobno ponovljeno.

Finalizatori sada traze serversku ulogu i u privilegijama i u tijelu funkcije.
Korisnik zadrzava zahtjev za brisanje svojeg sadrzaja. Serverski postupak mora
najprije dobiti uspjeh Storage API-ja, zatim potvrditi samo uspjesno obrisane
manifest ID-eve. SQL oznaka nije zamjena za uklanjanje objekta: to zahtijeva
[Storage API](https://supabase.com/docs/guides/storage/management/delete-objects).

## Dokaz i granice

`scripts/agent-payload-cleanup-smoke.sql` ucitava stvarne migracije nad minimalnim
ulaznim tablicama u bacivom PostgreSQL-u, koristi stvarne role/funkcije i zavrsava
rollbackom. Dokazuje odbijanje klijentske finalizacije, zabranu tudjeg zahtjeva,
oporavak starog tombstonea, ponovni pokusaj, djelomicno dovrsenje, idempotenciju
i nepromijenjen tudji manifest. Obje migracije primjenjuju se dvaput.

Bez `0105` test stvarno pada na `AUTH_FINALIZE_ALLOWED`; s njom ispisuje
`AGENT_PAYLOAD_CLEANUP_SQL_PASS`. CI db-smoke vrti i tu negativnu kontrolu kroz
`agent-payload-cleanup-mutation-check.sh`, pa izostanak zastite ne moze biti PASS.
Lokalno je isti prosireni SQL izvrsen na PostgreSQL-u 17.10; CI koristi PostgreSQL
16 i psql. Nema tvrdnje da taj test poziva stvarni Supabase Storage servis.

Lokalni `npm run check`: exit 0; 25 Edge funkcija prolazi Deno provjeru,
499 test datoteka prolazi, 1 je preskocena; 5755 testova prolazi, 2 su preskocena;
Vite build prolazi. `npm run orphan-scan` je cist. Audit bez razvojnih ovisnosti
vraca nula ranjivosti; puni install audit ima 36 razvojnih/transitivnih nalaza.
Ovisnosti nisu mijenjane ovim zahvatom.

Staging CLI link uspijeva. Stvarni `supabase db push --linked --dry-run
--skip-vault` vraca `LegacyDbPushMissingLocalError` zbog starih timestamp verzija.
Nista nije primijenjeno. CLI-jev automatski prijedlog za masovni migration repair
nije izvrsen; treba ocuvati i usporediti izvorni dnevnik prema postupku nize.

## Deploy redoslijed, jos nije izvrsen

1. Uskladiti staging migracijski dnevnik prema postupku MIGRATION_IDENTITY.md,
   uz usporedbu imena i tijela. Postojeci `20260822063559` odgovara novoj `0104`;
   ne umetati drugi redak za isti zahvat i ne mijesati ga s izvornom `0086`.
2. Pripremiti serverski consumer koji fizicki brise preko Storage API-ja te
   potvrdu izvodi privilegiranom klijentu. Stari klijentski finalizatori nakon
   promjene ispravno dobiju zabranu; to mora biti koordinirano.
3. `supabase db push --dry-run`, pregled tocnog popisa, zatim canonical CLI push
   na staging. Ne koristiti MCP apply_migration. Nikad deployati samo `0104`.
4. Izvesti stvarni Storage/RPC oporavak i provjeru zabrana nad synthetic staging
   objektima. Uspjesan lokalni SQL nije dokaz fizickog brisanja.

Ostaju zasebni dijelovi aktivnog cilja: verzionirana atomska zamjena konteksta,
oporavak neregistriranih objekata, trajni billing reconciliation, odluka o
privremenom sadrzaju, institucionalni dokazi i autentificirani release gateovi.

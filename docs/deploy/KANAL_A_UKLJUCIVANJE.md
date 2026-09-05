# Kanal A: ukljucivanje na produkciji (runbook, 2026-09-05)

Vlasnik je 2026-09-05 rekao "ukljuci ga". Sesija je izmjerila stanje i utvrdila da ukljucivanje NIJE jedan potez
nego cetiri, od kojih dva trazi vlasnik osobno (lozinka baze, odluka o izdanju). Ovo je tocan redoslijed s
izmjerenim stanjem; brojke su iz `npm run migration-identity` i `npm run deploy-drift` tog dana.

## Izmjereno stanje prije ukljucivanja

| sto | stanje |
|---|---|
| produkcija (`zrrjttizjyfcxmcpgzml`) | ACTIVE_HEALTHY, eu-central-1 |
| staging (`Lekta staging`) | INACTIVE (uspavan); `migration-identity` na njemu pada s timeoutom dok se ne probudi |
| migracije: repo 102, u bazi 99, poklopljeno po imenu 95 | **nedostaje 7**: `0096` do `0101` (tudje, cekaju izdanje) i `0102_corpus_contributions` (Kanal A) |
| migracije samo u bazi (nema ih u repou) | 4 (`sprint_engine_i_narudzbe`, `stavka_crm_leadovi`, `stavka_leadovi_email_nullable`, `stavka_revoke_trigger_fn_execute`), timestamp verzije |
| dvaput primijenjene | 0 (uskladjivanje identiteta iz `MIGRATION_IDENTITY.md` je odradjeno za stare) |
| `repair-docx` deployan | verzija 27; repo grana nosi v28 s Kanalom A I s tudjim popravcima od 2026-08-23 |
| funkcije samo u repou (nisu deployane) | 7: `client-error`, `field-render`, `integrity-check`, `preflight-result`, `preflight-start`, `process-bonus-outbox`, `withdraw-corpus-contribution` |

## Zasto sesija nije ukljucila sama

1. **Migracija trazi lozinku baze.** `supabase db push` ide izravno na Postgres; lokalno postoje samo
   `SUPABASE_ACCESS_TOKEN`, `LEKTA_PROD_REF` i `LEKTA_STAGING_REF` (`.env`), lozinke baze nema. MCP
   `apply_migration` je zabranjen (CLAUDE.md, MIGRATION_IDENTITY.md). Rucno lijepljenje SQL-a u editor bi
   napravilo istu stetu kao MCP: zahvat bez retka u `schema_migrations`.
2. **`db push` bi primijenio SEDAM migracija, ne jednu.** `0096` do `0101` su tudje i cekaju svoje izdanje
   (dvije od njih imaju i nedeployane funkcije: `client-error`, `process-bonus-outbox`). Sve su idempotentne po
   pravilu, ali to je izdanje tudjeg rada, dakle odluka, ne mehanika.
3. **Redeploy `repair-docx` je izdanje.** v28 nosi i tudje popravke motora od v27; ukljucivanje Kanala A bez toga
   ne ide, jer grana Kanala A zivi u istoj funkciji.
4. **Klijentska zastavica ne smije prije baze.** Da se kucica pojavi dok tablice nema, korisnik bi dao privolu, a
   pohrana bi tiho padala (fail-open). Zato `corpusContribution` ostaje `false` dok koraci 1 i 2 ne prodju.

## Izvedeno 2026-09-05 (vlasnik: "napravi ti to sve")

| korak | stanje |
|---|---|
| 2. funkcije na produkciji | IZVEDENO: `repair-docx` v27 -> v29 (nosi i tudje popravke motora s grane od 2026-08-23), `withdraw-corpus-contribution` v2; obje bootaju i dolaze do vlastite auth provjere (`{"error":"unauthorized"}` s anon kljucem), `deploy-drift` vise ne navodi `withdraw-corpus-contribution` |
| 3. tajna na produkciji | IZVEDENO: `CORPUS_CONTRIBUTION_ENABLED=1` (`secrets set`, count 1). Bez ucinka dok klijent ne salje `corpusConsent`, a bez tablice bi pohrana tiho padala (fail-open), pa klijentska zastavica ceka korak 1 |
| 1. migracija 0102 (i 0096 do 0101) | CEKA VLASNIKA: `db push` trazi lozinku baze. Predaja bez lijepljenja u razgovor: upisati `SUPABASE_DB_PASSWORD=...` u `.env` (gitignoriran, isti kao za token), pa sesija vrti `npx supabase db push --db-url` ili `link -p` + `db push`, s `--dry-run` prvo |
| 4. klijentska zastavica | CEKA korak 1 |
| 5. smoke | CEKA korake 1 i 4 |
| 6. dohvat | CEKA prve priloge |

Usput izmjereno: `health` na produkciji javlja `degraded`, `dependencies.database.ok: false, http_401`, i PRIJE ovog
deploya (`health` je v8, nije diran). Nije istrazivano; zaseban nalaz.

## Redoslijed (tko sto radi)

1. **Vlasnik, baza (produkcija):**

   ```text
   npx supabase link --project-ref zrrjttizjyfcxmcpgzml      # trazi lozinku baze
   npx supabase db push --dry-run                            # mora nabrojati TOCNO 0096..0102
   npx supabase db push
   npm run migration-identity                                # nedostaje mora pasti na 0, "samo u bazi" ostaje 4
   ```

   Ako CLI odbije zbog 4 verzije koje postoje samo u bazi ("remote migration versions not found"), NE brisati ih:
   to su tudje zive izmjene. Koristiti `supabase migration repair` prema uputi CLI-ja samo za te cetiri verzije,
   uz snimku dnevnika prije (`select version, name from supabase_migrations.schema_migrations`).

2. **Sesija ili vlasnik, funkcije (token dovoljan):**

   ```text
   npx supabase functions deploy repair-docx --project-ref zrrjttizjyfcxmcpgzml
   npx supabase functions deploy withdraw-corpus-contribution --project-ref zrrjttizjyfcxmcpgzml
   npm run deploy-drift                                      # withdraw-corpus-contribution nestaje s popisa
   ```

3. **Sesija ili vlasnik, tajna (token dovoljan), TEK NAKON koraka 1:**

   ```text
   npx supabase secrets set CORPUS_CONTRIBUTION_ENABLED=1 --project-ref zrrjttizjyfcxmcpgzml
   ```

   `CORPUS_CONTRIBUTION_DAILY_CAP` je neobavezan (zadano 200).

4. **Sesija, klijent:** `corpusContribution:true` u `DEFAULT_PRODUCTION_CONFIG` (`src/config/production-config.ts`),
   provjeriti `tests/ux/repair-panel.spec.ts:104` (prag broja interaktivnih elemenata, kucica dodaje jedan), puni gate,
   push, merge na master. **Vlasnik:** objava na Netlifyju (auto-publishing je zakljucan).

5. **Smoke (vlasnik ili sesija s racunom s e-mailom):** jedan sinteticki rad kroz "Popravi sve" s oznacenom kucicom;
   odgovor nosi `corpusContribution: 'pending'`; nakon minute u tablici `corpus_contributions` postoji redak s
   `pseudonymization.leaks = 0`, u bucketu `corpus` datoteka bez korisnickog identiteta u stazi; "Moji popravci"
   pokazuje gumb povlacenja; povlacenje brise datoteku i postavlja `withdrawn_at`.

6. **Vlasnik, dohvat:** `npx vite-node scripts/corpus-pull.mts -- --out C:/Users/PC/Desktop/Lekta-korpus/04-prilozi --dry-run`,
   pa bez `--dry-run`; dalje isti dedupe i mjerenje kao za `03-ingest`.

## Staging

Staging je uspavan i MIGRATION_IDENTITY.md korak 5 trazi da se izgradi iznova iz produkcije prije nego se na njega
racuna. Smoke Kanala A na stagingu zato nije bio moguc ovog dana; ako se staging probudi i uskladi, koraci 1 do 3
vrijede i za njega s `LEKTA_STAGING_REF`, i tada ide PRIJE produkcije.

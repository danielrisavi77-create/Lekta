# Preflight deploy runbook (poslužiteljski stup)

Trajni zapis plana i svih otkrića za deploy preflight servisa ("Provjera prije
predaje"). **ODGOĐENO** dok se lokalni proizvod ne dovede do objave (odluka vlasnika,
2026-07-16). Kod je gotov, remediran i zelen — ovo je "pritisni play kad budeš spreman".

> **Stvarno stanje 2026-08-17: preflight je UGAŠEN u produkciji.** Audit je otkrio da su
> `preflight-start` i `preflight-result` sve vrijeme bile ACTIVE Edge funkcije na
> produkcijskom projektu, dok je ovaj dokument tvrdio da je stup odgođen. Frontend ih
> nikad nije zvao (`src/preflight/preflight-client.ts` nema nijednog pozivatelja i nema
> konfiguriranih URL-ova), pa su bile čista izložena površina bez ijednog korisnika.
> Obje su undeployane (`supabase functions delete`), čime ovaj runbook postaje istinit.
> Prije ponovnog paljenja moraju biti ispunjeni uvjeti iz odjeljka "Preduvjeti", a k tome
> i dva koja audit dodaje: CSP u `public/_headers` mora dopustiti host Python servisa
> (danas bi `connect-src` blokirao upload), a `isValidPreflightConsent` mora provjeravati
> kanonski tekst privole, ne samo tipove polja.

## Status koda (2026-07-16)
- Preflight kod merged u master (feature/preflight, 1ab5144) — Edge funkcije, klijent,
  tier-filter, Python servis.
- Sigurnosni audit 2026-07-16 (58 nalaza) remediran: glavni repo `cf38fb0`,
  lekta-pipeline `44d99db`. `npm run check` exit 0, pytest zeleno.
- AUD-17 migracijska kolizija popravljena (0008/0009 → 0020/0021).
- **Prvi deploy NE treba korpus.db**: `LEKTA_CORPUS_INDEX` prazan = M4 uredno ugašen
  (NullCorpus). Full-text/M4 se pale kasnije (vidi scripts/vm-backfill/ u lekta-pipeline).

## Arhitektura (KLJUČNO za deploy)
```
PREGLEDNIK --POST meta+privola,JWT--> EDGE preflight-start --> POSTGRES (INSERT pending)
           <--{jobId, uploadUrl, uploadToken}--
PREGLEDNIK --PUT .docx IZRAVNO na Python servis (uploadUrl = SERVICE_URL + /v1/check,
            octet-stream + HMAC u X-Lekta-Token)--> [Python obradi SINKRONO u uploadu:
            guard -> tmp -> build_report -> unlink -> INSERT result_full+kpi -> done]
PREGLEDNIK --poll--> EDGE preflight-result --> TIER FILTER (TS) --> {status, report FILTRIRAN}
```
**Posljedica: Python servis MORA imati javni HTTPS** (preglednik na HTTPS stranici
lektahr.netlify.app blokira PUT na goli http://IP — mixed content). Zato VM treba
reverse proxy s TLS-om (Caddy + hostname), ne samo uvicorn na IP-u.

## Odluke vlasnika
- **Python host: Hetzner VM** (isti provider ko backfill), uvicorn iza Caddy HTTPS.
  Alternativa ako TLS na VM-u smeta: Fly.io / Cloud Run daju HTTPS URL automatski.
- Prvi deploy bez korpus.db (M4 skriven, `STUDENT_HIDDEN_MODULES`).
- Soft-launch: kill switch `PREFLIGHT_DISABLED`, niski capovi, E2E prije objave.

## Inventar tajni (gdje što ide)

Generiraj ticket secret na deploy (mora biti IDENTIČAN na dva mjesta):
```bash
openssl rand -hex 24        # ili: python -c "import secrets; print(secrets.token_hex(24))"
```

**Python servis (VM, env za `lekta-server`):**
| var | obavezno | vrijednost |
|---|---|---|
| `LEKTA_TICKET_SECRET` | DA (≥32) | ticket secret (= Edge PREFLIGHT_UPLOAD_SECRET) |
| `SUPABASE_URL` | DA | https://zrrjttizjyfcxmcpgzml.supabase.co |
| `SUPABASE_SERVICE_ROLE_KEY` | DA | dashboard → Project Settings → API → service_role |
| `LEKTA_CONTACT_EMAIL` | preporuka | danielrisavi77@gmail.com (Crossref polite pool) |
| `LEKTA_CORPUS_INDEX` | NE (prazno) | prazno = M4 off; put do korpus.db kad se pali M4 |
| `NCBI_API_KEY` | ne | PubMed rate (3→10 req/s) |
| `LEKTA_ALLOWED_ORIGINS` | ne | default već uključuje lektahr.netlify.app |

**Edge preflight-start (supabase secrets set):**
| var | obavezno | vrijednost |
|---|---|---|
| `PREFLIGHT_SERVICE_URL` | DA | HTTPS URL VM-a (npr. https://lekta-preflight.duckdns.org) |
| `PREFLIGHT_UPLOAD_SECRET` | DA | = LEKTA_TICKET_SECRET |
| `IP_HASH_SALT` | već postavljen | koriste ga i druge funkcije |
| `PREFLIGHT_DISABLED` | ne | "1" = kill switch |
| `PREFLIGHT_DAILY_CAP_USER` / `_IP` / `PREFLIGHT_MAX_UPLOAD_MB` / `_MAX_REFS` | ne | capovi |

`SUPABASE_URL` i `SUPABASE_SERVICE_ROLE_KEY` Supabase automatski ubrizgava u Edge (ne postavljati ručno).

**Edge preflight-result:** `PREFLIGHT_REQUIRE_ENTITLEMENT` (ne za soft-launch).

**Klijent (`DEFAULT_PRODUCTION_CONFIG` u src/ui/app.ts, ili ?setup=1):**
| ključ | vrijednost |
|---|---|
| `preflightStartEndpoint` | https://zrrjttizjyfcxmcpgzml.supabase.co/functions/v1/preflight-start |
| `preflightResultEndpoint` | https://zrrjttizjyfcxmcpgzml.supabase.co/functions/v1/preflight-result |
| `preflightMaxUploadMb` | 30 |

## Faze deploya (redoslijed bitan)

### F1 — Supabase (glavni repo, Git Bash)
```bash
cd "/c/Users/PC/Desktop/Lekta"
npx supabase login
npx supabase link --project-ref zrrjttizjyfcxmcpgzml     # traži DB password
npx supabase migration list                              # READ-ONLY: provjeri stanje
```
**VAŽAN OPREZ — dvije razdvojene migracijske loze (utvrđeno 2026-07-16):** živi projekt
`zrrjttizjyfcxmcpgzml` ima SAMO 5 migracija, sve s **timestamp verzijama** (`20260709…`,
waitlist + rokovi), i NIJEDNU numeriranu `0001-0021`. Znači cijeli numerirani set (uklj.
0019_preflight) NIKAD nije primijenjen na produkciju. `db push` bi pokušao primijeniti
svih 0001-0021 povrh 5 timestamp migracija → moguć sukob (tablice koje timestamp loza već
ima). Zato `db push` NIJE čist apply; prvo `migration list` pa **uskladi loze**
(vjerojatno: repair/baseline numeriranog seta ili selektivan push samo preflight objekata).
NE pushaj naslijepo. Kad je stanje razriješeno:
```bash
npx supabase db push                                     # kreira preflight tablice + RLS + purge
```

### F2 — Python servis na Hetzner VM (uvicorn + Caddy HTTPS)
1. VM: Hetzner CX22, Ubuntu 24.04, EU (ko backfill; vidi lekta-pipeline/scripts/vm-backfill).
2. Prijenos + instalacija:
   ```bash
   # laptop: git archive iz lekta-pipeline
   cd "/c/Users/PC/Desktop/Lekta/lekta-pipeline" && git archive --format=tar.gz -o /tmp/lekta-src.tar.gz HEAD
   scp -i ~/.ssh/lekta_vm /tmp/lekta-src.tar.gz root@VM_IP:/opt/
   # VM:
   apt update && apt install -y python3 python3-venv python3-pip caddy
   mkdir -p /opt/lekta && cd /opt/lekta && tar xzf /opt/lekta-src.tar.gz
   python3 -m venv .venv && . .venv/bin/activate && pip install ".[server]"
   ```
3. Env + servis (systemd, uvijek upaljen). `/etc/lekta-preflight.env`:
   ```
   LEKTA_TICKET_SECRET=...      SUPABASE_URL=https://zrrjttizjyfcxmcpgzml.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=...   LEKTA_CONTACT_EMAIL=danielrisavi77@gmail.com
   ```
   systemd unit pokreće `lekta-server` (uvicorn na 127.0.0.1:8080), `EnvironmentFile=/etc/lekta-preflight.env`.
4. HTTPS: besplatni hostname (DuckDNS subdomena → VM_IP; DuckDNS je na PSL-u pa LE rate-limit ok).
   `/etc/caddy/Caddyfile`:
   ```
   lekta-preflight.duckdns.org {
       reverse_proxy 127.0.0.1:8080
   }
   ```
   `systemctl reload caddy` → automatski Let's Encrypt cert. Otvori firewall 80/443.
5. Provjera: `curl https://lekta-preflight.duckdns.org/v1/health` → ok.

### F3 — Poveži (Supabase secrets + deploy funkcija)
```bash
cd "/c/Users/PC/Desktop/Lekta"
npx supabase secrets set PREFLIGHT_SERVICE_URL="https://lekta-preflight.duckdns.org" \
                         PREFLIGHT_UPLOAD_SECRET="<ISTI ticket secret>"
npx supabase functions deploy preflight-start preflight-result
```
(config.toml već ima `verify_jwt = true` za obje.)

### F4 — Klijent
Upiši `preflightStartEndpoint` + `preflightResultEndpoint` u `DEFAULT_PRODUCTION_CONFIG`
(src/ui/app.ts, oko linije 80), `npm run check`, pa Netlify deploy (build → dist/).

### F5 — E2E test
Pravi .docx kroz preglednik → kartice po modulu. Provjeri u Network tabu da studentski
odgovor NE sadrži RSID/TotalTime (tier filter). Provjeri kill switch (`PREFLIGHT_DISABLED=1`).

## Preostali audit nalazi (follow-up, ne blokiraju soft-launch)
- AUD-27: per-IP atomic cap (TOCTOU) svjesno odgođen za pre-scale; drži partial-unique
  index (1 pending/running po useru) + COUNT capovi + kill switch.
- Cross-cutting: fail-open pg_cron obrazac u starim migracijama 0009/0011/0016 (0018/0019 fail-closed).
- AUD-52 (devDeps deploy rizik), AUD-54 (bundle guard Info).

## VANJSKI launch gate-ovi za poslužiteljski stup (NISU kod — riješiti prije primanja tuđih dokumenata)
- Pravni subjekt (obrt/tvrtka) za obradu podataka.
- DPA / ugovor o obradi (izvršitelj = hosting Python servisa, imenovati pri deployu).
- Merchant of Record (ako/kad naplata).
- PITR backup na Supabase.
- Privola/copy konzistentnost: tekst mora istinito reći da preflight ŠALJE dokument na
  EU poslužitelj (za razliku od lokalne analize koja ne šalje ništa).

## Reference
- Plan (pun): `.claude/plans/jolly-wobbling-axolotl.md`
- Kod: `src/preflight/*`, `supabase/functions/preflight-{start,result}/`,
  `supabase/migrations/0019_preflight.sql`, lekta-pipeline `lekta_pipeline/server/*` + `Dockerfile`.
- M4/full-text (kasnije): lekta-pipeline `scripts/vm-backfill/README.md`.

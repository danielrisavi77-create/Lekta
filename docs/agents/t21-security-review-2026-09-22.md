# T21 sigurnosni i autorizacijski pregled, 2026-09-22

## Presuda

**T21 je pregledom pokriven, ali kandidat je NO-GO za javno izdanje dok se ne zatvore
tri dokazna bloka navedena niže.** U ovom prolazu nije potvrđeno čitanje, izmjena ili
brisanje tuđih podataka, zaobilaženje prava, CORS proboj ni neograničena obrada.
Presuda NO-GO opisuje spremnost izdanja, ne dokaz da je postojeća zaštita probijena.

Pregled je read-only. Produkcija, staging shema, migracije, Storage i Auth postavke nisu
mijenjani.

## Identitet i granice dokaza

- Pregledani commit: `6a91f630f97297b45724fca22cd505464d18f252`, worktree `agent/t20-edge-config`.
- Staging projekt iz ranijeg dokaznog zapisa: `bnyemcnsphlitjradrst`.
- Produkcijski projekt koji koristi javni frontend: `zrrjttizjyfcxmcpgzml`.
- Svježi HTTP dokazi u ovom zapisu izvedeni su 2026-09-22.
- Detaljni DB advisor, RLS i cross-user negativni testovi iz 2026-09-21 ostaju valjan
  povijesni dokaz u `t21-security-evidence-2026-09-21.md`, ali nisu ponovno dohvaćeni:
  postojeći `SUPABASE_ACCESS_TOKEN` sada vraća HTTP 401 na Management API i `supabase` CLI.
  Zbog toga se današnji zapis ne predstavlja kao svježi presjek baze.
- `health` staginga 2026-09-22 vraća `database.ok=true`, ali `release=null` i `commit=null`.
  Javni frontend nema `build-info.json`. Ne može se dokazati da javni artefakt odgovara
  pregledanom commitu.

## Javni frontend i zaglavlja

`https://lektahr.netlify.app/` vraća HTTP 200 i sljedeća zaglavlja:

| Zaglavlje | Rezultat |
|---|---|
| Content-Security-Policy | prisutan; `connect-src` ograničen na produkcijski Supabase, Crossref i DOI |
| Strict-Transport-Security | `max-age=31536000; includeSubDomains; preload` |
| X-Content-Type-Options | `nosniff` |
| X-Frame-Options | `DENY` |
| Referrer-Policy | `strict-origin-when-cross-origin` |
| Permissions-Policy | camera, microphone, geolocation i payment isključeni |

Zaglavlja su dobra obrana u dubinu. Ipak, deployani CSP i HSTS nisu dokazani iz istog
izvora kao repo: `public/_headers` u pregledanom commitu nema `preload`, a javni odgovor
ga ima. To je deploy drift koji T19 mora zatvoriti build-info identitetom.

## CORS i Edge auth, svježe HTTP probe

Staging preflight rezultati:

| Funkcija | Origin | Ishod |
|---|---|---|
| `profile-rules` | `https://lekta-staging.netlify.app` | 200, vraća točan `Access-Control-Allow-Origin` |
| `profile-rules` | `https://lektahr.netlify.app` | 200, bez `Access-Control-Allow-Origin` |
| `profile-rules` | `http://localhost:5173` | 200, bez `Access-Control-Allow-Origin` |
| `repair-docx` | `https://lekta-staging.netlify.app` | 200, vraća staging origin |

U svim slučajevima `Vary: Origin` je prisutan. Nema refleksije proizvoljnog origin-a.

No-token probe staginga:

| Funkcija | Zahtjev | Ishod |
|---|---|---|
| `health` | GET | 200, samo health odgovor |
| `health` | POST | 405 |
| `repair-docx` | GET | 401 |
| `delete-repair-job` | GET | 401 |
| `create-checkout` | POST `{}` | 401, nedostaje Authorization |
| `source-check` | POST `{}` | 401, nedostaje Authorization |
| `webhook-mor` | POST `{}` | 401, `invalid_signature` |
| `client-error` | POST `{}` | 200, `ignored: empty_message` |
| `unsubscribe-reminder` | POST `{}` | 400, nedostaje potpisani token |

`client-error` i `unsubscribe-reminder` su namjerno javni ulazi: prvi prima samo praznu
grešku bez korisničkog sadržaja, drugi koristi potpisani token iz e-maila. Oba su
ograničena kodom, a ne oslanjanjem na CORS.

## Privatni dokumenti, Storage i RLS

Statički pregled migracija potvrđuje da su materijali u privatnom bucketu, a putanja nosi
`user_id/project_id`; Storage politike provjeravaju `auth.uid()` i vlasništvo projekta.
RPC funkcije za payload i run imaju eksplicitne `revoke`/`grant` granice i ownership provjere.

Povijesni staging negativni testovi od 2026-09-21 dodatno su pokazali:

- anon SELECT nad `entitlements`, `document_slots`, `agent_runs`,
  `agent_payload_manifests` i `admin_users`: svih pet 401;
- anon pozivi zaštićenih RPC-ova: 401;
- korisnik A s parametrima korisnika B: sedam ownership pokušaja odbijeno SQLSTATE 42501;
- strani `can_read_agent_payload`: `false`;
- `extraction-probe`: 27 zahtjeva, ograničenje na sedmom različitom profilu, bez evidence markera.

Današnji Management API 401 onemogućuje ponovno čitanje advisora i direktni cross-user
upit. To je dokazni gap, ne nalaz propusta.

## Naplata i webhook granica

Kod `create-checkout` traži autentikaciju prije rada sa service-role klijentom. `webhook-mor`
prvo ograničava tijelo, zatim provjerava HMAC, `store_id` i `test_mode`, zapisuje inbox i
obrađuje idempotentno. `bonus_outbox` ostavlja operativni trag i ponovni pokušaj. Svježi
zahtjev bez potpisa vraća 401.

Nije izvedena pozitivna testna kupnja ni puni refund/replay tok. To je namjerno ostavljeno
za T24; T21 zbog toga ne daje tvrdnju da je cijeli komercijalni životni ciklus spreman.

## Migracijska i Auth ograničenja

- Lokalni repo ima 106 migracija. `npm run migration-identity` nije mogao dohvatiti živo
  stanje jer nije postavljen valjan `LEKTA_*_REF` i Management token je 401.
- Staging remote-only raspon `0104` do `0114` pripada Katedra sustavu. Nije diran.
  Vlasnik te granice mora ga zasebno potvrditi prije bilo kakvog migration push-a.
- Povijesni staging Auth presjek ima `password_hibp_enabled=false`; Supabase je odbio
  uključivanje jer je zaštita dostupna tek na Pro planu. Odluka za ovaj program je da se
  Pro ne uvodi. Mitigacija je jaka lozinka, reset i rate-limit politika; residual ostaje
  dokumentiran kao plan-limited, s ponovnom procjenom 2026-10-01.

## Otvorene radnje i vlasnici

| Radnja | Vlasnik | Rok / dokaz zatvaranja |
|---|---|---|
| Osvježiti Supabase read-only token i ponovno izvesti advisor, RLS i migration identity | Daniel Risavi / vlasnik Supabase projekta | prije T44; zapis s HTTP 200 i snapshotom rezultata |
| Dodati `build-info.json` i vezati javni frontend uz commit; ponoviti header/CSP provjeru | T19 | prije javnog izdanja |
| Potvrditi granicu Katedra migracija 0104 do 0114 | vlasnik Katedra sustava | prije bilo kakvog `db push` |
| Pozitivna checkout, webhook replay i refund proba | T24 | namjenska testna kupnja, točno jedno pravo i operativni trag |
| HIBP odluka ostaje plan-limited bez Pro plana | Daniel Risavi | recheck 2026-10-01 |

## Zaključak za red zadataka

T21 može prijeći u `done` kao neovisni sigurnosni pregled s presudom **NO-GO za javno
izdanje**. T22 i T24 mogu nastaviti rad na stagingu, ali T44/T46 ne smiju tvrditi spremnost
dok se ne zatvore identitet javnog artefakta, svježi DB snapshot i pozitivni komercijalni tok.

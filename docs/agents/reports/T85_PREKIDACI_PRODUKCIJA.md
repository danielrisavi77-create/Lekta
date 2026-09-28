# T85: prekidaci popravka na produkciji (kriterij 5 go/no-go T81)

Stanje 28. 9. 2026. Nalaz je napravio koordinator lekta-32 uz izricitu rijec vlasnika, samo
citanjem, bez ijedne izmjene. Izvrsitelj lekta-00 je nalaz zapisao i dio ga neovisno provjerio
(oznaceno u stupcu "Provjerio").

Datoteka ne sadrzi tajne: samo digeste koje ispisuje `supabase secrets list`. Ni javni anon kljuc
nije prepisan.

## 1. Nalaz

| Stavka | Vrijednost | Izvor | Provjerio |
| --- | --- | --- | --- |
| Produkcijski projekt | Supabase `zrrjttizjyfcxmcpgzml` | koordinator | lekta-00: `list_edge_functions` nad tim projektom |
| Deployani `repair-docx` | verzija 31, `verify_jwt=true` | koordinator | lekta-00: `list_edge_functions` (v31, `verify_jwt: true`) |
| Citanje prekidaca u kodu | `REPAIR_DISABLED` i `REPAIR_FREE_MODE` iz `Deno.env` | koordinator | lekta-00: samo na masteru (`supabase/functions/repair-docx/index.ts`, redci 71, 116 i 310); da je v31 isti izvor NIJE provjereno |
| `REPAIR_FREE_MODE` | digest `b5bea41b...` = `sha256("true")`, postavljeno 2026-07-20 | koordinator, `supabase secrets list` | lekta-00: `printf true \| sha256sum` daje `b5bea41b6c62...` |
| `REPAIR_DISABLED` | nije postavljen, dakle `false` (kod trazi tocno `'true'`) | koordinator, `supabase secrets list` | ne |
| `CORPUS_CONTRIBUTION_ENABLED` | digest `6b86b273...` = `sha256("1")` | koordinator, `supabase secrets list` | lekta-00: `printf 1 \| sha256sum` daje `6b86b273ff34...` |
| Naplatne tajne | nema Stripe ni MOR tajni; naplata inertna | koordinator, `supabase secrets list` | ne |

## 2. Sonda

- POST s anon kljucem na `/functions/v1/repair-docx` vraca HTTP 401 `{"error":"unauthorized"}`.
  To je odgovor naseg koda iza provjere prekidaca, a ne 503 `{"error":"disabled"}`, dakle popravak
  je ukljucen.
- Bez zaglavlja `Authorization` gateway vraca 401 `UNAUTHORIZED_NO_AUTH_HEADER` prije naseg koda,
  jer je `verify_jwt=true`.

Sondu je pokrenuo koordinator; izvrsitelj je nije ponovio.

## 3. Staging dokaz (27. 9. 2026., sesija c4)

Izvela sesija c4 uz izravno odobrenje vlasnika u toj sesiji, samo na stagingu
`bnyemcnsphlitjradrst`; produkcija nije dirana. Alat: Supabase CLI 2.109.1. Sonda:
`POST /functions/v1/repair-docx` s anon kljucem staginga, tijelo `{}`. Izvor: komentar na PR #201
(issuecomment-5860795538); izvrsitelj lekta-00 ga nije ponovio.

| Korak | Vrijeme (UTC) | Radnja | Ishod |
| --- | --- | --- | --- |
| 1 | 23:19:21 | `supabase secrets list` | 13 tajni; `REPAIR_DISABLED` ne postoji; `REPAIR_FREE_MODE` = `sha256("true")` |
| 2 | 23:19:48 | sonda prije | HTTP 401 `{"error":"unauthorized"}` |
| 3 | 23:20:09 | `supabase secrets set REPAIR_DISABLED=true` | postavljeno |
| 4 | 23:20:33 | sonda (oko 24 s nakon postavljanja) | HTTP 503 `{"error":"disabled"}` |
| 5 | 23:21:01 | `supabase secrets unset REPAIR_DISABLED` | uklonjeno |
| 6 | 23:21:20 | sonda nakon vracanja | HTTP 401 `{"error":"unauthorized"}` |
| 7 | odmah nakon | ponovni `secrets list` | 13 prije, 13 poslije, svi parovi ime i digest identicni |

Popravak je na stagingu bio iskljucen oko 70 sekundi. Ucinak nastupa bez redeploya.

Nije dokazano: ponasanje na produkciji (namjerno nije dirana) i eksplicitna vrijednost
`REPAIR_DISABLED=false` (testirano je samo postavljanje na `true` i uklanjanje).

## 4. Zakljucak za T81 kriterij 5

- "Stvarna vrijednost `REPAIR_FREE_MODE` procitana": da, `true` (besplatna beta).
- "`REPAIR_DISABLED` stvarno gasi popravak": da, dokazano na stagingu (odjeljak 3): 503 `disabled`
  prije provjere identiteta, a uklanjanje tajne vraca 401.

Kriterij 5 je ispunjen; T85 je `done`.

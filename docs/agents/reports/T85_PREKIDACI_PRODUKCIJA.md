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

## 3. Zakljucak za T81 kriterij 5

- "Stvarna vrijednost `REPAIR_FREE_MODE` procitana": da, `true` (besplatna beta).
- "`REPAIR_DISABLED` stvarno gasi popravak": NIJE dokazano na zivom okruzenju. Kod na masteru
  vraca 503 kad je `REPAIR_DISABLED === 'true'`, ali to nije izvedeno na deployu.

## 4. Preostali dokaz (ceka rijec vlasnika)

Na STAGINGU (`bnyemcnsphlitjradrst`), ne na produkciji:

1. postaviti `REPAIR_DISABLED=true`;
2. sonda na `repair-docx` mora vratiti 503 `{"error":"disabled"}`;
3. ukloniti `REPAIR_DISABLED`;
4. sonda mora vratiti 401 `{"error":"unauthorized"}` kao prije.

Tek tada T85 ide u `done`.

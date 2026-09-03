# Provjera plana "istinit proizvod", 2026-09-03

> Svaka tvrdnja plana IZMJERENA je ponovo. Plan je star nekoliko dana, a mjerenja ga sustavno
> pretjecu: od 17 stavki, SEDAM opisuje stanje koje vise ne postoji. Prije uzimanja bilo koje
> stavke, izmjeri je; inace se radi posao koji je vec napravljen.

| stavka | plan je tvrdio | izmjereno danas | presuda |
|---|---|---|---|
| T1 COPY-01 | FAQ tvrdi "u velikoj mjeri"; "ne iz nagadanja" | **0 pojava** oboje u `index.html` | **ZASTARJELO, gotovo** |
| T2 SCOPE-01 | ljestvica dokaza nigdje u UI-ju; pilot skupina ne postoji | `src/ui/profile-claim.ts` postoji; `data/profiles/pilot-set.json` postoji | **ZASTARJELO, uglavnom gotovo** |
| T3 RULE-01 | 26 profila nosi `ieee` | **0 profila** | **ZASTARJELO, gotovo** |
| T4 RULE-02 | 2625 pravila, 84,6 % s punim setom; 403 bez modaliteta | **1906 pravila, 86,3 % (1645)**; 261 bez modaliteta, 12 bez `verifiedHash`, 6 bez `sourcePage` | brojke druge, smjer isti; **`academicYear` je i dalje 0 %** (1906 od 1906) |
| T5 RULE-03 | u CI-ju je samo `verify:claims:selftest` | tocno, ali zavaravajuce: `verify:claims` je alat PO DATOTECI (trazi `<claims.json>`), a korpusnu provjeru radi `audit_scored_quotes.py`, koji JEST u CI-ju: **1943 revidirana, 0 nalaza, 0 neprovjerivih**. Selftest pokriva **24 osi, 83 negativne kontrole, 0 promasaja**, ukljucujuci sve koje je plan naveo kao nepokrivene | **ZASTARJELO, zatvoreno** |
| T6 EVID | `.env.corpus` nosi zivi `service_role` kljuc | **stoji**: 3 pojave, datoteka NIJE u gitu (samo lokalno) | **STOJI, P0 za vlasnika** |
| T7 UX | mobilni CTA nedostupan, 2 izuzeca | zatvoreno; ostaje WebKit, blokiran brzinom stroja | **gotovo (moje)** |
| T8 a11y | axe samo u pocetnom stanju | zatvoreno; 8 krsenja imenovano i pod ratchetom | **gotovo (moje)** |
| T9 SEC | xmldom 0.9.10 -> 0.9.11; fixturi nedostaju | vec 0.9.12; fixturi postoje; tranzitivni graf sada zakljucan i provjeren | **ZASTARJELO + dovrseno (moje)** |
| T10 parser parity | nativni `DOMParser` nikad izvrsen | izmjeren na Chromiumu, identican; WebKit neizmjeren | **gotovo za Chromium (moje)** |
| T11 REL | dokaz ima 8 razina; env varijable nedokumentirane | **9 razina, 8 prolazi**; obje varijable dokumentirane; jedina prepreka `LEKTA_STAGING_ORIGIN` | **ZASTARJELO; ceka vlasnika** |
| T12 OPS | 3 funkcije bez `verify_jwt`; manifest ne postoji | **sve 24 deklarirane**; manifest sada postoji | **ZASTARJELO + dovrseno (moje)** |
| T13 OBS | `errorEndpoint: ''`; 45 kucica neoznaceno | `errorEndpoint` vise ne postoji u toj formi (2 datoteke ga spominju); **45 kucica i dalje 0 oznaceno** | djelomicno zastarjelo; checklist **STOJI** |
| T14 COMMERCE | `packages.json` u runtimeu; 20 proizvoda bez `mor_product_id` | `packages.json` i dalje uvezen (1 datoteka); `mor_product_id` se ne spominje ni u jednoj migraciji | **STOJI** |
| T15 REPAIR | `readSet`/`writeSet`/`MutationPlan` -> 0 pogodaka | **1 datoteka** ih ima | **zapoceto** |
| T16 app.ts | 334 KB / 1977 redaka; 28 dodira `hidden` | **358 KB / 2389 redaka; 97 dodira** | **POGORSANO**, ne popravljeno |
| T17 docs | CP1252 korupcija u 3 dokumenta; 0/16 artefakata s metapodacima | korupcije **nema**; `STATUS.json` sada postoji i prvi je s provenijencijom; ostala 21 i dalje bez | djelomicno zastarjelo, djelomicno **dovrseno (moje)** |

## Sto iz ovoga slijedi

1. **T16 je jedina stavka koja je otisla unatrag.** `app.ts` je narastao za 412 redaka i 24 KB, a
   broj rucnih dodira `hidden` s 28 na 97. Plan za nju trazi ratchet PRIJE premjestanja koda; da je
   ratchet postojao, ovog rasta ne bi bilo.
2. **Cetiri stavke ceka vlasnik, ne kod**: rotacija kljuca (T6), staging origin (T11), vlasnici
   funkcija i mapiranje proizvoda (T12, T14), i presuda o `academicYear` (T4: polje postoji, nigdje
   nije popunjeno, pa je treca opcija najgora od tri).
3. **Sedam stavki je zastarjelo.** Plan se isplati osvjeziti prije nego se po njemu radi.

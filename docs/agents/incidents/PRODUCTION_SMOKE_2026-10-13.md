# Produkcijska objava i neuspjeli smoke 13. listopada 2026.

## Što se dogodilo

Workflow 38430199081 izgradio je i objavio commit f758ba2bde00c7f2d37daa789a39ed1e4168db99. Build-info je sadržavao isti commit, provjera treeDigest-a RELEASE_PROOF-a prošla je, a smoke je na produkciji prijavio 29 od 30 uspješnih provjera.

Jedina neuspjela provjera bila je dohvat JavaScript asseta /assets/indexeddb-document-session-store-CRUogcaK.js. Smoke je zabilježio fetch failed, dakle mrežni transportni neuspjeh. Ostali asseti, sedam pravnih stranica, health provjere, autentikacijska odbijanja i stroga provjera identiteta commita prošli su.

## Utjecaj i granice zaključka

Objava je završila prije smoke koraka. Povrat Edge funkcija bio je preskočen. Ne postoji dokaz o rollbacku. Jedan fetch failed ne utvrđuje je li uzrok bio prolazna mreža, CDN ili trajno nedostupan asset; za tu razliku potrebno je ponovno opažanje.

Javni build-info.json poslije objave pokazao je captchaSiteKey=false. Supabase Auth captcha nije potvrđena kao uključena.

## Sljedeće

PR B dodaje jedan retry samo za niskorazinski mrežni transportni kvar. Ako drugi pokušaj i dalje ne uspije, release smoke ostaje crven. Vlasnik prije sljedeće objave ponovno provodi završni dokaz, odabere kandidat, objavi jednom i potvrdi SHA objavljene verzije.

Izvorni zapis: [GitHub Actions run 38430199081](https://github.com/danielrisavi77-create/Lekta/actions/runs/38430199081).

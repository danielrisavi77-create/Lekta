# Plan sigurnosnog testiranja Lekta

## Pravila

- Koristiti samo staging projekt, sintetičke račune i canary tekst `LEKTA-AUDIT-CANARY-2026`.
- Ne slati stvarne radove, ne enumerirati tuđe podatke, ne raditi DoS i ne ispisivati tajne.
- Svaki test mora čistiti vlastite retke i dokumentirati ID-eve samo u zaštićenom internom evidence paketu.

## Automatizirani testovi

| Područje | Test | Očekivanje |
| --- | --- | --- |
| RLS | anon, vlasnik i drugi korisnik nad svakom tablicom | vlasnik vidi samo svoje retke, drugi i anon ne mogu čitati ni pisati |
| Puni izvještaj | promijenjeni `slotId`, `userId`, entitlement i cijena | server vraća 401, 403 ili 402, nikad tuđi izvještaj |
| Webhook | loš potpis, replay i paralelni isti order | bez entitlementa za loš potpis, samo jedan entitlement za valjan replay |
| OTP | kontrolirani limit slanja i provjere | nema enumerationa, nakon limita 429, kod nije ponovljiv |
| Preflight privola | start bez `sendsFullFile` | nema kreiranog joba ni upload propusnice |
| Preflight replay | isti HMAC token dva puta | samo jedan job prelazi u `running` |
| Preflight DOCX | krivi magic, DTD, entity, ZIP bomb, puno članova | kontrolirani 4xx bez rasta memorije |
| Integrity | paralelni teaser i full zahtjevi | atomski quota, dedup, provider timeout i audit metrika |
| Retencija | canary tekst nakon kratkog roka | `sent_text` je null, puni preflight rezultat je obrisan |
| Lokalnost | instrumentirani `fetch`, XHR, beacon, WebSocket i worker | lokalni DOCX canary se ne pojavljuje u mrežnom prometu bez posebne akcije |
| XSS | naziv datoteke, profil, bibliografija i napomena s HTML payloadom | prikaz kao tekst, CSP ne dopušta skriptu |
| HTTP | produkcijski header snapshot | CSP, HSTS, nosniff, frame zaštita, referrer i cache su očekivani |

## Ručna produkcijska provjera

1. Supabase dashboard: RLS uključeno na svim tablicama, Storage bucketi privatni ili nepostojeći, nema javnih service-role tajni.
2. Auth: production site URL i redirect allowlist, SMTP, OTP expiry, rate limit, CAPTCHA i MFA odluke evidentirani.
3. Cron: svi purge i reminder jobovi vidljivi, zadnje izvršenje uspješno, alert kanal testiran.
4. Netlify: automatski deploy isključen prema vlasničkom pravilu, preview nema produkcijske tajne, source mapovi i dev konzola nisu javni.
5. Payment: testni Lemon Squeezy događaj s ispravnim i krivim potpisom, refund i idempotency dokazani.

## Kriterij prolaza

Prije `GO` statusa svi P0 i P1 testovi moraju biti zeleni, a ručni dokazi moraju biti spremljeni izvan javnog repozitorija. Svaki P2 test mora imati vlasnika, rok i prihvatnu odluku.

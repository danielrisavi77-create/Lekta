# Threat model Lekta

## Granice sustava

```text
[neprijavljeni korisnik]
  -> [Netlify statička aplikacija]
  -> [lokalni parser i Web Worker]

[prijavljeni korisnik + JWT]
  -> [Supabase Edge funkcije]
  -> [Supabase Auth, Postgres i RLS]
  -> [Lemon Squeezy i Resend]

[preflight, uz posebnu privolu]
  -> [Edge izdaje HMAC propusnicu]
  -> [Python/Cloud Run servis]
  -> [Supabase i bibliografski API-ji]

[integrity, uz posebnu privolu]
  -> [Integrity Edge]
  -> [embedding i AI provider]
```

## Imovina i zaštitni cilj

| Imovina | Povjerljivost | Integritet | Dostupnost |
| --- | --- | --- | --- |
| DOCX i PDF radovi | vrlo visoka | visoka | srednja |
| puni tekst integrity provjere | vrlo visoka | visoka | srednja |
| rezultati i isječci | visoka | visoka | srednja |
| entitlementi i slotovi | srednja | vrlo visoka | visoka |
| JWT i refresh tokeni | vrlo visoka | vrlo visoka | srednja |
| webhook, HMAC i service-role tajne | vrlo visoka | vrlo visoka | visoka |
| pravila profila i popravljen DOCX | srednja | vrlo visoka | srednja |

## Napadači

| Akter | Mogućnost | Glavni cilj |
| --- | --- | --- |
| anonimni korisnik | javni HTML i otvorene Edge rute | spam, enumeration, DoS |
| prijavljeni korisnik | vlastiti JWT i validni zahtjevi | tuđi podaci, besplatni entitlement, API trošak |
| zlonamjerni uploader | DOCX s namjernim ZIP/XML sadržajem | rušenje servisa ili parser confusion |
| automatizirani bot | mnogo računa ili tokena | OTP, checkout i provider trošak |
| kompromitirani provider | odgovor API-ja ili dostupnost | curenje teksta, XSS, zastoj |
| osoba s deploy pristupom | tajne i konfiguracija | trajni pristup podacima |

## STRIDE po ključnim tokovima

| Tok | Prijetnja | Kontrola | Preostali rizik |
| --- | --- | --- | --- |
| OTP i sesija | krađa tokena, enumeration | Supabase Auth, CSP, refresh rotacija u lokalnom configu | dashboard rate limit, CAPTCHA i redirect allowlist nisu provjereni |
| puni izvještaj | entitlement bypass, IDOR | JWT, owner filter, serverski fingerprint, atomski slot | rate limit ovisi o računu, session je u localStorageu |
| checkout i webhook | promjena cijene, lažni webhook, replay | server čita proizvod, HMAC, unique order | checkout spam nema quota |
| preflight | replay tokena, ZIP bomb, podatkovno curenje | HMAC, DB claim, veličina i ZIP guard | memorijski burst, XML entities, cron retencija |
| integrity | slanje bez privole, provider trošak | privola, JWT, teaser cap | full nema cap ni timeout |
| podsjetnici | lažno slanje, ponavljanje | cron tajna, potpisani unsubscribe token | aktivni cron i secret rotacija nisu potvrđeni |

## Obvezni produkcijski dokazi prije lansiranja

1. Screenshot ili API dokaz RLS politika, Auth redirect URL-a, SMTP-a, CAPTCHA-e i rate limita.
2. Dokaz da se `pg_cron` jobovi za purge i reminders izvršavaju, uz alert ako preskoče rok.
3. Staging test s dva računa koji dokazuje zabranu čitanja, izmjene i brisanja tuđih redaka i rezultata.
4. Mrežni canary test koji dokazuje da lokalni DOCX ne putuje iz preglednika bez preflight privole.
5. Opterećenje unutar sigurnih granica koje dokazuje quota, queue i timeout preflight i integrity puta.

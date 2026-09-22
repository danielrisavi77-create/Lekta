# T22 racun, prijava i e-posta, dokaz 2026-09-22

## Presuda

**T22 ostaje `in_progress` i nije spreman za zatvaranje.** Lokalni kod i testovi pokrivaju
OTP, lozinku, osvjezavanje sesije, anonimnu sesiju, povezivanje e-maila i provjeru da se
identitet ne promijeni. Staging ipak trenutno ne dopusta anonimne prijave. U ovom prolazu potvrdena je stvarna dostava i
potvrda e-maila za obicni signup racun, ali nije dokazano da anonimni korisnik nakon registracije
zadrzava vlastiti rad i prava.

Konfiguracijske postavke nisu mijenjane. Izveden je jedan kontrolirani staging signup test sa
sintetskim racunom, a racun je nakon provjere ciljano obrisan. SMTP, redirect postavke, Storage i
produkcija nisu mijenjani.

## Kriterij i identitet

- Kriterij zadatka: stvarne testne poruke moraju stici na namjenske adrese, sve sesijske grane
  moraju dati ocekivani ishod, a anonimni korisnik nakon registracije mora zadrzati vlastiti rad
  i pripadajuca prava.
- Repo/worktree: `agent/t20-edge-config`, pregledani commit `c2a13df3`.
- Staging projekt: `bnyemcnsphlitjradrst`.
- Produkcijski projekt nije diran.
- Postojeci Management API token je istekao i vraca HTTP 401, pa ovaj zapis ne tvrdi da je
  procitao dashboard-only redirect listu ili SMTP detalje.

## Svjezi staging Auth probe

Početni settings probe izveden je javnim staging anon keyem, bez stvaranja korisnika i bez slanja poruke.

| Probe | Ishod |
|---|---|
| `GET /auth/v1/settings` | HTTP 200; `email=true`, `disable_signup=false`, `mailer_autoconfirm=false`, `anonymous_users=false`, Google/GitHub false |
| `GET /auth/v1/health` | HTTP 200, GoTrue v2.197.0 |
| `POST /auth/v1/signup` s `{}` | HTTP 422, `anonymous_provider_disabled` |
| `POST /auth/v1/token?grant_type=password` s poznatim sintetskim e-mailom i pogresnom lozinkom | HTTP 400, `invalid_credentials` |

Najvazniji nalaz je `anonymous_users=false`. UI i `src/auth/session.ts` imaju tok za anonimnu
sesiju i njeno povezivanje s e-mailom, ali ga staging konfiguracija trenutno odbija prije nego
sto se moze provjeriti ocuvanje `user_id`, lokalnog rada i prava.

## Svjezi dokaz stvarne e-mail dostave i potvrde

Dana 2026-09-22 staging je primio jedan kontrolirani zahtjev na `/auth/v1/otp` s HTTP 200 za
jednokratnu adresu. Mailbox je primio poruku od `noreply@mail.app.supabase.io` s predmetom
`Confirm your email address`. Tijelo je nosilo Supabase `/auth/v1/verify` poveznicu tipa
`signup`. Otvaranje poveznice je potvrdilo račun: read-only SQL snapshot staginga zabiljezio je
`email_confirmed_at` i `last_sign_in_at` u `2026-09-22 11:35:38Z` za isti novi korisnicki ID.

Nakon provjere sintetski račun je obrisan ciljanim staging SQL cleanupom, a naknadni upit je
vratio `remaining=0`. Produkcija nije dirana. Ovaj prolaz dokazuje dostavu i osnovnu potvrdu
običnog e-mail računa; ne dokazuje očuvanje anonimnog `user_id`, rada ili prava pri povezivanju.

Predložak je u ovoj probi koristio zadani `redirect_to=http://localhost:3000`. Dozvoljeni
staging redirect popis i konačni korisnički tok na staging frontendu ostaju za vlasničku potvrdu.

## Sto je dokazano u kodu i lokalnim testovima

`src/auth/session.ts` i `src/ui/app.ts` imaju ove grane:

- OTP zahtjev preko `/auth/v1/otp` s `create_user: true` i podrskom za redirect URL.
- Lozinka, postavljanje lozinke i provjera isteka tokena.
- Anonimna prijava preko `/auth/v1/signup`.
- Povezivanje e-maila na postojeceg anonimnog korisnika preko `PUT /auth/v1/user`.
- Potvrda promjene preko `type: email_change`, uz provjeru da vraceni korisnik ostaje isti
  `expectedUserId`.
- Race-safe osvjezavanje sesije; fatalni 400/401/403 ciste sesiju, a mreza i 5xx cuvaju
  vazecu sesiju.
- Odjava i ponovno otvaranje autenticiranog toka u UI-ju.

Ciljani prolaz:

```text
npm run test -- --run tests/session.test.ts tests/admin-auth.test.ts tests/production-config.test.ts tests/post-deploy-smoke.test.ts tests/agent-workflow-tasks-json.test.ts
```

Rezultat: **5 testnih datoteka proslo, 79 testova proslo**. `tests/session.test.ts` sadrzi 42
testa za OTP, lozinku, refresh, anonimnu prijavu, povezivanje anonimnog racuna i potvrdu
email linka, ukljucujuci negativni slucaj u kojem se promijeni korisnicki ID.

## Povijesni staging dokaz

T18 je 2026-09-21 dokazao login s dva sintetska staging korisnika, entitlement, testni
repair-docx, privatno preuzimanje, brisanje objekta i brisanje sintetskog korisnika. To potvrduje
da je tada postojala radna password sesija i privatni ownership tok, ali ne dokazuje email
dostavu niti anonimno povezivanje. Dokaz ostaje u
`docs/agents/t18-live-evidence-2026-09-21.md`.

## Nedostajuci dokazi za zatvaranje

1. Vlasnik mora omoguciti anonimne korisnike na stagingu ili potvrditi da je odabrana druga
   strategija koja cuva isti korisnicki identitet i vlasnistvo.
2. Za potpuno zatvaranje treba potvrditi i email-change i reset poruku na namjenskim adresama.
   Ovaj prolaz već dokazuje signup potvrdu stvarnim dolaskom poruke; HTTP 200 sam po sebi nije
   dovoljan dokaz dostave.
3. Treba izvesti anonimni rad, povezivanje e-maila, potvrdu linka u drugom browseru, reload i
   refresh tokena, pa provjeriti isti `user_id`, isti rad, ista prava i odjavu.
4. Treba potvrditi dozvoljene redirect URL-ove i SMTP predloske/rate limite. Supabase zadani
   SMTP nije dovoljan dokaz produkcijske dostave.
5. Nakon promjene postavki treba ponoviti ovaj zapis i tek tada procijeniti T22 kao `done`.

## Vlasnik i odluka

Vlasnik akcije je Daniel Risavi, odnosno vlasnik Supabase projekta. Potreban je svjezi valjani
read-only/Management pristup ili izravna dashboard potvrda postavki. Pro plan nije potreban za
ovaj korak. Do tada T22 ostaje otvoren, a T24, T25 i T30 ne mogu koristiti T22 kao zavrseni
preduvjet.

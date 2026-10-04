# T86: pravni tekstovi besplatne bete, nacrt za pregled

Datum: 4. 10. 2026. Nalog koordinatora lekta-37 (fokus na betu). Kriterij 6 T81.
Pregled: koordinator čita, zatim vlasnik. Ovo je nacrt; ništa iz njega ne smije u objavu dok
stoje oznake iz odjeljka 3 (deploy ih tvrdo odbija).

## 1. Što je napisano i gdje

Jedini izvor teksta ostaje `src/legal/legal-content.ts` (modal na indexu i statične stranice iz
`scripts/generate-legal-pages.mjs`). `data/legal/provider.json` nije mijenjan; OIB ostaje prazan (T48).

| Dokument | Novo |
|---|---|
| Obavijest o privatnosti | 1e. Anonimni račun; 1f. E-pošta (Resend); 1g. Prijava Google računom (samo kad je T102 uključen); Resend u popisu izvršitelja; rečenica bete u odjeljku 4 (plaćanje) |
| Uvjeti korištenja | 8. Besplatna beta: bez naknade, Rezultati (Z36, oznaka), formalna provjera nije ocjena sadržaja, promjena i prekid bete, brisanje podataka |
| Kolačići | sesija anonimnog računa u popisu lokalne pohrane |
| Podnožje | "Tijekom besplatne bete ništa se ne naplaćuje" u pravnom minimumu 11 stranica i u podnožju 7 pravnih stranica |

Supabase je već bio imenovan izvršitelj (odjeljak 5), a Turnstile odlomak (1d, #226) nije diran.

## 2. Razlika naloga i odluke o opsegu (treba potvrdu)

Nalog kaže "opseg A: analiza lokalno, bez naplate, bez popravka". Odluka vlasnika
`docs/decisions/T50_OPSEG_LANSIRANJA_ODLUKA.md` odjeljak 1 kaže da opseg A UKLJUČUJE besplatni
popravak, provjeru izvora, besplatne alate i listu čekanja, a T81 kriterij 5 i 8 provjeravaju
`REPAIR_FREE_MODE`. Zato postojeći odlomci o popravku (1b, 1c, lokalni WordReplica) nisu
uklonjeni: brisati opis obrade koja na produkciji možda radi bilo bi gore od viška teksta.
Ako beta ide bez popravka, to je zasebna odluka i zaseban rez teksta.

## 3. Otvorene oznake (deploy ih odbija)

| Oznaka | Gdje | Tko |
|---|---|---|
| `[ODLUKA VLASNIKA: Z36, klauzula o jamstvu i odgovornosti za rezultate tijekom besplatne bete ...]` | Uvjeti, 8, "Rezultati." | vlasnik |
| `[PROVJERITI: mehanizam prijenosa u SAD (DPF certifikat ili standardne ugovorne klauzule) i regija slanja prema Resendovu ugovoru o obradi podataka, prije objave.]` | Privatnost, 1f | vlasnik ili izvršitelj s pristupom Resend DPA-u |
| `[PROVJERITI: konačni opseg podataka (scopes) iz T102.]` | Privatnost, 1g (renderira se tek uz `googleSignIn`) | T102 |

Gard: `scripts/lib/legal-placeholders.mjs` prepoznaje oznake, a `scripts/verify-deploy-dist.mjs`
(korak 3a) obara objavu ako ijedna stoji u pravnim stranicama ili u JS bundleu (modal). Baseline i
tri mutacije su u `tests/gate-mutations.test.ts` (`pravno/*`), a popis otvorenih oznaka smije samo
padati (`tests/legal-content.test.ts`).

Posljedica: dok oznake stoje, `dist-gate` u CI-ju je crven. To je namjerno: PR se ne spaja prije
odluke vlasnika o Z36.

## 4. Što nije izmišljeno i što nije provjereno

- Resend: činjenice iz koda (`supabase/functions/send-reminders`, `discovery/notify-covered.mjs`,
  `faculty-request`): podsjetnici o roku su opt-in i nose poveznicu za odjavu; e-mail uz zahtjev za
  fakultet je neobvezan. Sjedište Resend, Inc. u SAD-u nije provjereno u ugovoru, samo javno poznato.
- Anonimni račun: `ensureAccessToken()` u `src/ui/app.ts` otvara ga tiho pri popravku i "Moji
  popravci". Ne tvrdi se ništa o tome koje tehničke podatke Supabase Auth bilježi uz anonimni račun.
- Google: tekst je napisan kao Google samostalni voditelj; opseg podataka je oznaka.
- Ne tvrdi se rok obavijesti prije završetka bete; tekst kaže samo da se završetak objavljuje na stranici.

## 5. Što ostaje prije objave

1. Vlasnik upisuje Z36 umjesto oznake.
2. Provjera Resend DPA-a (oznaka 1f).
3. `TERMS_VERSION` (`src/legal/terms-version.ts`) treba podići uz objavu, jer je sadržaj materijalno
   promijenjen. Ovaj nacrt ga NE podiže: istu konstantu čita consent gate u Edge funkciji
   `repair-docx`, pa podizanje mora ići zajedno s deployem te funkcije.
4. Puno podnožje (`/saznaj-vise/`, `/alati.html`) doslovno slijedi dizajnerski predložak
   `design/templates/chrome/Chrome.dc.html` (test Z15), pa redak bete tamo traži izmjenu predloška.
   Nije dirano bez odluke.

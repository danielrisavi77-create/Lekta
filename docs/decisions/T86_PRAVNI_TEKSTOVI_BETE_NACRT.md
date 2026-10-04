# T86: pravni tekstovi besplatne bete

Datum: 4. 10. 2026. Nalog koordinatora lekta-37 (fokus na betu). Kriterij 6 T81.
Odluke vlasnika istog dana: "Za vrijeme bete su popravci besplatni, sve ostalo napravi kako ti
misliš da je najbolje." Pregled: koordinator čita, zatim vlasnik.

## 1. Što je napisano i gdje

Jedini izvor teksta ostaje `src/legal/legal-content.ts` (modal na indexu i statične stranice iz
`scripts/generate-legal-pages.mjs`). `data/legal/provider.json` nije mijenjan; OIB ostaje prazan (T48).

| Dokument | Novo |
|---|---|
| Obavijest o privatnosti | 1e. Anonimni račun; 1f. E-pošta (Resend); 1g. Prijava Google računom (samo kad je T102 uključen); Resend u popisu izvršitelja; rečenica bete u odjeljku 4 (plaćanje) |
| Uvjeti korištenja | 8. Besplatna beta: bez naknade, bez jamstva rezultata (Z36), formalna provjera nije ocjena sadržaja, promjena i prekid bete, brisanje podataka |
| Kolačići | sesija anonimnog računa u popisu lokalne pohrane |
| Podnožje | "Tijekom besplatne bete ništa se ne naplaćuje": pravni minimum na 11 stranica, granice punog podnožja (`/saznaj-vise/`, `/alati.html` i predložak `design/templates/chrome/Chrome.dc.html`) i podnožje 7 pravnih stranica |

Supabase je već bio imenovan izvršitelj (odjeljak 5), a Turnstile odlomak (1d, #226) nije diran.

## 2. Opseg bete

Popravci su tijekom bete besplatni (odluka vlasnika 4. 10.; usklađeno s T50, opseg A). Postojeći
odlomci o popravku (1b, 1c, lokalni WordReplica) zato ostaju.

## 3. Z36: bez jamstva rezultata

Vlasnik je tekst prepustio izvršitelju. Napisan je konzervativno:

- usluga se tijekom bete pruža bez naknade i bez jamstva za rezultate (provjera, popravak,
  prihvaćanje rada);
- garancija točnosti i jamstvo za popravak iz Garancijskih uvjeta vrijede za plaćene usluge, ne za
  betu (točka 10 garancije već kaže "nakon završetka besplatne bete");
- odgovornost je ograničena, ali NE za štetu prouzročenu namjerno ili krajnjom nepažnjom (Zakon o
  obveznim odnosima, čl. 345: takvo se isključenje ne može ugovoriti) i ne protivno prisilnim
  propisima o zaštiti potrošača.

Tekst nije pregledao pravnik. Preporuka: pravni pregled najkasnije prije plaćenog lansiranja (opseg B).

## 4. Izvori činjenica

- Resend: iz koda (`supabase/functions/send-reminders`, `discovery/notify-covered.mjs`,
  `faculty-request`): podsjetnici o roku su opt-in i nose poveznicu za odjavu; e-mail uz zahtjev za
  fakultet je neobvezan. Pravni subjekt (Plus Five Five, Inc.) i osnova prijenosa (standardne ugovorne
  klauzule i EU-U.S. Data Privacy Framework) prema javnom Resend DPA-u
  (https://resend.com/legal/dpa, verzija od 31. 12. 2025., pročitano preko tražilice 4. 10. 2026.;
  sama stranica iz ove okoline nije dostupna). Regija slanja se ne navodi jer nije poznato koju
  regiju Lektin Resend račun koristi.
- Anonimni račun: `ensureAccessToken()` u `src/ui/app.ts` otvara ga tiho pri popravku i "Moji
  popravci". Ne tvrdi se ništa o tome koje tehničke podatke Supabase Auth bilježi uz anonimni račun.
- Google: tekst je napisan kao Google samostalni voditelj i tvrdi da Lekta prima samo e-mail, ime
  i identifikator računa. Odlomak nema oznaku jer je njegov literal u JS bundleu i dok je prijava
  isključena. T102 mora scopes uskladiti s tim tekstom prije uključivanja `googleSignIn`.
- Ne tvrdi se rok obavijesti prije završetka bete; tekst kaže samo da se završetak objavljuje na stranici.

## 5. Gard neobjavljivih oznaka

Buduće oznake `[ODLUKA VLASNIKA: ...]` i `[PROVJERITI: ...]` u pravnom tekstu prepoznaje
`scripts/lib/legal-placeholders.mjs`, a `scripts/verify-deploy-dist.mjs` (korak 3a) obara objavu ako
ijedna stoji u pravnim stranicama ili u JS bundleu (modal). Baseline i tri mutacije su u
`tests/gate-mutations.test.ts` (`pravno/*`); `tests/legal-content.test.ts` tvrdi da tekst danas nema
nijedne, ni uz uključen Google.

## 6. Što ostaje uz objavu

`TERMS_VERSION` (`src/legal/terms-version.ts`) treba podići jer je sadržaj materijalno promijenjen.
Ovaj PR ga NE podiže: Edge funkcija `repair-docx` uspoređuje ga strogo (`consentVersion !==
TERMS_VERSION` vraća `consent_required`), a uz verziju postoji i kanonski tekst privole
(`tests/consent-text.test.ts`). Podizanje bez istodobnog deploya funkcije srušilo bi besplatni
popravak, pa ide kao zaseban korak objave: nova verzija, kanonski tekst privole i deploy `repair-docx`
zajedno.

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
- Google: tekst opisuje Google kao samostalnog voditelja i osnovne podatke profila koje
  Supabase Authentication može prenijeti: e-mail, ime, identifikator računa, poveznicu na profilnu
  sliku i potvrdu e-mail adrese. To je provjereno prema službenom Supabase Auth Google provideru
  (`internal/api/provider/google.go`, provjereno 5. 10. 2026.) i Googleovoj politici privatnosti
  (https://policies.google.com/privacy?hl=hr, verzija od 1. 10. 2026.). Odlomak nema oznaku jer
  je njegov literal u JS bundleu i dok je prijava isključena. T102 mora uključivanje odlomka
  uskladiti sa stvarnim stanjem `googleSignIn`; provider ostaje zadano isključen.
- Ne tvrdi se rok obavijesti prije završetka bete; tekst kaže samo da se završetak objavljuje na stranici.

## 5. Gard neobjavljivih oznaka

Buduće oznake `[ODLUKA VLASNIKA: ...]` i `[PROVJERITI: ...]` u pravnom tekstu prepoznaje
`scripts/lib/legal-placeholders.mjs`, a `scripts/verify-deploy-dist.mjs` (korak 3a) obara objavu ako
ijedna stoji u pravnim stranicama ili u JS bundleu (modal). Baseline i tri mutacije su u
`tests/gate-mutations.test.ts` (`pravno/*`); `tests/legal-content.test.ts` tvrdi da tekst danas nema
nijedne, ni uz uključen Google.

## 6. Što ostaje uz objavu

`TERMS_VERSION` (`src/legal/terms-version.ts`) podignut je na `2026-10-05` jer je sadržaj
materijalno promijenjen. Za novu verziju dodan je kanonski tekst kupnje, uz očuvanje svih starih
unosa (`src/legal/consent-text.ts`). Klijent i Edge funkcija `repair-docx` u kodu uvoze isti izvor;
`create-checkout` uvozi isti registar kanonskih tekstova. To je usklađenost izvornog koda, ne tvrdnja
da su nove funkcije ili stranice objavljene.

Objava ostaje zasebna vlasnikova radnja izvan dovršavanja PR-a: novu verziju klijenta treba objaviti
tek uz odgovarajući `repair-docx` i `create-checkout`. Stara objavljena Edge funkcija strogo odbija
novu `consentVersion` (`consent_required`), a stari checkout ne poznaje novi kanonski unos.
Ovaj PR ne objavljuje frontend, Edge funkcije ni migracije i ne aktivira naplatu.


## 7. Tehnička istinitost opisa plaćanja

Zatečeni tekst tvrdio je da se podaci o plaćanju uopće ne obrađuju i opisivao odlazak na
hostiranu stranicu. Aktualni kod (`src/ui/stripe-payment-modal.ts` i
`src/report/stripe-payment.ts`) koristi Stripe Payment Element unutar modalnog prozora.
`create-checkout/handler.ts` zapisuje privolu i stvara PaymentIntent; `webhook-mor/handler.ts`
obrađuje potvrđene naplate i povrate. U tekstu je zato razlikovano korištenje besplatnih
funkcija od podataka plaćenih narudžbi te opisan stvarni ugrađeni obrazac. Formulacija
"isporuka plaćenog popravka" promijenjena je u "isporuka automatskog popravka" da obuhvati
i besplatnu betu; pravna osnova nije mijenjana niti se ovime pravnički odobrava.

Stripe potvrđuje da Payment Element sadrži zasebni iframe koji podatke šalje izravno Stripeu:
[službena dokumentacija](https://docs.stripe.com/payments/finalize-payments-on-the-server).
Provjereno 5. 10. 2026. Ovo opisuje implementaciju u kodu, ne potvrđuje dostupnost plaćenih
usluga u produkciji i ne aktivira naplatu, providera ili objavu.

Opis dohvata pravila profila također je preciziran: zahtjev donosi izvornu IP adresu,
`supabase/functions/profile-rules/index.ts` poziva `hashClientIpSalted`, a ograničenje
broja zahtjeva dobiva samo `p_ip_hash`. Tvrdnja o obradi isključivo hashirane adrese
zamijenjena je tvrdnjom o računanju i pohrani otiska u Lektinu ograničenju zahtjeva.
Time se ne daje neprovjereno jamstvo o zapisima mrežnih i hosting pružatelja.


Naknadna provjera uklanja i naslijeđenu oznaku "Merchant of Record" iz popisa pružatelja.
Aktualni `src/report/checkout.ts` i `create-checkout/handler.ts` stvaraju standardni
Stripe PaymentIntent za Payment Element; to nije Stripe Managed Payments.
[Službena usporedba](https://docs.stripe.com/payments/managed-payments) razlikuje
Merchant of Record u Managed Payments od ostalih Stripe proizvoda. Tekst zato opisuje
obradu plaćanja bez pripisivanja neprovedene uloge trgovca ili izdavanja računa.
Provjereno 6. 10. 2026.; ovo ne potvrđuje ni aktivira produkcijsku naplatu.

Obje općenite rečenice o hashiranim logovima ograničene su na Lektinu evidenciju izrade
izvještaja: `generate-report/index.ts` sprema `ip_hash`, a migracija `0009_log_retention.sql`
predviđa brisanje tih zapisa nakon 90 dana. Time se ne jamči sadržaj zapisa hosting
pružatelja niti se potvrđuje da je raspored brisanja izveden u živom okruženju.

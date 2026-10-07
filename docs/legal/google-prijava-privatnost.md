# Nacrt: odlomak politike privatnosti o prijavi Googleom (T102, za T86)

Status: **NACRT za vlasnika i T86**. Nije objavljen. U `src/legal/legal-content.ts` ulazi tek kad
vlasnik ukljuci `VITE_AUTH_GOOGLE_ENABLED` na produkciji, i to u istom izdanju. Tada se podize i
`TERMS_VERSION`. Ovaj nacrt nije pravni savjet. Tvrdnje oznacene s **[provjeriti]** vlasnik
potvrduje prije objave, prema Googleovim i Supabaseovim uvjetima koji vrijede na dan objave.

Predlozeno mjesto je novi odjeljak iza `1d. Zaštita od zlouporabe (captcha)`, uz isti oblik kao
odlomak o Cloudflare Turnstileu.

---

## Predlozeni tekst (HTML, hrvatski)

```html
<h4>1e. Prijava Google računom</h4>
<p>Uz prijavu e-mailom, korisnik se može prijaviti i <strong>Google računom</strong>. Tada ga Lekta preusmjerava na Google, gdje se korisnik prijavljuje i odobrava da Lekta dobije osnovne podatke računa: adresu e-pošte, ime i jedinstveni identifikator Google računa [provjeriti: točan opseg koji traži Supabase Google provider; zadano su openid, email i profile]. Lekta ne dobiva korisnikovu Google lozinku, a Google ne dobiva korisnikove dokumente ni rezultate analize.</p>
<p>Prijavu tehnički provodi Lektin izvršitelj obrade <strong>Supabase</strong> (EU regija), koji podatke primljene od Googlea pohranjuje uz korisnički račun jednako kao kod prijave e-mailom. Za vođenje Google računa i provjeru prijave Google LLC (Sjedinjene Američke Države), odnosno za korisnike u EU Google Ireland Limited [provjeriti], djeluje kao samostalni voditelj obrade prema vlastitoj politici privatnosti. Google pritom saznaje da se korisnik prijavljuje u Lektu. Prijenos u SAD temelji se na certifikatu Google LLC u EU-U.S. Data Privacy Frameworku [provjeriti važenje na dan objave].</p>
<p>Prijava Googleom je dobrovoljna; ista usluga dostupna je i prijavom e-mailom. Pravna osnova je izvršenje ugovora o korištenju usluge (čl. 6. st. 1. t. b), jer je prijava potrebna za kupnju i puni izvještaj. Podaci primljeni od Googlea čuvaju se dok postoji korisnički račun i brišu se s njim. Pristup Lekti korisnik može opozvati u postavkama Google računa (Sigurnost, Veze s aplikacijama trećih strana). Više u <a href="https://policies.google.com/privacy" rel="noopener">Googleovoj politici privatnosti</a>.</p>
```

Uz to, u odjeljku `5. Izvršitelji obrade` nije potrebna nova stavka za Google, jer Google ovdje
nije izvrsitelj nego samostalni voditelj. Supabase je vec naveden. **[provjeriti]**: treba li
Google ipak navesti u popisu primatelja (cl. 13. st. 1. t. e GDPR-a, "primatelji ili kategorije
primatelja").

## Tehnicke cinjenice na koje se tekst oslanja (iz koda T102)

- Tok je OAuth 2.0 s PKCE (`src/auth/google-oauth.ts`): preglednik ide na Supabase
  `/auth/v1/authorize?provider=google`, a Supabase dalje na Google.
- Lekta u pregledniku sprema samo jednokratni PKCE verifier i fragment stranice s koje je prijava
  pokrenuta (`lekta.oauth.pkce`), te istu sesiju `lekta.session` kao kod prijave e-mailom. Verifier
  vrijedi 10 minuta. Brise se pri povratku s Googlea, a ako se korisnik ne vrati, pri sljedecem
  otvaranju `/rad/` nakon isteka. Do tada ostaje u pregledniku (nije osobni podatak, nego slucajan niz).
- Verifier i spremljeni fragment uklanjaju se pri sljedecem otvaranju `/rad/` nakon isteka roka od 10 minuta, ukljucujuci i kada je zastavica u medjuvremenu iskljucena.
- Korisniku s anonimnom sesijom (popravci bez e-maila) prijava Googleom se ne nudi i ne zamjenjuje mu
  sesiju. Ogranicenje: starija anonimna sesija bez oznake `isAnonymous` ne dobiva u `app.ts` ponudu
  povezivanja kroz prijavu e-mailom, pa joj ni poruka ne obecava cuvanje popravaka.
- Google Identity Services ni ikakva Googleova skripta ne ucitavaju se na Lektinim stranicama. Zato
  CSP ne treba nove domene.
- Supabase Auth je dijeljen s Katedrom (`uri_allow_list`), pa ukljucivanje providera ide uskladjeno.

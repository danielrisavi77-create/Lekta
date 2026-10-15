# T89: ukljucivanje Turnstile captche, kontrolni popis za vlasnika

Kod je u masteru (T89). Ovaj popis kaze TOCNO sto vlasnik klika i upisuje, kojim redom, i koji dokaz
biljezi nakon svakog koraka. Razlozi, ponasanje koda i povrat opisani su u
[`AUTH_CAPTCHA.md`](AUTH_CAPTCHA.md); ovdje se ne ponavljaju.

Pravilo: svaki korak ima dokaz. Bez dokaza se ne ide na sljedeci korak. Prvo staging, zatim
produkcija. Obrnuti redoslijed (captcha na Authu prije deployanog site keya) zakljucava prijave i
popravak za svakog novog korisnika.

## Vrijednosti

| Sto | Staging | Produkcija |
| --- | --- | --- |
| Supabase projekt | `bnyemcnsphlitjradrst` | `zrrjttizjyfcxmcpgzml` |
| Netlify site | `lekta-staging.netlify.app` | `lektahr.netlify.app` (kasnije i `lekta.hr`, `www.lekta.hr`, T49) |
| Izvor build varijable | GitHub Actions `staging` environment | GitHub Actions `production` environment |
| Turnstile hostnameovi | `lekta-staging.netlify.app`, `localhost` | `lektahr.netlify.app`, `lekta.hr`, `www.lekta.hr` |

`lekta.hr` i `www.lekta.hr` upisuju se u widget odmah, iako domena jos nije spojena (T49). Inace bi
prelazak na domenu tiho slomio captchu: widget odbija token s hostnamea koji nije na popisu.

Site key je javan (ugradjuje se u frontend). Secret key je tajna: upisuje se SAMO u Supabase
dashboard, nikad u repozitorij, `.env*`, Netlify, poruku, PR ni chat.

## Koraci

### 1. Cloudflare: Turnstile widget (vlasnik)

Cloudflare dashboard > Turnstile > Add widget:
- naziv: `lekta-auth`;
- hostnameovi: oni iz tablice (za staging i produkciju mogu biti dva widgeta ili jedan sa svim
  hostnameovima; dva su cisca jer se secret produkcije tada nikad ne koristi na stagingu);
- widget mode: **Managed**;
- pre-clearance: iskljuceno.

**Dokaz:** snimka zaslona popisa hostnameova widgeta; site key zapisan (javan), secret key spremljen
u upravitelj lozinki.

### 2. GitHub Actions: site key u staging build (vlasnik)

GitHub repozitorij > Settings > Environments > `staging` > Variables > Add variable:
- kljuc: `TURNSTILE_SITE_KEY`;
- vrijednost: staging site key iz koraka 1.

Workflow `.github/workflows/release.yml` cita varijablu iz `staging` environmenta i prosljedjuje je
buildu kao `VITE_TURNSTILE_SITE_KEY`. Promjena vrijedi tek nakon sljedece staging objave kroz
release workflow; rucni Netlify deploy ne koristi ovu varijablu.

**Dokaz:**
```bash
curl -s https://<site>/build-info.json
```
mora vratiti commit ocekivanog deploya i `"captchaSiteKey": true`. `false` ili bez polja: STANI.

**Staging i produkcijska objava idu kroz GitHub Actions.** Workflow
`.github/workflows/release.yml` gradi klijent i objavljuje ga preko Netlify CLI-ja. Za staging i
produkciju workflow cita `TURNSTILE_SITE_KEY` iz odgovarajuceg GitHub Actions environmenta te ga
prosljedjuje buildu kao `VITE_TURNSTILE_SITE_KEY`; Netlify build varijabla nije izvor za te release
buildove. Run 38430199081 objavio je SHA f758ba2bde00c7f2d37daa789a39ed1e4168db99, ali javni
build-info.json nakon objave prijavio je captchaSiteKey=false. Stoga se Auth zaštita još ne smije
uključiti. Vlasnik najprije postavlja site key u GitHub production environment, zatim kroz release
workflow objavljuje build i provjerava javni rezultat:
```bash
curl -s https://lekta.hr/build-info.json
```
Polje captchaSiteKey mora biti true, a commit mora biti SHA novog builda. false ili nedostajuće polje:
stani i ne uključuj korak 4 na produkciji.

### 3. Frontend salje token (vlasnik, preglednik)

Novi privatni prozor, `https://<site>`, ucitaj `.docx` i pokreni automatski popravak (on trazi
anonimnu prijavu). DevTools > Network:
- `POST .../auth/v1/signup`: tijelo sadrzi `gotrue_meta_security.captcha_token` s nepraznom
  vrijednoscu;
- Console: nema CSP greske za `challenges.cloudflare.com`.

**Dokaz:** snimka zaslona zahtjeva (vrijednost tokena smije biti zamagljena). Bez tokena: STANI, jer
bi korak 4 zakljucao prijave.

### 4. Supabase: captcha na Authu (vlasnik)

Supabase Dashboard > projekt > Project Settings > Authentication > Bot and Abuse Protection > Enable CAPTCHA protection:
- provider: Turnstile (Cloudflare);
- Captcha secret: secret key iz koraka 1;
- Save.

**Dokaz:** snimka zaslona ukljucene postavke (bez vidljivog secreta).

### 5. Negativni slucaj: bez tokena = 4xx (vlasnik ili sesija na njegovu rijec)

Odmah nakon koraka 4, s anon kljucem tog projekta:
```bash
curl -s -o /dev/stderr -w "%{http_code}\n" -X POST "https://<ref>.supabase.co/auth/v1/signup" \
  -H "apikey: <anon kljuc>" -H "Content-Type: application/json" -d '{}'
```
mora vratiti **400** i tijelo s `"error_code":"captcha_failed"`. Isto za e-mail prijavu:
```bash
curl -s -o /dev/stderr -w "%{http_code}\n" -X POST "https://<ref>.supabase.co/auth/v1/otp" \
  -H "apikey: <anon kljuc>" -H "Content-Type: application/json" \
  -d '{"email":"t89-test@example.com","create_user":true}'
```
mora vratiti **400** s `captcha_failed`. Ako bilo koji poziv vrati 200 ili sesiju: captcha NIJE
ukljucen, STANI i provjeri korak 4.

**Dokaz:** oba HTTP koda i `error_code`, s vremenom.

### 6. Pozitivni slucaj: stvarni tok prolazi (vlasnik, preglednik)

Novi privatni prozor: automatski popravak krece (anonimna prijava uspjela), a prijava e-mailom salje
kod. Pogresan ili istekao token mora dati poruku za ponovni pokusaj (ne "e-mail ili lozinka nisu
tocni").

**Dokaz:** vrijeme, projekt, ishod oba toka.

### 7. Produkcija

Ponovi korake 1 do 6 za produkciju TEK kad staging ima zapisane dokaze 2, 3, 5 i 6. Na produkciji
se korak 4 radi tek nakon dokaza 2 i 3 na produkciji.

## Dnevnik dokaza

| Korak | Projekt | Vrijeme | Ishod | Dokaz |
| --- | --- | --- | --- | --- |
| 1 Widget | | | | |
| 2 `captchaSiteKey: true` | staging | | | |
| 3 token u `/signup` | staging | | | |
| 4 captcha ukljucen | staging | | | |
| 5 `/signup` bez tokena = 400 `captcha_failed` | staging | | | |
| 5 `/otp` bez tokena = 400 `captcha_failed` | staging | | | |
| 6 popravak i e-mail prijava prolaze | staging | | | |
| 2 `captchaSiteKey: true` u lokalnom `dist` i na objavi | produkcija | | | |
| 3 do 6 | produkcija | | | |

## Ako nesto podje krivo

Najbrži povrat: Supabase Dashboard > projekt > Project Settings > Authentication > Bot and Abuse Protection > isključi CAPTCHA zaštitu. Djeluje odmah, bez
deploya. Site key u GitHub Actions environmentu smije ostati (bez ukljucene serverske CAPTCHA
zastite Auth ne zahtijeva token). Detalji u
[`AUTH_CAPTCHA.md`](AUTH_CAPTCHA.md#povrat).

Tekst privatnosti (odjeljak 1d i popis izvrsitelja u `src/legal/legal-content.ts`) vec navodi
Cloudflare Turnstile i opisuje obradu nakon ukljucivanja zastite. To ispunjava dokumentacijski
uvjet za kod, ali ne dokazuje da je Turnstile aktivan u produkciji; provjeri `captchaSiteKey` u
`build-info.json` i stanje Supabase Autha. Vlasnik je 2026-10-15 potvrdio objavljenu formulaciju;
to ne potvrduje da je Turnstile ukljucen ili testiran u produkciji.

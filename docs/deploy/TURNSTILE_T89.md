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
| Netlify kontekst za varijablu | onaj koji gradi staging site | Production |
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

### 2. Netlify: site key u build (vlasnik)

Netlify > site > Site configuration > Environment variables > Add variable:
- kljuc: `VITE_TURNSTILE_SITE_KEY`;
- vrijednost: site key iz koraka 1;
- scope: Builds; kontekst: samo onaj koji se ukljucuje (staging prvo).

Zatim Deploys > Trigger deploy > Clear cache and deploy site. Varijabla se ugradjuje PRI BUILDU:
bez novog deploya nema ucinka.

**Dokaz:**
```bash
curl -s https://<site>/build-info.json
```
mora vratiti commit ocekivanog deploya i `"captchaSiteKey": true`. `false` ili bez polja: STANI.

### 3. Frontend salje token (vlasnik, preglednik)

Novi privatni prozor, `https://<site>`, ucitaj `.docx` i pokreni automatski popravak (on trazi
anonimnu prijavu). DevTools > Network:
- `POST .../auth/v1/signup`: tijelo sadrzi `gotrue_meta_security.captcha_token` s nepraznom
  vrijednoscu;
- Console: nema CSP greske za `challenges.cloudflare.com`.

**Dokaz:** snimka zaslona zahtjeva (vrijednost tokena smije biti zamagljena). Bez tokena: STANI, jer
bi korak 4 zakljucao prijave.

### 4. Supabase: captcha na Authu (vlasnik)

Supabase dashboard > projekt > Authentication > Attack Protection > Enable Captcha protection:
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
| 2 do 6 | produkcija | | | |

## Ako nesto podje krivo

Najbrzi povrat: Supabase > Authentication > Attack Protection > iskljuci captchu. Djeluje odmah, bez
deploya. Site key u Netlifyju smije ostati (server token koji ne trazi ignorira). Detalji u
[`AUTH_CAPTCHA.md`](AUTH_CAPTCHA.md#povrat).

Tekst privatnosti (odjeljak 1d i popis izvrsitelja u `src/legal/legal-content.ts`) vec navodi
Cloudflare Turnstile, pa uvjet iz `AUTH_CAPTCHA.md` "Otvoreno" za produkciju je ispunjen u kodu;
vlasnik potvrduje da je objavljena verzija ona koju je odobrio.

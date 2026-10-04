# Domena lekta.hr, DNS, e-posta i support (T49)

Odluka vlasnika 3. 10. 2026.: domena `lekta.hr`, registrirana na vlasnika osobno (prijenos na obrt
nakon T48), DNS na Cloudflareu, `support@` i `dmarc@` kroz Cloudflare Email Routing prema
vlasnikovom Gmailu, transakcijska posta kroz Resend. Kriterij 7 T81 (beta go/no-go 19. 10. 2026.).

Stanje prije pocetka: `lekta.hr` nema A, NS ni SOA zapisa (DNS upit 3. 10. 2026.: "DNS name does not
exist"). Zivi site je `https://lektahr.netlify.app`.

## Redoslijed

Redoslijed nije proizvoljan. Edge funkcije propustaju samo origine iz tajne `ALLOWED_ORIGIN`
(zadano `https://lektahr.netlify.app`, `supabase/functions/*/index.ts`), pa domena koja postane
primarna prije te tajne vraca CORS odbijanje na svaki poziv backendu.

| Korak | Tko | Sto | Dokaz |
|---|---|---|---|
| 1 | vlasnik | Kupiti `lekta.hr` kod ovlastenog .hr registrara, nositelj vlasnik s OIB-om | potvrda registrara |
| 2 | vlasnik | Cloudflare: Add site `lekta.hr` (Free), dva nameservera upisati kod registrara | `Resolve-DnsName lekta.hr -Type NS` vraca Cloudflare |
| 3 | vlasnik ili sesija s tokenom | DNS zapisi iz tablice niže | upiti iz odjeljka "Provjera" |
| 4 | sesija, rijec vlasnika | Supabase prod: `ALLOWED_ORIGIN` dobiva `https://lekta.hr,https://www.lekta.hr,https://lektahr.netlify.app` | `secrets list` digest; CORS proba |
| 5 | sesija, rijec vlasnika | Supabase Auth: Site URL `https://lekta.hr` I redirect URL-ovi za `lekta.hr` u ISTOM operativnom koraku, prije provjere prijave na `lekta.hr` (vidi "Prijava") | Auth postavke procitane, prijava e-mailom na `lekta.hr` uspjela |
| 6 | sesija, rijec vlasnika | Netlify: custom domena `lekta.hr` i `www.lekta.hr`, `lekta.hr` primarna, HTTPS certifikat | `curl -I https://lekta.hr` 200; `lektahr.netlify.app` ostaje 200 BEZ preusmjeravanja (vidi "Stari origin") |
| 7 | sesija, PR | Kod: `LEKTA_SITE_ORIGIN` u `netlify.toml` i `check.yml`, gard `WRONG_DOMAIN` u `scripts/verify-deploy-dist.mjs`, zadani origin u `post-deploy-smoke.mjs` i Edge fallbackovi | `npm run check`, deploy |
| 8 | vlasnik + sesija | Resend: domena `lekta.hr` verificirana, `RESEND_API_KEY` u prod tajnama, Supabase Auth custom SMTP kroz Resend | Resend "Verified", testni mail stigao |
| 9 | sesija | Provjera i dokaz izdanja | odjeljak "Provjera" |

Koraci 4, 5, 6 i 8 diraju produkciju i idu samo uz vlasnikovu rijec u sesiji koja ih izvodi.

## DNS zapisi (Cloudflare)

| Ime | Tip | Vrijednost | Proxy | Svrha |
|---|---|---|---|---|
| `lekta.hr` | CNAME (flattening) | `lektahr.netlify.app` | iskljucen | web; Netlify sam izdaje certifikat |
| `www` | CNAME | `lektahr.netlify.app` | iskljucen | web, Netlify preusmjerava na primarnu |
| `lekta.hr` | MX, TXT (SPF) | dodaje ih Email Routing pri ukljucivanju | | primanje poste za `support@`, `dmarc@` |
| `resend._domainkey` | TXT | DKIM javni kljuc iz Resend dashboarda | | potpis transakcijske poste |
| `send` | MX, TXT (SPF) | vrijednosti iz Resend dashboarda | | return-path Resenda |
| `_dmarc` | TXT | `v=DMARC1; p=none; rua=mailto:dmarc@lekta.hr` | | politika i izvjestaji |

Proxy (narancasti oblak) ostaje iskljucen za web zapise dok Netlify ne izda certifikat; ukljucivanje
proxyja je zasebna odluka (dvostruki CDN, Turnstile i CSP to ne trebaju).

DMARC krece s `p=none`. Nakon dva tjedna izvjestaja u kojima sva legitimna posta prolazi DKIM
uskladjeno (Resend, Gmail "posalji kao" kroz Resend SMTP), politika ide na `p=quarantine`.

Root SPF ostaje onaj koji postavi Email Routing. Resend salje s return-pathom na `send.lekta.hr`,
pa root SPF ne treba `include` za Resend; DMARC prolazi kroz DKIM uskladjenje.

## Support sanducic

- Email Routing: `support@lekta.hr` i `dmarc@lekta.hr` prosljeduju na vlasnikov Gmail (odredisna
  adresa se potvrdjuje mailom).
- Odgovor s adrese `support@lekta.hr`: Gmail "Posalji posta kao" kroz Resend SMTP
  (`smtp.resend.com`, korisnik `resend`, lozinka = API kljuc s ovlascu slanja).

## Provjera

```powershell
Resolve-DnsName lekta.hr -Type NS
Resolve-DnsName lekta.hr -Type MX
Resolve-DnsName lekta.hr -Type TXT
Resolve-DnsName resend._domainkey.lekta.hr -Type TXT
Resolve-DnsName _dmarc.lekta.hr -Type TXT
curl.exe -sI https://lekta.hr
curl.exe -sI https://lektahr.netlify.app
curl.exe -s https://lekta.hr/build-info.json
curl.exe -s https://lektahr.netlify.app/build-info.json
```

Dokaz koji trazi koordinator:

- `build-info.json` na `https://lekta.hr` vraca ISTI commit kao `https://lektahr.netlify.app` prije
  promjene primarne domene;
- `post-deploy-smoke` prolazi uz `--site https://lekta.hr` (workflow input `site`);
- RELEASE_PROOF (T72) se radi s `LEKTA_SITE_ORIGIN=https://lekta.hr`;
- CORS proba: `OPTIONS` na jednu Edge funkciju s `Origin: https://lekta.hr` vraca taj origin u
  `Access-Control-Allow-Origin`; s `Origin: https://evil.example` ga ne vraca;
- testni mail na `support@lekta.hr` stigne u Gmail; mail-tester.com za mail poslan kroz Resend
  pokazuje SPF, DKIM i DMARC kao prolaz.

## Stari origin ostaje ziv (izricit uvjet)

`lektahr.netlify.app` mora ostati ziv i BEZ 301/308 na `lekta.hr` dok ne postoji provjeren prijenos ili
oporavak lokalnog stanja korisnika (Codex nalaz 2 na #273). Anonimni popravak i lokalna povijest
radova zive u `localStorage` i sesiji vezanima uz origin; preusmjeravanje bi ih korisniku na starom
originu tiho odsjeklo. Stanje 4. 10. 2026.: `lektahr.netlify.app` vraca 200 bez preusmjeravanja.
Uvodjenje preusmjeravanja je zaseban korak s vlastitim dokazom (prijenos ili oporavak testiran na
stvarnom pregledniku) i uz vlasnikovu rijec.

Isti artefakt sluzi na oba hosta, pa interne poveznice u generiranim stranicama (logo, "Svi
besplatni alati", CTA, pravne stranice) moraju biti relativne: apsolutni origin ostaje samo za
kanonik, `og:url`, `og:image`, JSON-LD i sitemap (Codex runda 2, nalaz 2 na #273). Gard je u
`tests/deploy-origin.test.ts`.

Mjerljiv kriterij prijenosa prije ikakvog 301/308 sa starog hosta; sve na stvarnom pregledniku, od
korisnika koji je radio na `lektahr.netlify.app` do istog korisnika na `lekta.hr`:

1. isti anonimni identitet (isti `user.id` iz Auth sesije prije i poslije);
2. pristup postojecem popravku (stranica popravka i preuzimanje rade bez nove prijave);
3. lokalna povijest radova (`lekta.history.v2`) vidljiva na odredistu;
4. dokument pohranjen u IndexedDB dostupan na odredistu;
5. put oporavka kad prijenos ne uspije: korisnik dobiva jasnu uputu i moze se vratiti na stari
   host, gdje je stanje netaknuto.

Dok svih pet tocaka nije dokazano, `lektahr.netlify.app` ostaje bez preusmjeravanja.

Prolaz garda #5 i `post-deploy-smoke` NIJE dokaz da je stari origin umirovljen (Codex nalaz 3 na
#273): oni gledaju sadrzaj builda, ne ponasanje hosta. Tvrdnja "stari origin preusmjerava" smije se
izreci tek uz opazen `301` ili `308` s `Location: https://lekta.hr/...` na `lektahr.netlify.app`.

## Prijava

Supabase Auth `site_url` i popis dopustenih redirecta mijenjaju se zajedno, u istom operativnom
koraku, i to PRIJE provjere prijave na `lekta.hr` (Codex nalaz 4 na #273). Link za prijavu e-mailom
(OTP) ne salje `redirect_to`, pa vodi na `site_url`; dok je `site_url` jos `lektahr.netlify.app`,
korisnik koji se prijavi na `lekta.hr` dobiva sesiju na drugom originu. Stanje 4. 10. 2026.: popis
redirecta vec sadrzi `https://lekta.hr/**` i `https://www.lekta.hr/**` (uz Katedrine unose), a
`site_url` je jos `https://lektahr.netlify.app`; mijenja se nakon spajanja ovog PR-a, uz vlasnikovu
rijec, i odmah se provjerava prijava e-mailom na `lekta.hr`.

Od ovog PR-a prijava e-mailom i povezivanje e-maila salju `redirect_to` za origin i stranicu s koje
je prijava zatrazena (query parametar, `src/auth/session.ts`), pa link vraca na isti origin
(Codex runda 2, nalaz 4). Zato redoslijed koraka 5:

1. potvrditi HTTPS novog odredista (`curl -sI https://lekta.hr` daje 200, ispravan certifikat)
   PRIJE promjene `site_url`;
2. u istom operativnom koraku: `site_url` na `https://lekta.hr` i na popis dopustenih redirecta
   dodati i `https://lektahr.netlify.app/**`. Dok je stari host `site_url`, on je dopusten implicitno;
   kad prestane biti, bez izricitog unosa bi se `redirect_to` sa starog hosta odbio i link bi vodio
   na `lekta.hr`, dakle na drugi origin od korisnikovog stanja;
3. odmah provjeriti prijavu e-mailom na oba hosta: link vraca na host s kojeg je zatrazen.

## Staging

Staging build (`LEKTA_SITE_ORIGIN=https://lekta-staging.netlify.app`) prepisuje `sitemap.xml` i
`robots.txt` na svoj origin i dobiva `Disallow: /` (`rewritePublicSeo` u `scripts/site-origin.mjs`,
Codex nalaz 1 na #273). Javni su samo `lekta.hr` i, za povratak, `lektahr.netlify.app`.

## Kontakt adresa

Odluka vlasnika 4. 10. 2026.: javna kontakt adresa je `support@lekta.hr` (prije
`lekta.kontakt@gmail.com`) u `src/config/production-config.ts`, `data/legal/provider.json` i
footeru statickih stranica. Prosljeduje se na vlasnikov Gmail kroz Email Routing, pa ovaj PR smije
na produkciju tek kad Email Routing radi i testni mail na `support@lekta.hr` stigne.

## Zatecen nalaz: produkcija starija od repoa (T20/T84)

CORS proba 4. 10. 2026. nakon postavljanja `ALLOWED_ORIGIN`: deployani `faculty-request` (verzija
13) vraca `Access-Control-Allow-Origin: *`, dok `supabase/functions/faculty-request/index.ts` u repou
odabire origin s popisa. Ostale probane funkcije (`profile-rules`, `repair-docx`, `source-check`)
vracaju trazeni origin.

`npm run deploy-drift` nad produkcijom (isti dan, samo citanje) usporedjuje POSTOJANJE funkcija, ne
sadrzaj: repo 27, deployano 19; samo u repou su `client-error`, `field-render`, `integrity-check`,
`preflight-result`, `preflight-start`, `process-bonus-outbox`, `repair-local-claim` i
`repair-local-status`. Razliku sadrzaja kao kod `faculty-request` alat ne vidi, pa nije izmjerena za
ostale deployane funkcije.

Deploy Edge funkcija nije dio promjene domene; ide kao zasebna stavka samo uz vlasnikovu rijec.

## Povratak

- Do koraka 6 nista javno ne pokazuje na `lekta.hr`; povratak je brisanje zapisa.
- Nakon koraka 6: u Netlifyju ukloniti `lekta.hr` kao primarnu domenu; `ALLOWED_ORIGIN` i dalje
  sadrzi oba origina, pa backend radi na obje adrese.
- `LEKTA_SITE_ORIGIN` u kodu se vraca revertom PR-a iz koraka 7.

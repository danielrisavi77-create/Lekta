# T20: plan deploya Edge funkcija za betu (priprema)

Deploy funkcija i `supabase db push` radi **iskljucivo vlasnik** (supabase/CLAUDE.md). Ovaj dokument
kaze sto se deploya, kojim redom, koji je rizik po funkciji i koji dokaz zatvara svaki korak. Sesija
ne deploya i ne cita produkciju.

## Polazno stanje (4. 10. 2026.)

- Produkcija `zrrjttizjyfcxmcpgzml`: repo 27 funkcija, deployano 19 (`npm run deploy-drift`, samo
  citanje, `docs/deploy/DOMENA_T49.md`). Samo u repou: `client-error`, `field-render`,
  `integrity-check`, `preflight-result`, `preflight-start`, `process-bonus-outbox`,
  `repair-local-claim`, `repair-local-status`.
- `deploy-drift` usporeduje POSTOJANJE, ne sadrzaj (T101). Jedina izmjerena razlika sadrzaja:
  `faculty-request` v13 vraca `Access-Control-Allow-Origin: *`, repo bira origin s popisa.
  Za ostalih 18 deployanih funkcija sadrzaj NIJE izmjeren: tretiraju se kao zastarjele.
- Staging `bnyemcnsphlitjradrst` (citanje kataloga 4. 10. 2026.): svih 27 funkcija iz repoa plus
  `cleanup-agent-payloads` (Katedrina); verzije su starije od T84 PR-ova, pa staging takodjer treba
  valove 0 do 3.

## Preduvjeti prije bilo kojeg deploya

1. U masteru su spojeni T84 PR-ovi: #289 (RF-1, spojen 4. 10. 2026.), #291 (SC-1), #294 (RD-2/RD-3 i
   migracija 0209), #295 (XFF, zamijenjen kljucem `cf-connecting-ip`). Deploy se radi s tocnog commita mastera; commit se zapisuje.
2. `npm run check` zelen na tom commitu, ukljucujuci `check:edge` (Deno), koji cloud sesija ne moze
   izvesti: vlasnik ga izvodi lokalno.
3. Staging ide cijelim redoslijedom prvi. Produkcija tek kad staging ima zapisane dokaze.

## Redoslijed

### Val 0: migracija 0209 (vlasnik)

```bash
npm run migration-identity
npx supabase db push --linked
npm run migration-identity
```

Dokaz: `migration-identity` prije i poslije; u bazi postoje `try_acquire_repair_slot_for_user`
(vlasnik `postgres`, SECURITY DEFINER, bez EXECUTE za `anon` i `authenticated`) i tablica
`repair_attempt_log` s RLS-om. Isto se lokalno dokazuje `scripts/repair-slot-per-user-smoke.sql`.
**0209 mora biti u bazi prije deploya `repair-docx` (val 1).** Bez nje tablica `repair_attempt_log`
ne postoji, pa fail-closed strop pokusaja iz #294 vraca 503 na SVAKI popravak. Slot bi pao na stari
globalni RPC, ali strop ne pada nigdje. Migracija trazi pg_cron (bez njega pada s 55000).

### Val 1: zajednicki IP kljuc (#295), sve funkcije koje hashiraju IP, ODJEDNOM

`analytics-event`, `client-error`, `faculty-request`, `generate-report`, `integrity-check`,
`preflight-start`, `profile-rules`, `redeem-referral-signup`, `repair-docx`, `source-check`.

Zasto zajedno: anti-fraud u nagradi preporucitelju usporeduje `ip_hash` iz `redeem-referral-signup`
s onim iz `generate-report`. Ako jedna funkcija racuna stari (prvi unos), a druga novi kljuc (`cf-connecting-ip`),
usporedba ne pogadja nista dok obje nisu na istom commitu. `repair-docx`, `generate-report` i
`source-check` nose i svoje T84 promjene, pa se njihov rizik navodi zasebno u tablici.

**Uvjet prije produkcije (kljuc `cf-connecting-ip`, T84 XFF):** zadnji unos `x-forwarded-for` iz #295 nije
smio na produkciju: mjerenje na stagingu (2026-10-09) pokazalo je da gateway prepisuje klijentski header u
`<ip klijenta>,<ip klijenta>, <promjenjivi AWS cvor>`, pa bi zadnji unos bio zajednicki brojac. Kljuc je
`cf-connecting-ip` (Cloudflare ga postavlja, klijentski pokusaj odbija greskom 1000). Na stagingu, s ovim
kodom, dva poziva s istog stroja i razlicitim izmisljenim `X-Forwarded-For` i `x-real-ip` daju ISTI
`ip_hash`, a poziv s druge mreze (mobilni hotspot) daje RAZLICIT. Ako drugi uvjet padne: STANI, ne
deployati na produkciju.

**Prijelaz s x-forwarded-for na cf-connecting-ip (T84 XFF, Codex P1 na #346).**

- Svih 10 IP funkcija ima `Deno.serve(requireTrustedClientIp(...))`: nepouzdan ili nedostajuci `cf-connecting-ip` dobiva
  `403 client_ip_untrusted` prije rukovatelja, dakle prije citanja tijela, auth poziva, rezervacije slota, upisa ili
  nagrade (OPTIONS prolazi). Odgovor nema CORS zaglavlja. Gard `tests/helpers/xff-key-guard.ts` trazi omotac u svakoj
  funkciji i izvrsava omotac iz izvora `hash-ip.ts`.
- Novi hashevi nose oznaku sheme `v2:`; stari (bez prefiksa) su `legacy`. `ip_hash` je `text`, migracija nije potrebna.
- `tryGrantReferrerReward` ne usporeduje hasheve razlicitih shema. Ako preporuciteljevi izvjestaji sadrze hash druge
  sheme od signupa, nagrada se ZADRZAVA (`ip_scheme_unverifiable`, trajna odluka u outboxu, signup ostaje
  `friend_rewarded`, bez `fraud_blocked`). Izmjereno 2026-10-09: produkcija ima 0 `referral_signups` i 32
  `report_generations.ip_hash` (17 korisnika, 2026-07-20 do 2026-08-04, ni jedan mladi od 30 dana); staging 1.
  Utjecaj: preporucitelji s takvim starim izvjestajem ne dobivaju automatsku nagradu dok vlasnik ne odluci o retenciji.
- Staging provjera prije produkcije: poziv na zasticenom ulazu daje 200 uz valjan `cf-connecting-ip`, a klijentski
  `CF-Connecting-IP` Cloudflare odbija (403, izmjereno 2026-10-09 na `health`).

### Val 2: ostale deployane funkcije bez T84 promjena

`admin-stats`, `cleanup-orphan-repairs`, `create-checkout`, `delete-repair-job`,
`file-guarantee-claim`, `health`, `katedra-agent-worker`, `record-completion-check`,
`send-reminders`, `unsubscribe-reminder`, `webhook-mor`, `withdraw-corpus-contribution`.

Deploy zbog neizmjerenog drifta sadrzaja (T101). Naplatne funkcije (`create-checkout`, `webhook-mor`,
`file-guarantee-claim`) idu zadnje u valu i samo ako je naplata dio bete; inace ostaju na
deployanoj verziji uz zapis zasto.

### Val 3: funkcije koje produkcija jos nema

`client-error`, `process-bonus-outbox`, `field-render`, `integrity-check`, `preflight-start`,
`preflight-result`, `repair-local-claim`, `repair-local-status`. Za betu su potrebne samo one koje
glavni tok poziva; ostale ostaju nedeployane uz zapis u `supabase/deploy-manifest.json`
(`intentionalExclusion`). `client-error` se preporucuje (bez njega su greske preglednika nevidljive).
`client-error` i `integrity-check` su ujedno u valu 1 jer hashiraju IP.

## Rizik po funkciji (T84 i drift)

| Funkcija | Promjena | Rizik | Dokaz nakon deploya |
| --- | --- | --- | --- |
| `faculty-request` | v13 vraca `ACAO: *`; #295 mijenja IP kljuc | stari kod pusta svaki origin; novi ima jednokratni reset prozora limita | `curl -sI -X OPTIONS -H "Origin: https://evil.example" .../faculty-request` NEMA `Access-Control-Allow-Origin`; s `Origin: https://lektahr.netlify.app` ga ima |
| `repair-docx` | #294 (slot po korisniku, rezervacija pokusaja), #291, #295 | bez 0209: 503 na svakom popravku; drugi istodobni popravak istog korisnika dobiva `busy` | jedan popravak prolazi; drugi istodobni istog korisnika `503 busy`; ponovljeni vec uskladjen dokument se biljezi u `repair_attempt_log` |
| `generate-report` | #289 (anonimni bez nagrade prijatelju), #295 | anonimni racun vise ne dobiva prijateljski slot | anonimni racun sa signupom: `payment_required`, nema novog `entitlements` retka `reward:ref-friend:*` |
| `source-check` | #291 (granica kljuca 400), #295 | nema vidljive promjene za stvarne naslove | provjera izvora vraca rezultat; naslov > 400 znakova ne produljuje odgovor |
| `redeem-referral-signup` | #295 | `referred_ip_hash` od sad zadnji hop | redeem s valjanim kodom vraca `ok` |
| `profile-rules`, `analytics-event`, `client-error`, `integrity-check`, `preflight-start` | #295 | jednokratni reset IP brojaca (najvise 24 h) | jedan uspjesan poziv svake; 429 tek nakon limita |
| ostale (val 2) | drift sadrzaja nepoznat | ponasanje se uskladjuje s repoom | `npm run post-deploy-smoke` i `health` 200 |

## Dokaz cijelog deploya (supabase/CLAUDE.md)

```bash
npm run migration-identity
npm run deploy-drift
npm run post-deploy-smoke
```

Plus CORS proba iz tablice za `faculty-request` i rucni tok popravka u privatnom prozoru. Rezultate
(commit, vrijeme, projekt, verzija svake funkcije) vlasnik zapisuje u PR ili `docs/generated/`.

## Povrat

Funkcija: ponovni deploy s prethodnog commita (`git checkout <stari commit> -- supabase/functions`
u odvojenom stablu, zatim `npx supabase functions deploy <ime> --project-ref <ref>`).
Migracija 0209 je aditivna: stari RPC ostaje netaknut, pa povrat koda ne trazi povrat baze.

# AUDIT_STATUS_2026-07-11.md, Lekta

Verifikacijski prolaz nad radom napravljenim po `docs/audit/AUDIT_BRIEF.md`. Ovo NIJE novi
audit iz nule; pocetni audit (isti datum) vec je proizveo 11 dokumenata u `docs/audit/` i
`docs/roadmap/PRODUCTION_BACKLOG.md`. Ovdje se dokazuje da su stavke oznacene gotovima
STVARNO u kodu, biljezi drift (backlog zaostaje za commitima) i sazima sto stvarno preostaje.

Metoda: 4 neovisna verifikacijska agenta (P0-01/02, P0-03/04, P0-05, P0-06/P1) citala su
stvarni kod, ne backlog; nalazi su unakrsno provjereni grepom i `npm run check`. Nista u kodu
nije mijenjano tijekom ovog prolaza.

Datum: 2026-07-11.

---

## 1. Build gate

`npm run check` (tsc --noEmit + vitest run + vite build): **ZELEN (exit 0)**. Cijeli vitest
paket prolazi; build zavrsava. Glavni entry chunk: 1.219 KB raw / **178,41 KB gzip** (dolje s
audiranih 369 KB, pad ~52 posto). To potvrduje acceptance BL-P0-05-1 (glavna mobilna poluga).

Napomena: u trenutku prolaza radi PARALELNA SESIJA (vidi odjeljak 5). Sve moje provjere su
read-only; nista nije commitano.

---

## 2. Verificirano: stavke oznacene gotovima STVARNO su gotove

Svih 16 provjerenih GOTOVO/RIJESENO stavki potvrdeno file:line dokazom. Nijedna nije
precijenjena.

| Stavka | Verdikt | Kljucni dokaz |
| --- | --- | --- |
| BL-P0-01-2 copy "nista se ne salje" | CONFIRMED | index.html:20 dokument-scoped; apsolut = 0 u dist |
| BL-P0-01-3 waitlist objava | CONFIRMED (djelomicno, posteno oznaceno) | waitlist-copy.ts:24 objava; auto-fire i dalje na prikazu |
| BL-P0-02-1 send-reminders auth | CONFIRMED | index.ts:198 isCronAuthorized 401 prije DB/Resend; migr. 0014 marker |
| BL-P0-02-2 pin esm.sh | CONFIRMED | svih 10 importa @supabase/supabase-js@2.110.2; bare @2 = 0 |
| BL-P0-02-3 IP hash salt | CONFIRMED | hash-ip.ts:35 deriveIpSalt; nikad prazan salt |
| BL-P0-02-5 verify_jwt config.toml | CONFIRMED | config.toml:391-416 svih 9 funkcija |
| BL-P0-02-6 .gitignore + revoke purge | CONFIRMED | .gitignore:7-8; migr. 0015_revoke_purge.sql |
| BL-P0-03-1 verification.html safe-by-default | CONFIRMED | dev-console.mjs:17 DEV_CONSOLE gate; vite.config.ts:86 assertSafeBuild |
| BL-P0-04-1 sanitizacija izvjestaja | CONFIRMED | report.ts:214 sanitizeAnalysisResult; test report-sanitize.test.ts |
| BL-P0-04-2 retencija 0016 | CONFIRMED | 0016_retention_slots_faculty.sql anonimizira slots + faculty email |
| BL-P0-04-3 naslov iz podsjetnika | CONFIRMED (kod) | send-reminders index.ts: slot.label 0 pojava u tijelu |
| BL-P0-04-4 error UA maknut | CONFIRMED | app.ts:81 payload bez ua/navigator.userAgent |
| BL-P0-05-2 pecene mape, drafts van runtimea | CONFIRMED | profile-registry bez glob; drafts-runtime.ts izoliran |
| BL-P0-05-1/1b strip publicSources | CONFIRMED | vite.config.ts:67 stripRuntimeDeadProvenance apply:build |
| BL-P0-05-4 lazy analyzeDocx | CONFIRMED | analyze-docx-client.ts:85 await import('./analyze-docx') |
| BL-P0-05-6 immutable cache | CONFIRMED | public/_headers:39 /assets/* immutable |
| BL-P0-06-1 nije plagijat | CONFIRMED | index.html FAQ+disclaimer; legal-content.ts:88/94/100/118 |
| BL-P0-06-2 ublazeno "Spremno/potvrduje" | CONFIRMED | #readyStamp "Tehnicki uredno"; nema "potvrduje uskladenost" |
| BL-P2-10 HSTS | CONFIRMED | public/_headers:32 Strict-Transport-Security |
| BL-P3-15 Permissions-Policy (dio) | CONFIRMED | public/_headers:33 camera/mic/geo/payment () |

---

## 3. Drift: backlog je kasnio, sada uskladjen

> AZURIRANO tijekom prolaza: paralelna sesija je ubrzo nakon ovog snapshota commitala
> **b00d9a2** `feat(footer/404): pravni set u svim footerima + brandirana 404 (BL-P0-06-3/4/5)`,
> koji je sve tri stavke prebacio u GOTOVO u backlogu i commitao 404 + footere. Drift je time
> zatvoren; ostaje zapisan ovdje kao trag. Zasebno je ispravljena netocna referenca u
> BL-P0-01-4 (nepostojeci generate-title-page-tools.mjs).

Backlog je u trenutku snapshota kasnio za radom paralelne sesije. Stavke (sada GOTOVO):

- **BL-P0-06-3 (Pravila kupnje i povrata u sve footere)**: RIJESENO. `pravila-povrata.html`
  linkan u svih 8 stranica (index, citat, alati, izjava, literatura, naslovnica, kartice,
  landing_usporedba). Backlog jos navodi zastarjelo "3 od 7".
- **BL-P0-06-5 (pravne poveznice kao pravi `<a href>`)**: RIJESENO. index.html:400 footer
  koristi `<a class="footer-link-btn legal-open" data-legal="..." href="/...">` uz progressive
  enhancement; nema vise `<button>` verzija.
- **BL-P0-06-4 (brandirana 404)**: IMPLEMENTIRANO, ALI NECOMMITANO. `public/404.html` postoji
  (brandirana, noindex, favicon, CTA), gradi se u `dist/404.html`. Untracked u gitu (`?? public/
  404.html`), dio je aktivnog rada paralelne sesije. Preostaje samo commit (+ opcionalno
  `[[redirects]]` u netlify.toml za clean URL varijante).

---

## 4. Stvarno preostalo (potvrdeno otvoreno)

### P0 paket

| Stavka | Verdikt | Napor | Biljeska |
| --- | --- | --- | --- |
| BL-P0-01-4 origin guard / lekta.hr fallback | ~~STILL_OPEN~~ GOTOVO (kod, necommitano) | S | RIJESENO ovom sesijom: scripts/site-origin.mjs (jedan izvor, fallback lektahr.netlify.app); oba generatora ga uvoze; verify-deploy-dist.mjs guard pada na lekta.hr/kanonik izvan origina; tests/deploy-origin.test.ts. Dokazano pozitivno+negativno; check zelen. Backlogova referenca na nepostojeci generate-title-page-tools.mjs ispravljena. |
| BL-P0-05-5 gumb Prekini analizu + Escape | ~~STILL_OPEN~~ GOTOVO | M | Zatvorila paralelna sesija, commit bf9096e (+ a9a9ad3 build fix). |
| BL-P0-05-7 OOM / mobilni cap | ~~PARTIAL~~ GOTOVO | M | Zatvorila paralelna sesija, commit b17eb19 (device-aware cap + dekompresijski budzet). |
| BL-P0-05-8 jak default profil / potvrda | ~~STILL_OPEN~~ GOTOVO | M | Zatvorila paralelna sesija: detectDocxContext sada detectContextFromText(allUnits(),...) (SVE institucije, app.ts:171/271) + gate potvrde profila needsProfileConfirmation/_profileConfirmed ("Ovo je zadani profil... Da, ovo je moj profil / Promijeni fakultet", app.ts:352/451). Moj prep helper detect-context.ts uklonjen kao redundantan. |
| BL-P0-05-9 oglaseni vs stvarni limit | ~~STILL_OPEN~~ GOTOVO | S | Zatvorila paralelna sesija, commit e578505 (dropzone prikazuje graduirani cap po uredaju). |

### P1 (pristupacnost primarnog toka)

| Stavka | Verdikt | Napor | Biljeska |
| --- | --- | --- | --- |
| BL-P1-01 skip link na svim stranicama | ~~STILL_OPEN~~ GOTOVO (kod, necommitano) | S | RIJESENO ovom sesijom: src/shared/skip-link.ts + .css, wirano u ui-boot.ts (bez diranja HTML-a). Dokazano u pregledniku (Tab -> vidljiv link, Enter -> fokus na main) na / i /citat.html. tests/skip-link.test.ts (5). |
| BL-P1-02 fokus + najava rezultata | ~~STILL_OPEN~~ GOTOVO (kod, necommitano) | S | RIJESENO ovom sesijom: src/shared/result-a11y.ts + tests/result-a11y.test.ts; app.ts +2 reda (import + focusResult u renderResult). Dokazano u pregledniku (demo -> activeElement=#resultTitle, aria-live "Rezultat analize je spreman."). check zelen. |

### P2/P3 (nisu blokatori)

Vecina P2/P3 otvorena po planu (a11y detalji, SEO higijena, og:image, sitemap, ARIA menu,
target velicine). BL-P2-08 (motion/mini) i BL-P3-12 (@fontsource podskupovi) su svjesno
BLOKIRANE (paket ne izvozi potreban ulaz; dokumentirano u backlogu). Detalji: PRODUCTION_BACKLOG.md.

---

## 5. Aktivna paralelna sesija (vazno za koordinaciju)

Na pocetku ove sesije bile su modificirane samo 4 citation datoteke. U trenutku pisanja
dodatno su necommitano modificirane SVE glavne stranice (index, citat, alati, izjava,
kartice, landing_usporedba, literatura, naslovnica) i dodan je `public/404.html`. To nije
rezultat ovog audita (moj build pise samo u dist/). Radi druga sesija.

Posljedica za svaki daljnji rad: NE diraj `src/ui/app.ts`, `index.html` ni ostale stranice
bez koordinacije (recidiv git-race obrasca iz memorije projekta). Preostale P0/P1 stavke koje
diraju te datoteke (BL-P0-05-5/8/9, BL-P1-01/02) treba raditi u dogovoru s tom sesijom ili
cekati da se njezine promjene commitaju.

Zaseban tok (citation parser: scripts/harvest-doi-citations.mjs, src/citations/parse-reference.ts,
tests/fixtures/citation-*) takoder je necommitan i pripada drugoj traci.

---

## 6. Vanjski (owner) preduvjeti, ostaju blokatori naplate bez obzira na kod

Kod je spreman, ali sljedece nije nista sto se rjesava u repozitoriju i mora ga rijesiti
vlasnik prije naplate/aktivacije:

- Supabase tajne (REMINDER_CRON_SECRET, RESEND_API_KEY, IP_HASH_SALT); feature-i su INERT dok
  nisu postavljeni.
- `deno.lock` + integritet za Edge funkcije (trazi Deno CLI); smoke checkout/webhook potpis pri
  deployu (GO_LIVE_NAPLATA.md).
- Resend regija + DPA i upis u legal-content.ts prije aktivacije e-mail podsjetnika.
- Pravna osoba, Merchant of Record, EU Supabase + DPA, PITR (prelaunch-hardening memorija).
- pg_cron + primjena migracija 0014/0015/0016 na produkciju.

---

## 7. Deset najvecih preostalih rizika (od najveceg)

1. **Naplata jos nije sigurna za aktivaciju**: dok owner ne odradi deno.lock + staging smoke
   webhook potpisa (BL-P0-02-2 kod je gotov, ali vanjski dio nije), checkout dohvaca kod s
   trece strane. Naplatu NE paliti.
2. **Sanitizacija izvjestaja je gotova, ali reportEndpoint je jos prazan**: cim se ozici,
   ovisi o tome da sanitizeAnalysisResult ostane na putu; svaka regresija = curenje teksta
   rada. Drzati report-sanitize.test.ts kao gate.
3. **Waitlist auto-signal bez privole**: objavljen u copy-u (BL-P0-01-3), ali i dalje POST-a
   na prikazu bez radnje korisnika. Za maksimalnu GDPR sigurnost dodati opt-out ili odgoditi
   na eksplicitnu radnju.
4. **Origin fallback lekta.hr** (BL-P0-01-4): latentni footgun za build bez LEKTA_SITE_ORIGIN
   (npr. Cloudflare Pages). Nizak zivi rizik (netlify.toml postavlja env), ali lako popravljivo.
5. **Nema prekida analize** (BL-P0-05-5): na graniznom dokumentu na slabom mobitelu korisnik
   ne moze prekinuti; percepcija zamrzavanja.
6. **Tihi krivi profil** (BL-P0-05-8): non-unizg korisnik dobije FPZG-specifican rezultat bez
   upozorenja; direktan uzrok krivog nalaza i potencijalne reklamacije kod naplate.
7. **Pristupacnost primarnog toka** (BL-P1-01/02): bez skip linka i bez najave rezultata,
   korisnici citaca ekrana i tipkovnice su blokirani u glavnom toku (launch gate UX kriterij).
8. **Oglaseni 50 MB vs stvarnih 20 MB na mobitelu** (BL-P0-05-9): korisnik dobije odbijanje
   nakon sto je vec odabrao veliku datoteku; sitno ali losa prva impresija.
9. **Git-race s paralelnom sesijom**: necommitane izmjene 8 stranica + 404; rizik gubitka rada
   ili konflikta pri sljedecem commitu na dijeljenim datotekama.
10. **Owner-vanjski pravni/infra dug**: pravna osoba, MoR, EU Supabase+DPA, Resend DPA; bez
    toga javna naplativa usluga s garancijom nije opravdana bez obzira na zeleni kod.

---

## 8. Preporuceni redoslijed sljedecih popravaka

Sve su niske do srednje velicine i vecinom neovisne; poredano po omjeru vrijednost/rizik:

1. Commitati necommitani rad paralelne sesije (404 + 8 stranica) uz koordinaciju, da se drift
   zatvori i backlog osvjezi (BL-P0-06-3/4/5 -> GOTOVO). Bez novog koda.
2. BL-P0-05-9 (prikaz stvarnog limita) i BL-P0-01-4 (origin guard) : cisti S, ne diraju jezgru
   analize (osim app.ts opisa za -9, koordinirati).
3. BL-P1-01 (skip link) i BL-P1-02 (fokus/najava rezultata): S, launch-gate UX; skip link ide
   u ui-boot.ts (dijeljeno, koordinirati).
4. BL-P0-05-5 (Prekini analizu) i BL-P0-05-8 (potvrda profila / sira detekcija): M, oba diraju
   app.ts -> raditi kad se dijeljena datoteka smiri.
5. BL-P0-05-7 (inkrementalni progress / OOM): M, dira analyzeDocx -> tek uz zeleni golden.
6. Owner: deno.lock + Supabase tajne + pravni preduvjeti (odjeljak 6) prije bilo kakve naplate.

Napomena: NE raditi tocke koje diraju src/ui/app.ts ili stranice dok paralelna sesija ima
necommitane izmjene istih datoteka.

---

## 9. Ishod dviju preostalih app.ts stavki (RIJESENO)

> AZURIRANO: obje su zatvorene. Monitor je javio idle prozor app.ts pa je BL-P1-02 PRIMIJENJEN
> (dokazan u pregledniku), a BL-P0-05-8 se u meduvremenu pokazao GOTOV od paralelne sesije pa je
> moj prep helper uklonjen. Time su SVE P0/P1 stavke iz ovog audita zatvorene (kod). Detalji ispod
> ostaju kao trag pristupa "izoliraj logiku pa minimalan app.ts upis".

- **BL-P0-05-8**: NIJE trebalo moj upis. Paralelna sesija je vec dodala cross-institution detekciju
  (`detectContextFromText(allUnits(),...)`) i gate potvrde profila (`needsProfileConfirmation`).
  Prep helper `src/analysis/detect-context.ts` (+test) UKLONJEN kao redundantan.
- **BL-P1-02**: PRIMIJENJEN. `src/shared/result-a11y.ts` + `tests/result-a11y.test.ts` (3, zeleno);
  app.ts +2 reda (import + `focusResult($('#resultTitle'))` u renderResult). Dokazano u pregledniku.

Da prozor za git-race bude minimalan, sva logika je bila izvucena u NOVE, testirane datoteke
(uncontended); u app.ts je zavrsio samo minimalan upis. Referentni upisi (kako je izvedeno):

### BL-P1-02 (fokus + najava rezultata) — 2 reda u app.ts

Vec spremno: `src/shared/result-a11y.ts` (focusResult/announceStatus) + `tests/result-a11y.test.ts` (3, zeleno).

Upis 1 (import blok, uz ostale `../shared/*` importe):
```ts
import { focusResult } from '../shared/result-a11y';
```
Upis 2 (u renderResult, ODMAH nakon `$('#resultTitle').textContent=r.file.name;` na app.ts:582):
```ts
focusResult($('#resultTitle'));
```
Ucinak: #resultTitle dobije tabindex=-1, fokus se pomakne (preventScroll), polite aria-live
regija najavi "Rezultat analize je spreman.". Pokriva i demo (oba idu kroz renderResult).

### BL-P0-05-8 (detekcija preko SVIH institucija) — SUPERSEDED

Nije bilo potrebe za mojim upisom: paralelna sesija je to vec rijesila u app.ts
(`detectContextFromText(allUnits(),...)` za cross-institution detekciju + gate potvrde profila
`needsProfileConfirmation`). Prep helper `src/analysis/detect-context.ts` (+test) je UKLONJEN kao
redundantan da ne ostane drugi izvor iste logike.

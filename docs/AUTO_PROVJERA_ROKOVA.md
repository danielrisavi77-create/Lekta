# Lekta · Auto-provjera (3 lece) za rokove i pravila

Kako se cinjenica (npr. rok predaje) ili pravilo pusta live BEZ da za svaki ceka rucnu
potvrdu, a da proizvod i dalje ne laze. Vlasnikova odluka (2026-07-09): auto-provjeren
podatak ide live, ali ODVOJENO i iskreno oznaceno od ljudske potvrde.

Vjezba se veze na [VERIFICATION_PIPELINE.md](VERIFICATION_PIPELINE.md) (disciplina za bodovana
pravila) i CLAUDE.md (bez izmisljanja; bodovano samo iz sluzbenih izvora).

## Dva stupnja povjerenja (nikad se ne mijesaju)

- `confirmed: true` je ZLATNI standard: covjek je pogledao izvor i potvrdio. Rezerviran za
  ljudski pass, kao `verifiedBy` u pipelineu pravila.
- `verification.autoVerified: true` je AI visestruka provjera. Smije ici live, ali UI to
  iskreno oznaci ("automatski provjereno, ceka zavrsnu rucnu potvrdu"). Vlasnik naknadno
  flipne na `confirmed: true` kad pregleda.

Motor prikaza (`findUpcomingDeadline` -> `isDeadlineTrusted`) tretira oba kao "smije se
prikazati", ali nosi zapis pa UI zna koji je koji. Neprovjereno (`confirmed:false` bez
`autoVerified`) se NE prikazuje.

## Zasto "3 lece", a ne "3 puta"

Tri ista prolaza hvataju samo tranzientne greske (krivo prepisan datum, OCR, zastarjeli
dohvat) jer stroj moze biti samouvjereno kriv na isti nacin sva tri puta. Snaga je u tri
RAZLICITE lece:

1. **Ekstrakcija** - dohvati mjerodavan izvor, izvuci cinjenicu doslovno.
2. **Adversarijalno osporavanje** - svjeze dohvati i pokusaj OBORITI: je li ovo doista ta
   cinjenica (npr. rok predaje, a ne datum obrane)? Prava godina i program? Postoji li
   noviji dokument koji je ovaj zamijenio? Je li izvor mjerodavan (hijerarhija autoriteta
   iz VERIFICATION_PIPELINE.md)?
3. **Unakrsna ili interna provjera** - potvrdi drugim nezavisnim signalom; ako ga nema,
   barem interna konzistentnost (npr. rok predaje mora biti prije pripadne obrane).

Podatak je `autoVerified` tek ako sve tri lece prolaze bez proturjecja. `passes` biljezi
broj primijenjenih leca.

## Iskrena pravila (inace auto-provjera postaje teatar)

- **Jedan izvor nije nezavisna potvrda.** Ako konkretni podatak postoji samo u jednom
  dokumentu (npr. FPZG datumi su samo u PDF Odluci, HTML ih ne navodi), leca 3 je interna
  konzistentnost, ne druga potvrda. Zapisi to u `verification.note` i ne prenapuhuj.
- **Izvedeno nije navedeno.** Ako datum RACUNAS (npr. "N dana prije obrane" + termin), to je
  derivacija, ne doslovan datum. Ili ga ne stavljaj, ili ga jasno oznaci kao izvedeno.
- **Kad odbiti.** Ako mjerodavan rok nije javno dostupan (iza logina, iza ModSecurity,
  samo u nedohvatljivom PDF-u), NE fabriciraj. Prazno je posteno; pogresan rok kosta
  studenta rok. Zabiljezi kao "data-blocked" i predaj vlasniku. Ovo je leca 2 koja radi.
- **Cinjenice vs prosudbe.** Loop je pouzdan za tvrde cinjenice (datum iz datirane odluke).
  Za BODOVANA pravila (font, citiranje, autoritet) auto-provjera je najvise PRED-filter:
  ljudski `verifiedBy` ostaje obavezan (vidi VERIFICATION_PIPELINE.md, sekcija 4). Ne
  flipaj scored pravilo na temelju samog loopa.

## Kako se zapisuje (rokovi)

Shema: `DeadlineVerification` u [src/submission/types.ts](../src/submission/types.ts).

```jsonc
"verification": {
  "autoVerified": true,
  "passes": 3,
  "checkedAt": "2026-07-09",       // ISO datum provjere
  "sources": ["<url1>", "<url2>"], // dokumenti koristeni u lecama
  "note": "3 lece: (1)... (2)... (3)...; OPREZ: <caveat o jednom izvoru / derivaciji>"
}
```

Uz `confirmed: false`. Motor: `isDeadlineTrusted` u
[src/submission/deadline-registry.ts](../src/submission/deadline-registry.ts). Oznaka u UI-u:
`renderDeadlineReminderToggleIfAvailable` u
[src/ui/deadline-reminder-toggle.ts](../src/ui/deadline-reminder-toggle.ts).

## Alat

[scripts/gen-deadlines.mjs](../scripts/gen-deadlines.mjs) dosljedno proizvodi ispravno
oblikovane unose (siguran en-dash u nazivima programa, jednolik `verification` zapis).

```bash
node scripts/gen-deadlines.mjs           # pregled predlozenih unosa (nista ne mijenja)
node scripts/gen-deadlines.mjs --write   # spoji u academic-deadlines.json, cuvajuci confirmed:true
```

Dodavanje fakulteta = novi unos u `BATCHES`. `deadlineDate` je ROK PREDAJE, ne datum obrane.

## Odradeni primjeri

- **FPZG diplomski (PROSAO).** Odluka KLASA 007-04/25-02/02 (23.10.2025) izrijekom daje
  "zakljucavanje popisa" = rok predaje uvezanog rada. Leca 2 potvrdila tumacenje, godinu,
  tri studija i da nije zamijenjeno; leca 3 interna konzistentnost (rok prije obrane). Jedan
  izvor (PDF) pa je caveat u `note`. -> 12 unosa `autoVerified:true`, `confirmed:false`.
- **Pravni fakultet u Zagrebu (ODBIJEN).** Javno su samo termini OBRANA (12/god), ne rok
  predaje. Referada je iza AAI logina, Pravilnik se ne da cisto dohvatiti. Izvesti rok
  predaje iz termina obrana bila bi fabrikacija. -> nista se ne upisuje; "data-blocked,
  treba vlasnikov login ili kontakt s referadom". Loop je ispravno odbio.

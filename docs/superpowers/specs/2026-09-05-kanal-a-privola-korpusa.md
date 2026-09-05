# Kanal A: prilog korpusu uz zasebnu privolu (nacrt, 2026-09-05)

> Stanje 2026-09-05, kasno popodne: IZGRADJENO iza zastavice, iskljuceno. Vlasnik je delegirao odluke ("sam napravi dio
> za Kanal A"), pa su uzete kako je predlozeno: tekst kucice iz ovog speca (`CORPUS_CONSENT_VERSION = 2026-09-05`),
> rok 36 mjeseci ili do povlacenja, anonimni racuni bez kucice, pohranjuje se izvorni dokument. Vlasnik smije tekst
> zamijeniti (nova verzija u `src/legal/corpus-consent.ts`).
>
> UKLJUCIVANJE, redom: (1) `supabase db push` s `0102_corpus_contributions.sql` (staging pa produkcija;
> `npm run migration-identity`), (2) deploy Edge funkcija `repair-docx` i `withdraw-corpus-contribution`,
> (3) tajna `CORPUS_CONTRIBUTION_ENABLED=1` na `repair-docx` (i po zelji `CORPUS_CONTRIBUTION_DAILY_CAP`, zadano 200),
> (4) `corpusContribution:true` u `DEFAULT_PRODUCTION_CONFIG` (`src/config/production-config.ts`) i deploy klijenta,
> (4a) `tests/ux/repair-panel.spec.ts:104` broji vidljive interaktivne elemente u panelu popravka (prag < 15);
> kucica dodaje tocno jedan `input` kad je zastavica ukljucena, pa prag provjeriti i po potrebi pomaknuti uz datirani
> razlog, ne tiho (nalaz druge sesije 2026-09-05; s iskljucenom zastavicom red se ne crta i test je nepromijenjen),
> (5) staging smoke po tocki 6, (6) vlasnikov dohvat: `npx vite-node scripts/corpus-pull.mts -- --out
> C:/Users/PC/Desktop/Lekta-korpus/04-prilozi --dry-run`, pa bez `--dry-run`.
>
> Sto je izgradjeno: `src/legal/corpus-consent.ts` (verzija, tekst, odluka), `src/corpus/contribution.ts`
> (pseudonimizirana kopija bez keyringa), `src/ui/corpus-consent-row.ts` (kucica), `RepairMeta.corpusConsent`,
> `repair-docx` (odluka, pozadinska pohrana, `corpusContribution` u odgovoru), `withdraw-corpus-contribution`,
> `src/report/corpus-contribution-client.ts` + gumb u "Moji popravci", migracija 0102, privatnost 1c,
> `scripts/corpus-pull.mts`; testovi za odluku, tekst, kopiju (doslovna pretraga bajtova), kucicu i klijent.
> Nije izgradjeno: automatsko brisanje po roku (36 mjeseci) kao zaseban posao, po uzoru na 0033; do tada rok
> vrijedi kroz `expires_at` i vlasnikov pull, koji povucene brise i lokalno.

## 1. Zasto

Razina dokaza A (popravak dokazan na stvarnom radu) danas stoji na 15 parova jedinica x vrsta rada iz 127
radova, svi iz vlasnikove mreze (`docs/PLAN_RAZINA_A.md`). Registar ima 131 jedinicu; 122 nema nijedan
stvaran rad. Javni repozitoriji drze PDF, a popravku treba `.docx`. Jedini kanal koji doseze sve jedinice i
raste s uporabom je onaj u proizvodu: korisnik koji vec salje dokument na popravak moze, ako zeli, dopustiti
da se pseudonimizirana kopija zadrzi za testiranje popravka. Ovo je jedini nacin da dokaz prestane ovisiti o
tome koga vlasnik osobno poznaje.

## 2. Granica koja se ne pomice

Zadrzana kopija sluzi ISKLJUCIVO mjerenju popravka forme (isti harness kao danas: `scripts/repair-real-corpus.mts`,
ovjera, ledger). Nikad se ne koristi za treniranje, generiranje ni ocjenjivanje sadrzaja (tvrdo pravilo iz
`CLAUDE.md`), ne pokazuje se drugim korisnicima i ne izlazi iz vlasnikove kontrole.

## 3. Pravni temelj i oblik privole

- Temelj: izricita privola (GDPR cl. 6. st. 1. t. a), ZASEBNA od privole za sam popravak (uvjeti koristenja,
  `TERMS_VERSION`). Popravak radi jednako s privolom i bez nje; privola ne uvjetuje uslugu i ne donosi popust
  (inace nije slobodna).
- Kucica je zadano NEOZNACENA, stoji ISPOD obvezne privole za popravak, s vlastitim tekstom i poveznicom na
  odjeljak privatnosti. Zasebna verzija teksta: `CORPUS_CONSENT_VERSION` (isti obrazac kao `TERMS_VERSION` i
  `canonicalConsentText`), server je izvor istine i odbija zastarjelu verziju.
- Povlacenje: u "Moji popravci" uz svaki posao s prilogom stoji "Povuci prilog korpusu"; povlacenje brise
  datoteku i biljezi `withdrawn_at`. Brisanje racuna brise sve priloge (cascade). Anonimni racuni (bez
  e-maila) NE dobivaju kucicu: gube pristup ciscenjem preglednika pa ne bi mogli povuci privolu (isti razlog
  zbog kojeg im se popravci brisu nakon 30 dana, `0033`).

### Nacrt teksta kucice (za odobrenje)

> Dopustam da Lekta zadrzi pseudonimiziranu kopiju ovog dokumenta za testiranje automatskog popravka
> oblikovanja. Imena, e-mail adrese i drugi osobni podaci iz metapodataka i naslovnice zamjenjuju se
> pseudonimima prije pohrane, a kljuc za povratak se ne cuva. Kopija se ne dijeli, ne koristi za nista osim
> mjerenja popravka i brisem je kad povucem privolu, a najkasnije [ROK]. Privolu mogu povuci u "Moji popravci".

### Nacrt odjeljka privatnosti (1c, iza postojeceg 1b "Automatski popravak dokumenta")

> **1c. Prilog korpusu za testiranje (zasebna, neobavezna privola).** Uz automatski popravak korisnik moze
> zasebno dopustiti da se pseudonimizirana kopija izvornog dokumenta zadrzi za mjerenje kvalitete popravka.
> Prije pohrane iz dokumenta se uklanjaju osobni podaci iz metapodataka, komentara i naslovnice (autor,
> mentor, JMBAG i slicno) i zamjenjuju pseudonimima; kljuc zamjene se ne cuva, pa se izvorni podaci ne mogu
> vratiti. Kopija se cuva do povlacenja privole, a najdulje [ROK], i ne koristi se ni za sto drugo. Privola je
> neovisna o samoj usluzi popravka i moze se povuci u "Moji popravci"; povlacenje brise kopiju.

## 4. Sto se tocno pohranjuje

| polje | vrijednost | zasto |
|---|---|---|
| datoteka | pseudonimizirani IZVORNI `.docx` (prije popravka) | harness mjeri popravak od izvornika; popravljeni je izvediv |
| gdje | privatni bucket `corpus`, staza `<yyyy-mm>/<contribution_id>.docx` | bez `user_id` u stazi: nepovezivost |
| `corpus_contributions` | `id`, `repair_job_id`, `user_id` (samo za povlacenje), `consent_version`, `profile_ref`, `work_type`, `pseudonymization` (brojevi: `dictionarySize`, `carriersCleaned`, `vacuous`), `path`, `created_at`, `withdrawn_at` | provenijencija i povlacenje |
| NIKAD | keyring (mapa pseudonim -> ime), ime datoteke, e-mail | nepovratnost |

Pseudonimizacija se radi NA SERVERU, u istom pozivu, s `src/corpus/pseudonymize.ts` (cisti TS: `node:crypto`
HMAC, regexi, `readZip`/`writeZip` koje Edge vec koristi). Sol je slucajna po prilogu i ne pohranjuje se.
Ako rjecnik ostane prazan (`vacuous`), prilog se SVEJEDNO pohranjuje ali s oznakom, jer je "prazan rjecnik"
mjera dosega, ne dokaz cistoce; vlasnik ga pri ingestu vidi (`pseudonymization.vacuous`) kao i danas.

## 5. Mehanika (iza zastavice)

- Klijent: `RepairMeta.corpusConsent?: { version: string }`; kucica postoji samo kad je build zastavica
  `LEKTA_CORPUS_CONTRIBUTION` ukljucena i korisnik nije anoniman.
- Server (`repair-docx`): `CORPUS_CONTRIBUTION_ENABLED` env; bez nje se polje ignorira i odgovor nosi
  `corpusContribution: 'disabled'`. S njom: `version !== CORPUS_CONSENT_VERSION` -> `corpus_consent_required`
  (popravak se svejedno izvrsi; prilog se ne pohrani). Pohrana ide u pozadini (`EdgeRuntime.waitUntil`) kao i
  "Moji popravci", odgovor nosi `corpusContribution: 'pending' | 'disabled'`, a sucelje NE tvrdi da je
  pohranjeno dok ishod nije poznat (isti ugovor postenja kao `storagePending`).
- Dnevni strop novih priloga (kao `REPAIR_STORAGE_DAILY_CAP`), fail-open: strop ne rusi popravak.
- Migracija `0102_corpus_contributions.sql`: tablica + RLS (select/delete-own; insert samo service role) +
  bucket `corpus` (privatan, bez javnog citanja). Idempotentna, ide iskljucivo kroz `supabase db push`.
- Povlacenje: Edge `withdraw-corpus-contribution` (ili prosirenje postojeceg brisanja posla): brise datoteku,
  postavlja `withdrawn_at`; test da nakon povlacenja datoteke nema.
- Vlasnikov ulaz: `scripts/corpus-pull.mts` (lokalno, `service_role` iz `.env.corpus`) skida nepovucene priloge
  u `Desktop/Lekta-korpus/04-prilozi/` u istom obliku kao `03-ingest` (docx + sidecar s `consent.scope:
  'product-contribution'`, `consent.version`, `document.workTypeSource`), pa dalje ide postojeci dedupe i
  mjerenje. Povuceni prilozi se pri sljedecem pullu brisu i lokalno.

## 6. Dokaz da radi (prije ukljucivanja)

- Deno test za gate: bez privole nista se ne pohranjuje; sa zastarjelom verzijom `corpus_consent_required`;
  s ispravnom verzijom `pending`. Mutacija: iskljucena zastavica + poslana privola -> `disabled`, nista u bazi.
- Test pseudonimizacije u Denu na jednom sintetickom docx: ime iz metapodataka i naslovnice ne postoji u
  pohranjenom bajtnom nizu (doslovna pretraga), keyring nije nigdje zapisan.
- Klijent: kucica neoznacena po zadanom, skrivena bez zastavice i za anonimne; `RepairMeta` bez privole ne nosi
  polje uopce.
- Staging prvi: ukljuciti, poslati jedan sinteticki rad, `corpus-pull`, ingest, pa tek onda produkcija.

## 7. Redoslijed

1. Vlasnik odobri tekst kucice, odjeljak 1c i ROK (odluke dolje).
2. Migracija + bucket (staging, pa produkcija; `npm run migration-identity` poslije).
3. Edge iza zastavice + testovi; `npm run check` (ukljucuje `check:edge`).
4. Klijent iza build zastavice + testovi.
5. Staging smoke po tocki 6; ukljucivanje na produkciji je vlasnikov potez.
6. `corpus-pull` i prvi ingest priloga; ovjera tada dobiva unose s `consent.scope: 'product-contribution'`.

## 8. Odluke za vlasnika

1. Tekst kucice i odjeljka 1c: odobriti, izmijeniti ili dati pravniku.
2. ROK cuvanja: prijedlog "do povlacenja privole, a najdulje 36 mjeseci od predaje".
3. Anonimni racuni bez kucice (prijedlog: da, jer ne mogu povuci privolu).
4. Pohranjuje se izvorni dokument (prijedlog: da; popravljeni je izvediv iz izvornika i recepta).
5. Kad se zastavica ukljucuje na produkciji.

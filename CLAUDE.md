# CLAUDE.md - ThesisReady

Operativni vodič za rad na ovom repozitoriju. Pročitaj prije bilo kakve izmjene.

## Što je ovo

Klijentska web aplikacija (Vite + TypeScript) koja u pregledniku analizira `.docx`
akademske radove i provjerava oblikovanje, strukturu, opseg i citiranje prema
službenim profilima fakulteta (FPZG i Pravni fakultet u Zagrebu). Sva ANALIZA je
lokalna: dokument se pritom ne šalje na poslužitelj. Postoji i monetizacija (paketi,
narudžbe, payment linkovi), GDPR pravni tekstovi i ugrađena QA dijagnostika.

Stack: Vite, TypeScript (strict), vitest + happy-dom, bez frontend frameworka.
Za razliku od besplatne analize, repozitorij VIŠE NIJE bez backenda: placeni
automatski popravak (`src/repair`, kad je `repairEndpoint` konfiguriran), narudžbe,
waitlist i rokovi/podsjetnici idu na živi Supabase backend (`supabase/migrations`,
`supabase/functions`). "Bez backenda" vrijedi samo za samu analizu, ne za proizvod
u cjelini.
Ovo NIJE Next.js projekt i nema veze s maturiraj.hr; ne miješaj konvencije.

## Tvrdo pravilo: Lekta nikad ne generira niti ne prepravlja sadržaj rada

Lekta smije mjeriti, provjeravati, uspoređivati s pravilima i determinističkim putem
popravljati FORMU (font, prored, margine, numeracija, format citata i slično). Lekta
nikad ne piše, ne prepravlja i ne ocjenjuje rečenice, argumentaciju ili sadržaj rada,
ni preko AI modela ni na bilo koji drugi način. Ovo nije samo namjera nego već
arhitektonska činjenica: popravak nema model ni prompt (vidi "Popravak" niže),
gramatika i pravopis su lokalni lintovi, savjetodavni, provjera citata je provjera
postojanja preko CrossRefa, nikad generiranje teksta. Svaka nova značajka mora ostati
unutar te granice.

Razlog je poslovni, ne samo etički: institucionalna prodaja fakultetima (B2B, po
ustanovi) i AI generiranje sadržaja studentskog rada se međusobno isključuju. Alat koji
samo mjeri formu prema fakultetovim vlastitim, već objavljenim pravilima, fakultet može
odobriti brzo, analogno alatu za provjeru izvornosti. Alat koji piše ili prepravlja
argumentaciju je pitanje akademskog poštenja: ide na etičko povjerenstvo, sporo se
odobrava ili se odbija. Ta granica čuva mogućnost prodaje instituciji, ne samo
pojedinačnom studentu, i vrijedi i za copy i marketing (ne obećavaj "AI piše umjesto
tebe").

### Gdje je granica: test vidljivog teksta

Pravilo iznad ne zabranjuje sve što dira dokument, nego ono što mijenja SADRŽAJ. Razlika
je mjerljiva, pa se ne rješava procjenom:

> Zahvat je dopušten ako tekst koji korisnik vidi na ekranu i u ispisu ostane isti,
> **i prije i poslije osvježavanja polja u Wordu**. Mehanika ispod smije se mijenjati:
> polja, sidra (bookmarkovi), stilovi, numeracija, relacije, dijelovi paketa.

Provjera je doslovna, ne teorijska: otvori dokument Wordom, pozovi `Fields.Update()`,
usporedi tekst prije i poslije (`scripts/word-verify/`, Tier 2 u
`docs/REAL_CORPUS_TESTING.md`). Testovi zato čitaju SPOJENI tekst odlomka, ne sirovi XML,
jer se dio ovih kvarova u XML-u uopće ne vidi (RE-57, RE-58).

Pet postojećih popravaka SMIJE mijenjati vidljivi tekst i to je namjerno, jer je svaki od
njih format, ne argumentacija: velika slova naslova (`heading-case-fixer`), hrvatska
tehnička tipografija (`croatian-typography-fixer`), kanonizacija DOI-ja
(`bibliography-repair-fixer`, `link-doi-fixer`), polje sadržaja (`toc-field-fixer`) i
nedostajući obvezni naslov (`required-section-fixer`). Svaki traži izričitu potvrdu i
nijedan ne dira rečenice tijela rada.

`required-section-fixer` je dodan 2026-08-30, odlukom vlasnika. Umeće ISKLJUČIVO natpis koji
propisuje verificirano pravilo profila (`required-section-rules` sa `sourceId`, `sourcePage` i
doslovnim citatom), nikakav sadržaj: izmjereno na jednom stvarnom radu razlika je 25 znakova, i to
naslov "ključne riječi / keywords". Rezervirani tekst i komentar umeću se samo kad ih profil
izričito traži. Granica je time ista kao za ostale: umeće se natpis koji je fakultet sam propisao,
nikad rečenica rada.

Do 2026-08-30 taj popravak nikad nije ni radio: predodabir je tražio `confidence === 'high'`, a
analiza nedostajućem dijelu po konstrukciji daje `medium` (`present ? 'high' : 'medium'`), pa je
uvjet bio neispunjiv. Nakon popravka ga je lanac odbijao uz `stale-anchor`, jer je istovremeno
INDEX_SHIFTING i ovisan o sidru; riješeno je time da sidro vrijedi uz podudaranje otiska ILI teksta
odlomka. Vidi `docs/superpowers/specs/2026-08-29-prazni-asistirani-fixeri.md`.

`toc-field-fixer` je dodan 2026-08-17, nakon što je real-corpus mjerenje pokazalo da mijenja
vidljivi tekst na 5 od 12 radova. Obrazloženje: tekst sadržaja GENERIRA Word iz polja, nije
autorov, pa je to mehanika ispod, a ne sadržaj rada.

POTVRĐENO 2026-08-19 Tier 2 oracleom (`npm run verify:word:toc`), doslovnom usporedbom teksta
prije i poslije `Fields.Update()` na dokumentu koji sadržaj dobiva prvi put: Word otvara
popravljeni paket bez popravka, svih 12 autorskih odlomaka ostaje netaknuto i prije i poslije
osvježavanja, a svih 5 stavki sadržaja izvedeno je iz STVARNIH naslova dokumenta (ništa
izmišljeno). Izuzeće više nije privremeno.

Ako se `toc-field-fixer` mijenja, ponovi tu provjeru: ona je jedini dokaz da izuzeće vrijedi.
Pazi pritom na zamku koju je sam oracle prvo imao: stavka sadržaja nosi ISTI tekst kao naslov iz
kojeg je izvedena, pa usporedba odlomaka "po članstvu" ne vidi ništa novo i lažno javi da polje
nije živo. Sadržaj se zato čita izravno iz TOC raspona.

### Dopušteno bez fakultetskog pravila (preporuke)

Popravak se smije nuditi i kad ga nijedan profil ne propisuje, ali samo kao PREPORUKA:
`violated: false`, `recommended: true`, BEZ `matchKeys`. Time se ne veže ni na jedan bodovan
check i ne može pomaknuti ocjenu. Izmišljeno pravilo je ono koje OCJENJUJE; preporuka koju
korisnik bira nije, i ne ruši argument za institucionalnu prodaju.

Uvjeti su kumulativni: prolazi test vidljivog teksta, traži potvrdu, ne umeće nov tekst
(bez profila se ne izmišljaju natpisi ni sekcije, nego se popravlja ono što već postoji), i
jasno kaže korisniku da nije zahtjev fakulteta. Presedan su `empty-paragraph-fixer` i
`croatian-typography-fixer`; noviji primjer su unakrsne upute na tablice i slike
(`element-caption-fixer`, RE-59).

Što OSTAJE zabranjeno bez obzira na sve gore: pisanje ili prepravljanje rečenica i
argumentacije, generiranje sadržaja bilo kojim modelom, i bodovanje po pravilu koje nema
službeni izvor.

Ako proizvod ikad zatreba AI asistirano pisanje ili coaching (primjer: sestrinski
proizvod Katedra, zaseban proizvod istog vlasnika), to ide u odvojen proizvod i
repozitorij, nikad u Lektu. Podaci smiju teći iz Lekte prema drugom proizvodu
(izvezena, informativna, neautoritativna projekcija Lektinih verificiranih pravila),
nikad obrnuto, i taj drugi proizvod nikad ne smije tvrditi da je njegova provjera
formalno mjerodavna: to ostaje isključivo Lektin posao. Vidi `src/integrations/`
za konkretan, jednosmjeran izvoz podataka prema Katedri (`katedra-pack`).

## Tvrdo pravilo: migracije idu iskljucivo kroz `supabase db push`

MCP `apply_migration` se NE koristi nad Lektinim bazama. Razlog nije stil nego identitet:
`db push` upisuje verziju iz imena datoteke (`0001`), a `apply_migration` timestamp
(`20260719004453`), pri cemu ime ostaje u stupcu `name`. Iste migracije tako dobiju dva
razlicita identiteta, ovisno o tome tko ih je i cime primijenio.

Audit 2026-08-17 nasao je oba kvara koja iz toga slijede: produkcijski dnevnik je izgledao kao
da gotovo nista nije primijenjeno (a bilo je 67 od 90), a staging je 38 migracija primijenio
DVA PUTA, jednom kroz svaki od ta dva puta. Proslo je samo zato sto su ti zahvati idempotentni.

- Stanje se provjerava s `npm run migration-identity` (usporedba po IMENU, ne po verziji).
- Razlika izmedju repozitorija i deployanih Edge funkcija: `npm run deploy-drift`.
- Dijagnoza i preostali koraci: `docs/deploy/MIGRATION_IDENTITY.md`.
- Iznimka je iskljucivo baza koja se smije baciti.

Svaka migracija mora biti idempotentna (`if not exists`, `drop ... if exists` prije `create`),
jer se u praksi zna primijeniti vise puta.

## Tvrdo pravilo: build gate

Svaka promjena mora proći prije commita:

```bash
npm run check   # oxlint && tsc --noEmit && check:edge && vitest run && vite build
```

Ako `check` pada, promjena nije gotova. Ne commitaj crveno.

Gate TRAZI DENO, jer od 2026-09-01 ukljucuje `check:edge` (`deno check` nad
`supabase/functions/**`). Ondje zivi serverski kod koji barata novcem, tudjim dokumentima i
pravom pristupa, a `tsconfig.json` ima `include: ["src"]` pa ga tsc po konstrukciji ne vidi.
Bez Dena korak PADA umjesto da se tiho preskoci, i to je namjerno: provjera koja se tiho
preskoci jednaka je provjeri koje nema. Prije toga je rupa bila samo lokalna (CI ga je vrtio
kao zaseban korak, i to samo na Node 20), pa se greska u Edge kodu vidjela tek nakon pusha.

### Gdje se gate mjeri: na IZOLIRANOM stablu, nikad na dijeljenom

`npm run check` mjeri RADNO STABLO, ne HEAD. Kad vise sesija dijeli isto stablo, mjeri i tudje
necommitane izmjene, pa laze u OBA smjera: zelen gate ne dokazuje zelen HEAD, a crven gate ne
dokazuje kvar u tvom radu.

Izmjereno 2026-08-30: run u dijeljenom stablu prijavio je 4 pale datoteke, a sve cetiri prolaze na
cistom HEAD-u. `faculty-matrix` je pao jer su druge sesije uzivo prepisivale `data/profiles/**`, pa
se zivi izracun razisao s commitanim artefaktom; `partial-credit-scales` je pao na `testTimeout`
od 15 s, a na mirnom stroju trazi 16,5 s.

- Gate ide u worktree IZVAN repozitorija (vitest excludea samo `.claude/**`) uz junction na
  `node_modules`. Junction se stvara POSLIJE checkouta i ponovno nakon svakog `checkout -f`, koji
  ga brise; bez njega gate padne na "'tsc' is not recognized", sto izgleda kao kvar koda a nije.
- Ishod se cita iz retka `Test Files`, NIKAD iz izlaznog koda. Pozadinski zadatak zavrsava s
  `[exited with code 0]` i kad je vitest crven.
- Log ide u VLASTITU datoteku (`> gate.log 2>&1`): omotac cuva samo rep (~62 retka), pa se izgubi
  koje su datoteke pale, a zna se samo koliko ih je.

### Stroj je granica, i to se mjeri prije pokretanja

Stroj ima 8 GB RAM-a i 4 jezgre, a suite 420 test datoteka i oko 4700 testova. Uz 7 aktivnih
sesija ostaje 400 do 600 MB slobodno i puni gate umre na OOM-u.

Potpis tog pada je lako zamijeniti za nalaz: log STANE poslije zelene datoteke, bez sazetka i bez
poruke o gresci, dok `npm` vrati 1. Nula `FAIL` redaka + nema sazetka + npm 1 znaci ISCRPLJEN
RESURS, ne regresiju; ne pripisuj to commitu. Prije mjerenja pogledaj slobodni RAM
(`Get-CimInstance Win32_OperatingSystem`) i broj node procesa; ispod ~1 GB slobodno nema smisla ni
pokretati. Kad stroj nije miran, dokaz se seli na CI (cist stroj) ili se ceka.

## Tvrdo pravilo: paralelizam ide kroz IZOLACIJU, ne kroz vise pisaca

Vise istovremenih sesija znaci vise IZOLIRANIH worktreeva, nikad vise pisaca u istom stablu.

- Fan-out agenata je dopusten SAMO za citanje (pretraga, istrazivanje, prikupljanje nalaza).
  Paralelno PISANJE u isto radno stablo nije dopusteno.
- NE postoji pravilo koje na svaki prompt trosi jos agenata. Razlog stoji nize u ovom vodicu i
  izmjeren je: vise prolaza ISTIM alatom nije provjera, nego slaganje. Drugo misljenje vrijedi
  samo ako dolazi od DRUGOG alata, dakle `/codex:review`, odnosno `/codex:adversarial-review` za
  parser, citation i repair kod. To pravilo vec postoji i treba ga primjenjivati dosljedno.
- Uzko grlo ovog projekta nisu ideje nego stroj i dijeljeno stablo. Dodatni pisci trose upravo
  onaj resurs kojeg nema i mnoze klasu kvara koja je 2026-08-30 kostala 24 h: golden snimka
  commitana iz prljavog stabla opisivala je ponasanje ciji izvor u repou nikad nije bio commitan
  (vidi `141f9848`), a krivnja je pala na nevin commit.

### Izmjereno 2026-08-31: pravilo koje ovisi o pamcenju nije zastita

Osam zivih sesija u istom stablu proizvelo je istoga dana TRI stete:

    1  `git add <putanje> && git commit`  commitao je CIJELI indeks, ne navedene putanje:
                                          21 tudja staged datoteka otisla je pod tudju poruku
                                          (`cae64ef5`)
    2  generator fixtura                  jedan prolaz izbrisao je NETRACKANU fixturu druge
                                          sesije; netrackanu datoteku nista ne vraca. Dvije
                                          fixture koje su bile commitane (`6ee596a5`) prezivjele
                                          su isti prolaz netaknute
    3  spor o autorstvu                   dvije sesije tvrdile su isti rad

Treca nema tehnicko rjesenje NAKON sto se dogodi: dijeli se stablo, povijest, git identitet
(`Daniel`) i reflog, pa nijedan git dokaz ne razlikuje tko je izvrsio naredbu. Prve dvije se
poprave, treca ne.

**Uredivacka sesija ide u VLASTITI `git worktree`.** Tada dvije sesije fizicki ne mogu pisati istu
datoteku, a susret se dogadja pri mergeu, gdje ga git vidi i prijavi. Harness ima `EnterWorktree`;
`worktree.baseRef: "head"` je vec postavljen. Zajednicko stablo ostaje samo za ono sto NE pise:
citanje, mjerenje, pregled.

**Gard, jer se na pamcenje ne racuna.** `PreToolUse` hook nad Bashem odbija tri naredbe koje su
gornje stete i napravile: `git commit` bez `--only`, `git add -A`/`.`/`-u`, i `git commit --amend`.
Izvrsava ga HARNESS, ne model, pa se ne zaobilazi zaboravom. Skripta stoji IZVAN repozitorija
(`~/.claude/hooks/lekta-git-guard.mjs`), jer `.claude/hooks/` nije gitignoriran pa bi ondje bila
netrackana datoteka, dakle tocno ono sto steta 2 opisuje. Ozicenje je u
`.claude/settings.local.json`.

Gard stiti od GRESKE, ne od odluke; sve tri stete bile su greske. Ako ti zatreba oblik koji odbija,
javi tocnu naredbu i procijeni je li gard prestrog, nemoj ga zaobilaziti.

Pri pisanju samog garda pojavio se isti razred kvara koji lovi: prva izvedba gradila je regex iz
NIZA, escape se izgubio, `\s` je postao slovo `s`, i gard je izgledao ispravno a nije grizao
nijedan od sedam blokirajucih slucajeva. Regexi su zato DOSLOVNI, a pokriveno je 12 slucajeva
(pet dopustenih, sedam blokiranih).

**Prakticna napomena o mirovanju:** uvjet "cekamo da sve sesije stanu" je nedostizan, jer nove
dolaze brze nego sto stare zavrsavaju (izmjereno: cetiri nove u pet minuta). Zahvat nad dijeljenim
stablom radi se u kratkom NAJAVLJENOM prozoru, a prije njega se izmjeri da pogodjene putanje nemaju
zive izmjene (`git diff` prema indeksu prazan).

## Tvrdo pravilo: bodovana vrijednost mora se slagati s verificiranom tvrdnjom

Lanac dokaza (izvor + snapshot + stranica + doslovan citat + potpis) zivi u `ruleEntries`
(`data/profiles/<unit>/drafts/*.json`), a motor boduje iz naslijedjenog `rules` objekta
(`composeAnalysisProfile` klonira `definition.rules`, NIKAD `ruleEntries`; svih 407 registriranih
profila ima prazan `ruleEntries`). Do 2026-08-22 te dvije strane nitko nije usporedjivao.

Prvo mjerenje: **40 parova (profil, os) kroz 23 profila** bodovalo je vrijednost koju njihova vlastita
`verified` tvrdnja s citatom opovrgava. `unizd-pomorski-*`: izvor propisuje Merriweather 10 pt, motor
je trazio Times New Roman/Arial/Calibri 11-12 pt, pa je rad koji tocno slijedi svoju uputu gubio
bodove. Serverski popravak je uz to upisivao TNR 12 u studentov dokument, pod ruleId-em cija
provenijencija kaze Merriweather 10.

- Usporedbu radi `src/verification/scored-value-binding.ts`, po OSI a ne po kljucu `rules`: motor
  vecinu dimenzija cita kroz par (zastavica, vrijednost), pa usporedba po kljucu daje lazne nalaze
  (`paper-size: "A4"` proizvodi `paperSizes`, zrcalo nosi `requireA4`, ista odredba drukcije zapisana).
  Izmjereno: usporedba po kljucu dala je 227 laznih `unbacked`.
- Artefakt je `data/verification/scored-value-drift.json` (`npm run scored-value-drift`).
  `advisory-demotion.ts` ga cita i GASI bodovanje osi s raskorakom dok vlasnik ne presudi; ta os
  ispada i iz `repair-map.json`, inace popravak i dalje upisuje vrijednost iz zrcala.
  Dokazni dosjei: `npm run drift-adjudicate` pa `npm run drift-dossiers`.
- Gard: `tests/scored-value-drift.test.ts` (commitani artefakt = svjez izracun, ratchet koji smije
  samo padati, negativne kontrole) i `tests/gate-mutations.test.ts`.
- KRUGA NEMA I TO JE NAMJERNO: raskorak se racuna iskljucivo iz tvrdnji i `rules`, nikad iz demotije.
  Provjera koja preskace vec demotirane osi sama sebe pobrise u sljedecem krugu (popis se isprazni,
  demotija nestane, kvar se vrati). Zato `computeBaseDemotedAdvisory` stoji odvojeno od
  `computeDemotedAdvisory`.
- Demotija je PRIVREMENA i FAIL-SAFE, pa se radi strojno. UKLJUCIVANJE bodovanja trazi ljudski
  potpis. Tvrdnja koja se ne slaze sa zrcalom NIJE automatski ona tocna: opovrgavajuci prolaz
  2026-08-21 nasao je krivo pripisan opseg na 12 od 20 tvrdnji, a presuda 2026-08-23 je nasla 17
  slucajeva gdje je krivo zrcalo i 2 gdje je kriva tvrdnja.
- ZATVORENO 2026-08-24: raskoraka je NULA. Svih 37 presudjeno i potpisano
  (`data/verification/drift-decisions.json`; 35 u korist tvrdnje, 2 protiv). Ratchet je spusten na 0,
  pa svaki nov raskorak pada odmah. Tri su bila motor koji je velicinu NASLOVA bodovao kao tijelo
  rada (`unizd-pomorski`, `unizd-germanistika`, `unizd-sociologija`), dva su bila Wordov tvornicki
  rub iz netaknutog .docx predloska predstavljen kao pravilo (`ffst-*`, oba `claim-wrong`), a dva su
  bila artefakt ALATA a ne podataka: presuditelj trazi centimetre a izvor pise milimetre, i izvor
  ima tipfeler u imenu fonta.
- GARD KOJI PRESTANE GRISTI KAD JE POSAO GOTOV nije gard: mutacija o demotiji uzimala je profil IZ
  artefakta, pa bi s nulom raskoraka prolazila vakuumski. Sada raskorak PODMECE
  (`computeDemotedAdvisory` prima skup za testove; produkcija ga nikad ne prosljedjuje).
- `scored-coverage.json` se time NE mijenja i to nije nesklad koji treba poravnati: coverage mjeri
  tvrdnje sljedive do izvora, demotija mjeri sto motor boduje. Dvije populacije, imenuju se.

## Tvrdo pravilo: privatni sloj ne ide u javni bundle (klasifikacijski manifest)

`data/classification.json` je jedini izvor istine o tome sto smije u javni browser bundle
(PUBLIC/PRIVATE-IP/PROPRIETARY-DATA/SECURITY-SENSITIVE + bundle allowed/forbidden/derived;
zadnje pravilo koje pogodi stazu vrijedi, kao .gitignore). Cuvaju ga TRI sloja:

- `scripts/security/classification-guard.mjs` (vite plugin): javni build PADA ako
  forbidden/derived ILI NEKLASIFICIRAN repo modul ude u Rollup graf s renderiranim
  sadrzajem (deny-by-default). Grize dokazano (negativne kontrole 2026-08-23: probni
  import scored-value-drift srusio build, dva puta). SENTINEL: nula mapiranih modula
  = pad, ne cist prolaz (krivo slovo pogona na Windowsu inace daje tihi vakuum);
  klasifikacija je case-insensitive jer je Windows FS case-insensitive pa bi
  'DATA/...' import inace prosao kao nepokriven.
- `scripts/verify-dist-classification.mjs`: post-build sken dist/ + dist-packs/ na
  kanarince i never-markere; CI korak u check.yml + zadnji korak verify-deploy-dist.
- `tests/classification.test.ts`: pokrivenost (ukljucujuci netracked), mrtva pravila,
  postojanje kanarinaca u izvorima, prikovane presude.

Kanarinci: sintetski (`LEKTA-KANARINAC-...` u publicSources izvora istine i top-level
`kanarinac` kljuc u par draftova; writeri draftova MORAJU propagirati nepoznate top-level
kljuceve) i prirodni (publicSources sha256 otisci). NE koristi source-registry
`snapshotHash` kao kanarinca: za izvore s citatnim specom ista vrijednost NAMJERNO izlazi
u bundle kao `spec.verifiedHash`. Never-markeri su KLJUC-oblik u TRI varijante ("k":,
escapano \"k\": i minificirani identifier k: iza interpunkcije, jer rolldown kljuceve
emitira BEZ navodnika); goli niz lazno pali na prozu u note poljima. `verifiedHash` NIJE
marker: javni citatni specovi ga namjerno nose u bundleu (gate protiv zastarjelog speca).
`verifiedBy` JEST marker (vracen 2026-08-23, potpis verifikatora ne mora biti javan):
stripRuntimeDeadProvenance ga brise iz citatnih specova u bundleu (klijent cita samo
verifiedAt), izvor i SEO generator su netaknuti. Drafts evidence tako cuvaju TRI kljuca
(verifiedBy/reviewedBy/confirmedVia) + kanarinci + zabrana modula. Kanarinci u GENERIRANIM
artefaktima (scored-value-drift, repair-params) idu kroz BUILDER, nikad rucno: regen bi ih
izbrisao. Novi podatkovni direktorij ili nova staza bez razreda = crveni check; dodaj
pravilo SVJESNO, uz biljesku.

## Tvrdo pravilo: mjera koja se popravi ne dokazuje da tvoj zahvat radi

Dva su nacina da zeleno bude lazno, i oba su izmjerena na vlastitom radu 2026-08-31.

**1. MEHANIZAM MORA IMATI VLASTITI BROJAC.** Nizvodna mjera nije dokaz da tvoj zahvat radi: ona se
moze popraviti iz drugog razloga. Dovlacenje citata u `extract-citation-sections.mjs` citalo je
`String(pages[p])` nad objektom `{page, text}`, dakle pretrazivalo doslovno `"[object Object]"`, i
nije radilo NISTA. Blokatori su u istom prolazu pali s 8 na 5, pa je izgledalo da mehanizam radi;
popravak je zapravo dolazio od PRVENSTVA, drugog mehanizma u istoj izmjeni.

Zato svaki dodan mehanizam nosi brojac koji se zapisuje u artefakt (`citedBackfilled` u
`extractions/INDEX.json`), a gard tvrdi da je RAZLICIT OD NULE. Brojac na nuli znaci mrtav kod, ma
sto nizvodna mjera pokazivala. Gard: `tests/citation-extraction-mechanism.test.ts`, mutacija
`mehanizam/mrtav-kod-s-brojacem-na-nuli`.

**2. GENERATOR ULAZA JE I SAM NEPROVJEREN dok mu ne dokazes da proizvodi oblik koji tvrdis da
pokrivas.** Prolaz kroz N slucajeva vrijedi samo za oblike koje je generator STVARNO stvorio. Sweep
nad detekcijom naslovnice davao je 402/402 i bio lazno zelen: lokativ je tvorio samo muskim
obrascem (`-om`), pa klasa "zenski pridjev u lokativu" (`Muzickoj akademiji`) u testu nikad nije ni
nastala. U stvarnosti je rusila cetiri jedinice; neovisni verifikator s vlastitim generatorom dobio
je 398/402.

Ovo NIJE isto sto i "gard bez dokaza da grize": ondje se dokazuje da GARD reagira, ovdje da
GENERATOR proizvodi trazeni oblik. Repo se oslanja na sweepove (konformnost, korpus, rutiranje
profila, detekcija), gdje ta razlika odlucuje je li mjerenje istinito.

Posljedica za rad: kad brojka ostane ista a mehanizam se promijenio, provjeri IDENTITET, ne zbroj.
Popis blokatora citatnih dosjea zato je imenovan, a ne prebrojan: 2026-08-31 je broj ostao 1 dok je
`pravo` otisao a `pfri` dosao, i samo je imenovani popis to uhvatio.

## Tvrdo pravilo: gard bez dokaza da grize ne racuna se

Svaki verifikacijski gard mora imati MUTACIJU u `tests/gate-mutations.test.ts`: podmetnut poznat kvar
i tvrdnju da ga gard prijavi. Stanje 2026-08-23: 18 mutacija, 18 uhvaceno.

Razlog je izmjeren, ne nacelan. `paper-size` izvod je IGNORIRAO vrijednost i uvijek trazio A4, pa bi
se tvrdnja `A3` "izvela" iz citata o A4; izgledao je zdravo dok se nije podmetnula kriva vrijednost.
`audit_scored_quotes` nije prijavio citat s pokrivanjem 0,21 uz prag 0,85 jer ga je
`has_scanned_pages` proglasio neprovjerivim, i drugi prolaz ISTIM alatom bi ga opet propustio.

- Svaka mutacija ima i BASELINE tvrdnju (nemutiran ulaz mora biti cist), inace "prolazi" i gard koji
  vristi na sve.
- Vise prolaza istim alatom NIJE provjera. FER pilot: 7/7 citata doslovnih, a 4 od 5 tvrdnji
  oboreno. Slaganje nije tocnost; razliku prave RAZLICITI alati i unakrsna usporedba artefakata.
- Boolean nad pragom nije nalaz nego prijedlog: `claimQuoteInSource` je po pragu 0,85 oznacio 11
  tvrdnji kao izmisljene, a mjerenje je pokazalo da su dvije (0,21), dok je devet parafraza
  (0,62-0,81). Presuda zato nosi BROJ, ne zastavicu.

### Drift gard koji trazi regeneraciju moze traziti da POKVARIS podatke

Gardovi tipa "artefakt je ustajao, regeneriraj pa commitaj" pretpostavljaju da su svjez izracun i
commitani artefakt racunati u ISTOJ okolini. Kad nisu, uputa iz poruke je tocno obrnuta od
ispravnog poteza.

Izmjereno 2026-08-24 na `scored-quote-audit.json`. CI je javio "ustajao (svjeze 144 nalaza,
commitano 148)". Artefakt je bio ISPRAVAN, a CI je citao krivo:

    bez `olefile` i bez rar pratitelja:  revidirano 1739, nerevidirano 193, nalaza 144
    s `olefile` i rar pratiteljima:      revidirano 1932, nerevidirano   0, nalaza 148 (= commitano)

Regeneracija bi ozelenila CI, izbacila 193 bodovana pravila iz revizije i obrisala CETIRI stvarna
nalaza. Zeleno bi znacilo MANJE provjere.

- PRIJE regeneracije bilo kojeg verifikacijskog artefakta usporedi i BROJ PROVJERENIH JEDINICA, ne
  samo broj nalaza. Pad pokrivenosti uz manje nalaza je znak da citac zakazuje, ne da je artefakt
  star.
- Citac koji nedostaje ne baca nego vraca prazno: `doc97_text` cita `.doc` preko `olefile` i bez
  njega vraca prazan string. Svaka takva ovisnost mora biti u CI `pip install`, inace gard ne moze
  proci ni na ispravnim podacima.
- Pratitelj uz izvor bez citaca (`-ocr.txt` za skenirani PDF, `-text.txt` za `.rar`) MORA biti
  commitan. Tri mathos `.rar` predloska nisu imala nijedan (`git ls-files` ih je imao nula), pa je
  artefakt bio reproducibilan samo na stroju na kojem je pecen.
- ZAMKA U DIJAGNOSTICI: kad citac zakaze, razlog se prijavi kao "skeniran izvor bez tekstualnog
  sloja (treba OCR)", jer `.doc` i `.rar` produ kroz dopusteni popis nastavaka i zavrse u istoj
  grani kao skeniran PDF. Poruka salje na OCR, a nijedan od 21 pogodenog izvora nije skeniran PDF.
  Ne vjeruj toj poruci: nabroji koji izvori vracaju prazan `document_text` i gledaj njihov nastavak.

## Arhitektura (stanje i smjer)

- `data/` je tipiziran i modularan: profili, izvori, rokovi, katalog, coverage,
  metodologija, svaki u svom JSON-u. Loaderi u `src/*` ih hidriraju i tipiziraju.
- `src/ui/app.ts` je UI orkestrator (~1530 redaka, tipiziran, VISE NIJE `@ts-nocheck`):
  UI, narudzbe, placanje i QA. Analiticka jezgra je izvucena: `analyzeDocx` + auditni
  helperi zive u `src/analysis/analyze-docx.ts` (tipizirano), a analiza u pregledniku radi
  u Web Workeru (`analyze-docx.worker.ts` + most `analyze-docx-client.ts` s inline
  fallbackom; worker koristi isti @xmldom/xmldom DOMParser kao testovi, pa golden pokriva
  worker putanju). Tipizacija app.ts je pragmaticna: `$`/`$$` i uvezene lookup-mape su `any`
  na granici prema DOM-u/podacima, tijelo je vecinom `any`. CIJELI `src/` je sada bez ijedne
  `@ts-nocheck` direktive (i generator-alati `src/tools/*-page.ts` i `src/shared/ui-boot.ts`
  su tipizirani); tsc strict prolazi bez supresije.
  Ulaz je `src/main.ts` (tanki bootstrap koji uvozi ui-boot i ui/app), NE monolit.

## Option A: ruleEntries su izvor istine

Pravila profila postoje u dva oblika:

- `rules` - naslijeđeni agregirani objekt koji engine povijesno čita.
- `ruleEntries` - granularna pravila s identitetom, autoritetom, izvorom,
  `sourcePage`, `machineCheckable` i datumom verifikacije. Ovo je AUTORSKI izvor istine.

`src/profiles/rule-compiler.ts` na učitavanju računa `effectiveRules`:

```
effectiveRules = clone(rules baseline) + svaki prepoznati ruleEntry preko njega
```

Engine (`currentProfile` u `src/ui/app.ts`) čita `definition.effectiveRules`, uz fallback
na `definition.rules`. Test `tests/rule-compiler.test.ts` dokazuje da je za trenutne
podatke `effectiveRules` deep-equal `rules`, dakle uključenje kompajlera ne mijenja
ponašanje.

### Kako se od sada uređuje pravilo

1. Uredi odgovarajući `ruleEntry` u JSON profilu (ne `rules`).
2. Ako `ruleEntry` za to pravilo ne postoji, dodaj ga s ispravnim `checkId`
   (popis prepoznatih `checkId`-jeva je `COMPILED_CHECK_IDS` u `rule-compiler.ts`).
3. Migracijski cilj: jednom kad je ključ izražen kao `ruleEntry`, OBRIŠI ga iz `rules`.
   Overlay ga i dalje proizvodi pa engine ne vidi promjenu. Time nestaje dvostruko
   održavanje. Nakon brisanja prilagodi faithfulness test (više neće biti pune
   jednakosti za taj ključ; tada se oslanjamo na "nula diagnostics" + golden testove).
4. Novi `checkId` koji još nije podržan: dodaj mapiranje u `applyEntry` u `rule-compiler.ts`
   i pokrij testom. Bez mapiranja kompajler vraća diagnostic i pravilo se NE primjenjuje.

### Modalitet i opseg su dio tvrdnje, ne komentar

Svaki `ruleEntry` uz vrijednost nosi i `modality` (koliko jako izvor obvezuje) i `scope` (na koji dio
rada se odnosi), uz `modalitySource` koji kaze tko ih je upisao.

Razlog je izmjeren, ne stilski. FER pilot je oborio 4 od 5 tvrdnji i nijedna nije pala na krivom
prijepisu nego na TUMACENJU (preporuka citana kao obveza, opis predloska kao propis). Opovrgavajuci
prolaz je zatim nasao krivo pripisan OPSEG na 12 od 20 tvrdnji: vrijednost nije bila netocna nego
PRESELJENA (naslovnica citana kao naslov, fusnota kao tijelo rada).

- `modality` ima SEST razina, jednu vise nego uobicajeno: `obligation` (`mora`/`duzan`), `directive`
  (`treba`, goli indikativ, natuknicna specifikacija), `prohibition`, `recommendation`, `permission`,
  `condition`. `directive` postoji jer FER dokument ima tri razine i nijedna FER tvrdnja nije bila u
  najjacoj; da `treba` upadne u `obligation`, tocno taj nalaz bi nestao.
- Prijedlog radi `npm run claim-modality` (`scripts/propose_claim_modality.py`), upis
  `npm run claim-modality:apply`. Skript NE ODLUCUJE.
- UGOVOR: mehanika nikad ne upisuje ublazen modalitet. Pripisivanje ublazavanja pravoj osi je
  citanje, ne uzorak (`ferit`: *"Rad se pise na racunalu (preporuca se MS Word) uz prored od 1,5"* -
  ublazavanje veze PROGRAM, ne prored). Svaka pojava ublazavanja ide covjeku.
- Gard: `tests/claim-fields.test.ts` (vokabular, ugovor strojnog upisa, ratchet broja pravila bez
  modaliteta koji smije samo padati).
- Zatecено stanje 2026-08-22: 1404 od 1934 bodovanih pravila ima modalitet i opseg iz strojnog
  izvoda, 530 ceka covjeka.

### Hijerarhija pravila i uloga repozitorija

Ne izmišljaj pravila. Bodovana pravila smiju doći samo iz navedenih službenih izvora.
Hijerarhija: aktualna odluka/pravilnik za godinu i vrstu rada > aktualna službena
stranica studija > opće FPZG upute i citiranje > pisana uputa mentora/kolegija.
Studentski radovi iz repozitorija služe ISKLJUČIVO regresijskom testiranju parsera,
nikada kao izvor pravila. `sourcePage` koji nije potvrđen ostaje `null`, ne nagađaj ga.

## Parser: ne diraj bez golden testa

Legal Citation Engine i OOXML parser su teški regexi nad hrvatskim pravnim i
akademskim formama i lako se kvare. Pravilo: ne mijenjaj parser, audit ni citation
engine bez golden-file testa koji PRVO dokazuje zatečeno ponašanje.

- Golden harness: `tests/docx-golden.test.ts` + `tests/fixtures/docx/`.
- Ubaci realne `.docx`, snimi baseline s `npm test -- -u`, pa refaktoriraj.
- Suite se sam preskače bez fixtura; sada je AKTIVAN sa 6 realnih fixtura u tests/fixtures/docx/ (snapshoti commitani), izlozen kroz src/analysis/golden-entry.ts.

## Popravak: deterministican, per-fakultet kroz PODATKE

U popravku nema modela ni prompta. "Recept" je niz `{fixerId, ruleId, params}` koji klijent slozi
iz profila (`paramsForCheck` u `src/ui/repair-items.ts`). Zato je pravilo po fakultetu izrazeno kao
podatak (`data/profiles/**`), nikad kao tekst upute.

- CILJANU VRIJEDNOST od 2026-08-16 izvodi SERVER, ne klijent (`src/repair/param-authority.ts`).
  Za poznat par (profileRef, ruleId) Edge funkcija uzima svoju pecenu vrijednost iz
  `data/generated/repair-params-by-profile.json` i klijentovu IGNORIRA; klijentov `params` vrijedi
  jos samo tamo gdje fakultetskog pravila nema (univerzalna higijena), i to odgovor oznaci kao
  `paramSources[ruleId] === 'client'`. Prije toga je server samo tipski sanirao klijentovu
  vrijednost, pa rucno skrojen zahtjev nije mogao biti razlikovan od profilnog.
- Recept je zapisan u `docs/REPAIR_RECIPE.md`, GENERIRAN iz koda i profila (`npm run repair-recipe`,
  izvor `src/repair/recipe.ts`). Ne uredjuj ga rucno; `tests/repair-recipe.test.ts` pada na drift.
  Ista naredba pece i serverski autoritet I profile-rules artefakt (ulancano 2026-08-23,
  jedan okidac za sve tri pecene projekcije; deploy oba projekta: `npm run
  deploy:profile-rules`); `tests/repair-param-authority.test.ts` pada ako artefakt
  odluta od recepta.
- ISPORUKA IDE TEK NAKON PONOVNE PROVJERE (obrnuto od ugovora do 2026-08-16). Vrata integriteta
  hvataju pokvaren paket, ali ne i SEMANTICKU regresiju, pa se `detectPassRegressions` izvodi PRIJE
  nego sucelje preporuci preuzimanje: uz regresiju glavna ponuda je IZVORNI dokument. Popravljeni
  se nikad ne zarobljava (ostaje kao sporedan izbor, a kad ponovna analiza padne, ostaje glavni uz
  izricitu napomenu). Gard: `tests/repair-delivery-order.test.ts`.
- Tok: dokument ide na server SAMO za popravak. Provjera izvora ide ZASEBNIM, usporednim pozivom
  (`source-check`), a pohrana u "Moji popravci" dovrsava se u pozadini (`EdgeRuntime.waitUntil`),
  pa odgovor nosi samo popravljeni docx.
- Postenje: dok pohrana traje (`storagePending`), sucelje NE smije tvrditi da je spremljeno;
  promasaj u korpusu NIKAD nije dokaz da izvor ne postoji.
- Popravljeni paket se dokazuje u CETIRI razine (`docs/REAL_CORPUS_TESTING.md`, Tier model).
  `npm run check` je samo Tier 0 (vlastiti strogi skener `src/repair/package-integrity.ts`) i NE
  otvara dokument nijednim stvarnim uredivacem. Prije deploya repair motora rucno pokreni i
  `npm run verify:strict-open:repaired` (Tier 1) te `npm run verify:word` / `verify:word:worst`
  (Word COM, `OpenAndRepair=false`, Windows).
  PAZI KOJU TIER 1 NAREDBU ZOVES: `npm run verify:strict-open` otvara ULAZNE fixture i o popravku ne
  govori nista, jer popravak u njoj nikad nije pozvan; njegov prolaz "19/19" znaci samo da su nasi
  fixturi valjani paketi. Dokaz motora je `verify:strict-open:repaired`, koji korpus prvo POPRAVI pa
  lxml-om otvori IZLAZE. CI (`docx-strict-open.yml`) radi oboje i tako je i imenovano; zamka je samo
  u rucnom receptu. Prazan skup je pritom crveno, ne tiho zeleno (`strict-open.py` to izricito
  provjerava). Izmjereno 2026-08-30: 16 dokumenata, 14 promijenjenih i svih 14 provjereno lxml-om;
  preostala 2 su `no-op` s nula promijenjenih fixera, dakle izlaz im je jednak ulazu.
  TREBA LI TIER 2 UOPCE PONOVO: `npm run tier2-freshness`. Cita commit iz
  `docs/generated/RELEASE_PROOF.json` i javi je li se `src/repair/` promijenio od tada; preskocena
  Windows razina i dokaz snimljen nad prljavim stablom NISU prolaz. Ne uvodi vlastiti dnevnik, nego
  cita postojeci. Izmjereno pri uvodjenju 2026-08-30: zapisani dokaz je stajao na `75904ef3`
  (2026-08-23), a od tada je palo 8 commita nad motorom, i nista to nije reklo.
  Oracle POSTOJI u `scripts/word-verify/`, ne gradi ga
  ispocetka. KLJUC: `@xmldom/xmldom` ne baca i ne stvara `parsererror` na neispravnom XML-u, pa
  provjera oslonjena na `parseXml` daje lazno zeleno (dokaz: `tests/repair-package-integrity.test.ts`).
  DRUGI oblik istog lazno zelenog: kad vrata integriteta ODBIJU isporuku, `applyFixers` vraca
  ULAZNE bajtove uz prazan changelog, pa harness bez izricite tvrdnje `integrityFailure === null`
  to vidi kao uredan `no-op`, a sve ostale tvrdnje prolaze vakuumski nad originalom.

## Mapa datoteka

- `src/ui/app.ts` - UI orkestrator (UI, narudzbe, placanje, QA). Meta: dovrsiti split.
- `src/analysis/analyze-docx.ts` - analyzeDocx + auditni helperi (jezgra analize).
- `src/scoring/evaluate/measurements.ts` - DocumentMeasurements (faza D "cisti sav"): verzioniran
  tip MJERLJIVIH cinjenica dokumenta (dominante, sekcije, markeri, brojaci, razmaci), BEZ ijednog
  importa (Deno-ready). "Facts" polovica para; "rules" polovica je academic-core-export.ts. Zivi
  aditivno u result.details.measurements (NIJE u goldenu; sanitizeAnalysisResult ga ne propusta na
  mrezu). NIKAD ne nosi tekst rada (tests/measurements-tripwire.test.ts).
- `src/scoring/evaluate/formatting.ts` - evaluateFormatting(measurements, profile, strict) ->
  {checks, issues}: CISTA evaluacija ~40 bodova oblikovanja, preseljena BAJT-IDENTICNO iz jezgre
  (blok Dominantni font .. oznake fusnota). Redoslijed checks/issues je ugovor goldena. Gard:
  tests/evaluate-formatting.test.ts (ekvivalencija s pipelineom + deep-freeze cistoca + registriran
  checkId). Analiza NE mutira profil (tests/profile-no-mutation.test.ts; opseg je lokalni scope).
  SAV 2 (structure bez teksta) i dalje zivi u jezgri; citations/legal/toc/title/method OSTAJU
  tekst-lokalni zauvijek.
- `src/scoring/check-id-registry.ts` - STABILNI identiteti provjera (`page.margins` i sl.).
  `Check` od 2026-08-16 ima `id`; korelacija prije/poslije popravka I mapiranje na fixer idu
  po njemu (`src/analysis/check-fixer-map.ts` je kljucan po `checkId`, ne po naslovu), hrvatski
  `title` je samo fallback za jos neregistrirane provjere i za prezentaciju. Naslov `Format
  stranice (...)` je dinamican pa mu se ID izvodi (`page.size.*`, `isPaperSizeCheckId`).
  Gard: `tests/check-fixer-map.test.ts` pada kad pravilo gadja checkId koji ne postoji (tako su
  otkrivena dva MRTVA pravila pisana nad `where` oznakama, ne nad naslovima provjera).
- `src/profiles/compose-profile.ts` - JEDINO mjesto gdje se slazu pravila koja ANALIZA cita:
  baseline (ili profil) -> olaksani baseline za lagan rad -> overlay katedre (rulesByWorkType) ->
  normalizeCheckFlags -> mentorov override -> scored/advisory demotija. REDOSLIJED JE UGOVOR
  (demotija ide zadnja, override ju gasi). Do 2026-08-22 je taj lanac zivio unutar currentProfile()
  nad DOM-om, pa ga nijedan test nije mjerio, a conformance matrica je vrtjela SIROVI profil iz
  registra; demotija pritom gasi barem jednu bodovanu dimenziju na 383 od 407 profila.
- `src/profiles/advisory-levers.ts` - poluge demotije. Dva ugovora koja se lako izgube: poluga mora
  ugasiti SVE grane kojima engine boduje tu dimenziju (`paper-size` gasi i `requireA4` i
  `paperSizes`, inace profil s vlastitim popisom formata i dalje gubi bodove na nebodovanom
  pravilu), i demotija PRESKACE dimenziju koju je izricito propisao specificniji izvor
  (`demotionProtectedBy`), jer advisory mapa govori samo o izvoru OSNOVNOG profila i ne smije
  ponistiti uputu katedre. Zasticena dimenzija ne ulazi ni u `advisoryDimensions`. Od 2026-08-23 jos
  dva, oba iz adversarijalnog prolaza nad vlastitim gardovima i oba tada latentna: zastita trazi da
  overlay dimenziju PROPISE (vrijednost, ili zastavica na `true` kod booleovih osi), jer je gola
  `checkFont: true` prije ponistavala demotiju bez ijedne vrijednosti pa se dalje bodovala bas ona
  koju tvrdnja opovrgava; i PODPROVJERE PRATE RODITELJA (polozaj broja stranice, naslovnica bez
  broja, numeriranje od Uvoda, tri podprovjere sadrzaja = 19 bodova su visile o tome je li polje
  PRONADJENO, a ne boduje li se ta os). Zato i obratno: overlay koji propisuje DIJETE stiti
  RODITELJA, inace taj isti gate tiho ugasi katedrin zahtjev.
- `src/ui/work-selection.ts` - rutiranje odabira: vidljivi programi jedinice, kandidati za
  (jedinica, program, vrsta rada) i izbor varijante. app.ts ih ZOVE (nije zrcalo). Krovni
  ("Opći ...") program se skriva SAMO ako je redundantan, dakle ako je svaki profil koji ga gadja
  dostizan i preko konkretnog studija; inace krovni profil postane nedostizan i broji se u
  pokrivenosti a nitko ga ne moze odabrati.
- `src/profiles/profile-rules-contract.ts` - ugovor rules-on-demand isporuke (v1): served polja
  (heavy minus profileLabel/catalogPrograms/publicSources) + buildProfileRulesArtifact (injektiran
  sha256; dijele ga generator `npm run gen-profile-rules-server`, Edge funkcija profile-rules i
  drift test tests/profile-rules-server.test.ts). Artefakt: data/generated/profile-rules-server.json.
- `src/report/profile-rules-client.ts` - klijent profile-rules endpointa (union ishoda, timeout,
  JEDAN retry samo za unavailable). `src/profiles/profile-rules-local.ts` - dev provider iz lazy
  chunkova (RUNTIME gate u app.ts wireProfileRulesProvider, NE build konstanta: chunkovi moraju
  ostati u grafu dok bundleSizeGuard u fazi B2 zahtijeva heavy chunk).
- PRAVILA PROFILA U PREGLEDNIKU (faza B): ensureProfileRules(profileId) dohvaca JEDAN profil preko
  providera i prime-a njegove repair unose; currentProfile BACA ako definicija postoji a pravila
  nisu ucitana (light indeks nosi djelomican rules objekt pa bi compose tiho bodovao po 2-4 kljuca),
  a na 'failed' POSTENO degradira na opcu provjeru (definition=null, vidljiva oznaka + toast).
  repairEntriesFor cita primed store s fallbackom na bulk mapu (testovi/skripte i dalje koriste
  ensureRepairMapHeavy).
- `src/repair/param-authority.ts` - serverski autoritet nad ciljanom vrijednoscu (vidi Popravak).
- `src/repair/docx-budget.ts` - JEDAN izvor granica dokumenta (upload, dekompresija, broj
  zapisa) za intake, analizu i popravak; ne uvodi nove granice mimo njega. VAZNO: analiza i
  popravak ne mjere isto (analiza cita lijeno samo XML dijelove, popravak cijeli paket), pa se
  jaz ne zatvara izjednacavanjem brojki nego `docxCapability()`, koji jos na intakeu iz zip
  central directoryja kaze moze li se dokument POPRAVITI, a ne samo analizirati.
- `src/repair/default-selection.ts` - `buildDefaultRepairRequests`: sto je PREDODABRANO kad
  korisnik samo klikne Popravi (`violated !== false`, isto kao UI checkbox). Testovi koji
  simuliraju korisnicki tok moraju ici kroz njega, inace mjere tok koji nitko ne izvodi.
- `src/analysis/analyze-docx-client.ts` - most prema Web Workeru, inline fallback.
- `src/profiles/rule-compiler.ts` - Option A: ruleEntries -> effectiveRules.
- `src/profiles/profile-schema.ts` - tipovi profila i pravila.
- `src/profiles/profile-validator.ts` - strukturna validacija profila.
- `src/{catalog,submission,coverage,methodology,config}/*` - tanki loaderi.
- `src/citations/*` - Legal Citation Engine i korpusna/CrossRef verifikacija citata.
- `src/repair/*` - Repair Engine: XML fixeri (`fixers.ts`, `xml-patch.ts`), zip codec,
  `apply-fixers.ts` (jezgra dijeljena s serverskim putem). Golden-zasticeno kao parser.
  `recipe.ts` je build/docs sloj (NIJE u bundleu): iz njega se generira `docs/REPAIR_RECIPE.md`.
- `src/report/*` - klijenti prema Supabase backendu (repair-client, source-check-client,
  repair-history, auth).
- `supabase/migrations/**`, `supabase/functions/**` - zivi backend (repair-docx, source-check,
  waitlist, deadline-reminders, narudzbe); NIJE "bez backenda" iznad, vidi "Sto je ovo".
- `data/**` - autorski podaci (profili, izvori, rokovi, katalog, coverage).
- `tests/**` - vitest: registar, regresija, UI smoke, rule-compiler, docx-golden. Conformance
  ima TRI analiticka sloja: SIROVI profil (`npm run conformance`, jedan slucaj po paru profil x
  vrsta rada), fallback BASELINE (obitelji x svih 7 vrsta rada) i SLOZENI profil (uzorak: po jedan
  profil za svaki obrazac demotije + sve katedre + mentorov override). Rutiranje
  (jedinica, program, vrsta rada) -> profil je podatkovni test BEZ analiza (`tests/profile-routing`,
  ~4.800 trojki), a struktura slaganja isto bez analiza (`tests/composed-profile`).
  Sve tri matrice imaju tripwire uzorak u `npm run check`.

Pravne stranice (`privatnost.html`, `uvjeti-koristenja.html` i dr.) generira
`scripts/generate-legal-pages.mjs`, koji se u `netlify.toml` pokrece TEK NAKON
`vite build`. Provjera tih linkova (goli `<a href>` na svim alat-stranicama i
landingu, bez JS presretanja/modala kao na `index.html`) zahtijeva puni build
lanac (`vite build && generate-citation-tools && generate-legal-pages`); sam
`npm run dev` ili goli `vite build && vite preview` ce 404-ati jer datoteke jos
ne postoje. `scripts/verify-deploy-dist.mjs` cuva da su u stvarnom `dist/` uvijek
prisutne prije deploya.

## Provenijencija fieldValidation (PID je identitet, ne sha256)

Javni PDF uzorci u `fieldValidation.publicSources` identificiraju se PID-om
(npr. `fkit:1301`), nikada preko sha256. nsk.hr repozitoriji (zir.nsk.hr,
dr.nsk.hr, repozitorij.<fak>.unizg.hr) utiskuju jedinstveni watermark (~63 bajta
u repu PDF-a) pri svakom preuzimanju, pa ponovni dohvat istog PID-a daje drugaciji
sha. Zabiljezeni sha256 je otisak konkretne preuzete kopije u trenutku harvesta,
ne reproducibilan integritetski hash. PDF-ovi se ne commitaju.

Doktorska razina: jedini pouzdan izvor je dr.nsk.hr driver (openAccess) set
(100% dc:type=Doktorski rad) ili dc.type/naslovnica po objektu. Institucijski
`repozitorij.<fak>.unizg.hr` namespace je mijesan po razini (diplomski, zavrsni,
doktorski) pa PID sam po sebi ne jamci doktorsku razinu; provjeri je iz PDF-a.
Dohvat trazi pune browser headere (Accept, Accept-Language, Sec-Fetch-*), inace
ModSecurity vraca HTTP 418.

## Konvencije

- Hrvatski je default jezik sadržaja i komentara u domenskim datotekama.
- Bez em i en crtica u tekstu; koristi zarez, dvotočku, zagrade ili zasebne rečenice.
- TypeScript strict, cijeli `src/` bez `@ts-nocheck`. `any` je dopusten na granici prema
  DOM-u i labavim podacima (UI glue: `$`/`$$`, lookup-mape); u novom logickom kodu izbjegavaj.
- Bez localStorage hackova u novim modulima; postojeći `safeStorageGet/Set` ostaje.
- Produkcijski kod, ne primjeri. Male, fokusirane promjene, svaki korak zelen.
- U DIJELJENOM radnom stablu (vise sesija odjednom) `git commit -- <putanje>` uzima sadrzaj iz
  RADNOG STABLA u trenutku commita, ne tvoju izmjenu. Generator druge sesije zna upasti izmedju
  izmjene i commita, pa tudji rad zavrsi pod tvojom porukom (dogodilo se 2026-08-22, 63 retka).
  Neposredno prije commita PONOVI `git diff --stat -- <putanje>` i usporedi s onim sto si mijenjao.
  Ako je vec uslo, NE prepravljaj povijest dok druga sesija radi: amend joj moze pojesti commit.
- TA JEDNA NAREDBA NIJE DOVOLJNA. `git diff` usporedjuje RADNO STABLO s INDEKSOM, a `git commit`
  uzima ono sto je u INDEKSU za tvoje putanje. Kad je stablo IZA HEAD-a (tudji merge je vec usao,
  a tvoje stablo jos drzi staru stranu) ili kad druga sesija ima nesto stagirano, ta dva pogleda
  se razilaze. Zato uz nju ide i:

      git diff --cached --stat -- <putanje>

  Izmjereno 2026-08-31, dva puta u istom danu. Prvi put je `git diff -- package.json` pokazao JEDAN
  dodan redak, a `--cached` je glasio `3 10`: commit je pregazio spojeni `package.json` i izbacio
  `oxlint` iz `check` te sest skripti. Drugi put je `git diff -- CLAUDE.md AGENTS.md` pokazao NULA
  razlike, dok je `--cached` prijavio 46 OBRISANIH redaka tvrdih pravila, stagiranih iz druge
  sesije; da je izostao, to bi brisanje otislo u commit pod tudjom porukom.
- Koristi `git commit --only <putanje>`, ne `git add <putanje> && git commit`. Drugi oblik commita
  CIJELI indeks, pa povuce sve sto je druga sesija stagirala. Dogodilo se 2026-08-30: commit od 11
  datoteka odnio je 32, od cega 21 tudju.
- U istom stablu pazi i na obrnut smjer: COMMITAN OVISNIK uz NECOMMITANU OVISNOST. Test ili modul
  koji jest u repou trazi simbol koji postoji SAMO u radnom stablu, pa je grana zelena kod tebe a
  crvena na cistom checkoutu. Dogodilo se 2026-08-30 cetiri puta u jednom danu (`buildOutcomeLine`,
  `dropStaleFieldRegressions`, golden snimka bez izvora, zastarjeli izvedeni artefakti). `tsc` to NE
  hvata jer `tsconfig.json` ima `include: ["src"]`, pa se `tests/**` ne typechecka; vidi se tek u
  vitestu, u runtimeu, na kraju punog prolaza. Prije commita pusti `npm run orphan-scan` (sekunde).
  Necommitana datoteka SAMA PO SEBI nije kvar: opasan je samo par u kojem je ovisnik vec commitan.

### Cist worktree i orphan-scan odgovaraju na RAZLICITA pitanja

Trebaju oba, jedan ne zamjenjuje drugoga:

- `npm run orphan-scan` -> "je li grana crvena na cistom checkoutu". Sekunde, bez worktreea.
- cist worktree (`git worktree add --detach <scratchpad>/x HEAD` + `mklink /J` za `node_modules`) ->
  "je li gate zelen i je li izvedeni artefakt reproducibilan iz commitanog koda". Artefakte
  (`docs/generated/**`, `dist-packs/**`, pecene projekcije) regeneriraj ISKLJUCIVO ondje, nikad u
  dijeljenom stablu, inace u njih ude tudji necommitan rad. HEAD se mice, pa prije commita provjeri
  `git log <regenHEAD>..HEAD --name-only`: ako je dirnut ijedan IZVOR artefakta, baci regeneraciju i
  ponovi. Izvjestaj i njegov ratchet uvijek idu u ISTI commit.

## Codex (drugo misljenje)

Instaliran je Codex plugin (codex@openai-codex). Podjela uloga: Claude Code je
primarni driver (implementacija, orkestracija, memorija, domensko znanje), Codex
je neovisno drugo misljenje drugog modela.

- `/codex:review` prije commita netrivijalnih promjena; `/codex:adversarial-review`
  za parser/citation/security kod i arhitektonske odluke (npr. backlog 6 backend).
- Nalazi su ADVISORY: hard gate ostaje `npm run check` + golden testovi. Svaki
  nalaz re-verificiraj prije primjene, ne preuzimaj tudje expecte.
- `/codex:rescue` je default write-capable: za parser/citation kod trazi read-only
  ili prvo snimi golden baseline; sve rescue izmjene moraju proci `npm run check`.
- `AGENTS.md` je kompaktni derivat tvrdih pravila ovog vodica (Codex cita njega,
  ne CLAUDE.md); kad mijenjas tvrdo pravilo, azuriraj obje datoteke.
- Codexov Stop review gate je namjerno iskljucen (rucni review na commit-tockama).

## Backlog (svaki je čist, samostalan task; Definition of Done = `npm run check` zelen)

1. Golden harness s podacima: ubaci 5 do 10 realnih `.docx` fixtura i snimi baseline.
   DoD: golden suite aktivan i zelen, snapshoti commitani.
2. (GOTOVO) Option A kompajler i `effectiveRules` wiring. Sljedeći korak unutar ovoga:
   ukloni iz `rules` ključeve koji su već u `ruleEntries`, profil po profil, i prilagodi
   faithfulness test. DoD: nema dvostrukog vođenja za migrirane ključeve, check zelen.
3. (GOTOVO) Razbijanje `src/ui/app.ts`: parser i citation engine su vec u
   `src/{docx,audits,citations,scoring}`, `analyzeDocx` + auditni helperi u
   `src/analysis/analyze-docx.ts`, a `@ts-nocheck` je skinut sa samog app.ts I sa svih
   preostalih modula (5 generator-alata `src/tools/*-page.ts` + `src/shared/ui-boot.ts`);
   CIJELI `src/` prolazi tsc strict bez supresije. Golden netaknut, check zelen.
4. Popuni `sourcePage` za sve `ruleEntries` iz `source-registry` (ručno potvrđeno;
   nepotvrđeno ostaje `null`). DoD: validator bez novih grešaka, check zelen.
5. Dovrši preostale profile iz jednog tipiziranog izvora (ruleEntries). DoD: coverage
   matrica i QA dijagnostika bez regresija, check zelen.
6. (Proizvodna odluka, kad zatreba naplata) pravi backend za narudžbe i plaćanje
   (Supabase), umjesto klijentskog JSON-a i Netlify forme.
7. Uključi `scripts/` i `tests/` u `tsconfig.json` (`include` je danas samo `["src"]`, pa se ta
   dva direktorija NE typechekaju u `npm run check`). Odgođeno 2026-08-30 odlukom vlasnika, uz
   izmjerene brojke; nije "kad stigne" nego "ne dok se ne može u jednom potezu".

   RUPA JE STVARNA I VEĆ JE KOŠTALA: `profileAxesViolated` je u `3dfab779` bio deklariran kao
   obavezan u tipu `Row`, izračunat, a nikad upisan u izlazni objekt, i ništa to nije prijavilo.
   Uključivanje bi zatvorilo i razred zbog kojeg postoji `npm run orphan-scan`: oba kvara koja su ga
   iznjedrila (`buildOutcomeLine`, `dropStaleFieldRegressions`) su IMENOVANI uvozi, dakle TS2305.

   Izmjereno 2026-08-30 privremenim tsconfigom koji nasljeđuje pravi (`include: [src, scripts,
   tests]`, uz `types: ['node', 'vite/client']`; bez `node` mjerenje daje 235 lažnih `TS2591 Cannot
   find name 'node:fs'`, dakle krivi alat daje krivi broj):

     126 grešaka ukupno, NULA u `src/`   (produkcijski kod je tipski čist)
      27  nedostaje obavezno svojstvo (TS2741/TS2739)   <- jedini opasan razred
      20  Uint8Array -> BlobPart (TS2322)               artefakt novijeg TS-a, radi u izvođenju
      44  implicitni any, 23 neiskorišteno              kozmetika

   ZAŠTO NIJE MALI COMMIT, iako 21 od 27 opasnih dolazi iz JEDNOG krivog tipa: `ParaSpec` u
   `tests/helpers/docx-builder.ts` ima `text: string` kao obavezno, dok su `empty?: true` i
   `raw?: string` u istom tipu dokumentirani kao oblici koji "zanemaruju sva ostala polja". Tip
   proturječi vlastitom komentaru i pozivatelji su u pravu. Ali ispravan popravak (razlikovana unija
   `ParaTextSpec | ParaEmptySpec | ParaRawSpec`) je izmjeren i vraćen: TS2741 pada 27 -> 6, a UKUPNO
   raste 132 -> 235, dakle +103 nove greške u 69 datoteka, zgusnute u `tests/corpus/catalog/*`, koji
   `ParaSpec` objekte gradi programski i čita `p.text` izravno. Ta dva posla zato idu ZAJEDNO:
   uključivanje bez popravka `ParaSpec`-a ne prolazi, a popravak bez uključivanja nema garda koji bi
   ga držao.

   NE POPRAVLJAJ `text?: string`: time tip počinje primati `{}`, graditelj tiho emitira prazan
   odlomak, i 21 greška se zamijeni za tip koji više ništa ne tvrdi (isti razred kao `axisResolved`
   koji vraća `true` čim je `max === 0`). Traži se unija, uz negativan test da `{}` NE prolazi
   tipski (`@ts-expect-error`). Da unija odgovara stvarnosti vidi se već danas: `isBodyPara` u
   `tests/corpus/catalog/atomic.ts` ručno sužava s `!p.raw && !p.empty && typeof p.text === 'string'`.

   Dva sitna duga nađena usput, oba unutar ovog zadatka: `TOC_FIELD_PARA` nosi istovremeno `text: ''`
   i `raw:` (mrtvo polje), a `'required-section'` nije u `STRUCTURAL_VIOLATION_IDS` iako ga commitani
   `tests/violating-docx-required-section.test.ts` koristi (tri greške koje danas ništa ne prijavljuje).

   DoD: `include` proširen, `npm run check` zelen, `ParaSpec` unija s negativnim testom.

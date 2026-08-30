# AGENTS.md - Lekta (ThesisReady)

Kompaktna pravila za agente koji citaju AGENTS.md standard (Codex i drugi).
Kanonski operativni vodic je CLAUDE.md; za netrivijalne zadatke procitaj i njega.

## Sto je projekt

Klijentska web aplikacija (Vite + TypeScript strict, vitest + happy-dom) koja u
pregledniku analizira .docx akademske radove i provjerava oblikovanje, strukturu,
opseg i citiranje prema sluzbenim profilima fakulteta. Sva ANALIZA je lokalna,
dokument se pritom ne salje na posluzitelj. To NE vrijedi za sve znacajke: placeni
automatski popravak (src/repair, kad je repairEndpoint konfiguriran), narudzbe,
waitlist i rokovi/podsjetnici idu na zivi Supabase backend (supabase/migrations,
supabase/functions). Ovo NIJE Next.js projekt.

## Tvrdi gate

Svaka promjena mora prije commita proci:

```bash
npm run check   # tsc --noEmit && vitest run && vite build
```

Ako check pada, promjena nije gotova. Ne commitaj crveno.

Gate se mjeri na IZOLIRANOM stablu, nikad na dijeljenom: `npm run check` mjeri RADNO STABLO, ne
HEAD, pa u dijeljenom stablu mjeri i tudje necommitane izmjene i laze u oba smjera. Izmjereno
2026-08-30: 4 pale datoteke u dijeljenom stablu, sve cetiri zelene na cistom HEAD-u.

- Worktree IZVAN repozitorija + junction na node_modules; junction se stvara POSLIJE checkouta i
  ponovno nakon svakog `checkout -f`, koji ga brise.
- Ishod se cita iz retka `Test Files`, NIKAD iz izlaznog koda (pozadinski zadatak zavrsi s
  "exited with code 0" i kad je vitest crven).
- Log u vlastitu datoteku (`> gate.log 2>&1`); omotac cuva samo rep pa se izgubi KOJE su pale.
- Stroj: 8 GB, 4 jezgre, suite 420 datoteka. Ispod ~1 GB slobodnog RAM-a ne pokrecu se testovi.
  Nula FAIL redaka + nema sazetka + npm 1 = iscrpljen resurs, ne regresija. Kad stroj nije miran,
  dokaz se seli na CI.

## Paralelizam ide kroz IZOLACIJU, ne kroz vise pisaca

Vise istovremenih sesija znaci vise IZOLIRANIH worktreeva, nikad vise pisaca u istom stablu.

- Fan-out agenata je dopusten SAMO za citanje. Paralelno PISANJE u isto stablo nije dopusteno.
- NE postoji pravilo koje na svaki prompt trosi jos agenata: vise prolaza ISTIM alatom nije
  provjera nego slaganje. Drugo misljenje mora doci od DRUGOG alata (Codex), a netrivijalna
  promjena u src/repair, src/citations i src/docx trazi adversarijalni prolaz prije commita.
- Dodatni pisci mnoze klasu kvara koja je 2026-08-30 kostala 24 h: commitan artefakt (golden
  snimka) opisivao je ponasanje ciji izvor u repou nikad nije bio commitan.

## Privatni sloj ne ide u javni bundle

`data/classification.json` klasificira staze (PUBLIC/PRIVATE-IP/PROPRIETARY-DATA/
SECURITY-SENSITIVE); zadnje pravilo koje pogodi vrijedi. Vite plugin
(scripts/security/classification-guard.mjs) RUSI javni build ako forbidden/derived
modul ude u graf; post-build sken (scripts/verify-dist-classification.mjs) trazi
kanarince i never-markere u dist/ i dist-packs/. Drafts evidence, ledger,
source-registry i data/profiles/verified-profiles.json NIKAD u preglednik. Ne
uklanjaj kanarince (LEKTA-KANARINAC-* i top-level "kanarinac" kljuc u draftovima);
writeri draftova moraju propagirati nepoznate top-level kljuceve. Novu stazu bez
razreda check odbija: dodaj pravilo svjesno, uz biljesku.

Pravila profila u pregledniku stizu PO PROFILU (ensureProfileRules(profileId) preko
providera; produkcija = profile-rules Edge funkcija, dev = lokalni lazy chunkovi).
currentProfile BACA kad definicija postoji a pravila nisu ucitana (light-stub zamka);
kvar dohvata posteno degradira na opcu provjeru, NIKAD tiho bodovanje.

## Parser: ne diraj bez golden testa

Legal Citation Engine i OOXML parser (src/docx, src/audits, src/citations,
src/analysis) su teski regexi nad hrvatskim pravnim i akademskim formama i lako
se kvare. Ne mijenjaj parser, audit ni citation engine bez golden-file testa
koji PRVO dokazuje zateceno ponasanje: tests/docx-golden.test.ts +
tests/fixtures/docx/ (aktivan, snapshoti commitani).

## Popravak: deterministican, per-fakultet kroz PODATKE

U popravku nema modela ni prompta. "Recept" je niz {fixerId, ruleId, params} koji
klijent slozi iz profila (paramsForCheck u src/ui/repair-items.ts).

- CILJANU VRIJEDNOST izvodi SERVER (src/repair/param-authority.ts), ne klijent: za poznat
  par (profileRef, ruleId) Edge funkcija uzima svoju pecenu vrijednost i klijentovu ignorira.
  Klijentov params vrijedi jos samo gdje fakultetskog pravila nema; odgovor to oznaci kroz
  paramSources. Gard: tests/repair-param-authority.test.ts.
- ISPORUKA TEK NAKON PONOVNE PROVJERE: detectPassRegressions ide PRIJE preporuke za
  preuzimanje; uz regresiju glavna ponuda je IZVORNI dokument, popravljeni ostaje sporedan.
  Dokument se nikad ne zarobljava. Gard: tests/repair-delivery-order.test.ts.
- IDENTITET provjere je check.id (src/scoring/check-id-registry.ts), ne hrvatski naslov;
  check-fixer-map.ts je kljucan po checkId. Gard: tests/check-fixer-map.test.ts.
- PRAVILA KOJA ANALIZA CITA slaze src/profiles/compose-profile.ts (app.ts ga zove, nije
  zrcalo): baseline -> lagan rad -> overlay katedre -> normalizeCheckFlags -> mentorov
  override -> scored/advisory demotija ZADNJA. Demotija preskace dimenziju koju je izricito
  propisao specificniji izvor (katedra) i mora gasiti SVE bodovane grane te dimenzije,
  UKLJUCUJUCI PODPROVJERE (polozaj broja stranice, naslovnica bez broja, numeriranje od
  Uvoda, podprovjere sadrzaja: 19 bodova koji su visili o tome je li polje pronadjeno, a
  ne boduje li se os). Zastita vrijedi samo ako overlay dimenziju PROPISE (vrijednost, ili
  zastavica na true kod booleovih osi); gola zastavica nije propis. Overlay koji propisuje
  dijete stiti i roditelja. Gard: tests/composed-profile.test.ts + tests/gate-mutations.test.ts
  + tests/conformance/composed.test.ts.
- ODABIR (jedinica, program, vrsta rada) -> profil je u src/ui/work-selection.ts; nijedan
  profil ne smije ostati nedostizan iz carobnjaka. Gard: tests/profile-routing.test.ts.
- docs/REPAIR_RECIPE.md je GENERIRAN (npm run repair-recipe, izvor src/repair/recipe.ts).
  Ne uredjuj ga rucno; tests/repair-recipe.test.ts pada na drift. Ista naredba pece i
  data/generated/repair-params-by-profile.json.
- Dokument ide na server SAMO za popravak. Provjera izvora ide zasebnim usporednim
  pozivom (supabase/functions/source-check), a pohrana u "Moji popravci" dovrsava se
  u pozadini (EdgeRuntime.waitUntil).
- Postenje: dok pohrana traje (storagePending), sucelje NE smije tvrditi da je
  spremljeno; promasaj u korpusu NIKAD nije dokaz da izvor ne postoji.
- Popravljeni paket ima CETIRI razine dokaza (docs/REAL_CORPUS_TESTING.md, Tier model).
  npm run check je samo Tier 0 (src/repair/package-integrity.ts) i NE otvara dokument
  nijednim stvarnim uredivacem. Prije deploya motora rucno: npm run verify:strict-open
  (python-docx) i npm run verify:word / verify:word:worst / verify:word:toc (Word COM,
  OpenAndRepair=false).
  Oracle POSTOJI u scripts/word-verify/, ne gradi ga ispocetka. KLJUC: @xmldom/xmldom ne
  baca i ne stvara parsererror na neispravnom XML-u, pa provjera preko parseXml daje lazno
  zeleno (dokaz: tests/repair-package-integrity.test.ts).
  Drugi oblik istog: kad vrata integriteta odbiju isporuku, applyFixers vraca ULAZNE bajtove uz
  prazan changelog, pa test bez tvrdnje integrityFailure === null to vidi kao uredan no-op.

## Lekta nikad ne generira niti ne prepravlja sadrzaj rada

Lekta mjeri, provjerava i deterministicki popravlja FORMU. Nikad ne pise, ne
prepravlja i ne ocjenjuje recenice, argumentaciju ni sadrzaj rada, ni preko AI
modela ni na drugi nacin (vec arhitektonska cinjenica: popravak nema model ni
prompt, gramatika/pravopis su lokalni lintovi, provjera citata je provjera
postojanja). Razlog je poslovni: institucionalna prodaja fakultetima i AI
generiranje sadrzaja rada se iskljucuju. AI asistirano pisanje/coaching (npr.
sestrinski proizvod Katedra) ide u odvojen repozitorij; podaci smiju teci samo iz
Lekte prema njemu (src/integrations/), nikad obrnuto, i taj drugi proizvod nikad
ne smije tvrditi formalnu mjerodavnost, to ostaje iskljucivo Lektin posao.

GRANICA JE MJERLJIVA, ne stvar procjene: zahvat je dopusten ako VIDLJIVI TEKST
ostane isti i prije i poslije osvjezavanja polja u Wordu (Fields.Update()).
Mehanika ispod smije se mijenjati: polja, sidra, stilovi, numeracija, relacije.
Testovi zato citaju SPOJENI tekst odlomka, ne sirovi XML; dio kvarova se u XML-u
uopce ne vidi (RE-57, RE-58). Iznimke koje smiju dirati vidljivi tekst i to je
namjerno: heading-case-fixer, croatian-typography-fixer, kanonizacija DOI-ja, toc-field-fixer
(tekst sadrzaja generira Word iz polja) i required-section-fixer (umece SAMO natpis koji propisuje
verificirano pravilo profila s izvorom, stranicom i citatom; nikakav sadrzaj, uz izricitu potvrdu;
odluka vlasnika 2026-08-30). toc-field vise NIJE privremen izuzetak: potvrdjen je
2026-08-19 zasebnim oracleom `npm run verify:word:toc` (autorski tekst netaknut i prije i poslije
Fields.Update(), sve stavke sadrzaja izvedene iz STVARNIH naslova). Ponovi tu provjeru pri svakoj
izmjeni toc-field-fixera; ona je jedini dokaz da izuzece vrijedi.

Popravak se smije nuditi i BEZ fakultetskog pravila, ali samo kao PREPORUKA:
violated:false, recommended:true, BEZ matchKeys (ne vezuje se na bodovan check,
ne moze pomaknuti ocjenu). Uz to: prolazi test vidljivog teksta, trazi potvrdu,
ne umece nov tekst, i kaze korisniku da nije zahtjev fakulteta. Presedan:
empty-paragraph-fixer, croatian-typography-fixer, element-caption-fixer (RE-59).
Zabranjeno ostaje: pisanje/prepravljanje recenica, generiranje sadrzaja modelom,
i BODOVANJE po pravilu bez sluzbenog izvora.

## Tvrdo pravilo: bodovana vrijednost mora se slagati s verificiranom tvrdnjom

Lanac dokaza (izvor + snapshot + stranica + doslovan citat + potpis) zivi u `ruleEntries`
(`data/profiles/<unit>/drafts/*.json`), a motor boduje iz naslijedjenog `rules`
(`composeAnalysisProfile` klonira `definition.rules`, NIKAD `ruleEntries`). Do 2026-08-22 se te dvije
strane nisu usporedjivale, pa je 40 parova (profil, os) kroz 23 profila bodovalo vrijednost koju
njihova vlastita `verified` tvrdnja s citatom opovrgava (`unizd-pomorski-*`: izvor Merriweather
10 pt, motor je trazio TNR/Arial/Calibri 11-12 pt).

- Usporedba: `src/verification/scored-value-binding.ts`, po OSI a ne po kljucu `rules` (motor cita
  par zastavica+vrijednost, pa usporedba po kljucu daje lazne nalaze).
- Artefakt `data/verification/scored-value-drift.json` (`npm run scored-value-drift`);
  `advisory-demotion.ts` ga cita i gasi bodovanje osi s raskorakom dok vlasnik ne presudi.
  Dokazni dosjei: `npm run drift-dossiers`.
- Gard `tests/scored-value-drift.test.ts`: artefakt = svjez izracun, ratchet smije samo padati,
  negativne kontrole dokazuju da provjera grize.
- Raskoraka je NULA od 2026-08-24 (svih 37 presudjeno i potpisano, data/verification/
  drift-decisions.json), a ratchet je spusten na 0. Mutacija o demotiji zato PODMECE raskorak
  umjesto da ga trazi u podacima: gard koji trazi da kvar postoji prestaje gristi kad je posao
  gotov, dakle u najgorem trenutku.
- Raskorak se NIKAD ne racuna iz demotije (inace se gard sam pobrise u sljedecem krugu); zato
  `computeBaseDemotedAdvisory` stoji odvojeno od `computeDemotedAdvisory`.
- Tvrdnja koja se ne slaze sa zrcalom NIJE automatski ona tocna: opovrgavajuci prolaz nasao je krivo
  pripisan opseg na 12 od 20 tvrdnji. Presuda je vlasnikova, po slucaju.

## Pravila profila (Option A)

- ruleEntries u data/** su autorski izvor istine; rules je naslijedeni agregat
  koji kompajler (src/profiles/rule-compiler.ts) overlaya u effectiveRules.
- Ne izmisljaj pravila: bodovana pravila smiju doci samo iz sluzbenih izvora.
- sourcePage koji nije rucno potvrdjen ostaje null, ne nagadjaj ga.
- Studentski radovi iz repozitorija sluze iskljucivo regresijskom testiranju
  parsera, nikada kao izvor pravila.

## Modalitet i opseg su dio tvrdnje

Svaki `ruleEntry` uz vrijednost nosi `modality` (koliko jako izvor obvezuje), `scope` (na koji dio
rada se odnosi) i `modalitySource` (tko ih je upisao). FER pilot je oborio 4 od 5 tvrdnji na
TUMACENJU, ne na prijepisu; opovrgavajuci prolaz je nasao krivo pripisan opseg na 12 od 20.

- `modality`: `obligation` | `directive` | `prohibition` | `recommendation` | `permission` |
  `condition`. `directive` (`treba`, goli indikativ, natuknicna specifikacija) postoji jer izvori
  imaju tri razine, a ne dvije.
- `npm run claim-modality` predlaze, `npm run claim-modality:apply` upisuje. Skript NE ODLUCUJE.
- Mehanika NIKAD ne upisuje ublazen modalitet: pripisivanje ublazavanja pravoj osi je citanje, ne
  uzorak. Svako ublazavanje ide covjeku.
- Gard `tests/claim-fields.test.ts`: vokabular, ugovor strojnog upisa, ratchet koji smije samo padati.

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

## Konvencije

- Hrvatski je default jezik sadrzaja i komentara u domenskim datotekama.
- Bez em i en crtica u tekstu; koristi zarez, dvotocku, zagrade ili zasebne recenice.
- TypeScript strict, cijeli src/ bez @ts-nocheck; any je dopusten samo na granici
  prema DOM-u i labavim podacima, u novom logickom kodu izbjegavaj.
- Bez localStorage hackova u novim modulima; postojeci safeStorageGet/Set ostaje.
- Produkcijski kod, ne primjeri. Male, fokusirane promjene, svaki korak zelen.

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

## Dijeljeno radno stablo

`git commit -- <putanje>` uzima sadrzaj iz RADNOG STABLA u trenutku commita, ne tvoju izmjenu.
Kad vise sesija radi u istom stablu, generator druge sesije zna upasti izmedju izmjene i commita
i njezin rad zavrsi pod tvojom porukom. Prije commita ponovi `git diff --stat -- <putanje>`.
Povijest se NE prepravlja dok druga sesija radi u istom stablu.

Obrnut smjer je jednako opasan: COMMITAN OVISNIK uz NECOMMITANU OVISNOST. Test koji jest u repou
trazi simbol koji postoji samo u radnom stablu, pa je grana zelena kod tebe a crvena na cistom
checkoutu (2026-08-30, cetiri puta u jednom danu). `tsc` to ne hvata, jer `tsconfig.json` ima
`include: ["src"]` pa se `tests/**` ne typechecka. Prije commita: `npm run orphan-scan`.
Necommitana datoteka sama po sebi NIJE kvar; opasan je samo par u kojem je ovisnik vec commitan.

Dvije provjere, dva razlicita pitanja, trebaju obje:
`npm run orphan-scan` -> "je li grana crvena na cistom checkoutu" (sekunde).
Cist worktree (`git worktree add --detach` + junction za `node_modules`) -> "je li gate zelen i je
li izvedeni artefakt reproducibilan". Artefakte (`docs/generated/**`, `dist-packs/**`) regeneriraj
SAMO ondje; izvjestaj i njegov ratchet uvijek idu u ISTI commit.

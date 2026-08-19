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
namjerno: heading-case-fixer, croatian-typography-fixer, kanonizacija DOI-ja i toc-field-fixer
(tekst sadrzaja generira Word iz polja). toc-field vise NIJE privremen izuzetak: potvrdjen je
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

## Pravila profila (Option A)

- ruleEntries u data/** su autorski izvor istine; rules je naslijedeni agregat
  koji kompajler (src/profiles/rule-compiler.ts) overlaya u effectiveRules.
- Ne izmisljaj pravila: bodovana pravila smiju doci samo iz sluzbenih izvora.
- sourcePage koji nije rucno potvrdjen ostaje null, ne nagadjaj ga.
- Studentski radovi iz repozitorija sluze iskljucivo regresijskom testiranju
  parsera, nikada kao izvor pravila.

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

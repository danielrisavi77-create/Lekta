# Katedra v1.1-advisory — dodaci (nad certificiranom v1.0.1 bazom)

> **Status i poštenje o opsegu.** `metadata.version` u SKILL.md frontmatteru
> namjerno ostaje **"1.0.1"** — to je frozen release-gate broj koji
> `tests/unit/test_release_v1_gate.py` provjerava bit-za-bit protiv
> `references/release_v1_audit.json` (44/44 AUD nalaza). Nije podignut na
> "1.1.0" jer taj broj u ovom projektu znači "prošao formalni B01–B20 audit",
> a ova četiri dodatka to nisu. Umjesto toga nose zaseban
> `metadata.extensions` marker. Nemaju vlastiti AUD broj u release manifestu,
> nemaju regression evals u `evals/`, i ne mijenjaju nijedan postojeći
> blocking contract (PLAN GATE, evidence gate, rad-audit boundary). Tretiraj
> ih kao **advisory dodatke pod istim inženjerskim standardom stila koda**,
> ali s nižom razinom dokazane pouzdanosti dok se ne provjere na stvarnim
> radovima i, idealno, ne provedu kroz isti B01/B17-stil eval lanac.

## Što je dodano

| Modul | Datoteka | Vrsta | Blokira li nešto? |
|---|---|---|---|
| Originality heuristika | `scripts/originality_check.py` | read-only, advisory | Ne. Nikad ne vraća blocking exit kod. |
| Bibliografski export | `scripts/export_bibliography.py` | format-adapter | Ne. Čita već postojeći `izvori.json`, ne generira nove tvrdnje o izvoru. |
| Hrčak/CROSBI discovery alias | `scripts/source_semantics.py`, `verify_sources.py` | proširenje taxonomy | Ne mijenja postojeće `verified/unverified/conflict/invalid` ponašanje za već podržane kanale. |
| Grill-me stress-test | `scripts/grill_me.py`, `references/grill_me.md` | advisory workflow korak | Ne. `plan_gate.py` nije diran. |

## Zašto baš ove četiri

Nastalo iz usporedbe s vanjskim GitHub projektima (superpowers, claude-superskills,
academic-writing-agents, awesome-claude-skills) — vidi razgovor. Dvije stvarne
praznine koje su te usporedbe otkrile bile su plagiat/originality signal i
formalni citation-manager export; CROSBI je prirodno proširenje već postojećeg
Hrčak discovery patterna; grill-me je laka, niskorizična implementacija
Sokratskog stress-test obrasca koji te repozitorije čini korisnima za planiranje.

## Što NIJE napravljeno (namjerno)

- Originality check ne pretražuje internet niti institucionalne baze
  (Turnitin/iThenticate) — nema pristupa takvim korpusima, a lažna tvrdnja
  o pokrivenosti bila bi opasnija od izostanka značajke.
- Grill-me pitanja nisu ugrađena u `plan_gate.py` kao blocking uvjet — to bi
  zahtijevalo novi AUD nalaz, novi regression test i reviziju release
  manifesta, što je izvan opsega ove nadogradnje.
- CROSBI/CroRIS nema poseban API integraciju (nema javnog strojno čitljivog
  API-ja); tretira se identično Hrčaku — kao HTTP-only discovery provjera.

## Preporučeni sljedeći korak

Prije nego se ovi moduli tretiraju kao dio "core" release contracta:
1. ~~Dodaj `evals/quality`-stil frozen test slučajeve za `originality_check.py`~~
   — **napravljeno, v. `#eval-set` ispod.** Namjerno NIJE ušlo u
   `eval_runner.py --lane` (taj CLI ima samo `triggers`/`workflows`/`all` i
   pripada B17/B18 routing contractu) niti u `faculty_scale_gate.py`
   (`evals/quality/faculty_cases.jsonl` je specifičan za faculty admission).
   Umjesto toga zaseban `scripts/originality_eval.py` runner, isti duh kao
   B18 "0 regresija" disciplina, ali strukturno odvojen od core contracta.
2. ~~Dodaj formalni JSON schema za `originality.json` i `plan_stress_test.json`
   izlaze~~ — **napravljeno:** `references/originality_schema.json`,
   `references/plan_stress_test_schema.json`, validirano u
   `tests/unit/test_v1_1_schema_contract.py` (4 testa, isti obrazac kao
   `test_evidence_model_contract.py` za core B12 sheme).
3. ~~Provedi barem jedan pravi rad kroz sve četiri nove skripte i usporedi
   nalaze s ljudskom procjenom~~ — **napravljeno, v. odjeljak ispod.**

## Validacija na stvarnom radu (kolovoz 2026.)

Sve četiri v1.1 skripte pokrenute su na stvarnom EFZG završnom radu
(61 bibliografska jedinica, hrvatski + engleski akademski tekst). Nalazi:

- **`export_bibliography.py`** — 61/61 unosa izvezeno bez pada, bez
  koliziju BibTeX ključeva. Otkrio je (ne uzrokovao) tri stvarna buga u core
  `verify_sources.rastavi()` — **popravljena, v. `#core-patch` ispod.**
- **`verify_sources.py` mrežna provjera** — nije bilo moguće testirati
  live network u ovom sandboxu (izlazni HTTP nije dostupan), ali svih 61
  unosa je korektno vratilo `unverified`/`availability: unavailable` bez
  pada; ispravno je prijavljen i stvaran prekršaj hrvatskog abecednog reda.
  6 hrvatskih izvora (Klarić, Krešić, Gluvačević, Trezner, Vukonić, Zdjelar)
  nema DOI/URL — profil izvora gdje bi CROSBI/Hrčak alias pomogao da su
  citirani s linkom; alias se ovdje nije aktivirao jer student nije unio URL.
- **`grill_me.py`** — bez problema na stvarnoj tezi/odgovoru s hrvatskom
  dijakritikom i in-line referencama.
- **`originality_check.py`** — izmjereno na tri stvarna odlomka: doslovan
  odlomak → 100% preklapanja (ispravno flagirano); **umjereno parafraziran
  isti sadržaj → 0% shingle preklapanja** (potpuno neuhvaćeno, 0 zajedničkih
  8-gram shingleova); nepovezan odlomak → ispravno ignoriran. Potvrđuje
  dokumentiranu granicu: alat hvata doslovno/blago izmijenjeno prepisivanje,
  **ne hvata pravu parafrazu**. Kandidat za sljedeću iteraciju: manji
  shingle prozor (4–5 riječi umjesto 8) bi uhvatio više parafraze, ali uz
  veći rizik lažnih pozitiva na standardne akademske fraze — kompromis koji
  treba eksplicitnu odluku, ne tihu promjenu defaulta. **Odluka korisnika:**
  ostaje na 8 (v. razgovor) — sigurnije, manje lažnih pozitiva.

## Core patch: `verify_sources.rastavi()` — autoriziran, izvan izvornog opsega {#core-patch}

> Ovo je jedina promjena u ovom paketu koja dira certificiranu core v1.0.1
> datoteku (`scripts/verify_sources.py`). Nije bila u izvornom opsegu
> "advisory dodaci koji ne diraju core" — napravljena je u dva navrata, oba
> puta nakon što je validacija na stvarnom radu (ili naknadni self-review)
> otkrila stvaran parsing bug, i **samo nakon eksplicitne korisničke
> autorizacije** svaki put (v. razgovor). Nema vlastiti AUD broj i nije
> uvedena kroz release_v1_audit.json — `metadata.version` ostaje "1.0.1"
> jer taj broj svjedoči o B01–B20 audit statusu, ne o "nijedna core linija
> nije dirana otkad je taj broj postavljen".

**Bug 1 — EFZG zarez-stil guta grad/nakladnika u `naslov`.** `references/plan.md`
§1.1 dokumentira da EFZG koristi "zarez iza zagrade s godinom, bez završne
točke" (npr. „Čavlek, N. (1998.), Turoperatori i svjetski turizam, Zagreb:
Golden marketing"). Bez ijedne točke u repu, prijašnja heuristika nije imala
granicu između naslova i "Grad: Nakladnik" repa pa je cijeli rep — uključujući
grad i nakladnika — završavao u `naslov`. Popravljeno dodavanjem fallback
splita na zarez ispred kapitaliziranog imena mjesta praćenog dvotočkom, kad
period-split ne nađe nijednu granicu.

**Bug 2 — godina s disambiguacijskim slovom lijepi slovo+zagradu na naslov.**
Isti-autor-ista-godina zapisi poput „(2025.a)" / „(2025.b)" (analogno APA
2025a/2025b) nisu bili prepoznati kao dio zatvarajuće interpunkcije iza
godine, pa je „a)"/„b)" ostajalo zalijepljeno na početak `naslov` polja.
Popravljeno proširenjem regexa koji čisti zatvarajuću interpunkciju iza
godine da dopusti i jedno slovo.

**Bug 3 — višeautorski unosi gube sve koautore osim prvog (otkriven naknadnim
self-reviewom, ne izvornom validacijom).** Nakon što je paket bio "gotov",
korisnik je pitao ima li još propusta prije nego se preda drugom modelu na
neovisnu reviziju; ponovna provjera vlastitog koda otkrila je da
`autor = re.split(r"\s*[,(]", glava)[0].strip()` uzima samo tekst prije
PRVOG zareza. Za jednoautorske unose to slučajno ispravno vraća samo prezime
(namjerno ponašanje, dokumentirano u testovima), ali za višeautorski unos
poput „Payne, J. E., Gil-Alana, L. A. i Mervar, A." to je tiho odsjeklo
oba koautora, vraćajući samo „Payne". Provjera na stvarnom EFZG radu
pokazala je da je pogodilo **30 od 61 izvora**. Utječe na svaki downstream
prikaz autora i na `export_bibliography.py` BibTeX/RIS izvoz (koautori
nestaju iz literature.bib).

Popravljeno novom `_izvuci_autore()` funkcijom: regex prepoznaje sve
"Prezime, Inicijali" skupine (prezime počinje velikim slovom, prati ga
zarez i jedan ili više inicijala oblika „X.") u glavi unosa i spaja ih
hrvatskom konvencijom, npr. „Payne, Gil-Alana i Mervar". Kad nijedna takva
skupina nije prepoznata (institucijski autor bez inicijala, npr. „Europska
komisija"), fallback je bit-za-bit identičan prijašnjem ponašanju — prvi
token prije zareza/zagrade — pa jednoautorski i institucijski slučajevi
ostaju nepromijenjeni.

Suptilnost pri implementaciji: regex traži doslovnu točku iza zadnjeg
inicijala (npr. „..., A."), ali `glava` prije ovog patcha prolazi kroz
`strip(" .,;(")` koji upravo tu završnu točku skida — s tim redoslijedom
zadnji koautor u nizu nikad ne bi bio prepoznat. Popravljeno tako da
`_izvuci_autore()` prima glavu PRIJE charset-stripa za regex prolaz, a
charset-stripanu verziju zadržava isključivo kao fallback ulaz.

**Dokaz bez regresije.** `tests/regression/test_efzg_comma_style_citations.py`
sada ima 8 testova ukupno: 4 iz prvog patcha (period-delimited, EFZG zarez-stil,
CROSBI/CroRIS footnote × 3) plus 4 nova za ovaj patch (višeautorski spoj,
dvoautorski spoj, jednoautorski guard, institucijski fallback guard). Pun
`pytest` nakon oba core patcha: **273 prošlo**, isti jedan pre-postojeći
environment-specifičan fail (`test_aud_010_missing_engine_returns_exit_3`,
prisutan i u originalnom v1.0.1 uploadu — nepovezan s bilo kojim patchem).

**Poznato preostalo ograničenje (nije popravljeno, namjerno).** Izdanje/edicija
zapisano kao „2. izd." unutar naslova (npr. „Turističke agencije, 2. izd.,
Zagreb: ...") i dalje ostavlja „, 2" na kraju `naslov` polja jer period-split
prvo nađe granicu iza „2." prije nego što fallback za zarez-stil dobije priliku.
Kozmetički, ne curi izdavač/grad — nije bilo u opsegu autorizacije, zabilježeno
za sljedeći krug. Nadalje, autori s prezimenima koja počinju malim slovom ili
prefiksom (npr. nizozemsko „van der Berg, J.") neće biti prepoznati regexom
`_izvuci_autore()` jer traži veliko početno slovo — pada natrag na
fallback-prvi-token ponašanje, isto ograničenje kao i prije ovog patcha.

## Frozen gold-set za `originality_check.py` {#eval-set}

`evals/quality/originality_cases.jsonl` (10 slučajeva) + `scripts/originality_eval.py`
(runner). Svaki slučaj bilježi **izmjereno** ponašanje, ne željeno — pad testa
znači da se ponašanje promijenilo (SHINGLE_N, default `--prag`, logika
`analiziraj()`), ne da je "netko pogriješio". `tests/unit/test_originality_eval.py`
je frozen regression gate: 10/10 PASS.

Konkretni, izmjereni nalazi o granicama defaultnog `--prag 0.5`:

| Kategorija | Overlap | Uhvaćeno pri defaultu? | Uhvatilo bi se uz |
|---|---|---|---|
| Doslovno prepisano | 1.000 | ✅ da | — |
| Doslovan citat s navodnicima+referencom | 0.667 | ✅ da (namjerno — ljudska provjera je li ispravno citirano) | — |
| Lagano izmijenjeno (par sinonima) | 0.333 | ❌ ne | `--prag ≤ 0.30` |
| Brojke/godina zamijenjene, ostatak identičan | 0.231 | ❌ ne | `--prag ≤ 0.10` |
| Doslovan fragment ugrađen u dulju rečenicu | 0.103 | ❌ ne | `--prag ≤ 0.10` |
| Prava parafraza (drugi red riječi, isto značenje) | 0.000 | ❌ ne | nikad — izvan dosega `--prag`, treba manji shingle prozor ili semantičku metodu |

**Zaključak za buduću odluku o tuningu:** "lagana izmjena", "zamijenjeni podaci"
i "djelomično ugrađeno prepisivanje" nisu izvan dosega alata — dijele nenulti
overlap i uhvatili bi se **samo snižavanjem `--prag`**, bez diranja
`SHINGLE_N`. To je jeftiniji i predvidljiviji zahvat od smanjenja shingle
prozora (koji je bio prijašnja preporuka za hvatanje parafraze, a i dalje
ostaje jedina opcija za pravu parafrazu — overlap 0.000 se ne pomiče
promjenom praga). Dvije odvojene odluke, dva odvojena rizika:
`--prag` niže → više lažnih pozitiva na kratke/generičke rečenice;
manji `SHINGLE_N` → još više lažnih pozitiva na standardne akademske fraze.
Nijedno nije promijenjeno u ovom paketu — ostaje eksplicitna buduća odluka,
sad barem s brojkama iza sebe.

## Self-review nalazi na vlastitom v1.1 kodu (kolovoz 2026.) {#self-review}

Nakon što je gornji "core patch" i eval-set posao bio gotov, korisnik je
pitao ima li još propusta ili je vrijeme za nezavisnu reviziju drugim
modelom. Prije te revizije, ponovna vlastita provjera cijelog paketa
otkrila je dva daljnja buga — oba u **vlastitom** v1.1 kodu (ne core), oba
popravljena istog dana:

**Bug B — `export_bibliography._bibtex_escape()` nepotpun escaping.**
Izvorna verzija escapeala je samo `{`/`}`. Stvarni akademski naslovi nose
`%`, `&`, `#`, `_`, `$`, `~`, `^` (npr. "50% growth & change_in tourism #1")
— svi su LaTeX category-code-changing znakovi koji bi tiho slomili
kompilaciju `.bib` datoteke ili iskrivili renderirani tekst. Popravljeno
punim escapingom svih LaTeX-specijalnih znakova. Backslash je poseban
slučaj: njegova zamjena (`\textbackslash{}`) sama sadrži `{`/`}`, pa naivna
implementacija (zamijeni `\` prvo, pa onda escapeaj zagrade) dvostruko
escapea vlastiti rezultat u `\textbackslash\{\}`. Ovo je uhvaćeno vlastitim
testom tijekom popravka (`test_bibtex_escape_handles_literal_backslash_without_double_escaping`)
i popravljeno placeholder-pristupom: backslash se prvo zamijeni internim
placeholderom, sve ostalo escapea, pa se placeholder tek na kraju zamijeni
konačnim `\textbackslash{}` tekstom. Sam placeholder prvog pokušaja
(`"\x00KATEDRA_BACKSLASH\x00"`) sadržavao je `_`, pa ga je `_`→`\_` pravilo
u međuvremenu pokvarilo — uhvaćeno drugim testom
(`test_bibtex_escape_backslash_survives_alongside_underscore`), popravljeno
uklanjanjem `_` iz placeholdera.

**Bug C — CROSBI/CroRIS footnote grana bez test-pokrivenosti.** Grana u
`verify_sources.provjeri_url()` dodana uz NEW-103 (CROSBI discovery alias)
nikad nije bila izvršena automatskim testom: mreža je bila nedostupna i u
ovom sandboxu i na stvarnom EFZG radu (nijedan od 61 izvora u testnom
korpusu nije imao `bib.irb.hr`/`croris.hr` URL), pa je grana bila "mrtav
kod" u svakom dosadašnjem test runu — nije bug u ponašanju, nego rupa u
dokazu da ponašanje uopće radi. Popravljeno s tri nova
`monkeypatch.setattr(V, "_zahtjev", ...)` testa koja mockaju mrežni poziv:
CROSBI URL dobiva footnote, CroRIS URL dobiva footnote, i (regresijski
guard) Hrčak URL i dalje dobiva SVOJ footnote bez CROSBI teksta u njemu.

Sva tri nalaza (core Bug 3/A, i vlastiti Bug B i C) zajedno pokrivena su u
istom pytest runu spomenutom gore (273 prošlo, 1 nepovezan pre-postojeći
fail).

## Nezavisna adversarial revizija — drugi model, izoliran kontekst (kolovoz 2026.) {#nezavisna-revizija}

Nakon self-reviewa iznad, korisnik je odobrio i pokretanje nezavisne revizije:
svjež agent (jači model, bez ikakvog pamćenja ove sesije ili prethodnog
rezoniranja) dobio je samo opis paketa i uputu da samostalno traži bugove,
bez uvida u ovaj dokument unaprijed. Rezultat: **13 stvarnih nalaza**, od
kojih je najozbiljniji da je **vlastiti popravak koautora (core patch #2,
odjeljak `#core-patch` iznad) bio djelomična regresija** — ispravljao je
originalni bug (svi koautori osim prvog se gube), ali je za imena sa stranom
dijakritikom u DRUGOM/TREĆEM dijelu prezimena (npr. „van der Berg", „Müller",
„Poncibò") uvodio NOVI, drugačiji način gubljenja podataka. Sve nalaze
popravlja core patch #3 (v. `_izvuci_autore()` u `verify_sources.py` za pun
tehnički opis) plus dopune u `originality_check.py`, `export_bibliography.py`
i `grill_me.py`.

**Nalazi 1-2 (core, autoriziran core patch #3) — regex za prezime prihvaćao
je samo malu hrvatsku dijakritiku.** `[A-ZČĆŽŠĐ][A-Za-zčćžšđ\-]*` (patch #2)
nije sadržavao VELIKU hrvatsku dijakritiku niti ikakvu stranu dijakritiku
(ü ö ä é ø å ñ ß ...), niti razmak/apostrof unutar prezimena. Za
„van der Berg, J." to je značilo da se `findall()` (bez sidrenja) ponovno
usidrio na „Berg" umjesto da cijeli unos odbije — dokumentacija je tvrdila
suprotno (da pada na identičan fallback kao prije bilo kojeg patcha), što je
revizija dokazala netočnim. Za „Müller, H., Schröder, K. i Weiß, T." nijedan
autor uopće nije prepoznat (bez ijednog matcha), pa je CIJELA autor-grupa
tiho propala. Popravljeno potpunim prepisivanjem `_izvuci_autore()`-a u
sekvencijalni tokenizator (v. docstring `_PREZIME_RE`/`_INICIJALI_RE`/
`_AUTOR_SEP_RE` u `verify_sources.py`) koji koristi Python 3 Unicode-svjesni
`\w` umjesto eksplicitnog nabrajanja znakova — hrvatska i strana dijakritika
rade identično bez posebnog tretmana. Dodano: prepoznavanje čestica („van",
„der", „von", „de" ...), spojenih/višerječnih prezimena („Marić-Šimun",
„Kovačević Prpić"), apostrofa („O'Brien"), i „i dr."/"et al." kao završnog
markera koji NE izmišlja dodatna imena. Ključna arhitektonska razlika od
patch #2: sekvencijalni parser zahtijeva da svaka autor-skupina počne TOČNO
tamo gdje je prethodna završila — ako parsiranje na bilo kojoj točki ne
uspije, CIJELI rezultat se odbacuje u korist starog fallbacka, umjesto da se
vrati djelomično, krivo prezime.

**Nalaz 6 — strukturirano `autori: list[str]` polje.** `export_bibliography.py`
je i dalje pisao spojen prikazni string („Payne, Gil-Alana i Mervar")
doslovno u BibTeX `author = {...}` polje. Pod stvarnom BibTeX gramatikom
imena to se parsira kao JEDAN autor (zarez unutar jednog imena znači
"Prezime, Ime"), pa je tvrdnja iz core patcha #2 („popravlja nestajanje
koautora iz BibTeX izvoza") bila netočna — izvoz je i dalje bio pogrešan, samo
drugačije. `rastavi()` sada uz `autor` (prikazni string) vraća i `autori`
(popis pojedinačnih prezimena); `export_bibliography.izvor_u_bibtex()` spaja
ih ključnom riječi `" and "`, a `izvor_u_ris()` piše jedan `AU` redak po
autoru (RIS `AU` tag je ponovljiv, ne spojiv zarezom). Stariji `izvori.json`
snapshotovi bez `autori` polja i dalje rade — fallback na jednoautorski popis
iz `autor`.

**Nalaz 5 — `doi`/`url` polja u `.bib` izvozu nisu bila eskejpana.** Ternary
koji je trebao razlikovati doi/url od ostalih polja imao je oba grananja
BIT-ZA-BIT identična (mrtav kod, dokaz da je posebno rukovanje bilo namjeravano
pa izgubljeno). Stvaran URL s `%`/`&`/`_` u query stringu (uobičajeno na
Eurostat/EC/Hrčak linkovima) je ili otvarao LaTeX komentar (`%`) ili pucao
kompilaciju. Popravljeno: `doi`/`url` sada prolaze kroz isti `_bibtex_escape()`
kao autor/naslov.

**Nalaz 13 — `bibtex_key` dedup sufiks prelazio je 'z'.** `chr(ord("a") + i - 1)`
je nakon 26. kolizije istog baznog ključa proizvodio `{`, `|`, `}` —
neuparena `{` čini cijelu `.bib` datoteku strukturno nevaljanom. Popravljeno
base-26 sufiksom (`a...z, aa...az, ...`) koji nikad ne izlazi iz `[a-z]`.

**Nalaz 7 — guard od 60 znakova odsijecao je ispravno parsirane duge popise
autora.** Guard je pisan za "ovo ne izgleda kao prezime" (nedostižno prije
patcha #2, jer golo prezime nikad nije 60 znakova). Nakon multi-author
popravka, legitiman popis od 5+ autora rutinski prelazi 60 znakova i guard
ga je odsijecao nasred riječi. Popravljeno: guard sada vrijedi SAMO za
fallback-prvi-token rezultat (`_izvuci_autore()` vraća i `prepoznato: bool`
zastavicu), ne i za rezultat stvarno parsiranih imena.

**Nalazi 8-10 — naslov-ekstrakcija.** Tri odvojena, stvarna propusta u
`_razdvoji_naslov_kandidate()` (v. `verify_sources.py`):
naslov koji sam sadrži „Riječ: Podnaslov" (npr. „Turizam: ekonomske osnove")
lažno je okidao zarez-stil "Grad: Nakladnik" granicu na PRVOM pogotku umjesto
POSLJEDNJEM, pa je cijeli stvarni rep (grad, nakladnik) završavao u naslovu;
časopisni citati s "..., Vol. 28, No. 1, str. 1-20." repom lomili su naslov
nasred kratice „Vol" jer stara heuristika nije razlikovala kraticu od kraja
rečenice; višerječni gradovi ("New York:", "Slavonski Brod:") uopće nisu bili
prepoznati (regex je dopuštao samo jednu riječ ispred dvotočke). Sve tri
popravljene; poznato preostalo ograničenje (v. odjeljak `#core-patch` iznad)
i dalje vrijedi za naziv časopisa koji ostaje zalijepljen za naslov u
komma-stil citatima (Vol./No./str. brojevi se ispravno odsijecaju, ali sam
naziv časopisa nema pouzdanu regex-granicu od naslova bez daljnje strukture).

**Nalaz 11 — `matched_excerpt` u `originality_check.py` prikazivao je krivi
dio izvora.** `evidence_ingest._passages()` namjerno emitira CIJELE STRANICE
kao jedan passage za PDF-ove bez praznih redaka, pa je `text[:200]` tipično
bio vrh stranice, nepovezan sa stvarno preklapajućim shingleom — za alat čija
je svrha "vrati na ljudsku provjeru", pogrešan izvadak poražava svrhu.
Popravljeno: `_prozor_oko_shinglea()` locira poziciju stvarno preklapajućeg
shinglea u ORIGINALNOM (ne-normaliziranom) tekstu izvora i centrira prozor
oko nje.

**Nalaz 4 — `--prag` izvan `[0, 1]` bio je tiho prihvaćen.** `--prag 50`
(prirodan pokušaj da se napiše "50%") je značio da nijedan nalaz nikad ne
može doseći prag (omjer preklapanja je uvijek ≤ 1.0) — alat bi uvijek
ispisao "✅ čisto" bez obzira na sadržaj, a JSON izlaz bi kršio vlastitu
`originality_schema.json` (`prag` maximum 1). Popravljeno: CLI sada odbija
`--prag` izvan `[0, 1]` s exit 2 i uputom.

**Nalaz 3 — prazan dokument (0 prepoznatih odlomaka) tiho je prijavljivao
"✅ čisto".** `hr_text.ucitaj(..., samo_tijelo=True)` traži oblik poput „1.
Uvod"/"UVOD"; rad s rimskim brojevima ili engleskim naslovima poglavlja nikad
ne postavi početak tijela, pa je analiza prošla kroz 0 odlomaka i svejedno
ispisala zeleni nalaz. 100%-prepisan rad bi tiho prošao. Popravljeno:
eksplicitno upozorenje kad je `len(odlomci) == 0`, i "✅ čisto" se više ne
ispisuje u tom slučaju (razlikuje se od "0 nalaza nakon stvarne analize").

**Nalaz 12 — `grill_me.py` je rušio sa sirovim tracebackom na korumpiran
state file.** `{}`  → `KeyError: 'zapisi'` na `zabiljezi`; ne-JSON sadržaj →
`json.decoder.JSONDecodeError` na `status`. Ostatak codebase-a
(`plan_state.py ucitaj()`) ima utvrđenu konvenciju: uhvati grešku, ispiši
"❌ ... Što napraviti: ...", vrati kontroliran exit kod. `grill_me.py` je bio
jedina v1.1 skripta koja to nije slijedila. Popravljeno istom konvencijom
(nova `GreskaUlaza` iznimka, exit 2).

**Nalazi 16 (dokumentacijska netočnost) — CROSBI oversell u
`export_bibliography.py`.** Docstring i `--include-blocked` help su naveli
"CROSBI" kao primjer discovery-service entiteta koji se isključuje iz izvoza
— netočno. CROSBI/CroRIS je `discovered_via` DISCOVERY KANAL (analogno
Hrčaku), ne discovery-service ENTITET; samo Google Scholar (meta-tražilica)
je entitet koji se isključuje. Stvaran CROSBI izvor ostaje normalan
bibliografski unos i izvozi se kao i svaki drugi. Popravljeno u docstringu,
CLI helpu i error porukama.

**Nalaz 14 (arhitektonska posljedica, dokumentirano, NE popravljeno kodom) —
promjena `autor` polja mijenja `stable_source_id` za izvore bez DOI-ja/URL-a.**
`evidence_model.stable_source_id()` (certificirani B12 core, nije diran ovim
paketom) hashira `autor|godina|naslov` kad izvor nema DOI ni URL — a upravo
je to profil 6 od 61 hrvatska izvora u validacijskom radu. Promjena `autor`
formata (core patch #2 pa #3) mijenja te ID-jeve. **Ako je projekt već
pokrenuo `verify_sources.py` PRIJE ovog paketa i ingestirao B12 evidence
vezanu uz stare `source_id`-jeve, treba PONOVNO pokrenuti `verify_sources.py`
i ponovno ingestirati evidence nakon nadogradnje** — inače `evidence_gate.py`
prijavljuje da verification snapshot ne sadrži `source_id`, a
`evidence_ingest.py --source-verification` odbija stare veze. Ovo NIJE
popravljeno automatskom migracijom u ovom paketu (`evidence_model.py` je
core B12 datoteka izvan opsega ove autorizacije — dirati algoritam hashiranja
bio bi treći core patch mimo `verify_sources.py` i zahtijevao bi zasebnu
odluku i migration tooling, ne tihu izmjenu usput). Isto vrijedi i za
`abecedni_red()` sortiranje — promjena `autor` stringa mijenja koji parovi
se prijavljuju kao izvan hrvatskog abecednog reda; nije strukturna greška,
samo drugačiji (točniji) ulazni podatak.

**Nalazi 17-20 (dokumentacijska čišćenja) — netočni brojevi testova i
kontradiktorne izjave o regresijskom dokazu u ovom dokumentu i u
`PROMJENE.md`, plus omekšana formulacija oko toga što "frozen release-gate
broj" stvarno provjerava** (verzije stringova i AUD↔test-node mapiranje, NE
sadržaj skripti — gate strukturno ne može primijetiti da je `verify_sources.py`
mijenjan tri puta). Sve ispravljeno u ovom prolazu; v. `PROMJENE.md` za
ažurirane brojeve.

**Dokaz bez regresije.** Novi `tests/regression/test_independent_review_v1_1_findings.py`
(14 testova) pokriva nalaze 1/2/7/8/9/10; postojeći
`tests/unit/test_export_bibliography.py` proširen za nalaze 5/6/13 (6 novih
testova); `tests/unit/test_originality_check.py` proširen za nalaze 3/4/11
(3 nova testa); `tests/unit/test_grill_me.py` proširen za nalaz 12 (2 nova
testa). Ponovna validacija na stvarnom EFZG radu (61 izvor): broj ispravno
prepoznatih višeautorskih unosa porastao je s 30 (core patch #2) na **33**
(core patch #3) — dodatna 3 su bila upravo strani-dijakritik/čestica
slučajevi koje je patch #2 tiho gubio (`Poncibò`, `van Heiningen`,
`Porada-Rochoń`, `Gössling`, `Gyimóthy`, `Nørfelt`, `Cugueró-Escofet`,
`Akbıyık` — svi sada prisutni). Ručno uspoređeno **12 od 61** autor-polja
promijenjeno je između core patch #2 i #3 izlaza; svih 12 promjena je
provjereno kao ispravak (vraćen izgubljeni koautor ili spojena riječ
prezimena), nijedna kao regresija. Pun `pytest` nakon svih popravaka iz
nezavisne revizije: **297 prošlo**, isti jedan pre-postojeći nepovezan fail
(`test_aud_010_missing_engine_returns_exit_3`).

# v1.9.5 — kratica institucije kao alias (kvar 12)

* **Zašto.** `extract_biblio_keys` svodi redak popisa na (prvi pojam, godina). Institucionalni autor nosi oba oblika — pun naziv i kraticu — a koji je „prvi pojam" ovisi o redu zapisa. `Hrvatska narodna banka (HNB) (2023)` daje `hrvatska`, citat `(HNB, 2023)` daje `hnb`, pa isti izvor ispada **istodobno siroče i citat bez reference**. Mjereno na dva institucionalna izvora: **četiri nalaza, nijedan stvaran**, izlaz 1. Obrnuti zapis (`HNB (Hrvatska narodna banka)`) prolazio je slučajno jer je ondje kratica prva — zato je u `POMIRENJE.md` ostao zapisan samo kao sumnja, i to u suprotnom smjeru od onoga u kojem kvar doista postoji.
* **Popravak.** Kratica u zagradi vodi se kao **alias**, ne kao drugi unos: `biblio_aliasi()` gradi `{(alias, godina): (glavni, godina)}`, a `main` preslikava ključeve iz teksta prije usporedbe. Upisivanje obaju ključeva kao definicija bilo bi lakše i pogrešno — nekorišteni oblik postao bi novo lažno siroče.
* **Provjereno (5 slučajeva).** pun naziv (kratica) + kratica u tekstu → 0 nalaza · kratica (pun naziv) + kratica → 0 · kratica (pun naziv) + pun naziv → 0 · **stvarno nedostajuća referenca `(Kovač, 2020)` i dalje pada, izlaz 1** (pravilo 34) · popis i dalje ima jedan unos po retku. Suite **82 → 87**: dva smjera, izostanak drugog unosa, zagrada bez slova, osobni autor.
* **Granica.** Alias se traži samo u institucionalnoj grani i samo u zagradi unutar imena. Kratica koja u popisu nigdje ne stoji uz pun naziv (npr. samo „HNB" u popisu, „Hrvatska narodna banka" u tekstu) i dalje ostaje neuparena — za to nema signala u dokumentu.

# v1.9.3 — dijalekt lokatora i dijeljenje rečenica u pravnoj prozi

> **Zadnji korak svake zakrpe koja dira `rad-audit/scripts/`:** osvježi
> `engine_contract.json` → `engine_version` na `katedra_adapter.otisak_motora()` i pokreni
> `tests/test_all.py`. Otisak se računa iz izvora, a u contract se upisuje rukom; bez toga
> Katedra odbija `DocumentAuditResult`, a `--provjeri` i dalje javlja ✅ (v. kvar 11).

* **Kvar 9 — `LOKATOR` poznaje samo dvotočku.** Apa-hr piše `, str. 170`; zagradni parser
  taj oblik proguta repnom klauzulom, narativni nema, pa `Šimović (2008, str. 6)` nije
  citat. Na radu s pet narativnih i četiri zagradna citata siročad je bilo točno tih pet.
  Mjereno: `Citirano u tekstu 5 → 10`, `SIROČAD 5 → nema`. 84 regresijska testa prolaze.
* **Kvar 10 — `common.sentences` lomi rečenicu na rednom broju i unutar zagrade.**
  `prema članku 6. ZPD-a` daje dvije rečenice, `(MRS 12, t. 24.)` daje fragment `24.).` od
  jedne riječi, a nedostajalo je i pravilo o rednom broju pred malim slovom koje
  `katedra-lite/hr_text.py` ima od početka (`od 1.` + `siječnja 2026.`). Mjereno na istom
  radu: `305 → 270` rečenica, medijan `19 → 21,0`, vrlo kratke `24 % → 16 %`; ručno brojenje
  iste proze daje 193 rečenice i medijan 24. Preostalih 16 % nisu rečenice nego brojevi
  naslova koje ekstrakcija ulijeva u isti tok — to je kvar ekstrakcije i mjeri se zasebno.

# Vancouver dijalekt, lektura i tvrdnje koje se provjeravaju (rujan 2026.) — kvarovi 4–8

Zakrpa sa sesije nad diplomskim radom HKS-a (Fakultet zdravstvenih studija, palijativna
skrb, 75 referenci, 132 navoda oblika `(1)`).

* **Kvar 4 — Vancouver `(N)` dijalekt bio je opisan, a nije bio napisan.** `common.detect_citation_style` poznavao je samo `[N]` i autor–godinu, pa je rad s numeričkim citatom u ovaloj zagradi ispadao `unknown` i pokretala su se **oba pogrešna** checkera: jedini crveni nalaz cijelog audita bio je lažan, a svih 132 stvarnih navoda ostalo je neprovjereno. Teži dio kvara nije bio u kodu nego u `SKILL.md`-u, koji je taj dijalekt opisivao kao gotov i dokazan („mjereno: kritično 1 → 0, 78/78 testova"), dok je `grep -c -i vancouver` nad `common.py` i `check_citations.py` davao `0` i `0`. Druga pojava mehanizma iz kvara 36 (`katedra-lite`), pa je iz nje izvedeno i **željezno pravilo 8 skilla `katedra`**: tvrdnja u SKILL.md-u bez testa je fikcija.
* **Kvar 5 — redoslijed prvog pojavljivanja nije ulazio u ocjenu.** Provjera je postojala, ali njezin nalaz nije dizao težinu, pa je sedam citata koji krše rastući redoslijed prošlo bez traga.
* **Kvar 6 — domenska auto-detekcija nema biomedicinu**, pa nad radom iz zdravstvenih studija promašuje u tišini.
* **Kvarovi 7 i 8 — R14 i R15 opisani, kod nepromijenjen.** `HEADING_RE` i `_osnova` nisu poznavali „Izvori i literatura" ni padež stranog prezimena; toggle navodnika nije vidio već otvoreni navodnik. Sada su implementirani i pokriveni testovima.
* **Nove skripte.** `parafraza.py` (parafraza bez lokatora), `brojke_iz_rasprave.py` (brojke koje rasprava izvodi iz vlastitih prikaza). Nova referenca `references/lektura.md`.
* **`katedra/scripts/zakrpa.py --provjeri-tvrdnje`** uspoređuje što `SKILL.md` tvrdi sa stvarnim stanjem: sposobnosti naspram `engine_contract.json` i „N/M testova" naspram pokrenutog suitea. Iza kvara 4 stoji upravo taj alat.

**Test suite: 82/82 prolazi** (prije zakrpe 63). `--provjeri-tvrdnje` nad `rad-audit`: „✓ SKILL.md i kod se slažu", uz jedno savjetodavno ⚠ da manifest nosi `phase.G` koju SKILL.md ne spominje.

## Kako je zakrpa primijenjena

Zip je nastao na bazi **prije** commita `ecfd644` (kvar 2, izvori bez osobnog autora), pa
kopiranje po datotekama ne bi bilo primjena nego vraćanje unatrag: njegov
`check_citations_authoryear.py` još nosi `_OBLIK_TVRTKE`, a `common.py` nema `_AY_NAPOMENA`
ni preskakanje signalnih riječi (`usp.`, `vidi`, `prema`). Zato je zip zapisan na svojoj
bazi i **spojen trosmjerno**: `common.py`, `check_citations_authoryear.py` i `test_all.py`
git je pomirio sam, pa oba popravka stoje.

Dva sukoba riješena ručno:

* **`engine_contract.json`** — `engine_version` je sha256 nad `scripts/*.py`, pa poslije
  spoja nije točan nijedan od dvaju ponuđenih (zip `55757f98`, main `975259d7`). Preračunat
  nad spojenim stablom: **`1e988db8`**.
* **`references/zamke.md`** — dva kataloga koja oba počinju od 1. Brojevi iz `main`-a
  (1 detekcija domene, 2 izvori bez osobnog autora, 3 `updateFields`) ostaju jer se na njih
  već pozivaju `PROMJENE.md`, katalog `katedra-lite` i opisi PR-ova; zipovi 1–5 pomaknuti su
  na **4–8**.

**Popravak u samoj zakrpi:** `zakrpa.py --provjeri-tvrdnje` s relativnim putom pokretao je
test suite s `cwd` u `scripts/tests`, gdje taj put pokazuje u prazno, pa je javljao
„suite se ne može pokrenuti" i obarao provjeru — lažni ❌ iz alata koji upravo lovi tvrdnje
bez pokrića. Korijen se sada razrješava u apsolutni put.

**Ostaje za oko:** unosi 7 i 8 nemaju isječak koda ili izlaza koji kvar pokazuje
(`kvar.py --provjeri` ih javlja kao savjet, izlazni kod 0).

# Faza B: izvori bez osobnog autora (rujan 2026.) — kvar 2

`check_citations_authoryear.py` sada iz retka literature prepoznaje institucionalnog
autora kao naziv prije prve godine u zagradi. Time isti ključ dobivaju mediji i platforme
s točkom u nazivu (`danas.hr`, `Index.hr`), institucije i kratice s točkom prije godine
(`UNESCO. (2021)`). Osobni autor i dalje prvo prolazi kroz stroži postojeći parser.

Parentetički parser sada iz identiteta citata izostavlja signalnu riječ (`usp.`, `vidi`,
`prema`, `cf.`) i kratku napomenu iza godine. Zato oblik `usp. Tonković, Krolo i Marcelić,
2014, za analizu` daje isti ključ `tonković/2014` kao redak literature.

Regresijski fixture `author_year_institutions.docx` pokriva pet konzistentnih jedinica:
dvije domene, ministarstvo, UNESCO i osobnog autora u citatu sa signalnom riječi/napomenom.
Prije zakrpe: 2 definirane jedinice, 3 neprepoznata retka, 1 lažno siroče i 3 lažna citata
bez reference; poslije: 5 definiranih, 0 neprepoznatih, 0 siročadi, 0 citata bez reference,
exit 0. Zasebni guardovi potvrđuju da stvarno nedostajući medij i pogrešna godina i dalje
ostaju nalazi.

Promjena dviju skripti osvježava otisak u `engine_contract.json`; bez toga Katedrin
`engine.py` ispravno odbija rezultat kao verzijski nekompatibilan.

# Detekcija domene (rujan 2026.) — kvar 1

Nađeno na diplomskom radu iz medijskih studija (FPZG, 13 203 riječi).

| datoteka | greška | posljedica prije zakrpe |
|---|---|---|
| `domains/__init__.py` | `tl.count(k)` traži korijen kao slobodan podniz, bez granice riječi | `stup` hvata „nastup"/„dostupan" (30×), `okvir` „teorijski okvir" (38×), `temelj` „temelji se" (13×) → **83 boda za „celik"** na radu o glazbi |
| `domains/__init__.py` | domena se prihvaća golim zbrojem ≥ `min_score` | na dovoljno dugom tekstu dvije česte riječi prijeđu svaki fiksni prag; `generic` (točan odgovor) postao nedostižan |

Popravljeno: korijeni se traže na početku riječi (`(?<!\w)`), a domena se prihvaća samo uz
jedan od dva dokaza struke — **≥ 5 različitih** ključnih riječi (`MIN_RAZLICITIH`) ili **≥ 1
domensku oznaku** iz `claim_patterns` (IPE 300, S235, RAL 9006, IP44, HTTP 404…). Novi
`detect_domain_detail()` vraća i razlog odluke; `numbers_inventory.py` ga ispisuje kao
`↳ 'celik' ima 38 bodova, ali samo 4 različitih ključnih riječi (traži se 5) i 0 domenskih
oznaka`, pa je kriva detekcija vidljiva umjesto tiha.

Mjereno na tri ulaza: sporni rad `celik` → `generic`; `katedra/assets/domena_celik.docx`
(stvarni inženjerski rječnik) `celik` → `celik`, bez regresije;
`katedra/assets/domena_drustvene.docx` `celik` → `generic`.

**Granica:** `detect_domain` i dalje ne poznaje nijednu ne-inženjersku domenu. Rad iz
društvenih i humanističkih znanosti ide na generički frekvencijski rječnik, što je točno,
ali znači da faza C nad takvim radom ne nudi domensku provjeru — samo popis riječi uz
brojeve. Sukob koji je u tom radu ostao neuhvaćen („oko četrdeset pet zemalja" naspram „iz
oko 4 zemalja") generički rječnik i dalje ne hvata; to traži zaseban zahvat u
`zbroj_kategorija`.

**Naknadno popravljeno u 1.9.2:** lažni „CITAT BEZ REFERENCE" i lažno siroče u fazi B nad
izvorima bez osobnog autora — v. `references/zamke.md`, kvar 2.

**Dopuna (4. 9. 2026.):** docstring `_bodovi` postao je raw string. `(?<!\w)` u običnom
docstringu daje `SyntaxWarning: invalid escape sequence` na Pythonu 3.12+, pa je svaki
poziv `numbers_inventory.py` ispisivao upozorenje prije rezultata, a na budućem Pythonu
to je greška. Mjereno: prije 1 upozorenje nad `domena_celik.docx`, poslije 0; detekcija
nepromijenjena (`celik` → `celik`, `domena_drustvene` → `generic`).

# Zakrpe skripti (kolovoz 2026.)

Nađeno i ispravljeno na stvarnom završnom radu (EFZG, hrvatski APA, 61 izvor).

| datoteka | greška | posljedica prije zakrpe |
|---|---|---|
| `common.py` | `CITE_AY_RE` traži `)` odmah iza godine | hrvatski „(Čavlek i sur., 2011.)" nije prepoznat — **0 citata pronađeno** |
| `check_citations_authoryear.py` | vidi samo zagradni oblik | narativni „Faulkner (2001.)" nevidljiv; na testnom radu 62 od 86 citata |
| `check_citations_authoryear.py` | usporedba je gola razlika skupova | sklonidba („Albersa"), višečlana prezimena („van Heiningen") i institucije („TUI AG") daju lažne nalaze |
| `check_typography.py` | `m` u alternaciji hvata „**m**ilijuna" | hrvatski separator tisućica „1.465 milijuna" prijavljen kao decimalna točka |
| `check_fields.py` | `pageBreakBefore` uvijek upozorenje | propisani prijelom pred poglavljem prijavljen kao problem |
| `apply_safe_fixes.py` | briše sve `pageBreakBefore` po defaultu | **tiho krši formalni zahtjev fakulteta**; sada je opt-in `--strip-breaks` |

**Učinak na testnom radu:** nalazi citiranja **42 lažno kritična → 4 za ručnu
provjeru**, tipografija **5 lažnih → 0**, regresijski testovi (`scripts/tests/test_all.py`)
i dalje prolaze.

Preostala 4 nalaza granica su heuristike (npr. „Na primjerima koncerna TUI i
Thomas Cook Boz (2016.)…" gdje regex zahvati i imena poduzeća). Skripta sama kaže
da je heuristika i traži ručnu provjeru — to je sada istina, prije je bila poplava
lažnih alarma.

## v1.9 — Vancouver dijalekt (rujan 2026.)

| datoteka | promjena |
|---|---|
| `common.py` | `VANCOUVER_CITE_RE`, `vancouver_is_decimal`, `parse_vancouver_citations`, `LIT_HEADING_RE` (i „Popis citirane literature", „Literatura i izvori"…), `NUMBERED_ITEM_RE`; `detect_citation_style` vraća i `vancouver` |
| `check_citations.py` | drugi argument `ieee\|vancouver` (inače po tekstu); Vancouver: siročad, bez reference, redoslijed, razmak iza zareza, en-crtica, citat prije interpunkcije, „i sur." nakon 6 autora |
| `audit_all.py`, `generate_report.py` | faza B pokreće Vancouver granu; `mixed` uz Vancouver signal pokreće i nju |
| `katedra_adapter.py`, `engine_contract.json` | capability `hr.citations.vancouver.v1`, novi otisak motora |
| `tests/` | fixture `vancouver.docx` + skupina R16 (15 provjera) |

**Učinak na HKS-FZS radu (75 referenci):** kritično **1 → 0** (lažni `Rec(2003)24`), popis 75/75, 0 siročadi.

## Izmjene u dokumentaciji

- `SKILL.md` — `apply_safe_fixes.py` više ne uklanja prijelome po defaultu; dodan `--strip-breaks` i objašnjenje kad se smije koristiti; faza F preformulirana (prijelom se skida s natpisa prikaza, ne s naslova poglavlja).
- `references/pipeline.md` — ista distinkcija + 4 nova retka u katalogu zamki (hrvatski APA, narativni citat, sklonidba, separator tisućica).

## Provjera nakon instalacije

```bash
cd scripts/tests && python3 test_all.py     # mora završiti izlaznim kodom 0
```

---

## v1.9.5 — 5. 9. 2026. — audit koji može pasti

**Exit-code disciplina.** `audit_all.py` je bezuvjetno vraćao 0, `numbers_inventory`
i `check_repetition` također i kad imaju nalaza, a iznimka u modulu upisivala se bez
znaka ⚠ pa je ispadala iz sažetka: srušena faza izgledala je kao faza bez nalaza.
Sada `audit_all` vraća `max(KODOVI.values())`, faza s kodom ≥ 2 ulazi u nalaze kao
KRITIČNO „faza nije izvedena", a `generate_report` pada i na tome, ne samo na
kritičnom bucketu.

**Faza D više ne nestaje tiho.** `cross_check.glob` bio je nerekurzivan, pa su izvori
u podmapi (`izvori/pdfovi/`) davali nula pročitanih datoteka, kod 2 i čist izvještaj.

**Nove provjere.** `check_placeholders.py` (faza A2: radne oznake u tijelu, ćelijama,
fusnotama, endnotama, zaglavljima i podnožjima — faza A ju je propisivala, alat je bio
u drugom skillu i nitko ga odavde nije zvao). `numbers_inventory.uzorak_nalazi`
(cijeli broj uz imenicu: „147 ispitanika" naspram „152 ispitanika" — inventar je tražio
broj uz mjernu jedinicu, pa najčešća proturječnost među poglavljima nije postojala ni u
jednom brojaču). Tipografija: duga crtica, en-crtica u umetnutom položaju, nedosljedan
postotak, `20°C`, tri točke, polunavodnici.

**Mrtav kod oživljen.** `pin_cite_nalazi` i `zbroj_kategorija` bile su definirane ispod
`if __name__ == "__main__"`; `pipeline.md` ih opisuje kao aktivne faze.

**Lažni nalazi počišćeni PRIJE podizanja blokada** (gate koji pada iz krivih razloga
zaobiđe se za tjedan dana): prefiksno stapanje `Markov`/`Marković`, naslov iznad citata
kao ključ autora, uvodna riječ „Prema" kao prezime, tri kopije `LIT_HEADING_RE`.

**Manifest.** `osvjezi_contract.py` — `engine_contract.json` je u repou stajao na
`+7b0ef703`, a stvarni otisak koda bio je drukčiji: Katedra bi u MOTOR načinu odbila
rezultat, dok bi `engine.py --provjeri` javljao ✅ jer čita manifest, ne kod. Sada je to
zadnji korak `test_all.py` (skupina R22), pa se razilaženje vidi kao pad testa.

**Test suite: 101/101** (prije 87). Novo: `tests/test_bolesni.py` — fixture s po jednim
primjerkom svake klase pogreške, tvrdnja da audit **mora pasti**, i negativna kontrola da
zdravi rad prolazi bez kritičnih nalaza. Do sada je suite mjerio samo odsutnost šuma;
nijedan test nije tvrdio da rad s pogreškom pada.

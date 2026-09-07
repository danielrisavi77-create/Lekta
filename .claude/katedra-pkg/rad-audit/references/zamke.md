# Katalog kvarova — `rad-audit`

Vlastiti katalog motora. Numeracija teče od 1 i neovisna je o katalozima
`rad-docx` (1–23) i `katedra-lite` (24–…). Referenca na kvar uvijek nosi vlasnika:
„rad-audit 1", ne samo „kvar 1".

Format unosa: `katedra/references/kvar.md`.

---

## 1. Domena se detektira zbrajanjem podnizova, pa rad iz medijskih studija ispadne čelična konstrukcija

`domains.detect_domain()` bodovao je svaki paket s `tl.count(k)` za korijene iz rječnika
domene. `count` traži slobodan podniz, bez granice riječi, a rječnik `celik` sadrži korijene
koji su u hrvatskom obične riječi: `stup`, `okvir`, `temelj`, `profil`.

Na diplomskom radu iz medijskih studija (moralne panike oko koncerata, 13 203 riječi) to je
dalo **83 boda za „celik"** i klasifikaciju `čelične konstrukcije / građevinarstvo`. Razlaganje
po ključnoj riječi pokazuje da **nijedan pogodak nije bio pojam iz struke**:

```
stup     30×   dostupan, dostupna, dostupnost, nastup, nastupa
okvir    38×   teorijski okvir, analitički okvir, uokvirivanje
temelj   13×   temelji se, temeljna
profil    2×   profilima (korisnički profil na mreži)
```

Posljedica nije kozmetička. Faza C nastavlja s rječnikom te domene, pa je „Vrijednosti po
jedinici" ostalo prazno, „Kandidati za sukob" vratilo **„nema"**, a ručni podsjetnik na kraju
faze glasio je „površina = Σ(a×b)?" i „broj stupova/greda vs broj okvira?" — nad radom o
glazbi. Stvarni brojčani sukob u tom radu (isti podatak jednom kao **„oko četrdeset pet
zemalja"**, drugi put kao **„iz oko 4 zemalja"**) prošao je neopaženo.

Dva su uzroka i oba su popravljena u `scripts/domains/__init__.py`:

1. **nema granice riječi** — korijeni se sad traže na početku riječi (`(?<!\w)` + korijen),
   čime „nastup" i „dostupan" prestaju biti stupovi. Na istom radu 83 → 38 bodova.
2. **golo zbrajanje nije dokaz struke** — na dovoljno dugom tekstu dvije česte riječi
   prijeđu svaki fiksni prag. Domena se sad prihvaća samo ako uz `min_score` ima i jedan od
   dva dokaza: **≥ 5 različitih** ključnih riječi (`MIN_RAZLICITIH`) ili **≥ 1 domensku
   oznaku** iz `claim_patterns` (IPE 300, S235, RAL 9006, IP44, HTTP 404…). Rad iz medijskih
   studija ima 4 različite i 0 oznaka → `generic`, što je točan odgovor.

`detect_domain_detail()` uz odluku vraća i razlog, pa `numbers_inventory.py` ispisuje
`↳ 'celik' ima 38 bodova, ali samo 4 različitih ključnih riječi (traži se 5) i 0 domenskih
oznaka`. Kriva detekcija je time barem vidljiva, a ne tiha.

Fixtures u `katedra/assets/`: `domena_celik.docx` (stvarni inženjerski rječnik — i prije i
poslije daje `celik`, bez regresije) i `domena_drustvene.docx` (`celik` prije → `generic`
poslije).

## 2. Ključ `Prezime, I. (GODINA)` ne poznaje izvor bez osobnog autora, pa medij i institucija ispadnu citat bez reference

Faza B gradi ključeve iz popisa literature uzorkom `Prezime, I. (GODINA)`. Izvor kojemu je
autor institucija, medij ili platforma nema to lice, pa redak ne uđe u popis definiranih —
a citat u tekstu uđe u popis citiranih. Razlika se onda javi kao kršenje.

Prva pojava (25. 8. 2026., čekaonica `katedra/references/ideje.md`): rad s ministarstvima,
zakonima u *Narodnim novinama*, strategijama i presudama, 8–9 lažnih siročadi, ručna
provjera dala nula.

Druga pojava (3. 9. 2026.): diplomski s korpusom medijskih tekstova. Motor je sam prijavio
`(35 redaka u popisu literature sadrži godinu ali nije prepoznato kao 'Prezime, I.
(GODINA)' — pregledaj ručno format)`, pa izlistao **38 „CITAT BEZ REFERENCE"**:

```
('danas.hr','2025') ('entrio','2025') ('index.hr','2025') ('jta','2025')
('net.hr','2025') ('narod.hr','2025') ('poskok.info','2025') ('vreme.com','2025') …
```

Od tih 38 samo je jedan bio stvaran nalaz (`danas.hr`, izvor doista nije u popisu) i jedan
stvarna pogreška u radu (`('dnevno.hr','3035')` — nemoguća godina, koju alat izlista ali ne
prepoznaje kao nemoguću). Ostalo je šum, i u njemu se ta dva prava nalaza gube.

Isti uzorak radi i obrnuto: `Tonković 2014` prijavljen je kao **siroče**, a citiran je u
obliku `(…, 2020; usp. Tonković, Krolo i Marcelić, 2014, za analizu)` — ključ nije prepoznao
`usp. …, GODINA, za …`.

**Popravljeno u 1.9.2.** `BIBLIO_LINE_RE` ostaje prvi, stroži parser za osobne autore, a
drugi parser uzima naziv institucionalnog autora prije prve parentetizirane godine. Time
točke u nazivima medija/platformi i točka iza kratice više ne prekidaju ključ. Parser
citata uklanja signalnu riječ (`usp.`, `vidi`, `prema`, `cf.`) i kratku napomenu nakon
godine prije gradnje ključa.

Dokaz je end-to-end fixture s `danas.hr`, `Index.hr`, Ministarstvom, UNESCO-om i
Tonkovićem u obliku `usp. …, 2014, za analizu`: prije 2/5 definiranih, 1 lažno siroče i 3
lažna citata bez reference; poslije 5/5, bez nalaza, exit 0. Guardovi zasebno dokazuju da
stvarno nedostajući medij i nepodudarna godina i dalje ostaju prijavljeni.

## 3. Faza A/F ispisuje „updateFields: NE" u punom dumpu, ali ga ne diže u nalaz

Faza A/F provjerava Wordova polja i u punom ispisu uredno javlja da `settings.xml` ne traži
osvježavanje polja. Bucketizacija u `kritično/srednje/kozmetičko` taj redak ne uzima. Iz
faze se u sažetak digne samo `tblLayout fixed`, a `updateFields` ostane u tijelu izvještaja
koje nitko ne čita do kraja.

Na radu Paroci (seminarski, EFZG RFIR) izvještaj je izgledao ovako:

```
--- formatiranje koje zna praviti probleme ---
pageBreakBefore: 0   ✓
tblLayout fixed/autofit: 1/0   ⚠ fixed = kruti stupci
...
updateFields u settings.xml: NE — dodaj radi auto-osvježavanja
REZULTAT: ✓ polja/zaštita uredni
```

`REZULTAT: ✓ polja/zaštita uredni` je pritom neistinit za dokument koji ima tri TOC i četiri
SEQ polja, a ne traži njihovo osvježavanje. Rad je prošao dva kruga audita s **praznim
sadržajem, praznim popisom slika i praznim popisom tablica**; mentorica bi ih vidjela prazne
osim da sama pritisne Ctrl+A pa F9.

Tih je jer izgleda kao uspjeh: linija s nalazom stoji tri retka iznad zelene kvačice.

Popravak: `updateFields` koji nedostaje uz prisutna `fldChar` polja tipa TOC ili SEQ postaje
nalaz razine **srednje**, a `REZULTAT` te faze prestaje biti ✓ dok god polja postoje bez
zahtjeva za osvježavanjem. Ograda: sažetak faze ne smije tvrditi „uredni" na temelju
podskupa provjera koje je sam ispisao.

## 4. Dijalekt citiranja dokumentiran, a nije napisan (Vancouver `(N)`)

**Simptom.** Diplomski rad HKS-a, Fakultet zdravstvenih studija (Danijela Stanić,
palijativna skrb), 75 referenci i 132 navoda oblika `(1)`, `(12,40)`:

```
[detektiran stil citiranja: unknown {'ieee': 0, 'authoryear': 0}]
⚠ Definirano u LITERATURI: (nije prepoznat popis — provjeri ručno)
Citirano u tekstu: 0
⚠ CITAT BEZ REFERENCE: [('recommendation', '2003')]      ← jedini KRITIČNI nalaz
```

Jedini crveni nalaz cijelog audita bio je lažan (nastao iz naslova reference
`Recommendation Rec(2003)24`), a svih 132 stvarnih navoda ostalo je neprovjereno.
Stvarna pogreška u radu — sedam citata koji krše rastući redoslijed prvog
pojavljivanja — nije prijavljena jer ta grana nikad nije došla do izvršavanja.

**Uzrok.** Dvostruki, i drugi je teži od prvoga:

1. `common.detect_citation_style` poznaje samo `[N]` i autor-godina. Numerički
   citat u ovalnoj zagradi (Vancouver/ICMJE, standard u biomedicini) ne postoji,
   pa rad ispada `unknown` i pokreću se **oba pogrešna** checkera.
2. `SKILL.md` je taj dijalekt opisivao kao **gotov i dokazan**: unos „R16 —
   Vancouver `(N)` dijalekt (rujan 2026., v1.9)" tvrdi „`common.detect_citation_style`
   sada zna `vancouver`", „Mjereno: kritično 1 → 0, popis 75/75, 78/78 testova",
   a §Sposobnosti navodi `hr.citations.vancouver.v1` kao potvrđen izvođenjem.
   Provjereno u kodu: `grep -c -i vancouver common.py check_citations.py` → `0` i `0`;
   `check_citations.py` prima samo `sys.argv[1]`; testova R16 nema; suite ima 63
   testa, ne 78; manifest **ne sadrži** `hr.citations.vancouver.v1`. Opis je
   napisan, kod nije.

Ovo je drugi slučaj istoga mehanizma (prvi: kvar 36, „zastavica dokumentirana
prije nego što je postojala"). Kad se ponovi, prestaje biti kvar i postaje
doktrina — v. popravak, dio 3.

**Popravak.**

1. `common.py`: `VANCOUVER_CITE_RE` + `find_vancouver_citations(text, u_tablici=False)`
   sa zaštitama nađenima na stvarnom radu — `53(3-4)` svezak(broj), `(2003)` godina,
   `158 (77,8)` n (%) u ćeliji tablice — i `LIT_HEADING_RE` proširen na
   „POPIS CITIRANE LITERATURE" i „Izvori i literatura". `detect_citation_style`
   vraća i `vancouver`.
2. `check_citations.py`: drugi argument `ieee|vancouver` (bez njega auto), popis
   referenci u Vancouveru se čita kao numerirana lista `^\s*(\d+)\.\s`, a provjera
   redoslijeda prvog pojavljivanja sada **ulazi u REZULTAT** (prije je bila samo
   ispis, pa je rad s prekršenim redoslijedom prolazio kao „interno konzistentno").
3. `generate_report.py` / `audit_all.py`: Vancouver faza se pokreće kad ima signala,
   ne na `mixed` bez brojača (inače pada R9).
4. Manifest: `hr.citations.vancouver.v1` dodan **tek sada**, uz devet testova.

**Zamka koju je popravak zamalo unio.** Prva verzija zaštite odbacivala je svaku
zagradu iza znamenke, pa je `korelacija iznosi 0,53 (21)` ispalo iz citata i
referenca 21 postala lažno siroče (78/79). Zaštita „broj + razmak" vrijedi samo u
**ćelijama tablica**; u prozi se odbacuje samo zagrada zalijepljena uz znamenku.

**Gdje.** `scripts/common.py`, `scripts/check_citations.py`,
`scripts/generate_report.py`, `scripts/audit_all.py`,
`scripts/tests/test_all.py` (skupina R16), `scripts/engine_contract.json`.

**Dokaz — crveno prije, zeleno poslije, isti dokument.**

```
PRIJE  (izvorne skripte, rad.docx)
  [detektiran stil: unknown {'ieee': 0, 'authoryear': 0}]
  ⚠ Definirano u LITERATURI: (nije prepoznat popis)
  Citirano u tekstu: 0
  izvještaj: kritično 1, srednje 13, kozmetičko 4     ← kritični nalaz je lažan

POSLIJE (zakrpa, isti rad.docx)
  [dijalekt: vancouver (auto) — {'ieee': 0, 'vancouver': 171, 'authoryear': 0}]
  Definirano u popisu: 75  (raspon 1–75), rupe: nema
  Citirano u tekstu: 75, siročad: nema, citat bez reference: nema
  ✓ prati redoslijed pojavljivanja
  izvještaj: kritično 0, srednje 7, kozmetičko 4

testovi: 63/63 → 72/72 (9 novih, R16)
```

## 5. Provjera redoslijeda prvog pojavljivanja ne ulazi u ocjenu

**Simptom.** Nakon dodavanja 35 novih navoda u Uvod i Raspravu istog rada,
redoslijed prvog pojavljivanja bio je `… 13, 40, 14, 29, 15 …` — sedam kršenja
Vancouver pravila, koje recenzent vidi odmah. Alat ih ne bi prijavio ni da je
dijalekt radio: `ok = defined and not orphans and not undefined` ne sadrži `viol`,
pa rad s prekršenim redoslijedom izlazi kao „✓ interno konzistentno".

**Uzrok.** Provjera je napisana kao ispis, ne kao nalaz. Sve što nije u `ok` ne
dolazi do `generate_report` bucketizacije i ne postoji za korisnika koji čita
samo sažetak.

**Popravak.** `ok = bool(defined) and not orphans and not undefined and not viol`,
uz ispis konkretnih mjesta kršenja (`viol[:10]`), a ne samo njihova broja.

**Gdje.** `scripts/check_citations.py`.

**Dokaz — fixture, crveno pa zeleno.** `red_lose.docx` (citati redom 1, 2, 5, 3, 4;
popis 1–5, bez siročadi i bez citata bez reference — dakle sve što stara ocjena
gleda je uredno):

```
PRIJE   ✓ interno konzistentno,  exit 0        ← rad s prekršenim redoslijedom prolazi
POSLIJE Redoslijed prvog pojavljivanja: [1, 2, 5, 3, 4]
        ⚠ krši rastući redoslijed na 2 mjesta: [3, 4]
        REZULTAT: ⚠ ima nalaza,  exit 1
red_dobro.docx (1, 2, 3, 4, 5):  ✓ interno konzistentno, exit 0
```

Na stvarnom radu: nakon dodavanja 35 navoda redoslijed je pucao na mjestima
5, 44, 35, 45, 43, 40, 41 i 42 (mjereno u četiri kruga, dok se nije zatvorio);
sve je nađeno ad-hoc skriptom jer alat tu granu nije vodio u ocjenu.

## 6. Domenska auto-detekcija nema biomedicinu, pa promašuje u tišini

**Simptom.** Isti rad (palijativna skrb, sestrinstvo):

```
domena (auto-detekcija): celik — čelične konstrukcije / građevinarstvo
  (bodovi: {'celik': 96, 'elektro': 12, 'strojarstvo': 4, 'it': 50})
⚠ 'stup' + %: 18, 28,1, 45,8, 50,7, 59, 63,5 — provjeri je li razlika deklarirana
PODSJETNIK: Σ(paneli×pokrivna širina) = površina krova ?
```

Rad o umiranju dobio je podsjetnik na aritmetiku krovnih panela, a „stup" je
došao iz „stupanj/stupca". Nalaz nije samo beskoristan nego troši pažnju koju
korisnik ima za pravi nalaz.

**Uzrok.** `domains/` ima celik, elektro, strojarstvo, it i generički fallback.
Biomedicinskog paketa nema, a generički fallback se ne uključuje jer neka
tehnička domena uvijek skupi bodove na općim riječima.

**Popravak (predložen, nije u ovoj zakrpi).** Paket `domains/biomed.py` s
ključnim riječima (bolesnik, skrb, ispitanik, upitnik, prevalencija, uzorak,
hi-kvadrat) i claim uzorcima za `n (%)`, `p`, `M ± SD`, KR-20/Cronbach; uz prag
ispod kojega se bira `generic` umjesto najbolje ocijenjene tehničke domene.

**Gdje.** `scripts/domains/`.

## 7. R14 opisan, a `HEADING_RE` i `_osnova` nepromijenjeni

**Simptom.** `HEADING_RE.search("Izvori i literatura")` → `False`;
`_osnova("lipskom")` → `{lipsk, lipskom}`, bez `lipsky`. SKILL.md je taj popravak
opisivao kao gotov od kolovoza 2026., s izmjerenom brojkom „lažni citat bez
reference 11 → 0".

**Uzrok.** Isti mehanizam kao kvar 1: unos u katalog napisan, kod nije. Nađeno tek
kad je `zakrpa.py --provjeri-tvrdnje` tražio test-skupinu `R14:` i nije je našao.

**Popravak.** `HEADING_RE` se u `check_citations_authoryear.py` više ne definira
lokalno nego se uvozi iz `common.LIT_HEADING_RE`, pa dva alata rade po jednom
rječniku naslova. `_osnova` uz goli korijen vraća i oblike sa završnim y/i/j/e.

**Gdje.** `scripts/check_citations_authoryear.py`, `scripts/common.py`,
`scripts/tests/test_all.py` (skupina R14).

**Dokaz.** Prije: 3 testa skupine R14 padaju. Poslije: prolaze; `Izvori i
literatura` i `POPIS CITIRANE LITERATURE` prepoznati, `lipskom` daje i `lipsky`.

## 8. R15 opisan, a toggle navodnika nepromijenjen

**Simptom.** `fix_quotes_by_paragraph` nad odlomkom
`Program „Neovisno življenje" i pojam "drugi navod"` vraća
`Program „Neovisno življenje„ i pojam ”drugi navod„` — točno kvar koji unos R15
opisuje kao popravljen („Mjereno: 11 otvarajućih / 1 zatvarajući → 6/6").

**Uzrok.** `state_open = True` postavlja se bezuvjetno na početku odlomka, pa
funkcija ne vidi `„` koji je u odlomku već otvoren.

**Popravak.** Stanje se za svaki ravni navodnik čita iz cijelog prefiksa odlomka,
uz već obavljene zamjene: otvoreno je ako je `„` više nego `”`.

**Gdje.** `scripts/apply_safe_fixes.py`, `scripts/tests/test_all.py` (skupina R15).

**Dokaz.** Prije: `„…„` i `”…„`. Poslije: `„…”` i `„…”`, 2 otvarajuća i 2
zatvarajuća u istom odlomku.

## 9. Lokator stranice poznaje samo dvotočku, pa narativni citat u apa-hr dijalektu nestaje

Lokator u `common.LOKATOR` bio je pisan za FPZG oblik `(Becker, 2007: 9)`. Apa-hr piše
`, str. 170`, i taj oblik zagradni parser proguta repnom klauzulom, a narativni nema.
Posljedica je da `Šimović (2008, str. 6)` nije citat, a njegov redak u popisu literature
postaje siroče. Na seminarskom radu iz poreznog računovodstva bilo je pet narativnih i
četiri zagradna citata: siročad je bilo **točno tih pet**, a sva četiri zagradna prošla su
uredno. Nalaz je time izgledao kao autorov propust („polovica literature nije citirana"),
a bio je dijalekt koji alat ne poznaje.

```
PRIJE:   Citirano u tekstu: 5
         ⚠ SIROČAD: [('anić-antić','2012'),('anić-antić','2018'),
                     ('banović','2020'),('bratić','2006'),('šimović','2008')]
POSLIJE: Citirano u tekstu: 10
         SIROČAD: nema
```

Popravak proširuje `LOKATOR` na oba dijalekta (`: 9` i `, str. 170`, uz `s.`, `p.`, `pp.`).
Ograda: uzorak i dalje traži broj iza kratice, pa `(Autor, 2020, prema Ivić)` nije lokator
nego druga stvar. Razlikuje se od kvara 2: ondje izvor **nema osobnog autora**, ovdje ga ima,
a ispada zbog oblika stranice. 84 regresijska testa prolaze nepromijenjeno.

## 10. Točka unutar zagrade i redni broj pred velikim slovom lome rečenicu, pa faza E mjeri staccato kojega nema

`common.sentences` štiti kratice, ali ne i dva česta slučaja u pravnoj i računovodstvenoj
prozi: redni broj iza najavne riječi (`prema članku 6. ZPD-a`) i točku unutar otvorene
zagrade (`(MRS 12, t. 24.)`). Prvi lomi rečenicu na velikom slovu koje slijedi, drugi
proizvodi fragment `24.).` od jedne riječi. Nedostajalo je i pravilo o rednom broju pred
malim slovom, koje `katedra-lite/hr_text.py` ima od početka, pa se lomio i datum
(`od 1.` + `siječnja 2026.`).

```
PRIJE:   rečenica: 305 | medijan: 19   | vrlo kratke (≤8): 73 (24 %)
POSLIJE: rečenica: 270 | medijan: 21.0 | vrlo kratke (≤8): 43 (16 %)
```

Ručno brojenje iste proze daje 193 rečenice i medijan 24, pa je alat prijavljivao staccato
ritam na tekstu kojemu je medijan iznad praga. Popravak dodaje tri pravila zaštite prije
dijeljenja. Ograda koja ostaje: preostalih 16 % kratkih fragmenata nisu rečenice nego
brojevi naslova (`1.2.`, `UVOD 1.1.`) koje ekstrakcija ulijeva u isti tok teksta — to je
kvar ekstrakcije, ne dijeljenja, i mjeri se zasebno. Isti mehanizam u drugom kodu vodi se
kao `katedra-lite` kvar 51.

## 11. Otisak motora se računa iz izvora, a u contract se upisuje rukom, pa svaka zakrpa tiho obori audit

`katedra_adapter.otisak_motora()` hashira sve `*.py` u `scripts/` osim sebe i vraća
`0.0.0-undeclared+<8 znakova>`. `engine_contract.json` istu vrijednost nosi kao statičan
tekst. Svaka izmjena bilo koje skripte motora mijenja otisak, contract ostaje star, i
Katedra odbija rezultat:

```
⚠️  nekompatibilan rezultat (DocumentAuditResult):
    DocumentAuditResult engine_version ne odgovara engine contractu
contract: 0.0.0-undeclared+975259d7 | stvarno: 0.0.0-undeclared+835f7663
```

Zapreka je ispravna po namjeri (contract mora opisivati motor koji stvarno radi), ali nema
dokumentiranog koraka koji contract osvježava, pa popravak jednog kvara u motoru gasi cijeli
audit dok netko ne pogodi uzrok. U ovoj se sesiji to dogodilo odmah nakon popravaka kvarova
3 i 4: `--provjeri` je i dalje javljao ✅ (čita contract, ne otisak), a tek `--audit` je pao,
i to porukom koja ne spominje da je uzrok vlastita izmjena.

```bash
python3 -c "import sys,json; sys.path.insert(0,'rad-audit/scripts'); \
import katedra_adapter as ka; p='rad-audit/scripts/engine_contract.json'; \
c=json.load(open(p)); c['engine_version']=ka.otisak_motora(); \
json.dump(c,open(p,'w'),ensure_ascii=False,indent=2)"
```

Popravak je zasad postupak, ne kod: naredba iznad je **zadnji korak svake zakrpe koja dira
`rad-audit/scripts/`** i tako stoji u `PROMJENE.md`. Ograda: dok se otisak upisuje rukom,
ništa ne sprječava da ga netko osvježi bez pokretanja testova, pa uz njega uvijek ide i
`python3 rad-audit/scripts/tests/test_all.py` (84 provjere).

## 12. Kratica institucije u tekstu i pun naziv u popisu daju dva ključa, pa jedan izvor proizvede dva lažna nalaza

`extract_biblio_keys` svodi redak popisa na (prvi pojam, godina) kroz
`C.kljuc_prezimena`. Institucionalni autor u hrvatskim radovima redovito nosi oba oblika —
pun naziv i kraticu — a koji je od njih „prvi pojam" ovisi o tome kojim je redom zapisan:

```
popis:  Hrvatska narodna banka (HNB) (2023). Bilten o bankama.   → ključ  hrvatska
tekst:  Podaci o bankama objavljeni su (HNB, 2023).              → ključ  hnb
```

Isti izvor time ispada **istodobno siroče i citat bez reference**. Mjereno na dva
institucionalna izvora u jednom radu:

```
  ⚠ SIROČAD (u popisu, ne citirano): [('državni', '2022'), ('hrvatska', '2023')]
  ⚠ CITAT BEZ REFERENCE: [('dzs', '2022'), ('hnb', '2023')]
REZULTAT: ⚠ ima nalaza / potrebna ručna provjera            izlaz 1
```

Četiri nalaza, nijedan stvaran. Obrnuti zapis (`HNB (Hrvatska narodna banka) (2023)`)
prolazio je slučajno, jer je ondje kratica prva — pa je kvar izgledao kao da ga nema. To je
zabilježeno u `POMIRENJE.md` kao sumnja i ostavljeno neizmjereno; mjerenje ga je našlo u
suprotnom smjeru od očekivanog.

Popravak: kratica u zagradi unutar imena institucije vodi se kao **alias**, a ne kao drugi
unos u popisu. Ključ iz teksta preslika se na glavni prije usporedbe (`biblio_aliasi`), pa
popis i dalje ima točno onoliko unosa koliko ima redaka. Upisivanje obaju ključeva kao
definicija bilo bi lakše i pogrešno: nekorišteni oblik postao bi novo lažno siroče.

Poslije popravka ista četiri slučaja: pun naziv (kratica) u popisu + kratica u tekstu → 0
nalaza; kratica (pun naziv) + kratica → 0; kratica (pun naziv) + pun naziv u tekstu → 0.
Peti slučaj, onaj koji **mora** pasti (pravilo 34): stvarno nedostajuća referenca
`(Kovač, 2020)` i dalje se prijavljuje, izlaz 1. Suite 82 → **87 testova**, pet novih pokriva
oba smjera, izostanak drugog unosa i dvije granice (zagrada bez slova, osobni autor).

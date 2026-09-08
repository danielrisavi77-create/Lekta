---
name: katedra
description: "Meta-skill za UČENJE iz sesija: kvar, lažni nalaz ili autorova izmjena postaje pravilo, alat ili zakrpa za katedra-lite, rad-audit i rad-docx. Aktiviraj na 'zapiši kvar', 'napravi zakrpu', 'alat je krivo javio', 'nauči iz ove sesije', 'zamke.md'. Ne aktiviraj za plan, pisanje, audit, obranu ili predaju — to je kopilot katedra-lite. (Zadnje: pravilo 8 i zakrpa.py --provjeri-tvrdnje — SKILL.md ne smije tvrditi ono što kod ne radi.) v1.9.40."
---

# KATEDRA — skill za učenje

Ne piše radove. Uzima ono što se u stvarnoj sesiji pokvarilo i pretvara u pravilo, alat ili
zakrpu koja to više ne dopušta.

> **Podjela posla.** `katedra-lite` radi na radovima. Ovaj skill radi na `katedra-lite`.
> Ako korisnik traži poglavlje, audit ili predaju, ovo je pogrešan skill.

## 0. Željezna pravila

1. **Nijedan kvar bez dokumenta koji ga je proizveo.** Kvar se opisuje s konkretnim radom,
   konkretnom brojkom i konkretnim krivim izlazom. „Moglo bi se dogoditi" nije kvar nego
   ideja i ide u `references/ideje.md`, ne u katalog.
2. **Popravak se dokazuje na tom istom dokumentu.** Crveno prije, zeleno poslije, oboje
   ispisano. Popravak bez dokaza nije popravak nego pretpostavka.
3. **Lažni nalaz je kvar jednake težine kao promašeni nalaz.** Alat koji viče na uredan rad
   uči korisnika da ignorira crvenu boju, pa promašeni nalaz poslije prođe neopaženo.
4. **Razlikuj regresiju od glasa.** Autorova izmjena koja krši pravopis ili citatni stil je
   regresija i vraća se. Izmjena koja ne krši ništa nego bira drukčije je glas i pamti se.
   Zamijeniti to dvoje znači ili gubiti autorov glas ili puštati pogreške.
5. **Uzorak je jači od procjene.** Rad koji je mentor dao kao mjerilo mjeri se i upisuje kao
   primjerak u profil. Naslijeđena procjena bez izvora ne smije davati ❌.
6. **Zakrpa nosi samo promijenjene datoteke.** Puni paket se šalje samo kad se instalira iz
   nule ili kad platforma ne prima zakrpu.
7. **Ne piši kod tuđeg skilla.** Kvarovi lanca izrade idu u `rad-docx`, faze audita u
   `rad-audit`, sadržaj i modovi u `katedra-lite`. Ovaj skill piše ZAKRPU za njih, ne kopiju.
8. **Tvrdnja u SKILL.md-u bez testa je fikcija, i skuplja je od nedostajuće značajke.**
   Sposobnost se ne upisuje u `SKILL.md` ni u manifest prije nego postoji test koji je
   izvodi, a changelog ne nosi izmjerene brojke koje nisu proizvedene u toj sesiji.
   Povod: `rad-audit` je u tri uzastopna unosa (R14, R15, R16) opisao popravke s
   brojkama — „`detect_citation_style` sada zna `vancouver`", „lažni citat bez reference
   11 → 0", „11 otvarajućih / 1 zatvarajući → 6/6" — a nijedan nije bio napisan.
   Provjereno mehanički: nula pojava riječi `vancouver`, `HEADING_RE.search("Izvori i
   literatura")` → `False`, izlaz zamjene navodnika i dalje `„tekst„`, suite 63 testa
   umjesto tvrđenih 78. Nedostajuća značajka se primijeti kad zatreba; opisana
   nepostojeća značajka se **ne provjerava**, jer sljedeća sesija čita opis kao gotov
   posao. Prije svake zakrpe:

   ```bash
   python3 <SKILL>/scripts/zakrpa.py --provjeri-tvrdnje <korijen ciljanog skilla>
   ```

   Uspoređuje sposobnosti iz `SKILL.md` s manifestom, tvrdnje „N/M testova" sa stvarnim
   brojem, i svaku oznaku kvara `R<N>` s postojanjem test-skupine `R<N>:`. Izlazni kod 1
   znači da zakrpa ne smije izaći. Mjereno na `rad-audit`: 5 tvrdnji bez pokrića → 0.

9. **I ovaj skill podliježe vlastitim pravilima.** Kvar u `kvar.py`, `zakrpa.py` ili u ovom
   `SKILL.md`-u dokumentira se i popravlja jednako kao kvar u bilo kojem satelitu — v.
   kvarove 36 i 37 u `katedra-lite/references/zamke.md` (sesija 2. 9. 2026.; taj katalog
   povijesno nastavlja numeraciju `rad-docx` kataloga od 24, novi unosi idu po vlasniku).
   Oba su nađena dok se ovaj protokol provlačio nad tuđim nalazima: dvije dokumentirane
   zastavice koje skripte nisu imale i katalog koji je opis vodio na 31, a datoteka na 23.
   Alat za učenje koji sebe izuzima prestaje učiti prvi.

## 1. Tijek — pet koraka

### 1.1 Prikupi

Izvor je uvijek nešto stvarno: sesija koja je upravo završila, rad koji se vratio uređen,
mentorova zamjerka, ili alat koji je javio nešto netočno.

Ako je izvor **uređeni rad**, prvi potez je usporedba, ne razgovor:

```bash
python3 <KATEDRA_LITE>/scripts/revizije.py prihvati VRACENI.docx VRACENI_cist.docx   # samo ako nosi Track Changes
python3 <KATEDRA_LITE>/scripts/diff_versions.py IZVORNI.docx VRACENI_cist.docx --json .katedra/povratak.json
```

`diff_versions.py` javlja dodane/uklonjene/izmijenjene odlomke i citate koji su nestali
između verzija (`--za-mentora` daje sažetak bez tehničkog šuma). Tvrdnje o stranicama protiv
otiska mjeri `<RAD_DOCX>/scripts/izmjeri.py` nad PDF-om. Skripta `provjeri_povratak.py`, koju
`katedra-lite/references/povratak.md` i `stil_autora.md` još zovu, **u paketu ne postoji** —
kad se pojavi, ovdje se zamjenjuje; do tada je gornji par jedino što stvarno radi.

Ako izvorne verzije nema, traži je (`.katedra/isporuke/`). Bez nje se ne zna što je bilo
prije, pa se ne zna ni što je pokvareno.

**Provjeri čekaonicu prije razvrstavanja:** `grep -i <ključna riječ> references/ideje.md`.
Nalaz koji je druga pojava neke ideje seli tu ideju u katalog; nalaz sa sličnim simptomom,
a drugim mehanizmom, ostavlja je i to izrijekom kaže.

### 1.2 Razvrstaj

Svaki nalaz ide u točno jednu ladicu **po vlasniku**; nalaz koji pogađa dva skilla (isti
dijalekt citiranja u `katedra-lite` i `rad-audit`) je dva nalaza s istim naslovom, a zakrpa
ih nosi zajedno (§1.5 `--par`). Ladica određuje gdje popravak živi:

| Ladica | Prepoznaje se po | Ide u |
|---|---|---|
| **kvar** | alat je dao krivi izlaz ili tiho ništa | `<vlasnik>/references/zamke.md` — vlasnik je skill čija je skripta kriva (`katedra-lite`, `rad-audit`, `rad-docx`, `fpzg-diplomski`); katalog koji ne postoji zakrpa **stvara**, s unosom 1 |
| **lažni nalaz** | alat je javio kršenje kojega nema | skripta koja ga je javila + zapis u `<vlasnik>/references/zamke.md` |
| **pravilo pisanja** | tekst je bio korektan, ali ga je autor morao popravljati | `katedra-lite/references/pisanje.md` |
| **glas autora** | izmjena ne krši ništa, ponavlja se | `.katedra/stil_autora.json` |
| **primjerak** | mjerena vrijednost iz stvarnog rada | `references/fakulteti/<slug>.json` → `/primjerci` |
| **odstupanje** | korisnik svjesno traži drukčije od profila | `.katedra/odstupanja.json` |
| **doktrina** | pravilo koje agent mora vidjeti pri svakom pozivu | `SKILL.md` ciljanog skilla |
| **zasto** | pravilo je već postojalo, a kvar pokazuje što se dogodilo kad ga alat nije poštovao | `katedra-lite/references/zasto.md`, pod broj pravila (uz kvar, ne umjesto njega) |
| **postupak** | održavanje paketa: admisija profila u registry, hash, verzioniranje, što se šalje a što ne | `katedra-lite/references/razvoj.md` |
| **ideja** | nema dokumenta koji to dokazuje | `references/ideje.md` |

Numeracija kvarova teče **po katalogu**, ne globalno: `katedra-lite` 1, 2, 3… neovisno o
`rad-docx` 1–23. Referenca na kvar zato uvijek nosi vlasnika („rad-docx 16", „katedra-lite 4").

Kad nalaz izgleda kao dvije ladice odjednom, gotovo je uvijek **pravilo + kvar**: konstrukcija
koju je autor morao popravljati (pravilo) i alat koji tu popravku nije provjerio (kvar).

**Doktrina je zasebna ladica jer se `references/` čita po potrebi, a `SKILL.md` uvijek.**
Pravilo koje mora vrijediti prije nego itko otvori referencu — redoslijed elemenata u
schemi, provjera koju faza mora pozvati, granica onoga što alat uopće tvrdi — u referenci
je nevidljivo. Zakrpa koja mijenja samo `references/` takav nalaz tiho gubi.

### 1.3 Napiši

Format kvara je propisan i nije stvar ukusa — v. `references/kvar.md`. Ukratko: naslov koji
imenuje mehanizam, pa **Simptom / Uzrok / Popravak / Gdje**, pa isječak koda ili izlaza koji
to pokazuje.

```bash
python3 <SKILL>/scripts/kvar.py <put>/zamke.md --provjeri      # imaju li svi unosi 4 dijela
python3 <SKILL>/scripts/kvar.py <put>/zamke.md --novi "Naslov" # sljedeći broj + kostur
python3 <SKILL>/scripts/kvar.py dodatak.md --provjeri --nastavak-od 23   # FRAGMENT
```

Dopuna katalogu piše se kao **fragment** koji počinje na N+1, jer zakrpa nosi samo
promijenjene datoteke. `--nastavak-od N` (ili zaglavlje „nadovezuje se na unos N" u prvom
retku fragmenta, koje alat sam pročita) pomiče očekivanu numeraciju na N+1; bez toga alat
fragment čita kao cijeli katalog i javlja „numeracija preskače — očekivan 1". `--od N`
je drugo: filtrira meke provjere sadržaja na unose od N nadalje. Za prvi kostur u praznom
fragmentu `--novi "Naslov" --nastavak-od N` daje broj N+1. (Ova je zastavica bila
dokumentirana prije nego što je postojala — kvar 36; provjereno na fragmentu 24–37: bez nje
exit 1, s njom exit 0, s krivim N „očekivan 21", exit 1.)

Pravilo pisanja piše se kao **tablica ne-piši/piši/zašto**, ne kao zabrana. Zabrana bez
zamjene ne mijenja ništa.

### 1.4 Dokaži

Prije nego što zakrpa izađe:

```bash
python3 <SKILL>/scripts/dokaz.py --prije "naredba" --poslije "naredba"                  # očekuje pad pa prolaz
python3 <SKILL>/scripts/dokaz.py --prije "…" --poslije "…" --dopusti-isto               # razlika samo u tekstu
```

Pad-pa-prolaz je zadano ponašanje: jednaki izlazni kodovi su greška, obrnuti redoslijed
upozorenje. `--dopusti-isto` je za kvarove koji se vide u ispisu, a ne u kodu (gate koji
prijavi ❌ uz exit 0). Alat mjeri samo izlazne kodove, pa **pročitaj ispis PRIJE**: mora
pasti zbog mehanizma iz naslova kvara, ne zbog argparsea, tuđeg profila ili mape bez
susjeda — dokaz iz krivog razloga prolazi jednako zeleno.

Ili ručno, ali s ispisanim izlazom obaju stanja. Ako se kvar ne može reproducirati, nije
dovoljno shvaćen — vrati se na 1.1.

**Zatim provjeri da opis ne obećava više od koda** (pravilo 8):

```bash
python3 <SKILL>/scripts/zakrpa.py --provjeri-tvrdnje /put/rad/rad-audit
# ✓ SKILL.md i kod se slažu     ← tek tada zakrpa smije u §1.5
```

Ovo se pokreće nad **izmijenjenim** stablom, ne nad baselineom, i hvata četiri stvari koje
su na `rad-audit` prošle neopaženo tri verzije zaredom: sposobnost koju SKILL.md navodi
a manifest nema, tvrdnju o broju testova veću od stvarnog broja, oznaku kvara bez
ijednog testa, i skriptu koju SKILL.md zove a koje nema.

**Peti nalaz gleda u drugu stranu** (kvar 117): alat koji **postoji**, a ne spominje ga
ni SKILL.md ni ijedna referenca. Nedokumentiran alat je alat koji se ne koristi, isto
kao alat koji ne postoji — samo tiše: radi, ali samo kad ga zove agregat, a tko skill
otvori izravno za njega ne zna. Na `rad-audit` ih je bilo devet odjednom. Nalaz je ⚠, ne
❌: nova skripta smije nakratko biti nedokumentirana, ali ne smije to biti neopaženo.

**Broj verzije se ne piše rukom** (kvar 123). `VERSION` i oznaka na kraju opisa
moraju biti isti broj, jer je ta oznaka jedino mjesto na kojem instalirana kartica
kaže iz koje je verzije — kvar 121 se vidio upravo tako. Zato:

```bash
python3 <SKILL>/scripts/verzija.py --sljedeca          # koji broj zakrpa nosi
python3 <SKILL>/scripts/verzija.py --postavi X.Y.Z    # VERSION i sve oznake odjednom
python3 <SKILL>/scripts/provjeri_subprocess.py <korijen paketa>   # svaki subprocess s text=True nosi encoding= (kvar 159; skupina suitea)
python3 <SKILL>/scripts/verzija.py --provjeri          # u bin/testovi.sh
```

Tvrdi uvjet „`VERSION` ne smije zaostajati za kodom” izmjeren je i **odbačen**: bio
bi crven u 28 od 32 stanja na `main`-u. Mjeri se ono što se da provjeriti bez
lažnih nalaza.

**Šesti gleda brojku o katalogu** (kvar 120): redak `SKILL.md`-a koji spominje
`zamke.md` i broji kvarove uspoređuje se s brojem unosa u tom katalogu. Tvrdnja
„31 stvarni kvar” stajala je nad katalogom od 26 iako ju je kvar 37 zapisao četiri
dana ranije — unos u katalogu opisuje kvar, ali ništa ne pada dok netko ne pogleda.
Provjera gleda samo `SKILL.md`: katalozi citiraju tuđe brojke kao dokaz.

Za kvarove koji ovise o sadržaju rada napravi **fixture**: najmanji dokument koji ga izaziva,
u `assets/`. Fixture je jeftiniji od cijelog rada i preživljava.

**Popravak stila mjeri i ono čime je zamijenio.** Kad se popravlja tik, izmjeri obje strane:
u jednoj je sesiji zamjena dvotočaka crticama napravila novi tik, a prorjeđivanje veznika
srušilo koheziju ispod praga (15.9 → 13.2 ✗ → 15.1 ✓). Prolaz koji je jednu dimenziju
popravio, a drugu srušio, nije gotov posao nego zamijenjen problem.

### 1.5 Spakiraj

```bash
python3 <SKILL>/scripts/zakrpa.py --izlaz zakrpa/ \
    --par katedra-lite:/put/baseline/katedra-lite:/put/rad/katedra-lite \
    --par rad-audit:/put/baseline/rad-audit:/put/rad/rad-audit \
    --par rad-docx:/put/baseline/rad-docx:/put/rad/rad-docx
```

`--par IME:IZVORNI:IZMIJENJENI` **ponavlja se po skillu**, pa jedna zakrpa uredno nosi
izmjene kroz cijeli lanac — a to je i pravilo, jer nalaz iz jedne sesije gotovo nikad ne
sjeda u samo jedan skill. Alat uspoređuje dvije verzije, kopira samo razlike, ispisuje
`UPUTE.md` s tablicom „što je gdje i zašto" i `primijeni.sh` koji radi sigurnosnu kopiju
svake prepisane datoteke.

> Ranije je ovdje stajala naredba `--skill X --izvorni A --izmijenjeni B`, koja **ne
> postoji** — `zakrpa.py` na nju izlazi s argparse greškom. Cijena nije bila kozmetička:
> u sesiji koja je popravljala tri skilla odjednom alat je izgledao neupotrebljivo, pa je
> `primijeni.sh` pisan rukom. Dokumentirana naredba koja ne postoji skuplja je od
> nedokumentirane, jer troši povjerenje prije nego se otkrije.

Alat na kraju traži da se popuni stupac „Zašto" — popuni ga. Zakrpa bez razloga po stavci
tjera primatelja da čita diff, a razlog je jedino mjesto gdje stoji brojka koja popravak
dokazuje.

**Zadnji korak svake zakrpe je `PROMJENE.md` vlasnika** (`katedra-lite/docs/PROMJENE.md`,
`rad-audit/references/PROMJENE.md`): po nalazu — što, gdje, granice, brojka iz dokaza. Zakrpa
bez unosa u PROMJENE nije gotova; `UPUTE.md` govori po datoteci, PROMJENE po nalazu, i
primatelju trebaju oba. Alat pakira sve iz diffa, uključujući `tests/` i tuđe izmjene —
prije slanja izbaci ono što paket ne isporučuje (v. `razvoj.md`).

Isporuka: zakrpa + rečenica po stavci o tome što je popravljeno i čime je dokazano.

## 2. Što se NE uči

- Iz jedne pojave bez ponavljanja i bez mehanizma. Zapiši u `ideje.md` i čekaj drugu pojavu.
- Iz pretpostavke o tome što korisnik želi. Glas se čita iz izmjena, ne iz dojma.
- Iz nalaza alata koji nije provjeren ručno. Motor griješi; njegov izlaz je hipoteza.

## 3. Što je gdje

```
references/kvar.md         format unosa u katalog kvarova + primjeri dobrog i lošeg
references/ladice.md       razvrstavanje nalaza, granični slučajevi
references/zakrpa.md       pakiranje, imenovanje, što ide u puni paket a što u zakrpu
references/ideje.md        nalazi bez dokaza — čekaonica, ne katalog
scripts/kvar.py            provjera i dodavanje unosa u zamke.md (`--sljedeci` prvi slobodan broj, `--popravi-naslove`,
                           `--nastavak-od N` za fragment, `--od N` filtar sadržaja)
scripts/zakrpa.py          gradnja zakrpe iz razlike dviju verzija skilla (`--par`, ponovljivo)
scripts/dokaz.py           prije/poslije trčanje; zadano pad→prolaz, `--dopusti-isto` kad je razlika u tekstu
scripts/verzija.py         broj verzije paketa i oznaka koju kartica nosi (`--provjeri`, `--stanje`,
                           `--sljedeca`, `--postavi X.Y.Z`, `--dodaj-oznaku SKILL`)
scripts/tests/             test_kvar.py (registar), test_zakrpa.py (oba smjera provjere tvrdnji),
                           test_verzija.py (oznake verzije); sve u bin/testovi.sh
assets/                    fixtures koji reproduciraju kvarove (v. assets/README.md)
```
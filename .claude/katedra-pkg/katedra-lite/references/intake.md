# Intake — mehanika (učitaj JEDNOM, na početku rada)

> Ovo su detalji koraka 0.5–0.10 iz `SKILL.md`. Router drži NAREDBE koje moraju
> okinuti; ovdje su objašnjenja, oblik zapisa i rubni slučajevi. Razlog za podjelu
> je mjerljiv: router se učitava u svakoj poruci, a ovo treba jednom.
>
> Ako radiš intake, otvori ovo. Ako nastavljaš rad na projektu koji već ima
> `.katedra/stanje.json`, ne treba ti.

### 0.4 Formalne odluke — četiri pitanja koja mijenjaju paginaciju

Samo za modove 1, 2 i 6, i **samo za ono što profil fakulteta ostavlja otvorenim**. Ako
profil propisuje, pitanje se preskače i vrijednost se čita iz profila; ako ga nema, pita se
i odgovor se pamti.

| Polje | Vrijednosti | Zadano |
|---|---|---|
| `numeracija` | `od-uvoda` \| `od-naslovnice` | pita se |
| `sadrzaj` | `zivo-polje` \| `staticni` | `zivo-polje` |
| `tablice_boja` | slobodan tekst (`bez boje`, `sivo`, `rozo-sivo`, …) | pita se |
| `unakrsne_reference` | `da` \| `ne` | `da` |

```bash
python3 <KATEDRA_SKILL>/scripts/stanje_init.py --set numeracija=od-uvoda \
  --set sadrzaj=zivo-polje --set tablice_boja=rozo-sivo --set unakrsne_reference=da
```

**Zašto na početku.** Sve četiri mijenjaju prijelom stranica, a promjena prijeloma
poništava stilski prolaz — rečenice se moraju ponovno gledati jer im se promijenio kontekst
stranice. U sesiji u kojoj su nastale, sve su četiri bile sadržaj **drugog kruga revizije**
koji bi jedno pitanje u intakeu izbjeglo. Jeftino prije, skupo poslije.

Zapis je ujedno dokaz odluke: kad se za pola godine pita „zašto sadržaj nije živo polje",
odgovor stoji u `stanje.json`, a ne u tuđem pamćenju. Izradu dokumenta ta polja voze kao
naredbu — v. sposobnost `izrada.docx` u `references/vjestine.md`.

### 0.5 Fakultet → pravila (compositional resolver)

`profile_resolver.py --profile-out` zapisuje functional profil koji se validira s `references/fakulteti/_resolved_schema.json`; provenance ostaje zaseban sidecar. Canonical input profili koriste `_schema.json`.

Čim znaš fakultet/studij/tip rada, razriješi profil **prije** bilo kakvog rada s formatom.
Ne routaj ručno po `index.json`: on je generated runtime cache, ne source of truth.

```bash
python3 <KATEDRA_SKILL>/scripts/profile_resolver.py \
  --fakultet "<slug/naziv/alias>" \
  --tip <seminarski|zavrsni|diplomski> \
  --json
```

Za alat koji traži fizičku putanju profila, zapiši resolved profil. Provenance ostaje
zaseban sidecar i ne mijenja oblik funkcionalnog profila:

```bash
python3 <KATEDRA_SKILL>/scripts/profile_resolver.py \
  --fakultet "<slug/naziv/alias>" --tip <tip> \
  --profile-out .katedra/resolved_profile.json \
  --provenance-out .katedra/resolved_profile.provenance.json
```

Resolver slaže pravila ovim redom (jače nadjačava slabije):
`global → institution → faculty → programme → work_type → course → mentor → project_override`.
Alias može nositi dodatni kontekst: npr. `RFIR` → `faculty=efzg + programme=rfir`.
Više overlayja iste razine za isti kontekst = greška, ne nagađanje.

`references/fakulteti/index.json` regenerira se isključivo iz **admitted** canonical profila i overlayja. **`--write` je maintainer/development operacija nad writable source checkoutom; production runtime nad instaliranim skillom koristi postojeći registry i smije raditi `--check`, ne mutirati install direktorij.**

```bash
python3 <KATEDRA_SKILL>/scripts/profile_registry.py --check
# maintainer-only u writable source checkoutu:
python3 <KATEDRA_SKILL>/scripts/profile_registry.py --write
```

### 0.5b Fakultet izvan registryja — savjetodavni put

`faculty_scale_gate.py` odbija fakultet bez dovoljno qualification caseva i **to je
ispravno**. Ali dosad je posljedica bila da `check_rules.py` uopće ne može raditi,
`stanje_init.py` odbija zapisati stanje, a formalne provjere se pišu rukom — što željezno
pravilo 8 izrijekom ne dopušta. Gate zato ostaje binaran za **admisiju**, ali ne i za
**uporabu**.

```bash
python3 <KATEDRA_SKILL>/scripts/profile_resolver.py --fakultet <slug> --tip <tip> \
    --profil-datoteka references/fakulteti/<slug>.json \
    --profile-out .katedra/resolved_profile.json \
    --provenance-out .katedra/resolved_profile.provenance.json

python3 <KATEDRA_SKILL>/scripts/stanje_init.py --mod novi-rad --tip <tip> --tema "..." \
    --fakultet <slug> --fakultet-izvan-registryja <slug> \
    --ogranicenje "što nije provjereno i zašto"
```

Tri uvjeta, svaki neizostavan:

1. **Datoteka sama sebe deklarira**: `"status": "nepotvrdeno"`. Profil koji tvrdi
   `potvrdeno` ne ulazi ovim putem — to bi bilo obilaženje admisije, ne rad bez nje.
2. **Barem jedno ograničenje.** Bez njega nitko kasnije ne zna koliko nalazima vjerovati,
   a to je cijela razlika između „provjereno" i „pretpostavljeno". Skripta ga traži.
3. **Nalazi su savjetodavni.** `check_rules.py` ih ispisuje i vraća izlazni kod **0**;
   blokirajuće ponašanje je `--strogo`. Rezultat nosi `admisija: nije-admitiran`.

Prijelaz na pravi profil je **admisija, ne prepisivanje**: kad fakultet skupi qualification
caseve, ide u registry kroz `profile_registry.py --write` i savjetodavni put prestaje biti
potreban.

### 0.6 Zapiši stanje na disk (obavezno, prije nego kreneš raditi)


> **Project root contract:** project-state alate pokreći dok je `cwd` korijen korisničkog rada.
> `<KATEDRA_SKILL>` u primjerima znači stvarnu instalacijsku mapu ovog skilla. Ako `cwd` ne
> može ostati na korijenu rada, proslijedi `--project-root /put/do/rada` (ili `--kat` za
> eksplicitnu `.katedra/` mapu). Nikad ne `cd`-aj u instalirani `scripts/` prije poziva bez
> jednog od ta dva overridea.

Ispiši korisniku kratku tablicu **ZADANO**, pa napravi datoteke:

```bash
python3 <KATEDRA_SKILL>/scripts/stanje_init.py --mod novi-rad --tip diplomski \
    --tema "..." --fakultet fpzg --mentor "doc. dr. sc. X" --rok 2026-09-10 \
    --ima upute draft gradja
```

**Nikad ne piši `stanje.json` ručno.** Skripta validira slug fakulteta prema registryju,
format datuma, dosljednost (mod=audit bez rada se odbija) i verziju sheme. Stari v1
state automatski se migrira na v2 uz byte-for-byte backup u `.katedra/migrations/`;
novija/nepoznata verzija se nikad ne prepisuje starijim skillom. Izmjena jednog polja:
`stanje_init.py --set rok=2026-09-20`. Provjera: `--validate`.

**`.katedra/stanje.json`** — jedini izvor istine o tome gdje smo:

```json
{
  "verzija": 2,
  "state_meta": { "schema_version": 2, "artifact_manifest": "artifacts.json",
                  "mentor_feedback": "zamjerke.json" },
  "mod": "novi-rad",
  "tip": "diplomski",
  "tema": "...",
  "fakultet": { "slug": "fpzg", "naziv": "...", "mentor": "doc. dr. sc. ..." },
  "rok": "2026-09-10",
  "citatni_stil": "autor-godina",
  "ciljana_ocjena": 5,
  "datoteke": { "upute": true, "predlozak": false, "draft": true,
                "literatura": false, "gradja": true, "rad_docx": false },
  "ogranicenja": ["nema izvorne građe → faza D ograničena"],
  "plan_odobren": false,
  "azurirano": "2026-08-02"
}
```

Ažuriraj ga kad se išta promijeni (plan odobren, stigla datoteka, pomaknut rok). Pri prelasku u drugi mod **ne pokreći novi intake** — samo promijeni `mod`.

Ostale datoteke nastaju kad im dođe vrijeme: `plan.json` (mod 1), versioned `zamjerke.json`,
`verzije.json` + `verzije/` i centralni `artifacts.json` (hash/version manifest). Mod 4 može
spremiti read-only `consistency.json` i `reviewer_simulation.json`. Oblik i migracijski
contract su u `references/stanje_schema.md`.

**Evidence state (B12).** Nakon `verify_sources.py --json .katedra/izvori.json`, svaki bibliografski
izvor ima stabilni `source_id`. PDF/TXT/MD građu ingestiraj u page-level evidence ledger:

```bash
python3 <KATEDRA_SKILL>/scripts/evidence_ingest.py izvor.pdf \
  --source-id src_... --source-verification .katedra/izvori.json \
  --out .katedra/evidence.jsonl
```

Tvrdnje i njihove veze s dokazima idu u `.katedra/claims.jsonl` preko `claim_ledger.py`.
`claim_ledger.py report` i dalje samo opisuje ledger; B13 gate je zaseban i read-only. Prije
pisanja tvrdnje ili prepisivanja pokreni **Source Analysis Matrix** u strict načinu:

```bash
python3 <KATEDRA_SKILL>/scripts/evidence_gate.py \
  --claims .katedra/claims.jsonl --evidence .katedra/evidence.jsonl \
  --sources .katedra/izvori.json --policy strict --out .katedra/evidence_gate.json
```

`strict` blokira `unsupported`, `conflicted`, `contradicted` i evidence vezan uz
`conflict/invalid` source. `advisory` služi samo za dijagnostiku i ne zamjenjuje strict gate.

Sve u `.katedra/` ide u git zajedno s radom. To je povijest odluka, ne privremene datoteke.

### 0.7 Komentari mentora → trajna checklista

Ako je priložen rad s komentarima ili tracked changesima:

```bash
python3 <KATEDRA_SKILL>/scripts/extract_comments.py rad.docx --out .katedra/zamjerke.json
```

Svaka zamjerka dobiva `status: otvoreno`. **Self-check prije svake isporuke prolazi kroz otvorene zamjerke.** Zamjerka se zatvara tek kad je u tekstu vidljivo riješena, i to se zapiše. Komentar mentora koji se spomene u intakeu pa zaboravi je najskuplja greška u procesu.

Zatvaranje i pregled ide preko `scripts/zamjerke.py`, ne ručnim pisanjem u JSON — v. `references/pisanje.md` § „Zatvaranje zamjerki, ne samo bilježenje".

### 0.7a Neprihvaćene praćene izmjene → prihvati PRIJE bilo kakve dijagnoze

Ako priloženi rad ima **neprihvaćene Wordove praćene izmjene** (Track Changes: `<w:ins>`/
`<w:del>`), pokreni ovo **prije** 0.7, prije `extract_comments.py`, prije `check_ai_style.py`,
prije ručnog čitanja odlomaka — prije bilo koje radnje koja čita tekst dokumenta:

```bash
python3 <KATEDRA_SKILL>/scripts/revizije.py prihvati rad.docx rad_prihvacen.docx
```

**Zašto ovo nije kozmetika.** `python-docx`-ov `Paragraph.text` čita samo runove koji su
izravna djeca `<w:p>` u XML-u. Umetnuti tekst živi unutar `<w:ins>`, obrisani unutar
`<w:del>` — oboje jedan stupanj dublje, pa `.text` te dijelove **tiho preskače**, bez greške
ili upozorenja. Rad s i najmanjom neprihvaćenom izmjenom kroz `python-docx` izgleda krnj:
nedostaju riječi, rečenice se raspadaju usred misli, naslovi gube pola teksta — a svaka
dijagnoza koja krene od takvog čitanja polazi od krivog polazišta i to se ne vidi dok se ne
usporedi sa stvarnim dokumentom u Wordu. Skripta radi isto što i Wordov „Review → Accept All
Changes", programatski, na razini XML-a: `<w:ins>`/`<w:moveTo>` raspakira (tekst ostaje),
`<w:del>`/`<w:moveFrom>` briše zajedno sa sadržajem. **Wordovi komentari (`<w:comment...>`)
nisu praćene izmjene i ovim se ne dirju** — `extract_comments.py` iz 0.7 radi jednako na
izlazu ovog koraka kao i na izvorniku, samo sada nad **cjelovitim** tekstom. Nastavi rad s
`rad_prihvacen.docx`, ne s izvornikom.

### 0.7b Fiksni rječnik markera za nesigurno mjesto u tekstu

Kad tekst treba označiti kao nesigurno umjesto izmisliti ili prešutjeti (željezno pravilo 2),
koristi **točno ove** oznake — dosljedan, grepable vokabular, ne ad hoc fraze koje se
razlikuju iz pasusa u pasus i onda ništa ne pronađe self-check ni finalna tablica „RUČNO
PROVJERI":

| Marker | Kad se koristi |
|---|---|
| `[TREBA IZVOR]` | Tvrdnja treba bibliografski izvor koji nije u `izvori.json`/literaturi. |
| `[PROVJERI STR.]` | Citat postoji, ali se točna stranica ne može potvrditi iz priložene građe. |
| `[PROVJERI ČL.]` | Poziv na propis/zakon čiji se točan broj članka ne može potvrditi. |
| `[PROVJERI NN BR.]` | Broj Narodnih novina (ili drugog službenog glasila) naveden „iz sjećanja", nije provjeren na propisi.hr ili ekvivalentu. |

Svaki marker mora ostati **pretraživ grepom** (`grep -n "\[PROVJERI" rad_tekst.md`) do
predaje — finalna tablica „RUČNO PROVJERI" (željezno pravilo 7) i mod 6 preflight (`predaja.md`)
oslanjaju se na to da se markeri ne preformuliraju u prozu usred pisanja.

### 0.8 Defaulti (samo kad profila fakulteta nema)

| Tip | Opseg | Izvori | Struktura |
|---|---|---|---|
| Seminarski | 2.000–2.500 riječi | 6–8 | uvod + 2–3 poglavlja razrade + zaključak |
| Završni | 25–30 stranica | 15–20 | uvod + teorijski okvir + razrada/analiza + zaključak |
| Diplomski | 18.000–22.000 riječi | 30+ | uvod + teorijski/konceptualni okvir + metodologija/pristup + analiza/sinteza + rasprava + zaključak |

Citatni stil dolazi iz resolved profila. Bez profila default je **autor-godina** `(Prezime, godina, str. X)`; izrazito tehnička tema može deklarirati `ieee` `[1]`, zdravstveni studiji `vancouver` `(1)`, a rad čije službene upute traže pravne fusnote `legal-footnote`. Stil se nikad ne zaključuje iz samog izgleda teksta — odluči i **deklariraj**. Ciljana ocjena default: 5.

### 0.9 Snapshot prije svake izmjene dokumenta

`.docx` u gitu je binarni blob bez upotrebljivog diffa, a `apply_safe_fixes.py` mijenja
dokument. Prije **bilo kakvog** zahvata:

```bash
python3 <KATEDRA_SKILL>/scripts/diff_versions.py --snapshot rad.docx --biljeska "prije faze G"
```

Nakon nove verzije od mentora usporedi što se promijenilo i je li nešto tiho nestalo:

```bash
python3 <KATEDRA_SKILL>/scripts/diff_versions.py rad_v2.docx rad_v3.docx
python3 <KATEDRA_SKILL>/scripts/diff_versions.py rad_v2.docx rad_v3.docx --za-mentora > izmjene.md
```

Izgubljen citat je najčešća tiha šteta pri prepisivanju: tekst izgleda bolje, a tvrdnja
je ostala bez potpore.

### 0.10 Profil autora (između radova)

Ako postoji `~/.katedra/profil.json`, pročitaj ga na početku i uzmi u obzir:

```bash
python3 <KATEDRA_SKILL>/scripts/user_profile.py brief
```

Daje defaulte (fakultet, tip, stil) i **ponavljajuće slabosti iz prethodnih radova**.
Nakon završenog rada nauči iz njega:

```bash
python3 <KATEDRA_SKILL>/scripts/user_profile.py learn --stil ./stil.json --argument ./arg.json \
    --zamjerke ./.katedra/zamjerke.json --fakultet fpzg --tip diplomski
```

Profil ne sprema tekst radova ni osobne podatke, samo nazive nalaza i brojače.


# MOD 4 — AUDIT (adapter na rad-audit)

> Katedra **ne posjeduje** audit-kod. Vlasnik je skill `rad-audit`; ovdje je samo
> adapter: razrješavanje motora, provjera verzioniranog contracta, Katedrin
> fakultetski kontekst i upis nalaza u `.katedra/`.
>
> Granica je formalna: motor deklarira `engine_contract.json`, a puni JSON audit
> vraća `DocumentAuditResult`. Specifikacija je u
> `references/rad_audit_contract.md`.
>
> Pipeline A–G i njegova implementacija ostaju **isključivo u motoru**. Katedra
> nikada ne kopira `pipeline.md` ni audit skripte.


## Datoteke koje trebam (mod 4)

📄 rad u **.docx** (**OBAVEZNO**; PDF ne prolazi) · 🗂️ SVA izvorna građa
(**OBAVEZNO za fazu D**) · 📜 upute fakulteta

---

## 0. Jedan ulaz

```bash
python3 <KATEDRA_SKILL>/scripts/gate.py --faza audit --rad ./rad.docx \
    --profil ./.katedra/resolved_profile.json --tip <tip> --json ./.katedra/gate.json
```

Vodi redoslijed iz §4 i svaki korak svrstava u `ok` / `nalaz` / `preskočeno` / `alat pukao`.
Sve je read-only, pa se pokreće bez čekanja na odobrenje. Faza G (mutacija) **nije** dio
gatea — ona traži eksplicitni `--allow-mutation` i snapshot, v. §B19 niže.

Naredbe ispod ostaju mjerodavne i koriste se kad treba samo jedna provjera ili kad se
gate ne može pokrenuti.

## 1. Razriješi i provjeri motor

```bash
python3 <KATEDRA_SKILL>/scripts/engine.py --provjeri
```

| izlazni kod | značenje | što radiš |
|---|---|---|
| 0 | pronađen kompatibilan `rad-audit` contract v1 | puni motorni opseg |
| 4 | kandidat postoji, ali contract/capabilities nisu kompatibilni | motor se ne pokreće; koristi smanjeni opseg |
| 3 | kandidat `rad-audit` nije pronađen | smanjeni opseg |

Motor se traži ovim redom: `RAD_AUDIT_HOME` → susjedni skill
(`../../rad-audit/scripts`) → `~/.claude/skills/rad-audit/scripts` → plugin
instalacije. `RAD_AUDIT_HOME` može pokazivati na `scripts/` ili na root skilla.

Kompatibilnost se **ne provjerava čitanjem source koda**. Ako nema valjani
`engine_contract.json`, kandidat je nekompatibilan bez obzira na to koje Python
funkcije ili regexe sadrži.

## 2. Pokretanje

Prvo materijaliziraj **resolved** profil za konkretan kontekst rada:

```bash
python3 <KATEDRA_SKILL>/scripts/profile_resolver.py \
  --fakultet "<slug/naziv/alias>" --tip <tip> \
  --profile-out ./.katedra/resolved_profile.json
```

Zatim koristi isti resolved profil kroz cijeli audit:

```bash
python3 <KATEDRA_SKILL>/scripts/engine.py \
  --audit ./rad.docx \
  --sources ./izvori/ \
  --profil ./.katedra/resolved_profile.json \
  --out ./.katedra/audit.md \
  --json ./.katedra/nalazi.json
```

`--profil` je **Katedrin kontekst**. Motor ne zna ništa o profilu fakulteta, tezi
ni planu i taj se argument ne prosljeđuje motornom entrypointu.

Pojedina faza bez punog izvještaja:

```bash
python3 <KATEDRA_SKILL>/scripts/engine.py --faza F ./rad.docx
python3 <KATEDRA_SKILL>/scripts/engine.py --faza B ./rad.docx
```

EntryPointi nisu hardkodirani u Katedri: čitaju se iz motornog
`engine_contract.json`. Za izravnu fazu motor mora deklarirati odgovarajući
`phase.X` capability.

Nakon toga — **i to je dio audita, ne dodatak** — provjere koje su Katedrine:

```bash
python3 <KATEDRA_SKILL>/scripts/check_rules.py ./rad.docx --profil ./.katedra/resolved_profile.json --tip <tip>
python3 <KATEDRA_SKILL>/scripts/check_argument.py ./rad.docx --profil ./.katedra/resolved_profile.json \
  --json ./.katedra/arg.json
python3 <KATEDRA_SKILL>/scripts/check_ai_style.py ./rad.docx
python3 <KATEDRA_SKILL>/scripts/check_paragraphs.py ./rad.docx \
  --profil ./.katedra/resolved_profile.json
```

`--json ./.katedra/arg.json` nije opcionalan detalj: `reviewer_simulation.py` u
odjeljku B19 niže traži upravo tu datoteku, a nijedna druga dokumentirana naredba
je ne stvara. Bez nje B19 blok pada.

**Ne mijenjaj cwd u `<KATEDRA_SKILL>/scripts`.** Runtime ostaje u project cwd-u kako bi
`./rad.docx` i `./.katedra/...` uvijek značili korisnikov projekt, ne instalirani skill.

Podjela je jednostavna: **rad-audit provjerava dokument, Katedra provjerava rad.**

Uz to, dva sadržajna nalaza koja nijedan alat ne daje, a koja u auditu moraju biti
pregledana rukom: **je li rasprava rasprava** (nalaz u dijalogu s literaturom, ne ponovljeni
rezultati — `references/rasprava.md` §1) i **je li metodologija potpuna** (osam odjeljaka —
`references/metodologija.md` §1). Oba su u `references/dijelovi.json` upisana kao razina
`rucno` upravo zato da se ne bi prešutjela.

B09 metodološki context: resolved profil može sadržavati `metodologija.type`. Ako ga nema,
ali je metodologija rada poznata iz plana, pošalji eksplicitno npr.
`--metodologija theoretical|quantitative|qualitative|mixed_methods|case_study|doctrinal_legal|historical|review`.
Ako nije poznata, `check_argument.py` koristi neutralni `generic` policy i ne pretpostavlja empirijski rad.
"Deskriptivnost" je od B09 soft signal (najviše ⚠️), ne hard presuda samo zato što nema uzročnih markera.

## 3. DocumentAuditResult

Ako se koristi `--json`, Katedra rezultat prihvaća tek nakon contract provjere.
Obavezni identitet i polja su:

```json
{
  "contract_version": "1",
  "engine": "rad-audit",
  "engine_version": "<ista verzija kao manifest>",
  "capabilities": ["audit.report-json.v1"],
  "findings": [],
  "counts": {"kritično": 0, "srednje": 0, "kozmetičko": 0},
  "phase_exit_codes": {}
}
```

Legacy ili malformed JSON bez tih polja dobiva exit 4 i **ne interpretira se**
kao pouzdan audit. Detalji: `references/rad_audit_contract.md`.

## 3b. Replikacija brojki (empirijski rad)

Ako rad iznosi vlastite izračune, audit dokumenta nije potpun bez replikacije.
Katedra ju ne radi sama nego zove skill `replikacija-pspp`:

```bash
python3 <KATEDRA_SKILL>/scripts/vjestine.py --sposobnost audit.brojke
```

Izlazni kod 0 → pokreni ga; 3 → satelita nema, zabilježi ograničenje i NE tvrdi da su
brojke provjerene; 4 → satelit je nepotpun, traži ponovnu instalaciju.

Redak `usporedba.csv` koji se ne poklapa je **nalaz razine A** — jednako težak kao
izmišljen izvor, jer je riječ o istoj vrsti pogreške: rad tvrdi nešto što se ne može
pokazati. „PSPP to ne ispisuje" NIJE neslaganje nego ograničenje i tako se bilježi.
Puni postupak i način čitanja nalaza: `references/vjestine.md`.

## 4. Redoslijed

0. **snapshot + `revizije.py prihvati`** — dokument s `w:ins`/`w:del` ne čita se prije
   prihvaćanja (SKILL.md § 0.7a, željezno pravilo 30). Faza A/F u koraku 3 broji izmjene,
   ali dotad je ekstrakcija već prošla; zato je provjera i ovdje, na početku:

   ```bash
   python3 <KATEDRA_SKILL>/scripts/diff_versions.py --snapshot ./rad.docx --biljeska "prije audita"
   python3 <KATEDRA_SKILL>/scripts/revizije.py prihvati ./rad.docx ./rad_prihvaceno.docx
   ```

   Sve naredbe niže rade nad `rad_prihvaceno.docx`. Izvornik ostaje netaknut.
1. `engine.py --provjeri`
2. `check_rules.py` — usklađenost s fakultetom
3. `engine.py --audit … --json …` — motorni nalaz preko contracta
4. `check_argument.py` + `check_ai_style.py` + `check_paragraphs.py`
5. spajanje nalaza u Kritično / Srednje / Kozmetičko
6. izmjene dokumenta samo uz odobrenje i snapshot — mehanička kršenja
   (`format.*`) ispravlja `scripts/fix_rules.py`, ostalo je autorstvo

Dijagnostika (1–4) je read-only.

### Strojni ugovor izvještaja

`check_rules.py --json` uz ljudsku tablicu emitira i strojna polja:

| polje | značenje |
|---|---|
| `rule_id` | stabilan identifikator pravila, oblika putanje u profil (`format.prored`, `prikazi.izvor_ispod`) — isti ključ koji koristi provenance sloj |
| `severity` | enum `u_skladu` / `za_provjeru` / `krsenje` (emoji ostaje u `stanje` radi tablice) |
| `lokacije` | popis mjesta nalaza |

**Traži retke po `rule_id`, nikad po `pravilo`.** Prikazna niska nosi vrstu rada
u sebi („broj poglavlja (seminarski)") i smije se preformulirati; `rule_id` se
mijenja samo namjerno i zamrznut je testom
(`tests/regression/test_check_rules_machine_contract.py`).


### B19 review / mutation boundary

Reviewer simulacija i cross-chapter provjera su **read-only** i smiju se pokretati bez
odobrenja za izmjene:

```bash
python3 <KATEDRA_SKILL>/scripts/consistency_check.py --claims ./.katedra/claims.jsonl --out ./.katedra/consistency.json
python3 <KATEDRA_SKILL>/scripts/reviewer_simulation.py \
  --argument ./.katedra/arg.json --evidence-gate ./.katedra/evidence_gate.json \
  --consistency ./.katedra/consistency.json \
  --out ./.katedra/reviewer_simulation.json
```

Ako projekt ima mentorove zamjerke, dodaj i tu lens:

```bash
  --mentor-feedback ./.katedra/zamjerke.json
```

`--mentor-feedback` je **opcionalan** — većina projekata u ranoj fazi nema
`zamjerke.json` i ranija verzija ovog bloka ga je prikazivala kao obavezan dio
naredbe, pa je blok padao na svakom projektu prije prve mentorove runde.
Preduvjeti su `arg.json` (v. gore), `evidence_gate.json` i `consistency.json`.

Faza G je **mutation capability**. Ne smije se pokrenuti samo zato što ju motor
deklarira. Katedra zahtijeva eksplicitno odobrenje i trenutni snapshot/hash dokaz:

```bash
python3 <KATEDRA_SKILL>/scripts/diff_versions.py --snapshot ./rad.docx --biljeska "prije faze G"
python3 <KATEDRA_SKILL>/scripts/engine.py --faza G ./rad.docx \
  --allow-mutation --project-root .
```

Bez `--allow-mutation`, bez snapshota ili nakon drifta dokumenta faza G se blokira
prije poziva motora. Review output nikad sam ne primjenjuje izmjene.

## 5. Kad motora nema ili je nekompatibilan

Exit 3 znači da motor nije pronađen. Exit 4 znači da kandidat postoji, ali nema
podržani contract/capabilities ili je proizveo nekompatibilan
`DocumentAuditResult`.

U oba slučaja **ne pretvaraj se da puni motorni audit postoji**. Katedra i dalje
može provjeriti svoja fakultetska pravila, argument, AI-style signale i geometriju
odlomaka, a ograničenje treba zabilježiti u projektu.

## 6. Upis u stanje

Nakon kompatibilnog audita u `.katedra/stanje.json` spremi barem:

```json
"audit": {
  "datum": "<ISO>",
  "motor": "<putanja>",
  "contract_version": "1",
  "engine_version": "<verzija>",
  "capabilities": ["audit.report-json.v1"],
  "opseg": "A-G",
  "nalazi": {"kritično": 0, "srednje": 4, "kozmetičko": 7},
  "izvjestaj": ".katedra/audit.md"
}
```

Bez toga sljedeća sesija ne zna na kojem engine contractu je audit napravljen.

## 7. Granica prema solo skillu

Korisnik može `rad-audit` pozvati samostalno. Katedra ne duplicira njegov wizard
ni pipeline. Kada Katedra vodi projekt, već prikupljeni project context ostaje u
`.katedra/`; motor dobiva samo dokumentne argumente definirane svojim contractom.

### Backward-compatible flat-profile poziv

Ako je kontekst **samo faculty-level** i nijedan programme/work-type/course/mentor overlay
nije primjenjiv, ostaje dopušten izravni B04-safe poziv:

```bash
python3 <KATEDRA_SKILL>/scripts/check_rules.py ./rad.docx --fakultet <slug> --tip <tip>
python3 <KATEDRA_SKILL>/scripts/check_paragraphs.py ./rad.docx \
  --profil <KATEDRA_SKILL>/references/fakulteti/<slug>.json
```

Za RFIR i svaki drugi specifični overlay kontekst koristi `resolved_profile.json` iz glavnog
B07 workflowa iznad; flat poziv ne smije se koristiti zaobilaženjem resolvera.


---

## Tijek moda — sažeto

> Ovo je bilo u routeru (`SKILL.md` § 2) do v1.7.
> Tijek jednog moda ne treba biti u datoteci koja se učitava u svakoj poruci.

`audit.md`. `gate.py --faza audit` vodi redoslijed. Motor je skill **`rad-audit`**, ne Katedra: iz project cwd-a prvo `python3 <KATEDRA_SKILL>/scripts/engine.py --provjeri`, pa isti apsolutno adresirani `engine.py --audit …`. Redoslijed: `check_rules.py` (usklađenost s fakultetom) → faze A–F preko motora → `check_argument.py --profil ./.katedra/resolved_profile.json`, `check_ai_style.py`, `check_paragraphs.py` (razina argumenta i stil). Ako postoji `.katedra/evidence.jsonl`, dodaj **advisory** `originality_check.py rad.docx` (v1.1, read-only heuristika preklapanja s ingestiranim izvorima — nije plagijat-detekcija protiv interneta, v. `docs/v1_1_dodaci.md`). Dijagnostika kreće bez čekanja (sve je read-only); odobrenje samo za izmjene dokumenta (faza G). Nema motora → smanjeni opseg, deklariran, nikad prešućen.

---

## Dva alata koja se zovu izravno, ne kroz gate

```bash
python3 <KATEDRA_SKILL>/scripts/provjeri_brojke_u_tekstu.py rad.docx --json .katedra/brojke_teksta.json
```

Brojke koje rad SAM izvodi iz vlastitih prikaza („šest od sedam koraka") i koje
nikad nisu uspoređene sa samim prikazom. Pita, ne presuđuje: dva ciklusa smiju
imati različite brojke.

```bash
python3 <KATEDRA_SKILL>/scripts/sigurni_popravci_hr.py rad.docx --izlaz rad-ispravljeno.docx
```

Samo popravci koji ne mogu promijeniti značenje (razmaci, navodnici, nedjeljivi
razmak uz mjerne jedinice). Piše u novu datoteku. Granica popisa literature mu je
bila kvar (v. `zamke.md`), pa ga se pokreće nakon što je popis omeđen.

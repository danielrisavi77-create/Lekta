# Oblik `.katedra/` datoteka

Sve što treba preživjeti novu sesiju ide ovdje. Razgovor nije memorija.
`.katedra/` ide u git zajedno s radom — to je povijest odluka, ne privremene datoteke.

## Rezolucija project-local statea

Project-local `.katedra/` nikad se ne sprema uz instalirani skill. Zadani korijen je:

1. eksplicitni `--kat` (ako alat prima taj argument),
2. eksplicitni `--project-root`,
3. `KATEDRA_PROJECT_ROOT`,
4. trenutni radni direktorij (`cwd`).

`~/.katedra/profil.json` iz `user_profile.py` namjerno je iznimka: to je profil autora između radova, a ne stanje jednog projekta.

| datoteka | nastaje | piše je |
|---|---|---|
| `stanje.json` | odmah nakon intakea | `stanje_init.py` |
| `artifacts.json` | pri prvom snapshotu/trackingu artefakta | `artifact_state.py` / `diff_versions.py` |
| `perspectives.json` | mod 1, prije outlinea završnog/diplomskog | `perspective_map.py` |
| `plan.json` | mod 1, nakon perspective mapa i kad je plan izrađen | `plan_state.py` |
| `zamjerke.json` | kad stigne rad s komentarima mentora | `extract_comments.py` |
| `verzije.json` + `verzije/` | prije prve izmjene dokumenta | `diff_versions.py` |
| `nalazi.json` + `audit.md` | mod 4 | `engine.py` (motor: rad-audit) |
| `izvori.json` | nakon provjere literature | `verify_sources.py` |
| `evidence.jsonl` | nakon ingestiranja izvora/građe | `evidence_ingest.py` |
| `claims.jsonl` | tijekom planiranja/pisanja tvrdnji | `claim_ledger.py` |
| `evidence_gate.json` | prije pisanja/rewritea kada se traži strict evidence gate | `evidence_gate.py` |
| `consistency.json` | mod 4, nakon što claim ledger pokriva ≥2 poglavlja | `consistency_check.py` |
| `reviewer_simulation.json` | mod 4, nakon argument/evidence/consistency pregleda | `reviewer_simulation.py` |

**Nijednu od njih ne piši ručno.** Skripte validiraju sadržaj; ručno pisanje uvijek
prije ili kasnije proizvede stanje koje ne prolazi `--validate`.

---

## `stanje.json`

```json
{
  "verzija": 2,
  "state_meta": {
    "schema_version": 2,
    "artifact_manifest": "artifacts.json",
    "mentor_feedback": "zamjerke.json"
  },
  "mod": "novi-rad",
  "tip": "diplomski",
  "tema": "...",
  "fakultet": { "slug": "fpzg", "naziv": "...", "mentor": "doc. dr. sc. ..." },
  "rok": "2026-09-10",
  "citatni_stil": "autor-godina",
  "ciljana_ocjena": 5,
  "datoteke": {
    "upute": true, "predlozak": false, "draft": true,
    "literatura": false, "gradja": true, "rad_docx": false
  },
  "ogranicenja": ["nema izvorne građe → faza D ograničena"],
  "plan_odobren": false,
  "azurirano": "2026-08-02"
}
```

| polje | dopuštene vrijednosti | pravilo |
|---|---|---|
| `mod` | `novi-rad` `pisanje` `poboljsanje` `audit` `obrana` `predaja` | prelazak u drugi mod = izmjena ovog polja, **ne** novi intake |
| `tip` | `seminarski` `zavrsni` `diplomski` `esej` | određuje opseg i skaliranje plana |
| `fakultet.slug` | canonical faculty slug iz B07 generated registryja | alias/programme prvo razriješi `profile_resolver.py`, zatim `stanje_init.py` validira slug |
| `rok` | `YYYY-MM-DD` ili `null` | hodogram se računa unatrag od njega |
| `plan_odobren` | `true` / `false` | `false` + tip zavrsni/diplomski = **zabrana pisanja poglavlja**; `true` je dopušten tek nakon `plan_state.py odobri` i prolaska zajedničkog PLAN GATE-a |
| `ogranicenja` | popis rečenica | svako „nemam X" iz intakea završava ovdje |
| `numeracija` | `od-uvoda` `od-naslovnice` | formalna odluka iz intakea 0.4; postoji samo ako je odgovorena ili je profil propisuje |
| `sadrzaj` | `zivo-polje` `staticni` | isto; zadano `zivo-polje` |
| `tablice_boja` | slobodan tekst (`bez boje`, `sivo`, `rozo-sivo`) | isto |
| `unakrsne_reference` | `da` `ne` (bool je istoznačan) | isto; zadano `da` |

Četiri formalne odluke nisu obavezne — stanje bez njih je valjano i radi kao prije — ali ako
postoje, moraju biti iz dopuštenog skupa, jer ih izrada dokumenta čita kao naredbu. Sve
četiri mijenjaju **paginaciju**, pa se pitaju u intakeu, a ne pri izradi.

`mod: audit` bez `datoteke.rad_docx: true` je nedosljedno stanje i skripta ga odbija.


`stanje.json` v2 je formaliziran u `references/project_state_schema.json`. Ako alat pročita
v1 stanje, `state_migrations.py` radi monotoni v1→v2 prijelaz, prvo čuva byte-for-byte
backup u `.katedra/migrations/stanje_v1_<hash>.json`, pa tek onda atomarno zapisuje v2.
State s verzijom **novijom** od podržane se odbija bez mutacije — downgrade nikad nije
automatski. `state_meta` povezuje projekt sa centralnim artifact manifestom i mentor feedback
stateom, ali ne mijenja postojeća akademska polja.

---

## `perspectives.json`

Za završni/diplomski ovaj project-local artefakt nastaje **prije strukture/outlinea**.
`perspective_map.py validate` traži temu, istraživačko pitanje i najmanje dvije
međusobno različite, sadržajno opisane perspektive. Svaka perspektiva može nositi
`source_ids` i `evidence_ids`; time se argumentacijske alternative mapiraju prije nego
što poglavlja učvrste samo jednu liniju.

```json
{
  "schema_version": 1,
  "topic": "Tema rada",
  "research_question": "Zašto se ishodi razlikuju?",
  "perspectives": [
    {
      "perspective_id": "persp_…",
      "label": "Institucionalna",
      "position": "Institucije objašnjavaju razliku u ishodima",
      "why_it_matters": "Daje objašnjenje formalnih ograničenja.",
      "source_ids": ["src_…"],
      "evidence_ids": ["ev_…"]
    }
  ]
}
```

Za završni/diplomski `plan_state.py import` blokira outline dok mapa nije spremna.
`plan_state.py odobri` zatim koristi isti zajednički `plan_gate.py`; `full-auto` je samo
valjan `actor` nakon prolaska gatea, nikad bypass.

## `plan.json`

Plan i program u strojno čitljivom obliku — po njemu `plan_state.py next` zna
što se piše sljedeće, pa `nastavi rad` nikad ne postavlja pitanje „gdje smo stali".

```json
{
  "verzija": 1,
  "teza": "Oporavak turoperatora je vrijednosni, ne volumni.",
  "odobren": false,
  "odobreno_datum": null,
  "budzet_stranica": 38,
  "poglavlja": [
    {
      "broj": "2",
      "naslov": "Turoperatori u lancu vrijednosti turizma",
      "stranice": 6,
      "potpoglavlja": [
        {
          "broj": "2.1",
          "naslov": "Pojam i vrste turoperatora",
          "stranice": 2,
          "sadrzaj": "definicija, tipologija, razgraničenje od agencija",
          "izvori": ["Čavlek 1998 [P]", "UNWTO 2023 [D]"],
          "status": "nije-napisano",
          "rijeci": 0
        }
      ]
    }
  ],
  "prikazi": [
    { "oznaka": "Tablica 1.", "poglavlje": "2.1", "izvor": "autorov izračun prema TUI AG (2023.)" }
  ],
  // NAPOMENA: `prikazi` čita `plan_state.py`, ali ga trenutno ne zapisuje
  // nijedna podnaredba — `import` preskače retke sekcije 6 plana. Polje je
  // dakle ručno održavano dok se ne doda naredba koja ga puni. Zabilježeno
  // auditom (nalaz Q12): ranija verzija ovog dokumenta prikazivala ga je kao
  // dio normalnog izlaza, što je navodilo agenta da očekuje podatke kojih nema.
  "odstupanja": [
    { "datum": "2026-08-02", "sto": "spojena 4.2 i 4.3", "zasto": "isti misaoni potez, 1,5 str. praznog hoda" }
  ]
}
```

`status` potpoglavlja: `nije-napisano` → `u-tijeku` → `napisano` → `provjereno`.

Legenda izvora: `[P]` postojeći (korisnik ga je priložio), `[D]` dodatni (nađen i
verificiran), `[E]` empirijski/primarni (izvorna građa).

**`odstupanja` nije opcionalno.** Svaka izmjena plana tijekom pisanja ide ovdje, s
razlogom. Tiho odstupanje je najbrži način da rad prestane odgovarati odobrenom planu.

---

## `zamjerke.json`

Mentor feedback je od B15 versioned state (`references/mentor_feedback_schema.json`):

```json
{
  "verzija": 2,
  "revision": 3,
  "izvor": "rad_v3.docx",
  "source_artifact": {
    "path": "rad_v3.docx",
    "artifact_id": "art_…",
    "version_id": "v2",
    "sha256": "…"
  },
  "history": [
    {"revision": 2, "event": "source_imported", "source_version": "v2"}
  ],
  "zamjerke": [
    {
      "id": "z1",
      "autor": "mentor",
      "mjesto": "3.2, str. 14",
      "tekst": "Nedostaje kritički osvrt na Lindbloma.",
      "tip": "sadrzaj",
      "status": "rijeseno",
      "rijeseno_gdje": "3.2, dodan kritički osvrt",
      "introduced_revision": 1,
      "history": [
        {"revision": 1, "event": "imported"},
        {"revision": 3, "event": "resolved", "where": "3.2, dodan kritički osvrt"}
      ]
    }
  ]
}
```

`tip`: `sadrzaj` · `struktura` · `citiranje` · `stil` · `forma`.
`status`: `otvoreno` → `rijeseno` (uz obavezno `rijeseno_gdje`). Ponovni mentorov
dokument povećava `revision` i zapisuje source artifact verziju/hash; ista zamjerka zadržava
ID, status, `introduced_revision` i povijest. Legacy v1 zapis migrira se pri sljedećoj mutaciji.

**Self-check prije svake isporuke prolazi kroz otvorene zamjerke.** Zamjerka se zatvara
tek kad je u tekstu vidljivo riješena; `--zatvori` dodaje history event umjesto tihog overwritea.

---

## `verzije.json`

```json
{
  "verzija": 1,
  "snapshoti": [
    {
      "id": "v3",
      "datoteka": "verzije/rad_20260802_1412.docx",
      "sha256": "…",
      "biljeska": "prije faze G",
      "datum": "2026-08-02T14:12:00"
    }
  ]
}
```

Snapshot je preduvjet svake izmjene dokumenta. `.docx` u gitu je binarni blob bez
upotrebljivog diffa — bez snapshota rollback ne postoji. Svaki novi snapshot istodobno
upisuje istu verziju i SHA-256 u centralni `.katedra/artifacts.json`.

## `artifacts.json`

`artifact_state.py` drži identitet artefakta stabilnim po project-relative putanji, a sadržaj
verzionira po hash promjeni (`v1`, `v2`, …). `diff_versions.py --snapshot` usklađuje
`version_id` sa snapshot ID-em. `artifact_state.py status <datoteka>` vraća nonzero ako
trenutni hash više ne odgovara evidentiranoj `current_version`. Formalni oblik je
`references/artifact_manifest_schema.json`.

```json
{
  "schema_version": 1,
  "artifacts": [{
    "artifact_id": "art_…",
    "path": "rad.docx",
    "kind": "document",
    "current_version": "v2",
    "versions": [
      {"version_id": "v1", "sha256": "…", "snapshot_id": "v1", "snapshot_path": "verzije/…"},
      {"version_id": "v2", "sha256": "…", "snapshot_id": "v2", "snapshot_path": "verzije/…"}
    ]
  }]
}
```

---

## `evidence.jsonl`

Jedan redak = jedna izvučena evidence jedinica s fizičkim page locatorom. ID je
deterministički: ponovno ingestiranje istog izvora ne stvara novi identitet.

```json
{"schema_version":1,"evidence_id":"ev_…","source_id":"src_…",
 "locator":{"kind":"page","page":14,"page_label":"12","passage":1,
            "char_start":0,"char_end":842},
 "text":"…","text_sha256":"…","source_sha256":"…",
 "source_path":"izvori/autor2024.pdf","extraction":{"format":"pdf","engine":"pypdf"}}
```

`page` je fizička 1-based stranica PDF-a; `page_label` čuva tiskanu/ugrađenu oznaku kad
postoji. Evidence record ne tvrdi sam po sebi da podupire neku tvrdnju — samo stabilno
locira izvadak u izvoru. Record schema: `references/evidence_schema.json`.

`source_path` je **relativan prema projektnom korijenu koji implicira sam ledger**
(mapa u kojoj je `evidence.jsonl`, odnosno njezin roditelj ako je `.katedra/`). Izvor
izvan projekta zapisuje se apsolutno. Sidro namjerno nije ni cwd ni apsolutna putanja:
cwd se mijenja od poziva do poziva, a apsolutna putanja ne preživi preimenovanje ili
kopiranje projektne mape — u oba slučaja `claim_ledger` ne bi našao datoteku, tiho bi
preskočio provjeru `source_sha256` i **podmetnuta datoteka bi prošla s exit 0**.

## `claims.jsonl`

Jedan redak = jedna tvrdnja i eksplicitne veze na evidence ID-eve.

```json
{"schema_version":1,"claim_id":"clm_001","text":"…",
 "location":{"chapter":"2.1","paragraph":"3"},
 "evidence":[{"evidence_id":"ev_…","relation":"supports"}]}
```

Dopuštene veze: `supports`, `contradicts`, `contextualizes`. `claim_ledger.py validate`
provjerava strukturu, duplikate i dangling ID-eve. `report` računa `supported`, `unsupported`, `conflicted` ili `contradicted`; to ostaje
read-only B12 stanje. B13 enforcement radi zasebni `evidence_gate.py`: `--policy strict`
blokira unsupported/conflicted/contradicted claim i evidence iz blocking izvora, dok
`--policy advisory` samo prikazuje što bi strict blokirao. Source Analysis Matrix može se
spremiti u `.katedra/evidence_gate.json`. Record schema ostaje
`references/claim_ledger_schema.json`, a gate output schema je `references/evidence_gate_schema.json`.

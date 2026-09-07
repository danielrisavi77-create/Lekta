# Testovi rad-orchestratora

Tri fixture-a pokrivaju tri stvarna načina rada; runner ih priprema, smoke-testira bez
Workflowa i provjerava rezultat Workflowa.

| fixture | što pokriva | očekivani status |
|---|---|---|
| `fpzg-seminarski` | registry profil (nepotvrđen), autor-godina, plan → pisanje → audit, full_auto | `zavrseno` ili `ceka_autora` |
| `efzg-zavrsni` | registry profil (potvrđen — gate „pravila" smije dati ❌), plan gate obavezan, 15 potpoglavlja | `zavrseno`, `ceka_autora` ili `ceka_stvaran_input` |
| `hks-fzs-diplomski` | gotov tuđi rad (`rad_docx` mod), profil izvan registryja, Vancouver, empirijski; izvornik se ne dira | `zavrseno` ili `ceka_autora` |

Rad za `hks-fzs-diplomski` **nije u repou** (tuđi diplomski) — zadaje se s `--rad-docx`.

```bash
. "$KATEDRA_PKG/bin/env.sh"
python3 rad-orchestrator/tests/run_fixtures.py svi --root /tmp/rad-fixtures --rad-docx /put/do/rad.docx   # smoke, bez Workflowa
python3 rad-orchestrator/tests/run_fixtures.py priprema efzg-zavrsni --project-root /tmp/rad-fixtures/efzg-zavrsni --ocisti   # → args JSON
# … Workflow(scriptPath: ./rad-orchestrator.js, args: <JSON>) … rezultat spremi kao rezultat.json
python3 rad-orchestrator/tests/run_fixtures.py provjeri efzg-zavrsni --project-root /tmp/rad-fixtures/efzg-zavrsni --rezultat rezultat.json
```

## Zadnji stvarni prolaz — 2. 9. 2026., v1.2 (rezultati u `rezultati/`)

| fixture | status | iteracija | faze | score / pokrivenost | tokeni | trajanje |
|---|---|---|---|---|---|---|
| fpzg-seminarski | ceka_autora | 3 | plan 38 → pisanje 93 → audit 93 | 93 / 0,65 | ~960 k | 44 min |
| efzg-zavrsni | ceka_autora | 3 | plan 38 → pisanje 87 → audit 62 | 62 / 0,65 | ~1 170 k | 59 min |
| hks-fzs-diplomski | ceka_autora | 1 | audit (5 leća) | 87 / 0,65 | ~815 k | 22 min |

Provjera: 30/30 tvrdnji ✅ (statusi, artefakti, izvornik nepromijenjen po sha-256, `rad_v2.docx`
postoji, nema `plan.json` u rad_docx modu, `napredak.json` nosi komponente i pokrivenost).

Što prolaz NIJE pokazao: **lens budget** nije imao što preskočiti — nijedan run nije imao
rollback, pa je audit svugdje posjećen jednom. Grana je testirana samo sintaksno; prvi
stvarni dokaz bit će run s `povratak_na_fazu`.

Što je prolaz otkrio (i što je popravljeno u 1.9.1): `citation_dialects` nije čitao
`(Autor, 2020: [PROVJERI STR.])` kao citat (check_argument 3 → 24 citata); tri v1.9 pomoćne
skripte nisu bile u paketu; `build_docx` nije gradio popis tablica (SEQ/TOC \c); jedan agent
je popravio paket izravno iz workflowa → pravilo „paket se ne mijenja iz workflowa" (v1.2.1).

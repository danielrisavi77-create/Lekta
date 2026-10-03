# Laya lokalni runtime: protokol (V2.1)

Klijent je `scripts/laya/runtime-client.ts`, a runner `scripts/laya/runner.ts`. Runtime je zaseban
proces na radnoj stanici koji omata Laya upstream i govori ovaj protokol. Lekta ne ovisi o
upstream API-ju: sve specifično za upstream živi u runtimeu, a ne u repozitoriju.

## Pravila

- Adresa je samo loopback: `http://127.0.0.1:<port>`, `http://[::1]:<port>` ili
  `http://localhost:<port>`. Klijent odbija https, udaljene adrese i korisničke podatke u URL-u
  (`assertLoopbackEndpoint`). Udaljeni runtime traži zaseban consent i nije dio V2.1
  (`LAYA_V2_SPEC.md`, odjeljak 13).
- Runtime ne zapisuje tekst zapisa u log ni na disk i nema mrežni izlaz tijekom inferencije.
- Timeout klijenta je 30 s po zahtjevu, a najveći odgovor 64 KB. Svaki kvar (HTTP status koji nije
  2xx, timeout, prevelik ili neispravan JSON) klijent pretvara u `runtime_unavailable`.

## Zahtjev

`POST /v2/infer`, `content-type: application/json`:

```json
{
  "schemaVersion": 2,
  "taskId": "reference.completeness/finding-v2",
  "caseId": "laya:v2|reference.completeness|<documentRevisionId>|<profileId>|<profileRevision>|<p>|<r>",
  "inputDigest": "<sha256>",
  "modelInput": { "text": "<jedan bibliografski zapis>", "language": "hr", "ruleEvidence": null },
  "labelOrder": ["finding_supported", "possible_false_positive", "extraction_uncertain", "insufficient_evidence"]
}
```

- Model smije vidjeti samo `modelInput`. `caseId` i `inputDigest` služe samo za vezanje
  odgovora i runtime ih vraća nepromijenjene.
- `labelOrder` je redoslijed kojim runtime nudi oznake modelu. Eval ga permutira i mjeri
  stabilnost (odjeljak 20 specifikacije).

## Odgovor

Točno oblik `LayaDecisionResultV2` (`schemas/laya/finding-v2.schema.json`), bez dodatnih polja:

```json
{
  "schemaVersion": 2,
  "caseId": "<isti kao u zahtjevu>",
  "inputDigest": "<isti kao u zahtjevu>",
  "verdict": "finding_supported",
  "probabilities": { "finding_supported": 0.71, "possible_false_positive": 0.09,
                     "extraction_uncertain": 0.12, "insufficient_evidence": 0.08 },
  "answerConfidence": 0.71,
  "runtime": { "backend": "laya-python", "modelId": "<id>", "modelRevision": "<revizija>",
               "weightsSha256": "<sha256 stabla tezina>", "vocabularySha256": "<sha256 stabla tokenizera>",
               "calibrationRevision": "<revizija>", "runtimeVersion": "<verzija>", "precision": "fp32" }
}
```

- `probabilities` imaju sve četiri oznake. Zbroj je 1 uz toleranciju 0,0005, a `verdict` je
  jedinstveni argmax.
- `weightsSha256` i `vocabularySha256` runtime računa iz stvarnih datoteka koje je učitao, ne
  prepisuje ih iz konfiguracije. Checkpoint čine `model.safetensors`, `rl_agent_config.json`,
  `encoder/*` i `tokenizer/*` (upstream `agent.py:352`). Svaki hash je SHA-256 niza sortiranih
  redaka `relativna/putanja NUL sha256(datoteke) LF`:
  - `weightsSha256` pokriva `model.safetensors`, `rl_agent_config.json` i sve pod `encoder/`;
  - `vocabularySha256` pokriva sve pod `tokenizer/`;
  - skrivene datoteke (upstreamov privremeni `.tokenizer_config.*.tmp`) ne ulaze.
- Hash se računa **nakon** `laya.load`, jer upstream pri učitavanju smije prepisati
  `tokenizer/tokenizer_config.json` (`_fix_tokenizer_config`). Manifest tako opisuje točno ono što
  model koristi.
- `modelRevision` je 40-znamenkasti commit. Runtime ga predaje upstreamu (`laya.load(...,
  revision=)`) i odbija start ako `agent.revision` nije isti commit.
- Runtime ne vraća prag ni politiku. Ako ih vrati, odgovor ima dodatno polje i presuda je
  `invalid_result`. Prag i manifest dolaze isključivo iz `scripts/laya/registry.json`.

## Pitanje modelu i budžet tokena

Runtime postavlja jedno pitanje tipa `choice`: upute i četiri opcije oblika `oznaka: opis`. Model
vidi kratke hrvatske oznake (`nepotpun`, `potpun`, `krivo izvucen`, `neodlucivo`), a runtime
upstreamove vjerojatnosti preslikava natrag u Lektine verdikte **po imenu oznake**, nikad po
položaju. Redoslijed opcija prati `labelOrder` iz zahtjeva.

Upstream `build_sequence` (`laya/common.py`) cijelo pitanje slaže u `head_max_len` tokena (zadano
192), svaku opciju reže na 48 tokena, a kad opcijama ostane manje od 16 tokena, dodatno ih skraćuje.
Upute zatim dobivaju samo ostatak, najmanje 8 tokena. Prvo pitanje (dvojezično, `a43dd62`) nije
stalo, pa je model odgovarao na odrezano pitanje. D1 na #203 dao je točnost 0,044 i nestabilnost
redoslijeda 0,79, uz izbor zadnje ponuđene oznake u 69 % slučajeva.

**Status dijagnoze: potvrđeno** (radna stanica, 28. 9., tokenizer revizije `55cf4c4e`, samo
brojanje): `head_max_len` te revizije je 256, a ne zadanih 192. Upute starog pitanja imaju 74 tokena,
a opcije 33, 63, 43 i 26. Opcija `possible_false_positive` ima 63 tokena, više od 49 (48 i razmak
ispred), pa ju je upstream rezao. NO-GO iz prvog D1 mjerenja zato je mjerio odrezano pitanje, a ne
model.

Zato runtime pri startu broji tokene pitanja **tokenizerom učitanog modela** (`agent.tok`), istim
računom kao upstream. Start odbija ako vrijedi išta od ovoga:
- ijedna opcija ima više od 48 tokena;
- opcijama ostaje manje od 16 tokena;
- upute ne stanu u ostatak budžeta.

Brojke se ispisuju pri startu kao `budzetPitanja`.

**Varijante pitanja** (`--pitanje`):
- `izbor` (zadano): četiri oznake iznad.
- `da-ne`: binarno pitanje tipa `noul`, "Je li ovaj zapis iz popisa literature potpun?". Upstream
  vraća `noul` = P(potpun), a runtime ga preslikava ovako: `possible_false_positive` = P(potpun),
  `finding_supported` = 1 - P(potpun), a `extraction_uncertain` i `insufficient_evidence` = 0.
  `labelOrder` na ovu varijantu nema učinka (upstream uvijek nudi [false, true]), pa njezina
  stabilnost redoslijeda nije mjerljiva. `laya:eval` za nju preskače obrnuti run i ispisuje
  `optionOrderInstability: null` uz `optionOrderInstabilityApplicable: false`, a ne 0 koja bi lažno
  izgledala kao stabilnost.

Varijanta ulazi u `runtimeVersion` (npr. `0.3.21+da-ne`), a time i u `modelDigest`. Prag izmjeren
za jednu varijantu zato se ne može primijeniti na drugu.

## Što runner radi s odgovorom

`adjudicate(odgovor, case, manifest iz registra, politika iz registra)`. Ishod je uvijek
savjetodavan (`SemanticAdjudication`) i nikad ne mijenja score, provjere ni popravak. Tablica
razloga za `no_adjudication` je u `LAYA_V2_SPEC.md`, odjeljak 10.

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
               "weightsSha256": "<sha256 datoteke tezina>", "tokenizerSha256": "<sha256 tokenizera>",
               "calibrationRevision": "<revizija>", "runtimeVersion": "<verzija>", "precision": "fp32" }
}
```

- `probabilities` imaju sve četiri oznake. Zbroj je 1 uz toleranciju 0,0005, a `verdict` je
  jedinstveni argmax.
- `weightsSha256` i `tokenizerSha256` runtime računa iz stvarnih datoteka koje je učitao, ne
  prepisuje ih iz konfiguracije.
- Runtime ne vraća prag ni politiku. Ako ih vrati, odgovor ima dodatno polje i presuda je
  `invalid_result`. Prag i manifest dolaze isključivo iz `scripts/laya/registry.json`.

## Što runner radi s odgovorom

`adjudicate(odgovor, case, manifest iz registra, politika iz registra)`. Ishod je uvijek
savjetodavan (`SemanticAdjudication`) i nikad ne mijenja score, provjere ni popravak. Tablica
razloga za `no_adjudication` je u `LAYA_V2_SPEC.md`, odjeljak 10.

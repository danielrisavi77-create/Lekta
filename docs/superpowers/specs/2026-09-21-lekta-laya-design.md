# LEKTA Laya - Paket 1: ugovor i read-only adapter

Status: odobren je samo Paket 1. Ovo nije odobrenje treniranja, vanjske obrade ili roll-outa.
Polaziste: `master` na `98e905c0f4cba9065143144a0e8f970652515fbc`.

## Namjena

Pripremiti sigurno mjesto za interni pokus klasifikacije bibliografskih nalaza
`reference.completeness`. Postojeci motor, rezultat i deterministicki popravak
ostaju nepromijenjeni. U ovom paketu nema Laya instalacije niti modelskog poziva.

Primatelj adaptera je kasniji interni alat, ne korisnicka aplikacija. Uvoz iz
`src/**`, API endpoint, UI, automatski izvoz i zapis studentskog teksta nisu dio opsega.

## Arhitektura

`DecisionSnapshot -> buildDecisionCases -> DecisionCase[]`

Adapter prima eksplicitan, in-process snapshot. Ne pretrazuje datoteke, ne uvozi
parser ni profile, ne cita browser state i ne otvara dokument. Pozivatelj mora
navesti pojedini zapis, njegov lokator i dokaz veze s prijavljenom provjerom.

Case razdvaja `identity`, `provenance`, `audit`, `modelInput` i `readiness`.
Kasniji model smije primiti samo `modelInput`; cijeli case, gold oznake, audit,
ID-jevi skupina i korisnicki identitet nisu prompt. U ovom paketu nema slanja.

## Izvor istine i ogranicenja

- Jedini podrzani checkId je `reference.completeness`.
- Naslov i `TriageFinding.id` su prikazni podaci, ne identitet casea.
- Ne mijenjaju se score, checks, issues, details.triage, severity, fixability ni recept.
- Nema pisanja recenica, novih pravila, izmjene modaliteta niti provjere argumentacije.
- Izlaz ne sadrzi fixerId, params, entitlement, naredbu ili slobodno obrazlozenje.
- Model nikad ne odobrava repair. WordReplica, naplata i potpis ostaju izvan ovog toka.
- Nema novih runtime ovisnosti. Postojeci TypeScript i Vitest dovoljni su za ovaj paket.

## Identitet i dokaz

Case ID je tocno:

```text
laya:v1|checkId|documentRevisionId|profileId|profileRevision|paragraphIndex|recordIndex
```

Identifikatori dokumenta i podatkovnih skupina su lokalni UUIDv4 pseudonimi, ne
imena datoteka, e-mailovi ili hash studentskog teksta. Profile revision je SHA-256
revizije pravila. Paragraph index je 1-based, record index 0-based unutar odlomka.
Pozivatelj odrzava iste lokatore unutar iste revizije. Promjena revizije mijenja ID.
Duplicirani lokator je greska ugovora, ne povod za proizvoljan sufiks.

`linkage=explicit` je tvrdnja pouzdanog pozivatelja da je konkretni zapis povezan
s nalazom. Agregatni check sam to ne dokazuje. Bez eksplicitne veze, bez jedinstvenog
kanonskog checka ili uz pass/unmeasurable/nepoznat status case se suzdrzava.

Rule evidence nosi izvor, lokator, snapshotHash i verified oznaku. SourcePage smije
ostati null uz poznat sourceLocator. Validator provjerava strukturu, NE potvrdu
izvora ni istinitost dopustenja. Priprema provjerenog profila i stvarno dopustenih
podataka zasebne su odgovornosti. Sinteticki dokaz iz testova nije fakultetsko pravilo.

## Dozvole i privatnost

`localReviewAllowed`, `trainingAllowed` i `externalTeacherAllowed` su odvojene,
obavezne boolean vrijednosti. Nedostajuca dozvola nije dopustenje. Sam adapter trazi
localReviewAllowed=true, ali nista ne trenira i nista ne salje uciteljskom modelu.

Postojeci studentski regresijski korpus ne citamo niti ga pretvaramo u trening skup.
Sve dodane fixture su kratki vlastiti sinteticki objekti. U Git ne ulaze privatni
izvatci, tezine ni sadrzajni izvjestaji. Buduci lokalni artefakti pripadaju postojecem
ignoriranom `.artifacts/laya/` direktoriju. `bundle: forbidden` ne cini javni Git privatnim.

## Ugovor i suzdrzavanje

Verzija 1 koristi cetiri savjetodavne oznake:
`finding_supported`, `possible_false_positive`, `extraction_uncertain`, `insufficient_evidence`.
One nisu novi kanonski Lektini statusi.

Strukturna definicija je `schemas/laya/finding-v1.schema.json`; `$defs.decisionCase`
i `$defs.decisionResult` su dva ulaza. Runtime koristi tu istu definiciju, bez
mreznih schema refova. Podrzan je namjerno mali podskup JSON Schema; nepoznati
keyword ili tip se odbija. Relacijske provjere dodatno zive u `contracts.ts`.

`validateDecisionCase(unknown)` vraca odvojenu JSON kopiju ili DecisionContractError.
Svi objekti su zatvoreni za dodatna polja; odbijaju se accessori, simboli, custom
prototype, ne-JSON i ne-konacne brojevne vrijednosti. Poruke ne ispisuju sadrzaj.

`validateDecisionResult(unknown, expectedCase)` obavezno veze izlaz uz validirani
ulazni caseId, checkId i jezik. Bez drugog argumenta ne moze se dokazati povezanost.
Predikcija nije dopustena za case ciji readiness zahtijeva suzdrzavanje.
Suzdrzani izlaz nema label, probabilities, entropyConfidence ni kalibracijsku tvrdnju.

Cetiri vjerojatnosti moraju biti u [0,1], zbroj unutar 0,00021 od 1 (cetiri
vrijednosti zaokruzene na 4 decimale), a label mora biti argmax. Ne normaliziramo
pokvareni izlaz. Entropy confidence se provjerava uz toleranciju 0,002; on je
`1-H(p)/log(4)`, ne izmjeren postotak tocnosti. Kalibracija moze biti null i ne daje
ovlast za automatsko prihvacanje. Model provenance razlikuje fixture i laya backend.

Limit izvatka je 8.000 Unicode code pointa, a citata pravila 3.000. Prekoracenje
se odbija, nikad reze. Ovo NIJE tokenizer budget; on se uvodi tek uz stvarni model.
Najvise 1.000 eksplicitno predanih zapisa po pozivu adaptera.

## Verifikacija i release granica

Testovi moraju dokazati odvajanje referenci, stabilnost pri preimenovanju,
ambigvitet veze, nepromjenjivost cijelog izvora, odvojene reference objekata,
idempotenciju, strogu validaciju i negativne kontrole namjerno losih implementacija.

Novi `check:laya` typecheck ulazi u `npm run check`. Orphan scan ostaje zaseban
predcommit alat: njegova dokumentirana namjena je necisto radno stablo, ne CI nad
cistim checkoutom. Nema novog CI workflowa niti lazne tvrdnje o tom CI dokazu.
Novi schemas direktorij ulazi u postojece provjere klasifikacijske pokrivenosti.

Lokalni uski test nije puni repo gate niti ML dokaz. Za zavrsetak PR-a potrebni su
puni exact-head CI i pregled. Za merge je potrebna zasebna odluka; deploy nije dio paketa.

## Dopuna nakon neovisnog pregleda 2026-09-26

- `ready` je moguc samo za eksplicitno vezan `warn` ili `fail`; `informational` se suzdrzava.
- Case i result nose obvezni `inputDigest` (SHA-256 identiteta, audita i modelInputa) i result mora odgovarati tocno poslanom caseu.
- Identitet i engineRevision validiraju se i za `records=[]`.
- Policy-abstain mora vratiti isti razlog, `model=null` i `inputTokens=0`.

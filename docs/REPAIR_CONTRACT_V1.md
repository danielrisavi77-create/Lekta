# Repair Contract v1

Repair Contract v1 je strogi, potpisani JSON wire protokol kojim Lekta opisuje unaprijed odobrene
operacije nad jednim točno određenim DOCX dokumentom. Ugovor nije skripta, prompt ni skup
fakultetskih pravila. Lokalni ili serverski executor smije izvršiti samo navedene i potpisane
operacije.

Ovaj dokument opisuje protokol i javni interoperabilni fixture. Ne implementira produkcijsko
izdavanje ugovora, entitlement, naplatu, jednokratni runner ni distribuciju aplikacije.

## Sigurnosni model i redoslijed provjera

Runner mora za svaki posao napraviti sljedeće, ovim redoslijedom:

1. Učitati JSON uz ograničenje veličine i odbijanje duplih ključeva.
2. Pročitati samo minimalni `contractSignature` envelope, odabrati pouzdani javni ključ po `keyId`
   i provjeriti potpis nad cijelim objektom bez polja `contractSignature`.
3. Strogo validirati shemu: točan skup ključeva, tipove, granice, request allow-listu, exceptions i
   output/verification policy. Nepoznato polje je greška, čak i kad je potpis valjan.
4. Provjeriti `createdAt <= now < expiresAt` i da životni vijek nije dulji od lokalno dopuštenog
   maksimuma (zadano 24 sata).
5. Provjeriti da je verzija runner enginea unutar uključivog raspona
   `engineMinVersion..engineMaxVersion`.
6. Prije otvaranja Worda provjeriti stvarnu veličinu source bajtova i SHA-256 cijele izvorne
   datoteke.
7. Izvršiti samo potpisani `requests` niz, istim redoslijedom, bez lokalnog izvođenja fakultetskih
   pravila i bez dodavanja fixera.
8. Pisati isključivo novu datoteku, provesti sve G0-G9 i Word-oracle provjere te source dokument
   ostaviti netaknutim.

Neuspjeh bilo kojeg koraka znači fail-closed: Word se ne pokreće ili se rezultat ne isporučuje.
Ugovor ne smije sadržavati ni pokretati arbitrary code. `footer-page-fixer` je zabranjen kao
samostalni request; potrebna footer logika provodi se samo kroz odobrene složene operacije enginea.

## Potpis i kanonski zapis

- Algoritam: `ES256-P1363`.
- Krivulja: `P-256`.
- Hash potpisa: `SHA-256`.
- Potpisani bajtovi: UTF-8 kanonskog objekta nakon uklanjanja točno polja `contractSignature`.
- Format potpisa: raw IEEE P1363 `r || s`, točno `64-byte` (32 bajta `r` + 32 bajta `s`).
- Wire encoding potpisa i ključeva: canonical `base64url` bez `=` paddinga.
- Privatni ključ nikad nije dio ugovora, fixturea ni runnera. `keyId` bira javni ključ iz lokalnog
  trust storea; javni ključ iz samog ugovora ne bi bio pouzdan.

Kanonski JSON koji koristi v1 nije proizvoljno ponovno serijaliziranje:

- nema whitespacea;
- ključevi svakog objekta sortiraju se kao ECMAScript default string sort (UTF-16 code units);
- redoslijed elemenata niza ostaje nepromijenjen;
- stringovi i konačni brojevi kodiraju se semantikom `JSON.stringify`;
- `NaN`, infinities, `undefined`, funkcije, simboli, accessor polja, ciklusi i neobični prototipovi
  nisu dopušteni;
- ključevi `__proto__`, `prototype` i `constructor` nisu dopušteni.

Promjena redoslijeda objektnih ključeva ne mijenja potpis. Promjena redoslijeda `requests` niza,
bilo kojeg parametra, roka, exceptiona, output policyja ili verification policyja mijenja potpisani
payload i mora završiti s `signature-mismatch`.

## Top-level shema

Svi navedeni ključevi su obvezni i dodatni ključevi nisu dopušteni.

| Polje | Tip i granice |
|---|---|
| `contractVersion` | integer; u v1 mora biti točno `1` |
| `jobId` | RFC 4122 UUID, varijanta RFC i verzija 1-5 |
| `userId` | RFC 4122 UUID, varijanta RFC i verzija 1-5 |
| `sourceSha256` | 64 lowercase heksadekadska znaka, SHA-256 cijelih source bajtova |
| `sourceSize` | integer `>= 0`, broj source bajtova |
| `sourceFileName` | basename 1-180 znakova, završava `.docx`; bez putanje, NUL-a, `..`, Windows rezerviranih imena i znakova `<>:"/\\|?*` |
| `createdAt` | canonical UTC ISO-8601 zapis jednak `Date.toISOString()` rezultatu |
| `expiresAt` | canonical UTC ISO-8601; strogo nakon `createdAt` |
| `engineMinVersion` | SemVer `major.minor.patch`; svaki dio 0-9999, bez leading zeroa |
| `engineMaxVersion` | isti oblik; mora biti `>= engineMinVersion` |
| `requests` | niz od 1 do 64 `RepairContractRequestV1` zapisa |
| `allowedExceptions` | niz od 0 do 64 `AllowedExceptionV1` zapisa |
| `outputPolicy` | strogi objekt opisan niže |
| `verificationPolicy` | strogi objekt opisan niže |
| `contractSignature` | `{ algorithm, keyId, value }`; `keyId` odgovara `[A-Za-z0-9._-]{1,80}`, `value` dekodira u 64 bajta |

## Requests

Svaki request ima točno četiri polja:

| Polje | Tip i granice |
|---|---|
| `requestId` | jedinstveni `req-` + četiri znamenke; Lektin adapter emitira `req-0001` do `req-0064` |
| `fixerId` | jedan identifier iz allow-liste niže |
| `ruleId` | trimmed string duljine 1-200 |
| `params` | plain JSON objekt sa samo fixer-specifičnim ključevima |

Globalne `params` granice su maksimalna dubina 12, najviše 2.000 JSON čvorova, najviše 2.000
elemenata po nizu i najviše 262.144 kanonska UTF-8 bajta po requestu. Svi brojevi moraju biti
konačni. Indeksi i offseti su integeri 0-2.000.000, heading razine 1-9, a Word twips vrijednosti
od -14.400 do 14.400. Polja naziva `*Fingerprint` su stringovi do 200 znakova. Tekstualna
replacement/comment polja imaju najviše 20.000 znakova. Ugniježđeno polje `confirmed` ili
`consent`, kada postoji, mora biti točno `true`.

### Fixer allow-lista i dopušteni top-level params ključevi

| `fixerId` | Dopušteni ključevi i dodatna pravila |
|---|---|
| `margins-fixer` | `top,right,bottom,left`; barem jedan, svaka vrijednost 0-10 |
| `paper-size-fixer` | `w,h`; obje vrijednosti 1-100000 |
| `font-fixer` | `fontName,fontSizePt,deep`; ime 1-100 trimmed, veličina 6-72, barem ime ili veličina |
| `line-spacing-fixer` | `multiplier,deep`; multiplier 0.5-4 |
| `alignment-fixer` | `val,deep`; `val` je `left`, `right`, `center` ili `both` |
| `paragraph-spacing-fixer` | `deep,styleRules,targets`; opcijski nizovi |
| `page-numbering-fixer` | `targets`; obvezan niz objekata |
| `section-insert-fixer` | `target`; objekt s `introParagraphIndex` 0-2000000 |
| `empty-paragraph-fixer` | bez parametara |
| `footnote-spacing-fixer` | `deep` boolean |
| `page-number-alignment-fixer` | `align`; opcijski `left`, `center` ili `right` |
| `toc-field-fixer` | `target`; objekt s `sadrzajParagraphIndex` 0-2000000 |
| `heading-format-fixer` | `targets`; obvezan niz objekata |
| `heading-style-fixer` | `targets,options`; `targets` je obvezan niz objekata |
| `title-page-fixer` | `paragraphCount,lines,ensureTitlePageNoNumber,marginsCm`; 1-80 odlomaka, 1-40 linija, svaka linija ima neprazan `text` do 1000 znakova, margine 0-10 |
| `footnote-typography-fixer` | `fontName,fontSizePt,alignJustify`; barem jedno polje, font 1-100, veličina 6-72 |
| `heading-case-fixer` | `levels`; neprazan niz jedinstveno primjenjivih razina 1-9 |
| `element-caption-fixer` | `version,elements,labels,numbering,captionStyle,lists,references`; `version=1`, `elements` niz |
| `bibliography-repair-fixer` | `version,profileFingerprint,entries,order,options,suffixes`; `version=1`, `entries` niz |
| `citation-bibliography-sync-fixer` | `version,profileFingerprint,citations,entries,mappings`; `version=1`, sva tri niza obvezna |
| `legal-footnote-repair-fixer` | `version,profileFingerprint,markers,operations,bibliographyLinks`; `version=1`, sva tri niza obvezna |
| `final-document-inspector-fixer` | `version,profileFingerprint,revisions,comments,metadata,hiddenText,settings,customXml`; `version=1`, prva četiri niza obvezna |
| `table-figure-rescue-fixer` | `version,profileFingerprint,tables,figures`; `version=1`, oba niza obvezna; svaki landscape zahvat mora biti potvrđen |
| `section-surgery-fixer` | `version,profileFingerprint,operations`; `version=1`, `operations` niz |
| `field-integrity-fixer` | `version,fields,settings,manualToc,bookmarks`; `version=1`, `fields` niz |
| `croatian-typography-fixer` | `version,profileFingerprint,categories,operations`; `version=1`, oba niza obvezna, svaka kategorija ima `consent=true` |
| `consistency-fixer` | `version,groups,replacements`; `version=1`, oba niza obvezna |
| `required-section-fixer` | `version,profileFingerprint,numbering,sections`; `version=1`, `sections` niz |
| `link-doi-fixer` | `version,profileFingerprint,operations`; `version=1`, `operations` niz |
| `submission-metadata-fixer` | `version,fileFingerprint,fields`; `version=1`, `fields` niz |

Za zahvate koji nose konkretne operacije ili mapiranja, request policy dodatno zahtijeva
`confirmed=true` na svakom relevantnom objektu. Normativni popis je u
`src/repair/contract/request-policy.ts`; executor ga ne smije proširiti lokalnom logikom.

`footer-page-fixer` nije na ovoj allow-listi i vraća `standalone-fixer-denied`.

## Potvrde i dopuštene iznimke

`AllowedExceptionV1` ima točno `requestId`, `scope`, `confirmationSha256` i `confirmedAt`.
`confirmationSha256` je lowercase SHA-256 UTF-8 teksta koji je korisnik stvarno vidio i potvrdio;
sam tekst ne putuje u ugovoru. `confirmedAt` ne smije biti nakon `createdAt` ni više od 24 sata prije
njega.

Svaki text-mutating request mora imati točno jednu odgovarajuću iznimku. Fixer koji je ne zahtijeva
ne smije imati iznimku.

| Scope | Fixeri |
|---|---|
| `metadata` | `submission-metadata-fixer` |
| `structure` | `field-integrity-fixer` |
| `visible-text` | `title-page-fixer`, `heading-case-fixer`, `element-caption-fixer`, `bibliography-repair-fixer`, `citation-bibliography-sync-fixer`, `legal-footnote-repair-fixer`, `final-document-inspector-fixer`, `croatian-typography-fixer`, `consistency-fixer`, `required-section-fixer`, `link-doi-fixer` |

## Output i verification policy

`outputPolicy` mora biti točno:

```json
{ "mode": "new-file", "overwriteSource": false, "suggestedFileName": "naziv.docx" }
```

`suggestedFileName` ima ista sigurnosna pravila kao `sourceFileName`. Izvorna datoteka se nikad ne
prepisuje.

`verificationPolicy` mora imati svih pet boolean polja točno `true`:

- `requireSourceByteIdentity`
- `requireOpenAndRepairFalse`
- `requireVisibleTextEquality`
- `requireFieldsUpdateEquality`
- `preserveUnrelatedWordInstances`

`requiredGates` mora sadržavati svaku vrijednost `G0` do `G9` točno jednom i nijednu drugu.
Redoslijed niza je potpisan; Lektin builder emitira `G0` do `G9` tim redom.

## Error kodovi

### Signature

| Kod | Značenje |
|---|---|
| `unsupported-algorithm` | algoritam nije `ES256-P1363` |
| `invalid-key-id` | `keyId` ne odgovara dopuštenom obliku |
| `invalid-signature-encoding` | vrijednost nije canonical base64url ili nije točno 64 bajta |
| `signature-mismatch` | potpis ne odgovara payloadu ili javnom ključu |

### Schema i runtime context

`invalid-shape`, `unsupported-version`, `invalid-id`, `invalid-hash`, `source-size-mismatch`,
`source-hash-mismatch`, `invalid-time`, `expired`, `lifetime-too-long`, `engine-out-of-range`,
`request-policy`, `missing-exception`, `orphan-exception`, `unsafe-output-policy` i
`insufficient-verification-policy`.

Svaki schema/context problem uz kod nosi i `path` do neispravnog polja. `request-policy` znači da
detaljni uzrok treba uzeti iz request validatora.

### Request policy

`requests-not-array`, `request-count`, `request-not-object`, `unknown-fixer`,
`standalone-fixer-denied`, `invalid-request-id`, `duplicate-request-id`, `invalid-rule-id`,
`params-not-object`, `unknown-param`, `invalid-param`, `params-too-large` i
`confirmation-required`.

Request problem uz kod nosi `index` i `path`. Runner ne smije pokušavati ispraviti nevaljan request.

## Cross-language pseudokoraci (.NET, Python i drugi runtimei)

```text
raw = read_bounded_utf8_json(reject_duplicate_keys=true)
sig = read_minimal_signature_envelope(raw.contractSignature)
public_key = trusted_key_store.lookup(sig.keyId)

assert sig.algorithm == "ES256-P1363"
signature_bytes = strict_base64url_no_padding_decode(sig.value)
assert len(signature_bytes) == 64

unsigned = object_without_exact_key(raw, "contractSignature")
payload_bytes = utf8(canonical_json_v1(unsigned))
assert ecdsa_p256_sha256_verify_p1363(public_key, payload_bytes, signature_bytes)

contract = strict_schema_parse(raw)
assert createdAt <= now < expiresAt
assert expiresAt - createdAt <= configured_max_lifetime
assert engineMinVersion <= runnerVersion <= engineMaxVersion

source_bytes = read_exact_selected_docx()
assert len(source_bytes) == contract.sourceSize
assert lowercase_hex(sha256(source_bytes)) == contract.sourceSha256

for request in contract.requests_in_original_order:
    assert request.fixerId in local_allow_list
    execute_known_fixer(request.fixerId, request.params)

save_new_file_only(contract.outputPolicy.suggestedFileName)
run_required_G0_to_G9_and_word_oracle_checks()
deliver_only_if_every_gate_passes()
```

.NET ECDSA implementacije često očekuju DER potpis. Wire vrijednost je P1363, pa treba koristiti API
koji izričito prihvaća IEEE P1363 ili sigurno pretvoriti dva 32-bajtna unsigned integera `r` i `s`
u DER samo za lokalni verify poziv. Wire se pritom ne mijenja. Python biblioteka mora jednako
izričito odabrati P-256 i SHA-256.

## Puni javni fixture

Ovaj fixture koristi mali javni byte vektor `UTF8("PK-public-repair-contract-v1")`, a ne korisnički
DOCX. Nije entitlement, nije potvrda plaćanja i ne daje pravo izvršavanja stvarnog popravka. Javni
ključ je u `tests/fixtures/repair-contract-v1/public-key.spki.b64url`; privatni ključ nije dio
fixturea.

```json
{
  "contractVersion": 1,
  "jobId": "11111111-1111-4111-8111-111111111111",
  "userId": "22222222-2222-4222-8222-222222222222",
  "sourceSha256": "f2d108400a0174d8737b8529bf3956fb6108e75c303158e93ef8de799fdafcbe",
  "sourceSize": 28,
  "sourceFileName": "Kalogjera - seminar Havel.docx",
  "createdAt": "2026-08-16T10:00:00.000Z",
  "expiresAt": "2026-08-16T11:00:00.000Z",
  "engineMinVersion": "1.0.0",
  "engineMaxVersion": "1.0.0",
  "requests": [
    {
      "requestId": "req-0001",
      "fixerId": "font-fixer",
      "ruleId": "body-font",
      "params": {
        "fontName": "Times New Roman",
        "fontSizePt": 12
      }
    },
    {
      "requestId": "req-0002",
      "fixerId": "heading-case-fixer",
      "ruleId": "heading-case",
      "params": {
        "levels": [
          1,
          2
        ]
      }
    }
  ],
  "allowedExceptions": [
    {
      "requestId": "req-0002",
      "scope": "visible-text",
      "confirmationSha256": "adbdd4d5bc0d26d748d2c9a3f1a196ddcd634f61d7eb313cadb83d18fb65fb21",
      "confirmedAt": "2026-08-16T09:59:00.000Z"
    }
  ],
  "outputPolicy": {
    "mode": "new-file",
    "overwriteSource": false,
    "suggestedFileName": "Kalogjera - seminar Havel-popravljeno.docx"
  },
  "verificationPolicy": {
    "requireSourceByteIdentity": true,
    "requireOpenAndRepairFalse": true,
    "requireVisibleTextEquality": true,
    "requireFieldsUpdateEquality": true,
    "preserveUnrelatedWordInstances": true,
    "requiredGates": [
      "G0",
      "G1",
      "G2",
      "G3",
      "G4",
      "G5",
      "G6",
      "G7",
      "G8",
      "G9"
    ]
  },
  "contractSignature": {
    "algorithm": "ES256-P1363",
    "keyId": "fixture-2026-08-16",
    "value": "kUHG4o0z2IdsccN50beFhHFId10E06jWoBmMlW-i6ODbN7IolFKU77T-HZplH_RWQPSzW3usOcJUBxyxUsxsnQ"
  }
}
```

Normativni interoperabilni artefakti su:

- `tests/fixtures/repair-contract-v1/valid-contract.json`
- `tests/fixtures/repair-contract-v1/public-key.spki.b64url`
- `src/repair/contract/`

Fixture se regenerira naredbom `npm run repair-contract-fixture`.

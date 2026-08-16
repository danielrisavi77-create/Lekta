# Repair Contract v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Izgraditi strogu, deterministicku i digitalno potpisivu ugovornu granicu koja postojeci Lektin niz `{fixerId, ruleId, params}` pretvara u `Repair Contract v1`, bez naplate, lokalnog runnera ili promjene DOCX izlaza.

**Architecture:** Ugovor zivi kao cisti TypeScript modul koji mogu uvesti Vite, Vitest i Supabase Deno funkcije. Postojeci fixer registry ostaje izvor identiteta operacija, nova request-policy granica validira oblik i ogranicenja prije izvrsavanja, a ES256 potpis pokriva kanonski UTF-8 zapis svih polja osim samog potpisa. Ova faza samo proizvodi, validira, potpisuje i provjerava ugovor; ne mijenja trenutni korisnicki tok niti pokrece Word.

**Tech Stack:** TypeScript 7 strict, Web Crypto API, Vitest, Vite, Supabase Deno kompatibilni moduli, postojeci Lekta fixer registry.

## Global Constraints

- Razvoj ide na zasebnoj feature grani iz commita `3f36c64`; ne razvijati na `master`.
- Prije izvrsavanja plana koristiti `superpowers:using-git-worktrees` i otvoriti izolirani worktree za `feature/repair-contract-v1`.
- Ne mijenjati parser, audit, citation engine, DOCX fixture ni Golden snapshot.
- Ne dodavati model, prompt niti generiranje ili prepravljanje akademskog sadrzaja.
- Ne dodavati novu runtime ovisnost; koristiti Web Crypto i male ciste pomocne funkcije.
- Svi relativni importi unutar `src/repair/contract` moraju imati eksplicitni `.ts` nastavak radi izravnog Supabase Deno importa.
- `contractVersion` mora biti broj `1`.
- Algoritam potpisa mora biti `ES256-P1363`, SHA-256 s ECDSA P-256 potpisom u 64-bajtnom IEEE P1363 obliku.
- Jedan ugovor smije imati od 1 do 64 zahtjeva.
- `footer-page-fixer` ne smije biti samostalna ugovorna operacija; ostaje samo interni dio `section-insert-fixer` puta.
- Originalni dokument nije izlazna meta; `outputPolicy.mode` mora biti `new-file`, a `overwriteSource` mora biti `false`.
- Ugovor ne smije nositi proizvoljan PowerShell, VBA, COM, JavaScript ni drugi izvrsivi kod.
- Hrvatski je zadani jezik domenskih komentara i dokumentacije. Ne koristiti em ni en crtice.
- Svaka produkcijska promjena prati RED, najmanji GREEN, ciljane testove, puni `npm run check` i mali commit.
- Ova faza ne stvara SQL migraciju, entitlement, claim token, runner, Word COM sesiju ni serversku granu.

## Programski redoslijed nakon ovog plana

Odobrena specifikacija dijeli se na sedam samostalnih isporuka. Ovaj dokument detaljno razradjuje prvu. Svaka sljedeca isporuka dobiva vlastiti plan tek kada su ulazna sucelja prethodne faze zelena i commitana.

1. `Repair Contract v1`, ovaj plan: tipovi, request policy, kanonski zapis, SHA-256, ES256, parser, kontekstualna validacija i adapter iz postojeceg recepta.
2. `WordReplica local proof-of-concept`: portable Windows runner za `Kalogjera - seminar Havel.docx`, novi izlaz, vidljivi Word, checkpoint i original bajt-identican.
3. `One-time entitlement and claim`: Supabase state machine, atomski claim, vezivanje javnog kljuca, replay obrana, retry i revoke.
4. `Dual local and server result`: dvije neovisne grane iz istog potpisanog ugovora i semanticka usporedba rezultata.
5. `Lekta paid repair UX`: potvrda promjena, placanje, download runnera, napredak, fallback i povijest.
6. `Beta fidelity and security matrix`: Kalogjera, GOLDEN #1, kratki rad, velike tablice, slike, fusnote, resume, potpisivanje izvrsne datoteke i sigurnosni testovi.
7. `Production gate and operations`: pravni tekstovi, consent, kill switch, monitoring, retention, support runbook, rollback i promocijski gateovi.

Nakon sto Task 7 ovog plana stabilizira JSON fixture i javni kljuc, faza 2 u WordReplica repozitoriju i priprema faze 3 u Lekta repozitoriju mogu ici paralelno. Faze 4 i 5 cekaju zavrsene faze 2 i 3.

## Zakljucana struktura datoteka

- Create: `src/repair/contract/types.ts`, jedini wire tipovi, konstante i enum vrijednosti ugovora.
- Create: `src/repair/fixer-registry.ts`, lagani jedini izvor `FIXER_IDS`, `FixerId` i `FixerRequest` bez uvoza OOXML enginea.
- Create: `src/repair/contract/canonical-json.ts`, strogi kanonski JSON i UTF-8 pretvorba.
- Create: `src/repair/contract/hash.ts`, SHA-256 hex i base64url pomocne funkcije.
- Create: `src/repair/contract/request-policy.ts`, jedina ulazna granica za fixer zahtjeve.
- Create: `src/repair/contract/contract-v1.ts`, parser i kontekstualna validacija cijelog ugovora.
- Create: `src/repair/contract/signature.ts`, ES256 potpisivanje i provjera.
- Create: `src/repair/contract/adapter.ts`, izgradnja nepotpisanog ugovora iz postojecih zahtjeva i potvrda.
- Create: `src/repair/contract/index.ts`, mali javni barrel bez privatnog ili serverskog kljuca.
- Create: `tests/repair-contract-types.test.ts`, zakljucavanje wire oblika i policy konstanti.
- Create: `tests/repair-contract-canonical-json.test.ts`, kanonizacija, UTF-8 i nevaljane JSON vrijednosti.
- Create: `tests/repair-contract-request-policy.test.ts`, svi fixer identiteti, parametri, limiti i potvrde.
- Create: `tests/repair-contract-validation.test.ts`, schema i kontekstualni gateovi.
- Create: `tests/helpers/repair-contract.ts`, jedan tipizirani valjani contract factory za validation i signature testove.
- Create: `tests/repair-contract-signature.test.ts`, ES256 i tamper testovi.
- Create: `tests/repair-contract-adapter.test.ts`, adapter i kompatibilnost s postojecim receptom.
- Create: `tests/fixtures/repair-contract-v1/valid-contract.json`, jezik-neutralni fixture za kasniji .NET ili Python runner.
- Create: `tests/fixtures/repair-contract-v1/public-key.spki.b64url`, testni javni kljuc bez privatne tajne.
- Create: `tests/repair-contract-fixture.test.ts`, provjera da fixture i kanonski payload nisu odlutali.
- Create: `tests/repair-contract-docs.test.ts`, ugovorna provjera javne dokumentacije i kriptografskih oznaka.
- Create: `docs/REPAIR_CONTRACT_V1.md`, wire ugovor i sigurnosne granice za Lektu i WordReplicu.
- Modify: `src/report/repair-client.ts`, ukloniti lokalni duplikat request tipa i uvesti zajednicki tip.
- Modify: `src/repair/apply-fixers.ts`, uvesti i ponovno izvesti registry bez promjene runtime ponasanja.
- Modify: `src/repair/repair-surface.ts`, citati registry iz laganog modula.
- Modify: `tests/supabase-edge-imports.test.ts`, dokazati da je novi javni modul Deno-kompatibilan.

---

### Task 1: Wire tipovi i nepromjenjive policy konstante

**Files:**
- Create: `src/repair/fixer-registry.ts`
- Create: `src/repair/contract/types.ts`
- Create: `src/repair/contract/index.ts`
- Modify: `src/repair/apply-fixers.ts`
- Modify: `src/repair/repair-surface.ts`
- Create: `tests/repair-contract-types.test.ts`

**Interfaces:**
- Consumes: postojeci popis i request tip iz `src/repair/apply-fixers.ts`.
- Produces: lagani `FIXER_IDS`, `FixerId`, `FixerRequest`, `RepairContractRequestV1`, `AllowedExceptionV1`, `UnsignedRepairContractV1`, `RepairContractV1`, `RepairContractSignatureV1`, `RepairContractOutputPolicyV1`, `RepairContractVerificationPolicyV1`, `GoldenGate`, `REPAIR_CONTRACT_VERSION`, `REPAIR_CONTRACT_MAX_REQUESTS`, `REPAIR_CONTRACT_SIGNATURE_ALGORITHM`.

- [ ] **Step 1: Napisati test koji zakljucava wire oblik**

```ts
import { describe, expect, it } from 'vitest';
import { FIXER_IDS as APPLY_FIXER_IDS } from '../src/repair/apply-fixers';
import {
  GOLDEN_GATES,
  REPAIR_CONTRACT_MAX_REQUESTS,
  REPAIR_CONTRACT_SIGNATURE_ALGORITHM,
  REPAIR_CONTRACT_VERSION,
  type RepairContractV1,
} from '../src/repair/contract';
import { FIXER_IDS } from '../src/repair/fixer-registry';

describe('Repair Contract v1 wire tipovi', () => {
  it('zakljucava verziju, potpis i G0-G9', () => {
    expect(REPAIR_CONTRACT_VERSION).toBe(1);
    expect(REPAIR_CONTRACT_MAX_REQUESTS).toBe(64);
    expect(REPAIR_CONTRACT_SIGNATURE_ALGORITHM).toBe('ES256-P1363');
    expect(GOLDEN_GATES).toEqual(['G0', 'G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8', 'G9']);
  });

  it('ima jedan registry za contract i OOXML executor', () => {
    expect(FIXER_IDS).toBe(APPLY_FIXER_IDS);
    expect(FIXER_IDS).toHaveLength(31);
  });

  it('trazi novu datoteku i zabranu prepisivanja izvora', () => {
    const output: RepairContractV1['outputPolicy'] = {
      mode: 'new-file',
      overwriteSource: false,
      suggestedFileName: 'rad-popravljeno.docx',
    };
    expect(output).toEqual(expect.objectContaining({ mode: 'new-file', overwriteSource: false }));
  });
});
```

- [ ] **Step 2: Pokrenuti test i potvrditi RED**

Run: `npx vitest run tests/repair-contract-types.test.ts`

Expected: FAIL jer `src/repair/fixer-registry.ts` i `src/repair/contract` jos ne postoje.

- [ ] **Step 3: Izdvojiti lagani fixer registry bez promjene ponasanja**

Premjestiti postojeci `FIXER_IDS` niz, izvedeni `FixerId` i `FixerRequest` interface iz `src/repair/apply-fixers.ts` u `src/repair/fixer-registry.ts`, bez promjene redoslijeda ili teksta ijednog ID-a. `apply-fixers.ts` mora uvesti iste vrijednosti za vlastitu uporabu i ponovno ih izvesti radi kompatibilnosti postojecih importa:

```ts
import { FIXER_IDS, type FixerId, type FixerRequest } from './fixer-registry.ts';
export { FIXER_IDS, type FixerId, type FixerRequest } from './fixer-registry.ts';
```

`src/repair/repair-surface.ts` mora citati vrijednost i tip iz `./fixer-registry.ts`, da inventar ne povlaci cijeli executor.

- [ ] **Step 4: Dodati tocne wire tipove**

```ts
import type { FixerId } from '../fixer-registry.ts';

export const REPAIR_CONTRACT_VERSION = 1 as const;
export const REPAIR_CONTRACT_MAX_REQUESTS = 64 as const;
export const REPAIR_CONTRACT_SIGNATURE_ALGORITHM = 'ES256-P1363' as const;
export const GOLDEN_GATES = ['G0', 'G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8', 'G9'] as const;

export type GoldenGate = (typeof GOLDEN_GATES)[number];
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export interface RepairContractRequestV1 {
  requestId: string;
  fixerId: FixerId;
  ruleId: string;
  params: JsonObject;
}

export interface AllowedExceptionV1 {
  requestId: string;
  scope: 'visible-text' | 'structure' | 'metadata';
  confirmationSha256: string;
  confirmedAt: string;
}

export interface RepairContractOutputPolicyV1 {
  mode: 'new-file';
  overwriteSource: false;
  suggestedFileName: string;
}

export interface RepairContractVerificationPolicyV1 {
  requireSourceByteIdentity: true;
  requireOpenAndRepairFalse: true;
  requireVisibleTextEquality: true;
  requireFieldsUpdateEquality: true;
  preserveUnrelatedWordInstances: true;
  requiredGates: GoldenGate[];
}

export interface UnsignedRepairContractV1 {
  contractVersion: 1;
  jobId: string;
  userId: string;
  sourceSha256: string;
  sourceSize: number;
  sourceFileName: string;
  createdAt: string;
  expiresAt: string;
  engineMinVersion: string;
  engineMaxVersion: string;
  requests: RepairContractRequestV1[];
  allowedExceptions: AllowedExceptionV1[];
  outputPolicy: RepairContractOutputPolicyV1;
  verificationPolicy: RepairContractVerificationPolicyV1;
}

export interface RepairContractSignatureV1 {
  algorithm: 'ES256-P1363';
  keyId: string;
  value: string;
}

export interface RepairContractV1 extends UnsignedRepairContractV1 {
  contractSignature: RepairContractSignatureV1;
}
```

`src/repair/contract/index.ts` smije samo ponovno izvesti javne tipove i funkcije ovog direktorija. Ne smije sadrzavati kljuc, env citanje ni mrezni kod.

- [ ] **Step 5: Pokrenuti ciljane testove i TypeScript**

Run: `npx vitest run tests/repair-contract-types.test.ts`

Expected: PASS.

Run: `npx tsc --noEmit`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/repair/fixer-registry.ts src/repair/apply-fixers.ts src/repair/repair-surface.ts src/repair/contract/types.ts src/repair/contract/index.ts tests/repair-contract-types.test.ts
git commit -m "feat: define Repair Contract v1 wire types"
```

### Task 2: Kanonski JSON, UTF-8, SHA-256 i base64url

**Files:**
- Create: `src/repair/contract/canonical-json.ts`
- Create: `src/repair/contract/hash.ts`
- Create: `tests/repair-contract-canonical-json.test.ts`
- Modify: `src/repair/contract/index.ts`

**Interfaces:**
- Consumes: `JsonValue` iz Taska 1.
- Produces: `canonicalJson(value: JsonValue): string`, `canonicalUtf8(value: JsonValue): Uint8Array`, `sha256Hex(bytes: Uint8Array): Promise<string>`, `toBase64Url(bytes: Uint8Array): string`, `fromBase64Url(value: string): Uint8Array`.

- [ ] **Step 1: Napisati RED testove za stabilnost i fail-closed ponasanje**

```ts
import { describe, expect, it } from 'vitest';
import { canonicalJson, canonicalUtf8, fromBase64Url, sha256Hex, toBase64Url } from '../src/repair/contract';

describe('Repair Contract kanonski zapis', () => {
  it('sortira kljuceve, ali cuva redoslijed niza', () => {
    expect(canonicalJson({ z: 1, a: ['drugi', 'prvi'], m: { b: true, a: null } }))
      .toBe('{"a":["drugi","prvi"],"m":{"a":null,"b":true},"z":1}');
  });

  it('cuva hrvatski tekst u UTF-8', () => {
    expect(new TextDecoder().decode(canonicalUtf8({ naziv: 'Sadrzaj, čćžšđ' })))
      .toBe('{"naziv":"Sadrzaj, čćžšđ"}');
  });

  it('odbija NaN, Infinity, undefined, Date i opasne kljuceve', () => {
    for (const value of [NaN, Infinity, undefined, new Date()] as unknown[]) {
      expect(() => canonicalJson(value as never)).toThrow();
    }
    expect(() => canonicalJson(JSON.parse('{"__proto__":{"polluted":true}}'))).toThrow();
  });

  it('ima povratni base64url i poznati SHA-256 vektor', async () => {
    const bytes = new TextEncoder().encode('abc');
    expect(await sha256Hex(bytes)).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(fromBase64Url(toBase64Url(bytes))).toEqual(bytes);
  });
});
```

- [ ] **Step 2: Pokrenuti test i potvrditi RED**

Run: `npx vitest run tests/repair-contract-canonical-json.test.ts`

Expected: FAIL zbog nepostojecih izvoznih funkcija.

- [ ] **Step 3: Implementirati strogu kanonizaciju**

`canonicalJson` mora:

- dopustiti samo `null`, string, boolean, konacni number, niz i obican objekt
- sortirati objektne kljuceve Unicode code-unit poretkom
- cuvati redoslijed elemenata niza
- koristiti `JSON.stringify` za stringove i brojeve
- odbiti `undefined`, funkciju, simbol, bigint, `NaN`, `Infinity`, ciklus i objekt koji nije obican
- odbiti kljuceve `__proto__`, `prototype` i `constructor`
- vratiti isti string za semanticki isti objekt bez obzira na redoslijed umetanja kljuceva

`hash.ts` mora koristiti `crypto.subtle.digest('SHA-256', bytes)`. Base64url mora ukloniti `=` padding i zamijeniti `+` s `-`, a `/` s `_`; decoder mora odbiti znakove izvan `[A-Za-z0-9_-]`.

- [ ] **Step 4: Pokrenuti ciljane testove**

Run: `npx vitest run tests/repair-contract-canonical-json.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/repair/contract/canonical-json.ts src/repair/contract/hash.ts src/repair/contract/index.ts tests/repair-contract-canonical-json.test.ts
git commit -m "feat: canonicalize and hash repair contracts"
```

### Task 3: Stroga request-policy granica

**Files:**
- Create: `src/repair/contract/request-policy.ts`
- Create: `tests/repair-contract-request-policy.test.ts`
- Modify: `src/repair/contract/index.ts`

**Interfaces:**
- Consumes: `FIXER_IDS`, `FixerId` i `FixerRequest` iz `src/repair/fixer-registry.ts`, te `JsonObject` i `RepairContractRequestV1`.
- Produces: `CONTRACT_FIXER_IDS`, `TEXT_MUTATING_FIXERS`, `parseContractRequests(value: unknown): RequestPolicyResult`, `requestRequiresException(fixerId: FixerId): boolean`, `requiredExceptionScope(fixerId: FixerId): AllowedExceptionV1['scope'] | null`.

```ts
export type RequestPolicyIssueCode =
  | 'requests-not-array'
  | 'request-count'
  | 'request-not-object'
  | 'unknown-fixer'
  | 'standalone-fixer-denied'
  | 'invalid-request-id'
  | 'duplicate-request-id'
  | 'invalid-rule-id'
  | 'params-not-object'
  | 'unknown-param'
  | 'invalid-param'
  | 'params-too-large'
  | 'confirmation-required';

export type RequestPolicyResult =
  | { ok: true; requests: RepairContractRequestV1[] }
  | { ok: false; issues: Array<{ index: number; code: RequestPolicyIssueCode; path: string }> };
```

- [ ] **Step 1: Napisati test inventara i osnovnih napada**

```ts
import { describe, expect, it } from 'vitest';
import { FIXER_IDS } from '../src/repair/apply-fixers';
import { CONTRACT_FIXER_IDS, parseContractRequests } from '../src/repair/contract';

describe('Repair Contract request policy', () => {
  it('pokriva svaki poznati fixer i zabranjuje samo samostalni footer', () => {
    expect(new Set([...CONTRACT_FIXER_IDS, 'footer-page-fixer'])).toEqual(new Set(FIXER_IDS));
    expect(CONTRACT_FIXER_IDS).not.toContain('footer-page-fixer');
  });

  it('odbija nepoznati fixer, dodatni kljuc i izvrsivi payload', () => {
    const result = parseContractRequests([{
      requestId: 'req-0001',
      fixerId: 'powershell-fixer',
      ruleId: 'x',
      params: { command: 'Start-Process' },
    }]);
    expect(result).toMatchObject({ ok: false });
  });

  it('odbija duple requestId vrijednosti i vise od 64 zahtjeva', () => {
    const request = { requestId: 'req-0001', fixerId: 'empty-paragraph-fixer', ruleId: 'empty', params: {} };
    expect(parseContractRequests([request, request])).toMatchObject({ ok: false });
    expect(parseContractRequests(Array.from({ length: 65 }, (_, index) => ({ ...request, requestId: `req-${index}` }))))
      .toMatchObject({ ok: false });
  });
});
```

- [ ] **Step 2: Pokrenuti test i potvrditi RED**

Run: `npx vitest run tests/repair-contract-request-policy.test.ts`

Expected: FAIL zbog nepostojece policy granice.

- [ ] **Step 3: Implementirati globalne limite i registry pokrivenost**

Globalna pravila:

- zahtjevi su niz duljine 1 do 64
- svaki zahtjev ima tocno `requestId`, `fixerId`, `ruleId`, `params`
- `requestId` odgovara `/^req-[0-9]{4}$/` i jedinstven je
- `ruleId` je trimani string duljine 1 do 200
- `params` je obican JSON objekt, najvece dubine 12 i najvise 2.000 ukupnih cvorova
- kanonski UTF-8 jednog `params` objekta nije veci od 262.144 bajta
- nepoznati fixer i `footer-page-fixer` vracaju gresku, ne tihi preskok
- nepoznati top-level param kljuc vraca `unknown-param`

Registry mora imati zaseban zapis za svih 30 dopustenih fixer identiteta. Dopuseni top-level kljucevi su:

| Fixer | Dopuseni kljucevi |
|---|---|
| `margins-fixer` | `top`, `right`, `bottom`, `left` |
| `paper-size-fixer` | `w`, `h` |
| `font-fixer` | `fontName`, `fontSizePt`, `deep` |
| `line-spacing-fixer` | `multiplier`, `deep` |
| `alignment-fixer` | `val`, `deep` |
| `paragraph-spacing-fixer` | `deep`, `styleRules`, `targets` |
| `page-numbering-fixer` | `targets` |
| `section-insert-fixer` | `target` |
| `empty-paragraph-fixer` | bez kljuceva |
| `footnote-spacing-fixer` | `deep` |
| `page-number-alignment-fixer` | `align` |
| `toc-field-fixer` | `target` |
| `heading-format-fixer` | `targets` |
| `heading-style-fixer` | `targets`, `options` |
| `title-page-fixer` | `paragraphCount`, `lines`, `ensureTitlePageNoNumber`, `marginsCm` |
| `footnote-typography-fixer` | `fontName`, `fontSizePt`, `alignJustify` |
| `heading-case-fixer` | `levels` |
| `element-caption-fixer` | `version`, `elements`, `labels`, `numbering`, `captionStyle`, `lists`, `references` |
| `bibliography-repair-fixer` | `version`, `profileFingerprint`, `entries`, `order`, `options`, `suffixes` |
| `citation-bibliography-sync-fixer` | `version`, `profileFingerprint`, `citations`, `entries`, `mappings` |
| `legal-footnote-repair-fixer` | `version`, `profileFingerprint`, `markers`, `operations`, `bibliographyLinks` |
| `final-document-inspector-fixer` | `version`, `profileFingerprint`, `revisions`, `comments`, `metadata`, `hiddenText`, `settings`, `customXml` |
| `table-figure-rescue-fixer` | `version`, `profileFingerprint`, `tables`, `figures` |
| `section-surgery-fixer` | `version`, `profileFingerprint`, `operations` |
| `field-integrity-fixer` | `version`, `fields`, `settings`, `manualToc`, `bookmarks` |
| `croatian-typography-fixer` | `version`, `profileFingerprint`, `categories`, `operations` |
| `consistency-fixer` | `version`, `groups`, `replacements` |
| `required-section-fixer` | `version`, `profileFingerprint`, `numbering`, `sections` |
| `link-doi-fixer` | `version`, `profileFingerprint`, `operations` |
| `submission-metadata-fixer` | `version`, `fileFingerprint`, `fields` |

- [ ] **Step 4: Dodati parametarske granice i potvrde**

Za jednostavne fixere ugovorna granica uvodi sljedece fail-closed granice nad postojecim tipovima. One smiju biti stroze od danasnjeg internog sanitizera, ali test kompatibilnosti mora dokazati da ne odbijaju nijedan zahtjev koji zivi Lekta UI stvarno proizvodi:

- centimetri su konacni brojevi od 0 do 10
- font je trimani string od 1 do 100 znakova, velicina 6 do 72 pt
- prored je konacni broj od 0.5 do 4
- poravnanje je `left`, `right`, `center` ili `both`
- indeksi odlomaka i sekcija su cijeli brojevi od 0 do 2.000.000
- razine naslova su cijeli brojevi od 1 do 9
- twips vrijednosti su cijeli brojevi od -14.400 do 14.400
- svi anchor fingerprint stringovi imaju najvise 200 znakova
- replacement, before, comment i statement stringovi imaju najvise 20.000 znakova po vrijednosti
- svi nizovi operacija imaju najvise 2.000 elemenata
- svih 13 assisted fixera mora imati `version: 1`
- operacija koja u postojecem fixer tipu zahtijeva `confirmed: true` ili `consent: true` pada ako marker nije tocno `true`

`TEXT_MUTATING_FIXERS` mora sadrzavati:

```ts
export const TEXT_MUTATING_FIXERS = new Set<FixerId>([
  'title-page-fixer',
  'heading-case-fixer',
  'element-caption-fixer',
  'bibliography-repair-fixer',
  'citation-bibliography-sync-fixer',
  'legal-footnote-repair-fixer',
  'final-document-inspector-fixer',
  'field-integrity-fixer',
  'croatian-typography-fixer',
  'consistency-fixer',
  'required-section-fixer',
  'link-doi-fixer',
  'submission-metadata-fixer',
]);
```

Ovaj skup znaci da zahtjev mora imati povezanu `allowedExceptions` potvrdu u cijelom ugovoru. Ne znaci da svako izvrsavanje mora promijeniti tekst. `requiredExceptionScope` vraca `metadata` samo za `submission-metadata-fixer`, `structure` za `field-integrity-fixer`, a `visible-text` za ostale clanove skupa.

- [ ] **Step 5: Dodati pozitivni test za svaki fixer i negativni test za svaku klasu ogranicenja**

Test mora iterirati `CONTRACT_FIXER_IDS` i za svaki fixer koristiti minimalni valjani factory iz istog testnog fajla. Zabranjeno je preskociti fixer s praznim `if` ili `continue`. Dodati zasebne testove za nevaljani enum, prevelik string, prevelik niz, predubok objekt, `version !== 1`, `confirmed !== true`, `NaN` i nepoznati kljuc.

- [ ] **Step 6: Pokrenuti test i TypeScript**

Run: `npx vitest run tests/repair-contract-request-policy.test.ts`

Expected: PASS za svih 30 dopustenih fixera i sve negativne slucajeve.

Run: `npx tsc --noEmit`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/repair/contract/request-policy.ts src/repair/contract/index.ts tests/repair-contract-request-policy.test.ts
git commit -m "feat: validate Repair Contract fixer requests"
```

### Task 4: Parser i kontekstualna validacija ugovora

**Files:**
- Create: `src/repair/contract/contract-v1.ts`
- Create: `tests/repair-contract-validation.test.ts`
- Create: `tests/helpers/repair-contract.ts`
- Modify: `src/repair/contract/index.ts`

**Interfaces:**
- Consumes: tipove iz Taska 1, request parser iz Taska 3, `sha256Hex` iz Taska 2.
- Produces: `parseRepairContractV1(value: unknown): ContractParseResult`, `validateRepairContractContext(contract: RepairContractV1, context: RepairContractContext): Promise<ContractContextResult>`, `unsignedPayload(contract: RepairContractV1): UnsignedRepairContractV1`.

```ts
export interface RepairContractContext {
  now: Date;
  sourceBytes: Uint8Array;
  engineVersion: string;
  expectedJobId?: string;
  expectedUserId?: string;
  maxLifetimeMs?: number;
}

export type ContractValidationCode =
  | 'invalid-shape'
  | 'unsupported-version'
  | 'invalid-id'
  | 'invalid-hash'
  | 'source-size-mismatch'
  | 'source-hash-mismatch'
  | 'invalid-time'
  | 'expired'
  | 'lifetime-too-long'
  | 'engine-out-of-range'
  | 'request-policy'
  | 'missing-exception'
  | 'orphan-exception'
  | 'unsafe-output-policy'
  | 'insufficient-verification-policy';

export interface ContractValidationIssue {
  code: ContractValidationCode;
  path: string;
}

export type ContractParseResult =
  | { ok: true; contract: RepairContractV1 }
  | { ok: false; issues: ContractValidationIssue[] };

export type ContractContextResult =
  | { ok: true }
  | { ok: false; issues: ContractValidationIssue[] };
```

- [ ] **Step 1: Napisati RED test matrice gateova**

U `tests/helpers/repair-contract.ts` dodati jedan factory koji svi kasniji testovi uvoze:

```ts
import type { RepairContractV1, UnsignedRepairContractV1 } from '../../src/repair/contract';

export const TEST_SOURCE_BYTES = new TextEncoder().encode('abc');

export function validUnsignedContract(overrides: Partial<UnsignedRepairContractV1> = {}): UnsignedRepairContractV1 {
  return {
    contractVersion: 1,
    jobId: '11111111-1111-4111-8111-111111111111',
    userId: '22222222-2222-4222-8222-222222222222',
    sourceSha256: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    sourceSize: 3,
    sourceFileName: 'Seminar.docx',
    createdAt: '2026-08-16T10:00:00.000Z',
    expiresAt: '2026-08-16T11:00:00.000Z',
    engineMinVersion: '1.0.0',
    engineMaxVersion: '1.0.0',
    requests: [{ requestId: 'req-0001', fixerId: 'font-fixer', ruleId: 'body-font', params: { fontName: 'Times New Roman', fontSizePt: 12 } }],
    allowedExceptions: [],
    outputPolicy: { mode: 'new-file', overwriteSource: false, suggestedFileName: 'Seminar-popravljeno.docx' },
    verificationPolicy: {
      requireSourceByteIdentity: true,
      requireOpenAndRepairFalse: true,
      requireVisibleTextEquality: true,
      requireFieldsUpdateEquality: true,
      preserveUnrelatedWordInstances: true,
      requiredGates: ['G0', 'G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8', 'G9'],
    },
    ...overrides,
  };
}

export function validContract(overrides: Partial<RepairContractV1> = {}): RepairContractV1 {
  return {
    ...validUnsignedContract(),
    contractSignature: { algorithm: 'ES256-P1363', keyId: 'test-key-2026-01', value: 'A'.repeat(86) },
    ...overrides,
  };
}
```

```ts
it.each([
  ['contractVersion', 2, 'unsupported-version'],
  ['sourceSha256', 'abc', 'invalid-hash'],
  ['sourceSize', -1, 'invalid-shape'],
  ['outputPolicy', { mode: 'new-file', overwriteSource: true, suggestedFileName: 'x.docx' }, 'unsafe-output-policy'],
])('odbija %s', async (field, value, code) => {
  const contract = validContract({ [field]: value } as Partial<RepairContractV1>);
  const result = parseRepairContractV1(contract);
  expect(result).toMatchObject({ ok: false, issues: expect.arrayContaining([expect.objectContaining({ code })]) });
});
```

Dodati testove za istek, buduci `createdAt`, lifetime iznad 24 sata, krivi job/user, hash istog imena ali drugih bajtova, engine ispod minimuma i iznad maksimuma, duplu exception potvrdu, orphan exception i text-mutating fixer bez exception potvrde.

- [ ] **Step 2: Pokrenuti test i potvrditi RED**

Run: `npx vitest run tests/repair-contract-validation.test.ts`

Expected: FAIL zbog nepostojecih funkcija.

- [ ] **Step 3: Implementirati schema parser bez prisilnih castova na ulazu**

Parser mora odbiti nepoznate top-level kljuceve i zahtijevati tocno polja iz `UnsignedRepairContractV1` plus `contractSignature`. UUID polja moraju odgovarati RFC 4122 tekstualnom obliku. SHA-256 mora biti 64 mala heksadecimalna znaka. `sourceFileName` mora biti bazno ime od 1 do 180 znakova, zavrsavati s `.docx` i ne smije sadrzavati `/`, `\\`, NUL, `..` ni Windows rezervirana imena.

SemVer u ovoj fazi je tocno `MAJOR.MINOR.PATCH`, svaki dio 0 do 9999. Usporedba je numericka po tri dijela, bez prerelease i build sufiksa.

- [ ] **Step 4: Implementirati kontekstualne gateove**

Zadani `maxLifetimeMs` je 24 sata. `createdAt <= now < expiresAt`. Stvarni `sourceBytes.length` mora odgovarati `sourceSize`, a njihov SHA-256 mora odgovarati `sourceSha256`. Ako su zadani expected identiteti, moraju se tocno podudarati. Engine verzija mora biti ukljucivo izmedju minimuma i maksimuma.

Za svaki `TEXT_MUTATING_FIXERS` zahtjev mora postojati tocno jedna exception potvrda s istim `requestId` i scopeom koji vraca `requiredExceptionScope`. Svaka exception potvrda mora referencirati postojeci zahtjev, imati SHA-256 confirmation hash, valjani ISO timestamp i jedinstveni `requestId`. Buduci da korisnik potvrdu daje prije naplate i stvaranja posla, `confirmedAt` mora biti najvise 24 sata prije `createdAt` i ne smije biti poslije `createdAt`; starija potvrda zahtijeva ponovno korisnicko odobrenje.

Verification policy mora imati svih pet boolean polja tocno `true`. `requiredGates` smije sadrzavati samo jedinstvene vrijednosti iz `GOLDEN_GATES`; za v1 zadana stroga konfiguracija zahtijeva svih G0 do G9.

- [ ] **Step 5: Pokrenuti testove**

Run: `npx vitest run tests/repair-contract-validation.test.ts tests/repair-contract-request-policy.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/repair/contract/contract-v1.ts src/repair/contract/index.ts tests/helpers/repair-contract.ts tests/repair-contract-validation.test.ts
git commit -m "feat: validate Repair Contract v1 context"
```

### Task 5: ES256-P1363 potpis i tamper dokaz

**Files:**
- Create: `src/repair/contract/signature.ts`
- Create: `tests/repair-contract-signature.test.ts`
- Modify: `src/repair/contract/index.ts`

**Interfaces:**
- Consumes: `UnsignedRepairContractV1`, `RepairContractV1`, `canonicalUtf8`, base64url funkcije, `unsignedPayload`.
- Produces: `signRepairContractV1(payload, privateKey, keyId): Promise<RepairContractV1>`, `verifyRepairContractV1(contract, publicKey): Promise<SignatureResult>`, `importRepairContractPrivateKey(pkcs8Base64Url): Promise<CryptoKey>`, `importRepairContractPublicKey(spkiBase64Url): Promise<CryptoKey>`.

```ts
export type SignatureResult =
  | { ok: true }
  | { ok: false; code: 'unsupported-algorithm' | 'invalid-key-id' | 'invalid-signature-encoding' | 'signature-mismatch' };
```

- [ ] **Step 1: Napisati RED test s ephemeral P-256 kljucem**

```ts
const pair = await crypto.subtle.generateKey(
  { name: 'ECDSA', namedCurve: 'P-256' },
  true,
  ['sign', 'verify'],
);
const signed = await signRepairContractV1(validUnsignedContract(), pair.privateKey, 'test-key-2026-01');
expect(await verifyRepairContractV1(signed, pair.publicKey)).toEqual({ ok: true });

const tampered = structuredClone(signed);
tampered.sourceSize += 1;
expect(await verifyRepairContractV1(tampered, pair.publicKey)).toMatchObject({ ok: false, code: 'signature-mismatch' });
```

Dodati tamper test za `requests[0].params`, `expiresAt`, `allowedExceptions`, `outputPolicy` i `verificationPolicy`. Dodati test da se promjena samo redoslijeda objektnih kljuceva i dalje verificira, a promjena redoslijeda requests niza pada.

- [ ] **Step 2: Pokrenuti test i potvrditi RED**

Run: `npx vitest run tests/repair-contract-signature.test.ts`

Expected: FAIL zbog nepostojece signature implementacije.

- [ ] **Step 3: Implementirati potpisivanje i provjeru**

Potpisivati iskljucivo `canonicalUtf8(unsignedPayload)`. Poziv Web Crypto mora biti:

```ts
crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, payloadBytes)
```

Potpis mora imati tocno 64 bajta prije base64url kodiranja. Import privatnog kljuca koristi `pkcs8`, import javnog `spki`, oba s `{ name: 'ECDSA', namedCurve: 'P-256' }`. `keyId` mora odgovarati `/^[A-Za-z0-9._-]{1,80}$/`.

Privatni kljuc se nikad ne izvozi iz ovog modula, ne ulazi u fixture i ne smije se re-exportati kao konstanta.

- [ ] **Step 4: Pokrenuti signature i canonical testove**

Run: `npx vitest run tests/repair-contract-signature.test.ts tests/repair-contract-canonical-json.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/repair/contract/signature.ts src/repair/contract/index.ts tests/repair-contract-signature.test.ts
git commit -m "feat: sign Repair Contract v1 payloads"
```

### Task 6: Adapter iz postojeceg Lektinog recepta

**Files:**
- Create: `src/repair/contract/adapter.ts`
- Create: `tests/repair-contract-adapter.test.ts`
- Modify: `src/repair/contract/index.ts`
- Modify: `src/report/repair-client.ts`

**Interfaces:**
- Consumes: postojeci `RepairFixerRequest` oblik, source bytes, identitete posla i potvrde.
- Produces: `buildUnsignedRepairContractV1(input): Promise<UnsignedRepairContractV1>`, zajednicki `RepairFixerRequest` type alias prema `FixerRequest`.

```ts
export interface RepairConfirmationInput {
  requestIndex: number;
  confirmationText: string;
  confirmedAt: Date;
}

export interface BuildRepairContractInput {
  jobId: string;
  userId: string;
  sourceBytes: Uint8Array;
  sourceFileName: string;
  createdAt: Date;
  expiresAt: Date;
  engineMinVersion: string;
  engineMaxVersion: string;
  requests: ReadonlyArray<{ fixerId: string; ruleId: string; params: Record<string, unknown> }>;
  confirmations: ReadonlyArray<RepairConfirmationInput>;
  suggestedFileName?: string;
}
```

- [ ] **Step 1: Napisati RED test adaptera**

```ts
const sourceBytes = new TextEncoder().encode('PK-test-docx');
const contract = await buildUnsignedRepairContractV1({
  jobId: '11111111-1111-4111-8111-111111111111',
  userId: '22222222-2222-4222-8222-222222222222',
  sourceBytes,
  sourceFileName: 'Seminar.docx',
  createdAt: new Date('2026-08-16T10:00:00.000Z'),
  expiresAt: new Date('2026-08-16T11:00:00.000Z'),
  engineMinVersion: '1.0.0',
  engineMaxVersion: '1.0.0',
  requests: [{ fixerId: 'font-fixer', ruleId: 'body-font', params: { fontName: 'Times New Roman', fontSizePt: 12 } }],
  confirmations: [],
});
expect(contract.requests[0].requestId).toBe('req-0001');
expect(contract.sourceSize).toBe(sourceBytes.length);
expect(contract.sourceSha256).toMatch(/^[0-9a-f]{64}$/);
expect(contract.outputPolicy).toMatchObject({ mode: 'new-file', overwriteSource: false, suggestedFileName: 'Seminar-popravljeno.docx' });
expect(contract.verificationPolicy.requiredGates).toEqual(['G0', 'G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8', 'G9']);
```

- [ ] **Step 2: Pokrenuti test i potvrditi RED**

Run: `npx vitest run tests/repair-contract-adapter.test.ts`

Expected: FAIL zbog nepostojeceg adaptera.

- [ ] **Step 3: Implementirati adapter bez domenskog odlucivanja**

Adapter mora ocuvati redoslijed zahtjeva, dodijeliti `req-0001` do `req-0064`, provesti `parseContractRequests`, izracunati source hash iz stvarnih bajtova i izraditi stroge output i verification policy objekte.

Za confirmation input adapter racuna `confirmationSha256` nad UTF-8 tekstom koji je korisnik stvarno vidio, povezuje ga s generiranim request ID-em i sam izvodi scope pomocu `requiredExceptionScope`. Adapter odbija potvrdu za fixer koji je ne zahtijeva, duplu potvrdu i izostanak potvrde za fixer koji je zahtijeva. Ne smije sam izmisliti potvrdu, promijeniti `params`, dodati fixer ili izvoditi fakultetsko pravilo.

U `src/report/repair-client.ts` zamijeniti lokalni interface i uvesti tip iz laganog `../repair/fixer-registry.ts` modula:

```ts
export type RepairFixerRequest = FixerRequest;
```

Postojeci `RepairMeta` wire oblik i `uploadRepair` ostaju nepromijenjeni u ovoj fazi.

- [ ] **Step 4: Dokazati kompatibilnost sa svim generiranim receptima**

Dodati test koji poziva `buildRecipe()`, prolazi svaki `profile.items` zapis kroz request policy i prijavljuje `profile.id`, `fixerId` i `ruleId` pri prvom padu. Za stavke koje su samo opisni kompoziti s `fixerId` vrijednoscu poput `a / b`, test ih mora izricito klasificirati kao neizvrsive recipe-opise i potvrditi da ih zivi UI ne salje kao jedan request. Test ne smije mijenjati `docs/generated/repair-recipe.json` ni snapshot.

- [ ] **Step 5: Pokrenuti adapter, recipe i client testove**

Run: `npx vitest run tests/repair-contract-adapter.test.ts tests/repair-recipe.test.ts tests/repair-client.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/repair/contract/adapter.ts src/repair/contract/index.ts src/report/repair-client.ts tests/repair-contract-adapter.test.ts
git commit -m "feat: build contracts from repair recipes"
```

### Task 7: Potpisani jezik-neutralni fixture za WordReplica

**Files:**
- Create: `tests/fixtures/repair-contract-v1/valid-contract.json`
- Create: `tests/fixtures/repair-contract-v1/public-key.spki.b64url`
- Create: `tests/repair-contract-fixture.test.ts`
- Create: `scripts/generate-repair-contract-fixture.mts`
- Modify: `package.json`

**Interfaces:**
- Consumes: builder i signer iz Taskova 5 i 6.
- Produces: stabilni testni contract, javni SPKI kljuc i skripta `npm run repair-contract-fixture`.

- [ ] **Step 1: Napisati RED fixture test**

Test mora ucitati oba fixture fajla, parsirati contract, uvesti javni kljuc, verificirati potpis i potvrditi ove stabilne vrijednosti:

```ts
expect(contract).toMatchObject({
  contractVersion: 1,
  jobId: '11111111-1111-4111-8111-111111111111',
  userId: '22222222-2222-4222-8222-222222222222',
  sourceFileName: 'Kalogjera - seminar Havel.docx',
  engineMinVersion: '1.0.0',
  engineMaxVersion: '1.0.0',
  contractSignature: { algorithm: 'ES256-P1363', keyId: 'fixture-2026-08-16' },
});
```

Fixture requests moraju sadrzavati jedan formatni zahtjev bez exceptiona i jedan `heading-case-fixer` zahtjev s tocno jednom `visible-text` potvrdom. Izvorni bajtovi za fixture moraju biti mali javni byte vektor definiran u testu, ne korisnicki DOCX.

- [ ] **Step 2: Pokrenuti test i potvrditi RED**

Run: `npx vitest run tests/repair-contract-fixture.test.ts`

Expected: FAIL jer fixture i generator ne postoje.

- [ ] **Step 3: Dodati deterministicki generator**

Generator koristi fiksni testni PKCS8 kljuc samo za javni fixture. Privatni testni kljuc smije zivjeti kao konstanta iskljucivo u generator skripti, uz komentar `TEST FIXTURE ONLY`. Produkcijski modul ga ne uvozi. Generator zapisuje formatirani JSON s LF zavrsetkom i javni SPKI base64url.

U `package.json` dodati:

```json
"repair-contract-fixture": "vite-node scripts/generate-repair-contract-fixture.mts"
```

- [ ] **Step 4: Generirati fixture i provjeriti idempotentnost**

Run: `npm run repair-contract-fixture`

Expected: oba fixture fajla nastanu.

Run: `npm run repair-contract-fixture`

Expected: `git diff -- tests/fixtures/repair-contract-v1` ne prikazuje novu promjenu nakon drugog pokretanja.

- [ ] **Step 5: Pokrenuti fixture i signature testove**

Run: `npx vitest run tests/repair-contract-fixture.test.ts tests/repair-contract-signature.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json scripts/generate-repair-contract-fixture.mts tests/fixtures/repair-contract-v1 tests/repair-contract-fixture.test.ts
git commit -m "test: publish Repair Contract v1 fixture"
```

### Task 8: Deno granica i javna dokumentacija

**Files:**
- Create: `docs/REPAIR_CONTRACT_V1.md`
- Create: `tests/repair-contract-docs.test.ts`
- Modify: `tests/supabase-edge-imports.test.ts`
- Test: `tests/repair-contract-validation.test.ts`

**Interfaces:**
- Consumes: javni barrel `src/repair/contract/index.ts` i fixture iz Taska 7.
- Produces: dokaz da Edge runtime moze uvesti ugovor i stabilan dokument za WordReplica implementaciju.

- [ ] **Step 1: Napisati RED dokumentacijski i Deno import test**

Prosiriti postojeci staticki import test tako da potvrdi da svi moduli pod `src/repair/contract` koriste relativne importove kompatibilne s postojecim bundler pravilima, ne uvoze Node built-in module, ne citaju `process.env` i ne sadrze privatni kljuc.

```ts
expect(contractSource).not.toMatch(/from ['"]node:/);
expect(contractSource).not.toMatch(/process\.env/);
expect(contractSource).not.toMatch(/BEGIN PRIVATE KEY|PRIVATE KEY ONLY/);
```

Novi `tests/repair-contract-docs.test.ts` mora procitati `docs/REPAIR_CONTRACT_V1.md` i zahtijevati oznake `ES256-P1363`, `P-256`, `SHA-256`, `64-byte`, `base64url`, `contractSignature`, `footer-page-fixer` i `arbitrary code`.

- [ ] **Step 2: Pokrenuti test i potvrditi RED prije izmjene testa ili modula**

Run: `npx vitest run tests/supabase-edge-imports.test.ts`

Expected: FAIL jer `docs/REPAIR_CONTRACT_V1.md` jos ne postoji. Deno staticki dio moze vec biti zelen ako su raniji taskovi postovali globalno pravilo o `.ts` importima.

- [ ] **Step 3: Dokumentirati tocni wire protokol**

`docs/REPAIR_CONTRACT_V1.md` mora sadrzavati:

- puni JSON primjer iz fixturea, ali bez privatnog kljuca
- definiciju da se potpisuje kanonski objekt bez `contractSignature`
- algoritam `ES256-P1363`, P-256, SHA-256, raw 64-byte potpis, base64url bez paddinga
- sva polja, tipove, granice i error kodove
- zahtjev da runner prvo provjeri potpis, zatim schema, vrijeme, engine range, source size i source hash
- zabranu arbitrary koda i samostalnog `footer-page-fixer`
- pravilo da lokalni ili serverski executor ne izvodi fakultetska pravila, nego samo potpisane operacije
- napomenu da fixture nije entitlement ni pravi korisnicki dokument
- cross-language pseudo-korake koje .NET ili Python implementacija mora slijediti

- [ ] **Step 4: Pokrenuti Deno/import i contract testove**

Run: `npx vitest run tests/supabase-edge-imports.test.ts tests/repair-contract-docs.test.ts tests/repair-contract-fixture.test.ts tests/repair-contract-validation.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add docs/REPAIR_CONTRACT_V1.md tests/repair-contract-docs.test.ts tests/supabase-edge-imports.test.ts
git commit -m "docs: publish Repair Contract v1 protocol"
```

### Task 9: Puni regresijski gate i plan predaje

**Files:**
- Verify only: svi fajlovi iz Taskova 1 do 8

**Interfaces:**
- Consumes: cijeli Phase 1 diff.
- Produces: zelen commit spreman kao ulaz za WordReplica local PoC i entitlement plan.

- [ ] **Step 1: Pregledati opseg i zabranjene promjene**

Run: `git diff --name-status 3f36c64...HEAD`

Expected: samo `src/repair/contract/**`, `src/repair/fixer-registry.ts`, kompatibilni registry importi u `src/repair/apply-fixers.ts` i `src/repair/repair-surface.ts`, navedeni contract testovi i fixturei, `src/report/repair-client.ts`, `tests/supabase-edge-imports.test.ts`, `scripts/generate-repair-contract-fixture.mts`, `package.json` i `docs/REPAIR_CONTRACT_V1.md`.

Run: `git diff --check 3f36c64...HEAD`

Expected: bez izlaza i exit 0.

- [ ] **Step 2: Pokrenuti sve contract testove zajedno**

Run: `npx vitest run tests/repair-contract-types.test.ts tests/repair-contract-canonical-json.test.ts tests/repair-contract-request-policy.test.ts tests/repair-contract-validation.test.ts tests/repair-contract-signature.test.ts tests/repair-contract-adapter.test.ts tests/repair-contract-fixture.test.ts tests/repair-contract-docs.test.ts tests/repair-client.test.ts tests/repair-recipe.test.ts tests/supabase-edge-imports.test.ts`

Expected: svi testovi PASS, bez snapshot updatea.

- [ ] **Step 3: Pokrenuti obvezni Lekta gate**

Run: `npm run check`

Expected: `tsc --noEmit`, cijeli Vitest i `vite build` zavrsavaju exit kodom 0.

- [ ] **Step 4: Potvrditi da generator ne stvara drift**

Run: `npm run repair-contract-fixture`

Expected: uspjesan izlaz.

Run: `git status --short`

Expected: nema novih promjena nakon generatora. Ako Windows ponovno oznaci postojece Golden snapshote bez tekstualnog diffa, usporediti working i index hash. Ne stageati ih i ne resetirati ih naslijepo.

- [ ] **Step 5: Zavrsni mali commit samo ako je generator ili dokumentacija trebala korekciju**

```bash
git add src/repair/contract tests/repair-contract-*.test.ts tests/fixtures/repair-contract-v1 scripts/generate-repair-contract-fixture.mts docs/REPAIR_CONTRACT_V1.md src/report/repair-client.ts tests/supabase-edge-imports.test.ts package.json
git commit -m "test: close Repair Contract v1 verification gate"
```

Ako nema dodatnog diffa, ne stvarati prazan commit.

- [ ] **Step 6: Zabiljeziti ulazna sucelja za sljedece planove**

WordReplica local PoC smije ovisiti samo o:

- `tests/fixtures/repair-contract-v1/valid-contract.json`
- `tests/fixtures/repair-contract-v1/public-key.spki.b64url`
- `docs/REPAIR_CONTRACT_V1.md`
- error kodovima iz `contract-v1.ts`

Entitlement i claim plan smije ovisiti samo o:

- `UnsignedRepairContractV1`
- `signRepairContractV1`
- `RepairContractV1`
- `jobId`, `userId`, `sourceSha256`, `createdAt`, `expiresAt` i `contractSignature.keyId`

Nijedan sljedeci plan ne smije kopirati fakultetska pravila niti zasebno definirati fixer ID-eve.

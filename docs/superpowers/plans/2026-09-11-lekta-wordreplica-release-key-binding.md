# Lekta + WordReplica Fail-Closed Release Key Binding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kriptografski vezati WordReplica runner manifest uz stvarni P-256 Repair Contract kljuc i automatizirati Lekta release tako da tajne ostanu skrivene, lokalni repair ostane ugasen do zadnjeg koraka, a svaki parcijalni pad zavrsi fail-closed.

**Architecture:** WordReplica je jedini proizvodjac kanonskog SHA-256 otiska DER SPKI javnog kljuca i zapisuje ga u manifest v2. Lekta neovisno izvodi isti javni kljuc iz PKCS#8 privatnog kljuca, usporedjuje tri identiteta prije mreze, a zatim kroz fokusirani privremeni env-file helper izvodi disabled-first Supabase release i uklanja kill switch posljednji.

**Tech Stack:** Python 3.12, `cryptography`, pytest, PowerShell 5.1, Node.js 20+, TypeScript ESM, Node `crypto`/`fs`/`child_process`, Vitest, Supabase CLI 2.109.1, Netlify CLI, Microsoft Word Golden/E2E oracle.

**Spec:** `docs/superpowers/specs/2026-09-11-lekta-wordreplica-release-key-binding-design.md`

## Global Constraints

- WordReplica rad ostaje samo na `automation-dev`; Lekta rad ostaje samo na `feature/repair-contract-v1-current-v2`.
- Nikada ne razvijati, commitati, pushati ili promovirati izravno na `main` ili `master`.
- Runner manifest za ovaj release mora biti iskljucivo `schemaVersion: 2`; Lekta odbija v1.
- `contractPublicKeySha256` je 64-znamenkasti lowercase SHA-256 kanonskog DER `SubjectPublicKeyInfo` P-256 kljuca.
- Ciljni Supabase projekt je iskljucivo `zrrjttizjyfcxmcpgzml`.
- Privatni kljuc ne smije biti u Git stablu, procesnim argumentima, planu, stdoutu, stderru ili poruci pogreske.
- Supabase secret env datoteka mora biti nasumicna, ogranicena na trenutnog korisnika, SYSTEM i Administrators na Windowsu odnosno mode `0600` na POSIX-u te uklonjena nakon uspjeha i pogreske.
- Prva mutacija runtime zastavice postavlja `REPAIR_LOCAL_DISABLED=true`; posljednja je jedina koja postavlja `REPAIR_LOCAL_DISABLED=false`.
- Pure-DOCX ostaje renderer. Microsoft Word nije licencni uvjet za korisnicki popravak; koristi se kao zavrsni oracle.
- Ne mijenjati Golden source DOCX, ne zatvarati nepovezane Word dokumente i nikada globalno ne terminirati `WINWORD.EXE`.
- Nema produkcijskog Supabase/Netlify deploymenta tijekom implementacije. Trusted Authenticode certifikat i svi promotion gateovi ostaju zaseban produkcijski preduvjet.
- Ne dodavati novu npm ili Python ovisnost; koristiti postojece `cryptography` i Node standardnu biblioteku.
- Svaki produkcijski korak slijedi RED, najmanji fix, GREEN. WordReplica dodatno slijedi puni pytest i stvarni Golden ugovor iz `AGENTS.md`; Lekta prije commita mora proci `npm run check` i `npm run orphan-scan`.
- Supabase CLI 2.109.1 lokalno potvrduje `secrets set --env-file <path> --project-ref <ref>` i pojedinacni `functions deploy <name> --project-ref <ref>`; prije stvarnog buduceg deploymenta ponovno pokrenuti odgovarajuce `--help` naredbe.

---

## File and Responsibility Map

### WordReplica (`C:\WordReplica-Automation\repo`)

- `src/word_replica/runner/trust_store.py`: jedina validacija i kanonizacija P-256 SPKI bajtova; vraca trust-store put i javni fingerprint.
- `BUILD_LEKTA_REPAIR_RUNNER.ps1`: koristi rezultat istog trust-store poziva i zapisuje manifest v2 bez paralelne kriptografske implementacije u PowerShellu.
- `tests/unit/test_lekta_runner_trust_store.py`: dokazuje DER SPKI kanonizaciju, stabilnost kroz razlicite PEM tekstove i razlicitost drugog kljuca.
- `tests/unit/test_lekta_runner_release_build.py`: cuva manifest v2 i tocno prosljedjivanje fingerprinta iz Python helpera.

### Lekta (`lekta-repair-current` izolirani checkout)

- `scripts/local-repair-release-gate.mts`: parser manifesta v2, P-256 PKCS#8 provjera i trostruko vezanje privatni kljuc / neovisni fingerprint / manifest.
- `scripts/local-repair-secret-staging.mts`: jedina odgovornost za privremeni env-file, dozvole, jednu Supabase secrets naredbu, redakciju i cleanup.
- `scripts/run-local-repair-release.mts`: cita operatorove ulaze, uklanja privatni release env iz svih child procesa i orkestrira disabled-first/kill-switch-last release.
- `scripts/repair-runner-e2e-diagnostics.mts`: proizvodi valjani v2 unsigned-production preflight fixture bez oslabljenja Authenticode gatea.
- `scripts/run-repair-runner-e2e.mts`: u stvarnom E2E-u prosljedjuje privatni testni kljuc i SHA-256 njegovog SPKI-a u novi preflight.
- `tests/repair-local-release-gate.test.ts`: cuva v2 shemu, P-256 key-pair binding i izlaz bez privatnih bajtova.
- `tests/repair-local-secret-staging.test.ts`: cuva argumente bez tajni, sadrzaj datoteke, dozvole, redakciju i cleanup.
- `tests/repair-local-release-cli.test.ts`: cuva env ugovor, plan faza, fail-stop izvrsavanje i child-env sanitizaciju.
- `tests/repair-local-release-entrypoint.test.ts`: stvarni CLI i dalje dolazi do prvog stvarnog lokalnog kvara s potpuno valjanim key-binding ulazom.
- `tests/repair-runner-executable-e2e.test.ts`: unsigned dev runner dolazi do Authenticode odbijanja tek nakon prolaska v2 key bindinga.
- `.env.example`, `docs/LOCAL_REPAIR_RELEASE.md`, `tests/release-env-documented.test.ts`: operatoru daju potpuni, provjerljiv popis ulaza i stvarni sigurni redoslijed.

## Execution Preflight

- [ ] **Step 1: Ponovno procitaj oba repo ugovora prije produkcijskog rada**

Read completely:

```text
C:\WordReplica-Automation\repo\AGENTS.md
<Lekta checkout>\AGENTS.md
<Lekta checkout>\CLAUDE.md
docs/superpowers/specs/2026-09-11-lekta-wordreplica-release-key-binding-design.md
```

- [ ] **Step 2: Potvrdi izolaciju i grane**

Run in WordReplica:

```powershell
git branch --show-current
git status --short
```

Expected: `automation-dev`; ne nastavljati ako postoje nepovezane promjene koje se preklapaju s datotekama plana.

Run in Lekta:

```powershell
git branch --show-current
git status --short
```

Expected: `feature/repair-contract-v1-current-v2` i cisto stablo.

- [ ] **Step 3: Snimi pocetne identitete bez promjene repozitorija**

```powershell
git rev-parse HEAD
```

Zapisati oba puna SHA-a u radne biljeske; kasniji E2E izvjestaji moraju imenovati zavrsne, a ne ove pocetne commitove.

---

### Task 1: WordReplica canonical SPKI fingerprint and manifest v2

**Repository:** `C:\WordReplica-Automation\repo` on `automation-dev`.

**Files:**
- Modify: `src/word_replica/runner/trust_store.py:1-101`
- Modify: `BUILD_LEKTA_REPAIR_RUNNER.ps1:37-58`
- Modify: `BUILD_LEKTA_REPAIR_RUNNER.ps1:183-199`
- Test: `tests/unit/test_lekta_runner_trust_store.py`
- Test: `tests/unit/test_lekta_runner_release_build.py`

**Interfaces:**
- Produces: `canonical_p256_spki_sha256(der: bytes) -> str`.
- Produces: `PreparedReleaseTrustStore(path: Path, contract_public_key_sha256: str)`.
- Changes: `prepare_release_trust_store(...) -> PreparedReleaseTrustStore`.
- Produces manifest fields: `schemaVersion: 2` and `contractPublicKeySha256: str`.
- Preserves: runtime `trusted_keys.json` schema version 1 and `load_trust_keys(path) -> dict[str, bytes]`.

- [ ] **Step 1: Write RED tests for canonical fingerprinting**

Add imports and tests to `tests/unit/test_lekta_runner_trust_store.py`:

```python
from hashlib import sha256

from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.serialization import (
    Encoding,
    PublicFormat,
    load_der_public_key,
    load_pem_public_key,
)


def test_release_key_fingerprint_is_canonical_der_spki_sha256(tmp_path: Path) -> None:
    spki_text = (FIXTURE_DIR / "public-key.spki.b64url").read_text(encoding="utf-8").strip()
    der = decode_spki(spki_text)
    prepared = trust_store_module.prepare_release_trust_store(
        public_key_path=FIXTURE_DIR / "public-key.spki.b64url",
        key_id="lekta-prod-test",
        destination=tmp_path / "trusted_keys.json",
    )

    assert prepared.contract_public_key_sha256 == sha256(der).hexdigest()
    assert prepared.path == tmp_path / "trusted_keys.json"


def test_fingerprint_ignores_pem_text_format_but_changes_for_another_key() -> None:
    fixture_der = decode_spki(
        (FIXTURE_DIR / "public-key.spki.b64url").read_text(encoding="utf-8").strip()
    )
    fixture_key = load_der_public_key(fixture_der)
    pem_lf = fixture_key.public_bytes(Encoding.PEM, PublicFormat.SubjectPublicKeyInfo)
    pem_crlf = pem_lf.replace(b"\n", b"\r\n")
    fingerprints = []
    for pem in (pem_lf, pem_crlf):
        parsed = load_pem_public_key(pem)
        canonical_der = parsed.public_bytes(Encoding.DER, PublicFormat.SubjectPublicKeyInfo)
        fingerprints.append(trust_store_module.canonical_p256_spki_sha256(canonical_der))

    other_der = ec.generate_private_key(ec.SECP256R1()).public_key().public_bytes(
        Encoding.DER,
        PublicFormat.SubjectPublicKeyInfo,
    )
    assert fingerprints == [sha256(fixture_der).hexdigest()] * 2
    assert trust_store_module.canonical_p256_spki_sha256(other_der) != fingerprints[0]
    assert sha256(pem_lf).hexdigest() != fingerprints[0]
```

Update the existing preparation assertion from `result == destination` to:

```python
assert result.path == destination
assert result.contract_public_key_sha256 == sha256(decode_spki(spki)).hexdigest()
```

- [ ] **Step 2: Write RED tests for manifest v2**

Extend `tests/unit/test_lekta_runner_release_build.py`:

```python
def test_release_script_emits_contract_public_key_fingerprint_in_manifest_v2() -> None:
    script = (ROOT / "BUILD_LEKTA_REPAIR_RUNNER.ps1").read_text(encoding="utf-8")

    assert "schemaVersion = 2" in script
    assert "contractPublicKeySha256 = $contractPublicKeySha256" in script
    assert "prepared.contract_public_key_sha256" in script
    assert "schemaVersion = 1" not in script
```

In `test_release_script_prepares_the_runtime_trust_asset`, calculate the expected fixture hash and require it in stdout:

```python
expected = sha256(decode_spki(spki)).hexdigest()
assert f"Public key SHA-256: {expected}" in completed.stdout
```

- [ ] **Step 3: Run focused tests and verify RED**

```powershell
C:\WordReplica-Automation\.venv\Scripts\python.exe -m pytest tests/unit/test_lekta_runner_trust_store.py tests/unit/test_lekta_runner_release_build.py -q -p no:cacheprovider
```

Expected: FAIL because `PreparedReleaseTrustStore`, `canonical_p256_spki_sha256`, manifest schema 2 and `contractPublicKeySha256` do not exist.

- [ ] **Step 4: Implement one canonical P-256 SPKI path**

In `trust_store.py`, add the focused value object and canonical helper, then make both load and release preparation use the same validator:

```python
import base64
from dataclasses import dataclass
from hashlib import sha256

from cryptography.hazmat.primitives.serialization import (
    Encoding,
    PublicFormat,
    load_der_public_key,
)


@dataclass(frozen=True)
class PreparedReleaseTrustStore:
    path: Path
    contract_public_key_sha256: str


def _canonical_p256_spki(der: bytes) -> bytes:
    try:
        public_key = load_der_public_key(der)
    except Exception as exc:
        raise RunnerTrustError("invalid runner trust public key") from exc
    if not isinstance(public_key, ec.EllipticCurvePublicKey) or not isinstance(
        public_key.curve, ec.SECP256R1
    ):
        raise RunnerTrustError("runner trust key is not P-256")
    return public_key.public_bytes(Encoding.DER, PublicFormat.SubjectPublicKeyInfo)


def canonical_p256_spki_sha256(der: bytes) -> str:
    return sha256(_canonical_p256_spki(der)).hexdigest()
```

Within `load_trust_keys`, replace its separate `load_der_public_key` block with:

```python
try:
    der = _canonical_p256_spki(decode_spki(encoded))
except RunnerTrustError:
    raise
except Exception as exc:
    raise RunnerTrustError("invalid runner trust public key") from exc
trusted[key_id] = der
```

Replace `prepare_release_trust_store` with the complete canonicalizing implementation below. This preserves the existing atomic write/fsync/validation/replace behavior while changing the return value and ensuring the trust-store bytes and manifest fingerprint come from the same canonical DER value:

```python
def prepare_release_trust_store(
    *,
    public_key_path: Path,
    key_id: str,
    destination: Path,
) -> PreparedReleaseTrustStore:
    """Atomically prepare the public-only trust asset for a portable release."""
    if not isinstance(key_id, str) or not _KEY_ID.fullmatch(key_id):
        raise RunnerTrustError("invalid runner trust key id")
    public_key_path = Path(public_key_path)
    destination = Path(destination)
    try:
        spki = public_key_path.read_text(encoding="utf-8").strip()
        canonical_der = _canonical_p256_spki(decode_spki(spki))
    except RunnerTrustError:
        raise
    except (OSError, UnicodeDecodeError, ValueError) as exc:
        raise RunnerTrustError("runner trust public key is unavailable or invalid") from exc

    canonical_spki = base64.urlsafe_b64encode(canonical_der).rstrip(b"=").decode("ascii")
    fingerprint = sha256(canonical_der).hexdigest()
    payload = json.dumps(
        {
            "version": 1,
            "keys": [{"keyId": key_id, "spkiBase64Url": canonical_spki}],
        },
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")
    destination.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(
        prefix="trusted-keys-", suffix=".json.tmp", dir=destination.parent,
    )
    temporary = Path(temporary_name)
    try:
        with os.fdopen(descriptor, "wb") as target:
            target.write(payload)
            target.flush()
            os.fsync(target.fileno())
        load_trust_keys(temporary)
        os.replace(temporary, destination)
    except Exception:
        temporary.unlink(missing_ok=True)
        raise
    return PreparedReleaseTrustStore(
        path=destination,
        contract_public_key_sha256=fingerprint,
    )
```

- [ ] **Step 5: Make PowerShell consume the Python result**

Change `$prepareCode` so it emits only the computed public fingerprint:

```python
prepared = prepare_release_trust_store(
    public_key_path=Path(sys.argv[1]),
    key_id=sys.argv[2],
    destination=Path(sys.argv[3]),
)
print(prepared.contract_public_key_sha256)
```

Capture and validate it in PowerShell:

```powershell
$contractPublicKeySha256 = (& $RunnerPythonPath -c $prepareCode $resolvedPublicKey $KeyId $resolvedTrustStore).Trim().ToLowerInvariant()
if ($LASTEXITCODE -ne 0) {
    throw 'Priprema javnog runner trust storea nije uspjela.'
}
if ($contractPublicKeySha256 -notmatch '^[a-f0-9]{64}$') {
    throw 'Otisak javnog Repair Contract kljuca nije valjan.'
}

if ($PrepareOnly) {
    Write-Host "Prepared: $resolvedTrustStore"
    Write-Host "Public key SHA-256: $contractPublicKeySha256"
    exit 0
}
```

Change the manifest fragment to:

```powershell
$manifest = [ordered]@{
    schemaVersion = 2
    fileName = $runnerFile.Name
    sha256 = $artifactHash
    sizeBytes = $runnerFile.Length
    contractKeyId = $KeyId
    contractPublicKeySha256 = $contractPublicKeySha256
    signingCertificateThumbprint = $normalizedThumbprint
    timestampServer = $TimestampServer
    engineVersion = $engineVersion
    sourceCommit = $sourceCommit
    sourceBranch = $sourceBranch
    sourceTreeClean = $true
}
```

- [ ] **Step 6: Run focused tests and verify GREEN**

```powershell
C:\WordReplica-Automation\.venv\Scripts\python.exe -m pytest tests/unit/test_lekta_runner_trust_store.py tests/unit/test_lekta_runner_release_build.py -q -p no:cacheprovider
```

Expected: PASS.

- [ ] **Step 7: Run the complete WordReplica regression suite**

```powershell
C:\WordReplica-Automation\.venv\Scripts\python.exe -m pytest -q -p no:cacheprovider --basetemp C:\WordReplica-Automation\diagnostics\pytest-release-key-binding
```

Expected: exit 0 with no failed test.

- [ ] **Step 8: Run the real Word Golden before checkpointing**

```powershell
.\RUN_GOLDEN_CODEX.ps1
```

Read the printed `golden_report.json` directly under `C:\WordReplica-Automation\diagnostics\golden_1`, require unchanged Golden source SHA-256, no previously passing G0-G9 regression and no unexplained Word ownership change. Stop immediately on the AGENTS.md fail-safe conditions.

- [ ] **Step 9: Commit the independently testable WordReplica producer**

```powershell
git diff --check
git status --short
git add src/word_replica/runner/trust_store.py BUILD_LEKTA_REPAIR_RUNNER.ps1 tests/unit/test_lekta_runner_trust_store.py tests/unit/test_lekta_runner_release_build.py
git diff --cached
git commit --only src/word_replica/runner/trust_store.py BUILD_LEKTA_REPAIR_RUNNER.ps1 tests/unit/test_lekta_runner_trust_store.py tests/unit/test_lekta_runner_release_build.py -m "feat: bind runner manifest to contract key"
```

- [ ] **Step 10: Confirm Golden twice on the exact WordReplica commit, then push**

Run twice without changing files or commit:

```powershell
.\RUN_GOLDEN_CODEX.ps1
.\RUN_GOLDEN_CODEX.ps1
```

Read both new reports. Require G0-G9 `FULL PASS`, identical source SHA-256, identical WordReplica commit and identical Word build; the second report must say `automation_decision.promotion_ready=true`. Then:

```powershell
git push origin automation-dev
```

Do not promote to `main`.

---

### Task 2: Lekta manifest v2 parser and private/public key binding

**Repository:** Lekta isolated checkout on `feature/repair-contract-v1-current-v2`.

**Files:**
- Modify: `scripts/local-repair-release-gate.mts:1-238`
- Modify: `tests/repair-local-release-gate.test.ts:1-192`

**Interfaces:**
- Adds input: `expectedContractPublicKeySha256: string`.
- Adds input: `contractPrivateKeyPkcs8Base64Url: string`.
- Adds verified output: `contractPublicKeySha256: string`.
- Produces: `deriveContractPublicKeySha256(privateKeyPkcs8Base64Url: string) -> string`.
- Changes `RunnerManifest.schemaVersion` acceptance from 1 to exactly 2 and requires `contractPublicKeySha256`.

- [ ] **Step 1: Convert the valid fixture to a real P-256 pair**

In `tests/repair-local-release-gate.test.ts`, add:

```typescript
import { createHash, generateKeyPairSync } from 'node:crypto';

function createContractKeyFixture() {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const privateKeyPkcs8Base64Url = privateKey
    .export({ format: 'der', type: 'pkcs8' })
    .toString('base64url');
  const publicSpki = publicKey.export({ format: 'der', type: 'spki' });
  return {
    privateKeyPkcs8Base64Url,
    publicKeySha256: createHash('sha256').update(publicSpki).digest('hex'),
  };
}

const CONTRACT_KEY = createContractKeyFixture();
```

Set fixture `schemaVersion: 2`, add `contractPublicKeySha256` to `ManifestFixture`, manifest JSON and `validReleaseInput`, and include both new input fields.

- [ ] **Step 2: Write RED key-binding cases**

Add these focused cases:

```typescript
it('odbija manifest v1 i v2 manifest bez javnog fingerprinta', () => {
  const root = mkdtempSync(join(tmpdir(), 'lekta-release-manifest-v2-'));
  expect(() => verifyLocalRepairRelease(validReleaseInput(fixture(root, {
    schemaVersion: 1,
  })))).toThrow(/schemaVersion/i);

  const missing = fixture(mkdtempSync(join(tmpdir(), 'lekta-release-manifest-fingerprint-')), {
    contractPublicKeySha256: undefined as never,
  });
  expect(() => verifyLocalRepairRelease(validReleaseInput(missing))).toThrow(/javni.*otisak|fingerprint/i);
});

it('odbija privatni kljuc koji ne odgovara manifestu i neovisnom otisku', () => {
  const other = createContractKeyFixture();
  const paths = fixture(mkdtempSync(join(tmpdir(), 'lekta-release-wrong-private-')));
  expect(() => verifyLocalRepairRelease({
    ...validReleaseInput(paths),
    contractPrivateKeyPkcs8Base64Url: other.privateKeyPkcs8Base64Url,
  })).toThrow(/privatni.*javni.*kljuc|otisak/i);
});

it.each(['abc=', 'not base64url!', ''])('odbija nekanonski PKCS8 ulaz %j', (value) => {
  const paths = fixture(mkdtempSync(join(tmpdir(), 'lekta-release-bad-pkcs8-')));
  expect(() => verifyLocalRepairRelease({
    ...validReleaseInput(paths),
    contractPrivateKeyPkcs8Base64Url: value,
  })).toThrow(/PKCS8|privatni/i);
});

it('vraca samo javni identitet, nikad privatni kljuc', () => {
  const paths = fixture(mkdtempSync(join(tmpdir(), 'lekta-release-public-output-')));
  const verified = verifyLocalRepairRelease(validReleaseInput(paths));
  expect(verified.contractPublicKeySha256).toBe(CONTRACT_KEY.publicKeySha256);
  expect(JSON.stringify(verified)).not.toContain(CONTRACT_KEY.privateKeyPkcs8Base64Url);
});
```

Add the non-EC key case explicitly:

```typescript
it('odbija valjani PKCS8 kljuc koji nije P-256', () => {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const paths = fixture(mkdtempSync(join(tmpdir(), 'lekta-release-rsa-private-')));
  expect(() => verifyLocalRepairRelease({
    ...validReleaseInput(paths),
    contractPrivateKeyPkcs8Base64Url: privateKey
      .export({ format: 'der', type: 'pkcs8' })
      .toString('base64url'),
  })).toThrow(/P-256/i);
});
```

- [ ] **Step 3: Run the gate test and verify RED**

```powershell
npm test -- --run tests/repair-local-release-gate.test.ts
```

Expected: FAIL because v2 and the new fields are unsupported.

- [ ] **Step 4: Implement strict PKCS#8-to-SPKI derivation**

At the top of `local-repair-release-gate.mts` use Node crypto only:

```typescript
import { createHash, createPrivateKey, createPublicKey } from 'node:crypto';

function decodeCanonicalBase64Url(value: string): Buffer {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) fail('privatni Repair Contract kljuc nije kanonski base64url.');
  const bytes = Buffer.from(value, 'base64url');
  if (bytes.length === 0 || bytes.toString('base64url') !== value) {
    fail('privatni Repair Contract kljuc nije kanonski base64url.');
  }
  return bytes;
}

export function deriveContractPublicKeySha256(privateKeyPkcs8Base64Url: string): string {
  try {
    const privateKey = createPrivateKey({
      key: decodeCanonicalBase64Url(privateKeyPkcs8Base64Url),
      format: 'der',
      type: 'pkcs8',
    });
    const publicKey = createPublicKey(privateKey);
    const jwk = publicKey.export({ format: 'jwk' });
    if (jwk.kty !== 'EC' || jwk.crv !== 'P-256') {
      fail('privatni Repair Contract kljuc nije P-256.');
    }
    const spki = publicKey.export({ format: 'der', type: 'spki' });
    return createHash('sha256').update(spki).digest('hex');
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Local repair release odbijen:')) throw error;
    fail('privatni Repair Contract kljuc nije valjani PKCS8 P-256 kljuc.');
  }
}
```

Update `RunnerManifest`, `LocalRepairReleaseInput` and `VerifiedLocalRepairRelease` with the exact fields listed under Interfaces. `loadManifest` must require `schemaVersion === 2` and lowercase `/^[a-f0-9]{64}$/` for `contractPublicKeySha256`.

Before artifact hashing in `verifyLocalRepairRelease`, normalize and compare:

```typescript
const expectedContractPublicKeySha256 = input.expectedContractPublicKeySha256?.trim().toLowerCase();
if (!/^[a-f0-9]{64}$/.test(expectedContractPublicKeySha256)) {
  fail('nije konfiguriran valjan ocekivani javni Repair Contract key fingerprint.');
}
const derivedContractPublicKeySha256 = deriveContractPublicKeySha256(
  input.contractPrivateKeyPkcs8Base64Url,
);
if (manifest.contractPublicKeySha256 !== expectedContractPublicKeySha256
    || derivedContractPublicKeySha256 !== expectedContractPublicKeySha256) {
  fail('privatni i javni Repair Contract kljuc ne odgovaraju manifestu i ocekivanom otisku.');
}
```

Return only `contractPublicKeySha256: derivedContractPublicKeySha256`; never return the private input.

- [ ] **Step 5: Run the gate test and verify GREEN**

```powershell
npm test -- --run tests/repair-local-release-gate.test.ts
```

Expected: PASS.

Do not commit yet; Lekta checkpoint follows one complete `npm run check` after Tasks 2-5.

---

### Task 3: Restricted one-command Supabase secret staging

**Files:**
- Create: `scripts/local-repair-secret-staging.mts`
- Create: `tests/repair-local-secret-staging.test.ts`

**Interfaces:**
- Produces: `stageLocalRepairSecrets(input: LocalRepairSecretStagingInput, dependencies?: LocalRepairSecretStagingDependencies) -> void`.
- Callback: `runSupabase(args: readonly string[]) -> void`, invoked exactly once per staging call.
- Produces: `redactLocalRepairSecretText(value: string, sensitiveValues: readonly string[]) -> string`.
- Produces no stdout/stderr and returns no secret or temporary path.

- [ ] **Step 1: Write RED staging tests**

Create `tests/repair-local-secret-staging.test.ts` with these cases:

```typescript
import { existsSync, mkdtempSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import {
  buildWindowsAclArguments,
  stageLocalRepairSecrets,
} from '../scripts/local-repair-secret-staging';

const PROJECT_REF = 'zrrjttizjyfcxmcpgzml';
const PRIVATE_KEY = 'private_key_fixture_without_padding';

it('predaje vrijednosti samo kroz ograniceni env-file i brise ga nakon jedne naredbe', () => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'lekta-secret-test-root-'));
  let observedPath = '';
  let observed = '';
  const hardenPath = vi.fn();
  const runSupabase = vi.fn((args: readonly string[]) => {
    expect(args.slice(0, 2)).toEqual(['secrets', 'set']);
    expect(args).toContain('--env-file');
    expect(args).toContain('--project-ref');
    observedPath = args[args.indexOf('--env-file') + 1];
    observed = readFileSync(observedPath, 'utf8');
    expect(dirname(dirname(observedPath))).toBe(temporaryRoot);
  });

  stageLocalRepairSecrets({
    projectRef: PROJECT_REF,
    temporaryRoot,
    secrets: {
      REPAIR_CONTRACT_PRIVATE_KEY_PKCS8_B64URL: PRIVATE_KEY,
      REPAIR_LOCAL_DISABLED: 'true',
    },
    runSupabase,
  }, { hardenPath });

  expect(runSupabase).toHaveBeenCalledTimes(1);
  expect(observed).toBe(
    `REPAIR_CONTRACT_PRIVATE_KEY_PKCS8_B64URL=${PRIVATE_KEY}\nREPAIR_LOCAL_DISABLED=true\n`,
  );
  expect(JSON.stringify(runSupabase.mock.calls[0][0])).not.toContain(PRIVATE_KEY);
  expect(hardenPath).toHaveBeenCalledTimes(2);
  expect(existsSync(observedPath)).toBe(false);
});

it('redigira privatni kljuc i privremenu putanju te cisti nakon pada callbacka', () => {
  let envFilePath = '';
  expect(() => stageLocalRepairSecrets({
    projectRef: PROJECT_REF,
    secrets: { REPAIR_CONTRACT_PRIVATE_KEY_PKCS8_B64URL: PRIVATE_KEY },
    runSupabase(args) {
      envFilePath = args[args.indexOf('--env-file') + 1];
      throw new Error(`CLI leaked ${PRIVATE_KEY} from ${envFilePath}`);
    },
  }, { hardenPath() {} })).toThrow(/\[REDACTED\]/);
  expect(existsSync(envFilePath)).toBe(false);
  try {
    stageLocalRepairSecrets({
      projectRef: PROJECT_REF,
      secrets: { REPAIR_CONTRACT_PRIVATE_KEY_PKCS8_B64URL: PRIVATE_KEY },
      runSupabase() { throw new Error(PRIVATE_KEY); },
    }, { hardenPath() {} });
  } catch (error) {
    expect(String(error)).not.toContain(PRIVATE_KEY);
    expect(String(error)).not.toContain(envFilePath);
  }
});
```

Add the remaining fail-closed and permission tests exactly:

```typescript
it.each(['line1\nline2', 'nul\0value'])('odbija newline ili NUL prije stvaranja datoteke: %j', (value) => {
  const runSupabase = vi.fn();
  const hardenPath = vi.fn();
  expect(() => stageLocalRepairSecrets({
    projectRef: PROJECT_REF,
    secrets: { REPAIR_LOCAL_DISABLED: value },
    runSupabase,
  }, { hardenPath })).toThrow(/Nevaljana vrijednost/);
  expect(hardenPath).not.toHaveBeenCalled();
  expect(runSupabase).not.toHaveBeenCalled();
});

it('ne pokrece Supabase ako ogranicavanje pristupa ne uspije', () => {
  const runSupabase = vi.fn();
  expect(() => stageLocalRepairSecrets({
    projectRef: PROJECT_REF,
    secrets: { REPAIR_LOCAL_DISABLED: 'true' },
    runSupabase,
  }, {
    hardenPath() { throw new Error('ACL failure'); },
  })).toThrow(/ACL failure/);
  expect(runSupabase).not.toHaveBeenCalled();
});

it('cleanup kvar zaustavlja release nakon uspjesnog callbacka', () => {
  const runSupabase = vi.fn();
  expect(() => stageLocalRepairSecrets({
    projectRef: PROJECT_REF,
    secrets: { REPAIR_LOCAL_DISABLED: 'true' },
    runSupabase,
  }, {
    hardenPath() {},
    removeDirectory() { throw new Error('cleanup failure'); },
  })).toThrow(/cleanup failure/);
  expect(runSupabase).toHaveBeenCalledTimes(1);
});

it.skipIf(process.platform === 'win32')('postavlja POSIX 0700 i 0600 prije callbacka', () => {
  stageLocalRepairSecrets({
    projectRef: PROJECT_REF,
    secrets: { REPAIR_LOCAL_DISABLED: 'true' },
    runSupabase(args) {
      const envFilePath = args[args.indexOf('--env-file') + 1];
      expect(statSync(dirname(envFilePath)).mode & 0o777).toBe(0o700);
      expect(statSync(envFilePath).mode & 0o777).toBe(0o600);
    },
  });
});

it('gradi Windows ACL samo iz stabilnih SID identiteta', () => {
  expect(buildWindowsAclArguments(
    'C:\\Temp\\repair.env',
    'directory',
    'S-1-5-21-1000',
  )).toEqual([
    'C:\\Temp\\repair.env',
    '/inheritance:r',
    '/grant:r',
    '*S-1-5-21-1000:(OI)(CI)(F)',
    '*S-1-5-18:(OI)(CI)(F)',
    '*S-1-5-32-544:(OI)(CI)(F)',
  ]);
});
```

- [ ] **Step 2: Run the new test and verify RED**

```powershell
npm test -- --run tests/repair-local-secret-staging.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the focused helper**

Use this public shape in `scripts/local-repair-secret-staging.mts`:

```typescript
export interface LocalRepairSecretStagingInput {
  projectRef: string;
  secrets: Readonly<Record<string, string>>;
  runSupabase: (args: readonly string[]) => void;
  temporaryRoot?: string;
}

export interface LocalRepairSecretStagingDependencies {
  hardenPath: (path: string, kind: 'directory' | 'file') => void;
  removeDirectory: (path: string) => void;
}

export function buildWindowsAclArguments(
  path: string,
  kind: 'directory' | 'file',
  currentSid: string,
): string[] {
  const grants = kind === 'directory'
    ? [`*${currentSid}:(OI)(CI)(F)`, '*S-1-5-18:(OI)(CI)(F)', '*S-1-5-32-544:(OI)(CI)(F)']
    : [`*${currentSid}:(F)`, '*S-1-5-18:(F)', '*S-1-5-32-544:(F)'];
  return [path, '/inheritance:r', '/grant:r', ...grants];
}

export function redactLocalRepairSecretText(
  value: string,
  sensitiveValues: readonly string[],
): string {
  return sensitiveValues
    .filter(Boolean)
    .sort((left, right) => right.length - left.length)
    .reduce((redacted, secret) => redacted.split(secret).join('[REDACTED]'), value);
}
```

Use these imports and default dependency:

```typescript
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  chmodSync, closeSync, fsyncSync, mkdtempSync, openSync, rmSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function hardenLocalRepairSecretPath(path: string, kind: 'directory' | 'file'): void {
  if (process.platform !== 'win32') {
    chmodSync(path, kind === 'directory' ? 0o700 : 0o600);
    return;
  }
  const whoami = spawnSync('whoami.exe', ['/user', '/fo', 'csv', '/nh'], {
    encoding: 'utf8', windowsHide: true,
  });
  const currentSid = /"[^"]*","(S-\d(?:-\d+)+)"/.exec(whoami.stdout.trim())?.[1];
  if (whoami.status !== 0 || !currentSid) {
    throw new Error('Nije moguce odrediti SID trenutnog korisnika.');
  }
  const acl = spawnSync(
    'icacls.exe',
    buildWindowsAclArguments(path, kind, currentSid),
    { encoding: 'utf8', windowsHide: true },
  );
  if (acl.status !== 0) {
    throw new Error('Ogranicavanje ACL-a privremene secret datoteke nije uspjelo.');
  }
}

const DEFAULT_DEPENDENCIES: LocalRepairSecretStagingDependencies = {
  hardenPath: hardenLocalRepairSecretPath,
  removeDirectory(path) { rmSync(path, { recursive: true, force: false }); },
};
```

Implement `stageLocalRepairSecrets` as one bounded create/harden/write/callback/cleanup operation. Validate every value before creating the temporary directory:

```typescript
export function stageLocalRepairSecrets(
  input: LocalRepairSecretStagingInput,
  dependencies: Partial<LocalRepairSecretStagingDependencies> = {},
): void {
  const resolved = { ...DEFAULT_DEPENDENCIES, ...dependencies };
  const entries = Object.entries(input.secrets)
    .sort(([left], [right]) => left.localeCompare(right));
  for (const [name, value] of entries) {
    if (!/^[A-Z][A-Z0-9_]*$/.test(name)) throw new Error('Nevaljan naziv Supabase tajne.');
    if (!value || /[\r\n\0]/.test(value)) {
      throw new Error(`Nevaljana vrijednost Supabase tajne ${name}.`);
    }
  }

  let directory = '';
  let envFilePath = '';
  let failure: Error | undefined;
  const redact = (error: unknown) => redactLocalRepairSecretText(
    String(error),
    [...Object.values(input.secrets), directory, envFilePath],
  );
  try {
    directory = mkdtempSync(join(input.temporaryRoot ?? tmpdir(), 'lekta-repair-secrets-'));
    resolved.hardenPath(directory, 'directory');
    envFilePath = join(directory, `repair-secrets-${randomUUID()}.env`);
    const descriptor = openSync(envFilePath, 'wx', 0o600);
    try {
      writeFileSync(
        descriptor,
        `${entries.map(([name, value]) => `${name}=${value}`).join('\n')}\n`,
      );
      fsyncSync(descriptor);
    } finally {
      closeSync(descriptor);
    }
    resolved.hardenPath(envFilePath, 'file');
    input.runSupabase([
      'secrets', 'set', '--env-file', envFilePath,
      '--project-ref', input.projectRef,
    ]);
  } catch (error) {
    failure = new Error(redact(error));
  } finally {
    if (directory) {
      try {
        resolved.removeDirectory(directory);
      } catch (error) {
        const cleanupFailure = redact(error);
        failure = new Error(failure
          ? `${failure.message}; cleanup: ${cleanupFailure}`
          : cleanupFailure);
      }
    }
  }
  if (failure) throw failure;
}
```

The helper must not call `console.log`, `process.stdout.write` or `process.stderr.write`.

- [ ] **Step 4: Run staging tests and verify GREEN**

```powershell
npm test -- --run tests/repair-local-secret-staging.test.ts
```

Expected: PASS.

Do not commit yet.

---

### Task 4: Disabled-first, kill-switch-last release orchestration

**Files:**
- Modify: `scripts/local-repair-release-gate.mts:225-238`
- Modify: `scripts/run-local-repair-release.mts:34-352`
- Modify: `tests/repair-local-release-cli.test.ts:17-52`
- Modify: `tests/repair-local-release-cli.test.ts:666-722`

**Interfaces:**
- Adds env input: `LEKTA_REPAIR_EXPECTED_CONTRACT_PUBLIC_KEY_SHA256`.
- Adds secret env input: `LEKTA_REPAIR_CONTRACT_PRIVATE_KEY_PKCS8_B64URL`.
- Produces: `buildLocalRepairChildEnvironment(source: NodeJS.ProcessEnv) -> NodeJS.ProcessEnv`.
- Produces internal secret phases: `guard-disabled`, `disabled-config`, `enabled-guarded`, `activate`.
- Extends `LocalRepairDeploymentInput` with `contractKeyId` and `contractPrivateKeyPkcs8Base64Url`.

- [ ] **Step 1: Write RED trust-policy and child-env tests**

Extend the first CLI test so missing values fail in this order after the existing key ID:

```typescript
expect(() => readLocalRepairReleaseTrustPolicy({
  LEKTA_REPAIR_EXPECTED_PUBLISHER_THUMBPRINT: 'AA'.repeat(20),
  LEKTA_REPAIR_EXPECTED_CONTRACT_KEY_ID: 'lekta-prod-2026-01',
})).toThrow(/LEKTA_REPAIR_EXPECTED_CONTRACT_PUBLIC_KEY_SHA256/);
```

A complete input must include both new values and return the private key separately from the public trust policy. Add:

```typescript
it('uklanja privatni release kljuc iz svakog child environmenta', () => {
  expect(releaseCli.buildLocalRepairChildEnvironment({
    PATH: 'C:\\Windows',
    LEKTA_REPAIR_CONTRACT_PRIVATE_KEY_PKCS8_B64URL: 'secret-private-key',
    REPAIR_CONTRACT_PRIVATE_KEY_PKCS8_B64URL: 'runtime-secret',
  })).toEqual({ PATH: 'C:\\Windows' });
});
```

- [ ] **Step 2: Write RED deterministic release-plan test**

Replace the old command list assertion with this exact public plan:

```typescript
expect(buildLocalRepairDeploymentPlan()).toEqual([
  ['supabase', 'link', '--project-ref', EXPECTED_SUPABASE_PROJECT_REF, '--yes'],
  ['npm', 'run', 'check:repair-integration'],
  ['netlify', 'build'],
  ['node', 'scripts/verify-deploy-dist.mjs'],
  ['internal', 'stage-local-repair-secrets', 'guard-disabled', 'REPAIR_LOCAL_DISABLED'],
  ['internal', 'stage-local-repair-secrets', 'disabled-config',
    'REPAIR_CONTRACT_PRIVATE_KEY_PKCS8_B64URL', 'REPAIR_CONTRACT_KEY_ID',
    'REPAIR_LOCAL_ENABLED', 'REPAIR_LOCAL_DISABLED'],
  ['internal', 'deploy-local-repair-migrations'],
  ['supabase', 'functions', 'deploy', 'repair-local-claim', '--project-ref', EXPECTED_SUPABASE_PROJECT_REF],
  ['supabase', 'functions', 'deploy', 'repair-local-status', '--project-ref', EXPECTED_SUPABASE_PROJECT_REF],
  ['supabase', 'functions', 'deploy', 'repair-docx', '--project-ref', EXPECTED_SUPABASE_PROJECT_REF],
  ['netlify', 'deploy', '--prod', '--dir', 'dist', '--no-build'],
  ['internal', 'stage-local-repair-secrets', 'enabled-guarded',
    'REPAIR_LOCAL_ENABLED', 'REPAIR_LOCAL_DISABLED'],
  ['internal', 'stage-local-repair-secrets', 'activate', 'REPAIR_LOCAL_DISABLED'],
]);
```

This splits spec step 4 into a first one-key guard write and a full disabled configuration write. The first remote mutation therefore cannot expose a newly deployed local flow; both writes finish before migrations.

- [ ] **Step 3: Write RED fail-stop execution tests**

Import the executor type alongside the existing `releaseCli` namespace and add this table-driven fail-stop test:

```typescript
import type { LocalRepairDeploymentExecutor } from '../scripts/run-local-repair-release';

const SUCCESS_TRACE = [
  'command:supabase link',
  'assert-linked-project',
  'command:npm run',
  'command:netlify build',
  'stage-runner',
  'command:node scripts/verify-deploy-dist.mjs',
  'secrets:guard-disabled',
  'secrets:disabled-config',
  'migrations',
  'command:supabase functions repair-local-claim',
  'command:supabase functions repair-local-status',
  'command:supabase functions repair-docx',
  'command:netlify deploy',
  'secrets:enabled-guarded',
  'secrets:activate',
];

function commandEvent(command: readonly string[]): string {
  if (command[0] === 'supabase' && command[1] === 'functions') {
    return `command:supabase functions ${command[3]}`;
  }
  return `command:${command[0]} ${command[1]}`;
}

function recordingExecutor(
  trace: string[],
  failAt?: string,
): LocalRepairDeploymentExecutor {
  const record = (event: string) => {
    trace.push(event);
    if (event === failAt) throw new Error(`simulated failure at ${event}`);
  };
  return {
    runCommand(command) { record(commandEvent(command)); },
    assertLinkedProject() { record('assert-linked-project'); },
    stageRunner() { record('stage-runner'); },
    deployMigrations() { record('migrations'); },
    stageSecrets(phase) { record(`secrets:${phase}`); },
  };
}

it('izvrsava disabled-first plan i aktivira tek kao zadnju operaciju', () => {
  const trace: string[] = [];
  releaseCli.executeLocalRepairDeploymentPlan(
    buildLocalRepairDeploymentPlan(),
    recordingExecutor(trace),
  );
  expect(trace).toEqual(SUCCESS_TRACE);
});

it.each(SUCCESS_TRACE.slice(0, -1))(
  'ne aktivira nakon kvara na koraku %s',
  (failAt) => {
    const trace: string[] = [];
    expect(() => releaseCli.executeLocalRepairDeploymentPlan(
      buildLocalRepairDeploymentPlan(),
      recordingExecutor(trace, failAt),
    )).toThrow(/simulated failure/);
    expect(trace).not.toContain('secrets:activate');
  },
);

it('javni plan sadrzi samo nazive tajni, nikad privatnu vrijednost', () => {
  const planJson = JSON.stringify(buildLocalRepairDeploymentPlan());
  expect(planJson).toContain('REPAIR_CONTRACT_PRIVATE_KEY_PKCS8_B64URL');
  expect(planJson).not.toContain('private-key-sentinel');
});
```

Keep the Task 3 assertion that every captured Supabase command contains only `--env-file` and project-ref arguments, never the private key value. The exact public plan assertion in Step 2 proves that plan JSON contains only secret names.

- [ ] **Step 4: Run release CLI tests and verify RED**

```powershell
npm test -- --run tests/repair-local-release-cli.test.ts
```

Expected: FAIL on missing env readers, old ordering, absent secret phases and absent dependency seam.

- [ ] **Step 5: Implement env separation**

Use these exact public shapes in `run-local-repair-release.mts`:

```typescript
export interface LocalRepairReleaseTrustPolicy {
  expectedPublisherThumbprint: string;
  expectedContractKeyId: string;
  expectedContractPublicKeySha256: string;
  reviewedSourceCommit: string;
  reviewedArtifactSha256: string;
}

export interface LocalRepairContractSigningSecret {
  privateKeyPkcs8Base64Url: string;
}

export function readLocalRepairContractSigningSecret(
  env: Record<string, string | undefined> = process.env,
): LocalRepairContractSigningSecret {
  return {
    privateKeyPkcs8Base64Url: requiredEnvironmentValue(
      env,
      'LEKTA_REPAIR_CONTRACT_PRIVATE_KEY_PKCS8_B64URL',
    ),
  };
}

export function buildLocalRepairChildEnvironment(
  source: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv {
  const environment = { ...source };
  delete environment.LEKTA_REPAIR_CONTRACT_PRIVATE_KEY_PKCS8_B64URL;
  delete environment.REPAIR_CONTRACT_PRIVATE_KEY_PKCS8_B64URL;
  return environment;
}
```

Read and lowercase `LEKTA_REPAIR_EXPECTED_CONTRACT_PUBLIC_KEY_SHA256` in `readLocalRepairReleaseTrustPolicy`. Every `spawnSync` in this release module must receive an environment derived from `buildLocalRepairChildEnvironment`; no child inherits the private release input.

- [ ] **Step 6: Implement secret phases and the injectable executor**

Import `stageLocalRepairSecrets`. Extend deployment input:

```typescript
export interface LocalRepairDeploymentInput {
  root?: string;
  artifactPath: string;
  artifactSha256: string;
  publicUrl: string;
  contractKeyId: string;
  contractPrivateKeyPkcs8Base64Url: string;
}
```

Use one closed phase type and private phase mapper:

```typescript
export type LocalRepairSecretPhase =
  | 'guard-disabled'
  | 'disabled-config'
  | 'enabled-guarded'
  | 'activate';

const LOCAL_REPAIR_SECRET_PHASES = new Set<LocalRepairSecretPhase>([
  'guard-disabled',
  'disabled-config',
  'enabled-guarded',
  'activate',
]);

function isLocalRepairSecretPhase(value: string): value is LocalRepairSecretPhase {
  return LOCAL_REPAIR_SECRET_PHASES.has(value as LocalRepairSecretPhase);
}

function secretValuesForPhase(
  phase: LocalRepairSecretPhase,
  input: LocalRepairDeploymentInput,
): Readonly<Record<string, string>> {
  if (phase === 'guard-disabled') return { REPAIR_LOCAL_DISABLED: 'true' };
  if (phase === 'disabled-config') return {
    REPAIR_CONTRACT_PRIVATE_KEY_PKCS8_B64URL: input.contractPrivateKeyPkcs8Base64Url,
    REPAIR_CONTRACT_KEY_ID: input.contractKeyId,
    REPAIR_LOCAL_ENABLED: 'false',
    REPAIR_LOCAL_DISABLED: 'true',
  };
  if (phase === 'enabled-guarded') return {
    REPAIR_LOCAL_ENABLED: 'true',
    REPAIR_LOCAL_DISABLED: 'true',
  };
  if (phase === 'activate') return { REPAIR_LOCAL_DISABLED: 'false' };
  throw new Error(`Nepoznata local-repair secret faza: ${phase}`);
}
```

Add this narrow public executor seam. It isolates only the deterministic deployment plan; local cryptographic verification and remote preflight remain in `mainLocalRepairRelease` and `executeLocalRepairDeployment` respectively:

```typescript
export interface LocalRepairDeploymentExecutor {
  runCommand(command: readonly string[]): void;
  assertLinkedProject(): void;
  stageRunner(): void;
  deployMigrations(): void;
  stageSecrets(phase: LocalRepairSecretPhase, secretNames: readonly string[]): void;
}

export function executeLocalRepairDeploymentPlan(
  plan: readonly (readonly string[])[],
  executor: LocalRepairDeploymentExecutor,
): void {
  let staged = false;
  let verifiedDist = false;
  for (const command of plan) {
    const isDistVerification = command[0] === 'node'
      && command[1] === 'scripts/verify-deploy-dist.mjs';
    if (isDistVerification && !staged) {
      throw new Error('Zavrsna dist provjera odbijena jer runner nije spremljen u dist.');
    }
    if (command[0] === 'netlify' && command[1] === 'deploy'
      && (!staged || !verifiedDist)) {
      throw new Error('Netlify deploy odbijen jer runner nije spremljen i provjeren u dist.');
    }
    if (command[0] === 'internal' && command[1] === 'stage-local-repair-secrets') {
      const phase = command[2];
      if (!isLocalRepairSecretPhase(phase)) {
        throw new Error(`Nepoznata local-repair secret faza: ${phase || '(prazno)'}`);
      }
      executor.stageSecrets(phase, command.slice(3));
      continue;
    }
    if (command[0] === 'internal' && command[1] === 'deploy-local-repair-migrations') {
      executor.deployMigrations();
      continue;
    }
    executor.runCommand(command);
    if (command[0] === 'supabase' && command[1] === 'link') {
      executor.assertLinkedProject();
    }
    if (command[0] === 'netlify' && command[1] === 'build') {
      executor.stageRunner();
      staged = true;
    }
    if (isDistVerification) verifiedDist = true;
  }
}
```

Replace the current loop in `executeLocalRepairDeployment` with this complete adapter. Change `readAndVerifyRemoteRepairDocxBaseline` and `readNetlifyLinkedStatus` to accept `childEnv` and pass it to every internal `spawnSync`:

```typescript
export function executeLocalRepairDeployment(input: LocalRepairDeploymentInput): void {
  const root = input.root || process.cwd();
  assertLocalRepairReleaseSecrets(process.env);
  const childEnv = buildLocalRepairChildEnvironment(process.env);
  readAndVerifyRemoteRepairDocxBaseline(root, childEnv);
  selectNetlifyReleaseAuthorization({
    env: process.env,
    linkedStatus: readNetlifyLinkedStatus(root, childEnv),
  });
  const releaseEnv = buildLocalRepairChildEnvironment({
    ...process.env,
    ...buildRunnerDeploymentEnvironment({
      publicUrl: input.publicUrl,
      sha256: input.artifactSha256,
    }),
  });

  executeLocalRepairDeploymentPlan(buildLocalRepairDeploymentPlan(), {
    runCommand(command) {
      runReleaseCommand([...command], root, releaseEnv);
    },
    assertLinkedProject() {
      assertLinkedProject(root);
    },
    stageRunner() {
      stageVerifiedRunnerArtifact({
        artifactPath: input.artifactPath,
        distDirectory: join(root, 'dist'),
        sha256: input.artifactSha256,
      });
    },
    deployMigrations() {
      executeLocalRepairMigrationWorkspace({
        projectRef: EXPECTED_SUPABASE_PROJECT_REF,
        localMigrationsDirectory: join(root, 'supabase', 'migrations'),
        runSupabase(args, options) {
          const parts = ['supabase', ...args];
          if (options.captureOutput) {
            return { stdout: runReleaseCommandCaptured(parts, root, releaseEnv) };
          }
          runReleaseCommand(parts, root, releaseEnv);
          return {};
        },
      });
    },
    stageSecrets(phase, secretNames) {
      const secrets = secretValuesForPhase(phase, input);
      const expectedNames = [...secretNames].sort();
      const actualNames = Object.keys(secrets).sort();
      if (JSON.stringify(actualNames) !== JSON.stringify(expectedNames)) {
        throw new Error(`Secret plan za fazu ${phase} ne odgovara vrijednostima.`);
      }
      stageLocalRepairSecrets({
        projectRef: EXPECTED_SUPABASE_PROJECT_REF,
        secrets,
        runSupabase(args) {
          const completed = spawnSync(executableFor('supabase', root), [...args], {
            cwd: root,
            env: releaseEnv,
            encoding: 'utf8',
            windowsHide: true,
          });
          if (completed.status !== 0) {
            throw new Error(`Supabase secret faza ${phase} nije uspjela.`);
          }
        },
      });
    },
  });
}
```

Do not print captured stdout/stderr for secret commands. Because the loop is synchronous and has no catch-and-continue path, any thrown executor error stops immediately and leaves `activate` unreachable after every earlier failure.

- [ ] **Step 7: Wire local verification before every remote read/write**

In `mainLocalRepairRelease`:

```typescript
const trustPolicy = readLocalRepairReleaseTrustPolicy();
const signingSecret = readLocalRepairContractSigningSecret();
const verified = verifyLocalRepairRelease({
  artifactPath: options.artifactPath,
  manifestPath: options.manifestPath,
  migrationsDirectory: options.migrationsDirectory,
  projectRef: EXPECTED_SUPABASE_PROJECT_REF,
  authenticode: readAuthenticodeEvidence(options.artifactPath),
  contractPrivateKeyPkcs8Base64Url: signingSecret.privateKeyPkcs8Base64Url,
  ...trustPolicy,
});
```

`verified` is safe to print because it contains only public identities. In execute mode pass the private value directly to `executeLocalRepairDeployment`; never spread it into `releaseEnv`.

- [ ] **Step 8: Run release gate, staging and CLI tests and verify GREEN**

```powershell
npm test -- --run tests/repair-local-release-gate.test.ts tests/repair-local-secret-staging.test.ts tests/repair-local-release-cli.test.ts
```

Expected: PASS and no network command executed by tests.

Do not commit yet.

---

### Task 5: E2E fixture parity and operator documentation

**Files:**
- Modify: `scripts/repair-runner-e2e-diagnostics.mts:115-153`
- Modify: `scripts/run-repair-runner-e2e.mts:452-472`
- Modify: `scripts/run-repair-runner-e2e.mts:817-840`
- Modify: `tests/repair-runner-executable-e2e.test.ts:44-52`
- Modify: `tests/repair-runner-executable-e2e.test.ts:154-191`
- Modify: `tests/repair-local-release-entrypoint.test.ts`
- Modify: `.env.example`
- Modify: `docs/LOCAL_REPAIR_RELEASE.md`
- Modify: `tests/release-env-documented.test.ts`

**Interfaces:**
- Extends `buildUnsignedProductionPreflightInputs` with `contractPublicKeySha256` and `contractPrivateKeyPkcs8Base64Url`.
- Keeps expected unsigned-production failure at `Authenticode status nije Valid.` after all earlier v2 checks pass.
- Documents six independent Lekta release inputs and four Supabase runtime values.

- [ ] **Step 1: Write RED v2 unsigned-preflight tests**

Change the helper type and test call in `repair-runner-executable-e2e.test.ts`:

```typescript
const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const privateKeyPkcs8Base64Url = privateKey
  .export({ format: 'der', type: 'pkcs8' }).toString('base64url');
const contractPublicKeySha256 = createHash('sha256')
  .update(publicKey.export({ format: 'der', type: 'spki' })).digest('hex');
const fixture = requiredHelper('buildUnsignedProductionPreflightInputs')({
  fileName: 'LektaRepairDev.exe',
  artifactSha256,
  artifactSizeBytes: artifactBytes.byteLength,
  contractKeyId: 'lekta-e2e-key',
  contractPublicKeySha256,
  contractPrivateKeyPkcs8Base64Url: privateKeyPkcs8Base64Url,
  sourceCommit: '1'.repeat(40),
});
expect(fixture.manifest).toMatchObject({
  schemaVersion: 2,
  contractPublicKeySha256,
});
```

Keep the child CLI assertion that the only failure is `/Authenticode status nije Valid\./`.

- [ ] **Step 2: Update the real CLI entrypoint RED fixture**

In `repair-local-release-entrypoint.test.ts`, generate a P-256 pair and add:

```typescript
LEKTA_REPAIR_EXPECTED_CONTRACT_PUBLIC_KEY_SHA256: contractPublicKeySha256,
LEKTA_REPAIR_CONTRACT_PRIVATE_KEY_PKCS8_B64URL: privateKeyPkcs8Base64Url,
```

The test still expects `runner artefakt ne postoji`; this proves env/key validation no longer intercepts a correctly configured invocation.

- [ ] **Step 3: Run E2E contract tests and verify RED**

```powershell
npm test -- --run tests/repair-runner-executable-e2e.test.ts tests/repair-local-release-entrypoint.test.ts
```

Expected: FAIL because the E2E helper still emits manifest v1 and old environment fields.

- [ ] **Step 4: Update the E2E helper and real harness**

Replace `buildUnsignedProductionPreflightInputs` with this complete schema-v2 fixture builder. It validates the public fingerprint and canonical private-key transport value before returning either object:

```typescript
export function buildUnsignedProductionPreflightInputs(
  input: {
    fileName: string;
    artifactSha256: string;
    artifactSizeBytes: number;
    contractKeyId: string;
    contractPublicKeySha256: string;
    contractPrivateKeyPkcs8Base64Url: string;
    sourceCommit: string;
  },
): { manifest: Record<string, unknown>; environment: NodeJS.ProcessEnv } {
  const privateBytes = Buffer.from(input.contractPrivateKeyPkcs8Base64Url, 'base64url');
  const canonicalPrivateKey = privateBytes.length > 0
    && privateBytes.toString('base64url') === input.contractPrivateKeyPkcs8Base64Url;
  if (input.fileName !== basename(input.fileName)
    || !/^[a-f0-9]{64}$/.test(input.artifactSha256)
    || !Number.isSafeInteger(input.artifactSizeBytes) || input.artifactSizeBytes <= 0
    || !/^[A-Za-z0-9._-]{1,80}$/.test(input.contractKeyId)
    || !/^[a-f0-9]{64}$/.test(input.contractPublicKeySha256)
    || !canonicalPrivateKey
    || !/^[a-f0-9]{40}$/.test(input.sourceCommit)) {
    throw new Error('Unsigned production preflight inputs are invalid.');
  }
  const signingCertificateThumbprint = '0'.repeat(40);
  return {
    manifest: {
      schemaVersion: 2,
      fileName: input.fileName,
      sha256: input.artifactSha256,
      sizeBytes: input.artifactSizeBytes,
      contractKeyId: input.contractKeyId,
      contractPublicKeySha256: input.contractPublicKeySha256,
      signingCertificateThumbprint,
      timestampServer: 'https://timestamp.example.invalid',
      engineVersion: '0.1.0',
      sourceCommit: input.sourceCommit,
      sourceBranch: 'automation-dev',
      sourceTreeClean: true,
    },
    environment: {
      LEKTA_REPAIR_EXPECTED_PUBLISHER_THUMBPRINT: signingCertificateThumbprint,
      LEKTA_REPAIR_EXPECTED_CONTRACT_KEY_ID: input.contractKeyId,
      LEKTA_REPAIR_EXPECTED_CONTRACT_PUBLIC_KEY_SHA256: input.contractPublicKeySha256,
      LEKTA_REPAIR_REVIEWED_WORDREPLICA_COMMIT: input.sourceCommit,
      LEKTA_REPAIR_REVIEWED_ARTIFACT_SHA256: input.artifactSha256,
      LEKTA_REPAIR_CONTRACT_PRIVATE_KEY_PKCS8_B64URL:
        input.contractPrivateKeyPkcs8Base64Url,
    },
  };
}
```

In `run-repair-runner-e2e.mts`, call it with:

```typescript
contractPublicKeySha256: sha256(signerPublicSpki),
contractPrivateKeyPkcs8Base64Url: privateKeyBase64Url,
```

The existing sensitive-value list already includes `privateKeyBase64Url`; preserve its log-leak assertions.

- [ ] **Step 5: Make release env documentation executable**

Add blank, documented entries to `.env.example`:

```dotenv
# [local repair release] Neovisni javni identiteti pregledanog runner releasea.
LEKTA_REPAIR_EXPECTED_PUBLISHER_THUMBPRINT=
LEKTA_REPAIR_EXPECTED_CONTRACT_KEY_ID=
LEKTA_REPAIR_EXPECTED_CONTRACT_PUBLIC_KEY_SHA256=
LEKTA_REPAIR_REVIEWED_WORDREPLICA_COMMIT=
LEKTA_REPAIR_REVIEWED_ARTIFACT_SHA256=

# [local repair release secret] PKCS#8 P-256 privatni kljuc; nikad ne commitati vrijednost.
LEKTA_REPAIR_CONTRACT_PRIVATE_KEY_PKCS8_B64URL=
SUPABASE_DB_PASSWORD=
```

In `release-env-documented.test.ts`, include `scripts/run-local-repair-release.mts` and extend `gateVariables()` with this extractor:

```typescript
for (const m of src.matchAll(
  /requiredEnvironmentValue\(\s*env,\s*'([A-Z0-9_]+)'/g,
)) found.add(m[1]);
```

Also include direct `env.SUPABASE_DB_PASSWORD` and `env.SUPABASE_ACCESS_TOKEN` matches by generalizing the current process-env regex to `(?:process\.)?env\.([A-Z][A-Z0-9_]+)` for the listed gate scripts.

Update `docs/LOCAL_REPAIR_RELEASE.md` to state manifest v2, the independent fingerprint, the private key input, env-file staging, the guard-first/full-disabled substeps, migrations/functions/Netlify order, enabled-guarded transition and final activation. Explicitly state that implementation verification does not perform production deployment and that a trusted Authenticode certificate remains mandatory.

- [ ] **Step 6: Run E2E contracts and documentation tests and verify GREEN**

```powershell
npm test -- --run tests/repair-runner-executable-e2e.test.ts tests/repair-local-release-entrypoint.test.ts tests/release-env-documented.test.ts
```

Expected: PASS.

Do not commit yet.

---

### Task 6: Lekta full gate, adversarial review and feature-branch checkpoint

**Files:** All Lekta files from Tasks 2-5, and no others.

**Interfaces:**
- Consumes the WordReplica manifest v2 committed in Task 1.
- Produces one reviewed Lekta commit for the final cross-repo E2E pair.

- [ ] **Step 1: Run all focused release tests together**

```powershell
npm test -- --run tests/repair-local-release-gate.test.ts tests/repair-local-secret-staging.test.ts tests/repair-local-release-cli.test.ts tests/repair-local-release-entrypoint.test.ts tests/repair-runner-executable-e2e.test.ts tests/release-env-documented.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run the complete Lekta hard gate**

```powershell
npm run check
```

Expected: lint, TypeScript, Edge checks, all Vitest tests and final Vite build exit 0. The intentionally failing classification-guard negative control inside `tests/build-production.test.ts` is expected only when its enclosing test is green; the final Vite build must succeed.

- [ ] **Step 3: Run orphan and diff hygiene**

```powershell
npm run orphan-scan
git diff --check
git status --short --untracked-files=all
git diff
git diff --cached
```

Expected: orphan scan clean, no whitespace errors, no staged unrelated file and only the exact Task 2-5 paths modified.

- [ ] **Step 4: Perform the required adversarial boundary review**

Use `superpowers:requesting-code-review` with this checklist:

```text
1. Can manifest v1 or a missing/mixed-case contractPublicKeySha256 pass?
2. Can a valid but different PKCS#8 P-256 key pass by changing only the adjacent manifest?
3. Can any child process inherit either private-key environment name?
4. Can any deployment-plan or thrown error contain the private value or temporary path?
5. Can migrations, functions or Netlify run before both disabled writes succeed?
6. Can activate run after any prior simulated failure?
7. Does any test perform a real network mutation?
8. Did any UI, parser, citation, audit, migration SQL or Edge business-logic file change?
```

Resolve every concrete finding through its own RED/GREEN focused test and rerun Steps 1-3. Do not broaden scope for style-only suggestions.

- [ ] **Step 5: Commit only the reviewed Lekta release boundary**

```powershell
git add .env.example docs/LOCAL_REPAIR_RELEASE.md scripts/local-repair-release-gate.mts scripts/local-repair-secret-staging.mts scripts/run-local-repair-release.mts scripts/repair-runner-e2e-diagnostics.mts scripts/run-repair-runner-e2e.mts tests/repair-local-release-gate.test.ts tests/repair-local-secret-staging.test.ts tests/repair-local-release-cli.test.ts tests/repair-local-release-entrypoint.test.ts tests/repair-runner-executable-e2e.test.ts tests/release-env-documented.test.ts
git diff --cached
git commit --only .env.example docs/LOCAL_REPAIR_RELEASE.md scripts/local-repair-release-gate.mts scripts/local-repair-secret-staging.mts scripts/run-local-repair-release.mts scripts/repair-runner-e2e-diagnostics.mts scripts/run-repair-runner-e2e.mts tests/repair-local-release-gate.test.ts tests/repair-local-secret-staging.test.ts tests/repair-local-release-cli.test.ts tests/repair-local-release-entrypoint.test.ts tests/repair-runner-executable-e2e.test.ts tests/release-env-documented.test.ts -m "feat: automate fail-closed repair release"
```

- [ ] **Step 6: Push only the authorized private feature branch**

```powershell
git push https://github.com/danielrisavi77-create/Lekta HEAD:refs/heads/feature/repair-contract-v1-current-v2
git ls-remote https://github.com/danielrisavi77-create/Lekta refs/heads/feature/repair-contract-v1-current-v2
```

Require the remote SHA to equal local `git rev-parse HEAD`. Do not use `master` or `main` as a destination.

---

### Task 7: Exact-commit cross-repo Word E2E twice and production fail-closed proof

**Repositories:** Clean WordReplica `automation-dev` and clean Lekta `feature/repair-contract-v1-current-v2`.

**Files:** No source modification. Diagnostics stay under `C:\WordReplica-Automation\diagnostics`.

**Interfaces:**
- Consumes final `git rev-parse HEAD` from both repositories.
- Produces two independent `e2e-summary.json` and `golden_report.json` pairs with identical repo SHAs and FULL PASS.

- [ ] **Step 1: Prove both repositories are clean and record exact commits**

Run in each repository:

```powershell
git status --short
git rev-parse HEAD
```

Expected: no status output. Record `LEKTA_FINAL_SHA` and `WORDREPLICA_FINAL_SHA` in the execution report, not in source files.

- [ ] **Step 2: Confirm current Supabase CLI command contract without mutation**

```powershell
.\node_modules\.bin\supabase.cmd --version
.\node_modules\.bin\supabase.cmd secrets set --help
.\node_modules\.bin\supabase.cmd functions deploy --help
```

Expected: installed CLI exposes `--env-file` and `--project-ref`; no login, link, secret set or deployment command is executed.

- [ ] **Step 3: Run the first real Word cross-repo E2E**

From the Lekta checkout:

```powershell
npm run repair:runner:e2e
```

Read the printed `e2e-summary.json` and `golden_report.json` directly. Require:

```text
summary.status = passed
summary.git.lekta.head = LEKTA_FINAL_SHA
summary.git.wordReplica.head = WORDREPLICA_FINAL_SHA
summary.qa.fullPass = true
G0-G10 = true
open_and_repair = false
visible_text_equal = true
fields_update_equal = true
productionPreflight.rejected = true
productionPreflight.reason = Authenticode status nije Valid.
source SHA-256 and size unchanged
WINWORD PID set unchanged
```

- [ ] **Step 4: Run the second real Word cross-repo E2E without changing commits**

```powershell
npm run repair:runner:e2e
```

Read the second report pair and require the same assertions and exact same `LEKTA_FINAL_SHA` / `WORDREPLICA_FINAL_SHA`. Confirm the two diagnostics directories are distinct and neither contains the private key or claim token.

- [ ] **Step 5: Prove the production release remains blocked at the trusted-signature boundary**

The two E2E preflight logs must show that valid manifest v2, source/artifact identities and matching P-256 private/public inputs passed, while the unsigned development EXE failed specifically with:

```text
Authenticode status nije Valid.
```

Do not run `npm run release:repair:deploy`. Do not create a self-signed production identity. Record the missing trusted Authenticode certificate as the sole external production-release blocker.

- [ ] **Step 6: Final branch and remote verification**

```powershell
git status --short --branch
```

Require both worktrees clean and still on their authorized branches. Verify both remote feature refs equal their local commits. No promotion to `main`/`master` occurs in this plan.

## Completion Evidence

The implementation is complete only when the handoff contains:

1. WordReplica RED and GREEN outputs for canonical SPKI fingerprint and manifest v2.
2. WordReplica full pytest output and two same-commit official Golden #1 FULL PASS reports.
3. Lekta RED and GREEN outputs for manifest binding, staging cleanup/redaction and release order.
4. One successful complete `npm run check` after the final Lekta source change.
5. A clean `npm run orphan-scan` and reviewed exact-path diff.
6. Adversarial review outcome and any resulting focused regression tests.
7. WordReplica and Lekta final local/remote commit SHAs on only the authorized branches.
8. Two cross-repo real Word E2E FULL PASS reports on that same commit pair.
9. Evidence that production preflight rejects only the unsigned development runner at Authenticode.
10. Explicit statement that no production Supabase/Netlify deployment and no `main`/`master` promotion occurred.

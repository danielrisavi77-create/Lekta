# Repair Contract CI Security Gates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vratiti oba PR #38 security joba u zeleno preciznim, fail-closed iznimkama za dva javna Repair Contract artefakta i točno poznati tranzitivni `nanoid@2.1.11` advisory skup, bez runtime ili dependency promjene.

**Architecture:** Jedan Node ESM modul pokreće `npm audit --omit=dev --json`, validira JSON i lockfile kroz čistu funkciju te dopušta samo unaprijed zaključani Hunspell/nanoid slučaj. Postojeći gitleaks TOML dobiva samo dva doslovna regex matcha, a postojeći Vite Hunspell transform postaje imenovano izvezen radi regresijskog tripwirea nad stvarnim datotekama iz `node_modules`.

**Tech Stack:** Node.js 24 ESM, npm audit JSON v2, Vitest 2.1, TypeScript testovi, GitHub Actions YAML, gitleaks TOML, Vite 8 plugin API.

## Global Constraints

- Raditi samo u postojećem worktreeu `feature/repair-contract-v1`; ne razvijati, commitati ni pushati izravno na `master`.
- Gitleaks mora sačuvati točna dva legacy regexa `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpycmp0dGl6anlmY3htY3Bnem1sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM1ODIzMTcsImV4cCI6MjA5OTE1ODMxN30\.[A-Za-z0-9_-]+` i `lekta\.katedra-handoff-result\.v0\.1`, zatim im dodati samo doslovni `fixture-2026-08-16` i doslovni javni SPKI `MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEDyEWJEJSXAqK52WXld1o0CQBkIfLxYnTpPqdgoJ9fUdmbEbTCS6pEuBYSK-6nyGsyygNYwDAtSODs-MSSzQCHA`.
- Ne dodavati Repair Contract path allowlist; postojeći allowlist za `data/sources/*.html` i `package-lock.json` ostaje nepromijenjen.
- Audit policy smije dopustiti samo `GHSA-mwcw-c2x4-8c55`, `GHSA-28wg-ghj8-5hjv` i `GHSA-2v37-7h3g-55p8`.
- Dopušteni paket mora biti neizravan `nanoid@2.1.11` isključivo na `node_modules/hunspell-asm/node_modules/nanoid` i `node_modules/emscripten-wasm-loader/node_modules/nanoid`.
- Roditelji moraju ostati točno `hunspell-asm@4.0.2` i `emscripten-wasm-loader@3.0.3`; svaka promjena verzije ili putanje mora pasti.
- Svaki novi high/critical paket, advisory, izravni nanoid, nevaljan audit JSON ili neuspješno pokretanje `npm audit` mora vratiti nenulti exit kod.
- Ne mijenjati `package.json`, `package-lock.json`, Repair Contract wire format, DOCX engine, fixture sadržaj, Golden izvore ni Golden snapshote.
- Postojeći fixture-only privatni ključ u generatoru nema produkcijsku vrijednost, ostaje nepromijenjen i ne dobiva gitleaks allowlist; nijedan produkcijski privatni ključ ne smije ući u repo.
- TDD redoslijed je obvezan: napisati test, dokazati RED, napraviti najmanju izmjenu, dokazati GREEN.
- Zbog dokazanog lokalnog disk/CPU contentiona završni `npm run check` pokrenuti jednojezgreno; testovi, pragovi i naredba ostaju isti.
- Implementacijske datoteke idu u jedan atomarni commit tek nakon punog zelenog gatea, u skladu s odobrenom specifikacijom i AGENTS.md.

## Evidence-Based Implementation Notes

- Task review je pojačao ilustrativne testove iz Taska 1 neovisnim literalnim advisory/SPKI očekivanjima, provjerama roditeljskih verzija, točnim regex skupom, malformed JSON/process slučajevima i `{ map: null }` assertionom. Ta pojačanja ne šire dopuštenu iznimku; zatvaraju fail-open rubove izvornog plana.
- Stvarni Task 5 Windows run pod Nodeom 24 dokazao je da `spawnSync('npm.cmd', ...)` bez shella završava s `EINVAL` prije audita. Konačna implementacija zato namjerno odstupa od ilustrativnog Task 2 snippet-a: na `win32` pokreće npm-ov CLI JavaScript izravno kroz `process.execPath`, bez `shell: true` i bez `cmd.exe`; ne-Windows put i dalje koristi `npm`.
- Windows kompatibilnost dobila je zaseban RED→GREEN test. Stvarni audit ima package severity `high`, uz točno `high` severityje za `GHSA-28wg-ghj8-5hjv` i `GHSA-2v37-7h3g-55p8` te `moderate` za `GHSA-mwcw-c2x4-8c55`; policy zato provjerava točnu severity mapu po advisory ID-ju. Završni fokusirani rezultat je 20/20, a stvarni `node scripts/security/npm-audit-policy.mjs` izlazi s kodom 0 i prihvaća samo zaključana tri advisoryja.
- Čist audit i dalje prolazi samo uz zaključani dependency graf. Završni fix wave pojačava fail-closed provjeru poznatog npm severity enum skupa, identiteta dopuštenih advisoryja, obveznog root lockfile zapisa te točnih parent dependency edgeova.

---

## File Structure

- Create `scripts/security/npm-audit-policy.mjs`: jedina odgovornost je pokretanje npm audita, fail-closed parsiranje i provjera točno dopuštenog lockfile/advisory slučaja.
- Create `tests/npm-audit-policy.test.ts`: čisti policy i CLI ulazni rubovi; nema mreže ni stvarnog npm audita.
- Create `tests/security-audit-workflow.test.ts`: statički guard da workflow koristi policy CLI, sadrži samo točne javne gitleaks vrijednosti i nema široki Repair Contract path allowlist.
- Create `tests/hunspell-nanoid-transform.test.ts`: tripwire nad stvarnim upstream ESM datotekama i funkcionalnim inline generatorom duljine 45.
- Modify `.github/workflows/security-audit.yml:34-83`: zamijeniti goli npm audit policy CLI-jem i dodati dva točna gitleaks regexa.
- Modify `vite.config.ts:280-303`: samo izvesti postojeći `fixHunspellNanoid`; tijelo transformacije ostaje bitno isto.

## Task 1: Zaključati security ugovor regresijskim testovima

**Files:**
- Create: `tests/npm-audit-policy.test.ts`
- Create: `tests/security-audit-workflow.test.ts`
- Create: `tests/hunspell-nanoid-transform.test.ts`

**Interfaces:**
- Consumes: budući `evaluateProductionAudit(auditReport, lockfile)` i `runAuditPolicyCli(options)` iz `scripts/security/npm-audit-policy.mjs`; budući imenovani export `fixHunspellNanoid()` iz `vite.config.ts`.
- Produces: izvršivi RED ugovor za policy rezultat `{ ok: boolean, reasons: string[], allowedAdvisories: string[] }`, CLI rezultat `{ exitCode: 0 | 1, message: string }` i Vite transform `{ code: string, map: null } | null`.

- [ ] **Step 1: Napisati audit policy test s točnim trenutnim slučajem i svim fail-closed mutacijama**

Create `tests/npm-audit-policy.test.ts` with this structure and assertions:

```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

// @ts-expect-error - Node ESM policy je namjerno plain .mjs bez zasebnih deklaracija.
import {
  ALLOWED_NANOID_ADVISORIES,
  evaluateProductionAudit,
  runAuditPolicyCli,
} from '../scripts/security/npm-audit-policy.mjs';

const lockfile = JSON.parse(readFileSync(resolve(process.cwd(), 'package-lock.json'), 'utf8'));
const nodes = [
  'node_modules/emscripten-wasm-loader/node_modules/nanoid',
  'node_modules/hunspell-asm/node_modules/nanoid',
];

function advisory(id: string) {
  return {
    source: id,
    name: 'nanoid',
    dependency: 'nanoid',
    title: id,
    url: `https://github.com/advisories/${id}`,
    severity: 'high',
    range: '<3.3.8',
  };
}

function currentReport() {
  return {
    auditReportVersion: 2,
    vulnerabilities: {
      nanoid: {
        name: 'nanoid',
        severity: 'high',
        isDirect: false,
        via: ALLOWED_NANOID_ADVISORIES.map(advisory),
        effects: [],
        range: '<3.3.8',
        nodes: [...nodes],
        fixAvailable: true,
      },
    },
  };
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

describe('production npm audit policy', () => {
  it('propušta čist audit i točno trenutni Hunspell nanoid nalaz', () => {
    expect(evaluateProductionAudit({ auditReportVersion: 2, vulnerabilities: {} }, lockfile)).toEqual({
      ok: true,
      reasons: [],
      allowedAdvisories: [],
    });
    expect(evaluateProductionAudit(currentReport(), lockfile)).toEqual({
      ok: true,
      reasons: [],
      allowedAdvisories: [...ALLOWED_NANOID_ADVISORIES],
    });
  });

  it('odbija novi advisory i dodatni high/critical paket', () => {
    const changed = currentReport();
    changed.vulnerabilities.nanoid.via.push(advisory('GHSA-new-1-2'));
    expect(evaluateProductionAudit(changed, lockfile)).toMatchObject({ ok: false });

    const extra = currentReport() as ReturnType<typeof currentReport> & { vulnerabilities: Record<string, unknown> };
    extra.vulnerabilities.other = {
      name: 'other', severity: 'critical', isDirect: false, via: [], nodes: ['node_modules/other'],
    };
    expect(evaluateProductionAudit(extra, lockfile)).toMatchObject({ ok: false });
  });

  it('odbija izravni nanoid, path drift i verzijski drift', () => {
    const direct = currentReport();
    direct.vulnerabilities.nanoid.isDirect = true;
    expect(evaluateProductionAudit(direct, lockfile)).toMatchObject({ ok: false });

    const moved = currentReport();
    moved.vulnerabilities.nanoid.nodes = ['node_modules/nanoid'];
    expect(evaluateProductionAudit(moved, lockfile)).toMatchObject({ ok: false });

    const changedLock = clone(lockfile);
    changedLock.packages['node_modules/hunspell-asm/node_modules/nanoid'].version = '2.1.12';
    expect(evaluateProductionAudit(currentReport(), changedLock)).toMatchObject({ ok: false });
  });

  it('odbija nevaljan audit JSON i CLI audit proces koji nije završio statusom 0 ili 1', () => {
    expect(evaluateProductionAudit(null, lockfile)).toMatchObject({ ok: false });

    const spawnSyncImpl = vi.fn(() => ({ status: 2, stdout: '', stderr: 'registry unavailable' }));
    const result = runAuditPolicyCli({
      cwd: process.cwd(),
      platform: 'linux',
      spawnSyncImpl,
      readFileSyncImpl: () => JSON.stringify(lockfile),
    });
    expect(spawnSyncImpl).toHaveBeenCalledWith(
      'npm',
      ['audit', '--omit=dev', '--json'],
      expect.objectContaining({ cwd: process.cwd(), encoding: 'utf8' }),
    );
    expect(result.exitCode).toBe(1);
    expect(result.message).toMatch(/registry unavailable|status 2/i);
  });
});
```

- [ ] **Step 2: Napisati workflow test koji zahtijeva policy CLI i točna četiri gitleaks matcha**

Create `tests/security-audit-workflow.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const workflow = readFileSync(resolve(process.cwd(), '.github/workflows/security-audit.yml'), 'utf8');
const publicKey = readFileSync(
  resolve(process.cwd(), 'tests/fixtures/repair-contract-v1/public-key.spki.b64url'),
  'utf8',
).trim();
const allowlist = workflow.match(/\[allowlist\][\s\S]*?GITLEAKS_TOML/)?.[0] ?? '';
const regexes = allowlist.match(/regexes\s*=\s*\[([\s\S]*?)\]/)?.[1] ?? '';
const paths = allowlist.match(/paths\s*=\s*\[([\s\S]*?)\]/)?.[1] ?? '';

describe('security-audit workflow', () => {
  it('npm-audit job koristi fail-closed policy CLI umjesto golog audit thresholda', () => {
    expect(workflow).toContain('run: node scripts/security/npm-audit-policy.mjs');
    expect(workflow).not.toContain('run: npm audit --omit=dev --audit-level=high');
  });

  it('gitleaks allowlista samo točan javni keyId i točan javni SPKI', () => {
    expect(regexes).toContain("'''fixture-2026-08-16'''");
    expect(regexes).toContain(`'''${publicKey}'''`);
  });

  it('ne skriva Repair Contract datoteke path allowlistom', () => {
    expect(paths).not.toMatch(/repair-contract|REPAIR_CONTRACT|docs\/superpowers|scripts\/generate-repair/);
    expect(paths).toContain("'''data/sources/.*\\.html$'''");
    expect(paths).toContain("'''(^|/)package-lock\\.json$'''");
  });
});
```

- [ ] **Step 3: Napisati tripwire nad stvarnim Hunspell i loader ESM datotekama**

Create `tests/hunspell-nanoid-transform.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { fixHunspellNanoid } from '../vite.config';

function transformedCode(result: { code: string; map: null } | null): string {
  expect(result).not.toBeNull();
  if (!result) throw new Error('Hunspell transform nije primijenjen.');
  return result.code;
}

describe('lekta-fix-hunspell-nanoid', () => {
  const plugin = fixHunspellNanoid();

  it('stvarni Hunspell ESM runtime prebacuje na pozivljivi browser default import', () => {
    const id = resolve(process.cwd(), 'node_modules/hunspell-asm/dist/esm/loadModule.js');
    const source = readFileSync(id, 'utf8');
    const code = transformedCode(plugin.transform(source, id));
    expect(code).toContain("import runtime from './lib/browser/hunspell'");
    expect(code).not.toContain("import * as runtime from './lib/node/hunspell'");
  });

  it('stvarni loader uklanja nanoid import, zadržava nanoid(45) i generira 45 znakova', () => {
    const id = resolve(process.cwd(), 'node_modules/emscripten-wasm-loader/dist/esm/path/mountBuffer.js');
    const source = readFileSync(id, 'utf8');
    const code = transformedCode(plugin.transform(source, id));
    expect(code).not.toMatch(/from ['"]nanoid['"]/);
    expect(code).toContain('nanoid(45)');

    const declaration = code.match(/const nanoid=\(n=21\)=>\{[^\n]+return s\};/)?.[0];
    expect(declaration).toBeTruthy();
    const generated = Function(`${declaration}; return nanoid(45);`)() as string;
    expect(generated).toHaveLength(45);
    expect(generated).toMatch(/^[A-Za-z0-9_-]{45}$/);
  });

  it('ne dira nepovezane module', () => {
    expect(plugin.transform("import nanoid from 'nanoid'", resolve(process.cwd(), 'src/example.ts'))).toBeNull();
  });
});
```

- [ ] **Step 4: Pokrenuti sva tri nova testa i dokazati RED**

Run:

```powershell
npm run test -- --run tests/npm-audit-policy.test.ts tests/security-audit-workflow.test.ts tests/hunspell-nanoid-transform.test.ts
```

Expected: FAIL zato što `scripts/security/npm-audit-policy.mjs` ne postoji, `fixHunspellNanoid` nije izvezen i workflow još sadrži goli `npm audit` bez dva nova regexa. Sačuvati te konkretne failure poruke kao RED dokaz; ne mijenjati timeout ili snapshot.

## Task 2: Implementirati fail-closed npm audit policy

**Files:**
- Create: `scripts/security/npm-audit-policy.mjs`
- Test: `tests/npm-audit-policy.test.ts`

**Interfaces:**
- Consumes: npm audit JSON v2, `package-lock.json` v3 i injektabilne `spawnSyncImpl`/`readFileSyncImpl` funkcije.
- Produces: `ALLOWED_NANOID_ADVISORIES: readonly string[]`, `evaluateProductionAudit(auditReport, lockfile): AuditPolicyResult`, `runAuditPolicyCli(options): { exitCode: 0 | 1, message: string }` i executable ESM entrypoint.

- [ ] **Step 1: Dodati zaključane konstante i čisti evaluator**

Create `scripts/security/npm-audit-policy.mjs`. The implementation must use these exact constants and return shape:

```js
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export const ALLOWED_NANOID_ADVISORIES = Object.freeze([
  'GHSA-28wg-ghj8-5hjv',
  'GHSA-2v37-7h3g-55p8',
  'GHSA-mwcw-c2x4-8c55',
]);

const ALLOWED_NANOID_NODES = Object.freeze([
  'node_modules/emscripten-wasm-loader/node_modules/nanoid',
  'node_modules/hunspell-asm/node_modules/nanoid',
]);

const REQUIRED_PACKAGES = Object.freeze({
  'node_modules/emscripten-wasm-loader': '3.0.3',
  'node_modules/emscripten-wasm-loader/node_modules/nanoid': '2.1.11',
  'node_modules/hunspell-asm': '4.0.2',
  'node_modules/hunspell-asm/node_modules/nanoid': '2.1.11',
});

function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function advisoryId(via) {
  if (!record(via) || typeof via.url !== 'string') return null;
  return via.url.match(/\/advisories\/(GHSA-[A-Za-z0-9-]+)$/)?.[1] ?? null;
}

function sameStrings(actual, expected) {
  return Array.isArray(actual)
    && [...actual].sort().join('\n') === [...expected].sort().join('\n');
}

export function evaluateProductionAudit(auditReport, lockfile) {
  const reasons = [];
  if (!record(auditReport) || auditReport.auditReportVersion !== 2 || !record(auditReport.vulnerabilities)) {
    return { ok: false, reasons: ['Nevaljan npm audit JSON v2.'], allowedAdvisories: [] };
  }
  if (!record(lockfile) || !record(lockfile.packages)) {
    return { ok: false, reasons: ['Nevaljan package-lock.json.'], allowedAdvisories: [] };
  }

  const severe = Object.entries(auditReport.vulnerabilities).filter(([, value]) =>
    record(value) && (value.severity === 'high' || value.severity === 'critical'));
  if (severe.length === 0) return { ok: true, reasons: [], allowedAdvisories: [] };
  if (severe.length !== 1 || severe[0][0] !== 'nanoid') {
    reasons.push('Postoji high/critical paket izvan dopuštenog nanoid slučaja.');
  }

  const vulnerability = auditReport.vulnerabilities.nanoid;
  if (!record(vulnerability) || vulnerability.name !== 'nanoid' || vulnerability.severity !== 'high') {
    reasons.push('nanoid nalaz nema očekivani oblik ili severity.');
  }
  if (!record(vulnerability) || vulnerability.isDirect !== false) {
    reasons.push('nanoid mora ostati neizravna ovisnost.');
  }
  const advisories = record(vulnerability) && Array.isArray(vulnerability.via)
    ? vulnerability.via.map(advisoryId)
    : [];
  if (advisories.some((id) => id === null) || !sameStrings(advisories, ALLOWED_NANOID_ADVISORIES)) {
    reasons.push('nanoid advisory skup nije točno dopušteni skup.');
  }
  if (!record(vulnerability) || !sameStrings(vulnerability.nodes, ALLOWED_NANOID_NODES)) {
    reasons.push('nanoid node putanje nisu točno dopuštene putanje.');
  }

  for (const [path, version] of Object.entries(REQUIRED_PACKAGES)) {
    if (!record(lockfile.packages[path]) || lockfile.packages[path].version !== version) {
      reasons.push(`${path} mora ostati na verziji ${version}.`);
    }
  }
  const rootDependencies = record(lockfile.packages['']) && record(lockfile.packages[''].dependencies)
    ? lockfile.packages[''].dependencies
    : {};
  if (Object.prototype.hasOwnProperty.call(rootDependencies, 'nanoid')) {
    reasons.push('nanoid ne smije postati izravna produkcijska ovisnost.');
  }

  return {
    ok: reasons.length === 0,
    reasons,
    allowedAdvisories: reasons.length === 0 ? [...ALLOWED_NANOID_ADVISORIES] : [],
  };
}
```

Keep advisory constants sorted exactly as above so tests and operator output are deterministic.

- [ ] **Step 2: Dodati injektabilni CLI sloj i executable entrypoint**

Append the following behavior in the same module; do not shell-expand or use `exec`:

```js
export function runAuditPolicyCli({
  cwd = process.cwd(),
  platform = process.platform,
  spawnSyncImpl = spawnSync,
  readFileSyncImpl = readFileSync,
} = {}) {
  const command = platform === 'win32' ? 'npm.cmd' : 'npm';
  const audit = spawnSyncImpl(command, ['audit', '--omit=dev', '--json'], {
    cwd,
    encoding: 'utf8',
    windowsHide: true,
  });
  if (audit.error || (audit.status !== 0 && audit.status !== 1)) {
    const detail = audit.error?.message || audit.stderr || `status ${audit.status}`;
    return { exitCode: 1, message: `npm audit se nije mogao pouzdano izvršiti: ${detail}` };
  }

  let auditReport;
  let lockfile;
  try {
    auditReport = JSON.parse(audit.stdout);
    lockfile = JSON.parse(readFileSyncImpl(resolve(cwd, 'package-lock.json'), 'utf8'));
  } catch (error) {
    return { exitCode: 1, message: `Nevaljan audit ili lockfile JSON: ${error instanceof Error ? error.message : String(error)}` };
  }

  const result = evaluateProductionAudit(auditReport, lockfile);
  if (!result.ok) return { exitCode: 1, message: result.reasons.join('\n') };
  if (result.allowedAdvisories.length === 0) return { exitCode: 0, message: 'Nema high/critical produkcijskih ranjivosti.' };
  return {
    exitCode: 0,
    message: `Dopušten je samo zaključani Hunspell nanoid slučaj: ${result.allowedAdvisories.join(', ')}`,
  };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const result = runAuditPolicyCli();
  const writer = result.exitCode === 0 ? console.log : console.error;
  writer(result.message);
  process.exitCode = result.exitCode;
}
```

- [ ] **Step 3: Pokrenuti policy test i dokazati GREEN bez mreže**

Run:

```powershell
npm run test -- --run tests/npm-audit-policy.test.ts
```

Expected: PASS for the clean case, exact current case, new advisory, extra package, direct dependency, path drift, version drift, malformed JSON and abnormal npm exit cases.

## Task 3: Ožičiti precizni workflow policy i gitleaks allowlist

**Files:**
- Modify: `.github/workflows/security-audit.yml:34-83`
- Test: `tests/security-audit-workflow.test.ts`

**Interfaces:**
- Consumes: executable `node scripts/security/npm-audit-policy.mjs`; current public fixture keyId and SPKI.
- Produces: GitHub `npm-audit` job koji vraća exit 0 samo kroz policy CLI i gitleaks TOML koji čuva dva točna legacy regexa te im dodaje dva točna Repair Contract regexa.

- [ ] **Step 1: Zamijeniti raw npm audit korak policy CLI-jem**

Change only the audit step:

```yaml
      - name: Audit produkcijskih ovisnosti (high+; precizni fail-closed policy)
        run: node scripts/security/npm-audit-policy.mjs
```

Keep `npm ci`, Node 24, weekly schedule and least-privilege permissions unchanged.

- [ ] **Step 2: Sačuvati dva legacy regexa i dodati dva doslovna javna regexa bez novog path allowlista**

Preserve these two exact existing entries unchanged:

```toml
          '''eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpycmp0dGl6anlmY3htY3Bnem1sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM1ODIzMTcsImV4cCI6MjA5OTE1ODMxN30\.[A-Za-z0-9_-]+''',
          '''lekta\.katedra-handoff-result\.v0\.1''',
```

Then append these two entries to the same TOML `regexes` array:

```toml
          # Javni Repair Contract fixture identifikator i javni P-256 SPKI. Oba su javna
          # verifikacijska vrijednost; privatni/produkcijski kljucevi nisu allowlistani.
          '''fixture-2026-08-16''',
          '''MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEDyEWJEJSXAqK52WXld1o0CQBkIfLxYnTpPqdgoJ9fUdmbEbTCS6pEuBYSK-6nyGsyygNYwDAtSODs-MSSzQCHA''',
```

Do not add anything to `paths`; do not broaden an existing regex with `.*`.

- [ ] **Step 3: Pokrenuti workflow guard i dokazati GREEN**

Run:

```powershell
npm run test -- --run tests/security-audit-workflow.test.ts
```

Expected: workflow guard PASS; raw audit line absent, policy CLI present, all four exact regex values present, exactly the two legacy paths present, and valid TOML residue or extra entries rejected.

## Task 4: Zaključati stvarnu Hunspell kompenzacijsku kontrolu

**Files:**
- Modify: `vite.config.ts:280`
- Test: `tests/hunspell-nanoid-transform.test.ts`

**Interfaces:**
- Consumes: postojeće nepromijenjeno tijelo `fixHunspellNanoid()` i stvarne ESM datoteke iz zaključanog `node_modules` stabla.
- Produces: `export function fixHunspellNanoid()` dostupan testu, uz isto ime Vite plugina i isti runtime transform.

- [ ] **Step 1: Napraviti najmanju produkcijsku izmjenu — imenovani export factoryja**

Change exactly this declaration:

```ts
export function fixHunspellNanoid() {
```

Do not move the function, change `INLINE`, regexes, plugin order, `optimizeDeps` or build configuration.

- [ ] **Step 2: Pokrenuti stvarni transform tripwire i dokazati GREEN**

Run:

```powershell
npm run test -- --run tests/hunspell-nanoid-transform.test.ts
```

Expected: 3 tests PASS; actual Hunspell runtime import becomes browser default import, actual loader loses its nanoid import, `nanoid(45)` remains and inline generator returns exactly 45 allowed characters.

## Task 5: Integracijski gate, atomarni commit i PR provjera

**Files:**
- Verify: `scripts/security/npm-audit-policy.mjs`
- Verify: `tests/npm-audit-policy.test.ts`
- Verify: `tests/security-audit-workflow.test.ts`
- Verify: `tests/hunspell-nanoid-transform.test.ts`
- Verify: `.github/workflows/security-audit.yml`
- Verify: `vite.config.ts`
- Verify unchanged: `package.json`, `package-lock.json`, `tests/fixtures/repair-contract-v1/*`, `tests/__snapshots__/*`

**Interfaces:**
- Consumes: sva četiri prethodna zadatka i odobrenu specifikaciju.
- Produces: jedan provjeren implementation commit na `feature/repair-contract-v1`, push na isti branch i PR #38 sa svim zelenim checkovima.

- [ ] **Step 1: Pokrenuti sva tri ciljana regresijska testa zajedno**

Run:

```powershell
npm run test -- --run tests/npm-audit-policy.test.ts tests/security-audit-workflow.test.ts tests/hunspell-nanoid-transform.test.ts
```

Expected: all files and all tests PASS in one process.

- [ ] **Step 2: Pokrenuti stvarni lokalni produkcijski audit policy**

Run:

```powershell
node scripts/security/npm-audit-policy.mjs
```

Expected: exit 0 and either `Nema high/critical produkcijskih ranjivosti.` or the exact three-ID locked Hunspell message. Any network/registry error, new advisory or changed package graph is a fail-safe: stop and diagnose instead of broadening policy.

- [ ] **Step 3: Regenerirati javni Repair Contract fixture i dokazati nulti drift**

Run:

```powershell
npm run repair-contract-fixture
git diff --exit-code -- tests/fixtures/repair-contract-v1/valid-contract.json tests/fixtures/repair-contract-v1/public-key.spki.b64url
```

Expected: generator completes and Git reports no fixture diff.

- [ ] **Step 4: Pokrenuti puni AGENTS.md gate jednojezgreno na ovom Windows računalu**

Run:

```powershell
$current = [System.Diagnostics.Process]::GetCurrentProcess()
$current.ProcessorAffinity = [IntPtr]1
npm run check
```

Expected: `availableParallelism` inherited as 1, 322/322 Vitest files and 3902/3902 existing tests plus the newly added tests PASS, then Vite production build exits 0. Do not increase `testTimeout`/`hookTimeout` and do not use retry.

- [ ] **Step 5: Pokrenuti DOCX smoke i strict-open verifikaciju**

Run:

```powershell
npm run docx-smoke
npm run verify:strict-open
```

Expected: both exit 0; security-only change must not alter DOCX generation or package validity.

- [ ] **Step 6: Provjeriti diff, snapshot blobove i staged opseg**

Run:

```powershell
git diff --check
git hash-object --path=tests/__snapshots__/docx-golden.test.ts.snap tests/__snapshots__/docx-golden.test.ts.snap
git hash-object --path=tests/__snapshots__/repair-golden.test.ts.snap tests/__snapshots__/repair-golden.test.ts.snap
git hash-object --path=tests/__snapshots__/synthetic-golden.test.ts.snap tests/__snapshots__/synthetic-golden.test.ts.snap
git status --short
```

Expected normalized snapshot hashes remain:

```text
49d5e17c650dd644350dd5965a244b2670ae3034
35e2a2756e64ba3d415ce16eccab97dced374630
20d780d45cb6dbc4293997d9ad856d1d858e3dfc
```

Stage only the policy module, three new tests, workflow, Vite config and this plan if it is still uncommitted. Never stage the three CRLF-only snapshot modifications.

- [ ] **Step 7: Napraviti jedan atomarni implementation commit**

Run:

```powershell
git add -- scripts/security/npm-audit-policy.mjs tests/npm-audit-policy.test.ts tests/security-audit-workflow.test.ts tests/hunspell-nanoid-transform.test.ts .github/workflows/security-audit.yml vite.config.ts docs/superpowers/plans/2026-08-17-repair-contract-ci-security-gates.md
git diff --cached --check
git diff --cached --name-only
git commit -m "ci: enforce exact Repair Contract security policy"
```

Expected staged names contain only the seven listed files. If the plan was committed separately before execution, omit it from `git add`; do not amend unrelated history.

- [ ] **Step 8: Pushati samo feature branch i pratiti PR #38 do terminalnog stanja**

Run:

```powershell
git push origin feature/repair-contract-v1
gh pr checks 38 --watch --interval 20
```

Expected: both duplicated `security-audit / npm-audit` and `security-audit / Skeniranje tajni (gitleaks)` jobs are green on push and pull_request events, alongside UX, conformance, build-gate Node 20/24, docx-smoke, strict-open and GitGuardian.

- [ ] **Step 9: Fail-safe audit prije završne tvrdnje**

Run:

```powershell
gh pr view 38 --json headRefName,baseRefName,isDraft,mergeable,statusCheckRollup,url
git status --short
git log -2 --oneline
```

Expected: head remains `feature/repair-contract-v1`, base remains `design/wordreplica-one-time-runner`, PR remains draft unless the user separately authorizes promotion, all required checks are successful, and no implementation commit exists on `master`.

Do not promote or merge to `master` in this plan. Promotion is a later, separately authorized action after the repository's defined gate is satisfied.

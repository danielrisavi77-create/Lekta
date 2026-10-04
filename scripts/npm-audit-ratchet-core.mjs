// scripts/npm-audit-ratchet-core.mjs
//
// Ciste funkcije iza `npm run audit:ratchet`. Odvojene su da bi bile TESTIRLJIVE: sam skript zove
// `npm audit --json` i cita disk.
//
// STO SE PITA: je li broj high/critical nalaza u PUNOM grafu ovisnosti (runtime + build alati)
// narastao iznad zapisanog stropa. Produkcijski graf (`npm audit --omit=dev`) je zaseban i
// blokirajuci korak; ovaj se do 2026-09-09 samo ISPISIVAO u koraku s `continue-on-error`, pa je
// rast bio nevidljiv: komentar u workflowu tvrdio je 21 (2026-08-24), a stvarno je bilo 23.
// Vanjski audit 2026-09-08 (nalaz 6) to je imenovao kao dug koji zeleni workflow skriva.
//
// Ratchet, ne tvrdi gate: svih 23 su tranzitivni pod netlify-cli i vitest/vite i ne daju se
// popraviti bez odluke o nadogradnji tih alata, pa bi tvrdi gate trajno obojio CI crveno i naucio
// sve da ga ignoriraju (isti argument kao u security-audit.yml). Strop smije samo padati.

/**
 * Valjani `npm audit --json` odgovor ima objekt `vulnerabilities` (moze biti prazan).
 * Odgovor s `error`, bez tog polja, ili s ne-objektom, NIJE prazan graf — to je kvar mjerenja.
 * Bez ove granice `countHighCritical({error:...})` vraca 0 i ratchet laze "below".
 */
export function parseAuditResponse(raw) {
  let data = raw;
  if (typeof raw === 'string') {
    try {
      data = JSON.parse(raw);
    } catch {
      throw new Error('npm audit JSON nije parsabilan');
    }
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('npm audit odgovor nije objekt');
  }
  if (Object.prototype.hasOwnProperty.call(data, 'error') && data.error != null) {
    const detail = typeof data.error === 'object' ? (data.error.code || data.error.summary || JSON.stringify(data.error)) : String(data.error);
    throw new Error(`npm audit greska: ${detail}`);
  }
  if (!Object.prototype.hasOwnProperty.call(data, 'vulnerabilities')
      || typeof data.vulnerabilities !== 'object'
      || data.vulnerabilities === null
      || Array.isArray(data.vulnerabilities)) {
    throw new Error('npm audit odgovor nema valjan vulnerabilities objekt');
  }
  return data;
}

/** Imena paketa sa severity `high` ili `critical` u izlazu `npm audit --json`. */
export function highCriticalPackageNames(auditJson) {
  const v = auditJson && typeof auditJson === 'object' ? auditJson.vulnerabilities : null;
  if (!v || typeof v !== 'object') return [];
  return Object.entries(v)
    .filter(([, finding]) => finding && (finding.severity === 'high' || finding.severity === 'critical'))
    .map(([name]) => name)
    .sort();
}

/** Broj ranjivih IMENA paketa. npm audit ima jedan zapis po imenu, ne po fizickoj putanji. */
export function countHighCritical(auditJson) {
  return highCriticalPackageNames(auditJson).length;
}

/**
 * Presuda: `above` kad je izmjereno iznad stropa (pad), `below` kad je ispod (strop treba spustiti),
 * `equal` kad je jednako. Strop koji nije konacan broj je `above`, jer ratchet bez broja nista ne drzi.
 */
export function compareToRatchet(count, ratchet) {
  const ceiling = Number(ratchet?.fullGraphHighCritical);
  if (!Number.isFinite(count) || !Number.isFinite(ceiling)) {
    return { verdict: 'above', delta: NaN, ceiling, count };
  }
  const delta = count - ceiling;
  return { verdict: delta > 0 ? 'above' : delta < 0 ? 'below' : 'equal', delta, ceiling, count };
}

const HIGH_CRITICAL = new Set(['high', 'critical']);
const GHSA_URL = /\/(GHSA(?:-[0-9a-z]{4}){3})$/i;
const GHSA_ID = /^GHSA(?:-[0-9a-z]{4}){3}$/;

/**
 * Parovi (paket, GHSA advisory) za high/critical pakete (T93, Codex R1 na #246). `npm audit --json`
 * paketu s izravnim advisoryjem daje u `via` objekt s URL-om advisoryja, a tranzitivnom paketu samo ime
 * drugog paketa; tranzitivni paket nasljeduje advisoryje high/critical paketa kroz koje je ranjiv.
 * Paket ide u `unresolved` kad mu se pokrice ne moze provjeriti: nema ijednog prepoznatog GHSA id-a,
 * ili ima barem jedan high/critical advisory bez prepoznatog id-a (izravno ili kroz `via`). Drugi
 * slucaj je Codex R1 na #282: prepoznat GHSA uz neprepoznat advisory na istom paketu prije je tiho
 * zatvarao neprepoznati.
 *
 * Tranzitivni skupovi se racunaju zatvaranjem do fiksne tocke, ne rekurzijom s globalnim memoom:
 * memo je u ciklusu (a kroz b, b kroz a) spremao skup nastao prekidom ciklusa, pa je par `b A`
 * nedostajao (Codex R2 na #282).
 */
export function highCriticalAdvisoryPairs(auditJson) {
  const v = auditJson && typeof auditJson === 'object' ? auditJson.vulnerabilities : null;
  const vulns = v && typeof v === 'object' ? v : {};
  const names = highCriticalPackageNames(auditJson);
  // Po paketu: prepoznati GHSA id-ovi, ima li nerazrijesen high/critical advisory, i high/critical
  // paketi iz `via` kroz koje je ranjiv.
  const advisories = new Map();
  const problem = new Map();
  const through = new Map();
  for (const name of names) {
    const own = new Set();
    let bad = false;
    const deps = [];
    for (const entry of Array.isArray(vulns[name]?.via) ? vulns[name].via : []) {
      if (typeof entry === 'string') {
        if (HIGH_CRITICAL.has(vulns[entry]?.severity)) deps.push(entry);
      } else if (entry && typeof entry === 'object' && HIGH_CRITICAL.has(entry.severity)) {
        const m = GHSA_URL.exec(String(entry.url ?? ''));
        if (m) own.add(m[1]);
        else bad = true;
      }
    }
    advisories.set(name, own);
    problem.set(name, bad);
    through.set(name, deps);
  }
  // Zatvaranje do fiksne tocke: svaki prolaz prenosi advisoryje i nerazrijesenost s paketa iz `via`;
  // skupovi samo rastu i konacni su, pa petlja staje.
  for (let changed = true; changed;) {
    changed = false;
    for (const name of names) {
      const own = advisories.get(name);
      for (const dep of through.get(name)) {
        for (const a of advisories.get(dep) ?? []) if (!own.has(a)) { own.add(a); changed = true; }
        if (problem.get(dep) && !problem.get(name)) { problem.set(name, true); changed = true; }
      }
    }
  }
  const pairs = [];
  const unresolved = [];
  for (const name of names) {
    const list = [...advisories.get(name)].sort();
    if (list.length === 0 || problem.get(name)) unresolved.push(name);
    for (const advisory of list) pairs.push(`${name} ${advisory}`);
  }
  return { pairs, unresolved };
}

/** Parovi `paket GHSA` koje pokrivaju iznimke: paket iz `packages` uz svaki advisory iz `advisories`. */
function coveredPairs(ratchet) {
  const out = new Set();
  for (const exception of Array.isArray(ratchet?.exceptions) ? ratchet.exceptions : []) {
    const packages = Array.isArray(exception?.packages) ? exception.packages : [];
    const advisories = Array.isArray(exception?.advisories) ? exception.advisories : [];
    for (const name of packages) for (const advisory of advisories) out.add(`${name} ${advisory}`);
  }
  return out;
}

/**
 * Sinteticki `npm audit --json` za zadana imena: svaki paket dobiva izravne advisoryje iz iznimaka koje
 * ga pokrivaju (ili `extra` po imenu). Sluzi selftestu i mutacijama da ne ovise o mrezi.
 */
export function syntheticAudit(ratchet, names, extra = {}) {
  const byPackage = new Map();
  for (const exception of Array.isArray(ratchet?.exceptions) ? ratchet.exceptions : []) {
    for (const name of Array.isArray(exception?.packages) ? exception.packages : []) {
      const list = byPackage.get(name) ?? [];
      list.push(...(Array.isArray(exception?.advisories) ? exception.advisories : []));
      byPackage.set(name, list);
    }
  }
  const via = (name) => [...(byPackage.get(name) ?? []), ...(extra[name] ?? [])]
    .map((id) => ({ severity: 'high', url: `https://github.com/advisories/${id}` }));
  return { vulnerabilities: Object.fromEntries(names.map((name) => [name, { severity: 'high', via: via(name) }])) };
}

/**
 * Usporedi broj, IDENTITET paketa i ADVISORY (T93). Sam broj ne vidi zamjenu jednog prihvacenog nalaza
 * novim nalazom; samo ime paketa ne vidi NOVI advisory na vec prihvacenom paketu. Par (paket, GHSA)
 * bez iznimke koja navodi upravo taj advisory je `above`, kao i paket bez prepoznatog GHSA id-a.
 */
export function compareAuditToRatchet(auditJson, ratchet) {
  const parsed = parseAuditResponse(auditJson);
  const packages = highCriticalPackageNames(parsed);
  const expected = Array.isArray(ratchet?.fullGraphHighCriticalPackages)
    ? [...ratchet.fullGraphHighCriticalPackages].filter((name) => typeof name === 'string').sort()
    : [];
  const base = compareToRatchet(packages.length, ratchet);
  const unexpectedPackages = packages.filter((name) => !expected.includes(name));
  const resolvedPackages = expected.filter((name) => !packages.includes(name));
  const { pairs, unresolved } = highCriticalAdvisoryPairs(parsed);
  const covered = coveredPairs(ratchet);
  const uncoveredPairs = pairs.filter((pair) => !covered.has(pair));
  const unresolvedPackages = unresolved;
  const result = { ...base, packages, unexpectedPackages, resolvedPackages, uncoveredPairs, unresolvedPackages };

  if (expected.length !== Number(ratchet?.fullGraphHighCritical) || unexpectedPackages.length > 0 ||
      uncoveredPairs.length > 0 || unresolvedPackages.length > 0) {
    return { ...result, verdict: 'above' };
  }
  return result;
}

function isoDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`));
}

/** Strukturna provjera prihvacenog duga: svaki nalaz mora imati vlasnika, mitigaciju i rok. */
export function validateRatchet(ratchet, { today = new Date().toISOString().slice(0, 10) } = {}) {
  const problems = [];
  const expected = Array.isArray(ratchet?.fullGraphHighCriticalPackages)
    ? ratchet.fullGraphHighCriticalPackages
    : [];
  const uniqueExpected = [...new Set(expected)];
  if (expected.length !== Number(ratchet?.fullGraphHighCritical)) {
    problems.push('fullGraphHighCriticalPackages ne odgovara stropu');
  }
  if (uniqueExpected.length !== expected.length || [...expected].sort().some((name, i) => name !== expected[i])) {
    problems.push('fullGraphHighCriticalPackages mora biti sortiran popis bez duplikata');
  }

  const covered = new Map();
  const pairOwner = new Map();
  const exceptions = Array.isArray(ratchet?.exceptions) ? ratchet.exceptions : [];
  for (const [index, exception] of exceptions.entries()) {
    const label = `exceptions[${index}]`;
    if (typeof exception?.owner !== 'string' || !exception.owner.trim()) problems.push(`${label}.owner nedostaje`);
    if (typeof exception?.mitigation !== 'string' || !exception.mitigation.trim()) problems.push(`${label}.mitigation nedostaje`);
    if (!isoDate(exception?.expiresOn)) problems.push(`${label}.expiresOn nije ISO datum`);
    else if (exception.expiresOn < today) problems.push(`${label} je istekla ${exception.expiresOn}`);
    if (!isoDate(exception?.nextReviewOn)) problems.push(`${label}.nextReviewOn nije ISO datum`);
    else {
      if (exception.nextReviewOn < today) problems.push(`${label} kasni za pregled od ${exception.nextReviewOn}`);
      if (isoDate(exception?.expiresOn) && exception.nextReviewOn > exception.expiresOn) {
        problems.push(`${label} ima pregled nakon isteka`);
      }
    }
    if (!Array.isArray(exception?.advisories) || exception.advisories.length === 0) {
      problems.push(`${label}.advisories je prazan (iznimka pokriva advisory, ne samo ime paketa)`);
    } else {
      for (const advisory of exception.advisories) {
        if (typeof advisory !== 'string' || !GHSA_ID.test(advisory)) problems.push(`${label}.advisories ima nevaljan GHSA id ${JSON.stringify(advisory)}`);
      }
    }
    if (!Array.isArray(exception?.packages) || exception.packages.length === 0) {
      problems.push(`${label}.packages je prazan`);
      continue;
    }
    for (const name of exception.packages) {
      covered.set(name, (covered.get(name) ?? 0) + 1);
      for (const advisory of Array.isArray(exception?.advisories) ? exception.advisories : []) {
        const pair = `${name} ${advisory}`;
        if (pairOwner.has(pair)) problems.push(`${pair} je pokriven u ${pairOwner.get(pair)} i ${label}`);
        else pairOwner.set(pair, label);
      }
    }
  }
  // Paket smije biti u vise iznimki (po jedna po advisoryju), ali par (paket, advisory) samo u jednoj.
  for (const name of expected) {
    if (!covered.has(name)) problems.push(`${name} nema iznimku`);
  }
  for (const name of covered.keys()) {
    if (!expected.includes(name)) problems.push(`${name} je iznimka bez aktivnog nalaza`);
  }
  return problems;
}

/** Poruka za dnevnik i sazetak; bez em crtica. */
export function formatVerdict(status) {
  const { verdict, count, ceiling, unexpectedPackages = [] } = status;
  if (verdict === 'above') {
    const identities = unexpectedPackages.length ? ` Novi identiteti: ${unexpectedPackages.join(', ')}.` : '';
    const pairs = status.uncoveredPairs?.length ? ` Advisory bez iznimke (paket GHSA): ${status.uncoveredPairs.join('; ')}.` : '';
    const unresolved = status.unresolvedPackages?.length ? ` Bez prepoznatog GHSA id-a: ${status.unresolvedPackages.join(', ')}.` : '';
    return `FAIL: pun graf ima ${count} high/critical, strop je ${ceiling}.${identities}${pairs}${unresolved} Rast nije dopusten; ili popravi, ili svjesno digni strop uz changeNote.`;
  }
  if (verdict === 'below') return `OK, ali strop je previsok: izmjereno ${count}, strop ${ceiling}. Spusti fullGraphHighCritical u data/security/npm-audit-ratchet.json.`;
  return `OK: pun graf ima ${count} high/critical, jednako stropu.`;
}

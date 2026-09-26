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

/**
 * Usporedi i broj i IDENTITET. Sam broj ne vidi zamjenu jednog prihvacenog nalaza novim nalazom,
 * sto je vec izmjeren kvar iste klase u citatnim dosjeima.
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

  if (expected.length !== Number(ratchet?.fullGraphHighCritical) || unexpectedPackages.length > 0) {
    return { ...base, verdict: 'above', packages, unexpectedPackages, resolvedPackages };
  }
  return { ...base, packages, unexpectedPackages, resolvedPackages };
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
    if (!Array.isArray(exception?.packages) || exception.packages.length === 0) {
      problems.push(`${label}.packages je prazan`);
      continue;
    }
    for (const name of exception.packages) covered.set(name, (covered.get(name) ?? 0) + 1);
  }
  for (const name of expected) {
    if (!covered.has(name)) problems.push(`${name} nema iznimku`);
    else if (covered.get(name) !== 1) problems.push(`${name} je pokriven s ${covered.get(name)} iznimki`);
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
    return `FAIL: pun graf ima ${count} high/critical, strop je ${ceiling}.${identities} Rast nije dopusten; ili popravi, ili svjesno digni strop uz changeNote.`;
  }
  if (verdict === 'below') return `OK, ali strop je previsok: izmjereno ${count}, strop ${ceiling}. Spusti fullGraphHighCritical u data/security/npm-audit-ratchet.json.`;
  return `OK: pun graf ima ${count} high/critical, jednako stropu.`;
}

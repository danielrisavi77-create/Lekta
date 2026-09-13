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

/** Broj ranjivosti sa severity `high` ili `critical` u izlazu `npm audit --json`. */
export function countHighCritical(auditJson) {
  const v = auditJson && typeof auditJson === 'object' ? auditJson.vulnerabilities : null;
  if (!v || typeof v !== 'object') return 0;
  return Object.values(v).filter((x) => x && (x.severity === 'high' || x.severity === 'critical')).length;
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

/** Poruka za dnevnik i sazetak; bez em crtica. */
export function formatVerdict(status) {
  const { verdict, count, ceiling } = status;
  if (verdict === 'above') return `FAIL: pun graf ima ${count} high/critical, strop je ${ceiling}. Rast nije dopusten; ili popravi, ili svjesno digni strop uz changeNote.`;
  if (verdict === 'below') return `OK, ali strop je previsok: izmjereno ${count}, strop ${ceiling}. Spusti fullGraphHighCritical u data/security/npm-audit-ratchet.json.`;
  return `OK: pun graf ima ${count} high/critical, jednako stropu.`;
}

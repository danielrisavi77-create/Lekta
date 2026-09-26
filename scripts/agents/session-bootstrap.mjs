#!/usr/bin/env node
/**
 * SessionStart bootstrap ispis, BEZ modela (korak 1 data-driven routinga).
 *
 * Ovaj hook ne bira providera ni model; to radi routing tek kad je zadatak poznat
 * (`config/agent-routing.json`, `docs/agents/ROUTING.md`). Zadatak hooka je samo orijentacija:
 * najvise 12 redaka o stanju stabla, otvorenim PR-ovima, aktivnim testnim procesima, resursima,
 * koordinatoru i slobodnim zadacima u redu.
 *
 * `formatBootstrap` je cista funkcija: prima vec prikupljene ulaze i vraca niz redaka. Ne poziva
 * git/gh/os sama, pa je test za nju deterministican i ne ovisi o okolini (uklj. slucaj kad `gh`
 * nedostaje).
 */

/**
 * @typedef {Object} BootstrapInputs
 * @property {string|null} masterSha - kratki SHA mastera, ili null ako se ne moze utvrditi.
 * @property {boolean|null} treeClean - je li radno stablo cisto; null ako se ne moze utvrditi.
 * @property {{ number: number, title: string }[] | null} openPrs - otvoreni PR-ovi; null ako `gh`
 *   nije dostupan (razlikuje se od praznog niza, koji znaci "gh dostupan, nula otvorenih PR-ova").
 * @property {number|null} testProcessCount - broj aktivnih vitest/playwright procesa; null ako se
 *   ne moze izmjeriti (fail-open: bootstrap i dalje ispisuje ostatak).
 * @property {{ freeMemGb: number, freeDiskGb: number }|null} resources - slobodni RAM/disk u GB.
 * @property {{ name: string, source: string }|null} coordinator - trenutni koordinator i odakle je
 *   procitan (npr. "docs/agents/README.md" ili "tasks.json statusNote").
 * @property {{ id: string, title: string }[]} readyUnownedTasks - zadaci sa statusom 'ready' bez
 *   `owner` polja.
 */

/**
 * @param {BootstrapInputs} inputs
 * @returns {string[]} najvise 12 redaka, spremnih za ispis (jedan redak = jedan element).
 */
export function formatBootstrap(inputs) {
  const lines = [];

  lines.push(
    inputs.masterSha
      ? `master: ${inputs.masterSha}`
      : 'master: nepoznato (git nedostupan ili je upit pao)',
  );

  if (inputs.treeClean === null || inputs.treeClean === undefined) {
    lines.push('stablo: nepoznato');
  } else {
    lines.push(inputs.treeClean ? 'stablo: cisto' : 'stablo: ima nespremljenih izmjena');
  }

  if (inputs.openPrs === null || inputs.openPrs === undefined) {
    lines.push('PR-ovi: gh nedostupan');
  } else if (inputs.openPrs.length === 0) {
    lines.push('PR-ovi: nema otvorenih');
  } else {
    const preview = inputs.openPrs
      .slice(0, 3)
      .map((pr) => `#${pr.number} ${pr.title}`)
      .join('; ');
    const more = inputs.openPrs.length > 3 ? ` (+${inputs.openPrs.length - 3} jos)` : '';
    lines.push(`PR-ovi otvoreni: ${preview}${more}`);
  }

  lines.push(
    inputs.testProcessCount === null || inputs.testProcessCount === undefined
      ? 'testni procesi: nije izmjereno'
      : `testni procesi (vitest/playwright): ${inputs.testProcessCount}`,
  );

  // freeMemGb i freeDiskGb se mjere odvojeno i svaki moze zasebno biti `null` (nemjerljivo) ili
  // `0` (izmjereno, doslovno nula). Kad je jedna polovica nepoznata, izostavi samo tu polovicu
  // retka umjesto da cijeli redak padne na "nepoznato".
  const mem = inputs.resources?.freeMemGb;
  const disk = inputs.resources?.freeDiskGb;
  const memKnown = typeof mem === 'number' && Number.isFinite(mem);
  const diskKnown = typeof disk === 'number' && Number.isFinite(disk);
  if (memKnown && diskKnown) {
    lines.push(`resursi: ${mem.toFixed(1)} GB RAM, ${disk.toFixed(1)} GB disk slobodno`);
  } else if (memKnown) {
    lines.push(`resursi: ${mem.toFixed(1)} GB RAM`);
  } else if (diskKnown) {
    lines.push(`resursi: ${disk.toFixed(1)} GB disk slobodno`);
  } else {
    lines.push('resursi: nepoznato');
  }

  lines.push(
    inputs.coordinator
      ? `koordinator: ${inputs.coordinator.name} (izvor: ${inputs.coordinator.source})`
      : 'koordinator: nepoznato',
  );

  if (inputs.readyUnownedTasks.length === 0) {
    lines.push('zadaci ready bez ownera: nema');
  } else {
    const preview = inputs.readyUnownedTasks
      .slice(0, 5)
      .map((task) => `${task.id} ${task.title}`)
      .join('; ');
    const more = inputs.readyUnownedTasks.length > 5 ? ` (+${inputs.readyUnownedTasks.length - 5} jos)` : '';
    lines.push(`zadaci ready bez ownera: ${preview}${more}`);
  }

  return lines.slice(0, 12);
}

/**
 * Broji retke naredbenog retka (PowerShell `Get-CimInstance ... CommandLine` ili `wmic process
 * ... get CommandLine` izlaz, jedan proces po retku) koji spominju vitest ili playwright.
 *
 * Cista funkcija radi testiranja bez OS poziva. `null`/`undefined` ulaz (mjerenje nije uspjelo)
 * vraca `null`, nikad `0`; `0` znaci "izmjereno, nula procesa".
 *
 * @param {string|null|undefined} commandLineOutput
 * @returns {number|null}
 */
export function countTestProcesses(commandLineOutput) {
  if (commandLineOutput === null || commandLineOutput === undefined) return null;
  return commandLineOutput
    .split('\n')
    .filter((line) => /vitest|playwright/i.test(line)).length;
}

async function collectInputsAndPrint() {
  const { execFileSync } = await import('node:child_process');
  const { readFileSync, statfsSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const os = await import('node:os');

  const root = fileURLToPath(new URL('../../', import.meta.url));

  function tryExec(command, args) {
    try {
      return execFileSync(command, args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch {
      return null;
    }
  }

  const masterSha = tryExec('git', ['rev-parse', '--short', 'origin/master'])
    ?? tryExec('git', ['rev-parse', '--short', 'HEAD']);

  const statusOutput = tryExec('git', ['status', '--porcelain']);
  const treeClean = statusOutput === null ? null : statusOutput.length === 0;

  let openPrs = null;
  const ghOutput = tryExec('gh', ['pr', 'list', '--json', 'number,title', '--limit', '20']);
  if (ghOutput !== null) {
    try {
      openPrs = JSON.parse(ghOutput);
    } catch {
      openPrs = null;
    }
  }

  let testProcessCount = null;
  try {
    if (process.platform === 'win32') {
      // `tasklist /FO CSV /NH` ne daje naredbeni redak (samo ime procesa), pa je brojac
      // vitest/playwright procesa uvijek bio 0 na Windowsu, bez obzira je li ista uistinu radilo.
      // TO JE BILA LAZNA NULA. Get-CimInstance daje CommandLine; wmic je fallback za starije
      // sustave. Kad ni jedno ne uspije, mjerenje ostaje `null` (nikad izmisljena nula).
      let out = tryExec('powershell', [
        '-NoProfile', '-NonInteractive', '-Command',
        "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Select-Object -ExpandProperty CommandLine",
      ]);
      if (out === null) {
        out = tryExec('wmic', ['process', 'where', "name='node.exe'", 'get', 'CommandLine']);
      }
      testProcessCount = countTestProcesses(out);
    } else {
      const out = tryExec('ps', ['-eo', 'command']);
      testProcessCount = countTestProcesses(out);
    }
  } catch {
    testProcessCount = null;
  }

  let freeMemGb = null;
  try {
    freeMemGb = os.freemem() / 1024 ** 3;
  } catch {
    freeMemGb = null;
  }

  let freeDiskGb = null;
  try {
    // `fs.statfsSync` (Node >= 18.15) daje slobodne blokove na particiji korijena repoa.
    // Prijasnja verzija nije imala prijenosan nacin mjeriti disk pa je uvijek ispisivala 0.0 GB,
    // sto izgleda identicno stvarno praznom disku. `null` kad mjerenje ne uspije, nikad 0.
    if (typeof statfsSync === 'function') {
      const stats = statfsSync(root);
      freeDiskGb = (Number(stats.bavail) * Number(stats.bsize)) / 1024 ** 3;
    }
  } catch {
    freeDiskGb = null;
  }

  const resources = (freeMemGb !== null || freeDiskGb !== null) ? { freeMemGb, freeDiskGb } : null;

  let coordinator = null;
  try {
    const readme = readFileSync(new URL('../../docs/agents/README.md', import.meta.url), 'utf8');
    const match = readme.match(/Jedan aktivni koordinator[^\n]*/);
    coordinator = { name: 'vidi docs/agents/README.md', source: 'docs/agents/README.md' };
    void match;
  } catch {
    coordinator = null;
  }

  let readyUnownedTasks = [];
  try {
    const tasksRaw = readFileSync(new URL('../../docs/agents/tasks.json', import.meta.url), 'utf8');
    const parsed = JSON.parse(tasksRaw);
    readyUnownedTasks = (parsed.tasks ?? [])
      .filter((task) => task.status === 'ready' && !task.owner)
      .map((task) => ({ id: task.id, title: task.title }));
  } catch {
    readyUnownedTasks = [];
  }

  const lines = formatBootstrap({
    masterSha,
    treeClean,
    openPrs,
    testProcessCount,
    resources,
    coordinator,
    readyUnownedTasks,
  });

  for (const line of lines) {
    // eslint-disable-next-line no-console
    console.log(line);
  }
}

// CLI omotac: pokreni ispis samo kad je datoteka pozvana direktno (`node .../session-bootstrap.mjs`),
// ne kad je uvezena radi `formatBootstrap` (test je uvijek uvoz, nikad direktan poziv).
const isDirectRun = (process.argv[1] ?? '').replace(/\\/g, '/').endsWith('scripts/agents/session-bootstrap.mjs');

if (isDirectRun) {
  collectInputsAndPrint();
}

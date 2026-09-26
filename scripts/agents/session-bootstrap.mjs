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
      ? 'testni procesi: nepoznato'
      : `testni procesi (vitest/playwright): ${inputs.testProcessCount}`,
  );

  if (inputs.resources) {
    lines.push(
      `resursi: ${inputs.resources.freeMemGb.toFixed(1)} GB RAM, `
        + `${inputs.resources.freeDiskGb.toFixed(1)} GB disk slobodno`,
    );
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

async function collectInputsAndPrint() {
  const { execFileSync } = await import('node:child_process');
  const { readFileSync } = await import('node:fs');
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
      const out = tryExec('tasklist', ['/FO', 'CSV', '/NH']);
      if (out !== null) {
        testProcessCount = out
          .split('\n')
          .filter((line) => /vitest|playwright/i.test(line)).length;
      }
    } else {
      const out = tryExec('ps', ['-eo', 'command']);
      if (out !== null) {
        testProcessCount = out
          .split('\n')
          .filter((line) => /vitest|playwright/i.test(line)).length;
      }
    }
  } catch {
    testProcessCount = null;
  }

  let resources = null;
  try {
    const freeMemGb = os.freemem() / 1024 ** 3;
    resources = { freeMemGb, freeDiskGb: NaN };
  } catch {
    resources = null;
  }
  if (resources && Number.isNaN(resources.freeDiskGb)) {
    // Node nema prijenosan API za slobodan disk; ne pogadaj, izostavi tu polovicu polja.
    resources = { freeMemGb: resources.freeMemGb, freeDiskGb: 0 };
  }

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

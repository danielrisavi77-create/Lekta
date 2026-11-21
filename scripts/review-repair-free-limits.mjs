import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const LIMITS = [
  ['REPAIR_FREE_DAILY_CAP', 'FREE_DAILY_CAP', 'statusi free i repair_failed po korisniku u pomičnom prozoru od 24 sata'],
  ['REPAIR_FREE_IP_DAILY_CAP', 'FREE_IP_DAILY_CAP', 'statusi free i repair_failed po IP adresi u pomičnom prozoru od 24 sata'],
  ['REPAIR_UNCOUNTED_DAILY_CAP', 'REPAIR_UNCOUNTED_DAILY_CAP', 'ishodi bez potrošnje kvote po korisniku u pomičnom prozoru od 24 sata'],
];

function sourceLine(source, symbol) {
  const prefix = 'const ' + symbol + ' =';
  return source.split(/\r?\n/).find((line) => line.trim().startsWith(prefix));
}

function readNumericDefault(source, envName, symbol) {
  const line = sourceLine(source, symbol);
  const match = line?.match(/Deno\.env\.get\(['"]([A-Z0-9_]+)['"]\)\s*\?\?\s*(['"])(\d+)\2/);
  if (!match || match[1] !== envName) {
    throw new Error('Could not read code default for ' + envName + ' from repair-docx/index.ts');
  }
  const value = Number(match[3]);
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error('Invalid code default for ' + envName);
  }
  return value;
}

export function extractRepairFreeLimitDefaults(source) {
  const modeLine = sourceLine(source, 'FREE_MODE');
  if (!modeLine || !/Deno\.env\.get\(['"]REPAIR_FREE_MODE['"]\)\s*===\s*['"]true['"]/.test(modeLine)) {
    throw new Error('Could not verify REPAIR_FREE_MODE exact-true behavior in repair-docx/index.ts');
  }

  return [
    {
      name: 'REPAIR_FREE_MODE',
      value: 'isključen osim ako je vrijednost točno true',
      scope: 'Uključuje besplatni put popravka',
    },
    ...LIMITS.map(([envName, symbol, scope]) => ({
      name: envName,
      value: readNumericDefault(source, envName, symbol),
      scope,
    })),
  ];
}

export function formatReport(limits) {
  const rows = limits.map((limit) => '  ' + limit.name + ': ' + limit.value + ' (' + limit.scope + ')');
  return [
    'Limiti popravka prema trenutačnom izvornom kodu',
    ...rows,
    '',
    'Ovo su zadane vrijednosti iz koda, a ne žive Supabase vrijednosti. Skripta ne čita tajne,',
    'objavljenu verziju funkcije, brojače baze, naplatu ni alarme troška.',
    'Vlasnik prije go/no-go zasebno provjerava žive postavke i alarme troška.',
  ].join('\n');
}

function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const source = readFileSync(resolve(root, 'supabase/functions/repair-docx/index.ts'), 'utf8');
  console.log(formatReport(extractRepairFreeLimitDefaults(source)));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();

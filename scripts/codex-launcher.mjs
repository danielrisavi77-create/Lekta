#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { pathToFileURL } from "node:url";

export const MODES = Object.freeze({
  economy: {
    label: "Economy",
    model: "gpt-5.6-luna",
    effort: "low",
    use: "jasni, ponovljivi i manji zadaci",
  },
  balanced: {
    label: "Balanced",
    model: "gpt-5.6-terra",
    effort: "medium",
    use: "svakodnevni razvoj, testovi i fokusirani review",
  },
  deep: {
    label: "Deep",
    model: "gpt-5.6-sol",
    effort: "high",
    use: "arhitektura, sigurnost i slozeni visekoracni zadaci",
  },
});

export function parseArgs(argv) {
  const options = { mode: null, dryRun: false, forwarded: [], help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--") {
      options.forwarded.push(...argv.slice(index + 1));
      break;
    }
    if (value === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (value === "--mode") {
      options.mode = argv[++index] ?? null;
      continue;
    }
    if (value === "--help" || value === "-h") {
      options.help = true;
      continue;
    }
    throw new Error(`Nepoznat argument: ${value}`);
  }
  if (options.mode && !Object.hasOwn(MODES, options.mode)) {
    throw new Error(`Nepoznat nacin rada: ${options.mode}`);
  }
  return options;
}

export function codexArgs(mode, forwarded = []) {
  const selected = MODES[mode];
  if (!selected) throw new Error(`Nepoznat nacin rada: ${mode}`);
  return [
    "-m",
    selected.model,
    "-c",
    `model_reasoning_effort=\"${selected.effort}\"`,
    ...forwarded,
  ];
}

async function chooseMode() {
  if (!stdin.isTTY || !stdout.isTTY) {
    throw new Error("U neinteraktivnom pozivu zadajte --mode economy|balanced|deep");
  }
  stdout.write("Odaberite Codex profil za novu sesiju:\n\n");
  const keys = Object.keys(MODES);
  keys.forEach((key, index) => {
    const item = MODES[key];
    stdout.write(`${index + 1}. ${item.label}: ${item.model}, ${item.effort}, ${item.use}\n`);
  });
  const prompt = createInterface({ input: stdin, output: stdout });
  const answer = (await prompt.question("\nOdabir [2]: ")).trim() || "2";
  prompt.close();
  const position = Number.parseInt(answer, 10) - 1;
  if (!Number.isInteger(position) || !keys[position]) throw new Error("Odabir nije valjan");
  return keys[position];
}

function usage() {
  stdout.write("Uporaba:\n  npm run codex -- --mode economy\n  npm run codex -- --mode deep -- --cd C:\\putanja\n\nBez --mode launcher prikazuje interaktivni izbornik.\n");
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      usage();
      return;
    }
    const mode = options.mode ?? await chooseMode();
    const args = codexArgs(mode, options.forwarded);
    const selected = MODES[mode];
    stdout.write(`Pokrecem ${selected.label}: ${selected.model}, reasoning ${selected.effort}\n`);
    if (options.dryRun) {
      stdout.write(`${JSON.stringify(["codex", ...args])}\n`);
      return;
    }
    const command = process.platform === "win32" ? "codex.cmd" : "codex";
    const result = spawnSync(command, args, { stdio: "inherit", shell: false });
    if (result.error) throw result.error;
    process.exitCode = result.status ?? 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}

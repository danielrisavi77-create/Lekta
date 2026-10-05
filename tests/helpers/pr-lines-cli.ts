/**
 * Stvarni CLI `scripts/agents/pr-lines.mjs --provjeri` nad privremenim git repozitorijem (Dependabot
 * iznimka, Codex #290 nalaz 2). Izvor skripte se zadaje kao tekst, pa ga mutacijski test smije promijeniti
 * u izoliranoj kopiji; skripta uvozi samo node module, pa kopija radi bez repozitorija.
 *
 * Repozitorij ima bazni commit (`baza`) i tri heada:
 * - `bump`: vite 7.1.0 -> 7.1.2 u package.json i package-lock.json (podrzani manifesti, nema nove ovisnosti)
 * - `nova`: dodaje zod u package.json (nova ovisnost)
 * - `requirements`: dodaje requirements.txt (manifest koji iznimka ne podrzava)
 */
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const PR_LINES_IZVOR = readFileSync(join(__dirname, '..', '..', 'scripts', 'agents', 'pr-lines.mjs'), 'utf8');

export type PrLinesHead = 'bump' | 'nova' | 'requirements';
export interface PrLinesAutor { login: string; type: string }
export interface PrLinesIshod { status: number | null; stdout: string }

const DEPENDABOT: PrLinesAutor = { login: 'dependabot[bot]', type: 'Bot' };
const LJUDSKI: PrLinesAutor = { login: 'danielrisavi77-create', type: 'User' };
const LAZNI_TIP: PrLinesAutor = { login: 'dependabot[bot]', type: 'User' };

function git(repo: string, ...args: string[]): void {
  execFileSync('git', ['-c', 'user.email=test@lekta.invalid', '-c', 'user.name=test', '-c', 'commit.gpgsign=false', ...args], {
    cwd: repo,
    stdio: 'ignore',
  });
}

function paket(deps: Record<string, string>): string {
  return `${JSON.stringify({ name: 'x', dependencies: deps }, null, 2)}\n`;
}

/** Privremeni repozitorij s refovima `baza`, `bump`, `nova` i `requirements`. Pozivatelj ga brise s `rmSync`. */
export function napraviPrLinesRepo(): string {
  const repo = mkdtempSync(join(tmpdir(), 'lekta-pr-lines-'));
  git(repo, 'init', '-q');
  writeFileSync(join(repo, 'package.json'), paket({ vite: '7.1.0' }));
  writeFileSync(join(repo, 'package-lock.json'), '{"lockfileVersion":3,"vite":"7.1.0"}\n');
  writeFileSync(join(repo, 'README.md'), 'x\n');
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'baza');
  git(repo, 'tag', 'baza');
  const grana = (ime: string, promjena: () => void) => {
    git(repo, 'checkout', '-q', '-b', ime, 'baza');
    promjena();
    git(repo, 'add', '-A');
    git(repo, 'commit', '-q', '-m', ime);
  };
  grana('bump', () => {
    writeFileSync(join(repo, 'package.json'), paket({ vite: '7.1.2' }));
    writeFileSync(join(repo, 'package-lock.json'), '{"lockfileVersion":3,"vite":"7.1.2"}\n');
  });
  grana('nova', () => writeFileSync(join(repo, 'package.json'), paket({ vite: '7.1.0', zod: '3.23.0' })));
  grana('requirements', () => writeFileSync(join(repo, 'requirements.txt'), 'requests==2.32.3\n'));
  return repo;
}

/** Pokrece zadani izvor skripte kao `--provjeri baza <head>` s autorom i tijelom PR-a iz okoline. */
export function pokreniPrLinesCli(izvor: string, repo: string, head: PrLinesHead, autor: PrLinesAutor, body = ''): PrLinesIshod {
  const dir = mkdtempSync(join(tmpdir(), 'lekta-pr-lines-skripta-'));
  try {
    const skripta = join(dir, 'pr-lines.mjs');
    writeFileSync(skripta, izvor);
    const r = spawnSync(process.execPath, [skripta, '--provjeri', 'baza', head], {
      cwd: repo,
      encoding: 'utf8',
      env: { PATH: process.env.PATH ?? '', PR_BODY: body, PR_AUTHOR: autor.login, PR_AUTHOR_TYPE: autor.type },
    });
    return { status: r.status, stdout: `${r.stdout ?? ''}${r.stderr ?? ''}`.replace(/\r/g, '') };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Tvrdnja garda nad stvarnim CLI-jem za zadani izvor:
 * - Dependabot bez redaka, bump u podrzanim manifestima: izlaz 0, `Nove ovisnosti: nema`, bump zasebno;
 * - Dependabot bez redaka, nova ovisnost: izlaz 0, `Nove ovisnosti: zod@3.23.0`;
 * - isti opis s ljudskim autorom: izlaz 1;
 * - login Dependabota s tipom User: izlaz 1;
 * - Dependabot koji mijenja requirements.txt: izlaz 1 (provjera ne tvrdi `nema` za manifest koji ne cita).
 */
export function dependabotIznimkaDrzi(izvor: string, repo: string): boolean {
  const bot = pokreniPrLinesCli(izvor, repo, 'bump', DEPENDABOT);
  const botNova = pokreniPrLinesCli(izvor, repo, 'nova', DEPENDABOT);
  return bot.status === 0
    && bot.stdout.includes('Nove ovisnosti: nema | Promjene verzija: vite@7.1.2')
    && botNova.status === 0
    && botNova.stdout.includes('Nove ovisnosti: zod')
    && pokreniPrLinesCli(izvor, repo, 'bump', LJUDSKI).status === 1
    && pokreniPrLinesCli(izvor, repo, 'bump', LAZNI_TIP).status === 1
    && pokreniPrLinesCli(izvor, repo, 'requirements', DEPENDABOT).status === 1;
}

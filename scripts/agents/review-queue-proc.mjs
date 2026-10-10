// Pokretanje providera s istekom koji ubija CIJELO stablo procesa (omotac gate locka, ljuska i
// provider), ne samo izravno dijete. Windows: `taskkill /T /F`; ostalo: vlastita grupa procesa.
import { spawn, spawnSync } from 'node:child_process';

const MAX_OUTPUT = 32 * 1024 * 1024;

function killTree(child, platform = process.platform) {
  if (!child?.pid) return;
  try {
    if (platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { shell: false });
    else process.kill(-child.pid, 'SIGKILL');
  } catch { /* proces je vec zavrsio */ }
}

/** Vraca `{ status, stdout, stderr, timedOut }`; nikad ne baca zbog izlaznog koda. */
export function runWithTreeKill(command, args, { cwd, env, input, timeoutMs }) {
  return new Promise((resolvePromise) => {
    const child = spawn(command, args, {
      cwd, env, shell: false, detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const take = (acc, chunk) => (acc.length < MAX_OUTPUT ? acc + chunk : acc);
    child.stdout.setEncoding('utf8').on('data', (c) => { stdout = take(stdout, c); });
    child.stderr.setEncoding('utf8').on('data', (c) => { stderr = take(stderr, c); });
    const timer = setTimeout(() => { timedOut = true; killTree(child); }, timeoutMs);
    child.on('error', (error) => {
      clearTimeout(timer);
      resolvePromise({ status: null, stdout, stderr: `${stderr}${error.message}`, timedOut });
    });
    child.on('close', (status) => {
      clearTimeout(timer);
      resolvePromise({ status: timedOut ? null : status, stdout, stderr, timedOut });
    });
    child.stdin.on('error', () => { /* proces je zavrsio prije citanja ulaza */ });
    child.stdin.end(input ?? '');
  });
}

/**
 * Gardovi za mobilni rezultat (mobilni audit 2026-09-28, PR 1).
 *
 * - `mobileTiltProblems`: ako list (`.analyzer-wrap`) ima nagib, uski ekran (720 px) ga mora ponistiti. Nagib na
 *   listu visokom tisucama piksela gura gornji rub preko ruba ekrana.
 * - `mentorModuleFromSource`: `mentor-tasks.ts` iz STVARNOG izvora uz zamjene izraza (esbuild bundle), bez upisa u
 *   repozitorij, da mutacija mijenja sam kod.
 * - `mentorCollapseProblems`: na uskom ekranu blok komentara je sklopljen, na sirokom otvoren.
 * - `mentorResizeProblems`: otvorenost prati promjenu sirine dok korisnik sam ne odabere (Codex F6 na #235).
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { build } from 'esbuild';

/** Problemi pravila nagiba lista u CSS tekstu `src/shared/page-app.css`. */
export function mobileTiltProblems(css: string): string[] {
  const src = css.replace(/\r/g, '');
  const nagnut = /\.analyzer-wrap\{[^}]*transform:\s*rotate\(/.test(src);
  if (!nagnut) return [];
  const ravno = /@media\s*\(max-width:\s*720px\)\s*\{\s*\.analyzer-wrap\s*\{\s*transform:\s*none;?\s*\}\s*\}/.test(src);
  return ravno ? [] : ['list je nagnut i na uskom ekranu'];
}

type Medij = { matches: boolean; addEventListener: (t: string, f: (e: { matches: boolean }) => void) => void; removeEventListener: (t: string, f: (e: { matches: boolean }) => void) => void };
type MentorMod = {
  mountMentorTasks: (mount: HTMLElement, bytes: Uint8Array, checks: readonly unknown[], opts?: { uzak?: boolean; medij?: Medij | null }) => Promise<boolean>;
};

const MENTOR = 'src/ui/results/mentor-tasks.ts';

/** `mentor-tasks.ts` iz stvarnog izvora uz zamjene `[staro, novo]` u toj datoteci. */
export async function mentorModuleFromSource(zamjene: Array<[string, string]>): Promise<MentorMod> {
  const ulaz = resolve(process.cwd(), MENTOR);
  const out = await build({
    entryPoints: [ulaz],
    bundle: true,
    format: 'iife',
    globalName: 'M',
    write: false,
    platform: 'browser',
    plugins: [{
      name: 'mutacija',
      setup(b) {
        b.onLoad({ filter: /mentor-tasks\.ts$/ }, (args) => {
          let src = readFileSync(args.path, 'utf8').replace(/\r/g, '');
          for (const [a, bb] of zamjene) {
            if (!src.includes(a)) throw new Error(`mutacija ne pogadja izvor: ${a}`);
            src = src.replace(a, bb);
          }
          return { contents: src, loader: 'ts', resolveDir: dirname(args.path) };
        });
      },
    }],
  });
  return new Function(`${out.outputFiles[0].text}\nreturn M;`)() as MentorMod;
}

/** Na uskom ekranu blok je sklopljen, na sirokom otvoren. Vraca opis svakog odstupanja. */
export async function mentorCollapseProblems(mod: MentorMod, bytes: Uint8Array): Promise<string[]> {
  const problemi: string[] = [];
  for (const uzak of [true, false]) {
    document.body.innerHTML = '<section id="m" class="hidden"></section>';
    const mount = document.getElementById('m')!;
    await mod.mountMentorTasks(mount, bytes, [], { uzak });
    const d = mount.querySelector<HTMLDetailsElement>('details.mt');
    if (!d) { problemi.push('blok komentara nije <details>'); continue; }
    if (uzak && d.open) problemi.push('uzak ekran: blok komentara je otvoren');
    if (!uzak && !d.open) problemi.push('sirok ekran: blok komentara je sklopljen');
  }
  return problemi;
}

/** Sirok pa uzak ekran sklapa blok; rucni odabir korisnika nadjacava sirinu. Vraca opis svakog odstupanja. */
export async function mentorResizeProblems(mod: MentorMod, bytes: Uint8Array): Promise<string[]> {
  const problemi: string[] = [];
  const medij = (matches: boolean) => {
    const sl = new Set<(e: { matches: boolean }) => void>();
    return {
      matches,
      addEventListener: (_t: string, f: (e: { matches: boolean }) => void) => { sl.add(f); },
      removeEventListener: (_t: string, f: (e: { matches: boolean }) => void) => { sl.delete(f); },
      promijeni(m: boolean) { this.matches = m; for (const f of sl) f({ matches: m }); },
    };
  };
  document.body.innerHTML = '<section id="m" class="hidden"></section>';
  let mount = document.getElementById('m')!;
  const sirok = medij(false);
  await mod.mountMentorTasks(mount, bytes, [], { medij: sirok });
  sirok.promijeni(true);
  if (mount.querySelector<HTMLDetailsElement>('details.mt')?.open !== false) problemi.push('suzeno na uzak ekran: blok ostaje otvoren');

  document.body.innerHTML = '<section id="m" class="hidden"></section>';
  mount = document.getElementById('m')!;
  const uzak = medij(true);
  await mod.mountMentorTasks(mount, bytes, [], { medij: uzak });
  const d = mount.querySelector<HTMLDetailsElement>('details.mt');
  if (d) { d.open = true; d.dispatchEvent(new Event('toggle')); }
  uzak.promijeni(false);
  uzak.promijeni(true);
  if (mount.querySelector<HTMLDetailsElement>('details.mt')?.open !== true) problemi.push('rucno otvoren blok sklopljen promjenom sirine');
  return problemi;
}

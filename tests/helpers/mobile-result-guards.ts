/**
 * Gardovi za mobilni rezultat (mobilni audit 2026-09-28, PR 1).
 *
 * - `mobileTiltProblems`: ako list (`.analyzer-wrap`) ima nagib, uski ekran (720 px) ga mora ponistiti. Nagib na
 *   listu visokom tisucama piksela gura gornji rub preko ruba ekrana.
 * - `mentorModuleFromSource`: `mentor-tasks.ts` iz STVARNOG izvora uz zamjene izraza (esbuild bundle), bez upisa u
 *   repozitorij, da mutacija mijenja sam kod.
 * - `mentorCollapseProblems`: na uskom ekranu blok komentara je sklopljen, na sirokom otvoren.
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

type MentorMod = {
  mountMentorTasks: (mount: HTMLElement, bytes: Uint8Array, checks: readonly unknown[], opts?: { uzak?: boolean }) => Promise<boolean>;
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

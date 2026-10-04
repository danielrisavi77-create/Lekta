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

type TransformDekl = { media: string | null; vrijednost: string; important: boolean };

/** Deklaracije `transform` za tocno `.analyzer-wrap` (bez pseudoelementa i potomaka), redom pojave u listu. */
function analyzerWrapTransforms(src: string): TransformDekl[] {
  const out: TransformDekl[] = [];
  const pravila = (tekst: string, media: string | null): void => {
    let i = 0;
    while (i < tekst.length) {
      const otv = tekst.indexOf('{', i);
      if (otv < 0) return;
      const glava = tekst.slice(i, otv).trim();
      let dubina = 1;
      let j = otv + 1;
      while (j < tekst.length && dubina > 0) {
        if (tekst[j] === '{') dubina++;
        else if (tekst[j] === '}') dubina--;
        j++;
      }
      const tijelo = tekst.slice(otv + 1, j - 1);
      if (glava.startsWith('@media')) pravila(tijelo, glava.slice('@media'.length).trim());
      else if (!glava.startsWith('@') && glava.split(',').some((s) => s.trim() === '.analyzer-wrap')) {
        for (const m of tijelo.matchAll(/(?:^|;)\s*transform\s*:\s*([^;]+)/g)) {
          const v = m[1].trim();
          out.push({ media, vrijednost: v.replace(/\s*!important$/, ''), important: /!important$/.test(v) });
        }
      }
      i = j;
    }
  };
  pravila(src.replace(/\/\*[\s\S]*?\*\//g, ''), null);
  return out;
}

/** Vrijedi li medijski upit na ekranu sirine 360 px. Nepoznat uvjet racuna se kao da vrijedi (strozi gard). */
function vrijediNa360(media: string | null): boolean {
  if (media === null) return true;
  const max = /max-width:\s*(\d+)px/.exec(media);
  const min = /min-width:\s*(\d+)px/.exec(media);
  if (max && Number(max[1]) < 360) return false;
  if (min && Number(min[1]) > 360) return false;
  return true;
}

/**
 * Problemi pravila nagiba lista u CSS tekstu `src/shared/page-app.css`. Prati kaskadu za selektor `.analyzer-wrap`
 * na 360 px: zadnja deklaracija pobjeduje, a `!important` pobjeduje sve obicne (Codex F5, runda 2 na #235).
 * Pravila s jacim selektorom ne vidi; njih hvata izracunati `transform` u `tests/ux/mobile-result-first.spec.ts`.
 */
export function mobileTiltProblems(css: string): string[] {
  const dekl = analyzerWrapTransforms(css.replace(/\r/g, '')).filter((d) => vrijediNa360(d.media));
  if (!dekl.some((d) => /rotate\(/.test(d.vrijednost))) return [];
  const vazne = dekl.filter((d) => d.important);
  const pobjednik = (vazne.length > 0 ? vazne : dekl).at(-1);
  return pobjednik?.vrijednost === 'none' ? [] : ['list je nagnut i na uskom ekranu'];
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

/**
 * Predikat "je li modul zabranjen u pocetnom statickom grafu ulaza `/`", izdvojen iz
 * `tests/intake-entry-boundary.test.ts` da bi ga mutacijski test (`tests/gate-mutations.test.ts`)
 * mogao ucitati kao izvorni tekst i podmetnuti mu poznat kvar.
 *
 * Imena modula se mjere RELATIVNO na korijen repozitorija: nad apsolutnom stazom regex je pogadjao
 * i ime checkouta, pa je worktree `wf-gate-preflight-lock` rusio gard bez ijednog zabranjenog
 * modula u grafu (izmjereno 2026-09-26). Staza izvan korijena ostaje apsolutna, dakle strozi stari
 * uvjet.
 *
 * Podudaranje prefiksa s korijenom se na win32 mjeri neosjetljivo na velicinu slova: `resolve()` i
 * stvaran checkout mogu vratiti isto slovo diska u razlicitoj velicini (`C:` naspram `c:`), pa bi
 * osjetljiva usporedba lazno tretirala stazu kao izvan korijena i vratila se na strozi apsolutni
 * uvjet. Sam ostatak staze (nakon prefiksa) zadrzava izvornu velicinu slova.
 *
 * Platforma se prima kao parametar (zadano `process.platform`) umjesto da se cita izravno u tijelu
 * funkcije: gard i test moraju moci ispitati win32 i ne-win32 ponasanje neovisno o stvarnom OS-u na
 * kojem se test izvrsava (CI Linux runner nasuprot lokalnom Windows razvoju).
 */
export function zabranjenUGrafuUlaza(
  path: string,
  root: string,
  opts: { platform?: string } = {},
): boolean {
  const platform = opts.platform ?? process.platform;
  const posixPath = path.replace(/\\/g, '/');
  const rootPrefix = `${root.replace(/\\/g, '/')}/`;
  const podudaraSeSPrefiksom = platform === 'win32'
    ? posixPath.toLowerCase().startsWith(rootPrefix.toLowerCase())
    : posixPath.startsWith(rootPrefix);
  const relativno = podudaraSeSPrefiksom ? posixPath.slice(rootPrefix.length - 1) : posixPath;
  return relativno.includes('/src/analysis/')
    || relativno.includes('/src/profiles/')
    || relativno.includes('/src/ui/app.ts')
    || relativno.includes('/src/routes/workspace/')
    || relativno.includes('/src/audits/')
    || relativno.includes('/src/citations/')
    || (relativno.includes('/src/repair/') && !relativno.endsWith('/src/repair/docx-budget.ts'))
    || /(?:preflight|preview|history|landing)/i.test(relativno);
}

/**
 * Gard pravila komunikacije koordinatora i cloud sesija (vlasnik 2026-10-04). Pravila zive u
 * `docs/agents/README.md` ("Poruke izmedu neovisnih Claude Code sesija"), a kratke obveze u skillovima
 * `brief` (izvrsitelj) i `pr-merge` (koordinator). Gard trazi da nijedno od njih tiho ne ispadne.
 * Baseline je u `tests/skill-koordinacija.test.ts`, mutacije u `tests/gate-mutations.test.ts`.
 */
export interface MessagingSources {
  readme: string;
  brief: string;
  prMerge: string;
}

/** Fiksno zaglavlje Routine poruke izvrsitelja; isti niz mora biti u README-u i u briefu. */
export const ROUTINE_HEADER = '[<sesija> -> koordinator] PR #<n> head <sha> | stanje: <...> | treba: <...>';

const lf = (s: string) => s.replace(/\r\n?/g, '\n');

function section(readme: string): string {
  const src = lf(readme);
  const a = src.indexOf('## Poruke izmedu neovisnih Claude Code sesija');
  if (a === -1) return '';
  const b = src.indexOf('\n## ', a + 3);
  return b === -1 ? src.slice(a) : src.slice(a, b);
}

export function messagingRuleProblems(s: MessagingSources): string[] {
  const out: string[] = [];
  const sec = section(s.readme);
  if (!sec) return ['README: nema odjeljka o porukama izmedu sesija'];
  const need: [string, RegExp][] = [
    ['kanal istine je PR', /\*\*Kanal istine je PR\.\*\*/],
    ['koordinator se pretplacuje na PR', /pretplacuje na svaki PR izvrsitelja\*\* \(`subscribe_pr_activity`\)/],
    ['koordinator sam povlaci stanje', /\*\*Koordinator sam povlaci stanje\.\*\*[\s\S]*`get_session`, `list_events`/],
    ['Routine je samo zvono', /\*\*Routine je samo zvono, ne jedini kanal\.\*\*/],
    ['Routine 1 minutu unaprijed', /`run_once_at` tocno 1 minutu unaprijed/],
    ['provjera isporuke Routinea', /`last_run` mora biti `SUCCEEDED`/],
    ['Routine kao izvjestaj izvrsitelja', /\*\*Koordinator Routine s tim zaglavljem cita kao izvjestaj izvrsitelja\*\*/],
    ['vlasnikove odluke izravno', /\*\*Vlasnikove odluke izvrsitelj trazi izravno od vlasnika\*\*/],
    ['relay nije odobrenje', /NIKAD nije vlasnikovo odobrenje/],
  ];
  for (const [label, re] of need) if (!re.test(sec)) out.push(`README: nema pravila "${label}"`);
  if (!sec.includes(ROUTINE_HEADER)) out.push('README: nema fiksnog zaglavlja Routine poruke');
  const brief = lf(s.brief);
  if (!brief.includes(ROUTINE_HEADER)) out.push('brief: nema fiksnog zaglavlja Routine poruke');
  if (!/svaki status\s+pises kao komentar na PR/.test(brief)) out.push('brief: izvjestaj nije na PR-u');
  if (!/koordinator se pretplati na taj PR \(`subscribe_pr_activity`\)/.test(brief)) out.push('brief: koordinator se ne pretplacuje na PR');
  const pr = lf(s.prMerge);
  if (!/Budi pretplacen na PR \(`subscribe_pr_activity`\)/.test(pr)) out.push('pr-merge: nema pretplate na PR');
  if (!/`get_session`, `list_events`/.test(pr)) out.push('pr-merge: koordinator ne povlaci stanje sesije');
  return out;
}

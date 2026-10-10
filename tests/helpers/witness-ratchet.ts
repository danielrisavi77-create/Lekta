/**
 * Ratchet pokrivenosti svjedoka (T68, pregled #302 R1). Zbroj ciljanih provjera u `witnessSummary` mora
 * biti JEDNAK zbroju po svjedocima i NAJMANJE ratchet: pad je gubitak svjedoka, rast je poboljsanje koje
 * ne smije srusiti test (ratchet se dize u istom commitu, ali ne prisilno).
 */
export function witnessRatchetProblems(
  report: { witnessResults: ReadonlyArray<{ targetedCheckCount: number }>; witnessSummary?: { targetedCheckCount: number } },
  ratchet: number,
): string[] {
  const s = report.witnessSummary;
  if (!s) return ['izvjestaj nema witnessSummary; regeneriraj ga'];
  const out: string[] = [];
  const zbroj = report.witnessResults.reduce((n, r) => n + r.targetedCheckCount, 0);
  if (s.targetedCheckCount !== zbroj) out.push(`witnessSummary.targetedCheckCount ${s.targetedCheckCount} != zbroj po svjedocima ${zbroj}`);
  if (s.targetedCheckCount < ratchet) out.push(`pokrivenost svjedoka ${s.targetedCheckCount} ispod ratcheta ${ratchet}: izgubljen svjedok ili ciljana provjera`);
  return out;
}

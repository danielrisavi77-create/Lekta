/**
 * Stabilan projekt rezultata analyzeDocx za golden snapshote (CLAUDE.md golden harness).
 *
 * Izbacuje promjenjiva polja (generatedAt, id-evi iz Date.now()/Math.random(), velicina
 * datoteke), zadrzava deterministicke ishode audita. Koriste ga i docx-golden (realne
 * fixture, kad ih bude) i synthetic-golden (sinteticki korpus, trajni regresijski net).
 */
export function normalizeResult(r: any): unknown {
  if (!r || typeof r !== 'object') return r;
  const round = (n: unknown) => (typeof n === 'number' ? Math.round(n * 100) / 100 : n);
  return {
    score: r.score ?? null,
    profile: r.profile ?? null,
    profileStatus: r.profileStatus ?? null,
    profileFingerprint: r.details?.profileFingerprint ?? r.profileFingerprint ?? null,
    stats: r.stats ?? null,
    checks: (r.checks ?? []).map((c: any) => ({
      category: c.category ?? null,
      title: c.title ?? null,
      status: c.status ?? null,
      earned: round(c.earned),
      max: c.max ?? null,
      detail: c.detail ?? null,
    })),
    issues: (r.issues ?? []).map((i: any) => ({
      severity: i.severity ?? null,
      category: i.category ?? null,
      title: i.title ?? null,
      where: i.where ?? null,
      detail: i.detail ?? null,
    })),
  };
}

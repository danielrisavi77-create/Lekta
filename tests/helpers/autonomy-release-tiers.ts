/**
 * Usporedba obveznih razina autonomnog kontrolera (`requiredReleaseTiers` u
 * `config/autonomy.example.json`) s jedinim izvorom istine, `requiredTierIds()` iz
 * `scripts/release-tiers.mjs`.
 *
 * Zasto: T62 je `word-corpus` i `word-toc` ucinio obaveznima u dokazu izdanja, a predlozak
 * kontrolera je i dalje trazio samo `word` i `word-worst`. `gate.promotion_allowed` trazi `pass`
 * samo na razinama iz tog popisa, pa bi kontroler promovirao kandidata kojemu Word korpus i TOC
 * nikad nisu prosli. Konfiguracija se PARSIRA kao JSON, ne pretrazuje kao tekst.
 */

/** Prazan popis znaci da se popisi slazu po sadrzaju i redoslijedu. */
export function requiredTiersDrift(configJsonText: string, requiredIds: readonly string[]): string[] {
  const parsed = JSON.parse(configJsonText) as { requiredReleaseTiers?: unknown };
  const tiers = parsed.requiredReleaseTiers;
  if (!Array.isArray(tiers) || !tiers.every((t) => typeof t === 'string')) {
    return ['requiredReleaseTiers nije popis stringova'];
  }
  const problems: string[] = [];
  for (const id of requiredIds) if (!tiers.includes(id)) problems.push(`nedostaje obavezna razina ${id}`);
  for (const id of tiers) if (!requiredIds.includes(id)) problems.push(`visak razine ${id} koja nije obavezna u release-tiers.mjs`);
  if (problems.length === 0 && tiers.join(',') !== requiredIds.join(',')) {
    problems.push('redoslijed se razlikuje od release-tiers.mjs');
  }
  return problems;
}

/**
 * Zajednicke ciste funkcije za konsenzus naslovnickih predlozaka iz evidence uzoraka.
 * Koriste ih derive-templates.mjs (puna derivacija) i retypo-derived.mjs (in-place
 * osvjezavanje konvencija). Bez I/O i bez nuspojava, pa se import ne pokrece kao skripta.
 */

/** Uloge koje sudjeluju u rasporedu naslovnice; unknown se ignorira. */
export const LAYOUT_ROLES = new Set([
  'university', 'faculty', 'study', 'author', 'title', 'subtitle', 'worktype', 'mentor', 'comentor', 'placeyear',
]);
export const CONSENSUS_SHARE = 2 / 3;

/** Mod s determinstickim tie-breakom (leksikografski po JSON reprezentaciji). */
export function mode(values) {
  const counts = new Map();
  for (const v of values) {
    const key = JSON.stringify(v);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0];
  return { value: JSON.parse(best[0]), share: best[1] / values.length };
}

/** Vecinski glas atributa nad linijama koje ga imaju; undefined ako < 2 vrijednosti ili < 2/3. */
export function voteAttr(lines, pick) {
  const vals = lines.map(pick).filter((v) => v !== undefined && v !== null);
  if (vals.length < 2) return undefined;
  const m = mode(vals);
  return m.share >= CONSENSUS_SHARE ? m.value : undefined;
}

/** Prva linija svake uloge po uzorku (nosi geometriju), grupirano po ulozi. */
export function groupFirstLineByRole(samples) {
  const byRole = new Map();
  for (const sample of samples) {
    const seen = new Set();
    for (const line of sample.lines) {
      if (!LAYOUT_ROLES.has(line.role) || seen.has(line.role)) continue;
      seen.add(line.role);
      if (!byRole.has(line.role)) byRole.set(line.role, []);
      byRole.get(line.role).push(line);
    }
  }
  return byRole;
}

/**
 * Konvencija boldiranja po ulozi, glasana nad SVIM ne-OCR uzorcima jedinice NEOVISNO o
 * razini rada. Boldira li fakultet naslov (ili neku drugu ulogu) stil je CIJELOG fakulteta,
 * ne pojedine vrste rada, pa tanak podskup po razini (npr. 2 zavrsna rada od kojih je jedan
 * slucajno ne-bold) ne smije sakriti bold koji fakultet u pravilu koristi. Glasa se neovisno
 * o prepoznavanju fonta, pa se bold ne gubi ni kad PyMuPDF ne razrijesi ime fonta. Font,
 * velicina, verzal i poravnanje se NE poolaju (legitimno se razlikuju po razini, npr.
 * doktorski Arial 22 vs diplomski TNR 16) i ostaju po razini u consensusElements.
 * Vraca Map<role, { bold: true }> samo za uloge koje fakultet dosljedno boldira.
 */
export function roleConventions(samples) {
  const out = new Map();
  for (const [role, lines] of groupFirstLineByRole(samples)) {
    if (lines.length < 2) continue;
    if (voteAttr(lines, (l) => !!l.bold) === true) out.set(role, { bold: true });
  }
  return out;
}

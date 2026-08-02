/**
 * Prikaz cross-checka protiv vlastitih izvora (src/analysis/source-cross-check.ts): odlomci koji
 * doslovno preklapaju s uploadanom gradjom BEZ oznake citata, i tvrdnje (brojevi/norme/oznake) iz
 * rada koje se ne nalaze ni u jednom izvoru. PLACENA, eksplicitno opt-in dopuna analize: postoji
 * samo kad student sam uploada svoje izvore.
 *
 * Cista funkcija (rezultat -> string): nema DOM-a, nema mreze, cijelo ponasanje dokazivo testom.
 * Vraca prazan string SAMO kad provjera uopce nije pokrenuta (nema rezultata) - kad JEST pokrenuta,
 * prikazuje se i "nema nalaza" (isti razlog kao source-check-view.ts: tisina bi izgledala kao da
 * provjera nije ni radila).
 *
 * POSTENO (isti registar kao submission-lint.ts i source-check-view.ts): preklapanje NIJE
 * Turnitin-razina alata (nema fuzzy/sinonim usporedbe), lazni pozitivci na standardnim frazama
 * (npr. pravne norme) su ocekivani, i rezultat je poziv na provjeru je li nesto trebalo biti
 * oznaceno citat - nikad presuda o plagijatu. Ne ulazi u ocjenu.
 */
import { escapeHtml } from '../utils/helpers';
import type { SourceCrossCheckResult } from '../analysis/source-cross-check';

export function buildSourceCrossCheckHtml(result: SourceCrossCheckResult | null | undefined): string {
  if (!result) return '';

  const flagged = result.overlap.findings.filter((f) => f.flagged);
  const notFoundClaims = result.claims.filter((c) => !c.foundInAnySource);

  const overlapRows = flagged
    .map((f) => {
      const bm = f.bestMatch;
      const izvor = bm
        ? `<br><small>preklapanje s „${escapeHtml(bm.sourceFileName)}” (${bm.overlapCount} n-grama), npr. „…${escapeHtml(bm.sampleNgram)}…”</small>`
        : '';
      return `<div class="legal-problem"><strong>Odlomak ${f.paragraphIndex}</strong> ⚠ nema vidljivu oznaku citata${izvor}<br><small>…${escapeHtml(f.excerpt)}…</small></div>`;
    })
    .join('');
  const overlapSection = overlapRows
    ? `<h4>Odlomci za provjeru (bez oznake citata)</h4><div class="legal-problem-list">${overlapRows}</div>`
    : '<div class="legal-engine-note">Nema odlomaka s doslovnim preklapanjem bez oznake citata.</div>';

  const shownClaims = notFoundClaims.slice(0, 50);
  const claimRows = shownClaims
    .map((c) => `<div class="legal-problem"><strong>Odlomak ${c.claim.paragraphIndex}</strong> tvrdnja „${escapeHtml(c.claim.raw)}” nije pronađena ni u jednom izvoru</div>`)
    .join('');
  const claimsMore = notFoundClaims.length > shownClaims.length
    ? `<div class="legal-engine-note">Prikazano prvih ${shownClaims.length} od ${notFoundClaims.length} tvrdnji.</div>`
    : '';
  const claimsSection = claimRows
    ? `<h4>Tvrdnje bez potvrde u izvorima</h4><div class="legal-problem-list">${claimRows}</div>${claimsMore}`
    : '<div class="legal-engine-note">Sve prepoznate tvrdnje pronađene su u priloženim izvorima.</div>';

  const sourceList = result.sourceFiles.map((f) => escapeHtml(f.fileName)).join(', ');

  return `<section class="legal-engine"><div class="legal-engine-head"><div>`
    + `<h3>Cross-check s izvorima</h3><p>${escapeHtml(result.summary.text)}`
    + (sourceList ? ` · uspoređeno s: ${sourceList}` : '') + `</p></div>`
    + `<span class="legal-engine-badge">${flagged.length + notFoundClaims.length} nalaza</span></div>`
    + overlapSection + claimsSection
    + `<div class="legal-engine-note">Ovo NIJE Turnitin-razina alata za plagijat — nema fuzzy/sinonimskog podudaranja. `
    + `Podudaranja s uobičajenim/standardnim frazama (npr. pravne norme) su očekivana i nisu dokaz preuzimanja — provjeri ručno. `
    + `Rezultat je poziv na provjeru je li ovo trebao biti označen citat, ne presuda o plagijatu. Ne ulazi u ocjenu.</div></section>`;
}

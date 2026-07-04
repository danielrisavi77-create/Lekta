/**
 * Zajednicka normalizacija profila: check* zastavice gdje nedefinirano znaci
 * "provjeravaj" (povijesno ponasanje enginea). Jedini izvor istine za zivi
 * currentProfile (src/ui/app.ts) i golden resolveProfile (analysis/golden-entry.ts),
 * koji su do ovog splita vodili identicne rucne kopije ove logike.
 */
export function normalizeCheckFlags(base: any): any {
  base.checkFont = base.checkFont !== false;
  base.checkSize = base.checkSize !== false;
  base.checkSpacing = base.checkSpacing !== false;
  base.checkMargins = base.checkMargins !== false;
  base.checkJustify = base.checkJustify !== false;
  base.requireA4 = !!base.requireA4;
  return base;
}

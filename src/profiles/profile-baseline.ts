/**
 * Zajednicka normalizacija profila: check* zastavice gdje nedefinirano znaci
 * "provjeravaj" (povijesno ponasanje enginea). Jedini izvor istine za zivi
 * currentProfile (src/ui/app.ts) i golden resolveProfile (analysis/golden-entry.ts),
 * koji su do ovog splita vodili identicne rucne kopije ove logike.
 */

/** Ima li profil vrijednost bez koje engine ne moze izvesti pripadnu provjeru. */
/**
 * Zastavica -> ima li profil vrijednost bez koje ta provjera ne moze bodovati.
 *
 * IZVEZENO jer mora biti JEDAN izvor istine. `scored-value-binding.readAxis` racuna sto motor
 * boduje, pa mora odgovarati bas ovom uvjetu: profil s `font: []` ovdje gasi `checkFont`, a
 * `readAxis` je do 2026-08-23 vracao `[]` kao da se boduje, cime bi prijavio raskorak ili
 * `unbacked` nad dimenzijom koju motor uopce ne gleda. Danas takav profil ne postoji (0 od 407),
 * ali dvije kopije istog uvjeta razidju se tiho, a ovaj se cita samo kroz posljedicu.
 */
export const CHECK_FLAG_HAS_VALUE: Readonly<Record<string, (b: any) => boolean>> = {
  checkFont: (b) => Array.isArray(b.font) && b.font.length > 0,
  checkSize: (b) => Array.isArray(b.size) && b.size.length > 0,
  checkSpacing: (b) => typeof b.spacing === 'number',
  checkMargins: (b) => !!b.margins && ['top', 'right', 'bottom', 'left'].every((s) => typeof b.margins[s] === 'number'),
};

const HAS_VALUE: Array<[flag: string, has: (b: any) => boolean]> = Object.entries(CHECK_FLAG_HAS_VALUE);

export function normalizeCheckFlags(base: any): any {
  base.checkFont = base.checkFont !== false;
  base.checkSize = base.checkSize !== false;
  base.checkSpacing = base.checkSpacing !== false;
  base.checkMargins = base.checkMargins !== false;
  base.checkJustify = base.checkJustify !== false;
  base.requireA4 = !!base.requireA4;
  // Zastavica bez vrijednosti se gasi: engine bezuvjetno cita profile.font.some(...) i
  // profile.margins[side] cim je zastavica ukljucena, pa je "undefined !== false" rusio zivu
  // analizu na normalnom .docx-u (20 od 372 profila), a kod proreda tise lagao ("ocekuje se
  // undefined", jer je near(x, undefined) uvijek false). Profil nema vrijednost kad mu je
  // sluzbeni pravilnik ne propisuje (CLAUDE.md: ne izmisljaj pravila), pa je ispravan ishod
  // informativna provjera (max 0) koju engine vec zna emitirati za checkX === false.
  // justify i requireA4 se ne diraju: engine ih vec sam ogradjuje (!profile.justify / !!requireA4).
  for (const [flag, has] of HAS_VALUE) if (base[flag] && !has(base)) base[flag] = false;
  return base;
}

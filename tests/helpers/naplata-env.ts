/**
 * Ciste funkcije nad IZVOROM Edge funkcija naplate, da se gard moze mutirati bez diranja diska.
 *
 * Deno kod se pod vitestom ne izvodi, pa je jedino sto se moze mjeriti ono sto izvor DEKLARIRA:
 * koja imena tajni cita. To je manje od "funkcija radi", i tako je i imenovano.
 */

/** Sva imena koja izvor cita kroz `Deno.env.get('IME')`. */
export function envNames(src: string): Set<string> {
  const out = new Set<string>();
  for (const m of src.matchAll(/Deno\.env\.get\(\s*['"]([A-Z0-9_]+)['"]\s*\)/g)) out.add(m[1]);
  return out;
}

/**
 * Nalazi o imenu tajne za Lemon Squeezy trgovinu. Prazno = obje funkcije naplate citaju
 * `LEMONSQUEEZY_STORE_ID` i nijedna vise ne cita staro `LS_STORE_ID`.
 */
export function storeIdSecretProblems(sources: Readonly<Record<string, string>>): string[] {
  const problems: string[] = [];
  for (const [name, src] of Object.entries(sources)) {
    const names = envNames(src);
    if (!names.has('LEMONSQUEEZY_STORE_ID')) problems.push(`${name}: ne cita LEMONSQUEEZY_STORE_ID`);
    if (names.has('LS_STORE_ID')) problems.push(`${name}: jos cita staro ime LS_STORE_ID`);
  }
  return problems;
}

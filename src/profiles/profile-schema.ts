/**
 * Tipovi profila i pravila (Option A).
 *
 * `ruleEntries` su autorski izvor istine; `rules` je naslijedeni agregirani objekt
 * koji engine povijesno cita. `rule-compiler.ts` racuna `effectiveRules` iz oba.
 * Vidi docs/CLAUDE.md ("Option A: ruleEntries su izvor istine").
 *
 * Faza 2 prosiruje ove tipove (autoritet, sourcePage, machineCheckable, datum
 * verifikacije) kako se registri sele iz src/main.ts u tipizirani data/**.
 */

/** Granularno pravilo s identitetom; mapira se preko COMPILED_CHECK_IDS u rule-compiler.ts. */
export interface RuleEntry {
  ruleId: string;
  checkId: string | null;
  value: unknown;
}

/** Profil ucilista/studija/vrste rada. Minimalan oblik dovoljan za rule-compiler. */
export interface ThesisProfile {
  id: string;
  rules?: Record<string, unknown>;
  ruleEntries?: RuleEntry[];
}

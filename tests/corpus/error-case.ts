/**
 * Standardni model korpusnog slucaja (faza 4 Lekta Error Corpus).
 *
 * Pragmaticni podskup modela iz LEKTA_ERROR_CORPUS_MASTER_PROMPT.md: dovoljno da svaki slucaj
 * bude DETERMINISTICAN, ima jasan oracle i strojno provjerljivo ocekivanje nad STVARNIM
 * analyzeDocx izlazom. Identitet cilja je stabilni checkId (tests/corpus/ids), ne hrvatski
 * naslov; `title` sluzi samo za pronalazak checka u rezultatu (engine nema checkId na checku).
 */
import type { DocSpec } from '../helpers/docx-builder';

export type Oracle = 'atomic-fail' | 'valid-control' | 'boundary';

/** Zeljeni ishod ciljane provjere. 'not-pass' = bilo sto osim 'pass' (warn ili fail). */
export type DesiredOutcome = 'fail' | 'warn' | 'not-pass' | 'pass';

export interface CorpusExpectation {
  /** Stabilni ID ciljane provjere (mora postojati u CHECK_ID_BY_TITLE). */
  checkId: string;
  /** Legacy naslov za pronalazak checka u result.checks (engine nema checkId). */
  title: string;
  /** Kako se cita ishod: po statusu ('status') ili po bodovima ('earned' < max). */
  kind: 'status' | 'earned';
  outcome: DesiredOutcome;
}

export interface ErrorCase {
  /** Stabilan ID slucaja, npr. 'atomic.format.font.dominant'. */
  id: string;
  title: string;
  category: string;
  oracle: Oracle;
  profileId: string;
  /** Deterministicki gradi .docx spec (mutacija klona baze ili valjana varijanta). */
  build: () => DocSpec;
  /**
   * Opcionalno: "cista" varijanta u kojoj ciljana provjera PROLAZI, za dokaz uzrocnosti kad
   * dijeljena baza tu provjeru uopce ne emitira (npr. element.source trazi stvarne tablice).
   * Ako je zadan, atomski test provjerava prolaznost nad njim umjesto nad dijeljenom bazom.
   */
  cleanBuild?: () => DocSpec;
  expect: CorpusExpectation;
  /** Detektira li Lekta ovu klasu VEC danas. false -> ide u gap-backlog, ne u zeleni asert. */
  detectableNow: boolean;
  /** Zeljeni buduci checkId ako detectableNow=false. */
  desiredFutureCheckId?: string;
  notes?: string;
}

/** Nadji tocno jedan check po naslovu; baca ako ih je 0 ili >1 (dupli naslov = bug). */
export function findCheck(result: any, title: string): any {
  const matches = (result?.checks ?? []).filter((c: any) => c.title === title);
  if (matches.length !== 1) throw new Error(`Ocekivan tocno 1 check "${title}", nadjeno ${matches.length}`);
  return matches[0];
}

/** Je li status "prolazan"? */
export function isPass(check: any): boolean {
  return check?.status === 'pass';
}

/** Provjeri zadovoljava li check ocekivani ishod (za asert i za coverage). */
export function meetsExpectation(check: any, exp: CorpusExpectation): boolean {
  if (exp.kind === 'earned') {
    const earned = Number(check.earned), max = Number(check.max);
    if (!(max > 0)) return false;
    return exp.outcome === 'pass' ? earned === max : earned < max;
  }
  switch (exp.outcome) {
    // 'pass' u korpusu znaci "valjana varijanta ne proizvodi lazni nalaz". Nebodovana provjera
    // (max === 0) od 2026-08-17 nosi status 'informational' umjesto 'pass', a ona po definiciji ne
    // moze proizvesti nalaz, pa i dalje zadovoljava ocekivanje.
    case 'pass': return check.status === 'pass' || check.status === 'informational';
    case 'fail': return check.status === 'fail';
    case 'warn': return check.status === 'warn';
    // 'not-pass' trazi STVARAN nalaz: informativna provjera nije nalaz, pa ne smije zadovoljiti.
    case 'not-pass': return check.status !== 'pass' && check.status !== 'informational';
  }
}

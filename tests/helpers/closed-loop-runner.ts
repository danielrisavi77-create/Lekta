/**
 * Zajednicki, fixer-agnosticki closed-loop koraci (izvuceno iz tests/repair-closed-loop.test.ts):
 * stvarna analiza pokvarenog dokumenta -> primjena popravka -> ponovna stvarna analiza ->
 * dokaz da je ciljani nalaz nestao, tekst ocuvan, nema regresije i da je drugi prolaz no-op.
 *
 * Svaki novi closed-loop test (za bilo koji od 31 fixera) treba koristiti runClosedLoopCase
 * umjesto kopiranja ovih koraka po cetvrti put.
 */
import { expectNotPenalised } from './check-status';
import { expect } from 'vitest';
import { analyzeFixture, resolveProfile } from '../../src/analysis/golden-entry';
import { applyFixers, type FixerRequest } from '../../src/repair/apply-fixers';
import { detectPassRegressions } from '../../src/analysis/repair-regression';
import { readZip } from '../../src/repair/zip-codec';
import { assertPackageIntact } from './docx-package-assert';
import type { RepairableItem } from '../../src/ui/repair-panel';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export async function documentText(bytes: Uint8Array): Promise<string> {
  const entries = await readZip(bytes);
  const document = entries.find((entry) => entry.name === 'word/document.xml');
  if (!document) throw new Error('DOCX nema word/document.xml');
  const xml = new TextDecoder().decode(document.data);
  return [...xml.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)]
    .map((match) =>
      match[1]
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'"),
    )
    .join('');
}

/**
 * Sama usporedba vise ne zivi ovdje: detectPassRegressions (src/analysis/repair-regression.ts) je
 * isti kod koji sada vrti i aplikacija, pa ovi testovi ujedno dokazuju da je produkcijski gate
 * ispravan. Ovdje ostaje samo test-specificno: izuzimanje ciljanih naslova i oblik asercije.
 */
export function assertNoPassRegression(
  before: Array<{ title: string; status?: string }>,
  after: Array<{ title: string; status?: string }>,
  targeted: Set<string>,
): void {
  const regressions = detectPassRegressions(before, after).filter((item) => !targeted.has(item.title));
  expect(
    regressions.map((item) => item.title),
    `checkovi koji su prije prolazili ne smiju pasti: ${regressions.map((item) => `${item.title} -> ${item.after ?? 'nestao'}`).join(', ')}`,
  ).toEqual([]);
}

export interface ClosedLoopCase {
  /** Kratka oznaka slucaja za citljive poruke asercija (npr. "toc-field-fixer/manualni-sadrzaj"). */
  label: string;
  profileId: string;
  /** Gradi pokvareni .docx koji ce se stvarno analizirati (isti ulazni lanac kao golden testovi). */
  buildBrokenDocx: () => Promise<Uint8Array> | Uint8Array;
  /** Iz STVARNE analize pokvarenog dokumenta izvuci RepairableItem[] (npr. pozivom fixer-ove *RepairableItem funkcije). */
  buildItems: (before: any, profile: any) => RepairableItem[];
  /** Naslovi checkova koji moraju biti 'pass' nakon popravka (za fixere koji imaju bodovan/status check). */
  targetTitles?: string[];
  /** Alternativa za target-titles: fixeri vezani na result.details.* bez posebnog check-statusa. */
  isResolved?: (after: any) => boolean;
  /**
   * Dopusti promjenu teksta (default false). Legitimna upotreba: heading-case-fixer (jedini
   * popravak koji dira autorov tekst) i link-doi-fixer (kanonizacija DOI/URL prikaza).
   */
  allowTextChange?: boolean;
  /**
   * Naslovi checkova izuzeti iz "nema regresije" provjere BEZ da moraju biti 'pass' (za razliku
   * od targetTitles). Legitimna upotreba: check koji ostaje namjerno konzervativan (npr. ne
   * simulira Wordovo nasljedjivanje footera medju sekcijama), pa realno prelazi iz vakuoznog
   * 'pass' (nedetektabilno) u posteni 'warn' (detektabilno, ali nepotvrdjeno) i nakon ispravnog popravka.
   */
  exemptFromRegression?: string[];
  /**
   * Dijelovi paketa koje ovaj popravak SMIJE ukloniti. Jedini danasnji slucaj je
   * final-document-inspector-fixer, koji radi "cistu kopiju" pa namjerno mice word/comments.xml.
   * Sve ostalo sto nestane iz paketa je bug (vidi assertPackageIntact).
   */
  allowDroppedParts?: string[];
}

export async function runClosedLoopCase(testCase: ClosedLoopCase): Promise<void> {
  const { label, profileId, buildBrokenDocx, buildItems, targetTitles = [], isResolved, allowTextChange = false, exemptFromRegression = [], allowDroppedParts = [] } = testCase;
  const profile = resolveProfile(profileId) as Record<string, unknown>;
  const inputBytes = await buildBrokenDocx();
  const inputFile = new File([inputBytes], `${label}-closed-loop.docx`, { type: DOCX_MIME });

  const before = await analyzeFixture(inputFile, { profileId });
  const items = buildItems(before, profile);
  expect(items.length, `${label}: mora ponuditi barem jednu stavku popravka`).toBeGreaterThan(0);

  const requests: FixerRequest[] = items.map((item) => ({ fixerId: item.fixerId, ruleId: item.ruleId, params: item.params }));
  const beforeText = await documentText(inputBytes);
  const applied = await applyFixers(inputBytes, requests);
  expect(applied.changelog.length, `${label}: barem jedna stavka mora stvarno promijeniti dokument`).toBeGreaterThan(0);
  // Faza A (RE-47): popravljen paket mora ostati valjan XML u SVAKOM dijelu i ne smije izgubiti
  // nijedan dio. Prije se provjeravao samo tekst i ishod checkova, pa je neispravan XML (npr.
  // atribut iza kose crte samozatvarajuceg taga) prolazio sve testove.
  await assertPackageIntact(inputBytes, applied.docxBytes, `${label}: prvi prolaz`, { allowDropped: allowDroppedParts });

  const outputFile = new File([applied.docxBytes], `${label}-closed-loop-fixed.docx`, { type: DOCX_MIME });
  const after = await analyzeFixture(outputFile, { profileId });
  const afterText = await documentText(applied.docxBytes);
  if (allowTextChange) {
    expect(afterText, `${label}: ocekivana promjena teksta izostala`).not.toBe(beforeText);
  } else {
    expect(afterText, `${label}: tekst se ne smije promijeniti`).toBe(beforeText);
  }

  for (const title of targetTitles) {
    const check = (after.checks ?? []).find((candidate: { title: string }) => candidate.title === title);
    // Ciljana provjera nakon popravka ne smije kaznjavati dokument. Kad je NEBODOVANA za taj
    // dokument (max === 0, npr. "Položaj broja stranice" kad poravnanje nije ocitljivo), status je
    // 'informational' i tada ona popravak NE dokazuje: dokaz je `isResolved` ispod. Do 2026-08-17
    // je i takva provjera javljala 'pass', pa je test izgledao kao potvrda popravka a nije bio.
    expectNotPenalised(check);
  }
  if (isResolved) expect(isResolved(after), `${label}: ciljani nalaz mora nestati nakon popravka`).toBe(true);
  assertNoPassRegression(before.checks ?? [], after.checks ?? [], new Set([...targetTitles, ...exemptFromRegression]));

  const second = await applyFixers(applied.docxBytes, requests);
  expect(second.changelog, `${label}: drugi prolaz mora biti no-op`).toEqual([]);
  expect(second.docxBytes, `${label}: no-op mora zadrzati istu referencu`).toBe(applied.docxBytes);
}

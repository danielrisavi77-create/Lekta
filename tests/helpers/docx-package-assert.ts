/**
 * Vitest omotaci nad src/repair/package-integrity.ts (faza A, RE-47 klasa).
 *
 * Dva neovisna misljenja, jer su jeftina i pokrivaju razlicite rupe:
 *   1. vlastiti strogi skener (`scanXmlWellFormed`) - isti kod koji smije vrtjeti i Deno Edge
 *      Function, pa test dokazuje bas ono sto ce stititi produkciju,
 *   2. @xmldom/xmldom s `onError` kolektorom - hvata slucaj gdje bi vlastiti skener imao rupu.
 *
 * Zasto oba: xmldom NE BACA na neispravnom XML-u (dokazano u tests/repair-package-integrity.test.ts),
 * pa sam po sebi nije gate; a vlastiti skener je nov i zasluzuje kontrolu. U produkciji (Deno,
 * bez DOMParsera) ostaje samo skener.
 */
import { expect } from 'vitest';
import { DOMParser } from '@xmldom/xmldom';
import { readZip } from '../../src/repair/zip-codec';
import { comparePackages, inspectDocxParts } from '../../src/repair/package-integrity';

/** xmldom greske za jedan XML string (prazno = cisto). */
function xmldomErrors(xml: string): string[] {
  const errors: string[] = [];
  new DOMParser({
    onError: (level: string, message: string) => {
      if (level === 'error' || level === 'fatalError') errors.push(`${level}: ${message}`);
    },
  } as ConstructorParameters<typeof DOMParser>[0]).parseFromString(xml, 'application/xml');
  return errors;
}

/** Svaki XML/rels dio paketa mora biti well-formed po OBA misljenja. */
export async function assertPartsWellFormed(bytes: Uint8Array, label: string): Promise<void> {
  const entries = await readZip(bytes);

  const scannerProblems = inspectDocxParts(entries)
    .filter((p) => !p.ok)
    .map((p) => `${p.part}: ${p.problem} (offset ${p.offset})`);
  expect(scannerProblems, `${label}: strogi skener javlja neispravan XML`).toEqual([]);

  const decoder = new TextDecoder();
  const domProblems: string[] = [];
  for (const entry of entries) {
    if (!/\.(xml|rels)$/i.test(entry.name)) continue;
    const errors = xmldomErrors(decoder.decode(entry.data));
    if (errors.length) domProblems.push(`${entry.name}: ${errors[0]}`);
  }
  expect(domProblems, `${label}: xmldom javlja neispravan XML`).toEqual([]);
}

/**
 * Dijelovi bez kojih .docx prestaje biti .docx. Njihov gubitak se NIKAD ne smije dopustiti,
 * ni preko `allowDropped` (zato je provjera odvojena od one dolje).
 */
const CRITICAL_PARTS = ['[Content_Types].xml', '_rels/.rels', 'word/document.xml'];

export interface PackageIntactOptions {
  /**
   * Dijelovi koje smije ukloniti bas ovaj popravak. Legitiman primjer: final-document-inspector-fixer
   * radi "cistu kopiju" pa namjerno mice word/comments.xml (mehanizam `removedPackageParts` u
   * apply-fixers.ts). Sve ostalo sto nestane je bug, pa lista mora biti izricita i uska.
   */
  allowDropped?: readonly string[];
}

/**
 * Puni gate nakon popravka: izlaz je well-formed, kriticni dijelovi su tu, i nijedan dio nije
 * nestao ni ispraznjen osim onih koje pozivatelj izricito dopusti.
 * Dodani dijelovi su uvijek dopusteni (fixeri legitimno dodaju npr. word/numbering.xml ili footer).
 */
export async function assertPackageIntact(
  before: Uint8Array,
  after: Uint8Array,
  label: string,
  opts: PackageIntactOptions = {},
): Promise<void> {
  await assertPartsWellFormed(after, label);
  const diff = comparePackages(await readZip(before), await readZip(after));

  const criticalLost = diff.dropped.filter((name) => CRITICAL_PARTS.includes(name));
  expect(criticalLost, `${label}: KRITICNI dio paketa je nestao`).toEqual([]);

  const allowed = new Set(opts.allowDropped ?? []);
  const unexpectedlyDropped = diff.dropped.filter((name) => !allowed.has(name));
  expect(unexpectedlyDropped, `${label}: dijelovi paketa su NESTALI nakon popravka`).toEqual([]);
  expect(diff.emptied, `${label}: dijelovi paketa su ISPRAZNJENI nakon popravka`).toEqual([]);
}

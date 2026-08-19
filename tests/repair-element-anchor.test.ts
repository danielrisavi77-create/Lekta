/**
 * RE-60: analiza i element-caption-fixer razlicito broje djecu tijela dokumenta, pa se
 * `bodyChildIndex` iz recepta ne poklapa s onim sto fixer vidi.
 *
 * Dvije nezavisne greske, obje vidljive tek na dokumentu s automatskim sadrzajem:
 *  - analiza (`bodyChildren` u element-structure.ts) filtrira djecu na p/tbl/sectPr, pa `w:sdt`
 *    (Wordov automatski sadrzaj) UOPCE ne broji i svi indeksi iza njega su premali,
 *  - fixer (`bodyChildren` u element-caption-fixer.ts) skenira samo tokene w:p/w:tbl/w:sectPr, pa
 *    ne zna za `w:sdt` i odlomke UNUTAR njega broji kao djecu tijela.
 *
 * Posljedica: sidro po indeksu nikad ne pogodi, pa fixer pada na rezervnu pretragu po otisku
 * sadrzaja. Dok su elementi jedinstveni, to prolazi neprimijeceno. Cim dokument ima dvije
 * bajt-identicne tablice (dvaput ubacen isti prazan predlozak), pretraga nadje dva pogotka i
 * CIJELI popravak natpisa odustane s 'unsupported-structure'.
 *
 * Automatski sadrzaj ima gotovo svaki diplomski rad, pa ovo nije rubni slucaj.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeFixture, resolveProfile } from '../src/analysis/golden-entry';
import { repairEntriesFor , ensureRepairMapHeavy } from '../src/profiles/profile-runtime-maps';

// repair-map je lijen; ucitaj ga prije prvog repairEntriesFor u ovom modulu.
await ensureRepairMapHeavy();
import { elementCaptionRepairableItem } from '../src/ui/repair-items';
import { applyFixers } from '../src/repair/apply-fixers';
import { readZip } from '../src/repair/zip-codec';
import { parseXml } from '../src/docx/parser';

const here = dirname(fileURLToPath(import.meta.url));
// Kompozitni fixture ima SDT sadrzaj i DVIJE bajt-identicne tablice (tijelo + prilog).
const FIXTURE = join(here, 'fixtures', 'docx', 'fer-diplomski-puna-struktura.docx');
const PROFILE_ID = 'fer-diplomski';
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

async function analysed() {
  const bytes = new Uint8Array(readFileSync(FIXTURE));
  const file = new File([bytes], 'anchor.docx', { type: DOCX_MIME });
  const result = await analyzeFixture(file, { profileId: PROFILE_ID });
  const profile = resolveProfile(PROFILE_ID) as Record<string, unknown>;
  profile.ruleEntries = repairEntriesFor(PROFILE_ID);
  return { bytes, result, profile };
}

describe('RE-60: sidro elementa po indeksu djeteta tijela', () => {
  it('bodyChildIndex iz analize pokazuje na tocno to dijete u dokumentu', async () => {
    const { bytes, result } = await analysed();
    const documentXml = new TextDecoder().decode(
      (await readZip(bytes)).find((entry) => entry.name === 'word/document.xml')!.data,
    );
    const body = parseXml(documentXml, 'document').getElementsByTagName('w:body')[0];
    const children: string[] = [];
    for (let node = body.firstChild; node; node = node.nextSibling) {
      if (node.nodeType === 1) children.push((node as unknown as { nodeName: string }).nodeName);
    }

    const candidates = (result as { details?: { elementStructure?: { candidates?: Array<{ kind: string; anchor: { bodyChildIndex: number } }> } } })
      .details?.elementStructure?.candidates ?? [];
    expect(candidates.length, 'fixture mora imati prepoznate elemente').toBeGreaterThan(0);

    for (const candidate of candidates) {
      const tag = children[candidate.anchor.bodyChildIndex];
      // Tablica mora sjediti na <w:tbl>, a slika je u odlomku <w:p>.
      const expected = candidate.kind === 'table' ? 'w:tbl' : 'w:p';
      expect(tag, `element vrste ${candidate.kind} na indeksu ${candidate.anchor.bodyChildIndex}`).toBe(expected);
    }
  }, 30000);

  it('popravak natpisa prolazi i kad dokument ima dvije identicne tablice', async () => {
    const { bytes, result, profile } = await analysed();
    const item = elementCaptionRepairableItem(result, profile)[0];
    expect(item, 'natpisi se moraju nuditi').toBeTruthy();

    const applied = await applyFixers(bytes, [{
      fixerId: item.fixerId as never,
      ruleId: 'element-caption-rule',
      params: item.params as Record<string, unknown>,
    }]);
    expect(
      applied.skippedReasons['element-caption-rule'],
      'sidro se mora naci po indeksu, bez rezervne pretrage koja na duplikatima odustaje',
    ).toBeUndefined();
    expect(applied.changelog.length).toBeGreaterThan(0);
  }, 30000);
});

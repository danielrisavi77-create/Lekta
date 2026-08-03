/**
 * Faza A0 (dokaz zatecenog stanja prije nego se dira ista): zasto postojeci `parseXml` NE SMIJE
 * biti gate za ispravnost .docx paketa.
 *
 * RE-47 je bio: `w:dirty="true"` umetnut IZA kose crte samozatvarajuceg taga
 *
 *     <w:fldChar w:fldCharType="begin"/ w:dirty="true">
 *
 * XML koji vise nije valjan. Prosao je SVE postojece testove, a u produkciji je obarao vlastito
 * brojanje odlomaka (392 -> 71) pa su svi kasniji anchor-osjetljivi fixeri tiho vracali 'no-target'.
 *
 * Ovaj test dokazuje TRI stvari koje odreduju kako se gradi validator:
 *   1. `parseXml` (src/docx/parser.ts) NE baca na tom XML-u. Njegov guard trazi `parsererror` cvor,
 *      sto je PREGLEDNICKA semantika; @xmldom/xmldom taj cvor ne stvara. Kako je xmldom runtime
 *      SVIH testova (tests/setup/xml-dom.ts) i produkcijskog workera, recikliranje `parseXml` kao
 *      gatea dalo bi LAZNO ZELENO tocno na klasi greske zbog koje gate uopce gradimo.
 *   2. Isti xmldom s `onError` kolektorom gresku UREDNO prijavljuje. To je jeftino "drugo misljenje"
 *      koje smije zivjeti u testovima (u Denu, gdje vrti Edge Function, DOMParsera nema).
 *   3. Svih 11 postojecih fixtura je strogo well-formed po svakom dijelu paketa, dakle nema
 *      skrivenog duga: kad gate zazivi, mora biti zelen od prve.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { DOMParser } from '@xmldom/xmldom';
import { parseXml } from '../src/docx/parser';
import { readZip } from '../src/repair/zip-codec';

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(here, 'fixtures', 'docx');

/** Doslovan oblik koji je RE-47 proizvodio: atribut iza kose crte samozatvarajuceg taga. */
const MALFORMED =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
  '<w:p><w:r><w:fldChar w:fldCharType="begin"/ w:dirty="true"></w:r></w:p>' +
  '</w:body></w:document>';

const WELL_FORMED = MALFORMED.replace('/ w:dirty="true">', ' w:dirty="true"/>');

/** xmldom ne baca; greske prijavljuje kroz `onError`. Skupi ih i vrati samo razinu 'error'. */
function xmldomErrors(xml: string): string[] {
  const errors: string[] = [];
  new DOMParser({
    onError: (level: string, message: string) => {
      if (level === 'error' || level === 'fatalError') errors.push(`${level}: ${message}`);
    },
  } as ConstructorParameters<typeof DOMParser>[0]).parseFromString(xml, 'application/xml');
  return errors;
}

describe('A0: parseXml je slijep na RE-47 klasu (zato validator mora biti vlastiti)', () => {
  it('parseXml NE baca na neispravnom samozatvarajucem tagu', () => {
    // Kad bi ovo bacalo, `parseXml` bi bio dovoljan gate i cijeli skener ne bi trebao.
    // Ne baca, pa je ovaj expect namjerno "obrnut": dokumentira slijepu pjegu.
    expect(() => parseXml(MALFORMED, 'RE-47 uzorak')).not.toThrow();
  });

  it('xmldom s onError kolektorom TU gresku prijavljuje', () => {
    const errors = xmldomErrors(MALFORMED);
    expect(errors.length, 'ocekujemo barem jednu prijavljenu gresku').toBeGreaterThan(0);
    expect(errors.join(' ')).toMatch(/closed character|'\/'/i);
  });

  it('ispravan oblik (atribut PRIJE kose crte) ne proizvodi nijednu gresku', () => {
    expect(xmldomErrors(WELL_FORMED)).toEqual([]);
  });
});

describe('A0: baseline - svi postojeci fixturi su strogo well-formed', () => {
  it('svaki XML dio svakog .docx fixturea prolazi bez xmldom greske', async () => {
    const files = readdirSync(FIXTURE_DIR).filter((n) => n.toLowerCase().endsWith('.docx')).sort();
    expect(files.length, 'fixturi moraju postojati').toBeGreaterThan(0);

    const problems: string[] = [];
    for (const name of files) {
      const entries = await readZip(new Uint8Array(readFileSync(join(FIXTURE_DIR, name))));
      for (const entry of entries) {
        if (!/\.(xml|rels)$/i.test(entry.name)) continue;
        const xml = new TextDecoder().decode(entry.data);
        const errors = xmldomErrors(xml);
        if (errors.length) problems.push(`${name} :: ${entry.name} :: ${errors[0]}`);
      }
    }
    expect(problems, `neispravni dijelovi:\n${problems.join('\n')}`).toEqual([]);
  });
});

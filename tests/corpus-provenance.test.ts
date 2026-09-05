/**
 * PROVENIJENCIJA KORPUSA: dokazuje da fixture koje tvrde da su iz nekog alata doista jesu.
 *
 * Zasto postoji: izmjereno 2026-08-23, svih 38 stvarnih radova (`tests/fixtures/docx-local/`) i
 * svih 17 tadasnjih commitanih fixtura nosilo je `Microsoft Office Word`. LibreOffice, Google
 * Docs i Pages imali su NULA dokumenata, a jedini "LibreOffice" svjedok
 * (`synthetic-libreoffice-standard-default.docx`) bio je RUCNO sastavljen XML, ne izlaz alata.
 *
 * Bez ovog garda dovoljno je da netko zamijeni datoteku dokumentom iz Worda i provenijencijska
 * os tiho nestane, dok ime datoteke i dalje tvrdi suprotno.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readZip } from '../src/repair/zip-codec';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'docx');

/** `docProps/app.xml` -> `<Application>`; jedini dio koji imenuje alat koji je zadnji spremio. */
async function applicationOf(fileName: string): Promise<string | null> {
  const entries = await readZip(new Uint8Array(readFileSync(join(FIXTURES, fileName))));
  const app = entries.find((entry) => entry.name === 'docProps/app.xml');
  if (!app) return null;
  const xml = new TextDecoder().decode(app.data);
  return /<Application>([^<]*)<\/Application>/.exec(xml)?.[1] ?? null;
}

const loFixtures = readdirSync(FIXTURES).filter((name) => /^lo-.*\.docx$/i.test(name));

describe('provenijencija generiranih fixtura', () => {
  it('postoji barem jedan LibreOffice dokument (os je do 2026-08-23 bila prazna)', () => {
    expect(loFixtures.length).toBeGreaterThan(0);
  });

  it.each(loFixtures)('%s je stvarni izlaz LibreOfficea, ne Word i ne rucni XML', async (fileName) => {
    const application = await applicationOf(fileName);
    expect(application, `${fileName} nema docProps/app.xml <Application>`).toBeTruthy();
    expect(application).toMatch(/^LibreOffice\//);
  });

  /**
   * Negativna kontrola: dokazuje da provjera GRIZE. Word fixture MORA pasti isti predikat,
   * inace bi test prolazio i nad korpusom u kojem LibreOfficea uopce nema.
   */
  it('negativna kontrola: Word fixture ne prolazi LibreOffice predikat', async () => {
    const wordFixture = readdirSync(FIXTURES).find((name) => name === 'word-veliki-neuredan.docx');
    expect(wordFixture, 'ocekivan Word fixture kao kontrola').toBeTruthy();
    const application = await applicationOf(wordFixture as string);
    expect(application).toMatch(/Microsoft/);
    expect(application).not.toMatch(/^LibreOffice\//);
  });
});

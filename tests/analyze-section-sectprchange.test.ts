import { describe, expect, it } from 'vitest';
import { analyzeFixture } from '../src/analysis/golden-entry';
import { zipStore } from './helpers/docx-builder';

/**
 * `els()` je getElementsByTagName, dakle SVI potomci. Praceni `w:sectPrChange` (Track Changes
 * povijest postavki stranice) UGNJEZDUJE stari `<w:sectPr>` unutar zivog, pa je legacy
 * enumeracija u analyze-docx brojala i povijesnu kopiju kao stvarnu sekciju.
 *
 * Posljedica NIJE samo kriv repair target: `details.sections` hrani i BODOVANE provjere
 * (margine, format stranice, numeriranje), pa fantomska sekcija moze pomaknuti OCJENU.
 * Uz to `introSectionRepairableItem` gejta na `sections.length !== 1` pa bi fantom TIHO
 * ugasio ponudu koja se treba pojaviti.
 */
const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';

function docWithTrackedSectPr(): File {
  const enc = new TextEncoder();
  // Jedna STVARNA sekcija na razini body-a; unutar nje sectPrChange s povijesnom kopijom.
  const documentXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document ${NS}><w:body>` +
    `<w:p><w:r><w:t>Uvod</w:t></w:r></w:p>` +
    `<w:sectPr>` +
    `<w:pgSz w:w="11906" w:h="16838"/>` +
    `<w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/>` +
    `<w:sectPrChange w:id="1" w:author="X">` +
    `<w:sectPr><w:pgMar w:top="9999" w:right="9999" w:bottom="9999" w:left="9999"/></w:sectPr>` +
    `</w:sectPrChange>` +
    `</w:sectPr>` +
    `</w:body></w:document>`;
  const styles =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:styles ${NS}><w:docDefaults><w:rPrDefault><w:rPr>` +
    `<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="24"/>` +
    `</w:rPr></w:rPrDefault></w:docDefaults></w:styles>`;
  const ct =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
    `</Types>`;
  const rels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
    `</Relationships>`;
  const bytes = zipStore([
    { name: '[Content_Types].xml', data: enc.encode(ct) },
    { name: '_rels/.rels', data: enc.encode(rels) },
    { name: 'word/document.xml', data: enc.encode(documentXml) },
    { name: 'word/styles.xml', data: enc.encode(styles) },
  ]);
  return new File([bytes], 'tracked-sectpr.docx', {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}

describe('sekcije: praceni sectPrChange nije stvarna sekcija', () => {
  it('broji tocno jednu sekciju iako sectPrChange nosi ugnjezdeni sectPr', async () => {
    const result: any = await analyzeFixture(docWithTrackedSectPr());
    expect(result.details.sections).toHaveLength(1);
    expect(result.stats.sections).toBe(1);
  });

  it('ne cita margine iz povijesne (pracene) kopije', async () => {
    const result: any = await analyzeFixture(docWithTrackedSectPr());
    // 1134 twips = 2 cm. Povijesna kopija (9999) ne smije se pojaviti.
    expect(result.details.sections[0].margins.top).toBeCloseTo(2, 1);
  });
});

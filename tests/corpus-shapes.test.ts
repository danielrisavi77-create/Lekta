/**
 * GARD NAD DETEKTOROM OBLIKA (`src/corpus/docx-shapes.ts`).
 *
 * Dva pitanja, namjerno odvojena:
 *
 * 1. GRIZE LI detektor. Za svaki oblik postoji paket koji ga nosi i paket koji ga NE nosi, oba
 *    gradjena istim graditeljem. Bez negativne kontrole "prolazi" i detektor koji vristi na sve.
 * 2. STO COMMITANE FIXTURE STVARNO NOSE. To je mjerenje, ne zelja, i zapisano je kao popis oblika
 *    koje NIJEDNA commitana fixtura nema. Taj popis je razlog zbog kojeg sinteticki korpus uopce
 *    ima smisla: dok je dugacak, nas graditelj ne proizvodi ono na cemu je motor stvarno padao.
 *
 * Zasto popis, a ne broj: 2026-08-31 je izmjereno da broj blokatora ostane isti dok se sastav
 * promijeni (jedan ode, drugi dodje), pa samo IMENOVAN popis to uhvati.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readZip } from '../src/repair/zip-codec';
import {
  DOCX_SHAPE_IDS,
  detectShapes,
  presentShapes,
  verifyShapeClaims,
  type DocxShapeCounts,
  type DocxShapeId,
} from '../src/corpus/docx-shapes';
import { buildDocx, TOC_FIELD_PARA, type DocSpec, type ParaSpec } from './helpers/docx-builder';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE_ROOTS = [
  join(HERE, 'fixtures', 'docx'),
  join(HERE, 'fixtures', 'docx-word'),
  // Traka `authored`: izlazi pravih alata nad prozom pisanom izvan pipelinea. Ulaze u OVO mjerenje
  // jer je pitanje "koje oblike nas commitani skup nosi", a ne "sto je dokaz"; u dokaz ne ulaze
  // nikad, jer im sidecar nosi `synthetic: true` i traku izvan dopustenih.
  join(HERE, 'fixtures', 'docx-authored'),
  // Traka `handbuilt`: paketi slozeni rucno, radi oblika PAKIRANJA koje ni Word ni LibreOffice na
  // ovom stroju ne pisu. Vrijedi im isto sto i traci `authored`: broje se u ovo mjerenje, u dokaz
  // nikad (`synthetic: true` plus traka izvan `ADMITTED_TRACKS`).
  join(HERE, 'fixtures', 'docx-packaging'),
];

async function shapesOfBytes(bytes: Uint8Array): Promise<DocxShapeCounts> {
  return detectShapes(await readZip(bytes));
}

async function shapesOfSpec(spec: DocSpec, extra?: Array<{ name: string; data: Uint8Array }>) {
  return shapesOfBytes(buildDocx(spec, extra));
}

const body = (text: string): ParaSpec => ({ text });

/** Osnovni valjan dokument; svaka kontrola krece od njega pa dodaje JEDAN oblik. */
function baseSpec(paragraphs: ParaSpec[] = [body('Uvodni odlomak ovog dokumenta.')]): DocSpec {
  return { paragraphs, settings: true };
}

describe('detektor oblika: pozitivna i negativna kontrola', () => {
  it('naslov/tab-u-naslovu: hvata tab u NESTILIZIRANOM numeriranom naslovu', async () => {
    const sTab = await shapesOfSpec(
      baseSpec([
        { raw: '<w:p><w:r><w:t>1.</w:t></w:r><w:r><w:tab/></w:r><w:r><w:t>UVOD</w:t></w:r></w:p>' },
        body('Tijelo rada.'),
      ]),
    );
    const sBez = await shapesOfSpec(
      baseSpec([
        { raw: '<w:p><w:r><w:t>1. UVOD</w:t></w:r></w:p>' },
        body('Tijelo rada.'),
      ]),
    );
    expect(sTab['naslov/tab-u-naslovu']).toBeGreaterThan(0);
    expect(sBez['naslov/tab-u-naslovu']).toBe(0);
  });

  it('naslov/tab-u-naslovu: tab u OBICNOM odlomku nije naslov, pa se ne broji', async () => {
    const s = await shapesOfSpec(
      baseSpec([
        {
          raw:
            '<w:p><w:r><w:t>Ovo je obican odlomak tijela rada koji sadrzi tabulator</w:t></w:r>' +
            '<w:r><w:tab/></w:r><w:r><w:t>i nastavlja se dalje.</w:t></w:r></w:p>',
        },
      ]),
    );
    expect(s['naslov/tab-u-naslovu']).toBe(0);
  });

  /**
   * Izmjereno na `tests/fixtures/docx-word/manual-toc.docx`: prije izuzeca je detektor ondje javio
   * PET naslova s tabom, jer rucna stavka sadrzaja ima oba obiljezja (broj na pocetku, tabulator).
   * Da je tako ostalo, svaki dokument s rucnim sadrzajem tvrdio bi oblik koji ne nosi.
   */
  it('naslov/tab-u-naslovu: rucna stavka sadrzaja NIJE naslov s tabom', async () => {
    const s = await shapesOfSpec(
      baseSpec([
        { text: 'Sadrzaj', styleId: 'Heading1' },
        { raw: '<w:p><w:r><w:t>1. Uvod</w:t></w:r><w:r><w:tab/></w:r><w:r><w:t>3</w:t></w:r></w:p>' },
        { raw: '<w:p><w:r><w:t>2. Razrada</w:t></w:r><w:r><w:tab/></w:r><w:r><w:t>7</w:t></w:r></w:p>' },
      ]),
    );
    expect(s['naslov/tab-u-naslovu']).toBe(0);
    expect(s['toc/rucno-tipkan']).toBe(1);
  });

  it('paket/bez-settings: hvata izostanak settings.xml, a s njim je cist', async () => {
    const sSa = await shapesOfSpec({ paragraphs: [body('Tekst.')], settings: true });
    const sBez = await shapesOfSpec({ paragraphs: [body('Tekst.')] });
    expect(sBez['paket/bez-settings']).toBe(1);
    expect(sSa['paket/bez-settings']).toBe(0);
  });

  it('tekst/kosi-padez: hvata "u Tablici 1", ne hvata nominativ koji je motor vec znao', async () => {
    const sKosi = await shapesOfSpec(baseSpec([body('Rezultati su prikazani u Tablici 1 i na Slici 2.')]));
    const sNominativ = await shapesOfSpec(baseSpec([body('Tablica 1 prikazuje rezultate mjerenja.')]));
    expect(sKosi['tekst/kosi-padez']).toBe(2);
    expect(sNominativ['tekst/kosi-padez']).toBe(0);
  });

  it('tekst/kosi-padez: hvata izraz razlomljen na vise runova, kako ga Word i pise', async () => {
    const s = await shapesOfSpec(
      baseSpec([
        {
          raw:
            '<w:p><w:r><w:t xml:space="preserve">Prikazano je u </w:t></w:r>' +
            '<w:r><w:rPr><w:b/></w:rPr><w:t>Tablici</w:t></w:r>' +
            '<w:r><w:t xml:space="preserve"> 1</w:t></w:r>' +
            '<w:r><w:t>.</w:t></w:r></w:p>',
        },
      ]),
    );
    expect(s['tekst/kosi-padez']).toBe(1);
  });

  it('tekst/biblio-kandidat: hvata numeriranu stavku s inicijalima, ne hvata obican naslov', async () => {
    const sBib = await shapesOfSpec(
      baseSpec([body('8. Lezaic A. Komunikacija u zdravstvenom timu. Sestrinski glasnik. 2019;24(2):101-108.')]),
    );
    const sNaslov = await shapesOfSpec(baseSpec([body('8. Zakljucak')]));
    expect(sBib['tekst/biblio-kandidat']).toBe(1);
    expect(sNaslov['tekst/biblio-kandidat']).toBe(0);
  });

  it('tekst/naslovnica-natpis: hvata natpis vrste rada, ne hvata rijec "rad" u recenici', async () => {
    const sNatpis = await shapesOfSpec(baseSpec([body('ZAVRSNI RAD')]));
    const sProza = await shapesOfSpec(baseSpec([body('Ovaj rad razmatra formalne kriterije oblikovanja.')]));
    expect(sNatpis['tekst/naslovnica-natpis']).toBe(1);
    expect(sProza['tekst/naslovnica-natpis']).toBe(0);
  });

  it('opseg/prazni-preko-20: prag pada tek IZNAD 20, i tada nosi stvarni broj', async () => {
    const prazni = (n: number): ParaSpec[] => Array.from({ length: n }, () => ({ empty: true as const }));
    const sPod = await shapesOfSpec(baseSpec([body('Tekst.'), ...prazni(20)]));
    const sIznad = await shapesOfSpec(baseSpec([body('Tekst.'), ...prazni(25)]));
    expect(sPod['opseg/prazni-preko-20']).toBe(0);
    expect(sIznad['opseg/prazni-preko-20']).toBe(25);
  });

  it('toc/polje i toc/rucno-tipkan se iskljucuju: polje ILI rucni naslov, nikad oboje', async () => {
    const sPolje = await shapesOfSpec(baseSpec([{ text: 'Sadrzaj', styleId: 'Heading1' }, TOC_FIELD_PARA]));
    const sRucno = await shapesOfSpec(baseSpec([{ text: 'Sadrzaj', styleId: 'Heading1' }, body('1. Uvod ... 3')]));
    expect(sPolje['toc/polje']).toBeGreaterThan(0);
    expect(sPolje['toc/rucno-tipkan']).toBe(0);
    expect(sRucno['toc/rucno-tipkan']).toBe(1);
    expect(sRucno['toc/polje']).toBe(0);
  });

  it('paket/comments-prazan: dio postoji a nema komentara (potpis ne-Word alata)', async () => {
    const prazan = new TextEncoder().encode(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<w:comments xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"/>',
    );
    const pun = new TextEncoder().encode(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<w:comments xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
        '<w:comment w:id="1"><w:p><w:r><w:t>Biljeska.</w:t></w:r></w:p></w:comment></w:comments>',
    );
    const sPrazan = await shapesOfSpec(baseSpec(), [{ name: 'word/comments.xml', data: prazan }]);
    const sPun = await shapesOfSpec(baseSpec(), [{ name: 'word/comments.xml', data: pun }]);
    const sBez = await shapesOfSpec(baseSpec());
    expect(sPrazan['paket/comments-prazan']).toBe(1);
    expect(sPrazan['paket/komentari']).toBe(0);
    expect(sPun['paket/comments-prazan']).toBe(0);
    expect(sPun['paket/komentari']).toBe(1);
    expect(sBez['paket/comments-prazan']).toBe(0);
  });

  it('svaki oblik postoji kao kljuc i kad ga nema (0 se razlikuje od "nije mjereno")', async () => {
    const s = await shapesOfSpec(baseSpec());
    for (const id of DOCX_SHAPE_IDS) expect(typeof s[id], id).toBe('number');
  });
});

describe('detektor oblika: sto nas graditelj fixtura NE moze proizvesti', () => {
  /**
   * Ovo nije nedostatak testa nego IZMJERENA granica graditelja, i zato stoji kao tvrdnja.
   * `zipStore` pise metodom 0 i zastavicama 0, pa DEFLATE i bit 3 iz njega ne mogu izaci; oba
   * oblika u korpus ulaze samo kroz PRAVI alat (Word odnosno LibreOffice).
   */
  it('zipStore ne proizvodi ni DEFLATE ni zastavicu bit 3, a pravi Word fixture ima DEFLATE', async () => {
    const s = await shapesOfSpec(baseSpec());
    expect(s['zip/deflate']).toBe(0);
    expect(s['zip/bit3']).toBe(0);

    const word = join(HERE, 'fixtures', 'docx-word', 'anchor-cases.docx');
    const sWord = await shapesOfBytes(new Uint8Array(readFileSync(word)));
    expect(sWord['zip/deflate']).toBeGreaterThan(0);
    expect(sWord['proizvodjac/word']).toBe(1);
  });
});

describe('verifyShapeClaims: tvrdnja sidecara protiv stvarnog paketa', () => {
  const nula = Object.fromEntries(DOCX_SHAPE_IDS.map((id) => [id, 0])) as DocxShapeCounts;

  it('tvrdjen oblik kojeg u paketu nema je NALAZ', () => {
    const v = verifyShapeClaims(['naslov/tab-u-naslovu'], nula);
    expect(v.missing).toEqual(['naslov/tab-u-naslovu']);
  });

  it('nepoznato ime oblika je NALAZ, ne tiho ispunjena tvrdnja', () => {
    const v = verifyShapeClaims(['naslov/tab-u-naslov'], nula);
    expect(v.unknown).toEqual(['naslov/tab-u-naslov']);
    expect(v.missing).toEqual([]);
  });

  it('brojac mutacije na nuli je mrtav mehanizam, ne uspjeh', () => {
    const v = verifyShapeClaims([], nula, { tabInHeading: 0 }, { tabInHeading: 'naslov/tab-u-naslovu' });
    expect(v.underDetected).toEqual(['tabInHeading: brojac 0 (mrtav mehanizam)']);
  });

  it('brojac veci od detektiranog je NALAZ, jednak ili manji nije', () => {
    const counts = { ...nula, 'naslov/tab-u-naslovu': 3 } as DocxShapeCounts;
    const map = { tabInHeading: 'naslov/tab-u-naslovu' as DocxShapeId };
    expect(verifyShapeClaims([], counts, { tabInHeading: 5 }, map).underDetected).toHaveLength(1);
    expect(verifyShapeClaims([], counts, { tabInHeading: 3 }, map).underDetected).toEqual([]);
  });

  it('ispunjena tvrdnja ne proizvodi nijedan nalaz (baseline)', () => {
    const counts = { ...nula, 'naslov/tab-u-naslovu': 2 } as DocxShapeCounts;
    const v = verifyShapeClaims(['naslov/tab-u-naslovu'], counts, { tabInHeading: 2 }, {
      tabInHeading: 'naslov/tab-u-naslovu',
    });
    expect(v).toEqual({ missing: [], unknown: [], underDetected: [] });
  });
});

/**
 * Oblici koje NIJEDNA commitana fixtura ne nosi, izmjereno 2026-09-06 nad
 * `tests/fixtures/docx` (19) i `tests/fixtures/docx-word` (5).
 *
 * Ovo je popis razloga zbog kojeg sinteticki korpus postoji: svaki redak je nalaz sa STVARNIH
 * radova koji nas graditelj danas ne moze reproducirati, pa nijedan test nad commitanim skupom
 * ne moze pasti na njemu. Popis se skracuje kako trake `authored` i `generated` dodaju dokumente,
 * i svaka izmjena mora biti svjesna: test trazi TOCNU jednakost, u oba smjera.
 */
const OBLICI_BEZ_IJEDNE_FIXTURE: DocxShapeId[] = [];

/**
 * SKRACEN 2026-09-06, s deset na pet, i to je cijela svrha trake `authored`.
 *
 * Zatvorio ih je JEDAN par dokumenata (usklađen + neuredan, FPZG zavrsni, izlaz pravog LibreOfficea):
 *
 *     paket/komentari          komentari mentora ostavljeni u dokumentu
 *     naslov/samo-razina-3     svi naslovi na razini 3, hijerarhija prolazi vakuumski
 *     tekst/kosi-padez         "u Tablici 1" (RE-58); nominativ je motor vec znao
 *     tekst/biblio-kandidat    numerirana stavka literature koju motor moze uzeti za naslov
 *     opseg/prazni-preko-20    prazni odlomci umjesto razmaka; 34 od 38 stvarnih radova ih ima
 *
 * SKRACEN 2026-09-08, s pet na JEDAN, i to mjerenjem, ne dodavanjem proze.
 *
 * Tri oblika zatvorio je jedan RUCNO slozen paket (`tests/fixtures/docx-packaging/gdocs-otisak.docx`,
 * traka `handbuilt`): `zip/direktoriji`, `paket/comments-prazan`, `gdocs/potpis`. Google Docs izvoz
 * na ovom stroju nije izvediv, pa je njegov otisak REPRODUCIRAN iz mjerenja nad 457 stvarnih radova,
 * i tako je i imenovan; gard koji ga tjera kroz motor je `tests/corpus-packaging.test.ts`.
 *
 * Cetvrti, `proizvodjac/google-docs`, nije zatvoren nego UKLONJEN, jer se ne moze zatvoriti. Trazio
 * je `<Application>` koji sadrzi "Google", a takvog nema nijedan od 457 radova; Google Docs taj
 * element uopce ne pise, nego ostavlja prazan `<Properties/>`, sto je bas `gdocs/potpis`. Dva oblika
 * su se time medjusobno iskljucivala: dokument koji nosi jedan ne moze nositi drugi, pa je "Google
 * Docs roundtrip" kao put zatvaranja bio kriv za oba razloga.
 *
 * ZATVOREN NA NULU 2026-09-09, i to treba citati oprezno. Peti oblik, `paket/bez-png-default`, dobio
 * je nositelja ODLUKOM VLASNIKA, ne nalazom: `tests/fixtures/docx-packaging/png-bez-defaulta.docx` je
 * rucno slozen paket s `word/media/slika1.png` bez `Default Extension="png"`. Mjerenje nad 457
 * stvarnih radova taj oblik nije naslo ni na jednom (205 ih ima png i svih 205 ga deklarira), pa je
 * popis oblika bez NOSITELJA prazan, a popis oblika bez POTKREPE nije. Razlika je zapisana i u
 * sidecaru te fixture i uz sam oblik u `docx-shapes.ts`.
 *
 * Prazan popis nosi vlastitu opasnost: od danas svaka tvrdnja ovog testa vrti po praznom skupu, pa
 * bi detektor koji svakom dokumentu vrati SVE oblike proizveo isti prazan popis. Zato uz jednakost
 * stoji i tvrdnja da nijedna pojedina fixtura ne nosi sve oblike.
 */

describe('izmjereno: koje oblike commitane fixture nose', () => {
  it('popis oblika bez ijedne fixture odgovara mjerenju', async () => {
    const nosi = new Set<DocxShapeId>();
    let documentCount = 0;
    let najviseUJednom = 0;
    for (const root of FIXTURE_ROOTS) {
      let files: string[] = [];
      try {
        files = readdirSync(root).filter((f) => f.toLowerCase().endsWith('.docx')).sort();
      } catch {
        continue;
      }
      for (const file of files) {
        documentCount += 1;
        const counts = await shapesOfBytes(new Uint8Array(readFileSync(join(root, file))));
        const uOvom = presentShapes(counts);
        najviseUJednom = Math.max(najviseUJednom, uOvom.length);
        for (const id of uOvom) nosi.add(id);
      }
    }
    // Prazan skup dokumenata bi svaki oblik proglasio nepokrivenim i test bi vakuumski "prosao".
    expect(documentCount).toBeGreaterThan(15);
    /**
     * ANTI-VAKUUM ZA PRAZAN POPIS. Otkako je popis prazan, jednakost nize prolazi i kad detektor
     * poludi u drugom smjeru: kad bi svakom dokumentu vratio SVE oblike, `nosi` bi bio pun i
     * `bezFixture` bi opet bio prazan. Zato se tvrdi i da nijedna pojedina fixtura ne nosi sve, sto
     * mjeri razlikuje li detektor dokumente medjusobno. Isti razred kao prazan popis mrtvih fixera
     * u mrezi popravka: prazno mora znaciti "izmjereno i nije nadjeno", ne "nije izmjereno".
     */
    expect(najviseUJednom).toBeLessThan(DOCX_SHAPE_IDS.length);

    const bezFixture = DOCX_SHAPE_IDS.filter((id) => !nosi.has(id));
    expect(
      bezFixture,
      'popis oblika bez ijedne commitane fixture se promijenio; azuriraj OBLICI_BEZ_IJEDNE_FIXTURE svjesno',
    ).toEqual(OBLICI_BEZ_IJEDNE_FIXTURE);
  }, 60_000);

  it('mjerenje nije prazno: barem jedan oblik nosi vise fixtura', async () => {
    const counts = await shapesOfBytes(
      new Uint8Array(readFileSync(join(HERE, 'fixtures', 'docx-word', 'tabstop-and-cs-fonts.docx'))),
    );
    // Ta je fixtura Wordom napravljena bas za dva oblika koje graditelj ne proizvodi.
    expect(counts['tab/tocke-vodic']).toBeGreaterThan(0);
    expect(counts['font/samo-cs-eastAsia']).toBeGreaterThan(0);
  });
});

/**
 * Testovi intake gatea (sloj 1 dvoslojne politike): tvrdi reject samo nedvosmisleno
 * (premalo, nije ZIP, korupcija, makronaredbe, bez glavnog dijela, prazno), sumnjivo
 * se samo oznacava (pred-run potvrda u UI-ju), pravi radovi prolaze cisto.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  inspectDocxIntake,
  postRunSuspicion,
  MIN_DOCX_BYTES,
  SUSPICIOUS_WORDS_MAX,
} from '../src/docx/intake-gate';
import { buildDocx, buildDocxFile, zipStore, type ParaSpec } from './helpers/docx-builder';

const enc = new TextEncoder();

function toFile(bytes: Uint8Array, name = 'test.docx'): File {
  return new File([bytes], name, { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}

/** Dovoljno odlomaka da datoteka predje MIN_DOCX_BYTES i ima stvarnog teksta. */
function bulkyParas(n = 40): ParaSpec[] {
  return [
    { text: '1. Uvod', styleId: 'Heading1' },
    ...Array.from({ length: n }, () => ({ text: 'Ovo je smislen odlomak akademskog teksta koji nosi sadržaj rada i riječi. '.repeat(3) })),
  ];
}

function appXml(words: number): { name: string; data: Uint8Array } {
  return {
    name: 'docProps/app.xml',
    data: enc.encode(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Words>${words}</Words><Pages>12</Pages></Properties>`,
    ),
  };
}

describe('inspectDocxIntake: tvrdi rejecti', () => {
  it('smece od 100 bajtova pada kao too-small', async () => {
    const v = await inspectDocxIntake(toFile(new Uint8Array(100).fill(0x41)));
    expect(v).toMatchObject({ kind: 'reject', code: 'too-small' });
  });

  it('minimalni sinteticki docx (~2 KB) je ispod MIN_DOCX_BYTES i pada kao too-small', async () => {
    const bytes = buildDocx({ paragraphs: [{ text: 'Uvod' }] });
    expect(bytes.length).toBeLessThan(MIN_DOCX_BYTES); // dokaz odnosa pragova
    const v = await inspectDocxIntake(toFile(bytes));
    expect(v).toMatchObject({ kind: 'reject', code: 'too-small' });
  });

  it('preimenovana ne-ZIP datoteka (MZ header) pada kao not-zip', async () => {
    const bytes = new Uint8Array(8192);
    bytes[0] = 0x4d; bytes[1] = 0x5a; // "MZ" (exe)
    const v = await inspectDocxIntake(toFile(bytes, 'varka.docx'));
    expect(v).toMatchObject({ kind: 'reject', code: 'not-zip' });
  });

  it('PK potpis pa smece pada kao corrupt', async () => {
    const bytes = new Uint8Array(8192).fill(0x00);
    bytes[0] = 0x50; bytes[1] = 0x4b; bytes[2] = 0x03; bytes[3] = 0x04;
    const v = await inspectDocxIntake(toFile(bytes));
    expect(v).toMatchObject({ kind: 'reject', code: 'corrupt' });
  });

  it('docx s vbaProject.bin pada kao macros', async () => {
    const file = buildDocxFile({ paragraphs: bulkyParas() }, 'makro.docx', [
      { name: 'word/vbaProject.bin', data: new Uint8Array(64).fill(1) },
    ]);
    const v = await inspectDocxIntake(file);
    expect(v).toMatchObject({ kind: 'reject', code: 'macros' });
  });

  it('valjan zip bez word/document.xml pada kao no-document', async () => {
    const filler = new Uint8Array(6000).fill(0x42);
    const bytes = zipStore([
      { name: '[Content_Types].xml', data: enc.encode('<?xml version="1.0"?><Types/>') },
      { name: 'filler.bin', data: filler },
    ]);
    const v = await inspectDocxIntake(toFile(bytes));
    expect(v).toMatchObject({ kind: 'reject', code: 'no-document' });
  });

  it('dokument bez ijedne rijeci (prazni odlomci) pada kao empty', async () => {
    const paragraphs: ParaSpec[] = Array.from({ length: 2000 }, () => ({ text: '', empty: true as const }));
    const file = buildDocxFile({ paragraphs }, 'prazan.docx');
    expect(file.size).toBeGreaterThan(MIN_DOCX_BYTES); // mora proci too-small da bi dosao do empty
    const v = await inspectDocxIntake(file);
    expect(v).toMatchObject({ kind: 'reject', code: 'empty' });
  });

  it('isti prazni kostur + jedan odlomak s tekstom prolazi (nije empty)', async () => {
    const paragraphs: ParaSpec[] = [
      ...Array.from({ length: 2000 }, () => ({ text: '', empty: true as const })),
      { text: 'Ovaj rad istražuje utjecaj metode na rezultat mjerenja i donosi zaključke.' },
    ];
    const v = await inspectDocxIntake(buildDocxFile({ paragraphs }, 'skoro-prazan.docx'));
    expect(v.kind).toBe('ok');
  });
});

describe('inspectDocxIntake: sumnjivo i cisto', () => {
  it('app.xml Words=120 -> ok + suspicious s razlogom', async () => {
    const file = buildDocxFile({ paragraphs: bulkyParas() }, 'cv.docx', [appXml(120)]);
    const v = await inspectDocxIntake(file);
    expect(v.kind).toBe('ok');
    if (v.kind === 'ok') {
      expect(v.suspicious).toBe(true);
      expect(v.suspicionReason).toContain('120');
      expect(v.quickStats).toMatchObject({ words: 120 });
    }
  });

  it('app.xml Words=5000 -> ok, nije sumnjiv', async () => {
    const file = buildDocxFile({ paragraphs: bulkyParas() }, 'rad.docx', [appXml(5000)]);
    const v = await inspectDocxIntake(file);
    expect(v).toMatchObject({ kind: 'ok', suspicious: false });
    if (v.kind === 'ok') {
      expect(v.capability).toMatchObject({
        canAnalyze: true,
        canRepair: true,
        repairBlocker: null,
      });
      expect(v.capability?.entryCount).toBeGreaterThan(0);
      expect(v.capability?.totalDeclaredBytes).toBeGreaterThan(0);
    }
  });

  it('bez app.xml -> ok, nije sumnjiv (null ne gnjavi)', async () => {
    const v = await inspectDocxIntake(buildDocxFile({ paragraphs: bulkyParas() }, 'bez-app.docx'));
    expect(v).toMatchObject({ kind: 'ok', suspicious: false });
    if (v.kind === 'ok') expect(v.quickStats).toBeNull();
  });

  it('neočekivanu internu grešku propušta bez izmišljene capability procjene', async () => {
    // Fail-open grana: datoteka prolazi, ali capability OSTAJE null (procjena nije napravljena).
    // console.warn se namjerno CUVA: to je jedini trag da je gate propustio neispravnu datoteku,
    // a ime datoteke se ni ovdje ne logira (u zapis ide samo greska).
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const broken = {
      name: 'necitljiv.docx',
      size: MIN_DOCX_BYTES,
      slice: () => ({ arrayBuffer: async () => { throw new Error('read failed'); } }),
    } as unknown as File;

    try {
      await expect(inspectDocxIntake(broken)).resolves.toMatchObject({
        kind: 'ok',
        capability: null,
      });
      expect(warning).toHaveBeenCalledTimes(1);
      const logged = warning.mock.calls[0].map((arg) => String(arg)).join(' ');
      expect(logged).not.toContain('necitljiv.docx');
    } finally {
      warning.mockRestore();
    }
  });

  it('prag sumnjivosti je granican: Words=SUSPICIOUS_WORDS_MAX nije sumnjiv', async () => {
    const file = buildDocxFile({ paragraphs: bulkyParas() }, 'granica.docx', [appXml(SUSPICIOUS_WORDS_MAX)]);
    const v = await inspectDocxIntake(file);
    expect(v).toMatchObject({ kind: 'ok', suspicious: false });
  });
});

describe('postRunSuspicion', () => {
  it('malo rijeci i nula naslova -> poruka', () => {
    expect(postRunSuspicion({ words: 800, headings: 0 })).toMatch(/800/);
  });
  it('malo rijeci ali ima naslova -> null', () => {
    expect(postRunSuspicion({ words: 800, headings: 3 })).toBeNull();
  });
  it('dovoljno rijeci bez naslova -> null', () => {
    expect(postRunSuspicion({ words: 1500, headings: 0 })).toBeNull();
  });
  it('null/undefined ulaz -> null', () => {
    expect(postRunSuspicion(null)).toBeNull();
    expect(postRunSuspicion(undefined)).toBeNull();
  });
});

/**
 * Tekst iza `<w:tab/>` ne smije nestati iz brojanja.
 *
 * Izmjereno 2026-09-03. `textRe` je bio `/<w:t[^>]*>([^<]*)</g`. Otvarac `<w:t[^>]*>` matchira i
 * `<w:tab/>`, jer `[^>]*` pojede `ab/`. Uz `/g` taj match potrosi i `<` koji ZAPOCINJE pravi
 * `<w:t>`, pa sljedeci pokusaj krece iza njega i tekst se vise ne moze uhvatiti:
 *
 *     <w:r><w:tab/><w:t>Sadrzaj</w:t></w:r>   ->   izvuceno: []   (ocekivano: ["Sadrzaj"])
 *
 * Posljedica je tvrdi `reject('empty')` nad dokumentom koji IMA tekst, dakle suprotno namjeni ovog
 * gatea, koji odbija samo nedvosmisleno prazan dokument.
 *
 * Zasto ga nijedan postojeci test nije uhvatio: u svih 19 fixtura u `tests/fixtures/docx/` ima
 * TOCNO NULA pojava `<w:tab/>` (mjereno i usko i siroko). Korpus u tome nije reprezentativan za
 * prave Wordove radove, gdje je tabulator na pocetku runa uobicajen (sadrzaj, numerirani naslovi).
 * Kvar je zato bio latentan u testovima, a dostizan korisnicima.
 */
describe('intake gate: tabulator ne smije pojesti tekst', () => {
  const tabRun = (tekst: string) =>
    `<w:p><w:r><w:tab/><w:t xml:space="preserve">${tekst}</w:t></w:r></w:p>`;
  const TEKST = 'Ovaj rad istražuje utjecaj metode na rezultat mjerenja i donosi zaključke.';
  // Isti kostur kao test "skoro-prazan" iznad: 2000 praznih odlomaka nosi velicinu preko
  // MIN_DOCX_BYTES, pa je JEDINI nositelj teksta onaj zadnji odlomak. Razliku izmedju ova dva
  // slucaja pravi iskljucivo `<w:tab/>` ispred njega.
  const kostur = () => Array.from({ length: 2000 }, () => ({ text: '', empty: true as const }));

  it('dokument ciji je tekst iza tabulatora NIJE prazan', async () => {
    const paragraphs: ParaSpec[] = [...kostur(), { raw: tabRun(TEKST) }];
    const v = await inspectDocxIntake(buildDocxFile({ paragraphs }, 'tab-tekst.docx'));
    expect(v.kind, 'dokument ima tekst, ne smije biti odbijen kao prazan').toBe('ok');
  });

  it('isti tekst bez tabulatora prolazi (kontrola)', async () => {
    const paragraphs: ParaSpec[] = [...kostur(), { text: TEKST }];
    const v = await inspectDocxIntake(buildDocxFile({ paragraphs }, 'bez-taba.docx'));
    expect(v.kind).toBe('ok');
  });
});

/**
 * GARD NAD IZVOZOM PREMA `katedra` SKILLU (`docs/generated/skill-feedback.md`).
 *
 * Dvije stvari se ovdje cuvaju i nisu ista stvar.
 *
 * PRVA je GRANICA. Ustav proizvoda dopusta da izmedju dvaju proizvoda putuju samo metapodaci,
 * identifikatori nalaza, ozbiljnost i ocjena, nikad sadrzaj rada. Tvrdnja se ne prihvaca na rijec:
 * iz svih commitanih fixtura vadi se STVARAN tekst odlomaka i tvrdi se da nijedan ne postoji u
 * izvozu. Tekst dokumenta je jedini ulaz koji granicu moze prijeci, pa se mjeri on, a ne namjera.
 *
 * DRUGA je OBLIK koji druga strana cita. `katedra/scripts/kvar.py` trazi `## N. naslov` s jednim
 * brojem, barem jednu znamenku, barem jedan blok izlaza i najmanje 400 znakova po unosu. Ovdje se to
 * ponavlja, jer se taj alat na ovom stroju ne moze vrtjeti u CI-ju (Python, tudji paket), a izvoz
 * koji se ne da procitati jednak je izvozu kojega nema.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readZip } from '../src/repair/zip-codec';
import { KVAROVI } from '../src/corpus/defect-catalog';
import { dokumenata, isSupported, renderDefectFragment, supportingRows } from '../src/corpus/tool-feedback';
import type { ComparisonRow } from '../src/corpus/tool-comparison';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const IZVOZ = join(ROOT, 'docs', 'generated', 'skill-feedback.md');
const USPOREDBA = join(ROOT, 'docs', 'generated', 'skill-compare.json');
const FIXTURES = join(ROOT, 'tests', 'fixtures', 'docx-authored');

const izvoz = readFileSync(IZVOZ, 'utf8');
const redci = (JSON.parse(readFileSync(USPOREDBA, 'utf8')) as { rows: ComparisonRow[] }).rows;

/** Spojeni tekst svakog odlomka svake commitane fixture, dakle sve sto je rad doista napisao. */
async function odlomciKorpusa(): Promise<string[]> {
  const out: string[] = [];
  for (const f of readdirSync(FIXTURES).filter((x) => x.toLowerCase().endsWith('.docx'))) {
    const zip = await readZip(new Uint8Array(readFileSync(join(FIXTURES, f))));
    for (const ime of ['word/document.xml', 'word/footnotes.xml']) {
      const dio = zip.find((e) => e.name === ime)?.data;
      if (!dio) continue;
      const xml = new TextDecoder().decode(dio);
      for (const p of xml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) ?? []) {
        const t = (p.match(/<w:t\b[^>]*>[\s\S]*?<\/w:t>/g) ?? [])
          .map((x) => x.replace(/^<w:t\b[^>]*>/, '').replace(/<\/w:t>$/, ''))
          .join('')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .trim();
        if (t) out.push(t);
      }
    }
  }
  return out;
}

describe('izvoz prema katedri: granica prema sadrzaju rada', () => {
  /**
   * Prag od 40 znakova je namjeran. Kratke nizove ("Literatura", "Uvod", "1965") dijele svi radovi i
   * svi alati, pa bi ih tvrdnja o "nijednom zajednickom nizu" oznacila kao curenje. Odlomak od 40
   * znakova nadalje je vec recenica, i njegova pojava u izvozu ne moze biti slucajna.
   */
  it('nijedan odlomak nijedne fixture ne pojavljuje se u izvozu', async () => {
    const odlomci = (await odlomciKorpusa()).filter((t) => t.length >= 40);
    expect(odlomci.length, 'nijedan odlomak nije procitan; gard bi bio vakuumski').toBeGreaterThan(200);
    const procurjeli = odlomci.filter((t) => izvoz.includes(t));
    expect(procurjeli.slice(0, 3)).toEqual([]);
  });

  /**
   * Negativna kontrola za gard iznad: da izvoz DOISTA nosi odlomak, ista bi provjera to nasla. Bez
   * ovoga se ne zna razlikuje li gard cist izvoz od pokvarenog citaca odlomaka.
   */
  it('isti gard bi procurjeli odlomak nasao', async () => {
    const odlomci = (await odlomciKorpusa()).filter((t) => t.length >= 40);
    const podmetnut = `${izvoz}\n\n${odlomci[0]}\n`;
    expect(odlomci.filter((t) => podmetnut.includes(t)).length).toBeGreaterThan(0);
  });

  /**
   * Drugi kanal kojim bi tekst mogao proci nije dokument nego SIDECAR: `prose.authoring.method` je
   * dug opis nastanka rada, pisan za taj rad, i nije metapodatak o ponasanju alata.
   *
   * Prva izvedba ovog testa gadjala je polje `titleLines`, kojega u sidecaru NEMA, pa je prolazio
   * nad praznim skupom i nije tvrdio nista. Zato tvrdnja nize prvo broji sto je procitala.
   */
  it('izvoz ne nosi opis nastanka rada iz sidecara', () => {
    const recenice: string[] = [];
    for (const f of readdirSync(FIXTURES).filter((x) => x.endsWith('.json'))) {
      const s = JSON.parse(readFileSync(join(FIXTURES, f), 'utf8')) as {
        prose?: { authoring?: { method?: string } };
      };
      for (const r of (s.prose?.authoring?.method ?? '').split(/(?<=\.)\s+/)) {
        if (r.trim().length >= 40) recenice.push(r.trim());
      }
    }
    expect(recenice.length, 'nijedan opis nije procitan; gard bi bio vakuumski').toBeGreaterThan(20);
    expect(recenice.filter((r) => izvoz.includes(r)).slice(0, 3)).toEqual([]);
  });
});

describe('izvoz prema katedri: oblik koji druga strana cita', () => {
  const unosi = izvoz.split(/^## /m).slice(1).map((x) => `## ${x}`);

  it('svaki zapis u katalogu ima potkrepu, inace ne izlazi', () => {
    for (const k of KVAROVI) expect(isSupported(k, redci), k.id).toBe(true);
    expect(unosi).toHaveLength(KVAROVI.length);
  });

  it('zaglavlje nastavka nosi broj, pa se numeracija ne sudara s tudjim zapisima', () => {
    expect(izvoz).toMatch(/nadovezuje se na unos\s+\d+/);
  });

  it('naslov ima tocno jedan dopusteni oblik, bez "Kvar N -"', () => {
    for (const u of unosi) {
      expect(u.split('\n')[0]).toMatch(/^## \d+(?:–\d+)?\. \S/);
      expect(u.split('\n')[0]).not.toMatch(/^## Kvarov?i? \d/);
    }
  });

  it('svaki zapis ima brojku, blok izlaza i najmanje 400 znakova', () => {
    for (const u of unosi) {
      expect(u.length, u.split('\n')[0]).toBeGreaterThanOrEqual(400);
      expect(/\d/.test(u), u.split('\n')[0]).toBe(true);
      expect(/^```/m.test(u), u.split('\n')[0]).toBe(true);
    }
  });

  it('naslovi su razliciti i numeracija tece bez preskoka', () => {
    const brojevi = unosi.map((u) => Number(u.match(/^## (\d+)/)?.[1]));
    expect(new Set(brojevi).size).toBe(brojevi.length);
    for (let i = 1; i < brojevi.length; i += 1) expect(brojevi[i]).toBe(brojevi[i - 1] + 1);
    const naslovi = unosi.map((u) => u.split('\n')[0]);
    expect(new Set(naslovi).size).toBe(naslovi.length);
  });

  it('zapisano se poklapa s onim sto renderer proizvede iz kataloga i mjerenja', () => {
    const nastavak = Number(izvoz.match(/nadovezuje se na unos\s+(\d+)/)?.[1]);
    const svjeze = renderDefectFragment(KVAROVI, redci, nastavak);
    expect(svjeze.unsupported).toEqual([]);
    expect(izvoz.endsWith(svjeze.markdown), 'izvoz je rucno diran; regeneriraj ga').toBe(true);
  });
});

describe('izvoz prema katedri: potkrepa se racuna, ne pamti', () => {
  it('zapis s potkrepom iz usporedbe imenuje dokumente na kojima je izmjeren', () => {
    const izUsporedbe = KVAROVI.filter((k) => k.support.some((s) => s.kind === 'usporedba'));
    expect(izUsporedbe.length).toBeGreaterThan(0);
    for (const k of izUsporedbe) {
      const podupiruci = supportingRows(k.support, redci);
      expect(podupiruci.length, k.id).toBeGreaterThan(0);
      for (const r of podupiruci) expect(izvoz).toContain(r.dokument);
    }
  });

  it('zapis bez ijednog retka razilazenja ispada iz izvoza', () => {
    const bezRazilazenja = redci.map((r) => ({ ...r, ishod: 'nitko' as const }));
    const r = renderDefectFragment(
      KVAROVI.filter((k) => k.support.every((s) => s.kind === 'usporedba')),
      bezRazilazenja,
      140,
    );
    expect(r.numbers).toEqual([]);
    expect(r.unsupported.length).toBeGreaterThan(0);
  });
});

/**
 * Hrvatski broj uz imenicu ima TRI oblika. Testira se ODVOJENO od izvoza, jer trenutni skup dokumenata
 * proizvodi samo 3 i 6, pa bi provjera kroz izvoz tvrdila da pokriva pravilo koje nikad ne izvede.
 * Isti razred kao sweep cija generatorska strana ne stvara oblik koji navodno pokriva.
 */
describe('izvoz prema katedri: broj uz imenicu', () => {
  it('jednina, mnozina do cetiri i mnozina od pet', () => {
    expect(dokumenata(1)).toBe('1 dokumentu');
    expect(dokumenata(2)).toBe('2 dokumenta');
    expect(dokumenata(4)).toBe('4 dokumenta');
    expect(dokumenata(5)).toBe('5 dokumenata');
    expect(dokumenata(0)).toBe('0 dokumenata');
  });

  it('iznimka od 11 do 14 uzima zadnji oblik, a 21 opet prvi', () => {
    for (const n of [11, 12, 13, 14]) expect(dokumenata(n), String(n)).toBe(`${n} dokumenata`);
    expect(dokumenata(21)).toBe('21 dokumentu');
    expect(dokumenata(22)).toBe('22 dokumenta');
    expect(dokumenata(111)).toBe('111 dokumenata');
    expect(dokumenata(101)).toBe('101 dokumentu');
  });
});

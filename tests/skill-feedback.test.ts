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
import { dokumenata, isSupported, openDefects, renderDefectFragment, supportingRows } from '../src/corpus/tool-feedback';
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

  /**
   * Zapis je ili OTVOREN i potkrijepljen, ili ZATVOREN uzvodno uz referencu na popravak. Trece
   * stanje ne postoji, jer bi zapis bez oboga bio tvrdnja bez mjerenja.
   *
   * Izvoz nosi SAMO otvorene: zatvoren kvar poslan drugoj strani procita se kao zadatak koji je vec
   * obavljen. Izmjereno 2026-09-10, granom koja je duplicirala postojeci uzvodni popravak i morala
   * biti povucena.
   */
  it('svaki zapis je ili potkrijepljen ili zatvoren uzvodno, i izlaze samo otvoreni', () => {
    for (const k of KVAROVI) {
      const zatvoren = typeof k.resolvedUpstream === 'string' && k.resolvedUpstream.length > 0;
      expect(zatvoren || isSupported(k, redci), k.id).toBe(true);
    }
    const otvoreni = openDefects(KVAROVI);
    expect(unosi).toHaveLength(otvoreni.length);
    // Anti-vakuum: prazan katalog otvorenih ucinio bi svaku tvrdnju nize istinitom ni nad cim, a
    // prazan izvoz izgleda isto kao izvoz koji vise nista ne mjeri.
    expect(otvoreni.length, 'nijedan otvoren kvar; mjeri li usporedba jos ista?').toBeGreaterThan(0);
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
    // Renderer vidi SAMO otvorene, isto kao pogon; zatvoreni ostaju u katalogu ali ne izlaze.
    const svjeze = renderDefectFragment(openDefects(KVAROVI), redci, nastavak);
    expect(svjeze.unsupported).toEqual([]);
    expect(izvoz.endsWith(svjeze.markdown), 'izvoz je rucno diran; regeneriraj ga').toBe(true);
  });
});

describe('izvoz prema katedri: potkrepa se racuna, ne pamti', () => {
  /**
   * SVAKI otvoren zapis imenuje dokumente na kojima je izmjeren, bez obzira na vrstu potkrepe.
   *
   * Tvrdnja je prije vrijedila samo za potkrepu iz usporedbe i trazila da takvih bude barem jedan. Taj
   * uvjet je 2026-09-10 postao neispunjiv i to zasluzeno: sva razilazenja su zatvorena (8 na 0), pa
   * otvoren zapis danas nosi IZRAVNU potkrepu. Vezati gard uz jednu vrstu potkrepe znacilo bi da
   * popravak druge strane obara nas gard.
   */
  it('svaki otvoren zapis imenuje dokumente na kojima je izmjeren', () => {
    const otvoreni = openDefects(KVAROVI);
    expect(otvoreni.length, 'nijedan otvoren zapis; tvrdnja bi bila istinita ni nad cim').toBeGreaterThan(0);
    for (const k of otvoreni) {
      const izUsporedbe = supportingRows(k.support, redci).map((r) => r.dokument);
      const izravni = k.support.flatMap((sup) => (sup.kind === 'izravno' ? [...sup.documents] : []));
      const imenovani = [...new Set([...izUsporedbe, ...izravni])];
      expect(imenovani.length, k.id + ': zapis ne imenuje nijedan dokument').toBeGreaterThan(0);
      for (const d of imenovani) expect(izvoz, k.id).toContain(d);
    }
  });

  /**
   * MEHANIZAM, ne zateceni katalog: zapis koji visi o usporedbi mora ispasti iz izvoza cim
   * razilazenja nestane.
   *
   * Klasa je PODMETNUTA, a ne uzeta iz `KVAROVI`. Prije je test uzimao stvarne zapise, pa je prestao
   * mjeriti isti dan kad je zadnji takav zapis zatvoren: `unsupported` je postao prazan i tvrdnja
   * "barem jedan je ispao" vise nije imala nad cim vrijediti. Gard koji utihne kad se katalog
   * promijeni nije gard.
   */
  it('zapis bez ijednog retka razilazenja ispada iz izvoza', () => {
    const podmetnut = {
      id: 'probni-zapis-koji-visi-o-usporedbi',
      owner: 'katedra-lite' as const,
      title: 'Probni zapis',
      body: 'x'.repeat(420),
      output: '$ probna naredba',
      support: [{ kind: 'usporedba' as const, os: 'jedinica-necitirana', documentPrefix: 'fpzg' }],
    };
    const sRazilazenjem = redci.map((r) =>
      r.os === 'jedinica-necitirana' && r.dokument.startsWith('fpzg')
        ? { ...r, ishod: 'samo-katedra' as const }
        : r,
    );
    const bezRazilazenja = redci.map((r) => ({ ...r, ishod: 'nitko' as const }));
    // Kontrola: uz razilazenje zapis IZLAZI, inace bi "ispao" znacilo samo da nikad nije ni ulazio.
    const sa = renderDefectFragment([podmetnut], sRazilazenjem, 140);
    expect(sa.numbers.length, 'zapis ne izlazi ni kad razilazenje postoji').toBeGreaterThan(0);
    const bez = renderDefectFragment([podmetnut], bezRazilazenja, 140);
    expect(bez.numbers).toEqual([]);
    expect(bez.unsupported).toEqual([podmetnut.id]);
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

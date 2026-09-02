import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * PROGRAMSKI ULAZ DOKUMENTA i dogadjaj o ishodu prijema.
 *
 * Do sada je dokument mogao uci samo kroz korisnikov klik ili drop, pa obnova sesije nije imala
 * cime vratiti rad u analizator, a zapis sesije nije imao trenutak u kojem bi znao da je dokument
 * doista prihvacen. Zapis pogodjen prerano znaci sesiju s dokumentom koji je intake gate poslije
 * odbio, dakle obecanje koje se pri obnovi raspadne.
 *
 * NAJVAZNIJI GARD JE DA OBECANJE UVIJEK ZAVRSI. Prijem ima tri terminalna izlaza (prihvaceno,
 * odbijeno, pretecen drugom datotekom) i svaki mora emitirati dogadjaj. Propusten izlaz ne
 * prijavljuje se kao greska nego kao zauvijek visece obecanje: ruta bi ostala na "obnavljam" bez
 * ijedne poruke, sto je najgori oblik kvara jer izgleda kao sporost.
 */

const ROOT = resolve(__dirname, '..');
const INDEX = readFileSync(resolve(ROOT, 'index.html'), 'utf8');

function workspaceDoc(): Document {
  const parsed = document.implementation.createHTMLDocument('izvor');
  parsed.documentElement.innerHTML = INDEX;
  const analyzer = parsed.getElementById('analyzer');
  if (!analyzer) throw new Error('index.html nema #analyzer');
  const doc = document.implementation.createHTMLDocument('rad');
  doc.body.innerHTML = analyzer.outerHTML;
  return doc;
}

/** Datoteka koju sinkroni dio `setFile` odbija po nastavku, bez ijednog awaita. */
const wrongExtension = () => new File([new Uint8Array([1, 2, 3])], 'rad.pdf', { type: 'application/pdf' });

async function withMountedApp<T>(fn: (api: typeof import('../src/ui/app')) => Promise<T>): Promise<T> {
  const api = await import('../src/ui/app');
  const doc = workspaceDoc();
  api.initAnalyzerApp(doc);
  try { return await fn(api); } finally { api.disposeAnalyzerApp(doc); }
}

const REAL_DOCX = readFileSync(resolve(ROOT, 'tests', 'fixtures', 'docx', 'fer-diplomski-uskladjen.docx'));
/** Stvaran .docx, pa prolazi sinkroni dio i stize do asinkronog prijema. */
const realDocx = (name: string) => new File([new Uint8Array(REAL_DOCX)], name, {
  type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
});

describe('programski ulaz dokumenta', () => {
  it('PRETECEN dokument razrjesava obecanje, ne ostavlja ga da visi', async () => {
    // Najvazniji ugovor. Prijem ima tri terminalna izlaza i dva su "tihi return" na provjeri
    // aktualnosti. Da ijedan ne emitira, obecanje prve datoteke visilo bi zauvijek, a to se ne
    // prijavljuje kao greska nego kao ruta koja zauvijek stoji na "obnavljam".
    await withMountedApp(async (api) => {
      const prvi = api.loadAnalyzerDocument(realDocx('prvi.docx'));
      const drugi = api.loadAnalyzerDocument(realDocx('drugi.docx'));
      const visi = new Promise<string>((r) => setTimeout(() => r('VISI'), 20000));
      const ishod = await Promise.race([prvi, visi]);
      expect(ishod, 'obecanje prve datoteke nije zavrsilo').not.toBe('VISI');
      await Promise.race([drugi, visi]);
    });
  }, 180000);

  it('SINKRONO ODBIJEN dokument razrjesava obecanje, ne ostavlja ga da visi', async () => {
    // `setFile` odbija po nastavku PRIJE ijednog awaita i ne emitira dogadjaj. Bez izricite
    // grane koja to procita iz stanja, obecanje bi visilo zauvijek.
    await withMountedApp(async (api) => {
      const out = await api.loadAnalyzerDocument(wrongExtension());
      expect(out.kind).toBe('rejected');
      if (out.kind === 'rejected') expect(out.message.length).toBeGreaterThan(0);
    });
  }, 180000);

  it('odjava pretplate stvarno prestaje javljati', async () => {
    await withMountedApp(async (api) => {
      const seen: string[] = [];
      const off = api.subscribeAnalyzerDocumentSettled((e) => { seen.push(e.kind); });
      off();
      await api.loadAnalyzerDocument(wrongExtension());
      expect(seen).toEqual([]);
    });
  }, 180000);

  it('dvostruka odjava je bezopasna', async () => {
    await withMountedApp(async (api) => {
      const off = api.subscribeAnalyzerDocumentSettled(() => {});
      off();
      expect(() => off()).not.toThrow();
    });
  }, 180000);

  it('uze sucelje javlja SAMO prihvacanje', async () => {
    // Pretplatnik na zapis sesije ne smije dobiti odbijen dokument: zapisao bi rad koji je gate
    // upravo odbio, pa bi obnova vratila nesto sto analizator odbija.
    await withMountedApp(async (api) => {
      const accepted: unknown[] = [];
      const off = api.subscribeAnalyzerDocumentAccepted((e) => { accepted.push(e); });
      await api.loadAnalyzerDocument(wrongExtension());
      off();
      expect(accepted).toEqual([]);
    });
  }, 180000);

  it('GRESKA PRETPLATNIKA ne rusi prijem dokumenta', async () => {
    // Korisnikov rad je vazniji od naseg zapisa sesije. Pretplatnik koji pukne smije izgubiti
    // svoju obavijest, ali ne smije oboriti prijem.
    await withMountedApp(async (api) => {
      const off1 = api.subscribeAnalyzerDocumentSettled(() => { throw new Error('pukao pretplatnik'); });
      const seen: string[] = [];
      const off2 = api.subscribeAnalyzerDocumentSettled((e) => { seen.push(e.kind); });
      const out = await api.loadAnalyzerDocument(wrongExtension());
      off1(); off2();
      expect(out.kind).toBe('rejected');
      expect(seen).toEqual(['rejected']);
    });
  }, 180000);

  it('pretplatnik DODAN tijekom obavijesti ne dobiva taj isti dogadjaj', async () => {
    // Prva izvedba ovog garda tvrdila je da odjava tijekom obavijesti preskace one iza sebe.
    // Mutacija je pokazala da to NE stoji: JS `Set` iteracija podnosi brisanje vec posjecenog
    // clana. Kopija stiti od suprotnog slucaja, koji je stvaran: pretplatnik dodan usred
    // obavijesti inace vidi dogadjaj koji je prethodio njegovoj pretplati.
    await withMountedApp(async (api) => {
      const kasni: string[] = [];
      let offKasni = () => {};
      const off1 = api.subscribeAnalyzerDocumentSettled(() => {
        offKasni = api.subscribeAnalyzerDocumentSettled((e) => { kasni.push(e.kind); });
      });
      await api.loadAnalyzerDocument(wrongExtension());
      off1(); offKasni();
      expect(kasni).toEqual([]);
    });
  }, 180000);
});

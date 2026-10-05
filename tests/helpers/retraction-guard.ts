/**
 * T98 gard oznake povucenog rada (issue #219) nad stvarnim Crossref snimkama iz `tests/fixtures/crossref/`.
 * Prazan popis problema znaci: oznaka dolazi SAMO iz `updated-by`, SAMO uz verdikt `found`, i DOI put
 * stvarno cita tijelo odgovora.
 *
 * `loadVerifyExistence(mutate)` izvrsava STVARNI izvor `src/citations/verify-existence.ts`, po zelji
 * mutiran u memoriji, pa mutacije u gate-mutations mijenjaju kod, a ne njegov rezultat.
 */
import { readFileSync } from 'node:fs';
import * as nodeModule from 'node:module';
import { resolve } from 'node:path';
import { transformSync } from 'esbuild';
import { normalize } from '../../src/utils/helpers';

type Retraction = { kind: string; source: string; noticeDoi: string; date: string } | null | undefined;
type Fetch = (url: string) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;
export type VerifyExistenceModule = {
  retractionFromWork: (message: unknown) => Retraction;
  verdictFromCandidates: (inp: Record<string, unknown>, items: unknown[]) => { verdict: string; retraction?: Retraction };
  verifyReference: (inp: Record<string, unknown>, opts: { fetchImpl: Fetch }) => Promise<{ verdict: string; retraction?: Retraction }>;
  _clearExistenceCache: () => void;
};

const SOURCE = 'src/citations/verify-existence.ts';
export const verifyExistenceSource = (): string => readFileSync(resolve(process.cwd(), SOURCE), 'utf8').replace(/\r\n/g, '\n');

type Strip = ((code: string) => string) | null | undefined;
const nodeStrip: Strip = (nodeModule as { stripTypeScriptTypes?: (code: string) => string }).stripTypeScriptTypes;
/** `node:module` stripTypeScriptTypes postoji od Node 22.13; na Node 20 (CI matrica) radi esbuild. */
function stripTypes(src: string, strip: Strip): string {
  return typeof strip === 'function' ? strip(src) : transformSync(src, { loader: 'ts', format: 'esm', target: 'es2022' }).code;
}

export function loadVerifyExistence(mutate: (src: string) => string = (s) => s, strip: Strip = nodeStrip): VerifyExistenceModule {
  const js = stripTypes(mutate(verifyExistenceSource()), strip)
    .replace(/^import .*$/gm, '')
    .replace(/^export /gm, '');
  return new Function('normalize', `${js}\nreturn { retractionFromWork, verdictFromCandidates, verifyReference, _clearExistenceCache };`)(normalize) as VerifyExistenceModule;
}

type Snimka = { capture: { url: string; status: number }; response: unknown };
export const snimka = (ime: string): Snimka =>
  JSON.parse(readFileSync(resolve(process.cwd(), 'tests/fixtures/crossref', ime), 'utf8').replace(/\r\n/g, '\n')) as Snimka;

/**
 * fetch koji vraca snimku za njezin URL. Uz upit (bibliografski put) provjerava i `select`: zahtjev
 * mora traziti ista polja kao snimljeni upit, inace bi snimka s `updated-by` lazno potvrdila upit bez njega.
 */
export function fetchIz(s: Snimka): Fetch {
  return async (url: string) => {
    if (url.split('?')[0] !== s.capture.url.split('?')[0]) throw new Error(`neocekivan URL ${url}`);
    const trazeno = new URL(s.capture.url).searchParams.get('select');
    if (trazeno !== null && new URL(url).searchParams.get('select') !== trazeno) {
      throw new Error(`select ${new URL(url).searchParams.get('select')} umjesto ${trazeno}`);
    }
    return {
      ok: s.capture.status >= 200 && s.capture.status < 300,
      status: s.capture.status,
      json: async () => {
        const r = s.response as { nonJsonBody?: string };
        if (r && typeof r === 'object' && 'nonJsonBody' in r) throw new SyntaxError('tijelo nije JSON');
        return s.response;
      },
    };
  };
}

const poruka = (ime: string) => (snimka(ime).response as { message?: unknown }).message;

export async function retractionProblems(m: VerifyExistenceModule): Promise<string[]> {
  const out: string[] = [];
  // (u) samo updated-by: obavijest (samo update-to) nije povucen rad.
  for (const ime of ['retraction-notice.json', 'correction-notice.json', 'corrected.json', 'plain.json']) {
    const r = m.retractionFromWork(poruka(ime));
    if (r) out.push(`(u) ${ime}: lazna oznaka ${r.kind}`);
  }
  for (const ime of ['retracted-rw-and-publisher.json', 'retracted-rw-only.json', 'retracted-self-notice.json']) {
    if (m.retractionFromWork(poruka(ime))?.kind !== 'retracted') out.push(`(u) ${ime}: povucen rad bez oznake`);
  }
  // (w) samo uz found: slab kandidat s updated-by ne dobiva oznaku.
  const povucen = (poruka('retracted-rw-only.json') as Record<string, unknown>);
  const slab = m.verdictFromCandidates({ title: 'Effect of treadmill exercise on bone' }, [{ ...povucen, title: ['Effect of Treadmill Exercise on Bone Mass in Female Rats'] }]);
  if (slab.verdict !== 'weak') out.push(`(w) kontrola nije weak nego ${slab.verdict}`);
  else if (slab.retraction) out.push('(w) weak kandidat dobio oznaku povucenog rada');
  // (d) DOI put cita tijelo: povuceni DOI dobiva oznaku.
  m._clearExistenceCache();
  const doi = await m.verifyReference({ doi: '10.1538/expanim.54.1' }, { fetchImpl: fetchIz(snimka('retracted-rw-only.json')) });
  if (doi.verdict !== 'found' || doi.retraction?.kind !== 'retracted') out.push('(d) DOI put: povuceni DOI bez oznake');
  // (s) bibliografski put: upit trazi updated-by (provjera `select` u fetchIz) i pogodak found nosi oznaku.
  const naslov = 'Downregulation of long noncoding RNA LINC01419 inhibits cell migration, invasion, and tumor growth and promotes autophagy via inactivation of the PI3K/Akt1/mTOR pathway in gastric cancer';
  m._clearExistenceCache();
  const bib = await m.verifyReference({ title: naslov, year: '2019' }, { fetchImpl: fetchIz(snimka('select-updated-by.json')) });
  if (bib.verdict !== 'found' || bib.retraction?.kind !== 'retracted') out.push(`(s) bibliografski put: verdikt ${bib.verdict}, oznaka ${bib.retraction?.kind ?? 'nema'}`);
  // (n) negativna kontrola: ista snimka bez `updated-by` daje found BEZ oznake.
  const bez = snimka('select-updated-by.json');
  const tijelo = JSON.parse(JSON.stringify(bez.response)) as { message: { items: Array<Record<string, unknown>> } };
  for (const it of tijelo.message.items) delete it['updated-by'];
  m._clearExistenceCache();
  const bibBez = await m.verifyReference({ title: naslov, year: '2019' }, { fetchImpl: fetchIz({ ...bez, response: tijelo }) });
  if (bibBez.verdict !== 'found' || bibBez.retraction) out.push(`(n) bez updated-by: verdikt ${bibBez.verdict}, oznaka ${bibBez.retraction?.kind ?? 'nema'}`);
  // (x) nevaljan oblik: null, bez iznimke.
  for (const los of [{ 'updated-by': 'retraction' }, { 'updated-by': [] }, { 'updated-by': [null, 5, 'x'] }, null, 7]) {
    try { if (m.retractionFromWork(los)) out.push(`(x) nevaljan oblik dao oznaku: ${JSON.stringify(los)}`); } catch { out.push(`(x) iznimka na ${JSON.stringify(los)}`); }
  }
  return out;
}

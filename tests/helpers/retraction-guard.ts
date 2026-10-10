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
import { parseAuthors } from '../../src/tools/citation';
import { normalize } from '../../src/utils/helpers';

type Retraction = { kind: string; source: string; noticeDoi: string; date: string } | null | undefined;
type Fetch = (url: string) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;
export type VerifyExistenceModule = {
  retractionFromWork: (message: unknown) => Retraction;
  verdictFromCandidates: (inp: Record<string, unknown>, items: unknown[]) => { verdict: string; retraction?: Retraction };
  verifyReference: (inp: Record<string, unknown>, opts: { fetchImpl: Fetch }) => Promise<{ verdict: string; retraction?: Retraction }>;
  verifyReferences: (inp: Array<Record<string, unknown>>, opts: { fetchImpl: Fetch; delayMs: number }) => Promise<Array<{ verdict: string; retraction?: Retraction }>>;
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
  return new Function('normalize', 'parseAuthors', `${js}\nreturn { retractionFromWork, verdictFromCandidates, verifyReference, verifyReferences, _clearExistenceCache };`)(normalize, parseAuthors) as VerifyExistenceModule;
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
  const bib = await m.verifyReference({ title: naslov, year: '2019', authors: 'Wang, Lin-Lin; Zhang, Lei; Cui, Xiao-Feng' }, { fetchImpl: fetchIz(snimka('select-with-authors.json')) });
  if (bib.verdict !== 'found' || bib.retraction?.kind !== 'retracted') out.push(`(s) bibliografski put: verdikt ${bib.verdict}, oznaka ${bib.retraction?.kind ?? 'nema'}`);
  // (n) negativna kontrola: ista snimka bez `updated-by` daje found BEZ oznake.
  const bez = snimka('select-with-authors.json');
  const tijelo = JSON.parse(JSON.stringify(bez.response)) as { message: { items: Array<Record<string, unknown>> } };
  for (const it of tijelo.message.items) delete it['updated-by'];
  m._clearExistenceCache();
  const bibBez = await m.verifyReference({ title: naslov, year: '2019', authors: 'Wang, Lin-Lin; Zhang, Lei; Cui, Xiao-Feng' }, { fetchImpl: fetchIz({ ...bez, response: tijelo }) });
  if (bibBez.verdict !== 'found' || bibBez.retraction) out.push(`(n) bez updated-by: verdikt ${bibBez.verdict}, oznaka ${bibBez.retraction?.kind ?? 'nema'}`);
  // (x) nevaljan oblik: null, bez iznimke.
  for (const los of [{ 'updated-by': 'retraction' }, { 'updated-by': [] }, { 'updated-by': [null, 5, 'x'] }, null, 7]) {
    try { if (m.retractionFromWork(los)) out.push(`(x) nevaljan oblik dao oznaku: ${JSON.stringify(los)}`); } catch { out.push(`(x) iznimka na ${JSON.stringify(los)}`); }
  }
  return out;
}

/** Negativne kontrole identiteta i cachea nad stvarnim modulom i stvarnom snimkom s autorima. */
export async function retractionIdentityProblems(m: VerifyExistenceModule): Promise<{ problems: string[]; mechanisms: Record<string, number> }> {
  const capture = snimka('select-with-authors.json');
  const items = (capture.response as { message: { items: Array<Record<string, unknown>> } }).message.items;
  const work = items.find((x) => x.DOI === '10.1177/1758835919874651')!;
  const title = 'Downregulation of long noncoding RNA LINC01419 inhibits cell migration, invasion, and tumor growth and promotes autophagy via inactivation of the PI3K/Akt1/mTOR pathway in gastric cancer';
  const ref = { title, year: '2019', authors: 'Wang, Lin-Lin; Zhang, Lei; Cui, Xiao-Feng' };
  const problems: string[] = [];
  const mechanisms = { positiveIdentity: 0, negativeIdentity: 0, ambiguity: 0, authorCache: 0, partial: 0, doiIdentity: 0, unicodeIdentity: 0, unicodeCache: 0, unicodeInputs: 0 };
  if (m.verdictFromCandidates(ref, [work]).retraction?.kind !== 'retracted') problems.push('(i) stvarna puna referenca izgubila oznaku');
  mechanisms.positiveIdentity++;
  for (const delta of [{ title: title.replace('gastric', 'colon') }, { year: '2018' }, { authors: 'Other, Lin-Lin; Zhang, Lei; Cui, Xiao-Feng' }, { authors: '' }]) {
    if (m.verdictFromCandidates({ ...ref, ...delta }, [work]).retraction) problems.push('(i) susjedni ili nepotpuni identitet dobio oznaku');
    mechanisms.negativeIdentity++;
  }
  if (m.verdictFromCandidates(ref, [work, { ...work, DOI: '10.1/other' }]).retraction) problems.push('(b) dvosmislen rad dobio oznaku');
  mechanisms.ambiguity++;
  m._clearExistenceCache();
  let calls = 0;
  const fetchImpl: Fetch = async (url) => { calls++; return fetchIz(capture)(url); };
  const results = await m.verifyReferences([ref, { ...ref, authors: 'Other, Person' }], { fetchImpl, delayMs: 0 });
  if (calls !== 2 || results[1].retraction) problems.push('(k) cache pripisao oznaku drugim autorima');
  mechanisms.authorCache++;
  if (m.retractionFromWork({ 'updated-by': [{ type: 'partial_retraction', source: 'publisher' }] })?.kind !== 'partial') problems.push('(p) izgubljeno djelomicno povlacenje');
  mechanisms.partial++;
  const mismatch = await m.verifyReference({ doi: '10.1/different-work' }, { fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ message: work }) }) });
  if (mismatch.verdict !== 'found' || mismatch.retraction) problems.push('(o) DOI put pripisao oznaku drugog rada ili promijenio found');
  mechanisms.doiIdentity++;
  const alpha = { ...ref, title: ref.title + ' α' };
  const beta = { ...ref, title: ref.title + ' β' };
  if (alpha.title === beta.title || alpha.title.codePointAt(alpha.title.length - 1) !== 0x3b1 || beta.title.codePointAt(beta.title.length - 1) !== 0x3b2) throw new Error('invalid Unicode control shape');
  mechanisms.unicodeInputs = 2;
  const alphaWork = { ...work, title: [alpha.title] };
  if (m.verdictFromCandidates(beta, [alphaWork]).retraction) problems.push('(g) razlicita grcka slova dobila istu oznaku');
  mechanisms.unicodeIdentity++;
  m._clearExistenceCache();
  let unicodeCalls = 0;
  const unicodeResults = await m.verifyReferences([alpha, beta], { delayMs: 0, fetchImpl: async () => { unicodeCalls++; return { ok: true, status: 200, json: async () => ({ message: { items: [alphaWork] } }) }; } });
  if (unicodeCalls !== 2 || unicodeResults[1].retraction) problems.push('(q) cache izjednacio razlicita grcka slova');
  mechanisms.unicodeCache++;
  return { problems, mechanisms };
}

export const verifyBadgesSource = () => readFileSync('src/citations/verify-badges.ts', 'utf8').replace(/\r/g, '');
export function loadVerificationSummary(mutate: (s: string) => string = (s) => s): (rows: unknown[]) => string {
  const js = transformSync(mutate(verifyBadgesSource()), { loader: 'ts', target: 'es2022', format: 'esm' }).code.replace(/^import .*$/gm, '').replace(/^export /gm, '');
  return new Function(js + '\nreturn summarizeVerification;')() as (rows: unknown[]) => string;
}
export function retractionSummaryProblems(summary: (rows: unknown[]) => string): string[] {
  const problems: string[] = [];
  for (const [kind, label] of [['partial', '1 djelomično povučen rad'], ['concern', '1 izraz zabrinutosti']] as const) {
    const retraction = { kind, source: '', noticeDoi: '', date: '' };
    if (!summary([{ verdict: 'found', retraction }]).includes(label)) problems.push('(a) aria-live izgubio ' + kind);
    if (/povu?|zabrinut/.test(summary([{ verdict: 'weak', retraction }]))) problems.push('(a) aria-live pripisao oznaku slabom kandidatu');
  }
  return problems;
}

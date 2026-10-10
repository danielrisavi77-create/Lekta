import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import { Window } from 'happy-dom';
import { escapeHtml } from '../../src/utils/helpers';
import { clearVerifyBadges, existenceCellHtml, existenceEventProps, retractionNoticeUrl, RETRACTION_BADGE, summarizeVerification, VERDICT_BADGE, restoreVerificationFocus } from '../../src/citations/verify-badges';

export const citatSource = () => readFileSync('src/tools/citat-page.ts', 'utf8').replace(/\r/g, '');
export const analyzerSource = () => readFileSync('src/ui/app.ts', 'utf8').replace(/\r/g, '');
type Mutate = (s: string) => string;

/** Izvrsava stvarne dvije UI funkcije s injektiranim mreznim rezultatom; ne kopira renderere. */
export async function retractionUiProblems(citat: Mutate = (s) => s, analyzer: Mutate = (s) => s): Promise<{ problems: string[]; mechanisms: Record<string, number> }> {
  const win = new Window();
  const document = win.document;
  const problems: string[] = [];
  const mechanisms = { citatRepeated: 0, citatTransition: 0, analyzerBadge: 0, analyzerAnalytics: 0, productionEscaping: 0, citatClick: 0, analyzerClick: 0 };
  const $ = (selector: string) => document.querySelector(selector);
  const retraction = { kind: 'retracted' as const, source: 'publisher', noticeDoi: '10.1/notice', date: '' };
  let rows: Array<{ verdict: 'found' | 'not-found'; retraction?: typeof retraction }> = [{ verdict: 'found', retraction }];
  let calls = 0;
  const verifyReferences = async () => { calls++; return rows; };
  const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
  const deps = { $, document, readBulkCard: () => ({}), verifyReferences, clearVerifyBadges, VERDICT_BADGE, RETRACTION_BADGE, retractionNoticeUrl, summarizeVerification, restoreVerificationFocus, announceBulk: (text: string) => { document.querySelector('#status')!.textContent = text; } };
  try {
    const source = citat(citatSource());
    const start = source.indexOf('async function verifyBulk()');
    const end = source.indexOf('\nfunction generateBulk()', start);
    if (start < 0 || end < 0) throw new Error('verifyBulk source boundary missing');
    const js = transformSync(source.slice(start, end), { loader: 'ts', target: 'es2022' }).code;
    document.body.innerHTML = '<button id="bulk-verify">Provjeri</button><div id="bulk-entries"><div class="bulk-card"><div class="bulk-card-fields"></div></div></div><p id="status"></p>';
    const binding = source.split('\n').find((line) => line.includes("$('#bulk-verify')?.addEventListener('click'"));
    if (!binding) throw new Error('actual bulk click binding missing');
    new Function(...Object.keys(deps), js + '\n' + binding)(...Object.values(deps));
    const click = async () => { document.querySelector<HTMLButtonElement>('#bulk-verify')!.click(); await flush(); };
    const beforeCalls = calls;
    for (let i = 0; i < 3; i++) { await click(); mechanisms.citatRepeated++; }
    mechanisms.citatClick = calls - beforeCalls;
    if (!mechanisms.citatClick) problems.push('(c) stvarni klik nije pokrenuo provjeru');
    if (document.querySelectorAll('.verify-badge').length !== 2) problems.push('(c) ponavljanje ostavlja stare oznake');
    rows = [{ verdict: 'not-found' }];
    await click(); mechanisms.citatTransition++;
    if (document.querySelectorAll('.verify-badge').length !== 1 || document.body.textContent.includes('Rad je povučen')) problems.push('(c) prijelaz verdikta ostavlja povlacenje');
  } catch (e) { problems.push('(c) stvarni verifyBulk nije izveden: ' + String(e)); }
  try {
    document.body.innerHTML = '<button id="verifyExistence"></button><p id="existenceStatus"></p><ul id="existenceList"><li data-exist="0"><span class="exist-badge"></span></li></ul>';
    rows = [{ verdict: 'found', retraction }];
    const source = analyzer(analyzerSource());
    const start = source.indexOf('async function runExistenceCheck(');
    const end = source.indexOf('\n', start);
    if (start < 0 || end < 0) throw new Error('runExistenceCheck source boundary missing');
    const actual = source.slice(start, end)
      .replace("import('../citations/parse-reference')", 'Promise.resolve({parseReference: parseReferenceStub})')
      .replace("import('../citations/verify-existence')", 'Promise.resolve({verifyReferences: verifyReferencesStub})');
    const renderStart = source.indexOf('function renderReferencesExistence(');
    const renderEnd = source.indexOf('\n', renderStart);
    if (renderStart < 0 || renderEnd < 0) throw new Error('actual analyzer render missing');
    const js = transformSync(source.slice(renderStart, renderEnd) + '\n' + actual, { loader: 'ts', target: 'es2022' }).code;
    let event: unknown;
    const args = { $, document, VERDICT_BADGE, existenceCellHtml, existenceEventProps, summarizeVerification, restoreVerificationFocus, escapeHtml,
      productionConfig: {}, parseReferenceStub: () => ({ fields: {} }), verifyReferencesStub: verifyReferences,
      currentResult: {}, trackEvent: async (_: string, payload: unknown) => { event = payload; } };
    const render = new Function(...Object.keys(args), 'let _existCheckRunning=false,_existenceVerdicts;\n' + js + '\nreturn renderReferencesExistence;')(...Object.values(args)) as (r: unknown) => void;
    document.body.innerHTML = '<div id="referencesExistence"></div>';
    render({ details: { references: [{ raw: 'synthetic reference', p: 1 }] } });
    const beforeCalls = calls;
    document.querySelector<HTMLButtonElement>('#verifyExistence')!.click(); await flush();
    mechanisms.analyzerClick = calls - beforeCalls;
    if (!mechanisms.analyzerClick) problems.push('(a) stvarni klik analizatora nije pokrenuo provjeru');
    mechanisms.analyzerBadge++; mechanisms.analyzerAnalytics++;
    if (!document.querySelector('.exist-retraction') || !document.querySelector('.exist-badge a')) problems.push('(a) analizator nije prikazao oznaku i obavijest');
    if (JSON.stringify(event) !== JSON.stringify({ total: 1, found: 1, missing: 0, retracted: 1 })) problems.push('(e) analizator nije poslao sanirani brojac povlacenja');
    const malicious = { ...retraction, noticeDoi: '10.1/r" onmouseover="alert(1)' };
    document.querySelector('.exist-badge')!.innerHTML = existenceCellHtml({ verdict: 'found', matchedTitle: '<img src=x onerror="alert(1)">', retraction: malicious }, escapeHtml);
    mechanisms.productionEscaping++;
    if (document.querySelector('[onmouseover],[onerror],img')) problems.push('(x) stvarni escapeHtml propustio aktivni HTML');
  } catch (e) { problems.push('(a) stvarni runExistenceCheck nije izveden: ' + String(e)); }
  await win.happyDOM.close();
  return { problems, mechanisms };
}

/** Execute the actual focus helper, including a user moving to another control while pending. */
export async function verificationFocusProblems(mutate: Mutate = (s) => s): Promise<string[]> {
  const source = mutate(readFileSync('src/citations/verify-badges.ts', 'utf8'));
  const js = transformSync(source, { loader: 'ts', format: 'cjs', target: 'es2022' }).code;
  const module = { exports: {} as Record<string, unknown> };
  new Function('exports', 'module', js)(module.exports, module);
  const restore = module.exports.restoreVerificationFocus as typeof restoreVerificationFocus;
  const win = new Window(); const doc = win.document; const problems: string[] = [];
  try {
    doc.body.innerHTML = '<button id="verify">Verify</button><input id="other">';
    const button = doc.querySelector<HTMLButtonElement>('#verify')!;
    const other = doc.querySelector<HTMLInputElement>('#other')!;
    button.focus(); button.blur(); restore(button, true);
    if (doc.activeElement !== button) problems.push('lost original focus');
    other.focus(); restore(button, true);
    if (doc.activeElement !== other) problems.push('stole user focus');
    other.blur(); restore(button, false);
    if (doc.activeElement === button) problems.push('focused without initial focus');
    button.remove(); restore(button, true);
  } finally { await win.happyDOM.close(); }
  return problems;
}

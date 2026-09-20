// DOM glue za besplatno sredjivanje literature (literatura.html). Logika je u
// bibliography.ts (tipizirano, testabilno); ovdje samo vezanje forme i ispis. Bez mreze.
import '../shared/ui-boot';
import './tool-analytics';
import { organizeBibliography, bibliographyText, type BibSortMode, type BibResult } from './bibliography';
import { bibliographyDoc, docxBlob } from '../docx/docx-writer';
import { escapeHtml } from '../utils/helpers';
import { bindCopyButton, bindDownloadButton } from './tool-ui';

const $ = (s: string): any => document.querySelector(s);
const nf = new Intl.NumberFormat('hr-HR');

const SAMPLE = `Zorić, Z. (2020). Lokalna samouprava u Hrvatskoj. Zagreb: Naklada.
Anić, A. (2019). Civilno društvo i demokracija. Zagreb: Školska knjiga.
anić, a. (2019). Civilno društvo i demokracija. Zagreb: Školska knjiga.
Marić, M. Uvod u politologiju. Zagreb.
Državni zavod za statistiku (2021). Popis stanovništva. https://dzs.hr/popis
Čović, Č. (2018). Metodologija. Split: Redak.`;

/** Trenutni izbor prekidaca poretka; zadano abecedno (autor-godina) kad se ne moze ocitati. */
function currentSortMode(): BibSortMode {
  return $('#lit-sort')?.value === 'appearance' ? 'appearance' : 'alphabetical';
}

// Rezultat zadnjeg render()-a, ponovno koristen u copy/docx handlerima umjesto da svaki
// klik nanovo parsira, spaja, dedupeira i sortira isti unos (render() ga vec izgradio prije klika).
let lastResult: BibResult | null = null;

// SR najava metrika: vizualne brojke se osvjezavaju na svaki unos, ali izgovor ide u skriveni
// #lit-sr-summary (role=status) tek nakon pauze u tipkanju, da citac ekrana ne ponavlja sve
// cetiri brojke uz svaki utipkani znak (isti obrazac kao scheduleSrSummary u kartice-page.ts).
let _srTimer: any = 0;
function scheduleSrSummary(r: BibResult) {
  const live = $('#lit-sr-summary');
  if (!live) return;
  clearTimeout(_srTimer);
  _srTimer = setTimeout(() => {
    const text = r.inputCount
      ? `Prepoznato ${nf.format(r.inputCount)}, jedinstveno ${nf.format(r.entries.length)}, `
        + `duplikata uklonjeno ${nf.format(r.duplicatesRemoved)}, s upozorenjem ${nf.format(r.withIssues)}.`
      : '';
    // Prazna regija + prazan unos = ucitavanje stranice; bez najave dok korisnik nesto ne unese.
    if (!live.textContent && !text) return;
    if (live.textContent !== text) live.textContent = text;
  }, 900);
}

function render() {
  const input = $('#lit-input');
  const sort = currentSortMode();
  const r = organizeBibliography(input?.value || '', { sort });
  lastResult = r;

  // Changed-guard: textContent na istu vrijednost svejedno zamjenjuje text node, sto aria-live
  // regiji (#lit-order-note) izgleda kao nova poruka pa bi je citac ekrana ponavljao.
  const set = (id: any, v: any) => { const el = $(id); if (el && el.textContent !== v) el.textContent = v; };
  set('#lit-total', nf.format(r.inputCount));
  set('#lit-unique', nf.format(r.entries.length));
  set('#lit-dupes', nf.format(r.duplicatesRemoved));
  set('#lit-issues', nf.format(r.withIssues));
  set('#lit-premium-unique', nf.format(r.entries.length));
  set('#lit-premium-dupes', nf.format(r.duplicatesRemoved));
  set('#lit-premium-issues', nf.format(r.withIssues));
  set('#lit-order-note', sort === 'appearance'
    ? 'Poredak: izvorni redoslijed pojavljivanja (IEEE/Vancouver).'
    : 'Poredak: abecedno po hrvatskom poretku (autor-godina).');
  scheduleSrSummary(r);

  const list = $('#lit-list');
  if (list) {
    list.innerHTML = r.entries.length
      ? r.entries.map(e => {
          const chips = e.issues.map(i => `<span class="lit-chip">${escapeHtml(i)}</span>`).join('');
          return `<li class="lit-item${e.issues.length ? ' has-issue' : ''}"><span class="lit-text">${escapeHtml(e.text)}</span>${chips ? `<span class="lit-chips">${chips}</span>` : ''}</li>`;
        }).join('')
      : '<li class="lit-empty">Zalijepi popis izvora lijevo, po jedan u retku, pa se sređeni popis pojavljuje ovdje.</li>';
  }

  // Uklanjanje duplikata nije crna kutija: "Duplikata" metrika je brojka, ovaj collapsible
  // pokazuje TOCNO koji zapis je izbacen i na koji zadrzani zapis je mapiran, da lazno-pozitivan
  // spoj (dva razlicita izvora slucajno protumacena kao isti) bude vidljiv, ne tih gubitak.
  const dupesDetail = $('#lit-dupes-detail');
  const dupesList = $('#lit-dupes-list');
  if (dupesDetail && dupesList) {
    dupesDetail.hidden = r.removedDuplicates.length === 0;
    dupesList.innerHTML = r.removedDuplicates.map(d =>
      `<li><b>Izbačeno:</b> ${escapeHtml(d.text)}<br><b>Zadržano kao:</b> ${escapeHtml(d.mappedTo)}</li>`,
    ).join('');
    if (!r.removedDuplicates.length) dupesDetail.removeAttribute('open');
  }

  const copy = $('#lit-copy');
  if (copy) copy.disabled = r.entries.length === 0;
  $('#lit-success-cta')?.classList.toggle('is-visible', r.entries.length > 0);
  const docx = $('#lit-docx');
  if (docx) docx.disabled = r.entries.length === 0;
}

function init() {
  const input = $('#lit-input');
  if (!input) return;
  render();
  input.addEventListener('input', render);
  $('#lit-sort')?.addEventListener('change', render);

  $('#lit-sample')?.addEventListener('click', () => { input.value = SAMPLE; render(); input.focus(); });
  $('#lit-clear')?.addEventListener('click', () => { input.value = ''; render(); input.focus(); });

  bindCopyButton($('#lit-copy'), () => {
    const r = lastResult;
    return r && r.entries.length ? bibliographyText(r) : '';
  }, { statusEl: $('#lit-copy-status') });

  // Preuzmi gotov .docx (docx-writer): jedinice s visecim uvlacenjem, stil ostaje autorov.
  bindDownloadButton($('#lit-docx'), () => {
    const r = lastResult;
    return r && r.entries.length ? docxBlob(bibliographyDoc(r.entries.map(e => e.text))) : null;
  }, 'literatura.docx');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// DOM glue za besplatno sredjivanje literature (literatura.html). Logika je u
// bibliography.ts (tipizirano, testabilno); ovdje samo vezanje forme i ispis. Bez mreze.
import '../shared/ui-boot';
import { organizeBibliography, bibliographyText } from './bibliography';
import { bibliographyDoc, docxBlob } from '../docx/docx-writer';
import { escapeHtml } from '../utils/helpers';
import { bindCopyButton, downloadBlob } from './tool-ui';

const $ = (s: string): any => document.querySelector(s);
const nf = new Intl.NumberFormat('hr-HR');

const SAMPLE = `Zorić, Z. (2020). Lokalna samouprava u Hrvatskoj. Zagreb: Naklada.
Anić, A. (2019). Civilno društvo i demokracija. Zagreb: Školska knjiga.
anić, a. (2019). Civilno društvo i demokracija. Zagreb: Školska knjiga.
Marić, M. Uvod u politologiju. Zagreb.
Državni zavod za statistiku (2021). Popis stanovništva. https://dzs.hr/popis
Čović, Č. (2018). Metodologija. Split: Redak.`;

function render() {
  const input = $('#lit-input');
  const r = organizeBibliography(input?.value || '');

  const set = (id: any, v: any) => { const el = $(id); if (el) el.textContent = v; };
  set('#lit-total', nf.format(r.inputCount));
  set('#lit-unique', nf.format(r.entries.length));
  set('#lit-dupes', nf.format(r.duplicatesRemoved));
  set('#lit-issues', nf.format(r.withIssues));

  const list = $('#lit-list');
  if (list) {
    list.innerHTML = r.entries.length
      ? r.entries.map(e => {
          const chips = e.issues.map(i => `<span class="lit-chip">${escapeHtml(i)}</span>`).join('');
          return `<li class="lit-item${e.issues.length ? ' has-issue' : ''}"><span class="lit-text">${escapeHtml(e.text)}</span>${chips ? `<span class="lit-chips">${chips}</span>` : ''}</li>`;
        }).join('')
      : '<li class="lit-empty">Zalijepi popis izvora lijevo, po jedan u retku, pa se sređeni popis pojavljuje ovdje.</li>';
  }

  const copy = $('#lit-copy');
  if (copy) copy.disabled = r.entries.length === 0;
  const docx = $('#lit-docx');
  if (docx) docx.disabled = r.entries.length === 0;
  return r;
}

function init() {
  const input = $('#lit-input');
  if (!input) return;
  render();
  input.addEventListener('input', render);

  $('#lit-sample')?.addEventListener('click', () => { input.value = SAMPLE; render(); input.focus(); });
  $('#lit-clear')?.addEventListener('click', () => { input.value = ''; render(); input.focus(); });

  bindCopyButton($('#lit-copy'), () => {
    const r = organizeBibliography(input.value || '');
    return r.entries.length ? bibliographyText(r) : '';
  });

  // Preuzmi gotov .docx (docx-writer): jedinice s visecim uvlacenjem, stil ostaje autorov.
  $('#lit-docx')?.addEventListener('click', () => {
    const r = organizeBibliography(input.value || '');
    if (!r.entries.length) return;
    try {
      downloadBlob(docxBlob(bibliographyDoc(r.entries.map(e => e.text))), 'literatura.docx');
    } catch {
      // .docx nije uspio (rijetko): sredjeni popis je i dalje vidljiv za kopiranje.
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

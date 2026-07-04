// DOM glue za besplatni generator Izjave o izvornosti (izjava.html). Logika je u
// statement.ts (tipizirano, testabilno); ovdje samo vezanje forme, pregled i ispis. Bez mreze.
import '../shared/ui-boot';
import { buildStatement, statementText } from './statement';
import { statementDoc, docxBlob } from '../docx/docx-writer';

const $ = (s: string): any => document.querySelector(s);

const FIELDS = {
  heading: '#st-heading', author: '#st-author', workType: '#st-worktype',
  title: '#st-title', place: '#st-place', date: '#st-date',
};

const SAMPLE: any = {
  heading: 'Izjava o izvornosti',
  author: 'Ana Anić',
  workType: 'Diplomski rad',
  title: 'Uloga civilnog društva u lokalnoj samoupravi',
  place: 'Zagreb',
  date: '3. srpnja 2026.',
};

function escapeHtml(s: any) {
  return String(s).replace(/[&<>"']/g, (c: string) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c]);
}

function readInput() {
  const out: any = {};
  for (const [key, sel] of Object.entries(FIELDS)) out[key] = $(sel)?.value || '';
  return out;
}

function render() {
  const model = buildStatement(readInput());
  const sheet = $('#st-sheet');
  if (sheet) {
    const foot = (model.placeDate || model.signatureName)
      ? `<div class="st-foot"><div class="st-place">${escapeHtml(model.placeDate)}</div><div class="st-sign">${model.signatureName ? `<span class="st-name">${escapeHtml(model.signatureName)}</span>` : ''}<span class="st-sign-cap">(vlastoručni potpis)</span></div></div>`
      : '';
    sheet.innerHTML = `<div class="st-heading">${escapeHtml(model.heading)}</div><div class="st-body">${escapeHtml(model.body)}</div>${foot}`;
  }

  const hint = $('#st-hint');
  if (hint) {
    if (model.missing.length) {
      hint.className = 'out-hint warn';
      hint.textContent = `Preporučeno dodati: ${model.missing.join(', ')}.`;
    } else {
      hint.className = 'out-hint ok';
      hint.textContent = 'Sva preporučena polja su ispunjena.';
    }
  }
  return model;
}

function init() {
  if (!$('#st-sheet')) return;
  for (const sel of Object.values(FIELDS)) { const el = $(sel); if (el) el.addEventListener('input', render); }
  render();

  $('#st-sample')?.addEventListener('click', () => {
    for (const [key, sel] of Object.entries(FIELDS)) { const el = $(sel); if (el) el.value = SAMPLE[key] || ''; }
    render();
  });

  $('#st-clear')?.addEventListener('click', () => {
    for (const [key, sel] of Object.entries(FIELDS)) {
      const el = $(sel); if (!el) continue;
      if (el.tagName === 'SELECT') el.selectedIndex = 0; else el.value = '';
    }
    render();
    $('#st-author')?.focus();
  });

  $('#st-copy')?.addEventListener('click', async () => {
    const model = buildStatement(readInput());
    const btn = $('#st-copy');
    try {
      await navigator.clipboard.writeText(statementText(model));
      const prev = btn.textContent; btn.textContent = 'Kopirano ✓';
      setTimeout(() => { btn.textContent = prev; }, 1600);
    } catch (e) { /* clipboard nedostupan: pregled i ispis su i dalje tu */ }
  });

  $('#st-print')?.addEventListener('click', () => window.print());

  // Preuzmi gotov .docx (docx-writer): formulacija je uobicajena, obvezni obrazac faksa ima prednost.
  $('#st-docx')?.addEventListener('click', () => {
    const model = buildStatement(readInput());
    const a = document.createElement('a');
    a.href = URL.createObjectURL(docxBlob(statementDoc(model)));
    a.download = 'izjava-o-izvornosti.docx';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

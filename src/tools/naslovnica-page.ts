// @ts-nocheck
// DOM glue za besplatni generator naslovnice (naslovnica.html). Logika slaganja je u
// title-page.ts (tipizirano, testabilno); ovdje samo vezanje forme, pregled i ispis. Bez mreze.
import '../shared/ui-boot';
import { buildTitlePage, titlePageText } from './title-page';

const $ = (s) => document.querySelector(s);

const FIELDS = {
  university: '#tp-university', faculty: '#tp-faculty', study: '#tp-study',
  author: '#tp-author', title: '#tp-title', subtitle: '#tp-subtitle',
  workType: '#tp-worktype', mentor: '#tp-mentor', comentor: '#tp-comentor',
  place: '#tp-place', year: '#tp-year',
};

const SAMPLE = {
  university: 'Sveučilište u Zagrebu',
  faculty: 'Fakultet političkih znanosti',
  study: 'Diplomski studij Politologije',
  author: 'Ana Anić',
  title: 'Uloga civilnog društva u lokalnoj samoupravi',
  subtitle: '',
  workType: 'Diplomski rad',
  mentor: 'izv. prof. dr. sc. Ivan Ivić',
  comentor: '',
  place: 'Zagreb',
  year: '2026',
};

function readInput() {
  const out = {};
  for (const [key, sel] of Object.entries(FIELDS)) out[key] = $(sel)?.value || '';
  return out;
}

function render() {
  const input = readInput();
  const model = buildTitlePage(input);

  const sheet = $('#tp-sheet');
  if (sheet) {
    sheet.innerHTML = model.lines.length
      ? model.lines.map(l => `<div class="tp-line tp-${l.role}">${escapeHtml(l.text)}</div>`).join('')
      : '<div class="tp-empty">Ispuni polja lijevo pa se naslovnica slaže ovdje.</div>';
  }

  const hint = $('#tp-hint');
  if (hint) {
    if (model.missing.length) {
      hint.className = 'out-hint warn';
      hint.textContent = `Preporučeno dodati: ${model.missing.join(', ')}.`;
    } else {
      hint.className = 'out-hint ok';
      hint.textContent = 'Sva preporučena polja su ispunjena.';
    }
  }

  const hasContent = model.lines.length > 0;
  const copy = $('#tp-copy'), print = $('#tp-print');
  if (copy) copy.disabled = !hasContent;
  if (print) print.disabled = !hasContent;
  return model;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function init() {
  if (!$('#tp-sheet')) return;
  for (const sel of Object.values(FIELDS)) {
    const el = $(sel);
    if (el) el.addEventListener('input', render);
  }
  render();

  $('#tp-sample')?.addEventListener('click', () => {
    for (const [key, sel] of Object.entries(FIELDS)) { const el = $(sel); if (el) el.value = SAMPLE[key] || ''; }
    render();
  });

  $('#tp-clear')?.addEventListener('click', () => {
    for (const sel of Object.values(FIELDS)) { const el = $(sel); if (el) el.value = ''; }
    render();
    $('#tp-university')?.focus();
  });

  $('#tp-copy')?.addEventListener('click', async () => {
    const model = buildTitlePage(readInput());
    if (!model.lines.length) return;
    const btn = $('#tp-copy');
    try {
      await navigator.clipboard.writeText(titlePageText(model));
      const prev = btn.textContent; btn.textContent = 'Kopirano ✓';
      setTimeout(() => { btn.textContent = prev; }, 1600);
    } catch (e) { /* clipboard nedostupan: pregled i ispis su i dalje tu */ }
  });

  $('#tp-print')?.addEventListener('click', () => window.print());
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// DOM glue za besplatni generator naslovnice (naslovnica.html). Logika slaganja je u
// title-page.ts (tipizirano, testabilno); ovdje samo vezanje forme, pregled i ispis. Bez mreze.
import '../shared/ui-boot';
import { buildTitlePage, titlePageText } from './title-page';
import { titlePageDoc, docxBlob } from '../docx/docx-writer';

const $ = (s: string): any => document.querySelector(s);

const FIELDS = {
  university: '#tp-university', faculty: '#tp-faculty', study: '#tp-study',
  author: '#tp-author', title: '#tp-title', subtitle: '#tp-subtitle',
  workType: '#tp-worktype', mentor: '#tp-mentor', comentor: '#tp-comentor',
  place: '#tp-place', year: '#tp-year',
};

const SAMPLE: any = {
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
  const out: any = {};
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
  const copy = $('#tp-copy'), print = $('#tp-print'), docx = $('#tp-docx');
  if (copy) copy.disabled = !hasContent;
  if (print) print.disabled = !hasContent;
  if (docx) docx.disabled = !hasContent;
  return model;
}

// Preuzmi gotov .docx (docx-writer): raspored je genericki, konacni oblik po uputama studija.
function downloadDocx(blob: any, name: any) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function escapeHtml(s: any) {
  return String(s).replace(/[&<>"']/g, (c: string) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c]);
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
    // Select (#tp-worktype) nema value= na opcijama, pa el.value='' daje selectedIndex=-1
    // i prazan prikaz; zato select vracamo na prvu opciju, ostalo praznimo (kao izjava).
    for (const sel of Object.values(FIELDS)) {
      const el = $(sel); if (!el) continue;
      if (el.tagName === 'SELECT') el.selectedIndex = 0; else el.value = '';
    }
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

  $('#tp-docx')?.addEventListener('click', () => {
    const model = buildTitlePage(readInput());
    if (!model.lines.length) return;
    downloadDocx(docxBlob(titlePageDoc(model)), 'naslovnica.docx');
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// DOM glue za besplatni generator Izjave o izvornosti (izjava.html). Logika je u
// statement.ts (tipizirano, testabilno); ovdje samo vezanje forme, pregled i ispis. Bez mreze.
import '../shared/ui-boot';
import { buildStatement, statementText } from './statement';
import { statementDoc, docxBlob } from '../docx/docx-writer';
import { escapeHtml } from '../utils/helpers';
import { bindCopyButton, downloadBlob } from './tool-ui';
import { formatCroatianDate } from './hr-date';

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

function readInput() {
  const out: any = {};
  for (const [key, sel] of Object.entries(FIELDS)) out[key] = $(sel)?.value || '';
  return out;
}

// Izjava je "spremna" za izvoz kad je unesen bar neki osobni podatak; sam predlozak
// (bez imena/naslova/mjesta/datuma) ne izvozimo (C3, uskladeno s naslovnicom).
function hasContent(input: any): boolean {
  return !!(String(input.author || '').trim() || String(input.title || '').trim()
    || String(input.place || '').trim() || String(input.date || '').trim());
}

function render(): void {
  const input = readInput();
  const model = buildStatement(input);
  for (const id of ['#st-copy', '#st-docx', '#st-print']) {
    const b = $(id); if (b) b.disabled = !hasContent(input);
  }
  const sheet = $('#st-sheet');
  if (sheet) {
    const foot = (model.placeDate || model.signatureName)
      ? `<div class="st-foot"><div class="st-place">${escapeHtml(model.placeDate)}</div><div class="st-sign">${model.signatureName ? `<span class="st-name">${escapeHtml(model.signatureName)}</span>` : ''}<span class="st-sign-cap">(vlastoručni potpis)</span></div></div>`
      : '';
    sheet.innerHTML = `<div class="st-heading">${escapeHtml(model.heading)}</div><div class="st-body">${escapeHtml(model.body)}</div>${foot}`;
  }

  scheduleHint(model.missing);
}

// #st-hint je aria-live=polite: pisanje na svaki keystroke tjera citac ekrana da istu poruku
// ponavlja uz svaki utipkani znak. Debounce nakon pauze u tipkanju + changed-guard (textContent
// na istu vrijednost i dalje mijenja text node pa SR zna ponoviti najavu). Isti obrazac kao
// scheduleSrSummary u kartice-page.ts; vizualni pregled dokumenta ostaje trenutan.
let _hintTimer: any = 0;
function scheduleHint(missing: string[]) {
  const hint = $('#st-hint');
  if (!hint) return;
  clearTimeout(_hintTimer);
  _hintTimer = setTimeout(() => {
    const cls = missing.length ? 'out-hint warn' : 'out-hint ok';
    const text = missing.length ? `Preporučeno dodati: ${missing.join(', ')}.` : 'Sva preporučena polja su ispunjena.';
    if (hint.className !== cls) hint.className = cls;
    if (hint.textContent !== text) hint.textContent = text;
  }, 600);
}

function init() {
  if (!$('#st-sheet')) return;
  for (const sel of Object.values(FIELDS)) { const el = $(sel); if (el) el.addEventListener('input', render); }

  // Date picker puni tekstualni datum hrvatskim oblikom (3. srpnja 2026.); tekst ostaje uredljiv.
  $('#st-date-picker')?.addEventListener('change', () => {
    const formatted = formatCroatianDate($('#st-date-picker').value || '');
    if (formatted) { $('#st-date').value = formatted; render(); }
  });

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

  bindCopyButton($('#st-copy'), () => {
    const input = readInput();
    return hasContent(input) ? statementText(buildStatement(input)) : '';
  }, { statusEl: $('#st-copy-status') });

  $('#st-print')?.addEventListener('click', () => window.print());

  // Preuzmi gotov .docx (docx-writer): formulacija je uobicajena, obvezni obrazac faksa ima prednost.
  $('#st-docx')?.addEventListener('click', () => {
    const input = readInput();
    if (!hasContent(input)) return;
    try {
      downloadBlob(docxBlob(statementDoc(buildStatement(input))), 'izjava-o-izvornosti.docx');
    } catch {
      // .docx nije uspio (rijetko): pregled i ispis su i dalje tu.
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

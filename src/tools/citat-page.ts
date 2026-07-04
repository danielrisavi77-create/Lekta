// DOM glue za besplatni citat generator (citat.html). Sva logika formatiranja je u
// citation.ts (tipizirana, testabilna); ovdje samo vezanje na formu i ispis. Bez mreze.
import '../shared/ui-boot';
import { formatCitation } from './citation';
import { bindCopyButton } from './tool-ui';

const $ = (s: string): any => document.querySelector(s);

// Koja polja su relevantna za koji tip izvora (ostala se sakriju da forma ostane cista).
const FIELDS_BY_TYPE: any = {
  knjiga: ['authors', 'title', 'year', 'place', 'publisher'],
  poglavlje: ['authors', 'title', 'container', 'editor', 'pages', 'year', 'place', 'publisher'],
  clanak: ['authors', 'title', 'container', 'volume', 'issue', 'year', 'pages', 'doi'],
  mrezni: ['authors', 'title', 'publisher', 'url', 'doi', 'accessed'],
  zavrsni: ['authors', 'title', 'year', 'institution'],
  propis: ['title', 'container', 'issue'],
};

// Sva opcionalna tekstualna polja (za readForm/clear/sample petlje).
const TEXT_FIELDS = ['authors', 'title', 'container', 'editor', 'year', 'publisher', 'place', 'volume', 'issue', 'pages', 'url', 'doi', 'accessed', 'institution'];

function readForm() {
  const type = $('#f-type').value;
  const style = $('#f-style').value;
  const inp: any = { type };
  for (const key of TEXT_FIELDS) {
    const el = $('#f-' + key);
    if (el) inp[key] = el.value.trim();
  }
  return { inp, style };
}

function syncVisibleFields() {
  const type = $('#f-type').value;
  const allowed = new Set(FIELDS_BY_TYPE[type] || []);
  document.querySelectorAll('[data-field]').forEach((row: any) => {
    row.style.display = allowed.has(row.getAttribute('data-field')) ? '' : 'none';
  });
}

// Prikazi/sakrij in-text oblik (autor-godina); vrati ga za copy handler.
function renderInText(inText: string): void {
  const box = $('#out-intext'), val = $('#intextValue'), btn = $('#copyIntextBtn');
  if (val) val.textContent = inText || '';
  if (box) box.hidden = !inText;
  if (btn) btn.disabled = !inText;
}

function render() {
  const { inp, style } = readForm();
  const { citation, inText, missing } = formatCitation(inp, style);
  const out = $('#out');
  const hint = $('#out-hint');
  if (!citation) {
    out.textContent = 'Ispuni polja lijevo pa se citat pojavljuje ovdje.';
    out.classList.add('empty');
    hint.textContent = '';
    $('#copyBtn').disabled = true;
    renderInText('');
    return;
  }
  out.textContent = citation;
  out.classList.remove('empty');
  $('#copyBtn').disabled = false;
  renderInText(inText);
  hint.textContent = missing.length ? 'Preporučeno dodati: ' + missing.join(', ') + '.' : 'Sva preporučena polja su ispunjena.';
  hint.className = missing.length ? 'out-hint warn' : 'out-hint ok';
}

function init() {
  if (!$('#f-type')) return; // stranica nije citat-alat; ne rusi se (kao ostali tool page-ovi)
  // Promjena tipa samo prilagodi vidljiva polja; render okida opci change/input listener nize
  // (izbjegava dvostruki render na promjenu tipa).
  $('#f-type').addEventListener('change', syncVisibleFields);
  document.querySelectorAll('input, select, textarea').forEach((el: any) => {
    el.addEventListener('input', render);
    el.addEventListener('change', render);
  });
  // Kopira samo kad citat postoji (gumb je inace onemogucen); getText cita gotovi ispis.
  bindCopyButton($('#copyBtn'), () => ($('#copyBtn').disabled ? '' : ($('#out').textContent || '')));
  bindCopyButton($('#copyIntextBtn'), () => ($('#copyIntextBtn').disabled ? '' : ($('#intextValue').textContent || '')));

  $('#c-sample')?.addEventListener('click', () => {
    const set = (id: string, v: string) => { const el = $(id); if (el) el.value = v; };
    set('#f-type', 'knjiga'); set('#f-style', 'autor-godina');
    set('#f-authors', 'Ivić, Ivan; Horvat, Ana');
    set('#f-title', 'Ustavno pravo Republike Hrvatske');
    set('#f-year', '2020'); set('#f-place', 'Zagreb'); set('#f-publisher', 'Narodne novine');
    for (const key of ['container', 'editor', 'volume', 'issue', 'pages', 'url', 'doi', 'accessed', 'institution']) set('#f-' + key, '');
    syncVisibleFields();
    render();
    $('#f-authors')?.focus();
  });

  $('#c-clear')?.addEventListener('click', () => {
    $('#f-type').selectedIndex = 0;
    $('#f-style').selectedIndex = 0;
    for (const key of TEXT_FIELDS) {
      const el = $('#f-' + key); if (el) el.value = '';
    }
    syncVisibleFields();
    render();
    $('#f-authors')?.focus();
  });

  // Tema se sinkronizira preko lekta.theme (inline skripta u citat.html), ne ovdje.
  syncVisibleFields();
  render();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();

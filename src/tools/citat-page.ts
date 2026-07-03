// @ts-nocheck
// DOM glue za besplatni citat generator (citat.html). Sva logika formatiranja je u
// citation.ts (tipizirana, testabilna); ovdje samo vezanje na formu i ispis. Bez mreze.
import '../shared/ui-boot';
import { formatCitation } from './citation';

const $ = (s) => document.querySelector(s);

// Koja polja su relevantna za koji tip izvora (ostala se sakriju da forma ostane cista).
const FIELDS_BY_TYPE = {
  knjiga: ['authors', 'title', 'year', 'place', 'publisher'],
  poglavlje: ['authors', 'title', 'container', 'pages', 'year', 'place', 'publisher'],
  clanak: ['authors', 'title', 'container', 'volume', 'issue', 'year', 'pages'],
  mrezni: ['authors', 'title', 'publisher', 'url', 'accessed'],
  zavrsni: ['authors', 'title', 'year', 'institution'],
  propis: ['title', 'container', 'issue'],
};

function readForm() {
  const type = $('#f-type').value;
  const style = $('#f-style').value;
  const inp = { type };
  for (const key of ['authors', 'title', 'container', 'year', 'publisher', 'place', 'volume', 'issue', 'pages', 'url', 'accessed', 'institution']) {
    const el = $('#f-' + key);
    if (el) inp[key] = el.value.trim();
  }
  return { inp, style };
}

function syncVisibleFields() {
  const type = $('#f-type').value;
  const allowed = new Set(FIELDS_BY_TYPE[type] || []);
  document.querySelectorAll('[data-field]').forEach((row) => {
    row.style.display = allowed.has(row.getAttribute('data-field')) ? '' : 'none';
  });
}

function render() {
  const { inp, style } = readForm();
  const { citation, missing } = formatCitation(inp, style);
  const out = $('#out');
  const hint = $('#out-hint');
  if (!citation) {
    out.textContent = 'Ispuni polja lijevo pa se citat pojavljuje ovdje.';
    out.classList.add('empty');
    hint.textContent = '';
    $('#copyBtn').disabled = true;
    return;
  }
  out.textContent = citation;
  out.classList.remove('empty');
  $('#copyBtn').disabled = false;
  hint.textContent = missing.length ? 'Preporučeno dodati: ' + missing.join(', ') + '.' : 'Sva preporučena polja su ispunjena.';
  hint.className = missing.length ? 'out-hint warn' : 'out-hint ok';
}

function copyOut() {
  const text = $('#out').textContent || '';
  const done = () => {
    const b = $('#copyBtn');
    const old = b.textContent;
    b.textContent = 'Kopirano';
    setTimeout(() => (b.textContent = old), 1400);
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done).catch(() => {});
  }
}

function init() {
  if (!$('#f-type')) return; // stranica nije citat-alat; ne rusi se (kao ostali tool page-ovi)
  $('#f-type').addEventListener('change', () => {
    syncVisibleFields();
    render();
  });
  document.querySelectorAll('input, select, textarea').forEach((el) => {
    el.addEventListener('input', render);
    el.addEventListener('change', render);
  });
  $('#copyBtn').addEventListener('click', copyOut);
  // Tema se sinkronizira preko lekta.theme (inline skripta u citat.html), ne ovdje.
  syncVisibleFields();
  render();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();

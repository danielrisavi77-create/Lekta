// DOM glue za besplatni citat generator (citat.html). Sva logika formatiranja je u
// citation.ts (tipizirana, testabilna); ovdje samo vezanje na formu i ispis. Bez mreze.
import '../shared/ui-boot';
import { formatCitation } from './citation';
import { bindCopyButton } from './tool-ui';

const $ = (s: string): any => document.querySelector(s);

// Koja polja su relevantna za koji tip izvora (ostala se sakriju da forma ostane cista).
const FIELDS_BY_TYPE: any = {
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
  const inp: any = { type };
  for (const key of ['authors', 'title', 'container', 'year', 'publisher', 'place', 'volume', 'issue', 'pages', 'url', 'accessed', 'institution']) {
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
  // Tema se sinkronizira preko lekta.theme (inline skripta u citat.html), ne ovdje.
  syncVisibleFields();
  render();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();

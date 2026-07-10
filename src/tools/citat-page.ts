// DOM glue za besplatni citat generator (citat.html). Sva logika formatiranja je u
// citation.ts (opci stilovi) i citations/faculty-styles.ts (vjeran po fakultetu); ovdje samo
// vezanje na formu i ispis. Bez mreze.
import '../shared/ui-boot';
import { formatCitation } from './citation';
import { bindCopyButton } from './tool-ui';
import { buildFacultyOptions, formatForFaculty, type FacultyStyle } from '../citations/faculty-styles';

const $ = (s: string): any => document.querySelector(s);
function esc(s: string): string {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

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

// Genericki izbor stila (kad fakultet nije odabran). Cuva se da se moze vratiti iz faculty-modea.
const GENERIC_STYLE_HTML = `<option value="autor-godina">Autor-godina (društvene znanosti)</option>
<option value="fusnota">Fusnota / bibliografija (pravno, humanističko)</option>`;

// Kad je fakultet odabran, #f-style nosi njegove stilove (value = indeks); inace je null (genericki mod).
let facultyStyles: FacultyStyle[] | null = null;

function readInp(): any {
  const inp: any = { type: $('#f-type').value };
  for (const key of TEXT_FIELDS) {
    const el = $('#f-' + key);
    if (el) inp[key] = el.value.trim();
  }
  return inp;
}

function activeFacultyStyle(): FacultyStyle | null {
  if (!facultyStyles) return null;
  const idx = Math.max(0, $('#f-style').selectedIndex);
  return facultyStyles[idx] || facultyStyles[0] || null;
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

// Info linija ispod izbornika fakulteta: provenijencija odabranog stila (posteno, s izvorom).
function updateStyleInfo(): void {
  const info = $('#f-style-info');
  if (!info) return;
  const fs = activeFacultyStyle();
  if (!fs) { info.hidden = true; info.textContent = ''; return; }
  const src = fs.sourceLabel ? `„${esc(fs.sourceLabel)}”` : 'službenim uputama';
  const when = fs.verifiedAt ? `, provjereno ${esc(fs.verifiedAt)}` : '';
  info.innerHTML = fs.pin
    ? `Stil: <strong>${esc(fs.label)}</strong>. Propisan službenim uputama: ${src}${when}. Format: opći ${esc(fs.label)} oblik.`
    : `Vjeran format prema službenim uputama: ${src}${when}.`;
  info.hidden = false;
}

function render() {
  const inp = readInp();
  const fs = activeFacultyStyle();
  const { citation, inText, missing } = fs ? formatForFaculty(fs, inp) : formatCitation(inp, $('#f-style').value);
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

// Napuni izbornik fakulteta (grupiran po sveucilistu). Samo fakulteti s verificiranim specom.
function populateFaculties() {
  const facSel = $('#f-faculty');
  if (!facSel) return;
  const opts = buildFacultyOptions();
  const byInst = new Map<string, ReturnType<typeof buildFacultyOptions>>();
  for (const o of opts) {
    if (!byInst.has(o.instName)) byInst.set(o.instName, [] as any);
    (byInst.get(o.instName) as any).push(o);
  }
  const insts = [...byInst.keys()].sort((a, b) => a.localeCompare(b, 'hr'));
  let html = '';
  for (const inst of insts) {
    html += `<optgroup label="${esc(inst)}">` +
      (byInst.get(inst) as any).map((o: any) => `<option value="${esc(o.id)}">${esc(o.name)}</option>`).join('') +
      '</optgroup>';
  }
  facSel.insertAdjacentHTML('beforeend', html);
}

// Odabir fakulteta -> #f-style nosi njegove stilove; prazan -> vrati genericki izbor.
function onFacultyChange() {
  const facSel = $('#f-faculty');
  const styleSel = $('#f-style');
  const opt = buildFacultyOptions().find((o) => o.id === facSel.value) || null;
  if (!opt) {
    facultyStyles = null;
    styleSel.innerHTML = GENERIC_STYLE_HTML;
  } else {
    facultyStyles = opt.styles;
    styleSel.innerHTML = opt.styles
      .map((s, i) => `<option value="${i}">${esc(s.label)}</option>`)
      .join('');
  }
  updateStyleInfo();
  render();
}

function init() {
  if (!$('#f-type')) return; // stranica nije citat-alat; ne rusi se (kao ostali tool page-ovi)
  populateFaculties();
  // Promjena tipa samo prilagodi vidljiva polja; render okida opci change/input listener nize.
  $('#f-type').addEventListener('change', syncVisibleFields);
  $('#f-faculty')?.addEventListener('change', onFacultyChange);
  $('#f-style').addEventListener('change', updateStyleInfo);
  document.querySelectorAll('input, select, textarea').forEach((el: any) => {
    el.addEventListener('input', render);
    el.addEventListener('change', render);
  });
  // Kopira samo kad citat postoji (gumb je inace onemogucen); getText cita gotovi ispis.
  bindCopyButton($('#copyBtn'), () => ($('#copyBtn').disabled ? '' : ($('#out').textContent || '')));
  bindCopyButton($('#copyIntextBtn'), () => ($('#copyIntextBtn').disabled ? '' : ($('#intextValue').textContent || '')));

  $('#c-sample')?.addEventListener('click', () => {
    const set = (id: string, v: string) => { const el = $(id); if (el) el.value = v; };
    // primjer koristi genericki stil: vrati izbornik fakulteta na prazno
    $('#f-faculty') && ($('#f-faculty').value = '');
    facultyStyles = null;
    $('#f-style').innerHTML = GENERIC_STYLE_HTML;
    updateStyleInfo();
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
    $('#f-faculty') && ($('#f-faculty').value = '');
    facultyStyles = null;
    $('#f-style').innerHTML = GENERIC_STYLE_HTML;
    updateStyleInfo();
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

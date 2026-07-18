// DOM glue za besplatni citat generator (citat.html). Logika formatiranja je u citation.ts
// (opci stilovi), citations/faculty-styles.ts (vjeran po fakultetu) i citations/parse-reference.ts
// (prepoznavanje zalijepljene literature); ovdje samo vezanje na formu i ispis. Bez mreze.
import '../shared/ui-boot';
import { formatCitation, parseAuthors } from './citation';
import { bindCopyButton } from './tool-ui';
import { buildFacultyOptions, formatForFaculty, ensureFacultySpecsLoaded, type FacultyStyle } from '../citations/faculty-styles';
import { splitReferences, parseReference, type BulkStyle } from '../citations/parse-reference';
import { SOURCE_TYPES } from '../citations/citation-web';

const $ = (s: string): any => document.querySelector(s);
function esc(s: string): string {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Koja polja su relevantna za koji tip izvora (jedan izvor: ostala se sakriju da forma ostane cista).
// Izvedeno iz SOURCE_TYPES (citation-web.ts), koji sam cita kanonski SOURCE_TYPE_FIELDS
// (citation.ts) - isti popis kao bulk-kartica i "preporuceno dodati", bez odvojenog rucnog popisa.
const FIELDS_BY_TYPE: Record<string, string[]> = Object.fromEntries(
  SOURCE_TYPES.map((s) => [s.type, s.fields.map((f) => f.key)]),
);

// Sva opcionalna tekstualna polja (za readForm/clear/sample petlje).
const TEXT_FIELDS = ['authors', 'title', 'container', 'editor', 'year', 'publisher', 'place', 'volume', 'issue', 'pages', 'url', 'doi', 'accessed', 'institution'];

// Genericki izbor stila (kad fakultet nije odabran). Cuva se da se moze vratiti iz faculty-modea.
const GENERIC_STYLE_HTML = `<option value="autor-godina">Autor-godina (društvene znanosti)</option>
<option value="fusnota">Fusnota / bibliografija (pravno, humanističko)</option>`;

// Kad je fakultet odabran, #f-style nosi njegove stilove (value = indeks); inace je null (genericki mod).
let facultyStyles: FacultyStyle[] | null = null;

function activeFacultyStyle(): FacultyStyle | null {
  if (!facultyStyles) return null;
  const idx = Math.max(0, $('#f-style').selectedIndex);
  return facultyStyles[idx] || facultyStyles[0] || null;
}

// Jedan izvor iz kojeg formatiraju i pojedinacni citat i bulk: fakultetski spec ili opci stil.
function formatWithCurrent(inp: any) {
  const fs = activeFacultyStyle();
  return fs ? formatForFaculty(fs, inp) : formatCitation(inp, $('#f-style').value);
}

function readInp(): any {
  const inp: any = { type: $('#f-type').value };
  for (const key of TEXT_FIELDS) {
    const el = $('#f-' + key);
    if (el) inp[key] = el.value.trim();
  }
  return inp;
}

function syncVisibleFields() {
  const type = $('#f-type').value;
  const allowed = new Set(FIELDS_BY_TYPE[type] || []);
  document.querySelectorAll('#panel-single [data-field]').forEach((row: any) => {
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
// Ziva iznad #tool-tabs (dijeli je "Jedan izvor" i "Cijela literatura"), pa mora prikazivati
// stil i u generickom modu (bez fakulteta): to je isti stil koji formatWithCurrent koristi
// za bulk izlaz, a #f-style zivi u panel-single, skrivenom dok je aktivan bulk tab.
function updateStyleInfo(): void {
  const info = $('#f-style-info');
  if (!info) return;
  const fs = activeFacultyStyle();
  if (!fs) {
    const label = $('#f-style')?.selectedOptions?.[0]?.textContent?.trim() || '';
    info.innerHTML = label ? `Stil: <strong>${esc(label)}</strong>. Vrijedi i za citat i za popis literature ("Cijela literatura").` : '';
    info.hidden = !label;
    return;
  }
  const src = fs.sourceLabel ? `„${esc(fs.sourceLabel)}”` : 'službenim uputama';
  const when = fs.verifiedAt ? `, provjereno ${esc(fs.verifiedAt)}` : '';
  info.innerHTML = fs.pin
    ? `Stil: <strong>${esc(fs.label)}</strong>. Propisan službenim uputama: ${src}${when}. Format: opći oblik stila ${esc(fs.label)}.`
    : `Vjeran format prema službenim uputama: ${src}${when}.`;
  info.hidden = false;
}

// Ziva linija ispod polja Autor(i): kako je slobodni unos stvarno rasclanjen (prezime/ime po
// autoru), da se krivo razdvajanje vidi ODMAH, a ne tek u finalnom citatu. parseAuthors ima
// dokumentirana ogranicenja (npr. engleski grupni autori bez zareza), pa je uvid vrijedan.
function renderAuthorsPreview(raw: string): void {
  const line = $('#f-authors-preview');
  if (!line) return;
  const authors = parseAuthors(raw);
  if (!raw.trim() || !authors.length) { line.hidden = true; line.textContent = ''; return; }
  const shown = authors.map((a) => (a.first ? `${a.last}, ${a.first}` : a.last)).join(' · ');
  line.textContent = `Prepoznato (${authors.length}): ${shown}`;
  line.hidden = false;
}

function render() {
  renderAuthorsPreview($('#f-authors')?.value || '');
  const { citation, inText, missing } = formatWithCurrent(readInp());
  const out = $('#out');
  const hint = $('#out-hint');
  const addBtn = $('#c-add-to-bulk');
  if (!citation) {
    out.textContent = 'Ispuni polja lijevo pa se citat pojavljuje ovdje.';
    out.classList.add('empty');
    hint.textContent = '';
    $('#copyBtn').disabled = true;
    if (addBtn) addBtn.disabled = true;
    renderInText('');
    return;
  }
  out.textContent = citation;
  out.classList.remove('empty');
  $('#copyBtn').disabled = false;
  if (addBtn) addBtn.disabled = false;
  renderInText(inText);
  hint.textContent = missing.length ? 'Preporučeno dodati: ' + missing.join(', ') + '.' : 'Sva preporučena polja su ispunjena.';
  hint.className = missing.length ? 'out-hint warn' : 'out-hint ok';
}

// --- Izbornik fakulteta -----------------------------------------------------

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

// Odabrani fakultet ide na glavni analizator kroz ?unit= (isti catalog unit ID prostor kao
// ZAGREB_CATALOG); index.html#analyzer to cita preko applyUnitFromUrl (src/ui/app.ts) i
// unaprijed postavi isti fakultet, umjesto da korisnik ponovno trazi ustanovu od nule.
function syncCtaAnalyzerLink() {
  const cta = $('#cta-analyzer');
  if (!cta) return;
  const unitId = ($('#f-faculty')?.value || '').trim();
  cta.setAttribute('href', unitId ? `index.html?unit=${encodeURIComponent(unitId)}#analyzer` : 'index.html#analyzer');
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
    styleSel.innerHTML = opt.styles.map((s, i) => `<option value="${i}">${esc(s.label)}</option>`).join('');
  }
  syncCtaAnalyzerLink();
  updateStyleInfo();
  render();
}

// --- Cijela literatura (bulk): zalijepi -> prepoznaj -> UREDI po unosu -> formatiraj + sortiraj ---

function typeDef(t: string) {
  return SOURCE_TYPES.find((s) => s.type === t) || SOURCE_TYPES[0];
}

// Editabilna kartica po referenci: <select vrste> + polja te vrste (accessed se sakrije ako stil ne trazi datum).
function renderBulkCard(card: any, values: any) {
  values = values || {};
  const type = values.type || card.getAttribute('data-type') || SOURCE_TYPES[0].type;
  card.setAttribute('data-type', type);
  const accessOk = (activeFacultyStyle()?.spec?.accessDate) !== false;
  const opts = SOURCE_TYPES.map((s) => `<option value="${s.type}"${s.type === type ? ' selected' : ''}>${esc(s.label)}</option>`).join('');
  const fieldsHtml = typeDef(type).fields
    .filter((f) => !(f.key === 'accessed' && !accessOk))
    .map((f) => {
      const v = values[f.key] != null ? values[f.key] : '';
      return `<label>${esc(f.label)}<input type="text" data-key="${esc(f.key)}" value="${esc(v)}"></label>`;
    }).join('');
  card.innerHTML = `<label>Vrsta izvora<select class="card-type">${opts}</select></label>${fieldsHtml}`;
  card.querySelector('.card-type').addEventListener('change', () => renderBulkCard(card, readBulkCard(card)));
}

function readBulkCard(card: any): any {
  const sel = card.querySelector('.card-type');
  if (!sel) return { type: SOURCE_TYPES[0].type };
  const out: any = { type: sel.value };
  card.setAttribute('data-type', out.type);
  card.querySelectorAll('input[data-key]').forEach((i: any) => { out[i.getAttribute('data-key')] = i.value; });
  return out;
}

function sortKeyOf(inp: any): string {
  const a = parseAuthors(inp.authors || '');
  return ((a.length ? a[0].last : (inp.title || '')) || '').toLowerCase();
}

function bulkStyle(): BulkStyle {
  return (($('#bulk-style')?.value as BulkStyle) || 'auto');
}

// Sazeta najava rezultata prepoznavanja/generiranja u sr-only aria-live status: sami
// spremnici (#bulk-entries/#bulk-output) NISU live regije (najava cijelog bloka bi brbljala),
// citac ekrana dobiva samo kratki sazetak sto se dogodilo.
function announceBulk(msg: string) {
  const live = $('#bulk-status');
  if (live) live.textContent = msg;
}

function parseBulk() {
  const refs = splitReferences($('#bulk-input').value);
  const box = $('#bulk-entries');
  box.innerHTML = '';
  $('#bulk-copy').hidden = true;
  $('#bulk-output').innerHTML = '';
  if (!refs.length) { $('#bulk-generate').hidden = true; announceBulk('Nije prepoznata nijedna referenca.'); return; }
  const style = bulkStyle();
  refs.forEach((raw: string, i: number) => {
    const p = parseReference(raw, style);
    const card = document.createElement('div');
    card.className = 'bulk-card' + (p.lowConfidence ? ' low-conf' : '');
    const head = document.createElement('div');
    head.className = 'bulk-card-head';
    head.textContent = 'Referenca ' + (i + 1) + (p.lowConfidence ? ' (malo prepoznato, dopuni ručno)' : '');
    const fields = document.createElement('div');
    fields.className = 'bulk-card-fields';
    card.appendChild(head);
    card.appendChild(fields);
    box.appendChild(card);
    const values: any = { type: p.type };
    Object.keys(p.fields).forEach((k) => { values[k] = (p.fields as any)[k]; });
    renderBulkCard(fields, values);
  });
  $('#bulk-generate').hidden = false;
  announceBulk(`Prepoznato referenci: ${refs.length}. Provjeri i dopuni polja po unosu, pa generiraj literaturu.`);
}

function generateBulk() {
  const items: { key: string; text: string }[] = [];
  $('#bulk-entries').querySelectorAll('.bulk-card-fields').forEach((card: any) => {
    const inp = readBulkCard(card);
    const res = formatWithCurrent(inp);
    if (res.citation) items.push({ key: sortKeyOf(inp), text: res.citation });
  });
  // Redoslijed literature: abecedno, osim ako verificirani fakultetski spec propisuje pojavljivanje.
  const fs = activeFacultyStyle();
  const byAppearance = !!(fs && fs.spec && fs.spec.bibliography && fs.spec.bibliography.sort === 'appearance');
  if (!byAppearance) items.sort((a, b) => a.key.localeCompare(b.key, 'hr'));
  const listText = items.map((x) => x.text).join('\n');
  const label = byAppearance ? 'redoslijedom pojavljivanja' : 'abecedno';
  $('#bulk-output').innerHTML =
    `<label for="bulk-result">Literatura (${label}, ${items.length})</label>` +
    `<textarea id="bulk-result" rows="${Math.min(20, Math.max(4, items.length + 1))}"></textarea>`;
  $('#bulk-result').value = listText;
  $('#bulk-copy').hidden = items.length === 0;
  announceBulk(items.length
    ? `Literatura generirana: ${items.length} jedinica, ${label}.`
    : 'Nema jedinica za literaturu, dopuni polja po unosu.');
}

function showTab(which: 'single' | 'bulk') {
  $('#panel-single').hidden = which !== 'single';
  $('#panel-bulk').hidden = which !== 'bulk';
  // ARIA tab semantika: roditelj je role=tablist, pa AT ocekuje aria-selected + roving
  // tabindex na role=tab djeci (bez toga citac ekrana ne zna koji je tab aktivan).
  for (const [id, active] of [['#tab-single', which === 'single'], ['#tab-bulk', which === 'bulk']] as const) {
    const tab = $(id);
    if (!tab) continue;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
  }
}

// Tipkovnicka navigacija tablista (ARIA APG): strelice + Home/End sele fokus i aktiviraju tab.
function bindTablistKeys() {
  $('#tool-tabs')?.addEventListener('keydown', (e: KeyboardEvent) => {
    const order: Array<'single' | 'bulk'> = ['single', 'bulk'];
    const current = document.activeElement?.id === 'tab-bulk' ? 1 : 0;
    let next = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (current + 1) % order.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (current + order.length - 1) % order.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = order.length - 1;
    if (next < 0) return;
    e.preventDefault();
    showTab(order[next]);
    $(`#tab-${order[next]}`)?.focus();
  });
}

// --- Most "Jedan izvor" -> "Cijela literatura": trenutni strukturirani unos ide kao NOVA
// kartica u bulk tok (isti renderBulkCard/generateBulk mehanizam), bez ponovnog tipkanja.
// Poznato ogranicenje (namjerno): "Prepoznaj reference" u bulk kartici gradi kartice ISKLJUCIVO
// iz zalijepljenog teksta pa brise i dodane (to je njegov ugovor); title na gumbu to kaze.
let _addFlashTimer = 0;
let _tabBulkBase = '';
function addSingleToBulk() {
  const inp = readInp();
  const box = $('#bulk-entries');
  if (!box) return;
  const idx = box.querySelectorAll('.bulk-card').length + 1;
  const card = document.createElement('div');
  card.className = 'bulk-card';
  const head = document.createElement('div');
  head.className = 'bulk-card-head';
  head.textContent = `Referenca ${idx} (iz kartice Jedan izvor)`;
  const fields = document.createElement('div');
  fields.className = 'bulk-card-fields';
  card.appendChild(head);
  card.appendChild(fields);
  box.appendChild(card);
  renderBulkCard(fields, inp);
  $('#bulk-generate').hidden = false;
  const tab = $('#tab-bulk');
  if (tab) tab.textContent = `${_tabBulkBase} (${box.querySelectorAll('.bulk-card').length})`;
  const btn = $('#c-add-to-bulk');
  if (btn) {
    if (_addFlashTimer) clearTimeout(_addFlashTimer);
    btn.textContent = 'Dodano u popis ✓';
    _addFlashTimer = window.setTimeout(() => { btn.textContent = '+ Dodaj u popis literature'; _addFlashTimer = 0; }, 1400);
  }
}

function init() {
  if (!$('#f-type')) return; // stranica nije citat-alat; ne rusi se (kao ostali tool page-ovi)
  populateFaculties();
  // Promjena tipa samo prilagodi vidljiva polja; render okida opci change/input listener nize.
  $('#f-type').addEventListener('change', syncVisibleFields);
  $('#f-faculty')?.addEventListener('change', onFacultyChange);
  $('#f-style').addEventListener('change', updateStyleInfo);
  // Genericki listener veze SAMO staticka polja (bulk kartice nastaju kasnije i ne diraju #out).
  document.querySelectorAll('#panel-single input, #f-style, #f-faculty, #f-type, #bulk-input').forEach((el: any) => {
    el.addEventListener('input', render);
    el.addEventListener('change', render);
  });
  $('#tab-single')?.addEventListener('click', () => showTab('single'));
  $('#tab-bulk')?.addEventListener('click', () => showTab('bulk'));
  bindTablistKeys();
  _tabBulkBase = $('#tab-bulk')?.textContent?.trim() || 'Cijela literatura';
  $('#c-add-to-bulk')?.addEventListener('click', addSingleToBulk);
  $('#bulk-parse')?.addEventListener('click', parseBulk);
  $('#bulk-generate')?.addEventListener('click', generateBulk);
  // Promjena stila ponovno prepozna vec zalijepljeni popis (bez ovoga picker ne bi imao ucinak).
  $('#bulk-style')?.addEventListener('change', () => { if ($('#bulk-input').value.trim()) parseBulk(); });

  // Kopira samo kad citat/literatura postoji (gumbi su inace onemoguceni/skriveni).
  // Zajednicki sr-only #copy-status (aria-live): ishod kopiranja se najavljuje i citacu
  // ekrana, ne samo vizualnom promjenom teksta gumba (WCAG 4.1.3).
  const copyStatus = { statusEl: $('#copy-status') };
  bindCopyButton($('#copyBtn'), () => ($('#copyBtn').disabled ? '' : ($('#out').textContent || '')), copyStatus);
  bindCopyButton($('#copyIntextBtn'), () => ($('#copyIntextBtn').disabled ? '' : ($('#intextValue').textContent || '')), copyStatus);
  bindCopyButton($('#bulk-copy'), () => ($('#bulk-copy').hidden ? '' : ($('#bulk-result')?.value || '')), copyStatus);

  $('#c-sample')?.addEventListener('click', () => {
    const set = (id: string, v: string) => { const el = $(id); if (el) el.value = v; };
    // primjer koristi genericki stil: vrati izbornik fakulteta na prazno
    if ($('#f-faculty')) $('#f-faculty').value = '';
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
    if ($('#f-faculty')) $('#f-faculty').value = '';
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
  updateStyleInfo();
  render();
  // Puni specovi (custom-spec formatFromSpec) su lijeno ucitani (faculty-styles.ts, perf);
  // pokreni dohvat ODMAH (fire-and-forget, ne blokira init) i korigiraj prikaz cim stignu -
  // dotad je vec render()irano s obiteljskim motorom kao privremenom aproksimacijom.
  void ensureFacultySpecsLoaded().then(() => render());
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
